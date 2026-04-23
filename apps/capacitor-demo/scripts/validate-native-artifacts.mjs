import { readFile } from 'node:fs/promises';

const PASS = 'PASS';
const FAIL = 'FAIL';

const LOCAL_PROJECT_DEPENDENCY_PATTERN = /implementation\s+project\(':native:android:core'\)/;
const ARTIFACT_COORDINATE_PATTERN = /implementation\s+legatoNativeArtifactContract\.coordinate/;
const HOST_MANUAL_NATIVE_CORE_INCLUDE_PATTERN = /include\s+':native:android:core'/;
const UNRESOLVED_COORDINATE_PATTERN = /Could not find\s+io\.legato:legato-android-core:[^\s]+/i;
const IOS_LOCAL_PATH_DEPENDENCY_PATTERN = /\.package\(path:\s*"[^"]*LegatoCore[^"]*"\)/;
const IOS_EXACT_REMOTE_DEPENDENCY_PATTERN = /\.package\(url:\s*"https:\/\/github\.com\/legato\/legato-ios-core\.git",\s*exact:\s*"[^"]+"\)/;
const IOS_SPM_PRODUCT_MISMATCH_PATTERN = /product\s+'[^']+'\s+required\s+by\s+package.*not\s+found/i;
const IOS_SPM_MISSING_PRODUCT_PATTERN = /Missing\s+package\s+product/i;
const IOS_PLUGIN_OBJC_PATTERN = /@objc\(LegatoPlugin\)/;
const IOS_PLUGIN_BRIDGE_PATTERN = /class\s+LegatoPlugin\s*:\s*CAPPlugin,\s*CAPBridgedPlugin/;
const CAP_APP_SPM_GENERATED_OWNERSHIP_PATTERN = /DO NOT MODIFY THIS FILE - managed by Capacitor CLI commands/;
const CAP_APP_SPM_MANUAL_LEGATO_CORE_PATH_PATTERN = /\.package\(path:\s*"[^"]*LegatoCore[^"]*"\)/;

function parseCapacitorConfigPackageClassList(configJson) {
  try {
    const parsed = JSON.parse(configJson);
    return Array.isArray(parsed.packageClassList) ? parsed.packageClassList : [];
  } catch {
    return null;
  }
}

export const validateNativeArtifacts = ({
  pluginBuildGradle,
  androidSettingsGradle = '',
  capAppSpmPackageSwift = '',
  pluginPackageSwift = '',
  pluginSwiftSource = '',
  capacitorConfigJson = '',
  androidResolutionLog = '',
  iosResolutionLog = '',
}) => {
  const failures = [];

  if (LOCAL_PROJECT_DEPENDENCY_PATTERN.test(pluginBuildGradle)) {
    failures.push("Local-project regression detected in plugin dependency graph: remove project(':native:android:core') and keep artifact coordinates only.");
  }

  if (!ARTIFACT_COORDINATE_PATTERN.test(pluginBuildGradle)) {
    failures.push('Artifact-coordinate dependency is missing: expected `implementation legatoNativeArtifactContract.coordinate` in plugin build.gradle.');
  }

  if (androidSettingsGradle && HOST_MANUAL_NATIVE_CORE_INCLUDE_PATTERN.test(androidSettingsGradle)) {
    failures.push('Android host regression detected in android/settings.gradle: remove manual `include \'native:android:core\'` wiring and rely on plugin artifact dependencies only.');
  }

  const unresolvedMatch = androidResolutionLog.match(UNRESOLVED_COORDINATE_PATTERN);
  if (unresolvedMatch) {
    failures.push(`Android artifact resolution failed: ${unresolvedMatch[0]}`);
  }

  if (pluginPackageSwift && IOS_LOCAL_PATH_DEPENDENCY_PATTERN.test(pluginPackageSwift)) {
    failures.push('iOS local-path regression detected in Package.swift: remove `.package(path: ...)` and keep remote URL + exact pinning.');
  }

  if (pluginPackageSwift && !IOS_EXACT_REMOTE_DEPENDENCY_PATTERN.test(pluginPackageSwift)) {
    failures.push('iOS remote Swift package dependency is missing: expected `.package(url: "https://github.com/legato/legato-ios-core.git", exact: "<version>")` in Package.swift.');
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
      iosExactRemoteDependencyPresent: IOS_EXACT_REMOTE_DEPENDENCY_PATTERN.test(pluginPackageSwift),
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
    androidSettingsPath: undefined,
    capAppSpmPath: undefined,
    pluginSwiftPackagePath: undefined,
    pluginSwiftSourcePath: undefined,
    capacitorConfigPath: undefined,
    androidResolutionLogPath: undefined,
    iosResolutionLogPath: undefined,
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
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const {
    pluginGradlePath,
    androidSettingsPath,
    capAppSpmPath,
    pluginSwiftPackagePath,
    pluginSwiftSourcePath,
    capacitorConfigPath,
    androidResolutionLogPath,
    iosResolutionLogPath,
  } = parseArgs(process.argv.slice(2));

  if (!pluginGradlePath) {
    process.stdout.write('Overall: FAIL\nandroid-artifacts: FAIL\nios-artifacts: FAIL\nFailures:\n- Usage: node scripts/validate-native-artifacts.mjs --plugin-gradle <path> [--android-settings <path>] [--capapp-spm-package <path>] [--plugin-swift-package <path>] [--plugin-swift-source <path>] [--capacitor-config <path>] [--android-resolution-log <path>] [--ios-resolution-log <path>]\n');
    process.exit(1);
  }

  try {
    const pluginBuildGradle = await readFile(pluginGradlePath, 'utf8');
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
      androidSettingsGradle,
      capAppSpmPackageSwift,
      pluginPackageSwift,
      pluginSwiftSource,
      capacitorConfigJson,
      androidResolutionLog,
      iosResolutionLog,
    });

    process.stdout.write(`${formatNativeArtifactValidation(result)}\n`);
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    process.stdout.write(`Overall: FAIL\nandroid-artifacts: FAIL\nios-artifacts: FAIL\nFailures:\n- Failed to read validator inputs: ${message}\n`);
    process.exit(1);
  }
}
