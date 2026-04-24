import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PASS = 'PASS';
const FAIL = 'FAIL';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultPackageRoot = resolve(scriptDir, '..');

const PROFILES = {
  contract: {
    required: [
      /^package\/package\.json$/,
      /^package\/dist\/index\.js$/,
      /^package\/dist\/index\.d\.ts$/,
    ],
    forbidden: [
      /^package\/src\//,
      /^package\/android\//,
      /^package\/ios\//,
    ],
  },
  capacitor: {
    required: [
      /^package\/package\.json$/,
      /^package\/dist\/index\.js$/,
      /^package\/dist\/index\.d\.ts$/,
      /^package\/dist\/cli\/index\.mjs$/,
      /^package\/native-artifacts\.json$/,
      /^package\/android\/build\.gradle$/,
      /^package\/android\/src\/main\/AndroidManifest\.xml$/,
      /^package\/ios\/Sources\/LegatoPlugin\/LegatoPlugin\.swift$/,
      /^package\/Package\.swift$/,
    ],
    forbidden: [
      /^package\/android\/build\//,
      /^package\/src\//,
      /^package\/scripts\//,
    ],
  },
};

const normalizeTarPath = (value) => value.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '');

const runCommand = async ({ command, args, cwd }) => new Promise((resolveResult, rejectResult) => {
  const child = spawn(command, args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  });

  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  child.on('close', (code) => {
    if (code === 0) {
      resolveResult({ stdout, stderr, exitCode: code });
      return;
    }
    const error = new Error(`Command failed (${command} ${args.join(' ')})`);
    error.exitCode = code;
    error.stdout = stdout;
    error.stderr = stderr;
    rejectResult(error);
  });
});

export const inspectTarballEntries = ({ profile, entries }) => {
  const selectedProfile = PROFILES[profile];
  if (!selectedProfile) {
    throw new Error(`Unknown profile: ${profile}`);
  }

  const normalizedEntries = [...new Set(entries.map((entry) => normalizeTarPath(entry)))];
  const failures = [];

  for (const requiredPattern of selectedProfile.required) {
    const hasMatch = normalizedEntries.some((entry) => requiredPattern.test(entry));
    if (!hasMatch) {
      failures.push(`Missing required tarball entry: ${requiredPattern}`);
    }
  }

  for (const forbiddenPattern of selectedProfile.forbidden) {
    const hit = normalizedEntries.find((entry) => forbiddenPattern.test(entry));
    if (hit) {
      failures.push(`Forbidden tarball entry present: ${hit}`);
    }
  }

  return {
    status: failures.length === 0 ? PASS : FAIL,
    failures,
    profile,
    entries: normalizedEntries,
  };
};

const parsePackJson = (stdout) => {
  const parsed = JSON.parse(stdout);
  if (!Array.isArray(parsed) || parsed.length === 0 || !Array.isArray(parsed[0]?.files)) {
    throw new Error('npm pack --json output missing files list.');
  }

  const tarballFilename = parsed[0].filename;
  const entries = parsed[0].files.map((file) => `package/${normalizeTarPath(file.path)}`);
  return { tarballFilename, entries };
};

export const runPackAndInspect = async ({
  packageRoot = defaultPackageRoot,
  profile = 'capacitor',
  packDestination,
  jsonOut,
} = {}) => {
  const resolvedPackageRoot = resolve(packageRoot);
  const tempPackDir = packDestination ?? await mkdtemp(resolve(tmpdir(), 'legato-pack-inspect-'));
  const cleanupPackDir = !packDestination;

  try {
    const packResult = await runCommand({
      command: 'npm',
      args: ['pack', '--json', '--pack-destination', tempPackDir],
      cwd: resolvedPackageRoot,
    });

    const { tarballFilename, entries } = parsePackJson(packResult.stdout);
    const inspection = inspectTarballEntries({ profile, entries });
    const result = {
      ...inspection,
      packageRoot: resolvedPackageRoot,
      tarballPath: resolve(tempPackDir, tarballFilename),
    };

    if (jsonOut) {
      await writeFile(resolve(jsonOut), `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    }

    return {
      ...result,
      exitCode: result.status === PASS ? 0 : 1,
    };
  } finally {
    if (cleanupPackDir) {
      await rm(tempPackDir, { recursive: true, force: true });
    }
  }
};

const parseArgs = (argv) => {
  const options = {
    packageRoot: defaultPackageRoot,
    profile: 'capacitor',
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--package-root' && argv[i + 1]) {
      options.packageRoot = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--profile' && argv[i + 1]) {
      options.profile = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--pack-destination' && argv[i + 1]) {
      options.packDestination = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--json-out' && argv[i + 1]) {
      options.jsonOut = resolve(argv[i + 1]);
      i += 1;
    }
  }

  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runPackAndInspect(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}
