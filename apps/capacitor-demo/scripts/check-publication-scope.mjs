import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const PASS = 'PASS';
const FAIL = 'FAIL';

const DEFAULT_NEEDLE = 'dev.dgutierrez';
const DEFAULT_INCLUDE_GLOBS = Object.freeze([
  'packages/**/*.json',
  'packages/**/*.md',
  'packages/**/*.mjs',
  'packages/**/*.gradle',
  'apps/**/*.mjs',
  'native/**/*.mjs',
  'native/**/*.gradle',
  'docs/**/*.md',
]);

const DEFAULT_EXCLUDE_GLOBS = Object.freeze([
  '**/node_modules/**',
  '**/.git/**',
  '**/artifacts/**',
  '**/*.test.mjs',
]);

const DEFAULT_ALLOWED_PATHS = Object.freeze([
  'packages/capacitor/native-artifacts.json',
  'packages/capacitor/android/build.gradle',
  'packages/capacitor/scripts/sync-native-artifacts.mjs',
  'apps/capacitor-demo/scripts/validate-native-artifacts.mjs',
  'native/android/core/build.gradle',
  'native/android/core/scripts/release-android.mjs',
  'packages/capacitor/README.md',
  'docs/releases/android-maven-central-operator-guide.md',
  'docs/releases/publication-pipeline-v1-validation.md',
  'docs/maintainers/legato-capacitor-operator-guide.md',
  'apps/capacitor-demo/scripts/check-publication-scope.mjs',
]);

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const globToRegex = (glob) => {
  let pattern = '^';
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    const next = glob[i + 1];
    if (char === '*' && next === '*') {
      pattern += '.*';
      i += 1;
      continue;
    }
    if (char === '*') {
      pattern += '[^/]*';
      continue;
    }
    if (char === '?') {
      pattern += '.';
      continue;
    }
    pattern += escapeRegex(char);
  }
  pattern += '$';
  return new RegExp(pattern);
};

const collectFiles = async (rootDir) => {
  const files = [];
  const stack = [''];

  while (stack.length > 0) {
    const current = stack.pop();
    const absolute = resolve(rootDir, current);
    const entries = await readdir(absolute, { withFileTypes: true });

    for (const entry of entries) {
      const relativePath = current ? `${current}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        stack.push(relativePath);
      } else if (entry.isFile()) {
        files.push(relativePath);
      }
    }
  }

  return files;
};

const parseArgs = (argv) => {
  const options = {
    repoRoot: resolve(process.cwd(), '../..'),
    needle: DEFAULT_NEEDLE,
    includeGlobs: [...DEFAULT_INCLUDE_GLOBS],
    excludeGlobs: [...DEFAULT_EXCLUDE_GLOBS],
    allowedPaths: [...DEFAULT_ALLOWED_PATHS],
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo-root' && argv[i + 1]) {
      options.repoRoot = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--needle' && argv[i + 1]) {
      options.needle = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--include' && argv[i + 1]) {
      options.includeGlobs.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--exclude' && argv[i + 1]) {
      options.excludeGlobs.push(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--allow-path' && argv[i + 1]) {
      options.allowedPaths.push(argv[i + 1]);
      i += 1;
    }
  }

  return options;
};

const normalizePath = (path) => path.replaceAll('\\', '/');

export const checkPublicationScope = async ({
  repoRoot = resolve(process.cwd(), '../..'),
  needle = DEFAULT_NEEDLE,
  includeGlobs = [...DEFAULT_INCLUDE_GLOBS],
  excludeGlobs = [...DEFAULT_EXCLUDE_GLOBS],
  allowedPaths = [...DEFAULT_ALLOWED_PATHS],
} = {}) => {
  const includeRegexes = includeGlobs.map(globToRegex);
  const excludeRegexes = excludeGlobs.map(globToRegex);
  const allowedSet = new Set(allowedPaths.map(normalizePath));

  const allFiles = await collectFiles(repoRoot);
  const candidateFiles = allFiles.filter((file) => {
    const normalized = normalizePath(file);
    if (excludeRegexes.some((regex) => regex.test(normalized))) {
      return false;
    }
    return includeRegexes.some((regex) => regex.test(normalized));
  });

  const matches = [];
  for (const file of candidateFiles) {
    const absolutePath = resolve(repoRoot, file);
    const raw = await readFile(absolutePath, 'utf8');
    if (!raw.includes(needle)) {
      continue;
    }
    matches.push({
      path: normalizePath(relative(repoRoot, absolutePath)),
      allowed: allowedSet.has(normalizePath(file)),
    });
  }

  const unexpectedMatches = matches.filter((entry) => !entry.allowed);
  const status = unexpectedMatches.length === 0 ? PASS : FAIL;

  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    needle,
    scannedFiles: candidateFiles.length,
    expectedMatches: matches.filter((entry) => entry.allowed),
    unexpectedMatches,
  };
};

export const formatPublicationScopeSummary = (result) => {
  const lines = [
    `Overall: ${result.status}`,
    `Needle: ${result.needle}`,
    `Scanned files: ${result.scannedFiles}`,
    `Expected matches: ${result.expectedMatches.length}`,
    `Unexpected matches: ${result.unexpectedMatches.length}`,
  ];

  if (result.unexpectedMatches.length > 0) {
    lines.push('Failures:');
    for (const entry of result.unexpectedMatches) {
      lines.push(`- Unexpected namespace migration in ${entry.path}`);
    }
  }

  return lines.join('\n');
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await checkPublicationScope(options);
    process.stdout.write(`${formatPublicationScopeSummary(result)}\n`);
    process.exit(result.exitCode);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stdout.write(`Overall: FAIL\nFailures:\n- Publication scope check failed unexpectedly: ${message}\n`);
    process.exit(1);
  }
}
