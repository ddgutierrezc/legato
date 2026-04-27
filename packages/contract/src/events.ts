import type { LegatoError } from './errors.js';
import type { PlaybackSnapshot } from './snapshot.js';
import type { PlaybackState } from './state.js';
import type { QueueSnapshot } from './queue.js';
import type { Track } from './track.js';

/**
 * Playback lifecycle event names published by the player surface.
 */
export const PLAYER_EVENT_NAMES = [
  'playback-state-changed',
  'playback-active-track-changed',
  'playback-queue-changed',
  'playback-progress',
  'playback-ended',
  'playback-error',
] as const;

/**
 * Remote command event names published by media session controls.
 */
export const MEDIA_SESSION_EVENT_NAMES = [
  'remote-play',
  'remote-pause',
  'remote-next',
  'remote-previous',
  'remote-seek',
] as const;

/**
 * Legacy composite event list preserving player and media session names.
 */
export const LEGACY_PLAYER_EVENT_NAMES = [
  ...PLAYER_EVENT_NAMES,
  ...MEDIA_SESSION_EVENT_NAMES,
] as const;

/**
 * Canonical event-name tuple used by the unified Legato surface.
 */
export const LEGATO_EVENT_NAMES = LEGACY_PLAYER_EVENT_NAMES;

/**
 * Union of player lifecycle event names.
 */
export type PlayerEventName = (typeof PLAYER_EVENT_NAMES)[number];
/**
 * Union of media session event names.
 */
export type MediaSessionEventName = (typeof MEDIA_SESSION_EVENT_NAMES)[number];
/**
 * Union of legacy player and media session event names.
 */
export type LegacyPlayerEventName = (typeof LEGACY_PLAYER_EVENT_NAMES)[number];

/**
 * Union of canonical Legato event names.
 */
export type LegatoEventName = LegacyPlayerEventName;

/**
 * Payload map keyed by player lifecycle event name.
 */
export interface PlayerEventPayloadMap {
  /** Player state transition payload. */
  'playback-state-changed': { state: PlaybackState };
  /** Active track/index transition payload. */
  'playback-active-track-changed': { track: Track | null; index: number | null };
  /** Queue projection update payload. */
  'playback-queue-changed': { queue: QueueSnapshot };
  /** Position/duration/buffer progress payload. */
  'playback-progress': {
    position: number;
    duration: number | null;
    bufferedPosition: number | null;
  };
  /** Terminal playback snapshot payload. */
  'playback-ended': { snapshot: PlaybackSnapshot };
  /** Error payload emitted by playback boundary. */
  'playback-error': { error: LegatoError };
}

/**
 * Payload map keyed by media session remote command name.
 */
export interface MediaSessionEventPayloadMap {
  /** Remote play command payload. */
  'remote-play': Record<string, never>;
  /** Remote pause command payload. */
  'remote-pause': Record<string, never>;
  /** Remote next command payload. */
  'remote-next': Record<string, never>;
  /** Remote previous command payload. */
  'remote-previous': Record<string, never>;
  /**
   * Emitted only when runtime-projected seek capability is enabled (`getCapabilities().supported` includes `seek`).
   */
  'remote-seek': { position: number };
}

/**
 * Composite payload map for the legacy event namespace.
 */
export type LegacyPlayerEventPayloadMap = PlayerEventPayloadMap & MediaSessionEventPayloadMap;

/**
 * Composite payload map for the canonical Legato event namespace.
 */
export type LegatoEventPayloadMap = LegacyPlayerEventPayloadMap;

/**
 * Payload type for a specific player lifecycle event name.
 */
export type PlayerEventPayload<E extends PlayerEventName> = PlayerEventPayloadMap[E];
/**
 * Payload type for a specific media session event name.
 */
export type MediaSessionEventPayload<E extends MediaSessionEventName> = MediaSessionEventPayloadMap[E];
/**
 * Payload type for a specific legacy event name.
 */
export type LegacyPlayerEventPayload<E extends LegacyPlayerEventName> = LegacyPlayerEventPayloadMap[E];

/**
 * Payload type for a specific canonical Legato event name.
 */
export type LegatoEventPayload<E extends LegatoEventName> = LegacyPlayerEventPayload<E>;
