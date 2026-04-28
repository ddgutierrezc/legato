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
  assert.equal(result.value.packet.schema_version, 'release-execution-packet/v2');
  assert.equal(result.value.packet.phase, 'preflight');
  assert.equal(result.value.packet.release_id, 'R-2026.04.24.1');
  assert.equal(result.value.packet.release_identity.release_key, 'stable/v0.1.1/capacitor');
  assert.deepEqual(result.value.packet.selected_targets, ['android', 'ios', 'npm']);
  assert.equal(result.value.packet.inputs.canonical_refs.narrative_ref, 'docs/releases/notes/stable-v0.1.1-capacitor.json');
  assert.equal(result.value.packet.inputs.compatibility_refs.narrative_ref, 'docs/releases/notes/R-2026.04.24.1.json');
});

test('release control contract keeps release identity stable across reruns while release id changes', () => {
  const first = validateReleaseControlContract({
    releaseId: 'R-2026.04.24.1',
    targets: 'ios',
    targetModes: { ios: 'publish' },
  });
  const second = validateReleaseControlContract({
    releaseId: 'R-2026.04.24.2',
    targets: 'ios',
    targetModes: { ios: 'publish' },
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.value.packet.release_identity.release_key, second.value.packet.release_identity.release_key);
  assert.notEqual(first.value.packet.release_id, second.value.packet.release_id);
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

test('release control contract fails closed with IDENTITY_AMBIGUOUS when explicit release key conflicts', () => {
  const result = validateReleaseControlContract({
    releaseId: 'R-2026.04.28.22',
    targets: 'android',
    targetModes: { android: 'publish' },
    releaseKey: 'stable/v9.9.9/contract',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /IDENTITY_AMBIGUOUS/i);
  assert.equal(result.diagnostics.some((entry) => entry.code === 'IDENTITY_AMBIGUOUS'), true);
});
