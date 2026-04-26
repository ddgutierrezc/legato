import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildSmokeReportV1,
  createInitialSmokeVerdict,
  reduceSmokeVerdict,
  summarizeSmokeVerdict,
} from './smoke-verdict.js';

const snapshot = {
  state: 'paused',
  currentTrack: { title: 'Demo Track 1' },
  position: 1425,
  duration: 3000,
};

test('start action marks verdict as RUNNING and stores flow', () => {
  const initial = createInitialSmokeVerdict();
  const next = reduceSmokeVerdict(initial, { type: 'start', flow: 'smoke' });

  assert.equal(next.status, 'RUNNING');
  assert.equal(next.flow, 'smoke');
  assert.equal(next.errorSummary, null);
  assert.deepEqual(initial.checks, []);
});

test('snapshot + complete marks smoke flow PASS when checks hold', () => {
  const started = reduceSmokeVerdict(createInitialSmokeVerdict(), { type: 'start', flow: 'smoke' });
  const withSnapshot = reduceSmokeVerdict(started, { type: 'snapshot', snapshot });
  const completed = reduceSmokeVerdict(withSnapshot, { type: 'complete' });

  assert.equal(completed.status, 'PASS');
  assert.match(completed.snapshotSummary, /state=paused/);
  assert.match(completed.snapshotSummary, /track=Demo Track 1/);
  assert.match(completed.snapshotSummary, /position=1425/);
  assert.match(completed.snapshotSummary, /duration=3000/);
});

test('error action finalizes verdict as FAIL and preserves reason', () => {
  const started = reduceSmokeVerdict(createInitialSmokeVerdict(), { type: 'start', flow: 'boundary' });
  const withError = reduceSmokeVerdict(started, { type: 'error', message: 'native playback failed' });

  assert.equal(withError.status, 'FAIL');
  assert.equal(withError.errorSummary, 'native playback failed');
});

test('boundary flow fails when final snapshot state is not ended', () => {
  const started = reduceSmokeVerdict(createInitialSmokeVerdict(), { type: 'start', flow: 'boundary' });
  const withSnapshot = reduceSmokeVerdict(started, {
    type: 'snapshot',
    snapshot: { ...snapshot, state: 'paused' },
  });
  const completed = reduceSmokeVerdict(withSnapshot, { type: 'complete' });

  assert.equal(completed.status, 'FAIL');
  assert.ok(completed.checks.some((check) => check.label.includes('ended')));
});

test('summarize helper returns readable multi-line output', () => {
  const started = reduceSmokeVerdict(createInitialSmokeVerdict(), { type: 'start', flow: 'let-end' });
  const withSnapshot = reduceSmokeVerdict(started, {
    type: 'snapshot',
    snapshot: { ...snapshot, state: 'playing' },
  });
  const summary = summarizeSmokeVerdict(withSnapshot);

  assert.match(summary, /flow=let-end/);
  assert.match(summary, /state=playing/);
  assert.match(summary, /track=Demo Track 1/);
});

test('complete without snapshot does not report PASS', () => {
  const started = reduceSmokeVerdict(createInitialSmokeVerdict(), { type: 'start', flow: 'smoke' });
  const completed = reduceSmokeVerdict(started, { type: 'complete' });

  assert.equal(completed.status, 'FAIL');
  assert.match(summarizeSmokeVerdict(completed), /Awaiting snapshot/);
});

test('buildSmokeReportV1 includes explicit ios runtime integrity checks payload', () => {
  const started = reduceSmokeVerdict(createInitialSmokeVerdict(), { type: 'start', flow: 'smoke' });
  const withSnapshot = reduceSmokeVerdict(started, { type: 'snapshot', snapshot });
  const completed = reduceSmokeVerdict(withSnapshot, { type: 'complete' });

  const report = buildSmokeReportV1({
    verdict: completed,
    recentEvents: [
      'setup finished',
      'add finished',
      'play finished',
      'pause finished',
    ],
    runtimeIntegrity: {
      transportCommandsObserved: true,
      progressAdvancedWhilePlaying: true,
      trackEndTransitionObserved: false,
      snapshotProjectionCoherent: true,
      details: {
        transport: 'setup/add/play/pause observed',
        progress: 'progress moved by +900ms',
        trackEnd: 'not covered in smoke flow',
        snapshot: 'snapshot state/index/track coherence holds',
      },
    },
  });

  assert.equal(report.status, 'PASS');
  assert.equal(report.runtimeIntegrity.transportCommandsObserved, true);
  assert.equal(report.runtimeIntegrity.progressAdvancedWhilePlaying, true);
  assert.equal(report.runtimeIntegrity.trackEndTransitionObserved, false);
  assert.equal(report.runtimeIntegrity.snapshotProjectionCoherent, true);
});
