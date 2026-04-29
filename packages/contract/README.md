# @ddgutierrezc/legato-contract

<p align="center">
  <img src="https://legato-docs.netlify.app/brand.png" alt="Legato brand" width="720" />
</p>

Contract-first playback primitives for Legato shared semantics, events, snapshots, and invariants.

## Why this package

`@ddgutierrezc/legato-contract` lets teams model playback behavior with stable, transport-neutral types before coupling to a specific runtime. It defines the shared language for track, queue, state, snapshot, capabilities, and event payload maps.

## Package role vs Capacitor

- `@ddgutierrezc/legato-contract`: semantics and type contracts only (no playback runtime).
- `@ddgutierrezc/legato-capacitor`: concrete Capacitor adapter that executes playback and emits runtime events using these same contracts.

Start with contract-first modeling when you need portability across app layers, tests, or future adapters.

## Install

```bash
npm install @ddgutierrezc/legato-contract
```

## Quickstart

```ts
import type { LegatoEventPayloadMap, PlaybackSnapshot, Track } from '@ddgutierrezc/legato-contract';
import { LEGATO_EVENT_NAMES, PLAYER_EVENT_NAMES, PLAYBACK_STATES } from '@ddgutierrezc/legato-contract';

const seedTrack: Track = {
  id: 'episode-42',
  url: 'https://cdn.example.com/podcast/42.mp3',
  title: 'Episode 42',
  type: 'progressive',
};

const initialSnapshot: PlaybackSnapshot = {
  state: 'idle',
  currentTrack: seedTrack,
  currentIndex: 0,
  position: 0,
  duration: null,
  queue: { items: [seedTrack], currentIndex: 0 },
};

function onPlaybackEvent<E extends (typeof LEGATO_EVENT_NAMES)[number]>(
  eventName: E,
  payload: LegatoEventPayloadMap[E],
) {
  console.log(eventName, payload);
}

console.log('Known player events:', PLAYER_EVENT_NAMES);
console.log('Known states:', PLAYBACK_STATES);
console.log('Initial snapshot:', initialSnapshot);
```

## Public exports (high level)

- Domain primitives: `Track`, `QueueSnapshot`, `PlaybackState`, `PlaybackSnapshot`, `LegatoError`.
- Event semantics: `PLAYER_EVENT_NAMES`, `MEDIA_SESSION_EVENT_NAMES`, `LEGATO_EVENT_NAMES` and payload maps.
- Runtime capability semantics: `CAPABILITIES`, `Capability`.
- Boundary contracts: transport-neutral adapter interfaces from `binding-adapter`.
- Invariants/helpers: exported from package root for contract-safe app logic.

## Best practices

- Model app behavior against contract snapshots/events first, then plug a runtime adapter.
- Treat nullable `duration` as semantic signal (`null` can mean unknown/live-like timeline).
- Keep imports at package root only.

Anti-pattern:

- Deep imports such as `@ddgutierrezc/legato-contract/dist/*` (unsupported public surface).

## Docs map

- Contract overview: https://legato-docs.netlify.app/packages/contract/
- Contract explanation: https://legato-docs.netlify.app/packages/contract/explanation/
- Contract how-to guides: https://legato-docs.netlify.app/packages/contract/how-to/
- Contract reference: https://legato-docs.netlify.app/packages/contract/reference/
- First integration tutorial: https://legato-docs.netlify.app/tutorials/first-contract-integration/

## Community and support

- Docs: https://legato-docs.netlify.app/
- Discord: https://discord.com/invite/Hhnumyk2N
- LinkedIn: https://www.linkedin.com/in/ddgutierrezc
- GitHub: https://github.com/ddgutierrezc/legato

## License

MIT
