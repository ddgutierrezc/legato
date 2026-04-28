import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const rootReadmePath = resolve(repoRoot, 'README.md');
const contractReadmePath = resolve(repoRoot, 'packages/contract/README.md');
const capacitorReadmePath = resolve(repoRoot, 'packages/capacitor/README.md');
const scopeDocPath = resolve(repoRoot, 'docs/maintainers/package-documentation-foundation-v1-scope.md');
const sourceMapPath = resolve(repoRoot, 'docs/maintainers/package-documentation-foundation-v1-source-map.md');
const operatorGuidePath = resolve(repoRoot, 'docs/maintainers/legato-capacitor-operator-guide.md');

test('root README is a thin orientation page linking canonical docs-site sections', async () => {
  const rootReadme = await readFile(rootReadmePath, 'utf8');

  assert.match(rootReadme, /canonical docs/i);
  assert.match(rootReadme, /apps\/docs-site\/src\/content\/docs\/getting-started\/index\.mdx/i);
  assert.match(rootReadme, /apps\/docs-site\/src\/content\/docs\/packages\/contract\/index\.mdx/i);
  assert.match(rootReadme, /apps\/docs-site\/src\/content\/docs\/packages\/capacitor\/index\.mdx/i);
  assert.match(rootReadme, /apps\/docs-site\/src\/content\/docs\/reference\/index\.mdx/i);
  assert.match(rootReadme, /apps\/docs-site\/src\/content\/docs\/releases\/index\.mdx/i);
  assert.match(rootReadme, /docs\/maintainers\/package-documentation-foundation-v1-scope\.md/i);
  assert.doesNotMatch(rootReadme, /## Package decision matrix/i);
  assert.doesNotMatch(rootReadme, /## Usage/i);
});

test('contract README is thin and defers full guidance to docs-site', async () => {
  const contractReadme = await readFile(contractReadmePath, 'utf8');

  assert.match(contractReadme, /apps\/docs-site\/src\/content\/docs\/packages\/contract\/index\.mdx/i);
  assert.match(contractReadme, /npm install @ddgutierrezc\/legato-contract/i);
  assert.match(contractReadme, /docs\/maintainers\/package-documentation-foundation-v1-source-map\.md/i);
  assert.doesNotMatch(contractReadme, /## Public surface/i);
  assert.doesNotMatch(contractReadme, /## Streaming semantics interpretation/i);
});

test('capacitor README is thin and routes details to docs-site', async () => {
  const capacitorReadme = await readFile(capacitorReadmePath, 'utf8');

  assert.match(capacitorReadme, /apps\/docs-site\/src\/content\/docs\/packages\/capacitor\/index\.mdx/i);
  assert.match(capacitorReadme, /npm install @ddgutierrezc\/legato-capacitor @ddgutierrezc\/legato-contract/i);
  assert.match(capacitorReadme, /docs\/maintainers\/legato-capacitor-operator-guide\.md/i);
  assert.doesNotMatch(capacitorReadme, /## API surface/i);
  assert.doesNotMatch(capacitorReadme, /### Legacy → namespaced migration map/i);
});

test('maintainer docs enforce scope non-goals and source-of-truth references', async () => {
  const [scopeDoc, sourceMap, operatorGuide] = await Promise.all([
    readFile(scopeDocPath, 'utf8'),
    readFile(sourceMapPath, 'utf8'),
    readFile(operatorGuidePath, 'utf8'),
  ]);

  assert.match(scopeDoc, /non-goal/i);
  assert.match(scopeDoc, /no full diátaxis rollout|no full diataxis rollout/i);
  assert.match(scopeDoc, /no invented api docs|do not invent/i);
  assert.match(scopeDoc, /packages\/contract\/src\/index\.ts/i);
  assert.match(scopeDoc, /packages\/capacitor\/src\/index\.ts/i);
  assert.match(scopeDoc, /non-public boundary/i);
  assert.match(scopeDoc, /root-canonical/i);
  assert.match(scopeDoc, /must not be published in `?apps\/docs-site`?/i);

  assert.match(sourceMap, /packages\/contract\/src\/events\.ts/i);
  assert.match(sourceMap, /packages\/contract\/package\.json/i);
  assert.match(sourceMap, /root-only exports|exports\["\."\]/i);
  assert.match(sourceMap, /run-external-consumer-validation\.mjs/i);
  assert.match(sourceMap, /packages\/capacitor\/src\/cli\/native-setup-cli\.mjs/i);
  assert.match(sourceMap, /legato native doctor/i);

  assert.match(operatorGuide, /repo-owned maintainer cli/i);
  assert.match(operatorGuide, /does not mutate capacitor-generated files/i);
});
