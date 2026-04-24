import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));
const workflowPath = resolve(currentDir, '../../../.github/workflows/release-android.yml');

function getJobSection(workflow, jobName) {
  const jobPattern = new RegExp(`\\n  ${jobName}:\\n([\\s\\S]*?)(?=\\n  [a-z0-9-]+:\\n|$)`, 'i');
  const match = workflow.match(jobPattern);
  assert.ok(match, `expected to find job section for ${jobName}`);
  return match[1];
}

function getJobIfExpression(workflow, jobName) {
  const section = getJobSection(workflow, jobName);
  const match = section.match(/\n {4}if:\s*\$\{\{\s*([^}]+?)\s*\}\}/i);
  assert.ok(match, `expected if condition for ${jobName}`);
  return match[1].trim();
}

function evaluateGithubIfExpression(expression, { mode, preflightResult, publishResult }) {
  const jsExpr = expression
    .replace(/always\(\)/gi, 'true')
    .replace(/inputs\.mode/g, JSON.stringify(mode))
    .replace(/needs\.android-preflight\.result/g, JSON.stringify(preflightResult))
    .replace(/needs\.android-publish\.result/g, JSON.stringify(publishResult));

  return Function(`return (${jsExpr});`)();
}

function simulateReleaseWorkflow({ mode, preflightResult, publishResult, verifyResult }, conditions) {
  const executionOrder = [];

  executionOrder.push('validate-dispatch');

  executionOrder.push('android-preflight');

  const shouldRunPublish = evaluateGithubIfExpression(conditions.publishIf, {
    mode,
    preflightResult,
    publishResult,
  });

  const resolvedPublishResult = shouldRunPublish && preflightResult === 'success' ? publishResult : 'skipped';
  if (resolvedPublishResult !== 'skipped') {
    executionOrder.push('android-publish');
  }

  const shouldRunVerify = evaluateGithubIfExpression(conditions.verifyIf, {
    mode,
    preflightResult,
    publishResult: resolvedPublishResult,
  });

  const resolvedVerifyResult = shouldRunVerify ? verifyResult : 'skipped';
  if (resolvedVerifyResult !== 'skipped') {
    executionOrder.push('android-verify');
  }

  executionOrder.push('evidence');

  const stageSummary = {
    validate_dispatch: 'success',
    android_preflight: preflightResult,
    android_publish: resolvedPublishResult,
    android_verify: resolvedVerifyResult,
  };

  return { executionOrder, stageSummary };
}

test('release workflow exposes dispatch contract with Android-only target, mode, and release_id', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /workflow_dispatch:/i);
  assert.match(workflow, /target:\s*[\s\S]*options:\s*[\s\S]*-\s*android/i);
  assert.match(workflow, /mode:\s*[\s\S]*options:\s*[\s\S]*-\s*preflight-only[\s\S]*-\s*publish/i);
  assert.match(workflow, /release_id:/i);
  assert.match(workflow, /v1 is Android-only/i);
});

test('release workflow runs preflight before publish and protects publish with release environment', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /android-preflight:/i);
  assert.match(workflow, /android-publish:[\s\S]*needs:\s*android-preflight/i);
  assert.match(workflow, /android-publish:[\s\S]*if:\s*\$\{\{\s*inputs\.mode\s*==\s*'publish'\s*\}\}/i);
  assert.match(workflow, /android-publish:[\s\S]*environment:\s*release/i);
});

test('release workflow always uploads required evidence bundle files', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  assert.match(workflow, /evidence:/i);
  assert.match(workflow, /if:\s*always\(\)/i);
  assert.match(workflow, /dispatch\.json/i);
  assert.match(workflow, /preflight\.log/i);
  assert.match(workflow, /publish\.log/i);
  assert.match(workflow, /verify\.log/i);
  assert.match(workflow, /summary\.json/i);
  assert.match(workflow, /summary\.md/i);
});

test('release workflow fail-fast path skips publish and verify when preflight fails', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  const conditions = {
    publishIf: getJobIfExpression(workflow, 'android-publish'),
    verifyIf: getJobIfExpression(workflow, 'android-verify'),
  };

  const simulation = simulateReleaseWorkflow(
    {
      mode: 'publish',
      preflightResult: 'failure',
      publishResult: 'success',
      verifyResult: 'success',
    },
    conditions,
  );

  assert.equal(simulation.stageSummary.android_preflight, 'failure');
  assert.equal(simulation.stageSummary.android_publish, 'skipped');
  assert.equal(simulation.stageSummary.android_verify, 'skipped');
  assert.deepEqual(simulation.executionOrder, ['validate-dispatch', 'android-preflight', 'evidence']);
});

test('release workflow publish path runs publish then verify and reports final success states', async () => {
  const workflow = await readFile(workflowPath, 'utf8');

  const conditions = {
    publishIf: getJobIfExpression(workflow, 'android-publish'),
    verifyIf: getJobIfExpression(workflow, 'android-verify'),
  };

  const simulation = simulateReleaseWorkflow(
    {
      mode: 'publish',
      preflightResult: 'success',
      publishResult: 'success',
      verifyResult: 'success',
    },
    conditions,
  );

  assert.deepEqual(simulation.executionOrder, [
    'validate-dispatch',
    'android-preflight',
    'android-publish',
    'android-verify',
    'evidence',
  ]);
  assert.deepEqual(simulation.stageSummary, {
    validate_dispatch: 'success',
    android_preflight: 'success',
    android_publish: 'success',
    android_verify: 'success',
  });
});
