import type { PluginListenerHandle } from '@capacitor/core';
import type {
  LegatoApi,
  LegatoEventApi,
  LegatoEventName,
  LegatoEventPayloadMap,
  PlaybackSnapshot,
} from './definitions';
import { LEGATO_EVENTS } from './events';
import { Legato } from './plugin';

type SyncClient = LegatoApi & LegatoEventApi;

export interface LegatoSyncOptions {
  client?: SyncClient;
  onSnapshot?: (snapshot: PlaybackSnapshot) => void;
  onEvent?: <E extends LegatoEventName>(eventName: E, payload: LegatoEventPayloadMap[E]) => void;
}

export interface LegatoSyncController {
  start(): Promise<PlaybackSnapshot>;
  resync(): Promise<PlaybackSnapshot>;
  getCurrent(): PlaybackSnapshot | null;
  stop(): Promise<void>;
}

export function createLegatoSync(options: LegatoSyncOptions = {}): LegatoSyncController {
  const client = options.client ?? Legato;
  const handles: PluginListenerHandle[] = [];
  let current: PlaybackSnapshot | null = null;

  const publishSnapshot = (snapshot: PlaybackSnapshot): PlaybackSnapshot => {
    current = snapshot;
    options.onSnapshot?.(snapshot);
    return snapshot;
  };

  const applyEventToSnapshot = (
    eventName: LegatoEventName,
    payload: LegatoEventPayloadMap[LegatoEventName],
  ) => {
    if (!current) {
      return;
    }

    switch (eventName) {
      case 'playback-state-changed':
        publishSnapshot({ ...current, state: payload.state });
        break;
      case 'playback-active-track-changed':
        publishSnapshot({
          ...current,
          currentTrack: payload.track,
          currentIndex: payload.index,
          duration: payload.track?.duration ?? current.duration,
          queue: {
            ...current.queue,
            currentIndex: payload.index,
          },
        });
        break;
      case 'playback-queue-changed':
        publishSnapshot({ ...current, queue: payload.queue, currentIndex: payload.queue.currentIndex });
        break;
      case 'playback-progress':
        publishSnapshot({
          ...current,
          position: payload.position,
          duration: payload.duration,
          bufferedPosition: payload.bufferedPosition,
        });
        break;
      case 'playback-ended':
        publishSnapshot(payload.snapshot);
        break;
      default:
        break;
    }
  };

  const subscribe = async () => {
    await Promise.all(
      LEGATO_EVENTS.map(async (eventName) => {
        const handle = await client.addListener(eventName, (payload) => {
          options.onEvent?.(eventName, payload as LegatoEventPayloadMap[LegatoEventName]);
          applyEventToSnapshot(eventName, payload as LegatoEventPayloadMap[LegatoEventName]);
        });
        handles.push(handle);
      }),
    );
  };

  return {
    async start() {
      const snapshot = await this.resync();
      await subscribe();
      return snapshot;
    },
    async resync() {
      const snapshot = await client.getSnapshot();
      return publishSnapshot(snapshot);
    },
    getCurrent() {
      return current;
    },
    async stop() {
      await Promise.all(handles.splice(0).map((handle) => handle.remove()));
    },
  };
}
