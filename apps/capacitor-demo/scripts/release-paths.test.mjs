import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReleasePaths, slugReleaseKey } from './release-paths.mjs';

test('release paths resolve deterministic packet/artifact/docs locations from repo root', () => {
  const paths = resolveReleasePaths({
    repoRoot: '/tmp/legato',
    releaseId: 'R-2026.04.28.1',
  });

  assert.equal(paths.releaseId, 'R-2026.04.28.1');
  assert.match(paths.packetPath, /release-execution-packet\.json$/i);
  assert.match(paths.summaryPath, /summary\.json$/i);
  assert.match(paths.factsPath, /release-facts\.json$/i);
  assert.match(paths.reconciliationPath, /reconciliation-report\.json$/i);
  assert.match(paths.closureBundlePath, /closure-bundle\.json$/i);
  assert.match(paths.derivativeNotesPath, /-ios-derivative\.md$/i);
});

test('release paths derive canonical identity-backed refs with legacy compatibility aliases', () => {
  const paths = resolveReleasePaths({
    repoRoot: '/tmp/legato',
    releaseId: 'R-2026.04.28.1',
    releaseIdentity: {
      channel: 'stable',
      version: '0.1.1',
      package_target: 'capacitor',
      release_key: 'stable/v0.1.1/capacitor',
    },
  });

  assert.equal(slugReleaseKey('stable/v0.1.1/capacitor'), 'stable-v0.1.1-capacitor');
  assert.match(paths.canonicalNarrativePath, /stable-v0\.1\.1-capacitor\.json$/i);
  assert.match(paths.compatibilityNarrativePath, /R-2026\.04\.28\.1\.json$/i);
});
