import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const docsPath = resolve(currentDir, '../../../docs/releases/external-consumer-validation-v1.md');

test('external consumer runbook states v1 boundaries and non-goals', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /NOT publication proof/i);
  assert.match(runbook, /outside the monorepo/i);
  assert.match(runbook, /npm pack/i);
});

test('external consumer runbook includes deterministic command sequence and artifact outputs', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /npm run build/i);
  assert.match(runbook, /npm run validate:external:consumer/i);
  assert.match(runbook, /npm run capture:release:native-artifacts/i);
  assert.match(runbook, /artifacts\/external-consumer-validation-v1\/summary\.json/i);
  assert.match(runbook, /artifacts\/release-native-artifact-foundation-v1\/manifest\.json/i);
});
