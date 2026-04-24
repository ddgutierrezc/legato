import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PASS = 'PASS';
const FAIL = 'FAIL';

const scriptDir = dirname(fileURLToPath(import.meta.url));

const defaultPaths = {
  contractPath: resolve(scriptDir, '../native-artifacts.json'),
  nativePackagePath: resolve(scriptDir, '../../../native/ios/LegatoCore/Package.swift'),
  pluginPackagePath: resolve(scriptDir, '../Package.swift'),
  distributionRepoPath: resolve(scriptDir, '../../../../legato-ios-core'),
  provenancePath: resolve(scriptDir, '../../../../legato-ios-core/distribution-provenance.json'),
};

const REQUIRED_DISTRIBUTION_PATHS = [
  'Package.swift',
  'Sources/LegatoCore',
  'Sources/LegatoCoreSessionRuntimeiOS',
  'Tests/LegatoCoreTests',
  'Tests/LegatoCoreSessionRuntimeiOSTests',
  'README.md',
  'LICENSE',
  '.gitignore',
  'distribution-provenance.json',
];
const REQUIRED_DISTRIBUTION_DIRECTORIES = new Set([
  'Sources/LegatoCore',
  'Sources/LegatoCoreSessionRuntimeiOS',
  'Tests/LegatoCoreTests',
  'Tests/LegatoCoreSessionRuntimeiOSTests',
]);

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

const toIsoTimestamp = (date = new Date()) => date.toISOString();

const parseProvenance = (raw) => {
  const parsed = JSON.parse(raw);
  return {
    sourceRepo: typeof parsed.sourceRepo === 'string' ? parsed.sourceRepo.trim() : '',
    sourceCommit: typeof parsed.sourceCommit === 'string' ? parsed.sourceCommit.trim() : '',
    packageName: typeof parsed.packageName === 'string' ? parsed.packageName.trim() : '',
    product: typeof parsed.product === 'string' ? parsed.product.trim() : '',
    version: typeof parsed.version === 'string' ? parsed.version.trim() : '',
    releaseTag: typeof parsed.releaseTag === 'string' ? parsed.releaseTag.trim() : '',
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt.trim() : '',
  };
};

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

const ensureDistributionPayloadPaths = async (distributionRepoPath, fileReader = readFile, pathStat = stat) => {
  const failures = [];

  for (const relativePath of REQUIRED_DISTRIBUTION_PATHS) {
    try {
      const absolutePath = resolve(distributionRepoPath, relativePath);
      if (REQUIRED_DISTRIBUTION_DIRECTORIES.has(relativePath)) {
        const info = await pathStat(absolutePath);
        if (!info.isDirectory()) {
          failures.push(`Distribution bootstrap missing required path: ${relativePath}`);
        }
      } else {
        await fileReader(absolutePath, 'utf8');
      }
    } catch {
      failures.push(`Distribution bootstrap missing required path: ${relativePath}`);
    }
  }

  return failures;
};

const ensureProvenanceContract = ({ provenance, contract, releaseTag }) => {
  const failures = [];
  if (!provenance.sourceRepo) failures.push('Distribution provenance missing sourceRepo.');
  if (!provenance.sourceCommit) failures.push('Distribution provenance missing sourceCommit.');
  if (!/^[0-9a-f]{7,40}$/i.test(provenance.sourceCommit)) {
    failures.push('Distribution provenance sourceCommit must be a git SHA (7-40 hex chars).');
  }
  if (provenance.packageName !== contract.packageName) {
    failures.push(`Distribution provenance packageName mismatch: ${provenance.packageName || '<missing>'} must equal ${contract.packageName}.`);
  }
  if (provenance.product !== contract.product) {
    failures.push(`Distribution provenance product mismatch: ${provenance.product || '<missing>'} must equal ${contract.product}.`);
  }
  if (provenance.version !== contract.version) {
    failures.push(`Distribution provenance version mismatch: ${provenance.version || '<missing>'} must equal ${contract.version}.`);
  }
  if (provenance.releaseTag !== releaseTag) {
    failures.push(`Distribution provenance releaseTag mismatch: ${provenance.releaseTag || '<missing>'} must equal ${releaseTag}.`);
  }
  if (!provenance.exportedAt || Number.isNaN(Date.parse(provenance.exportedAt))) {
    failures.push('Distribution provenance exportedAt must be a valid ISO8601 timestamp.');
  }
  return failures;
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
  distributionRepoPath = defaultPaths.distributionRepoPath,
  provenancePath = defaultPaths.provenancePath,
  provenanceJson,
  releaseTag,
  releaseId = 'manual',
  mode = 'preflight',
  fileReader = readFile,
  pathStat = stat,
} = {}) => {
  const failures = [];
  const resolvedContract = contract ? normalizeIosContract(contract) : await readContractFile(contractPath, fileReader);
  const contractFailures = ensureContractPresence(resolvedContract);
  failures.push(...contractFailures);

  const normalizedTag = typeof releaseTag === 'string' ? releaseTag.trim() : '';
  if (!normalizedTag) {
    failures.push('Missing required iOS release tag input. Pass --release-tag <tag>.');
  }

  const normalizedTagVersion = parseTagVersion(normalizedTag);
  if (normalizedTag && resolvedContract.version && normalizedTagVersion !== resolvedContract.version) {
    failures.push(`iOS tag/version mismatch: release tag ${normalizedTag} does not match contract version ${resolvedContract.version}.`);
  }

  if (contractFailures.length > 0) {
    return makeResult({
      status: FAIL,
      failures,
      details: {
        mode: 'ios-preflight',
        controlPlaneMode: mode,
        releaseId,
        releaseTag: normalizedTag,
        expectedVersion: resolvedContract.version,
        expectedPackageUrl: resolvedContract.packageUrl,
        expectedPackageName: resolvedContract.packageName,
        expectedProduct: resolvedContract.product,
        readyForManualHandoff: false,
      },
    });
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

  const distributionBootstrapFailures = await ensureDistributionPayloadPaths(distributionRepoPath, fileReader, pathStat);
  failures.push(...distributionBootstrapFailures);

  let distributionPackageSwift = '';
  try {
    distributionPackageSwift = await fileReader(resolve(distributionRepoPath, 'Package.swift'), 'utf8');
  } catch {
    // covered by ensureDistributionPayloadPaths
  }
  if (distributionPackageSwift) {
    const distributionPackageName = parsePackageName(distributionPackageSwift);
    const distributionProducts = parseLibraryProductNames(distributionPackageSwift);
    if (distributionPackageName !== resolvedContract.packageName) {
      failures.push(`Distribution package identity mismatch: ${distributionPackageName || '<missing>'} must equal ${resolvedContract.packageName}.`);
    }
    if (!distributionProducts.includes(resolvedContract.product)) {
      failures.push(`Distribution product identity mismatch: expected ${resolvedContract.product} in distribution Package.swift.`);
    }
  }

  let parsedProvenance = null;
  try {
    const rawProvenance = typeof provenanceJson === 'string' ? provenanceJson : await fileReader(provenancePath, 'utf8');
    parsedProvenance = parseProvenance(rawProvenance);
  } catch (error) {
    failures.push(`Distribution provenance missing or unreadable at ${provenancePath}: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (parsedProvenance) {
    failures.push(...ensureProvenanceContract({
      provenance: parsedProvenance,
      contract: resolvedContract,
      releaseTag: normalizedTag,
    }));
  }

  return makeResult({
    status: failures.length === 0 ? PASS : FAIL,
    failures,
    details: {
      mode: 'ios-preflight',
      controlPlaneMode: mode,
      releaseId,
      releaseTag: normalizedTag,
      expectedVersion: resolvedContract.version,
      expectedPackageUrl: resolvedContract.packageUrl,
      expectedPackageName: resolvedContract.packageName,
      expectedProduct: resolvedContract.product,
      distributionRepoPath,
      provenancePath,
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

const makePreflightArtifact = (result, generatedAt = toIsoTimestamp()) => ({
  status: result.status,
  releaseId: result.details?.releaseId ?? 'manual',
  controlPlaneMode: result.details?.controlPlaneMode ?? 'preflight',
  releaseTag: result.details?.releaseTag ?? '',
  expectedVersion: result.details?.expectedVersion ?? '',
  expectedPackageUrl: result.details?.expectedPackageUrl ?? '',
  expectedPackageName: result.details?.expectedPackageName ?? '',
  expectedProduct: result.details?.expectedProduct ?? '',
  readyForManualHandoff: Boolean(result.details?.readyForManualHandoff),
  generatedAt,
  failures: Array.isArray(result.failures) ? result.failures : [],
});

export const writeIosPreflightArtifact = async (result, jsonOutPath) => {
  if (!jsonOutPath) {
    return null;
  }

  const outputPath = resolve(jsonOutPath);
  await mkdir(dirname(outputPath), { recursive: true });
  const artifact = makePreflightArtifact(result);
  await writeFile(outputPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return outputPath;
};

const parseArgs = (argv) => {
  const options = {
    contractPath: defaultPaths.contractPath,
    nativePackagePath: defaultPaths.nativePackagePath,
    pluginPackagePath: defaultPaths.pluginPackagePath,
    distributionRepoPath: defaultPaths.distributionRepoPath,
    provenancePath: defaultPaths.provenancePath,
    releaseTag: '',
    releaseId: 'manual',
    mode: 'preflight',
    jsonOutPath: '',
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
    if (arg === '--distribution-repo' && argv[i + 1]) {
      options.distributionRepoPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--provenance' && argv[i + 1]) {
      options.provenancePath = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-tag' && argv[i + 1]) {
      options.releaseTag = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-id' && argv[i + 1]) {
      options.releaseId = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--mode' && argv[i + 1]) {
      options.mode = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--json-out' && argv[i + 1]) {
      options.jsonOutPath = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  if (!options.releaseTag) {
    process.stdout.write('Mode: ios-preflight\nOverall: FAIL\nManual handoff ready: NO\nFailures:\n- Usage: node scripts/release-ios-preflight.mjs --release-tag <tag> [--release-id <id>] [--mode <preflight|handoff|verify|closeout|full-manual-lane>] [--contract <path>] [--native-package <path>] [--plugin-package <path>] [--distribution-repo <path>] [--provenance <path>] [--json-out <path>]\n');
    process.exit(1);
  }

  try {
    const result = await runIosReleasePreflight(options);
    await writeIosPreflightArtifact(result, options.jsonOutPath);
    process.stdout.write(`${formatIosPreflightSummary(result)}\n`);
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Mode: ios-preflight\nOverall: FAIL\nManual handoff ready: NO\nFailures:\n- Unexpected failure: ${message}\n`);
    process.exit(1);
  }
}
