import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const rootReadmePath = resolve(repoRoot, 'README.md');
const capacitorReadmePath = resolve(repoRoot, 'packages/capacitor/README.md');
const contractReadmePath = resolve(repoRoot, 'packages/contract/README.md');

test('docs define package-selection guidance for capacitor vs contract npm consumers', async () => {
  const [rootReadme, capacitorReadme, contractReadme] = await Promise.all([
    readFile(rootReadmePath, 'utf8'),
    readFile(capacitorReadmePath, 'utf8'),
    readFile(contractReadmePath, 'utf8'),
  ]);

  assert.match(rootReadme, /@ddgutierrezc\/legato-capacitor/i);
  assert.match(rootReadme, /@ddgutierrezc\/legato-contract/i);
  assert.match(rootReadme, /which package/i);

  assert.match(capacitorReadme, /npm install\s+@ddgutierrezc\/legato-capacitor/i);
  assert.match(contractReadme, /npm install\s+@ddgutierrezc\/legato-contract/i);
});

test('docs keep CLI scope only in capacitor package and contract explicitly no CLI', async () => {
  const [capacitorReadme, contractReadme] = await Promise.all([
    readFile(capacitorReadmePath, 'utf8'),
    readFile(contractReadmePath, 'utf8'),
  ]);

  assert.match(capacitorReadme, /`legato`/i);
  assert.match(capacitorReadme, /repo-owned|maintainer/i);
  assert.match(contractReadme, /no cli|does not ship.*cli/i);
  assert.doesNotMatch(contractReadme, /`legato`\s+native/i);
});

test('docs state non-goals to prevent runtime/release scope creep', async () => {
  const [rootReadme, capacitorReadme, contractReadme] = await Promise.all([
    readFile(rootReadmePath, 'utf8'),
    readFile(capacitorReadmePath, 'utf8'),
    readFile(contractReadmePath, 'utf8'),
  ]);

  const combined = [rootReadme, capacitorReadme, contractReadme].join('\n');
  assert.match(combined, /non-goal/i);
  assert.match(combined, /no runtime behavior expansion|runtime behavior/i);
  assert.match(combined, /no release-lane redesign|release-lane redesign/i);
  assert.match(combined, /no platform bootstrap automation|platform bootstrap automation/i);
});

test('docs disclose unsupported runtime environments and remediation guidance', async () => {
  const [rootReadme, capacitorReadme, contractReadme] = await Promise.all([
    readFile(rootReadmePath, 'utf8'),
    readFile(capacitorReadmePath, 'utf8'),
    readFile(contractReadmePath, 'utf8'),
  ]);

  const combined = [rootReadme, capacitorReadme, contractReadme].join('\n');
  assert.match(combined, /unsupported|not supported/i);
  assert.match(combined, /node(\.js)?\s+.*lts|supported versions?/i);
  assert.match(combined, /upgrade|remediation|use .*supported/i);
});
