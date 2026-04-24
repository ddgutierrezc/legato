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
    targetModes: { android: 'preflight-only', ios: 'full-manual-lane' },
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
      ios: 'full-manual-lane',
      npm: 'readiness',
    },
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.value.targets, ['android', 'ios', 'npm']);
  assert.equal(result.value.release_id, 'R-2026.04.24.1');
  assert.equal(result.value.target_modes.android, 'publish');
  assert.equal(result.value.target_modes.ios, 'full-manual-lane');
  assert.equal(result.value.target_modes.npm, 'readiness');
});
