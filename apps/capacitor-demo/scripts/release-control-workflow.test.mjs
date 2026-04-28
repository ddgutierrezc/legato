import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(currentDir, '../../../.github/workflows/release-control.yml');

test('release control workflow exposes unified dispatch with release_id, targets, target modes, and npm package target', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /workflow_dispatch:/i);
  assert.match(workflow, /permissions:[\s\S]*id-token:\s*write/i);
  assert.match(workflow, /actions\/checkout@v6/i);
  assert.match(workflow, /actions\/setup-node@v6/i);
  assert.match(workflow, /actions\/upload-artifact@v7/i);
  assert.match(workflow, /release_id:/i);
  assert.match(workflow, /targets:/i);
  assert.match(workflow, /target_modes:/i);
  assert.match(workflow, /npm_package_target:/i);
  assert.match(workflow, /default:\s*capacitor/i);
  assert.match(workflow, /options:[\s\S]*-\s*capacitor[\s\S]*-\s*contract/i);
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
  assert.match(workflow, /package_target:\s*\$\{\{\s*inputs\.npm_package_target\s*\}\}/i);
});

test('release control workflow emits release_id keyed final summary artifact', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /release-preflight-completeness\.mjs/i);
  assert.match(workflow, /preflight-completeness:/i);
  assert.match(workflow, /needs:\s*\[validate-dispatch, preflight-completeness\]/i);
  assert.match(workflow, /needs\.preflight-completeness\.outputs\.ok\s*==\s*'true'/i);
  assert.match(workflow, /aggregate-release-summary\.mjs/i);
  assert.match(workflow, /release-execution-packet\.json/i);
  assert.match(workflow, /Upload release execution packet/i);
  assert.match(workflow, /release-packet-\$\{\{ inputs\.release_id \}\}/i);
  assert.match(workflow, /Download release execution packet/i);
  assert.match(workflow, /release:prepare/i);
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

test('release control workflow derives iOS release tag/version from native contract and avoids hardcoded literals', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /native-artifacts\.json/i);
  assert.match(workflow, /ios_release_tag/i);
  assert.match(workflow, /ios_release_version/i);
  assert.doesNotMatch(workflow, /IOS_RELEASE_TAG=v0\.1\.1/i);
});

test('release control workflow passes source commit into aggregate summary output', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /source_commit/i);
  assert.match(workflow, /github\.sha/i);
  assert.match(workflow, /aggregate-release-summary\.mjs/i);
  assert.match(workflow, /NPM_SUMMARY_RAW:/i);
  assert.match(workflow, /process\.env\.NPM_SUMMARY_RAW/i);
});

test('release control workflow enforces release communications reconciliation gate', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /release-changelog-facts\.mjs/i);
  assert.match(workflow, /generate-github-release-notes\.mjs/i);
  assert.match(workflow, /validate-release-reconciliation\.mjs/i);
  assert.match(workflow, /--derivative-notes/i);
  assert.match(workflow, /docs\/releases\/notes\/\$\{RELEASE_ID\}-ios-derivative\.md/i);
  assert.match(workflow, /needs\.validate-dispatch\.outputs\.ios_selected/i);
  assert.match(workflow, /release-notes-/i);
  assert.match(workflow, /release-closure-bundle\.mjs/i);
  assert.match(workflow, /validate-release-closeout\.mjs/i);
  assert.match(workflow, /fresh-head-closeout\.json/i);
  assert.match(workflow, /closure-bundle\.json/i);
  assert.match(workflow, /release-closure-bundle-\$\{\{ inputs\.release_id \}\}/i);
  assert.match(workflow, /CHANGELOG\.md/i);
});

test('release control workflow grants contents write for changelog and release body updates', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /permissions:[\s\S]*contents:\s*write/i);
});

test('release control workflow fails pre-fanout with structured non-goal diagnostics', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /release-control-contract\.json/i);
  assert.match(workflow, /c\.diagnostics/i);
  assert.match(workflow, /diag\.code/i);
  assert.match(workflow, /process\.exit\(1\)/i);
});
