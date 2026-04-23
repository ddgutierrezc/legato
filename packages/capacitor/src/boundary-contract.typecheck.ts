import type {
  AudioPlayerApi,
  AudioPlayerEventName,
  AudioPlayerEventPayloadMap,
  LegatoApi,
  MediaSessionApi,
  MediaSessionEventName,
  MediaSessionEventPayloadMap,
} from './definitions';
import {
  Legato as legacyLegatoFacade,
  audioPlayer,
  mediaSession,
} from './plugin';
import {
  Legato as legacyLegatoFacadeFromIndex,
  audioPlayer as audioPlayerFromIndex,
  mediaSession as mediaSessionFromIndex,
} from './index';

declare const audioPlayerApi: AudioPlayerApi;
declare const mediaSessionApi: MediaSessionApi;
declare const legatoApi: LegatoApi;

const playbackEventName: AudioPlayerEventName = 'playback-progress';
const mediaEventName: MediaSessionEventName = 'remote-seek';

const playbackPayload: AudioPlayerEventPayloadMap['playback-progress'] = {
  position: 12,
  duration: 30,
  bufferedPosition: 16,
};

const mediaPayload: MediaSessionEventPayloadMap['remote-seek'] = {
  position: 22,
};

void playbackEventName;
void mediaEventName;
void playbackPayload;
void mediaPayload;

audioPlayerApi.setup();
audioPlayerApi.play();
audioPlayerApi.getSnapshot();
audioPlayerApi.addListener('playback-progress', (payload) => {
  void payload.position;
});

mediaSessionApi.setup();
mediaSessionApi.addListener('remote-play', () => {});
mediaSessionApi.addListener('remote-seek', (payload) => {
  void payload.position;
});

legatoApi.play();
legatoApi.addListener('playback-state-changed', (payload) => {
  void payload.state;
});
legatoApi.addListener('remote-next', () => {});

// @ts-expect-error media-session events are excluded from audio-player boundary.
audioPlayerApi.addListener('remote-play', () => {});

// @ts-expect-error playback events are excluded from media-session boundary.
mediaSessionApi.addListener('playback-progress', () => {});

// @ts-expect-error playback controls are excluded from media-session boundary.
mediaSessionApi.play();

// @ts-expect-error media-session event names exclude playback events.
const invalidMediaSessionEventName: MediaSessionEventName = 'playback-ended';

// @ts-expect-error audio-player event names exclude media-session events.
const invalidPlaybackEventName: AudioPlayerEventName = 'remote-next';

void invalidMediaSessionEventName;
void invalidPlaybackEventName;

const pluginAudioPlayer: AudioPlayerApi = audioPlayer;
const pluginMediaSession: MediaSessionApi = mediaSession;
const pluginLegatoFacade: LegatoApi = legacyLegatoFacade;

const indexAudioPlayer: AudioPlayerApi = audioPlayerFromIndex;
const indexMediaSession: MediaSessionApi = mediaSessionFromIndex;
const indexLegatoFacade: LegatoApi = legacyLegatoFacadeFromIndex;

pluginAudioPlayer.play();
pluginMediaSession.addListener('remote-play', () => {});
pluginLegatoFacade.addListener('playback-progress', (payload) => {
  void payload.position;
});

indexAudioPlayer.getSnapshot();
indexMediaSession.addListener('remote-seek', (payload) => {
  void payload.position;
});
indexLegatoFacade.getDuration();

// @ts-expect-error media-session boundary excludes playback controls.
pluginMediaSession.play();

// @ts-expect-error audio-player boundary excludes media-session event names.
pluginAudioPlayer.addListener('remote-next', () => {});
