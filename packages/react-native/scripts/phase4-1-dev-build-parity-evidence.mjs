#!/usr/bin/env node

const evidence = {
  phase: '4.1',
  policy: {
    expoGo: 'Expo Go is not valid native evidence for this binding.',
  },
  requiredFlow: ['expo prebuild', 'expo run:ios', 'expo run:android'],
  parityChecks: {
    ios: [
      'init/setup succeeds',
      'play/pause/seek smoke',
      'queue mutation returns snapshot parity',
      'event delivery observed',
      'foreground/background resync observed',
    ],
    android: [
      'init/setup succeeds',
      'play/pause/seek smoke',
      'queue mutation returns snapshot parity',
      'event delivery observed',
      'foreground/background resync observed',
    ],
  },
};

process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
