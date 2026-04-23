import { readFile } from 'node:fs/promises';

import {
  formatNativeArtifactValidation,
  validateNativeArtifacts,
} from './validate-native-artifacts.mjs';
import {
  formatValidationSummary,
  validateSmokeReports,
} from './validate-smoke-report.mjs';

const PASS = 'PASS';
const FAIL = 'FAIL';

const REQUIRED_EVIDENCE_KEYS = Object.freeze([
  'androidResolutionLog',
  'iosResolutionLog',
  'androidSmokeReport',
  'iosSmokeReport',
]);

const normalizeReleaseEvidence = (evidenceManifest = {}) => {
  const failures = [];
  for (const key of REQUIRED_EVIDENCE_KEYS) {
    const value = evidenceManifest[key];
    if (typeof value !== 'string' || value.trim() === '') {
      failures.push(`Missing release evidence artifact entry: ${key}`);
    }
  }

  return {
    status: failures.length === 0 ? PASS : FAIL,
    failures,
  };
};

export const validateNativeReleaseGate = ({
  nativeValidationInput,
  smokeArtifacts,
  evidenceManifest,
}) => {
  const nativeResult = validateNativeArtifacts(nativeValidationInput);
  const reports = smokeArtifacts ?? [];
  const smokePreflightFailures = [];
  if (reports.length === 0) {
    smokePreflightFailures.push('Missing smoke report artifacts for release gate: expected android and iOS smoke reports.');
  }
  const smokeResult = validateSmokeReports(reports, { preflightFailures: smokePreflightFailures });
  const evidenceResult = normalizeReleaseEvidence(evidenceManifest);

  const failures = [
    ...nativeResult.failures,
    ...smokeResult.failures,
    ...evidenceResult.failures,
  ];

  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    sections: {
      nativeArtifacts: nativeResult.status,
      smoke: smokeResult.status,
      releaseEvidence: evidenceResult.status,
    },
    failures,
    nativeResult,
    smokeResult,
    evidenceResult,
  };
};

export const formatNativeReleaseGateSummary = (result) => {
  const lines = [
    `Overall: ${result.status}`,
    `native-artifacts: ${result.sections.nativeArtifacts}`,
    `smoke: ${result.sections.smoke}`,
    `release-evidence: ${result.sections.releaseEvidence}`,
  ];

  if (result.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
};

const parseArgs = (argv) => {
  const options = {
    pluginGradlePath: undefined,
    nativeArtifactsContractPath: undefined,
    androidSettingsPath: undefined,
    capAppSpmPath: undefined,
    pluginSwiftPackagePath: undefined,
    pluginSwiftSourcePath: undefined,
    capacitorConfigPath: undefined,
    evidenceManifestPath: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plugin-gradle' && argv[i + 1]) {
      options.pluginGradlePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--native-artifacts-contract' && argv[i + 1]) {
      options.nativeArtifactsContractPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--android-settings' && argv[i + 1]) {
      options.androidSettingsPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--capapp-spm-package' && argv[i + 1]) {
      options.capAppSpmPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--plugin-swift-package' && argv[i + 1]) {
      options.pluginSwiftPackagePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--plugin-swift-source' && argv[i + 1]) {
      options.pluginSwiftSourcePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--capacitor-config' && argv[i + 1]) {
      options.capacitorConfigPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--evidence-manifest' && argv[i + 1]) {
      options.evidenceManifestPath = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));

  if (!options.pluginGradlePath || !options.evidenceManifestPath) {
    process.stdout.write('Overall: FAIL\nnative-artifacts: FAIL\nsmoke: FAIL\nrelease-evidence: FAIL\nFailures:\n- Usage: node scripts/validate-native-release-gate.mjs --plugin-gradle <path> --evidence-manifest <path> [--native-artifacts-contract <path>] [--android-settings <path>] [--capapp-spm-package <path>] [--plugin-swift-package <path>] [--plugin-swift-source <path>] [--capacitor-config <path>]\n');
    process.exit(1);
  }

  try {
    const pluginBuildGradle = await readFile(options.pluginGradlePath, 'utf8');
    const nativeArtifactsContractJson = options.nativeArtifactsContractPath
      ? await readFile(options.nativeArtifactsContractPath, 'utf8')
      : '';
    const androidSettingsGradle = options.androidSettingsPath ? await readFile(options.androidSettingsPath, 'utf8') : '';
    const capAppSpmPackageSwift = options.capAppSpmPath ? await readFile(options.capAppSpmPath, 'utf8') : '';
    const pluginPackageSwift = options.pluginSwiftPackagePath ? await readFile(options.pluginSwiftPackagePath, 'utf8') : '';
    const pluginSwiftSource = options.pluginSwiftSourcePath ? await readFile(options.pluginSwiftSourcePath, 'utf8') : '';
    const capacitorConfigJson = options.capacitorConfigPath ? await readFile(options.capacitorConfigPath, 'utf8') : '';

    const evidenceManifestRaw = await readFile(options.evidenceManifestPath, 'utf8');
    const parsedManifest = JSON.parse(evidenceManifestRaw);
    const evidenceManifest = parsedManifest?.artifacts ?? {};

    const smokeArtifacts = [];
    if (typeof evidenceManifest.androidSmokeReport === 'string') {
      const androidSmokeRaw = await readFile(evidenceManifest.androidSmokeReport, 'utf8');
      smokeArtifacts.push({
        path: evidenceManifest.androidSmokeReport,
        report: JSON.parse(androidSmokeRaw),
      });
    }
    if (typeof evidenceManifest.iosSmokeReport === 'string') {
      const iosSmokeRaw = await readFile(evidenceManifest.iosSmokeReport, 'utf8');
      smokeArtifacts.push({
        path: evidenceManifest.iosSmokeReport,
        report: JSON.parse(iosSmokeRaw),
      });
    }

    const androidResolutionLog = typeof evidenceManifest.androidResolutionLog === 'string'
      ? await readFile(evidenceManifest.androidResolutionLog, 'utf8')
      : '';
    const iosResolutionLog = typeof evidenceManifest.iosResolutionLog === 'string'
      ? await readFile(evidenceManifest.iosResolutionLog, 'utf8')
      : '';

    const result = validateNativeReleaseGate({
      nativeValidationInput: {
        pluginBuildGradle,
        nativeArtifactsContractJson,
        androidSettingsGradle,
        capAppSpmPackageSwift,
        pluginPackageSwift,
        pluginSwiftSource,
        capacitorConfigJson,
        androidResolutionLog,
        iosResolutionLog,
      },
      smokeArtifacts,
      evidenceManifest,
    });

    process.stdout.write(`${formatNativeReleaseGateSummary(result)}\n`);

    if (result.status === FAIL) {
      const nativeSummary = formatNativeArtifactValidation(result.nativeResult);
      const smokeSummary = formatValidationSummary(result.smokeResult);
      process.stdout.write(`\n---\n${nativeSummary}\n---\n${smokeSummary}\n`);
    }

    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    process.stdout.write(`Overall: FAIL\nnative-artifacts: FAIL\nsmoke: FAIL\nrelease-evidence: FAIL\nFailures:\n- Failed to evaluate native release gate inputs: ${message}\n`);
    process.exit(1);
  }
}
