import { readFile, lstat } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = resolve(scriptDir, '..');

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

export const validatePackageEntrypoints = async ({ packageRoot, requireDistPrefix = true } = {}) => {
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
  return {
    status,
    exitCode: status === 'PASS' ? 0 : 1,
    packageName: packageJson.name,
    packageRoot: resolvedPackageRoot,
    entrypoints,
    failures,
  };
};

const parseArgs = (argv) => {
  const options = {
    packageRoot: defaultPackageRoot,
    requireDistPrefix: true,
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
