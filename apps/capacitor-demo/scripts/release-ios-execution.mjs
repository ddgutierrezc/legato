import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';

const PASS = 'PASS';
const FAIL = 'FAIL';
const CONFIG_ERROR_EXIT_CODE = 2;

const DEFAULT_RELEASE_ID = 'manual';
const DEFAULT_ARTIFACTS_DIR = 'artifacts/ios-publication-v1';

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

const makeScratchPackageSwift = ({ packageUrl, packageName, product, version }) => `// swift-tools-version: 5.9
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
        .package(url: "${packageUrl}", exact: "${version}")
    ],
    targets: [
        .target(
            name: "LegatoReleaseVerifyScratch",
            dependencies: [
                .product(name: "${product}", package: "${packageName}")
            ]
        )
    ]
)
`;

const defaultRunSwiftPackageResolve = async ({ packageUrl, packageName, product, version }) => {
  const scratchDir = await mkdtemp(resolve(tmpdir(), 'legato-ios-release-verify-'));
  const packageSwiftPath = resolve(scratchDir, 'Package.swift');
  const packageSwift = makeScratchPackageSwift({ packageUrl, packageName, product, version });
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
    operator: '',
    publishedAt: '',
    attempts: 6,
    backoffMs: 120000,
    preflightPath: '',
    handoffPath: '',
    verifyPath: '',
    closeoutPath: '',
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
    }
  }

  return options;
};

const assertTruthy = (value, message, failures) => {
  if (!value || String(value).trim() === '') {
    failures.push(message);
  }
};

export const recordIosPublishHandoff = async ({
  releaseId = DEFAULT_RELEASE_ID,
  artifactsDir = DEFAULT_ARTIFACTS_DIR,
  releaseTag = '',
  externalRepo = '',
  externalTag = '',
  operator = '',
  publishedAt = '',
  preflightPath,
  handoffPath,
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

  assertTruthy(externalRepo, 'manual publish evidence required: --external-repo <url> is mandatory.', failures);
  assertTruthy(externalTag, 'manual publish evidence required: --external-tag <tag> is mandatory.', failures);
  assertTruthy(operator, 'manual publish evidence required: --operator <name> is mandatory.', failures);
  assertTruthy(publishedAt, 'manual publish evidence required: --published-at <ISO8601> is mandatory.', failures);

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

  const retries = [];
  const failures = [];
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

export const runIosExecutionCommand = async (rawOptions, dependencies = {}) => {
  const options = { ...rawOptions };
  const command = String(options.command ?? '').trim();

  if (!['handoff', 'verify', 'closeout'].includes(command)) {
    return {
      status: FAIL,
      exitCode: CONFIG_ERROR_EXIT_CODE,
      mode: command || 'unknown',
      failures: ['Usage: node scripts/release-ios-execution.mjs <handoff|verify|closeout> [--release-id <id>] [--artifacts-dir <dir>] [--release-tag <tag>]'],
    };
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
