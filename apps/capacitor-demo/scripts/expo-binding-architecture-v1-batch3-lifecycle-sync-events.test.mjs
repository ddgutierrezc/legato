import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const packageRoot = resolve(repoRoot, 'packages/react-native');

test('batch-3.3 react-native binding exports contract-aligned event helpers', async () => {
  const indexSource = await readFile(resolve(packageRoot, 'src/index.ts'), 'utf8');
  const eventsSource = await readFile(resolve(packageRoot, 'src/events.ts'), 'utf8');

  assert.match(indexSource, /LEGATO_EVENTS/);
  assert.match(indexSource, /addLegatoListener/);
  assert.match(eventsSource, /export const LEGATO_EVENTS = LEGATO_EVENT_NAMES/);
  assert.match(eventsSource, /export function addLegatoListener/);
});

test('batch-3.3 react-native binding includes lifecycle sync controller with resync hooks', async () => {
  const indexSource = await readFile(resolve(packageRoot, 'src/index.ts'), 'utf8');
  const syncSource = await readFile(resolve(packageRoot, 'src/sync.ts'), 'utf8');

  assert.match(indexSource, /createLegatoSync/);
  assert.match(syncSource, /start\(\): Promise<PlaybackSnapshot>/);
  assert.match(syncSource, /resync\(\): Promise<PlaybackSnapshot>/);
  assert.match(syncSource, /getCurrent\(\): PlaybackSnapshot \| null/);
  assert.match(syncSource, /stop\(\): Promise<void>/);
  assert.match(syncSource, /LEGATO_EVENTS\.map/);
  assert.match(syncSource, /await this\.resync\(\)/);
});
