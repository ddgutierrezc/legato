import { Capacitor } from '@capacitor/core';
import {
  Legato,
  addAudioPlayerListener,
  addMediaSessionListener,
  audioPlayer,
  createAudioPlayerSync,
  mediaSession,
  type AudioPlayerApi,
  type BindingCapabilitiesSnapshot,
  type PlaybackSnapshot,
  type Track,
} from '@ddgutierrezc/legato-capacitor';
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
import {
  buildLifecycleCheckpointSummary,
} from './lifecycle-harness.js';

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
const focusDeniedCaseButton = document.querySelector<HTMLButtonElement>('#run-case-focus-denied');
const canDuckCaseButton = document.querySelector<HTMLButtonElement>('#run-case-can-duck');
const backgroundTransitionCaseButton = document.querySelector<HTMLButtonElement>('#run-case-background-transition');
const iosLifecycleReassertCaseButton = document.querySelector<HTMLButtonElement>('#run-case-ios-lifecycle-reassert');
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
const capabilitiesButton = document.querySelector<HTMLButtonElement>('#action-capabilities');
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
  || !focusDeniedCaseButton
  || !canDuckCaseButton
  || !backgroundTransitionCaseButton
  || !iosLifecycleReassertCaseButton
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
  || !capabilitiesButton
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
type RuntimeIntegrityPayload = {
  transportCommandsObserved: boolean;
  progressAdvancedWhilePlaying: boolean;
  trackEndTransitionObserved: boolean;
  snapshotProjectionCoherent: boolean;
  details: {
    transport: string;
    progress: string;
    trackEnd: string;
    snapshot: string;
  };
};

type ParityEvidencePayload = {
  addStartIndexConverged: boolean;
  remoteOrderConverged: boolean;
  eventStateSnapshotConverged: boolean;
  capabilitiesConverged: boolean;
  details: {
    addStartIndex: string;
    remoteOrder: string;
    eventStateSnapshot: string;
    capabilities: string;
  };
};

type RequestEvidenceRecord = {
  runtime: string;
  trackId: string;
  requestUrl: string;
  requestHeaders: Record<string, string>;
};

type RequestEvidencePayload = {
  byRuntime: Record<string, {
    byTrack: Record<string, {
      requests: Array<{
        requestUrl: string;
        requestHeaders: Record<string, string>;
      }>;
    }>;
  }>;
  assertions: Array<{
    label: string;
    ok: boolean;
    detail: string;
  }>;
};

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
let lifecycleCheckpoints: Array<{ step: string; snapshotState: string; recentEvents: string[] }> = [];
let latestCapabilities: BindingCapabilitiesSnapshot | null = null;
let capturedRequestEvidenceRecords: RequestEvidenceRecord[] = [];

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
    headers: {
      Authorization: 'Bearer demo-auth-a',
    },
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
    headers: {},
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
    headers: {
      Authorization: 'Bearer demo-auth-b',
    },
    type: 'progressive',
  },
];

const expectedAuthHeaderByTrackId: Record<string, string | null> = {
  'track-demo-1': 'Bearer demo-auth-a',
  'track-demo-2': null,
  'track-demo-3': 'Bearer demo-auth-b',
};

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
  const nativeSupported = Array.isArray(latestCapabilities?.supported)
    ? latestCapabilities.supported
    : [];

  capabilitySummaryNode.textContent = [
    `canSkipNext=${projection.canSkipNext}`,
    `canSkipPrevious=${projection.canSkipPrevious}`,
    `canSeek=${projection.canSeek}`,
    `queue=${projection.queueLength}`,
    `index=${projection.currentIndex ?? 'null'}`,
    `runtime.supported=[${nativeSupported.join(', ') || 'none'}]`,
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
    'interruption signal: while playing, trigger focus-loss or unplug headphones and verify snapshot reaches paused; use recent events + raw log for exact ordering.',
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
  const formattedLine = `${prefix} ${line}`;
  logNode.value = `${logNode.value}${formattedLine}\n`;
  logNode.scrollTop = logNode.scrollHeight;

  // Keep on-screen logging and emit the same stream to native console/logcat.
  console.info(formattedLine);
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

const deriveRuntimeIntegrityPayload = (): RuntimeIntegrityPayload => {
  const normalizedRecentEvents = recentEvents.map((event) => event.toLowerCase());
  const transportSteps = ['setup finished', 'add finished', 'play finished', 'pause finished'];
  const transportCommandsObserved = transportSteps.every((step) => normalizedRecentEvents.some((event) => event.includes(step)));

  const playingSamples = recentProgressSamples.filter((sample) => sample.state === 'playing');
  const progressSpread = playingSamples.length > 1
    ? Math.max(...playingSamples.map((sample) => sample.positionMs)) - Math.min(...playingSamples.map((sample) => sample.positionMs))
    : 0;
  const progressAdvancedWhilePlaying = progressSpread >= 350;

  const trackEndTransitionObserved = normalizedRecentEvents.some((event) => /playback-ended|state=ended/.test(event))
    || latestSnapshot?.state === 'ended';

  const snapshotProjectionCoherent = (() => {
    if (!latestSnapshot) {
      return false;
    }

    const queueItems = (latestSnapshot.queue as { items?: Array<{ id?: string }>; tracks?: Array<{ id?: string }> }).items
      ?? (latestSnapshot.queue as { items?: Array<{ id?: string }>; tracks?: Array<{ id?: string }> }).tracks
      ?? [];
    const queueLength = queueItems.length;

    if (queueLength === 0) {
      return latestSnapshot.currentTrack == null && latestSnapshot.currentIndex == null;
    }

    if (typeof latestSnapshot.currentIndex !== 'number' || !Number.isInteger(latestSnapshot.currentIndex)) {
      return false;
    }

    if (latestSnapshot.currentIndex < 0 || latestSnapshot.currentIndex >= queueLength) {
      return false;
    }

    const queueTrack = queueItems[latestSnapshot.currentIndex];
    const activeTrack = latestSnapshot.currentTrack as { id?: string } | null | undefined;
    return typeof queueTrack?.id === 'string' && queueTrack.id === activeTrack?.id;
  })();

  return {
    transportCommandsObserved,
    progressAdvancedWhilePlaying,
    trackEndTransitionObserved,
    snapshotProjectionCoherent,
    details: {
      transport: transportCommandsObserved
        ? 'setup/add/play/pause command completion observed in harness log.'
        : 'Missing one or more transport completion events (setup/add/play/pause).',
      progress: progressAdvancedWhilePlaying
        ? `Progress moved during playing samples (spread=${progressSpread}ms).`
        : `Insufficient playing movement evidence (spread=${progressSpread}ms).`,
      trackEnd: trackEndTransitionObserved
        ? 'Track-end transition observed (state=ended or playback-ended signal).'
        : 'Track-end transition not observed in this smoke run (run let-end/boundary for explicit end evidence).',
      snapshot: snapshotProjectionCoherent
        ? 'Snapshot projection coherent (queue/currentIndex/currentTrack alignment).'
        : 'Snapshot projection mismatch or missing snapshot evidence.',
    },
  };
};

const deriveParityEvidencePayload = (): ParityEvidencePayload => {
  const latest = latestSnapshot;
  const queueLength = latest ? queueLengthFromSnapshot(latest) : 0;
  const addStartIndexConverged = Boolean(latest)
    && queueLength >= 2
    && latest?.currentIndex === 1;

  const remoteOrderConverged = (() => {
    const remoteIndex = syncEventHistory.findIndex((entry) => /remote-(next|previous|seek)/i.test(entry.name));
    if (remoteIndex <= 0) {
      return false;
    }
    return syncEventHistory
      .slice(0, remoteIndex)
      .some((entry) => /playback-(active-track-changed|progress|state-changed)/i.test(entry.name));
  })();

  const eventStateSnapshotConverged = (() => {
    if (!latest) {
      return false;
    }
    return latest.state !== 'error'
      && latest.currentTrack != null
      && typeof latest.currentIndex === 'number';
  })();

  const capabilitiesConverged = (() => {
    if (!latest || !latestCapabilities) {
      return false;
    }
    const projected = projectCapabilities(latest);
    const supported = new Set(latestCapabilities.supported);
    const seekMatches = projected.canSeek === supported.has('seek');
    const nextMatches = projected.canSkipNext === supported.has('skip-next');
    const previousMatches = projected.canSkipPrevious === supported.has('skip-previous');
    return seekMatches && nextMatches && previousMatches;
  })();

  return {
    addStartIndexConverged,
    remoteOrderConverged,
    eventStateSnapshotConverged,
    capabilitiesConverged,
    details: {
      addStartIndex: addStartIndexConverged
        ? 'add(startIndex=1) landed on queue index 1 as expected.'
        : `Expected currentIndex=1 after add(startIndex=1), got ${latest?.currentIndex ?? 'null'} (queue=${queueLength}).`,
      remoteOrder: remoteOrderConverged
        ? 'Observed playback mutation events before remote-next/previous/seek marker.'
        : 'No conclusive remote-order evidence in this run (run guided remote parity cases to collect explicit proof).',
      eventStateSnapshot: eventStateSnapshotConverged
        ? 'Snapshot remained coherent (state/currentTrack/currentIndex present and non-error).'
        : 'Snapshot convergence evidence incomplete (missing current track/index or error state).',
      capabilities: capabilitiesConverged
        ? 'getCapabilities() support flags matched projected snapshot capabilities.'
        : 'getCapabilities() support flags diverged from projected snapshot capabilities or were unavailable.',
    },
  };
};

const extractRequestEvidenceRecords = (payload: unknown): RequestEvidenceRecord[] => {
  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const payloadObject = payload as {
    requestEvidence?: unknown;
    records?: unknown;
  };

  const maybeRecords = Array.isArray(payloadObject.records)
    ? payloadObject.records
    : (payloadObject.requestEvidence as { records?: unknown } | undefined)?.records;

  if (!Array.isArray(maybeRecords)) {
    return [];
  }

  return maybeRecords
    .filter((record) => record && typeof record === 'object')
    .map((record) => {
      const candidate = record as {
        runtime?: unknown;
        trackId?: unknown;
        requestUrl?: unknown;
        requestURL?: unknown;
        requestHeaders?: unknown;
      };

      const requestHeaders = candidate.requestHeaders && typeof candidate.requestHeaders === 'object'
        ? Object.fromEntries(Object.entries(candidate.requestHeaders as Record<string, unknown>)
          .filter(([, headerValue]) => typeof headerValue === 'string')
          .map(([headerKey, headerValue]) => [headerKey, String(headerValue)]))
        : {};

      return {
        runtime: typeof candidate.runtime === 'string' ? candidate.runtime : platform,
        trackId: typeof candidate.trackId === 'string' ? candidate.trackId : 'unknown-track',
        requestUrl: typeof candidate.requestUrl === 'string'
          ? candidate.requestUrl
          : (typeof candidate.requestURL === 'string' ? candidate.requestURL : ''),
        requestHeaders,
      };
    })
    .filter((record) => record.requestUrl.trim() !== '' && record.trackId !== 'unknown-track');
};

const deriveRequestEvidencePayload = (): RequestEvidencePayload => {
  const byRuntime: RequestEvidencePayload['byRuntime'] = {};

  for (const record of capturedRequestEvidenceRecords) {
    const runtimeKey = record.runtime || platform;
    if (!byRuntime[runtimeKey]) {
      byRuntime[runtimeKey] = { byTrack: {} };
    }

    if (!byRuntime[runtimeKey].byTrack[record.trackId]) {
      byRuntime[runtimeKey].byTrack[record.trackId] = { requests: [] };
    }

    byRuntime[runtimeKey].byTrack[record.trackId].requests.push({
      requestUrl: record.requestUrl,
      requestHeaders: record.requestHeaders,
    });
  }

  const runtimeKey = platform;
  const runtimeTracks = byRuntime[runtimeKey]?.byTrack ?? {};
  const assertions = demoTracks.map((track) => {
    const expectedAuthorization = expectedAuthHeaderByTrackId[track.id] ?? null;
    const requests = runtimeTracks[track.id]?.requests ?? [];
    const observedAuthValues = requests
      .map((request) => request.requestHeaders.Authorization)
      .filter((value): value is string => typeof value === 'string');

    if (expectedAuthorization) {
      const ok = observedAuthValues.includes(expectedAuthorization);
      return {
        label: `request evidence ${track.id} includes expected Authorization header`,
        ok,
        detail: ok
          ? `Observed ${observedAuthValues.length} request(s) for ${track.id} with expected Authorization value.`
          : `Expected Authorization=${expectedAuthorization} for ${track.id}, observed=${observedAuthValues.join(', ') || 'none'}.`,
      };
    }

    const leaked = observedAuthValues.length > 0;
    return {
      label: `request evidence ${track.id} does not leak Authorization header`,
      ok: requests.length > 0 && !leaked,
      detail: requests.length === 0
        ? `No captured requests for ${track.id}; runtime request evidence unavailable.`
        : leaked
          ? `Unexpected Authorization values on public track ${track.id}: ${observedAuthValues.join(', ')}`
          : `Observed ${requests.length} public request(s) for ${track.id} without Authorization header leakage.`,
    };
  });

  return {
    byRuntime,
    assertions,
  };
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
      runtimeIntegrity: deriveRuntimeIntegrityPayload(),
      parityEvidence: deriveParityEvidencePayload(),
      requestEvidence: deriveRequestEvidencePayload(),
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
      runtimeIntegrity: deriveRuntimeIntegrityPayload(),
      parityEvidence: deriveParityEvidencePayload(),
      requestEvidence: deriveRequestEvidencePayload(),
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
      const extractedRecords = extractRequestEvidenceRecords(payload);
      if (extractedRecords.length > 0) {
        capturedRequestEvidenceRecords = [
          ...capturedRequestEvidenceRecords,
          ...extractedRecords,
        ].slice(-160);
      }
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

const addAction = async (
  surface: PlaybackSurface = activePlaybackSurface,
  startIndex = 0,
): Promise<void> => {
  const afterAdd = await resolvePlaybackApi(surface).add({ tracks: demoTracks, startIndex });
  updateSnapshotViews(afterAdd);
  log(`[${surface}] add(startIndex=${startIndex}) snapshot`, afterAdd);
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

const capabilitiesAction = async (surface: PlaybackSurface = activePlaybackSurface): Promise<void> => {
  const capabilities = await resolvePlaybackApi(surface).getCapabilities();
  latestCapabilities = capabilities;
  if (latestSnapshot) {
    renderCapabilitySummary(latestSnapshot);
  }
  snapshotJsonNode.value = JSON.stringify({
    snapshot: latestSnapshot,
    capabilities,
  }, null, 2);
  addRecentEvent(`capabilities supported=${capabilities.supported.join(', ') || 'none'}`);
  log(`[${surface}] getCapabilities()`, capabilities);
};

const clearFlows = (): void => {
  logNode.value = '';
  recentEvents = [];
  syncEventHistory = [];
  lifecycleCheckpoints = [];
  latestSmokeReport = null;
  capturedRequestEvidenceRecords = [];
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
  await addAction('legato', 1);
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
  latestCapabilities = await api.getCapabilities();
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

  const legatoCapabilities = await Legato.getCapabilities();
  const audioPlayerCapabilities = await audioPlayer.getCapabilities();
  const legatoSupported = [...legatoCapabilities.supported].sort().join(',');
  const audioPlayerSupported = [...audioPlayerCapabilities.supported].sort().join(',');
  addBoundaryCheck({
    label: 'getCapabilities parity (Legato/audioPlayer)',
    ok: legatoSupported === audioPlayerSupported,
    detail: `Legato=[${legatoSupported}] audioPlayer=[${audioPlayerSupported}]`,
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

const runFocusDeniedCaseFlow = async (): Promise<void> => {
  const baseline = await setupGuidedRemoteCaseBaseline('focus-denied lifecycle check');
  const baselineState = baseline.state;

  log('[guided-case] action required: keep this track selected, start another app that owns audio focus, then press PLAY here again within 15s.');
  log('[guided-case] expected: playback should not continue as playing when focus request is denied; it should settle paused/interrupted.');

  await playAction('legato');
  await waitForCondition(
    () => latestSnapshot?.state === 'paused' || latestSnapshot?.state === 'playing',
    guidedCaseTimeoutMs,
  );
  await sleep(guidedCaseSettleMs);
  await snapshotAction('legato');

  const finalState = latestSnapshot?.state;
  const deniedProjectionLooksHealthy = finalState === 'paused';

  caseCheck(
    'Focus-denied projection keeps runtime non-playing',
    deniedProjectionLooksHealthy,
    `baseline=${baselineState}, final=${finalState ?? 'unknown'} (expected paused on denied focus).`,
  );
  log('[guided-case] end | focus-denied lifecycle check');
};

const runCanDuckCaseFlow = async (): Promise<void> => {
  await setupGuidedRemoteCaseBaseline('can-duck interruption policy check');

  log('[guided-case] action required: while this track is playing, trigger a CAN_DUCK interruption (voice prompt/navigation/assistant) within 15s.');
  log('[guided-case] expected v1 policy: CAN_DUCK is treated as pause/interruption, no auto-resume on focus gain.');

  const pausedObserved = await waitForCondition(
    () => latestSnapshot?.state === 'paused',
    guidedCaseTimeoutMs,
  );

  if (pausedObserved) {
    await sleep(guidedCaseSettleMs);
  }
  await snapshotAction('legato');

  const finalState = latestSnapshot?.state;
  caseCheck(
    'CAN_DUCK maps to interruption pause',
    finalState === 'paused',
    `final state=${finalState ?? 'unknown'} (expected paused).`,
  );
  log('[guided-case] end | can-duck interruption policy check');
};

const runBackgroundTransitionCaseFlow = async (): Promise<void> => {
  const baseline = await setupGuidedRemoteCaseBaseline('background transition coherence check');
  const baselineQueue = queueLengthFromSnapshot(baseline);

  log('[guided-case] action required: send app to background for ~8s, verify notification controls are visible, then return to app.');
  await sleep(8000);
  await snapshotAction('legato');

  const finalSnapshot = latestSnapshot;
  const finalQueue = finalSnapshot ? queueLengthFromSnapshot(finalSnapshot) : 0;
  const finalState = finalSnapshot?.state;

  caseCheck(
    'Background transition keeps active queue/session while process is alive',
    Boolean(finalSnapshot) && finalQueue === baselineQueue && finalState !== 'idle' && finalState !== 'error',
    `baselineQueue=${baselineQueue}, finalQueue=${finalQueue}, finalState=${finalState ?? 'unknown'}`,
  );
  log('[guided-case] end | background transition coherence check');
};

const captureLifecycleCheckpoint = (step: string): void => {
  const snapshotState = latestSnapshot?.state ?? 'unknown';
  const recentSignals = recentEvents.slice(-8);
  lifecycleCheckpoints = [
    ...lifecycleCheckpoints,
    {
      step,
      snapshotState,
      recentEvents: recentSignals,
    },
  ];
  log(`[lifecycle-evidence] ${step}`, {
    snapshotState,
    recentSignals,
  });
};

const runIOSLifecycleReassertCaseFlow = async (): Promise<void> => {
  await setupGuidedRemoteCaseBaseline('ios lifecycle reassert evidence');

  log('[guided-case] action required: trigger and dismiss a real interruption (call/siri/navigation), then keep playback paused and return to app.');
  await waitForCondition(
    () => latestSnapshot?.state === 'paused',
    guidedCaseTimeoutMs,
  );
  await sleep(guidedCaseSettleMs);
  await snapshotAction('legato');
  captureLifecycleCheckpoint('Interruption begin paused playback.');
  captureLifecycleCheckpoint('Interruption end (shouldResume) reasserted surfaces without auto-play.');

  log('[guided-case] action required: disconnect/reconnect output route (e.g. bluetooth/headphones) and keep playback paused.');
  await waitForCondition(
    () => latestSnapshot?.state === 'paused',
    guidedCaseTimeoutMs,
  );
  await sleep(guidedCaseSettleMs);
  await snapshotAction('legato');
  captureLifecycleCheckpoint('Route available did not auto-resume playback.');

  log('[guided-case] action required: background app for ~5s, bring to foreground, then capture snapshot for reassert evidence.');
  await sleep(5000);
  await snapshotAction('legato');
  captureLifecycleCheckpoint('Foreground/active reassert projected metadata/progress/playback/capabilities.');

  const lifecycleSummary = buildLifecycleCheckpointSummary(lifecycleCheckpoints);
  boundarySummaryNode.textContent = `${boundarySummaryNode.textContent}\n\nLifecycle evidence checkpoints\n${lifecycleSummary}`;
  snapshotJsonNode.value = JSON.stringify({ lifecycleCheckpoints }, null, 2);
  log('[guided-case] lifecycle summary', lifecycleSummary);
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
log('Interruption diagnostics: capture recent events + raw log while testing audio-focus loss/becoming-noisy to validate pause behavior.');
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

focusDeniedCaseButton.addEventListener('click', () => {
  void runNativeAction('run guided case: focus-denied lifecycle check', runFocusDeniedCaseFlow);
});

canDuckCaseButton.addEventListener('click', () => {
  void runNativeAction('run guided case: CAN_DUCK interruption policy check', runCanDuckCaseFlow);
});

backgroundTransitionCaseButton.addEventListener('click', () => {
  void runNativeAction('run guided case: background transition coherence check', runBackgroundTransitionCaseFlow);
});

iosLifecycleReassertCaseButton.addEventListener('click', () => {
  void runNativeAction('run guided case: ios lifecycle reassert evidence', runIOSLifecycleReassertCaseFlow);
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

capabilitiesButton.addEventListener('click', () => {
  void runNativeAction('manual getCapabilities()', capabilitiesAction);
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
