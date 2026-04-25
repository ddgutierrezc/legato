import type { QueueSnapshot } from './queue.js';
import type { PlaybackState } from './state.js';
import type { Track } from './track.js';

export interface PlaybackSnapshot {
  state: PlaybackState;
  currentTrack: Track | null;
  currentIndex: number | null;
  position: number;
  duration: number | null;
  bufferedPosition?: number | null;
  queue: QueueSnapshot;
}
