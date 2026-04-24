import test from 'node:test';
import assert from 'node:assert/strict';

import { aggregateReleaseSummary } from './aggregate-release-summary.mjs';

test('aggregate release summary preserves mixed truthful platform outcomes', () => {
  const result = aggregateReleaseSummary({
    release_id: 'R-2026.04.24.1',
    selected_targets: ['android', 'ios'],
    requested_modes: {
      android: 'publish',
      ios: 'full-manual-lane',
      npm: 'protected-publish',
    },
    target_summaries: {
      android: {
        target: 'android',
        selected: true,
        terminal_status: 'published',
        stage_statuses: { publish: 'success' },
        evidence: [{ label: 'summary', path: 'android/summary.json' }],
        missing_evidence: [],
        notes: [],
      },
      ios: {
        target: 'ios',
        selected: true,
        terminal_status: 'blocked',
        stage_statuses: { publish: 'blocked' },
        evidence: [{ label: 'publish', path: 'ios/publish.json' }],
        missing_evidence: [],
        notes: ['missing GitHub App token'],
      },
      npm: {
        target: 'npm',
        selected: false,
        terminal_status: 'not_selected',
        stage_statuses: {},
        evidence: [],
        missing_evidence: [],
        notes: [],
      },
    },
  });

  assert.equal(result.release_id, 'R-2026.04.24.1');
  assert.equal(result.targets.android.terminal_status, 'published');
  assert.equal(result.targets.ios.terminal_status, 'blocked');
  assert.equal(result.targets.npm.terminal_status, 'not_selected');
  assert.equal(result.overall_status, 'partial_success');
});

test('aggregate summary marks target incomplete when evidence is missing', () => {
  const result = aggregateReleaseSummary({
    release_id: 'R-2026.04.24.1',
    selected_targets: ['ios'],
    requested_modes: { ios: 'publish' },
    target_summaries: {
      ios: {
        target: 'ios',
        selected: true,
        terminal_status: 'published',
        stage_statuses: { publish: 'success' },
        evidence: [],
        missing_evidence: ['verify.json'],
        notes: [],
      },
    },
  });

  assert.equal(result.targets.ios.terminal_status, 'incomplete');
  assert.match(result.targets.ios.notes.join('\n'), /missing evidence/i);
});

test('aggregate summary marks overall failed when every selected lane fails', () => {
  const result = aggregateReleaseSummary({
    release_id: 'R-2026.04.24.2',
    selected_targets: ['android', 'ios'],
    requested_modes: { android: 'publish', ios: 'publish' },
    target_summaries: {
      android: {
        target: 'android',
        selected: true,
        terminal_status: 'failed',
        stage_statuses: {},
        evidence: [{ label: 'summary', path: 'android/summary.json' }],
        missing_evidence: [],
        notes: ['publish rejected'],
      },
      ios: {
        target: 'ios',
        selected: true,
        terminal_status: 'failed',
        stage_statuses: {},
        evidence: [{ label: 'summary', path: 'ios/summary.json' }],
        missing_evidence: [],
        notes: ['tag mismatch'],
      },
    },
  });

  assert.equal(result.overall_status, 'failed');
});
