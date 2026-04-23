import type {
  LegacyPlayerEventName,
  LegacyPlayerEventPayload,
  MediaSessionEventName,
  MediaSessionEventPayload,
  PlayerEventName,
  PlayerEventPayload,
} from './events';

const playbackEvent: PlayerEventName = 'playback-progress';
const mediaSessionEvent: MediaSessionEventName = 'remote-play';
const legacyPlaybackEvent: LegacyPlayerEventName = 'playback-ended';
const legacyMediaSessionEvent: LegacyPlayerEventName = 'remote-seek';

const playbackPayload: PlayerEventPayload<'playback-progress'> = {
  position: 8,
  duration: 10,
  bufferedPosition: 9,
};

const mediaSessionPayload: MediaSessionEventPayload<'remote-seek'> = {
  position: 42,
};

const legacyPlaybackPayload: LegacyPlayerEventPayload<'playback-state-changed'> = {
  state: 'playing',
};

const legacyMediaSessionPayload: LegacyPlayerEventPayload<'remote-pause'> = {};

void playbackEvent;
void mediaSessionEvent;
void legacyPlaybackEvent;
void legacyMediaSessionEvent;
void playbackPayload;
void mediaSessionPayload;
void legacyPlaybackPayload;
void legacyMediaSessionPayload;

// @ts-expect-error media-session events are not playback events.
const invalidPlaybackBoundary: PlayerEventName = 'remote-play';

// @ts-expect-error playback events are not media-session events.
const invalidMediaSessionBoundary: MediaSessionEventName = 'playback-ended';

// @ts-expect-error playback-progress payload requires numeric fields.
const invalidPlaybackPayload: PlayerEventPayload<'playback-progress'> = {};

// @ts-expect-error remote-seek payload requires a position.
const invalidMediaSessionPayload: MediaSessionEventPayload<'remote-seek'> = {};

void invalidPlaybackBoundary;
void invalidMediaSessionBoundary;
void invalidPlaybackPayload;
void invalidMediaSessionPayload;
