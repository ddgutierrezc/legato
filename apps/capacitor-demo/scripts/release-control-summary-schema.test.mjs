import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateClosureBundleEnvelope,
  validateDiagnosticEnvelope,
  validateFreshHeadCloseoutEnvelope,
  validatePreflightEnvelope,
  validateReleaseExecutionPacketEnvelope,
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

test('summary schema validates diagnostic envelope for release ops reason codes', () => {
  const valid = validateDiagnosticEnvelope({
    code: 'PATH_OR_CWD',
    scope: 'run',
    target: null,
    retryable: false,
    message: 'Unable to resolve release summary from current cwd.',
    operator_action: 'Set --repo-root or run from repository root and retry.',
    refs: ['apps/capacitor-demo/artifacts/release-control/R-2026.04.27.1/summary.json'],
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.errors.length, 0);
});

test('summary schema rejects preflight envelope with malformed diagnostics', () => {
  const invalid = validatePreflightEnvelope({
    ok: false,
    selected_targets: ['ios', 'npm'],
    missing: ['docs/releases/notes/R-2026.04.27.1.json'],
    diagnostics: [{
      code: 'NOT_A_REASON_CODE',
      scope: 'run',
      retryable: false,
      message: '',
      operator_action: '',
    }],
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /reason code/i);
  assert.match(invalid.errors.join('\n'), /diagnostics\[0\]/i);
});

test('summary schema rejects closure bundle missing required traceability fields', () => {
  const invalid = validateClosureBundleEnvelope({
    schema_version: 'release-closure-bundle/v1',
    release_id: 'R-2026.04.27.1',
    source_commit: '',
    run_url: 'https://github.com/ddgutierrezc/legato/actions/runs/999999',
    reconciliation_verdict: 'pass',
    published_artifacts: [{ target: 'npm', ref: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9' }],
    evidence_index_refs: ['docs/releases/evidence-index/R-2026.04.27.1.json'],
    generated_at: '2026-04-27T21:00:00.000Z',
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /source_commit is required/i);
});

test('summary schema validates release execution packet envelope', () => {
  const valid = validateReleaseExecutionPacketEnvelope({
    schema_version: 'release-execution-packet/v1',
    release_id: 'R-2026.04.27.1',
    phase: 'preflight',
    repo_root: '/tmp/legato',
    selected_targets: ['android', 'ios'],
    target_modes: { android: 'publish', ios: 'publish' },
    inputs: {
      narrative_ref: 'docs/releases/notes/R-2026.04.27.1.json',
      ios_derivative_ref: 'docs/releases/notes/R-2026.04.27.1-ios-derivative.md',
      changelog_anchor: 'CHANGELOG.md#r-r-202604271',
      npm_package_target: 'contract',
    },
    artifacts: {
      summary_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.27.1/summary.json',
      facts_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.27.1/release-facts.json',
      reconciliation_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.27.1/reconciliation-report.json',
      closure_bundle_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.27.1/closure-bundle.json',
    },
  });

  assert.equal(valid.ok, true);
  assert.equal(valid.errors.length, 0);
});

test('summary schema rejects malformed fresh-head closeout envelope', () => {
  const invalid = validateFreshHeadCloseoutEnvelope({
    schema_version: 'release-closeout-fresh-head/v1',
    release_id: 'R-2026.04.27.1',
    status: 'PASS',
    code: 'NOT_A_REASON',
    expected_head: 'abc',
    current_head: '',
    recovery: [],
  });

  assert.equal(invalid.ok, false);
  assert.match(invalid.errors.join('\n'), /reason code/i);
  assert.match(invalid.errors.join('\n'), /current_head is required/i);
});
