import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { LEGATO_SMOKE_REPORT_MARKER } from '../src/smoke-automation.js';
import {
  SMOKE_REPORT_V1_SCHEMA_VERSION,
  validateSmokeReportV1,
} from './report-schema.mjs';

const execFile = promisify(execFileCallback);

const DEFAULT_OUTPUT_PATH = 'apps/capacitor-demo/artifacts/android-smoke-report.json';

const createCollectorCheck = (detail) => ({
  label: 'android-collector',
  ok: false,
  detail,
});

export const normalizeAndroidCollectorFailure = ({
  step,
  message,
  collectedAt = new Date().toISOString(),
  recentEvents = [],
}) => ({
  schemaVersion: SMOKE_REPORT_V1_SCHEMA_VERSION,
  flow: 'smoke',
  status: 'FAIL',
  checks: [createCollectorCheck(`collector retrieval failed at ${step}`)],
  snapshotSummary: `collector retrieval failed (platform=android, step=${step})`,
  recentEvents,
  errors: [message],
  metadata: {
    platform: 'android',
    collectedAt,
    step,
  },
});

const parseMarkerPayload = (line) => {
  const markerIndex = line.lastIndexOf(LEGATO_SMOKE_REPORT_MARKER);
  if (markerIndex < 0) {
    return null;
  }

  return line.slice(markerIndex + LEGATO_SMOKE_REPORT_MARKER.length).trim();
};

export const collectAndroidSmokeReportFromLog = (
  logText,
  { collectedAt = new Date().toISOString() } = {},
) => {
  const lines = logText.split(/\r?\n/).filter((line) => line.trim() !== '');

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const markerPayload = parseMarkerPayload(lines[index]);
    if (markerPayload == null) {
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(markerPayload);
    } catch {
      return normalizeAndroidCollectorFailure({
        step: 'parse-marker-json',
        message: 'Malformed smoke marker payload: JSON parse failed.',
        collectedAt,
      });
    }

    const validation = validateSmokeReportV1(parsed);
    if (!validation.ok) {
      return normalizeAndroidCollectorFailure({
        step: 'validate-report-shape',
        message: `Smoke marker payload failed v1 validation: ${validation.errors.join('; ')}`,
        collectedAt,
      });
    }

    if (parsed.flow !== 'smoke' || parsed.schemaVersion !== SMOKE_REPORT_V1_SCHEMA_VERSION) {
      return normalizeAndroidCollectorFailure({
        step: 'validate-report-version',
        message: `Unsupported smoke report payload (flow=${String(parsed.flow)}, schemaVersion=${String(parsed.schemaVersion)}).`,
        collectedAt,
      });
    }

    return {
      ...parsed,
      metadata: {
        ...(parsed.metadata ?? {}),
        platform: 'android',
        collectedAt,
      },
    };
  }

  return normalizeAndroidCollectorFailure({
    step: 'find-marker',
    message: `Could not find ${LEGATO_SMOKE_REPORT_MARKER} marker in adb log output.`,
    collectedAt,
  });
};

export const collectAndroidSmokeReport = async ({
  outputPath = DEFAULT_OUTPUT_PATH,
  collectedAt = new Date().toISOString(),
  getLogText,
} = {}) => {
  let report;

  if (getLogText) {
    report = collectAndroidSmokeReportFromLog(await getLogText(), { collectedAt });
  } else {
    try {
      const { stdout } = await execFile('adb', ['logcat', '-d'], { maxBuffer: 16 * 1024 * 1024 });
      report = collectAndroidSmokeReportFromLog(stdout, { collectedAt });
    } catch (error) {
      const message = error instanceof Error && error.message
        ? `adb logcat retrieval failed: ${error.message}`
        : 'adb logcat retrieval failed with unknown error.';
      report = normalizeAndroidCollectorFailure({
        step: 'adb-logcat',
        message,
        collectedAt,
      });
    }
  }

  const absoluteOutputPath = resolve(outputPath);
  await mkdir(dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return { outputPath: absoluteOutputPath, report };
};

const parseArgs = (argv) => {
  const args = { outputPath: DEFAULT_OUTPUT_PATH };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      args.outputPath = argv[i + 1];
      i += 1;
    }
  }

  return args;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const args = parseArgs(process.argv.slice(2));
  const result = await collectAndroidSmokeReport({ outputPath: args.outputPath });
  process.stdout.write(`${JSON.stringify({ outputPath: result.outputPath, status: result.report.status })}\n`);
  process.exit(result.report.status === 'PASS' ? 0 : 1);
}
