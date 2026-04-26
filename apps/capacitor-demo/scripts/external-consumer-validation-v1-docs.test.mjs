import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const docsPath = resolve(currentDir, '../../../docs/releases/external-consumer-validation-v1.md');
const evidencePath = resolve(currentDir, '../../../docs/releases/external-consumer-validation-v2-evidence.md');

test('external consumer runbook states v3 profile boundaries and manual non-automation scope', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /Registry-first release gate/i);
  assert.match(runbook, /Scope Boundaries \(v3\)/i);
  assert.match(runbook, /manual proof in `\/Volumes\/S3\/daniel\/github\/legato-consumer-smoke`/i);
  assert.match(runbook, /Do NOT use `workspace:` or `link:` dependencies in any profile/i);
  assert.match(runbook, /`file:` tarballs are allowed only for `ci-npm-readiness`/i);
  assert.match(runbook, /Manual-only \/ Real-device Boundaries/i);
  assert.match(runbook, /do \*\*not\*\* replace these checks/i);
});

test('external consumer runbook includes phase 0 npm-view gate and profile-specific automation commands', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /npm view @ddgutierrezc\/legato-capacitor version peerDependencies --json/i);
  assert.match(runbook, /npm view @ddgutierrezc\/legato-contract versions --json/i);
  assert.match(runbook, /npx cap add android/i);
  assert.match(runbook, /npx cap sync ios android/i);
  assert.match(runbook, /packageClassList/i);
  assert.match(runbook, /npm run validate:external:consumer:manual-proof/i);
  assert.match(runbook, /npm run validate:external:consumer:ci-readiness/i);
  assert.match(runbook, /summary-cli\.json/i);
});

test('runbook reflects current 0.1.2 registry truth and current proof path', async () => {
  const runbook = await readFile(docsPath, 'utf8');

  assert.match(runbook, /Observed contract versions:\s*`\["0\.1\.1",\s*"0\.1\.2"\]`/i);
  assert.match(runbook, /Current compatible pair for active proof/i);
  assert.match(runbook, /`@ddgutierrezc\/legato-capacitor@0\.1\.2`/i);
  assert.match(runbook, /`@ddgutierrezc\/legato-contract@0\.1\.2`/i);
  assert.match(runbook, /npm install --no-audit --no-fund @ddgutierrezc\/legato-contract@0\.1\.2 @ddgutierrezc\/legato-capacitor@0\.1\.2/i);
  assert.doesNotMatch(runbook, /Compatible published pair.*0\.1\.1\s*\+\s*0\.1\.1/i);
});

test('evidence document reflects 0.1.2 parity and no stale 0.1.1-only baseline', async () => {
  const evidence = await readFile(evidencePath, 'utf8');

  assert.match(evidence, /\[\s*"0\.1\.1",\s*"0\.1\.2"\s*\]/i);
  assert.match(evidence, /Current compatible published pair:\s*`@ddgutierrezc\/legato-capacitor@0\.1\.2`\s*\+\s*`@ddgutierrezc\/legato-contract@0\.1\.2`/i);
  assert.match(evidence, /--registry-capacitor @ddgutierrezc\/legato-capacitor@0\.1\.2 --registry-contract @ddgutierrezc\/legato-contract@0\.1\.2/i);
  assert.doesNotMatch(evidence, /Compatible published pair used for proof:\s*`@ddgutierrezc\/legato-capacitor@0\.1\.1`\s*\+\s*`@ddgutierrezc\/legato-contract@0\.1\.1`/i);
});
