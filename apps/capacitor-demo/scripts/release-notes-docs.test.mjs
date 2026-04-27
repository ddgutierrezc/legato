import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const runbookPath = resolve(currentDir, '../../../docs/releases/publication-pipeline-v2.md');
const readmePath = resolve(currentDir, '../../../README.md');
const changelogPath = resolve(currentDir, '../../../CHANGELOG.md');
const governancePath = resolve(currentDir, '../../../docs/releases/release-communication-governance-v1.md');
const policyPath = resolve(currentDir, '../../../docs/releases/release-notes-policy-v1.md');

test('release docs and root readme link canonical changelog and github release notes flow', async () => {
  const [runbook, readme, changelog, governance, policy] = await Promise.all([
    readFile(runbookPath, 'utf8'),
    readFile(readmePath, 'utf8'),
    readFile(changelogPath, 'utf8'),
    readFile(governancePath, 'utf8'),
    readFile(policyPath, 'utf8'),
  ]);

  assert.match(runbook, /release-template\.md/i);
  assert.match(runbook, /release:notes:generate/i);
  assert.match(runbook, /validate:release:reconciliation/i);
  assert.match(runbook, /MISSING_NARRATIVE_OR_DERIVATIVE_NOTES/i);
  assert.match(runbook, /CHANGELOG\.md/i);

  assert.match(readme, /CHANGELOG\.md/i);
  assert.match(readme, /Releases?/i);

  assert.match(changelog, /^# Changelog/m);
  assert.match(changelog, /^## \[Unreleased\]/m);

  assert.match(governance, /canonical/i);
  assert.match(governance, /derivative/i);
  assert.match(governance, /legato-ios-core/i);
  assert.match(policy, /durable/i);
  assert.match(policy, /ephemeral/i);
  assert.match(policy, /stop-the-line/i);
});
