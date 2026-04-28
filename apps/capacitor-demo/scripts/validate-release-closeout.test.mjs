import test from 'node:test';
import assert from 'node:assert/strict';

import { validateReleaseCloseout } from './validate-release-closeout.mjs';

const baseClosureBundle = {
  schema_version: 'release-closure-bundle/v1',
  release_id: 'R-2026.04.28.1',
  source_commit: '0123456789abcdef0123456789abcdef01234567',
  run_url: 'https://github.com/ddgutierrezc/legato/actions/runs/123',
  reconciliation_verdict: 'pass',
  published_artifacts: [{ target: 'android', ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.28.1/android-summary.json' }],
  publish_refs: ['apps/capacitor-demo/artifacts/release-control/R-2026.04.28.1/android-summary.json'],
  evidence_index_refs: ['docs/releases/evidence-index/R-2026.04.28.1.json'],
  packet_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.28.1/release-execution-packet.json',
  reconciliation_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.28.1/reconciliation-report.json',
  expected_head: '0123456789abcdef0123456789abcdef01234567',
  generated_at: '2026-04-28T00:00:00.000Z',
};

const basePacket = {
  schema_version: 'release-execution-packet/v2',
  release_id: 'R-2026.04.28.1',
  release_identity: { channel: 'stable', version: '0.1.1', package_target: 'contract', release_key: 'stable/v0.1.1/contract' },
  phase: 'closeout',
  repo_root: '/tmp/legato',
  selected_targets: ['android'],
  target_modes: { android: 'publish' },
  inputs: {
    canonical_refs: {
      narrative_ref: 'docs/releases/notes/stable-v0.1.1-contract.json',
      ios_derivative_ref: 'docs/releases/notes/stable-v0.1.1-contract-ios-derivative.md',
      changelog_anchor: 'CHANGELOG.md#release-stable-v0.1.1-contract',
    },
    compatibility_refs: {
      narrative_ref: 'docs/releases/notes/R-2026.04.28.1.json',
      ios_derivative_ref: 'docs/releases/notes/R-2026.04.28.1-ios-derivative.md',
      changelog_anchor: 'CHANGELOG.md#r-r-202604281',
    },
    npm_package_target: 'contract',
  },
  artifacts: {
    summary_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.28.1/summary.json',
    facts_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.28.1/release-facts.json',
    reconciliation_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.28.1/reconciliation-report.json',
    closure_bundle_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.28.1/closure-bundle.json',
  },
};

test('release closeout validator passes with fresh fast-forward head and reconciliation pass', () => {
  const result = validateReleaseCloseout({
    releaseId: 'R-2026.04.28.1',
    closureBundle: {
      ...baseClosureBundle,
    },
    packet: {
      ...basePacket,
    },
    expectedHead: '0123456789abcdef0123456789abcdef01234567',
    currentHead: '0123456789abcdef0123456789abcdef01234567',
    isFastForward: true,
  });

  assert.equal(result.ok, true);
  assert.equal(result.code, null);
});

test('release closeout validator rejects stale head with canonical reason code', () => {
  const result = validateReleaseCloseout({
    releaseId: 'R-2026.04.28.1',
    closureBundle: {
      ...baseClosureBundle,
      expected_head: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    },
    packet: {
      ...basePacket,
    },
    expectedHead: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    currentHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    isFastForward: true,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'STALE_HEAD');
  assert.match(result.recovery.join('\n'), /fetch/i);
});

test('release closeout validator rejects non-fast-forward head with canonical reason code', () => {
  const result = validateReleaseCloseout({
    releaseId: 'R-2026.04.28.1',
    closureBundle: {
      ...baseClosureBundle,
    },
    packet: {
      ...basePacket,
    },
    expectedHead: '0123456789abcdef0123456789abcdef01234567',
    currentHead: '0123456789abcdef0123456789abcdef01234567',
    isFastForward: false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.code, 'NON_FAST_FORWARD_HEAD');
});
