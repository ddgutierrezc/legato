import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASS = 'PASS';
const FAIL = 'FAIL';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const defaultPaths = {
  contractPath: resolve(scriptDir, '../native-artifacts.json'),
  nativePackagePath: resolve(scriptDir, '../../../native/ios/LegatoCore/Package.swift'),
  pluginPackagePath: resolve(scriptDir, '../Package.swift'),
};

const normalizeIosContract = (contract = {}) => {
  const ios = contract.ios ?? {};
  return {
    packageUrl: typeof ios.packageUrl === 'string' ? ios.packageUrl.trim() : '',
    packageName: typeof ios.packageName === 'string' ? ios.packageName.trim() : '',
    product: typeof ios.product === 'string' ? ios.product.trim() : '',
    version: typeof ios.version === 'string' ? ios.version.trim() : '',
    versionPolicy: typeof ios.versionPolicy === 'string' ? ios.versionPolicy.trim() : '',
  };
};

const parseTagVersion = (releaseTag = '') => releaseTag.trim().replace(/^v/i, '');

const parsePackageName = (packageSwift) => packageSwift.match(/\bname:\s*"([^"]+)"/)?.[1]?.trim() ?? '';

const parseLibraryProductNames = (packageSwift) => {
  const products = [];
  const matcher = /\.library\(\s*name:\s*"([^"]+)"/g;
  let match = matcher.exec(packageSwift);
  while (match) {
    products.push(match[1].trim());
    match = matcher.exec(packageSwift);
  }
  return products;
};

const parsePluginRemoteDependencies = (pluginPackageSwift) => {
  const dependencies = [];
  const matcher = /\.package\(\s*url:\s*"([^"]+)"\s*,\s*exact:\s*"([^"]+)"\s*\)/g;
  let match = matcher.exec(pluginPackageSwift);
  while (match) {
    dependencies.push({
      packageUrl: match[1].trim(),
      version: match[2].trim(),
    });
    match = matcher.exec(pluginPackageSwift);
  }
  return dependencies;
};

const parsePluginProductDependencies = (pluginPackageSwift) => {
  const dependencies = [];
  const matcher = /\.product\(\s*name:\s*"([^"]+)"\s*,\s*package:\s*"([^"]+)"\s*\)/g;
  let match = matcher.exec(pluginPackageSwift);
  while (match) {
    dependencies.push({
      product: match[1].trim(),
      packageName: match[2].trim(),
    });
    match = matcher.exec(pluginPackageSwift);
  }
  return dependencies;
};

const parseManagedContractBlock = (pluginPackageSwift) => {
  const packageUrl = pluginPackageSwift.match(/packageUrl:\s*"([^"]+)"/)?.[1]?.trim() ?? '';
  const packageName = pluginPackageSwift.match(/packageName:\s*"([^"]+)"/)?.[1]?.trim() ?? '';
  const product = pluginPackageSwift.match(/product:\s*"([^"]+)"/)?.[1]?.trim() ?? '';
  const versionPolicy = pluginPackageSwift.match(/versionPolicy:\s*"([^"]+)"/)?.[1]?.trim() ?? '';
  const version = pluginPackageSwift.match(/version:\s*"([^"]+)"/)?.[1]?.trim() ?? '';
  if (!packageUrl && !packageName && !product && !versionPolicy && !version) {
    return null;
  }
  return {
    packageUrl,
    packageName,
    product,
    versionPolicy,
    version,
  };
};

const readContractFile = async (contractPath, fileReader = readFile) => {
  const raw = await fileReader(contractPath, 'utf8');
  return normalizeIosContract(JSON.parse(raw));
};

const ensureContractPresence = (contract) => {
  const failures = [];
  if (!contract.packageUrl) failures.push('Missing ios.packageUrl in native-artifacts contract.');
  if (!contract.packageName) failures.push('Missing ios.packageName in native-artifacts contract.');
  if (!contract.product) failures.push('Missing ios.product in native-artifacts contract.');
  if (!contract.version) failures.push('Missing ios.version in native-artifacts contract.');
  if (contract.versionPolicy !== 'exact') failures.push('iOS version policy mismatch: expected ios.versionPolicy to be "exact".');
  return failures;
};

const makeResult = ({ status, failures = [], details = {} }) => ({
  status,
  exitCode: status === PASS ? 0 : 1,
  failures,
  details,
});

export const runIosReleasePreflight = async ({
  contract,
  contractPath = defaultPaths.contractPath,
  nativePackageSwift,
  nativePackagePath = defaultPaths.nativePackagePath,
  pluginPackageSwift,
  pluginPackagePath = defaultPaths.pluginPackagePath,
  releaseTag,
  fileReader = readFile,
} = {}) => {
  const failures = [];
  const resolvedContract = contract ? normalizeIosContract(contract) : await readContractFile(contractPath, fileReader);
  failures.push(...ensureContractPresence(resolvedContract));

  const normalizedTag = typeof releaseTag === 'string' ? releaseTag.trim() : '';
  if (!normalizedTag) {
    failures.push('Missing required iOS release tag input. Pass --release-tag <tag>.');
  }

  const normalizedTagVersion = parseTagVersion(normalizedTag);
  if (normalizedTag && resolvedContract.version && normalizedTagVersion !== resolvedContract.version) {
    failures.push(`iOS tag/version mismatch: release tag ${normalizedTag} does not match contract version ${resolvedContract.version}.`);
  }

  const nativePackage = typeof nativePackageSwift === 'string'
    ? nativePackageSwift
    : await fileReader(nativePackagePath, 'utf8');
  const pluginPackage = typeof pluginPackageSwift === 'string'
    ? pluginPackageSwift
    : await fileReader(pluginPackagePath, 'utf8');

  const nativePackageName = parsePackageName(nativePackage);
  const nativeProducts = parseLibraryProductNames(nativePackage);
  if (nativePackageName !== resolvedContract.packageName) {
    failures.push(`iOS package identity mismatch: native Package.swift name is ${nativePackageName || '<missing>'}, expected ${resolvedContract.packageName}.`);
  }
  if (!nativeProducts.includes(resolvedContract.product)) {
    failures.push(`iOS product identity mismatch: native Package.swift does not expose product ${resolvedContract.product}.`);
  }

  const pluginRemoteDependencies = parsePluginRemoteDependencies(pluginPackage);
  const pluginRemote = pluginRemoteDependencies.find((entry) => entry.version === resolvedContract.version)
    ?? pluginRemoteDependencies[0]
    ?? null;
  if (!pluginRemote) {
    failures.push('iOS plugin metadata mismatch: Package.swift is missing `.package(url: ..., exact: ...)` dependency for LegatoCore.');
  } else {
    if (pluginRemote.packageUrl !== resolvedContract.packageUrl) {
      failures.push(`iOS package URL mismatch: plugin Package.swift uses ${pluginRemote.packageUrl}, expected ${resolvedContract.packageUrl}.`);
    }
    if (pluginRemote.version !== resolvedContract.version) {
      failures.push(`iOS dependency version mismatch: plugin Package.swift exact version ${pluginRemote.version} does not match contract ${resolvedContract.version}.`);
    }
  }

  const pluginProductDependencies = parsePluginProductDependencies(pluginPackage);
  const pluginProduct = pluginProductDependencies.find((entry) => entry.packageName === resolvedContract.packageName) ?? null;
  if (!pluginProduct) {
    failures.push('iOS plugin metadata mismatch: Package.swift is missing `.product(name: ..., package: ...)` for LegatoCore.');
  } else if (pluginProduct.product !== resolvedContract.product) {
    failures.push(`iOS product identity mismatch: plugin Product dependency is ${pluginProduct.product}/${pluginProduct.packageName}, expected ${resolvedContract.product}/${resolvedContract.packageName}.`);
  }

  const managedContract = parseManagedContractBlock(pluginPackage);
  if (!managedContract) {
    failures.push('iOS plugin metadata mismatch: managed native-artifacts contract block is missing in plugin Package.swift.');
  } else {
    if (managedContract.packageUrl !== resolvedContract.packageUrl) {
      failures.push(`iOS managed metadata mismatch: packageUrl ${managedContract.packageUrl || '<missing>'} must equal ${resolvedContract.packageUrl}.`);
    }
    if (managedContract.packageName !== resolvedContract.packageName) {
      failures.push(`iOS managed metadata mismatch: packageName ${managedContract.packageName || '<missing>'} must equal ${resolvedContract.packageName}.`);
    }
    if (managedContract.product !== resolvedContract.product) {
      failures.push(`iOS managed metadata mismatch: product ${managedContract.product || '<missing>'} must equal ${resolvedContract.product}.`);
    }
    if (managedContract.versionPolicy !== resolvedContract.versionPolicy) {
      failures.push(`iOS managed metadata mismatch: versionPolicy ${managedContract.versionPolicy || '<missing>'} must equal ${resolvedContract.versionPolicy}.`);
    }
    if (managedContract.version !== resolvedContract.version) {
      failures.push(`iOS managed metadata mismatch: version ${managedContract.version || '<missing>'} must equal ${resolvedContract.version}.`);
    }
  }

  return makeResult({
    status: failures.length === 0 ? PASS : FAIL,
    failures,
    details: {
      mode: 'ios-preflight',
      releaseTag: normalizedTag,
      expectedVersion: resolvedContract.version,
      expectedPackageUrl: resolvedContract.packageUrl,
      expectedPackageName: resolvedContract.packageName,
      expectedProduct: resolvedContract.product,
      readyForManualHandoff: failures.length === 0,
    },
  });
};

export const formatIosPreflightSummary = (result) => {
  const lines = [
    `Mode: ${result.details?.mode ?? 'ios-preflight'}`,
    `Overall: ${result.status}`,
    `Release tag: ${result.details?.releaseTag ?? ''}`,
    `Expected version: ${result.details?.expectedVersion ?? ''}`,
    `Manual handoff ready: ${result.details?.readyForManualHandoff ? 'YES' : 'NO'}`,
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
    contractPath: defaultPaths.contractPath,
    nativePackagePath: defaultPaths.nativePackagePath,
    pluginPackagePath: defaultPaths.pluginPackagePath,
    releaseTag: '',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--contract' && argv[i + 1]) {
      options.contractPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--native-package' && argv[i + 1]) {
      options.nativePackagePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--plugin-package' && argv[i + 1]) {
      options.pluginPackagePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-tag' && argv[i + 1]) {
      options.releaseTag = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.releaseTag) {
    process.stdout.write('Mode: ios-preflight\nOverall: FAIL\nManual handoff ready: NO\nFailures:\n- Usage: node scripts/release-ios-preflight.mjs --release-tag <tag> [--contract <path>] [--native-package <path>] [--plugin-package <path>]\n');
    process.exit(1);
  }

  try {
    const result = await runIosReleasePreflight(options);
    process.stdout.write(`${formatIosPreflightSummary(result)}\n`);
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Mode: ios-preflight\nOverall: FAIL\nManual handoff ready: NO\nFailures:\n- Unexpected failure: ${message}\n`);
    process.exit(1);
  }
}
