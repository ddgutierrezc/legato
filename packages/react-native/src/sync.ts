import type {
  AudioPlayerApi,
  BindingListenerHandle,
  LegatoEventName,
  LegatoEventPayloadMap,
  PlaybackSnapshot,
} from './definitions';
import { AUDIO_PLAYER_EVENTS } from './events';
import { Legato } from './plugin';

type SyncClient = AudioPlayerApi;

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

export type AudioPlayerSyncClient = AudioPlayerApi;

export interface AudioPlayerSyncOptions extends LegatoSyncOptions {
  client?: AudioPlayerSyncClient;
}

export function createLegatoSync(options: LegatoSyncOptions = {}): LegatoSyncController {
  const client = options.client ?? Legato;
  const handles: BindingListenerHandle[] = [];
  let current: PlaybackSnapshot | null = null;

  const publish = (snapshot: PlaybackSnapshot): PlaybackSnapshot => {
    current = snapshot;
    options.onSnapshot?.(snapshot);
    return snapshot;
  };

  const applyEventToSnapshot = (eventName: LegatoEventName, payload: LegatoEventPayloadMap[LegatoEventName]) => {
    if (!current) {
      return;
    }

    switch (eventName) {
      case 'playback-state-changed': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-state-changed'];
        publish({ ...current, state: eventPayload.state });
        break;
      }
      case 'playback-active-track-changed': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-active-track-changed'];
        publish({
          ...current,
          currentTrack: eventPayload.track,
          currentIndex: eventPayload.index,
          duration: eventPayload.track?.duration ?? current.duration,
          queue: { ...current.queue, currentIndex: eventPayload.index },
        });
        break;
      }
      case 'playback-queue-changed': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-queue-changed'];
        publish({
          ...current,
          queue: eventPayload.queue,
          currentIndex: eventPayload.queue.currentIndex,
        });
        break;
      }
      case 'playback-progress': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-progress'];
        publish({
          ...current,
          position: eventPayload.position,
          duration: eventPayload.duration,
          bufferedPosition: eventPayload.bufferedPosition,
        });
        break;
      }
      case 'playback-ended': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-ended'];
        publish(eventPayload.snapshot);
        break;
      }
      case 'playback-error':
      case 'remote-play':
      case 'remote-pause':
      case 'remote-next':
      case 'remote-previous':
      case 'remote-seek':
        break;
      default:
        break;
    }
  };

  const subscribe = async () => {
    await Promise.all(
      AUDIO_PLAYER_EVENTS.map(async (eventName) => {
        const handle = await client.addListener(eventName, (payload) => {
          const legatoPayload = payload as LegatoEventPayloadMap[typeof eventName];
          options.onEvent?.(eventName, legatoPayload);
          applyEventToSnapshot(eventName, legatoPayload);
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
      return publish(snapshot);
    },
    getCurrent() {
      return current;
    },
    async stop() {
      await Promise.all(handles.splice(0).map((handle) => handle.remove()));
    },
  };
}

export function createAudioPlayerSync(options: AudioPlayerSyncOptions = {}): LegatoSyncController {
  return createLegatoSync(options);
}
