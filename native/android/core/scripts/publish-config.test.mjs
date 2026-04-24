import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const moduleRoot = resolve(scriptsDir, '..');

test('standalone settings.gradle defines plugin resolution and root project name', async () => {
  const content = await readFile(resolve(moduleRoot, 'settings.gradle'), 'utf8');
  assert.match(content, /rootProject\.name\s*=\s*['"]legato-android-core['"]/i);
  assert.match(content, /pluginManagement\s*\{/i);
  assert.match(content, /mavenCentral\(\)/i);
  assert.match(content, /google\(\)/i);
});

test('build.gradle uses vanniktech plugin with contract-fed publication coordinates', async () => {
  const content = await readFile(resolve(moduleRoot, 'build.gradle'), 'utf8');
  assert.match(content, /com\.vanniktech\.maven\.publish/i);
  assert.match(content, /native-artifacts\.json/i);
  assert.match(content, /coordinates\s*\(/i);
  assert.match(content, /publication-coordinate=/i);
  assert.doesNotMatch(content, /android\s*\{[\s\S]*publishing\s*\{[\s\S]*singleVariant\(/i);
});

test('gradle.properties.example documents required signing and central credentials', async () => {
  const content = await readFile(resolve(moduleRoot, 'gradle.properties.example'), 'utf8');
  assert.match(content, /mavenCentralUsername=/i);
  assert.match(content, /mavenCentralPassword=/i);
  assert.match(content, /signingInMemoryKey=/i);
  assert.match(content, /signingInMemoryKeyFile=/i);
  assert.match(content, /signingInMemoryKeyPassword=/i);
});
