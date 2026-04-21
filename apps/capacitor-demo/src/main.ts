import { Capacitor } from '@capacitor/core';
import { Legato, createLegatoSync, type PlaybackSnapshot, type Track } from '@legato/capacitor';

type LegatoSyncController = ReturnType<typeof createLegatoSync>;

const smokeButton = document.querySelector<HTMLButtonElement>('#run-smoke');
const endSmokeButton = document.querySelector<HTMLButtonElement>('#run-end-smoke');
const copyLogButton = document.querySelector<HTMLButtonElement>('#copy-log');
const copyEventsButton = document.querySelector<HTMLButtonElement>('#copy-events');
const setupButton = document.querySelector<HTMLButtonElement>('#action-setup');
const syncStartButton = document.querySelector<HTMLButtonElement>('#action-sync-start');
const syncStopButton = document.querySelector<HTMLButtonElement>('#action-sync-stop');
const addButton = document.querySelector<HTMLButtonElement>('#action-add');
const playButton = document.querySelector<HTMLButtonElement>('#action-play');
const pauseButton = document.querySelector<HTMLButtonElement>('#action-pause');
const stopButton = document.querySelector<HTMLButtonElement>('#action-stop');
const seekButton = document.querySelector<HTMLButtonElement>('#action-seek');
const snapshotButton = document.querySelector<HTMLButtonElement>('#action-snapshot');
const seekInput = document.querySelector<HTMLInputElement>('#seek-ms');
const envStatusNode = document.querySelector<HTMLDivElement>('#env-status');
const logNode = document.querySelector<HTMLTextAreaElement>('#log');
const eventsNode = document.querySelector<HTMLTextAreaElement>('#events');
const snapshotSummaryNode = document.querySelector<HTMLPreElement>('#snapshot-summary');
const snapshotJsonNode = document.querySelector<HTMLTextAreaElement>('#snapshot-json');

if (
  !smokeButton
  || !endSmokeButton
  || !copyLogButton
  || !copyEventsButton
  || !setupButton
  || !syncStartButton
  || !syncStopButton
  || !addButton
  || !playButton
  || !pauseButton
  || !stopButton
  || !seekButton
  || !snapshotButton
  || !seekInput
  || !envStatusNode
  || !logNode
  || !eventsNode
  || !snapshotSummaryNode
  || !snapshotJsonNode
) {
  throw new Error('Demo UI nodes are missing');
}

const nativeActionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.native-action'));
const playbackSmokeDelayMs = 1500;
const endSmokeDelayMs = 6500;
const recentEventsLimit = 24;

const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();

let syncController: LegatoSyncController | null = null;
let latestSnapshot: PlaybackSnapshot | null = null;
let recentEvents: string[] = [];

const demoTracks: Track[] = [
  {
    id: 'track-demo-1',
    url: 'https://samplelib.com/mp3/sample-3s.mp3',
    title: 'Demo Track 1 (3s sample)',
    artist: 'Samplelib',
    duration: 3000,
    type: 'progressive',
  },
  {
    id: 'track-demo-2',
    url: 'https://samplelib.com/mp3/sample-6s.mp3',
    title: 'Demo Track 2 (6s sample)',
    artist: 'Samplelib',
    duration: 6000,
    type: 'progressive',
  },
];

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

const addRecentEvent = (message: string): void => {
  const prefix = `[${new Date().toLocaleTimeString()}]`;
  recentEvents = [...recentEvents.slice(-recentEventsLimit + 1), `${prefix} ${message}`];
  renderRecentEvents();
};

const updateSnapshotViews = (snapshot: PlaybackSnapshot): void => {
  latestSnapshot = snapshot;
  snapshotSummaryNode.textContent = summarizeSnapshot(snapshot);
  snapshotJsonNode.value = JSON.stringify(snapshot, null, 2);
  addRecentEvent(`snapshot summary ${summarizeSnapshot(snapshot)}`);
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
      const details = summarizePayload(payload);
      log(`event:${eventName}`, payload);
      addRecentEvent(`event:${eventName}${details ? ` | ${details}` : ''}`);
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
  renderRecentEvents();
};

const runSmokeFlow = async (): Promise<void> => {
  clearFlows();
  log('Starting Legato smoke flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);
  log('Background check: start play(), send app to background, verify playback continues and notification remains active.');

  await setupAction();
  await startSync();
  await addAction();
  await playAction();

  log(`waiting ${playbackSmokeDelayMs}ms before pause() to validate audible playback...`);
  await new Promise((resolve) => setTimeout(resolve, playbackSmokeDelayMs));

  await pauseAction();
  await snapshotAction();
};

const runLetItEndSmokeFlow = async (): Promise<void> => {
  clearFlows();
  log('Starting Legato let-it-end flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);
  log('Background check: keep app in background and watch for playback-ended event plus service teardown after stop/idle.');

  await setupAction();
  await startSync();
  await addAction();
  await playAction();
  log(`play() ok, wait ${endSmokeDelayMs}ms for track end...`);

  await new Promise((resolve) => setTimeout(resolve, endSmokeDelayMs));
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

if (!isNative) {
  nativeActionButtons.forEach((button) => {
    button.disabled = true;
  });
  log('Native bridge not available in browser preview. Open from Xcode/Android Studio.');
}

if (latestSnapshot == null) {
  snapshotSummaryNode.textContent = 'No snapshot captured yet.';
}
