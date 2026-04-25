import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  collectAndroidSmokeReportFromLog,
  normalizeAndroidCollectorFailure,
} from './collect-android-smoke.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));

const readFixture = async (fileName) => readFile(join(currentDir, '__fixtures__', fileName), 'utf8');

test('collector extracts latest smoke marker payload from android log stream', async () => {
  const logText = await readFixture('android-logcat-success.log');

  const report = collectAndroidSmokeReportFromLog(logText, {
    collectedAt: '2026-04-22T17:00:00.000Z',
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.schemaVersion, 1);
  assert.equal(report.flow, 'smoke');
  assert.equal(report.metadata.platform, 'android');
  assert.equal(report.metadata.collectedAt, '2026-04-22T17:00:00.000Z');
  assert.match(report.snapshotSummary, /state=paused/);
  assert.equal(report.errors.length, 0);
});

test('collector normalizes malformed marker payload as actionable FAIL artifact', async () => {
  const logText = await readFixture('android-logcat-malformed.log');
  const report = collectAndroidSmokeReportFromLog(logText);

  assert.equal(report.status, 'FAIL');
  assert.equal(report.flow, 'smoke');
  assert.equal(report.metadata.platform, 'android');
  assert.equal(report.metadata.step, 'parse-marker-json');
  assert.equal(report.errors.length > 0, true);
  assert.match(report.errors[0], /Malformed smoke marker payload/);
});

test('collector normalizes missing-marker retrieval failure with platform and step context', async () => {
  const logText = await readFixture('android-logcat-missing-marker.log');
  const report = collectAndroidSmokeReportFromLog(logText);

  assert.equal(report.status, 'FAIL');
  assert.equal(report.flow, 'smoke');
  assert.equal(report.metadata.platform, 'android');
  assert.equal(report.metadata.step, 'find-marker');
  assert.match(report.snapshotSummary, /collector retrieval failed/);
  assert.equal(report.errors.length > 0, true);
  assert.match(report.errors[0], /LEGATO_SMOKE_REPORT/);

  const check = report.checks.find((entry) => entry.label === 'android-collector');
  assert.ok(check);
  assert.equal(check.ok, false);
});

test('failure helper keeps v1 required keys present and non-null', () => {
  const report = normalizeAndroidCollectorFailure({
    step: 'adb-logcat',
    message: 'adb command failed with exit code 1',
    collectedAt: '2026-04-22T18:00:00.000Z',
  });

  assert.deepEqual(Object.keys(report).sort(), [
    'checks',
    'errors',
    'flow',
    'metadata',
    'recentEvents',
    'schemaVersion',
    'snapshotSummary',
    'status',
  ]);
  assert.equal(report.status, 'FAIL');
  assert.equal(report.errors.length > 0, true);
  assert.equal(report.metadata.platform, 'android');
  assert.equal(report.metadata.step, 'adb-logcat');
});

test('collector tolerates additional app-level prefixes before marker in console/logcat lines', () => {
  const logText = [
    '04-25 12:00:00.000 1000 1000 I Capacitor/Console: Msg: [12:00:00] [legato-demo] setup started',
    '04-25 12:00:01.000 1000 1000 I Capacitor/Console: Msg: [12:00:01] [legato-demo] LEGATO_SMOKE_REPORT {"schemaVersion":1,"flow":"smoke","status":"PASS","checks":[],"snapshotSummary":"state=paused","recentEvents":[],"errors":[]}',
  ].join('\n');

  const report = collectAndroidSmokeReportFromLog(logText, {
    collectedAt: '2026-04-25T12:00:05.000Z',
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.flow, 'smoke');
  assert.equal(report.metadata.platform, 'android');
  assert.equal(report.metadata.collectedAt, '2026-04-25T12:00:05.000Z');
});
