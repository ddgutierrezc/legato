import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

const criteriaPath = resolve(currentDir, '../../../docs/releases/v1-release-criteria-v1.md');
const matrixPath = resolve(currentDir, '../../../docs/releases/v1-release-gap-matrix-v1.md');
const deferralsPath = resolve(currentDir, '../../../docs/releases/v1-release-deferral-register-v1.md');
const decisionPath = resolve(currentDir, '../../../docs/releases/v1-release-go-no-go-record-v1.md');
const changelogPath = resolve(currentDir, '../../../CHANGELOG.md');
const releaseTemplatePath = resolve(currentDir, '../../../.github/release-template.md');
const capacitorReadmePath = resolve(currentDir, '../../../packages/capacitor/README.md');

test('v1 release criteria doc defines canonical MUST/SHOULD/NICE contract and freshness policy', async () => {
  const criteria = await readFile(criteriaPath, 'utf8');

  assert.match(criteria, /# V1\.0\.0 Release Criteria/i);
  assert.match(criteria, /\| ID \| Strength \| Criterion \| Rationale \| Evidence Class \| Blocks Release \|/i);
  assert.match(criteria, /\|\s*RC-\d+\s*\|\s*MUST\s*\|/i);
  assert.match(criteria, /\|\s*RC-\d+\s*\|\s*SHOULD\s*\|/i);
  assert.match(criteria, /\|\s*RC-\d+\s*\|\s*NICE\s*\|/i);
  assert.match(criteria, /Evidence Freshness Policy/i);
  assert.match(criteria, /default branch state|candidate release line|stale evidence/i);
});

test('v1 release gap matrix maps each criterion exactly once with evidence-backed statuses', async () => {
  const matrix = await readFile(matrixPath, 'utf8');

  assert.match(matrix, /# V1\.0\.0 Release Gap Matrix/i);
  assert.match(matrix, /\| Criterion ID \| Status \| Evidence References \| Freshness \| Owner \| Action \|/i);
  assert.match(matrix, /\|\s*RC-\d+\s*\|\s*PASS\s*\|/i);
  assert.match(matrix, /\|\s*RC-05\s*\|\s*PASS\s*\|/i);
  assert.match(matrix, /\|\s*RC-06\s*\|\s*BLOCKED\s*\|/i);
  assert.match(matrix, /\|\s*RC-\d+\s*\|\s*BLOCKED\s*\|/i);
  assert.match(matrix, /No PASS claim without source-backed evidence/i);
  assert.match(matrix, /Revision History \(append-only\)/i);
});

test('v1 post-1.0 deferral register records accepted boundaries and claim impact', async () => {
  const deferrals = await readFile(deferralsPath, 'utf8');

  assert.match(deferrals, /# V1\.0\.0 Post-1\.0 Deferral Register/i);
  assert.match(deferrals, /\| Item \| Boundary \| Reason \| Acceptance Authority \| Public Claim Impact \| Revisit After \|/i);
  assert.match(deferrals, /DRM|token refresh|process-death|React Native|Flutter/i);
  assert.match(deferrals, /Revision History \(append-only\)/i);
});

test('v1 go-no-go record includes required sections and backlinks from public surfaces', async () => {
  const [decision, changelog, releaseTemplate, capacitorReadme] = await Promise.all([
    readFile(decisionPath, 'utf8'),
    readFile(changelogPath, 'utf8'),
    readFile(releaseTemplatePath, 'utf8'),
    readFile(capacitorReadmePath, 'utf8'),
  ]);

  assert.match(decision, /# V1\.0\.0 Go\/No-Go Decision Record/i);
  assert.match(decision, /Verdict:\s*(GO|NO-GO)/i);
  assert.match(decision, /Decision Date:/i);
  assert.match(decision, /Release Candidate:/i);
  assert.match(decision, /Criteria Summary/i);
  assert.match(decision, /Unresolved Blockers/i);
  assert.match(decision, /Accepted Deferrals/i);
  assert.match(decision, /Evidence Index/i);
  assert.match(decision, /Approver Sign-off/i);
  assert.match(decision, /Revision History \(append-only\)/i);

  assert.match(changelog, /v1-release-go-no-go-record-v1\.md/i);
  assert.match(releaseTemplate, /v1-release-go-no-go-record-v1\.md/i);
  assert.match(capacitorReadme, /v1-release-go-no-go-record-v1\.md/i);
});
