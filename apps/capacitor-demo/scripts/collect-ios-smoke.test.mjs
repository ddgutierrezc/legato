import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  collectIosSmokeReportFromLog,
  normalizeIosCollectorFailure,
} from './collect-ios-smoke.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));

const readFixture = async (fileName) => readFile(join(currentDir, '__fixtures__', fileName), 'utf8');

test('collector extracts latest smoke marker payload from iOS simulator log stream', async () => {
  const logText = await readFixture('ios-log-stream-success.log');

  const report = collectIosSmokeReportFromLog(logText, {
    collectedAt: '2026-04-22T19:00:00.000Z',
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.flow, 'smoke');
  assert.equal(report.metadata.platform, 'ios');
  assert.equal(report.metadata.collectedAt, '2026-04-22T19:00:00.000Z');
  assert.match(report.snapshotSummary, /state=paused/);
  assert.equal(report.errors.length, 0);
});

test('collector normalizes malformed marker payload as actionable FAIL artifact on iOS', async () => {
  const logText = await readFixture('ios-log-stream-malformed.log');
  const report = collectIosSmokeReportFromLog(logText);

  assert.equal(report.status, 'FAIL');
  assert.equal(report.flow, 'smoke');
  assert.equal(report.metadata.platform, 'ios');
  assert.equal(report.metadata.step, 'parse-marker-json');
  assert.equal(report.errors.length > 0, true);
  assert.match(report.errors[0], /Malformed smoke marker payload/);
});

test('collector normalizes missing-marker retrieval failure with platform and step context on iOS', async () => {
  const logText = await readFixture('ios-log-stream-missing-marker.log');
  const report = collectIosSmokeReportFromLog(logText);

  assert.equal(report.status, 'FAIL');
  assert.equal(report.flow, 'smoke');
  assert.equal(report.metadata.platform, 'ios');
  assert.equal(report.metadata.step, 'find-marker');
  assert.match(report.snapshotSummary, /collector retrieval failed/);
  assert.equal(report.errors.length > 0, true);
  assert.match(report.errors[0], /LEGATO_SMOKE_REPORT/);

  const check = report.checks.find((entry) => entry.label === 'ios-collector');
  assert.ok(check);
  assert.equal(check.ok, false);
});

test('failure helper keeps v1 required keys present and non-null for iOS', () => {
  const report = normalizeIosCollectorFailure({
    step: 'ios-log-stream',
    message: 'xcrun command failed with exit code 1',
    collectedAt: '2026-04-22T20:00:00.000Z',
  });

  assert.deepEqual(Object.keys(report).sort(), [
    'checks',
    'errors',
    'flow',
    'metadata',
    'parityEvidence',
    'recentEvents',
    'runtimeIntegrity',
    'schemaVersion',
    'snapshotSummary',
    'status',
  ]);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.errors.length > 0, true);
  assert.equal(report.metadata.platform, 'ios');
  assert.equal(report.metadata.step, 'ios-log-stream');
});

test('collector fails with actionable diagnostics when smoke marker omits runtime integrity payload', () => {
  const line = 'LEGATO_SMOKE_REPORT ' + JSON.stringify({
    schemaVersion: 1,
    flow: 'smoke',
    status: 'PASS',
    checks: [{ label: 'current track present', ok: true, detail: 'track=Demo Track 1' }],
    snapshotSummary: 'state=paused | track=Demo Track 1 | position=1200 | duration=3000',
    recentEvents: ['setup finished', 'play finished'],
    errors: [],
    metadata: { platform: 'ios' },
  });

  const report = collectIosSmokeReportFromLog(line);

  assert.equal(report.status, 'FAIL');
  assert.equal(report.metadata.step, 'validate-runtime-integrity-payload');
  assert.match(report.errors[0], /runtime integrity/i);
});

test('collector fails with actionable diagnostics when smoke marker omits parity evidence payload', () => {
  const line = 'LEGATO_SMOKE_REPORT ' + JSON.stringify({
    schemaVersion: 1,
    flow: 'smoke',
    status: 'PASS',
    checks: [{ label: 'current track present', ok: true, detail: 'track=Demo Track 1' }],
    snapshotSummary: 'state=paused | track=Demo Track 1 | position=1200 | duration=3000',
    recentEvents: ['setup finished', 'play finished'],
    errors: [],
    metadata: { platform: 'ios' },
    runtimeIntegrity: {
      transportCommandsObserved: true,
      progressAdvancedWhilePlaying: true,
      trackEndTransitionObserved: false,
      snapshotProjectionCoherent: true,
      details: {
        transport: 'ok',
        progress: 'ok',
        trackEnd: 'ok',
        snapshot: 'ok',
      },
    },
  });

  const report = collectIosSmokeReportFromLog(line);

  assert.equal(report.status, 'FAIL');
  assert.equal(report.metadata.step, 'validate-parity-evidence-payload');
  assert.match(report.errors[0], /parity evidence/i);
});
