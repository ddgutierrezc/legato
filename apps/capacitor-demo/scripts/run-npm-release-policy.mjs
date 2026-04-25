import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runNpmReadiness } from './run-npm-readiness.mjs';
import { runNpmReleaseExecution } from './release-npm-execution.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const DEFAULT_ARTIFACTS_DIR = resolve(scriptDir, '../artifacts/npm-release-v1');
const VALID_PACKAGE_TARGETS = new Set(['capacitor', 'contract']);

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
  packageTarget = 'capacitor',
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  publishIntentEvidence = '',
  runReadiness = runNpmReadiness,
  runExecution = runNpmReleaseExecution,
} = {}) => {
  const normalizedReleaseId = String(releaseId ?? '').trim();
  const normalizedMode = String(mode ?? '').trim();
  const normalizedPackageTarget = String(packageTarget ?? '').trim() || 'capacitor';
  const failures = [];

  if (!normalizedReleaseId) {
    failures.push('release_id is required.');
  }
  if (!['readiness', 'release-candidate', 'protected-publish'].includes(normalizedMode)) {
    failures.push('mode must be one of readiness, release-candidate, protected-publish.');
  }
  if (!VALID_PACKAGE_TARGETS.has(normalizedPackageTarget)) {
    failures.push('package_target must be one of capacitor, contract.');
  }

  if (normalizedMode === 'protected-publish' && !String(publishIntentEvidence).trim()) {
    failures.push('publish intent evidence is required for protected-publish mode.');
  }

  let readiness = null;
  if (failures.length === 0) {
    try {
      readiness = await runReadiness({ packageTarget: normalizedPackageTarget });
    } catch (error) {
      failures.push(`readiness failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const result = {
    status: failures.length === 0 ? 'PASS' : 'FAIL',
    release_id: normalizedReleaseId,
    mode: normalizedMode,
    package_target: normalizedPackageTarget,
    terminal_status: failures.length === 0 ? (normalizedMode === 'protected-publish' ? 'published' : 'blocked') : 'blocked',
    publish_attempted: false,
    publish_intent_evidence: String(publishIntentEvidence ?? '').trim(),
    readiness,
    failures,
    generated_at: toIsoTimestamp(),
  };

  if (normalizedMode === 'protected-publish' && failures.length === 0) {
    const execution = await runExecution({
      releaseId: normalizedReleaseId,
      mode: normalizedMode,
      packageTarget: normalizedPackageTarget,
      artifactsDir,
    });
    result.publish_attempted = Boolean(execution.publish_attempted);
    result.publish_command = execution.publish_command;
    result.verify = execution.verify;
    result.error_reference = execution.error_reference;
    result.terminal_status = execution.terminal_status ?? result.terminal_status;
    if (execution.status === 'FAIL') {
      result.status = 'FAIL';
      result.failures.push(...(execution.failures ?? []));
    }
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
    if (arg === '--package-target' && args[i + 1]) {
      options.packageTarget = args[i + 1];
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
