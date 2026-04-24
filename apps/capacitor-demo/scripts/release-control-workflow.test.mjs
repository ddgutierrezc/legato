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
  assert.match(workflow, /permissions:[\s\S]*id-token:\s*write/i);
  assert.match(workflow, /actions\/checkout@v6/i);
  assert.match(workflow, /actions\/setup-node@v6/i);
  assert.match(workflow, /actions\/upload-artifact@v7/i);
  assert.match(workflow, /release_id:/i);
  assert.match(workflow, /targets:/i);
  assert.match(workflow, /target_modes:/i);
  assert.match(workflow, /release-control-contract\.mjs/i);
});

test('release control workflow orchestrates android, ios, and npm with honest boundaries', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /android-lane:/i);
  assert.match(workflow, /uses:\s*\.\/\.github\/workflows\/release-android\.yml/i);
  assert.match(workflow, /ios-lane:/i);
  assert.match(workflow, /environment:\s*release/i);
  assert.match(workflow, /actions\/create-github-app-token@v1/i);
  assert.match(workflow, /IOS_RELEASE_APP_ID/i);
  assert.match(workflow, /IOS_RELEASE_APP_PRIVATE_KEY/i);
  assert.match(workflow, /release:ios:publish/i);
  assert.match(workflow, /ios_distribution_repo/i);
  assert.match(workflow, /ios_distribution_ref/i);
  assert.doesNotMatch(workflow, /ios_github_app_token:/i);
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

test('release control workflow uploads iOS publish evidence bundle', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /Upload iOS publish evidence/i);
  assert.match(workflow, /name:\s*release-evidence-\$\{\{\s*inputs\.release_id\s*\}\}-ios/i);
  assert.match(workflow, /ios-publication-v2/i);
  assert.match(workflow, /ios-summary\.json/i);
});
