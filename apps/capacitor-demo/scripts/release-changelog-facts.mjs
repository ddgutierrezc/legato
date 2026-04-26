import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const toIso = () => new Date().toISOString();

const normalizeVersion = (value) => String(value ?? '').trim();

const ensureSummaryShape = (summary) => {
  if (!summary || typeof summary !== 'object') {
    throw new Error('summary.json must be a valid JSON object.');
  }
  if (!String(summary.release_id ?? '').trim()) {
    throw new Error('summary.json must include release_id.');
  }
  if (!summary.targets || typeof summary.targets !== 'object') {
    throw new Error('summary.json must include targets map.');
  }
};

const npmVersionUrl = (name, version) => `https://www.npmjs.com/package/${encodeURIComponent(name).replace('%40', '@')}/v/${version}`;
const mavenVersionUrl = (group, artifact, version) => {
  const groupPath = group.split('.').join('/');
  return `https://repo1.maven.org/maven2/${groupPath}/${artifact}/${version}/`;
};
const iosTagUrl = (packageUrl, version) => `${String(packageUrl ?? '').replace(/\.git$/, '')}/releases/tag/v${String(version ?? '').replace(/^v/, '')}`;

export const buildReleaseChangelogFacts = async ({ repoRoot = resolve(scriptDir, '../..'), releaseId, releaseSummaryPath } = {}) => {
  const resolvedRoot = resolve(repoRoot);
  const effectiveReleaseId = String(releaseId ?? '').trim();
  const summaryPath = releaseSummaryPath
    ? resolve(releaseSummaryPath)
    : resolve(resolvedRoot, 'apps/capacitor-demo/artifacts/release-control', effectiveReleaseId, 'summary.json');

  const summary = await readJson(summaryPath).catch(() => {
    throw new Error(`Missing required release summary.json at ${summaryPath}`);
  });
  ensureSummaryShape(summary);

  const capacitorPackage = await readJson(resolve(resolvedRoot, 'packages/capacitor/package.json'));
  const contractPackage = await readJson(resolve(resolvedRoot, 'packages/contract/package.json'));
  const nativeArtifacts = await readJson(resolve(resolvedRoot, 'packages/capacitor/native-artifacts.json'));

  const capacitorVersion = normalizeVersion(capacitorPackage.version);
  const contractVersion = normalizeVersion(contractPackage.version);
  const androidVersion = normalizeVersion(nativeArtifacts?.android?.version);
  const iosVersion = normalizeVersion(nativeArtifacts?.ios?.version);

  const effectiveId = effectiveReleaseId || String(summary.release_id ?? '').trim();
  const releaseTag = `release/${effectiveId}`;

  return {
    release_id: effectiveId,
    release_tag: releaseTag,
    source_commit: String(summary.source_commit ?? '').trim(),
    generated_at: toIso(),
    targets: ['android', 'ios', 'npm'].map((target) => {
      const value = summary.targets[target] ?? {};
      return {
        target,
        selected: Boolean(value.selected),
        terminal_status: String(value.terminal_status ?? 'not_selected').trim() || 'not_selected',
      };
    }),
    versions: {
      npm: {
        capacitor: {
          name: String(capacitorPackage.name ?? '@ddgutierrezc/legato-capacitor'),
          version: capacitorVersion,
        },
        contract: {
          name: String(contractPackage.name ?? '@ddgutierrezc/legato-contract'),
          version: contractVersion,
        },
      },
      android: {
        repository_url: String(nativeArtifacts?.android?.repositoryUrl ?? ''),
        group: String(nativeArtifacts?.android?.group ?? ''),
        artifact: String(nativeArtifacts?.android?.artifact ?? ''),
        version: androidVersion,
      },
      ios: {
        package_url: String(nativeArtifacts?.ios?.packageUrl ?? ''),
        package_name: String(nativeArtifacts?.ios?.packageName ?? ''),
        product: String(nativeArtifacts?.ios?.product ?? ''),
        version: iosVersion,
      },
    },
    evidence: {
      durable: [
        {
          label: 'npm capacitor package',
          url: npmVersionUrl(String(capacitorPackage.name), capacitorVersion),
        },
        {
          label: 'npm contract package',
          url: npmVersionUrl(String(contractPackage.name), contractVersion),
        },
        {
          label: 'maven android artifact',
          url: mavenVersionUrl(String(nativeArtifacts?.android?.group ?? ''), String(nativeArtifacts?.android?.artifact ?? ''), androidVersion),
        },
        {
          label: 'ios distribution release tag',
          url: iosTagUrl(nativeArtifacts?.ios?.packageUrl, iosVersion),
        },
        {
          label: 'native contract',
          path: 'packages/capacitor/native-artifacts.json',
        },
        {
          label: 'cap package manifest',
          path: 'packages/capacitor/package.json',
        },
        {
          label: 'contract package manifest',
          path: 'packages/contract/package.json',
        },
      ],
      ephemeral: [
        {
          label: 'release control summary',
          path: `apps/capacitor-demo/artifacts/release-control/${effectiveId}/summary.json`,
        },
      ],
    },
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--repo-root' && args[i + 1]) {
      options.repoRoot = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-id' && args[i + 1]) {
      options.releaseId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--summary' && args[i + 1]) {
      options.releaseSummaryPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output' && args[i + 1]) {
      options.output = args[i + 1];
      i += 1;
    }
  }

  const facts = await buildReleaseChangelogFacts(options);
  if (options.output) {
    await writeFile(resolve(options.output), `${JSON.stringify(facts, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify(facts, null, 2)}\n`);
}
