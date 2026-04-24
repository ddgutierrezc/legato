import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyManagedBlock,
  generateManagedSnippets,
  validateContract,
} from '../sync-native-artifacts.mjs';

test('generateManagedSnippets emits Maven + exact SwiftPM identity', () => {
  const contract = {
    android: {
      repositoryUrl: 'https://repo1.maven.org/maven2',
      group: 'dev.dgutierrez',
      artifact: 'legato-android-core',
      version: '0.1.1',
    },
    ios: {
      packageUrl: 'https://github.com/ddgutierrezc/legato-ios-core.git',
      packageName: 'LegatoCore',
      product: 'LegatoCore',
      version: '0.1.1',
      versionPolicy: 'exact',
    },
  };

  const snippets = generateManagedSnippets(contract);

  assert.match(snippets.android, /https:\/\/repo1\.maven\.org\/maven2/);
  assert.match(snippets.android, /dev\.dgutierrez:legato-android-core:0\.1\.1/);
  assert.match(snippets.android, /Adapter Android dependency must stay artifact-only/i);
  assert.doesNotMatch(snippets.android, /Foundation-only metadata.*deferred/i);
  assert.match(snippets.swift, /\n\s*\.package\(url: "https:\/\/github\.com\/ddgutierrezc\/legato-ios-core\.git", exact: "0\.1\.1"\)/);
  assert.doesNotMatch(snippets.swift, /^\s*\/\/\s*\.package\(url: "https:\/\/github\.com\/ddgutierrezc\/legato-ios-core\.git", exact: "0\.1\.1"\)/m);
  assert.doesNotMatch(snippets.swift, /switch-over intentionally deferred/i);
  assert.match(snippets.readme, /Maven Central/);
  assert.match(snippets.readme, /iOS adapter switch-over is active/i);
});

test('generateManagedSnippets is owner-agnostic for iOS package URL', () => {
  const contract = {
    android: {
      repositoryUrl: 'https://repo1.maven.org/maven2',
      group: 'dev.dgutierrez',
      artifact: 'legato-android-core',
      version: '0.1.1',
    },
    ios: {
      packageUrl: 'https://github.com/acme/legato-ios-core.git',
      packageName: 'LegatoCore',
      product: 'LegatoCore',
      version: '0.1.1',
      versionPolicy: 'exact',
    },
  };

  const snippets = generateManagedSnippets(contract);
  assert.match(snippets.swift, /https:\/\/github\.com\/acme\/legato-ios-core\.git/);
});

test('validateContract rejects local path/package refs', () => {
  const invalidContract = {
    android: {
      repositoryUrl: '../native/android/core',
      group: 'dev.dgutierrez',
      artifact: 'legato-android-core',
      version: '0.1.1',
    },
    ios: {
      packageUrl: '../../native/ios/LegatoCore',
      packageName: 'LegatoCore',
      product: 'LegatoCore',
      version: '0.1.1',
      versionPolicy: 'exact',
    },
  };

  assert.throws(
    () => validateContract(invalidContract),
    /must be HTTPS URLs.*local path/i,
  );
});

test('validateContract rejects non-migrated Android publication namespace', () => {
  const invalidContract = {
    android: {
      repositoryUrl: 'https://repo1.maven.org/maven2',
      group: 'io.legato',
      artifact: 'legato-android-core',
      version: '0.1.1',
    },
    ios: {
      packageUrl: 'https://github.com/ddgutierrezc/legato-ios-core.git',
      packageName: 'LegatoCore',
      product: 'LegatoCore',
      version: '0.1.1',
      versionPolicy: 'exact',
    },
  };

  assert.throws(
    () => validateContract(invalidContract),
    /android\.group must be "dev\.dgutierrez"/i,
  );
});

test('applyManagedBlock replaces existing managed section', () => {
  const original = [
    'line 1',
    '// NATIVE_ARTIFACTS:BEGIN',
    'old value',
    '// NATIVE_ARTIFACTS:END',
    'line 2',
  ].join('\n');

  const updated = applyManagedBlock(original, {
    startMarker: '// NATIVE_ARTIFACTS:BEGIN',
    endMarker: '// NATIVE_ARTIFACTS:END',
    snippet: 'new value',
  });

  assert.equal(
    updated,
    ['line 1', '// NATIVE_ARTIFACTS:BEGIN', 'new value', '// NATIVE_ARTIFACTS:END', 'line 2'].join('\n'),
  );
});
