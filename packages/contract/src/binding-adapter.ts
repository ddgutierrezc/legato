import type { Capability } from './capability.js';
import type { LegatoError } from './errors.js';
import type { LegatoEventName, LegatoEventPayloadMap } from './events.js';
import type { QueueSnapshot } from './queue.js';
import type { PlaybackSnapshot } from './snapshot.js';
import type { PlaybackState } from './state.js';
import type { Track } from './track.js';

/**
 * Listener registration handle returned by adapter listener APIs.
 */
export interface BindingListenerHandle {
  /** Detaches the listener from the underlying adapter implementation. */
  remove(): Promise<void> | void;
}

/**
 * Snapshot of currently supported runtime capabilities.
 */
export interface BindingCapabilitiesSnapshot {
  /** Capability identifiers currently supported by the runtime. */
  supported: Capability[];
}

/**
 * Adapter error payload enriched with optional source metadata.
 */
export interface BindingAdapterError extends LegatoError {
  /** Optional source subsystem that produced the error. */
  source?: string;
}

/**
 * Options for adding one or more tracks to the queue.
 */
export interface AddOptions {
  /** Tracks to append to the runtime queue. */
  tracks: Track[];
  /** Optional index to start playback from after insertion. */
  startIndex?: number;
}

/**
 * Options for removing tracks from the queue.
 */
export interface RemoveOptions {
  /** Optional track identifier target for removal. */
  id?: string;
  /** Optional queue index target for removal. */
  index?: number;
}

/**
 * Options for seeking playback position.
 */
export interface SeekToOptions {
  /** Target playback position in seconds. */
  position: number;
}

/**
 * Options for skipping to an absolute queue index.
 */
export interface SkipToOptions {
  /** Queue index to activate. */
  index: number;
}

/**
 * Runtime-agnostic adapter contract implemented by host bindings.
 */
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
