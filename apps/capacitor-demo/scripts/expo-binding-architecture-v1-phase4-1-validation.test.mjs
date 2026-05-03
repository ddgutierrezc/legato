import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const packageRoot = resolve(repoRoot, 'packages/react-native');

test('phase-4.1 defines prebuild + dev-build parity validation evidence scaffold', async () => {
  const scriptSource = await readFile(
    resolve(packageRoot, 'scripts/phase4-1-dev-build-parity-evidence.mjs'),
    'utf8',
  );
  const checklistSource = await readFile(
    resolve(packageRoot, 'docs/milestone-1-readiness-checklist.md'),
    'utf8',
  );

  assert.match(scriptSource, /expo prebuild/);
  assert.match(scriptSource, /expo run:ios/);
  assert.match(scriptSource, /expo run:android/);
  assert.match(scriptSource, /Expo Go.*not valid/i);

  assert.match(checklistSource, /Phase 4\.1 parity evidence is missing/i);
  assert.match(checklistSource, /iOS and Android dev-build runs are both required/i);
});

test('phase-4.1 evidence scaffold includes event delivery and foreground\/background resync checks', async () => {
  const scriptSource = await readFile(
    resolve(packageRoot, 'scripts/phase4-1-dev-build-parity-evidence.mjs'),
    'utf8',
  );

  assert.match(scriptSource, /event delivery/i);
  assert.match(scriptSource, /foreground\/background resync/i);
  assert.match(scriptSource, /ios/i);
  assert.match(scriptSource, /android/i);
});
