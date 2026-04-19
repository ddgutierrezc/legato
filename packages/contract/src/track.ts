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
  headers?: Record<string, string>;
  type?: TrackType;
}
