import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PASS = 'PASS';
const FAIL = 'FAIL';

const LOCAL_PROJECT_DEPENDENCY_PATTERN = /implementation\s+project\(':native:android:core'\)/;
const ARTIFACT_COORDINATE_PATTERN = /implementation\s+legatoNativeArtifactContract\.coordinate/;
const HOST_MANUAL_NATIVE_CORE_INCLUDE_PATTERN = /include\s+':native:android:core'/;
const IOS_LOCAL_PATH_DEPENDENCY_PATTERN = /\.package\(path:\s*"[^"]*LegatoCore[^"]*"\)/;
const IOS_SPM_PRODUCT_MISMATCH_PATTERN = /product\s+'[^']+'\s+required\s+by\s+package.*not\s+found/i;
const IOS_SPM_MISSING_PRODUCT_PATTERN = /Missing\s+package\s+product/i;
const IOS_PLUGIN_OBJC_PATTERN = /@objc\(LegatoPlugin\)/;
const IOS_PLUGIN_BRIDGE_PATTERN = /class\s+LegatoPlugin\s*:\s*CAPPlugin,\s*CAPBridgedPlugin/;
const CAP_APP_SPM_GENERATED_OWNERSHIP_PATTERN = /DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands/;
const CAP_APP_SPM_MANUAL_LEGATO_CORE_PATH_PATTERN = /\.package\(path:\s*"[^"]*LegatoCore[^"]*"\)/;

const normalizeAbsolute = (value) => resolve(value).replaceAll('\\', '/');

const isPathInside = (targetPath, rootPath) => {
  const normalizedTarget = normalizeAbsolute(targetPath);
  const normalizedRoot = normalizeAbsolute(rootPath).replace(/\/+$/, '');
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
};

const isPathCoupledToMonorepoHost = (pathValue, repoRoot) => {
  if (!repoRoot) {
    return false;
  }
  return isPathInside(pathValue, resolve(repoRoot, 'apps/capacitor-demo'));
};

export const validateNativeArtifactPaths = ({
  fixtureRoot,
  repoRoot,
  pluginGradlePath,
  androidSettingsPath,
  capAppSpmPath,
  pluginSwiftPackagePath,
  pluginSwiftSourcePath,
  capacitorConfigPath,
} = {}) => {
  const failures = [];
  const fixturePaths = [
    ['pluginGradlePath', pluginGradlePath],
    ['androidSettingsPath', androidSettingsPath],
    ['capAppSpmPath', capAppSpmPath],
    ['pluginSwiftPackagePath', pluginSwiftPackagePath],
    ['pluginSwiftSourcePath', pluginSwiftSourcePath],
    ['capacitorConfigPath', capacitorConfigPath],
  ].filter(([, value]) => typeof value === 'string' && value.trim() !== '');

  if (fixtureRoot) {
    for (const [key, value] of fixturePaths) {
      if (!isPathInside(value, fixtureRoot)) {
        failures.push(`Native validator path coupling detected: ${key} must stay inside fixture root (${fixtureRoot}) but received ${value}.`);
      }
    }
  }

  if (repoRoot) {
    for (const [, value] of fixturePaths) {
      if (isPathCoupledToMonorepoHost(value, repoRoot)) {
        failures.push(`Native validator path coupling detected: expected fixture-owned paths, received monorepo host path ${value}.`);
      }
    }
  }

  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    failures,
    exitCode: status === PASS ? 0 : 1,
  };
};

function parseCapacitorConfigPackageClassList(configJson) {
  try {
    const parsed = JSON.parse(configJson);
    return Array.isArray(parsed.packageClassList) ? parsed.packageClassList : [];
  } catch {
    return null;
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function parseExpectedIosContract(nativeArtifactsContractJson) {
  if (!nativeArtifactsContractJson) {
    return null;
  }

  const parsedContract = JSON.parse(nativeArtifactsContractJson);
  const packageUrl = parsedContract?.ios?.packageUrl;
  const packageName = parsedContract?.ios?.packageName;
  const product = parsedContract?.ios?.product;
  const version = parsedContract?.ios?.version;
  if (
    typeof packageUrl !== 'string'
    || typeof packageName !== 'string'
    || typeof product !== 'string'
    || typeof version !== 'string'
  ) {
    return null;
  }

  return {
    packageUrl,
    packageName,
    product,
    version,
  };
}

function makeIosExactRemoteDependencyPattern(expectedIosContract) {
  if (!expectedIosContract) {
    return /\.package\(url:\s*"https:\/\/github\.com\/legato\/legato-ios-core\.git",\s*exact:\s*"[^"]+"\)/;
  }

  return new RegExp(`\\.package\\(url:\\s*"${escapeRegExp(expectedIosContract.packageUrl)}",\\s*exact:\\s*"${escapeRegExp(expectedIosContract.version)}"\\)`);
}

function parseExpectedAndroidCoordinate({ nativeArtifactsContractJson, pluginBuildGradle }) {
  if (nativeArtifactsContractJson) {
    const parsedContract = JSON.parse(nativeArtifactsContractJson);
    const group = parsedContract?.android?.group;
    const artifact = parsedContract?.android?.artifact;
    const version = parsedContract?.android?.version;
    if (typeof group === 'string' && typeof artifact === 'string' && typeof version === 'string') {
      return `${group}:${artifact}:${version}`;
    }
  }

  const coordinateMatch = pluginBuildGradle.match(/coordinate:\s*'([^']+)'/);
  return coordinateMatch ? coordinateMatch[1] : null;
}

function makeUnresolvedCoordinatePattern(coordinate) {
  if (!coordinate) {
    return null;
  }
  return new RegExp(`Could not find\\s+${escapeRegExp(coordinate)}(?:\\.|\\s|$)`, 'i');
}

export const validateNativeArtifacts = ({
  pluginBuildGradle,
  nativeArtifactsContractJson = '',
  androidSettingsGradle = '',
  capAppSpmPackageSwift = '',
  pluginPackageSwift = '',
  pluginSwiftSource = '',
  capacitorConfigJson = '',
  androidResolutionLog = '',
  iosResolutionLog = '',
}) => {
  const failures = [];
  let expectedAndroidCoordinate;
  let expectedIosContract;

  try {
    expectedAndroidCoordinate = parseExpectedAndroidCoordinate({
      nativeArtifactsContractJson,
      pluginBuildGradle,
    });
  } catch {
    failures.push('Failed to parse native-artifacts.json for expected Android publication coordinates.');
    expectedAndroidCoordinate = null;
  }

  try {
    expectedIosContract = parseExpectedIosContract(nativeArtifactsContractJson);
  } catch {
    failures.push('Failed to parse native-artifacts.json for expected iOS package contract.');
    expectedIosContract = null;
  }

  const unresolvedCoordinatePattern = makeUnresolvedCoordinatePattern(expectedAndroidCoordinate);
  const iosExactRemoteDependencyPattern = makeIosExactRemoteDependencyPattern(expectedIosContract);

  if (LOCAL_PROJECT_DEPENDENCY_PATTERN.test(pluginBuildGradle)) {
    failures.push("Local-project regression detected in plugin dependency graph: remove project(':native:android:core') and keep artifact coordinates only.");
  }

  if (!ARTIFACT_COORDINATE_PATTERN.test(pluginBuildGradle)) {
    failures.push('Artifact-coordinate dependency is missing: expected `implementation legatoNativeArtifactContract.coordinate` in plugin build.gradle.');
  }

  if (androidSettingsGradle && HOST_MANUAL_NATIVE_CORE_INCLUDE_PATTERN.test(androidSettingsGradle)) {
    failures.push('Android host regression detected in android/settings.gradle: remove manual `include \'native:android:core\'` wiring and rely on plugin artifact dependencies only.');
  }

  const unresolvedMatch = unresolvedCoordinatePattern ? androidResolutionLog.match(unresolvedCoordinatePattern) : null;
  if (unresolvedMatch) {
    failures.push(`Android artifact resolution failed: ${unresolvedMatch[0]}`);
  }

  if (pluginPackageSwift && IOS_LOCAL_PATH_DEPENDENCY_PATTERN.test(pluginPackageSwift)) {
    failures.push('iOS local-path regression detected in Package.swift: remove `.package(path: ...)` and keep remote URL + exact pinning.');
  }

  if (pluginPackageSwift && !iosExactRemoteDependencyPattern.test(pluginPackageSwift)) {
    const expectedSnippet = expectedIosContract
      ? `.package(url: "${expectedIosContract.packageUrl}", exact: "${expectedIosContract.version}")`
      : '.package(url: "<ios.packageUrl>", exact: "<ios.version>")';
    failures.push(`iOS remote Swift package dependency is missing: expected \`${expectedSnippet}\` in Package.swift.`);
  }

  if (expectedIosContract && pluginPackageSwift) {
    const expectedProductDependency = new RegExp(`\\.product\\(name:\\s*"${escapeRegExp(expectedIosContract.product)}",\\s*package:\\s*"${escapeRegExp(expectedIosContract.packageName)}"\\)`);
    if (!expectedProductDependency.test(pluginPackageSwift)) {
      failures.push(`iOS product identity mismatch: expected .product(name: "${expectedIosContract.product}", package: "${expectedIosContract.packageName}") in Package.swift.`);
    }
  }

  if (capAppSpmPackageSwift && !CAP_APP_SPM_GENERATED_OWNERSHIP_PATTERN.test(capAppSpmPackageSwift)) {
    failures.push('CapApp-SPM integrity regression: expected generated ownership marker `DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands`.');
  }

  if (capAppSpmPackageSwift && CAP_APP_SPM_MANUAL_LEGATO_CORE_PATH_PATTERN.test(capAppSpmPackageSwift)) {
    failures.push('CapApp-SPM regression detected: remove manual local LegatoCore path wiring and keep generated package dependencies only.');
  }

  const iosProductMismatch = iosResolutionLog.match(IOS_SPM_PRODUCT_MISMATCH_PATTERN);
  if (iosProductMismatch) {
    failures.push(`iOS SwiftPM resolver product mismatch: ${iosProductMismatch[0]}`);
  }
  const iosMissingProduct = iosResolutionLog.match(IOS_SPM_MISSING_PRODUCT_PATTERN);
  if (iosMissingProduct) {
    failures.push(`iOS SwiftPM resolver missing product: ${iosMissingProduct[0]}`);
  }

  if (pluginSwiftSource && !IOS_PLUGIN_OBJC_PATTERN.test(pluginSwiftSource)) {
    failures.push('iOS plugin discoverability regression: expected `@objc(LegatoPlugin)` in LegatoPlugin.swift.');
  }

  if (pluginSwiftSource && !IOS_PLUGIN_BRIDGE_PATTERN.test(pluginSwiftSource)) {
    failures.push('iOS plugin discoverability regression: expected `LegatoPlugin: CAPPlugin, CAPBridgedPlugin` in LegatoPlugin.swift.');
  }

  const packageClassList = capacitorConfigJson ? parseCapacitorConfigPackageClassList(capacitorConfigJson) : [];
  if (packageClassList === null) {
    failures.push('Failed to parse capacitor.config.json for packageClassList checks.');
  } else if (capacitorConfigJson && !packageClassList.includes('LegatoPlugin')) {
    failures.push('iOS plugin discoverability regression: expected `"LegatoPlugin"` in capacitor.config.json packageClassList.');
  }

  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    checks: {
      localProjectDependencyAbsent: !LOCAL_PROJECT_DEPENDENCY_PATTERN.test(pluginBuildGradle),
      artifactCoordinatePresent: ARTIFACT_COORDINATE_PATTERN.test(pluginBuildGradle),
      hostManualNativeCoreIncludeAbsent: !HOST_MANUAL_NATIVE_CORE_INCLUDE_PATTERN.test(androidSettingsGradle),
      unresolvedModuleDetected: Boolean(unresolvedMatch),
      iosLocalPathDependencyAbsent: !IOS_LOCAL_PATH_DEPENDENCY_PATTERN.test(pluginPackageSwift),
      iosExactRemoteDependencyPresent: iosExactRemoteDependencyPattern.test(pluginPackageSwift),
      capAppSpmOwnershipMarkerPresent: CAP_APP_SPM_GENERATED_OWNERSHIP_PATTERN.test(capAppSpmPackageSwift),
      capAppSpmManualLegatoCorePathAbsent: !CAP_APP_SPM_MANUAL_LEGATO_CORE_PATH_PATTERN.test(capAppSpmPackageSwift),
      iosResolverProductMismatchDetected: Boolean(iosProductMismatch || iosMissingProduct),
      iosObjcPluginShapePresent: IOS_PLUGIN_OBJC_PATTERN.test(pluginSwiftSource),
      iosBridgedPluginShapePresent: IOS_PLUGIN_BRIDGE_PATTERN.test(pluginSwiftSource),
      capacitorPackageClassListContainsLegatoPlugin: packageClassList === null ? false : packageClassList.includes('LegatoPlugin'),
    },
    failures,
  };
};

export const formatNativeArtifactValidation = (result) => {
  const lines = [`Overall: ${result.status}`, `android-artifacts: ${result.status}`, `ios-artifacts: ${result.status}`];

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
    androidResolutionLogPath: undefined,
    iosResolutionLogPath: undefined,
    fixtureRoot: undefined,
    repoRoot: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--plugin-gradle' && argv[i + 1]) {
      options.pluginGradlePath = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--android-resolution-log' && argv[i + 1]) {
      options.androidResolutionLogPath = argv[i + 1];
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

    if (arg === '--ios-resolution-log' && argv[i + 1]) {
      options.iosResolutionLogPath = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--fixture-root' && argv[i + 1]) {
      options.fixtureRoot = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg === '--repo-root' && argv[i + 1]) {
      options.repoRoot = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const {
    pluginGradlePath,
    nativeArtifactsContractPath,
    androidSettingsPath,
    capAppSpmPath,
    pluginSwiftPackagePath,
    pluginSwiftSourcePath,
    capacitorConfigPath,
    androidResolutionLogPath,
    iosResolutionLogPath,
    fixtureRoot,
    repoRoot,
  } = parseArgs(process.argv.slice(2));

  if (!pluginGradlePath) {
    process.stdout.write('Overall: FAIL\nandroid-artifacts: FAIL\nios-artifacts: FAIL\nFailures:\n- Usage: node scripts/validate-native-artifacts.mjs --plugin-gradle <path> [--native-artifacts-contract <path>] [--android-settings <path>] [--capapp-spm-package <path>] [--plugin-swift-package <path>] [--plugin-swift-source <path>] [--capacitor-config <path>] [--android-resolution-log <path>] [--ios-resolution-log <path>] [--fixture-root <path>] [--repo-root <path>]\n');
    process.exit(1);
  }

  try {
    const pluginBuildGradle = await readFile(pluginGradlePath, 'utf8');
    const nativeArtifactsContractJson = nativeArtifactsContractPath
      ? await readFile(nativeArtifactsContractPath, 'utf8')
      : '';
    const androidResolutionLog = androidResolutionLogPath
      ? await readFile(androidResolutionLogPath, 'utf8')
      : '';
    const androidSettingsGradle = androidSettingsPath
      ? await readFile(androidSettingsPath, 'utf8')
      : '';
    const capAppSpmPackageSwift = capAppSpmPath
      ? await readFile(capAppSpmPath, 'utf8')
      : '';
    const pluginPackageSwift = pluginSwiftPackagePath
      ? await readFile(pluginSwiftPackagePath, 'utf8')
      : '';
    const pluginSwiftSource = pluginSwiftSourcePath
      ? await readFile(pluginSwiftSourcePath, 'utf8')
      : '';
    const capacitorConfigJson = capacitorConfigPath
      ? await readFile(capacitorConfigPath, 'utf8')
      : '';
    const iosResolutionLog = iosResolutionLogPath
      ? await readFile(iosResolutionLogPath, 'utf8')
      : '';

    const result = validateNativeArtifacts({
      pluginBuildGradle,
      nativeArtifactsContractJson,
      androidSettingsGradle,
      capAppSpmPackageSwift,
      pluginPackageSwift,
      pluginSwiftSource,
      capacitorConfigJson,
      androidResolutionLog,
      iosResolutionLog,
    });

    const pathValidation = validateNativeArtifactPaths({
      fixtureRoot,
      repoRoot,
      pluginGradlePath,
      androidSettingsPath,
      capAppSpmPath,
      pluginSwiftPackagePath,
      pluginSwiftSourcePath,
      capacitorConfigPath,
    });

    if (pathValidation.failures.length > 0) {
      result.failures.push(...pathValidation.failures);
      result.status = FAIL;
      result.exitCode = 1;
    }

    process.stdout.write(`${formatNativeArtifactValidation(result)}\n`);
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    process.stdout.write(`Overall: FAIL\nandroid-artifacts: FAIL\nios-artifacts: FAIL\nFailures:\n- Failed to read validator inputs: ${message}\n`);
    process.exit(1);
  }
}
