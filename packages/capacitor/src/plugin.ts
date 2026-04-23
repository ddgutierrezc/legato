import { registerPlugin } from '@capacitor/core';
import type { Plugin } from '@capacitor/core';
import type {
  AddOptions,
  AudioPlayerApi,
  AudioPlayerEventName,
  AudioPlayerListener,
  LegatoApi,
  LegatoEventApi,
  LegatoEventName,
  LegatoListener,
  MediaSessionApi,
  MediaSessionEventName,
  MediaSessionListener,
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

const sharedDelegate = {
  async setup() {
    await LegatoCapacitor.setup();
  },
  async add(options: AddOptions) {
    const result = await LegatoCapacitor.add(options);
    return result.snapshot;
  },
  async remove(options: RemoveOptions) {
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
  async seekTo(options: SeekToOptions) {
    await LegatoCapacitor.seekTo(options);
  },
  async skipTo(options: SkipToOptions) {
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
  removeAllListeners() {
    return LegatoCapacitor.removeAllListeners();
  },
};

const addAudioPlayerListener: AudioPlayerApi['addListener'] = <E extends AudioPlayerEventName>(
  eventName: E,
  listener: AudioPlayerListener<E>,
) => LegatoCapacitor.addListener(eventName, listener);

const addMediaSessionListener: MediaSessionApi['addListener'] = <E extends MediaSessionEventName>(
  eventName: E,
  listener: MediaSessionListener<E>,
) => LegatoCapacitor.addListener(eventName, listener);

const addLegatoListener: LegatoEventApi['addListener'] = <E extends LegatoEventName>(
  eventName: E,
  listener: LegatoListener<E>,
) => LegatoCapacitor.addListener(eventName, listener);

export const audioPlayer: AudioPlayerApi = {
  setup: sharedDelegate.setup,
  add: sharedDelegate.add,
  remove: sharedDelegate.remove,
  reset: sharedDelegate.reset,
  play: sharedDelegate.play,
  pause: sharedDelegate.pause,
  stop: sharedDelegate.stop,
  seekTo: sharedDelegate.seekTo,
  skipTo: sharedDelegate.skipTo,
  skipToNext: sharedDelegate.skipToNext,
  skipToPrevious: sharedDelegate.skipToPrevious,
  getState: sharedDelegate.getState,
  getPosition: sharedDelegate.getPosition,
  getDuration: sharedDelegate.getDuration,
  getCurrentTrack: sharedDelegate.getCurrentTrack,
  getQueue: sharedDelegate.getQueue,
  getSnapshot: sharedDelegate.getSnapshot,
  addListener: addAudioPlayerListener,
  removeAllListeners: sharedDelegate.removeAllListeners,
};

export const mediaSession: MediaSessionApi = {
  setup: sharedDelegate.setup,
  addListener: addMediaSessionListener,
  removeAllListeners: sharedDelegate.removeAllListeners,
};

export const Legato: LegatoApi & LegatoEventApi = {
  ...audioPlayer,
  ...mediaSession,
  addListener: addLegatoListener,
  removeAllListeners: sharedDelegate.removeAllListeners,
};
