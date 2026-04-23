import type { PluginListenerHandle } from '@capacitor/core';
import type {
  LegatoEventName as ContractLegatoEventName,
  LegatoEventPayloadMap as ContractLegatoEventPayloadMap,
  LegatoError,
  MediaSessionEventName as ContractMediaSessionEventName,
  MediaSessionEventPayloadMap as ContractMediaSessionEventPayloadMap,
  PlaybackSnapshot,
  PlaybackState,
  PlayerEventName as ContractPlayerEventName,
  PlayerEventPayloadMap as ContractPlayerEventPayloadMap,
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

export type AudioPlayerEventName = ContractPlayerEventName;
export type MediaSessionEventName = ContractMediaSessionEventName;
export type LegatoEventName = ContractLegatoEventName;

export type AudioPlayerEventPayloadMap = ContractPlayerEventPayloadMap;
export type MediaSessionEventPayloadMap = ContractMediaSessionEventPayloadMap;
export type LegatoEventPayloadMap = ContractLegatoEventPayloadMap;

export type AudioPlayerListener<E extends AudioPlayerEventName> = (
  payload: AudioPlayerEventPayloadMap[E],
) => void;

export type MediaSessionListener<E extends MediaSessionEventName> = (
  payload: MediaSessionEventPayloadMap[E],
) => void;

export type LegatoListener<E extends LegatoEventName> = (
  payload: LegatoEventPayloadMap[E],
) => void;

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

export interface AudioPlayerApi {
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
  addListener<E extends AudioPlayerEventName>(
    eventName: E,
    listener: AudioPlayerListener<E>,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export interface MediaSessionApi {
  setup(): Promise<void>;
  addListener<E extends MediaSessionEventName>(
    eventName: E,
    listener: MediaSessionListener<E>,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export type LegatoApi = AudioPlayerApi & MediaSessionApi;

export interface LegatoEventApi {
  addListener<E extends LegatoEventName>(
    eventName: E,
    listener: LegatoListener<E>,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}
