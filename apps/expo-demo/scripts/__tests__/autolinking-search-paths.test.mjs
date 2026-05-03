import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const PACKAGE_JSON_PATH = new URL('../../package.json', import.meta.url);

test('expo autolinking search path is scoped to react-native package only', async () => {
  const raw = await readFile(PACKAGE_JSON_PATH, 'utf8');
  const pkg = JSON.parse(raw);

  const searchPaths = pkg?.expo?.autolinking?.searchPaths;

  assert.deepEqual(searchPaths, ['../../packages/react-native']);
});
