const PLAYBACK_COMMANDS = ['setup', 'add', 'play', 'pause', 'stop', 'seekTo', 'getSnapshot'];
const MEDIA_SESSION_COMMANDS = ['addListener(remote-*)', 'removeAllListeners'];

/**
 * @param {'legato' | 'audioPlayer'} activeSurface
 */
export const createBoundarySurfaceSnapshot = (activeSurface) => {
  const normalizedSurface = activeSurface === 'audioPlayer' ? 'audioPlayer' : 'legato';

  return {
    activeSurface: normalizedSurface,
    playbackTarget: normalizedSurface === 'audioPlayer' ? 'audioPlayer namespace' : 'Legato facade',
    preferredSurface: 'audioPlayer + mediaSession',
    compatSurface: 'Legato facade (compatibility-only)',
    playbackCommands: [...PLAYBACK_COMMANDS],
    mediaSessionCommands: [...MEDIA_SESSION_COMMANDS],
  };
};

/**
 * @typedef {{label: string; ok: boolean; detail: string}} BoundaryCheck
 */

/**
 * @param {{
 *   activeSurface: 'legato' | 'audioPlayer';
 *   playbackTarget: string;
 *   preferredSurface: string;
 *   compatSurface: string;
 *   playbackCommands: string[];
 *   mediaSessionCommands: string[];
 *   parityChecks: BoundaryCheck[];
 * }} payload
 */
export const summarizeBoundaryValidation = (payload) => {
  const lines = [
    `activeSurface=${payload.activeSurface}`,
    `playbackTarget=${payload.playbackTarget}`,
    `preferredSurface=${payload.preferredSurface}`,
    `compatSurface=${payload.compatSurface}`,
    `playbackCommands=${payload.playbackCommands.join(', ')}`,
    `mediaSessionCommands=${payload.mediaSessionCommands.join(', ')}`,
  ];

  if (payload.parityChecks.length === 0) {
    lines.push('checks=none yet');
    return lines.join('\n');
  }

  lines.push('checks:');
  payload.parityChecks.forEach((check) => {
    lines.push(`${check.ok ? '✅' : '❌'} ${check.label} — ${check.detail}`);
  });
  return lines.join('\n');
};
