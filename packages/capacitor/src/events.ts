import {
  LEGATO_EVENT_NAMES,
  MEDIA_SESSION_EVENT_NAMES,
  PLAYER_EVENT_NAMES,
} from '@ddgutierrezc/legato-contract';
import type {
  LegatoEventName,
  LegatoEventPayloadMap,
} from './definitions';
import { Legato, audioPlayer, mediaSession } from './plugin';

/**
 * Player lifecycle event-name tuple.
 */
export const AUDIO_PLAYER_EVENTS = PLAYER_EVENT_NAMES;
/**
 * Media-session event-name tuple.
 */
export const MEDIA_SESSION_EVENTS = MEDIA_SESSION_EVENT_NAMES;

/**
 * Unified Legato event-name tuple.
 */
export const LEGATO_EVENTS = LEGATO_EVENT_NAMES;

/**
 * Registers a listener for player lifecycle events.
 */
export const addAudioPlayerListener = audioPlayer.addListener.bind(audioPlayer);
/**
 * Registers a listener for media-session events.
 */
export const addMediaSessionListener = mediaSession.addListener.bind(mediaSession);

/**
 * Registers a listener for any Legato event name.
 * @param eventName Event name to subscribe to.
 * @param listener Callback invoked with the typed event payload.
 * @returns Listener handle that can remove the subscription.
 */
export function addLegatoListener<E extends LegatoEventName>(
  eventName: E,
  listener: (payload: LegatoEventPayloadMap[E]) => void,
) {
  return Legato.addListener(eventName, listener);
}

/**
 * Registers a listener for `playback-state-changed` events.
 */
export const onPlaybackStateChanged = (
  listener: (payload: LegatoEventPayloadMap['playback-state-changed']) => void,
) => addLegatoListener('playback-state-changed', listener);

/**
 * Registers a listener for `playback-active-track-changed` events.
 */
export const onPlaybackActiveTrackChanged = (
  listener: (payload: LegatoEventPayloadMap['playback-active-track-changed']) => void,
) => addLegatoListener('playback-active-track-changed', listener);

/**
 * Registers a listener for `playback-queue-changed` events.
 */
export const onPlaybackQueueChanged = (
  listener: (payload: LegatoEventPayloadMap['playback-queue-changed']) => void,
) => addLegatoListener('playback-queue-changed', listener);

/**
 * Registers a listener for `playback-progress` events.
 */
export const onPlaybackProgress = (
  listener: (payload: LegatoEventPayloadMap['playback-progress']) => void,
) => addLegatoListener('playback-progress', listener);

/**
 * Registers a listener for `playback-ended` events.
 */
export const onPlaybackEnded = (
  listener: (payload: LegatoEventPayloadMap['playback-ended']) => void,
) => addLegatoListener('playback-ended', listener);

/**
 * Registers a listener for `playback-error` events.
 */
export const onPlaybackError = (
  listener: (payload: LegatoEventPayloadMap['playback-error']) => void,
) => addLegatoListener('playback-error', listener);

/**
 * Registers a listener for `remote-play` events.
 */
export const onRemotePlay = (
  listener: (payload: LegatoEventPayloadMap['remote-play']) => void,
) => addLegatoListener('remote-play', listener);

/**
 * Registers a listener for `remote-pause` events.
 */
export const onRemotePause = (
  listener: (payload: LegatoEventPayloadMap['remote-pause']) => void,
) => addLegatoListener('remote-pause', listener);

/**
 * Registers a listener for `remote-next` events.
 */
export const onRemoteNext = (
  listener: (payload: LegatoEventPayloadMap['remote-next']) => void,
) => addLegatoListener('remote-next', listener);

/**
 * Registers a listener for `remote-previous` events.
 */
export const onRemotePrevious = (
  listener: (payload: LegatoEventPayloadMap['remote-previous']) => void,
) => addLegatoListener('remote-previous', listener);

/**
 * Registers a listener for `remote-seek` events.
 */
export const onRemoteSeek = (
  listener: (payload: LegatoEventPayloadMap['remote-seek']) => void,
) => addLegatoListener('remote-seek', listener);
