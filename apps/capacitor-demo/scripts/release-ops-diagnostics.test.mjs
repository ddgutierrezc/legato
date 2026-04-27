import test from 'node:test';
import assert from 'node:assert/strict';

import {
  RELEASE_OPS_REASON_CODES,
  normalizeReleaseDiagnostic,
  renderOperatorAction,
} from './release-ops-diagnostics.mjs';

test('release ops diagnostics exports canonical reason-code taxonomy', () => {
  assert.deepEqual(RELEASE_OPS_REASON_CODES, [
    'PATH_OR_CWD',
    'SERIALIZATION_ERROR',
    'PACKAGE_TARGET_SCOPE',
    'MISSING_NARRATIVE_OR_DERIVATIVE_NOTES',
    'UNKNOWN',
  ]);
});

test('release ops diagnostics normalizes unknown reason codes to UNKNOWN', () => {
  const diagnostic = normalizeReleaseDiagnostic({
    code: 'NOT_REAL',
    scope: 'lane',
    target: 'npm',
    retryable: true,
    message: 'raw error',
    refs: ['apps/capacitor-demo/artifacts/release-control/R-2026.04.27.1/summary.json'],
  });

  assert.equal(diagnostic.code, 'UNKNOWN');
  assert.equal(diagnostic.scope, 'lane');
  assert.equal(diagnostic.target, 'npm');
  assert.equal(typeof diagnostic.operator_action, 'string');
  assert.ok(diagnostic.operator_action.length > 0);
});

test('release ops diagnostics renders operator guidance for missing narrative reason code', () => {
  const action = renderOperatorAction('MISSING_NARRATIVE_OR_DERIVATIVE_NOTES', { releaseId: 'R-2026.04.27.1' });
  assert.match(action, /docs\/releases\/notes\/R-2026\.04\.27\.1\.json/i);
  assert.match(action, /ios-derivative/i);
});
