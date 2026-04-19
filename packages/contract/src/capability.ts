export const CAPABILITIES = [
  'play',
  'pause',
  'stop',
  'seek',
  'skip-next',
  'skip-previous'
] as const;

export type Capability = (typeof CAPABILITIES)[number];
