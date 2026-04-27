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
const REQUIRED_TARGET_PROCEDURE_FIELDS = [
  'procedure_id',
  'source_of_truth',
  'publish_step_ref',
  'verification_step_ref',
  'durable_evidence_ref',
  'rollback_or_hold_rule',
];

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

const collectDurableEvidenceText = (facts) => {
  const durableEvidence = Array.isArray(facts?.evidence?.durable) ? facts.evidence.durable : [];
  return durableEvidence
    .map((entry) => `${String(entry?.label ?? '')} ${String(entry?.url ?? '')} ${String(entry?.path ?? '')}`.toLowerCase())
    .join('\n');
};

const validateAuthority = ({ facts, releaseNotesMarkdown, errors }) => {
  const authority = facts?.authority;
  if (!authority || typeof authority !== 'object') {
    errors.push('canonical authority metadata is required in facts.authority.');
    return;
  }

  if (String(authority.canonical_repo ?? '').trim() !== 'legato') {
    errors.push('canonical authority drift: facts.authority.canonical_repo must be legato.');
  }

  if (String(authority.ios_distribution_repo ?? '').trim() !== 'legato-ios-core') {
    errors.push('canonical authority drift: facts.authority.ios_distribution_repo must be legato-ios-core.');
  }

  if (!/canonical_repo:\s*`?legato`?/i.test(String(releaseNotesMarkdown ?? ''))) {
    errors.push('release notes must declare canonical_repo: legato in the Summary section.');
  }

  const iosSelected = (Array.isArray(facts?.targets) ? facts.targets : []).some((entry) => String(entry?.target ?? '').trim() === 'ios' && Boolean(entry?.selected));
  if (iosSelected && !/ios_derivative_release\s*:/i.test(String(releaseNotesMarkdown ?? ''))) {
    errors.push('release notes must declare ios_derivative_release when ios lane is selected.');
  }
};

const validateTargetProcedures = ({ facts, errors }) => {
  const targetProcedures = facts?.target_procedures ?? {};
  for (const entry of Array.isArray(facts?.targets) ? facts.targets : []) {
    const target = String(entry?.target ?? '').trim();
    const selected = Boolean(entry?.selected);
    if (!target || !selected) {
      continue;
    }

    if (['not_selected', 'incomplete'].includes(String(entry?.terminal_status ?? '').trim())) {
      errors.push(`lane/status contradiction for ${target}: selected target cannot end with ${entry?.terminal_status}.`);
    }

    const procedure = targetProcedures[target];
    if (!procedure || typeof procedure !== 'object') {
      errors.push(`target procedure contract missing for selected target: ${target}.`);
      continue;
    }

    for (const field of REQUIRED_TARGET_PROCEDURE_FIELDS) {
      if (!String(procedure[field] ?? '').trim()) {
        errors.push(`target procedure contract missing required field: ${target}.${field}`);
      }
    }
  }
};

const validateDurableEvidenceCoverage = ({ facts, errors }) => {
  const durableText = collectDurableEvidenceText(facts);
  const selectedTargets = new Map(
    (Array.isArray(facts?.targets) ? facts.targets : []).map((entry) => [String(entry?.target ?? '').trim(), Boolean(entry?.selected)]),
  );

  if (selectedTargets.get('npm') && !/npmjs\.com\/package\//i.test(durableText)) {
    errors.push('durable evidence missing npm package reference for selected npm target.');
  }
  if (selectedTargets.get('android') && !/(repo1\.maven\.org|maven)/i.test(durableText)) {
    errors.push('durable evidence missing Maven reference for selected android target.');
  }
  if (selectedTargets.get('ios') && !/legato-ios-core\/releases\/tag\//i.test(durableText)) {
    errors.push('durable evidence missing legato-ios-core release tag reference for selected ios target.');
  }
};

const validateDerivativeBacklinks = ({ facts, derivativeReleaseNotesMarkdown, errors }) => {
  if (facts?.authority?.ios_derivative_required !== true) {
    return;
  }

  const iosSelected = (Array.isArray(facts?.targets) ? facts.targets : [])
    .some((entry) => String(entry?.target ?? '').trim() === 'ios' && Boolean(entry?.selected));
  if (!iosSelected) {
    return;
  }

  const markdown = String(derivativeReleaseNotesMarkdown ?? '');
  if (!markdown.trim()) {
    errors.push('derivative release notes backlink is required when ios target is selected.');
    return;
  }

  const releaseId = String(facts?.release_id ?? '').trim();
  if (releaseId && !markdown.includes(releaseId)) {
    errors.push(`derivative release notes backlink mismatch: missing release_id ${releaseId}.`);
  }
  if (!/canonical_legato_release/i.test(markdown) || (releaseId && !new RegExp(`release/${releaseId}`, 'i').test(markdown))) {
    errors.push('derivative release notes backlink must include canonical_legato_release URL to legato release tag.');
  }
  if (!/canonical_changelog_anchor\s*:\s*CHANGELOG\.md#/i.test(markdown)) {
    errors.push('derivative release notes backlink must include canonical_changelog_anchor to CHANGELOG.md.');
  }
  if (!/legato-ios-core\/releases\/tag\//i.test(markdown)) {
    errors.push('derivative release notes must include ios_distribution_release URL in legato-ios-core.');
  }
};

export const validateReleaseReconciliation = ({ facts, releaseNotesMarkdown, changelogMarkdown, derivativeReleaseNotesMarkdown } = {}) => {
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
  validateAuthority({ facts, releaseNotesMarkdown, errors });
  validateTargetProcedures({ facts, errors });

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

  validateDurableEvidenceCoverage({ facts, errors });
  validateDerivativeBacklinks({ facts, derivativeReleaseNotesMarkdown, errors });

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
      continue;
    }
    if (arg === '--derivative-notes' && args[i + 1]) {
      options.derivativeNotesPath = args[i + 1];
      i += 1;
    }
  }

  const facts = JSON.parse(await readFile(resolve(options.factsPath), 'utf8'));
  const releaseNotesMarkdown = await readFile(resolve(options.releaseNotesPath), 'utf8');
  const changelogMarkdown = await readFile(resolve(options.changelogPath), 'utf8');
  const derivativeReleaseNotesMarkdown = options.derivativeNotesPath
    ? await readFile(resolve(options.derivativeNotesPath), 'utf8')
    : '';
  const result = validateReleaseReconciliation({ facts, releaseNotesMarkdown, changelogMarkdown, derivativeReleaseNotesMarkdown });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
