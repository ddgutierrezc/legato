import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  ensureFixtureOutsideRepo,
  inspectIsolationLeaks,
  runExternalConsumerValidation,
} from './run-external-consumer-validation.mjs';

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

test('fixture isolation guard fails when fixture root is inside repo root', () => {
  assert.throws(
    () => ensureFixtureOutsideRepo({
      repoRoot: '/repo/legato',
      fixtureRoot: '/repo/legato/tmp/external-fixture',
    }),
    /outside repo root/i,
  );
});

test('isolation scanner reports workspace and non-tarball file leaks', () => {
  const result = inspectIsolationLeaks({
    packageLockRaw: JSON.stringify({
      dependencies: {
        '@legato/capacitor': { version: 'workspace:*' },
        localDep: { version: 'file:../local-package' },
      },
    }),
    installManifestRaw: '{"resolved":"file:../../outside-repo"}',
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /workspace:/i);
  assert.match(result.failures.join('\n'), /directory file:/i);
});

test('orchestrator preserves sync resolver output in evidence on failure', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-'));
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const providedTarballs = {
    capacitor: '/tmp/legato-capacitor-current.tgz',
    contract: '/tmp/legato-contract-current.tgz',
  };
  const commandCalls = [];
  const commandRunner = async ({ command, args }) => {
    commandCalls.push([command, ...args].join(' '));
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@legato/capacitor': { resolved: `file:${basename(providedTarballs.capacitor)}` },
          'node_modules/@legato/contract': { resolved: `file:${basename(providedTarballs.contract)}` },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@legato/capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@legato/contract'), { recursive: true });
    }
    if (command === 'npx' && args[0] === 'cap' && args[1] === 'sync') {
      const error = new Error('sync failed');
      error.stdout = 'xcodebuild: error: Could not resolve package dependencies';
      error.stderr = 'Missing package product CapApp-SPM';
      throw error;
    }
    return { stdout: 'ok', stderr: '' };
  };

  try {
    const result = await runExternalConsumerValidation({
      repoRoot,
      fixtureRoot,
      artifactsDir,
      keepFixture: true,
      commandRunner,
      skipPack: true,
      tarballs: providedTarballs,
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.areas.typecheckAndSync, 'FAIL');
    assert.match(result.failures.join('\n'), /Could not resolve package dependencies/i);
    const npmInstallCommands = commandCalls.filter((call) => call.startsWith('npm install'));
    assert.equal(npmInstallCommands.length, 1);
    assert.match(npmInstallCommands[0], new RegExp(escapeRegExp(basename(providedTarballs.contract)), 'i'));
    assert.match(npmInstallCommands[0], new RegExp(escapeRegExp(basename(providedTarballs.capacitor)), 'i'));
    assert.match(commandCalls.join('\n'), /npx cap sync ios android/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('orchestrator provisions ios/android platforms before cap sync in disposable fixture', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-platforms-'));
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const providedTarballs = {
    capacitor: '/tmp/legato-capacitor-current.tgz',
    contract: '/tmp/legato-contract-current.tgz',
  };
  const commandCalls = [];
  const commandRunner = async ({ command, args }) => {
    commandCalls.push([command, ...args].join(' '));
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@legato/capacitor': { resolved: `file:${basename(providedTarballs.capacitor)}` },
          'node_modules/@legato/contract': { resolved: `file:${basename(providedTarballs.contract)}` },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@legato/capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@legato/contract'), { recursive: true });
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'npx' && args[0] === 'cap' && args[1] === 'add' && (args[2] === 'ios' || args[2] === 'android')) {
      await mkdir(join(fixtureRoot, args[2]), { recursive: true });
      return { stdout: `added ${args[2]}`, stderr: '' };
    }
    if (command === 'npx' && args[0] === 'cap' && args[1] === 'sync') {
      const error = new Error('sync failed');
      error.stdout = 'xcodebuild: error: Could not resolve package dependencies';
      error.stderr = 'Missing package product CapApp-SPM';
      throw error;
    }
    return { stdout: 'ok', stderr: '' };
  };

  try {
    await runExternalConsumerValidation({
      repoRoot,
      fixtureRoot,
      artifactsDir,
      keepFixture: true,
      commandRunner,
      skipPack: true,
      tarballs: providedTarballs,
    });

    const joinedCalls = commandCalls.join('\n');
    assert.match(joinedCalls, /npx cap add ios/i);
    assert.match(joinedCalls, /npx cap add android/i);
    const syncIndex = commandCalls.findIndex((call) => /npx cap sync ios android/i.test(call));
    const addIosIndex = commandCalls.findIndex((call) => /npx cap add ios/i.test(call));
    const addAndroidIndex = commandCalls.findIndex((call) => /npx cap add android/i.test(call));
    assert.equal(addIosIndex > -1, true);
    assert.equal(addAndroidIndex > -1, true);
    assert.equal(syncIndex > addIosIndex, true);
    assert.equal(syncIndex > addAndroidIndex, true);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
