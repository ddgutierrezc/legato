import * as configPlugins from 'expo/config-plugins';
import type { ConfigPlugin, InfoPlist } from 'expo/config-plugins';

const { withInfoPlist } = configPlugins;

const IOS_BACKGROUND_MODE = 'audio';

export function ensureBackgroundAudio(infoPlist: InfoPlist): InfoPlist {
  const existingModes = Array.isArray(infoPlist.UIBackgroundModes)
    ? infoPlist.UIBackgroundModes.filter((mode): mode is string => typeof mode === 'string')
    : [];

  infoPlist.UIBackgroundModes = Array.from(new Set([IOS_BACKGROUND_MODE, ...existingModes]));
  return infoPlist;
}

export const withLegatoIosBackgroundAudio: ConfigPlugin = (config) =>
  withInfoPlist(config, (mod) => {
    mod.modResults = ensureBackgroundAudio(mod.modResults);
    return mod;
  });
