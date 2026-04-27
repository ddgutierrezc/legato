import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const REQUIRED_SECTIONS = [
  '## Summary',
  '## Highlights',
  '## Compatibility Matrix',
  '## Installation/Upgrade',
  '## Evidence',
  '## Known Limitations',
  '## Full Changelog Link',
];

const REQUIRED_NARRATIVE_FIELDS = [
  'Why it matters',
  'User impact',
  'Upgrade notes',
  'Breaking changes',
  'Affected platforms',
];

const ALLOWED_CHANGELOG_SECTIONS = new Set(['Added', 'Changed', 'Deprecated', 'Removed', 'Fixed', 'Security']);

const requiredVersionStrings = (facts) => [
  String(facts?.versions?.npm?.capacitor?.version ?? ''),
  String(facts?.versions?.npm?.contract?.version ?? ''),
  String(facts?.versions?.android?.version ?? ''),
  String(facts?.versions?.ios?.version ?? ''),
].filter(Boolean);

const validateRequiredNarrative = (releaseNotesMarkdown, errors) => {
  const markdown = String(releaseNotesMarkdown ?? '');
  if (!/###\s+Required Human Narrative/i.test(markdown)) {
    errors.push('release notes missing required human narrative subsection.');
    return;
  }

  for (const field of REQUIRED_NARRATIVE_FIELDS) {
    const pattern = new RegExp(`^-\\s*${field}:\\s*\\S.+$`, 'im');
    if (!pattern.test(markdown)) {
      errors.push(`required human narrative field missing or empty: ${field}.`);
    }
  }
};

const validateChangelogStructure = (changelogMarkdown, errors) => {
  const markdown = String(changelogMarkdown ?? '');
  const releaseHeadingPattern = /^## \[(?<release>[^\]]+)\](?: - (?<date>.+))?$/gm;
  const headings = [...markdown.matchAll(releaseHeadingPattern)];

  for (const heading of headings) {
    const release = String(heading.groups?.release ?? '').trim();
    const date = String(heading.groups?.date ?? '').trim();

    if (!release || /^unreleased$/i.test(release)) {
      continue;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      errors.push(`release heading must use ISO date format YYYY-MM-DD: ${heading[0]}`);
    }
  }

  const sectionHeadingPattern = /^###\s+(?<section>.+)$/gm;
  for (const match of markdown.matchAll(sectionHeadingPattern)) {
    const section = String(match.groups?.section ?? '').trim();
    if (!ALLOWED_CHANGELOG_SECTIONS.has(section)) {
      errors.push(`allowed changelog section heading violated: ${section}`);
    }
  }
};

export const validateReleaseReconciliation = ({ facts, releaseNotesMarkdown, changelogMarkdown } = {}) => {
  const errors = [];

  if (!facts || typeof facts !== 'object') {
    errors.push('facts payload is required.');
  }

  for (const section of REQUIRED_SECTIONS) {
    if (!String(releaseNotesMarkdown ?? '').includes(section)) {
      errors.push(`release notes missing required section: ${section}`);
    }
  }

  validateRequiredNarrative(releaseNotesMarkdown, errors);

  const releaseIdToken = String(facts?.release_id ?? '').trim();
  if (releaseIdToken && !String(releaseNotesMarkdown ?? '').includes(releaseIdToken)) {
    errors.push(`version mismatch: release notes missing required token ${releaseIdToken}`);
  }
  if (releaseIdToken && !String(changelogMarkdown ?? '').includes(releaseIdToken)) {
    errors.push(`version mismatch: changelog missing required token ${releaseIdToken}`);
  }

  const sourceCommitToken = String(facts?.source_commit ?? '').trim();
  if (sourceCommitToken && !String(releaseNotesMarkdown ?? '').includes(sourceCommitToken)) {
    errors.push(`version mismatch: release notes missing required token ${sourceCommitToken}`);
  }

  for (const token of requiredVersionStrings(facts)) {
    if (!String(releaseNotesMarkdown ?? '').includes(token)) {
      errors.push(`version mismatch: release notes missing required token ${token}`);
    }
    if (!String(changelogMarkdown ?? '').includes(token)) {
      errors.push(`version mismatch: changelog missing required token ${token}`);
    }
  }

  if (!String(changelogMarkdown ?? '').includes(`## [${String(facts?.release_id ?? '')}]`)) {
    errors.push('changelog must contain a release heading for facts.release_id.');
  }

  validateChangelogStructure(changelogMarkdown, errors);

  const durableEvidence = Array.isArray(facts?.evidence?.durable) ? facts.evidence.durable : [];
  const hasDurableLinks = durableEvidence.some((entry) => String(entry?.url ?? entry?.path ?? '').trim().length > 0);
  if (!hasDurableLinks) {
    errors.push('durable evidence links are required; ephemeral URLs cannot be sole source of truth.');
  }

  const knownTerminal = new Set(['published', 'already_published', 'failed', 'blocked', 'not_selected', 'incomplete']);
  for (const entry of Array.isArray(facts?.targets) ? facts.targets : []) {
    const status = String(entry?.terminal_status ?? '').trim();
    if (!knownTerminal.has(status)) {
      errors.push(`unsupported terminal_status combination for ${entry?.target ?? 'unknown'}: ${status}`);
    }
  }

  return {
    ok: errors.length === 0,
    errors,
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--facts' && args[i + 1]) {
      options.factsPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-notes' && args[i + 1]) {
      options.releaseNotesPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--changelog' && args[i + 1]) {
      options.changelogPath = args[i + 1];
      i += 1;
    }
  }

  const facts = JSON.parse(await readFile(resolve(options.factsPath), 'utf8'));
  const releaseNotesMarkdown = await readFile(resolve(options.releaseNotesPath), 'utf8');
  const changelogMarkdown = await readFile(resolve(options.changelogPath), 'utf8');
  const result = validateReleaseReconciliation({ facts, releaseNotesMarkdown, changelogMarkdown });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
