/**
 * Canonical playback state literals emitted by Legato runtimes.
 */
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

/**
 * Union of playback state values.
 */
export type PlaybackState = (typeof PLAYBACK_STATES)[number];
