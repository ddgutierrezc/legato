import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const boundaryDocPath = resolve(
  repoRoot,
  'docs/architecture/expo-binding-architecture-v1-boundary-hardening.md',
);

test('expo binding batch-1 boundary hardening doc defines checklist, support matrix, non-goals gate, and naming conventions', async () => {
  const boundaryDoc = await readFile(boundaryDocPath, 'utf8');

  assert.match(boundaryDoc, /Boundary Checklist/i);
  assert.match(boundaryDoc, /packages\/contract\/src\/binding-adapter\.ts/i);
  assert.match(boundaryDoc, /Expo-specific leakage/i);

  assert.match(boundaryDoc, /Milestone-1 Host Support Matrix/i);
  assert.match(boundaryDoc, /supported/i);
  assert.match(boundaryDoc, /unsupported/i);
  assert.match(boundaryDoc, /conditional/i);
  assert.match(boundaryDoc, /Expo Go/i);
  assert.match(boundaryDoc, /development build/i);
  assert.match(boundaryDoc, /prebuild/i);
  assert.match(boundaryDoc, /New Architecture/i);

  assert.match(boundaryDoc, /Non-Goals Gate/i);
  assert.match(boundaryDoc, /no TurboModule-first requirement/i);
  assert.match(boundaryDoc, /no broad non-Expo React Native support claims/i);
  assert.match(boundaryDoc, /no host implementation promises/i);

  assert.match(boundaryDoc, /Baseline Naming and Package Conventions/i);
  assert.match(boundaryDoc, /packages\/react-native/i);
  assert.match(boundaryDoc, /canonical event names/i);
  assert.match(boundaryDoc, /capability flags/i);
});
