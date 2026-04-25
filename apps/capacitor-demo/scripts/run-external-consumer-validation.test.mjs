import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import {
  ensureFixtureOutsideRepo,
  inspectIsolationLeaks,
  evaluateRegistryPeerAlignment,
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

test('isolation scanner reports workspace and file-based dependency leaks', () => {
  const result = inspectIsolationLeaks({
    packageLockRaw: JSON.stringify({
      dependencies: {
        '@ddgutierrezc/legato-capacitor': { version: 'workspace:*' },
        localDep: { version: 'file:../local-package' },
      },
    }),
    installManifestRaw: '{"resolved":"file:../../outside-repo"}',
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /workspace:/i);
  assert.match(result.failures.join('\n'), /file: protocol/i);
});

test('isolation scanner rejects tarball shortcuts as non-compliant proof', () => {
  const result = inspectIsolationLeaks({
    packageLockRaw: JSON.stringify({
      packages: {
        'node_modules/@ddgutierrezc/legato-capacitor': {
          resolved: 'file:legato-capacitor-0.1.2.tgz',
        },
      },
    }),
    installManifestRaw: '{"resolved":"file:legato-contract-0.1.1.tgz"}',
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /tarball/i);
});

test('isolation scanner allows tarball references in npm-readiness mode', () => {
  const result = inspectIsolationLeaks({
    mode: 'npm-readiness',
    packageLockRaw: JSON.stringify({
      packages: {
        'node_modules/@ddgutierrezc/legato-capacitor': {
          resolved: 'file:legato-capacitor-0.1.2.tgz',
        },
      },
    }),
    installManifestRaw: '{"resolved":"file:legato-contract-0.1.1.tgz"}',
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});

test('registry preflight fails when published peer range is unsatisfied', () => {
  const result = evaluateRegistryPeerAlignment({
    packageName: '@ddgutierrezc/legato-capacitor',
    packageVersion: '0.1.2',
    peerDependencies: {
      '@ddgutierrezc/legato-contract': '^0.1.2',
    },
    availableVersionsByPackage: {
      '@ddgutierrezc/legato-contract': ['0.1.1'],
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /not contain a compatible @ddgutierrezc\/legato-contract/i);
});

test('registry preflight passes when peer range is satisfiable from npm', () => {
  const result = evaluateRegistryPeerAlignment({
    packageName: '@ddgutierrezc/legato-capacitor',
    packageVersion: '0.1.2',
    peerDependencies: {
      '@ddgutierrezc/legato-contract': '^0.1.1',
    },
    availableVersionsByPackage: {
      '@ddgutierrezc/legato-contract': ['0.1.1'],
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});

test('orchestrator blocks install when registry preflight detects unsatisfied peer range', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-preflight-'));
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const commandCalls = [];
  const commandRunner = async ({ command, args }) => {
    commandCalls.push([command, ...args].join(' '));
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-capacitor@0.1.2') {
      return {
        stdout: JSON.stringify({
          version: '0.1.2',
          peerDependencies: {
            '@ddgutierrezc/legato-contract': '^0.1.2',
          },
        }),
        stderr: '',
      };
    }
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-contract@0.1.1') {
      return { stdout: JSON.stringify('0.1.1'), stderr: '' };
    }
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-contract') {
      return { stdout: JSON.stringify(['0.1.1']), stderr: '' };
    }
    if (command === 'npm' && args[0] === 'install') {
      throw new Error('install should not run when preflight fails');
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
      registrySpecs: {
        capacitor: '@ddgutierrezc/legato-capacitor@0.1.2',
        contract: '@ddgutierrezc/legato-contract@0.1.1',
      },
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.areas.registryPreflight, 'FAIL');
    assert.match(result.failures.join('\n'), /Registry compatibility blocker/i);
    assert.equal(commandCalls.some((call) => /^npm install\b/i.test(call)), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: `file:${basename(providedTarballs.capacitor)}` },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: `file:${basename(providedTarballs.contract)}` },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
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
      proofMode: 'npm-readiness',
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.areas.isolation, 'PASS');
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
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: `file:${basename(providedTarballs.capacitor)}` },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: `file:${basename(providedTarballs.contract)}` },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
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
      proofMode: 'npm-readiness',
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

test('orchestrator rejects tarball installs as non-compliant adoption evidence in consumer-adoption mode', async () => {
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
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: `file:${basename(providedTarballs.capacitor)}` },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: `file:${basename(providedTarballs.contract)}` },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
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
      proofMode: 'consumer-adoption',
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.areas.isolation, 'FAIL');
    assert.match(result.failures.join('\n'), /Registry-only proof is required/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('orchestrator accepts help text runtime proof even when CLI exits non-zero', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-runtime-proof-help-exit-'));
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const commandRunner = async ({ command, args }) => {
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-capacitor/-/legato-capacitor-0.1.2.tgz' },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-contract/-/legato-contract-0.1.2.tgz' },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        description: 'Capacitor bridge for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
        description: 'Contract package for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/native-artifacts.json'), '{"ios":{"packageUrl":"https://github.com/ddgutierrezc/legato-ios-core.git","packageName":"LegatoCore","product":"LegatoCore","version":"0.1.1"}}', 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'npx' && args[0] === 'legato' && args[1] === '--help') {
      const error = new Error('help exits with code 1 in this shell');
      error.stdout = 'Legato Native CLI\nUsage: legato [command]\n';
      error.stderr = '';
      throw error;
    }
    if (command === 'node' && args[0] === '--input-type=module' && /import\('@ddgutierrezc\/legato-contract'\)/.test(args[2] ?? '')) {
      return { stdout: 'documented import ok\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /legato-contract\/dist\/state\.js/.test(args[2] ?? '')) {
      const error = new Error('deep import blocked');
      error.stdout = '';
      error.stderr = 'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath is not defined by "exports"';
      throw error;
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
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.runtimeProof?.cliHelp?.status, 'PASS');
    assert.match(result.runtimeProof?.cliHelp?.output ?? '', /usage: legato/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('npm-readiness mode records documented import runtime mismatch without blocking pass', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-runtime-proof-readiness-'));
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
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: `file:${basename(providedTarballs.capacitor)}` },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: `file:${basename(providedTarballs.contract)}` },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        description: 'Capacitor bridge for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
        description: 'Contract package for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/native-artifacts.json'), '{"ios":{"packageUrl":"https://github.com/ddgutierrezc/legato-ios-core.git","packageName":"LegatoCore","product":"LegatoCore","version":"0.1.1"}}', 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-capacitor@0.1.1') {
      return {
        stdout: JSON.stringify({
          version: '0.1.1',
          peerDependencies: { '@ddgutierrezc/legato-contract': '^0.1.1' },
        }),
        stderr: '',
      };
    }
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-contract@0.1.1') {
      return { stdout: JSON.stringify('0.1.1'), stderr: '' };
    }
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-contract') {
      return { stdout: JSON.stringify(['0.1.1']), stderr: '' };
    }
    if (command === 'npx' && args[0] === 'legato' && args[1] === '--help') {
      return { stdout: 'Usage: legato native doctor\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /import\('@ddgutierrezc\/legato-contract'\)/.test(args[2] ?? '')) {
      const error = new Error('module mismatch in node runtime');
      error.stdout = '';
      error.stderr = 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module';
      throw error;
    }
    if (command === 'node' && args[0] === '--input-type=module' && /legato-contract\/dist\/state\.js/.test(args[2] ?? '')) {
      const error = new Error('deep import blocked');
      error.stdout = '';
      error.stderr = 'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath is not defined by "exports"';
      throw error;
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
      proofMode: 'npm-readiness',
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.runtimeProof?.documentedImport?.status, 'FAIL');
    assert.equal(result.failures.some((failure) => /Documented import runtime proof failed/i.test(failure)), false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('consumer-adoption mode does not block on known contract root-import packaging mismatch', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-runtime-proof-consumer-known-mismatch-'));
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const commandRunner = async ({ command, args }) => {
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-capacitor/-/legato-capacitor-0.1.2.tgz' },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-contract/-/legato-contract-0.1.2.tgz' },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/native-artifacts.json'), '{"ios":{"packageUrl":"https://github.com/ddgutierrezc/legato-ios-core.git","packageName":"LegatoCore","product":"LegatoCore","version":"0.1.1"}}', 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-capacitor@0.1.2') {
      return {
        stdout: JSON.stringify({
          version: '0.1.2',
          peerDependencies: { '@ddgutierrezc/legato-contract': '^0.1.2' },
        }),
        stderr: '',
      };
    }
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-contract@0.1.2') {
      return { stdout: JSON.stringify('0.1.2'), stderr: '' };
    }
    if (command === 'npm' && args[0] === 'view' && args[1] === '@ddgutierrezc/legato-contract') {
      return { stdout: JSON.stringify(['0.1.1', '0.1.2']), stderr: '' };
    }
    if (command === 'npx' && args[0] === 'legato' && args[1] === '--help') {
      return { stdout: 'Usage: legato native doctor\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /import\('@ddgutierrezc\/legato-contract'\)/.test(args[2] ?? '')) {
      const error = new Error('known contract packaging mismatch');
      error.stdout = '';
      error.stderr = 'Error [ERR_MODULE_NOT_FOUND]: Cannot find module "/tmp/fixture/node_modules/@ddgutierrezc/legato-contract/dist/track" imported from /tmp/fixture/node_modules/@ddgutierrezc/legato-contract/dist/index.js';
      throw error;
    }
    if (command === 'node' && args[0] === '--input-type=module' && /legato-contract\/dist\/state\.js/.test(args[2] ?? '')) {
      const error = new Error('deep import blocked');
      error.stdout = '';
      error.stderr = 'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath is not defined by "exports"';
      throw error;
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
      registrySpecs: {
        capacitor: '@ddgutierrezc/legato-capacitor@0.1.2',
        contract: '@ddgutierrezc/legato-contract@0.1.2',
      },
      proofMode: 'consumer-adoption',
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.runtimeProof?.documentedImport?.status, 'FAIL');
    assert.equal(result.failures.some((failure) => /Documented import runtime proof failed/i.test(failure)), false);
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

  const commandCalls = [];

  const commandRunner = async ({ command, args }) => {
    commandCalls.push([command, ...args].join(' '));
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-capacitor/-/legato-capacitor-0.1.1.tgz' },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-contract/-/legato-contract-0.1.1.tgz' },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/native-artifacts.json'), '{"ios":{"packageUrl":"https://github.com/ddgutierrezc/legato-ios-core.git","packageName":"LegatoCore","product":"LegatoCore","version":"0.1.1"}}', 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'npx' && args[0] === 'legato' && args[1] === '--help') {
      return { stdout: 'Usage: legato native doctor\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /import\('@ddgutierrezc\/legato-contract'\)/.test(args[2] ?? '')) {
      return { stdout: 'documented import ok\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /legato-contract\/dist\/state\.js/.test(args[2] ?? '')) {
      const error = new Error('deep import blocked');
      error.stdout = '';
      error.stderr = 'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath is not defined by "exports"';
      throw error;
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
    });

    assert.equal(result.status, 'PASS');
    const validatorCall = commandCalls.find((call) => /validate-native-artifacts\.mjs/i.test(call));
    assert.equal(typeof validatorCall, 'string');
    assert.match(validatorCall, /--native-artifacts-contract/i);
    assert.match(validatorCall, /node_modules\/@ddgutierrezc\/legato-capacitor\/native-artifacts\.json/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('orchestrator captures installed metadata/bin evidence without changing adoption flow', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-metadata-'));
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const commandCalls = [];

  const commandRunner = async ({ command, args }) => {
    commandCalls.push([command, ...args].join(' '));
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-capacitor/-/legato-capacitor-0.1.2.tgz' },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-contract/-/legato-contract-0.1.2.tgz' },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        description: 'Capacitor bridge for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
        description: 'Contract package for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/native-artifacts.json'), '{"ios":{"packageUrl":"https://github.com/ddgutierrezc/legato-ios-core.git","packageName":"LegatoCore","product":"LegatoCore","version":"0.1.1"}}', 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'npx' && args[0] === 'legato' && args[1] === '--help') {
      return { stdout: 'Usage: legato native doctor\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /import\('@ddgutierrezc\/legato-contract'\)/.test(args[2] ?? '')) {
      return { stdout: 'documented import ok\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /legato-contract\/dist\/state\.js/.test(args[2] ?? '')) {
      const error = new Error('deep import blocked');
      error.stdout = '';
      error.stderr = 'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath is not defined by "exports"';
      throw error;
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
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.packageEvidence?.capacitor?.bin?.legato, './dist/cli/index.mjs');
    assert.equal(result.packageEvidence?.contract?.hasBin, false);
    const joinedCalls = commandCalls.join('\n');
    assert.match(joinedCalls, /npm install/i);
    assert.match(joinedCalls, /npx cap sync ios android/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('orchestrator captures runtime proof for installed CLI invocation and deep-import rejection', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-runtime-proof-'));
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const commandRunner = async ({ command, args }) => {
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-capacitor/-/legato-capacitor-0.1.2.tgz' },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-contract/-/legato-contract-0.1.2.tgz' },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        description: 'Capacitor bridge for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
        description: 'Contract package for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/native-artifacts.json'), '{"ios":{"packageUrl":"https://github.com/ddgutierrezc/legato-ios-core.git","packageName":"LegatoCore","product":"LegatoCore","version":"0.1.1"}}', 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'npx' && args[0] === 'legato' && args[1] === '--help') {
      return { stdout: 'Usage: legato native doctor\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /import\('@ddgutierrezc\/legato-contract'\)/.test(args[2] ?? '')) {
      return { stdout: 'documented import ok\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /legato-contract\/dist\/state\.js/.test(args[2] ?? '')) {
      const error = new Error('deep import blocked');
      error.stdout = '';
      error.stderr = 'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath is not defined by "exports"';
      throw error;
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
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.runtimeProof?.cliHelp?.status, 'PASS');
    assert.equal(result.runtimeProof?.documentedImport?.status, 'PASS');
    assert.equal(result.runtimeProof?.deepImportRejection?.status, 'PASS');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('orchestrator fails when undocumented deep import resolves unexpectedly', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-external-orchestrator-deep-import-')); 
  const artifactsDir = join(tempDir, 'artifacts');
  const fixtureRoot = join(tempDir, 'fixture');
  const repoRoot = join(tempDir, 'repo-root');
  await mkdir(repoRoot, { recursive: true });
  await mkdir(fixtureRoot, { recursive: true });

  const commandRunner = async ({ command, args }) => {
    if (command === 'npm' && args[0] === 'install') {
      await writeFile(join(fixtureRoot, 'package-lock.json'), JSON.stringify({
        packages: {
          'node_modules/@ddgutierrezc/legato-capacitor': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-capacitor/-/legato-capacitor-0.1.2.tgz' },
          'node_modules/@ddgutierrezc/legato-contract': { resolved: 'https://registry.npmjs.org/@ddgutierrezc/legato-contract/-/legato-contract-0.1.2.tgz' },
        },
      }), 'utf8');
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor'), { recursive: true });
      await mkdir(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract'), { recursive: true });
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-capacitor',
        description: 'Capacitor bridge for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        bin: { legato: './dist/cli/index.mjs' },
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'), JSON.stringify({
        name: '@ddgutierrezc/legato-contract',
        description: 'Contract package for Legato',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        exports: { '.': { types: './dist/index.d.ts', default: './dist/index.js' } },
      }), 'utf8');
      await writeFile(join(fixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/native-artifacts.json'), '{"ios":{"packageUrl":"https://github.com/ddgutierrezc/legato-ios-core.git","packageName":"LegatoCore","product":"LegatoCore","version":"0.1.1"}}', 'utf8');
      return { stdout: 'install ok', stderr: '' };
    }
    if (command === 'npx' && args[0] === 'legato' && args[1] === '--help') {
      return { stdout: 'Usage: legato native doctor\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /import\('@ddgutierrezc\/legato-contract'\)/.test(args[2] ?? '')) {
      return { stdout: 'documented import ok\n', stderr: '' };
    }
    if (command === 'node' && args[0] === '--input-type=module' && /legato-contract\/dist\/state\.js/.test(args[2] ?? '')) {
      return { stdout: 'unexpected success\n', stderr: '' };
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
    });

    assert.equal(result.status, 'FAIL');
    assert.match(result.failures.join('\n'), /undocumented deep import|ERR_PACKAGE_PATH_NOT_EXPORTED/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
