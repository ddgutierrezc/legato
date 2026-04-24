import { cp, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const PASS = 'PASS';
const FAIL = 'FAIL';
const REQUIRED_DIRS = [
  'Sources/LegatoCore',
  'Sources/LegatoCoreSessionRuntimeiOS',
  'Tests/LegatoCoreTests',
  'Tests/LegatoCoreSessionRuntimeiOSTests',
];
const REQUIRED_FILES = ['Package.swift', 'README.md'];
const ALLOWED_TOP_LEVEL_SOURCE_ENTRIES = new Set(['Package.swift', 'README.md', 'Sources', 'Tests']);
const SOURCE_REPO_DEFAULT = 'https://github.com/ddgutierrezc/legato.git';

const DIST_README = `# legato-ios-core

SwiftPM distribution authority for Legato iOS core.

## Ownership boundary (v1)

- Source of truth and feature authoring: \`legato\` monorepo.
- Distribution and immutable tagging only: \`legato-ios-core\`.
- Direct feature authoring in this repository is NON-COMPLIANT.

Promotion is one-way from \`legato/native/ios/LegatoCore\` into this repository.
`;

const DIST_GITIGNORE = `.DS_Store
.build/
.swiftpm/
Packages/
DerivedData/
xcuserdata/
*.xcodeproj/project.xcworkspace/xcuserdata/
`;

const DIST_LICENSE = `MIT License

Copyright (c) Legato

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
`;

const parseTagVersion = (releaseTag = '') => String(releaseTag).trim().replace(/^v/i, '');

const runGit = async (args, cwd) => new Promise((resolveResult) => {
  const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  let stdout = '';
  let stderr = '';

  child.stdout.on('data', (chunk) => {
    stdout += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });
  child.on('close', (code) => {
    resolveResult({ code: Number.isInteger(code) ? code : 1, stdout: stdout.trim(), stderr: stderr.trim() });
  });
  child.on('error', (error) => {
    resolveResult({ code: 1, stdout: '', stderr: error.message });
  });
});

const parsePackageIdentity = (packageSwift) => {
  const packageName = packageSwift.match(/\bname:\s*"([^"]+)"/)?.[1]?.trim() ?? '';
  const products = [];
  const matcher = /\.library\(\s*name:\s*"([^"]+)"/g;
  let match = matcher.exec(packageSwift);
  while (match) {
    products.push(match[1].trim());
    match = matcher.exec(packageSwift);
  }

  return { packageName, products };
};

const assertRequiredShape = async (sourceRoot) => {
  const failures = [];
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  const extraTopLevel = entries
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.') && !ALLOWED_TOP_LEVEL_SOURCE_ENTRIES.has(name));

  if (extraTopLevel.length > 0) {
    failures.push(`Unexpected top-level entries in source package: ${extraTopLevel.join(', ')}`);
  }

  for (const requiredFile of REQUIRED_FILES) {
    try {
      const info = await stat(join(sourceRoot, requiredFile));
      if (!info.isFile()) {
        failures.push(`Required path is not a file: ${requiredFile}`);
      }
    } catch {
      failures.push(`Missing required file in source package: ${requiredFile}`);
    }
  }

  for (const requiredDir of REQUIRED_DIRS) {
    try {
      const info = await stat(join(sourceRoot, requiredDir));
      if (!info.isDirectory()) {
        failures.push(`Required path is not a directory: ${requiredDir}`);
      }
    } catch {
      failures.push(`Missing required directory in source package: ${requiredDir}`);
    }
  }

  return failures;
};

const cleanDestination = async (destinationRoot) => {
  await mkdir(destinationRoot, { recursive: true });
  const entries = await readdir(destinationRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '.git') {
      continue;
    }
    await rm(join(destinationRoot, entry.name), { recursive: true, force: true });
  }
};

const copyExportPayload = async (sourceRoot, destinationRoot) => {
  for (const requiredFile of REQUIRED_FILES) {
    await cp(join(sourceRoot, requiredFile), join(destinationRoot, requiredFile));
  }
  await cp(join(sourceRoot, 'Sources'), join(destinationRoot, 'Sources'), { recursive: true });
  await cp(join(sourceRoot, 'Tests'), join(destinationRoot, 'Tests'), { recursive: true });
};

const writeDistributionMetadata = async ({ destinationRoot, sourceRepo, sourceCommit, packageName, product, version, releaseTag }) => {
  const provenance = {
    sourceRepo,
    sourceCommit,
    packageName,
    product,
    version,
    releaseTag,
    exportedAt: new Date().toISOString(),
  };

  await writeFile(join(destinationRoot, 'README.md'), DIST_README, 'utf8');
  await writeFile(join(destinationRoot, '.gitignore'), DIST_GITIGNORE, 'utf8');
  await writeFile(join(destinationRoot, 'LICENSE'), DIST_LICENSE, 'utf8');
  await writeFile(join(destinationRoot, 'distribution-provenance.json'), `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');
  return provenance;
};

export const promoteIosDistribution = async ({
  sourceRoot = resolve(scriptDir, '../../../native/ios/LegatoCore'),
  destinationRoot = resolve(scriptDir, '../../../../legato-ios-core'),
  releaseTag = 'v0.1.1',
  sourceRepo = SOURCE_REPO_DEFAULT,
  sourceCommit: sourceCommitInput = '',
} = {}) => {
  const absoluteSourceRoot = resolve(sourceRoot);
  const absoluteDestinationRoot = resolve(destinationRoot);
  const version = parseTagVersion(releaseTag);
  const failures = [];

  if (!version) {
    failures.push('releaseTag must be non-empty and parse to a version (for example: v0.1.1).');
  }

  const shapeFailures = await assertRequiredShape(absoluteSourceRoot);
  failures.push(...shapeFailures);

  let sourceCommit = String(sourceCommitInput).trim();
  if (!sourceCommit) {
    const git = await runGit(['rev-parse', 'HEAD'], absoluteSourceRoot);
    if (git.code !== 0 || !git.stdout) {
      failures.push(`Unable to resolve source commit from ${absoluteSourceRoot}: ${git.stderr || 'unknown git error'}`);
    } else {
      sourceCommit = git.stdout;
    }
  }

  let packageIdentity = { packageName: '', products: [] };
  try {
    const packageSwift = await readFile(join(absoluteSourceRoot, 'Package.swift'), 'utf8');
    packageIdentity = parsePackageIdentity(packageSwift);
  } catch (error) {
    failures.push(`Unable to read source Package.swift: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (packageIdentity.packageName !== 'LegatoCore') {
    failures.push(`Package identity drift: expected package name LegatoCore, received ${packageIdentity.packageName || '<missing>'}.`);
  }
  if (!packageIdentity.products.includes('LegatoCore')) {
    failures.push('Product identity drift: expected library product LegatoCore.');
  }

  if (failures.length > 0) {
    return {
      status: FAIL,
      exitCode: 1,
      sourceRoot: absoluteSourceRoot,
      destinationRoot: absoluteDestinationRoot,
      releaseTag,
      version,
      failures,
    };
  }

  await cleanDestination(absoluteDestinationRoot);
  await copyExportPayload(absoluteSourceRoot, absoluteDestinationRoot);
  const provenance = await writeDistributionMetadata({
    destinationRoot: absoluteDestinationRoot,
    sourceRepo,
    sourceCommit,
    packageName: packageIdentity.packageName,
    product: 'LegatoCore',
    version,
    releaseTag,
  });

  return {
    status: PASS,
    exitCode: 0,
    sourceRoot: absoluteSourceRoot,
    destinationRoot: absoluteDestinationRoot,
    releaseTag,
    version,
    sourceCommit,
    provenance,
    exportedPaths: [
      'Package.swift',
      'Sources/**',
      'Tests/**',
      'README.md',
      'LICENSE',
      '.gitignore',
      'distribution-provenance.json',
    ],
    failures: [],
  };
};

export const formatPromotionSummary = (result) => {
  const lines = [
    `Overall: ${result.status}`,
    `Source: ${result.sourceRoot}`,
    `Destination: ${result.destinationRoot}`,
    `Release tag: ${result.releaseTag}`,
  ];

  if (result.failures?.length) {
    lines.push('Failures:');
    for (const failure of result.failures) {
      lines.push(`- ${failure}`);
    }
  }

  return lines.join('\n');
};

const parseArgs = (argv) => {
  const options = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--source-root' && argv[i + 1]) {
      options.sourceRoot = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--destination-root' && argv[i + 1]) {
      options.destinationRoot = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--release-tag' && argv[i + 1]) {
      options.releaseTag = argv[i + 1];
      i += 1;
      continue;
    }
    if (arg === '--source-repo' && argv[i + 1]) {
      options.sourceRepo = argv[i + 1];
      i += 1;
    }
  }
  return options;
};

const isEntrypoint = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isEntrypoint) {
  const options = parseArgs(process.argv.slice(2));
  const result = await promoteIosDistribution(options);
  process.stdout.write(`${formatPromotionSummary(result)}\n`);
  process.exit(result.exitCode);
}
