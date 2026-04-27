import test from 'node:test';
import assert from 'node:assert/strict';

import { validateReleaseControlContract } from './release-control-contract.mjs';

test('release control contract rejects unsupported targets before execution', () => {
  const result = validateReleaseControlContract({
    releaseId: 'R-2026.04.24.1',
    targets: 'android,desktop',
    targetModes: { android: 'publish', desktop: 'ship-it' },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unsupported target/i);
  assert.match(result.errors.join('\n'), /android\|ios\|npm/i);
});

test('release control contract rejects mode entries for non-selected targets', () => {
  const result = validateReleaseControlContract({
    releaseId: 'R-2026.04.24.1',
    targets: 'android',
    targetModes: { android: 'preflight-only', ios: 'publish' },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /mode\/target mismatch/i);
  assert.match(result.errors.join('\n'), /ios/i);
});

test('release control contract requires explicit mode per selected target', () => {
  const result = validateReleaseControlContract({
    releaseId: 'R-2026.04.24.1',
    targets: ['android', 'ios'],
    targetModes: { android: 'publish' },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing mode/i);
  assert.match(result.errors.join('\n'), /ios/i);
});

test('release control contract normalizes a valid cross-platform request with one release id', () => {
  const result = validateReleaseControlContract({
    releaseId: 'R-2026.04.24.1',
    targets: 'android,ios,npm',
    targetModes: {
      android: 'publish',
      ios: 'publish',
      npm: 'protected-publish',
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.targets, ['android', 'ios', 'npm']);
  assert.equal(result.value.release_id, 'R-2026.04.24.1');
  assert.equal(result.value.target_modes.android, 'publish');
  assert.equal(result.value.target_modes.ios, 'publish');
  assert.equal(result.value.target_modes.npm, 'protected-publish');
});

test('release control contract rejects unsupported iOS mode and reports allowed values', () => {
  const result = validateReleaseControlContract({
    releaseId: 'R-2026.04.24.2',
    targets: 'ios',
    targetModes: { ios: 'manual-handoff' },
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /unsupported mode for target ios/i);
  assert.match(result.errors.join('\n'), /allowed/i);
  assert.match(result.errors.join('\n'), /publish/i);
});

test('release control contract accepts optional lane omission without npm mode', () => {
  const result = validateReleaseControlContract({
    releaseId: 'R-2026.04.27.1',
    targets: 'ios',
    targetModes: { ios: 'publish' },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.targets, ['ios']);
  assert.equal(result.value.target_modes.ios, 'publish');
  assert.equal(result.value.target_modes.npm, undefined);
});

test('release control contract rejects explicit non-goal scope violation for platform rewrite', () => {
  const result = validateReleaseControlContract({
    releaseId: 'R-2026.04.27.8',
    targets: 'android',
    targetModes: { android: 'publish' },
    changeIntent: 'platform-rewrite for centralized release engine',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /NON_GOAL_VIOLATION/i);
  assert.equal(result.diagnostics[0].code, 'NON_GOAL_VIOLATION');
});
