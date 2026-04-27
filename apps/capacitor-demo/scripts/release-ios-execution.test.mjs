import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nativeArtifacts from '../../../packages/capacitor/native-artifacts.json' with { type: 'json' };

import {
  buildVerifyScratchPackageSwift,
  buildIosControlPlaneSummary,
  executeIosPublishTransaction,
  recordIosPublishHandoff,
  verifyIosPublishHandoff,
  closeoutIosPublication,
} from './release-ios-execution.mjs';

const IOS_PACKAGE_URL = String(nativeArtifacts?.ios?.packageUrl ?? '').trim();
const IOS_PACKAGE_NAME = String(nativeArtifacts?.ios?.packageName ?? '').trim();
const IOS_PRODUCT = String(nativeArtifacts?.ios?.product ?? '').trim();
const IOS_VERSION = String(nativeArtifacts?.ios?.version ?? '').trim();
const IOS_TAG = `v${IOS_VERSION}`;
const IOS_RELEASE_URL = `${IOS_PACKAGE_URL.replace(/\.git$/i, '')}/releases/tag/${IOS_TAG}`;
const IOS_MISMATCH_VERSION = IOS_VERSION === '0.1.1' ? '0.1.9' : '0.1.1';
const IOS_MISMATCH_TAG = `v${IOS_MISMATCH_VERSION}`;

const makePreflight = (overrides = {}) => ({
  status: 'PASS',
  releaseTag: IOS_TAG,
  expectedVersion: IOS_VERSION,
  expectedPackageUrl: IOS_PACKAGE_URL,
  expectedPackageName: IOS_PACKAGE_NAME,
  expectedProduct: IOS_PRODUCT,
  readyForManualHandoff: true,
  generatedAt: '2026-04-24T00:00:00.000Z',
  failures: [],
  ...overrides,
});

const makeHandoff = (preflightPath, overrides = {}) => ({
  status: 'PASS',
  releaseId: 'rel-001',
  releaseTag: IOS_TAG,
  version: IOS_VERSION,
  externalRepo: IOS_PACKAGE_URL,
  externalTag: IOS_TAG,
  proofType: 'tag-release-url',
  proofValue: IOS_RELEASE_URL,
  normalizedTagVersion: IOS_VERSION,
  operator: 'ios-operator',
  publishedAt: '2026-04-24T00:10:00.000Z',
  preflightPath,
  generatedAt: '2026-04-24T00:11:00.000Z',
  ...overrides,
});

const makeVerify = (overrides = {}) => ({
  status: 'PASS',
  releaseId: 'rel-001',
  version: IOS_VERSION,
  attemptsConfigured: 3,
  attemptsUsed: 2,
  checks: {
    remoteTag: { status: 'PASS', matchedTag: IOS_TAG },
    swiftPackageResolve: { status: 'PASS' },
  },
  proofReference: {
    proofType: 'tag-release-url',
    proofValue: IOS_RELEASE_URL,
    externalRepo: IOS_PACKAGE_URL,
    externalTag: IOS_TAG,
  },
  retries: [
    { attempt: 1, remoteTag: 'FAIL', swiftPackageResolve: 'FAIL' },
    { attempt: 2, remoteTag: 'PASS', swiftPackageResolve: 'PASS' },
  ],
  failures: [],
  generatedAt: '2026-04-24T00:15:00.000Z',
  ...overrides,
});

test('verify scratch Package.swift pins remote URL and uses derived Swift package identity', () => {
  const packageSwift = buildVerifyScratchPackageSwift({
    packageUrl: IOS_PACKAGE_URL,
    packageName: IOS_PACKAGE_NAME,
    product: IOS_PRODUCT,
    version: IOS_VERSION,
  });

  assert.match(packageSwift, new RegExp(`\\.package\\(url:\\s*"${IOS_PACKAGE_URL.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",\\s*\\.exact\\("${IOS_VERSION.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"\\)\\)`, 'i'));
  assert.match(packageSwift, new RegExp(`\\.product\\(name:\\s*"${IOS_PRODUCT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}",\\s*package:\\s*"legato-ios-core"\\)`, 'i'));
});

test('handoff fails when preflight artifact is missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-handoff-missing-'));
  const result = await recordIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    externalRepo: IOS_PACKAGE_URL,
    externalTag: IOS_TAG,
    operator: 'ios-operator',
    publishedAt: '2026-04-24T00:10:00.000Z',
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /manual publish evidence required/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('handoff fails when mandatory evidence fields are missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-handoff-required-'));
  const releaseRoot = join(tempDir, 'rel-001');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(join(releaseRoot, 'preflight.json'), `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');

  const result = await recordIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /--external-repo/i);
  assert.match(result.failures.join('\n'), /--proof-type/i);
  assert.match(result.failures.join('\n'), /--proof-value/i);
  assert.match(result.failures.join('\n'), /--operator/i);
  assert.match(result.failures.join('\n'), /--published-at/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('handoff fails when external tag mismatches preflight pinned version', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-handoff-version-'));
  const releaseRoot = join(tempDir, 'rel-001');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(join(releaseRoot, 'preflight.json'), `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');

  const result = await recordIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    externalRepo: IOS_PACKAGE_URL,
    externalTag: IOS_MISMATCH_TAG,
    operator: 'ios-operator',
    publishedAt: '2026-04-24T00:10:00.000Z',
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /does not match pinned preflight version/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('handoff fails when external repo diverges from native-artifacts iOS packageUrl', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-handoff-contract-repo-'));
  const releaseRoot = join(tempDir, 'rel-001');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(join(releaseRoot, 'preflight.json'), `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');

  const result = await recordIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    externalRepo: 'https://github.com/acme/legato-ios-core.git',
    externalTag: IOS_TAG,
    proofType: 'tag-release-url',
    proofValue: `https://github.com/acme/legato-ios-core/releases/tag/${IOS_TAG}`,
    operator: 'ios-operator',
    publishedAt: '2026-04-24T00:10:00.000Z',
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /native-artifacts ios\.packageUrl/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('handoff writes handoff.json when manual evidence is complete', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-handoff-pass-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');

  const result = await recordIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    externalRepo: IOS_PACKAGE_URL,
    externalTag: IOS_TAG,
    proofType: 'tag-release-url',
    proofValue: IOS_RELEASE_URL,
    operator: 'ios-operator',
    publishedAt: '2026-04-24T00:10:00.000Z',
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.version, IOS_VERSION);
  assert.equal(result.releaseId, 'rel-001');
  assert.equal(result.normalizedTagVersion, IOS_VERSION);
  const raw = await readFile(result.handoffPath, 'utf8');
  const artifact = JSON.parse(raw);
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.preflightPath, preflightPath);
  assert.equal(artifact.proofType, 'tag-release-url');
  assert.equal(artifact.proofValue, IOS_RELEASE_URL);

  await rm(tempDir, { recursive: true, force: true });
});

test('handoff rejects placeholder proof values and accepts commit-sha proof', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-handoff-proof-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');

  const placeholder = await recordIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    externalRepo: IOS_PACKAGE_URL,
    externalTag: IOS_TAG,
    proofType: 'tag-release-url',
    proofValue: 'TBD',
    operator: 'ios-operator',
    publishedAt: '2026-04-24T00:10:00.000Z',
  });

  assert.equal(placeholder.status, 'FAIL');
  assert.match(placeholder.failures.join('\n'), /placeholder/i);

  const commitSha = await recordIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    externalRepo: IOS_PACKAGE_URL,
    externalTag: IOS_TAG,
    proofType: 'commit-sha',
    proofValue: '1f2e3d4c5b6a78900112233445566778899aabbc',
    operator: 'ios-operator',
    publishedAt: '2026-04-24T00:10:00.000Z',
  });

  assert.equal(commitSha.status, 'PASS');
  assert.equal(commitSha.proofType, 'commit-sha');
  assert.equal(commitSha.proofValue, '1f2e3d4c5b6a78900112233445566778899aabbc');

  await rm(tempDir, { recursive: true, force: true });
});

test('verify fails when manual handoff evidence is missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-verify-missing-handoff-'));
  const releaseRoot = join(tempDir, 'rel-001');
  await mkdir(releaseRoot, { recursive: true });

  const verifyResult = await verifyIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    attempts: 1,
    backoffMs: 1,
    runGitLsRemote: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    runSwiftPackageResolve: async () => ({ exitCode: 0, stdout: '', stderr: '' }),
    sleep: async () => {},
  });

  assert.equal(verifyResult.status, 'FAIL');
  assert.match(verifyResult.failures.join('\n'), /manual publish evidence required: unable to read handoff artifact/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('verify succeeds after propagation delay with bounded retries', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-verify-retry-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  const handoffPath = join(releaseRoot, 'handoff.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');
  await writeFile(handoffPath, `${JSON.stringify(makeHandoff(preflightPath), null, 2)}\n`, 'utf8');

  let gitCalls = 0;
  let swiftCalls = 0;
  const verifyResult = await verifyIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    attempts: 3,
    backoffMs: 1,
    runGitLsRemote: async () => {
      gitCalls += 1;
      if (gitCalls === 1) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: `abc refs/tags/${IOS_TAG}\n`, stderr: '' };
    },
    runSwiftPackageResolve: async () => {
      swiftCalls += 1;
      if (swiftCalls === 1) {
        return { exitCode: 1, stdout: '', stderr: 'still propagating' };
      }
      return { exitCode: 0, stdout: 'resolved', stderr: '' };
    },
    sleep: async () => {},
  });

  assert.equal(verifyResult.status, 'PASS');
  assert.equal(verifyResult.attemptsUsed, 2);
  assert.equal(verifyResult.retries.length, 2);
  assert.equal(verifyResult.checks.remoteTag.status, 'PASS');
  assert.equal(verifyResult.checks.swiftPackageResolve.status, 'PASS');
  assert.equal(verifyResult.proofReference.proofType, 'tag-release-url');
  assert.equal(verifyResult.proofReference.externalTag, IOS_TAG);
  const raw = await readFile(join(releaseRoot, 'verify.json'), 'utf8');
  const artifact = JSON.parse(raw);
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.attemptsConfigured, 3);

  await rm(tempDir, { recursive: true, force: true });
});

test('verify fails with deterministic diagnostics when retries exhaust', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-verify-fail-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  const handoffPath = join(releaseRoot, 'handoff.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');
  await writeFile(handoffPath, `${JSON.stringify(makeHandoff(preflightPath), null, 2)}\n`, 'utf8');

  const verifyResult = await verifyIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    attempts: 2,
    backoffMs: 1,
    runGitLsRemote: async () => ({ exitCode: 0, stdout: 'abc refs/tags/v9.9.9\n', stderr: '' }),
    runSwiftPackageResolve: async () => ({ exitCode: 1, stdout: '', stderr: `no versions match requirement ${IOS_VERSION}` }),
    sleep: async () => {},
  });

  assert.equal(verifyResult.status, 'FAIL');
  assert.equal(verifyResult.attemptsUsed, 2);
  assert.match(verifyResult.failures.join('\n'), /expected tag\(s\)/i);
  assert.match(verifyResult.failures.join('\n'), /Swift package resolution/i);
  assert.match(verifyResult.failures.join('\n'), /swift stderr:/i);
  const raw = await readFile(join(releaseRoot, 'verify.json'), 'utf8');
  const artifact = JSON.parse(raw);
  assert.equal(artifact.status, 'FAIL');

  await rm(tempDir, { recursive: true, force: true });
});

test('verify fails when immutable proof chain does not match preflight/handoff contract', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-verify-proof-chain-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  const handoffPath = join(releaseRoot, 'handoff.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight({ expectedVersion: IOS_VERSION }), null, 2)}\n`, 'utf8');
  await writeFile(handoffPath, `${JSON.stringify(makeHandoff(preflightPath, { version: IOS_MISMATCH_VERSION, externalTag: IOS_MISMATCH_TAG }), null, 2)}\n`, 'utf8');

  const verifyResult = await verifyIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    attempts: 1,
    backoffMs: 1,
    runGitLsRemote: async () => ({ exitCode: 0, stdout: `abc refs/tags/${IOS_TAG}\n`, stderr: '' }),
    runSwiftPackageResolve: async () => ({ exitCode: 0, stdout: 'resolved', stderr: '' }),
    sleep: async () => {},
  });

  assert.equal(verifyResult.status, 'FAIL');
  assert.match(verifyResult.failures.join('\n'), /proof chain/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('verify fails when handoff external tag diverges from native-artifacts contract version', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-verify-contract-tag-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  const handoffPath = join(releaseRoot, 'handoff.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');
  await writeFile(handoffPath, `${JSON.stringify(makeHandoff(preflightPath, { externalTag: 'v9.9.9' }), null, 2)}\n`, 'utf8');

  const verifyResult = await verifyIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    attempts: 1,
    backoffMs: 1,
    runGitLsRemote: async () => ({ exitCode: 0, stdout: 'abc refs/tags/v9.9.9\n', stderr: '' }),
    runSwiftPackageResolve: async () => ({ exitCode: 0, stdout: 'resolved', stderr: '' }),
    sleep: async () => {},
  });

  assert.equal(verifyResult.status, 'FAIL');
  assert.match(verifyResult.failures.join('\n'), /must match ios\.version/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('verify surfaces auth diagnostics when remote authority access fails', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-verify-auth-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  const handoffPath = join(releaseRoot, 'handoff.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');
  await writeFile(handoffPath, `${JSON.stringify(makeHandoff(preflightPath), null, 2)}\n`, 'utf8');

  const verifyResult = await verifyIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    attempts: 1,
    backoffMs: 1,
    runGitLsRemote: async () => ({ exitCode: 128, stdout: '', stderr: 'fatal: Authentication failed' }),
    runSwiftPackageResolve: async () => ({ exitCode: 1, stdout: '', stderr: 'failed to clone repository' }),
    sleep: async () => {},
  });

  assert.equal(verifyResult.status, 'FAIL');
  assert.match(verifyResult.failures.join('\n'), /auth/i);
  assert.match(verifyResult.failures.join('\n'), /swift stderr:/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('closeout rejects incomplete evidence chain', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-closeout-missing-'));
  const releaseRoot = join(tempDir, 'rel-001');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(join(releaseRoot, 'preflight.json'), `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');

  const result = await closeoutIosPublication({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /missing handoff artifact/i);
  assert.match(result.failures.join('\n'), /missing verify artifact/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('closeout writes linked closeout artifact when chain is complete and consistent', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-closeout-pass-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  const handoffPath = join(releaseRoot, 'handoff.json');
  const verifyPath = join(releaseRoot, 'verify.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');
  await writeFile(handoffPath, `${JSON.stringify(makeHandoff(preflightPath), null, 2)}\n`, 'utf8');
  await writeFile(verifyPath, `${JSON.stringify(makeVerify(), null, 2)}\n`, 'utf8');

  const result = await closeoutIosPublication({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.version, IOS_VERSION);
  const raw = await readFile(result.closeoutPath, 'utf8');
  const artifact = JSON.parse(raw);
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.artifacts.preflight, preflightPath);
  assert.equal(artifact.artifacts.handoff, handoffPath);
  assert.equal(artifact.artifacts.verify, verifyPath);

  await rm(tempDir, { recursive: true, force: true });
});

test('closeout rejects proof reference mismatch between handoff and verify artifacts', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-closeout-proof-'));
  const releaseRoot = join(tempDir, 'rel-001');
  const preflightPath = join(releaseRoot, 'preflight.json');
  const handoffPath = join(releaseRoot, 'handoff.json');
  const verifyPath = join(releaseRoot, 'verify.json');
  await mkdir(releaseRoot, { recursive: true });
  await writeFile(preflightPath, `${JSON.stringify(makePreflight(), null, 2)}\n`, 'utf8');
  await writeFile(handoffPath, `${JSON.stringify(makeHandoff(preflightPath), null, 2)}\n`, 'utf8');
  await writeFile(verifyPath, `${JSON.stringify(makeVerify({
    proofReference: {
      proofType: 'commit-sha',
      proofValue: 'deadbeef',
      externalRepo: IOS_PACKAGE_URL,
      externalTag: IOS_TAG,
    },
  }), null, 2)}\n`, 'utf8');

  const result = await closeoutIosPublication({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /proof reference mismatch/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('iOS control-plane summary reports incomplete/non-published when handoff evidence is missing', () => {
  const summary = buildIosControlPlaneSummary({
    releaseId: 'R-2026.04.24.1',
    mode: 'full-manual-lane',
    selected: true,
    preflight: { status: 'PASS' },
    handoff: null,
    verify: null,
    closeout: null,
  });

  assert.equal(summary.target, 'ios');
  assert.equal(summary.selected, true);
  assert.equal(summary.terminal_status, 'incomplete');
  assert.ok(summary.missing_evidence.includes('handoff.json'));
  assert.match(summary.notes.join('\n'), /manual handoff evidence missing/i);
});

test('iOS publish transaction returns already_published when immutable tag already exists', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-publish-existing-tag-'));

  const result = await executeIosPublishTransaction({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    releaseTag: IOS_TAG,
    distributionRepo: IOS_PACKAGE_URL,
    distributionRef: 'main',
    githubAppToken: 'token',
    runGit: async (args) => {
      if (args[0] === 'ls-remote') {
        return { exitCode: 0, stdout: `abc refs/tags/${IOS_TAG}\n`, stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    runPromote: async () => ({ status: 'PASS' }),
    runSwiftPackageResolve: async () => ({ exitCode: 0, stdout: 'resolved', stderr: '' }),
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.terminal_status, 'already_published');
  assert.equal(result.publish_attempted, false);
  assert.equal(result.commit_created, false);

  await rm(tempDir, { recursive: true, force: true });
});

test('iOS publish transaction writes published evidence when tag does not exist', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-publish-ok-'));

  let lsRemoteCalls = 0;
  const result = await executeIosPublishTransaction({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    releaseTag: IOS_TAG,
    distributionRepo: IOS_PACKAGE_URL,
    distributionRef: 'main',
    githubAppToken: 'token',
    runGit: async (args) => {
      if (args[0] === 'ls-remote') {
        lsRemoteCalls += 1;
        if (lsRemoteCalls === 1) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 0, stdout: `abc refs/tags/${IOS_TAG}\n`, stderr: '' };
      }
      if (args[0] === 'status') {
        return { exitCode: 0, stdout: 'M Package.swift', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    runPromote: async () => ({ status: 'PASS', provenance: { sourceCommit: 'abc1234' } }),
    runSwiftPackageResolve: async () => ({ exitCode: 0, stdout: 'resolved', stderr: '' }),
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.terminal_status, 'published');
  assert.equal(result.publish_attempted, true);
  assert.equal(result.tag_created, true);

  await rm(tempDir, { recursive: true, force: true });
});

test('iOS publish transaction maps missing authority input to blocked', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-publish-blocked-'));

  const result = await executeIosPublishTransaction({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    releaseTag: IOS_TAG,
    distributionRepo: IOS_PACKAGE_URL,
    distributionRef: 'main',
    githubAppToken: '',
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.terminal_status, 'blocked');
  assert.equal(result.publish_attempted, false);

  await rm(tempDir, { recursive: true, force: true });
});

test('iOS publish transaction maps verification failure to failed', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-publish-failed-'));

  let lsRemoteCalls = 0;
  const result = await executeIosPublishTransaction({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    releaseTag: IOS_TAG,
    distributionRepo: IOS_PACKAGE_URL,
    distributionRef: 'main',
    githubAppToken: 'token',
    runGit: async (args) => {
      if (args[0] === 'ls-remote') {
        lsRemoteCalls += 1;
        if (lsRemoteCalls === 1) {
          return { exitCode: 0, stdout: '', stderr: '' };
        }
        return { exitCode: 0, stdout: `abc refs/tags/${IOS_TAG}\n`, stderr: '' };
      }
      if (args[0] === 'status') {
        return { exitCode: 0, stdout: 'M Package.swift', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    runPromote: async () => ({ status: 'PASS', provenance: { sourceCommit: 'abc1234' } }),
    runSwiftPackageResolve: async () => ({ exitCode: 1, stdout: '', stderr: 'no matching package' }),
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.terminal_status, 'failed');
  assert.match(result.failures.join('\n'), /swift package resolve failed/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('iOS publish transaction fails closed when release tag drifts from iOS contract version', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-publish-contract-drift-'));
  const result = await executeIosPublishTransaction({
    releaseId: 'rel-contract-drift',
    artifactsDir: tempDir,
    releaseTag: IOS_MISMATCH_TAG,
    distributionRepo: IOS_PACKAGE_URL,
    distributionRef: 'main',
    githubAppToken: 'ghs_example_token',
    runGit: async (args) => {
      if (args[0] === 'ls-remote' && args[1] === '--tags') {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return { exitCode: 0, stdout: '', stderr: '' };
    },
    runPromote: async () => ({ status: 'PASS', destinationRoot: '/tmp', provenance: {} }),
    runSwiftPackageResolve: async () => ({ exitCode: 0, stdout: 'resolved', stderr: '' }),
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.terminal_status, 'failed');
  assert.match(result.failures.join('\n'), /must match iOS contract version/i);

  await rm(tempDir, { recursive: true, force: true });
});
