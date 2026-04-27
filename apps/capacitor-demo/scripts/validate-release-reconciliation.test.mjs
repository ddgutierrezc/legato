import test from 'node:test';
import assert from 'node:assert/strict';

import { validateReleaseReconciliation } from './validate-release-reconciliation.mjs';

const baseFacts = {
  release_id: 'R-2026.04.26.1',
  source_commit: '0123456789abcdef0123456789abcdef01234567',
  versions: {
    npm: {
      capacitor: { version: '0.1.9' },
      contract: { version: '0.1.5' },
    },
    android: { version: '0.1.3' },
    ios: { version: '0.1.1' },
  },
  targets: [
    { target: 'android', selected: true, terminal_status: 'published' },
    { target: 'ios', selected: true, terminal_status: 'published' },
    { target: 'npm', selected: true, terminal_status: 'published' },
  ],
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
      durable_evidence_ref: 'apps/capacitor-demo/artifacts/release-control/<release_id>/android-summary.json',
      rollback_or_hold_rule: 'preflight-only maps to blocked; publish failures map to failed',
    },
    ios: {
      procedure_id: 'ios.distribution_publish.v1',
      source_of_truth: '.github/workflows/release-control.yml',
      publish_step_ref: 'ios-lane publish',
      verification_step_ref: 'release-ios-execution.mjs verify',
      durable_evidence_ref: 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1',
      rollback_or_hold_rule: 'existing immutable tag reports already_published',
    },
    npm: {
      procedure_id: 'npm.protected_publish.v1',
      source_of_truth: '.github/workflows/release-npm.yml',
      publish_step_ref: 'release:npm:execute protected-publish',
      verification_step_ref: 'npm view <name>@<version> version --json',
      durable_evidence_ref: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9',
      rollback_or_hold_rule: 'policy lane blocks protected publish without intent evidence',
    },
  },
  evidence: {
    durable: [
      { label: 'npm capacitor', url: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9' },
      { label: 'maven android artifact', url: 'https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.3/' },
      { label: 'ios distribution release tag', url: 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1' },
    ],
    ephemeral: [{ label: 'summary', path: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/summary.json' }],
  },
};

const releaseNotes = `## Summary
- release_id: \`R-2026.04.26.1\`
- source_commit: \`0123456789abcdef0123456789abcdef01234567\`
- canonical_repo: \`legato\`
- ios_derivative_release: \`https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1\`

## Highlights
### Required Human Narrative
- Why it matters: Quality
- User impact: Clarity
- Upgrade notes: Run npm install
- Breaking changes: None
- Affected platforms: android, ios, npm

## Compatibility Matrix
| Surface | Version |
|---|---|
| npm capacitor | 0.1.9 |
| npm contract | 0.1.5 |
| android | 0.1.3 |
| ios | 0.1.1 |

## Installation/Upgrade
- npm install

## Evidence
- https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9
- https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.3/
- https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1

## Known Limitations
- Ephemeral artifact links are informational only.

## Full Changelog Link
- CHANGELOG.md#r-202604261---2026-04-26
`;

const derivativeReleaseNotes = `## iOS Distribution Summary
- release_id: \`R-2026.04.26.1\`
- canonical_legato_release: https://github.com/ddgutierrezc/legato/releases/tag/release/R-2026.04.26.1
- canonical_changelog_anchor: CHANGELOG.md#r-202604261---2026-04-26
- ios_distribution_release: https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1
`;

const changelog = `# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [R-2026.04.26.1] - 2026-04-26
### Added
- npm capacitor 0.1.9, npm contract 0.1.5, android 0.1.3, ios 0.1.1.
`;

test('validateReleaseReconciliation passes when release notes/changelog/facts align', () => {
  const result = validateReleaseReconciliation({
    facts: baseFacts,
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes,
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateReleaseReconciliation fails on version drift and missing durable evidence links', () => {
  const result = validateReleaseReconciliation({
    facts: {
      ...baseFacts,
      evidence: {
        durable: [],
        ephemeral: [{ label: 'summary', path: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/summary.json' }],
      },
    },
    releaseNotesMarkdown: releaseNotes.replaceAll('0.1.9', '0.2.0'),
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /version mismatch/i);
  assert.match(result.errors.join('\n'), /durable evidence/i);
});

test('validateReleaseReconciliation fails when required human narrative field is removed after manual edit', () => {
  const manuallyEditedReleaseNotes = releaseNotes.replace('- Breaking changes: None\n', '');
  const result = validateReleaseReconciliation({
    facts: baseFacts,
    releaseNotesMarkdown: manuallyEditedReleaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /breaking changes/i);
  assert.match(result.errors.join('\n'), /required human narrative/i);
});

test('validateReleaseReconciliation fails when changelog has malformed section taxonomy and non-ISO date', () => {
  const malformedChangelog = `# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [R-2026.04.26.1] - 26-04-2026
### Added
- npm capacitor 0.1.9, npm contract 0.1.5, android 0.1.3, ios 0.1.1.
### Evidence
- npm capacitor: https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9
`;

  const result = validateReleaseReconciliation({
    facts: baseFacts,
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: malformedChangelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /iso/i);
  assert.match(result.errors.join('\n'), /allowed changelog section|section heading/i);
});

test('validateReleaseReconciliation fails when a required top-level release section is removed', () => {
  const manuallyEditedReleaseNotes = releaseNotes.replace(/## Evidence[\s\S]*?## Known Limitations/m, '## Known Limitations');
  const result = validateReleaseReconciliation({
    facts: baseFacts,
    releaseNotesMarkdown: manuallyEditedReleaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing required section: ## Evidence/i);
});

test('validateReleaseReconciliation fails closed when selected targets are missing deploy procedure contracts', () => {
  const result = validateReleaseReconciliation({
    facts: {
      ...baseFacts,
      target_procedures: {
        ...baseFacts.target_procedures,
        ios: {
          ...baseFacts.target_procedures.ios,
          verification_step_ref: '',
        },
      },
    },
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /target procedure contract missing required field/i);
  assert.match(result.errors.join('\n'), /ios.*verification_step_ref/i);
});

test('validateReleaseReconciliation fails closed on canonical authority drift', () => {
  const result = validateReleaseReconciliation({
    facts: {
      ...baseFacts,
      authority: {
        ...baseFacts.authority,
        canonical_repo: 'legato-ios-core',
      },
    },
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /canonical authority/i);
});

test('validateReleaseReconciliation fails closed when derivative notes omit canonical backlink', () => {
  const result = validateReleaseReconciliation({
    facts: baseFacts,
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes.replace('canonical_legato_release', 'canonical_reference_removed'),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /derivative release notes backlink/i);
});

test('validateReleaseReconciliation fails closed when ios is selected but derivative release notes are missing', () => {
  const result = validateReleaseReconciliation({
    facts: baseFacts,
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: '',
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /derivative release notes.*required/i);
});

test('validateReleaseReconciliation allows missing derivative notes when ios lane is not selected', () => {
  const result = validateReleaseReconciliation({
    facts: {
      ...baseFacts,
      targets: [
        { target: 'android', selected: true, terminal_status: 'published' },
        { target: 'ios', selected: false, terminal_status: 'not_selected' },
        { target: 'npm', selected: true, terminal_status: 'published' },
      ],
    },
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: '',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateReleaseReconciliation allows missing derivative notes when authority does not require derivative linkage', () => {
  const result = validateReleaseReconciliation({
    facts: {
      ...baseFacts,
      authority: {
        ...baseFacts.authority,
        ios_derivative_required: false,
      },
    },
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: '',
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
});

test('validateReleaseReconciliation fails when derivative notes do not reference release id', () => {
  const result = validateReleaseReconciliation({
    facts: baseFacts,
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes.replaceAll('R-2026.04.26.1', 'R-2026.04.99.9'),
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing release_id/i);
});

test('validateReleaseReconciliation fails when selected target status contradicts terminal state contract', () => {
  const result = validateReleaseReconciliation({
    facts: {
      ...baseFacts,
      targets: [
        { target: 'android', selected: true, terminal_status: 'not_selected' },
        { target: 'ios', selected: true, terminal_status: 'published' },
        { target: 'npm', selected: true, terminal_status: 'published' },
      ],
    },
    releaseNotesMarkdown: releaseNotes,
    changelogMarkdown: changelog,
    derivativeReleaseNotesMarkdown: derivativeReleaseNotes,
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /lane\/status contradiction/i);
  assert.match(result.errors.join('\n'), /android/i);
});
