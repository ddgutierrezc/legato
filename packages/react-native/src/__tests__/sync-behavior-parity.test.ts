import type {
  AudioPlayerApi,
  AudioPlayerEventName,
  AudioPlayerEventPayloadMap,
  BindingListenerHandle,
  PlaybackSnapshot,
} from '../definitions';
jest.mock('../plugin', () => {
  const noop = async () => ({ remove: async () => undefined });
  return {
    Legato: { addListener: noop },
    audioPlayer: { addListener: noop },
    mediaSession: { addListener: noop },
  };
});
import { createLegatoSync } from '../sync';

type ListenerMap = Partial<{
  [K in AudioPlayerEventName]: (payload: AudioPlayerEventPayloadMap[K]) => void;
}>;

const baseSnapshot: PlaybackSnapshot = {
  state: 'idle',
  queue: { tracks: [], currentIndex: null },
};

function createClient(snapshot: PlaybackSnapshot) {
  const listeners: ListenerMap = {};
  const removeSpies: jest.Mock[] = [];

  const addListener: AudioPlayerApi['addListener'] = jest.fn(async (eventName, listener) => {
    listeners[eventName] = listener as never;
    const handle: BindingListenerHandle = { remove: jest.fn(async () => undefined) };
    removeSpies.push(handle.remove as jest.Mock);
    return handle;
  });

  const client: AudioPlayerApi = {
    setup: jest.fn(async () => undefined),
    add: jest.fn(async () => snapshot),
    remove: jest.fn(async () => snapshot),
    reset: jest.fn(async () => snapshot),
    play: jest.fn(async () => undefined),
    pause: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
    seekTo: jest.fn(async () => undefined),
    skipTo: jest.fn(async () => snapshot),
    skipToNext: jest.fn(async () => undefined),
    skipToPrevious: jest.fn(async () => undefined),
    getState: jest.fn(async () => snapshot.state),
    getPosition: jest.fn(async () => snapshot.position ?? 0),
    getDuration: jest.fn(async () => snapshot.duration ?? null),
    getCurrentTrack: jest.fn(async () => snapshot.currentTrack ?? null),
    getQueue: jest.fn(async () => snapshot.queue),
    getSnapshot: jest.fn(async () => snapshot),
    getCapabilities: jest.fn(async () => ({ supported: [] })),
    addListener,
    removeAllListeners: jest.fn(async () => undefined),
  };

  return {
    client,
    emit<E extends AudioPlayerEventName>(eventName: E, payload: AudioPlayerEventPayloadMap[E]) {
      listeners[eventName]?.(payload as never);
    },
    removeSpies,
  };
}

describe('createLegatoSync behavioral parity', () => {
  beforeEach(() => jest.clearAllMocks());

  it('starts by resyncing before subscribing to events', async () => {
    const calls: string[] = [];
    const harness = createClient(baseSnapshot);
    (harness.client.getSnapshot as jest.Mock).mockImplementation(async () => {
      calls.push('getSnapshot');
      return baseSnapshot;
    });
    (harness.client.addListener as jest.Mock).mockImplementation(async (eventName, listener) => {
      calls.push(`addListener:${String(eventName)}`);
      return { remove: jest.fn(async () => undefined), listener };
    });

    const sync = createLegatoSync({ client: harness.client });
    await sync.start();

    expect(calls[0]).toBe('getSnapshot');
    expect(calls.some((entry) => entry.startsWith('addListener:'))).toBe(true);
    expect(sync.getCurrent()).toEqual(baseSnapshot);
  });

  it('applies queue and state transitions from emitted events', async () => {
    const harness = createClient(baseSnapshot);
    const snapshots: PlaybackSnapshot[] = [];
    const sync = createLegatoSync({ client: harness.client, onSnapshot: (snapshot) => snapshots.push(snapshot) });
    await sync.start();

    harness.emit('playback-state-changed', { state: 'playing' });
    harness.emit('playback-queue-changed', {
      queue: {
        tracks: [{ id: 'track-1', url: 'https://example.com/1.mp3' }],
        currentIndex: 0,
      },
    });

    expect(snapshots[snapshots.length - 1]).toMatchObject({
      state: 'playing',
      queue: {
        currentIndex: 0,
      },
      currentIndex: 0,
    });
    expect(sync.getCurrent()?.queue.tracks).toHaveLength(1);
  });

  it('propagates events but does not mutate snapshot on non-projecting events', async () => {
    const harness = createClient({
      ...baseSnapshot,
      state: 'playing',
      position: 12,
      currentIndex: 0,
      queue: { tracks: [{ id: 'a', url: 'https://example.com/a.mp3' }], currentIndex: 0 },
    });
    const onEvent = jest.fn();
    const sync = createLegatoSync({ client: harness.client, onEvent });
    await sync.start();

    const before = sync.getCurrent();
    harness.emit('playback-error', { code: 'NATIVE', message: 'boom' });
    const after = sync.getCurrent();

    expect(onEvent).toHaveBeenCalledWith('playback-error', { code: 'NATIVE', message: 'boom' });
    expect(after).toEqual(before);
  });

  it('stops by removing all registered listener handles', async () => {
    const harness = createClient(baseSnapshot);
    const sync = createLegatoSync({ client: harness.client });
    await sync.start();

    await sync.stop();

    expect(harness.removeSpies.length).toBeGreaterThan(0);
    for (const remove of harness.removeSpies) {
      expect(remove).toHaveBeenCalledTimes(1);
    }
  });
});
