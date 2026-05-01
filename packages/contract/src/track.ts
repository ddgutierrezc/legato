/**
 * Supported media track kinds accepted by the Legato contract.
 */
export const TRACK_TYPES = ['file', 'progressive', 'hls', 'dash'] as const;

/**
 * Union of supported track kind literals.
 */
export type TrackType = (typeof TRACK_TYPES)[number];

/**
 * Shared header group registered at setup time.
 *
 * Allows multiple tracks to reference the same auth token without duplicating
 * the value across per-track `headers`. Groups are immutable after setup;
 * resolution happens at queue admission time.
 */
export interface HeaderGroup {
  /** Stable identifier referenced by `Track.headerGroupId`. */
  id: string;
  /**
   * Static HTTP headers applied to native playback transport requests
   * for any track that references this group.
   */
  headers: Record<string, string>;
}

/**
 * Queue item shape shared across adapter and consumer boundaries.
 */
export interface Track {
  /** Stable track identifier used by remove/skip operations. */
  id: string;
  /** Playback URL consumed by the native media transport. */
  url: string;
  /** Optional display title metadata. */
  title?: string;
  /** Optional display artist metadata. */
  artist?: string;
  /** Optional display album metadata. */
  album?: string;
  /** Optional artwork URL for lockscreen/notification surfaces. */
  artwork?: string;
  /** Optional track duration in seconds when known. */
  duration?: number;
  /**
   * Declared media semantics used by native capability projectors.
   *
   * - `file` / `progressive`: seekable-by-default when playback is active and not ended.
   * - `hls` / `dash`: streaming-like by default; seek only when runtime proves finite seekability.
   *
   * This field does not force runtime support by itself. Consumers should rely on projected
   * capabilities plus nullable duration signals at runtime.
   */
  type?: TrackType;

  /**
   * Optional reference to a setup-scoped shared header group.
   *
   * When present, the group's headers are merged with any per-track `headers`
   * at queue admission time. Per-track values win per key.
   *
   * Precedence (at admission-time resolution):
   * - group only ⇒ effective = group headers
   * - track only ⇒ effective = track headers
   * - both ⇒ effective = { ...group, ...track }  (track wins per key)
   * - neither ⇒ no auth headers
   *
   * Unknown `headerGroupId` fails fast at `add()` time.
   */
  headerGroupId?: string;

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
}
