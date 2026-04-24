import test from 'node:test';
import assert from 'node:assert/strict';

import {
  runIosReleasePreflight,
  formatIosPreflightSummary,
} from '../release-ios-preflight.mjs';

const contract = {
  ios: {
    packageUrl: 'https://github.com/legato/legato-ios-core.git',
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
    packageUrl: "https://github.com/legato/legato-ios-core.git",
    packageName: "LegatoCore",
    product: "LegatoCore",
    versionPolicy: "exact",
    version: "0.1.1"
)
// NATIVE_ARTIFACTS:END
let package = Package(
    name: "LegatoCapacitor",
    dependencies: [
        .package(url: "https://github.com/legato/legato-ios-core.git", exact: "0.1.1")
    ],
    targets: [
        .target(
            name: "LegatoPlugin",
            dependencies: [
                .product(name: "LegatoCore", package: "LegatoCore")
            ]
        )
    ]
)
`;

const pluginPackageSwiftWithMultipleProducts = `
// NATIVE_ARTIFACTS:BEGIN
let legatoNativeArtifactContract = (
    packageUrl: "https://github.com/legato/legato-ios-core.git",
    packageName: "LegatoCore",
    product: "LegatoCore",
    versionPolicy: "exact",
    version: "0.1.1"
)
// NATIVE_ARTIFACTS:END
let package = Package(
    name: "LegatoCapacitor",
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/legato/legato-ios-core.git", exact: "0.1.1")
    ],
    targets: [
        .target(
            name: "LegatoPlugin",
            dependencies: [
                .product(name: "Capacitor", package: "capacitor-swift-pm"),
                .product(name: "Cordova", package: "capacitor-swift-pm"),
                .product(name: "LegatoCore", package: "LegatoCore")
            ]
        )
    ]
)
`;

test('iOS preflight passes when contract/native/plugin identity and tag are aligned', async () => {
  const result = await runIosReleasePreflight({
    contract,
    releaseTag: 'v0.1.1',
    nativePackageSwift,
    pluginPackageSwift,
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
});

test('iOS preflight fails when release tag does not match contract version', async () => {
  const result = await runIosReleasePreflight({
    contract,
    releaseTag: 'v0.1.1',
    nativePackageSwift,
    pluginPackageSwift,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /tag\/version mismatch/i);
});

test('iOS preflight fails when plugin package URL or product identity drifts', async () => {
  const result = await runIosReleasePreflight({
    contract,
    releaseTag: 'v0.1.1',
    nativePackageSwift,
    pluginPackageSwift: pluginPackageSwift
      .replaceAll('https://github.com/legato/legato-ios-core.git', 'https://github.com/acme/legato-ios-core.git')
      .replace('.product(name: "LegatoCore", package: "LegatoCore")', '.product(name: "WrongCore", package: "LegatoCore")'),
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /package url mismatch/i);
  assert.match(result.failures.join('\n'), /product identity mismatch/i);
});

test('iOS preflight fails when native package name mismatches contract package name', async () => {
  const result = await runIosReleasePreflight({
    contract,
    releaseTag: 'v0.1.1',
    nativePackageSwift: nativePackageSwift.replace('name: "LegatoCore"', 'name: "WrongCore"'),
    pluginPackageSwift,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /package identity mismatch/i);
});

test('iOS preflight summary includes readiness and tag context', async () => {
  const result = await runIosReleasePreflight({
    contract,
    releaseTag: 'v0.1.1',
    nativePackageSwift,
    pluginPackageSwift,
  });

  const summary = formatIosPreflightSummary(result);
  assert.match(summary, /Mode: ios-preflight/i);
  assert.match(summary, /Overall: FAIL/i);
  assert.match(summary, /Release tag: v0\.1\.1/i);
  assert.match(summary, /Expected version: 0\.1\.0/i);
});

test('iOS preflight passes when plugin declares multiple product dependencies including LegatoCore', async () => {
  const result = await runIosReleasePreflight({
    contract,
    releaseTag: 'v0.1.1',
    nativePackageSwift,
    pluginPackageSwift: pluginPackageSwiftWithMultipleProducts,
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});
