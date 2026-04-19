import { Capacitor } from '@capacitor/core';
import { Legato, createLegatoSync, type Track } from '@legato/capacitor';

const button = document.querySelector<HTMLButtonElement>('#run-demo');
const logNode = document.querySelector<HTMLPreElement>('#log');

if (!button || !logNode) {
  throw new Error('Demo UI nodes are missing');
}

const log = (message: string, payload?: unknown) => {
  const line = payload === undefined ? message : `${message} ${JSON.stringify(payload, null, 2)}`;
  logNode.textContent = `${logNode.textContent}${line}\n`;
};

const platform = Capacitor.getPlatform();
const isNative = Capacitor.isNativePlatform();

const demoTracks: Track[] = [
  {
    id: 'track-demo-1',
    url: 'https://example.com/audio/track-1.mp3',
    title: 'Demo Track 1',
    artist: 'Legato',
    duration: 120000,
    type: 'progressive',
  },
  {
    id: 'track-demo-2',
    url: 'https://example.com/audio/track-2.mp3',
    title: 'Demo Track 2',
    artist: 'Legato',
    duration: 180000,
    type: 'progressive',
  },
];

const runMinimalFlow = async () => {
  logNode.textContent = '';
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

if (!isNative) {
  button.disabled = true;
  log('Native bridge not available in browser preview.');
}
