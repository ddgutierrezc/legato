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

export const slugReleaseKey = (releaseKey) => String(releaseKey ?? '').trim().replaceAll('/', '-');

export const buildCanonicalRefs = ({ releaseIdentity, releaseId }) => {
  const releaseKey = String(releaseIdentity?.release_key ?? '').trim();
  const slug = slugReleaseKey(releaseKey);
  const canonical = {
    narrative_ref: slug ? `docs/releases/notes/${slug}.json` : '',
    ios_derivative_ref: slug ? `docs/releases/notes/${slug}-ios-derivative.md` : '',
    changelog_anchor: slug ? `CHANGELOG.md#release-${slug}` : '',
  };
  const compatibility = {
    narrative_ref: `docs/releases/notes/${releaseId}.json`,
    ios_derivative_ref: `docs/releases/notes/${releaseId}-ios-derivative.md`,
    changelog_anchor: `CHANGELOG.md#r-${String(releaseId ?? '').toLowerCase()}`,
  };
  return { canonical, compatibility };
};

export const resolveInputRefWithCompatibility = async ({ repoRoot, canonicalRef, compatibilityRef }) => {
  const canonicalPath = resolve(repoRoot, String(canonicalRef ?? '').trim());
  if (String(canonicalRef ?? '').trim() && await pathExists(canonicalPath)) {
    return { resolvedRef: canonicalRef, resolvedPath: canonicalPath, usedAlias: false };
  }
  const compatibilityPath = resolve(repoRoot, String(compatibilityRef ?? '').trim());
  if (String(compatibilityRef ?? '').trim() && await pathExists(compatibilityPath)) {
    return { resolvedRef: canonicalRef, resolvedPath: compatibilityPath, usedAlias: true };
  }
  return { resolvedRef: canonicalRef, resolvedPath: canonicalPath, usedAlias: false, missing: true };
};

export const resolveReleasePaths = ({ repoRoot, releaseId, releaseIdentity } = {}) => {
  const base = {
    repoRoot: resolve(repoRoot ?? process.cwd()),
    releaseId: String(releaseId ?? '').trim(),
  };
  const root = base.repoRoot;
  const normalizedReleaseId = base.releaseId;
  const artifactRoot = resolve(root, 'apps/capacitor-demo/artifacts/release-control', normalizedReleaseId || 'missing-release-id');
  const canonicalRefs = buildCanonicalRefs({ releaseIdentity, releaseId: normalizedReleaseId });
  return {
    ...base,
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
    canonicalNarrativePath: resolve(root, canonicalRefs.canonical.narrative_ref),
    compatibilityNarrativePath: resolve(root, canonicalRefs.compatibility.narrative_ref),
  };
};

export const toRepoRelativePath = (repoRoot, absolutePath) => {
  const normalizedRoot = resolve(repoRoot ?? process.cwd());
  const normalizedAbsolute = resolve(absolutePath ?? '');
  const rel = relative(normalizedRoot, normalizedAbsolute);
  return rel.startsWith('..') ? normalizedAbsolute : rel.replaceAll('\\', '/');
};
