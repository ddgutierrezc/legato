import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const iosCoreReadmePath = resolve(repoRoot, 'native/ios/LegatoCore/README.md');
const demoReadmePath = resolve(repoRoot, 'apps/capacitor-demo/README.md');
const nativeCoreSpecPath = resolve(repoRoot, 'specs/native-core-v0.md');
const taskBreakdownSpecPath = resolve(repoRoot, 'specs/task-breakdown-v0.md');
const architectureDocPath = resolve(repoRoot, 'arquitectura_cambio.md');
const packageJsonPath = resolve(repoRoot, 'apps/capacitor-demo/package.json');

test('iOS core README no longer claims AVPlayer runtime is future/pending work', async () => {
  const readme = await readFile(iosCoreReadmePath, 'utf8');

  assert.doesNotMatch(readme, /future AVPlayer integration/i);
  assert.doesNotMatch(readme, /default runtime adapters are intentionally no-op\/in-memory/i);
  assert.match(readme, /AVPlayer-backed runtime is implemented/i);
  assert.match(readme, /foreground audible playback/i);
  assert.match(readme, /not yet full background\/lifecycle production hardening/i);
});

test('capacitor demo README states iOS runtime playback exists with explicit scope limits', async () => {
  const readme = await readFile(demoReadmePath, 'utf8');

  assert.doesNotMatch(readme, /iOS host scaffold generated \(prep only\)/i);
  assert.doesNotMatch(readme, /does \*\*not\*\* give us yet:\s*- Verified iOS smoke execution end-to-end/i);
  assert.match(readme, /iOS runtime playback is already implemented/i);
  assert.match(readme, /runtime integrity closure/i);
  assert.match(readme, /not production-hardened lifecycle\/background/i);
});

test('legacy specs/docs mark old pending-runtime wording as superseded history', async () => {
  const [nativeCoreSpec, taskBreakdownSpec, architectureDoc] = await Promise.all([
    readFile(nativeCoreSpecPath, 'utf8'),
    readFile(taskBreakdownSpecPath, 'utf8'),
    readFile(architectureDocPath, 'utf8'),
  ]);

  assert.match(nativeCoreSpec, /superseded by shipped iOS AVPlayer runtime/i);
  assert.match(taskBreakdownSpec, /iOS runtime parity remains deferred.*historical wording/i);
  assert.match(architectureDoc, /historical note: some roadmap sections predate shipped iOS runtime/i);
});

test('npm readiness suite includes ios runtime playback v1 docs regression test', async () => {
  const packageJson = await readFile(packageJsonPath, 'utf8');
  assert.match(packageJson, /ios-runtime-playback-v1-docs\.test\.mjs/);
});
