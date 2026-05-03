import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const packageRoot = resolve(repoRoot, 'packages/react-native');

async function assertFileExists(relativePath) {
  await access(resolve(packageRoot, relativePath), fsConstants.F_OK);
}

test('batch-2 scaffold keeps canonical standalone Expo module roots', async () => {
  await assertFileExists('package.json');
  await assertFileExists('expo-module.config.json');
  await assertFileExists('src/index.ts');
  await assertFileExists('src/LegatoModule.ts');
  await assertFileExists('android/build.gradle');
  await assertFileExists('ios/LegatoModule.podspec');
  await assertFileExists('mocks/LegatoModule.ts');
});

test('batch-2 package metadata and test foundations align with Expo module expectations', async () => {
  const pkgRaw = await readFile(resolve(packageRoot, 'package.json'), 'utf8');
  const pkg = JSON.parse(pkgRaw);

  assert.equal(pkg.name, '@ddgutierrezc/legato-react-native');
  assert.equal(pkg.main, 'build/index.js');
  assert.equal(pkg.types, 'build/index.d.ts');
  assert.equal(pkg.exports['.'], './build/index.js');
  assert.equal(pkg.scripts.test, 'jest');
  assert.equal(pkg.jest.preset, 'jest-expo');
  assert.equal(pkg.peerDependencies.expo, '*');
  assert.ok(pkg.peerDependencies['@ddgutierrezc/legato-contract']);

  const moduleConfigRaw = await readFile(resolve(packageRoot, 'expo-module.config.json'), 'utf8');
  const moduleConfig = JSON.parse(moduleConfigRaw);

  assert.equal(moduleConfig.name, 'Legato');
  assert.equal(moduleConfig.android.modules[0], 'expo.modules.legato.LegatoModule');
  assert.equal(moduleConfig.apple.modules[0], 'LegatoModule');
});

test('batch-2 host validation and readiness gate explicitly enforce prebuild/dev-build policy', async () => {
  const hostValidation = await readFile(
    resolve(packageRoot, 'scripts/validate-dev-build-host.mjs'),
    'utf8',
  );
  const readinessChecklist = await readFile(
    resolve(packageRoot, 'docs/milestone-1-readiness-checklist.md'),
    'utf8',
  );

  assert.match(hostValidation, /expo prebuild/);
  assert.match(hostValidation, /expo run:ios/);
  assert.match(hostValidation, /expo run:android/);
  assert.match(hostValidation, /Expo Go is explicitly unsupported/);

  assert.match(readinessChecklist, /FAIL if canonical scaffold shape is modified/i);
  assert.match(readinessChecklist, /FAIL if Jest\/wrapper\/host validation evidence is missing/i);
  assert.match(readinessChecklist, /Config plugin decision record/i);
});

test('batch-2 wrapper contract tests cover mapping and event/capability invariants', async () => {
  const wrapperTests = await readFile(
    resolve(packageRoot, 'src/__tests__/legato-wrapper-contract.test.ts'),
    'utf8',
  );

  assert.match(wrapperTests, /maps setup\(\) to the Expo module setup bridge/);
  assert.match(wrapperTests, /returns queue snapshots for mutating calls/);
  assert.match(wrapperTests, /keeps event names aligned to LEGATO_EVENT_NAMES/);
  assert.match(wrapperTests, /projects capabilities with stable supported arrays/);
});
