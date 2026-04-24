import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(currentDir, '../../../.github/workflows/release-npm.yml');

test('release npm workflow supports workflow_call and protected publish execution', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /workflow_call:/i);
  assert.match(workflow, /workflow_dispatch:/i);
  assert.match(workflow, /readiness/i);
  assert.match(workflow, /release-candidate/i);
  assert.match(workflow, /protected-publish/i);
  assert.match(workflow, /environment:[\s\S]*release/i);
  assert.match(workflow, /release:npm:policy/i);
  assert.match(workflow, /release:npm:execute/i);
  assert.match(workflow, /npm publish --provenance/i);
});
