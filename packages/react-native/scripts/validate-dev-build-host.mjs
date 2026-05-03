#!/usr/bin/env node

const requiredCommands = ['expo prebuild', 'expo run:ios', 'expo run:android'];

const checklist = {
  policy: 'Expo Go is explicitly unsupported for native validation evidence.',
  requiredCommands,
  requiredSmokeFlows: [
    'module init/setup',
    'play/pause/seek smoke',
    'queue snapshot parity for one mutating call',
    'foreground/background event resync',
  ],
};

process.stdout.write(`${JSON.stringify(checklist, null, 2)}\n`);
