import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const validationDocsPath = resolve(currentDir, '../../../docs/releases/publication-pipeline-v1-validation.md');

test('validation checklist includes required audit fields for release dispatch and approvals', async () => {
  const docs = await readFile(validationDocsPath, 'utf8');

  assert.match(docs, /release_id/i);
  assert.match(docs, /mode/i);
  assert.match(docs, /Approver \(publish mode\)/i);
  assert.match(docs, /Stage outcomes/i);
  assert.match(docs, /android-preflight/i);
  assert.match(docs, /android-publish/i);
  assert.match(docs, /android-verify/i);
  assert.match(docs, /Operator identity/i);
  assert.match(docs, /Publish timestamp/i);
  assert.match(docs, /Immutable proof reference/i);
  assert.match(docs, /proofType/i);
  assert.match(docs, /proofValue/i);
  assert.match(docs, /verify\.json\.checks\.remoteTag/i);
});

test('validation checklist enforces evidence bundles and iOS closeout evidence chain', async () => {
  const docs = await readFile(validationDocsPath, 'utf8');

  assert.match(docs, /manual\/external/i);
  assert.match(docs, /release-evidence-<release_id>/i);
  assert.match(docs, /dispatch\.json/i);
  assert.match(docs, /preflight\.log/i);
  assert.match(docs, /publish\.log/i);
  assert.match(docs, /verify\.log/i);
  assert.match(docs, /summary\.json/i);
  assert.match(docs, /summary\.md/i);
  assert.match(docs, /artifacts\/ios-publication-v1\/\<release_id\>\//i);
  assert.match(docs, /preflight\.json/i);
  assert.match(docs, /handoff\.json/i);
  assert.match(docs, /verify\.json/i);
  assert.match(docs, /closeout\.json/i);
  assert.match(docs, /synthetic\/placeholder evidence is rejected/i);
});
