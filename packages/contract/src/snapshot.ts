import type { QueueSnapshot } from './queue';
import type { PlaybackState } from './state';
import type { Track } from './track';

export interface PlaybackSnapshot {
  state: PlaybackState;
  currentTrack: Track | null;
  currentIndex: number | null;
  position: number;
  duration: number | null;
  bufferedPosition?: number | null;
  queue: QueueSnapshot;
}
