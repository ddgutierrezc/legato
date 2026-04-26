import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import { inspectWorkflowInventory } from '../inspect.mjs';

const repoRoot = resolve(import.meta.dirname, '../../..');

test('release workflows remain untouched by OSS setup tooling run', async () => {
  const before = await inspectWorkflowInventory({ repoRoot });

  const expected = [
    '.github/workflows/release-control.yml',
    '.github/workflows/release-npm.yml',
    '.github/workflows/release-android.yml',
  ];

  for (const workflow of expected) {
    const entry = before.find((item) => item.path === workflow);
    assert.ok(entry, `expected workflow missing from inventory: ${workflow}`);
    const content = await readFile(resolve(repoRoot, workflow), 'utf8');
    const hash = createHash('sha256').update(content).digest('hex');
    assert.equal(entry.sha256, hash);
  }
});
