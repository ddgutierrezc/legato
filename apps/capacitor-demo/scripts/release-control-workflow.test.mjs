import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(currentDir, '../../../.github/workflows/release-control.yml');

test('release control workflow exposes unified dispatch with release_id, targets, and target modes', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /workflow_dispatch:/i);
  assert.match(workflow, /release_id:/i);
  assert.match(workflow, /targets:/i);
  assert.match(workflow, /target_modes:/i);
  assert.match(workflow, /release-control-contract\.mjs/i);
});

test('release control workflow orchestrates android, ios, and npm with honest boundaries', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /android-lane:/i);
  assert.match(workflow, /uses:\s*\.\/\.github\/workflows\/release-android\.yml/i);
  assert.match(workflow, /ios-preflight:/i);
  assert.match(workflow, /ios-handoff:/i);
  assert.match(workflow, /ios-verify:/i);
  assert.match(workflow, /ios-closeout:/i);
  assert.doesNotMatch(workflow, /testflight|app store|deliver/i);
  assert.match(workflow, /npm-lane:/i);
  assert.match(workflow, /uses:\s*\.\/\.github\/workflows\/release-npm\.yml/i);
});

test('release control workflow emits release_id keyed final summary artifact', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /aggregate-release-summary\.mjs/i);
  assert.match(workflow, /release-control-summary-\$\{\{ inputs\.release_id \}\}/i);
  assert.match(workflow, /summary\.json/i);
  assert.match(workflow, /summary\.md/i);
});

test('release control workflow transfers iOS lane evidence between jobs', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /Upload iOS preflight evidence/i);
  assert.match(workflow, /name:\s*release-evidence-\$\{\{\s*inputs\.release_id\s*\}\}-ios-preflight/i);
  assert.match(workflow, /Download iOS preflight evidence/i);

  assert.match(workflow, /Upload iOS handoff evidence/i);
  assert.match(workflow, /name:\s*release-evidence-\$\{\{\s*inputs\.release_id\s*\}\}-ios-handoff/i);
  assert.match(workflow, /Download iOS handoff evidence/i);

  assert.match(workflow, /Upload iOS verify evidence/i);
  assert.match(workflow, /name:\s*release-evidence-\$\{\{\s*inputs\.release_id\s*\}\}-ios-verify/i);
  assert.match(workflow, /Download iOS verify evidence/i);

  assert.match(workflow, /Upload iOS closeout evidence/i);
  assert.match(workflow, /name:\s*release-evidence-\$\{\{\s*inputs\.release_id\s*\}\}-ios-closeout/i);
  assert.match(workflow, /Download iOS closeout evidence/i);
});
