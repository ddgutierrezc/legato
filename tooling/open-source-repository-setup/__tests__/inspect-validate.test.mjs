import test from 'node:test';
import assert from 'node:assert/strict';

import { validatePreflight, inspectLocalState } from '../inspect.mjs';
import { validateRequirements, summarizeValidation } from '../validate.mjs';

test('validatePreflight degrades when gh auth fails', async () => {
  const result = await validatePreflight({
    ghAuthStatus: async () => ({ ok: false, reason: 'not-authenticated' }),
    getDefaultBranch: async () => 'main',
    hasAdminAccess: async () => false,
  });

  assert.equal(result.ok, false);
  assert.equal(result.blockers.some((entry) => entry.code === 'GH_AUTH_MISSING'), true);
});

test('inspectLocalState marks missing OSS files', async () => {
  const snapshot = await inspectLocalState({
    repoRoot: '/repo',
    fileExists: async (path) => path.endsWith('README.md'),
  });

  const security = snapshot.files.find((entry) => entry.path === 'SECURITY.md');
  const readme = snapshot.files.find((entry) => entry.path === 'README.md');
  assert.equal(readme.status, 'present-compatible');
  assert.equal(security.status, 'missing');
});

test('validateRequirements produces pass fail and blocked statuses', () => {
  const result = validateRequirements({
    plan: {
      fileOps: [
        { path: 'CONTRIBUTING.md', status: 'missing', action: 'create' },
        { path: 'README.md', status: 'present-compatible', action: 'skip' },
      ],
      apiOps: [{ id: 'branch-protection', status: 'permission-blocked' }],
      blockers: [{ code: 'GH_ADMIN_REQUIRED', scope: 'branch-protection' }],
    },
    applyResult: {
      applied: [{ path: 'CONTRIBUTING.md' }],
      skipped: [{ path: 'README.md', reason: 'present-compatible' }],
      blocked: [{ id: 'branch-protection' }],
    },
  });

  assert.equal(result.requirements['Current-State-Aware Initialization'].status, 'pass');
  assert.equal(result.requirements['Merge and Branch Protection Policy'].status, 'blocked');
});

test('summarizeValidation includes unresolved blockers', () => {
  const summary = summarizeValidation({
    validation: {
      requirements: {
        one: { status: 'pass' },
        two: { status: 'blocked' },
      },
      blockers: [{ code: 'GH_ADMIN_REQUIRED', scope: 'rulesets' }],
    },
  });

  assert.match(summary, /blocked: 1/i);
  assert.match(summary, /GH_ADMIN_REQUIRED/);
});

test('validateRequirements fails non-overwrite safety when divergent conflict is not preserved with suggestion', () => {
  const result = validateRequirements({
    plan: {
      fileOps: [
        { path: '.github/PULL_REQUEST_TEMPLATE.md', status: 'present-divergent', strategy: 'create-if-missing' },
      ],
      apiOps: [],
      blockers: [],
    },
    applyResult: {
      applied: [],
      skipped: [],
      blocked: [],
      suggestions: [],
    },
  });

  assert.equal(result.requirements['Non-Overwrite Safety'].status, 'fail');
});

test('validateRequirements passes non-overwrite safety when divergent conflict is skipped and suggested', () => {
  const result = validateRequirements({
    plan: {
      fileOps: [
        { path: '.github/PULL_REQUEST_TEMPLATE.md', status: 'present-divergent', strategy: 'create-if-missing' },
      ],
      apiOps: [],
      blockers: [],
    },
    applyResult: {
      applied: [],
      skipped: [{ path: '.github/PULL_REQUEST_TEMPLATE.md', reason: 'present-divergent' }],
      blocked: [],
      suggestions: [{ path: '.github/PULL_REQUEST_TEMPLATE.md' }],
    },
  });

  assert.equal(result.requirements['Non-Overwrite Safety'].status, 'pass');
});
