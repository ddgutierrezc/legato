# @ddgutierrezc/legato-capacitor

<p align="center">
  <img src="https://legato-docs.netlify.app/brand.png" alt="Legato brand" width="720" />
</p>

Capacitor runtime adapter for Legato playback APIs, media-session events, and typed sync helpers.

## Why this package

`@ddgutierrezc/legato-capacitor` gives you a concrete runtime surface for hybrid iOS/Android apps using Capacitor. It pairs runtime commands (`audioPlayer`), remote-control events (`mediaSession`), and a unified facade (`Legato`) with the shared contract from `@ddgutierrezc/legato-contract`.

## When to use / when not to use

Use this package when you need:

- Capacitor-native playback commands in production app flows.
- Media-session event handling (play/pause/next/previous/seek).
- Runtime capability-driven UI behavior sourced from `getCapabilities()` and snapshots.

Do not use this package when you only need shared playback semantics (types, events, invariants) without runtime integration. In that case, start with `@ddgutierrezc/legato-contract`.

## Install

```bash
npm install @ddgutierrezc/legato-capacitor @ddgutierrezc/legato-contract
```

## Quickstart

```ts
import {
  Legato,
  audioPlayer,
  mediaSession,
  onPlaybackStateChanged,
  onRemotePlay,
} from '@ddgutierrezc/legato-capacitor';

await audioPlayer.setup();
await mediaSession.setup();

await audioPlayer.add({
  tracks: [
    {
      id: 'intro-001',
      url: 'https://cdn.example.com/audio/intro.mp3',
      title: 'Welcome',
      artist: 'Legato Demo',
      type: 'progressive',
    },
  ],
  startIndex: 0,
});

await audioPlayer.play();

onPlaybackStateChanged(({ state }) => {
  console.log('Playback state:', state);
});

onRemotePlay(() => {
  void Legato.play();
});

const snapshot = await Legato.getSnapshot();
console.log('Current snapshot:', snapshot);
```

## Public entrypoints

- `audioPlayer`: playback commands, queue operations, snapshot/state queries, capability projection.
- `mediaSession`: remote-command listener surface.
- `Legato`: unified facade over `audioPlayer` + `mediaSession`.
- Event helpers/constants: `AUDIO_PLAYER_EVENTS`, `MEDIA_SESSION_EVENTS`, `LEGATO_EVENTS`, `onPlayback*`, `onRemote*`.
- Sync helpers: `createLegatoSync`, `createAudioPlayerSync`.
- Types: exported from package root via `export type * from './definitions'`.

## Docs map

- Overview: https://legato-docs.netlify.app/packages/capacitor/
- Capability model: https://legato-docs.netlify.app/packages/capacitor/explanation/capability-projection/
- Snapshot semantics: https://legato-docs.netlify.app/packages/capacitor/explanation/snapshot-semantics/
- API reference: https://legato-docs.netlify.app/packages/capacitor/reference/
- Getting started: https://legato-docs.netlify.app/getting-started/

## Community and support

- Docs: https://legato-docs.netlify.app/
- Discord: https://discord.com/invite/Hhnumyk2N
- LinkedIn: https://www.linkedin.com/in/ddgutierrezc
- GitHub: https://github.com/ddgutierrezc/legato

## License

MIT
