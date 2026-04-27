import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const toIsoDate = (value = new Date()) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid release date: ${value}`);
  }
  return date.toISOString().slice(0, 10);
};

const unique = (items) => [...new Set(items.filter((item) => String(item ?? '').trim()))];

export const renderChangelogEntry = ({ facts, narrative, releaseDate } = {}) => {
  if (!facts || typeof facts !== 'object') {
    throw new Error('facts payload is required.');
  }
  if (!narrative || typeof narrative !== 'object') {
    throw new Error('narrative payload is required.');
  }

  const releaseId = String(facts.release_id ?? '').trim();
  if (!releaseId) {
    throw new Error('facts.release_id is required.');
  }

  const dateToken = toIsoDate(releaseDate);
  const highlights = Array.isArray(narrative.highlights) ? narrative.highlights : [];
  const durableEvidence = Array.isArray(facts?.evidence?.durable) ? facts.evidence.durable : [];
  const evidenceLinks = unique(durableEvidence.map((entry) => String(entry?.url ?? '').trim()));

  return [
    `## [${releaseId}] - ${dateToken}`,
    '',
    '### Added',
    `- ${String(narrative.why_it_matters ?? '').trim()}`,
    `- Version matrix: npm \`${facts?.versions?.npm?.capacitor?.name ?? '@ddgutierrezc/legato-capacitor'}@${facts?.versions?.npm?.capacitor?.version ?? ''}\`, npm \`${facts?.versions?.npm?.contract?.name ?? '@ddgutierrezc/legato-contract'}@${facts?.versions?.npm?.contract?.version ?? ''}\`, Android \`${facts?.versions?.android?.group ?? ''}:${facts?.versions?.android?.artifact ?? ''}:${facts?.versions?.android?.version ?? ''}\`, iOS \`${facts?.versions?.ios?.package_name ?? ''}@${facts?.versions?.ios?.version ?? ''}\`.`,
    ...highlights.map((entry) => `- ${entry}`),
    ...(evidenceLinks.length > 0 ? [`- Durable evidence: ${evidenceLinks.join(', ')}.`] : []),
    '',
    '### Changed',
    `- User impact: ${String(narrative.user_impact ?? '').trim()}`,
    `- Upgrade notes: ${String(narrative.upgrade_notes ?? '').trim()}`,
    `- Breaking changes: ${String(narrative.breaking_changes ?? '').trim()}`,
    '',
  ].join('\n');
};

const headingPattern = /^## \[(?<id>[^\]]+)\](?: - .+)?$/gm;

const findSectionRange = (markdown, releaseId) => {
  const matches = [...String(markdown ?? '').matchAll(headingPattern)];
  const targetIndex = matches.findIndex((match) => String(match.groups?.id ?? '').trim() === releaseId);
  if (targetIndex < 0) {
    return null;
  }
  const start = matches[targetIndex].index ?? 0;
  const end = targetIndex + 1 < matches.length
    ? (matches[targetIndex + 1].index ?? markdown.length)
    : markdown.length;
  return { start, end };
};

export const updateChangelogMarkdown = ({ changelogMarkdown, entryMarkdown, releaseId } = {}) => {
  const source = String(changelogMarkdown ?? '');
  const entry = String(entryMarkdown ?? '').trim();
  const effectiveReleaseId = String(releaseId ?? '').trim();

  if (!entry) {
    throw new Error('entryMarkdown is required.');
  }
  if (!effectiveReleaseId) {
    throw new Error('releaseId is required.');
  }

  const existingRange = findSectionRange(source, effectiveReleaseId);
  if (existingRange) {
    const before = source.slice(0, existingRange.start).trimEnd();
    const after = source.slice(existingRange.end).trimStart();
    return `${before}\n\n${entry}\n\n${after}`.trimEnd() + '\n';
  }

  const unreleasedIndex = source.indexOf('## [Unreleased]');
  if (unreleasedIndex < 0) {
    return `${source.trimEnd()}\n\n${entry}\n`;
  }

  const nextHeadingIndex = source.slice(unreleasedIndex + 1).search(/\n## \[[^\]]+\]/);
  const insertionPoint = nextHeadingIndex < 0
    ? source.length
    : unreleasedIndex + 1 + nextHeadingIndex;

  const before = source.slice(0, insertionPoint).trimEnd();
  const after = source.slice(insertionPoint).trimStart();
  return `${before}\n\n${entry}\n\n${after}`.trimEnd() + '\n';
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {
    changelogPath: resolve(scriptDir, '../../../CHANGELOG.md'),
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
    if (arg === '--changelog' && args[i + 1]) {
      options.changelogPath = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--date' && args[i + 1]) {
      options.releaseDate = args[i + 1];
      i += 1;
    }
  }

  if (!options.factsPath || !options.narrativePath) {
    throw new Error('--facts and --narrative are required.');
  }

  const facts = JSON.parse(await readFile(resolve(options.factsPath), 'utf8'));
  const narrative = JSON.parse(await readFile(resolve(options.narrativePath), 'utf8'));
  const changelogPath = resolve(options.changelogPath);
  const currentChangelog = await readFile(changelogPath, 'utf8');

  const entry = renderChangelogEntry({ facts, narrative, releaseDate: options.releaseDate });
  const nextChangelog = updateChangelogMarkdown({
    changelogMarkdown: currentChangelog,
    entryMarkdown: entry,
    releaseId: facts.release_id,
  });

  await writeFile(changelogPath, nextChangelog, 'utf8');
  process.stdout.write(`${JSON.stringify({ ok: true, release_id: facts.release_id, changelog: changelogPath }, null, 2)}\n`);
}
