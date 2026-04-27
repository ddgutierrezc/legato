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
  evidence: {
    durable: [{ label: 'npm capacitor', url: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9' }],
    ephemeral: [{ label: 'summary', path: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/summary.json' }],
  },
};

const releaseNotes = `## Summary
- release_id: \`R-2026.04.26.1\`
- source_commit: \`0123456789abcdef0123456789abcdef01234567\`

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

## Known Limitations
- Ephemeral artifact links are informational only.

## Full Changelog Link
- CHANGELOG.md#r-202604261---2026-04-26
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
  });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /missing required section: ## Evidence/i);
});
