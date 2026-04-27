import type { QueueSnapshot } from './queue.js';
import type { PlaybackState } from './state.js';
import type { Track } from './track.js';

/**
 * Playback snapshot contract returned by adapter read APIs and events.
 */
export interface PlaybackSnapshot {
  /** Current playback state. */
  state: PlaybackState;
  /** Current active track, or `null` when none is active. */
  currentTrack: Track | null;
  /** Current active queue index, or `null` when none is active. */
  currentIndex: number | null;
  /** Playback position in seconds. */
  position: number;
  /**
   * Nullable duration semantics:
   * - `null` => unknown/live-like timeline semantics.
   * - finite number => evidence of finite media length, but not a seekability guarantee by itself.
   *
   * Consumers should combine duration with projected `canSeek` capability.
   */
  duration: number | null;
  /** Buffered position in seconds when provided by runtime. */
  bufferedPosition?: number | null;
  /** Queue projection associated with the snapshot. */
  queue: QueueSnapshot;
}
