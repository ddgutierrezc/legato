import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const artifactsRoot = resolve(scriptDir, '../artifacts/npm-release-readiness-v1');
const tarballDir = resolve(artifactsRoot, 'tarballs');
const VALID_PACKAGE_TARGETS = new Set(['capacitor', 'contract']);

const runCommand = async ({ command, args, cwd }) => new Promise((resolveResult, rejectResult) => {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
    process.stdout.write(chunk);
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
    process.stderr.write(chunk);
  });

  child.on('close', (code) => {
    if (code === 0) {
      resolveResult({ stdout, stderr, exitCode: code });
      return;
    }
    const error = new Error(`Command failed (${command} ${args.join(' ')})`);
    error.exitCode = code;
    error.stdout = stdout;
    error.stderr = stderr;
    rejectResult(error);
  });
});

const parseJsonOutput = (stdout) => JSON.parse(stdout.trim());

const PASS = 'PASS';
const FAIL = 'FAIL';

const runContractOnlyValidation = async ({ contractTarballPath, commandRunner }) => {
  const fixtureRoot = await mkdtemp(join(tmpdir(), 'legato-contract-readiness-'));
  const failures = [];

  const collectCommandFailure = (label, error) => {
    const output = `${error?.stdout ?? ''}\n${error?.stderr ?? ''}`.trim();
    if (output.length > 0) {
      failures.push(`${label}: ${output}`);
      return;
    }
    failures.push(`${label}: command failed without output`);
  };

  try {
    await writeFile(resolve(fixtureRoot, 'package.json'), `${JSON.stringify({
      name: 'legato-contract-readiness-fixture',
      private: true,
      version: '0.0.0',
      type: 'module',
    }, null, 2)}\n`, 'utf8');

    try {
      await commandRunner({
        command: 'npm',
        args: ['install', '--no-audit', '--no-fund', contractTarballPath],
        cwd: fixtureRoot,
      });
    } catch (error) {
      collectCommandFailure('Contract installability proof failed', error);
    }

    try {
      const documentedImport = await commandRunner({
        command: 'node',
        args: ['--input-type=module', '-e', "import('@ddgutierrezc/legato-contract').then(() => process.stdout.write('documented import ok\\n'))"],
        cwd: fixtureRoot,
      });
      const output = `${documentedImport.stdout ?? ''}${documentedImport.stderr ?? ''}`;
      if (!/documented import ok/i.test(output)) {
        failures.push('Documented import runtime proof failed: package root import did not report success.');
      }
    } catch (error) {
      collectCommandFailure('Documented import runtime proof failed', error);
    }

    try {
      await commandRunner({
        command: 'node',
        args: ['--input-type=module', '-e', "import('@ddgutierrezc/legato-contract/dist/state.js').then(() => process.stdout.write('unexpected deep import success\\n'))"],
        cwd: fixtureRoot,
      });
      failures.push('Undocumented deep import resolved unexpectedly: expected package exports to reject @ddgutierrezc/legato-contract/dist/state.js.');
    } catch (error) {
      const output = `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
      if (!/ERR_PACKAGE_PATH_NOT_EXPORTED|Package subpath .* not defined by "exports"/i.test(output)) {
        collectCommandFailure('Undocumented deep import rejection proof failed', error);
      }
    }
  } finally {
    await rm(fixtureRoot, { recursive: true, force: true });
  }

  return {
    status: failures.length === 0 ? PASS : FAIL,
    exitCode: failures.length === 0 ? 0 : 1,
    failures,
    profile: 'contract-only-runtime',
    tarballPath: contractTarballPath,
  };
};

const normalizePackageTarget = (packageTarget) => {
  const normalized = String(packageTarget ?? '').trim() || 'capacitor';
  if (!VALID_PACKAGE_TARGETS.has(normalized)) {
    throw new Error(`package_target must be one of capacitor, contract. Received: ${normalized}`);
  }
  return normalized;
};

export const runNpmReadiness = async ({ packageTarget = 'capacitor', commandRunner = runCommand } = {}) => {
  const normalizedPackageTarget = normalizePackageTarget(packageTarget);
  await mkdir(tarballDir, { recursive: true });

  await commandRunner({
    command: 'npm',
    args: ['install', '--no-package-lock'],
    cwd: resolve(repoRoot, 'packages/contract'),
  });

  await commandRunner({
    command: 'npm',
    args: ['run', 'build'],
    cwd: resolve(repoRoot, 'packages/contract'),
  });

  await commandRunner({
    command: 'node',
    args: [
      resolve(repoRoot, 'packages/capacitor/scripts/assert-package-entries.mjs'),
      '--package-root', resolve(repoRoot, 'packages/contract'),
      '--profile', 'contract',
    ],
    cwd: repoRoot,
  });

  const contractInspection = await commandRunner({
    command: 'node',
    args: [
      resolve(repoRoot, 'packages/capacitor/scripts/inspect-tarball.mjs'),
      '--package-root', resolve(repoRoot, 'packages/contract'),
      '--profile', 'contract',
      '--pack-destination', tarballDir,
      '--json-out', resolve(artifactsRoot, 'contract-pack-summary.json'),
    ],
    cwd: repoRoot,
  });

  const contractResult = parseJsonOutput(contractInspection.stdout);

  if (normalizedPackageTarget === 'contract') {
    const externalValidationResult = await runContractOnlyValidation({
      contractTarballPath: contractResult.tarballPath,
      commandRunner,
    });

    if (externalValidationResult?.status !== 'PASS') {
      const combined = Array.isArray(externalValidationResult?.failures)
        ? externalValidationResult.failures.join('; ')
        : 'contract-only validation failed';
      throw new Error(`contract-only validation failed for contract target: ${combined}`);
    }

    return {
      package_target: normalizedPackageTarget,
      readiness_profile: 'contract-only',
      contractResult,
      capacitorResult: null,
      externalValidation: externalValidationResult,
      cross_package_validation: {
        status: 'SKIPPED',
        reason: 'contract publish readiness validates packaging + runtime import invariants for @ddgutierrezc/legato-contract without cross-package fixture requirements.',
      },
    };
  }

  await commandRunner({
    command: 'npm',
    args: ['install', '--no-package-lock'],
    cwd: resolve(repoRoot, 'packages/capacitor'),
  });

  await commandRunner({
    command: 'npm',
    args: ['run', 'build'],
    cwd: resolve(repoRoot, 'packages/capacitor'),
  });

  await commandRunner({
    command: 'node',
    args: [
      resolve(repoRoot, 'packages/capacitor/scripts/assert-package-entries.mjs'),
      '--package-root', resolve(repoRoot, 'packages/capacitor'),
      '--profile', 'capacitor',
    ],
    cwd: repoRoot,
  });

  const capacitorInspection = await commandRunner({
    command: 'node',
    args: [
      resolve(repoRoot, 'packages/capacitor/scripts/inspect-tarball.mjs'),
      '--package-root', resolve(repoRoot, 'packages/capacitor'),
      '--profile', 'capacitor',
      '--pack-destination', tarballDir,
      '--json-out', resolve(artifactsRoot, 'capacitor-pack-summary.json'),
    ],
    cwd: repoRoot,
  });

  const capacitorResult = parseJsonOutput(capacitorInspection.stdout);

  const externalValidation = await commandRunner({
    command: 'node',
    args: [
      resolve(scriptDir, 'run-external-consumer-validation.mjs'),
      '--skip-pack',
      '--proof-mode', 'npm-readiness',
      '--tarball-contract', contractResult.tarballPath,
      '--tarball-capacitor', capacitorResult.tarballPath,
      '--artifacts-dir', resolve(artifactsRoot, 'external-consumer'),
    ],
    cwd: resolve(repoRoot, 'apps/capacitor-demo'),
  });

  return {
    package_target: normalizedPackageTarget,
    readiness_profile: 'capacitor-cross-package',
    contractResult,
    capacitorResult,
    externalValidation: parseJsonOutput(externalValidation.stdout),
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--package-target' && args[i + 1]) {
      options.packageTarget = args[i + 1];
      i += 1;
    }
  }
  await runNpmReadiness(options);
}
