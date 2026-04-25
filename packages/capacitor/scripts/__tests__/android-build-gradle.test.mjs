import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidBuildGradlePath = resolve(__dirname, '../../android/build.gradle');

test('android/build.gradle resolves Kotlin plugin without host pluginManagement patching', async () => {
  const source = await readFile(androidBuildGradlePath, 'utf8');

  assert.match(source, /buildscript\s*\{/);
  assert.match(source, /classpath\s+['"]org\.jetbrains\.kotlin:kotlin-gradle-plugin:\$\{?kotlinVersion\}?['"]/);
  assert.match(source, /apply plugin:\s*['"]com\.android\.library['"]/);
  assert.match(source, /apply plugin:\s*['"]kotlin-android['"]/);
  assert.doesNotMatch(source, /plugins\s*\{[\s\S]*org\.jetbrains\.kotlin\.android[\s\S]*\}/);
  assert.match(source, /defaultConfig\s*\{[\s\S]*minSdk\s*=/);
});
