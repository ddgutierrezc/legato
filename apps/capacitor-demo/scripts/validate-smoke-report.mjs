import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';

import { validateSmokeReportV1 } from './report-schema.mjs';

const PASS = 'PASS';
const FAIL = 'FAIL';

const inferPlatform = (artifactPath, report) => {
  const metadataPlatform = report?.metadata?.platform;
  if (metadataPlatform === 'android' || metadataPlatform === 'ios') {
    return metadataPlatform;
  }

  const normalizedName = basename(artifactPath).toLowerCase();
  if (normalizedName.includes('android')) {
    return 'android';
  }
  if (normalizedName.includes('ios')) {
    return 'ios';
  }

  return 'unknown';
};

const evaluateArtifact = ({ path, report }) => {
  const platform = inferPlatform(path, report);
  const failures = [];

  const schemaValidation = validateSmokeReportV1(report);
  if (!schemaValidation.ok) {
    failures.push(`[${platform}] ${path}: schema validation failed: ${schemaValidation.errors.join('; ')}`);
  }

  const failedChecks = Array.isArray(report?.checks)
    ? report.checks.filter((check) => check?.ok === false)
    : [];

  if (report?.status === PASS && failedChecks.length > 0) {
    failures.push(`[${platform}] ${path}: status is PASS but ${failedChecks.length} checks are failing.`);
  }

  if (report?.status === PASS && Array.isArray(report?.errors) && report.errors.length > 0) {
    failures.push(`[${platform}] ${path}: status is PASS but errors[] is not empty.`);
  }

  if (platform === 'ios' && report?.status === PASS) {
    const runtimeIntegrity = report?.runtimeIntegrity;
    const hasRuntimeIntegrity = runtimeIntegrity
      && typeof runtimeIntegrity === 'object'
      && typeof runtimeIntegrity.transportCommandsObserved === 'boolean'
      && typeof runtimeIntegrity.progressAdvancedWhilePlaying === 'boolean'
      && typeof runtimeIntegrity.trackEndTransitionObserved === 'boolean'
      && typeof runtimeIntegrity.snapshotProjectionCoherent === 'boolean';

    if (!hasRuntimeIntegrity) {
      failures.push(`[ios] ${path}: PASS reports must include runtime integrity payload (transport/progress/track-end/snapshot checks).`);
    }
  }

  if (report?.status === PASS) {
    const parityEvidence = report?.parityEvidence;
    const hasParityEvidence = parityEvidence
      && typeof parityEvidence === 'object'
      && typeof parityEvidence.addStartIndexConverged === 'boolean'
      && typeof parityEvidence.remoteOrderConverged === 'boolean'
      && typeof parityEvidence.eventStateSnapshotConverged === 'boolean'
      && typeof parityEvidence.capabilitiesConverged === 'boolean';

    if (!hasParityEvidence) {
      failures.push(`[${platform}] ${path}: PASS reports must include parity evidence payload (add(startIndex), remote order, event/state/snapshot, capabilities).`);
    }

    const requestEvidence = report?.requestEvidence;
    const hasRequestEvidence = requestEvidence
      && typeof requestEvidence === 'object'
      && typeof requestEvidence.byRuntime === 'object'
      && requestEvidence.byRuntime !== null
      && Array.isArray(requestEvidence.assertions);

    if (!hasRequestEvidence) {
      failures.push(`[${platform}] ${path}: PASS reports must include requestEvidence payload with runtime/track request records and assertions.`);
    } else {
      const failingAssertions = requestEvidence.assertions
        .filter((assertion) => assertion?.ok === false)
        .map((assertion) => `${assertion.label}: ${assertion.detail}`);

      if (failingAssertions.length > 0) {
        failures.push(`[${platform}] ${path}: requestEvidence assertions failed: ${failingAssertions.join(' | ')}`);
      }
    }
  }

  if (report?.status === FAIL) {
    const collectorError = report.errors?.[0] ?? 'status is FAIL with no actionable error provided';
    failures.push(`[${platform}] ${path}: collector retrieval failed or smoke reported FAIL: ${collectorError}`);
  }

  return {
    platform,
    status: failures.length === 0 ? PASS : FAIL,
    failures,
  };
};

export const validateSmokeReports = (artifacts, { preflightFailures = [] } = {}) => {
  const reportArtifacts = Array.isArray(artifacts) ? artifacts : [];
  const evaluations = reportArtifacts.map(evaluateArtifact);

  const platforms = {};
  for (const evaluation of evaluations) {
    platforms[evaluation.platform] = { status: evaluation.status };
  }

  const failures = [
    ...preflightFailures,
    ...evaluations.flatMap((evaluation) => evaluation.failures),
  ];

  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    platforms,
    failures,
  };
};

export const formatValidationSummary = (result) => {
  const lines = [`Overall: ${result.status}`];
  const platformEntries = Object.entries(result.platforms).sort(([a], [b]) => a.localeCompare(b));

  for (const [platform, info] of platformEntries) {
    lines.push(`${platform}: ${info.status}`);
  }

  if (result.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
};

const parseArgs = (argv) => {
  const reportPaths = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--report' && argv[i + 1]) {
      reportPaths.push(argv[i + 1]);
      i += 1;
      continue;
    }

    reportPaths.push(arg);
  }

  return { reportPaths };
};

const readArtifacts = async (reportPaths) => {
  const artifacts = [];
  const preflightFailures = [];

  for (const reportPath of reportPaths) {
    try {
      const raw = await readFile(reportPath, 'utf8');
      artifacts.push({
        path: reportPath,
        report: JSON.parse(raw),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      preflightFailures.push(`[unknown] ${reportPath}: failed to read/parse report artifact: ${message}`);
    }
  }

  return { artifacts, preflightFailures };
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const { reportPaths } = parseArgs(process.argv.slice(2));

  if (reportPaths.length === 0) {
    process.stdout.write('Overall: FAIL\nFailures:\n- Usage: node scripts/validate-smoke-report.mjs --report <path> [--report <path> ...]\n');
    process.exit(1);
  }

  const { artifacts, preflightFailures } = await readArtifacts(reportPaths);
  const result = validateSmokeReports(artifacts, { preflightFailures });
  process.stdout.write(`${formatValidationSummary(result)}\n`);
  process.exit(result.exitCode);
}
