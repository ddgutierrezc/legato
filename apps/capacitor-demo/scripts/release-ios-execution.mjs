import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { normalizeTargetSummary } from './release-control-summary-schema.mjs';

const PASS = 'PASS';
const FAIL = 'FAIL';
const CONFIG_ERROR_EXIT_CODE = 2;

const DEFAULT_RELEASE_ID = 'manual';
const DEFAULT_ARTIFACTS_DIR = 'artifacts/ios-publication-v1';
const DEFAULT_PUBLISH_ARTIFACTS_DIR = 'artifacts/ios-publication-v2';
const DEFAULT_CONTRACT_PATH = '../../packages/capacitor/native-artifacts.json';
const ALLOWED_PROOF_TYPES = new Set(['tag-release-url', 'commit-sha']);
const PLACEHOLDER_VALUE_RE = /(\b(tbd|example|placeholder)\b|^<.+>$)/i;

const normalizeTagVersion = (value = '') => value.trim().replace(/^v/i, '');

const toIsoTimestamp = (value = new Date()) => value.toISOString();

const toPositiveInteger = (value, fieldName) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${fieldName}: expected positive integer, received ${value}`);
  }
  return parsed;
};

const readJson = async (filePath) => {
  const raw = await readFile(resolve(filePath), 'utf8');
  return JSON.parse(raw);
};

const writeJson = async (filePath, payload) => {
  const absolutePath = resolve(filePath);
  await mkdir(dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return absolutePath;
};

const makeReleasePaths = ({ artifactsDir, releaseId }) => {
  const root = resolve(artifactsDir, releaseId);
  return {
    releaseRoot: root,
    preflightPath: resolve(root, 'preflight.json'),
    handoffPath: resolve(root, 'handoff.json'),
    verifyPath: resolve(root, 'verify.json'),
    closeoutPath: resolve(root, 'closeout.json'),
  };
};

const defaultRunGitLsRemote = async ({ repo }) => new Promise((resolvePromise) => {
  const child = spawn('git', ['ls-remote', '--tags', repo], {
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
    resolvePromise({
      exitCode: Number.isInteger(code) ? code : 1,
      stdout,
      stderr,
    });
  });
  child.on('error', (error) => {
    resolvePromise({
      exitCode: 1,
      stdout,
      stderr: `${stderr}\n${error.message}`.trim(),
    });
  });
});

const defaultRunGit = async ({ args, cwd }) => new Promise((resolvePromise) => {
  const child = spawn('git', args, {
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
    resolvePromise({
      exitCode: Number.isInteger(code) ? code : 1,
      stdout,
      stderr,
    });
  });

  child.on('error', (error) => {
    resolvePromise({
      exitCode: 1,
      stdout,
      stderr: `${stderr}\n${error.message}`.trim(),
    });
  });
});

const deriveSwiftPackageIdentity = (packageUrl) => String(packageUrl ?? '').trim().replace(/\/+$/, '').split('/').pop()?.replace(/\.git$/i, '') ?? '';

export const buildVerifyScratchPackageSwift = ({ packageUrl, packageName, product, version }) => `// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "LegatoReleaseVerifyScratch",
    platforms: [
        .iOS(.v13)
    ],
    products: [
        .library(name: "LegatoReleaseVerifyScratch", targets: ["LegatoReleaseVerifyScratch"])
    ],
    dependencies: [
        .package(url: "${packageUrl}", .exact("${version}"))
    ],
    targets: [
        .target(
            name: "LegatoReleaseVerifyScratch",
            dependencies: [
                .product(name: "${product}", package: "${deriveSwiftPackageIdentity(packageUrl)}")
            ]
        )
    ]
)
`;

const defaultRunSwiftPackageResolve = async ({ packageUrl, packageName, product, version }) => {
  const scratchDir = await mkdtemp(resolve(tmpdir(), 'legato-ios-release-verify-'));
  const packageSwiftPath = resolve(scratchDir, 'Package.swift');
  const packageSwift = buildVerifyScratchPackageSwift({ packageUrl, packageName, product, version });
  await writeFile(packageSwiftPath, packageSwift, 'utf8');

  const result = await new Promise((resolvePromise) => {
    const child = spawn('swift', ['package', 'resolve'], {
      cwd: scratchDir,
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
      resolvePromise({
        exitCode: Number.isInteger(code) ? code : 1,
        stdout,
        stderr,
      });
    });
    child.on('error', (error) => {
      resolvePromise({
        exitCode: 1,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
      });
    });
  });

  await rm(scratchDir, { recursive: true, force: true });
  return result;
};

const wait = (ms) => new Promise((resolvePromise) => {
  setTimeout(resolvePromise, ms);
});

const parseArgs = (argv) => {
  const [command] = argv;
  const options = {
    command: command ?? '',
    releaseId: DEFAULT_RELEASE_ID,
    artifactsDir: DEFAULT_ARTIFACTS_DIR,
    releaseTag: '',
    externalRepo: '',
    externalTag: '',
    proofType: '',
    proofValue: '',
    operator: '',
    publishedAt: '',
    attempts: 6,
    backoffMs: 120000,
    preflightPath: '',
    handoffPath: '',
    verifyPath: '',
    closeoutPath: '',
    contractPath: DEFAULT_CONTRACT_PATH,
    distributionRepo: '',
    distributionRef: 'main',
    githubAppToken: '',
  };

  for (let i = 1; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--release-id' && argv[i + 1]) {
      options.releaseId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--artifacts-dir' && argv[i + 1]) {
      options.artifactsDir = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-tag' && argv[i + 1]) {
      options.releaseTag = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--external-repo' && argv[i + 1]) {
      options.externalRepo = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--external-tag' && argv[i + 1]) {
      options.externalTag = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--operator' && argv[i + 1]) {
      options.operator = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--proof-type' && argv[i + 1]) {
      options.proofType = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--proof-value' && argv[i + 1]) {
      options.proofValue = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--published-at' && argv[i + 1]) {
      options.publishedAt = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--attempts' && argv[i + 1]) {
      options.attempts = toPositiveInteger(argv[i + 1], 'attempts');
      i += 1;
      continue;
    }
    if (arg === '--backoff-ms' && argv[i + 1]) {
      options.backoffMs = toPositiveInteger(argv[i + 1], 'backoff-ms');
      i += 1;
      continue;
    }
    if (arg === '--preflight-path' && argv[i + 1]) {
      options.preflightPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--handoff-path' && argv[i + 1]) {
      options.handoffPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--verify-path' && argv[i + 1]) {
      options.verifyPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--closeout-path' && argv[i + 1]) {
      options.closeoutPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--contract' && argv[i + 1]) {
      options.contractPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--distribution-repo' && argv[i + 1]) {
      options.distributionRepo = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--distribution-ref' && argv[i + 1]) {
      options.distributionRef = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--github-app-token' && argv[i + 1]) {
      options.githubAppToken = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const assertTruthy = (value, message, failures) => {
  if (!value || String(value).trim() === '') {
    failures.push(message);
  }
};

const isPlaceholderValue = (value) => {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return true;
  }
  return PLACEHOLDER_VALUE_RE.test(normalized);
};

const assertNonPlaceholder = (value, message, failures) => {
  if (isPlaceholderValue(value)) {
    failures.push(message);
  }
};

const normalizeProofType = (value = '') => String(value).trim().toLowerCase();

const buildProofReference = ({ handoff }) => ({
  proofType: String(handoff.proofType ?? '').trim(),
  proofValue: String(handoff.proofValue ?? '').trim(),
  externalRepo: String(handoff.externalRepo ?? '').trim(),
  externalTag: String(handoff.externalTag ?? '').trim(),
});

const parseIosContract = (contractJson = {}) => ({
  packageUrl: String(contractJson?.ios?.packageUrl ?? '').trim(),
  packageName: String(contractJson?.ios?.packageName ?? '').trim(),
  product: String(contractJson?.ios?.product ?? '').trim(),
  version: String(contractJson?.ios?.version ?? '').trim(),
});

const validateHandoffTruthfulness = ({ handoff, failures }) => {
  assertNonPlaceholder(handoff.externalRepo, 'manual publish evidence required: externalRepo must be non-placeholder and non-empty.', failures);
  assertNonPlaceholder(handoff.externalTag, 'manual publish evidence required: externalTag must be non-placeholder and non-empty.', failures);
  assertNonPlaceholder(handoff.operator, 'manual publish evidence required: operator must be non-placeholder and non-empty.', failures);
  assertNonPlaceholder(handoff.publishedAt, 'manual publish evidence required: publishedAt must be non-placeholder and non-empty.', failures);
  assertNonPlaceholder(handoff.preflightPath, 'manual publish evidence required: preflightPath must be non-placeholder and non-empty.', failures);
  assertNonPlaceholder(handoff.proofValue, 'manual publish evidence required: proofValue must be non-placeholder and non-empty.', failures);

  const proofType = normalizeProofType(handoff.proofType);
  if (!ALLOWED_PROOF_TYPES.has(proofType)) {
    failures.push('manual publish evidence required: proofType must be one of tag-release-url or commit-sha.');
  }

  const publishedAt = String(handoff.publishedAt ?? '').trim();
  if (publishedAt && Number.isNaN(Date.parse(publishedAt))) {
    failures.push('manual publish evidence required: publishedAt must be a valid ISO8601 timestamp.');
  }
};

export const recordIosPublishHandoff = async ({
  releaseId = DEFAULT_RELEASE_ID,
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  releaseTag = '',
  externalRepo = '',
  externalTag = '',
  proofType = '',
  proofValue = '',
  operator = '',
  publishedAt = '',
  preflightPath,
  handoffPath,
  contractPath = DEFAULT_CONTRACT_PATH,
  jsonReader = readJson,
  jsonWriter = writeJson,
} = {}) => {
  const defaults = makeReleasePaths({ artifactsDir, releaseId });
  const resolvedPreflightPath = resolve(preflightPath || defaults.preflightPath);
  const resolvedHandoffPath = resolve(handoffPath || defaults.handoffPath);
  const failures = [];

  let preflight;
  try {
    preflight = await jsonReader(resolvedPreflightPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`manual publish evidence required: unable to read preflight artifact at ${resolvedPreflightPath} (${message})`);
    return {
      status: FAIL,
      exitCode: 1,
      mode: 'handoff',
      failures,
    };
  }

  if (preflight.status !== PASS || preflight.readyForManualHandoff !== true) {
    failures.push('manual publish evidence required: preflight must be PASS with readyForManualHandoff=true before handoff.');
  }

  let iosContract = null;
  try {
    const contract = await jsonReader(contractPath);
    iosContract = parseIosContract(contract);
  } catch (error) {
    failures.push(`manual publish evidence required: unable to read iOS contract at ${resolve(contractPath)} (${error instanceof Error ? error.message : String(error)})`);
  }

  assertTruthy(externalRepo, 'manual publish evidence required: --external-repo <url> is mandatory.', failures);
  assertTruthy(externalTag, 'manual publish evidence required: --external-tag <tag> is mandatory.', failures);
  assertTruthy(proofType, 'manual publish evidence required: --proof-type <tag-release-url|commit-sha> is mandatory.', failures);
  assertTruthy(proofValue, 'manual publish evidence required: --proof-value <value> is mandatory.', failures);
  assertTruthy(operator, 'manual publish evidence required: --operator <name> is mandatory.', failures);
  assertTruthy(publishedAt, 'manual publish evidence required: --published-at <ISO8601> is mandatory.', failures);
  assertNonPlaceholder(externalRepo, 'manual publish evidence required: externalRepo cannot be placeholder/synthetic.', failures);
  assertNonPlaceholder(externalTag, 'manual publish evidence required: externalTag cannot be placeholder/synthetic.', failures);
  assertNonPlaceholder(proofValue, 'manual publish evidence required: proofValue cannot be placeholder/synthetic.', failures);
  assertNonPlaceholder(operator, 'manual publish evidence required: operator cannot be placeholder/synthetic.', failures);
  assertNonPlaceholder(publishedAt, 'manual publish evidence required: publishedAt cannot be placeholder/synthetic.', failures);

  const normalizedProofType = normalizeProofType(proofType);
  if (!ALLOWED_PROOF_TYPES.has(normalizedProofType)) {
    failures.push('manual publish evidence required: --proof-type must be one of tag-release-url or commit-sha.');
  }

  if (Number.isNaN(Date.parse(String(publishedAt).trim()))) {
    failures.push('manual publish evidence required: --published-at must be a valid ISO8601 timestamp.');
  }

  const resolvedReleaseTag = (releaseTag || preflight.releaseTag || '').trim();
  assertTruthy(resolvedReleaseTag, 'manual publish evidence required: release tag is missing; pass --release-tag or provide it in preflight.json.', failures);

  const version = String(preflight.expectedVersion ?? '').trim();
  const normalizedExternalTagVersion = normalizeTagVersion(externalTag);
  if (version && normalizedExternalTagVersion !== version) {
    failures.push(`manual publish evidence mismatch: external tag ${externalTag} does not match pinned preflight version ${version}.`);
  }
  if (version && normalizeTagVersion(resolvedReleaseTag) !== version) {
    failures.push(`manual publish evidence mismatch: release tag ${resolvedReleaseTag} does not match pinned preflight version ${version}.`);
  }

  if (iosContract) {
    if (iosContract.packageUrl && String(externalRepo).trim() !== iosContract.packageUrl) {
      failures.push(`manual publish evidence mismatch: external repo ${externalRepo || '<missing>'} must equal native-artifacts ios.packageUrl ${iosContract.packageUrl}.`);
    }
    if (iosContract.version && normalizeTagVersion(externalTag) !== iosContract.version) {
      failures.push(`manual publish evidence mismatch: external tag ${externalTag || '<missing>'} must match native-artifacts ios.version ${iosContract.version}.`);
    }
  }

  if (failures.length > 0) {
    return {
      status: FAIL,
      exitCode: 1,
      mode: 'handoff',
      releaseId,
      version,
      failures,
    };
  }

  const artifact = {
    status: PASS,
    releaseId,
    releaseTag: resolvedReleaseTag,
    version,
    externalRepo,
    externalTag,
    proofType: normalizedProofType,
    proofValue: String(proofValue).trim(),
    normalizedTagVersion: normalizedExternalTagVersion,
    operator,
    publishedAt,
    preflightPath: resolvedPreflightPath,
    generatedAt: toIsoTimestamp(),
  };

  const outputPath = await jsonWriter(resolvedHandoffPath, artifact);
  return {
    ...artifact,
    mode: 'handoff',
    handoffPath: outputPath,
    exitCode: 0,
    failures: [],
  };
};

const evaluateRemoteTag = ({ stdout, expectedTags }) => {
  const lines = String(stdout ?? '').split('\n').map((line) => line.trim()).filter(Boolean);
  const refs = lines
    .map((line) => line.split(/\s+/)[1])
    .filter(Boolean);
  const matchedTag = expectedTags.find((tag) => refs.includes(`refs/tags/${tag}`)) ?? '';

  return {
    status: matchedTag ? PASS : FAIL,
    matchedTag,
    expectedTags,
  };
};

const clip = (value = '', maxLength = 280) => {
  if (!value) {
    return '';
  }
  return value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
};

export const verifyIosPublishHandoff = async ({
  releaseId = DEFAULT_RELEASE_ID,
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  attempts = 6,
  backoffMs = 120000,
  handoffPath,
  verifyPath,
  contractPath = DEFAULT_CONTRACT_PATH,
  jsonReader = readJson,
  jsonWriter = writeJson,
  runGitLsRemote = defaultRunGitLsRemote,
  runSwiftPackageResolve = defaultRunSwiftPackageResolve,
  sleep = wait,
} = {}) => {
  const defaults = makeReleasePaths({ artifactsDir, releaseId });
  const resolvedHandoffPath = resolve(handoffPath || defaults.handoffPath);
  const resolvedVerifyPath = resolve(verifyPath || defaults.verifyPath);

  let handoff;
  try {
    handoff = await jsonReader(resolvedHandoffPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: FAIL,
      exitCode: 1,
      mode: 'verify',
      failures: [`manual publish evidence required: unable to read handoff artifact at ${resolvedHandoffPath} (${message})`],
    };
  }

  if (handoff.status !== PASS) {
    return {
      status: FAIL,
      exitCode: 1,
      mode: 'verify',
      failures: ['manual publish evidence required: handoff artifact must be PASS before verify.'],
    };
  }

  let preflight;
  try {
    preflight = await jsonReader(handoff.preflightPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      status: FAIL,
      exitCode: 1,
      mode: 'verify',
      releaseId,
      version: handoff.version,
      failures: [`manual publish evidence required: unable to read preflight artifact referenced by handoff (${message})`],
    };
  }

  const proofReference = buildProofReference({ handoff });
  const retries = [];
  const failures = [];
  validateHandoffTruthfulness({ handoff, failures });

  const preflightVersion = String(preflight.expectedVersion ?? '').trim();
  const handoffVersion = String(handoff.version ?? '').trim();
  if (!preflightVersion || preflightVersion !== handoffVersion) {
    failures.push(`manual publish evidence proof chain mismatch: handoff version ${handoffVersion || '<missing>'} must equal preflight expectedVersion ${preflightVersion || '<missing>'}.`);
  }

  const normalizedExternalTagVersion = normalizeTagVersion(handoff.externalTag ?? '');
  if (preflightVersion && normalizedExternalTagVersion !== preflightVersion) {
    failures.push(`manual publish evidence proof chain mismatch: externalTag ${handoff.externalTag || '<missing>'} must match preflight expectedVersion ${preflightVersion}.`);
  }

  let iosContract = null;
  try {
    const contract = await jsonReader(contractPath);
    iosContract = parseIosContract(contract);
  } catch (error) {
    failures.push(`manual publish evidence proof chain mismatch: unable to read iOS contract at ${resolve(contractPath)} (${error instanceof Error ? error.message : String(error)})`);
  }

  if (iosContract) {
    if (iosContract.packageUrl && String(handoff.externalRepo ?? '').trim() !== iosContract.packageUrl) {
      failures.push(`manual publish evidence proof chain mismatch: handoff externalRepo ${handoff.externalRepo || '<missing>'} must equal ios.packageUrl ${iosContract.packageUrl}.`);
    }
    if (iosContract.version && normalizeTagVersion(handoff.externalTag ?? '') !== iosContract.version) {
      failures.push(`manual publish evidence proof chain mismatch: handoff externalTag ${handoff.externalTag || '<missing>'} must match ios.version ${iosContract.version}.`);
    }
  }

  if (preflight.status !== PASS || preflight.readyForManualHandoff !== true) {
    failures.push('manual publish evidence proof chain mismatch: preflight must be PASS with readyForManualHandoff=true.');
  }

  if (failures.length > 0) {
    const artifact = {
      status: FAIL,
      releaseId: handoff.releaseId,
      version: handoff.version,
      proofReference,
      attemptsConfigured: attempts,
      attemptsUsed: 0,
      checks: {
        remoteTag: { status: FAIL },
        swiftPackageResolve: { status: FAIL },
      },
      retries,
      failures,
      generatedAt: toIsoTimestamp(),
    };
    await jsonWriter(resolvedVerifyPath, artifact);
    return {
      ...artifact,
      mode: 'verify',
      verifyPath: resolvedVerifyPath,
      exitCode: 1,
    };
  }

  const expectedTags = [...new Set([
    String(handoff.externalTag ?? '').trim(),
    `v${handoff.version}`,
    String(handoff.version ?? '').trim(),
  ].filter(Boolean))];

  let finalChecks = {
    remoteTag: { status: FAIL },
    swiftPackageResolve: { status: FAIL },
  };
  let attemptsUsed = 0;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    attemptsUsed = attempt;
    const gitResult = await runGitLsRemote({
      repo: handoff.externalRepo,
      expectedTags,
      attempt,
    });
    const remoteTagCheck = gitResult.exitCode === 0
      ? evaluateRemoteTag({ stdout: gitResult.stdout, expectedTags })
      : { status: FAIL, expectedTags, stderr: clip(gitResult.stderr) };

    const swiftResult = await runSwiftPackageResolve({
      packageUrl: preflight.expectedPackageUrl,
      packageName: preflight.expectedPackageName,
      product: preflight.expectedProduct,
      version: handoff.version,
      attempt,
    });
    const swiftCheck = swiftResult.exitCode === 0
      ? { status: PASS }
      : { status: FAIL, stderr: clip(swiftResult.stderr), stdout: clip(swiftResult.stdout) };

    finalChecks = {
      remoteTag: remoteTagCheck,
      swiftPackageResolve: swiftCheck,
    };

    retries.push({
      attempt,
      remoteTag: remoteTagCheck.status,
      swiftPackageResolve: swiftCheck.status,
    });

    if (remoteTagCheck.status === PASS && swiftCheck.status === PASS) {
      const artifact = {
        status: PASS,
        releaseId: handoff.releaseId,
        version: handoff.version,
        proofReference,
        attemptsConfigured: attempts,
        attemptsUsed,
        checks: finalChecks,
        retries,
        failures: [],
        generatedAt: toIsoTimestamp(),
      };
      const outputPath = await jsonWriter(resolvedVerifyPath, artifact);
      return {
        ...artifact,
        mode: 'verify',
        verifyPath: outputPath,
        exitCode: 0,
      };
    }

    if (attempt < attempts) {
      await sleep(backoffMs);
    }
  }

  if (finalChecks.remoteTag.status !== PASS) {
    failures.push(`remote verification failed: expected tag(s) ${expectedTags.join(', ')} not found in ${handoff.externalRepo}.`);
    if (finalChecks.remoteTag.stderr) {
      failures.push(`remote stderr: ${finalChecks.remoteTag.stderr}`);
    }
    if (finalChecks.remoteTag.stderr && /auth|permission denied|denied|forbidden|unauthorized/i.test(finalChecks.remoteTag.stderr)) {
      failures.push(`remote verification auth diagnostics: ${finalChecks.remoteTag.stderr}`);
    }
  }
  if (finalChecks.swiftPackageResolve.status !== PASS) {
    failures.push('remote verification failed: Swift package resolution did not complete for pinned iOS package/version.');
    if (finalChecks.swiftPackageResolve.stderr) {
      failures.push(`swift stderr: ${finalChecks.swiftPackageResolve.stderr}`);
    }
  }

  const artifact = {
    status: FAIL,
    releaseId: handoff.releaseId,
    version: handoff.version,
    proofReference,
    attemptsConfigured: attempts,
    attemptsUsed,
    checks: finalChecks,
    retries,
    failures,
    generatedAt: toIsoTimestamp(),
  };
  await jsonWriter(resolvedVerifyPath, artifact);

  return {
    ...artifact,
    mode: 'verify',
    verifyPath: resolvedVerifyPath,
    exitCode: 1,
  };
};

export const closeoutIosPublication = async ({
  releaseId = DEFAULT_RELEASE_ID,
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  preflightPath,
  handoffPath,
  verifyPath,
  closeoutPath,
  jsonReader = readJson,
  jsonWriter = writeJson,
} = {}) => {
  const defaults = makeReleasePaths({ artifactsDir, releaseId });
  const resolvedPreflightPath = resolve(preflightPath || defaults.preflightPath);
  const resolvedHandoffPath = resolve(handoffPath || defaults.handoffPath);
  const resolvedVerifyPath = resolve(verifyPath || defaults.verifyPath);
  const resolvedCloseoutPath = resolve(closeoutPath || defaults.closeoutPath);
  const failures = [];

  let preflight;
  let handoff;
  let verify;

  try {
    preflight = await jsonReader(resolvedPreflightPath);
  } catch {
    failures.push(`closeout denied: missing preflight artifact at ${resolvedPreflightPath}.`);
  }
  try {
    handoff = await jsonReader(resolvedHandoffPath);
  } catch {
    failures.push(`closeout denied: missing handoff artifact at ${resolvedHandoffPath}.`);
  }
  try {
    verify = await jsonReader(resolvedVerifyPath);
  } catch {
    failures.push(`closeout denied: missing verify artifact at ${resolvedVerifyPath}.`);
  }

  if (failures.length > 0) {
    return {
      status: FAIL,
      exitCode: 1,
      mode: 'closeout',
      releaseId,
      failures,
    };
  }

  if (preflight.status !== PASS) {
    failures.push('closeout denied: preflight artifact must be PASS.');
  }
  if (handoff.status !== PASS) {
    failures.push('closeout denied: handoff artifact must be PASS.');
  }
  if (verify.status !== PASS) {
    failures.push('closeout denied: verify artifact must be PASS.');
  }

  const expectedVersion = String(preflight.expectedVersion ?? '').trim();
  if (expectedVersion !== String(handoff.version ?? '').trim() || expectedVersion !== String(verify.version ?? '').trim()) {
    failures.push(`closeout denied: version chain mismatch (preflight=${expectedVersion || '<missing>'}, handoff=${handoff.version || '<missing>'}, verify=${verify.version || '<missing>'}).`);
  }

  const handoffReleaseId = String(handoff.releaseId ?? '').trim();
  const verifyReleaseId = String(verify.releaseId ?? '').trim();
  const expectedReleaseId = String(releaseId).trim();
  if (handoffReleaseId !== expectedReleaseId || verifyReleaseId !== expectedReleaseId) {
    failures.push(`closeout denied: release id mismatch (expected ${expectedReleaseId}, handoff=${handoffReleaseId || '<missing>'}, verify=${verifyReleaseId || '<missing>'}).`);
  }

  const handoffProofReference = {
    proofType: String(handoff.proofType ?? '').trim(),
    proofValue: String(handoff.proofValue ?? '').trim(),
    externalRepo: String(handoff.externalRepo ?? '').trim(),
    externalTag: String(handoff.externalTag ?? '').trim(),
  };
  const verifyProofReference = verify.proofReference ?? null;
  if (!verifyProofReference) {
    failures.push('closeout denied: verify artifact must include proofReference.');
  } else {
    const keys = ['proofType', 'proofValue', 'externalRepo', 'externalTag'];
    for (const key of keys) {
      if (String(verifyProofReference[key] ?? '').trim() !== handoffProofReference[key]) {
        failures.push(`closeout denied: proof reference mismatch for ${key}.`);
      }
    }
  }

  if (failures.length > 0) {
    return {
      status: FAIL,
      exitCode: 1,
      mode: 'closeout',
      releaseId,
      version: expectedVersion,
      failures,
    };
  }

  const artifact = {
    status: PASS,
    releaseId: expectedReleaseId,
    version: expectedVersion,
    proofReference: handoffProofReference,
    artifacts: {
      preflight: resolvedPreflightPath,
      handoff: resolvedHandoffPath,
      verify: resolvedVerifyPath,
    },
    generatedAt: toIsoTimestamp(),
  };

  const outputPath = await jsonWriter(resolvedCloseoutPath, artifact);
  return {
    ...artifact,
    mode: 'closeout',
    closeoutPath: outputPath,
    exitCode: 0,
    failures: [],
  };
};

export const executeIosPublishTransaction = async ({
  releaseId = DEFAULT_RELEASE_ID,
  artifactsDir = DEFAULT_PUBLISH_ARTIFACTS_DIR,
  releaseTag = '',
  distributionRepo = '',
  distributionRef = 'main',
  githubAppToken = '',
  contractPath = DEFAULT_CONTRACT_PATH,
  runGit = async (args, cwd) => defaultRunGit({ args, cwd }),
  runPromote = async ({ destinationRoot }) => ({
    status: PASS,
    destinationRoot,
    provenance: {},
  }),
  runSwiftPackageResolve = defaultRunSwiftPackageResolve,
  jsonReader = readJson,
  jsonWriter = writeJson,
} = {}) => {
  const normalizedReleaseId = String(releaseId ?? '').trim() || DEFAULT_RELEASE_ID;
  const normalizedReleaseTag = String(releaseTag ?? '').trim();
  const normalizedDistributionRepo = String(distributionRepo ?? '').trim();
  const normalizedDistributionRef = String(distributionRef ?? '').trim() || 'main';
  const normalizedToken = String(githubAppToken ?? '').trim();
  const failures = [];

  if (!normalizedReleaseTag) {
    failures.push('missing required --release-tag for iOS publish lane.');
  }
  if (!normalizedDistributionRepo) {
    failures.push('missing required --distribution-repo for iOS publish lane.');
  }
  if (!normalizedToken) {
    failures.push('missing required --github-app-token for iOS publish lane.');
  }

  const releaseRoot = resolve(artifactsDir, normalizedReleaseId);
  const publishPath = resolve(releaseRoot, 'publish.json');
  const summaryPath = resolve(releaseRoot, 'ios-summary.json');

  if (failures.length > 0) {
    const blockedArtifact = {
      status: FAIL,
      terminal_status: 'blocked',
      releaseId: normalizedReleaseId,
      releaseTag: normalizedReleaseTag,
      distributionRepo: normalizedDistributionRepo,
      distributionRef: normalizedDistributionRef,
      publish_attempted: false,
      commit_created: false,
      tag_created: false,
      failures,
      generatedAt: toIsoTimestamp(),
    };
    await jsonWriter(publishPath, blockedArtifact);
    await jsonWriter(summaryPath, normalizeTargetSummary({
      target: 'ios',
      selected: true,
      terminal_status: 'blocked',
      stage_statuses: { publish: FAIL, verify: 'skipped' },
      evidence: [{ label: 'publish', path: publishPath }],
      missing_evidence: [],
      notes: failures,
    }));
    return {
      ...blockedArtifact,
      mode: 'publish',
      publishPath,
      summaryPath,
      exitCode: 1,
    };
  }

  const tagProbe = await runGit(['ls-remote', '--tags', normalizedDistributionRepo, `refs/tags/${normalizedReleaseTag}`]);
  const remoteTagExists = tagProbe.exitCode === 0 && tagProbe.stdout.includes(`refs/tags/${normalizedReleaseTag}`);

  let iosContract = { packageUrl: '', packageName: '', product: '', version: '' };
  try {
    const contract = await jsonReader(contractPath);
    iosContract = parseIosContract(contract);
  } catch (error) {
    failures.push(`unable to read iOS contract at ${resolve(contractPath)} (${error instanceof Error ? error.message : String(error)})`);
  }

  const normalizedContractVersion = normalizeTagVersion(iosContract.version ?? '');
  const normalizedTagVersion = normalizeTagVersion(normalizedReleaseTag);
  if (normalizedContractVersion && normalizedTagVersion !== normalizedContractVersion) {
    failures.push(`release tag drift detected: ${normalizedReleaseTag || '<missing>'} must match iOS contract version v${normalizedContractVersion}.`);
  }

  if (remoteTagExists) {
    const alreadyPublishedArtifact = {
      status: PASS,
      terminal_status: 'already_published',
      releaseId: normalizedReleaseId,
      releaseTag: normalizedReleaseTag,
      distributionRepo: normalizedDistributionRepo,
      distributionRef: normalizedDistributionRef,
      publish_attempted: false,
      commit_created: false,
      tag_created: false,
      verify: {
        remote_tag: PASS,
        swift_package_resolve: PASS,
      },
      failures,
      generatedAt: toIsoTimestamp(),
    };
    await jsonWriter(publishPath, alreadyPublishedArtifact);
    await jsonWriter(summaryPath, normalizeTargetSummary({
      target: 'ios',
      selected: true,
      terminal_status: 'already_published',
      stage_statuses: { publish: PASS, verify: PASS, mode: 'publish' },
      evidence: [{ label: 'publish', path: publishPath }],
      missing_evidence: [],
      notes: [],
    }));
    return {
      ...alreadyPublishedArtifact,
      mode: 'publish',
      publishPath,
      summaryPath,
      exitCode: 0,
    };
  }

  const scratchRoot = await mkdtemp(resolve(tmpdir(), 'legato-ios-publish-'));
  const checkoutRoot = resolve(scratchRoot, 'distribution-repo');
  const authenticatedRepo = normalizedDistributionRepo.replace('https://', `https://x-access-token:${normalizedToken}@`);

  const cloneResult = await runGit(['clone', '--depth', '1', '--branch', normalizedDistributionRef, authenticatedRepo, checkoutRoot]);
  if (cloneResult.exitCode !== 0) {
    failures.push(`git clone failed for distribution repo: ${clip(cloneResult.stderr || cloneResult.stdout)}`);
  }

  let promoteResult = { status: FAIL, provenance: {} };
  if (failures.length === 0) {
    promoteResult = await runPromote({
      destinationRoot: checkoutRoot,
      releaseTag: normalizedReleaseTag,
    });
    if (promoteResult.status !== PASS) {
      failures.push(...(promoteResult.failures ?? ['iOS distribution promotion failed.']));
    }
  }

  let commitCreated = false;
  let tagCreated = false;
  if (failures.length === 0) {
    const statusResult = await runGit(['status', '--porcelain'], checkoutRoot);
    const hasDiff = statusResult.exitCode === 0 && String(statusResult.stdout ?? '').trim().length > 0;
    if (hasDiff) {
      const addResult = await runGit(['add', '.'], checkoutRoot);
      if (addResult.exitCode !== 0) {
        failures.push(`git add failed: ${clip(addResult.stderr || addResult.stdout)}`);
      }
      const commitResult = failures.length === 0
        ? await runGit(['commit', '-m', `release: ios distribution ${normalizedReleaseTag}`], checkoutRoot)
        : { exitCode: 1, stderr: 'skip commit' };
      if (commitResult.exitCode !== 0) {
        failures.push(`git commit failed: ${clip(commitResult.stderr || commitResult.stdout)}`);
      } else {
        commitCreated = true;
      }
    }

    const tagResult = failures.length === 0
      ? await runGit(['tag', normalizedReleaseTag], checkoutRoot)
      : { exitCode: 1, stderr: 'skip tag' };
    if (tagResult.exitCode !== 0) {
      failures.push(`git tag failed: ${clip(tagResult.stderr || tagResult.stdout)}`);
    } else {
      tagCreated = true;
    }

    const pushBranchResult = failures.length === 0
      ? await runGit(['push', 'origin', normalizedDistributionRef], checkoutRoot)
      : { exitCode: 1, stderr: 'skip push branch' };
    if (pushBranchResult.exitCode !== 0) {
      failures.push(`git push branch failed: ${clip(pushBranchResult.stderr || pushBranchResult.stdout)}`);
    }
    const pushTagResult = failures.length === 0
      ? await runGit(['push', 'origin', normalizedReleaseTag], checkoutRoot)
      : { exitCode: 1, stderr: 'skip push tag' };
    if (pushTagResult.exitCode !== 0) {
      failures.push(`git push tag failed: ${clip(pushTagResult.stderr || pushTagResult.stdout)}`);
    }
  }

  const verifyTagResult = await runGit(['ls-remote', '--tags', normalizedDistributionRepo, `refs/tags/${normalizedReleaseTag}`]);
  const verifyTagPass = verifyTagResult.exitCode === 0 && verifyTagResult.stdout.includes(`refs/tags/${normalizedReleaseTag}`);
  if (!verifyTagPass) {
    failures.push(`remote verification failed: expected tag ${normalizedReleaseTag} not found in ${normalizedDistributionRepo}.`);
  }

  const swiftResolveResult = await runSwiftPackageResolve({
    packageUrl: iosContract.packageUrl,
    packageName: iosContract.packageName,
    product: iosContract.product,
    version: normalizeTagVersion(normalizedReleaseTag),
  });
  const swiftResolvePass = swiftResolveResult.exitCode === 0;
  if (!swiftResolvePass) {
    failures.push(`swift package resolve failed: ${clip(swiftResolveResult.stderr || swiftResolveResult.stdout)}`);
  }

  await rm(scratchRoot, { recursive: true, force: true });

  const pass = failures.length === 0;
  const terminalStatus = pass ? 'published' : 'failed';
  const artifact = {
    status: pass ? PASS : FAIL,
    terminal_status: terminalStatus,
    releaseId: normalizedReleaseId,
    releaseTag: normalizedReleaseTag,
    distributionRepo: normalizedDistributionRepo,
    distributionRef: normalizedDistributionRef,
    publish_attempted: true,
    commit_created: commitCreated,
    tag_created: tagCreated,
    provenance: promoteResult.provenance ?? {},
    verify: {
      remote_tag: verifyTagPass ? PASS : FAIL,
      swift_package_resolve: swiftResolvePass ? PASS : FAIL,
    },
    failures,
    generatedAt: toIsoTimestamp(),
  };

  await jsonWriter(publishPath, artifact);
  await jsonWriter(summaryPath, normalizeTargetSummary({
    target: 'ios',
    selected: true,
    terminal_status: terminalStatus,
    stage_statuses: {
      publish: artifact.status,
      verify: artifact.verify.remote_tag === PASS && artifact.verify.swift_package_resolve === PASS ? PASS : FAIL,
      mode: 'publish',
    },
    evidence: [{ label: 'publish', path: publishPath }],
    missing_evidence: [],
    notes: failures,
  }));

  return {
    ...artifact,
    mode: 'publish',
    publishPath,
    summaryPath,
    exitCode: pass ? 0 : 1,
  };
};

export const buildIosControlPlaneSummary = ({
  releaseId,
  mode,
  selected,
  preflight,
  handoff,
  verify,
  closeout,
} = {}) => {
  if (!selected) {
    return normalizeTargetSummary({
      target: 'ios',
      selected: false,
      terminal_status: 'not_selected',
      stage_statuses: {},
      evidence: [],
      missing_evidence: [],
      notes: [],
    });
  }

  const missingEvidence = [];
  if (!preflight) missingEvidence.push('preflight.json');
  if (!handoff) missingEvidence.push('handoff.json');
  if (!verify) missingEvidence.push('verify.json');
  if (!closeout) missingEvidence.push('closeout.json');

  const terminalStatus = closeout?.status === PASS
    ? 'validated'
    : handoff?.status === PASS
      ? 'handoff_pending'
      : 'incomplete';

  const notes = [];
  if (missingEvidence.includes('handoff.json')) {
    notes.push('manual handoff evidence missing; publication remains non-published.');
  }

  const releaseRoot = resolve(DEFAULT_ARTIFACTS_DIR, String(releaseId ?? DEFAULT_RELEASE_ID).trim() || DEFAULT_RELEASE_ID);
  return normalizeTargetSummary({
    target: 'ios',
    selected: true,
    terminal_status: missingEvidence.length > 0 ? 'incomplete' : terminalStatus,
    stage_statuses: {
      preflight: preflight?.status ?? 'missing',
      handoff: handoff?.status ?? 'missing',
      verify: verify?.status ?? 'missing',
      closeout: closeout?.status ?? 'missing',
      mode: mode ?? 'full-manual-lane',
    },
    evidence: [
      { label: 'preflight', path: resolve(releaseRoot, 'preflight.json') },
      { label: 'handoff', path: resolve(releaseRoot, 'handoff.json') },
      { label: 'verify', path: resolve(releaseRoot, 'verify.json') },
      { label: 'closeout', path: resolve(releaseRoot, 'closeout.json') },
    ],
    missing_evidence: missingEvidence,
    notes,
  });
};

export const runIosExecutionCommand = async (rawOptions, dependencies = {}) => {
  const options = { ...rawOptions };
  const command = String(options.command ?? '').trim();

  if (!['publish', 'handoff', 'verify', 'closeout'].includes(command)) {
    return {
      status: FAIL,
      exitCode: CONFIG_ERROR_EXIT_CODE,
      mode: command || 'unknown',
      failures: ['Usage: node scripts/release-ios-execution.mjs <publish|handoff|verify|closeout> [--release-id <id>] [--artifacts-dir <dir>] [--release-tag <tag>]'],
    };
  }

  if (command === 'publish') {
    return executeIosPublishTransaction({ ...options, ...dependencies });
  }

  if (command === 'handoff') {
    return recordIosPublishHandoff({ ...options, ...dependencies });
  }
  if (command === 'verify') {
    return verifyIosPublishHandoff({ ...options, ...dependencies });
  }
  return closeoutIosPublication({ ...options, ...dependencies });
};

export const formatIosExecutionSummary = (result) => {
  const lines = [
    `Mode: ${result.mode ?? 'ios-execution'}`,
    `Overall: ${result.status}`,
  ];

  if (result.releaseId) {
    lines.push(`Release id: ${result.releaseId}`);
  }
  if (result.version) {
    lines.push(`Version: ${result.version}`);
  }
  if (result.handoffPath) {
    lines.push(`handoff.json: ${result.handoffPath}`);
  }
  if (result.publishPath) {
    lines.push(`publish.json: ${result.publishPath}`);
  }
  if (result.verifyPath) {
    lines.push(`verify.json: ${result.verifyPath}`);
  }
  if (result.closeoutPath) {
    lines.push(`closeout.json: ${result.closeoutPath}`);
  }

  if (Array.isArray(result.retries) && result.retries.length > 0) {
    lines.push('Retry attempts:');
    for (const retry of result.retries) {
      lines.push(`- #${retry.attempt}: remoteTag=${retry.remoteTag}, swiftPackageResolve=${retry.swiftPackageResolve}`);
    }
  }

  if (Array.isArray(result.failures) && result.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    process.stdout.write(`Mode: ios-execution\nOverall: FAIL\nFailures:\n- ${error.message}\n`);
    process.exit(CONFIG_ERROR_EXIT_CODE);
  }

  try {
    const result = await runIosExecutionCommand(options);
    process.stdout.write(`${formatIosExecutionSummary(result)}\n`);
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Mode: ios-execution\nOverall: FAIL\nFailures:\n- Unexpected failure: ${message}\n`);
    process.exit(1);
  }
}
