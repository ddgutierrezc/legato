import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runAndroidReleasePreflight,
  runAndroidReleasePublish,
  runAndroidReleaseVerify,
  formatReleaseSummary,
} from './release-android.mjs';

const contract = {
  android: {
    repositoryUrl: 'https://repo1.maven.org/maven2',
    group: 'dev.dgutierrez',
    artifact: 'legato-android-core',
    version: '0.1.1',
  },
};

test('preflight passes when Gradle coordinate matches contract', async () => {
  const commandLog = [];
  const result = await runAndroidReleasePreflight({
    contract,
    env: {},
    execCommand: async (command, args) => {
      commandLog.push([command, ...args].join(' '));
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
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
    env: {},
    execCommand: async (_command, args) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=io.legato:legato-android-core:0.1.1',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /contract drift/i);
});

test('preflight fails when required publish secrets are placeholder values', async () => {
  const result = await runAndroidReleasePreflight({
    contract,
    env: {
      MAVEN_CENTRAL_USERNAME: 'your-maven-central-username',
      MAVEN_CENTRAL_PASSWORD: 'real-password',
      SIGNING_KEY: 'real-signing-key',
      SIGNING_PASSWORD: 'real-signing-password',
    },
    execCommand: async (_command, args) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /placeholder/i);
  assert.match(result.failures.join('\n'), /MAVEN_CENTRAL_USERNAME/i);
});

test('preflight does not require publish secrets when values are absent', async () => {
  const result = await runAndroidReleasePreflight({
    contract,
    env: {},
    execCommand: async (_command, args) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});

test('preflight passes when local gnupg signing aliases are configured', async () => {
  const result = await runAndroidReleasePreflight({
    contract,
    env: {
      SIGNING_GNUPG_KEY_NAME: 'B324E2CAC4AF5580',
      MAVEN_CENTRAL_USERNAME: 'u',
      MAVEN_CENTRAL_PASSWORD: 'p',
    },
    execCommand: async (_command, args) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});

test('preflight fails when build.gradle does not wire useGpgCmd for signing.gnupg.keyName', async () => {
  const result = await runAndroidReleasePreflight({
    contract,
    env: {},
    fileReader: async () => "plugins { id 'com.vanniktech.maven.publish' } // native-artifacts.json",
    execCommand: async (_command, args) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /must wire signing\.usegpgcmd\(\) for signing\.gnupg\.keyname-based publish runs/i);
});

test('preflight fails when signing key file alias points to unreadable file', async () => {
  const result = await runAndroidReleasePreflight({
    contract,
    env: {
      SIGNING_KEY_FILE: '/tmp/missing-signing-key.asc',
      SIGNING_PASSWORD: 'sp',
    },
    fileReader: async (path) => {
      if (path === '/tmp/missing-signing-key.asc') {
        throw new Error('ENOENT: no such file or directory');
      }
      return "plugins { id 'com.vanniktech.maven.publish' } // native-artifacts.json";
    },
    execCommand: async (_command, args) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      return {
        exitCode: 0,
        stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
        stderr: '',
      };
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /invalid signing configuration/i);
  assert.match(result.failures.join('\n'), /unable to read signing key file/i);
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
        stdout: 'publication-coordinate=io.legato:legato-android-core:0.1.1',
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
      text: '<project><groupId>dev.dgutierrez</groupId><artifactId>wrong-artifact</artifactId><version>0.1.1</version></project>',
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
      text: '<project><groupId>dev.dgutierrez</groupId><artifactId>legato-android-core</artifactId><version>0.1.1</version></project>',
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
          stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: 'published', stderr: '' };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(commandLog.some((entry) => entry.includes('publishAndReleaseToMavenCentral')), true);
});

test('publish gate fails when Maven credentials exist but signing backend is not configured', async () => {
  const result = await runAndroidReleasePublish({
    contract,
    env: {
      MAVEN_CENTRAL_USERNAME: 'u',
      MAVEN_CENTRAL_PASSWORD: 'p',
    },
    execCommand: async (_command, args) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      if (args.includes('printPublicationCoordinate')) {
        return {
          exitCode: 0,
          stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
          stderr: '',
        };
      }
      return { exitCode: 0, stdout: 'published', stderr: '' };
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /missing signing configuration/i);
});

test('publish gate accepts local gnupg aliases and forwards signing.gnupg.* properties', async () => {
  let publishArgs = [];
  let publishEnv;
  const result = await runAndroidReleasePublish({
    contract,
    env: {
      MAVEN_CENTRAL_USERNAME: 'u',
      MAVEN_CENTRAL_PASSWORD: 'p',
      SIGNING_GNUPG_KEY_NAME: 'B324E2CAC4AF5580',
      SIGNING_GNUPG_PASSPHRASE: 'secret-passphrase',
      SIGNING_GNUPG_EXECUTABLE: '/opt/homebrew/bin/gpg',
      SIGNING_GNUPG_HOME_DIR: '/Users/operator/.gnupg',
    },
    execCommand: async (_command, args, options = {}) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      if (args.includes('printPublicationCoordinate')) {
        return {
          exitCode: 0,
          stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
          stderr: '',
        };
      }
      publishArgs = args;
      publishEnv = options.env;
      return { exitCode: 0, stdout: 'published', stderr: '' };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(publishArgs.includes('publishAndReleaseToMavenCentral'), true);
  assert.equal(publishArgs.includes('-Psigning.gnupg.keyName=B324E2CAC4AF5580'), true);
  assert.equal(publishArgs.includes('-Psigning.gnupg.passphrase=secret-passphrase'), true);
  assert.equal(publishArgs.includes('-Psigning.gnupg.executable=/opt/homebrew/bin/gpg'), true);
  assert.equal(publishArgs.includes('-Psigning.gnupg.homeDir=/Users/operator/.gnupg'), true);
  assert.equal(typeof publishEnv?.ORG_GRADLE_PROJECT_signingInMemoryKey, 'undefined');
});

test('publish gate accepts SIGNING_KEY_FILE and injects in-memory key for Gradle', async () => {
  let publishEnv;
  const result = await runAndroidReleasePublish({
    contract,
    env: {
      MAVEN_CENTRAL_USERNAME: 'u',
      MAVEN_CENTRAL_PASSWORD: 'p',
      SIGNING_PASSWORD: 'sp',
      SIGNING_KEY_FILE: '/tmp/release-signing.asc',
    },
    fileReader: async (path) => {
      if (path === '/tmp/release-signing.asc') {
        return '-----BEGIN PGP PRIVATE KEY BLOCK-----\nabc\n-----END PGP PRIVATE KEY BLOCK-----\n';
      }
      return "plugins { id 'com.vanniktech.maven.publish' } // native-artifacts.json\nsigning { if (providers.gradleProperty('signing.gnupg.keyName').isPresent()) { useGpgCmd() } }";
    },
    execCommand: async (_command, args, options = {}) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      if (args.includes('printPublicationCoordinate')) {
        return {
          exitCode: 0,
          stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
          stderr: '',
        };
      }
      publishEnv = options.env;
      return { exitCode: 0, stdout: 'published', stderr: '' };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(typeof publishEnv?.ORG_GRADLE_PROJECT_signingInMemoryKey, 'string');
  assert.match(publishEnv.ORG_GRADLE_PROJECT_signingInMemoryKey, /BEGIN PGP PRIVATE KEY BLOCK/);
});

test('publish gate prefers in-memory signing over gnupg when both are configured', async () => {
  let publishArgs = [];
  let publishEnv;
  const result = await runAndroidReleasePublish({
    contract,
    env: {
      MAVEN_CENTRAL_USERNAME: 'u',
      MAVEN_CENTRAL_PASSWORD: 'p',
      SIGNING_GNUPG_KEY_NAME: 'B324E2CAC4AF5580',
      SIGNING_PASSWORD: 'sp',
      SIGNING_KEY: '-----BEGIN PGP PRIVATE KEY BLOCK-----\nabc\n-----END PGP PRIVATE KEY BLOCK-----',
    },
    execCommand: async (_command, args, options = {}) => {
      if (args.includes('--version')) {
        return { exitCode: 0, stdout: 'Gradle 8.14.1', stderr: '' };
      }
      if (args.includes('printPublicationCoordinate')) {
        return {
          exitCode: 0,
          stdout: 'publication-coordinate=dev.dgutierrez:legato-android-core:0.1.1',
          stderr: '',
        };
      }
      publishArgs = args;
      publishEnv = options.env;
      return { exitCode: 0, stdout: 'published', stderr: '' };
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(publishArgs.includes('publishAndReleaseToMavenCentral'), true);
  assert.equal(publishArgs.some((arg) => arg.startsWith('-Psigning.gnupg.keyName=')), false);
  assert.match(publishEnv.ORG_GRADLE_PROJECT_signingInMemoryKey, /BEGIN PGP PRIVATE KEY BLOCK/);
});

test('publish summary includes coordinate and operator hints when publish fails', () => {
  const summary = formatReleaseSummary({
    status: 'FAIL',
    failures: ['Publish failed: authentication rejected'],
    details: {
      mode: 'publish',
      expectedCoordinate: 'dev.dgutierrez:legato-android-core:0.1.1',
      pomUrl: 'https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.1/legato-android-core-0.1.1.pom',
      portalNamespaceUrl: 'https://central.sonatype.com/namespace/dev.dgutierrez',
    },
  });

  assert.match(summary, /Expected coordinate: dev\.dgutierrez:legato-android-core:0\.1\.1/i);
  assert.match(summary, /POM URL: https:\/\/repo1\.maven\.org\/maven2\/dev\/dgutierrez\/legato-android-core\/0\.1\.1\/legato-android-core-0\.1\.1\.pom/i);
  assert.match(summary, /Portal namespace: https:\/\/central\.sonatype\.com\/namespace\/dev\.dgutierrez/i);
  assert.match(summary, /Next step: confirm namespace\/version in portal, then rerun preflight and publish only if version is not released/i);
});

test('publish summary includes verify handoff hints when publish passes', () => {
  const summary = formatReleaseSummary({
    status: 'PASS',
    failures: [],
    details: {
      mode: 'publish',
      expectedCoordinate: 'dev.dgutierrez:legato-android-core:0.1.1',
      pomUrl: 'https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.1/legato-android-core-0.1.1.pom',
      portalNamespaceUrl: 'https://central.sonatype.com/namespace/dev.dgutierrez',
    },
  });

  assert.match(summary, /Expected coordinate: dev\.dgutierrez:legato-android-core:0\.1\.1/i);
  assert.match(summary, /Portal namespace: https:\/\/central\.sonatype\.com\/namespace\/dev\.dgutierrez/i);
  assert.match(summary, /Next step: run release:android:verify until the POM URL returns HTTP 200 within the agreed retry window/i);
});
