import type {
  Capability,
  LegatoEventName as ContractLegatoEventName,
  LegatoEventPayloadMap as ContractLegatoEventPayloadMap,
  LegatoError as ContractLegatoError,
  MediaSessionEventName as ContractMediaSessionEventName,
  MediaSessionEventPayloadMap as ContractMediaSessionEventPayloadMap,
  PlaybackSnapshot as ContractPlaybackSnapshot,
  PlaybackState as ContractPlaybackState,
  PlayerEventName as ContractPlayerEventName,
  PlayerEventPayloadMap as ContractPlayerEventPayloadMap,
  QueueSnapshot as ContractQueueSnapshot,
  Track as ContractTrack,
} from '@ddgutierrezc/legato-contract';

/**
 * Error payload type re-exported from the contract package.
 */
export type LegatoError = ContractLegatoError;
/**
 * Playback snapshot type re-exported from the contract package.
 */
export type PlaybackSnapshot = ContractPlaybackSnapshot;
/**
 * Playback state type re-exported from the contract package.
 */
export type PlaybackState = ContractPlaybackState;
/**
 * Queue snapshot type re-exported from the contract package.
 */
export type QueueSnapshot = ContractQueueSnapshot;
/**
 * Track type re-exported from the contract package.
 */
export type Track = ContractTrack;

/**
 * Player lifecycle event-name union exposed by the Capacitor package.
 */
export type AudioPlayerEventName = ContractPlayerEventName;
/**
 * Media session event-name union exposed by the Capacitor package.
 */
export type MediaSessionEventName = ContractMediaSessionEventName;
/**
 * Unified Legato event-name union exposed by the Capacitor package.
 */
export type LegatoEventName = ContractLegatoEventName;

/**
 * Player lifecycle payload map exposed by the Capacitor package.
 */
export type AudioPlayerEventPayloadMap = ContractPlayerEventPayloadMap;
/**
 * Media session payload map exposed by the Capacitor package.
 */
export type MediaSessionEventPayloadMap = ContractMediaSessionEventPayloadMap;
/**
 * Unified Legato payload map exposed by the Capacitor package.
 */
export type LegatoEventPayloadMap = ContractLegatoEventPayloadMap;

/**
 * Listener signature for player lifecycle events.
 */
export type AudioPlayerListener<E extends AudioPlayerEventName> = (
  payload: AudioPlayerEventPayloadMap[E],
) => void;

/**
 * Listener signature for media session events.
 */
export type MediaSessionListener<E extends MediaSessionEventName> = (
  payload: MediaSessionEventPayloadMap[E],
) => void;

/**
 * Listener signature for unified Legato events.
 */
export type LegatoListener<E extends LegatoEventName> = (
  payload: LegatoEventPayloadMap[E],
) => void;

/**
 * Listener handle returned by add-listener calls.
 */
export interface BindingListenerHandle {
  /** Detaches the listener from the underlying native plugin. */
  remove(): Promise<void> | void;
}

/**
 * Snapshot of runtime-supported playback capabilities.
 */
export interface BindingCapabilitiesSnapshot {
  /** Capabilities currently supported by the plugin runtime. */
  supported: Capability[];
}

/**
 * Options for appending tracks to the queue.
 */
export interface AddOptions {
  /** Tracks to append in insertion order. */
  tracks: Track[];
  /** Optional queue index to activate after insertion. */
  startIndex?: number;
}

/**
 * Options for removing queue entries.
 */
export interface RemoveOptions {
  /** Optional track identifier target. */
  id?: string;
  /** Optional queue index target. */
  index?: number;
}

/**
 * Options for seek operations.
 */
export interface SeekToOptions {
  /** Target playback position in seconds. */
  position: number;
}

/**
 * Options for absolute queue skip operations.
 */
export interface SkipToOptions {
  /** Queue index to activate. */
  index: number;
}

/**
 * Full adapter boundary mirrored by the Capacitor plugin API.
 */
export interface BindingAdapter {
  setup(): Promise<void>;
  add(options: AddOptions): Promise<PlaybackSnapshot>;
  remove(options: RemoveOptions): Promise<PlaybackSnapshot>;
  reset(): Promise<PlaybackSnapshot>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekTo(options: SeekToOptions): Promise<void>;
  skipTo(options: SkipToOptions): Promise<PlaybackSnapshot>;
  skipToNext(): Promise<void>;
  skipToPrevious(): Promise<void>;
  getState(): Promise<PlaybackState>;
  getPosition(): Promise<number>;
  getDuration(): Promise<number | null>;
  getCurrentTrack(): Promise<Track | null>;
  getQueue(): Promise<QueueSnapshot>;
  getSnapshot(): Promise<PlaybackSnapshot>;
  getCapabilities(): Promise<BindingCapabilitiesSnapshot>;
  addListener<E extends LegatoEventName>(
    eventName: E,
    listener: LegatoListener<E>,
  ): Promise<BindingListenerHandle>;
  removeAllListeners(): Promise<void>;
}

type BindingAdapterPlaybackSurface = Pick<
  BindingAdapter,
  | 'setup'
  | 'add'
  | 'remove'
  | 'reset'
  | 'play'
  | 'pause'
  | 'stop'
  | 'seekTo'
  | 'skipTo'
  | 'skipToNext'
  | 'skipToPrevious'
  | 'getState'
  | 'getPosition'
  | 'getDuration'
  | 'getCurrentTrack'
  | 'getQueue'
  | 'getSnapshot'
  | 'getCapabilities'
>;

/**
 * Playback-facing API surface for the audio player namespace.
 */
export interface AudioPlayerApi extends BindingAdapterPlaybackSurface {
  addListener<E extends AudioPlayerEventName>(
    eventName: E,
    listener: AudioPlayerListener<E>,
  ): Promise<BindingListenerHandle>;
  removeAllListeners(): Promise<void>;
}

/**
 * Media-session command API surface.
 */
export interface MediaSessionApi {
  setup(): Promise<void>;
  addListener<E extends MediaSessionEventName>(
    eventName: E,
    listener: MediaSessionListener<E>,
  ): Promise<BindingListenerHandle>;
  removeAllListeners(): Promise<void>;
}

/**
 * Unified API that combines audio-player and media-session surfaces.
 */
export type LegatoApi = AudioPlayerApi & MediaSessionApi;

/**
 * Unified listener API over all Legato event names.
 */
export interface LegatoEventApi {
  addListener<E extends LegatoEventName>(
    eventName: E,
    listener: LegatoListener<E>,
  ): Promise<BindingListenerHandle>;
  removeAllListeners(): Promise<void>;
}
