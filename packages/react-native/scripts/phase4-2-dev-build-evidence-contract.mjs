#!/usr/bin/env node

const contract = {
  phase: '4.2',
  policy: {
    expoGo: 'Expo Go is not valid native evidence for this binding.',
  },
  requiredFlow: ['expo prebuild', 'expo run:ios', 'expo run:android'],
  platforms: ['ios', 'android'],
  evidence: {
    ios: {
      status: 'pending-runtime-proof',
      linkPlaceholder: 'REPLACE_WITH_IOS_EVIDENCE_LINK',
      requiredChecks: [
        'init/setup succeeds',
        'play/pause/seek smoke',
        'queue mutation returns snapshot parity',
        'event delivery observed',
        'foreground/background resync observed',
      ],
    },
    android: {
      status: 'pending-runtime-proof',
      linkPlaceholder: 'REPLACE_WITH_ANDROID_EVIDENCE_LINK',
      requiredChecks: [
        'init/setup succeeds',
        'play/pause/seek smoke',
        'queue mutation returns snapshot parity',
        'event delivery observed',
        'foreground/background resync observed',
      ],
    },
  },
};

process.stdout.write(`${JSON.stringify(contract, null, 2)}\n`);
