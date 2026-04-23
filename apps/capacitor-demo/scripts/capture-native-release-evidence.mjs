import { access, copyFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PASS = 'PASS';
const FAIL = 'FAIL';

const REQUIRED_ARTIFACT_KEYS = Object.freeze([
  'androidResolutionLog',
  'iosResolutionLog',
  'androidSmokeReport',
  'iosSmokeReport',
]);

const resolveDefaultArtifacts = () => ({
  androidResolutionLog: 'artifacts/android-dependency-resolution.log',
  iosResolutionLog: 'artifacts/ios-spm-resolution.log',
  androidSmokeReport: 'artifacts/android-smoke-report.json',
  iosSmokeReport: 'artifacts/ios-smoke-report.json',
});

const resolveOutputNames = () => ({
  androidResolutionLog: 'android-dependency-resolution.log',
  iosResolutionLog: 'ios-spm-resolution.log',
  androidSmokeReport: 'android-smoke-report.json',
  iosSmokeReport: 'ios-smoke-report.json',
});

const normalizeManifest = ({ artifacts, failures }) => {
  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    artifacts,
    failures,
  };
};

export const formatCaptureSummary = (manifest) => {
  const lines = [
    `Overall: ${manifest.status}`,
    `manifest: ${manifest.status}`,
  ];

  if (manifest.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of manifest.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
};

export const captureNativeReleaseEvidence = async ({
  androidResolutionLogPath,
  iosResolutionLogPath,
  androidSmokeReportPath,
  iosSmokeReportPath,
  outputDir = 'artifacts/release-native-artifact-foundation-v1',
} = {}) => {
  const defaults = resolveDefaultArtifacts();
  const sources = {
    androidResolutionLog: androidResolutionLogPath ?? defaults.androidResolutionLog,
    iosResolutionLog: iosResolutionLogPath ?? defaults.iosResolutionLog,
    androidSmokeReport: androidSmokeReportPath ?? defaults.androidSmokeReport,
    iosSmokeReport: iosSmokeReportPath ?? defaults.iosSmokeReport,
  };

  const outputNames = resolveOutputNames();
  const absoluteOutputDir = resolve(outputDir);
  await mkdir(absoluteOutputDir, { recursive: true });

  const failures = [];
  const artifacts = {};

  for (const key of REQUIRED_ARTIFACT_KEYS) {
    const sourcePath = resolve(sources[key]);
    const destinationPath = resolve(absoluteOutputDir, outputNames[key]);

    try {
      await access(sourcePath);
      await copyFile(sourcePath, destinationPath);
      artifacts[key] = destinationPath;
    } catch {
      failures.push(`Missing required evidence input: ${sourcePath}`);
    }
  }

  const manifest = normalizeManifest({ artifacts, failures });
  const manifestPath = resolve(absoluteOutputDir, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  return {
    ...manifest,
    manifestPath,
  };
};

const parseArgs = (argv) => {
  const options = {
    outputDir: 'artifacts/release-native-artifact-foundation-v1',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === '--android-resolution-log' && argv[i + 1]) {
      options.androidResolutionLogPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--ios-resolution-log' && argv[i + 1]) {
      options.iosResolutionLogPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--android-smoke-report' && argv[i + 1]) {
      options.androidSmokeReportPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--ios-smoke-report' && argv[i + 1]) {
      options.iosSmokeReportPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--output-dir' && argv[i + 1]) {
      options.outputDir = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  const result = await captureNativeReleaseEvidence(options);
  process.stdout.write(`${formatCaptureSummary(result)}\n`);
  process.exit(result.exitCode);
}
