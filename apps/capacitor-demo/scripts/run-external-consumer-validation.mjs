import { cp, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const PASS = 'PASS';
const FAIL = 'FAIL';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(scriptDir, '../../..');
const defaultTemplateRoot = resolve(scriptDir, 'external-consumer-template');
const defaultArtifactsDir = resolve(scriptDir, '../artifacts/external-consumer-validation-v1');

const normalizePath = (value) => resolve(value).replaceAll('\\', '/');

const isInside = (target, root) => {
  const normalizedTarget = normalizePath(target);
  const normalizedRoot = normalizePath(root).replace(/\/+$/, '');
  return normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
};

export const ensureFixtureOutsideRepo = ({ repoRoot, fixtureRoot }) => {
  if (isInside(fixtureRoot, repoRoot)) {
    throw new Error(`External fixture must be outside repo root. repoRoot=${repoRoot} fixtureRoot=${fixtureRoot}`);
  }
};

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
    for (const item of Object.values(value)) {
      collectStringValues(item, into);
    }
  }
  return into;
};

export const inspectIsolationLeaks = ({ packageLockRaw = '', installManifestRaw = '' }) => {
  const failures = [];
  const haystacks = [packageLockRaw, installManifestRaw];
  for (const haystack of haystacks) {
    if (/workspace:/i.test(haystack)) {
      failures.push('Isolation breach: workspace: reference detected in dependency metadata.');
      break;
    }
  }

  const scanDirectoryFileRefs = (text) => {
    const refs = text.match(/file:[^"\s,}]+/gi) ?? [];
    for (const ref of refs) {
      if (!/\.tgz$/i.test(ref)) {
        failures.push(`Isolation breach: directory file: dependency detected (${ref}). Only .tgz file: refs are allowed.`);
      }
    }
  };
  scanDirectoryFileRefs(packageLockRaw);
  scanDirectoryFileRefs(installManifestRaw);

  try {
    if (packageLockRaw.trim().length > 0) {
      const parsed = JSON.parse(packageLockRaw);
      const strings = collectStringValues(parsed);
      for (const value of strings) {
        if (/^workspace:/i.test(value)) {
          failures.push(`Isolation breach: workspace protocol detected (${value}).`);
        }
        if (/^file:/i.test(value) && !/\.tgz$/i.test(value)) {
          failures.push(`Isolation breach: directory file: protocol detected (${value}).`);
        }
      }
    }
  } catch {
    failures.push('Isolation breach: failed to parse package-lock.json for dependency source checks.');
  }

  const status = failures.length === 0 ? PASS : FAIL;
  return {
    status,
    exitCode: status === PASS ? 0 : 1,
    failures,
  };
};

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

const pathExists = async (path) => {
  try {
    await lstat(path);
    return true;
  } catch {
    return false;
  }
};

const ensureCapacitorPlatform = async ({ fixtureRoot, platform, commandRunner }) => {
  const platformRoot = join(fixtureRoot, platform);
  const exists = await pathExists(platformRoot);
  if (exists) {
    return;
  }

  await commandRunner({
    command: 'npx',
    args: ['cap', 'add', platform],
    cwd: fixtureRoot,
  });
};

const ensureFixtureScaffold = async (fixtureRoot) => {
  const capacitorConfigPath = join(fixtureRoot, 'capacitor.config.ts');
  const webDir = join(fixtureRoot, 'dist');
  const indexHtmlPath = join(webDir, 'index.html');
  const nodeModulesPath = join(fixtureRoot, 'node_modules');

  await mkdir(webDir, { recursive: true });
  await writeFile(capacitorConfigPath, `import { CapacitorConfig } from '@capacitor/cli';\n\nconst config: CapacitorConfig = {\n  appId: 'dev.legato.external',\n  appName: 'legato-external-consumer',\n  webDir: 'dist'\n};\n\nexport default config;\n`, 'utf8');
  await writeFile(indexHtmlPath, '<!doctype html><html><body><div id="app">external fixture</div></body></html>\n', 'utf8');
  await mkdir(nodeModulesPath, { recursive: true });
};

const parsePackTarballName = (stdout) => {
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? null;
};

const collectDeclaredEntrypoints = (packageJson) => {
  const values = collectStringValues([
    packageJson?.main,
    packageJson?.types,
    packageJson?.exports,
    packageJson?.bin,
  ]);
  return [...new Set(values
    .map((value) => value.replaceAll('\\', '/').replace(/^\.\//, ''))
    .filter(Boolean))];
};

const listTarballEntries = async ({ tarballPath, commandRunner }) => {
  const result = await commandRunner({
    command: 'tar',
    args: ['-tzf', tarballPath],
    cwd: dirname(tarballPath),
  });
  return result.stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((entry) => entry.replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, ''));
};

const verifyEntrypointsInTarball = ({ entrypoints, tarballEntries, packageName }) => {
  const missing = [];
  const set = new Set(tarballEntries);
  for (const entrypoint of entrypoints) {
    const expectedEntry = `package/${entrypoint}`;
    if (!set.has(expectedEntry)) {
      missing.push(`${packageName}: missing ${expectedEntry}`);
    }
  }
  return missing;
};

const readJsonIfPresent = async (path) => {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch {
    return null;
  }
};

const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`;

const validateTarballSource = ({ installedPackage, expectedTarballPath }) => {
  if (!installedPackage || typeof installedPackage.resolved !== 'string') {
    return false;
  }
  return installedPackage.resolved.endsWith(basename(expectedTarballPath));
};

const parseArgs = (argv) => {
  const options = {
    repoRoot: defaultRepoRoot,
    artifactsDir: defaultArtifactsDir,
    keepFixture: false,
    skipPack: false,
    tarballs: {},
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo-root' && argv[i + 1]) {
      options.repoRoot = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--artifacts-dir' && argv[i + 1]) {
      options.artifactsDir = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--keep-fixture') {
      options.keepFixture = true;
      continue;
    }
    if (arg === '--skip-pack') {
      options.skipPack = true;
      continue;
    }
    if (arg === '--tarball-contract' && argv[i + 1]) {
      options.tarballs.contract = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--tarball-capacitor' && argv[i + 1]) {
      options.tarballs.capacitor = resolve(argv[i + 1]);
      i += 1;
    }
  }

  return options;
};

export const runExternalConsumerValidation = async ({
  repoRoot = defaultRepoRoot,
  templateRoot = defaultTemplateRoot,
  artifactsDir = defaultArtifactsDir,
  fixtureRoot,
  keepFixture = false,
  commandRunner = runCommand,
  skipPack = false,
  tarballs: providedTarballs,
} = {}) => {
  const failures = [];
  const areas = {
    isolation: FAIL,
    installability: FAIL,
    packedEntrypoints: FAIL,
    typecheckAndSync: FAIL,
    validatorReuse: FAIL,
  };

  await mkdir(artifactsDir, { recursive: true });

  const resolvedFixtureRoot = fixtureRoot ?? await mkdtemp(join(tmpdir(), 'legato-external-consumer-'));
  const tarballs = {
    capacitor: providedTarballs?.capacitor,
    contract: providedTarballs?.contract,
  };

  const runManifest = {
    repoRoot,
    fixtureRoot: resolvedFixtureRoot,
    artifactsDir,
    tarballs,
    startedAt: new Date().toISOString(),
  };

  const capSyncLogPath = join(artifactsDir, 'cap-sync.log');
  const typecheckLogPath = join(artifactsDir, 'typecheck.log');
  const validatorSummaryPath = join(artifactsDir, 'validator-summary.txt');
  const runManifestPath = join(artifactsDir, 'run-manifest.json');
  const installMetadataPath = join(artifactsDir, 'install-metadata.json');
  const dependencyScanPath = join(artifactsDir, 'dependency-scan.json');
  const tarballEntrypointCheckPath = join(artifactsDir, 'tarball-entrypoint-check.json');
  const summaryPath = join(artifactsDir, 'summary.json');

  try {
    ensureFixtureOutsideRepo({ repoRoot, fixtureRoot: resolvedFixtureRoot });
    await cp(templateRoot, resolvedFixtureRoot, { recursive: true, force: true });
    await ensureFixtureScaffold(resolvedFixtureRoot);

    if (!skipPack) {
      const contractPack = await commandRunner({
        command: 'npm',
        args: ['pack', '--pack-destination', artifactsDir],
        cwd: resolve(repoRoot, 'packages/contract'),
      });
      const capacitorPack = await commandRunner({
        command: 'npm',
        args: ['pack', '--pack-destination', artifactsDir],
        cwd: resolve(repoRoot, 'packages/capacitor'),
      });
      const contractTarball = parsePackTarballName(contractPack.stdout);
      const capacitorTarball = parsePackTarballName(capacitorPack.stdout);
      tarballs.contract = resolve(artifactsDir, contractTarball ?? '');
      tarballs.capacitor = resolve(artifactsDir, capacitorTarball ?? '');
    }

    if (!tarballs.contract || !tarballs.capacitor) {
      throw new Error('Tarball generation/injection failed: missing capacitor or contract tarball path.');
    }

    await commandRunner({
      command: 'npm',
      args: ['install', '--no-audit', '--no-fund', tarballs.contract, tarballs.capacitor],
      cwd: resolvedFixtureRoot,
    });

    const packageLockPath = join(resolvedFixtureRoot, 'package-lock.json');
    const packageLockRaw = await readFile(packageLockPath, 'utf8');
    const packageLock = JSON.parse(packageLockRaw);
    const capacitorInstall = packageLock?.packages?.['node_modules/@legato/capacitor'] ?? null;
    const contractInstall = packageLock?.packages?.['node_modules/@legato/contract'] ?? null;
    const installManifest = {
      capacitor: capacitorInstall,
      contract: contractInstall,
    };
    await writeFile(installMetadataPath, stringify(installManifest), 'utf8');

    const installabilityOk = validateTarballSource({ installedPackage: capacitorInstall, expectedTarballPath: tarballs.capacitor })
      && validateTarballSource({ installedPackage: contractInstall, expectedTarballPath: tarballs.contract });
    if (!installabilityOk) {
      failures.push('Installability contract breach: @legato packages were not resolved from provided tarballs.');
    } else {
      areas.installability = PASS;
    }

    const installedCapacitorPackageJson = await readJsonIfPresent(join(resolvedFixtureRoot, 'node_modules/@legato/capacitor/package.json'));
    const installedContractPackageJson = await readJsonIfPresent(join(resolvedFixtureRoot, 'node_modules/@legato/contract/package.json'));
    const capacitorEntrypoints = collectDeclaredEntrypoints(installedCapacitorPackageJson ?? {});
    const contractEntrypoints = collectDeclaredEntrypoints(installedContractPackageJson ?? {});
    const capacitorTarEntries = await listTarballEntries({ tarballPath: tarballs.capacitor, commandRunner });
    const contractTarEntries = await listTarballEntries({ tarballPath: tarballs.contract, commandRunner });
    const missingEntrypoints = [
      ...verifyEntrypointsInTarball({
        entrypoints: capacitorEntrypoints,
        tarballEntries: capacitorTarEntries,
        packageName: '@legato/capacitor',
      }),
      ...verifyEntrypointsInTarball({
        entrypoints: contractEntrypoints,
        tarballEntries: contractTarEntries,
        packageName: '@legato/contract',
      }),
    ];

    await writeFile(tarballEntrypointCheckPath, stringify({
      status: missingEntrypoints.length === 0 ? PASS : FAIL,
      capacitorEntrypoints,
      contractEntrypoints,
      missingEntrypoints,
    }), 'utf8');

    if (missingEntrypoints.length === 0) {
      areas.packedEntrypoints = PASS;
    } else {
      failures.push('Packed contract breach: declared package entrypoints are missing from tarball contents.');
      failures.push(...missingEntrypoints);
    }

    const leakScan = inspectIsolationLeaks({
      packageLockRaw,
      installManifestRaw: JSON.stringify(installManifest),
    });

    const installedCapacitorPath = join(resolvedFixtureRoot, 'node_modules/@legato/capacitor');
    const installedContractPath = join(resolvedFixtureRoot, 'node_modules/@legato/contract');
    const installedNativeArtifactsContractPath = join(installedCapacitorPath, 'native-artifacts.json');
    const capacitorStat = await lstat(installedCapacitorPath);
    const contractStat = await lstat(installedContractPath);
    if (capacitorStat.isSymbolicLink() || contractStat.isSymbolicLink()) {
      leakScan.failures.push('Isolation breach: monorepo symlink detected in node_modules/@legato/* install.');
      leakScan.status = FAIL;
    }

    await writeFile(dependencyScanPath, stringify(leakScan), 'utf8');
    if (leakScan.status === PASS) {
      areas.isolation = PASS;
    } else {
      failures.push(...leakScan.failures);
    }

    const typecheckResult = await commandRunner({ command: 'npm', args: ['run', 'typecheck'], cwd: resolvedFixtureRoot });
    await writeFile(typecheckLogPath, `${typecheckResult.stdout}${typecheckResult.stderr}`, 'utf8');

    await ensureCapacitorPlatform({
      fixtureRoot: resolvedFixtureRoot,
      platform: 'ios',
      commandRunner,
    });
    await ensureCapacitorPlatform({
      fixtureRoot: resolvedFixtureRoot,
      platform: 'android',
      commandRunner,
    });

    const capSyncResult = await commandRunner({
      command: 'npx',
      args: ['cap', 'sync', 'ios', 'android'],
      cwd: resolvedFixtureRoot,
    });
    await writeFile(capSyncLogPath, `${capSyncResult.stdout}${capSyncResult.stderr}`, 'utf8');
    areas.typecheckAndSync = PASS;

    const validatorCli = await commandRunner({
      command: 'node',
      args: [
        resolve(scriptDir, 'validate-native-artifacts.mjs'),
        '--plugin-gradle', join(resolvedFixtureRoot, 'node_modules/@legato/capacitor/android/build.gradle'),
        '--native-artifacts-contract', installedNativeArtifactsContractPath,
        '--android-settings', join(resolvedFixtureRoot, 'android/settings.gradle'),
        '--capapp-spm-package', join(resolvedFixtureRoot, 'ios/App/CapApp-SPM/Package.swift'),
        '--plugin-swift-package', join(resolvedFixtureRoot, 'node_modules/@legato/capacitor/Package.swift'),
        '--plugin-swift-source', join(resolvedFixtureRoot, 'node_modules/@legato/capacitor/ios/Sources/LegatoPlugin/LegatoPlugin.swift'),
        '--capacitor-config', join(resolvedFixtureRoot, 'ios/App/App/capacitor.config.json'),
        '--fixture-root', resolvedFixtureRoot,
        '--repo-root', repoRoot,
      ],
      cwd: repoRoot,
    });
    await writeFile(validatorSummaryPath, `${validatorCli.stdout}${validatorCli.stderr}`, 'utf8');
    if (/Overall:\s*PASS/i.test(validatorCli.stdout)) {
      areas.validatorReuse = PASS;
    } else {
      failures.push('Validator reuse failed: validate-native-artifacts did not report PASS against fixture hosts.');
    }
  } catch (error) {
    const stdout = typeof error?.stdout === 'string' ? error.stdout : '';
    const stderr = typeof error?.stderr === 'string' ? error.stderr : '';
    const text = [stdout, stderr].filter(Boolean).join('\n').trim();
    if (text.length > 0) {
      failures.push(text);
      await writeFile(capSyncLogPath, `${stdout}\n${stderr}`.trimEnd() + '\n', 'utf8');
    }
    if (error instanceof Error && error.message) {
      failures.push(error.message);
    }
  } finally {
    runManifest.tarballs = tarballs;
    await writeFile(runManifestPath, stringify(runManifest), 'utf8');
  }

  const status = failures.length === 0 ? PASS : FAIL;
  const summary = {
    status,
    exitCode: status === PASS ? 0 : 1,
    areas,
    failures,
    artifacts: {
      runManifestPath,
      installMetadataPath,
      dependencyScanPath,
      typecheckLogPath,
      capSyncLogPath,
      validatorSummaryPath,
      tarballEntrypointCheckPath,
    },
    fixtureRoot: resolvedFixtureRoot,
  };

  await writeFile(summaryPath, stringify(summary), 'utf8');

  if (!keepFixture) {
    await rm(resolvedFixtureRoot, { recursive: true, force: true });
  }

  return summary;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  const result = await runExternalConsumerValidation(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.exitCode);
}
