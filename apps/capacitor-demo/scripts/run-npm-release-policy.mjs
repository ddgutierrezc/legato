import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNpmReadiness } from './run-npm-readiness.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARTIFACTS_DIR = resolve(scriptDir, '../artifacts/npm-release-v1');

const toIsoTimestamp = () => new Date().toISOString();

const writeJson = async (filePath, payload) => {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return absolutePath;
};

export const runNpmReleasePolicy = async ({
  releaseId,
  mode,
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  publishIntentEvidence = '',
  runReadiness = runNpmReadiness,
  runCommand = async () => ({ exitCode: 0, stdout: '', stderr: '' }),
} = {}) => {
  const normalizedReleaseId = String(releaseId ?? '').trim();
  const normalizedMode = String(mode ?? '').trim();
  const failures = [];

  if (!normalizedReleaseId) {
    failures.push('release_id is required.');
  }
  if (!['readiness', 'release-candidate', 'protected-publish'].includes(normalizedMode)) {
    failures.push('mode must be one of readiness, release-candidate, protected-publish.');
  }

  if (normalizedMode === 'protected-publish' && !String(publishIntentEvidence).trim()) {
    failures.push('publish intent evidence is required for protected-publish mode.');
  }

  let readiness = null;
  if (failures.length === 0) {
    try {
      readiness = await runReadiness();
    } catch (error) {
      failures.push(`readiness failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result = {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    release_id: normalizedReleaseId,
    mode: normalizedMode,
    terminal_status: failures.length === 0 ? 'validated' : 'policy_blocked',
    publish_attempted: false,
    publish_intent_evidence: String(publishIntentEvidence ?? '').trim(),
    readiness,
    failures,
    generated_at: toIsoTimestamp(),
  };

  // Explicitly no publish in v1; keep an auditable no-op command hook.
  if (normalizedMode === 'protected-publish' && failures.length === 0) {
    await runCommand({ command: 'node', args: ['-e', 'process.exit(0)'] });
  }

  result.summary_path = await writeJson(
    resolve(artifactsDir, normalizedReleaseId || 'missing-release-id', 'summary.json'),
    result,
  );
  return result;
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
    if (arg === '--publish-intent-evidence' && args[i + 1]) {
      options.publishIntentEvidence = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--artifacts-dir' && args[i + 1]) {
      options.artifactsDir = args[i + 1];
      i += 1;
    }
  }

  const result = await runNpmReleasePolicy(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.status === 'PASS' ? 0 : 1);
}
