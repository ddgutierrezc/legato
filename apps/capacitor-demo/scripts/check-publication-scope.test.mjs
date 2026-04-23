import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  checkPublicationScope,
  formatPublicationScopeSummary,
} from './check-publication-scope.mjs';

test('publication scope check passes when migrated namespace only appears in allowlisted paths', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-publication-scope-pass-'));
  try {
    await mkdir(join(tempDir, 'packages/capacitor'), { recursive: true });
    await mkdir(join(tempDir, 'native/android/core'), { recursive: true });
    await mkdir(join(tempDir, 'packages/contract'), { recursive: true });

    await writeFile(join(tempDir, 'packages/capacitor/native-artifacts.json'), '{"group":"dev.dgutierrez"}\n', 'utf8');
    await writeFile(join(tempDir, 'native/android/core/build.gradle'), 'group = "dev.dgutierrez"\n', 'utf8');
    await writeFile(join(tempDir, 'packages/contract/README.md'), 'no migrated namespace here\n', 'utf8');

    const result = await checkPublicationScope({
      repoRoot: tempDir,
      includeGlobs: ['packages/**/*.json', 'native/**/*.gradle', 'packages/**/*.md'],
      allowedPaths: [
        'packages/capacitor/native-artifacts.json',
        'native/android/core/build.gradle',
      ],
    });

    assert.equal(result.status, 'PASS');
    assert.equal(result.unexpectedMatches.length, 0);
    assert.match(formatPublicationScopeSummary(result), /overall: pass/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test('publication scope check fails when migrated namespace appears in out-of-scope path', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'legato-publication-scope-fail-'));
  try {
    await mkdir(join(tempDir, 'packages/capacitor'), { recursive: true });
    await mkdir(join(tempDir, 'packages/contract'), { recursive: true });

    await writeFile(join(tempDir, 'packages/capacitor/native-artifacts.json'), '{"group":"dev.dgutierrez"}\n', 'utf8');
    await writeFile(join(tempDir, 'packages/contract/README.md'), 'bad drift: dev.dgutierrez leaked\n', 'utf8');

    const result = await checkPublicationScope({
      repoRoot: tempDir,
      includeGlobs: ['packages/**/*.json', 'packages/**/*.md'],
      allowedPaths: ['packages/capacitor/native-artifacts.json'],
    });

    assert.equal(result.status, 'FAIL');
    assert.equal(result.unexpectedMatches.length, 1);
    assert.match(result.unexpectedMatches[0].path, /packages\/contract\/README\.md/i);
    assert.match(formatPublicationScopeSummary(result), /unexpected namespace migration/i);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
