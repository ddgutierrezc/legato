import type {
  AddOptions,
  AudioPlayerApi,
  AudioPlayerEventName,
  AudioPlayerListener,
  BindingCapabilitiesSnapshot,
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
  SetupOptions,
  SkipToOptions,
  Track,
} from './definitions';
import LegatoModule from './LegatoModule';

interface SnapshotResult { snapshot: PlaybackSnapshot }
interface StateResult { state: PlaybackState }
interface PositionResult { position: number }
interface DurationResult { duration: number | null }
interface CurrentTrackResult { track: Track | null }
interface QueueResult { queue: QueueSnapshot }
interface CapabilitiesResult { supported: BindingCapabilitiesSnapshot['supported'] }

const unwrapSnapshot = (result: SnapshotResult | PlaybackSnapshot): PlaybackSnapshot =>
  typeof result === 'object' && result !== null && 'snapshot' in result ? result.snapshot : result;

const unwrapState = (result: StateResult | PlaybackState): PlaybackState =>
  typeof result === 'object' && result !== null && 'state' in result ? result.state : result;

const sharedDelegate = {
  async setup(options?: SetupOptions) {
    await LegatoModule.setup(options);
  },
  async add(options: AddOptions) {
    return unwrapSnapshot(await LegatoModule.add(options));
  },
  async remove(options: RemoveOptions) {
    return unwrapSnapshot(await LegatoModule.remove(options));
  },
  async reset() {
    return unwrapSnapshot(await LegatoModule.reset());
  },
  async play() {
    await LegatoModule.play();
  },
  async pause() {
    await LegatoModule.pause();
  },
  async stop() {
    await LegatoModule.stop();
  },
  async seekTo(options: SeekToOptions) {
    await LegatoModule.seekTo(options);
  },
  async skipTo(options: SkipToOptions) {
    return unwrapSnapshot(await LegatoModule.skipTo(options));
  },
  async skipToNext() {
    await LegatoModule.skipToNext();
  },
  async skipToPrevious() {
    await LegatoModule.skipToPrevious();
  },
  async getState() {
    return unwrapState(await LegatoModule.getState());
  },
  async getPosition() {
    const result = (await LegatoModule.getPosition()) as PositionResult | number;
    return typeof result === 'object' && result !== null && 'position' in result ? result.position : result;
  },
  async getDuration() {
    const result = (await LegatoModule.getDuration()) as DurationResult | number | null;
    return typeof result === 'object' && result !== null && 'duration' in result ? result.duration : result;
  },
  async getCurrentTrack() {
    const result = (await LegatoModule.getCurrentTrack()) as CurrentTrackResult | Track | null;
    return typeof result === 'object' && result !== null && 'track' in result ? result.track : result;
  },
  async getQueue() {
    const result = (await LegatoModule.getQueue()) as QueueResult | QueueSnapshot;
    return typeof result === 'object' && result !== null && 'queue' in result ? result.queue : result;
  },
  async getSnapshot() {
    return unwrapSnapshot(await LegatoModule.getSnapshot());
  },
  async getCapabilities() {
    const result = (await LegatoModule.getCapabilities()) as
      | CapabilitiesResult
      | BindingCapabilitiesSnapshot;
    return { supported: result.supported };
  },
  removeAllListeners() {
    return LegatoModule.removeAllListeners();
  },
};

const addAudioPlayerListener: AudioPlayerApi['addListener'] = <E extends AudioPlayerEventName>(
  eventName: E,
  listener: AudioPlayerListener<E>,
) => Promise.resolve(LegatoModule.addListener(eventName, listener));

const addMediaSessionListener: MediaSessionApi['addListener'] = <E extends MediaSessionEventName>(
  eventName: E,
  listener: MediaSessionListener<E>,
) => Promise.resolve(LegatoModule.addListener(eventName, listener));

const addLegatoListener: LegatoEventApi['addListener'] = <E extends LegatoEventName>(
  eventName: E,
  listener: LegatoListener<E>,
) => Promise.resolve(LegatoModule.addListener(eventName, listener));

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
  getCapabilities: sharedDelegate.getCapabilities,
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
