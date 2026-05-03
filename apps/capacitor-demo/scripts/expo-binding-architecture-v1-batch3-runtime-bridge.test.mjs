import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const packageRoot = resolve(repoRoot, 'packages/react-native');

test('batch-3 wrapper maps first runtime transport and snapshot/state methods', async () => {
  const wrapperSource = await readFile(resolve(packageRoot, 'src/legato-wrapper.ts'), 'utf8');

  assert.match(wrapperSource, /async play\(\)/);
  assert.match(wrapperSource, /async pause\(\)/);
  assert.match(wrapperSource, /async stop\(\)/);
  assert.match(wrapperSource, /async getState\(\)/);
  assert.match(wrapperSource, /async getSnapshot\(\)/);
  assert.match(wrapperSource, /unwrapStateResult/);
  assert.match(wrapperSource, /unwrapSnapshotResult/);
});

test('batch-3 bridge exposes listener subscription primitives on wrapper and module type', async () => {
  const wrapperSource = await readFile(resolve(packageRoot, 'src/legato-wrapper.ts'), 'utf8');
  const moduleSource = await readFile(resolve(packageRoot, 'src/LegatoModule.ts'), 'utf8');

  assert.match(wrapperSource, /async addListener<.*LegatoEventName/s);
  assert.match(wrapperSource, /removeAllListeners\(\)/);
  assert.match(moduleSource, /play\(\): Promise<void>/);
  assert.match(moduleSource, /pause\(\): Promise<void>/);
  assert.match(moduleSource, /stop\(\): Promise<void>/);
  assert.match(moduleSource, /getState\(\): Promise<LegatoStateResult>/);
  assert.match(moduleSource, /getSnapshot\(\): Promise<LegatoSnapshotResult>/);
});
