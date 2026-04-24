import test from 'node:test';
import assert from 'node:assert/strict';

import { inspectTarballEntries } from '../inspect-tarball.mjs';

test('inspectTarballEntries accepts capacitor profile with dist + native essentials', () => {
  const result = inspectTarballEntries({
    profile: 'capacitor',
    entries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/cli/index.mjs',
      'package/native-artifacts.json',
      'package/android/build.gradle',
      'package/android/src/main/AndroidManifest.xml',
      'package/ios/Sources/LegatoPlugin/LegatoPlugin.swift',
      'package/Package.swift',
      'package/README.md',
    ],
  });

  assert.equal(result.status, 'PASS');
  assert.equal(result.failures.length, 0);
});

test('inspectTarballEntries fails capacitor profile when android/build leaks', () => {
  const result = inspectTarballEntries({
    profile: 'capacitor',
    entries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/cli/index.mjs',
      'package/android/build.gradle',
      'package/android/src/main/AndroidManifest.xml',
      'package/ios/Sources/LegatoPlugin/LegatoPlugin.swift',
      'package/Package.swift',
      'package/android/build/intermediates/packaged-classes/debug/classes.jar',
    ],
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /android\/build\//i);
});

test('inspectTarballEntries normalizes windows separators', () => {
  const result = inspectTarballEntries({
    profile: 'contract',
    entries: [
      'package\\package.json',
      'package\\dist\\index.js',
      'package\\dist\\index.d.ts',
    ],
  });

  assert.equal(result.status, 'PASS');
});

test('inspectTarballEntries fails capacitor profile when native-artifacts contract is missing', () => {
  const result = inspectTarballEntries({
    profile: 'capacitor',
    entries: [
      'package/package.json',
      'package/dist/index.js',
      'package/dist/index.d.ts',
      'package/dist/cli/index.mjs',
      'package/android/build.gradle',
      'package/android/src/main/AndroidManifest.xml',
      'package/ios/Sources/LegatoPlugin/LegatoPlugin.swift',
      'package/Package.swift',
    ],
  });

  assert.equal(result.status, 'FAIL');
  assert.match(result.failures.join('\n'), /native-artifacts/i);
});
