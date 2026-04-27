/**
 * Runtime capability literals projected by the adapter boundary.
 */
export const CAPABILITIES = [
  'play',
  'pause',
  'stop',
  // `seek` is projector-owned runtime semantics (not queue-only inference).
  'seek',
  'skip-next',
  'skip-previous'
] as const;

/**
 * Union of runtime capability values.
 */
export type Capability = (typeof CAPABILITIES)[number];
