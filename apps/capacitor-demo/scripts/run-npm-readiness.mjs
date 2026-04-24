import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const artifactsRoot = resolve(scriptDir, '../artifacts/npm-release-readiness-v1');
const tarballDir = resolve(artifactsRoot, 'tarballs');

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

export const runNpmReadiness = async () => {
  await mkdir(tarballDir, { recursive: true });

  await runCommand({
    command: 'npm',
    args: ['run', 'build'],
    cwd: resolve(repoRoot, 'packages/contract'),
  });

  await runCommand({
    command: 'npm',
    args: ['run', 'build'],
    cwd: resolve(repoRoot, 'packages/capacitor'),
  });

  const contractInspection = await runCommand({
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

  const capacitorInspection = await runCommand({
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

  const contractResult = parseJsonOutput(contractInspection.stdout);
  const capacitorResult = parseJsonOutput(capacitorInspection.stdout);

  const externalValidation = await runCommand({
    command: 'node',
    args: [
      resolve(scriptDir, 'run-external-consumer-validation.mjs'),
      '--skip-pack',
      '--tarball-contract', contractResult.tarballPath,
      '--tarball-capacitor', capacitorResult.tarballPath,
      '--artifacts-dir', resolve(artifactsRoot, 'external-consumer'),
    ],
    cwd: resolve(repoRoot, 'apps/capacitor-demo'),
  });

  return {
    contractResult,
    capacitorResult,
    externalValidation: parseJsonOutput(externalValidation.stdout),
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  await runNpmReadiness();
}
