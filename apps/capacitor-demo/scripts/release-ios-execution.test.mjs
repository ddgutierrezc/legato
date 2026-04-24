import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  buildVerifyScratchPackageSwift,
  recordIosPublishHandoff,
  verifyIosPublishHandoff,
  closeoutIosPublication,
} from './release-ios-execution.mjs';

const makePreflight = (overrides = {}) => ({
  status: 'PASS',
  releaseTag: 'v0.1.1',
  expectedVersion: '0.1.1',
  expectedPackageUrl: 'https://github.com/ddgutierrezc/legato-ios-core.git',
  expectedPackageName: 'LegatoCore',
  expectedProduct: 'LegatoCore',
  readyForManualHandoff: true,
  generatedAt: '2026-04-24T00:00:00.000Z',
  failures: [],
  ...overrides,
});

const makeHandoff = (preflightPath, overrides = {}) => ({
  status: 'PASS',
  releaseId: 'rel-001',
  releaseTag: 'v0.1.1',
  version: '0.1.1',
  externalRepo: 'https://github.com/ddgutierrezc/legato-ios-core.git',
  externalTag: 'v0.1.1',
  proofType: 'tag-release-url',
  proofValue: 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1',
  normalizedTagVersion: '0.1.1',
  operator: 'ios-operator',
  publishedAt: '2026-04-24T00:10:00.000Z',
  preflightPath,
  generatedAt: '2026-04-24T00:11:00.000Z',
  ...overrides,
});

const makeVerify = (overrides = {}) => ({
  status: 'PASS',
  releaseId: 'rel-001',
  version: '0.1.1',
  attemptsConfigured: 3,
  attemptsUsed: 2,
  checks: {
    remoteTag: { status: 'PASS', matchedTag: 'v0.1.1' },
    swiftPackageResolve: { status: 'PASS' },
  },
  proofReference: {
    proofType: 'tag-release-url',
    proofValue: 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1',
    externalRepo: 'https://github.com/ddgutierrezc/legato-ios-core.git',
    externalTag: 'v0.1.1',
  },
  retries: [
    { attempt: 1, remoteTag: 'FAIL', swiftPackageResolve: 'FAIL' },
    { attempt: 2, remoteTag: 'PASS', swiftPackageResolve: 'PASS' },
  ],
  failures: [],
  generatedAt: '2026-04-24T00:15:00.000Z',
  ...overrides,
});

test('verify scratch Package.swift pins package identity using contract packageName', () => {
  const packageSwift = buildVerifyScratchPackageSwift({
    packageUrl: 'https://github.com/ddgutierrezc/legato-ios-core.git',
    packageName: 'LegatoCore',
    product: 'LegatoCore',
    version: '0.1.1',
  });

  assert.match(packageSwift, /\.package\(name:\s*"LegatoCore",\s*url:\s*"https:\/\/github\.com\/ddgutierrezc\/legato-ios-core\.git",\s*\.exact\("0\.1\.1"\)\)/i);
  assert.match(packageSwift, /\.product\(name:\s*"LegatoCore",\s*package:\s*"LegatoCore"\)/i);
});

test('handoff fails when preflight artifact is missing', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-handoff-missing-'));
  const result = await recordIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    externalRepo: 'https://github.com/ddgutierrezc/legato-ios-core.git',
    externalTag: 'v0.1.1',
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
    externalRepo: 'https://github.com/ddgutierrezc/legato-ios-core.git',
    externalTag: 'v0.1.9',
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
    externalTag: 'v0.1.1',
    proofType: 'tag-release-url',
    proofValue: 'https://github.com/acme/legato-ios-core/releases/tag/v0.1.1',
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
    externalRepo: 'https://github.com/ddgutierrezc/legato-ios-core.git',
    externalTag: 'v0.1.1',
    proofType: 'tag-release-url',
    proofValue: 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1',
    operator: 'ios-operator',
    publishedAt: '2026-04-24T00:10:00.000Z',
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.version, '0.1.1');
  assert.equal(result.releaseId, 'rel-001');
  assert.equal(result.normalizedTagVersion, '0.1.1');
  const raw = await readFile(result.handoffPath, 'utf8');
  const artifact = JSON.parse(raw);
  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.preflightPath, preflightPath);
  assert.equal(artifact.proofType, 'tag-release-url');
  assert.equal(artifact.proofValue, 'https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1');

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
    externalRepo: 'https://github.com/ddgutierrezc/legato-ios-core.git',
    externalTag: 'v0.1.1',
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
    externalRepo: 'https://github.com/ddgutierrezc/legato-ios-core.git',
    externalTag: 'v0.1.1',
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
      return { exitCode: 0, stdout: 'abc refs/tags/v0.1.1\n', stderr: '' };
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
  assert.equal(verifyResult.proofReference.externalTag, 'v0.1.1');
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
    runSwiftPackageResolve: async () => ({ exitCode: 1, stdout: '', stderr: 'no versions match requirement 0.1.1' }),
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
  await writeFile(preflightPath, `${JSON.stringify(makePreflight({ expectedVersion: '0.1.2' }), null, 2)}\n`, 'utf8');
  await writeFile(handoffPath, `${JSON.stringify(makeHandoff(preflightPath, { version: '0.1.1' }), null, 2)}\n`, 'utf8');

  const verifyResult = await verifyIosPublishHandoff({
    releaseId: 'rel-001',
    artifactsDir: tempDir,
    attempts: 1,
    backoffMs: 1,
    runGitLsRemote: async () => ({ exitCode: 0, stdout: 'abc refs/tags/v0.1.1\n', stderr: '' }),
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
  assert.equal(result.version, '0.1.1');
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
      externalRepo: 'https://github.com/ddgutierrezc/legato-ios-core.git',
      externalTag: 'v0.1.1',
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
