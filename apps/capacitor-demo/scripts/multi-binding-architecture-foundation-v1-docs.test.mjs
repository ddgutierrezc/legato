import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const capabilityMapPath = resolve(repoRoot, 'docs/architecture/multi-binding-capability-map.md');
const guardrailsPath = resolve(repoRoot, 'docs/architecture/multi-binding-guardrails.md');
const spikePath = resolve(repoRoot, 'docs/architecture/spikes/flutter-rn-adapter-spike.md');
const architectureDocPath = resolve(repoRoot, 'arquitectura_cambio.md');

const collectUnbackedClaims = (markdown) => markdown
  .split('\n')
  .map((line) => line.trim())
  .filter((line) => line.startsWith('|'))
  .filter((line) => !/^\|[-\s|]+\|$/.test(line))
  .map((line) => line.split('|').slice(1, -1).map((cell) => cell.trim()))
  .filter((cells) => cells.length >= 5)
  .filter((cells) => /Reusable Core|Binding-Specific Adapter/i.test(cells[1] ?? ''))
  .filter((cells) => {
    const sourcePath = cells[3] ?? '';
    return sourcePath === '' || sourcePath === '—' || /^tbd$/i.test(sourcePath);
  });

test('capability map keeps current-vs-future sections with source-backed reusable/binding matrix', async () => {
  const capabilityMap = await readFile(capabilityMapPath, 'utf8');

  assert.match(capabilityMap, /Current \(implemented\)/i);
  assert.match(capabilityMap, /Future \(planned\)/i);
  assert.match(capabilityMap, /Reusable Core/i);
  assert.match(capabilityMap, /Binding-Specific Adapter/i);
  assert.match(capabilityMap, /packages\/contract\/src\//i);
  assert.match(capabilityMap, /native\/android\/core\//i);
  assert.match(capabilityMap, /native\/ios\/LegatoCore\//i);
  assert.match(capabilityMap, /packages\/capacitor\//i);
  assert.match(capabilityMap, /apps\/capacitor-demo\//i);
  assert.match(capabilityMap, /packages\/react-native\/\.gitkeep/i);
  assert.match(capabilityMap, /packages\/flutter\/legato\/\.gitkeep/i);
});

test('reject unbacked claims: rows without source path evidence are non-compliant', async () => {
  const capabilityMap = await readFile(capabilityMapPath, 'utf8');
  assert.equal(collectUnbackedClaims(capabilityMap).length, 0);

  const unbackedSample = `
## Current (implemented)
| Layer | Classification | State | Source path(s) | Evidence note |
|---|---|---|---|---|
| Missing source row | Reusable Core | Current |  | no evidence |
`;

  assert.equal(collectUnbackedClaims(unbackedSample).length, 1);
});

test('guardrails document pins do-not-touch release/runtime/host-wiring paths', async () => {
  const guardrails = await readFile(guardrailsPath, 'utf8');

  assert.match(guardrails, /do-not-touch/i);
  assert.match(guardrails, /docs\/releases\/native-artifact-foundation-v1\.md/i);
  assert.match(guardrails, /docs\/releases\/publication-pipeline-v2\.md/i);
  assert.match(guardrails, /apps\/capacitor-demo\/ios\/App\/CapApp-SPM\/Package\.swift/i);
  assert.match(guardrails, /packages\/capacitor\/android\//i);
  assert.match(guardrails, /packages\/capacitor\/ios\//i);
});

test('architecture narrative cross-links map and guardrails with explicit v1 out-of-scope list', async () => {
  const architectureDoc = await readFile(architectureDocPath, 'utf8');

  assert.match(architectureDoc, /docs\/architecture\/multi-binding-capability-map\.md/i);
  assert.match(architectureDoc, /docs\/architecture\/multi-binding-guardrails\.md/i);
  assert.match(architectureDoc, /Out of scope in v1/i);
  assert.match(architectureDoc, /no Flutter runtime adapter/i);
  assert.match(architectureDoc, /no React Native runtime adapter/i);
  assert.match(architectureDoc, /no release-pipeline rewiring/i);
  assert.match(architectureDoc, /no native engine rewrite/i);
});

test('flutter/rn spike doc states entry criteria and conformance checklist without implementation promises', async () => {
  const spikeDoc = await readFile(spikePath, 'utf8');

  assert.match(spikeDoc, /entry criteria/i);
  assert.match(spikeDoc, /success metrics/i);
  assert.match(spikeDoc, /method parity/i);
  assert.match(spikeDoc, /event parity/i);
  assert.match(spikeDoc, /capability parity/i);
  assert.match(spikeDoc, /error-code parity/i);
  assert.match(spikeDoc, /packages\/contract\/src\/binding-adapter\.ts/i);
  assert.match(spikeDoc, /does not implement Flutter or React Native runtime adapters in v1/i);
});
