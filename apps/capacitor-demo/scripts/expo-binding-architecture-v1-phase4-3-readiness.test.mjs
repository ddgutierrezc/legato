import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, '../../..');
const packageRoot = resolve(repoRoot, 'packages/react-native');

function runPhase43GateScript() {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn('node', [
      resolve(packageRoot, 'scripts/phase4-3-release-readiness-gate.mjs'),
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

test('phase-4.3 readiness gate reports publishability checks and dual-platform runtime proof', async () => {
  const output = await runPhase43GateScript();
  const report = JSON.parse(output);

  assert.equal(report.phase, '4.3');
  assert.deepEqual(report.requiredHostRuntimeProofPlatforms, ['ios', 'android']);
  assert.equal(report.runtimeProof.ios.status, 'proven');
  assert.equal(report.runtimeProof.android.status, 'proven');

  assert.equal(report.publishReadiness.autolinking.status, 'pass');
  assert.equal(report.publishReadiness.packageMetadata.status, 'pass');
  assert.equal(report.publishReadiness.dependencies.status, 'pass');
  assert.equal(report.publishReadiness.pendingItems.length, 0);
});

test('phase-4.3 package metadata and scripts enforce release-readiness expectations', async () => {
  const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));

  assert.equal(packageJson.homepage, 'https://github.com/ddgutierrezc/legato/tree/main/packages/react-native#readme');
  assert.equal(packageJson.repository?.directory, 'packages/react-native');
  assert.equal(packageJson.bugs?.url, 'https://github.com/ddgutierrezc/legato/issues');
  assert.equal(packageJson.scripts['readiness:phase4.3'], 'node ./scripts/phase4-3-release-readiness-gate.mjs');

  assert.ok(Array.isArray(packageJson.keywords));
  assert.equal(packageJson.keywords.includes('expo-module'), true);
  assert.equal(packageJson.keywords.includes('autolinking'), true);

  assert.equal(Object.hasOwn(packageJson.peerDependencies ?? {}, 'expo'), true);
  assert.equal(Object.hasOwn(packageJson.peerDependencies ?? {}, 'react-native'), true);
  assert.equal(Object.hasOwn(packageJson.peerDependencies ?? {}, 'react'), true);
});

test('phase-4.3 readiness docs reflect dual-platform proof and no stale pending-language', async () => {
  const readinessDoc = await readFile(
    resolve(packageRoot, 'docs/milestone-1-compatibility-and-readiness.md'),
    'utf8',
  );
  const checklistDoc = await readFile(
    resolve(packageRoot, 'docs/milestone-1-readiness-checklist.md'),
    'utf8',
  );

  assert.match(readinessDoc, /runtime proof status: proven/i);
  assert.doesNotMatch(readinessDoc, /runtime proof status: blocked/i);
  assert.doesNotMatch(readinessDoc, /runtime proof status: pending/i);

  assert.match(checklistDoc, /Phase 4\.3 release checklist gate is missing/i);
  assert.match(checklistDoc, /readiness:phase4\.3/i);
  assert.match(checklistDoc, /status normalization.*proven/i);
});
