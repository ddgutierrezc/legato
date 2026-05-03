import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('plugin entry remains build-time only and avoids runtime bridge imports', () => {
  const entry = readFileSync(resolve(process.cwd(), 'packages/react-native/plugin/src/index.ts'), 'utf8');

  assert.equal(entry.includes("from '../../src"), false);
  assert.equal(entry.includes("from '../src"), false);
  assert.equal(entry.includes('createRunOncePlugin'), true);
});
