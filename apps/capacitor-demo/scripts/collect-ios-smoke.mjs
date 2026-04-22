import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { LEGATO_SMOKE_REPORT_MARKER } from '../src/smoke-automation.js';
import {
  SMOKE_REPORT_V1_SCHEMA_VERSION,
  validateSmokeReportV1,
} from './report-schema.mjs';

const DEFAULT_OUTPUT_PATH = 'apps/capacitor-demo/artifacts/ios-smoke-report.json';
const DEFAULT_STREAM_TIMEOUT_MS = 15_000;

const createCollectorCheck = (detail) => ({
  label: 'ios-collector',
  ok: false,
  detail,
});

export const normalizeIosCollectorFailure = ({
  step,
  message,
  collectedAt = new Date().toISOString(),
  recentEvents = [],
}) => ({
  schemaVersion: SMOKE_REPORT_V1_SCHEMA_VERSION,
  flow: 'smoke',
  status: 'FAIL',
  checks: [createCollectorCheck(`collector retrieval failed at ${step}`)],
  snapshotSummary: `collector retrieval failed (platform=ios, step=${step})`,
  recentEvents,
  errors: [message],
  metadata: {
    platform: 'ios',
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

export const collectIosSmokeReportFromLog = (
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
      return normalizeIosCollectorFailure({
        step: 'parse-marker-json',
        message: 'Malformed smoke marker payload: JSON parse failed.',
        collectedAt,
      });
    }

    const validation = validateSmokeReportV1(parsed);
    if (!validation.ok) {
      return normalizeIosCollectorFailure({
        step: 'validate-report-shape',
        message: `Smoke marker payload failed v1 validation: ${validation.errors.join('; ')}`,
        collectedAt,
      });
    }

    if (parsed.flow !== 'smoke' || parsed.schemaVersion !== SMOKE_REPORT_V1_SCHEMA_VERSION) {
      return normalizeIosCollectorFailure({
        step: 'validate-report-version',
        message: `Unsupported smoke report payload (flow=${String(parsed.flow)}, schemaVersion=${String(parsed.schemaVersion)}).`,
        collectedAt,
      });
    }

    return {
      ...parsed,
      metadata: {
        ...(parsed.metadata ?? {}),
        platform: 'ios',
        collectedAt,
      },
    };
  }

  return normalizeIosCollectorFailure({
    step: 'find-marker',
    message: `Could not find ${LEGATO_SMOKE_REPORT_MARKER} marker in iOS simulator log stream output.`,
    collectedAt,
  });
};

const streamIosSimulatorLogs = ({ timeoutMs = DEFAULT_STREAM_TIMEOUT_MS } = {}) => new Promise((resolveText, rejectText) => {
  const args = [
    'simctl',
    'spawn',
    'booted',
    'log',
    'stream',
    '--style',
    'compact',
    '--level',
    'debug',
    '--predicate',
    `eventMessage CONTAINS "${LEGATO_SMOKE_REPORT_MARKER}"`,
  ];

  const child = spawn('xcrun', args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  let timedOut = false;

  const timeoutHandle = setTimeout(() => {
    timedOut = true;
    child.kill('SIGTERM');
    setTimeout(() => child.kill('SIGKILL'), 2000).unref();
  }, timeoutMs);
  timeoutHandle.unref();

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    clearTimeout(timeoutHandle);
    rejectText(error);
  });

  child.on('close', (code, signal) => {
    clearTimeout(timeoutHandle);
    if (timedOut || signal === 'SIGTERM' || signal === 'SIGKILL') {
      resolveText(stdout);
      return;
    }

    if (code === 0) {
      resolveText(stdout);
      return;
    }

    rejectText(new Error(`xcrun simctl log stream failed (code=${String(code)}): ${stderr.trim() || 'no stderr output'}`));
  });
});

export const collectIosSmokeReport = async ({
  outputPath = DEFAULT_OUTPUT_PATH,
  collectedAt = new Date().toISOString(),
  streamTimeoutMs = DEFAULT_STREAM_TIMEOUT_MS,
  getLogText,
} = {}) => {
  let report;

  if (getLogText) {
    report = collectIosSmokeReportFromLog(await getLogText(), { collectedAt });
  } else {
    try {
      const logText = await streamIosSimulatorLogs({ timeoutMs: streamTimeoutMs });
      report = collectIosSmokeReportFromLog(logText, { collectedAt });
    } catch (error) {
      const message = error instanceof Error && error.message
        ? `xcrun simctl log stream retrieval failed: ${error.message}`
        : 'xcrun simctl log stream retrieval failed with unknown error.';
      report = normalizeIosCollectorFailure({
        step: 'ios-log-stream',
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
  const args = {
    outputPath: DEFAULT_OUTPUT_PATH,
    timeoutMs: DEFAULT_STREAM_TIMEOUT_MS,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--output' && argv[i + 1]) {
      args.outputPath = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--timeout-ms' && argv[i + 1]) {
      const parsed = Number.parseInt(argv[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        args.timeoutMs = parsed;
      }
      i += 1;
    }
  }

  return args;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const args = parseArgs(process.argv.slice(2));
  const result = await collectIosSmokeReport({
    outputPath: args.outputPath,
    streamTimeoutMs: args.timeoutMs,
  });
  process.stdout.write(`${JSON.stringify({ outputPath: result.outputPath, status: result.report.status })}\n`);
  process.exit(result.report.status === 'PASS' ? 0 : 1);
}
