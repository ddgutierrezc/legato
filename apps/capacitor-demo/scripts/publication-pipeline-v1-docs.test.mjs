import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const docsPath = resolve(currentDir, '../../../docs/releases/publication-pipeline-v1.md');

test('publication pipeline runbook enforces Android CI scope with explicit iOS manual publish boundary', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /CI-driven through GitHub Actions in v1/i);
  assert.match(runbook, /target`\s*\|\s*`android`/i);
  assert.match(runbook, /publication action.*manual\/external in v1/i);
  assert.match(runbook, /release:ios:preflight/i);
  assert.match(runbook, /release:ios:handoff/i);
  assert.match(runbook, /release:ios:verify/i);
  assert.match(runbook, /release:ios:closeout/i);
  assert.match(runbook, /do not implement automated iOS publication in this v1 milestone/i);
});

test('publication pipeline runbook documents protected publish gate and retained evidence files', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /environment `release` approval/i);
  assert.match(runbook, /release-evidence-<release_id>/i);
  assert.match(runbook, /dispatch\.json/i);
  assert.match(runbook, /preflight\.log/i);
  assert.match(runbook, /summary\.json/i);
  assert.match(runbook, /summary\.md/i);
});

test('publication pipeline runbook links local validation evidence closeout artifact', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /publication-pipeline-v1-validation\.md/i);
  assert.match(runbook, /workflow_dispatch/i);
  assert.match(runbook, /artifacts\/ios-publication-v1\/\<release_id\>/i);
  assert.match(runbook, /closeout\.json/i);
  assert.match(runbook, /proofType/i);
  assert.match(runbook, /proofValue/i);
  assert.match(runbook, /placeholder values.*rejected/i);
});
