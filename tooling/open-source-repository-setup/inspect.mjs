import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const REQUIRED_FILES = [
  'README.md',
  'LICENSE',
  'CONTRIBUTING.md',
  'CODE_OF_CONDUCT.md',
  'SECURITY.md',
  '.github/CODEOWNERS',
  '.github/PULL_REQUEST_TEMPLATE.md',
  '.github/ISSUE_TEMPLATE/bug_report.yml',
  '.github/ISSUE_TEMPLATE/feature_request.yml',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/dependabot.yml',
];

const WORKFLOWS_TO_PRESERVE = [
  '.github/workflows/release-control.yml',
  '.github/workflows/release-npm.yml',
  '.github/workflows/release-android.yml',
  '.github/workflows/npm-release-readiness.yml',
];

export async function fileExistsDefault(path) {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function inspectLocalState({ repoRoot, fileExists = fileExistsDefault }) {
  const files = [];
  for (const path of REQUIRED_FILES) {
    const exists = await fileExists(resolve(repoRoot, path));
    files.push({ path, status: exists ? 'present-compatible' : 'missing' });
  }
  return { files };
}

export async function inspectWorkflowInventory({ repoRoot }) {
  const inventory = [];
  for (const path of WORKFLOWS_TO_PRESERVE) {
    const absolute = resolve(repoRoot, path);
    const exists = await fileExistsDefault(absolute);
    if (!exists) {
      inventory.push({ path, missing: true });
      continue;
    }
    const content = await readFile(absolute, 'utf8');
    const sha256 = createHash('sha256').update(content).digest('hex');
    inventory.push({ path, missing: false, sha256 });
  }
  return inventory;
}

async function runJsonGh(args) {
  try {
    const { stdout } = await execFileAsync('gh', args, { encoding: 'utf8' });
    return { ok: true, value: JSON.parse(stdout) };
  } catch (error) {
    return { ok: false, error: String(error.message ?? error) };
  }
}

export async function validatePreflight({
  ghAuthStatus = async () => {
    try {
      await execFileAsync('gh', ['auth', 'status'], { encoding: 'utf8' });
      return { ok: true };
    } catch {
      return { ok: false, reason: 'not-authenticated' };
    }
  },
  getDefaultBranch = async () => 'main',
  hasAdminAccess = async () => false,
}) {
  const blockers = [];
  const auth = await ghAuthStatus();
  const defaultBranch = await getDefaultBranch();
  const admin = await hasAdminAccess();

  if (!auth.ok) {
    blockers.push({ code: 'GH_AUTH_MISSING', detail: auth.reason ?? 'unknown' });
  }
  if (!admin) {
    blockers.push({ code: 'GH_ADMIN_REQUIRED', detail: 'API apply step will run in audit-only mode.' });
  }
  return {
    ok: blockers.length === 0,
    blockers,
    defaultBranch,
    permissions: { admin },
  };
}

export async function runInspection({ repoRoot }) {
  const local = await inspectLocalState({ repoRoot });
  const workflows = await inspectWorkflowInventory({ repoRoot });
  const repoRes = await runJsonGh(['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef']);
  const branch = repoRes.ok ? repoRes.value.defaultBranchRef?.name ?? 'main' : 'main';

  const preflight = await validatePreflight({
    getDefaultBranch: async () => branch,
    hasAdminAccess: async () => {
      const r = await runJsonGh(['api', 'repos/ddgutierrezc/legato', '--jq', '.permissions.admin']);
      return Boolean(r.ok && r.value === true);
    },
  });

  const labels = await runJsonGh(['api', 'repos/ddgutierrezc/legato/labels']);
  const rulesets = await runJsonGh(['api', 'repos/ddgutierrezc/legato/rulesets']);
  const branchProtection = await runJsonGh(['api', `repos/ddgutierrezc/legato/branches/${branch}/protection`]);
  const security = await runJsonGh(['api', 'repos/ddgutierrezc/legato', '--jq', '.security_and_analysis']);
  const repoSettings = await runJsonGh([
    'api',
    'repos/ddgutierrezc/legato',
    '--jq',
    '{allow_auto_merge:.allow_auto_merge,delete_branch_on_merge:.delete_branch_on_merge,allow_update_branch:.allow_update_branch,has_discussions:.has_discussions,allow_merge_commit:.allow_merge_commit,allow_rebase_merge:.allow_rebase_merge,allow_squash_merge:.allow_squash_merge,security_and_analysis:.security_and_analysis,topics:.topics}',
  ]);

  return {
    git: { defaultBranch: branch },
    files: local.files,
    workflows,
    github: {
      repoSettings: repoSettings.ok ? {
        allow_auto_merge: repoSettings.value.allow_auto_merge,
        delete_branch_on_merge: repoSettings.value.delete_branch_on_merge,
        allow_update_branch: repoSettings.value.allow_update_branch,
        has_discussions: repoSettings.value.has_discussions,
        allow_merge_commit: repoSettings.value.allow_merge_commit,
        allow_rebase_merge: repoSettings.value.allow_rebase_merge,
        allow_squash_merge: repoSettings.value.allow_squash_merge,
        security_and_analysis: repoSettings.value.security_and_analysis,
      } : null,
      topics: repoSettings.ok ? repoSettings.value.topics : [],
      labels: labels.ok ? labels.value : [],
      rulesets: rulesets.ok ? rulesets.value : [],
      branchProtection: branchProtection.ok ? branchProtection.value : null,
      securityAndAnalysis: security.ok ? security.value : null,
    },
    blockers: preflight.blockers,
    permissions: preflight.permissions,
  };
}

async function main() {
  const repoRoot = resolve(process.cwd());
  const outDir = resolve(repoRoot, 'tooling/open-source-repository-setup/out');
  await mkdir(outDir, { recursive: true });
  const inspection = await runInspection({ repoRoot });
  await writeFile(resolve(outDir, 'inspection.json'), `${JSON.stringify(inspection, null, 2)}\n`, 'utf8');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
