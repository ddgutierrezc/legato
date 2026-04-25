import { readFile, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = resolve(scriptDir, '..');
const VALID_PROFILES = new Set(['capacitor', 'contract']);

const normalizeRelativePath = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '');

const collectStringValues = (value, into = []) => {
  if (typeof value === 'string') {
    into.push(value);
    return into;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectStringValues(item, into);
    }
    return into;
  }
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) {
      collectStringValues(nested, into);
    }
  }
  return into;
};

const pathExists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const readPackageJson = async (packageRoot) => {
  const raw = await readFile(resolve(packageRoot, 'package.json'), 'utf8');
  return JSON.parse(raw);
};

const hasString = (value) => typeof value === 'string' && value.trim().length > 0;

const normalizeKeyword = (value) => String(value ?? '').trim().toLowerCase();

const detectProfile = ({ profile, packageJson }) => {
  const explicit = String(profile ?? '').trim().toLowerCase();
  if (VALID_PROFILES.has(explicit)) {
    return explicit;
  }

  const packageName = String(packageJson?.name ?? '').toLowerCase();
  if (packageName.includes('legato-capacitor')) {
    return 'capacitor';
  }
  if (packageName.includes('legato-contract')) {
    return 'contract';
  }
  return null;
};

const mentionsLegatoCli = (readmeRaw) => /`?legato`?\s+native|\blegato\s+native\b/i.test(readmeRaw);

export const validatePackageErgonomics = async ({ packageRoot, profile } = {}) => {
  const resolvedPackageRoot = resolve(packageRoot ?? defaultPackageRoot);
  const packageJson = await readPackageJson(resolvedPackageRoot);
  const resolvedProfile = detectProfile({ profile, packageJson });
  const failures = [];

  const requiredStringFields = ['description', 'homepage'];
  for (const field of requiredStringFields) {
    if (!hasString(packageJson[field])) {
      failures.push(`Metadata field is required: ${field}`);
    }
  }

  const repository = packageJson.repository;
  const repositoryValid = hasString(repository)
    || (repository && typeof repository === 'object' && hasString(repository.url));
  if (!repositoryValid) {
    failures.push('Metadata field is required: repository (string or object with url).');
  }

  const keywords = Array.isArray(packageJson.keywords) ? packageJson.keywords : [];
  if (keywords.length === 0) {
    failures.push('Metadata field is required: keywords (non-empty array).');
  }

  const files = Array.isArray(packageJson.files) ? packageJson.files : [];
  if (files.length === 0) {
    failures.push('Metadata field is required: files (non-empty array).');
  }

  const hasReadmeInFiles = files.some((entry) => normalizeRelativePath(String(entry)).toLowerCase() === 'readme.md');
  if (!hasReadmeInFiles) {
    failures.push('Published files must include README.md.');
  }

  const readmePath = resolve(resolvedPackageRoot, 'README.md');
  const readmeExists = await pathExists(readmePath);
  if (!readmeExists) {
    failures.push('README.md must exist at package root.');
  }

  const readmeRaw = readmeExists ? await readFile(readmePath, 'utf8') : '';
  const packageBin = packageJson.bin;
  const hasBin = Boolean(packageBin && typeof packageBin === 'object' && Object.keys(packageBin).length > 0);

  if (resolvedProfile === 'capacitor') {
    const normalizedKeywords = new Set(keywords.map((value) => normalizeKeyword(value)));
    for (const keyword of ['legato', 'capacitor']) {
      if (!normalizedKeywords.has(keyword)) {
        failures.push(`Capacitor profile keyword missing: ${keyword}`);
      }
    }

    const legatoBin = packageBin?.legato;
    if (!hasString(legatoBin)) {
      failures.push('Capacitor profile must declare bin.legato as a string path.');
    }

    if (!mentionsLegatoCli(readmeRaw)) {
      failures.push('Capacitor README must document the `legato` CLI scope.');
    }
  }

  if (resolvedProfile === 'contract') {
    const normalizedKeywords = new Set(keywords.map((value) => normalizeKeyword(value)));
    for (const keyword of ['legato', 'contract']) {
      if (!normalizedKeywords.has(keyword)) {
        failures.push(`Contract profile keyword missing: ${keyword}`);
      }
    }

    if (hasBin) {
      failures.push('Contract profile must not declare bin metadata.');
    }

    if (mentionsLegatoCli(readmeRaw)) {
      failures.push('Contract README/docs must not advertise `legato` CLI commands.');
    }
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  return {
    status,
    exitCode: status === 'PASS' ? 0 : 1,
    packageName: packageJson.name,
    packageRoot: resolvedPackageRoot,
    profile: resolvedProfile,
    failures,
  };
};

export const collectDeclaredEntrypoints = (packageJson) => {
  const candidates = [
    packageJson.main,
    packageJson.types,
    packageJson.exports,
    packageJson.bin,
  ];
  const allValues = collectStringValues(candidates);
  return [...new Set(allValues.map((value) => normalizeRelativePath(value)))];
};

export const validatePackageEntrypoints = async ({ packageRoot, requireDistPrefix = true, profile } = {}) => {
  const resolvedPackageRoot = resolve(packageRoot ?? defaultPackageRoot);
  const packageJson = await readPackageJson(resolvedPackageRoot);
  const failures = [];
  const entrypoints = collectDeclaredEntrypoints(packageJson);

  if (entrypoints.length === 0) {
    failures.push('No publish-facing entrypoints declared (main/types/exports/bin are empty).');
  }

  for (const entry of entrypoints) {
    if (isAbsolute(entry) || entry.startsWith('..')) {
      failures.push(`Entrypoint must be package-relative (found: ${entry}).`);
      continue;
    }

    if (requireDistPrefix && !entry.startsWith('dist/')) {
      failures.push(`Entrypoint must resolve under dist/** (found: ${entry}).`);
      continue;
    }

    const targetPath = resolve(resolvedPackageRoot, entry);
    if (!await pathExists(targetPath)) {
      failures.push(`Entrypoint target does not exist: ${entry}`);
    }
  }

  const status = failures.length === 0 ? 'PASS' : 'FAIL';
  const ergonomics = await validatePackageErgonomics({ packageRoot: resolvedPackageRoot, profile });
  const mergedFailures = [...failures, ...ergonomics.failures];
  const mergedStatus = mergedFailures.length === 0 ? 'PASS' : 'FAIL';
  return {
    status: mergedStatus,
    exitCode: mergedStatus === 'PASS' ? 0 : 1,
    packageName: packageJson.name,
    packageRoot: resolvedPackageRoot,
    entrypoints,
    profile: ergonomics.profile,
    failures: mergedFailures,
  };
};

const parseArgs = (argv) => {
  const options = {
    packageRoot: defaultPackageRoot,
    requireDistPrefix: true,
    profile: undefined,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--package-root' && argv[i + 1]) {
      options.packageRoot = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--allow-non-dist') {
      options.requireDistPrefix = false;
      continue;
    }
    if (arg === '--profile' && argv[i + 1]) {
      options.profile = argv[i + 1];
      i += 1;
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  const result = await validatePackageEntrypoints(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}
