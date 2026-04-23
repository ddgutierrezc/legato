import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runAndroidReleasePreflight,
  runAndroidReleasePublish,
  runAndroidReleaseVerify,
} from './release-android.mjs';

const makeFixture = async ({ coordinate = 'dev.dgutierrez:legato-android-core:0.1.0' } = {}) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-android-release-fixture-'));
  const projectDir = join(tempDir, 'android-core');
  const contractPath = join(tempDir, 'native-artifacts.json');
  const buildGradlePath = join(projectDir, 'build.gradle');
  const gradlePath = join(projectDir, 'fake-gradle.sh');
  const gradleLogPath = join(projectDir, 'gradle-invocations.log');

  await mkdir(projectDir, { recursive: true });
  await writeFile(contractPath, JSON.stringify({
    android: {
      repositoryUrl: 'https://repo1.maven.org/maven2',
      group: 'dev.dgutierrez',
      artifact: 'legato-android-core',
      version: '0.1.0',
    },
  }, null, 2), 'utf8');

  await writeFile(
    buildGradlePath,
    `plugins { id 'com.vanniktech.maven.publish' }
// contract path marker for metadata validation
def nativeArtifacts = file('../../packages/capacitor/native-artifacts.json')
`,
    'utf8',
  );

  await writeFile(
    gradlePath,
    `#!/bin/sh
echo "$@" >> "${gradleLogPath}"
if [ "$1" = "--version" ]; then
  echo "Gradle 8.14.1"
  exit 0
fi
if [ "$1" = "-q" ] && [ "$2" = "printPublicationCoordinate" ]; then
  echo "publication-coordinate=${coordinate}"
  exit 0
fi
if [ "$1" = "publishAndReleaseToMavenCentral" ]; then
  echo "published"
  exit 0
fi
echo "unexpected args: $@" >&2
exit 1
`,
    'utf8',
  );
  await chmod(gradlePath, 0o755);

  return {
    tempDir,
    projectDir,
    contractPath,
    buildGradlePath,
    gradlePath,
    gradleLogPath,
  };
};

test('integration: preflight passes with fixture contract/build.gradle and Gradle probe', async () => {
  const fixture = await makeFixture();
  try {
    const result = await runAndroidReleasePreflight({
      contractPath: fixture.contractPath,
      buildGradlePath: fixture.buildGradlePath,
      projectDir: fixture.projectDir,
      gradleExecutable: fixture.gradlePath,
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.exitCode, 0);
    assert.equal(result.failures.length, 0);
  } finally {
    await rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('integration: publish remains blocked when preflight detects contract drift', async () => {
  const fixture = await makeFixture({ coordinate: 'io.legato:legato-android-core:0.1.0' });
  try {
    const result = await runAndroidReleasePublish({
      contractPath: fixture.contractPath,
      buildGradlePath: fixture.buildGradlePath,
      projectDir: fixture.projectDir,
      gradleExecutable: fixture.gradlePath,
      env: {
        MAVEN_CENTRAL_USERNAME: 'u',
        MAVEN_CENTRAL_PASSWORD: 'p',
        SIGNING_KEY: 'k',
        SIGNING_PASSWORD: 'sp',
      },
    });

    const invocationLog = await readFile(fixture.gradleLogPath, 'utf8');
    assert.equal(result.status, 'FAIL');
    assert.match(result.failures.join('\n'), /publish blocked: android preflight failed/i);
    assert.equal(invocationLog.includes('publishAndReleaseToMavenCentral'), false);
  } finally {
    await rm(fixture.tempDir, { recursive: true, force: true });
  }
});

test('integration: verify fails when remote pom identity mismatches contract', async () => {
  const server = createServer((_, response) => {
    response.writeHead(200, { 'content-type': 'application/xml' });
    response.end('<project><groupId>dev.dgutierrez</groupId><artifactId>wrong-artifact</artifactId><version>0.1.0</version></project>');
  });

  const port = await new Promise((resolvePort) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolvePort(typeof address === 'object' && address ? address.port : 0);
    });
  });

  try {
    const result = await runAndroidReleaseVerify({
      contract: {
        android: {
          repositoryUrl: `http://127.0.0.1:${port}`,
          group: 'dev.dgutierrez',
          artifact: 'legato-android-core',
          version: '0.1.0',
        },
      },
    });

    assert.equal(result.status, 'FAIL');
    assert.match(result.failures.join('\n'), /resolved pom mismatch/i);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
});
