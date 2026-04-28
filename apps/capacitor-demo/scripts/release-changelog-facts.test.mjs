import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { buildReleaseChangelogFacts } from './release-changelog-facts.mjs';

const createFixtureRepo = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'legato-release-facts-'));
  await mkdir(resolve(root, 'packages/capacitor'), { recursive: true });
  await mkdir(resolve(root, 'packages/contract'), { recursive: true });
  await mkdir(resolve(root, 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1'), { recursive: true });

  await writeFile(resolve(root, 'packages/capacitor/package.json'), JSON.stringify({
    name: '@ddgutierrezc/legato-capacitor',
    version: '0.1.9',
  }, null, 2));
  await writeFile(resolve(root, 'packages/contract/package.json'), JSON.stringify({
    name: '@ddgutierrezc/legato-contract',
    version: '0.1.5',
  }, null, 2));
  await writeFile(resolve(root, 'packages/capacitor/native-artifacts.json'), JSON.stringify({
    android: {
      repositoryUrl: 'https://repo1.maven.org/maven2',
      group: 'dev.dgutierrez',
      artifact: 'legato-android-core',
      version: '0.1.3',
    },
    ios: {
      packageUrl: 'https://github.com/ddgutierrezc/legato-ios-core.git',
      packageName: 'LegatoCore',
      product: 'LegatoCore',
      version: '0.1.1',
    },
  }, null, 2));

  await writeFile(resolve(root, 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/summary.json'), JSON.stringify({
    release_id: 'R-2026.04.26.1',
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    targets: {
      android: { target: 'android', selected: true, terminal_status: 'published' },
      ios: { target: 'ios', selected: true, terminal_status: 'published' },
      npm: { target: 'npm', selected: true, terminal_status: 'published' },
    },
  }, null, 2));

  await writeFile(resolve(root, 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/release-execution-packet.json'), JSON.stringify({
    schema_version: 'release-execution-packet/v1',
    release_id: 'R-2026.04.26.1',
    phase: 'reconcile',
    repo_root: root,
    selected_targets: ['android', 'ios', 'npm'],
    target_modes: { android: 'publish', ios: 'publish', npm: 'protected-publish' },
    inputs: {
      narrative_ref: 'docs/releases/notes/R-2026.04.26.1.json',
      ios_derivative_ref: 'docs/releases/notes/R-2026.04.26.1-ios-derivative.md',
      changelog_anchor: 'CHANGELOG.md#r-r-202604261',
      npm_package_target: 'contract',
    },
    artifacts: {
      summary_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/summary.json',
      facts_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/release-facts.json',
      reconciliation_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/reconciliation-report.json',
      closure_bundle_ref: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/closure-bundle.json',
    },
  }, null, 2));

  return root;
};

test('buildReleaseChangelogFacts derives target and version facts from summary + package manifests', async () => {
  const repoRoot = await createFixtureRepo();
  const facts = await buildReleaseChangelogFacts({
    repoRoot,
    releaseId: 'R-2026.04.26.1',
    releasePacketPath: resolve(repoRoot, 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/release-execution-packet.json'),
  });

  assert.equal(facts.release_id, 'R-2026.04.26.1');
  assert.equal(facts.release_tag, 'release/R-2026.04.26.1');
  assert.equal(facts.source_commit, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(facts.versions.npm.capacitor.version, '0.1.9');
  assert.equal(facts.versions.npm.contract.version, '0.1.5');
  assert.equal(facts.versions.android.version, '0.1.3');
  assert.equal(facts.versions.ios.version, '0.1.1');
  assert.equal(facts.targets.length, 3);
  assert.equal(facts.authority.canonical_repo, 'legato');
  assert.equal(facts.authority.ios_distribution_repo, 'legato-ios-core');
  assert.equal(facts.authority.ios_derivative_required, true);
  assert.equal(facts.target_procedures.android.procedure_id, 'android.maven.publish.v1');
  assert.equal(facts.target_procedures.npm.procedure_id, 'npm.protected_publish.v1');
  assert.equal(facts.target_procedures.ios.procedure_id, 'ios.distribution_publish.v1');
  assert.match(JSON.stringify(facts.evidence.durable), /npmjs\.com\/package\//i);
  assert.match(JSON.stringify(facts.evidence.durable), /maven/i);
  assert.match(JSON.stringify(facts.evidence.durable), /legato-ios-core\/releases\/tag/i);
  assert.match(JSON.stringify(facts.evidence.ephemeral), /summary\.json/i);
  assert.equal(facts.release_packet_ref, 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/release-execution-packet.json');
  assert.equal(facts.protocol.required_step_order.join('>'), 'preflight>publish>reconcile>closeout');
});

test('buildReleaseChangelogFacts fails closed when release packet is missing for release id', async () => {
  const repoRoot = await createFixtureRepo();

  await assert.rejects(
    () => buildReleaseChangelogFacts({ repoRoot, releaseId: 'R-2026.04.99.9' }),
    /MISSING_RELEASE_PACKET/i,
  );
});

test('buildReleaseChangelogFacts reports PATH_OR_CWD when repo root is not a release workspace', async () => {
  const repoRoot = await createFixtureRepo();

  await assert.rejects(
    () => buildReleaseChangelogFacts({
      repoRoot: resolve(repoRoot, 'docs'),
      releaseId: 'R-2026.04.26.1',
    }),
    /PATH_OR_CWD/i,
  );
});
