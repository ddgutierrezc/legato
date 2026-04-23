import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(currentDir, '../package.json');

test('package scripts expose android preflight/publish/verify release gates', async () => {
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(typeof packageJson.scripts?.['release:android:preflight'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:android:publish'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:android:verify'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:scope:check'], 'string');

  assert.match(packageJson.scripts['release:android:preflight'], /release-android\.mjs\s+preflight/i);
  assert.match(packageJson.scripts['release:android:publish'], /release-android\.mjs\s+publish/i);
  assert.match(packageJson.scripts['release:android:verify'], /release-android\.mjs\s+verify/i);
  assert.match(packageJson.scripts['release:android:preflight'], /native-artifacts\.json/i);
  assert.match(packageJson.scripts['release:scope:check'], /check-publication-scope\.mjs/i);
});
