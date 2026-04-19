import type { Track } from './track';

export interface QueueSnapshot {
  items: Track[];
  currentIndex: number | null;
}
