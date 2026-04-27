import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { buildReleaseClosureBundle, writeReleaseClosureBundle } from './release-closure-bundle.mjs';

const createFixture = async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'legato-release-closure-'));
  const releaseId = 'R-2026.04.27.5';
  const artifactRoot = resolve(root, `apps/capacitor-demo/artifacts/release-control/${releaseId}`);
  await mkdir(artifactRoot, { recursive: true });

  await writeFile(resolve(artifactRoot, 'summary.json'), JSON.stringify({
    release_id: releaseId,
    source_commit: '0123456789abcdef0123456789abcdef01234567',
    targets: {
      android: { target: 'android', selected: true, terminal_status: 'published' },
      ios: { target: 'ios', selected: true, terminal_status: 'already_published' },
      npm: { target: 'npm', selected: false, terminal_status: 'not_selected' },
    },
  }, null, 2));

  await writeFile(resolve(artifactRoot, 'release-facts.json'), JSON.stringify({
    evidence: {
      durable: [
        { label: 'npm capacitor package', url: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9' },
        { label: 'ios distribution release tag', url: 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1' },
      ],
    },
  }, null, 2));

  await writeFile(resolve(artifactRoot, 'reconciliation-report.json'), JSON.stringify({ ok: true, errors: [] }, null, 2));

  return { root, releaseId, artifactRoot };
};

test('release closure bundle builds canonical traceability contract with reference-only links', async () => {
  const fixture = await createFixture();
  const bundle = await buildReleaseClosureBundle({
    releaseId: fixture.releaseId,
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    runUrl: 'https://github.com/ddgutierrezc/legato/actions/runs/123456789',
    summaryPath: resolve(fixture.artifactRoot, 'summary.json'),
    factsPath: resolve(fixture.artifactRoot, 'release-facts.json'),
    reconciliationPath: resolve(fixture.artifactRoot, 'reconciliation-report.json'),
    evidenceIndexRefs: ['docs/releases/evidence-index/R-2026.04.27.5.json'],
  });

  assert.equal(bundle.schema_version, 'release-closure-bundle/v1');
  assert.equal(bundle.release_id, fixture.releaseId);
  assert.equal(bundle.source_commit, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(bundle.reconciliation_verdict, 'pass');
  assert.ok(Array.isArray(bundle.published_artifacts));
  assert.ok(bundle.published_artifacts.length >= 2);
  assert.ok(bundle.published_artifacts.every((entry) => !Object.prototype.hasOwnProperty.call(entry, 'payload')));
});

test('release closure bundle writer emits json and pointer markdown artifacts', async () => {
  const fixture = await createFixture();
  const output = await writeReleaseClosureBundle({
    releaseId: fixture.releaseId,
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    runUrl: 'https://github.com/ddgutierrezc/legato/actions/runs/123456789',
    summaryPath: resolve(fixture.artifactRoot, 'summary.json'),
    factsPath: resolve(fixture.artifactRoot, 'release-facts.json'),
    reconciliationPath: resolve(fixture.artifactRoot, 'reconciliation-report.json'),
    evidenceIndexRefs: ['docs/releases/evidence-index/R-2026.04.27.5.json'],
    outputDir: fixture.artifactRoot,
  });

  const pointerMarkdown = await readFile(output.pointerPath, 'utf8');
  assert.match(pointerMarkdown, /closure-bundle\.json/i);
  assert.match(pointerMarkdown, /source_commit/i);
});

test('release closure bundle fails closed when required source commit is missing', async () => {
  const fixture = await createFixture();

  await assert.rejects(
    () => buildReleaseClosureBundle({
      releaseId: fixture.releaseId,
      sourceCommit: '',
      runUrl: 'https://github.com/ddgutierrezc/legato/actions/runs/123456789',
      summaryPath: resolve(fixture.artifactRoot, 'summary.json'),
      factsPath: resolve(fixture.artifactRoot, 'release-facts.json'),
      reconciliationPath: resolve(fixture.artifactRoot, 'reconciliation-report.json'),
      evidenceIndexRefs: ['docs/releases/evidence-index/R-2026.04.27.5.json'],
    }),
    /source_commit is required/i,
  );
});
