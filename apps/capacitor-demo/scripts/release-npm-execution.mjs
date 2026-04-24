import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARTIFACTS_DIR = resolve(scriptDir, '../artifacts/npm-release-v2');

const toIsoTimestamp = () => new Date().toISOString();

const writeJson = async (filePath, payload) => {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return absolutePath;
};

const runCommand = async ({ command, args, cwd = resolve(scriptDir, '../../../packages/capacitor'), env = process.env }) => new Promise((resolveResult) => {
  const child = spawn(command, args, {
    cwd,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    resolveResult({ exitCode: Number.isInteger(code) ? code : 1, stdout, stderr });
  });
  child.on('error', (error) => {
    resolveResult({ exitCode: 1, stdout, stderr: `${stderr}\n${error.message}`.trim() });
  });
});

const readPackageIdentity = async (commandRunner) => {
  const nameResult = await commandRunner({ command: 'npm', args: ['pkg', 'get', 'name', '--json'] });
  const versionResult = await commandRunner({ command: 'npm', args: ['pkg', 'get', 'version', '--json'] });
  if (nameResult.exitCode !== 0 || versionResult.exitCode !== 0) {
    return { packageName: '', packageVersion: '' };
  }

  return {
    packageName: JSON.parse(nameResult.stdout),
    packageVersion: JSON.parse(versionResult.stdout),
  };
};

export const runNpmReleaseExecution = async ({
  releaseId,
  mode,
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  commandRunner = runCommand,
} = {}) => {
  const normalizedReleaseId = String(releaseId ?? '').trim();
  if (String(mode ?? '').trim() !== 'protected-publish') {
    return {
      status: 'PASS',
      terminal_status: 'not_selected',
      publish_attempted: false,
      failures: [],
    };
  }

  const identity = await readPackageIdentity(commandRunner);
  const publishResult = await commandRunner({ command: 'npm', args: ['publish', '--provenance'] });
  if (publishResult.exitCode !== 0) {
    const errorPath = await writeJson(
      resolve(artifactsDir, normalizedReleaseId || 'missing-release-id', 'publish.json'),
      {
        status: 'FAIL',
        terminal_status: 'failed',
        publish_attempted: true,
        publish_command: 'npm publish --provenance',
        package_name: identity.packageName,
        package_version: identity.packageVersion,
        failures: [publishResult.stderr || publishResult.stdout || 'npm publish failed'],
        generated_at: toIsoTimestamp(),
      },
    );

    return {
      status: 'FAIL',
      terminal_status: 'failed',
      publish_attempted: true,
      publish_command: 'npm publish --provenance',
      error_reference: errorPath,
      failures: [publishResult.stderr || publishResult.stdout || 'npm publish failed'],
    };
  }

  const npmViewResult = await commandRunner({
    command: 'npm',
    args: ['view', `${identity.packageName}@${identity.packageVersion}`, 'version', '--json'],
  });

  const verifyPass = npmViewResult.exitCode === 0;
  const summaryPath = await writeJson(
    resolve(artifactsDir, normalizedReleaseId || 'missing-release-id', 'publish.json'),
    {
      status: verifyPass ? 'PASS' : 'FAIL',
      terminal_status: verifyPass ? 'published' : 'failed',
      publish_attempted: true,
      publish_command: 'npm publish --provenance',
      package_name: identity.packageName,
      package_version: identity.packageVersion,
      verify: {
        npm_view: verifyPass ? 'PASS' : 'FAIL',
        stdout: npmViewResult.stdout,
        stderr: npmViewResult.stderr,
      },
      generated_at: toIsoTimestamp(),
    },
  );

  return {
    status: verifyPass ? 'PASS' : 'FAIL',
    terminal_status: verifyPass ? 'published' : 'failed',
    publish_attempted: true,
    publish_command: 'npm publish --provenance',
    verify: { npm_view: verifyPass ? 'PASS' : 'FAIL' },
    failures: verifyPass ? [] : [npmViewResult.stderr || 'npm view failed after publish'],
    error_reference: verifyPass ? '' : summaryPath,
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--release-id' && args[i + 1]) {
      options.releaseId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--mode' && args[i + 1]) {
      options.mode = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--artifacts-dir' && args[i + 1]) {
      options.artifactsDir = args[i + 1];
      i += 1;
    }
  }

  const result = await runNpmReleaseExecution(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === 'PASS' ? 0 : 1);
}
