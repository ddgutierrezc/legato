import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));
const indexSourcePath = resolve(testDir, './index.ts');

test('contract root barrel uses explicit .js relative specifiers for Node ESM runtime output', async () => {
  const indexSource = await readFile(indexSourcePath, 'utf8');

  const runtimeExportSpecifiers = [
    './track.js',
    './state.js',
    './queue.js',
    './snapshot.js',
    './errors.js',
    './events.js',
    './capability.js',
    './invariants.js',
  ];

  for (const specifier of runtimeExportSpecifiers) {
    assert.match(indexSource, new RegExp(`from ['\"]${specifier.replace('.', '\\.')}['\"]`));
  }
});
