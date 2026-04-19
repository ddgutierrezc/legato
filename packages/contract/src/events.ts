export const LEGATO_EVENT_NAMES = [
  'playback-state-changed',
  'playback-active-track-changed',
  'playback-queue-changed',
  'playback-progress',
  'playback-ended',
  'playback-error',
  'remote-play',
  'remote-pause',
  'remote-next',
  'remote-previous',
  'remote-seek'
] as const;

export type LegatoEventName = (typeof LEGATO_EVENT_NAMES)[number];
