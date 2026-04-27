import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const REQUIRED_NARRATIVE_FIELDS = ['why_it_matters', 'user_impact', 'upgrade_notes', 'breaking_changes', 'affected_platforms'];

const requireNarrative = (narrative = {}) => {
  const missing = REQUIRED_NARRATIVE_FIELDS.filter((field) => !String(narrative[field] ?? '').trim());
  if (missing.length > 0) {
    const humanized = missing.map((field) => field.replaceAll('_', ' '));
    throw new Error(`Missing required human narrative fields: ${humanized.join(', ')}.`);
  }
};

const slugify = (value) => String(value ?? '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '');

const compatibilityRows = (facts) => {
  const rows = [
    `| npm capacitor | ${facts?.versions?.npm?.capacitor?.version ?? ''} |`,
    `| npm contract | ${facts?.versions?.npm?.contract?.version ?? ''} |`,
    `| android (${facts?.versions?.android?.group ?? ''}:${facts?.versions?.android?.artifact ?? ''}) | ${facts?.versions?.android?.version ?? ''} |`,
    `| ios (${facts?.versions?.ios?.package_name ?? ''}) | ${facts?.versions?.ios?.version ?? ''} |`,
  ];
  return rows.join('\n');
};

export const generateGithubReleaseNotes = ({ facts, narrative, changelogAnchor } = {}) => {
  if (!facts || typeof facts !== 'object') {
    throw new Error('facts payload is required.');
  }
  requireNarrative(narrative);

  const normalizedAnchor = String(changelogAnchor ?? '').trim() || `CHANGELOG.md#${slugify(facts.release_id)}`;
  const highlights = Array.isArray(narrative.highlights) ? narrative.highlights : [];
  const limitations = Array.isArray(narrative.known_limitations) ? narrative.known_limitations : [];

  const sectionOrder = [
    'Summary',
    'Highlights',
    'Compatibility Matrix',
    'Installation/Upgrade',
    'Evidence',
    'Known Limitations',
    'Full Changelog Link',
  ];

  const markdown = [
    '## Summary',
    `- release_id: \`${facts.release_id}\``,
    `- release_tag: \`${facts.release_tag}\``,
    `- source_commit: \`${facts.source_commit || 'unknown'}\``,
    '',
    '## Highlights',
    ...highlights.map((entry) => `- ${entry}`),
    '### Required Human Narrative',
    `- Why it matters: ${narrative.why_it_matters}`,
    `- User impact: ${narrative.user_impact}`,
    `- Upgrade notes: ${narrative.upgrade_notes}`,
    `- Breaking changes: ${narrative.breaking_changes}`,
    `- Affected platforms: ${narrative.affected_platforms}`,
    '',
    '## Compatibility Matrix',
    '| Surface | Version |',
    '|---|---|',
    compatibilityRows(facts),
    '',
    '## Installation/Upgrade',
    `- ${narrative.upgrade_notes}`,
    '',
    '## Evidence',
    ...(facts?.evidence?.durable ?? []).map((entry) => `- ${entry.label}: ${entry.url ?? entry.path ?? ''}`),
    ...(facts?.evidence?.ephemeral ?? []).map((entry) => `- ${entry.label} (ephemeral): ${entry.url ?? entry.path ?? ''}`),
    '',
    '```json',
    JSON.stringify({
      release_id: facts.release_id,
      source_commit: facts.source_commit,
      versions: facts.versions,
      targets: facts.targets,
    }, null, 2),
    '```',
    '',
    '## Known Limitations',
    ...(limitations.length > 0 ? limitations.map((entry) => `- ${entry}`) : ['- None']),
    '',
    '## Full Changelog Link',
    `- ${normalizedAnchor}`,
  ].join('\n');

  return {
    release_id: String(facts.release_id ?? ''),
    section_order: sectionOrder,
    changelog_anchor: normalizedAnchor,
    markdown,
  };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {
    changelogAnchor: '',
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--facts' && args[i + 1]) {
      options.factsPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--narrative' && args[i + 1]) {
      options.narrativePath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--changelog-anchor' && args[i + 1]) {
      options.changelogAnchor = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--out-json' && args[i + 1]) {
      options.outJson = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--out-markdown' && args[i + 1]) {
      options.outMarkdown = args[i + 1];
      i += 1;
    }
  }

  if (!options.factsPath || !options.narrativePath) {
    throw new Error('--facts and --narrative are required.');
  }

  const facts = JSON.parse(await readFile(resolve(options.factsPath), 'utf8'));
  const narrative = JSON.parse(await readFile(resolve(options.narrativePath), 'utf8'));
  const rendered = generateGithubReleaseNotes({ facts, narrative, changelogAnchor: options.changelogAnchor });

  if (options.outJson) {
    await writeFile(resolve(options.outJson), `${JSON.stringify(rendered, null, 2)}\n`, 'utf8');
  }
  if (options.outMarkdown) {
    await writeFile(resolve(options.outMarkdown), `${rendered.markdown}\n`, 'utf8');
  }

  process.stdout.write(`${JSON.stringify(rendered, null, 2)}\n`);
}
