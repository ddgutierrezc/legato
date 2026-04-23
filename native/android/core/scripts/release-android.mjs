import { readFile, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASS = 'PASS';
const FAIL = 'FAIL';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultPaths = {
  contractPath: resolve(scriptDir, '../../../../packages/capacitor/native-artifacts.json'),
  buildGradlePath: resolve(scriptDir, '../build.gradle'),
  projectDir: resolve(scriptDir, '..'),
};

const requiredPublishSecrets = [
  ['ORG_GRADLE_PROJECT_mavenCentralUsername', 'MAVEN_CENTRAL_USERNAME'],
  ['ORG_GRADLE_PROJECT_mavenCentralPassword', 'MAVEN_CENTRAL_PASSWORD'],
  ['ORG_GRADLE_PROJECT_signingInMemoryKey', 'SIGNING_KEY'],
  ['ORG_GRADLE_PROJECT_signingInMemoryKeyPassword', 'SIGNING_PASSWORD'],
];

const normalizeContract = (contract) => {
  const android = contract?.android ?? {};
  return {
    repositoryUrl: typeof android.repositoryUrl === 'string' ? android.repositoryUrl.trim() : '',
    group: typeof android.group === 'string' ? android.group.trim() : '',
    artifact: typeof android.artifact === 'string' ? android.artifact.trim() : '',
    version: typeof android.version === 'string' ? android.version.trim() : '',
  };
};

const expectedCoordinateFromContract = (contract) => `${contract.group}:${contract.artifact}:${contract.version}`;

const parsePublicationCoordinate = (stdout) => {
  const match = stdout.match(/publication-coordinate=([^\s]+)/i);
  return match ? match[1].trim() : null;
};

const parsePomCoordinate = (pomXml) => {
  const groupId = pomXml.match(/<groupId>([^<]+)<\/groupId>/i)?.[1]?.trim() ?? '';
  const artifactId = pomXml.match(/<artifactId>([^<]+)<\/artifactId>/i)?.[1]?.trim() ?? '';
  const version = pomXml.match(/<version>([^<]+)<\/version>/i)?.[1]?.trim() ?? '';
  return { groupId, artifactId, version };
};

const defaultExecCommand = async (command, args, options = {}) => new Promise((resolveResult) => {
  const child = spawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('error', (error) => {
    resolveResult({ exitCode: 1, stdout, stderr: `${stderr}${error.message}` });
  });

  child.on('close', (code) => {
    resolveResult({ exitCode: code ?? 1, stdout, stderr });
  });
});

const defaultFetchText = async (url) => {
  const response = await fetch(url);
  const text = await response.text();
  return { statusCode: response.status, text };
};

const parseArgs = (argv) => {
  const options = {
    command: argv[0],
    contractPath: defaultPaths.contractPath,
    buildGradlePath: defaultPaths.buildGradlePath,
    projectDir: defaultPaths.projectDir,
    gradleExecutable: undefined,
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--contract' && argv[i + 1]) {
      options.contractPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--build-gradle' && argv[i + 1]) {
      options.buildGradlePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--project-dir' && argv[i + 1]) {
      options.projectDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--gradle' && argv[i + 1]) {
      options.gradleExecutable = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const readContractFile = async (contractPath, fileReader = readFile) => {
  const contractRaw = await fileReader(contractPath, 'utf8');
  const parsed = JSON.parse(contractRaw);
  return normalizeContract(parsed);
};

const resolveGradleExecutable = async (projectDir, requestedExecutable) => {
  if (requestedExecutable) {
    return requestedExecutable;
  }

  const localWrapper = resolve(projectDir, 'gradlew');
  try {
    await access(localWrapper, constants.X_OK);
    return localWrapper;
  } catch {
    return 'gradle';
  }
};

const validateContractFields = (contract) => {
  const failures = [];
  if (!contract.repositoryUrl) failures.push('Missing android.repositoryUrl in native-artifacts contract.');
  if (!contract.group) failures.push('Missing android.group in native-artifacts contract.');
  if (!contract.artifact) failures.push('Missing android.artifact in native-artifacts contract.');
  if (!contract.version) failures.push('Missing android.version in native-artifacts contract.');
  return failures;
};

const ensureBuildScriptMetadata = (buildGradle) => {
  const failures = [];
  if (!/com\.vanniktech\.maven\.publish/i.test(buildGradle)) {
    failures.push('Android publication metadata missing: build.gradle must apply com.vanniktech.maven.publish.');
  }
  if (!/native-artifacts\.json/i.test(buildGradle)) {
    failures.push('Android publication metadata missing: build.gradle must load native-artifacts.json as source of truth.');
  }
  return failures;
};

const makeResult = ({ status, failures = [], details = {} }) => ({
  status,
  exitCode: status === PASS ? 0 : 1,
  failures,
  details,
});

export const runAndroidReleasePreflight = async ({
  contract,
  contractPath = defaultPaths.contractPath,
  buildGradlePath = defaultPaths.buildGradlePath,
  projectDir = defaultPaths.projectDir,
  gradleExecutable,
  fileReader = readFile,
  execCommand = defaultExecCommand,
}) => {
  const failures = [];
  const resolvedContract = contract ? normalizeContract(contract) : await readContractFile(contractPath, fileReader);
  failures.push(...validateContractFields(resolvedContract));

  let buildGradle = '';
  try {
    buildGradle = await fileReader(buildGradlePath, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`Failed to read Android build.gradle for preflight: ${message}`);
  }

  if (buildGradle) {
    failures.push(...ensureBuildScriptMetadata(buildGradle));
  }

  const expectedCoordinate = expectedCoordinateFromContract(resolvedContract);
  const resolvedGradleExecutable = await resolveGradleExecutable(projectDir, gradleExecutable);

  const gradleVersionResult = await execCommand(resolvedGradleExecutable, ['--version'], { cwd: projectDir });
  if (gradleVersionResult.exitCode !== 0) {
    failures.push(`Gradle toolchain check failed for ${resolvedGradleExecutable}: ${(gradleVersionResult.stderr || gradleVersionResult.stdout || '').trim()}`);
  }

  const publicationProbe = await execCommand(resolvedGradleExecutable, ['-q', 'printPublicationCoordinate'], { cwd: projectDir });
  const actualCoordinate = parsePublicationCoordinate(publicationProbe.stdout);
  if (publicationProbe.exitCode !== 0) {
    failures.push(`Unable to resolve publication coordinate from Gradle: ${(publicationProbe.stderr || publicationProbe.stdout || '').trim()}`);
  } else if (!actualCoordinate) {
    failures.push('Unable to parse Gradle publication-coordinate output from printPublicationCoordinate task.');
  } else if (actualCoordinate !== expectedCoordinate) {
    failures.push(`Android publication contract drift detected: expected ${expectedCoordinate} but Gradle resolved ${actualCoordinate}.`);
  }

  return makeResult({
    status: failures.length === 0 ? PASS : FAIL,
    failures,
    details: {
      expectedCoordinate,
      actualCoordinate,
      gradleExecutable: resolvedGradleExecutable,
      mode: 'preflight',
    },
  });
};

const missingPublishSecrets = (env = process.env) => {
  const missing = [];
  for (const aliases of requiredPublishSecrets) {
    const available = aliases.some((key) => typeof env[key] === 'string' && env[key].trim() !== '');
    if (!available) {
      missing.push(aliases.join(' or '));
    }
  }
  return missing;
};

export const runAndroidReleasePublish = async ({
  contract,
  contractPath = defaultPaths.contractPath,
  buildGradlePath = defaultPaths.buildGradlePath,
  projectDir = defaultPaths.projectDir,
  gradleExecutable,
  env = process.env,
  fileReader = readFile,
  execCommand = defaultExecCommand,
}) => {
  const preflight = await runAndroidReleasePreflight({
    contract,
    contractPath,
    buildGradlePath,
    projectDir,
    gradleExecutable,
    fileReader,
    execCommand,
  });

  if (preflight.status === FAIL) {
    return makeResult({
      status: FAIL,
      failures: ['Publish blocked: Android preflight failed.', ...preflight.failures],
      details: { mode: 'publish', preflight },
    });
  }

  const missingSecrets = missingPublishSecrets(env);
  if (missingSecrets.length > 0) {
    return makeResult({
      status: FAIL,
      failures: [
        'Publish blocked: missing required Maven Central/signing credentials.',
        ...missingSecrets.map((entry) => `Missing: ${entry}`),
      ],
      details: { mode: 'publish', preflight },
    });
  }

  const resolvedGradleExecutable = await resolveGradleExecutable(projectDir, gradleExecutable);
  const publishResult = await execCommand(
    resolvedGradleExecutable,
    ['publishAndReleaseToMavenCentral'],
    { cwd: projectDir, env },
  );

  if (publishResult.exitCode !== 0) {
    return makeResult({
      status: FAIL,
      failures: [`Publish failed: ${(publishResult.stderr || publishResult.stdout || '').trim()}`],
      details: { mode: 'publish', preflight },
    });
  }

  return makeResult({
    status: PASS,
    failures: [],
    details: { mode: 'publish', preflight },
  });
};

const makePomUrl = (contract) => {
  const base = contract.repositoryUrl.replace(/\/+$/, '');
  const groupPath = contract.group.split('.').join('/');
  return `${base}/${groupPath}/${contract.artifact}/${contract.version}/${contract.artifact}-${contract.version}.pom`;
};

export const runAndroidReleaseVerify = async ({
  contract,
  contractPath = defaultPaths.contractPath,
  fileReader = readFile,
  fetchText = defaultFetchText,
}) => {
  const failures = [];
  const resolvedContract = contract ? normalizeContract(contract) : await readContractFile(contractPath, fileReader);
  failures.push(...validateContractFields(resolvedContract));
  if (failures.length > 0) {
    return makeResult({ status: FAIL, failures, details: { mode: 'verify' } });
  }

  const expectedCoordinate = expectedCoordinateFromContract(resolvedContract);
  const pomUrl = makePomUrl(resolvedContract);

  const response = await fetchText(pomUrl);
  if (response.statusCode !== 200) {
    return makeResult({
      status: FAIL,
      failures: [`Android publish verification failed: Maven Central returned HTTP ${response.statusCode} for ${pomUrl}.`],
      details: { mode: 'verify', expectedCoordinate, pomUrl },
    });
  }

  const parsedPom = parsePomCoordinate(response.text);
  const resolvedCoordinate = `${parsedPom.groupId}:${parsedPom.artifactId}:${parsedPom.version}`;
  if (resolvedCoordinate !== expectedCoordinate) {
    return makeResult({
      status: FAIL,
      failures: [`Android publish verification failed: resolved POM mismatch (expected ${expectedCoordinate}, got ${resolvedCoordinate}).`],
      details: { mode: 'verify', expectedCoordinate, resolvedCoordinate, pomUrl },
    });
  }

  return makeResult({
    status: PASS,
    failures: [],
    details: { mode: 'verify', expectedCoordinate, resolvedCoordinate, pomUrl },
  });
};

export const formatReleaseSummary = (result) => {
  const lines = [
    `Mode: ${result.details?.mode ?? 'unknown'}`,
    `Overall: ${result.status}`,
  ];

  if (result.details?.expectedCoordinate) {
    lines.push(`Expected coordinate: ${result.details.expectedCoordinate}`);
  }
  if (result.details?.actualCoordinate) {
    lines.push(`Resolved coordinate: ${result.details.actualCoordinate}`);
  }
  if (result.details?.resolvedCoordinate) {
    lines.push(`Resolved coordinate: ${result.details.resolvedCoordinate}`);
  }
  if (result.details?.pomUrl) {
    lines.push(`POM URL: ${result.details.pomUrl}`);
  }

  if (result.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
};

const executeCli = async (argv) => {
  const options = parseArgs(argv);
  const validCommands = new Set(['preflight', 'publish', 'verify']);
  if (!validCommands.has(options.command)) {
    process.stdout.write('Usage: node scripts/release-android.mjs <preflight|publish|verify> [--contract <path>] [--build-gradle <path>] [--project-dir <path>] [--gradle <executable>]\n');
    process.exit(1);
  }

  const shared = {
    contractPath: options.contractPath,
    buildGradlePath: options.buildGradlePath,
    projectDir: options.projectDir,
    gradleExecutable: options.gradleExecutable,
  };

  try {
    let result;
    if (options.command === 'preflight') {
      result = await runAndroidReleasePreflight(shared);
    } else if (options.command === 'publish') {
      result = await runAndroidReleasePublish(shared);
    } else {
      result = await runAndroidReleaseVerify(shared);
    }

    process.stdout.write(`${formatReleaseSummary(result)}\n`);
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Mode: ${options.command}\nOverall: FAIL\nFailures:\n- Unexpected failure: ${message}\n`);
    process.exit(1);
  }
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isEntrypoint) {
  await executeCli(process.argv.slice(2));
}
