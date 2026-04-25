import type { Track } from './track.js';

export interface QueueSnapshot {
  items: Track[];
  currentIndex: number | null;
}
