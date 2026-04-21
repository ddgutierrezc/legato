export const LEGATO_ANDROID_GROUNDWORK_CONTRACT = {
  playbackService: {
    className: 'io.legato.capacitor.LegatoPlaybackService',
    exported: false,
    foregroundServiceType: 'mediaPlayback',
  },
  requiredPermissions: [
    'android.permission.FOREGROUND_SERVICE',
    'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    'android.permission.WAKE_LOCK',
  ],
  audioFocusPolicy: {
    gain: 'AUDIOFOCUS_GAIN',
    onLoss: 'pause-and-mark-interrupted',
    onTransientLoss: 'pause-and-await-regain',
    onTransientCanDuck: 'duck-volume-until-regain',
    onGainAfterInterruption: 'resume-if-user-did-not-manually-pause',
    intent: 'Milestone 1 groundwork contract only; not full Media3/audio-focus runtime behavior.',
  },
};

export const LEGATO_ANDROID_PLAYBACK_SERVICE_CLASS = LEGATO_ANDROID_GROUNDWORK_CONTRACT.playbackService.className;
