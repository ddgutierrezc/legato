import test from 'node:test';
import assert from 'node:assert/strict';

import {
  LEGATO_SMOKE_REPORT_MARKER,
  buildAutomationSnapshot,
  buildSmokeMarkerLine,
  deriveAutomationStatus,
} from './smoke-automation.js';

test('buildSmokeMarkerLine prefixes a valid JSON report with marker', () => {
  const line = buildSmokeMarkerLine({
    schemaVersion: 1,
    flow: 'smoke',
    status: 'PASS',
    checks: [],
    snapshotSummary: 'state=paused',
    recentEvents: ['setup complete'],
    errors: [],
  });

  assert.equal(line.startsWith(`${LEGATO_SMOKE_REPORT_MARKER} `), true);

  const payload = JSON.parse(line.slice(LEGATO_SMOKE_REPORT_MARKER.length + 1));
  assert.equal(payload.schemaVersion, 1);
  assert.equal(payload.flow, 'smoke');
});

test('deriveAutomationStatus maps report status to automation-visible labels', () => {
  assert.equal(deriveAutomationStatus(null), 'idle');
  assert.equal(deriveAutomationStatus({ status: 'PASS' }), 'pass');
  assert.equal(deriveAutomationStatus({ status: 'FAIL' }), 'fail');
});

test('buildAutomationSnapshot keeps recent-events and snapshot summary copy-friendly', () => {
  const snapshot = buildAutomationSnapshot({
    report: {
      status: 'FAIL',
      snapshotSummary: 'state=paused | track=Demo Track 1',
      recentEvents: ['[12:00:00] setup finished', '[12:00:01] play finished'],
      errors: ['native playback failed'],
    },
    fallbackSnapshotSummary: 'No snapshot captured yet.',
    fallbackRecentEvents: ['[11:59:59] smoke started'],
  });

  assert.match(snapshot, /status=FAIL/);
  assert.match(snapshot, /snapshot=state=paused/);
  assert.match(snapshot, /recentEvents=\[12:00:00\] setup finished \| \[12:00:01\] play finished/);
  assert.match(snapshot, /errors=native playback failed/);
});
