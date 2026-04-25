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

test('root README stays consumer-first with package decision matrix and maintainer-doc link', async () => {
  const rootReadme = await readFile(rootReadmePath, 'utf8');

  assert.match(rootReadme, /package decision matrix/i);
  assert.match(rootReadme, /@ddgutierrezc\/legato-contract/i);
  assert.match(rootReadme, /@ddgutierrezc\/legato-capacitor/i);
  assert.match(rootReadme, /\(packages\/contract\/README\.md\)/i);
  assert.match(rootReadme, /\(packages\/capacitor\/README\.md\)/i);
  assert.match(rootReadme, /docs\/maintainers\/package-documentation-foundation-v1-scope\.md/i);
});

test('contract README documents verified event exports and links to source map', async () => {
  const contractReadme = await readFile(contractReadmePath, 'utf8');

  assert.match(contractReadme, /LEGATO_EVENT_NAMES/);
  assert.doesNotMatch(contractReadme, /\bLEGATO_EVENTS\b/);
  assert.match(contractReadme, /public surface/i);
  assert.match(contractReadme, /docs\/maintainers\/package-documentation-foundation-v1-source-map\.md/i);
});

test('capacitor README keeps consumer onboarding and links maintainer operator guide', async () => {
  const capacitorReadme = await readFile(capacitorReadmePath, 'utf8');

  assert.match(capacitorReadme, /capacitor-native integration/i);
  assert.match(capacitorReadme, /audioPlayer/);
  assert.match(capacitorReadme, /mediaSession/);
  assert.match(capacitorReadme, /docs\/maintainers\/legato-capacitor-operator-guide\.md/i);
  assert.match(capacitorReadme, /legato native doctor/i);
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

  assert.match(sourceMap, /packages\/contract\/src\/events\.ts/i);
  assert.match(sourceMap, /packages\/contract\/package\.json/i);
  assert.match(sourceMap, /root-only exports|exports\["\."\]/i);
  assert.match(sourceMap, /run-external-consumer-validation\.mjs/i);
  assert.match(sourceMap, /packages\/capacitor\/src\/cli\/native-setup-cli\.mjs/i);
  assert.match(sourceMap, /legato native doctor/i);

  assert.match(operatorGuide, /repo-owned maintainer cli/i);
  assert.match(operatorGuide, /does not mutate capacitor-generated files/i);
});
