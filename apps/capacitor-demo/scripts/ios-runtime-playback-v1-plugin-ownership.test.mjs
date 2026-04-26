import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const pluginPath = resolve(repoRoot, 'packages/capacitor/ios/Sources/LegatoPlugin/LegatoPlugin.swift');

test('iOS plugin queue mutations delegate to canonical player engine APIs', async () => {
  const pluginSource = await readFile(pluginPath, 'utf8');

  assert.match(pluginSource, /try\s+core\.playerEngine\.appendToQueue\(/);
  assert.match(pluginSource, /try\s+core\.playerEngine\.removeFromQueue\(at:\s*index\)/);
  assert.match(pluginSource, /try\s+core\.playerEngine\.resetQueue\(\)/);
  assert.match(pluginSource, /try\s+core\.playerEngine\.skipTo\(index:\s*index\)/);
});

test('iOS plugin no longer mutates queueManager/snapshotStore directly in queue APIs', async () => {
  const pluginSource = await readFile(pluginPath, 'utf8');

  assert.doesNotMatch(pluginSource, /core\.queueManager\.(addToQueue|replaceQueue|clear)\(/);
  assert.doesNotMatch(pluginSource, /core\.snapshotStore\.(replacePlaybackSnapshot|updatePlaybackSnapshot)\(/);
});
