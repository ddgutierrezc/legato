import { registerPlugin } from '@capacitor/core';
import type { Plugin } from '@capacitor/core';
import type {
  AddOptions,
  LegatoApi,
  LegatoEventApi,
  PlaybackSnapshot,
  PlaybackState,
  QueueSnapshot,
  RemoveOptions,
  SeekToOptions,
  SkipToOptions,
  Track,
} from './definitions';

interface OkResult {
  ok: true;
}

interface SnapshotResult {
  snapshot: PlaybackSnapshot;
}

interface StateResult {
  state: PlaybackState;
}

interface PositionResult {
  position: number;
}

interface DurationResult {
  duration: number | null;
}

interface CurrentTrackResult {
  track: Track | null;
}

interface QueueResult {
  queue: QueueSnapshot;
}

interface LegatoCapacitorPlugin extends Plugin {
  setup(): Promise<OkResult>;
  add(options: AddOptions): Promise<SnapshotResult>;
  remove(options: RemoveOptions): Promise<SnapshotResult>;
  reset(): Promise<SnapshotResult>;
  play(): Promise<OkResult>;
  pause(): Promise<OkResult>;
  stop(): Promise<OkResult>;
  seekTo(options: SeekToOptions): Promise<OkResult>;
  skipTo(options: SkipToOptions): Promise<SnapshotResult>;
  skipToNext(): Promise<OkResult>;
  skipToPrevious(): Promise<OkResult>;
  getState(): Promise<StateResult>;
  getPosition(): Promise<PositionResult>;
  getDuration(): Promise<DurationResult>;
  getCurrentTrack(): Promise<CurrentTrackResult>;
  getQueue(): Promise<QueueResult>;
  getSnapshot(): Promise<SnapshotResult>;
}

export const LegatoCapacitor = registerPlugin<LegatoCapacitorPlugin>('Legato');

export const Legato: LegatoApi & LegatoEventApi = {
  async setup() {
    await LegatoCapacitor.setup();
  },
  async add(options) {
    const result = await LegatoCapacitor.add(options);
    return result.snapshot;
  },
  async remove(options) {
    const result = await LegatoCapacitor.remove(options);
    return result.snapshot;
  },
  async reset() {
    const result = await LegatoCapacitor.reset();
    return result.snapshot;
  },
  async play() {
    await LegatoCapacitor.play();
  },
  async pause() {
    await LegatoCapacitor.pause();
  },
  async stop() {
    await LegatoCapacitor.stop();
  },
  async seekTo(options) {
    await LegatoCapacitor.seekTo(options);
  },
  async skipTo(options) {
    const result = await LegatoCapacitor.skipTo(options);
    return result.snapshot;
  },
  async skipToNext() {
    await LegatoCapacitor.skipToNext();
  },
  async skipToPrevious() {
    await LegatoCapacitor.skipToPrevious();
  },
  async getState() {
    const result = await LegatoCapacitor.getState();
    return result.state;
  },
  async getPosition() {
    const result = await LegatoCapacitor.getPosition();
    return result.position;
  },
  async getDuration() {
    const result = await LegatoCapacitor.getDuration();
    return result.duration;
  },
  async getCurrentTrack() {
    const result = await LegatoCapacitor.getCurrentTrack();
    return result.track;
  },
  async getQueue() {
    const result = await LegatoCapacitor.getQueue();
    return result.queue;
  },
  async getSnapshot() {
    const result = await LegatoCapacitor.getSnapshot();
    return result.snapshot;
  },
  addListener(eventName, listener) {
    return LegatoCapacitor.addListener(eventName, listener);
  },
  removeAllListeners() {
    return LegatoCapacitor.removeAllListeners();
  },
};
