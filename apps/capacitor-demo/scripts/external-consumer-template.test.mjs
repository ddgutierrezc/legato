import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const templateRoot = resolve(currentDir, './external-consumer-template');

test('external consumer template package uses standard Capacitor deps with no workspace or local file protocols', async () => {
  const packageJsonRaw = await readFile(resolve(templateRoot, 'package.json'), 'utf8');
  const packageJson = JSON.parse(packageJsonRaw);

  assert.equal(packageJson.name, '@legato/external-consumer-template');
  assert.equal(typeof packageJson.scripts?.typecheck, 'string');
  assert.match(packageJson.scripts.typecheck, /tsc\s+--noEmit/i);
  assert.equal(Object.hasOwn(packageJson.dependencies ?? {}, '@ddgutierrezc/legato-capacitor'), false);
  assert.equal(Object.hasOwn(packageJson.dependencies ?? {}, '@ddgutierrezc/legato-contract'), false);

  const dependencyValues = Object.values({
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  });
  for (const value of dependencyValues) {
    assert.equal(typeof value, 'string');
    assert.equal(value.includes('workspace:'), false);
    assert.equal(value.includes('file:'), false);
  }
});

test('external consumer template compile surface imports legato capacitor and contract types', async () => {
  const source = await readFile(resolve(templateRoot, 'src/main.ts'), 'utf8');
  assert.match(source, /from\s+'@legato\/capacitor'/i);
  assert.match(source, /from\s+'@legato\/contract'/i);
  assert.match(source, /Legato/i);
});
