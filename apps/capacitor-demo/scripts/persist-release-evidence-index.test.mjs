import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { persistReleaseEvidenceIndex } from './persist-release-evidence-index.mjs';

test('persistReleaseEvidenceIndex writes durable dossier markdown and machine-readable index', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'legato-evidence-index-'));
  const result = await persistReleaseEvidenceIndex({
    repoRoot: root,
    releaseId: 'R-2026.04.26.1',
    sourceCommit: '0123456789abcdef0123456789abcdef01234567',
    durableEvidence: [
      { label: 'npm capacitor', url: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9' },
    ],
    ephemeralEvidence: [
      { label: 'summary artifact', url: 'https://github.com/example/actions/runs/1/artifacts/2' },
    ],
  });

  const markdown = await readFile(result.dossierPath, 'utf8');
  const indexJson = JSON.parse(await readFile(result.indexPath, 'utf8'));

  assert.match(markdown, /^# Release Evidence Dossier/m);
  assert.match(markdown, /R-2026\.04\.26\.1/);
  assert.match(markdown, /source_commit/i);
  assert.match(markdown, /Ephemeral evidence/i);
  assert.match(markdown, /expires|retention/i);
  assert.equal(indexJson.release_id, 'R-2026.04.26.1');
  assert.equal(indexJson.source_commit, '0123456789abcdef0123456789abcdef01234567');
  assert.equal(indexJson.durable.length, 1);
  assert.equal(indexJson.ephemeral.length, 1);
});

test('persistReleaseEvidenceIndex flags missing ephemeral URL without failing the durable index write', async () => {
  const root = await mkdtemp(resolve(tmpdir(), 'legato-evidence-index-'));
  const result = await persistReleaseEvidenceIndex({
    repoRoot: root,
    releaseId: 'R-2026.04.26.2',
    sourceCommit: 'fedcba9876543210fedcba9876543210fedcba98',
    durableEvidence: [
      { label: 'maven', url: 'https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.3/' },
    ],
    ephemeralEvidence: [
      { label: 'summary artifact', url: '' },
    ],
  });

  const indexJson = JSON.parse(await readFile(result.indexPath, 'utf8'));
  assert.equal(indexJson.ephemeral[0].status, 'missing_or_expired');
  assert.match(indexJson.ephemeral[0].note, /informational/i);
});
