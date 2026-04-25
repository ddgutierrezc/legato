import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');

const demoReadmePath = resolve(repoRoot, 'apps/capacitor-demo/README.md');
const iosReadmePath = resolve(repoRoot, 'apps/capacitor-demo/ios/README.md');
const operatorGuidePath = resolve(repoRoot, 'docs/maintainers/legato-capacitor-operator-guide.md');
const demoPackageJsonPath = resolve(repoRoot, 'apps/capacitor-demo/package.json');

test('operator guide documents ios host-polish scope, non-goals, and generated-file boundaries', async () => {
  const operatorGuide = await readFile(operatorGuidePath, 'utf8');

  assert.match(operatorGuide, /package-specific iOS integration\/onboarding\/guardrails only/i);
  assert.match(operatorGuide, /no generic bundle-id ownership workflow/i);
  assert.match(operatorGuide, /no signing\/provisioning automation/i);
  assert.match(operatorGuide, /no provisioning-profile lifecycle ownership/i);
  assert.match(operatorGuide, /apps\/capacitor-demo\/ios\/App\/CapApp-SPM\/Package\.swift/i);
  assert.match(operatorGuide, /npm run cap:sync/i);
});

test('demo README requires post-sync ios package checks before smoke', async () => {
  const demoReadme = await readFile(demoReadmePath, 'utf8');

  assert.match(demoReadme, /post-sync iOS package verification checklist/i);
  assert.match(demoReadme, /required before smoke/i);
  assert.match(demoReadme, /npm run cap:sync/i);
  assert.match(demoReadme, /ios\/App\/App\.xcodeproj/i);
  assert.match(demoReadme, /CapApp-SPM/i);
  assert.match(demoReadme, /LegatoCore/i);
  assert.match(demoReadme, /packageClassList/i);
  assert.match(demoReadme, /LegatoPlugin/i);
  assert.match(demoReadme, /out of scope: generic Apple signing\/provisioning/i);
});

test('ios README keeps ordered package-only checks after sync', async () => {
  const iosReadme = await readFile(iosReadmePath, 'utf8');

  assert.match(iosReadme, /ordered post-sync package checks/i);
  assert.match(iosReadme, /open `ios\/App\/App\.xcodeproj`/i);
  assert.match(iosReadme, /CapApp-SPM.*source of package wiring/i);
  assert.match(iosReadme, /remove duplicate manual plugin\/local package references/i);
  assert.match(iosReadme, /avoid direct `LegatoCore` host linkage/i);
  assert.match(iosReadme, /App\/App\/capacitor\.config\.json/i);
  assert.match(iosReadme, /packageClassList.*LegatoPlugin/i);
  assert.match(iosReadme, /do not hand-edit/i);
  assert.match(iosReadme, /out of scope: generic Apple signing\/team\/provisioning ownership/i);
});

test('npm readiness docs suite includes ios host polish docs test', async () => {
  const packageJson = await readFile(demoPackageJsonPath, 'utf8');
  assert.match(packageJson, /ios-host-polish-v1-docs\.test\.mjs/);
});
