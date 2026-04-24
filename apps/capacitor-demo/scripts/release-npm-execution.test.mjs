import test from 'node:test';
import assert from 'node:assert/strict';

import { runNpmReleaseExecution } from './release-npm-execution.mjs';

test('npm execution returns not_selected for non-protected mode', async () => {
  const result = await runNpmReleaseExecution({
    releaseId: 'R-2026.04.24.1',
    mode: 'readiness',
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.terminal_status, 'not_selected');
  assert.equal(result.publish_attempted, false);
});

test('npm execution maps publish failure to failed terminal status', async () => {
  const calls = [];
  const result = await runNpmReleaseExecution({
    releaseId: 'R-2026.04.24.1',
    mode: 'protected-publish',
    commandRunner: async ({ command, args }) => {
      calls.push(`${command} ${args.join(' ')}`);
      if (args.includes('name')) return { exitCode: 0, stdout: '"@legato/capacitor"', stderr: '' };
      if (args.includes('version')) return { exitCode: 0, stdout: '"0.1.1"', stderr: '' };
      if (args[0] === 'publish') return { exitCode: 1, stdout: '', stderr: 'npm ERR! 403 already exists' };
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.terminal_status, 'failed');
  assert.equal(result.publish_attempted, true);
  assert.match(result.failures.join('\n'), /already exists/i);
  assert.ok(calls.some((entry) => /npm publish --access public/i.test(entry)));
});
