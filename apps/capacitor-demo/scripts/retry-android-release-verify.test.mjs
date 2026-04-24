import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseRetryConfig,
  retryAndroidReleaseVerify,
} from './retry-android-release-verify.mjs';

test('verify retry returns PASS when a later attempt succeeds', async () => {
  let attempts = 0;
  const sleepCalls = [];

  const result = await retryAndroidReleaseVerify({
    attempts: 3,
    backoffMs: 15,
    command: 'npm run release:android:verify',
    runCommand: async () => {
      attempts += 1;
      if (attempts < 2) {
        return { exitCode: 1 };
      }
      return { exitCode: 0 };
    },
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.attemptsUsed, 2);
  assert.deepEqual(sleepCalls, [15]);
});

test('verify retry returns FAIL after terminal retries', async () => {
  const sleepCalls = [];

  const result = await retryAndroidReleaseVerify({
    attempts: 3,
    backoffMs: 10,
    command: 'npm run release:android:verify',
    runCommand: async () => ({ exitCode: 1 }),
    sleep: async (ms) => {
      sleepCalls.push(ms);
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.equal(result.retries.length, 3);
  assert.equal(result.failures.length, 1);
  assert.deepEqual(sleepCalls, [10, 10]);
});

test('retry config parser rejects malformed values', async () => {
  assert.throws(() => parseRetryConfig(['--attempts', '0']), /invalid attempts/i);
  assert.throws(() => parseRetryConfig(['--backoff-ms', '-1']), /invalid backoff-ms/i);
});
