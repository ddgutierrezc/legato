import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PASS = 'PASS';
const FAIL = 'FAIL';
const WARN = 'WARN';
const PROOF_MODE_CONSUMER_ADOPTION = 'consumer-adoption';
const PROOF_MODE_NPM_READINESS = 'npm-readiness';
const VALIDATION_PROFILE_MANUAL_CONSUMER_PROOF = 'manual-consumer-proof';
const VALIDATION_PROFILE_CI_NPM_READINESS = 'ci-npm-readiness';
const VALID_PROOF_MODES = new Set([
  PROOF_MODE_CONSUMER_ADOPTION,
  PROOF_MODE_NPM_READINESS,
]);
const VALID_VALIDATION_PROFILES = new Set([
  VALIDATION_PROFILE_MANUAL_CONSUMER_PROOF,
  VALIDATION_PROFILE_CI_NPM_READINESS,
]);

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, '../../..');
const defaultTemplateRoot = resolve(scriptDir, 'external-consumer-template');
const defaultArtifactsDir = resolve(scriptDir, '../artifacts/external-consumer-validation-v1');

const normalizePath = (value) => resolve(value).replaceAll('\\', '/');

const resolveHomePath = () => {
  if (typeof process.env.HOME === 'string' && process.env.HOME.trim().length > 0) {
    return resolve(process.env.HOME);
  }
  return null;
};

const isInside = (target, root) => {
  const normalizedTarget = normalizePath(target);
  const normalizedRoot = normalizePath(root).replace(/\/+$/, '');
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
};

const VALID_HOST_STRATEGIES = new Set(['preserve', 'regenerate']);

const resolveValidationProfile = ({ validationProfile, proofMode }) => {
  const normalizedValidationProfile = typeof validationProfile === 'string'
    ? validationProfile.trim()
    : '';
  if (VALID_VALIDATION_PROFILES.has(normalizedValidationProfile)) {
    return normalizedValidationProfile;
  }

  if (String(proofMode ?? '').trim() === PROOF_MODE_NPM_READINESS) {
    return VALIDATION_PROFILE_CI_NPM_READINESS;
  }

  return VALIDATION_PROFILE_MANUAL_CONSUMER_PROOF;
};

const assertConsumerRootCleanupSafety = async ({ repoRoot, consumerRoot, allowlistRoots = [] }) => {
  const normalizedConsumerRoot = resolve(consumerRoot);
  const homePath = resolveHomePath();

  if (normalizedConsumerRoot === '/' || normalizedConsumerRoot === homePath) {
    throw new Error(`Safety boundary rejected cleanup target: refusing destructive cleanup for root/home path (${normalizedConsumerRoot}).`);
  }

  if (isInside(normalizedConsumerRoot, repoRoot)) {
    throw new Error(`Safety boundary rejected cleanup target: consumer root must be outside repo root. repoRoot=${repoRoot} consumerRoot=${normalizedConsumerRoot}`);
  }

  if (!allowlistRoots.some((root) => isInside(normalizedConsumerRoot, root))) {
    throw new Error(`Safety boundary rejected cleanup target: consumer root is outside allowlisted boundaries. consumerRoot=${normalizedConsumerRoot}`);
  }

  const sentinelPath = join(normalizedConsumerRoot, '.legato-consumer-root');
  const hasSentinel = await pathExists(sentinelPath);
  if (!hasSentinel) {
    throw new Error(`Safety boundary rejected cleanup target: missing ${sentinelPath} sentinel file required for consumer-owned regeneration.`);
  }
};

const writeCommandTranscript = async ({ artifactsDir, commandTranscript }) => {
  const commandTranscriptPath = join(artifactsDir, 'command-transcript.log');
  const output = commandTranscript.length === 0
    ? '# no commands executed\n'
    : `${commandTranscript.join('\n')}\n`;
  await writeFile(commandTranscriptPath, output, 'utf8');
  return commandTranscriptPath;
};

const createCommandRunnerRecorder = ({ commandRunner, commandTranscript }) => async (commandInput) => {
  commandTranscript.push(`${commandInput.command} ${(commandInput.args ?? []).join(' ')}`.trim());
  return commandRunner(commandInput);
};

export const ensureFixtureOutsideRepo = ({ repoRoot, fixtureRoot }) => {
  if (isInside(fixtureRoot, repoRoot)) {
    throw new Error(`External fixture must be outside repo root. repoRoot=${repoRoot} fixtureRoot=${fixtureRoot}`);
  }
};

const collectStringValues = (value, into = []) => {
  if (typeof value === 'string') {
    into.push(value);
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, into);
    }
    return into;
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectStringValues(item, into);
    }
  }
  return into;
};

const parseSemver = (value) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(value).trim());
  if (!match) {
    return null;
  }
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
};

const compareSemver = (left, right) => {
  if (left.major !== right.major) {
    return left.major - right.major;
  }
  if (left.minor !== right.minor) {
    return left.minor - right.minor;
  }
  return left.patch - right.patch;
};

const isSemverInRange = (version, range) => {
  const parsedVersion = parseSemver(version);
  if (!parsedVersion) {
    return false;
  }

  const normalizedRange = String(range ?? '').trim();
  if (normalizedRange === '') {
    return false;
  }

  if (normalizedRange.startsWith('^')) {
    const base = parseSemver(normalizedRange.slice(1));
    if (!base) {
      return false;
    }

    if (parsedVersion.major !== base.major) {
      return false;
    }
    return compareSemver(parsedVersion, base) >= 0;
  }

  const exact = parseSemver(normalizedRange);
  if (!exact) {
    return false;
  }
  return compareSemver(parsedVersion, exact) === 0;
};

export const evaluateRegistryPeerAlignment = ({
  packageName,
  packageVersion,
  peerDependencies,
  availableVersionsByPackage,
}) => {
  const failures = [];
  const peerEntries = Object.entries(peerDependencies ?? {});
  for (const [peerName, peerRange] of peerEntries) {
    if (peerName !== '@ddgutierrezc/legato-contract') {
      continue;
    }

    const availableVersions = Array.isArray(availableVersionsByPackage?.[peerName])
      ? availableVersionsByPackage[peerName]
      : [];

    const hasCompatible = availableVersions.some((version) => isSemverInRange(version, peerRange));
    if (!hasCompatible) {
      failures.push(`Registry compatibility blocker: ${packageName}@${packageVersion} requires ${peerName}@${peerRange}, but npm does not contain a compatible ${peerName} version.`);
    }
  }

  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    failures,
  };
};

export const inspectIsolationLeaks = ({
  packageLockRaw = '',
  installManifestRaw = '',
  mode = PROOF_MODE_CONSUMER_ADOPTION,
} = {}) => {
  const failures = [];
  const allowTarballFileProtocols = mode === PROOF_MODE_NPM_READINESS;
  const isTarballFileReference = (value) => /(^|\/)?.+\.(?:tgz|tar\.gz)$/i.test(String(value).replace(/^file:/i, '').trim());

  const recordFileProtocolFailure = (rawValue) => {
    if (!allowTarballFileProtocols) {
      failures.push('Isolation breach: tarball/path file: dependency detected. Registry-only proof is required.');
      return;
    }

    if (!isTarballFileReference(rawValue)) {
      failures.push(`Isolation breach: non-tarball file: dependency detected (${rawValue}).`);
    }
  };

  const haystacks = [packageLockRaw, installManifestRaw];
  for (const haystack of haystacks) {
    if (/workspace:/i.test(haystack)) {
      failures.push('Isolation breach: workspace: reference detected in dependency metadata.');
    }
    if (/\bfile:/i.test(haystack)) {
      const matches = haystack.match(/file:[^"'\s,}\]]+/gi) ?? ['file:unknown'];
      for (const value of matches) {
        recordFileProtocolFailure(value);
      }
    }
    if (/\blink:/i.test(haystack)) {
      failures.push('Isolation breach: link: reference detected in dependency metadata.');
    }
  }

  try {
    if (packageLockRaw.trim().length > 0) {
      const parsed = JSON.parse(packageLockRaw);
      const strings = collectStringValues(parsed);
      for (const value of strings) {
        if (/^workspace:/i.test(value)) {
          failures.push(`Isolation breach: workspace protocol detected (${value}).`);
        }
        if (/^file:/i.test(value)) {
          if (allowTarballFileProtocols && isTarballFileReference(value)) {
            continue;
          }
          failures.push(`Isolation breach: file: protocol detected (${value}).`);
        }
        if (/^link:/i.test(value)) {
          failures.push(`Isolation breach: link: protocol detected (${value}).`);
        }
      }
    }
  } catch {
    failures.push('Isolation breach: failed to parse package-lock.json for dependency source checks.');
  }

  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    failures,
  };
};

const runCommand = async ({ command, args, cwd }) => new Promise((resolveResult, rejectResult) => {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    if (code === 0) {
      resolveResult({ stdout, stderr, exitCode: code });
      return;
    }
    const error = new Error(`Command failed (${command} ${args.join(' ')})`);
    error.exitCode = code;
    error.stdout = stdout;
    error.stderr = stderr;
    rejectResult(error);
  });
});

const pathExists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const ensureCapacitorPlatform = async ({ fixtureRoot, platform, commandRunner }) => {
  const platformRoot = join(fixtureRoot, platform);
  const exists = await pathExists(platformRoot);
  if (exists) {
    return;
  }

  await commandRunner({
    command: 'npx',
    args: ['cap', 'add', platform],
    cwd: fixtureRoot,
  });
};

const ensureFixtureScaffold = async (fixtureRoot) => {
  const capacitorConfigPath = join(fixtureRoot, 'capacitor.config.ts');
  const webDir = join(fixtureRoot, 'dist');
  const indexHtmlPath = join(webDir, 'index.html');
  const nodeModulesPath = join(fixtureRoot, 'node_modules');

  await mkdir(webDir, { recursive: true });
  await writeFile(capacitorConfigPath, `import { CapacitorConfig } from '@capacitor/cli';\n\nconst config: CapacitorConfig = {\n  appId: 'dev.legato.external',\n  appName: 'legato-external-consumer',\n  webDir: 'dist'\n};\n\nexport default config;\n`, 'utf8');
  await writeFile(indexHtmlPath, '<!doctype html><html><body><div id="app">external fixture</div></body></html>\n', 'utf8');
  await mkdir(nodeModulesPath, { recursive: true });
};

const parsePackTarballName = (stdout) => {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? null;
};

const collectDeclaredEntrypoints = (packageJson) => {
  const values = collectStringValues([
    packageJson?.main,
    packageJson?.types,
    packageJson?.exports,
    packageJson?.bin,
  ]);
  return [...new Set(values
    .map((value) => value.replaceAll('\\', '/').replace(/^\.\//, ''))
    .filter(Boolean))];
};

const listTarballEntries = async ({ tarballPath, commandRunner }) => {
  const result = await commandRunner({
    command: 'tar',
    args: ['-tzf', tarballPath],
    cwd: dirname(tarballPath),
  });
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((entry) => entry.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, ''));
};

const verifyEntrypointsInTarball = ({ entrypoints, tarballEntries, packageName }) => {
  const missing = [];
  const set = new Set(tarballEntries);
  for (const entrypoint of entrypoints) {
    const expectedEntry = `package/${entrypoint}`;
    if (!set.has(expectedEntry)) {
      missing.push(`${packageName}: missing ${expectedEntry}`);
    }
  }
  return missing;
};

const readJsonIfPresent = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
};

const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`;

const validateTarballSource = ({ installedPackage, expectedTarballPath }) => {
  if (!installedPackage || typeof installedPackage.resolved !== 'string') {
    return false;
  }
  return installedPackage.resolved.endsWith(basename(expectedTarballPath));
};

const validateRegistrySource = ({ installedPackage }) => {
  if (!installedPackage || typeof installedPackage.resolved !== 'string') {
    return false;
  }
  return /^https?:\/\/registry\.npmjs\.org\//i.test(installedPackage.resolved);
};

const parsePackageSpecifierName = (specifier) => {
  const raw = String(specifier ?? '').trim();
  if (!raw.startsWith('@')) {
    const [name] = raw.split('@');
    return name;
  }

  const lastAt = raw.lastIndexOf('@');
  if (lastAt <= 0) {
    return raw;
  }
  const maybeName = raw.slice(0, lastAt);
  return maybeName.includes('/') ? maybeName : raw;
};

const parseJsonFromStdout = (stdout) => {
  try {
    return JSON.parse(stdout);
  } catch {
    return null;
  }
};

const runRegistryPreflight = async ({ commandRunner, cwd, capacitorSpecifier, contractSpecifier }) => {
  const capacitorTarget = String(capacitorSpecifier ?? '').trim();
  const contractTarget = String(contractSpecifier ?? '').trim();
  const capacitorPackage = parsePackageSpecifierName(capacitorSpecifier);
  const contractPackage = parsePackageSpecifierName(contractSpecifier);

  const capacitorView = await commandRunner({
    command: 'npm',
    args: ['view', capacitorTarget || capacitorPackage, 'version', 'peerDependencies', '--json'],
    cwd,
  });
  const contractView = await commandRunner({
    command: 'npm',
    args: ['view', contractTarget || contractPackage, 'version', '--json'],
    cwd,
  });
  const contractVersionsView = await commandRunner({
    command: 'npm',
    args: ['view', contractPackage, 'versions', '--json'],
    cwd,
  });

  const capacitorMeta = parseJsonFromStdout(capacitorView.stdout) ?? {};
  const contractPinnedVersionRaw = parseJsonFromStdout(contractView.stdout);
  const contractVersionsRaw = parseJsonFromStdout(contractVersionsView.stdout);
  const contractVersions = [
    ...(Array.isArray(contractVersionsRaw)
      ? contractVersionsRaw
      : (typeof contractVersionsRaw === 'string' ? [contractVersionsRaw] : [])),
    ...(typeof contractPinnedVersionRaw === 'string' ? [contractPinnedVersionRaw] : []),
  ];

  return evaluateRegistryPeerAlignment({
    packageName: capacitorPackage,
    packageVersion: capacitorMeta.version ?? 'unknown',
    peerDependencies: capacitorMeta.peerDependencies ?? {},
    availableVersionsByPackage: {
      [contractPackage]: contractVersions,
    },
  });
};

export const evaluateConsumerAdoption = ({ runtimeProof }) => {
  const failures = [];
  const warnings = [];

  if (runtimeProof.cliHelp.status !== PASS) {
    failures.push('Installed CLI runtime proof failed: `npx legato --help` output did not contain expected usage text.');
  }

  if (runtimeProof.documentedImport.status !== PASS) {
    warnings.push('Manual consumer proof warning: documented package root import is currently informational in this profile.');
  }

  if (runtimeProof.deepImportRejection.status !== PASS) {
    failures.push('Undocumented deep import rejection proof failed: expected ERR_PACKAGE_PATH_NOT_EXPORTED evidence.');
  }

  return {
    status: failures.length === 0 ? PASS : FAIL,
    failures,
    warnings,
    classification: failures.length === 0
      ? 'manual-consumer-proof-passed'
      : 'manual-consumer-proof-contract-violation',
    remediation: failures.length === 0
      ? 'Attach manual real-device evidence to complete release packet.'
      : 'Fix runtime/exports regressions before relying on consumer adoption evidence.',
  };
};

export const evaluateNpmReadiness = ({ runtimeProof }) => {
  const failures = [];
  if (runtimeProof.cliHelp.status !== PASS) {
    failures.push('Installed CLI runtime proof failed: `npx legato --help` output did not contain expected usage text.');
  }
  if (runtimeProof.documentedImport.status !== PASS) {
    failures.push('Documented import runtime proof failed: package root import is release-blocking in ci-npm-readiness profile.');
  }
  if (runtimeProof.deepImportRejection.status !== PASS) {
    failures.push('Undocumented deep import rejection proof failed: expected ERR_PACKAGE_PATH_NOT_EXPORTED evidence.');
  }

  return {
    status: failures.length === 0 ? PASS : FAIL,
    failures,
    warnings: [],
    classification: failures.length === 0
      ? 'ci-npm-readiness-passed'
      : 'ci-npm-readiness-contract-violation',
    remediation: failures.length === 0
      ? 'Ready for CI gating. Still attach manual real-device evidence for final release confidence.'
      : 'Fix packaging/runtime export issues before running release gate.',
  };
};

const runRuntimeProof = async ({
  commandRunner,
  cwd,
}) => {
  const failures = [];
  const runtimeProof = {
    cliHelp: { status: FAIL, output: '' },
    documentedImport: { status: FAIL, output: '' },
    deepImportRejection: { status: FAIL, output: '' },
  };

  const didCliHelpMatch = (output) => /usage:|legato\s+native|legato\s+\[|legato\s+<|legato\s+--help/i.test(output);

  try {
    const cliHelp = await commandRunner({
      command: 'npx',
      args: ['legato', '--help'],
      cwd,
    });
    const output = `${cliHelp.stdout ?? ''}${cliHelp.stderr ?? ''}`;
    runtimeProof.cliHelp.output = output;
    if (didCliHelpMatch(output)) {
      runtimeProof.cliHelp.status = PASS;
    } else {
      failures.push('Installed CLI runtime proof failed: `npx legato --help` output did not contain expected usage text.');
    }
  } catch (error) {
    const output = `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
    runtimeProof.cliHelp.output = output;
    if (didCliHelpMatch(output)) {
      runtimeProof.cliHelp.status = PASS;
    } else {
      failures.push('Installed CLI runtime proof failed: `npx legato --help` did not execute successfully.');
    }
  }

  try {
    const documentedImport = await commandRunner({
      command: 'node',
      args: ['--input-type=module', '-e', "import('@ddgutierrezc/legato-contract').then(() => process.stdout.write('documented import ok\\n'))"],
      cwd,
    });
    const output = `${documentedImport.stdout ?? ''}${documentedImport.stderr ?? ''}`;
    runtimeProof.documentedImport.output = output;
    if (/documented import ok/i.test(output)) {
      runtimeProof.documentedImport.status = PASS;
    } else {
      failures.push('Documented import runtime proof failed: package root import did not report success.');
    }
  } catch (error) {
    const output = `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
    runtimeProof.documentedImport.output = output;
    failures.push('Documented import runtime proof failed: package root import threw unexpectedly.');
  }

  try {
    const deepImport = await commandRunner({
      command: 'node',
      args: ['--input-type=module', '-e', "import('@ddgutierrezc/legato-contract/dist/state.js').then(() => process.stdout.write('unexpected deep import success\\n'))"],
      cwd,
    });
    runtimeProof.deepImportRejection.output = `${deepImport.stdout ?? ''}${deepImport.stderr ?? ''}`;
    failures.push('Undocumented deep import resolved unexpectedly: expected package exports to reject @ddgutierrezc/legato-contract/dist/state.js.');
  } catch (error) {
    const output = `${error?.stdout ?? ''}${error?.stderr ?? ''}`;
    runtimeProof.deepImportRejection.output = output;
    if (/ERR_PACKAGE_PATH_NOT_EXPORTED|Package subpath .* not defined by "exports"/i.test(output)) {
      runtimeProof.deepImportRejection.status = PASS;
    } else {
      failures.push('Undocumented deep import rejection proof failed: expected ERR_PACKAGE_PATH_NOT_EXPORTED evidence.');
    }
  }

  return {
    status: failures.length === 0 ? PASS : FAIL,
    failures,
    runtimeProof,
  };
};

const requireValue = (argv, index, flag) => {
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
};

export const parseArgs = (argv) => {
  const options = {
    repoRoot: defaultRepoRoot,
    artifactsDir: defaultArtifactsDir,
    consumerRoot: undefined,
    keepFixture: false,
    hostStrategy: undefined,
    allowConsumerRootRegeneration: false,
    consumerRootAllowlist: [],
    skipPack: false,
    tarballs: {},
    registrySpecs: {
      contract: '@ddgutierrezc/legato-contract@0.1.1',
      capacitor: '@ddgutierrezc/legato-capacitor@0.1.1',
    },
    proofMode: PROOF_MODE_CONSUMER_ADOPTION,
    validationProfile: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo-root') {
      options.repoRoot = resolve(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--artifacts-dir') {
      options.artifactsDir = resolve(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--consumer-root') {
      options.consumerRoot = resolve(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--consumer-root-allowlist') {
      options.consumerRootAllowlist.push(resolve(requireValue(argv, i, arg)));
      i += 1;
      continue;
    }
    if (arg === '--keep-fixture') {
      options.keepFixture = true;
      continue;
    }
    if (arg === '--allow-consumer-root-regeneration') {
      options.allowConsumerRootRegeneration = true;
      continue;
    }
    if (arg === '--host-strategy') {
      options.hostStrategy = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--skip-pack') {
      options.skipPack = true;
      continue;
    }
    if (arg === '--tarball-contract') {
      options.tarballs.contract = resolve(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--tarball-capacitor') {
      options.tarballs.capacitor = resolve(requireValue(argv, i, arg));
      i += 1;
      continue;
    }
    if (arg === '--registry-contract') {
      options.registrySpecs.contract = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--registry-capacitor') {
      options.registrySpecs.capacitor = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--proof-mode') {
      options.proofMode = requireValue(argv, i, arg);
      i += 1;
      continue;
    }
    if (arg === '--validation-profile') {
      options.validationProfile = requireValue(argv, i, arg);
      i += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
};

export const runExternalConsumerValidation = async ({
  repoRoot = defaultRepoRoot,
  templateRoot = defaultTemplateRoot,
  artifactsDir = defaultArtifactsDir,
  fixtureRoot,
  consumerRoot,
  keepFixture = false,
  commandRunner = runCommand,
  skipPack = false,
  tarballs: providedTarballs,
  hostStrategy,
  allowConsumerRootRegeneration = false,
  consumerRootAllowlist = [],
  registrySpecs = {
    contract: '@ddgutierrezc/legato-contract@0.1.1',
    capacitor: '@ddgutierrezc/legato-capacitor@0.1.1',
  },
  proofMode = PROOF_MODE_CONSUMER_ADOPTION,
  validationProfile,
} = {}) => {
  const failures = [];
  const warnings = [];
  const commandTranscript = [];
  const commandRunnerWithTranscript = createCommandRunnerRecorder({ commandRunner, commandTranscript });
  const areas = {
    registryPreflight: FAIL,
    isolation: FAIL,
    installability: FAIL,
    packedEntrypoints: FAIL,
    typecheckAndSync: FAIL,
    validatorReuse: FAIL,
  };

  const normalizedProofMode = VALID_PROOF_MODES.has(String(proofMode ?? '').trim())
    ? String(proofMode ?? '').trim()
    : null;
  if (!normalizedProofMode) {
    throw new Error(`proof_mode must be one of ${PROOF_MODE_CONSUMER_ADOPTION}, ${PROOF_MODE_NPM_READINESS}. Received: ${proofMode}`);
  }

  const resolvedValidationProfile = resolveValidationProfile({ validationProfile, proofMode: normalizedProofMode });
  if (!VALID_VALIDATION_PROFILES.has(resolvedValidationProfile)) {
    throw new Error(`validation_profile must be one of ${VALIDATION_PROFILE_MANUAL_CONSUMER_PROOF}, ${VALIDATION_PROFILE_CI_NPM_READINESS}. Received: ${validationProfile}`);
  }

  await mkdir(artifactsDir, { recursive: true });

  const useConsumerOwnedRoot = typeof consumerRoot === 'string' && consumerRoot.trim().length > 0;
  const resolvedFixtureRoot = useConsumerOwnedRoot
    ? resolve(consumerRoot)
    : (fixtureRoot ?? await mkdtemp(join(tmpdir(), 'legato-external-consumer-')));
  const resolvedHostStrategy = typeof hostStrategy === 'string' && hostStrategy.trim().length > 0
    ? hostStrategy.trim()
    : (useConsumerOwnedRoot ? 'preserve' : 'regenerate');
  if (!VALID_HOST_STRATEGIES.has(resolvedHostStrategy)) {
    throw new Error(`host_strategy must be one of preserve, regenerate. Received: ${hostStrategy}`);
  }
  const tarballs = {
    capacitor: providedTarballs?.capacitor,
    contract: providedTarballs?.contract,
  };
  const usingTarballMode = normalizedProofMode === PROOF_MODE_NPM_READINESS
    ? Boolean(tarballs.contract || tarballs.capacitor || !skipPack)
    : Boolean(tarballs.contract || tarballs.capacitor);

  const runManifest = {
    runId: `consumer-proof-${Date.now()}`,
    schemaVersion: 2,
    repoRoot,
    fixtureRoot: resolvedFixtureRoot,
    artifactsDir,
    tarballs,
    validationProfile: resolvedValidationProfile,
    proofMode: normalizedProofMode,
    hostStrategy: resolvedHostStrategy,
    startedAt: new Date().toISOString(),
    checks: {},
    artifacts: [],
    externalEvidence: [],
  };

  const capSyncLogPath = join(artifactsDir, 'cap-sync.log');
  const typecheckLogPath = join(artifactsDir, 'typecheck.log');
  const validatorSummaryPath = join(artifactsDir, 'validator-summary.txt');
  const runManifestPath = join(artifactsDir, 'run-manifest.json');
  const summaryCliPath = join(artifactsDir, 'summary-cli.json');
  const installMetadataPath = join(artifactsDir, 'install-metadata.json');
  const dependencyScanPath = join(artifactsDir, 'dependency-scan.json');
  const tarballEntrypointCheckPath = join(artifactsDir, 'tarball-entrypoint-check.json');
  const summaryPath = join(artifactsDir, 'summary.json');
  let packageEvidence = null;
  let runtimeProof = null;
  let commandTranscriptPath = null;
  let policy = {
    status: FAIL,
    failures: [],
    warnings: [],
    classification: 'not-evaluated',
    remediation: 'Policy evaluation did not run.',
  };

  try {
    await commandRunnerWithTranscript({ command: 'node', args: ['--version'], cwd: repoRoot });
    await commandRunnerWithTranscript({ command: 'npm', args: ['--version'], cwd: repoRoot });
    await commandRunnerWithTranscript({ command: 'npx', args: ['--version'], cwd: repoRoot });

    const preflight = await runRegistryPreflight({
      commandRunner: commandRunnerWithTranscript,
      cwd: repoRoot,
      capacitorSpecifier: registrySpecs.capacitor,
      contractSpecifier: registrySpecs.contract,
    });
    if (preflight.status !== PASS) {
      failures.push(...preflight.failures);
      throw new Error('Registry preflight failed: published peer ranges are not satisfiable.');
    }
    areas.registryPreflight = PASS;

    ensureFixtureOutsideRepo({ repoRoot, fixtureRoot: resolvedFixtureRoot });
    if (!useConsumerOwnedRoot) {
      await rm(resolvedFixtureRoot, { recursive: true, force: true });
      await cp(templateRoot, resolvedFixtureRoot, { recursive: true, force: true });
      await ensureFixtureScaffold(resolvedFixtureRoot);
    }

    if (useConsumerOwnedRoot && resolvedHostStrategy === 'regenerate') {
      if (!allowConsumerRootRegeneration) {
        throw new Error('Safety boundary rejected cleanup target: consumer-owned host regeneration requires --allow-consumer-root-regeneration.');
      }
      await assertConsumerRootCleanupSafety({
        repoRoot,
        consumerRoot: resolvedFixtureRoot,
        allowlistRoots: [resolve(repoRoot, '..'), ...consumerRootAllowlist],
      });
      await rm(join(resolvedFixtureRoot, 'ios'), { recursive: true, force: true });
      await rm(join(resolvedFixtureRoot, 'android'), { recursive: true, force: true });
      await rm(join(resolvedFixtureRoot, 'node_modules'), { recursive: true, force: true });
      await rm(join(resolvedFixtureRoot, 'package-lock.json'), { force: true });
      await ensureFixtureScaffold(resolvedFixtureRoot);
    }

    if (!skipPack && usingTarballMode) {
      const contractPack = await commandRunnerWithTranscript({
        command: 'npm',
        args: ['pack', '--pack-destination', artifactsDir],
        cwd: resolve(repoRoot, 'packages/contract'),
      });
      const capacitorPack = await commandRunnerWithTranscript({
        command: 'npm',
        args: ['pack', '--pack-destination', artifactsDir],
        cwd: resolve(repoRoot, 'packages/capacitor'),
      });
      const contractTarball = parsePackTarballName(contractPack.stdout);
      const capacitorTarball = parsePackTarballName(capacitorPack.stdout);
      tarballs.contract = resolve(artifactsDir, contractTarball ?? '');
      tarballs.capacitor = resolve(artifactsDir, capacitorTarball ?? '');
    }

    const installArgs = ['install', '--no-audit', '--no-fund'];
    if (usingTarballMode) {
      if (!tarballs.contract || !tarballs.capacitor) {
        throw new Error('Tarball generation/injection failed: missing capacitor or contract tarball path.');
      }
      installArgs.push(tarballs.contract, tarballs.capacitor);
    } else {
      installArgs.push(registrySpecs.contract, registrySpecs.capacitor);
    }

    await commandRunnerWithTranscript({
      command: 'npm',
      args: installArgs,
      cwd: resolvedFixtureRoot,
    });

    const packageLockPath = join(resolvedFixtureRoot, 'package-lock.json');
    const packageLockRaw = await readFile(packageLockPath, 'utf8');
    const packageLock = JSON.parse(packageLockRaw);
    const capacitorInstall = packageLock?.packages?.['node_modules/@ddgutierrezc/legato-capacitor'] ?? null;
    const contractInstall = packageLock?.packages?.['node_modules/@ddgutierrezc/legato-contract'] ?? null;
    const installManifest = {
      capacitor: capacitorInstall,
      contract: contractInstall,
    };
    await writeFile(installMetadataPath, stringify(installManifest), 'utf8');

    const installabilityOk = usingTarballMode
      ? (validateTarballSource({ installedPackage: capacitorInstall, expectedTarballPath: tarballs.capacitor })
        && validateTarballSource({ installedPackage: contractInstall, expectedTarballPath: tarballs.contract }))
      : (validateRegistrySource({ installedPackage: capacitorInstall })
        && validateRegistrySource({ installedPackage: contractInstall }));
    if (!installabilityOk) {
      const breach = usingTarballMode
        ? 'Installability contract breach: @legato packages were not resolved from provided tarballs.'
        : 'Installability contract breach: @legato packages were not resolved from npm registry URLs.';
      failures.push(breach);
    } else {
      areas.installability = PASS;
    }

    const installedCapacitorPackageJson = await readJsonIfPresent(join(resolvedFixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/package.json'));
    const installedContractPackageJson = await readJsonIfPresent(join(resolvedFixtureRoot, 'node_modules/@ddgutierrezc/legato-contract/package.json'));
    packageEvidence = {
      capacitor: {
        name: installedCapacitorPackageJson?.name ?? null,
        description: installedCapacitorPackageJson?.description ?? null,
        hasBin: Boolean(installedCapacitorPackageJson?.bin && Object.keys(installedCapacitorPackageJson.bin).length > 0),
        bin: installedCapacitorPackageJson?.bin ?? null,
      },
      contract: {
        name: installedContractPackageJson?.name ?? null,
        description: installedContractPackageJson?.description ?? null,
        hasBin: Boolean(installedContractPackageJson?.bin && Object.keys(installedContractPackageJson.bin).length > 0),
        bin: installedContractPackageJson?.bin ?? null,
      },
    };

    if (!packageEvidence.capacitor.hasBin) {
      failures.push('Installed package evidence breach: capacitor package must expose bin metadata for `legato`.');
    }
    if (packageEvidence.contract.hasBin) {
      failures.push('Installed package evidence breach: contract package must remain library-only (no bin metadata).');
    }

    const runtimeProofResult = await runRuntimeProof({
      commandRunner: commandRunnerWithTranscript,
      cwd: resolvedFixtureRoot,
    });
    runtimeProof = runtimeProofResult.runtimeProof;
    if (runtimeProofResult.failures.length > 0) {
      warnings.push(...runtimeProofResult.failures);
    }

    policy = resolvedValidationProfile === VALIDATION_PROFILE_CI_NPM_READINESS
      ? evaluateNpmReadiness({ runtimeProof })
      : evaluateConsumerAdoption({ runtimeProof });
    failures.push(...policy.failures);
    warnings.push(...policy.warnings);

    const consumerPackageJson = await readJsonIfPresent(join(resolvedFixtureRoot, 'package.json'));
    const capacitorEntrypoints = collectDeclaredEntrypoints(installedCapacitorPackageJson ?? {});
    const contractEntrypoints = collectDeclaredEntrypoints(installedContractPackageJson ?? {});
    const missingEntrypoints = [];
    if (usingTarballMode) {
      const capacitorTarEntries = await listTarballEntries({ tarballPath: tarballs.capacitor, commandRunner: commandRunnerWithTranscript });
      const contractTarEntries = await listTarballEntries({ tarballPath: tarballs.contract, commandRunner: commandRunnerWithTranscript });
      missingEntrypoints.push(
        ...verifyEntrypointsInTarball({
          entrypoints: capacitorEntrypoints,
          tarballEntries: capacitorTarEntries,
          packageName: '@ddgutierrezc/legato-capacitor',
        }),
        ...verifyEntrypointsInTarball({
          entrypoints: contractEntrypoints,
          tarballEntries: contractTarEntries,
          packageName: '@ddgutierrezc/legato-contract',
        }),
      );
    }

    await writeFile(tarballEntrypointCheckPath, stringify({
      mode: usingTarballMode ? 'tarball' : 'registry',
      status: missingEntrypoints.length === 0 ? PASS : FAIL,
      capacitorEntrypoints,
      contractEntrypoints,
      missingEntrypoints,
    }), 'utf8');

    if (missingEntrypoints.length === 0) {
      areas.packedEntrypoints = PASS;
    } else {
      failures.push('Packed contract breach: declared package entrypoints are missing from tarball contents.');
      failures.push(...missingEntrypoints);
    }

    const leakScan = inspectIsolationLeaks({
      packageLockRaw,
      installManifestRaw: JSON.stringify(installManifest),
      mode: normalizedProofMode,
    });

    const installedCapacitorPath = join(resolvedFixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor');
    const installedContractPath = join(resolvedFixtureRoot, 'node_modules/@ddgutierrezc/legato-contract');
    const installedNativeArtifactsContractPath = join(installedCapacitorPath, 'native-artifacts.json');
    const capacitorStat = await lstat(installedCapacitorPath);
    const contractStat = await lstat(installedContractPath);
    if (capacitorStat.isSymbolicLink() || contractStat.isSymbolicLink()) {
      leakScan.failures.push('Isolation breach: monorepo symlink detected in node_modules/@legato/* install.');
      leakScan.status = FAIL;
    }

    await writeFile(dependencyScanPath, stringify(leakScan), 'utf8');
    if (leakScan.status === PASS) {
      areas.isolation = PASS;
    } else {
      failures.push(...leakScan.failures);
    }

    const compileArgs = consumerPackageJson?.scripts?.typecheck
      ? ['run', 'typecheck']
      : ['run', 'build'];
    const typecheckResult = await commandRunnerWithTranscript({ command: 'npm', args: compileArgs, cwd: resolvedFixtureRoot });
    await writeFile(typecheckLogPath, `${typecheckResult.stdout}${typecheckResult.stderr}`, 'utf8');

    await ensureCapacitorPlatform({
      fixtureRoot: resolvedFixtureRoot,
      platform: 'ios',
      commandRunner: commandRunnerWithTranscript,
    });
    await ensureCapacitorPlatform({
      fixtureRoot: resolvedFixtureRoot,
      platform: 'android',
      commandRunner: commandRunnerWithTranscript,
    });

    const capSyncResult = await commandRunnerWithTranscript({
      command: 'npx',
      args: ['cap', 'sync', 'ios', 'android'],
      cwd: resolvedFixtureRoot,
    });
    await writeFile(capSyncLogPath, `${capSyncResult.stdout}${capSyncResult.stderr}`, 'utf8');
    areas.typecheckAndSync = PASS;

    const validatorCli = await commandRunnerWithTranscript({
      command: 'node',
      args: [
        resolve(scriptDir, 'validate-native-artifacts.mjs'),
        '--plugin-gradle', join(resolvedFixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/android/build.gradle'),
        '--native-artifacts-contract', installedNativeArtifactsContractPath,
        '--android-settings', join(resolvedFixtureRoot, 'android/settings.gradle'),
        '--capapp-spm-package', join(resolvedFixtureRoot, 'ios/App/CapApp-SPM/Package.swift'),
        '--plugin-swift-package', join(resolvedFixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/Package.swift'),
        '--plugin-swift-source', join(resolvedFixtureRoot, 'node_modules/@ddgutierrezc/legato-capacitor/ios/Sources/LegatoPlugin/LegatoPlugin.swift'),
        '--capacitor-config', join(resolvedFixtureRoot, 'ios/App/App/capacitor.config.json'),
        '--fixture-root', resolvedFixtureRoot,
        '--repo-root', repoRoot,
      ],
      cwd: repoRoot,
    });
    await writeFile(validatorSummaryPath, `${validatorCli.stdout}${validatorCli.stderr}`, 'utf8');
    if (/Overall:\s*PASS/i.test(validatorCli.stdout)) {
      areas.validatorReuse = PASS;
    } else {
      failures.push('Validator reuse failed: validate-native-artifacts did not report PASS against fixture hosts.');
    }
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const text = [stdout, stderr].filter(Boolean).join('\n').trim();
    if (text.length > 0) {
      failures.push(text);
      await writeFile(capSyncLogPath, `${stdout}\n${stderr}`.trimEnd() + '\n', 'utf8');
    }
    if (error instanceof Error && error.message) {
      failures.push(error.message);
    }
  } finally {
    commandTranscriptPath = await writeCommandTranscript({ artifactsDir, commandTranscript });
    runManifest.tarballs = tarballs;
    runManifest.finishedAt = new Date().toISOString();
    runManifest.checks = {
      registryPreflight: areas.registryPreflight,
      isolation: areas.isolation,
      installability: areas.installability,
      packedEntrypoints: areas.packedEntrypoints,
      typecheckAndSync: areas.typecheckAndSync,
      validatorReuse: areas.validatorReuse,
      policy: policy.status,
    };
    runManifest.artifacts = [
      { key: 'summary', path: summaryPath, required: true },
      { key: 'summaryCli', path: summaryCliPath, required: true },
      { key: 'runManifest', path: runManifestPath, required: true },
      { key: 'installMetadata', path: installMetadataPath, required: true },
      { key: 'dependencyScan', path: dependencyScanPath, required: true },
      { key: 'typecheckLog', path: typecheckLogPath, required: true },
      { key: 'capSyncLog', path: capSyncLogPath, required: true },
      { key: 'validatorSummary', path: validatorSummaryPath, required: true },
      { key: 'tarballEntrypointCheck', path: tarballEntrypointCheckPath, required: true },
      { key: 'commandTranscript', path: commandTranscriptPath, required: true },
    ];
    runManifest.externalEvidence = [
      {
        kind: 'manual-real-device-proof',
        required: resolvedValidationProfile === VALIDATION_PROFILE_MANUAL_CONSUMER_PROOF,
        note: 'Manual/real-device playback proof remains out of full automation scope.',
      },
    ];
    await writeFile(runManifestPath, stringify(runManifest), 'utf8');
  }

  const requiredArtifactChecks = [
    { key: 'runManifest', path: runManifestPath },
    { key: 'installMetadata', path: installMetadataPath },
    { key: 'dependencyScan', path: dependencyScanPath },
    { key: 'typecheckLog', path: typecheckLogPath },
    { key: 'capSyncLog', path: capSyncLogPath },
    { key: 'validatorSummary', path: validatorSummaryPath },
    { key: 'tarballEntrypointCheck', path: tarballEntrypointCheckPath },
    { key: 'commandTranscript', path: commandTranscriptPath },
  ];
  const missingArtifacts = [];
  for (const artifact of requiredArtifactChecks) {
    // eslint-disable-next-line no-await-in-loop
    const exists = await pathExists(artifact.path);
    if (!exists) {
      missingArtifacts.push(artifact.key);
    }
  }
  if (missingArtifacts.length > 0) {
    failures.push(`Evidence contract violation: missing required artifacts (${missingArtifacts.join(', ')}).`);
  }

  const status = failures.length === 0 ? PASS : FAIL;
  const summary = {
    status,
    exitCode: status === PASS ? 0 : 1,
    areas,
    failures,
    warnings,
    packageEvidence,
    runtimeProof,
    validationProfile: resolvedValidationProfile,
    policy,
    artifacts: {
      runManifestPath,
      summaryPath,
      summaryCliPath,
      installMetadataPath,
      dependencyScanPath,
      typecheckLogPath,
      capSyncLogPath,
      validatorSummaryPath,
      tarballEntrypointCheckPath,
      commandTranscriptPath,
    },
    fixtureRoot: resolvedFixtureRoot,
  };

  await writeFile(summaryPath, stringify(summary), 'utf8');
  await writeFile(summaryCliPath, stringify({
    status,
    exitCode: status === PASS ? 0 : 1,
    proofMode: normalizedProofMode,
    validationProfile: resolvedValidationProfile,
    policy: {
      status: policy.status,
      classification: policy.classification,
      remediation: policy.remediation,
    },
    areas,
    failures,
    warnings,
  }), 'utf8');

  if (!keepFixture && !useConsumerOwnedRoot) {
    await rm(resolvedFixtureRoot, { recursive: true, force: true });
  }

  return summary;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runExternalConsumerValidation(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}
