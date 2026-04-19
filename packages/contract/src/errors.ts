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

export type LegatoErrorCode = (typeof LEGATO_ERROR_CODES)[number];

export interface LegatoError {
  code: LegatoErrorCode;
  message: string;
  details?: unknown;
}
