import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(currentDir, '../../../.github/workflows/npm-release-readiness.yml');

test('npm readiness workflow runs on PRs that touch package/release files', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /pull_request:/i);
  assert.match(workflow, /packages\/contract\/\*\*/i);
  assert.match(workflow, /packages\/capacitor\/\*\*/i);
  assert.match(workflow, /docs\/releases\/npm-tech-preview-checklist\.md/i);
});

test('npm readiness workflow executes pack inspection and external consumer gate', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /npm run validate:npm:readiness/i);
  assert.match(workflow, /npm run test:npm:readiness/i);
  assert.doesNotMatch(workflow, /protected-publish/i);
  assert.match(workflow, /Upload readiness artifacts/i);
});
