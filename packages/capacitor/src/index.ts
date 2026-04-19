export type * from './definitions';
export { Legato } from './plugin';
export {
  LEGATO_EVENTS,
  addLegatoListener,
  onPlaybackActiveTrackChanged,
  onPlaybackEnded,
  onPlaybackError,
  onPlaybackProgress,
  onPlaybackQueueChanged,
  onPlaybackStateChanged,
  onRemoteNext,
  onRemotePause,
  onRemotePlay,
  onRemotePrevious,
  onRemoteSeek,
} from './events';
export { createLegatoSync } from './sync';
