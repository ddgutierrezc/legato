import test from 'node:test';
import assert from 'node:assert/strict';

import { runNpmReadiness } from './run-npm-readiness.mjs';

test('npm readiness rejects unsupported package target values before running commands', async () => {
  await assert.rejects(
    runNpmReadiness({ packageTarget: 'not-real' }),
    /package_target must be one of capacitor, contract/i,
  );
});
