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

test('npm readiness contract target validates contract tarball without external cross-package fixture', async () => {
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

    if (command === 'node' && args.includes('--input-type=module') && args.includes('-e')) {
      if (args.some((arg) => /unexpected deep import success/i.test(arg))) {
        const error = new Error('deep import blocked');
        error.stdout = '';
        error.stderr = 'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath is not defined by "exports"';
        throw error;
      }
      return { stdout: 'documented import ok\n', stderr: '', exitCode: 0 };
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
  assert.equal(calls.some((call) => /run-external-consumer-validation\.mjs/i.test(call)), false);
  assert.equal(calls.some((call) => /npm install --no-audit --no-fund \/tmp\/contract\.tgz/i.test(call)), true);
  assert.equal(calls.some((call) => /import\('@ddgutierrezc\/legato-contract'\)/i.test(call)), true);
  assert.equal(calls.some((call) => /import\('@ddgutierrezc\/legato-contract\/dist\/state\.js'\)/i.test(call)), true);
});

test('npm readiness contract target bubbles contract-only runtime validation failures', async () => {
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

    if (command === 'node' && args.includes('--input-type=module') && args.includes('-e')
      && args.some((arg) => /import\('@ddgutierrezc\/legato-contract'\)/i.test(arg))) {
      const error = new Error('root import failed');
      error.stdout = '';
      error.stderr = 'Error: Cannot find package';
      throw error;
    }

    if (command === 'node' && args.includes('--input-type=module') && args.includes('-e')
      && args.some((arg) => /import\('@ddgutierrezc\/legato-contract\/dist\/state\.js'\)/i.test(arg))) {
      const error = new Error('deep import blocked');
      error.stdout = '';
      error.stderr = 'Error [ERR_PACKAGE_PATH_NOT_EXPORTED]: Package subpath is not defined by "exports"';
      throw error;
    }

    return { stdout: '', stderr: '', exitCode: 0 };
  };

  await assert.rejects(
    runNpmReadiness({ packageTarget: 'contract', commandRunner }),
    /Documented import runtime proof failed|contract-only validation failed/i,
  );
});
