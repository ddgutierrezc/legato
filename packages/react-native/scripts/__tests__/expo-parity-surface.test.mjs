import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(__dirname, '../../src');
const packageRoot = path.resolve(__dirname, '../..');
const iosModulePath = path.resolve(__dirname, '../../ios/LegatoModule.swift');
const podspecPath = path.resolve(__dirname, '../../legato-react-native.podspec');
const androidModulePath = path.resolve(
  __dirname,
  '../../android/src/main/java/expo/modules/legato/LegatoModule.kt',
);
const androidServicePath = path.resolve(
  __dirname,
  '../../android/src/main/java/expo/modules/legato/LegatoPlaybackService.kt',
);
const androidGradlePath = path.resolve(__dirname, '../../android/build.gradle');
const readmePath = path.resolve(__dirname, '../../README.md');
const docsRoot = path.resolve(
  __dirname,
  '../../../../apps/docs-site/src/content/docs/packages/react-native',
);
const docsOverviewPath = path.resolve(docsRoot, 'index.mdx');
const docsReferencePath = path.resolve(docsRoot, 'reference/parity-mapping.mdx');
const docsBoundariesPath = path.resolve(docsRoot, 'explanation/parity-boundaries.mdx');
const evidenceChecklistPath = path.resolve(
  __dirname,
  '../../docs/evidence/parity-readiness-checklist.md',
);

const readSrc = (name) => readFile(path.join(srcDir, name), 'utf8');

const runTypecheckSnippet = async (source) => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), 'legato-rn-parity-'));
  const snippetPath = path.join(tempDir, 'snippet.ts');

  try {
    await writeFile(snippetPath, source, 'utf8');
    const args = [
      '--noEmit',
      '--strict',
      '--target',
      'ES2022',
      '--module',
      'NodeNext',
      '--moduleResolution',
      'NodeNext',
      '--skipLibCheck',
      '--types',
      'node',
      snippetPath,
    ];

    await execFileAsync('npm', ['exec', 'tsc', '--', ...args], { cwd: packageRoot });
    return { ok: true, stderr: '' };
  } catch (error) {
    return { ok: false, stderr: `${error.stdout ?? ''}\n${error.stderr ?? ''}` };
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
};

test('index.ts exports Capacitor-parity namespaces and factories', async () => {
  const indexSource = await readSrc('index.ts');

  assert.match(indexSource, /export type \* from '\.\/definitions';/);
  assert.match(indexSource, /export \{ Legato, audioPlayer, mediaSession \} from '\.\/plugin';/);
  assert.match(indexSource, /export \{ createAudioPlayerSync, createLegatoSync \} from '\.\/sync';/);
});

test('index.ts does not export legacy RN-only wrapper surface', async () => {
  const indexSource = await readSrc('index.ts');

  assert.ok(!indexSource.includes('createLegatoWrapper'));
  assert.ok(!indexSource.includes('canonicalEventNames'));
});

test('definitions and native module declarations avoid unknown placeholders', async () => {
  const definitionsSource = await readSrc('definitions.ts');
  const nativeModuleSource = await readSrc('LegatoModule.ts');

  assert.ok(!definitionsSource.includes('unknown'));
  assert.ok(!nativeModuleSource.includes('tracks: unknown[]'));
  assert.ok(!nativeModuleSource.includes('headerGroups?: unknown[]'));
  assert.match(nativeModuleSource, /seekTo\(options: SeekToOptions\): Promise<void>;/);
  assert.match(nativeModuleSource, /getPosition\(\): Promise<number>;/);
});

test('2.3 valid parity payloads type-check with concrete definitions', async () => {
  const result = await runTypecheckSnippet(`
    import type { AddOptions, SeekToOptions, RemoveOptions } from '${srcDir}/definitions';

    const add: AddOptions = { tracks: [] };
    const seek: SeekToOptions = { position: 12 };
    const removeById: RemoveOptions = { id: 'track-1' };
    const removeByIndex: RemoveOptions = { index: 0 };

    void add;
    void seek;
    void removeById;
    void removeByIndex;
  `);

  assert.equal(result.ok, true, result.stderr);
});

test('2.3 invalid parity payloads fail at compile-time', async () => {
  const result = await runTypecheckSnippet(`
    import type { AddOptions, SeekToOptions, SkipToOptions, RemoveOptions } from '${srcDir}/definitions';

    const invalidAdd: AddOptions = { tracks: [{ id: 42 }] };
    const invalidSeek: SeekToOptions = { position: '10' };
    const invalidSkip: SkipToOptions = { index: '2' };
    const invalidRemove: RemoveOptions = { id: 99 };

    void invalidAdd;
    void invalidSeek;
    void invalidSkip;
    void invalidRemove;
  `);

  assert.equal(result.ok, false, 'Expected TypeScript compile-time failure for invalid payloads');
  assert.match(result.stderr, /Type '\w+' is not assignable to type 'number'|Type 'number' is not assignable to type 'string'/);
});

test('3.3 sync semantic ordering: start resyncs before subscribing', async () => {
  const syncSource = await readSrc('sync.ts');

  const startIndex = syncSource.indexOf('async start()');
  const resyncIndex = syncSource.indexOf('const snapshot = await this.resync();');
  const subscribeIndex = syncSource.indexOf('await subscribe();');

  assert.ok(startIndex >= 0);
  assert.ok(resyncIndex > startIndex);
  assert.ok(subscribeIndex > resyncIndex);
});

test('3.3 sync projection updates queue/state fields and ignores remote-only mutations', async () => {
  const syncSource = await readSrc('sync.ts');

  assert.match(syncSource, /case 'playback-queue-changed':[\s\S]*queue: eventPayload.queue,[\s\S]*currentIndex: eventPayload.queue.currentIndex,/);
  assert.match(syncSource, /case 'playback-state-changed':[\s\S]*state: eventPayload.state/);
  assert.match(syncSource, /case 'remote-play':[\s\S]*case 'remote-seek':[\s\S]*break;/);
});

test('4.1 iOS module declares baseline bridge methods and core wiring', async () => {
  const iosSource = await readFile(iosModulePath, 'utf8');

  assert.match(iosSource, /Name\("Legato"\)/);
  assert.match(iosSource, /Function\("setup"\)/);
  assert.match(iosSource, /Function\("add"\)/);
  assert.match(iosSource, /Function\("remove"\)/);
  assert.match(iosSource, /Function\("reset"\)/);
  assert.match(iosSource, /Function\("play"\)/);
  assert.match(iosSource, /Function\("pause"\)/);
  assert.match(iosSource, /Function\("stop"\)/);
  assert.match(iosSource, /Function\("seekTo"\)/);
  assert.match(iosSource, /Function\("skipTo"\)/);
  assert.match(iosSource, /Function\("skipToNext"\)/);
  assert.match(iosSource, /Function\("skipToPrevious"\)/);
  assert.match(iosSource, /Function\("getState"\)/);
  assert.match(iosSource, /Function\("getPosition"\)/);
  assert.match(iosSource, /Function\("getDuration"\)/);
  assert.match(iosSource, /Function\("getCurrentTrack"\)/);
  assert.match(iosSource, /Function\("getQueue"\)/);
  assert.match(iosSource, /Function\("getSnapshot"\)/);
  assert.match(iosSource, /Function\("getCapabilities"\)/);
  assert.match(iosSource, /OnStartObserving/);
  assert.match(iosSource, /OnStopObserving/);
  assert.match(iosSource, /private let core = LegatoiOSCoreFactory\.make\(\)/);
});

test('4.3 iOS podspec wires Expo and LegatoCore dependencies', async () => {
  const podspecSource = await readFile(podspecPath, 'utf8');

  assert.match(podspecSource, /s\.dependency 'ExpoModulesCore'/);
  assert.match(podspecSource, /s\.dependency 'LegatoCore'/);
});

test('5.1 Android module declares baseline bridge methods and event wiring', async () => {
  const androidSource = await readFile(androidModulePath, 'utf8');

  assert.match(androidSource, /Name\("Legato"\)/);
  assert.match(androidSource, /Events\([\s\S]*"playback-state-changed"/);
  assert.match(androidSource, /Function\("setup"\)/);
  assert.match(androidSource, /Function\("add"\)/);
  assert.match(androidSource, /Function\("remove"\)/);
  assert.match(androidSource, /Function\("reset"\)/);
  assert.match(androidSource, /Function\("play"\)/);
  assert.match(androidSource, /Function\("pause"\)/);
  assert.match(androidSource, /Function\("stop"\)/);
  assert.match(androidSource, /Function\("seekTo"\)/);
  assert.match(androidSource, /Function\("skipTo"\)/);
  assert.match(androidSource, /Function\("skipToNext"\)/);
  assert.match(androidSource, /Function\("skipToPrevious"\)/);
  assert.match(androidSource, /Function\("getState"\)/);
  assert.match(androidSource, /Function\("getPosition"\)/);
  assert.match(androidSource, /Function\("getDuration"\)/);
  assert.match(androidSource, /Function\("getCurrentTrack"\)/);
  assert.match(androidSource, /Function\("getQueue"\)/);
  assert.match(androidSource, /Function\("getSnapshot"\)/);
  assert.match(androidSource, /Function\("getCapabilities"\)/);
  assert.match(androidSource, /OnStartObserving/);
  assert.match(androidSource, /OnStopObserving/);
  assert.match(androidSource, /private val core = LegatoAndroidCoreFactory\.make\(\)/);
});

test('5.2 Android playback service aligns with coordinator bootstrap semantics', async () => {
  const serviceSource = await readFile(androidServicePath, 'utf8');

  assert.match(serviceSource, /class LegatoPlaybackService : Service\(\)/);
  assert.match(serviceSource, /private val core = LegatoAndroidCoreFactory\.make\(\)/);
  assert.match(serviceSource, /override fun onCreate\(\)/);
  assert.match(serviceSource, /core\.playback\.onServiceCreated\(\)/);
  assert.match(serviceSource, /override fun onDestroy\(\)/);
  assert.match(serviceSource, /core\.playback\.onServiceDestroyed\(\)/);
});

test('5.3 Android Gradle wires Expo and LegatoCore dependencies', async () => {
  const gradleSource = await readFile(androidGradlePath, 'utf8');

  assert.match(gradleSource, /implementation\s+project\(':expo-modules-core'\)/);
  assert.match(gradleSource, /implementation\s+'io\.github\.ddgutierrezc:legato-core:[^']+'/);
});

test('6.1 README documents explicit Capacitor parity mapping, boundaries, and troubleshooting', async () => {
  const readme = await readFile(readmePath, 'utf8');

  assert.match(readme, /## Capacitor parity mapping/i);
  assert.match(readme, /\| Capacitor baseline export \| React Native export \| Notes \|/);
  assert.match(readme, /## In-scope vs out-of-scope boundaries/i);
  assert.match(readme, /out-of-scope/i);
  assert.match(readme, /## Troubleshooting parity validation/i);
  assert.match(readme, /Expo Go is not supported/i);
});

test('6.2 docs-site includes react-native parity overview, mapping, and boundaries pages', async () => {
  const [overview, mapping, boundaries] = await Promise.all([
    readFile(docsOverviewPath, 'utf8'),
    readFile(docsReferencePath, 'utf8'),
    readFile(docsBoundariesPath, 'utf8'),
  ]);

  assert.match(overview, /title:\s*React Native Package/i);
  assert.match(overview, /Capacitor parity/i);
  assert.match(overview, /reference\/parity-mapping/i);

  assert.match(mapping, /title:\s*Parity Mapping/i);
  assert.match(mapping, /\| Capacitor baseline \| React Native \| Parity status \| Evidence \|/);
  assert.match(mapping, /audioPlayer/i);
  assert.match(mapping, /mediaSession/i);
  assert.match(mapping, /createAudioPlayerSync/i);

  assert.match(boundaries, /title:\s*Parity Boundaries/i);
  assert.match(boundaries, /in-scope/i);
  assert.match(boundaries, /out-of-scope/i);
});

test('6.3 evidence checklist is complete and traceable for parity declaration', async () => {
  const checklist = await readFile(evidenceChecklistPath, 'utf8');

  assert.match(checklist, /## Required evidence paths/i);
  assert.match(checklist, /phase4-3-expo-host-validation-2026-05-02\.md/);
  assert.match(checklist, /full package Jest execution record/i);
  assert.match(checklist, /## Parity claim gate/i);
  assert.match(checklist, /Current status:\s*\*\*ready\*\*/i);
  assert.match(checklist, /mismatch disposition/i);
  assert.match(checklist, /- \[x\] Baseline API export inventory parity verified/i);
  assert.match(checklist, /- \[x\] Public type strictness verified/i);
});
