const ruleBook = [
  {
    keyword: 'Interruption begin paused playback.',
    label: 'Interruption begin should pause playback',
    evaluate: ({ snapshotState }) => ({
      ok: snapshotState === 'paused',
      detail: `snapshot.state=${snapshotState}`,
    }),
  },
  {
    keyword: 'Interruption end (shouldResume) reasserted surfaces without auto-play.',
    label: 'Interruption end should reassert without auto-play',
    evaluate: ({ snapshotState }) => ({
      ok: snapshotState === 'paused',
      detail: `snapshot.state=${snapshotState}`,
    }),
  },
  {
    keyword: 'Route available did not auto-resume playback.',
    label: 'Route available should not auto-resume',
    evaluate: ({ snapshotState }) => ({
      ok: snapshotState === 'paused',
      detail: `snapshot.state=${snapshotState}`,
    }),
  },
  {
    keyword: 'Foreground/active reassert projected metadata/progress/playback/capabilities.',
    label: 'Foreground/active reassert should republish playback surfaces',
    evaluate: ({ snapshotState, recentEvents }) => {
      const hasReplaySignals = recentEvents.some((event) => /playback-progress|playback-state-changed/i.test(event));
      return {
        ok: hasReplaySignals && snapshotState !== 'idle' && snapshotState !== 'error',
        detail: hasReplaySignals
          ? `observed replay-related events and snapshot.state=${snapshotState}`
          : `missing replay-related events; snapshot.state=${snapshotState}`,
      };
    },
  },
];

export const classifyLifecycleCheckpoint = (step, snapshotState, recentEvents = []) => {
  const normalizedStep = typeof step === 'string' ? step : '';
  const normalizedState = typeof snapshotState === 'string' ? snapshotState : 'unknown';
  const normalizedEvents = Array.isArray(recentEvents) ? recentEvents.map((event) => String(event)) : [];
  const rule = ruleBook.find((entry) => entry.keyword === normalizedStep);

  if (!rule) {
    return {
      label: normalizedStep || 'Unknown lifecycle checkpoint',
      ok: false,
      detail: `no lifecycle rule matched; snapshot.state=${normalizedState}`,
    };
  }

  const verdict = rule.evaluate({ snapshotState: normalizedState, recentEvents: normalizedEvents });
  return {
    label: rule.label,
    ok: verdict.ok,
    detail: verdict.detail,
  };
};

export const buildLifecycleCheckpointSummary = (checkpoints) => {
  const lines = (Array.isArray(checkpoints) ? checkpoints : [])
    .map((checkpoint) => {
      const verdict = classifyLifecycleCheckpoint(
        checkpoint?.step,
        checkpoint?.snapshotState,
        checkpoint?.recentEvents,
      );
      const icon = verdict.ok ? '✅' : '❌';
      return `${icon} ${verdict.label} — ${verdict.detail}`;
    });

  return lines.length > 0
    ? lines.join('\n')
    : 'No lifecycle checkpoints captured yet. Run lifecycle evidence flow and paste checkpoints from the log.';
};
