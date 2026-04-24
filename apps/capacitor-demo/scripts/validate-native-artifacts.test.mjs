import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

import {
  validateNativeArtifacts,
  validateNativeArtifactPaths,
  formatNativeArtifactValidation,
} from './validate-native-artifacts.mjs';

const currentDir = dirname(fileURLToPath(import.meta.url));
const validatorEntrypoint = resolve(currentDir, 'validate-native-artifacts.mjs');

const buildGradleArtifactOnly = `
dependencies {
    implementation legatoNativeArtifactContract.coordinate
}
// NATIVE_ARTIFACTS:BEGIN
ext.legatoNativeArtifactContract = [
    repositoryUrl: 'https://repo1.maven.org/maven2',
    coordinate: 'dev.dgutierrez:legato-android-core:0.1.1'
]
// Adapter Android dependency must stay artifact-only.
// NATIVE_ARTIFACTS:END
`;

const nativeArtifactsContract = `
{
  "android": {
    "repositoryUrl": "https://repo1.maven.org/maven2",
    "group": "dev.dgutierrez",
    "artifact": "legato-android-core",
    "version": "0.1.1"
  },
  "ios": {
    "packageUrl": "https://github.com/ddgutierrezc/legato-ios-core.git",
    "packageName": "LegatoCore",
    "product": "LegatoCore",
    "version": "0.1.1",
    "versionPolicy": "exact"
  }
}
`;

const buildGradleLocalProject = `
dependencies {
    implementation project(':native:android:core')
}
`;

const androidSettingsWithoutNativeCore = `
include ':app'
apply from: 'capacitor.settings.gradle'
`;

const androidSettingsWithManualNativeCore = `
include ':app'
include ':native:android:core'
project(':native:android:core').projectDir = new File('../../../native/android/core')
apply from: 'capacitor.settings.gradle'
`;

const packageSwiftArtifactOnly = `
let package = Package(
    name: "LegatoCapacitor",
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", from: "8.0.0"),
        .package(url: "https://github.com/ddgutierrezc/legato-ios-core.git", exact: "0.1.1")
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

const nativeArtifactsContractNonDefaultOwner = `
{
  "android": {
    "repositoryUrl": "https://repo1.maven.org/maven2",
    "group": "dev.dgutierrez",
    "artifact": "legato-android-core",
    "version": "0.1.1"
  },
  "ios": {
    "packageUrl": "https://github.com/acme/legato-ios-core.git",
    "packageName": "LegatoCore",
    "product": "LegatoCore",
    "version": "0.1.1",
    "versionPolicy": "exact"
  }
}
`;

const packageSwiftArtifactOnlyNonDefaultOwner = `
let package = Package(
    name: "LegatoCapacitor",
    dependencies: [
        .package(url: "https://github.com/acme/legato-ios-core.git", exact: "0.1.1")
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

const packageSwiftLocalPath = `
let package = Package(
    name: "LegatoCapacitor",
    dependencies: [
        .package(path: "../../../../../native/ios/LegatoCore")
    ]
)
`;

const capAppSpmGenerated = `
// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    dependencies: [
        .package(name: "LegatoCapacitor", path: "../../../node_modules/@legato/capacitor")
    ]
)
`;

const capAppSpmWithManualLegatoCore = `
// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    dependencies: [
        .package(path: "../../../../../native/ios/LegatoCore")
    ]
)
`;

const capAppSpmWithoutGeneratedMarker = `
let package = Package(name: "CapApp-SPM")
`;

const capacitorConfigWithPluginClass = `
{
  "packageClassList": ["LegatoPlugin"]
}
`;

const pluginSwiftDiscoverableShape = `
@objc(LegatoPlugin)
public final class LegatoPlugin: CAPPlugin, CAPBridgedPlugin {}
`;

const unresolvedLog = `
Execution failed for task ':legato-capacitor:compileDebugKotlin'.
> Could not resolve all files for configuration ':legato-capacitor:debugCompileClasspath'.
   > Could not find dev.dgutierrez:legato-android-core:0.1.1.
     Searched in the following locations:
       - https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.1/legato-android-core-0.1.1.pom
`;

const iosResolverMismatchLog = `
xcodebuild: error: Could not resolve package dependencies:
  product 'LegatoCore' required by package 'LegatoCapacitor' target 'LegatoPlugin' not found in package 'legato-ios-core'.
`;

const runValidatorCli = async (args) => new Promise((resolveResult) => {
  const child = spawn(process.execPath, [validatorEntrypoint, ...args], {
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

  child.on('close', (code) => {
    resolveResult({ code, stdout, stderr });
  });
});

test('validator passes when plugin build.gradle is artifact-only and no unresolved-module signal exists', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftArtifactOnly,
    nativeArtifactsContractJson: nativeArtifactsContract,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
    androidResolutionLog: '',
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
});

test('validator fails when plugin build.gradle reintroduces local project dependency', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleLocalProject,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftArtifactOnly,
    nativeArtifactsContractJson: nativeArtifactsContract,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
    androidResolutionLog: '',
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.equal(result.failures.length > 0, true);
  assert.match(result.failures[0], /project\(':native:android:core'\)/i);
});

test('validator fails when Gradle output reports unresolved Android artifact coordinates', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftArtifactOnly,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
    nativeArtifactsContractJson: nativeArtifactsContract,
    androidResolutionLog: unresolvedLog,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.equal(result.failures.length > 0, true);
  assert.match(result.failures[0], /Could not find dev\.dgutierrez:legato-android-core:0\.1\.1/i);
});

test('formatter prints stable summary structure', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftArtifactOnly,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
    nativeArtifactsContractJson: nativeArtifactsContract,
    androidResolutionLog: unresolvedLog,
  });

  const summary = formatNativeArtifactValidation(result);
  assert.match(summary, /Overall: FAIL/i);
  assert.match(summary, /android-artifacts: FAIL/i);
  assert.match(summary, /ios-artifacts: FAIL/i);
  assert.match(summary, /Could not find dev\.dgutierrez:legato-android-core:0\.1\.1/i);
});

test('CLI exits non-zero with actionable output when local-project regression is detected', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-native-artifacts-validator-'));
  const buildGradlePath = join(tempDir, 'build.gradle');

  await writeFile(buildGradlePath, `${buildGradleLocalProject}\n`, 'utf8');

  try {
    const result = await runValidatorCli(['--plugin-gradle', buildGradlePath]);
    assert.equal(result.code, 1);
    assert.match(result.stdout, /Overall: FAIL/i);
    assert.match(result.stdout, /project\(':native:android:core'\)/i);
    assert.equal(result.stderr, '');
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('validator fails when iOS Package.swift uses local path dependency', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftLocalPath,
    nativeArtifactsContractJson: nativeArtifactsContract,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /\.package\(path:/i);
});

test('validator fails when SwiftPM resolver reports product/package identity mismatch', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftArtifactOnly,
    nativeArtifactsContractJson: nativeArtifactsContract,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
    iosResolutionLog: iosResolverMismatchLog,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /product 'LegatoCore'.*not found/i);
});

test('validator fails when Android host settings reintroduce manual native-core include', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    androidSettingsGradle: androidSettingsWithManualNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftArtifactOnly,
    nativeArtifactsContractJson: nativeArtifactsContract,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /android\/settings\.gradle/i);
  assert.match(result.failures.join('\n'), /native:android:core/i);
});

test('validator fails when CapApp-SPM package adds manual LegatoCore local path wiring', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmWithManualLegatoCore,
    pluginPackageSwift: packageSwiftArtifactOnly,
    nativeArtifactsContractJson: nativeArtifactsContract,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /CapApp-SPM/i);
  assert.match(result.failures.join('\n'), /manual local LegatoCore path wiring/i);
});

test('validator fails when CapApp-SPM generated ownership marker is missing', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmWithoutGeneratedMarker,
    pluginPackageSwift: packageSwiftArtifactOnly,
    nativeArtifactsContractJson: nativeArtifactsContract,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /DO NOT MODIFY THIS FILE/i);
});

test('validator passes for non-default iOS repo owner when contract drives URL', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    nativeArtifactsContractJson: nativeArtifactsContractNonDefaultOwner,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftArtifactOnlyNonDefaultOwner,
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});

test('validator fails when iOS product identity diverges from contract', () => {
  const result = validateNativeArtifacts({
    pluginBuildGradle: buildGradleArtifactOnly,
    nativeArtifactsContractJson: nativeArtifactsContract,
    androidSettingsGradle: androidSettingsWithoutNativeCore,
    capAppSpmPackageSwift: capAppSpmGenerated,
    pluginPackageSwift: packageSwiftArtifactOnly.replace('.product(name: "LegatoCore", package: "LegatoCore")', '.product(name: "WrongCore", package: "LegatoCore")'),
    capacitorConfigJson: capacitorConfigWithPluginClass,
    pluginSwiftSource: pluginSwiftDiscoverableShape,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /product identity mismatch/i);
});

test('fixture mode path validator fails when host/plugin paths are coupled to monorepo app path', () => {
  const result = validateNativeArtifactPaths({
    fixtureRoot: '/tmp/legato-external-fixture/app',
    repoRoot: '/Volumes/S3/daniel/github/legato',
    pluginGradlePath: '/Volumes/S3/daniel/github/legato/packages/capacitor/android/build.gradle',
    androidSettingsPath: '/Volumes/S3/daniel/github/legato/apps/capacitor-demo/android/settings.gradle',
    capAppSpmPath: '/Volumes/S3/daniel/github/legato/apps/capacitor-demo/ios/App/CapApp-SPM/Package.swift',
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /path coupling/i);
  assert.match(result.failures.join('\n'), /apps\/capacitor-demo/i);
});
