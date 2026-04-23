import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const packageJsonPath = resolve(currentDir, '../package.json');

test('package scripts expose iOS preflight release gate with explicit release tag input', async () => {
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(typeof packageJson.scripts?.['release:ios:preflight'], 'string');
  assert.match(packageJson.scripts['release:ios:preflight'], /release-ios-preflight\.mjs/i);
  assert.match(packageJson.scripts['release:ios:preflight'], /--release-tag/i);
  assert.match(packageJson.scripts['release:ios:preflight'], /native-artifacts\.json/i);
});
