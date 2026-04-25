import test from 'node:test';
import assert from 'node:assert/strict';

import { runNpmReleasePolicy } from './run-npm-release-policy.mjs';

test('npm policy readiness mode runs checks only and never attempts publish', async () => {
  const executions = [];
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.1',
    mode: 'readiness',
    runReadiness: async () => ({ status: 'PASS' }),
    runExecution: async (options) => {
      executions.push(options.mode);
      return { status: 'PASS', terminal_status: 'not_selected', publish_attempted: false };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.terminal_status, 'blocked');
  assert.equal(result.publish_attempted, false);
  assert.equal(result.package_target, 'capacitor');
  assert.deepEqual(executions, []);
});

test('npm policy forwards explicit contract package target to execution phase', async () => {
  const executions = [];
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.7',
    mode: 'protected-publish',
    packageTarget: 'contract',
    publishIntentEvidence: 'https://github.com/org/repo/actions/runs/123#approval',
    runReadiness: async () => ({ status: 'PASS' }),
    runExecution: async (options) => {
      executions.push(options);
      return {
        status: 'PASS',
        terminal_status: 'published',
        publish_attempted: true,
        publish_command: 'npm publish --access public',
        verify: { npm_view: 'PASS' },
      };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.package_target, 'contract');
  assert.equal(executions.length, 1);
  assert.equal(executions[0].packageTarget, 'contract');
});

test('npm policy rejects unsupported package target values', async () => {
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.8',
    mode: 'protected-publish',
    packageTarget: 'not-real',
    publishIntentEvidence: 'https://github.com/org/repo/actions/runs/123#approval',
    runReadiness: async () => ({ status: 'PASS' }),
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.terminal_status, 'blocked');
  assert.match(result.failures.join('\n'), /package_target/i);
});

test('npm policy protected-publish mode blocks without explicit publish intent evidence', async () => {
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.1',
    mode: 'protected-publish',
    runReadiness: async () => ({ status: 'PASS' }),
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.terminal_status, 'blocked');
  assert.match(result.failures.join('\n'), /publish intent/i);
});

test('npm policy protected-publish mode accepts explicit intent and keeps evidence trail', async () => {
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.1',
    mode: 'protected-publish',
    publishIntentEvidence: 'https://github.com/org/repo/actions/runs/123#approval',
    runReadiness: async () => ({ status: 'PASS' }),
    runExecution: async () => ({
      status: 'PASS',
      terminal_status: 'published',
      publish_attempted: true,
      publish_command: 'npm publish --access public',
      verify: { npm_view: 'PASS' },
    }),
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.terminal_status, 'published');
  assert.equal(result.publish_attempted, true);
  assert.equal(result.publish_command, 'npm publish --access public');
  assert.equal(result.publish_intent_evidence, 'https://github.com/org/repo/actions/runs/123#approval');
});

test('npm policy maps registry publish failure to failed lane status', async () => {
  const result = await runNpmReleasePolicy({
    releaseId: 'R-2026.04.24.1',
    mode: 'protected-publish',
    publishIntentEvidence: 'https://github.com/org/repo/actions/runs/123#approval',
    runReadiness: async () => ({ status: 'PASS' }),
    runExecution: async () => ({
      status: 'FAIL',
      terminal_status: 'failed',
      publish_attempted: true,
      failures: ['npm ERR! 403 already exists'],
      error_reference: 'npm-release-v2/R-2026.04.24.1/publish.json',
    }),
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.terminal_status, 'failed');
  assert.equal(result.publish_attempted, true);
  assert.match(result.failures.join('\n'), /already exists/i);
  assert.match(result.error_reference, /publish\.json/i);
});
