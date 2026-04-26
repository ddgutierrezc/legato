import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';

const execFileAsync = promisify(execFile);

export function classifyPermission({ needsAdmin, hasAdmin }) {
  if (needsAdmin && !hasAdmin) {
    return 'permission-blocked';
  }
  return 'missing';
}

function markerTokens(marker, commentStyle = 'html') {
  if (commentStyle === 'hash') {
    return {
      start: `# ${marker}:START`,
      end: `# ${marker}:END`,
    };
  }
  return {
    start: `<!-- ${marker}:START -->`,
    end: `<!-- ${marker}:END -->`,
  };
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function ensureManagedBlock({ current, marker, content, commentStyle = 'html' }) {
  const { start, end } = markerTokens(marker, commentStyle);
  const managed = `${start}\n${content}\n${end}`;
  const variants = [markerTokens(marker, 'html'), markerTokens(marker, 'hash')];

  let sanitized = current;
  for (const variant of variants) {
    const pattern = new RegExp(`${escapeRegex(variant.start)}[\\s\\S]*?${escapeRegex(variant.end)}\\n?`, 'gm');
    sanitized = sanitized.replace(pattern, '').trimEnd();
    const orphanStart = new RegExp(`^${escapeRegex(variant.start)}\\s*$`, 'gm');
    const orphanEnd = new RegExp(`^${escapeRegex(variant.end)}\\s*$`, 'gm');
    sanitized = sanitized.replace(orphanStart, '').replace(orphanEnd, '').trimEnd();
  }

  if (sanitized.length === 0) {
    return `${managed}\n`;
  }

  return `${sanitized}\n\n${managed}\n`;
}

function buildSuggestion({ path, existing, desired, reason }) {
  return [
    `# Suggestion for ${path}`,
    `reason: ${reason}`,
    '--- existing ---',
    existing ?? '',
    '--- desired ---',
    desired ?? '',
    '',
  ].join('\n');
}

export function reconcileDependabot({ current, requiredEntries }) {
  const lines = current.split('\n');
  const hasUpdates = lines.some((line) => line.trim() === 'updates:');
  const output = [...lines];

  if (!hasUpdates) {
    output.push('updates:');
  }

  for (const entry of requiredEntries) {
    const token = `directory: "${entry.directory}"`;
    if (output.some((line) => line.includes(token))) {
      continue;
    }
    output.push(`  - package-ecosystem: "${entry.ecosystem}"`);
    output.push(`    directory: "${entry.directory}"`);
    output.push('    schedule:');
    output.push('      interval: weekly');
  }

  return output.join('\n').replace(/\n{3,}/g, '\n\n');
}

async function fileExists(path) {
  try {
    await readFile(path, 'utf8');
    return true;
  } catch {
    return false;
  }
}

async function defaultTemplateLoader({ repoRoot, template }) {
  return readFile(resolve(repoRoot, 'tooling/open-source-repository-setup/templates', template), 'utf8');
}

export async function buildPlan({ repoRoot, targets, templateLoader = defaultTemplateLoader, fileReader = readFile }) {
  const fileOps = [];

  for (const target of targets) {
    const absolute = resolve(repoRoot, target.path);
    const desired = await templateLoader({ repoRoot, template: target.template });

    let existing = null;
    try {
      existing = await fileReader(absolute, 'utf8');
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }

    if (target.strategy === 'managed-block') {
      if (existing == null) {
        const seed = target.base ?? '';
        const managedContent = ensureManagedBlock({
          current: seed,
          marker: target.marker,
          content: desired.trim(),
          commentStyle: target.commentStyle,
        });
        fileOps.push({ path: target.path, strategy: target.strategy, marker: target.marker, commentStyle: target.commentStyle, status: 'missing', desired: managedContent });
        continue;
      }

      const managedContent = ensureManagedBlock({
        current: existing,
        marker: target.marker,
        content: desired.trim(),
        commentStyle: target.commentStyle,
      });
      if (managedContent === existing) {
        fileOps.push({ path: target.path, strategy: target.strategy, marker: target.marker, commentStyle: target.commentStyle, status: 'present-compatible', existing, desired: managedContent });
      } else {
        fileOps.push({ path: target.path, strategy: target.strategy, marker: target.marker, commentStyle: target.commentStyle, status: 'present-divergent', existing, desired: managedContent });
      }
      continue;
    }

    if (existing == null) {
      fileOps.push({ path: target.path, strategy: target.strategy, marker: target.marker, commentStyle: target.commentStyle, status: 'missing', desired });
      continue;
    }

    if (existing === desired) {
      fileOps.push({ path: target.path, strategy: target.strategy, status: 'present-compatible', existing, desired });
    } else {
      fileOps.push({ path: target.path, strategy: target.strategy, status: 'present-divergent', existing, desired });
    }
  }

  return { fileOps, apiOps: [], blockers: [] };
}

export function buildApiPlan({ desired, current }) {
  const hasAdmin = Boolean(current.permissions?.admin);
  const apiOps = [];

  const pickDesiredShape = (source, shape) => {
    if (Array.isArray(shape)) {
      return Array.isArray(source) ? source : [];
    }
    if (shape && typeof shape === 'object') {
      const out = {};
      for (const key of Object.keys(shape)) {
        out[key] = pickDesiredShape(source?.[key], shape[key]);
      }
      return out;
    }
    return source;
  };

  const comparableCurrentRepo = pickDesiredShape(current.repo ?? {}, desired.repo ?? {});

  if (JSON.stringify(comparableCurrentRepo) !== JSON.stringify(desired.repo ?? {})) {
    apiOps.push({
      id: 'repo-settings',
      method: 'PATCH',
      endpoint: '/repos/{owner}/{repo}',
      status: classifyPermission({ needsAdmin: true, hasAdmin }),
      payload: desired.repo,
    });
  }

  const currentTopics = [...(current.topics ?? [])].sort();
  const desiredTopics = [...(desired.topics ?? [])].sort();
  if (JSON.stringify(currentTopics) !== JSON.stringify(desiredTopics)) {
    apiOps.push({
      id: 'repo-topics',
      method: 'PUT',
      endpoint: '/repos/{owner}/{repo}/topics',
      status: classifyPermission({ needsAdmin: true, hasAdmin }),
      payload: { names: desiredTopics },
    });
  }

  for (const label of desired.labels ?? []) {
    const exists = (current.labels ?? []).some((entry) => entry.name === label.name);
    if (!exists) {
      apiOps.push({
        id: `label:${label.name}`,
        method: 'POST',
        endpoint: '/repos/{owner}/{repo}/labels',
        status: classifyPermission({ needsAdmin: true, hasAdmin }),
        payload: label,
      });
    }
  }

  const comparableBranchProtection = pickDesiredShape(current.branchProtection ?? {}, desired.branchProtection ?? {});
  if (desired.branchProtection && JSON.stringify(comparableBranchProtection) !== JSON.stringify(desired.branchProtection)) {
    apiOps.push({
      id: 'branch-protection',
      method: 'PUT',
      endpoint: `/repos/{owner}/{repo}/branches/${desired.branchProtection.branch}/protection`,
      status: classifyPermission({ needsAdmin: true, hasAdmin }),
      payload: desired.branchProtection,
    });
  }

  return { apiOps, blockers: apiOps.filter((entry) => entry.status === 'permission-blocked') };
}

export async function applyFilePlan({ repoRoot, plan }) {
  const suggestionsDir = resolve(repoRoot, 'tooling/open-source-repository-setup/out/suggestions');
  await mkdir(suggestionsDir, { recursive: true });

  const result = { applied: [], skipped: [], blocked: [], suggestions: [] };

  for (const operation of plan.fileOps) {
    const absolute = resolve(repoRoot, operation.path);
    await mkdir(dirname(absolute), { recursive: true });

    if (operation.status === 'missing') {
      await writeFile(absolute, operation.desired, 'utf8');
      result.applied.push({ path: operation.path, action: 'created' });
      continue;
    }

    if (operation.status === 'present-compatible') {
      result.skipped.push({ path: operation.path, reason: operation.status });
      continue;
    }

    if (operation.strategy === 'managed-block') {
      await writeFile(absolute, operation.desired, 'utf8');
      result.applied.push({ path: operation.path, action: 'managed-block-updated' });
      continue;
    }

    const suggestionPath = resolve(suggestionsDir, `${operation.path.replaceAll('/', '__')}.patch.md`);
    await mkdir(dirname(suggestionPath), { recursive: true });
    await writeFile(
      suggestionPath,
      buildSuggestion({ path: operation.path, existing: operation.existing, desired: operation.desired, reason: operation.status }),
      'utf8',
    );
    result.suggestions.push({ path: operation.path, suggestionPath: suggestionPath.replace(`${repoRoot}/`, '') });
    result.skipped.push({ path: operation.path, reason: operation.status });
  }

  return result;
}

async function runGhApi({ method, endpoint, payload }) {
  const args = ['api', endpoint, '-X', method];
  let tempDir = null;
  let payloadPath = null;
  if (payload) {
    tempDir = await mkdtemp(resolve(tmpdir(), 'oss-setup-gh-'));
    payloadPath = resolve(tempDir, 'payload.json');
    await writeFile(payloadPath, JSON.stringify(payload), 'utf8');
    args.push('--input', payloadPath);
  }
  try {
    await execFileAsync('gh', args, { encoding: 'utf8' });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error.message ?? error) };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

export async function applyApiPlan({ repo, apiPlan, dryRun = true }) {
  const [owner, name] = repo.split('/');
  const applied = [];
  const blocked = [];
  const skipped = [];

  for (const operation of apiPlan.apiOps) {
    if (operation.status === 'permission-blocked') {
      blocked.push({ id: operation.id, reason: 'permission-blocked' });
      continue;
    }

    if (dryRun) {
      skipped.push({ id: operation.id, reason: 'dry-run' });
      continue;
    }

    const endpoint = operation.endpoint.replace('{owner}', owner).replace('{repo}', name);
    const res = await runGhApi({ method: operation.method, endpoint, payload: operation.payload });
    if (res.ok) {
      applied.push({ id: operation.id });
    } else {
      blocked.push({ id: operation.id, reason: res.error });
    }
  }

  return { applied, blocked, skipped };
}

async function loadManifest(repoRoot) {
  const content = await readFile(resolve(repoRoot, 'tooling/open-source-repository-setup/manifest.json'), 'utf8');
  return JSON.parse(content);
}

async function loadInspection(repoRoot) {
  const content = await readFile(resolve(repoRoot, 'tooling/open-source-repository-setup/out/inspection.json'), 'utf8');
  return JSON.parse(content);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const command = process.argv[2] ?? 'plan';
  const applyApi = process.argv.includes('--apply-api');
  const repoRoot = resolve(process.cwd());
  const outDir = resolve(repoRoot, 'tooling/open-source-repository-setup/out');
  const manifest = await loadManifest(repoRoot);
  const inspection = await loadInspection(repoRoot);

  const filePlan = await buildPlan({ repoRoot, targets: manifest.files });

  const dependabotOp = filePlan.fileOps.find((op) => op.path === '.github/dependabot.yml');
  if (dependabotOp) {
    dependabotOp.desired = reconcileDependabot({
      current: dependabotOp.desired,
      requiredEntries: manifest.dependabotTargets,
    });
  }

  const apiPlan = buildApiPlan({
    desired: {
      repo: manifest.github.repo,
      topics: manifest.github.topics,
      labels: manifest.github.requiredLabels,
      branchProtection: manifest.github.branchProtection,
    },
    current: {
      repo: inspection.github.repoSettings ?? {},
      labels: inspection.github.labels,
      topics: inspection.github.topics ?? [],
      branchProtection: inspection.github.branchProtection,
      permissions: inspection.permissions,
    },
  });

  const plan = {
    generatedAt: new Date().toISOString(),
    fileOps: filePlan.fileOps,
    apiOps: apiPlan.apiOps,
    blockers: [...inspection.blockers, ...apiPlan.blockers],
  };

  await writeJson(resolve(outDir, 'plan.json'), plan);

  if (command === 'plan') {
    return;
  }

  if (command === 'apply' || command === 'apply-files-only') {
    const files = await applyFilePlan({ repoRoot, plan });
    const api = command === 'apply'
      ? await applyApiPlan({ repo: 'ddgutierrezc/legato', apiPlan, dryRun: !applyApi })
      : { applied: [], blocked: [], skipped: [] };
    await writeJson(resolve(outDir, 'apply-result.json'), { files, api });
  }

  if (command === 'snapshot-templates') {
    await cp(resolve(repoRoot, 'tooling/open-source-repository-setup/templates'), resolve(outDir, 'templates-snapshot'), {
      recursive: true,
      force: true,
    });
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
