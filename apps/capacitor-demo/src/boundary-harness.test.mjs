import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createBoundarySurfaceSnapshot,
  summarizeBoundaryValidation,
} from './boundary-harness.js';

test('createBoundarySurfaceSnapshot reports playback controls for Legato facade', () => {
  const snapshot = createBoundarySurfaceSnapshot('legato');

  assert.equal(snapshot.activeSurface, 'legato');
  assert.equal(snapshot.playbackTarget, 'Legato facade');
  assert.deepEqual(snapshot.playbackCommands, ['setup', 'add', 'play', 'pause', 'stop', 'seekTo', 'getSnapshot']);
  assert.deepEqual(snapshot.mediaSessionCommands, ['addListener(remote-*)', 'removeAllListeners']);
});

test('createBoundarySurfaceSnapshot reports playback controls for audioPlayer namespace', () => {
  const snapshot = createBoundarySurfaceSnapshot('audioPlayer');

  assert.equal(snapshot.activeSurface, 'audioPlayer');
  assert.equal(snapshot.playbackTarget, 'audioPlayer namespace');
});

test('summarizeBoundaryValidation renders copy-friendly multi-line status', () => {
  const summary = summarizeBoundaryValidation({
    activeSurface: 'audioPlayer',
    playbackTarget: 'audioPlayer namespace',
    playbackCommands: ['setup', 'add', 'play'],
    mediaSessionCommands: ['addListener(remote-*)'],
    parityChecks: [
      { label: 'Legato facade smoke path', ok: true, detail: 'setup/add/play/pause/stop/seekTo/getSnapshot executed via Legato' },
      { label: 'audioPlayer smoke path', ok: true, detail: 'setup/add/play/pause/stop/seekTo/getSnapshot executed via audioPlayer' },
      { label: 'mediaSession boundary visibility', ok: true, detail: 'remote listener registration available via mediaSession' },
    ],
  });

  assert.match(summary, /activeSurface=audioPlayer/);
  assert.match(summary, /playbackTarget=audioPlayer namespace/);
  assert.match(summary, /playbackCommands=setup, add, play/);
  assert.match(summary, /mediaSessionCommands=addListener\(remote-\*\)/);
  assert.match(summary, /✅ Legato facade smoke path/);
  assert.match(summary, /✅ mediaSession boundary visibility/);
});

test('summarizeBoundaryValidation marks failed checks clearly', () => {
  const summary = summarizeBoundaryValidation({
    activeSurface: 'legato',
    playbackTarget: 'Legato facade',
    playbackCommands: ['setup'],
    mediaSessionCommands: ['addListener(remote-*)'],
    parityChecks: [
      { label: 'audioPlayer smoke path', ok: false, detail: 'audioPlayer call failed: timeout' },
    ],
  });

  assert.match(summary, /❌ audioPlayer smoke path — audioPlayer call failed: timeout/);
});
