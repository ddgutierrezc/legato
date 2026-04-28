import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  findLegacyPublicDocsWithoutCanonicalRedirect,
  evaluateAudienceClassification,
} from './documentation-platform-v1-governance.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const docsRoot = resolve(repoRoot, 'apps/docs-site/src/content/docs');

const requiredPages = [
  'index.mdx',
  'getting-started/index.mdx',
  'concepts/index.mdx',
  'community/index.mdx',
  'packages/contract/index.mdx',
  'packages/capacitor/index.mdx',
  'reference/index.mdx',
  'releases/index.mdx',
];

const publicDocsToScan = [
  'index.mdx',
  'getting-started/index.mdx',
  'concepts/index.mdx',
  'community/index.mdx',
  'packages/contract/index.mdx',
  'packages/capacitor/index.mdx',
  'reference/index.mdx',
  'releases/index.mdx',
];

test('mandatory documentation-platform IA pages exist', async () => {
  const contents = await Promise.all(
    requiredPages.map((relativePath) => readFile(resolve(docsRoot, relativePath), 'utf8'))
  );

  assert.equal(contents.length, requiredPages.length);
  for (const content of contents) {
    assert.match(content, /title:/i);
  }
});

test('public docs-site content does not link to maintainer or archive-only paths', async () => {
  const contents = await Promise.all(
    publicDocsToScan.map(async (relativePath) => ({
      relativePath,
      content: await readFile(resolve(docsRoot, relativePath), 'utf8'),
    }))
  );

  const forbiddenPatterns = [
    /\[[^\]]+\]\([^\)]*docs\/maintainers\//i,
    /\[[^\]]+\]\([^\)]*docs\/releases\/notes\//i,
    /\[[^\]]+\]\([^\)]*docs\/architecture\/spikes\//i,
    /from\s+['"][^'"]*docs\/maintainers\//i,
    /from\s+['"][^'"]*docs\/releases\/notes\//i,
    /from\s+['"][^'"]*docs\/architecture\/spikes\//i,
    /(href|src)=['"][^'"]*docs\/maintainers\//i,
    /(href|src)=['"][^'"]*docs\/releases\/notes\//i,
    /(href|src)=['"][^'"]*docs\/architecture\/spikes\//i,
  ];

  for (const { relativePath, content } of contents) {
    for (const pattern of forbiddenPatterns) {
      assert.doesNotMatch(content, pattern, `Forbidden public-docs link in ${relativePath}: ${pattern}`);
    }
  }
});

test('legacy public root docs must be migrated or redirected to docs-site canonical pages', () => {
  const findings = findLegacyPublicDocsWithoutCanonicalRedirect([
    {
      relativePath: 'docs/guides/legacy-streaming-overview.md',
      content: 'Audience: Public\n# Legacy streaming overview\nNo redirect marker yet.',
    },
    {
      relativePath: 'docs/guides/redirected-topic.md',
      content:
        'Audience: Public\nCanonical docs-site page: apps/docs-site/src/content/docs/getting-started/index.mdx',
    },
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].relativePath, 'docs/guides/legacy-streaming-overview.md');
  assert.match(findings[0].reason, /migrated or redirected/i);
});

test('mixed-content documents are rejected until split or rewritten', () => {
  const classification = evaluateAudienceClassification(`
Audience: Public
Audience: Maintainer

# Mixed guidance
Public install snippets plus internal release runbook steps.
`);

  assert.equal(classification.status, 'reject-mixed-content');
  assert.deepEqual(classification.audiences, ['Maintainer', 'Public']);
  assert.match(classification.reason, /split or rewritten/i);
});

test('single-audience documents are accepted by governance classification', () => {
  const classification = evaluateAudienceClassification(`
Audience: Public

# Public guide
Only public consumer guidance.
`);

  assert.equal(classification.status, 'classified');
  assert.deepEqual(classification.audiences, ['Public']);
});
