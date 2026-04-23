import { Capacitor } from '@capacitor/core';
import {
  Legato,
  addAudioPlayerListener,
  addMediaSessionListener,
  audioPlayer,
  createAudioPlayerSync,
  mediaSession,
  type AudioPlayerApi,
  type PlaybackSnapshot,
  type Track,
} from '@legato/capacitor';
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
import {
  createBoundarySurfaceSnapshot,
  summarizeBoundaryValidation,
} from './boundary-harness.js';

type LegatoSyncController = ReturnType<typeof createAudioPlayerSync>;

const smokeButton = document.querySelector<HTMLButtonElement>('#run-smoke');
const endSmokeButton = document.querySelector<HTMLButtonElement>('#run-end-smoke');
const boundarySmokeButton = document.querySelector<HTMLButtonElement>('#run-boundary-smoke');
const surfaceValidationButton = document.querySelector<HTMLButtonElement>('#run-surface-validation');
const artworkRaceButton = document.querySelector<HTMLButtonElement>('#run-artwork-race');
const remotePauseCaseButton = document.querySelector<HTMLButtonElement>('#run-case-remote-pause');
const remotePlayCaseButton = document.querySelector<HTMLButtonElement>('#run-case-remote-play');
const remoteSkipCaseButton = document.querySelector<HTMLButtonElement>('#run-case-remote-skip');
const remoteSeekCaseButton = document.querySelector<HTMLButtonElement>('#run-case-remote-seek');
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
const useLegatoSurfaceButton = document.querySelector<HTMLButtonElement>('#use-legato-surface');
const useAudioPlayerSurfaceButton = document.querySelector<HTMLButtonElement>('#use-audioplayer-surface');
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
const boundarySummaryNode = document.querySelector<HTMLPreElement>('#boundary-summary');

if (
  !smokeButton
  || !endSmokeButton
  || !boundarySmokeButton
  || !surfaceValidationButton
  || !artworkRaceButton
  || !remotePauseCaseButton
  || !remotePlayCaseButton
  || !remoteSkipCaseButton
  || !remoteSeekCaseButton
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
  || !useLegatoSurfaceButton
  || !useAudioPlayerSurfaceButton
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
  || !boundarySummaryNode
) {
  throw new Error('Demo UI nodes are missing');
}

const nativeActionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.native-action'));
const playbackSmokeDelayMs = 1500;
const endSmokeDelayMs = 6500;
const boundarySettleDelayMs = 300;
const artworkRaceSettleDelayMs = 180;
const guidedCaseTimeoutMs = 15000;
const guidedCasePollMs = 220;
const guidedCaseSettleMs = 600;
const recentEventsLimit = 24;
const progressSamplesLimit = 8;

const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();

type PlaybackSurface = 'legato' | 'audioPlayer';
type BoundaryCheck = { label: string; ok: boolean; detail: string };
type SyncEventRecord = { name: string; summary: string; timestamp: number };

let syncController: LegatoSyncController | null = null;
let latestSnapshot: PlaybackSnapshot | null = null;
let recentEvents: string[] = [];
let recentProgressSamples: Array<{ state: string; positionMs: number }> = [];
let smokeVerdict = createInitialSmokeVerdict();
let latestSmokeReport: SmokeReportV1 | null = null;
let activeSmokeFlow: SmokeFlow | null = null;
const observedSyncEvents = new Set<string>();
let activePlaybackSurface: PlaybackSurface = 'legato';
let boundaryChecks: BoundaryCheck[] = [];
let syncEventHistory: SyncEventRecord[] = [];

const resolvePlaybackApi = (surface: PlaybackSurface): AudioPlayerApi => (
  surface === 'audioPlayer' ? audioPlayer : Legato
);

const demoTracks: Track[] = [
  {
    id: 'track-demo-1',
    url: 'https://samplelib.com/mp3/sample-12s.mp3',
    title: 'Demo Track 1 (12s sample)',
    artist: 'Samplelib',
    album: 'Legato Artwork Fixture A',
    artwork: 'https://i.pravatar.cc/300',
    duration: 12000,
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
    artwork: 'https://i.pravatar.cc/300',
    duration: 9613,
    type: 'progressive',
  },
];

const expectedArtworkByTrackId: Record<string, string | null> = {
  'track-demo-1': demoTracks[0].artwork ?? null,
  'track-demo-2': demoTracks[1].artwork ?? null,
  'track-demo-3': demoTracks[2].artwork ?? null,
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
    `error=${snapshot.state === 'error' ? 'state=error (details in logs)' : 'none'}`,
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

const renderBoundarySummary = (): void => {
  const surfaceSnapshot = createBoundarySurfaceSnapshot(activePlaybackSurface);
  boundarySummaryNode.textContent = summarizeBoundaryValidation({
    ...surfaceSnapshot,
    parityChecks: boundaryChecks,
  });

  useLegatoSurfaceButton.disabled = activePlaybackSurface === 'legato';
  useAudioPlayerSurfaceButton.disabled = activePlaybackSurface === 'audioPlayer';
};

const addBoundaryCheck = (check: BoundaryCheck): void => {
  boundaryChecks = [...boundaryChecks.slice(-7), check];
  renderBoundarySummary();
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

  syncController = createAudioPlayerSync({
    onSnapshot: (snapshot) => {
      updateSnapshotViews(snapshot);
      log('sync snapshot', snapshot);
    },
    onEvent: (eventName, payload) => {
      observedSyncEvents.add(eventName);
      const details = summarizePayload(payload);
      syncEventHistory = [
        ...syncEventHistory.slice(-95),
        {
          name: eventName,
          summary: details,
          timestamp: Date.now(),
        },
      ];
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

const verifyNamespacedAudioPlayerListenerHelper = async (): Promise<void> => {
  const eventName = 'playback-progress';
  const helperHandle = await addAudioPlayerListener(eventName, (payload) => {
    void payload;
  });
  await helperHandle.remove();
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

const setupAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  await resolvePlaybackApi(surface).setup();
  log(`[${surface}] setup() ok`);
};

const addAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  const afterAdd = await resolvePlaybackApi(surface).add({ tracks: demoTracks, startIndex: 0 });
  updateSnapshotViews(afterAdd);
  log(`[${surface}] add() snapshot`, afterAdd);
};

const playAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  await resolvePlaybackApi(surface).play();
  log(`[${surface}] play() ok`);
};

const pauseAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  await resolvePlaybackApi(surface).pause();
  log(`[${surface}] pause() ok`);
};

const stopAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  await resolvePlaybackApi(surface).stop();
  log(`[${surface}] stop() ok`);
};

const previousAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  await resolvePlaybackApi(surface).skipToPrevious();
  log(`[${surface}] skipToPrevious() ok`);
};

const nextAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  await resolvePlaybackApi(surface).skipToNext();
  log(`[${surface}] skipToNext() ok`);
};

const seekAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  const value = Number(seekInput.value);
  const targetMs = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  await resolvePlaybackApi(surface).seekTo({ position: targetMs });
  log(`[${surface}] seekTo(${targetMs}) ok`);
};

const snapshotAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  const snapshot = await resolvePlaybackApi(surface).getSnapshot();
  updateSnapshotViews(snapshot);
  log(`[${surface}] getSnapshot() snapshot`, snapshot);
};

const clearFlows = (): void => {
  logNode.value = '';
  recentEvents = [];
  syncEventHistory = [];
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
    await resolvePlaybackApi('legato').stop();
    log('preflight stop() ok');
  } catch {
    // Ignore if playback was not active yet.
  }

  latestSnapshot = null;
  recentProgressSamples = [];
};

const sleep = async (durationMs: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};

const waitForCondition = async (predicate: () => boolean, timeoutMs: number): Promise<boolean> => {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    if (predicate()) {
      return true;
    }
    await sleep(guidedCasePollMs);
  }

  return predicate();
};

const caseCheck = (label: string, ok: boolean, detail: string): void => {
  addBoundaryCheck({ label, ok, detail });
  log(`[guided-case] ${ok ? 'PASS' : 'FAIL'} | ${label} | ${detail}`);
};

const remoteEventSeenSince = (eventName: string | RegExp, startedAt: number): boolean => (
  syncEventHistory.some((entry) => {
    if (entry.timestamp < startedAt) {
      return false;
    }
    return typeof eventName === 'string'
      ? entry.name === eventName
      : eventName.test(entry.name);
  })
);

const setupGuidedRemoteCaseBaseline = async (
  caseName: string,
  prePause = false,
): Promise<PlaybackSnapshot> => {
  clearFlows();
  boundaryChecks = [];
  renderBoundarySummary();

  log(`[guided-case] start | ${caseName}`);
  log('[guided-case] baseline reset: stop previous playback, start sync, add fixture queue, begin playback.');

  await setupAction('legato');
  await resetSmokeBaseline();
  await startSync();
  await addAction('legato');
  await playAction('legato');
  await sleep(guidedCaseSettleMs);

  if (prePause) {
    await pauseAction('legato');
    await sleep(Math.round(guidedCaseSettleMs / 2));
  }

  await snapshotAction('legato');

  if (!latestSnapshot) {
    throw new Error(`Unable to capture baseline snapshot for ${caseName}`);
  }

  log(`[guided-case] baseline ready | ${summarizeSnapshot(latestSnapshot)}`);
  return latestSnapshot;
};

const runSmokeFlow = async (): Promise<void> => {
  startSmokeVerdict('smoke');
  clearFlows();
  log('Starting Legato smoke flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);
  log('Background check: start play(), send app to background, verify playback continues and notification remains active.');

  await setupAction('legato');
  await resetSmokeBaseline();
  await startSync();
  await verifyNamespacedAudioPlayerListenerHelper();
  await addAction('legato');
  await playAction('legato');

  log(`waiting ${playbackSmokeDelayMs}ms before pause() to validate audible playback...`);
  await new Promise((resolve) => setTimeout(resolve, playbackSmokeDelayMs));

  await pauseAction('legato');
  await snapshotAction('legato');
  completeSmokeVerdict();
};

const runLetItEndSmokeFlow = async (): Promise<void> => {
  startSmokeVerdict('let-end');
  clearFlows();
  log('Starting Legato let-it-end flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);
  log('Background check: keep app in background and watch for playback-ended event plus service teardown after stop/idle.');

  await setupAction('legato');
  await resetSmokeBaseline();
  await startSync();
  await addAction('legato');
  await playAction('legato');
  log(`play() ok, wait ${endSmokeDelayMs}ms for track end...`);

  await new Promise((resolve) => setTimeout(resolve, endSmokeDelayMs));
  await snapshotAction('legato');
  completeSmokeVerdict();
};

const runBoundarySmokeFlow = async (): Promise<void> => {
  startSmokeVerdict('boundary');
  clearFlows();
  log('Starting Legato boundary smoke flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);
  log('Boundary check: previous on first track should restart to 0; next on last track should end playback.');

  await setupAction('legato');
  await resetSmokeBaseline();
  await startSync();
  await addAction('legato');
  await playAction('legato');

  await previousAction('legato');
  await new Promise((resolve) => setTimeout(resolve, boundarySettleDelayMs));
  await snapshotAction('legato');

  await nextAction('legato');
  await new Promise((resolve) => setTimeout(resolve, boundarySettleDelayMs));
  await snapshotAction('legato');

  await nextAction('legato');
  await new Promise((resolve) => setTimeout(resolve, boundarySettleDelayMs));
  await snapshotAction('legato');
  completeSmokeVerdict();
};

const runArtworkRaceFlow = async (): Promise<void> => {
  clearFlows();
  log('Starting artwork race flow (rapid switch + fallback probe)...');
  log('Expected behavior: artwork should track active item, stale fetches should not overwrite latest track, and no-artwork track should clear artwork.');

  await setupAction('legato');
  await resetSmokeBaseline();
  await startSync();
  await addAction('legato');
  await playAction('legato');

  await new Promise((resolve) => setTimeout(resolve, artworkRaceSettleDelayMs));
  await nextAction('legato');
  await new Promise((resolve) => setTimeout(resolve, artworkRaceSettleDelayMs));
  await nextAction('legato');
  await new Promise((resolve) => setTimeout(resolve, artworkRaceSettleDelayMs));
  await previousAction('legato');
  await new Promise((resolve) => setTimeout(resolve, artworkRaceSettleDelayMs));
  await snapshotAction('legato');
};

const queueLengthFromSnapshot = (snapshot: PlaybackSnapshot): number => {
  const queue = snapshot.queue as { items?: unknown[]; tracks?: unknown[] };
  return (queue.items ?? queue.tracks ?? []).length;
};

const runSurfacePlaybackProbe = async (surface: PlaybackSurface): Promise<PlaybackSnapshot> => {
  const api = resolvePlaybackApi(surface);
  await api.setup();
  await api.reset();
  await api.add({ tracks: demoTracks, startIndex: 0 });
  await api.play();
  await new Promise((resolve) => setTimeout(resolve, 500));
  await api.pause();
  await api.seekTo({ position: 900 });
  const snapshot = await api.getSnapshot();
  updateSnapshotViews(snapshot);
  return snapshot;
};

const runSurfaceValidationFlow = async (): Promise<void> => {
  clearFlows();
  boundaryChecks = [];
  renderBoundarySummary();
  log('Starting API boundary validation flow (Legato + audioPlayer + mediaSession)...');

  await resetSmokeBaseline();
  await startSync();

  const legatoSnapshot = await runSurfacePlaybackProbe('legato');
  addBoundaryCheck({
    label: 'Legato facade smoke path',
    ok: true,
    detail: 'setup/add/play/pause/seekTo/getSnapshot executed via Legato',
  });

  const audioPlayerSnapshot = await runSurfacePlaybackProbe('audioPlayer');
  addBoundaryCheck({
    label: 'audioPlayer smoke path',
    ok: true,
    detail: 'setup/add/play/pause/seekTo/getSnapshot executed via audioPlayer',
  });

  const parityMatch = legatoSnapshot.state === audioPlayerSnapshot.state
    && queueLengthFromSnapshot(legatoSnapshot) === queueLengthFromSnapshot(audioPlayerSnapshot)
    && (legatoSnapshot.currentTrack?.id ?? null) === (audioPlayerSnapshot.currentTrack?.id ?? null);

  addBoundaryCheck({
    label: 'Facade parity confidence',
    ok: parityMatch,
    detail: parityMatch
      ? 'Legato and audioPlayer end-state snapshots match on state/currentTrack/queue length.'
      : `Mismatch detected: legato={state:${legatoSnapshot.state}, track:${legatoSnapshot.currentTrack?.id ?? 'none'}, queue:${queueLengthFromSnapshot(legatoSnapshot)}} audioPlayer={state:${audioPlayerSnapshot.state}, track:${audioPlayerSnapshot.currentTrack?.id ?? 'none'}, queue:${queueLengthFromSnapshot(audioPlayerSnapshot)}}`,
  });

  const remotePlayHandle = await addMediaSessionListener('remote-play', () => {});
  const remotePauseHandle = await addMediaSessionListener('remote-pause', () => {});
  await remotePlayHandle.remove();
  await remotePauseHandle.remove();
  await mediaSession.removeAllListeners();

  addBoundaryCheck({
    label: 'mediaSession boundary visibility',
    ok: true,
    detail: 'remote listener registration/removal verified via mediaSession namespace.',
  });
};

const runRemotePauseCaseFlow = async (): Promise<void> => {
  const baseline = await setupGuidedRemoteCaseBaseline('remote pause parity');
  const baselinePosition = typeof baseline.position === 'number' ? baseline.position : null;
  const startedAt = Date.now();

  log('[guided-case] action required: background app and press PAUSE from lock-screen/notification/remote control within 15s.');
  const observed = await waitForCondition(
    () => latestSnapshot?.state === 'paused' || remoteEventSeenSince(/remote-?pause/i, startedAt),
    guidedCaseTimeoutMs,
  );

  if (observed) {
    await sleep(guidedCaseSettleMs);
  }
  await snapshotAction('legato');

  const paused = latestSnapshot?.state === 'paused';
  const remotePauseEventSeen = remoteEventSeenSince(/remote-?pause/i, startedAt);
  const afterPosition = typeof latestSnapshot?.position === 'number' ? latestSnapshot.position : null;
  const delta = baselinePosition !== null && afterPosition !== null
    ? afterPosition - baselinePosition
    : null;

  caseCheck(
    'Remote pause command observed',
    remotePauseEventSeen || paused,
    remotePauseEventSeen
      ? 'remote-pause event observed in sync stream.'
      : paused
        ? 'Snapshot reached paused state even without explicit remote-pause event name.'
        : 'No remote-pause signal observed before timeout.',
  );
  caseCheck('Playback state is paused', paused, `snapshot.state=${latestSnapshot?.state ?? 'unknown'}`);
  caseCheck(
    'Progress froze after pause',
    paused && delta !== null ? Math.abs(delta) <= 320 : false,
    delta === null
      ? 'Unable to compare baseline/after positions.'
      : `position delta=${delta >= 0 ? '+' : ''}${delta}ms (expect near 0 when paused).`,
  );

  log('[guided-case] end | remote pause parity');
};

const runRemotePlayCaseFlow = async (): Promise<void> => {
  const baseline = await setupGuidedRemoteCaseBaseline('remote play resume parity', true);
  const baselinePosition = typeof baseline.position === 'number' ? baseline.position : null;
  const startedAt = Date.now();

  log('[guided-case] action required: keep app backgrounded and press PLAY from lock-screen/notification/remote control within 15s.');
  const observed = await waitForCondition(
    () => latestSnapshot?.state === 'playing' || remoteEventSeenSince(/remote-?play/i, startedAt),
    guidedCaseTimeoutMs,
  );

  if (observed) {
    await sleep(guidedCaseSettleMs);
  }
  await snapshotAction('legato');

  const remotePlayEventSeen = remoteEventSeenSince(/remote-?play/i, startedAt);
  const playing = latestSnapshot?.state === 'playing';
  const firstAfterPosition = typeof latestSnapshot?.position === 'number' ? latestSnapshot.position : null;

  await sleep(1000);
  await snapshotAction('legato');
  const secondAfterPosition = typeof latestSnapshot?.position === 'number' ? latestSnapshot.position : null;
  const resumedDelta = firstAfterPosition !== null && secondAfterPosition !== null
    ? secondAfterPosition - firstAfterPosition
    : null;
  const baselineToNowDelta = baselinePosition !== null && secondAfterPosition !== null
    ? secondAfterPosition - baselinePosition
    : null;

  caseCheck(
    'Remote play command observed',
    remotePlayEventSeen || playing,
    remotePlayEventSeen
      ? 'remote-play event observed in sync stream.'
      : playing
        ? 'Snapshot moved to playing state even without explicit remote-play event name.'
        : 'No remote-play signal observed before timeout.',
  );
  caseCheck('Playback state returned to playing', playing, `snapshot.state=${latestSnapshot?.state ?? 'unknown'}`);
  caseCheck(
    'Progress advanced after remote play',
    playing && resumedDelta !== null ? resumedDelta >= 320 : false,
    resumedDelta === null
      ? 'Unable to compare progress samples after remote play.'
      : `latest delta=${resumedDelta >= 0 ? '+' : ''}${resumedDelta}ms over ~1s, baseline delta=${baselineToNowDelta ?? 'n/a'}ms.`,
  );

  log('[guided-case] end | remote play resume parity');
};

const runRemoteSkipCaseFlow = async (): Promise<void> => {
  const baseline = await setupGuidedRemoteCaseBaseline('remote next/previous parity');
  const baselineIndex = typeof baseline.currentIndex === 'number' ? baseline.currentIndex : null;

  if (baselineIndex === null) {
    caseCheck('Baseline index available', false, 'currentIndex missing in baseline snapshot.');
    return;
  }

  const nextStartedAt = Date.now();
  log('[guided-case] action required: press NEXT from lock-screen/notification/remote control within 15s.');
  const nextObserved = await waitForCondition(
    () => (
      (typeof latestSnapshot?.currentIndex === 'number' && latestSnapshot.currentIndex > baselineIndex)
      || remoteEventSeenSince(/remote-?(next|skip.*next)/i, nextStartedAt)
    ),
    guidedCaseTimeoutMs,
  );

  if (nextObserved) {
    await sleep(guidedCaseSettleMs);
  }
  await snapshotAction('legato');

  const indexAfterNext = typeof latestSnapshot?.currentIndex === 'number' ? latestSnapshot.currentIndex : null;
  const remoteNextSeen = remoteEventSeenSince(/remote-?(next|skip.*next)/i, nextStartedAt);
  const nextAdvanced = indexAfterNext !== null && indexAfterNext > baselineIndex;

  caseCheck(
    'Remote next command observed',
    remoteNextSeen || nextAdvanced,
    remoteNextSeen
      ? 'remote-next/skip-to-next event observed.'
      : nextAdvanced
        ? `track index moved ${baselineIndex} -> ${indexAfterNext}.`
        : 'No next transition observed before timeout.',
  );
  caseCheck(
    'Queue index advanced on next',
    nextAdvanced,
    `baseline=${baselineIndex}, afterNext=${indexAfterNext ?? 'null'}`,
  );

  const previousStartedAt = Date.now();
  log('[guided-case] action required: now press PREVIOUS from lock-screen/notification/remote control within 15s.');
  const previousObserved = await waitForCondition(
    () => (
      (typeof latestSnapshot?.currentIndex === 'number' && latestSnapshot.currentIndex === baselineIndex)
      || remoteEventSeenSince(/remote-?(previous|skip.*previous)/i, previousStartedAt)
    ),
    guidedCaseTimeoutMs,
  );

  if (previousObserved) {
    await sleep(guidedCaseSettleMs);
  }
  await snapshotAction('legato');

  const indexAfterPrevious = typeof latestSnapshot?.currentIndex === 'number' ? latestSnapshot.currentIndex : null;
  const remotePreviousSeen = remoteEventSeenSince(/remote-?(previous|skip.*previous)/i, previousStartedAt);
  const previousAligned = indexAfterPrevious === baselineIndex;

  caseCheck(
    'Remote previous command observed',
    remotePreviousSeen || previousAligned,
    remotePreviousSeen
      ? 'remote-previous/skip-to-previous event observed.'
      : previousAligned
        ? `track index returned to baseline (${baselineIndex}).`
        : 'No previous transition observed before timeout.',
  );
  caseCheck(
    'Queue index returned to baseline after previous',
    previousAligned,
    `baseline=${baselineIndex}, afterPrevious=${indexAfterPrevious ?? 'null'}`,
  );

  log('[guided-case] end | remote next/previous parity');
};

const runRemoteSeekCaseFlow = async (): Promise<void> => {
  const baseline = await setupGuidedRemoteCaseBaseline('remote seek parity');
  const baselinePosition = typeof baseline.position === 'number' ? baseline.position : null;

  if (baselinePosition === null) {
    caseCheck('Baseline position available', false, 'position missing in baseline snapshot.');
    return;
  }

  const startedAt = Date.now();
  log('[guided-case] action required: seek from lock-screen/notification/remote control to a visibly different position (e.g. 4s) within 15s.');
  const observed = await waitForCondition(
    () => (
      (typeof latestSnapshot?.position === 'number' && Math.abs(latestSnapshot.position - baselinePosition) >= 1200)
      || remoteEventSeenSince(/remote-?seek/i, startedAt)
    ),
    guidedCaseTimeoutMs,
  );

  if (observed) {
    await sleep(guidedCaseSettleMs);
  }
  await snapshotAction('legato');

  const remoteSeekSeen = remoteEventSeenSince(/remote-?seek/i, startedAt);
  const finalPosition = typeof latestSnapshot?.position === 'number' ? latestSnapshot.position : null;
  const jumpDelta = finalPosition === null ? null : finalPosition - baselinePosition;
  const seekJumped = jumpDelta !== null && Math.abs(jumpDelta) >= 1200;

  caseCheck(
    'Remote seek command observed',
    remoteSeekSeen || seekJumped,
    remoteSeekSeen
      ? 'remote-seek event observed in sync stream.'
      : seekJumped
        ? `snapshot position jumped by ${jumpDelta >= 0 ? '+' : ''}${jumpDelta}ms.`
        : 'No seek movement observed before timeout.',
  );
  caseCheck(
    'Snapshot position moved after remote seek',
    seekJumped,
    jumpDelta === null
      ? 'Unable to compare baseline/final positions.'
      : `baseline=${baselinePosition}ms, final=${finalPosition}ms, delta=${jumpDelta >= 0 ? '+' : ''}${jumpDelta}ms.`,
  );

  log('[guided-case] end | remote seek parity');
};

const setPlaybackSurface = (surface: PlaybackSurface): void => {
  activePlaybackSurface = surface;
  renderBoundarySummary();
  log(`Manual controls now target ${surface === 'audioPlayer' ? 'audioPlayer namespace' : 'Legato facade'}.`);
};

envStatusNode.textContent = `platform=${platform} | native=${isNative}`;
log('Legato parity harness ready.');
log('platform:', platform);
log('isNativePlatform:', isNative);
log('Use smoke buttons for quick pass/fail, guided cases for scripted remote checks, and manual controls for deep debugging.');
renderBoundarySummary();

smokeButton.addEventListener('click', () => {
  void runNativeAction('run smoke flow', runSmokeFlow);
});

endSmokeButton.addEventListener('click', () => {
  void runNativeAction('run let-it-end smoke flow', runLetItEndSmokeFlow);
});

boundarySmokeButton.addEventListener('click', () => {
  void runNativeAction('run boundary smoke flow', runBoundarySmokeFlow);
});

surfaceValidationButton.addEventListener('click', () => {
  void runNativeAction('run API boundary validation flow', runSurfaceValidationFlow);
});

artworkRaceButton.addEventListener('click', () => {
  void runNativeAction('run artwork race flow', runArtworkRaceFlow);
});

remotePauseCaseButton.addEventListener('click', () => {
  void runNativeAction('run guided case: remote pause parity', runRemotePauseCaseFlow);
});

remotePlayCaseButton.addEventListener('click', () => {
  void runNativeAction('run guided case: remote play resume parity', runRemotePlayCaseFlow);
});

remoteSkipCaseButton.addEventListener('click', () => {
  void runNativeAction('run guided case: remote next/previous parity', runRemoteSkipCaseFlow);
});

remoteSeekCaseButton.addEventListener('click', () => {
  void runNativeAction('run guided case: remote seek parity', runRemoteSeekCaseFlow);
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

useLegatoSurfaceButton.addEventListener('click', () => {
  setPlaybackSurface('legato');
});

useAudioPlayerSurfaceButton.addEventListener('click', () => {
  setPlaybackSurface('audioPlayer');
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
