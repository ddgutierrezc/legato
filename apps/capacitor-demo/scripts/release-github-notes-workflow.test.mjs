import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(currentDir, '../../../.github/workflows/release-github-notes.yml');

test('release github notes workflow requires packet and reconciliation gates before publish', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /reconciliation_ok:/i);
  assert.match(workflow, /release_packet_schema:/i);
  assert.match(workflow, /fresh_head_closeout_ok:/i);
  assert.match(workflow, /release-execution-packet\/v1/i);
  assert.match(workflow, /exit\s+1/i);
});
