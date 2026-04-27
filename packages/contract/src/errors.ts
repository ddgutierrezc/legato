/**
 * Stable error code literals emitted by the Legato boundary.
 */
export const LEGATO_ERROR_CODES = [
  'player_not_setup',
  'invalid_index',
  'empty_queue',
  'no_active_track',
  'invalid_url',
  'load_failed',
  'playback_failed',
  'seek_failed',
  'unsupported_operation',
  'platform_error'
] as const;

/**
 * Union of Legato error code values.
 */
export type LegatoErrorCode = (typeof LEGATO_ERROR_CODES)[number];

/**
 * Error payload shape used by playback-error events and API failures.
 */
export interface LegatoError {
  /** Stable machine-readable code. */
  code: LegatoErrorCode;
  /** Human-readable error message from adapter/runtime. */
  message: string;
  /** Optional transport-specific details. */
  details?: unknown;
}
