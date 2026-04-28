import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { evaluateReleasePreflightCompleteness } from './release-preflight-completeness.mjs';

const setupRepo = async ({ releaseId, withNarrative = true, withDerivative = false } = {}) => {
  const root = await mkdtemp(resolve(tmpdir(), 'legato-release-preflight-'));
  await mkdir(resolve(root, 'docs/releases/notes'), { recursive: true });
  if (withNarrative) {
    await writeFile(resolve(root, `docs/releases/notes/${releaseId}.json`), JSON.stringify({
      summary: 'Narrative',
    }, null, 2));
  }
  if (withDerivative) {
    await writeFile(resolve(root, `docs/releases/notes/${releaseId}-ios-derivative.md`), 'Derivative notes\n');
  }
  await mkdir(resolve(root, `apps/capacitor-demo/artifacts/release-control/${releaseId}`), { recursive: true });
  await writeFile(resolve(root, `apps/capacitor-demo/artifacts/release-control/${releaseId}/release-execution-packet.json`), JSON.stringify({
    schema_version: 'release-execution-packet/v1',
    release_id: releaseId,
    phase: 'preflight',
    repo_root: root,
    selected_targets: ['ios', 'npm'],
    target_modes: { ios: 'publish', npm: 'protected-publish' },
    inputs: {
      narrative_ref: `docs/releases/notes/${releaseId}.json`,
      ios_derivative_ref: `docs/releases/notes/${releaseId}-ios-derivative.md`,
      changelog_anchor: `CHANGELOG.md#r-${releaseId.toLowerCase()}`,
      npm_package_target: 'contract',
    },
    artifacts: {
      summary_ref: `apps/capacitor-demo/artifacts/release-control/${releaseId}/summary.json`,
      facts_ref: `apps/capacitor-demo/artifacts/release-control/${releaseId}/release-facts.json`,
      reconciliation_ref: `apps/capacitor-demo/artifacts/release-control/${releaseId}/reconciliation-report.json`,
      closure_bundle_ref: `apps/capacitor-demo/artifacts/release-control/${releaseId}/closure-bundle.json`,
    },
  }, null, 2));
  return root;
};

test('release preflight passes with lane-scoped requirements for ios+npm selection', async () => {
  const releaseId = 'R-2026.04.27.1';
  const repoRoot = await setupRepo({ releaseId, withNarrative: true, withDerivative: true });

  const result = await evaluateReleasePreflightCompleteness({
    repoRoot,
    releasePacketPath: resolve(repoRoot, `apps/capacitor-demo/artifacts/release-control/${releaseId}/release-execution-packet.json`),
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.diagnostics, []);
});

test('release preflight fails closed when release packet is missing', async () => {
  const releaseId = 'R-2026.04.27.9';
  const repoRoot = await setupRepo({ releaseId, withNarrative: true, withDerivative: true });

  const result = await evaluateReleasePreflightCompleteness({
    repoRoot,
    releasePacketPath: resolve(repoRoot, `apps/capacitor-demo/artifacts/release-control/${releaseId}/missing-packet.json`),
  });

  assert.equal(result.ok, false);
  assert.equal(result.diagnostics[0].code, 'MISSING_RELEASE_PACKET');
});

test('release preflight fails with missing narrative/derivative notes reason code', async () => {
  const releaseId = 'R-2026.04.27.2';
  const repoRoot = await setupRepo({ releaseId, withNarrative: false, withDerivative: false });

  const result = await evaluateReleasePreflightCompleteness({
    repoRoot,
    releaseId,
    selectedTargets: ['ios'],
    changelogAnchor: 'CHANGELOG.md#r-r-202604272',
  });

  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.missing), /narrative_file/i);
  assert.match(JSON.stringify(result.missing), /ios_derivative_notes_file/i);
  assert.equal(result.diagnostics[0].code, 'MISSING_NARRATIVE_OR_DERIVATIVE_NOTES');
});

test('release preflight keeps npm-only fields optional when npm target is not selected', async () => {
  const releaseId = 'R-2026.04.27.3';
  const repoRoot = await setupRepo({ releaseId, withNarrative: true, withDerivative: true });

  const result = await evaluateReleasePreflightCompleteness({
    repoRoot,
    releaseId,
    selectedTargets: ['ios'],
    changelogAnchor: 'CHANGELOG.md#r-r-202604273',
    npmPackageTarget: '',
  });

  assert.equal(result.ok, true);
  assert.equal(result.missing.length, 0);
  assert.equal(result.diagnostics.length, 0);
});

test('release preflight reports package target scope violations with canonical reason code', async () => {
  const releaseId = 'R-2026.04.27.4';
  const repoRoot = await setupRepo({ releaseId, withNarrative: true, withDerivative: false });

  const result = await evaluateReleasePreflightCompleteness({
    repoRoot,
    releaseId,
    selectedTargets: ['npm'],
    npmPackageTarget: 'mobile-app',
    changelogAnchor: 'CHANGELOG.md#r-r-202604274',
  });

  assert.equal(result.ok, false);
  assert.match(JSON.stringify(result.missing), /npm_package_target/i);
  assert.equal(result.diagnostics[0].code, 'PACKAGE_TARGET_SCOPE');
});
