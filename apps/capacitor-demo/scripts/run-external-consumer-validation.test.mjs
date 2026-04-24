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
      await writeFile(join(fixtureRoot, 'node_modules/@legato/capacitor/package.json'), JSON.stringify({
        name: '@legato/capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@legato/contract/package.json'), JSON.stringify({
        name: '@legato/contract',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
    }
    if (command === 'tar' && args[0] === '-tzf') {
      if (args[1] === providedTarballs.capacitor) {
        return {
          stdout: [
            'package/package.json',
            'package/dist/index.js',
            'package/dist/index.d.ts',
            'package/dist/cli/index.mjs',
          ].join('\n'),
          stderr: '',
        };
      }
      return {
        stdout: [
          'package/package.json',
          'package/dist/index.js',
          'package/dist/index.d.ts',
        ].join('\n'),
        stderr: '',
      };
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
      await writeFile(join(fixtureRoot, 'node_modules/@legato/capacitor/package.json'), JSON.stringify({
        name: '@legato/capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@legato/contract/package.json'), JSON.stringify({
        name: '@legato/contract',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'tar' && args[0] === '-tzf') {
      if (args[1] === providedTarballs.capacitor) {
        return {
          stdout: [
            'package/package.json',
            'package/dist/index.js',
            'package/dist/index.d.ts',
            'package/dist/cli/index.mjs',
          ].join('\n'),
          stderr: '',
        };
      }
      return {
        stdout: [
          'package/package.json',
          'package/dist/index.js',
          'package/dist/index.d.ts',
        ].join('\n'),
        stderr: '',
      };
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

test('orchestrator fails when tarball is missing declared entrypoint', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-entrypoints-'));
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const providedTarballs = {
    capacitor: '/tmp/legato-capacitor-current.tgz',
    contract: '/tmp/legato-contract-current.tgz',
  };

  const commandRunner = async ({ command, args }) => {
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@legato/capacitor': { resolved: `file:${basename(providedTarballs.capacitor)}` },
          'node_modules/@legato/contract': { resolved: `file:${basename(providedTarballs.contract)}` },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@legato/capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@legato/contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@legato/capacitor/package.json'), JSON.stringify({
        name: '@legato/capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@legato/contract/package.json'), JSON.stringify({
        name: '@legato/contract',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'tar' && args[0] === '-tzf') {
      if (args[1] === providedTarballs.capacitor) {
        return {
          stdout: [
            'package/package.json',
            'package/dist/index.js',
            'package/dist/index.d.ts',
          ].join('\n'),
          stderr: '',
        };
      }
      return {
        stdout: [
          'package/package.json',
          'package/dist/index.js',
          'package/dist/index.d.ts',
        ].join('\n'),
        stderr: '',
      };
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
    assert.equal(result.areas.packedEntrypoints, 'FAIL');
    assert.match(result.failures.join('\n'), /Packed contract breach/i);
    assert.match(result.failures.join('\n'), /@legato\/capacitor: missing package\/dist\/cli\/index\.mjs/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('orchestrator reuses validator with fixture-installed native-artifacts contract path', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-validator-contract-'));
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
      await writeFile(join(fixtureRoot, 'node_modules/@legato/capacitor/package.json'), JSON.stringify({
        name: '@legato/capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@legato/contract/package.json'), JSON.stringify({
        name: '@legato/contract',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@legato/capacitor/native-artifacts.json'), '{"ios":{"packageUrl":"https://github.com/ddgutierrezc/legato-ios-core.git","packageName":"LegatoCore","product":"LegatoCore","version":"0.1.1"}}', 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'tar' && args[0] === '-tzf') {
      if (args[1] === providedTarballs.capacitor) {
        return {
          stdout: [
            'package/package.json',
            'package/dist/index.js',
            'package/dist/index.d.ts',
            'package/dist/cli/index.mjs',
          ].join('\n'),
          stderr: '',
        };
      }
      return {
        stdout: [
          'package/package.json',
          'package/dist/index.js',
          'package/dist/index.d.ts',
        ].join('\n'),
        stderr: '',
      };
    }
    if (command === 'npx' && args[0] === 'cap' && args[1] === 'add' && (args[2] === 'ios' || args[2] === 'android')) {
      await mkdir(join(fixtureRoot, args[2]), { recursive: true });
      return { stdout: `added ${args[2]}`, stderr: '' };
    }
    if (command === 'npx' && args[0] === 'cap' && args[1] === 'sync') {
      return { stdout: 'sync ok', stderr: '' };
    }
    if (command === 'node' && args.some((arg) => /validate-native-artifacts\.mjs$/i.test(arg))) {
      return { stdout: 'Overall: PASS\n', stderr: '' };
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

    assert.equal(result.status, 'PASS');
    const validatorCall = commandCalls.find((call) => /validate-native-artifacts\.mjs/i.test(call));
    assert.equal(typeof validatorCall, 'string');
    assert.match(validatorCall, /--native-artifacts-contract/i);
    assert.match(validatorCall, /node_modules\/@legato\/capacitor\/native-artifacts\.json/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
