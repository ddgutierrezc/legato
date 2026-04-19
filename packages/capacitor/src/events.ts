import { LEGATO_EVENT_NAMES } from '@legato/contract';
import type {
  LegatoEventName,
  LegatoEventPayloadMap,
} from './definitions';
import { Legato } from './plugin';

export const LEGATO_EVENTS = LEGATO_EVENT_NAMES;

export function addLegatoListener<E extends LegatoEventName>(
  eventName: E,
  listener: (payload: LegatoEventPayloadMap[E]) => void,
) {
  return Legato.addListener(eventName, listener);
}

export const onPlaybackStateChanged = (
  listener: (payload: LegatoEventPayloadMap['playback-state-changed']) => void,
) => addLegatoListener('playback-state-changed', listener);

export const onPlaybackActiveTrackChanged = (
  listener: (payload: LegatoEventPayloadMap['playback-active-track-changed']) => void,
) => addLegatoListener('playback-active-track-changed', listener);

export const onPlaybackQueueChanged = (
  listener: (payload: LegatoEventPayloadMap['playback-queue-changed']) => void,
) => addLegatoListener('playback-queue-changed', listener);

export const onPlaybackProgress = (
  listener: (payload: LegatoEventPayloadMap['playback-progress']) => void,
) => addLegatoListener('playback-progress', listener);

export const onPlaybackEnded = (
  listener: (payload: LegatoEventPayloadMap['playback-ended']) => void,
) => addLegatoListener('playback-ended', listener);

export const onPlaybackError = (
  listener: (payload: LegatoEventPayloadMap['playback-error']) => void,
) => addLegatoListener('playback-error', listener);

export const onRemotePlay = (
  listener: (payload: LegatoEventPayloadMap['remote-play']) => void,
) => addLegatoListener('remote-play', listener);

export const onRemotePause = (
  listener: (payload: LegatoEventPayloadMap['remote-pause']) => void,
) => addLegatoListener('remote-pause', listener);

export const onRemoteNext = (
  listener: (payload: LegatoEventPayloadMap['remote-next']) => void,
) => addLegatoListener('remote-next', listener);

export const onRemotePrevious = (
  listener: (payload: LegatoEventPayloadMap['remote-previous']) => void,
) => addLegatoListener('remote-previous', listener);

export const onRemoteSeek = (
  listener: (payload: LegatoEventPayloadMap['remote-seek']) => void,
) => addLegatoListener('remote-seek', listener);
