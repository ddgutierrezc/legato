import test from 'node:test';
import assert from 'node:assert/strict';

import { adaptAndroidReleaseSummary } from './release-control-android-adapter.mjs';

const base = {
  release_id: 'R-2026.04.24.1',
  target: 'android',
  mode: 'publish',
  stages: {
    validate_dispatch: 'success',
    android_preflight: 'success',
    android_publish: 'success',
    android_verify: 'success',
  },
};

test('android adapter maps successful publish lane to published terminal status', () => {
  const summary = adaptAndroidReleaseSummary({
    selected: true,
    releaseSummary: base,
    evidenceRoot: 'artifacts/release-ci',
  });

  assert.equal(summary.target, 'android');
  assert.equal(summary.selected, true);
  assert.equal(summary.terminal_status, 'published');
  assert.equal(summary.stage_statuses.publish, 'success');
  assert.equal(summary.missing_evidence.length, 0);
  assert.ok(summary.evidence.some((entry) => entry.path.endsWith('preflight.log')));
  assert.ok(summary.evidence.some((entry) => entry.path.endsWith('publish.log')));
  assert.ok(summary.evidence.some((entry) => entry.path.endsWith('verify.log')));
});

test('android adapter maps preflight-only mode to blocked and publish skipped', () => {
  const summary = adaptAndroidReleaseSummary({
    selected: true,
    releaseSummary: {
      ...base,
      mode: 'preflight-only',
      stages: {
        ...base.stages,
        android_publish: 'skipped',
      },
    },
    evidenceRoot: 'artifacts/release-ci',
  });

  assert.equal(summary.terminal_status, 'blocked');
  assert.equal(summary.stage_statuses.publish, 'skipped');
});

test('android adapter maps verify failure to failed terminal status', () => {
  const summary = adaptAndroidReleaseSummary({
    selected: true,
    releaseSummary: {
      ...base,
      stages: {
        ...base.stages,
        android_verify: 'failure',
      },
    },
    evidenceRoot: 'artifacts/release-ci',
  });

  assert.equal(summary.terminal_status, 'failed');
  assert.match(summary.notes.join('\n'), /did not reach/i);
});

test('android adapter marks lane as not_selected when target was skipped upstream', () => {
  const summary = adaptAndroidReleaseSummary({
    selected: false,
    releaseSummary: null,
    evidenceRoot: 'artifacts/release-ci',
  });

  assert.equal(summary.target, 'android');
  assert.equal(summary.selected, false);
  assert.equal(summary.terminal_status, 'not_selected');
  assert.equal(summary.evidence.length, 0);
});
