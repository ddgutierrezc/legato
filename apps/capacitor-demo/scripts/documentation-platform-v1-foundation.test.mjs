import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const docsAppRoot = resolve(repoRoot, 'apps/docs-site');
const astroConfigPath = resolve(docsAppRoot, 'astro.config.mjs');
const docsPackagePath = resolve(docsAppRoot, 'package.json');
const docsReadmePath = resolve(docsAppRoot, 'README.md');
const landingPath = resolve(docsAppRoot, 'src/content/docs/index.mdx');
const gettingStartedPath = resolve(docsAppRoot, 'src/content/docs/getting-started/index.mdx');
const conceptsPath = resolve(docsAppRoot, 'src/content/docs/concepts/index.mdx');
const communityPath = resolve(docsAppRoot, 'src/content/docs/community/index.mdx');

test('docs-site package metadata and scripts are workspace-ready', async () => {
  const packageJson = JSON.parse(await readFile(docsPackagePath, 'utf8'));

  assert.equal(packageJson.name, '@legato/docs-site');
  assert.equal(packageJson.private, true);
  assert.equal(packageJson.type, 'module');
  assert.equal(packageJson.scripts.dev, 'astro dev');
  assert.equal(packageJson.scripts.build, 'astro build');
  assert.equal(packageJson.scripts.check, 'astro check');
});

test('astro config defines Legato docs metadata and required IA groups', async () => {
  const astroConfig = await readFile(astroConfigPath, 'utf8');

  assert.match(astroConfig, /title:\s*'Legato Docs'/);
  assert.match(astroConfig, /description:\s*\n\s*'Canonical public documentation for Legato/);
  assert.match(astroConfig, /label:\s*'Getting Started'/);
  assert.match(astroConfig, /label:\s*'Package Guides'/);
  assert.match(astroConfig, /label:\s*'Reference'/);
  assert.match(astroConfig, /label:\s*'Releases'/);
  assert.match(astroConfig, /label:\s*'Concepts'/);
  assert.match(astroConfig, /label:\s*'Community'/);
  assert.match(astroConfig, /edit\/main\/apps\/docs-site\/src\/content\/docs\//);
});

test('foundation public pages exist with canonical-public framing', async () => {
  const [landing, gettingStarted, concepts, community] = await Promise.all([
    readFile(landingPath, 'utf8'),
    readFile(gettingStartedPath, 'utf8'),
    readFile(conceptsPath, 'utf8'),
    readFile(communityPath, 'utf8'),
  ]);

  assert.match(landing, /canonical public surface/i);
  assert.match(gettingStarted, /Package decision matrix/i);
  assert.match(concepts, /Audience boundaries/i);
  assert.match(community, /Community, contribution, and support entrypoints/i);
});

test('docs-site README defines public-only boundaries and forbidden paths', async () => {
  const readme = await readFile(docsReadmePath, 'utf8');

  assert.match(readme, /canonical \*\*public\*\* documentation surface/i);
  assert.match(readme, /docs\/maintainers\/\*\*/);
  assert.match(readme, /docs\/releases\/notes\/\*\*/);
  assert.match(readme, /docs\/architecture\/spikes\/\*\*/);
});
