import test from 'node:test';
import assert from 'node:assert/strict';

import { runNativeCli } from '../../src/cli/native-setup-cli.mjs';

const createWritable = () => {
  let value = '';
  return {
    write(chunk) {
      value += String(chunk);
    },
    toString() {
      return value;
    },
  };
};

test('native CLI help clarifies maintainer audience and non-goals', async () => {
  const stdout = createWritable();
  const stderr = createWritable();

  const result = await runNativeCli({
    args: ['--help'],
    cwd: process.cwd(),
    stdout,
    stderr,
  });

  assert.equal(result.exitCode, 1);
  const usage = stderr.toString();
  assert.match(usage, /repo-owned|maintainer/i);
  assert.match(usage, /not a general consumer bootstrap cli|non-goal/i);
  assert.match(usage, /does not mutate Capacitor-generated files|CapApp-SPM/i);
});
