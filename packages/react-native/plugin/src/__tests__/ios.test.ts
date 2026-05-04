import assert from 'node:assert/strict';

import { ensureBackgroundAudio } from '../ios.ts';

test('ensureBackgroundAudio adds UIBackgroundModes audio once', () => {
  const plist: Record<string, unknown> = {
    CFBundleDisplayName: 'Legato Demo',
  };

  const result = ensureBackgroundAudio(plist);

  assert.deepEqual(result.UIBackgroundModes, ['audio']);
  assert.equal(result.CFBundleDisplayName, 'Legato Demo');
});

test('ensureBackgroundAudio is idempotent and preserves unrelated keys', () => {
  const plist: Record<string, unknown> = {
    UIBackgroundModes: ['audio', 'fetch', 'audio'],
    NSCameraUsageDescription: 'Needed for camera',
  };

  const result = ensureBackgroundAudio(plist);

  assert.deepEqual(result.UIBackgroundModes, ['audio', 'fetch']);
  assert.equal(result.NSCameraUsageDescription, 'Needed for camera');
});
