import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(currentDir, '../../../.github/workflows/release-github-notes.yml');

test('release github notes workflow is removed because canonical GitHub releases are manual', async () => {
  await assert.rejects(access(workflowPath));
});
