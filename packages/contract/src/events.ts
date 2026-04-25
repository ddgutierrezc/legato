import type { LegatoError } from './errors.js';
import type { PlaybackSnapshot } from './snapshot.js';
import type { PlaybackState } from './state.js';
import type { QueueSnapshot } from './queue.js';
import type { Track } from './track.js';

export const PLAYER_EVENT_NAMES = [
  'playback-state-changed',
  'playback-active-track-changed',
  'playback-queue-changed',
  'playback-progress',
  'playback-ended',
  'playback-error',
] as const;

export const MEDIA_SESSION_EVENT_NAMES = [
  'remote-play',
  'remote-pause',
  'remote-next',
  'remote-previous',
  'remote-seek',
] as const;

export const LEGACY_PLAYER_EVENT_NAMES = [
  ...PLAYER_EVENT_NAMES,
  ...MEDIA_SESSION_EVENT_NAMES,
] as const;

export const LEGATO_EVENT_NAMES = LEGACY_PLAYER_EVENT_NAMES;

export type PlayerEventName = (typeof PLAYER_EVENT_NAMES)[number];
export type MediaSessionEventName = (typeof MEDIA_SESSION_EVENT_NAMES)[number];
export type LegacyPlayerEventName = (typeof LEGACY_PLAYER_EVENT_NAMES)[number];

export type LegatoEventName = LegacyPlayerEventName;

export interface PlayerEventPayloadMap {
  'playback-state-changed': { state: PlaybackState };
  'playback-active-track-changed': { track: Track | null; index: number | null };
  'playback-queue-changed': { queue: QueueSnapshot };
  'playback-progress': {
    position: number;
    duration: number | null;
    bufferedPosition: number | null;
  };
  'playback-ended': { snapshot: PlaybackSnapshot };
  'playback-error': { error: LegatoError };
}

export interface MediaSessionEventPayloadMap {
  'remote-play': Record<string, never>;
  'remote-pause': Record<string, never>;
  'remote-next': Record<string, never>;
  'remote-previous': Record<string, never>;
  'remote-seek': { position: number };
}

export type LegacyPlayerEventPayloadMap = PlayerEventPayloadMap & MediaSessionEventPayloadMap;

export type LegatoEventPayloadMap = LegacyPlayerEventPayloadMap;

export type PlayerEventPayload<E extends PlayerEventName> = PlayerEventPayloadMap[E];
export type MediaSessionEventPayload<E extends MediaSessionEventName> = MediaSessionEventPayloadMap[E];
export type LegacyPlayerEventPayload<E extends LegacyPlayerEventName> = LegacyPlayerEventPayloadMap[E];

export type LegatoEventPayload<E extends LegatoEventName> = LegacyPlayerEventPayload<E>;
