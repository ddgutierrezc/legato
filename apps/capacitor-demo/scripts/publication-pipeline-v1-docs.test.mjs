import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const docsPath = resolve(currentDir, '../../../docs/releases/publication-pipeline-v1.md');

test('publication pipeline runbook separates automated preflight from manual iOS release responsibilities', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /iOS Preflight \(automatable\)/i);
  assert.match(runbook, /Manual Handoff \(non-automated in v1\)/i);
  assert.match(runbook, /release:ios:preflight/i);
  assert.match(runbook, /legato-ios-core/i);
  assert.match(runbook, /do not implement automated iOS publication in this v1 milestone/i);
});

test('publication pipeline runbook includes required evidence checklist before manual handoff', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /Runbook Checklist Artifact/i);
  assert.match(runbook, /Release tag submitted to preflight/i);
  assert.match(runbook, /Preflight summary output/i);
  assert.match(runbook, /Link\/path to the output attached in PR/i);
  assert.match(runbook, /Manual handoff confirmation/i);
});

test('publication pipeline runbook links local validation evidence closeout artifact', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /publication-pipeline-v1-validation\.md/i);
  assert.match(runbook, /release:scope:check/i);
});
