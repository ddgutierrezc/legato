export const PLAYBACK_STATES = [
  'idle',
  'loading',
  'ready',
  'playing',
  'paused',
  'buffering',
  'ended',
  'error'
] as const;

export type PlaybackState = (typeof PLAYBACK_STATES)[number];
