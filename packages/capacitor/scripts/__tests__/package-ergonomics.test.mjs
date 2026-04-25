import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { validatePackageErgonomics } from '../assert-package-entries.mjs';

const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const createPackageRoot = async ({ packageJson, readme }) => {
  const packageRoot = await mkdtemp(join(tmpdir(), 'legato-package-ergonomics-'));
  await mkdir(join(packageRoot, 'dist', 'cli'), { recursive: true });
  await writeFile(join(packageRoot, 'dist', 'index.js'), 'export default {}\n', 'utf8');
  await writeFile(join(packageRoot, 'dist', 'index.d.ts'), 'export {};\n', 'utf8');
  await writeFile(join(packageRoot, 'dist', 'cli', 'index.mjs'), 'console.log("ok")\n', 'utf8');
  await writeJson(join(packageRoot, 'package.json'), packageJson);
  if (typeof readme === 'string') {
    await writeFile(join(packageRoot, 'README.md'), readme, 'utf8');
  }
  return packageRoot;
};

test('ergonomics validator passes capacitor profile with metadata/readme/bin alignment', async () => {
  const packageRoot = await createPackageRoot({
    packageJson: {
      name: '@ddgutierrezc/legato-capacitor',
      description: 'Capacitor plugin for Legato host apps.',
      homepage: 'https://github.com/ddgutierrezc/legato#readme',
      repository: { type: 'git', url: 'https://github.com/ddgutierrezc/legato.git' },
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: { '.': { default: './dist/index.js', types: './dist/index.d.ts' } },
      bin: { legato: './dist/cli/index.mjs' },
      keywords: ['legato', 'capacitor', 'audio'],
      files: ['dist', 'README.md'],
    },
    readme: '# @ddgutierrezc/legato-capacitor\n\nRun `legato native doctor` in the maintainer repo.\n',
  });

  try {
    const result = await validatePackageErgonomics({ packageRoot, profile: 'capacitor' });
    assert.equal(result.status, 'PASS');
    assert.equal(result.failures.length, 0);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test('ergonomics validator fails contract profile when bin is declared', async () => {
  const packageRoot = await createPackageRoot({
    packageJson: {
      name: '@ddgutierrezc/legato-contract',
      description: 'Contract package for Legato.',
      homepage: 'https://github.com/ddgutierrezc/legato#readme',
      repository: { type: 'git', url: 'https://github.com/ddgutierrezc/legato.git' },
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: { '.': { default: './dist/index.js', types: './dist/index.d.ts' } },
      bin: { legato: './dist/cli/index.mjs' },
      keywords: ['legato', 'contract'],
      files: ['dist', 'README.md'],
    },
    readme: '# @ddgutierrezc/legato-contract\n\nLibrary-only package.\n',
  });

  try {
    const result = await validatePackageErgonomics({ packageRoot, profile: 'contract' });
    assert.equal(result.status, 'FAIL');
    assert.match(result.failures.join('\n'), /must not declare bin/i);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test('ergonomics validator fails when README is missing from files and package root', async () => {
  const packageRoot = await createPackageRoot({
    packageJson: {
      name: '@ddgutierrezc/legato-contract',
      description: 'Contract package for Legato.',
      homepage: 'https://github.com/ddgutierrezc/legato#readme',
      repository: { type: 'git', url: 'https://github.com/ddgutierrezc/legato.git' },
      main: './dist/index.js',
      types: './dist/index.d.ts',
      exports: { '.': { default: './dist/index.js', types: './dist/index.d.ts' } },
      keywords: ['legato', 'contract'],
      files: ['dist'],
    },
  });

  try {
    const result = await validatePackageErgonomics({ packageRoot, profile: 'contract' });
    assert.equal(result.status, 'FAIL');
    assert.match(result.failures.join('\n'), /README\.md/i);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});
