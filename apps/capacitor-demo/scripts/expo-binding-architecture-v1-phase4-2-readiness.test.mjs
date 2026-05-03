import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const packageRoot = resolve(repoRoot, 'packages/react-native');

function runEvidenceContractScript() {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('node', [
      resolve(packageRoot, 'scripts/phase4-2-dev-build-evidence-contract.mjs'),
    ]);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', rejectRun);
    child.on('close', (code) => {
      if (code !== 0) {
        rejectRun(new Error(`script failed (${code}): ${stderr}`));
        return;
      }
      resolveRun(stdout);
    });
  });
}

test('phase-4.2 contract defines executable dual-platform evidence capture workflow', async () => {
  const output = await runEvidenceContractScript();
  const contract = JSON.parse(output);

  assert.equal(contract.phase, '4.2');
  assert.match(contract.policy.expoGo, /not valid native evidence/i);
  assert.deepEqual(contract.requiredFlow, [
    'expo prebuild',
    'expo run:ios',
    'expo run:android',
  ]);
  assert.deepEqual(contract.platforms, ['ios', 'android']);

  assert.equal(contract.evidence.ios.status, 'pending-runtime-proof');
  assert.equal(contract.evidence.android.status, 'pending-runtime-proof');
  assert.match(contract.evidence.ios.linkPlaceholder, /REPLACE_WITH_IOS_EVIDENCE_LINK/);
  assert.match(contract.evidence.android.linkPlaceholder, /REPLACE_WITH_ANDROID_EVIDENCE_LINK/);
});

test('phase-4.2 docs publish compatibility matrix and review-ready evidence template', async () => {
  const readinessDoc = await readFile(
    resolve(packageRoot, 'docs/milestone-1-compatibility-and-readiness.md'),
    'utf8',
  );
  const evidenceTemplate = await readFile(
    resolve(packageRoot, 'docs/evidence/phase4-2-dev-build-evidence-template.md'),
    'utf8',
  );

  assert.match(readinessDoc, /Expo Go is NOT valid runtime evidence/i);
  assert.match(readinessDoc, /support matrix/i);
  assert.match(readinessDoc, /iOS \|/i);
  assert.match(readinessDoc, /Android \|/i);
  assert.match(readinessDoc, /runtime proof status: (pending|proven)/i);

  assert.match(evidenceTemplate, /expo prebuild/);
  assert.match(evidenceTemplate, /expo run:ios/);
  assert.match(evidenceTemplate, /expo run:android/);
  assert.match(evidenceTemplate, /Observed events/i);
  assert.match(evidenceTemplate, /Foreground\/background resync evidence/i);
});

test('phase-4.2 readiness checklist and package script expose review gate hooks', async () => {
  const checklistSource = await readFile(
    resolve(packageRoot, 'docs/milestone-1-readiness-checklist.md'),
    'utf8',
  );
  const packageJsonSource = await readFile(resolve(packageRoot, 'package.json'), 'utf8');
  const packageJson = JSON.parse(packageJsonSource);

  assert.match(checklistSource, /Phase 4\.2 compatibility\/readiness doc is missing/i);
  assert.match(checklistSource, /phase4-2-dev-build-evidence-template\.md/i);
  assert.equal(
    packageJson.scripts['evidence:phase4.2'],
    'node ./scripts/phase4-2-dev-build-evidence-contract.mjs',
  );
});
