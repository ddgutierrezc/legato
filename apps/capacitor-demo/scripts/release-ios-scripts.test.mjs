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
  assert.match(packageJson.scripts['release:ios:preflight'], /--json-out/i);
  assert.match(packageJson.scripts['release:ios:preflight'], /native-artifacts\.json/i);
});

test('package scripts expose iOS publish execution command', async () => {
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(typeof packageJson.scripts?.['release:ios:publish'], 'string');

  assert.match(packageJson.scripts['release:ios:publish'], /release-ios-execution\.mjs\s+publish/i);
  assert.match(packageJson.scripts['release:ios:publish'], /--distribution-repo/i);
  assert.match(packageJson.scripts['release:ios:publish'], /--distribution-ref/i);
  assert.match(packageJson.scripts['release:ios:publish'], /--artifacts-dir/i);
  assert.match(packageJson.scripts['release:ios:publish'], /IOS_GITHUB_APP_TOKEN:\?/i);
});

test('package scripts expose release-control and npm policy lane entrypoints', async () => {
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(typeof packageJson.scripts?.['release:control:contract:check'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:control:summary:aggregate'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:npm:policy'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:npm:execute'], 'string');

  assert.match(packageJson.scripts['release:control:contract:check'], /release-control-contract\.mjs/i);
  assert.match(packageJson.scripts['release:control:summary:aggregate'], /aggregate-release-summary\.mjs/i);
  assert.match(packageJson.scripts['release:npm:policy'], /run-npm-release-policy\.mjs/i);
  assert.match(packageJson.scripts['release:npm:execute'], /release-npm-execution\.mjs/i);
});
