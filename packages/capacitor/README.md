# @ddgutierrezc/legato-capacitor

Modern Capacitor binding MVP for Legato.

This package provides Capacitor-native integration and is not a replacement for contract-only consumers.

## npm quickstart

```bash
npm install @ddgutierrezc/legato-capacitor @ddgutierrezc/legato-contract
```

## First-use flow

First health check:

```bash
npx legato native doctor
```

Minimal API start:

```ts
import { audioPlayer, mediaSession } from '@ddgutierrezc/legato-capacitor';

await audioPlayer.setup();
await mediaSession.setup();
```

Audience and prerequisites:

- Intended audience: Capacitor integrators adding Legato playback to host apps.
- Requires a supported Node.js + npm toolchain and a Capacitor project context.
- `legato native` is a repo-owned maintainer helper; consumer onboarding should start with install + API usage.
- Unsupported environment disclosure: non-LTS or end-of-life Node.js runtimes are not supported for this onboarding path.
- Remediation: use a supported Node.js LTS release (and matching npm), then rerun install + `npx legato native doctor`.

## Non-goals for npm ergonomics v1

- Non-goal: runtime behavior expansion.
- Non-goal: release-lane redesign.
- Non-goal: platform bootstrap automation beyond current safe patch checks.

## API surface (v1 boundary split, additive)

`@ddgutierrezc/legato-capacitor` now exposes three public entry points over the same Capacitor plugin instance:

- `audioPlayer` (playback/queue/seek/read-model commands + playback events)
- `mediaSession` (remote/session-facing event surface)
- `Legato` (legacy compatibility facade composed as `AudioPlayerApi & MediaSessionApi`)

Playback commands/queries (available on `audioPlayer` and legacy `Legato`):

- `setup`, `add`, `remove`, `reset`
- `play`, `pause`, `stop`, `seekTo`
- `skipTo`, `skipToNext`, `skipToPrevious`
- `getState`, `getPosition`, `getDuration`, `getCurrentTrack`, `getQueue`, `getSnapshot`, `getCapabilities`

`mediaSession` is intentionally listener-first in v1 and currently exposes:

- `setup`
- `addListener('remote-*', ...)`
- `removeAllListeners`

This split is additive: existing `Legato` consumers remain source-compatible while new code can adopt namespaced boundaries.

It also exports typed event helpers aligned with `@ddgutierrezc/legato-contract`, and `createLegatoSync()` for lightweight snapshot/event resync.

### Migration guidance

- Existing apps: no code change required; keep using `Legato`.
- New integrations: prefer `audioPlayer` for playback operations and `mediaSession` for remote/session listeners.
- Mixed migration is supported: both namespaced exports and `Legato` route to the same underlying plugin/state.

### Legacy → namespaced migration map (preferred path)

| Legacy helper/API | Preferred namespaced API | Posture |
|---|---|---|
| `Legato.addListener('playback-*', ...)` | `addAudioPlayerListener('playback-*', ...)` | Preferred for new code |
| `Legato.addListener('remote-*', ...)` | `addMediaSessionListener('remote-*', ...)` | Preferred for new code |
| `createLegatoSync(...)` | `createAudioPlayerSync(...)` | Preferred for new code |
| `LEGATO_EVENTS` | `AUDIO_PLAYER_EVENTS` + `MEDIA_SESSION_EVENTS` | Preferred for explicit boundaries |
| `Legato` facade calls (`Legato.play()`, etc.) | `audioPlayer` / `mediaSession` namespaces | Compatibility-only for existing flows |

Compatibility-only (legacy Legato facade): `Legato`, `createLegatoSync`, `LEGATO_EVENTS`, and `addLegatoListener` remain supported and unchanged.

### Runtime parity notes (`cross-platform-runtime-parity-v1`)

- `getCapabilities()` is now first-class on `audioPlayer` and `Legato`.
- `mediaSession` remains listener-first and intentionally does **not** expose playback controls/capability queries.
- `add({ tracks, startIndex })` interprets `startIndex` relative to the appended batch (resolved queue index = previous queue length + startIndex).

### Explicit deferred differences (non-goals)

- Android-only telemetry like `playback-interruption` remains intentionally deferred from cross-platform parity assertions in v1.
- Deep lifecycle/process-death parity redesign is out of scope for this change and tracked as follow-up work.

```ts
import {
  addAudioPlayerListener,
  addMediaSessionListener,
  createAudioPlayerSync,
} from '@ddgutierrezc/legato-capacitor';

const sync = createAudioPlayerSync({
  onSnapshot(snapshot) {
    console.log('snapshot', snapshot.state);
  },
});

await sync.start();

const playbackHandle = await addAudioPlayerListener('playback-state-changed', (payload) => {
  console.log('playback state', payload.state);
});

const remoteHandle = await addMediaSessionListener('remote-play', () => {
  console.log('remote play');
});

// ...later
await playbackHandle.remove();
await remoteHandle.remove();
await sync.stop();
```

## Package role boundary

- Choose `@ddgutierrezc/legato-contract` when you only need shared contracts/types.
- Choose `@ddgutierrezc/legato-capacitor` when you need Capacitor plugin runtime integration.

## Multi-binding boundary note (foundation v1)

- Capacitor is the **first concrete adapter** over the shared binding contract.
- Capacitor remains the **only implemented binding** in this change.
- Flutter and React Native are planned follow-up spikes only; no runtime adapter implementation ships here.

## Maintainer operations

Maintainer-heavy CLI/release/SPM operational details are documented in [`../../docs/maintainers/legato-capacitor-operator-guide.md`](../../docs/maintainers/legato-capacitor-operator-guide.md).

## MVP limitations

- Android runtime playback is implemented (Media3/ExoPlayer runtime + foreground service transport controls) for package-supported flows.
- This binding bridges current native core semantics/state/events and keeps queue/state/event ownership aligned.
- Interruption handling policy in runtime-v1 is explicit: focus loss/noisy pauses playback; focus gain does not auto-resume.
- Lifecycle hardening boundary (`android-background-lifecycle-v1`) is explicit: focus denial/CAN_DUCK/background transition behavior is in scope only while process is alive.
- Non-goals for this milestone: process-death restore, broad lifecycle/OEM hardening, and cross-platform parity expansion.
- Those deferred items move to follow-up milestones (`android-background-lifecycle-v1` and platform parity tracks), not runtime-v1.

<!-- NATIVE_ARTIFACTS:BEGIN -->
### Native artifact distribution contract (foundation)

| Platform | Policy | Source of truth |
|---|---|---|
| Android | Maven Central coordinate `dev.dgutierrez:legato-android-core:0.1.3` | `native-artifacts.json` |
| iOS | SwiftPM remote package `LegatoCore` at `https://github.com/ddgutierrezc/legato-ios-core.git` pinned with `exact(0.1.2)` | `native-artifacts.json` |

> This section is generated by `scripts/sync-native-artifacts.mjs`.
> Android adapter switch-over is active (artifact coordinates only). iOS adapter switch-over is active (remote Swift package + exact pinning).
<!-- NATIVE_ARTIFACTS:END -->
