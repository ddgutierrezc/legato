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

const requiredMavenSecrets = [
  ['ORG_GRADLE_PROJECT_mavenCentralUsername', 'MAVEN_CENTRAL_USERNAME'],
  ['ORG_GRADLE_PROJECT_mavenCentralPassword', 'MAVEN_CENTRAL_PASSWORD'],
];

const signingKeyValueAliases = ['ORG_GRADLE_PROJECT_signingInMemoryKey', 'SIGNING_KEY'];
const signingKeyFileAliases = ['ORG_GRADLE_PROJECT_signingInMemoryKeyFile', 'SIGNING_KEY_FILE'];
const signingKeyPasswordAliases = ['ORG_GRADLE_PROJECT_signingInMemoryKeyPassword', 'SIGNING_PASSWORD'];

const signingGnupgKeyNameAliases = ['ORG_GRADLE_PROJECT_signingGnupgKeyName', 'SIGNING_GNUPG_KEY_NAME', 'SIGNING_GNUPG_KEYNAME'];
const signingGnupgPassphraseAliases = ['ORG_GRADLE_PROJECT_signingGnupgPassphrase', 'SIGNING_GNUPG_PASSPHRASE'];
const signingGnupgExecutableAliases = ['ORG_GRADLE_PROJECT_signingGnupgExecutable', 'SIGNING_GNUPG_EXECUTABLE'];
const signingGnupgHomeDirAliases = ['ORG_GRADLE_PROJECT_signingGnupgHomeDir', 'SIGNING_GNUPG_HOME_DIR'];

const signingAliasGroups = [
  signingKeyValueAliases,
  signingKeyFileAliases,
  signingKeyPasswordAliases,
  signingGnupgKeyNameAliases,
  signingGnupgPassphraseAliases,
  signingGnupgExecutableAliases,
  signingGnupgHomeDirAliases,
];

const placeholderTokens = [
  'changeme',
  'replace-me',
  'replace_me',
  'placeholder',
  'example',
  'sample',
  'dummy',
  'your-',
  '<',
  'todo',
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
  if (!/useGpgCmd\s*\(/i.test(buildGradle) || !/signing\.gnupg\.keyName/i.test(buildGradle)) {
    failures.push('Android publication metadata missing: build.gradle must wire signing.useGpgCmd() for signing.gnupg.keyName-based publish runs.');
  }
  return failures;
};

const makeResult = ({ status, failures = [], details = {} }) => ({
  status,
  exitCode: status === PASS ? 0 : 1,
  failures,
  details,
});

const hasPlaceholderSecretValue = (value) => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  return placeholderTokens.some((token) => normalized.includes(token));
};

const invalidPlaceholderSecrets = (env = process.env) => {
  const failures = [];
  const placeholderAliasGroups = [
    ...requiredMavenSecrets,
    ...signingAliasGroups,
  ];

  for (const aliases of placeholderAliasGroups) {
    for (const alias of aliases) {
      const value = env[alias];
      if (typeof value === 'string' && hasPlaceholderSecretValue(value)) {
        failures.push(`Invalid placeholder for ${aliases.join(' or ')} (found in ${alias}).`);
        break;
      }
    }
  }
  return failures;
};

export const runAndroidReleasePreflight = async ({
  contract,
  contractPath = defaultPaths.contractPath,
  buildGradlePath = defaultPaths.buildGradlePath,
  projectDir = defaultPaths.projectDir,
  gradleExecutable,
  env = process.env,
  fileReader = readFile,
  execCommand = defaultExecCommand,
}) => {
  const failures = [];
  const resolvedContract = contract ? normalizeContract(contract) : await readContractFile(contractPath, fileReader);
  failures.push(...validateContractFields(resolvedContract));
  failures.push(...invalidPlaceholderSecrets(env));

  const signingConfigResolution = await resolvePublishSigningConfig({ env, fileReader, requireSigningBackend: false });
  if (signingConfigResolution.failure) {
    failures.push(`Invalid signing configuration: ${signingConfigResolution.failure}`);
  }

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

const missingMavenSecrets = (env = process.env) => {
  const missing = [];
  for (const aliases of requiredMavenSecrets) {
    const available = aliases.some((key) => typeof env[key] === 'string' && env[key].trim() !== '');
    if (!available) {
      missing.push(aliases.join(' or '));
    }
  }
  return missing;
};

const firstPresentAlias = (aliases, env = process.env) => {
  for (const alias of aliases) {
    const value = env[alias];
    if (typeof value === 'string' && value.trim() !== '') {
      return { alias, value: value.trim() };
    }
  }
  return null;
};

const resolvePublishSigningConfig = async ({ env = process.env, fileReader = readFile, requireSigningBackend = true }) => {
  const directKey = firstPresentAlias(signingKeyValueAliases, env);
  const signingPassword = firstPresentAlias(signingKeyPasswordAliases, env);
  if (directKey) {
    if (!signingPassword) {
      return {
        backend: 'in-memory',
        gradleProperties: {},
        failure: `Missing signing key password (${signingKeyPasswordAliases.join(' or ')}) for in-memory signing key source ${directKey.alias}.`,
      };
    }

    return {
      backend: 'in-memory',
      gradleProperties: {
        signingInMemoryKey: directKey.value,
      },
      failure: null,
    };
  }

  const gnupgKeyName = firstPresentAlias(signingGnupgKeyNameAliases, env);
  if (gnupgKeyName) {
    const gnupgPassphrase = firstPresentAlias(signingGnupgPassphraseAliases, env);
    const gnupgExecutable = firstPresentAlias(signingGnupgExecutableAliases, env);
    const gnupgHomeDir = firstPresentAlias(signingGnupgHomeDirAliases, env);
    return {
      backend: 'gnupg',
      gradleProperties: {
        'signing.gnupg.keyName': gnupgKeyName.value,
        ...(gnupgPassphrase ? { 'signing.gnupg.passphrase': gnupgPassphrase.value } : {}),
        ...(gnupgExecutable ? { 'signing.gnupg.executable': gnupgExecutable.value } : {}),
        ...(gnupgHomeDir ? { 'signing.gnupg.homeDir': gnupgHomeDir.value } : {}),
      },
      failure: null,
    };
  }

  const keyFile = firstPresentAlias(signingKeyFileAliases, env);
  if (!keyFile) {
    if (!requireSigningBackend) {
      return {
        backend: null,
        gradleProperties: {},
        failure: null,
      };
    }

    return {
      backend: null,
      gradleProperties: {},
      failure: `Missing signing configuration. Configure one signing backend: (${signingGnupgKeyNameAliases.join(' or ')}) for local GPG signing, or (${signingKeyValueAliases.join(' or ')}) / (${signingKeyFileAliases.join(' or ')}) with ${signingKeyPasswordAliases.join(' or ')} for in-memory signing.`,
    };
  }

  if (!signingPassword) {
    return {
      backend: 'in-memory',
      gradleProperties: {},
      failure: `Missing signing key password (${signingKeyPasswordAliases.join(' or ')}) for in-memory signing key file source ${keyFile.alias}.`,
    };
  }

  try {
    const keyFromFile = await fileReader(keyFile.value, 'utf8');
    const normalizedKey = keyFromFile.trim();
    if (!normalizedKey) {
      return {
        backend: 'in-memory',
        gradleProperties: {},
        failure: `Signing key file is empty (${keyFile.alias}=${keyFile.value}).`,
      };
    }

    return {
      backend: 'in-memory',
      gradleProperties: {
        signingInMemoryKey: normalizedKey,
      },
      failure: null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      backend: 'in-memory',
      gradleProperties: {},
      failure: `Unable to read signing key file from ${keyFile.alias}=${keyFile.value}: ${message}`,
    };
  }
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
    env,
    fileReader,
    execCommand,
  });

  const resolvedContract = contract ? normalizeContract(contract) : await readContractFile(contractPath, fileReader);
  const expectedCoordinate = expectedCoordinateFromContract(resolvedContract);
  const pomUrl = makePomUrl(resolvedContract);
  const portalNamespaceUrl = makePortalNamespaceUrl(resolvedContract);

  if (preflight.status === FAIL) {
    return makeResult({
      status: FAIL,
      failures: ['Publish blocked: Android preflight failed.', ...preflight.failures],
      details: { mode: 'publish', preflight, expectedCoordinate, pomUrl, portalNamespaceUrl },
    });
  }

  const missingSecrets = missingMavenSecrets(env);
  if (missingSecrets.length > 0) {
    return makeResult({
      status: FAIL,
      failures: [
        'Publish blocked: missing required Maven Central/signing credentials.',
        ...missingSecrets.map((entry) => `Missing: ${entry}`),
      ],
      details: { mode: 'publish', preflight, expectedCoordinate, pomUrl, portalNamespaceUrl },
    });
  }

  const signingConfigResolution = await resolvePublishSigningConfig({ env, fileReader });
  if (signingConfigResolution.failure) {
    return makeResult({
      status: FAIL,
      failures: [`Publish blocked: ${signingConfigResolution.failure}`],
      details: { mode: 'publish', preflight, expectedCoordinate, pomUrl, portalNamespaceUrl },
    });
  }

  const publishEnv = { ...env };
  if (signingConfigResolution.backend === 'in-memory' && signingConfigResolution.gradleProperties.signingInMemoryKey && !publishEnv.ORG_GRADLE_PROJECT_signingInMemoryKey) {
    publishEnv.ORG_GRADLE_PROJECT_signingInMemoryKey = signingConfigResolution.gradleProperties.signingInMemoryKey;
  }

  const signingGradleArgs = [];
  if (signingConfigResolution.backend === 'gnupg') {
    for (const [propertyName, propertyValue] of Object.entries(signingConfigResolution.gradleProperties)) {
      signingGradleArgs.push(`-P${propertyName}=${propertyValue}`);
    }
  }

  const resolvedGradleExecutable = await resolveGradleExecutable(projectDir, gradleExecutable);
  const publishResult = await execCommand(
    resolvedGradleExecutable,
    [...signingGradleArgs, 'publishAndReleaseToMavenCentral'],
    { cwd: projectDir, env: publishEnv },
  );

  if (publishResult.exitCode !== 0) {
    return makeResult({
      status: FAIL,
      failures: [`Publish failed: ${(publishResult.stderr || publishResult.stdout || '').trim()}`],
      details: { mode: 'publish', preflight, expectedCoordinate, pomUrl, portalNamespaceUrl },
    });
  }

  return makeResult({
    status: PASS,
    failures: [],
    details: { mode: 'publish', preflight, expectedCoordinate, pomUrl, portalNamespaceUrl },
  });
};

const makePomUrl = (contract) => {
  const base = contract.repositoryUrl.replace(/\/+$/, '');
  const groupPath = contract.group.split('.').join('/');
  return `${base}/${groupPath}/${contract.artifact}/${contract.version}/${contract.artifact}-${contract.version}.pom`;
};

const makePortalNamespaceUrl = (contract) => `https://central.sonatype.com/namespace/${contract.group}`;

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
  if (result.details?.portalNamespaceUrl) {
    lines.push(`Portal namespace: ${result.details.portalNamespaceUrl}`);
  }

  if (result.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  if (result.details?.mode === 'publish' && result.status === PASS) {
    lines.push('Next step: run release:android:verify until the POM URL returns HTTP 200 within the agreed retry window.');
  }

  if (result.details?.mode === 'publish' && result.status === FAIL) {
    lines.push('Next step: confirm namespace/version in portal, then rerun preflight and publish only if version is not released.');
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
