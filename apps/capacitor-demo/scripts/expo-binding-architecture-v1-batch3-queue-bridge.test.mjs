import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const packageRoot = resolve(repoRoot, 'packages/react-native');

test('batch-3.2 wrapper adds queue mutation/query methods with snapshot parity', async () => {
  const wrapperSource = await readFile(resolve(packageRoot, 'src/legato-wrapper.ts'), 'utf8');

  assert.match(wrapperSource, /async skipTo\(options\)/);
  assert.match(wrapperSource, /return unwrapSnapshotResult\(await LegatoModule\.skipTo\(options\)\)/);
  assert.match(wrapperSource, /async getQueue\(\)/);
  assert.match(wrapperSource, /return await LegatoModule\.getQueue\(\)/);
});

test('batch-3.2 module and mocks expose queue bridge primitives', async () => {
  const moduleSource = await readFile(resolve(packageRoot, 'src/LegatoModule.ts'), 'utf8');
  const mocksSource = await readFile(resolve(packageRoot, 'mocks/LegatoModule.ts'), 'utf8');

  assert.match(moduleSource, /skipTo\(options: \{ index: number \}\): Promise<LegatoSnapshotResult>/);
  assert.match(moduleSource, /getQueue\(\): Promise<QueueSnapshot>/);
  assert.match(mocksSource, /skipTo: jest\.fn\(/);
  assert.match(mocksSource, /getQueue: jest\.fn\(/);
});
