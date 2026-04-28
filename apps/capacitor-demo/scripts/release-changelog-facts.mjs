import { access, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { resolveLegatoRepoRoot, resolveReleasePaths, toRepoRelativePath } from './release-paths.mjs';
import { validateReleaseExecutionPacketEnvelope } from './release-control-summary-schema.mjs';

const readJson = async (path) => JSON.parse(await readFile(path, 'utf8'));

const pathExists = async (path) => access(path).then(() => true).catch(() => false);

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

export const buildReleaseChangelogFacts = async ({ repoRoot, releaseId, releaseSummaryPath, releasePacketPath } = {}) => {
  const resolvedRoot = await resolveLegatoRepoRoot({ repoRoot });
  const effectiveReleaseId = String(releaseId ?? '').trim();
  const resolvedPaths = resolveReleasePaths({ repoRoot: resolvedRoot, releaseId: effectiveReleaseId });
  const packetPath = resolve(releasePacketPath ?? resolvedPaths.packetPath);
  let summaryPath = releaseSummaryPath ? resolve(releaseSummaryPath) : '';

  const packet = await readJson(packetPath).catch(() => {
    throw new Error(`MISSING_RELEASE_PACKET: Missing required release packet at ${packetPath}`);
  });
  const packetValidation = validateReleaseExecutionPacketEnvelope(packet);
  if (!packetValidation.ok) {
    throw new Error(`SERIALIZATION_ERROR: release packet invalid (${packetValidation.errors.join('; ')})`);
  }

  const packetReleaseId = String(packet.release_id ?? '').trim();
  const effectiveId = effectiveReleaseId || packetReleaseId;

  if (!summaryPath) {
    if (!effectiveId) {
      throw new Error('release_id is required when --summary is not provided.');
    }

    const candidatePaths = [
      resolve(resolvedRoot, packet?.artifacts?.summary_ref ?? ''),
      resolve(resolvedRoot, 'apps/capacitor-demo/artifacts/release-control', effectiveId, 'summary.json'),
      resolve(resolvedRoot, 'artifacts/release-control', effectiveId, 'summary.json'),
    ];
    summaryPath = candidatePaths[0];
    for (const candidate of candidatePaths) {
      if (await pathExists(candidate)) {
        summaryPath = candidate;
        break;
      }
    }
  }

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

  const canonicalReleaseId = effectiveId || String(summary.release_id ?? '').trim();
  const releaseTag = `release/${canonicalReleaseId}`;

  return {
    release_id: canonicalReleaseId,
    release_tag: releaseTag,
    release_packet_ref: toRepoRelativePath(resolvedRoot, packetPath),
    source_commit: String(summary.source_commit ?? '').trim(),
    generated_at: toIso(),
    protocol: {
      required_step_order: ['preflight', 'publish', 'reconcile', 'closeout'],
      packet_phase: String(packet.phase ?? '').trim(),
    },
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
    authority: {
      canonical_repo: 'legato',
      canonical_surfaces: ['CHANGELOG.md', 'GitHub release'],
      ios_distribution_repo: 'legato-ios-core',
      ios_derivative_required: true,
    },
    target_procedures: {
      android: {
        procedure_id: 'android.maven.publish.v1',
        source_of_truth: '.github/workflows/release-android.yml',
        publish_step_ref: 'android-publish',
        verification_step_ref: 'android-verify',
         durable_evidence_ref: `apps/capacitor-demo/artifacts/release-control/${canonicalReleaseId}/android-summary.json`,
        rollback_or_hold_rule: 'preflight-only maps to blocked; publish failures map to failed.',
      },
      npm: {
        procedure_id: 'npm.protected_publish.v1',
        source_of_truth: '.github/workflows/release-npm.yml',
        publish_step_ref: 'release:npm:execute protected-publish',
        verification_step_ref: 'npm view <name>@<version> version --json',
        durable_evidence_ref: npmVersionUrl(String(contractPackage.name), contractVersion),
        rollback_or_hold_rule: 'policy/readiness failures block protected publish; immutable version may resolve already_published.',
      },
      ios: {
        procedure_id: 'ios.distribution_publish.v1',
        source_of_truth: '.github/workflows/release-control.yml',
        publish_step_ref: 'ios-lane publish',
        verification_step_ref: 'release-ios-execution.mjs verify',
        durable_evidence_ref: iosTagUrl(nativeArtifacts?.ios?.packageUrl, iosVersion),
        rollback_or_hold_rule: 'immutable tag exists => already_published; otherwise publish and verify remote tag.',
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
           path: `apps/capacitor-demo/artifacts/release-control/${canonicalReleaseId}/summary.json`,
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
    if (arg === '--release-packet' && args[i + 1]) {
      options.releasePacketPath = args[i + 1];
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
