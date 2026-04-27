/**
 * Minimum allowed playback position value.
 */
export const POSITION_MIN = 0;

/**
 * String constants describing invariant expectations enforced across snapshots.
 */
export const LEGATO_INVARIANTS = {
  TRACK_ID_MUST_BE_NON_EMPTY: 'track.id must be a non-empty string',
  TRACK_URL_MUST_BE_NON_EMPTY: 'track.url must be a non-empty string',
  QUEUE_CURRENT_INDEX_IN_BOUNDS:
    'queue.currentIndex must be null or within [0, queue.items.length - 1]',
  POSITION_NON_NEGATIVE: 'snapshot.position must be >= 0',
  OPTIONAL_NUMERIC_FIELDS_NON_NEGATIVE:
    'snapshot.duration and snapshot.bufferedPosition, when present, must be >= 0'
} as const;
