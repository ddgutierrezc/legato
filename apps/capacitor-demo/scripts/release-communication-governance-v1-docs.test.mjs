import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const governancePath = resolve(currentDir, '../../../docs/releases/release-communication-governance-v1.md');
const policyPath = resolve(currentDir, '../../../docs/releases/release-notes-policy-v1.md');
const stopTheLinePath = resolve(currentDir, '../../../docs/releases/reconciliation-stop-the-line-rules-v1.md');
const futureSkillPath = resolve(currentDir, '../../../docs/releases/contracts/future-release-skill-io-contract-v1.md');
const androidContractPath = resolve(currentDir, '../../../docs/releases/contracts/android-deploy-procedure-contract-v1.md');
const npmContractPath = resolve(currentDir, '../../../docs/releases/contracts/npm-deploy-procedure-contract-v1.md');
const iosContractPath = resolve(currentDir, '../../../docs/releases/contracts/ios-distribution-deploy-procedure-contract-v1.md');
const canonicalTemplatePolicyPath = resolve(currentDir, '../../../docs/releases/templates/release-note-template-governance-v1.md');
const iosDerivativeTemplatePath = resolve(currentDir, '../../../docs/releases/templates/ios-derivative-release-template.md');

test('release communication governance docs define canonical vs derivative ownership and evidence policy', async () => {
  const [governance, policy, stopTheLine] = await Promise.all([
    readFile(governancePath, 'utf8'),
    readFile(policyPath, 'utf8'),
    readFile(stopTheLinePath, 'utf8'),
  ]);

  assert.match(governance, /legato/i);
  assert.match(governance, /canonical/i);
  assert.match(governance, /legato-ios-core/i);
  assert.match(governance, /derivative/i);
  assert.match(governance, /CHANGELOG\.md/i);

  assert.match(policy, /durable evidence/i);
  assert.match(policy, /ephemeral/i);
  assert.match(policy, /facts vs narrative/i);
  assert.match(policy, /required human narrative/i);

  assert.match(stopTheLine, /stop-the-line/i);
  assert.match(stopTheLine, /canonical\/derivative drift/i);
  assert.match(stopTheLine, /broken backlinks/i);
  assert.match(stopTheLine, /lane\/status contradictions/i);
});

test('release deploy procedure contracts document source references and terminal states by target', async () => {
  const [android, npm, ios] = await Promise.all([
    readFile(androidContractPath, 'utf8'),
    readFile(npmContractPath, 'utf8'),
    readFile(iosContractPath, 'utf8'),
  ]);

  assert.match(android, /release-android\.yml/i);
  assert.match(android, /release-control-android-adapter\.mjs/i);
  assert.match(android, /terminal states/i);
  assert.match(android, /published/i);
  assert.match(android, /blocked/i);

  assert.match(npm, /release-npm\.yml/i);
  assert.match(npm, /release-npm-execution\.mjs/i);
  assert.match(npm, /readiness/i);
  assert.match(npm, /release-candidate/i);
  assert.match(npm, /protected-publish/i);

  assert.match(ios, /release-control\.yml/i);
  assert.match(ios, /promote-ios-distribution\.mjs/i);
  assert.match(ios, /native-artifacts\.json/i);
  assert.match(ios, /legato-ios-core/i);
  assert.match(ios, /already_published/i);
});

test('template governance and future skill contract docs define synchronization and output artifacts', async () => {
  const [templatePolicy, derivativeTemplate, futureSkill] = await Promise.all([
    readFile(canonicalTemplatePolicyPath, 'utf8'),
    readFile(iosDerivativeTemplatePath, 'utf8'),
    readFile(futureSkillPath, 'utf8'),
  ]);

  assert.match(templatePolicy, /ownership/i);
  assert.match(templatePolicy, /allowed edits/i);
  assert.match(templatePolicy, /synchronization/i);
  assert.match(templatePolicy, /canonical/i);
  assert.match(templatePolicy, /derivative/i);

  assert.match(derivativeTemplate, /iOS Distribution Summary/i);
  assert.match(derivativeTemplate, /canonical_legato_release/i);
  assert.match(derivativeTemplate, /canonical_changelog_anchor/i);

  assert.match(futureSkill, /inputs/i);
  assert.match(futureSkill, /outputs/i);
  assert.match(futureSkill, /canonical notes/i);
  assert.match(futureSkill, /derivative notes/i);
  assert.match(futureSkill, /reconciliation report/i);
  assert.match(futureSkill, /stop-the-line reason codes/i);
});
