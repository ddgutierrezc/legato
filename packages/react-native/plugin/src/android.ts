import * as configPlugins from 'expo/config-plugins';
import type { AndroidConfig as ExpoAndroidConfig, ConfigPlugin } from 'expo/config-plugins';

const { AndroidConfig, withAndroidManifest } = configPlugins;

const REQUIRED_PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
  'android.permission.WAKE_LOCK',
];

const SERVICE_CLASS = 'expo.modules.legato.LegatoPlaybackService';

type AndroidManifest = ExpoAndroidConfig.Manifest.AndroidManifest;

function ensurePermission(manifest: AndroidManifest, permission: string): void {
  const permissions = manifest.manifest['uses-permission'] ?? [];
  const exists = permissions.some((entry) => entry.$['android:name'] === permission);
  if (!exists) {
    permissions.push({ $: { 'android:name': permission } });
  }
  manifest.manifest['uses-permission'] = permissions;
}

function ensureServiceTarget(manifest: AndroidManifest): void {
  const applications = manifest.manifest.application ?? [];
  if (applications.length === 0) {
    applications.push({ $: { 'android:name': '.MainApplication' } });
  }
  manifest.manifest.application = applications;

  const mainApp = applications[0];
  const services = mainApp.service ?? [];
  const unrelatedServices = services.filter((entry) => entry.$['android:name'] !== SERVICE_CLASS);

  mainApp.service = [
    ...unrelatedServices,
    {
      $: {
        'android:name': SERVICE_CLASS,
        'android:enabled': 'true',
        'android:exported': 'false',
        'android:foregroundServiceType': 'mediaPlayback',
      },
    },
  ];
}

export function ensureLegatoAndroidManifest(manifest: AndroidManifest): AndroidManifest {
  for (const permission of REQUIRED_PERMISSIONS) {
    ensurePermission(manifest, permission);
  }
  ensureServiceTarget(manifest);
  return manifest;
}

export const withLegatoAndroidManifest: ConfigPlugin = (config) =>
  withAndroidManifest(config, (mod) => {
    mod.modResults = ensureLegatoAndroidManifest(mod.modResults);
    return mod;
  });
