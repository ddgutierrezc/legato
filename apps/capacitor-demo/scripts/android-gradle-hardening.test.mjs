import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const androidRoot = resolve(__dirname, '../android');

test('demo android top-level build.gradle uses registered clean task', async () => {
  const source = await readFile(resolve(androidRoot, 'build.gradle'), 'utf8');

  assert.match(source, /tasks\.register\("clean",\s*Delete\)/);
  assert.doesNotMatch(source, /task\s+clean\s*\(type:\s*Delete\)/);
});

test('demo app build.gradle uses modern sdk DSL while preserving capacitor apply-from flow', async () => {
  const source = await readFile(resolve(androidRoot, 'app/build.gradle'), 'utf8');

  assert.match(source, /plugins\s*\{/);
  assert.match(source, /id\s+['"]com\.android\.application['"]/);
  assert.match(source, /defaultConfig\s*\{[\s\S]*minSdk\s*=/);
  assert.match(source, /defaultConfig\s*\{[\s\S]*targetSdk\s*=/);
  assert.match(source, /apply from:\s*['"]capacitor\.build\.gradle['"]/);
});
