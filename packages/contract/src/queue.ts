import type { Track } from './track.js';

/**
 * Serializable queue projection used by contract snapshots and events.
 */
export interface QueueSnapshot {
  /** Ordered queue items. */
  items: Track[];
  /** Active queue index, or `null` when no active item exists. */
  currentIndex: number | null;
}
