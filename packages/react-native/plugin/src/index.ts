import configPlugins from 'expo/config-plugins.js';
import type { ConfigPlugin } from 'expo/config-plugins';

import { withLegatoAndroidManifest } from './android';
import { withLegatoIosBackgroundAudio } from './ios';

const { createRunOncePlugin } = configPlugins;

export type LegatoExpoConfigPluginOptions = Record<string, never>;

const withLegatoExpoConfig: ConfigPlugin<LegatoExpoConfigPluginOptions> = (config) => {
  config = withLegatoIosBackgroundAudio(config);
  config = withLegatoAndroidManifest(config);
  return config;
};

const pkg = require('../../package.json');

export default createRunOncePlugin(withLegatoExpoConfig, pkg.name, pkg.version);
