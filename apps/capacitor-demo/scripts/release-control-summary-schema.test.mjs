import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeTargetSummary,
  validateReleaseNotesFactContract,
  validateTargetSummary,
} from './release-control-summary-schema.mjs';

test('summary schema normalizes required keys for target summary payloads', () => {
  const summary = normalizeTargetSummary({
    target: 'android',
    selected: true,
    terminal_status: 'published',
    stage_statuses: { publish: 'success' },
    evidence: [{ label: 'summary', path: 'android/summary.json' }],
  });

  assert.equal(summary.target, 'android');
  assert.equal(summary.selected, true);
  assert.deepEqual(summary.missing_evidence, []);
  assert.deepEqual(summary.notes, []);
});

test('summary schema validator reports missing evidence list and invalid status', () => {
  const result = validateTargetSummary({
    target: 'android',
    selected: true,
    terminal_status: 'validated',
    stage_statuses: {},
    evidence: [],
    missing_evidence: 'nope',
    notes: [],
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /terminal_status/i);
  assert.match(result.errors.join('\n'), /missing_evidence/i);
});

test('summary schema accepts v2 terminal statuses', () => {
  const valid = validateTargetSummary({
    target: 'ios',
    selected: true,
    terminal_status: 'already_published',
    stage_statuses: { publish: 'PASS' },
    evidence: [{ label: 'publish', path: 'ios/publish.json' }],
    missing_evidence: [],
    notes: [],
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.value.terminal_status, 'already_published');
});

test('summary schema validates release-note fact contract payload used by reconciliation', () => {
  const valid = validateReleaseNotesFactContract({
    release_id: 'R-2026.04.26.1',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    versions: {
      npm: {
        capacitor: { name: '@ddgutierrezc/legato-capacitor', version: '0.1.9' },
        contract: { name: '@ddgutierrezc/legato-contract', version: '0.1.5' },
      },
      android: { group: 'dev.dgutierrez', artifact: 'legato-android-core', version: '0.1.3' },
      ios: { package_name: 'LegatoCore', version: '0.1.1' },
    },
    evidence: {
      durable: [{ label: 'npm capacitor', url: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9' }],
      ephemeral: [{ label: 'summary artifact', path: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/summary.json' }],
    },
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.errors.length, 0);
});
