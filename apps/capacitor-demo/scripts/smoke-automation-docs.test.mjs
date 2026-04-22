import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const demoRoot = resolve(currentDir, '..');

const readPackageJson = async () => {
  const raw = await readFile(resolve(demoRoot, 'package.json'), 'utf8');
  return JSON.parse(raw);
};

const readReadme = () => readFile(resolve(demoRoot, 'README.md'), 'utf8');
const readTemplate = () => readFile(resolve(demoRoot, 'SMOKE_VALIDATION_TEMPLATE.md'), 'utf8');

test('package scripts expose smoke validator entrypoints for android, ios, and combined checks', async () => {
  const pkg = await readPackageJson();
  const scripts = pkg.scripts ?? {};

  assert.equal(typeof scripts['validate:smoke:android'], 'string');
  assert.equal(typeof scripts['validate:smoke:ios'], 'string');
  assert.equal(typeof scripts['validate:smoke:all'], 'string');

  assert.match(scripts['validate:smoke:android'], /validate-smoke-report\.mjs/);
  assert.match(scripts['validate:smoke:ios'], /validate-smoke-report\.mjs/);
  assert.match(scripts['validate:smoke:all'], /validate-smoke-report\.mjs/);
});

test('README documents smoke-only automation scope and preserves manual-harness-first guidance', async () => {
  const readme = await readReadme();

  assert.match(readme, /Smoke automation \(v1, smoke-only\)/i);
  assert.match(readme, /Do not broaden this automation beyond `smoke` in v1\./i);
  assert.match(readme, /manual harness is still the primary debugging workflow/i);
  assert.match(readme, /validate:smoke:android/i);
  assert.match(readme, /validate:smoke:ios/i);
  assert.match(readme, /validate:smoke:all/i);
});

test('smoke validation template is scoped to smoke flow and keeps manual-control regression checklist', async () => {
  const template = await readTemplate();

  assert.match(template, /\| smoke \| PASS\/FAIL \|/i);
  assert.doesNotMatch(template, /\| let-end \|/i);
  assert.doesNotMatch(template, /\| boundary \|/i);
  assert.doesNotMatch(template, /\| artwork-race \|/i);
  assert.match(template, /Manual Controls Regression/i);
  assert.match(template, /`setup\(\)` still works/i);
  assert.match(template, /`play\(\)` \/ `pause\(\)` \/ `stop\(\)` still work/i);
  assert.match(template, /Copy raw log/i);
});
