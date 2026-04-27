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
  assert.match(runbook, /Trusted Publisher/i);
  assert.match(runbook, /release-npm\.yml/i);
  assert.match(runbook, /package_target/i);
  assert.match(runbook, /contract/i);
  assert.match(runbook, /capacitor/i);
  assert.match(runbook, /npm publish --access public/i);
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

test('publication pipeline v2 runbook documents closure reconciliation and traceable fresh-head evidence', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /closure-reconciliation checklist/i);
  assert.match(runbook, /stale|contradictory/i);
  assert.match(runbook, /run URL/i);
  assert.match(runbook, /release-control-summary-<release_id>/i);
  assert.match(runbook, /source_commit/i);
  assert.match(runbook, /latest\s+`?HEAD`?/i);
  assert.match(runbook, /release:confidence:fresh-head:check/i);
  assert.match(runbook, /sign-off\s+remains\s+blocked/i);
});

test('publication pipeline v2 runbook documents release-confidence pre-canary test gate and scope boundary', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /test:release:confidence/i);
  assert.match(runbook, /pre-canary verification gate/i);
  assert.match(runbook, /non-goal/i);
  assert.match(runbook, /typecheck/i);
  assert.match(runbook, /out of scope/i);
});

test('publication pipeline v2 runbook links governance policies, templates, and deploy contracts', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /release-communication-governance-v1\.md/i);
  assert.match(runbook, /release-notes-policy-v1\.md/i);
  assert.match(runbook, /reconciliation-stop-the-line-rules-v1\.md/i);
  assert.match(runbook, /release-note-template-governance-v1\.md/i);
  assert.match(runbook, /ios-derivative-release-template\.md/i);
  assert.match(runbook, /android-deploy-procedure-contract-v1\.md/i);
  assert.match(runbook, /npm-deploy-procedure-contract-v1\.md/i);
  assert.match(runbook, /ios-distribution-deploy-procedure-contract-v1\.md/i);
  assert.match(runbook, /future-release-skill-io-contract-v1\.md/i);
  assert.match(runbook, /docs\/releases\/notes\/<release_id>-ios-derivative\.md/i);
  assert.match(runbook, /required when ios lane is selected/i);
});
