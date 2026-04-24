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

test('package scripts expose iOS handoff/verify/closeout execution commands', async () => {
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(typeof packageJson.scripts?.['release:ios:handoff'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:ios:verify'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:ios:closeout'], 'string');

  assert.match(packageJson.scripts['release:ios:handoff'], /release-ios-execution\.mjs\s+handoff/i);
  assert.match(packageJson.scripts['release:ios:verify'], /release-ios-execution\.mjs\s+verify/i);
  assert.match(packageJson.scripts['release:ios:closeout'], /release-ios-execution\.mjs\s+closeout/i);
  assert.match(packageJson.scripts['release:ios:verify'], /--attempts/i);
  assert.match(packageJson.scripts['release:ios:verify'], /--backoff-ms/i);
  assert.match(packageJson.scripts['release:ios:handoff'], /--artifacts-dir/i);
  assert.match(packageJson.scripts['release:ios:handoff'], /--proof-type/i);
  assert.match(packageJson.scripts['release:ios:handoff'], /--proof-value/i);
  assert.match(packageJson.scripts['release:ios:handoff'], /IOS_OPERATOR:\?/i);
  assert.match(packageJson.scripts['release:ios:handoff'], /IOS_PUBLISHED_AT:\?/i);
});

test('package scripts expose release-control and npm policy lane entrypoints', async () => {
  const packageJsonRaw = await readFile(packageJsonPath, 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(typeof packageJson.scripts?.['release:control:contract:check'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:control:summary:aggregate'], 'string');
  assert.equal(typeof packageJson.scripts?.['release:npm:policy'], 'string');

  assert.match(packageJson.scripts['release:control:contract:check'], /release-control-contract\.mjs/i);
  assert.match(packageJson.scripts['release:control:summary:aggregate'], /aggregate-release-summary\.mjs/i);
  assert.match(packageJson.scripts['release:npm:policy'], /run-npm-release-policy\.mjs/i);
});
