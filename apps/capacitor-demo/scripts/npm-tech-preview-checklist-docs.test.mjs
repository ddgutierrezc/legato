import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const docsPath = resolve(currentDir, '../../../docs/releases/npm-tech-preview-checklist.md');

test('npm checklist defines go/no-go readiness gates', async () => {
  const checklist = await readFile(docsPath, 'utf8');

  assert.match(checklist, /go\/no-go/i);
  assert.match(checklist, /validate:npm:readiness/i);
  assert.match(checklist, /blocking check/i);
});

test('npm checklist documents risk posture for tech-preview releases', async () => {
  const checklist = await readFile(docsPath, 'utf8');

  assert.match(checklist, /tech-preview/i);
  assert.match(checklist, /rollback/i);
  assert.match(checklist, /do not promote as production-ready/i);
});
