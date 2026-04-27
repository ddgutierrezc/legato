import test from 'node:test';
import assert from 'node:assert/strict';

import { generateGithubReleaseNotes } from './generate-github-release-notes.mjs';

const facts = {
  release_id: 'R-2026.04.26.1',
  release_tag: 'release/R-2026.04.26.1',
  source_commit: '0123456789abcdef0123456789abcdef01234567',
  versions: {
    npm: {
      capacitor: { name: '@ddgutierrezc/legato-capacitor', version: '0.1.9' },
      contract: { name: '@ddgutierrezc/legato-contract', version: '0.1.5' },
    },
    android: { group: 'dev.dgutierrez', artifact: 'legato-android-core', version: '0.1.3' },
    ios: { package_name: 'LegatoCore', version: '0.1.1' },
  },
  targets: [
    { target: 'android', selected: true, terminal_status: 'published' },
    { target: 'ios', selected: true, terminal_status: 'published' },
    { target: 'npm', selected: true, terminal_status: 'published' },
  ],
  authority: {
    canonical_repo: 'legato',
  },
  evidence: {
    durable: [
      { label: 'npm capacitor', url: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9' },
      { label: 'ios distribution release tag', url: 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1' },
    ],
    ephemeral: [
      { label: 'summary artifact', path: 'apps/capacitor-demo/artifacts/release-control/R-2026.04.26.1/summary.json' },
    ],
  },
};

const narrative = {
  why_it_matters: 'Consumer release pages now include factual package/native versions with explicit evidence links.',
  user_impact: 'Maintainers and adopters can reconcile versions without opening workflow artifacts.',
  upgrade_notes: 'Run npm install for updated package versions and sync native projects.',
  breaking_changes: 'None',
  affected_platforms: 'android, ios, npm',
  highlights: [
    'Added durable root changelog entry support.',
  ],
  known_limitations: [
    'Ephemeral artifact links are informational only.',
  ],
};

test('generateGithubReleaseNotes renders deterministic section order and facts block', () => {
  const rendered = generateGithubReleaseNotes({
    facts,
    narrative,
    changelogAnchor: 'CHANGELOG.md#r-202604261---2026-04-26',
  });

  assert.deepEqual(rendered.section_order, [
    'Summary',
    'Highlights',
    'Compatibility Matrix',
    'Installation/Upgrade',
    'Evidence',
    'Known Limitations',
    'Full Changelog Link',
  ]);
  assert.match(rendered.markdown, /^## Summary/m);
  assert.match(rendered.markdown, /^## Highlights/m);
  assert.match(rendered.markdown, /Why it matters/i);
  assert.match(rendered.markdown, /canonical_repo:\s*`legato`/i);
  assert.match(rendered.markdown, /ios_derivative_release:\s*`https:\/\/github\.com\/ddgutierrezc\/legato-ios-core\/releases\/tag\/v0\.1\.1`/i);
  assert.match(rendered.markdown, /```json\n\{[\s\S]*"release_id": "R-2026\.04\.26\.1"/m);
  assert.match(rendered.markdown, /CHANGELOG\.md#r-202604261---2026-04-26/i);
  assert.match(rendered.markdown, /@ddgutierrezc\/legato-capacitor/i);
});

test('generateGithubReleaseNotes omits ios_derivative_release when ios target not selected', () => {
  const rendered = generateGithubReleaseNotes({
    facts: {
      ...facts,
      targets: [
        { target: 'android', selected: true, terminal_status: 'published' },
        { target: 'ios', selected: false, terminal_status: 'not_selected' },
        { target: 'npm', selected: true, terminal_status: 'published' },
      ],
    },
    narrative,
  });

  assert.doesNotMatch(rendered.markdown, /ios_derivative_release/i);
});

test('generateGithubReleaseNotes rejects missing required human narrative fields', () => {
  assert.throws(
    () => generateGithubReleaseNotes({
      facts,
      narrative: {
        ...narrative,
        breaking_changes: '',
      },
      changelogAnchor: 'CHANGELOG.md#r-202604261---2026-04-26',
    }),
    /breaking changes/i,
  );
});
