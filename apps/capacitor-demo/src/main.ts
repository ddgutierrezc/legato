import { Capacitor } from '@capacitor/core';
import { Legato, createLegatoSync, type PlaybackSnapshot, type Track } from '@legato/capacitor';
import {
  buildSmokeReportV1,
  createInitialSmokeVerdict,
  reduceSmokeVerdict,
  summarizeSmokeVerdict,
  type SmokeReportV1,
  type SmokeFlow,
} from './smoke-verdict.js';
import {
  buildAutomationSnapshot,
  buildSmokeMarkerLine,
  deriveAutomationStatus,
} from './smoke-automation.js';

type LegatoSyncController = ReturnType<typeof createLegatoSync>;

const smokeButton = document.querySelector<HTMLButtonElement>('#run-smoke');
const endSmokeButton = document.querySelector<HTMLButtonElement>('#run-end-smoke');
const boundarySmokeButton = document.querySelector<HTMLButtonElement>('#run-boundary-smoke');
const artworkRaceButton = document.querySelector<HTMLButtonElement>('#run-artwork-race');
const copyLogButton = document.querySelector<HTMLButtonElement>('#copy-log');
const copyEventsButton = document.querySelector<HTMLButtonElement>('#copy-events');
const copySmokeReportButton = document.querySelector<HTMLButtonElement>('#copy-smoke-report');
const setupButton = document.querySelector<HTMLButtonElement>('#action-setup');
const syncStartButton = document.querySelector<HTMLButtonElement>('#action-sync-start');
const syncStopButton = document.querySelector<HTMLButtonElement>('#action-sync-stop');
const addButton = document.querySelector<HTMLButtonElement>('#action-add');
const playButton = document.querySelector<HTMLButtonElement>('#action-play');
const pauseButton = document.querySelector<HTMLButtonElement>('#action-pause');
const stopButton = document.querySelector<HTMLButtonElement>('#action-stop');
const previousButton = document.querySelector<HTMLButtonElement>('#action-previous');
const nextButton = document.querySelector<HTMLButtonElement>('#action-next');
const seekButton = document.querySelector<HTMLButtonElement>('#action-seek');
const snapshotButton = document.querySelector<HTMLButtonElement>('#action-snapshot');
const seekInput = document.querySelector<HTMLInputElement>('#seek-ms');
const envStatusNode = document.querySelector<HTMLDivElement>('#env-status');
const verdictStatusNode = document.querySelector<HTMLDivElement>('#verdict-status');
const verdictSummaryNode = document.querySelector<HTMLPreElement>('#verdict-summary');
const verdictChecksNode = document.querySelector<HTMLUListElement>('#verdict-checks');
const logNode = document.querySelector<HTMLTextAreaElement>('#log');
const eventsNode = document.querySelector<HTMLTextAreaElement>('#events');
const snapshotSummaryNode = document.querySelector<HTMLPreElement>('#snapshot-summary');
const capabilitySummaryNode = document.querySelector<HTMLPreElement>('#capability-summary');
const paritySummaryNode = document.querySelector<HTMLPreElement>('#parity-summary');
const snapshotJsonNode = document.querySelector<HTMLTextAreaElement>('#snapshot-json');
const automationStatusNode = document.querySelector<HTMLDivElement>('#automation-status');
const smokeReportJsonNode = document.querySelector<HTMLTextAreaElement>('#smoke-report-json');
const automationSnapshotNode = document.querySelector<HTMLPreElement>('#automation-snapshot');

if (
  !smokeButton
  || !endSmokeButton
  || !boundarySmokeButton
  || !artworkRaceButton
  || !copyLogButton
  || !copyEventsButton
  || !copySmokeReportButton
  || !setupButton
  || !syncStartButton
  || !syncStopButton
  || !addButton
  || !playButton
  || !pauseButton
  || !stopButton
  || !previousButton
  || !nextButton
  || !seekButton
  || !snapshotButton
  || !seekInput
  || !envStatusNode
  || !verdictStatusNode
  || !verdictSummaryNode
  || !verdictChecksNode
  || !logNode
  || !eventsNode
  || !snapshotSummaryNode
  || !capabilitySummaryNode
  || !paritySummaryNode
  || !snapshotJsonNode
  || !automationStatusNode
  || !smokeReportJsonNode
  || !automationSnapshotNode
) {
  throw new Error('Demo UI nodes are missing');
}

const nativeActionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.native-action'));
const playbackSmokeDelayMs = 1500;
const endSmokeDelayMs = 6500;
const boundarySettleDelayMs = 300;
const artworkRaceSettleDelayMs = 180;
const recentEventsLimit = 24;
const progressSamplesLimit = 8;

const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();

let syncController: LegatoSyncController | null = null;
let latestSnapshot: PlaybackSnapshot | null = null;
let recentEvents: string[] = [];
let recentProgressSamples: Array<{ state: string; positionMs: number }> = [];
let smokeVerdict = createInitialSmokeVerdict();
let latestSmokeReport: SmokeReportV1 | null = null;
let activeSmokeFlow: SmokeFlow | null = null;
const observedSyncEvents = new Set<string>();

const demoTracks: Track[] = [
  {
    id: 'track-demo-1',
    url: 'https://samplelib.com/mp3/sample-3s.mp3',
    title: 'Demo Track 1 (3s sample)',
    artist: 'Samplelib',
    album: 'Legato Artwork Fixture A',
    artwork: 'https://i.pravatar.cc/300',
    duration: 3239,
    type: 'progressive',
  },
  {
    id: 'track-demo-2',
    url: 'https://samplelib.com/mp3/sample-15s.mp3',
    title: 'Demo Track 2 (15s sample)',
    artist: 'Samplelib',
    album: 'Legato Artwork Fixture B',
    artwork: 'https://i.pravatar.cc/300',
    duration: 19200,
    type: 'progressive',
  },
  {
    id: 'track-demo-3',
    url: 'https://samplelib.com/mp3/sample-9s.mp3',
    title: 'Demo Track 3 (9s no-artwork fallback)',
    artist: 'Samplelib',
    album: 'Legato Artwork Fallback Fixture',
    duration: 9613,
    type: 'progressive',
  },
];

const expectedArtworkByTrackId: Record<string, string | null> = {
  'track-demo-1': demoTracks[0].artwork ?? null,
  'track-demo-2': demoTracks[1].artwork ?? null,
  'track-demo-3': null,
};

const formatMs = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return 'n/a';
  }

  const totalSeconds = Math.floor(Math.max(0, value) / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, '0');
  const seconds = (totalSeconds % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds} (${value}ms)`;
};

const summarizeSnapshot = (snapshot: PlaybackSnapshot): string => {
  const currentTitle = snapshot.currentTrack?.title ?? '(none)';
  const queueItems = (snapshot.queue as { items?: unknown[]; tracks?: unknown[] }).items
    ?? (snapshot.queue as { items?: unknown[]; tracks?: unknown[] }).tracks
    ?? [];
  const queueLength = queueItems.length;
  return [
    `state=${snapshot.state}`,
    `track=${currentTitle}`,
    `index=${snapshot.currentIndex ?? 'null'}`,
    `position=${formatMs(snapshot.position)}`,
    `duration=${formatMs(snapshot.duration)}`,
    `buffered=${formatMs(snapshot.bufferedPosition ?? null)}`,
    `queue=${queueLength}`,
    `error=${snapshot.error ? JSON.stringify(snapshot.error) : 'none'}`,
  ].join(' | ');
};

type ProjectedCapabilities = {
  canSkipNext: boolean;
  canSkipPrevious: boolean;
  canSeek: boolean;
  queueLength: number;
  currentIndex: number | null;
};

const projectCapabilities = (snapshot: PlaybackSnapshot): ProjectedCapabilities => {
  const queueItems = (snapshot.queue as { items?: unknown[]; tracks?: unknown[] }).items
    ?? (snapshot.queue as { items?: unknown[]; tracks?: unknown[] }).tracks
    ?? [];
  const queueLength = queueItems.length;
  const indexValue = snapshot.currentIndex;
  const currentIndex = typeof indexValue === 'number' && Number.isInteger(indexValue) ? indexValue : null;
  const hasQueue = queueLength > 0;
  const isEnded = snapshot.state === 'ended';

  const canSkipNext = hasQueue
    && !isEnded
    && currentIndex !== null
    && currentIndex >= 0
    && currentIndex < queueLength - 1;
  const canSkipPrevious = hasQueue
    && !isEnded
    && currentIndex !== null
    && currentIndex > 0
    && currentIndex < queueLength;
  const canSeek = hasQueue && !isEnded;

  return {
    canSkipNext,
    canSkipPrevious,
    canSeek,
    queueLength,
    currentIndex,
  };
};

const renderCapabilitySummary = (snapshot: PlaybackSnapshot): void => {
  const projection = projectCapabilities(snapshot);
  capabilitySummaryNode.textContent = [
    `canSkipNext=${projection.canSkipNext}`,
    `canSkipPrevious=${projection.canSkipPrevious}`,
    `canSeek=${projection.canSeek}`,
    `queue=${projection.queueLength}`,
    `index=${projection.currentIndex ?? 'null'}`,
  ].join(' | ');
};

const summarizePayload = (payload: unknown): string => {
  if (payload === undefined) {
    return '';
  }

  if (payload instanceof Error) {
    const details = [
      `name=${payload.name}`,
      `message=${payload.message || '(no message)'}`,
    ];

    const stackLine = payload.stack?.split('\n').slice(0, 2).join(' | ');
    if (stackLine) {
      details.push(`stack=${stackLine}`);
    }

    return details.join(' | ');
  }

  if (!payload || typeof payload !== 'object') {
    return String(payload);
  }

  if ('message' in payload || 'code' in payload) {
    const maybeError = payload as {
      message?: unknown;
      code?: unknown;
      name?: unknown;
      stack?: unknown;
    };

    const details = [
      `name=${String(maybeError.name ?? 'Error')}`,
      `message=${String(maybeError.message ?? '(no message)')}`,
    ];

    if (maybeError.code !== undefined) {
      details.push(`code=${String(maybeError.code)}`);
    }

    if (typeof maybeError.stack === 'string' && maybeError.stack) {
      details.push(`stack=${maybeError.stack.split('\n').slice(0, 2).join(' | ')}`);
    }

    return details.join(' | ');
  }

  if ('state' in payload && 'queue' in payload) {
    return `snapshot { ${summarizeSnapshot(payload as PlaybackSnapshot)} }`;
  }

  if ('position' in payload || 'duration' in payload || 'bufferedPosition' in payload) {
    const progress = payload as { position?: number | null; duration?: number | null; bufferedPosition?: number | null };
    return [
      `position=${formatMs(progress.position ?? null)}`,
      `duration=${formatMs(progress.duration ?? null)}`,
      `buffered=${formatMs(progress.bufferedPosition ?? null)}`,
    ].join(' | ');
  }

  const compact = JSON.stringify(payload);
  return compact.length > 220 ? `${compact.slice(0, 220)}…` : compact;
};

const formatRequiredMetadataSignal = (snapshot: PlaybackSnapshot): string => {
  const track = snapshot.currentTrack as Record<string, unknown> | null | undefined;

  if (!track) {
    return 'missing title/artist/album/artwork/duration (no current track)';
  }

  const missing: string[] = [];
  const checkTextField = (field: 'title' | 'artist' | 'album' | 'artwork'): void => {
    const value = track[field];
    if (typeof value !== 'string' || value.trim() === '') {
      missing.push(field);
    }
  };

  checkTextField('title');
  checkTextField('artist');
  checkTextField('album');
  checkTextField('artwork');

  const durationValue = track.duration;
  if (typeof durationValue !== 'number' || !Number.isFinite(durationValue) || durationValue <= 0) {
    missing.push('duration');
  }

  if (missing.length === 0) {
    return 'all required fields present (title/artist/album/artwork/duration)';
  }

  return `missing ${missing.join('/')}`;
};

const addProgressSample = (snapshot: PlaybackSnapshot): void => {
  if (typeof snapshot.position !== 'number' || Number.isNaN(snapshot.position)) {
    return;
  }

  recentProgressSamples = [
    ...recentProgressSamples.slice(-progressSamplesLimit + 1),
    { state: snapshot.state, positionMs: snapshot.position },
  ];
};

const summarizeProgressSignal = (): string => {
  if (recentProgressSamples.length < 2) {
    return 'insufficient samples (capture at least two snapshots/events)';
  }

  const [previous, current] = recentProgressSamples.slice(-2);
  const deltaMs = current.positionMs - previous.positionMs;

  if (current.state === 'playing') {
    if (deltaMs > 250) {
      return `advancing while playing (+${deltaMs}ms latest delta)`;
    }
    return `not clearly advancing while playing (+${deltaMs}ms latest delta)`;
  }

  if (current.state === 'paused') {
    if (Math.abs(deltaMs) <= 150) {
      return `frozen while paused (${deltaMs >= 0 ? '+' : ''}${deltaMs}ms latest delta)`;
    }
    return `unexpected movement while paused (${deltaMs >= 0 ? '+' : ''}${deltaMs}ms latest delta)`;
  }

  return `state=${current.state} latest delta=${deltaMs >= 0 ? '+' : ''}${deltaMs}ms`;
};

const summarizeObservedEventSignals = (): string => {
  const parityEventNames = [...observedSyncEvents].filter((name) => /remote|state|progress|play|pause|metadata|snapshot/i.test(name));
  if (parityEventNames.length === 0) {
    return 'none yet';
  }

  return parityEventNames.slice(-8).join(', ');
};

const updateParityInspector = (snapshot: PlaybackSnapshot): void => {
  const track = snapshot.currentTrack as { id?: string; artwork?: string | null } | null | undefined;
  const trackId = typeof track?.id === 'string' ? track.id : null;
  const currentArtwork = typeof track?.artwork === 'string' && track.artwork.trim().length > 0
    ? track.artwork.trim()
    : null;
  const expectedArtwork = trackId ? (expectedArtworkByTrackId[trackId] ?? null) : null;
  const artworkSignal = (() => {
    if (!trackId) {
      return 'no active track (artwork cleared expected)';
    }

    if (!expectedArtwork) {
      return currentArtwork
        ? `expected fallback clear, but snapshot still has artwork=${currentArtwork}`
        : 'fallback OK: active track has no artwork and snapshot is clear';
    }

    if (!currentArtwork) {
      return `pending artwork load for ${trackId} (expect ${expectedArtwork})`;
    }

    return currentArtwork === expectedArtwork
      ? `artwork OK for ${trackId}`
      : `stale/other artwork detected for ${trackId}: got ${currentArtwork}`;
  })();

  const lines = [
    `state signal: ${snapshot.state}`,
    `progress signal: ${summarizeProgressSignal()}`,
    `metadata signal: ${formatRequiredMetadataSignal(snapshot)}`,
    `artwork signal: ${artworkSignal}`,
    `observed sync events: ${summarizeObservedEventSignals()}`,
    'manual fidelity check: Android lockscreen/notification position rebases from real snapshot after resume/seek, and iOS now-playing playbackRate mirrors play/pause (1.0 vs 0.0).',
  ];

  paritySummaryNode.textContent = lines.join('\n');
};

const log = (message: string, payload?: unknown): void => {
  const prefix = `[${new Date().toLocaleTimeString()}]`;
  const line = payload === undefined ? message : `${message} ${summarizePayload(payload)}`;
  logNode.value = `${logNode.value}${prefix} ${line}\n`;
  logNode.scrollTop = logNode.scrollHeight;
};

const renderRecentEvents = (): void => {
  eventsNode.value = recentEvents.join('\n');
  eventsNode.scrollTop = eventsNode.scrollHeight;
};

const renderSmokeVerdict = (): void => {
  verdictStatusNode.textContent = `Smoke verdict: ${smokeVerdict.status}`;
  verdictStatusNode.dataset.status = smokeVerdict.status;
  verdictSummaryNode.textContent = summarizeSmokeVerdict(smokeVerdict);
  verdictChecksNode.innerHTML = '';

  smokeVerdict.checks.forEach((check) => {
    const item = document.createElement('li');
    const icon = check.ok ? '✅' : '❌';
    item.textContent = `${icon} ${check.label} — ${check.detail}`;
    verdictChecksNode.appendChild(item);
  });
};

const renderAutomationPanel = (): void => {
  const status = deriveAutomationStatus(latestSmokeReport);
  automationStatusNode.dataset.status = status;
  automationStatusNode.textContent = `Automation status: ${status.toUpperCase()}`;

  smokeReportJsonNode.value = latestSmokeReport
    ? JSON.stringify(latestSmokeReport, null, 2)
    : '';

  automationSnapshotNode.textContent = buildAutomationSnapshot({
    report: latestSmokeReport,
    fallbackSnapshotSummary: smokeVerdict.snapshotSummary,
    fallbackRecentEvents: recentEvents,
  });
};

const startSmokeVerdict = (flow: SmokeFlow): void => {
  activeSmokeFlow = flow;
  smokeVerdict = reduceSmokeVerdict(smokeVerdict, { type: 'start', flow });
  renderSmokeVerdict();
};

const completeSmokeVerdict = (): void => {
  const flow = activeSmokeFlow;
  smokeVerdict = reduceSmokeVerdict(smokeVerdict, { type: 'complete' });
  activeSmokeFlow = null;
  renderSmokeVerdict();

  if (flow === 'smoke') {
    latestSmokeReport = buildSmokeReportV1({
      verdict: smokeVerdict,
      recentEvents,
    });
    log(buildSmokeMarkerLine(latestSmokeReport));
    renderAutomationPanel();
  }
};

const failSmokeVerdict = (errorSummary: string): void => {
  const flow = activeSmokeFlow;
  smokeVerdict = reduceSmokeVerdict(smokeVerdict, { type: 'error', message: errorSummary });
  activeSmokeFlow = null;
  renderSmokeVerdict();

  if (flow === 'smoke') {
    latestSmokeReport = buildSmokeReportV1({
      verdict: smokeVerdict,
      recentEvents,
    });
    log(buildSmokeMarkerLine(latestSmokeReport));
    renderAutomationPanel();
  }
};

const addRecentEvent = (message: string): void => {
  const prefix = `[${new Date().toLocaleTimeString()}]`;
  recentEvents = [...recentEvents.slice(-recentEventsLimit + 1), `${prefix} ${message}`];
  renderRecentEvents();
};

const updateSnapshotViews = (snapshot: PlaybackSnapshot): void => {
  latestSnapshot = snapshot;
  addProgressSample(snapshot);
  snapshotSummaryNode.textContent = summarizeSnapshot(snapshot);
  renderCapabilitySummary(snapshot);
  snapshotJsonNode.value = JSON.stringify(snapshot, null, 2);
  updateParityInspector(snapshot);
  addRecentEvent(`snapshot summary ${summarizeSnapshot(snapshot)}`);

  if (activeSmokeFlow) {
    smokeVerdict = reduceSmokeVerdict(smokeVerdict, { type: 'snapshot', snapshot });
    renderSmokeVerdict();
  }
};

const setRunning = (running: boolean): void => {
  nativeActionButtons.forEach((button) => {
    button.disabled = running;
  });
};

const runNativeAction = async (name: string, action: () => Promise<void>): Promise<void> => {
  setRunning(true);
  log(`${name} started`);
  try {
    await action();
    log(`${name} finished`);
    addRecentEvent(`${name} finished`);
  } catch (error) {
    log(`${name} failed:`, error);
    addRecentEvent(`${name} failed ${summarizePayload(error)}`);
    if (activeSmokeFlow) {
      failSmokeVerdict(summarizePayload(error));
    }
  } finally {
    setRunning(false);
  }
};

const startSync = async (): Promise<void> => {
  if (syncController) {
    log('sync already active');
    addRecentEvent('sync already active');
    return;
  }

  syncController = createLegatoSync({
    onSnapshot: (snapshot) => {
      updateSnapshotViews(snapshot);
      log('sync snapshot', snapshot);
    },
    onEvent: (eventName, payload) => {
      observedSyncEvents.add(eventName);
      const details = summarizePayload(payload);
      log(`event:${eventName}`, payload);
      addRecentEvent(`event:${eventName}${details ? ` | ${details}` : ''}`);

      if (latestSnapshot) {
        updateParityInspector(latestSnapshot);
      }
    },
  });

  const initial = await syncController.start();
  updateSnapshotViews(initial);
  log('sync.start() initial snapshot', initial);
};

const stopSync = async (): Promise<void> => {
  if (!syncController) {
    log('sync is not active');
    addRecentEvent('sync is not active');
    return;
  }

  await syncController.stop();
  syncController = null;
  log('sync.stop() done');
};

const copyText = async (text: string, emptyMessage: string, successMessage: string): Promise<void> => {
  const trimmed = text.trim();

  if (!trimmed) {
    log(emptyMessage);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
    log(successMessage);
  } catch {
    log('Clipboard API unavailable. Copy manually from the visible text area.');
  }
};

const setupAction = async (): Promise<void> => {
  await Legato.setup();
  log('setup() ok');
};

const addAction = async (): Promise<void> => {
  const afterAdd = await Legato.add({ tracks: demoTracks, startIndex: 0 });
  updateSnapshotViews(afterAdd);
  log('add() snapshot', afterAdd);
};

const playAction = async (): Promise<void> => {
  await Legato.play();
  log('play() ok');
};

const pauseAction = async (): Promise<void> => {
  await Legato.pause();
  log('pause() ok');
};

const stopAction = async (): Promise<void> => {
  await Legato.stop();
  log('stop() ok');
};

const previousAction = async (): Promise<void> => {
  await Legato.skipToPrevious();
  log('skipToPrevious() ok');
};

const nextAction = async (): Promise<void> => {
  await Legato.skipToNext();
  log('skipToNext() ok');
};

const seekAction = async (): Promise<void> => {
  const value = Number(seekInput.value);
  const targetMs = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  await Legato.seekTo({ position: targetMs });
  log(`seekTo(${targetMs}) ok`);
};

const snapshotAction = async (): Promise<void> => {
  const snapshot = await Legato.getSnapshot();
  updateSnapshotViews(snapshot);
  log('getSnapshot() snapshot', snapshot);
};

const clearFlows = (): void => {
  logNode.value = '';
  recentEvents = [];
  latestSmokeReport = null;
  observedSyncEvents.clear();
  renderRecentEvents();
  renderAutomationPanel();
};

const resetSmokeBaseline = async (): Promise<void> => {
  if (syncController) {
    await stopSync();
  }

  try {
    await Legato.stop();
    log('preflight stop() ok');
  } catch {
    // Ignore if playback was not active yet.
  }

  latestSnapshot = null;
  recentProgressSamples = [];
};

const runSmokeFlow = async (): Promise<void> => {
  startSmokeVerdict('smoke');
  clearFlows();
  log('Starting Legato smoke flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);
  log('Background check: start play(), send app to background, verify playback continues and notification remains active.');

  await setupAction();
  await resetSmokeBaseline();
  await startSync();
  await addAction();
  await playAction();

  log(`waiting ${playbackSmokeDelayMs}ms before pause() to validate audible playback...`);
  await new Promise((resolve) => setTimeout(resolve, playbackSmokeDelayMs));

  await pauseAction();
  await snapshotAction();
  completeSmokeVerdict();
};

const runLetItEndSmokeFlow = async (): Promise<void> => {
  startSmokeVerdict('let-end');
  clearFlows();
  log('Starting Legato let-it-end flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);
  log('Background check: keep app in background and watch for playback-ended event plus service teardown after stop/idle.');

  await setupAction();
  await resetSmokeBaseline();
  await startSync();
  await addAction();
  await playAction();
  log(`play() ok, wait ${endSmokeDelayMs}ms for track end...`);

  await new Promise((resolve) => setTimeout(resolve, endSmokeDelayMs));
  await snapshotAction();
  completeSmokeVerdict();
};

const runBoundarySmokeFlow = async (): Promise<void> => {
  startSmokeVerdict('boundary');
  clearFlows();
  log('Starting Legato boundary smoke flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);
  log('Boundary check: previous on first track should restart to 0; next on last track should end playback.');

  await setupAction();
  await resetSmokeBaseline();
  await startSync();
  await addAction();
  await playAction();

  await previousAction();
  await new Promise((resolve) => setTimeout(resolve, boundarySettleDelayMs));
  await snapshotAction();

  await nextAction();
  await new Promise((resolve) => setTimeout(resolve, boundarySettleDelayMs));
  await snapshotAction();

  await nextAction();
  await new Promise((resolve) => setTimeout(resolve, boundarySettleDelayMs));
  await snapshotAction();
  completeSmokeVerdict();
};

const runArtworkRaceFlow = async (): Promise<void> => {
  clearFlows();
  log('Starting artwork race flow (rapid switch + fallback probe)...');
  log('Expected behavior: artwork should track active item, stale fetches should not overwrite latest track, and no-artwork track should clear artwork.');

  await setupAction();
  await resetSmokeBaseline();
  await startSync();
  await addAction();
  await playAction();

  await new Promise((resolve) => setTimeout(resolve, artworkRaceSettleDelayMs));
  await nextAction();
  await new Promise((resolve) => setTimeout(resolve, artworkRaceSettleDelayMs));
  await nextAction();
  await new Promise((resolve) => setTimeout(resolve, artworkRaceSettleDelayMs));
  await previousAction();
  await new Promise((resolve) => setTimeout(resolve, artworkRaceSettleDelayMs));
  await snapshotAction();
};

envStatusNode.textContent = `platform=${platform} | native=${isNative}`;
log('Legato parity harness ready.');
log('platform:', platform);
log('isNativePlatform:', isNative);
log('Use smoke buttons for quick pass/fail and manual controls for lifecycle/focus deep checks.');

smokeButton.addEventListener('click', () => {
  void runNativeAction('run smoke flow', runSmokeFlow);
});

endSmokeButton.addEventListener('click', () => {
  void runNativeAction('run let-it-end smoke flow', runLetItEndSmokeFlow);
});

boundarySmokeButton.addEventListener('click', () => {
  void runNativeAction('run boundary smoke flow', runBoundarySmokeFlow);
});

artworkRaceButton.addEventListener('click', () => {
  void runNativeAction('run artwork race flow', runArtworkRaceFlow);
});

setupButton.addEventListener('click', () => {
  void runNativeAction('manual setup()', setupAction);
});

syncStartButton.addEventListener('click', () => {
  void runNativeAction('manual sync.start()', startSync);
});

syncStopButton.addEventListener('click', () => {
  void runNativeAction('manual sync.stop()', stopSync);
});

addButton.addEventListener('click', () => {
  void runNativeAction('manual add()', addAction);
});

playButton.addEventListener('click', () => {
  void runNativeAction('manual play()', playAction);
});

pauseButton.addEventListener('click', () => {
  void runNativeAction('manual pause()', pauseAction);
});

stopButton.addEventListener('click', () => {
  void runNativeAction('manual stop()', stopAction);
});

previousButton.addEventListener('click', () => {
  void runNativeAction('manual skipToPrevious()', previousAction);
});

nextButton.addEventListener('click', () => {
  void runNativeAction('manual skipToNext()', nextAction);
});

seekButton.addEventListener('click', () => {
  void runNativeAction('manual seekTo()', seekAction);
});

snapshotButton.addEventListener('click', () => {
  void runNativeAction('manual getSnapshot()', snapshotAction);
});

copyLogButton.addEventListener('click', () => {
  void copyText(logNode.value, 'No log output to copy yet.', 'Copied raw log to clipboard.');
});

copyEventsButton.addEventListener('click', () => {
  void copyText(eventsNode.value, 'No recent events to copy yet.', 'Copied recent events to clipboard.');
});

copySmokeReportButton.addEventListener('click', () => {
  void copyText(
    smokeReportJsonNode.value,
    'No smoke report generated yet. Run smoke flow first.',
    'Copied smoke report JSON to clipboard.',
  );
});

if (!isNative) {
  nativeActionButtons.forEach((button) => {
    button.disabled = true;
  });
  log('Native bridge not available in browser preview. Open from Xcode/Android Studio.');
}

if (latestSnapshot == null) {
  snapshotSummaryNode.textContent = 'No snapshot captured yet.';
  capabilitySummaryNode.textContent = 'No capability projection yet.';
  paritySummaryNode.textContent = 'No parity signals yet.';
}

renderSmokeVerdict();
renderAutomationPanel();
