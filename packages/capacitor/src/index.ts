export type * from './definitions';
export { Legato, audioPlayer, mediaSession } from './plugin';
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
