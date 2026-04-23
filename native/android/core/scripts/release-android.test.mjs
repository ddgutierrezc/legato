import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runAndroidReleasePreflight,
  runAndroidReleasePublish,
  runAndroidReleaseVerify,
} from './release-android.mjs';

const contract = {
  android: {
    repositoryUrl: 'https://repo1.maven.org/maven2',
    group: 'dev.dgutierrez',
    artifact: 'legato-android-core',
    version: '0.1.0',
  },
};

test('preflight passes when Gradle coordinate matches contract', async () => {
  const commandLog = [];
  const result = await runAndroidReleasePreflight({
    contract,
    execCommand: async (command, args) => {
      commandLog.push([command, ...args].join(' '));
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.0',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
  assert.equal(commandLog.some((entry) => entry.includes('publishAndReleaseToMavenCentral')), false);
});

test('preflight fails when Gradle coordinate drifts from contract', async () => {
  const result = await runAndroidReleasePreflight({
    contract,
    execCommand: async (_command, args) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=io.legato:legato-android-core:0.1.0',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /contract drift/i);
});

test('publish gate reruns preflight and blocks publish when preflight fails', async () => {
  const commandLog = [];
  const result = await runAndroidReleasePublish({
    contract,
    env: {},
    execCommand: async (command, args) => {
      commandLog.push([command, ...args].join(' '));
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=io.legato:legato-android-core:0.1.0',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /contract drift/i);
  assert.equal(commandLog.some((entry) => entry.includes('publishAndReleaseToMavenCentral')), false);
});

test('verify gate fails when resolved pom identity mismatches contract', async () => {
  const result = await runAndroidReleaseVerify({
    contract,
    fetchText: async () => ({
      statusCode: 200,
      text: '<project><groupId>dev.dgutierrez</groupId><artifactId>wrong-artifact</artifactId><version>0.1.0</version></project>',
    }),
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /resolved pom mismatch/i);
});

test('verify gate passes when resolved pom identity matches contract', async () => {
  const result = await runAndroidReleaseVerify({
    contract,
    fetchText: async () => ({
      statusCode: 200,
      text: '<project><groupId>dev.dgutierrez</groupId><artifactId>legato-android-core</artifactId><version>0.1.0</version></project>',
    }),
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
});

test('publish gate runs Gradle publish task when preflight and secrets are valid', async () => {
  const commandLog = [];
  const result = await runAndroidReleasePublish({
    contract,
    env: {
      MAVEN_CENTRAL_USERNAME: 'u',
      MAVEN_CENTRAL_PASSWORD: 'p',
      SIGNING_KEY: 'k',
      SIGNING_PASSWORD: 'sp',
    },
    execCommand: async (command, args) => {
      commandLog.push([command, ...args].join(' '));
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      if (args.includes('printPublicationCoordinate')) {
        return {
          exitCode: 0,
          stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.0',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: 'published', stderr: '' };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(commandLog.some((entry) => entry.includes('publishAndReleaseToMavenCentral')), true);
});
