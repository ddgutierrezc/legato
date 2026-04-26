import type { Capability } from './capability.js';
import type { LegatoError } from './errors.js';
import type { LegatoEventName, LegatoEventPayloadMap } from './events.js';
import type { QueueSnapshot } from './queue.js';
import type { PlaybackSnapshot } from './snapshot.js';
import type { PlaybackState } from './state.js';
import type { Track } from './track.js';

export interface BindingListenerHandle {
  remove(): Promise<void> | void;
}

export interface BindingCapabilitiesSnapshot {
  supported: Capability[];
}

export interface BindingAdapterError extends LegatoError {
  source?: string;
}

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

export interface BindingAdapter {
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
  getCapabilities(): Promise<BindingCapabilitiesSnapshot>;
  addListener<E extends LegatoEventName>(
    eventName: E,
    listener: (payload: LegatoEventPayloadMap[E]) => void,
  ): Promise<BindingListenerHandle>;
  removeAllListeners(): Promise<void>;
}
