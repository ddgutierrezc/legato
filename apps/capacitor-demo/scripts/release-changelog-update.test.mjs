import test from 'node:test';
import assert from 'node:assert/strict';

import { renderChangelogEntry, updateChangelogMarkdown } from './release-changelog-update.mjs';

const facts = {
  release_id: 'capacitor-publish-0-1-10-001',
  versions: {
    npm: {
      capacitor: { name: '@ddgutierrezc/legato-capacitor', version: '0.1.10' },
      contract: { name: '@ddgutierrezc/legato-contract', version: '0.1.5' },
    },
    android: { group: 'dev.dgutierrez', artifact: 'legato-android-core', version: '0.1.3' },
    ios: { package_name: 'LegatoCore', version: '0.1.2' },
  },
  evidence: {
    durable: [
      { label: 'npm capacitor', url: 'https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.10' },
      { label: 'ios distribution release tag', url: 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.2' },
    ],
  },
};

const narrative = {
  why_it_matters: 'iOS lifecycle hardening is now distributed through the public Capacitor package.',
  user_impact: 'Host apps get stronger interruption and route-change behavior.',
  upgrade_notes: 'Upgrade to @ddgutierrezc/legato-capacitor@0.1.10 and sync iOS hosts.',
  breaking_changes: 'None.',
  highlights: ['Aligns package distribution with legato-ios-core v0.1.2.'],
};

test('renderChangelogEntry includes release id, version tokens, and evidence links', () => {
  const entry = renderChangelogEntry({ facts, narrative, releaseDate: '2026-04-26' });

  assert.match(entry, /## \[capacitor-publish-0-1-10-001\] - 2026-04-26/i);
  assert.match(entry, /0\.1\.10/i);
  assert.match(entry, /0\.1\.5/i);
  assert.match(entry, /0\.1\.3/i);
  assert.match(entry, /0\.1\.2/i);
  assert.match(entry, /Durable evidence:/i);
});

test('updateChangelogMarkdown inserts new release right after Unreleased block', () => {
  const current = `# Changelog\n\n## [Unreleased]\n\n### Added\n- Existing unreleased note.\n\n## [R-2026.04.26.1] - 2026-04-26\n\n### Added\n- Historical release.\n`;
  const entry = renderChangelogEntry({ facts, narrative, releaseDate: '2026-04-26' });
  const updated = updateChangelogMarkdown({
    changelogMarkdown: current,
    entryMarkdown: entry,
    releaseId: facts.release_id,
  });

  assert.match(updated, /## \[Unreleased\][\s\S]*## \[capacitor-publish-0-1-10-001\]/i);
  assert.match(updated, /## \[capacitor-publish-0-1-10-001\][\s\S]*## \[R-2026\.04\.26\.1\]/i);
});

test('updateChangelogMarkdown replaces existing entry for same release id', () => {
  const existing = `# Changelog\n\n## [Unreleased]\n\n## [capacitor-publish-0-1-10-001] - 2026-04-20\n\n### Added\n- stale note\n\n## [R-2026.04.26.1] - 2026-04-26\n`;
  const entry = renderChangelogEntry({ facts, narrative, releaseDate: '2026-04-26' });
  const updated = updateChangelogMarkdown({
    changelogMarkdown: existing,
    entryMarkdown: entry,
    releaseId: facts.release_id,
  });

  assert.match(updated, /2026-04-26/i);
  assert.doesNotMatch(updated, /stale note/i);
});
