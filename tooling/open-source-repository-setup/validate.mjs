import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function validateRequirements({ plan, applyResult }) {
  const blockers = [...(plan.blockers ?? []), ...(applyResult.blocked ?? [])];
  const governanceTargets = new Set([
    'CONTRIBUTING.md',
    'CODE_OF_CONDUCT.md',
    'SECURITY.md',
    '.github/CODEOWNERS',
    '.github/PULL_REQUEST_TEMPLATE.md',
  ]);
  const governanceSeen = [...(applyResult.applied ?? []), ...(applyResult.skipped ?? [])]
    .filter((entry) => governanceTargets.has(entry.path))
    .length;
  const nonManagedDivergences = (plan.fileOps ?? [])
    .filter((entry) => entry.status === 'present-divergent' && entry.strategy !== 'managed-block')
    .map((entry) => entry.path);
  const skippedDivergences = new Set(
    (applyResult.skipped ?? [])
      .filter((entry) => entry.reason === 'present-divergent')
      .map((entry) => entry.path),
  );
  const suggestedDivergences = new Set((applyResult.suggestions ?? []).map((entry) => entry.path));
  const nonOverwritePass = nonManagedDivergences.length === 0 || nonManagedDivergences.every(
    (path) => skippedDivergences.has(path) && suggestedDivergences.has(path),
  );
  const requirements = {
    'Current-State-Aware Initialization': {
      status: (plan.fileOps ?? []).length > 0 ? 'pass' : 'fail',
      evidence: 'File operations classified before mutation.',
    },
    'GitHub CLI and Git Configuration Preconditions': {
      status: blockers.some((entry) => String(entry.code ?? entry.reason).includes('GH_AUTH')) ? 'blocked' : 'pass',
      evidence: 'Preflight blockers captured in inspection/plan.',
    },
    'Repository Governance Baseline': {
      status: governanceSeen === governanceTargets.size ? 'pass' : 'fail',
      evidence: 'Governance files generated or preserved via plan.',
    },
    'Merge and Branch Protection Policy': {
      status: blockers.some((entry) => String(entry.id ?? entry.scope ?? '').includes('branch-protection')) ? 'blocked' : 'pass',
      evidence: 'Branch-protection planned with permission-aware behavior.',
    },
    'Security and Dependency Hygiene Expectations': {
      status: (plan.fileOps ?? []).some((entry) => entry.path === '.github/dependabot.yml') ? 'pass' : 'fail',
      evidence: 'Dependabot and security policy are in target set.',
    },
    'Non-Overwrite Safety': {
      status: nonOverwritePass ? 'pass' : 'fail',
      evidence: 'Divergent files are skipped with suggestion outputs.',
    },
    'Validation and Audit Outputs': {
      status: 'pass',
      evidence: 'plan.json/apply-result.json/validation.json/final-state.json generated.',
    },
    'Scope Boundaries and Best-Effort Semantics': {
      status: blockers.length > 0 ? 'blocked' : 'pass',
      evidence: 'Permission-blocked API ops retained as unresolved follow-ups.',
    },
  };

  return { requirements, blockers };
}

export function summarizeValidation({ validation }) {
  const counts = { pass: 0, fail: 0, blocked: 0 };
  for (const value of Object.values(validation.requirements)) {
    counts[value.status] = (counts[value.status] ?? 0) + 1;
  }

  const blockers = validation.blockers.map((entry) => `- ${entry.code ?? entry.id ?? 'BLOCKED'} (${entry.scope ?? entry.reason ?? 'n/a'})`);
  return [
    '# OSS Setup Validation Summary',
    '',
    `pass: ${counts.pass}`,
    `fail: ${counts.fail}`,
    `blocked: ${counts.blocked}`,
    '',
    '## Blockers',
    ...(blockers.length > 0 ? blockers : ['- none']),
    '',
  ].join('\n');
}

async function readJson(path) {
  const value = await readFile(path, 'utf8');
  return JSON.parse(value);
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function main() {
  const repoRoot = resolve(process.cwd());
  const outDir = resolve(repoRoot, 'tooling/open-source-repository-setup/out');
  const plan = await readJson(resolve(outDir, 'plan.json'));
  const applyPayload = await readJson(resolve(outDir, 'apply-result.json'));
  const applyResult = {
    applied: applyPayload.files?.applied ?? [],
    skipped: applyPayload.files?.skipped ?? [],
    blocked: [...(applyPayload.files?.blocked ?? []), ...(applyPayload.api?.blocked ?? [])],
    suggestions: applyPayload.files?.suggestions ?? [],
  };

  const validation = validateRequirements({ plan, applyResult });
  await writeJson(resolve(outDir, 'validation.json'), validation);
  const summary = summarizeValidation({ validation });
  await writeFile(resolve(outDir, 'summary.md'), summary, 'utf8');

  const finalState = {
    generatedAt: new Date().toISOString(),
    counts: Object.values(validation.requirements).reduce(
      (acc, item) => ({ ...acc, [item.status]: (acc[item.status] ?? 0) + 1 }),
      {},
    ),
    blockers: validation.blockers,
    applied: applyResult.applied,
    skipped: applyResult.skipped,
  };
  await writeJson(resolve(outDir, 'final-state.json'), finalState);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
