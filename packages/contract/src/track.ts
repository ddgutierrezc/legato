export const TRACK_TYPES = ['file', 'progressive', 'hls', 'dash'] as const;

export type TrackType = (typeof TRACK_TYPES)[number];

export interface Track {
  id: string;
  url: string;
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
  duration?: number;
  /**
   * Static per-track HTTP headers used by native playback transport.
   *
   * v1 support scope:
   * - Applied by Android/iOS runtime media requests for this track.
   * - Isolated per track (headers are not shared across queue transitions).
   *
   * v1 non-goals:
   * - DRM/license request auth flows.
   * - Token refresh/rotation or dynamic auth callbacks.
   * - Cookie/session renewal orchestration.
   */
  headers?: Record<string, string>;
  type?: TrackType;
}
