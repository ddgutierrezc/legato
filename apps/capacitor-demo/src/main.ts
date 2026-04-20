import { Capacitor } from '@capacitor/core';
import { Legato, createLegatoSync, type Track } from '@legato/capacitor';

const button = document.querySelector<HTMLButtonElement>('#run-demo');
const copyButton = document.querySelector<HTMLButtonElement>('#copy-log');
const logNode = document.querySelector<HTMLTextAreaElement>('#log');

if (!button || !copyButton || !logNode) {
  throw new Error('Demo UI nodes are missing');
}

const log = (message: string, payload?: unknown) => {
  const line = payload === undefined ? message : `${message} ${JSON.stringify(payload, null, 2)}`;
  logNode.value = `${logNode.value}${line}\n`;
  logNode.scrollTop = logNode.scrollHeight;
};

const copyLog = async () => {
  const text = logNode.value.trim();

  if (!text) {
    log('No log output to copy yet.');
    return;
  }

  try {
    await navigator.clipboard.writeText(logNode.value);
    log('Copied log to clipboard.');
  } catch {
    logNode.focus();
    logNode.select();
    log('Clipboard API unavailable. Log text selected — press Cmd/Ctrl+C.');
  }
};

const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();
const playbackSmokeDelayMs = 1500;

const demoTracks: Track[] = [
  {
    id: 'track-demo-1',
    url: 'https://samplelib.com/lib/preview/mp3/sample-3s.mp3',
    title: 'Demo Track 1 (3s sample)',
    artist: 'Samplelib',
    duration: 3000,
    type: 'progressive',
  },
  {
    id: 'track-demo-2',
    url: 'https://samplelib.com/lib/preview/mp3/sample-6s.mp3',
    title: 'Demo Track 2 (6s sample)',
    artist: 'Samplelib',
    duration: 6000,
    type: 'progressive',
  },
];

const runMinimalFlow = async () => {
  logNode.value = '';
  log('Starting Legato minimal flow...');
  log('platform:', platform);
  log('isNativePlatform:', isNative);

  if (!isNative) {
    log('Smoke path is native-only. Open the app from Android Studio/Xcode after cap sync.');
    return;
  }

  const sync = createLegatoSync({
    onSnapshot: (snapshot) => log('sync snapshot:', snapshot),
    onEvent: (eventName, payload) => log(`event:${eventName}`, payload),
  });

  try {
    await Legato.setup();
    log('setup() ok');

    const initial = await sync.start();
    log('sync.start() initial snapshot:', initial);

    const afterAdd = await Legato.add({ tracks: demoTracks, startIndex: 0 });
    log('add() snapshot:', afterAdd);

    await Legato.play();
    log('play() ok');

    log(`waiting ${playbackSmokeDelayMs}ms before pause() to validate audible playback...`);
    await new Promise((resolve) => setTimeout(resolve, playbackSmokeDelayMs));

    await Legato.pause();
    log('pause() ok');

    const snapshot = await Legato.getSnapshot();
    log('getSnapshot() final snapshot:', snapshot);
  } catch (error) {
    log('Flow failed:', error);
  } finally {
    await sync.stop();
    log('sync.stop() done');
  }
};

button.addEventListener('click', () => {
  void runMinimalFlow();
});

copyButton.addEventListener('click', () => {
  void copyLog();
});

if (!isNative) {
  button.disabled = true;
  log('Native bridge not available in browser preview.');
}
