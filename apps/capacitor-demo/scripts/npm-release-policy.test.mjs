import test from 'node:test';
import assert from 'node:assert/strict';

import { runNpmReleasePolicy } from './run-npm-release-policy.mjs';

test('npm policy readiness mode runs checks only and never attempts publish', async () => {
  const commands = [];
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.1',
    mode: 'readiness',
    runReadiness: async () => ({ status: 'PASS' }),
    runCommand: async ({ command, args }) => {
      commands.push(`${command} ${args.join(' ')}`);
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.terminal_status, 'validated');
  assert.equal(result.publish_attempted, false);
  assert.equal(commands.some((entry) => /npm\s+publish/i.test(entry)), false);
});

test('npm policy protected-publish mode blocks without explicit publish intent evidence', async () => {
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.1',
    mode: 'protected-publish',
    runReadiness: async () => ({ status: 'PASS' }),
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.terminal_status, 'policy_blocked');
  assert.match(result.failures.join('\n'), /publish intent/i);
});

test('npm policy protected-publish mode accepts explicit intent and keeps evidence trail', async () => {
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.1',
    mode: 'protected-publish',
    publishIntentEvidence: 'https://github.com/org/repo/actions/runs/123#approval',
    runReadiness: async () => ({ status: 'PASS' }),
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.terminal_status, 'validated');
  assert.equal(result.publish_intent_evidence, 'https://github.com/org/repo/actions/runs/123#approval');
});
