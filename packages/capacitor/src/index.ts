export type * from './definitions';
export { Legato, audioPlayer, mediaSession } from './plugin';
export {
  AUDIO_PLAYER_EVENTS,
  MEDIA_SESSION_EVENTS,
  addAudioPlayerListener,
  addMediaSessionListener,
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
export { createAudioPlayerSync, createLegatoSync } from './sync';
