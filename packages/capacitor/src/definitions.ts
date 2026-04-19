import type { PluginListenerHandle } from '@capacitor/core';
import type {
  LegatoError,
  LegatoEventName as ContractLegatoEventName,
  PlaybackSnapshot,
  PlaybackState,
  QueueSnapshot,
  Track,
} from '@legato/contract';

export type {
  LegatoError,
  PlaybackSnapshot,
  PlaybackState,
  QueueSnapshot,
  Track,
};

export type LegatoEventName = ContractLegatoEventName;

export interface AddOptions {
  tracks: Track[];
  startIndex?: number;
}

export interface RemoveOptions {
  id?: string;
  index?: number;
}

export interface SeekToOptions {
  position: number;
}

export interface SkipToOptions {
  index: number;
}

export interface LegatoEventPayloadMap {
  'playback-state-changed': { state: PlaybackState };
  'playback-active-track-changed': { track: Track | null; index: number | null };
  'playback-queue-changed': { queue: QueueSnapshot };
  'playback-progress': {
    position: number;
    duration: number | null;
    bufferedPosition: number | null;
  };
  'playback-ended': { snapshot: PlaybackSnapshot };
  'playback-error': { error: LegatoError };
  'remote-play': Record<string, never>;
  'remote-pause': Record<string, never>;
  'remote-next': Record<string, never>;
  'remote-previous': Record<string, never>;
  'remote-seek': { position: number };
}

export interface LegatoApi {
  setup(): Promise<void>;
  add(options: AddOptions): Promise<PlaybackSnapshot>;
  remove(options: RemoveOptions): Promise<PlaybackSnapshot>;
  reset(): Promise<PlaybackSnapshot>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo(options: SeekToOptions): Promise<void>;
  skipTo(options: SkipToOptions): Promise<PlaybackSnapshot>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  getState(): Promise<PlaybackState>;
  getPosition(): Promise<number>;
  getDuration(): Promise<number | null>;
  getCurrentTrack(): Promise<Track | null>;
  getQueue(): Promise<QueueSnapshot>;
  getSnapshot(): Promise<PlaybackSnapshot>;
}

export interface LegatoEventApi {
  addListener<E extends LegatoEventName>(
    eventName: E,
    listener: (payload: LegatoEventPayloadMap[E]) => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
