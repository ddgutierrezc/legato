import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const guardrailsPath = resolve(repoRoot, 'docs/architecture/streaming-media-semantics-v1-scope-guardrails.md');
const demoReadmePath = resolve(repoRoot, 'apps/capacitor-demo/README.md');
const capacitorReadmePath = resolve(repoRoot, 'packages/capacitor/README.md');
const contractReadmePath = resolve(repoRoot, 'packages/contract/README.md');

test('streaming semantics guardrails keep conservative matrix and explicit non-goals', async () => {
  const guardrails = await readFile(guardrailsPath, 'utf8');

  assert.match(guardrails, /file/i);
  assert.match(guardrails, /progressive/i);
  assert.match(guardrails, /hls/i);
  assert.match(guardrails, /dash/i);
  assert.match(guardrails, /degrade to .*non-seekable/i);
  assert.match(guardrails, /DRM/i);
  assert.match(guardrails, /token refresh/i);
  assert.match(guardrails, /network resilience/i);
  assert.match(guardrails, /process-death/i);
});

test('docs keep semantics inference language and avoid out-of-scope expansion claims', async () => {
  const [demoReadme, capacitorReadme, contractReadme] = await Promise.all([
    readFile(demoReadmePath, 'utf8'),
    readFile(capacitorReadmePath, 'utf8'),
    readFile(contractReadmePath, 'utf8'),
  ]);

  assert.match(demoReadme, /Streaming media semantics support matrix/i);
  assert.match(capacitorReadme, /conservative policy/i);
  assert.match(contractReadme, /Streaming semantics interpretation/i);

  assert.doesNotMatch(capacitorReadme, /DRM is supported in this milestone/i);
  assert.doesNotMatch(demoReadme, /process-death restoration is covered/i);
});
