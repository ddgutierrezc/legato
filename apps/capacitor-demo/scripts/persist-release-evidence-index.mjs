import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const normalizeEvidence = (entries = [], fallbackStatus = 'ok') => entries.map((entry) => {
  const url = String(entry?.url ?? entry?.path ?? '').trim();
  if (!url) {
    return {
      label: String(entry?.label ?? 'evidence').trim() || 'evidence',
      url: '',
      status: 'missing_or_expired',
      note: 'informational only; not used as canonical release truth',
    };
  }
  return {
    label: String(entry?.label ?? 'evidence').trim() || 'evidence',
    url,
    status: fallbackStatus,
  };
});

export const persistReleaseEvidenceIndex = async ({
  repoRoot = process.cwd(),
  releaseId,
  sourceCommit,
  durableEvidence = [],
  ephemeralEvidence = [],
} = {}) => {
  const id = String(releaseId ?? '').trim();
  if (!id) {
    throw new Error('releaseId is required.');
  }

  const durable = normalizeEvidence(durableEvidence, 'durable');
  const ephemeral = normalizeEvidence(ephemeralEvidence, 'ephemeral');

  const docsDir = resolve(repoRoot, 'docs/releases');
  const indexDir = resolve(docsDir, 'evidence-index');
  await mkdir(docsDir, { recursive: true });
  await mkdir(indexDir, { recursive: true });

  const dossierPath = resolve(docsDir, `${id}.md`);
  const indexPath = resolve(indexDir, `${id}.json`);

  const dossierMarkdown = [
    '# Release Evidence Dossier',
    '',
    `- release_id: \`${id}\``,
    `- source_commit: \`${String(sourceCommit ?? 'unknown')}\``,
    '',
    '## Durable evidence',
    ...durable.map((entry) => `- ${entry.label}: ${entry.url}`),
    '',
    '## Ephemeral evidence',
    '- Ephemeral links are informational only and MUST NOT be the sole source of release claims.',
    '- If an ephemeral link expires, recover from durable evidence and release manifests.',
    ...ephemeral.map((entry) => `- ${entry.label}: ${entry.url || 'missing_or_expired'} (${entry.status})`),
    '',
    '## Retention / recovery',
    '- Use this dossier plus CHANGELOG.md and package/native manifests as canonical release history.',
  ].join('\n');

  const indexPayload = {
    release_id: id,
    source_commit: String(sourceCommit ?? ''),
    generated_at: new Date().toISOString(),
    durable,
    ephemeral,
  };

  await writeFile(dossierPath, `${dossierMarkdown}\n`, 'utf8');
  await writeFile(indexPath, `${JSON.stringify(indexPayload, null, 2)}\n`, 'utf8');

  return { dossierPath, indexPath };
};

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const [, , ...args] = process.argv;
  const options = {
    durableEvidence: [],
    ephemeralEvidence: [],
  };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--repo-root' && args[i + 1]) {
      options.repoRoot = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-id' && args[i + 1]) {
      options.releaseId = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--source-commit' && args[i + 1]) {
      options.sourceCommit = args[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--durable' && args[i + 1]) {
      options.durableEvidence = JSON.parse(args[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--ephemeral' && args[i + 1]) {
      options.ephemeralEvidence = JSON.parse(args[i + 1]);
      i += 1;
    }
  }

  const result = await persistReleaseEvidenceIndex(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}
