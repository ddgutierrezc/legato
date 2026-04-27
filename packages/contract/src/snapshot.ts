import type { QueueSnapshot } from './queue.js';
import type { PlaybackState } from './state.js';
import type { Track } from './track.js';

export interface PlaybackSnapshot {
  state: PlaybackState;
  currentTrack: Track | null;
  currentIndex: number | null;
  position: number;
  /**
   * Nullable duration semantics:
   * - `null` => unknown/live-like timeline semantics.
   * - finite number => evidence of finite media length, but not a seekability guarantee by itself.
   *
   * Consumers should combine duration with projected `canSeek` capability.
   */
  duration: number | null;
  bufferedPosition?: number | null;
  queue: QueueSnapshot;
}
