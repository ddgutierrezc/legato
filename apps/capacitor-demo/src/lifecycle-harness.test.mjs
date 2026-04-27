import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildLifecycleCheckpointSummary,
  classifyLifecycleCheckpoint,
} from './lifecycle-harness.js';

test('classifyLifecycleCheckpoint marks interruption and route expectations', () => {
  assert.deepEqual(
    classifyLifecycleCheckpoint('Interruption begin paused playback.', 'paused'),
    {
      label: 'Interruption begin should pause playback',
      ok: true,
      detail: 'snapshot.state=paused',
    },
  );

  assert.deepEqual(
    classifyLifecycleCheckpoint('Route available did not auto-resume playback.', 'paused'),
    {
      label: 'Route available should not auto-resume',
      ok: true,
      detail: 'snapshot.state=paused',
    },
  );
});

test('classifyLifecycleCheckpoint marks active/foreground reassert checkpoint by signal presence', () => {
  assert.deepEqual(
    classifyLifecycleCheckpoint(
      'Foreground/active reassert projected metadata/progress/playback/capabilities.',
      'playing',
      ['event:playback-progress', 'event:playback-state-changed'],
    ),
    {
      label: 'Foreground/active reassert should republish playback surfaces',
      ok: true,
      detail: 'observed replay-related events and snapshot.state=playing',
    },
  );
});

test('buildLifecycleCheckpointSummary renders compact copy-friendly lines', () => {
  const summary = buildLifecycleCheckpointSummary([
    {
      step: 'Interruption begin paused playback.',
      snapshotState: 'paused',
      recentEvents: ['event:playback-state-changed'],
    },
    {
      step: 'Foreground/active reassert projected metadata/progress/playback/capabilities.',
      snapshotState: 'playing',
      recentEvents: ['event:playback-progress', 'event:playback-state-changed'],
    },
  ]);

  assert.match(summary, /✅ Interruption begin should pause playback — snapshot.state=paused/);
  assert.match(summary, /✅ Foreground\/active reassert should republish playback surfaces — observed replay-related events and snapshot.state=playing/);
});
