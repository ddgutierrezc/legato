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

/**
 * Configuration options for sync-controller creation.
 */
export interface LegatoSyncOptions {
  /** Optional playback client override; defaults to the exported `Legato` facade. */
  client?: SyncClient;
  /** Optional callback invoked when local snapshot state changes. */
  onSnapshot?: (snapshot: PlaybackSnapshot) => void;
  /** Optional callback invoked for each received event payload. */
  onEvent?: <E extends LegatoEventName>(eventName: E, payload: LegatoEventPayloadMap[E]) => void;
}

/**
 * Controller API for maintaining a local playback snapshot mirror.
 */
export interface LegatoSyncController {
  start(): Promise<PlaybackSnapshot>;
  resync(): Promise<PlaybackSnapshot>;
  getCurrent(): PlaybackSnapshot | null;
  stop(): Promise<void>;
}

/**
 * Alias for clients accepted by audio-player sync helpers.
 */
export type AudioPlayerSyncClient = AudioPlayerApi;

/**
 * Audio-player-specific options for sync-controller creation.
 */
export interface AudioPlayerSyncOptions extends LegatoSyncOptions {
  /** Optional playback client override constrained to the audio-player surface. */
  client?: AudioPlayerSyncClient;
}

/**
 * Creates a snapshot sync controller driven by Legato playback events.
 * @param options Optional sync hooks and client override.
 * @returns Controller that starts, resyncs, inspects, and stops snapshot synchronization.
 */
export function createLegatoSync(options: LegatoSyncOptions = {}): LegatoSyncController {
  const client = options.client ?? Legato;
  const handles: BindingListenerHandle[] = [];
  let current: PlaybackSnapshot | null = null;

  const publishSnapshot = (snapshot: PlaybackSnapshot): PlaybackSnapshot => {
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
        publishSnapshot({ ...current, state: eventPayload.state });
        break;
      }
      case 'playback-active-track-changed': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-active-track-changed'];
        publishSnapshot({
          ...current,
          currentTrack: eventPayload.track,
          currentIndex: eventPayload.index,
          duration: eventPayload.track?.duration ?? current.duration,
          queue: {
            ...current.queue,
            currentIndex: eventPayload.index,
          },
        });
        break;
      }
      case 'playback-queue-changed': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-queue-changed'];
        publishSnapshot({
          ...current,
          queue: eventPayload.queue,
          currentIndex: eventPayload.queue.currentIndex,
        });
        break;
      }
      case 'playback-progress': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-progress'];
        publishSnapshot({
          ...current,
          position: eventPayload.position,
          duration: eventPayload.duration,
          bufferedPosition: eventPayload.bufferedPosition,
        });
        break;
      }
      case 'playback-ended': {
        const eventPayload = payload as LegatoEventPayloadMap['playback-ended'];
        publishSnapshot(eventPayload.snapshot);
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

/**
 * Creates a sync controller using the audio-player client surface.
 * @param options Optional sync hooks and client override.
 * @returns Controller delegating to `createLegatoSync`.
 */
export function createAudioPlayerSync(options: AudioPlayerSyncOptions = {}): LegatoSyncController {
  return createLegatoSync(options);
}
