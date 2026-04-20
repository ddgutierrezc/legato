import { Capacitor } from '@capacitor/core';
import { Legato, createLegatoSync, type PlaybackSnapshot, type Track } from '@legato/capacitor';

type LegatoSyncController = ReturnType<typeof createLegatoSync>;

const smokeButton = document.querySelector<HTMLButtonElement>('#run-smoke');
const endSmokeButton = document.querySelector<HTMLButtonElement>('#run-end-smoke');
const copyButton = document.querySelector<HTMLButtonElement>('#copy-log');
const envStatusNode = document.querySelector<HTMLDivElement>('#env-status');
const logNode = document.querySelector<HTMLTextAreaElement>('#log');

if (!smokeButton || !endSmokeButton || !copyButton || !envStatusNode || !logNode) {
  throw new Error('Demo UI nodes are missing');
}

const nativeActionButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.native-action'));
const playbackSmokeDelayMs = 1500;
const endSmokeDelayMs = 6500;

let syncController: LegatoSyncController | null = null;

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

  if ('track' in payload || 'index' in payload) {
    const active = payload as { index?: number | null; track?: { title?: string; id?: string } | null };
    return `index=${active.index ?? 'null'} | track=${active.track?.title ?? active.track?.id ?? '(none)'}`;
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
  } catch (error) {
    log(`${name} failed:`, error);
  } finally {
    setRunning(false);
  }
};

const startSync = async (): Promise<void> => {
  if (syncController) {
    log('sync already active');
    return;
  }

  syncController = createLegatoSync({
    onSnapshot: (snapshot) => {
      log('sync snapshot', snapshot);
    },
    onEvent: (eventName, payload) => {
      log(`event:${eventName}`, payload);
    },
  });

  const initial = await syncController.start();
  log('sync.start() initial snapshot', initial);
};

const stopSync = async (): Promise<void> => {
  if (!syncController) {
    log('sync is not active');
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

const copyLog = async () => {
  await copyText(logNode.value, 'No log output to copy yet.', 'Copied raw log to clipboard.');
};

const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();

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

const runSmokeFlow = async (): Promise<void> => {
  logNode.value = '';
  log('Starting Legato minimal flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);

  await Legato.setup();
  log('setup() ok');

  await startSync();

  const afterAdd = await Legato.add({ tracks: demoTracks, startIndex: 0 });
  log('add() snapshot', afterAdd);

  await Legato.play();
  log('play() ok');

  log(`waiting ${playbackSmokeDelayMs}ms before pause() to validate audible playback...`);
  await new Promise((resolve) => setTimeout(resolve, playbackSmokeDelayMs));

  await Legato.pause();
  log('pause() ok');

  const finalSnapshot = await Legato.getSnapshot();
  log('getSnapshot() final snapshot', finalSnapshot);

  await stopSync();
};

const runLetItEndSmokeFlow = async (): Promise<void> => {
  logNode.value = '';
  log('Starting Legato let-it-end flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);

  await Legato.setup();
  log('setup() ok');

  await startSync();

  const afterAdd = await Legato.add({ tracks: demoTracks, startIndex: 0 });
  log('add() snapshot', afterAdd);

  await Legato.play();
  log(`play() ok, wait ${endSmokeDelayMs}ms for track end...`);

  await new Promise((resolve) => setTimeout(resolve, endSmokeDelayMs));

  const finalSnapshot = await Legato.getSnapshot();
  log('final snapshot after end wait', finalSnapshot);

  await stopSync();
};

envStatusNode.textContent = `platform=${platform} | native=${isNative}`;
log('Legato smoke harness ready.');
log('platform:', platform);
log('isNativePlatform:', isNative);

smokeButton.addEventListener('click', () => {
  void runNativeAction('run smoke flow', runSmokeFlow);
});

endSmokeButton.addEventListener('click', () => {
  void runNativeAction('run let-it-end smoke flow', runLetItEndSmokeFlow);
});

copyButton.addEventListener('click', () => {
  void copyLog();
});

if (!isNative) {
  nativeActionButtons.forEach((button) => {
    button.disabled = true;
  });
  log('Native bridge not available in browser preview. Open from Xcode/Android Studio.');
}
