import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const docsPath = resolve(currentDir, '../../../docs/releases/publication-pipeline-v2.md');

test('publication pipeline v2 runbook documents GitHub App iOS authority and npm real protected publish', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /release-control\.yml/i);
  assert.match(runbook, /GitHub App token/i);
  assert.match(runbook, /already_published/i);
  assert.match(runbook, /npm publish --provenance/i);
  assert.match(runbook, /npm view/i);
});

test('publication pipeline v2 runbook documents evidence checklist and canary rollout order', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /release-control-summary-<release_id>/i);
  assert.match(runbook, /android-summary\.json/i);
  assert.match(runbook, /ios-summary\.json/i);
  assert.match(runbook, /npm-summary\.json/i);
  assert.match(runbook, /iOS-only canary/i);
  assert.match(runbook, /npm-only canary/i);
  assert.match(runbook, /Mixed run/i);
});
