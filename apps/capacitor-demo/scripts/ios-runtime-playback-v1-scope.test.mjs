import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const guardrailsPath = resolve(repoRoot, 'docs/architecture/ios-runtime-playback-v1-scope-guardrails.md');
const iosCoreReadmePath = resolve(repoRoot, 'native/ios/LegatoCore/README.md');
const demoReadmePath = resolve(repoRoot, 'apps/capacitor-demo/README.md');

test('scope guardrails document lists explicit non-goals for ios-runtime-playback-v1', async () => {
  const guardrails = await readFile(guardrailsPath, 'utf8');

  assert.match(guardrails, /non-goals/i);
  assert.match(guardrails, /full background\/interruption lifecycle hardening/i);
  assert.match(guardrails, /broad Android\/iOS parity expansion/i);
  assert.match(guardrails, /new end-user playback features/i);
});

test('iOS docs cross-link scope guardrails and avoid lifecycle completion claims', async () => {
  const [iosCoreReadme, demoReadme] = await Promise.all([
    readFile(iosCoreReadmePath, 'utf8'),
    readFile(demoReadmePath, 'utf8'),
  ]);

  assert.match(iosCoreReadme, /docs\/architecture\/ios-runtime-playback-v1-scope-guardrails\.md/i);
  assert.match(demoReadme, /docs\/architecture\/ios-runtime-playback-v1-scope-guardrails\.md/i);

  assert.doesNotMatch(iosCoreReadme, /full lifecycle production hardening is complete/i);
  assert.doesNotMatch(demoReadme, /iOS lifecycle\/background parity complete/i);
});
