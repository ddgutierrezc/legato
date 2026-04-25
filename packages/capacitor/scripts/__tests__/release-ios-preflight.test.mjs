import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  runIosReleasePreflight,
  formatIosPreflightSummary,
  writeIosPreflightArtifact,
} from '../release-ios-preflight.mjs';

const contract = {
  ios: {
    packageUrl: 'https://github.com/ddgutierrezc/legato-ios-core.git',
    packageName: 'LegatoCore',
    product: 'LegatoCore',
    version: '0.1.1',
    versionPolicy: 'exact',
  },
};

const nativePackageSwift = `
let package = Package(
    name: "LegatoCore",
    products: [
        .library(
            name: "LegatoCore",
            targets: ["LegatoCore"]
        )
    ]
)
`;

const pluginPackageSwift = `
// NATIVE_ARTIFACTS:BEGIN
let legatoNativeArtifactContract = (
    packageUrl: "https://github.com/ddgutierrezc/legato-ios-core.git",
    packageName: "LegatoCore",
    product: "LegatoCore",
    versionPolicy: "exact",
    version: "0.1.1"
)
// NATIVE_ARTIFACTS:END
let package = Package(
    name: "DdgutierrezcLegatoCapacitor",
    dependencies: [
        .package(url: "https://github.com/ddgutierrezc/legato-ios-core.git", exact: "0.1.1")
    ],
    targets: [
        .target(
            name: "LegatoPlugin",
            dependencies: [
                .product(name: "LegatoCore", package: "legato-ios-core")
            ]
        )
    ]
)
`;

const pluginPackageSwiftWithMultipleProducts = `
// NATIVE_ARTIFACTS:BEGIN
let legatoNativeArtifactContract = (
    packageUrl: "https://github.com/ddgutierrezc/legato-ios-core.git",
    packageName: "LegatoCore",
    product: "LegatoCore",
    versionPolicy: "exact",
    version: "0.1.1"
)
// NATIVE_ARTIFACTS:END
let package = Package(
    name: "DdgutierrezcLegatoCapacitor",
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/ddgutierrezc/legato-ios-core.git", exact: "0.1.1")
    ],
    targets: [
        .target(
            name: "LegatoPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "LegatoCore", package: "legato-ios-core")
            ]
        )
    ]
)
`;

const distributionPackageSwift = nativePackageSwift;

const provenanceJson = JSON.stringify({
  sourceRepo: 'https://github.com/ddgutierrezc/legato.git',
  sourceCommit: '1111111111111111111111111111111111111111',
  packageName: 'LegatoCore',
  product: 'LegatoCore',
  version: '0.1.1',
  releaseTag: 'v0.1.1',
  exportedAt: '2026-04-24T00:00:00.000Z',
}, null, 2);

const makeBaseInput = (overrides = {}) => ({
  contract,
  releaseTag: 'v0.1.1',
  nativePackageSwift,
  pluginPackageSwift,
  fileReader: async (filePath, encoding) => {
    if (filePath.endsWith('/distribution-provenance.json')) {
      return provenanceJson;
    }
    if (filePath.endsWith('/distribution-repo/Package.swift')) {
      return distributionPackageSwift;
    }
    if (filePath.endsWith('/distribution-repo/README.md')) {
      return '# dist';
    }
    if (filePath.endsWith('/distribution-repo/LICENSE')) {
      return 'MIT';
    }
    if (filePath.endsWith('/distribution-repo/.gitignore')) {
      return '.build/';
    }
    if (filePath.endsWith('/distribution-repo/distribution-provenance.json')) {
      return provenanceJson;
    }
    if (filePath.endsWith('/distribution-repo/Sources/LegatoCore') || filePath.endsWith('/distribution-repo/Sources/LegatoCoreSessionRuntimeiOS') || filePath.endsWith('/distribution-repo/Tests/LegatoCoreTests') || filePath.endsWith('/distribution-repo/Tests/LegatoCoreSessionRuntimeiOSTests')) {
      return '';
    }
    throw new Error(`Unexpected file read in test fixture: ${filePath} (${encoding})`);
  },
  pathStat: async (filePath) => {
    if (
      filePath.endsWith('/distribution-repo/Sources/LegatoCore')
      || filePath.endsWith('/distribution-repo/Sources/LegatoCoreSessionRuntimeiOS')
      || filePath.endsWith('/distribution-repo/Tests/LegatoCoreTests')
      || filePath.endsWith('/distribution-repo/Tests/LegatoCoreSessionRuntimeiOSTests')
    ) {
      return { isDirectory: () => true };
    }
    throw new Error(`Unexpected stat in test fixture: ${filePath}`);
  },
  distributionRepoPath: '/tmp/distribution-repo',
  provenancePath: '/tmp/distribution-provenance.json',
  ...overrides,
});

test('iOS preflight passes when contract/native/plugin identity and tag are aligned', async () => {
  const result = await runIosReleasePreflight(makeBaseInput());

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
});

test('iOS publish preflight skips local distribution bootstrap/provenance requirements', async () => {
  const result = await runIosReleasePreflight(makeBaseInput({
    mode: 'publish',
    fileReader: async (filePath, encoding) => {
      if (filePath.endsWith('/distribution-provenance.json') || filePath.endsWith('/distribution-repo/Package.swift') || filePath.endsWith('/distribution-repo/README.md') || filePath.endsWith('/distribution-repo/LICENSE') || filePath.endsWith('/distribution-repo/.gitignore')) {
        throw new Error(`distribution bootstrap should be skipped for publish mode: ${filePath} (${encoding})`);
      }
      throw new Error(`Unexpected file read in publish fixture: ${filePath} (${encoding})`);
    },
    pathStat: async (filePath) => {
      throw new Error(`distribution bootstrap should be skipped for publish mode: ${filePath}`);
    },
  }));

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
  assert.equal(result.details.controlPlaneMode, 'publish');
});

test('iOS preflight fails when release tag does not match contract version', async () => {
  const result = await runIosReleasePreflight(makeBaseInput({ releaseTag: 'v0.1.0' }));

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /tag\/version mismatch/i);
});

test('iOS preflight fails when plugin package URL or product identity drifts', async () => {
  const result = await runIosReleasePreflight(makeBaseInput({
    pluginPackageSwift: pluginPackageSwift
      .replaceAll('https://github.com/ddgutierrezc/legato-ios-core.git', 'https://github.com/acme/legato-ios-core.git')
      .replace('.product(name: "LegatoCore", package: "legato-ios-core")', '.product(name: "WrongCore", package: "legato-ios-core")'),
  }));

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /package url mismatch/i);
  assert.match(result.failures.join('\n'), /product identity mismatch/i);
});

test('iOS preflight fails when native package name mismatches contract package name', async () => {
  const result = await runIosReleasePreflight(makeBaseInput({
    nativePackageSwift: nativePackageSwift.replace('name: "LegatoCore"', 'name: "WrongCore"'),
  }));

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /package identity mismatch/i);
});

test('iOS preflight summary includes readiness and tag context', async () => {
  const result = await runIosReleasePreflight(makeBaseInput());

  const summary = formatIosPreflightSummary(result);
  assert.match(summary, /Mode: ios-preflight/i);
  assert.match(summary, /Overall: PASS/i);
  assert.match(summary, /Release tag: v0\.1\.1/i);
  assert.match(summary, /Expected version: 0\.1\.1/i);
  assert.match(summary, /Manual handoff ready: YES/i);
});

test('iOS preflight passes when plugin declares multiple product dependencies including LegatoCore', async () => {
  const result = await runIosReleasePreflight(makeBaseInput({ pluginPackageSwift: pluginPackageSwiftWithMultipleProducts }));

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});

test('iOS preflight JSON artifact captures deterministic handoff fields', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-preflight-'));
  const artifactPath = join(tempDir, 'release', 'preflight.json');

  const result = await runIosReleasePreflight({
    ...makeBaseInput(),
  });

  await writeIosPreflightArtifact(result, artifactPath);
  const rawArtifact = await readFile(artifactPath, 'utf8');
  const artifact = JSON.parse(rawArtifact);

  assert.equal(artifact.status, 'PASS');
  assert.equal(artifact.releaseTag, 'v0.1.1');
  assert.equal(artifact.expectedVersion, '0.1.1');
  assert.equal(artifact.expectedPackageUrl, contract.ios.packageUrl);
  assert.equal(artifact.expectedPackageName, contract.ios.packageName);
  assert.equal(artifact.expectedProduct, contract.ios.product);
  assert.equal(artifact.readyForManualHandoff, true);
  assert.match(artifact.generatedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.deepEqual(artifact.failures, []);

  await rm(tempDir, { recursive: true, force: true });
});

test('iOS preflight JSON artifact includes mismatch failures when contract drifts', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-ios-preflight-fail-'));
  const artifactPath = join(tempDir, 'release', 'preflight.json');

  const result = await runIosReleasePreflight({
    ...makeBaseInput({ releaseTag: 'v0.1.0' }),
  });

  await writeIosPreflightArtifact(result, artifactPath);
  const rawArtifact = await readFile(artifactPath, 'utf8');
  const artifact = JSON.parse(rawArtifact);

  assert.equal(artifact.status, 'FAIL');
  assert.equal(artifact.readyForManualHandoff, false);
  assert.match(artifact.failures.join('\n'), /tag\/version mismatch/i);

  const summary = formatIosPreflightSummary(result);
  assert.match(summary, /Overall: FAIL/i);
  assert.match(summary, /Manual handoff ready: NO/i);

  await rm(tempDir, { recursive: true, force: true });
});

test('iOS preflight fails fast when contract inputs are missing', async () => {
  const result = await runIosReleasePreflight({
    ...makeBaseInput({
    contract: {
      ios: {
        packageUrl: '   ',
        packageName: '',
        product: '',
        version: '',
        versionPolicy: 'range',
      },
    },
    }),
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /Missing ios\.packageUrl/i);
  assert.match(result.failures.join('\n'), /Missing ios\.packageName/i);
  assert.match(result.failures.join('\n'), /Missing ios\.product/i);
  assert.match(result.failures.join('\n'), /Missing ios\.version/i);
  assert.match(result.failures.join('\n'), /version policy mismatch/i);
  assert.equal(result.failures.some((failure) => /package identity mismatch/i.test(failure)), false);
  assert.equal(result.failures.some((failure) => /product identity mismatch/i.test(failure)), false);
});
