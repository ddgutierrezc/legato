import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const docsRoot = resolve(repoRoot, 'apps/docs-site/src/content/docs');

const contractPagePath = resolve(docsRoot, 'packages/contract/index.mdx');
const capacitorPagePath = resolve(docsRoot, 'packages/capacitor/index.mdx');
const referencePagePath = resolve(docsRoot, 'reference/index.mdx');
const releasesPagePath = resolve(docsRoot, 'releases/index.mdx');

test('phase 3 surfaces exist for packages, reference, and releases', async () => {
  await Promise.all([
    access(contractPagePath),
    access(capacitorPagePath),
    access(referencePagePath),
    access(releasesPagePath),
  ]);
});

test('contract package guide documents role, exports, and root-only imports', async () => {
  const contractPage = await readFile(contractPagePath, 'utf8');

  assert.match(contractPage, /^---[\s\S]*title:\s*Contract Package/m);
  assert.match(contractPage, /@ddgutierrezc\/legato-contract/);
  assert.match(contractPage, /root import/i);
  assert.match(contractPage, /LEGATO_EVENT_NAMES/);
  assert.match(contractPage, /binding-adapter/i);
});

test('capacitor package guide documents install, runtime APIs, and migration posture', async () => {
  const capacitorPage = await readFile(capacitorPagePath, 'utf8');

  assert.match(capacitorPage, /^---[\s\S]*title:\s*Capacitor Package/m);
  assert.match(capacitorPage, /@ddgutierrezc\/legato-capacitor/);
  assert.match(capacitorPage, /audioPlayer/);
  assert.match(capacitorPage, /mediaSession/);
  assert.match(capacitorPage, /Legato/);
  assert.match(capacitorPage, /addAudioPlayerListener/);
});

test('reference entrypoint links public contract and capacitor references only', async () => {
  const referencePage = await readFile(referencePagePath, 'utf8');

  assert.match(referencePage, /^---[\s\S]*title:\s*Reference/m);
  assert.match(referencePage, /\/packages\/contract\//);
  assert.match(referencePage, /\/packages\/capacitor\//);
  assert.doesNotMatch(referencePage, /docs\/maintainers\//);
  assert.doesNotMatch(referencePage, /docs\/releases\/notes\//);
});

test('releases page is changelog-based and excludes internal evidence paths', async () => {
  const releasesPage = await readFile(releasesPagePath, 'utf8');

  assert.match(releasesPage, /^---[\s\S]*title:\s*Releases/m);
  assert.match(releasesPage, /CHANGELOG\.md/);
  assert.match(releasesPage, /\[1\.0\.0\]/);
  assert.match(releasesPage, /Capacitor-first/);
  assert.doesNotMatch(releasesPage, /docs\/releases\/notes\//);
  assert.doesNotMatch(releasesPage, /go-no-go/i);
});
