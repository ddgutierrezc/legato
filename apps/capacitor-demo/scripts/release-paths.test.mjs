import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveReleasePaths } from './release-paths.mjs';

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
