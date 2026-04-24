import test from 'node:test';
import assert from 'node:assert/strict';

import {
  validateNativeReleaseGate,
  formatNativeReleaseGateSummary,
} from './validate-native-release-gate.mjs';

const pluginBuildGradleArtifactOnly = `
dependencies {
    implementation legatoNativeArtifactContract.coordinate
}
`;

const pluginPackageSwiftArtifactOnly = `
let package = Package(
    name: "LegatoCapacitor",
    dependencies: [
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

const pluginSwiftSource = `
@objc(LegatoPlugin)
public final class LegatoPlugin: CAPPlugin, CAPBridgedPlugin {}
`;

const capacitorConfig = `
{
  "packageClassList": ["LegatoPlugin"]
}
`;

const androidSettings = `
include ':app'
apply from: 'capacitor.settings.gradle'
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

const capAppSpm = `
// DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands
let package = Package(
    name: "CapApp-SPM",
    dependencies: [
        .package(name: "LegatoCapacitor", path: "../../../node_modules/@legato/capacitor")
    ]
)
`;

const passingSmokeReport = {
  schemaVersion: 1,
  flow: 'smoke',
  status: 'PASS',
  checks: [{ label: 'smoke', ok: true, detail: 'ok' }],
  snapshotSummary: 'ok',
  recentEvents: [],
  errors: [],
  metadata: { platform: 'android' },
};

test('release gate passes when native artifact checks and smoke reports pass', () => {
  const result = validateNativeReleaseGate({
    nativeValidationInput: {
      pluginBuildGradle: pluginBuildGradleArtifactOnly,
      nativeArtifactsContractJson: nativeArtifactsContract,
      androidSettingsGradle: androidSettings,
      capAppSpmPackageSwift: capAppSpm,
      pluginPackageSwift: pluginPackageSwiftArtifactOnly,
      pluginSwiftSource,
      capacitorConfigJson: capacitorConfig,
    },
    smokeArtifacts: [
      { path: './artifacts/android-smoke-report.json', report: { ...passingSmokeReport, metadata: { platform: 'android' } } },
      { path: './artifacts/ios-smoke-report.json', report: { ...passingSmokeReport, metadata: { platform: 'ios' } } },
    ],
    evidenceManifest: {
      androidResolutionLog: './artifacts/release-native-artifact-foundation-v1/android-dependency-resolution.log',
      iosResolutionLog: './artifacts/release-native-artifact-foundation-v1/ios-spm-resolution.log',
      androidSmokeReport: './artifacts/release-native-artifact-foundation-v1/android-smoke-report.json',
      iosSmokeReport: './artifacts/release-native-artifact-foundation-v1/ios-smoke-report.json',
      externalConsumerSummary: './artifacts/release-native-artifact-foundation-v1/external-consumer-summary.json',
    },
    externalConsumerSummary: {
      status: 'PASS',
      areas: {
        isolation: 'PASS',
        installability: 'PASS',
        typecheckAndSync: 'PASS',
        validatorReuse: 'PASS',
      },
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.exitCode, 0);
  assert.equal(result.failures.length, 0);
});

test('release gate fails when evidence manifest is missing required artifacts', () => {
  const result = validateNativeReleaseGate({
    nativeValidationInput: {
      pluginBuildGradle: pluginBuildGradleArtifactOnly,
      nativeArtifactsContractJson: nativeArtifactsContract,
      androidSettingsGradle: androidSettings,
      capAppSpmPackageSwift: capAppSpm,
      pluginPackageSwift: pluginPackageSwiftArtifactOnly,
      pluginSwiftSource,
      capacitorConfigJson: capacitorConfig,
    },
    smokeArtifacts: [],
    evidenceManifest: {
      androidResolutionLog: './artifacts/release-native-artifact-foundation-v1/android-dependency-resolution.log',
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.exitCode, 1);
  assert.match(result.failures.join('\n'), /Missing release evidence artifact entry: iosResolutionLog/i);
  assert.match(result.failures.join('\n'), /Missing release evidence artifact entry: androidSmokeReport/i);
  assert.match(result.failures.join('\n'), /Missing release evidence artifact entry: iosSmokeReport/i);
  assert.match(result.failures.join('\n'), /Missing release evidence artifact entry: externalConsumerSummary/i);
});

test('release gate fails when external consumer summary is FAIL', () => {
  const result = validateNativeReleaseGate({
    nativeValidationInput: {
      pluginBuildGradle: pluginBuildGradleArtifactOnly,
      nativeArtifactsContractJson: nativeArtifactsContract,
      androidSettingsGradle: androidSettings,
      capAppSpmPackageSwift: capAppSpm,
      pluginPackageSwift: pluginPackageSwiftArtifactOnly,
      pluginSwiftSource,
      capacitorConfigJson: capacitorConfig,
    },
    smokeArtifacts: [
      { path: './artifacts/android-smoke-report.json', report: { ...passingSmokeReport, metadata: { platform: 'android' } } },
      { path: './artifacts/ios-smoke-report.json', report: { ...passingSmokeReport, metadata: { platform: 'ios' } } },
    ],
    evidenceManifest: {
      androidResolutionLog: './artifacts/release-native-artifact-foundation-v1/android-dependency-resolution.log',
      iosResolutionLog: './artifacts/release-native-artifact-foundation-v1/ios-spm-resolution.log',
      androidSmokeReport: './artifacts/release-native-artifact-foundation-v1/android-smoke-report.json',
      iosSmokeReport: './artifacts/release-native-artifact-foundation-v1/ios-smoke-report.json',
      externalConsumerSummary: './artifacts/release-native-artifact-foundation-v1/external-consumer-summary.json',
    },
    externalConsumerSummary: {
      status: 'FAIL',
      areas: {
        isolation: 'PASS',
        installability: 'PASS',
        typecheckAndSync: 'FAIL',
        validatorReuse: 'PASS',
      },
      failures: ['Sync resolver failed'],
    },
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.sections.externalConsumer, 'FAIL');
  assert.match(result.failures.join('\n'), /external consumer/i);
  assert.match(result.failures.join('\n'), /Sync resolver failed/i);
});

test('release gate formatter emits deterministic sections', () => {
  const result = validateNativeReleaseGate({
    nativeValidationInput: {
      pluginBuildGradle: "dependencies { implementation project(':native:android:core') }",
    },
    smokeArtifacts: [],
    evidenceManifest: {},
  });

  const summary = formatNativeReleaseGateSummary(result);
  assert.match(summary, /Overall: FAIL/i);
  assert.match(summary, /native-artifacts: FAIL/i);
  assert.match(summary, /smoke: FAIL/i);
  assert.match(summary, /release-evidence: FAIL/i);
  assert.match(summary, /external-consumer: FAIL/i);
  assert.match(summary, /project\(':native:android:core'\)/i);
});
