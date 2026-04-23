export type PlaybackSurface = 'legato' | 'audioPlayer';

export type BoundaryCheck = {
  label: string;
  ok: boolean;
  detail: string;
};

export type BoundarySurfaceSnapshot = {
  activeSurface: PlaybackSurface;
  playbackTarget: string;
  playbackCommands: string[];
  mediaSessionCommands: string[];
};

export function createBoundarySurfaceSnapshot(activeSurface: PlaybackSurface): BoundarySurfaceSnapshot;

export function summarizeBoundaryValidation(payload: BoundarySurfaceSnapshot & {
  parityChecks: BoundaryCheck[];
}): string;
