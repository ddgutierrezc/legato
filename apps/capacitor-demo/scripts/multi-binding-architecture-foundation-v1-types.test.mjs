import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const bindingAdapterPath = resolve(repoRoot, 'packages/contract/src/binding-adapter.ts');
const contractIndexPath = resolve(repoRoot, 'packages/contract/src/index.ts');
const capacitorDefinitionsPath = resolve(repoRoot, 'packages/capacitor/src/definitions.ts');
const capacitorSyncPath = resolve(repoRoot, 'packages/capacitor/src/sync.ts');
const capacitorPluginPath = resolve(repoRoot, 'packages/capacitor/src/plugin.ts');
const capacitorReadmePath = resolve(repoRoot, 'packages/capacitor/README.md');

test('contract exposes transport-neutral binding adapter primitives', async () => {
  const [bindingAdapter, contractIndex] = await Promise.all([
    readFile(bindingAdapterPath, 'utf8'),
    readFile(contractIndexPath, 'utf8'),
  ]);

  assert.match(bindingAdapter, /export interface BindingListenerHandle/i);
  assert.match(bindingAdapter, /remove\(\): Promise<void> \| void/i);
  assert.match(bindingAdapter, /export interface BindingAdapter/i);
  assert.match(bindingAdapter, /addListener<\s*E extends LegatoEventName\s*>/i);
  assert.match(bindingAdapter, /removeAllListeners\(\): Promise<void>/i);
  assert.match(bindingAdapter, /BindingCapabilitiesSnapshot/i);
  assert.match(contractIndex, /binding-adapter\.js/);
});

test('capacitor type boundary uses binding listener handle instead of capacitor transport handle', async () => {
  const [definitionsSource, syncSource] = await Promise.all([
    readFile(capacitorDefinitionsPath, 'utf8'),
    readFile(capacitorSyncPath, 'utf8'),
  ]);

  assert.doesNotMatch(definitionsSource, /import type \{ PluginListenerHandle \} from '@capacitor\/core'/);
  assert.match(definitionsSource, /BindingListenerHandle/);
  assert.doesNotMatch(syncSource, /PluginListenerHandle/);
  assert.match(syncSource, /BindingListenerHandle/);
});

test('capacitor runtime entrypoint keeps plugin id and first-adapter boundary note', async () => {
  const [pluginSource, capacitorReadme] = await Promise.all([
    readFile(capacitorPluginPath, 'utf8'),
    readFile(capacitorReadmePath, 'utf8'),
  ]);

  assert.match(pluginSource, /registerPlugin<LegatoCapacitorPlugin>\('Legato'\)/);
  assert.match(pluginSource, /export const audioPlayer/);
  assert.match(pluginSource, /export const mediaSession/);
  assert.match(pluginSource, /export const Legato/);
  assert.match(pluginSource, /getCapabilities\(/);

  assert.match(capacitorReadme, /first concrete adapter/i);
  assert.match(capacitorReadme, /only implemented binding/i);
});

test('capabilities API is exposed on playback boundaries and excluded from mediaSession controls', async () => {
  const [definitionsSource, pluginSource] = await Promise.all([
    readFile(capacitorDefinitionsPath, 'utf8'),
    readFile(capacitorPluginPath, 'utf8'),
  ]);

  assert.match(definitionsSource, /getCapabilities\(\): Promise<BindingCapabilitiesSnapshot>/i);
  assert.match(pluginSource, /export const audioPlayer:[\s\S]*getCapabilities: sharedDelegate\.getCapabilities,/i);
  assert.match(pluginSource, /Legato:[\s\S]*removeAllListeners: sharedDelegate\.removeAllListeners,/i);
  assert.doesNotMatch(pluginSource, /mediaSession:[\s\S]*getCapabilities:/i);
});
