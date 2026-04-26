import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import {
  buildPlan,
  applyFilePlan,
  ensureManagedBlock,
  reconcileDependabot,
  buildApiPlan,
  classifyPermission,
} from '../apply.mjs';

test('buildPlan classifies missing and divergent files', async () => {
  const scratch = await mkdtemp(resolve(tmpdir(), 'oss-setup-plan-'));
  try {
    const plan = await buildPlan({
      repoRoot: scratch,
      targets: [
        { path: 'CONTRIBUTING.md', template: 'contributing.md', strategy: 'create-if-missing' },
        { path: 'README.md', template: 'readme.md', strategy: 'managed-block', marker: 'OSS_LINKS' },
      ],
      templateLoader: async () => 'template-content',
      fileReader: async (path) => {
        if (path.endsWith('README.md')) {
          return '# existing-readme\n';
        }
        throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      },
    });

    const contributing = plan.fileOps.find((entry) => entry.path === 'CONTRIBUTING.md');
    const readme = plan.fileOps.find((entry) => entry.path === 'README.md');

    assert.equal(contributing.status, 'missing');
    assert.equal(readme.status, 'present-divergent');
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('applyFilePlan creates only missing files and emits suggestions', async () => {
  const scratch = await mkdtemp(resolve(tmpdir(), 'oss-setup-apply-'));
  try {
    const result = await applyFilePlan({
      repoRoot: scratch,
      plan: {
        fileOps: [
          {
            path: 'SECURITY.md',
            status: 'missing',
            desired: 'security-policy',
            strategy: 'create-if-missing',
          },
          {
            path: 'README.md',
            status: 'present-divergent',
            desired: 'new-readme',
            existing: '# existing',
            strategy: 'create-if-missing',
          },
        ],
      },
    });

    assert.equal(result.applied.length, 1);
    assert.equal(result.suggestions.length, 1);

    const security = await readFile(resolve(scratch, 'SECURITY.md'), 'utf8');
    assert.equal(security, 'security-policy');

    const suggestion = await readFile(resolve(scratch, 'tooling/open-source-repository-setup/out/suggestions/README.md.patch.md'), 'utf8');
    assert.match(suggestion, /present-divergent/i);
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
});

test('ensureManagedBlock updates managed section without replacing user content', () => {
  const current = '# title\n\ncustom intro\n\n<!-- OSS_LINKS:START -->\nold block\n<!-- OSS_LINKS:END -->\n';
  const updated = ensureManagedBlock({
    current,
    marker: 'OSS_LINKS',
    content: '- [Contributing](./CONTRIBUTING.md)',
  });

  assert.match(updated, /custom intro/);
  assert.match(updated, /Contributing/);
  assert.doesNotMatch(updated, /old block/);
});

test('ensureManagedBlock supports hash markers for YAML files', () => {
  const current = 'version: 2\n# OSS_DEPENDABOT:START\nold\n# OSS_DEPENDABOT:END\n';
  const updated = ensureManagedBlock({
    current,
    marker: 'OSS_DEPENDABOT',
    content: 'updates:\n  - package-ecosystem: "npm"',
    commentStyle: 'hash',
  });

  assert.match(updated, /# OSS_DEPENDABOT:START/);
  assert.match(updated, /package-ecosystem/);
  assert.doesNotMatch(updated, /\nold\n/);
});

test('reconcileDependabot adds missing target path while preserving cadence', () => {
  const current = [
    'version: 2',
    'updates:',
    '  - package-ecosystem: npm',
    '    directory: "/apps/capacitor-demo"',
    '    schedule:',
    '      interval: weekly',
  ].join('\n');

  const next = reconcileDependabot({
    current,
    requiredEntries: [
      { ecosystem: 'npm', directory: '/apps/capacitor-demo' },
      { ecosystem: 'npm', directory: '/packages/capacitor' },
    ],
  });

  assert.match(next, /interval: weekly/);
  assert.match(next, /directory: "\/packages\/capacitor"/);
});

test('buildApiPlan marks blocked operations when admin scope missing', () => {
  const plan = buildApiPlan({
    desired: {
      repo: { allow_auto_merge: true },
      labels: [{ name: 'status:needs-review', color: 'd4c5f9', description: 'Needs reviewer triage' }],
      topics: ['legato', 'capacitor'],
      branchProtection: { requiredApprovingReviewCount: 1 },
    },
    current: {
      repo: { allow_auto_merge: false },
      labels: [],
      topics: [],
      branchProtection: null,
      permissions: { admin: false },
    },
  });

  assert.equal(plan.apiOps.every((entry) => entry.status === 'permission-blocked'), true);
});

test('buildApiPlan plans branch protection reconcile when admin is available and policy drift exists', () => {
  const desiredBranchProtection = {
    branch: 'main',
    required_status_checks: { strict: true, contexts: ['npm-readiness'] },
    enforce_admins: false,
    required_pull_request_reviews: {
      required_approving_review_count: 1,
      dismiss_stale_reviews: false,
      require_code_owner_reviews: false,
    },
  };

  const plan = buildApiPlan({
    desired: {
      repo: {},
      labels: [],
      topics: [],
      branchProtection: desiredBranchProtection,
    },
    current: {
      repo: {},
      labels: [],
      topics: [],
      branchProtection: {
        branch: 'main',
        required_status_checks: { strict: false, contexts: [] },
        enforce_admins: false,
        required_pull_request_reviews: {
          required_approving_review_count: 0,
          dismiss_stale_reviews: false,
          require_code_owner_reviews: false,
        },
      },
      permissions: { admin: true },
    },
  });

  const branchProtection = plan.apiOps.find((entry) => entry.id === 'branch-protection');
  assert.ok(branchProtection, 'expected branch-protection op when drift exists');
  assert.equal(branchProtection.status, 'missing');
  assert.deepEqual(branchProtection.payload, desiredBranchProtection);
});

test('classifyPermission returns blocked when operation needs admin', () => {
  assert.equal(classifyPermission({ needsAdmin: true, hasAdmin: false }), 'permission-blocked');
  assert.equal(classifyPermission({ needsAdmin: false, hasAdmin: false }), 'missing');
});
