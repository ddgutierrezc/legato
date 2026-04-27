export const CAPABILITIES = [
  'play',
  'pause',
  'stop',
  // `seek` is projector-owned runtime semantics (not queue-only inference).
  'seek',
  'skip-next',
  'skip-previous'
] as const;

export type Capability = (typeof CAPABILITIES)[number];
