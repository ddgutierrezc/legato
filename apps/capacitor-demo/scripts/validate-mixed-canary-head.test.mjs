import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateMixedCanaryHeadEvidence,
  formatMixedCanaryHeadValidation,
} from './validate-mixed-canary-head.mjs';

const validEvidence = `
# Closure Evidence — canary-mixed-app-004

- Run URL: https://github.com/ddgutierrezc/legato/actions/runs/24916182181
- Summary artifact: release-control-summary-canary-mixed-app-004
- Source commit: \`333cbd4a485065fce77074b984197e42382a9ded\`

## Reconciliation Notes

- Targets in run: \`android,ios,npm\` (mixed canary)
`;

test('freshness validator passes when source_commit matches latest HEAD and run is mixed', () => {
  const result = validateMixedCanaryHeadEvidence({
    evidenceMarkdown: validEvidence,
    expectedHead: '333cbd4a485065fce77074b984197e42382a9ded',
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
});

test('freshness validator fails closed when source_commit is stale against latest HEAD', () => {
  const result = validateMixedCanaryHeadEvidence({
    evidenceMarkdown: validEvidence,
    expectedHead: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /latest HEAD/i);
  assert.match(result.failures.join('\n'), /source_commit/i);
});

test('freshness validator fails when evidence is not mixed android,ios,npm', () => {
  const result = validateMixedCanaryHeadEvidence({
    evidenceMarkdown: validEvidence.replace('android,ios,npm', 'ios'),
    expectedHead: '333cbd4a485065fce77074b984197e42382a9ded',
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /mixed canary/i);
  assert.match(result.failures.join('\n'), /android,ios,npm/i);
});

test('freshness validator formatter emits deterministic summary sections', () => {
  const result = validateMixedCanaryHeadEvidence({
    evidenceMarkdown: validEvidence.replace('Source commit', 'Commit source'),
    expectedHead: '333cbd4a485065fce77074b984197e42382a9ded',
  });

  const summary = formatMixedCanaryHeadValidation(result);
  assert.match(summary, /Overall: FAIL/i);
  assert.match(summary, /fresh_head_evidence: FAIL/i);
  assert.match(summary, /Failures:/i);
});
