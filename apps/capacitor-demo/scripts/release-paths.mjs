import { access } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const pathExists = async (path) => access(path).then(() => true).catch(() => false);

const isRepoRoot = async (candidateRoot) => {
  const requiredPaths = [
    'packages/capacitor/package.json',
    'packages/contract/package.json',
  ];
  for (const requiredPath of requiredPaths) {
    if (!await pathExists(resolve(candidateRoot, requiredPath))) {
      return false;
    }
  }
  return true;
};

export const resolveLegatoRepoRoot = async ({ repoRoot } = {}) => {
  if (repoRoot) {
    const explicitRoot = resolve(repoRoot);
    if (!await isRepoRoot(explicitRoot)) {
      throw new Error(`PATH_OR_CWD: repo root does not contain required release manifests (${explicitRoot}).`);
    }
    return explicitRoot;
  }

  const candidates = [
    process.cwd(),
    resolve(scriptDir, '../../..'),
    resolve(scriptDir, '../..'),
  ];

  for (const candidate of candidates) {
    if (await isRepoRoot(candidate)) {
      return candidate;
    }
  }

  throw new Error('PATH_OR_CWD: unable to resolve repository root from cwd or script-relative candidates.');
};

export const resolveReleasePaths = ({ repoRoot, releaseId } = {}) => {
  const root = resolve(repoRoot ?? process.cwd());
  const normalizedReleaseId = String(releaseId ?? '').trim();
  const artifactRoot = resolve(root, 'apps/capacitor-demo/artifacts/release-control', normalizedReleaseId || 'missing-release-id');

  return {
    repoRoot: root,
    releaseId: normalizedReleaseId,
    artifactRoot,
    packetPath: resolve(artifactRoot, 'release-execution-packet.json'),
    summaryPath: resolve(artifactRoot, 'summary.json'),
    factsPath: resolve(artifactRoot, 'release-facts.json'),
    reconciliationPath: resolve(artifactRoot, 'reconciliation-report.json'),
    closureBundlePath: resolve(artifactRoot, 'closure-bundle.json'),
    freshHeadCloseoutPath: resolve(artifactRoot, 'fresh-head-closeout.json'),
    narrativePath: resolve(root, `docs/releases/notes/${normalizedReleaseId}.json`),
    derivativeNotesPath: resolve(root, `docs/releases/notes/${normalizedReleaseId}-ios-derivative.md`),
    changelogPath: resolve(root, 'CHANGELOG.md'),
  };
};

export const toRepoRelativePath = (repoRoot, absolutePath) => {
  const normalizedRoot = resolve(repoRoot ?? process.cwd());
  const normalizedAbsolute = resolve(absolutePath ?? '');
  const rel = relative(normalizedRoot, normalizedAbsolute);
  return rel.startsWith('..') ? normalizedAbsolute : rel.replaceAll('\\', '/');
};
