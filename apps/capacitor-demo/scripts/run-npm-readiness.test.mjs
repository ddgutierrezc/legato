import test from 'node:test';
import assert from 'node:assert/strict';

import { runNpmReadiness } from './run-npm-readiness.mjs';

test('npm readiness rejects unsupported package target values before running commands', async () => {
  await assert.rejects(
    runNpmReadiness({ packageTarget: 'not-real' }),
    /package_target must be one of capacitor, contract/i,
  );
});

test('npm readiness runs ergonomics validation for both packages before tarball inspection', async () => {
  const calls = [];
  const commandRunner = async ({ command, args }) => {
    calls.push([command, ...args].join(' '));

    if (command === 'node' && args.some((arg) => /assert-package-entries\.mjs$/i.test(arg))) {
      return { stdout: JSON.stringify({ status: 'PASS' }), stderr: '', exitCode: 0 };
    }
    if (command === 'node' && args.some((arg) => /inspect-tarball\.mjs$/i.test(arg))) {
      const profile = args[args.indexOf('--profile') + 1];
      return {
        stdout: JSON.stringify({ status: 'PASS', profile, tarballPath: `/tmp/${profile}.tgz` }),
        stderr: '',
        exitCode: 0,
      };
    }
    if (command === 'node' && args.some((arg) => /run-external-consumer-validation\.mjs$/i.test(arg))) {
      return { stdout: JSON.stringify({ status: 'PASS', exitCode: 0 }), stderr: '', exitCode: 0 };
    }

    return { stdout: '', stderr: '', exitCode: 0 };
  };

  const result = await runNpmReadiness({ packageTarget: 'capacitor', commandRunner });
  assert.equal(result.readiness_profile, 'capacitor-cross-package');

  const ergonomicsCalls = calls.filter((call) => /assert-package-entries\.mjs/i.test(call));
  assert.equal(ergonomicsCalls.length, 2);
  const contractErgonomicsIndex = calls.findIndex((call) => /assert-package-entries\.mjs.*--profile contract/i.test(call));
  const capacitorErgonomicsIndex = calls.findIndex((call) => /assert-package-entries\.mjs.*--profile capacitor/i.test(call));
  const firstInspectIndex = calls.findIndex((call) => /inspect-tarball\.mjs/i.test(call));

  assert.equal(contractErgonomicsIndex > -1, true);
  assert.equal(capacitorErgonomicsIndex > -1, true);
  assert.equal(firstInspectIndex > contractErgonomicsIndex, true);
  assert.equal(firstInspectIndex > capacitorErgonomicsIndex, true);

  const externalValidationCall = calls.find((call) => /run-external-consumer-validation\.mjs/i.test(call));
  assert.match(externalValidationCall ?? '', /--proof-mode npm-readiness/i);
});

test('npm readiness propagates ergonomics validator failures', async () => {
  const commandRunner = async ({ command, args }) => {
    if (command === 'node' && args.some((arg) => /assert-package-entries\.mjs$/i.test(arg))) {
      const error = new Error('Command failed');
      error.stdout = '{"status":"FAIL","failures":["README missing"]}';
      throw error;
    }
    return { stdout: '', stderr: '', exitCode: 0 };
  };

  await assert.rejects(
    runNpmReadiness({ packageTarget: 'contract', commandRunner }),
    /README missing|Command failed/i,
  );
});
