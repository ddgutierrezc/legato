import assert from 'node:assert/strict';

import { ensureLegatoAndroidManifest } from '../android.ts';

test('ensureLegatoAndroidManifest injects required permissions and service', () => {
  const manifest = {
    manifest: {
      application: [
        {
          activity: [{ $: { 'android:name': '.MainActivity' } }],
        },
      ],
    },
  };

  const result = ensureLegatoAndroidManifest(manifest as any);
  const permissions = result.manifest['uses-permission'].map((entry: any) => entry.$['android:name']);
  const service = result.manifest.application[0].service[0].$;

  assert.deepEqual(permissions, [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.WAKE_LOCK',
  ]);
  assert.equal(service['android:name'], 'expo.modules.legato.LegatoPlaybackService');
  assert.equal(service['android:foregroundServiceType'], 'mediaPlayback');
  assert.equal(service['android:exported'], 'false');
});

test('ensureLegatoAndroidManifest keeps one valid service declaration for target class', () => {
  const manifest = {
    manifest: {
      'uses-permission': [{ $: { 'android:name': 'android.permission.WAKE_LOCK' } }],
      application: [
        {
          service: [
            {
              $: {
                'android:name': 'expo.modules.legato.LegatoPlaybackService',
                'android:exported': 'true',
              },
            },
            {
              $: {
                'android:name': 'expo.modules.legato.LegatoPlaybackService',
                'android:foregroundServiceType': 'dataSync',
              },
            },
            { $: { 'android:name': 'com.example.OtherService' } },
          ],
        },
      ],
    },
  };

  const result = ensureLegatoAndroidManifest(manifest as any);
  const services = result.manifest.application[0].service;
  const legatoServices = services.filter((entry: any) => entry.$['android:name'] === 'expo.modules.legato.LegatoPlaybackService');
  const permissions = result.manifest['uses-permission'].map((entry: any) => entry.$['android:name']);

  assert.equal(legatoServices.length, 1);
  assert.equal(legatoServices[0].$['android:exported'], 'false');
  assert.equal(legatoServices[0].$['android:foregroundServiceType'], 'mediaPlayback');
  assert.ok(services.some((entry: any) => entry.$['android:name'] === 'com.example.OtherService'));
  assert.deepEqual(permissions, [
    'android.permission.WAKE_LOCK',
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  ]);
});
