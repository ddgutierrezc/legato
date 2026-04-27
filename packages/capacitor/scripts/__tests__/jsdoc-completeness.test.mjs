import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  collectRootExportInventory,
  evaluateJsdocClaimEvidence,
  evaluateStageClosure,
  validateDeclarationJsdocCoverage,
} from '../assert-package-entries.mjs';

const writeJson = (path, value) => writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');

const createFixturePackage = async ({ srcIndex, srcModules = {}, distIndex, distModules = {}, mapSources = [] }) => {
  const packageRoot = await mkdtemp(join(tmpdir(), 'legato-jsdoc-coverage-'));
  await mkdir(join(packageRoot, 'src'), { recursive: true });
  await mkdir(join(packageRoot, 'dist'), { recursive: true });

  await writeFile(join(packageRoot, 'src', 'index.ts'), srcIndex, 'utf8');
  for (const [relativePath, content] of Object.entries(srcModules)) {
    const targetPath = join(packageRoot, 'src', relativePath);
    await mkdir(join(targetPath, '..'), { recursive: true });
    await writeFile(targetPath, content, 'utf8');
  }

  await writeFile(join(packageRoot, 'dist', 'index.d.ts'), distIndex, 'utf8');
  for (const [relativePath, content] of Object.entries(distModules)) {
    const targetPath = join(packageRoot, 'dist', relativePath);
    await mkdir(join(targetPath, '..'), { recursive: true });
    await writeFile(targetPath, content, 'utf8');
  }

  await writeJson(join(packageRoot, 'dist', 'index.d.ts.map'), {
    version: 3,
    file: 'index.d.ts',
    sources: mapSources,
    names: [],
    mappings: '',
  });

  await writeJson(join(packageRoot, 'package.json'), {
    name: '@fixture/legato-jsdoc',
    type: 'module',
    exports: {
      '.': {
        default: './dist/index.js',
        types: './dist/index.d.ts',
      },
    },
    main: './dist/index.js',
    types: './dist/index.d.ts',
  });
  await writeFile(join(packageRoot, 'dist', 'index.js'), 'export {}\n', 'utf8');

  return packageRoot;
};

test('collectRootExportInventory resolves star exports, type aliases, and constants from src index', async () => {
  const packageRoot = await createFixturePackage({
    srcIndex: "export * from './track.js';\nexport type { Queue } from './queue.js';\nexport { API_VERSION as VERSION } from './constants.js';\n",
    srcModules: {
      'track.ts': 'export interface Track { id: string; }\n',
      'queue.ts': 'export interface Queue { size: number; }\n',
      'constants.ts': 'export const API_VERSION = 1 as const;\n',
    },
    distIndex: 'export {}\n',
  });

  try {
    const inventory = await collectRootExportInventory({ packageRoot });
    const names = new Set(inventory.map((entry) => entry.symbol));
    assert.deepEqual(names, new Set(['Track', 'Queue', 'VERSION']));
    assert.equal(inventory.find((entry) => entry.symbol === 'Track')?.category, 'types/interfaces');
    assert.equal(inventory.find((entry) => entry.symbol === 'VERSION')?.category, 'constants/enums');
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test('validateDeclarationJsdocCoverage reports missing symbol docs and source-map provenance', async () => {
  const packageRoot = await createFixturePackage({
    srcIndex: "export { setup } from './api.js';\n",
    srcModules: {
      'api.ts': 'export function setup(value: string): number { return value.length; }\n',
    },
    distIndex: "export { setup } from './api.js';\n",
    distModules: {
      'api.d.ts': 'export declare function setup(value: string): number;\n',
    },
    mapSources: ['../src/api.ts'],
  });

  try {
    const result = await validateDeclarationJsdocCoverage({ packageRoot, profile: 'contract' });
    assert.equal(result.status, 'FAIL');
    assert.ok(result.failures.some((failure) => failure.symbol === 'setup'));
    const setupFailure = result.failures.find((failure) => failure.symbol === 'setup');
    assert.deepEqual(setupFailure?.missing, ['summary', '@param value', '@returns']);
    assert.equal(setupFailure?.sourceFile, '../src/api.ts');
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test('validateDeclarationJsdocCoverage passes when function and interface docs are retained in dist d.ts', async () => {
  const packageRoot = await createFixturePackage({
    srcIndex: "export { setup } from './api.js';\nexport type { SetupOptions } from './api.js';\n",
    srcModules: {
      'api.ts': [
        '/** Setup options. */',
        'export interface SetupOptions {',
        '  /** Playlist to enqueue before setup resolves. */',
        '  tracks: string[];',
        '}',
        '/** Initializes playback and returns queued track count. */',
        'export function setup(options: SetupOptions): number { return options.tracks.length; }',
        '',
      ].join('\n'),
    },
    distIndex: "export { setup } from './api.js';\nexport type { SetupOptions } from './api.js';\n",
    distModules: {
      'api.d.ts': [
        '/** Setup options. */',
        'export interface SetupOptions {',
        '  /** Playlist to enqueue before setup resolves. */',
        '  tracks: string[];',
        '}',
        '/** Initializes playback and returns queued track count.',
        ' * @param options Setup options for initial queue seeding.',
        ' * @returns Number of tracks queued by setup.',
        ' */',
        'export declare function setup(options: SetupOptions): number;',
        '',
      ].join('\n'),
    },
    mapSources: ['../src/api.ts'],
  });

  try {
    const result = await validateDeclarationJsdocCoverage({ packageRoot, profile: 'capacitor' });
    assert.equal(result.status, 'PASS');
    assert.equal(result.failures.length, 0);
  } finally {
    await rm(packageRoot, { recursive: true, force: true });
  }
});

test('evaluateJsdocClaimEvidence fails unsupported behavioral claims without accepted evidence', () => {
  const result = evaluateJsdocClaimEvidence({
    packageName: 'contract',
    claims: [
      {
        symbol: 'setup',
        claim: 'Always retries playback three times before failing.',
        evidence: [],
      },
    ],
  });

  assert.equal(result.status, 'FAIL');
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].missing.join(' '), /source-backed evidence/i);
});

test('evaluateJsdocClaimEvidence passes behavioral claims when accepted evidence is supplied', () => {
  const result = evaluateJsdocClaimEvidence({
    packageName: 'contract',
    claims: [
      {
        symbol: 'setup',
        claim: 'Returns snapshot from adapter response.',
        evidence: [{ kind: 'implementation', source: 'src/plugin.ts' }],
      },
    ],
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});

test('evaluateStageClosure blocks partial stage completion without scoped closure metadata', () => {
  const result = evaluateStageClosure({
    stageName: 'stage-1-contract',
    documentedSymbols: 10,
    totalSymbols: 38,
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /scoped closure metadata/i);
});

test('evaluateStageClosure passes partial completion when scoped closure metadata is complete', () => {
  const result = evaluateStageClosure({
    stageName: 'stage-1-contract',
    documentedSymbols: 10,
    totalSymbols: 38,
    scopedClosure: {
      documentedSymbols: 10,
      totalSymbols: 10,
    },
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});
