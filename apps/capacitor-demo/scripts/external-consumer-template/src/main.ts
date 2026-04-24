import { Legato, type PlaybackSnapshot } from '@ddgutierrezc/legato-capacitor';
import type { Track } from '@ddgutierrezc/legato-contract';

const fixtureTrack: Track = {
  id: 'external-track-1',
  url: 'https://samplelib.com/mp3/sample-12s.mp3',
  title: 'External Fixture Track',
  artist: 'Legato',
  album: 'External Consumer Validation',
  artwork: 'https://i.pravatar.cc/300',
  duration: 12000,
  type: 'progressive',
};

export const compileSurfaceProof = async (): Promise<PlaybackSnapshot> => {
  await Legato.setup();
  return Legato.add({ tracks: [fixtureTrack] });
};
