import test from 'node:test';
import assert from 'node:assert/strict';

import { runNpmReadiness } from './run-npm-readiness.mjs';

test('npm readiness rejects unsupported package target values before running commands', async () => {
  await assert.rejects(
    runNpmReadiness({ packageTarget: 'not-real' }),
    /package_target must be one of capacitor, contract/i,
  );
});

test('npm readiness runs ergonomics validation before each package tarball inspection', async () => {
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
  const contractInspectIndex = calls.findIndex((call) => /inspect-tarball\.mjs.*--profile contract/i.test(call));
  const capacitorInspectIndex = calls.findIndex((call) => /inspect-tarball\.mjs.*--profile capacitor/i.test(call));

  assert.equal(contractErgonomicsIndex > -1, true);
  assert.equal(capacitorErgonomicsIndex > -1, true);
  assert.equal(contractInspectIndex > contractErgonomicsIndex, true);
  assert.equal(capacitorInspectIndex > capacitorErgonomicsIndex, true);

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

test('npm readiness contract target runs external runtime validation with contract tarball only', async () => {
  const calls = [];
  const commandRunner = async ({ command, args }) => {
    const call = [command, ...args].join(' ');
    calls.push(call);

    if (command === 'node' && args.some((arg) => /inspect-tarball\.mjs$/i.test(arg))) {
      const profile = args[args.indexOf('--profile') + 1];
      return {
        stdout: JSON.stringify({ status: 'PASS', profile, tarballPath: `/tmp/${profile}.tgz` }),
        stderr: '',
        exitCode: 0,
      };
    }

    if (command === 'node' && args.some((arg) => /assert-package-entries\.mjs$/i.test(arg))) {
      return { stdout: JSON.stringify({ status: 'PASS' }), stderr: '', exitCode: 0 };
    }

    if (command === 'node' && args.some((arg) => /run-external-consumer-validation\.mjs$/i.test(arg))) {
      return { stdout: JSON.stringify({ status: 'PASS', exitCode: 0 }), stderr: '', exitCode: 0 };
    }

    return { stdout: '', stderr: '', exitCode: 0 };
  };

  const result = await runNpmReadiness({ packageTarget: 'contract', commandRunner });

  assert.equal(result.package_target, 'contract');
  assert.equal(result.readiness_profile, 'contract-only');
  assert.equal(result.capacitorResult, null);
  assert.equal(result.externalValidation?.status, 'PASS');

  assert.equal(calls.some((call) => /packages\/contract/i.test(call)), true);
  assert.equal(calls.some((call) => /packages\/capacitor/i.test(call) && /npm install|npm run build/i.test(call)), false);
  assert.equal(calls.some((call) => /inspect-tarball\.mjs.*--profile capacitor/i.test(call)), false);
  assert.equal(calls.some((call) => /assert-package-entries\.mjs.*--profile capacitor/i.test(call)), false);
  const externalValidationCall = calls.find((call) => /run-external-consumer-validation\.mjs/i.test(call));
  assert.match(externalValidationCall ?? '', /--proof-mode npm-readiness/i);
  assert.match(externalValidationCall ?? '', /--tarball-contract \/tmp\/contract\.tgz/i);
  assert.match(externalValidationCall ?? '', /--registry-capacitor @ddgutierrezc\/legato-capacitor@0\.1\.1/i);
  assert.match(externalValidationCall ?? '', /--registry-contract @ddgutierrezc\/legato-contract@0\.1\.1/i);
});

test('npm readiness contract target bubbles external runtime-validation failures', async () => {
  const commandRunner = async ({ command, args }) => {
    if (command === 'node' && args.some((arg) => /inspect-tarball\.mjs$/i.test(arg))) {
      return {
        stdout: JSON.stringify({ status: 'PASS', profile: 'contract', tarballPath: '/tmp/contract.tgz' }),
        stderr: '',
        exitCode: 0,
      };
    }

    if (command === 'node' && args.some((arg) => /assert-package-entries\.mjs$/i.test(arg))) {
      return { stdout: JSON.stringify({ status: 'PASS' }), stderr: '', exitCode: 0 };
    }

    if (command === 'node' && args.some((arg) => /run-external-consumer-validation\.mjs$/i.test(arg))) {
      return { stdout: JSON.stringify({ status: 'FAIL', exitCode: 1, failures: ['Documented import runtime proof failed'] }), stderr: '', exitCode: 0 };
    }

    return { stdout: '', stderr: '', exitCode: 0 };
  };

  await assert.rejects(
    runNpmReadiness({ packageTarget: 'contract', commandRunner }),
    /Documented import runtime proof failed|external consumer validation failed/i,
  );
});
