import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), 'utf8');
}

test('README documents plugin automation boundary and unsupported host', () => {
  const readme = readProjectFile('packages/react-native/README.md');

  assert.match(readme, /"@ddgutierrezc\/legato-react-native"/);
  assert.match(readme, /automates native baseline wiring for Expo prebuild\/dev-build hosts/i);
  assert.match(readme, /does not automate runtime playback orchestration/i);
  assert.match(readme, /Expo Go is not supported for native playback validation/i);
});

test('compatibility doc defines plugin-owned vs app-owned responsibilities', () => {
  const compatibilityDoc = readProjectFile(
    'packages/react-native/docs/milestone-1-compatibility-and-readiness.md',
  );

  assert.match(compatibilityDoc, /Plugin-owned automation/i);
  assert.match(compatibilityDoc, /Developer-owned runtime responsibilities/i);
  assert.match(compatibilityDoc, /register lifecycle listeners/i);
});

test('readiness checklist includes prebuild diff evidence path', () => {
  const readinessDoc = readProjectFile('packages/react-native/docs/milestone-1-readiness-checklist.md');

  assert.match(readinessDoc, /Info\.plist diff expected/i);
  assert.match(readinessDoc, /AndroidManifest\.xml diff expected/i);
  assert.match(readinessDoc, /apps\/expo-demo\/docs\/evidence\/plugin-prebuild-diff-checklist\.md/i);
});

test('milestone-1 docs keep plugin option surface minimal', () => {
  const readme = readProjectFile('packages/react-native/README.md');

  assert.match(readme, /plugins": \["@ddgutierrezc\/legato-react-native"\]/i);
  assert.match(readme, /milestone 1 does not expose advanced option knobs/i);
  assert.match(readme, /no custom channels/i);
  assert.match(readme, /no service class overrides/i);
  assert.match(readme, /no arbitrary plist\/manifest patch options/i);
  assert.doesNotMatch(readme, /plugins"\s*:\s*\[\s*\["@ddgutierrezc\/legato-react-native"/i);
});

test('android conflict-resolution doc includes explicit manual steps', () => {
  const readinessDoc = readProjectFile('packages/react-native/docs/milestone-1-readiness-checklist.md');

  assert.match(readinessDoc, /Manual Android conflict resolution/i);
  assert.match(readinessDoc, /remove duplicate or incompatible `expo\.modules\.legato\.LegatoPlaybackService` entries/i);
  assert.match(readinessDoc, /keep exactly one service node/i);
  assert.match(readinessDoc, /android:exported="false"/i);
  assert.match(readinessDoc, /android:foregroundServiceType="mediaPlayback"/i);
});
