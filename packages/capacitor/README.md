# @legato/capacitor

Modern Capacitor binding MVP for Legato.

## API surface (v1 boundary split, additive)

`@legato/capacitor` now exposes three public entry points over the same Capacitor plugin instance:

- `audioPlayer` (playback/queue/seek/read-model commands + playback events)
- `mediaSession` (remote/session-facing event surface)
- `Legato` (legacy compatibility facade composed as `AudioPlayerApi & MediaSessionApi`)

Playback commands/queries (available on `audioPlayer` and legacy `Legato`):

- `setup`, `add`, `remove`, `reset`
- `play`, `pause`, `stop`, `seekTo`
- `skipTo`, `skipToNext`, `skipToPrevious`
- `getState`, `getPosition`, `getDuration`, `getCurrentTrack`, `getQueue`, `getSnapshot`

`mediaSession` is intentionally listener-first in v1 and currently exposes:

- `setup`
- `addListener('remote-*', ...)`
- `removeAllListeners`

This split is additive: existing `Legato` consumers remain source-compatible while new code can adopt namespaced boundaries.

It also exports typed event helpers aligned with `@legato/contract`, and `createLegatoSync()` for lightweight snapshot/event resync.

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

```ts
import {
  addAudioPlayerListener,
  addMediaSessionListener,
  createAudioPlayerSync,
} from '@legato/capacitor';

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

## MVP limitations

- Native runtime playback wiring (ExoPlayer/AVPlayer) is still pending in core.
- This binding only bridges the current native core semantics/state/events.
- Behavior is intentionally minimal and contract-first.
- Android background playback/service wiring is groundwork-only in Milestone 1 (contract + stub service), not production parity.

## Local repo integration notes

- Package exports currently point to `src/` for local monorepo/demo consumption (no `dist/` build required for wiring).
- `@legato/contract` is a peer dependency and should be installed by host apps.
- This package is currently optimized for in-repo integration, not publish-ready distribution workflows.

## iOS Swift Package Manager integration

This package now includes a root `Package.swift` for Capacitor iOS SPM hosts.

- Package name/product: `LegatoCapacitor`
- Plugin target: `LegatoPlugin`
- Transitive native dependency: `LegatoCore` (resolved via remote Swift package URL + exact version pin in `Package.swift`)

When this package is consumed by Capacitor-generated iOS SPM integration, the expected product name is `LegatoCapacitor`.

To keep iOS SPM integration clean and compatible with `npx cap sync ios` generated files:

- Do not modify `ios/App/CapApp-SPM` generated sources/packages.
- The plugin package itself provides the standard Capacitor SPM linkage shape (`Capacitor` + `Cordova`) through the `LegatoCapacitor` product so `npx cap sync ios` generated wiring can remain the source of truth.

### iOS artifact mirror/tag expectations (release)

For `legato-ios-core` distribution, release tags must satisfy these minimum expectations:

- `https://github.com/legato/legato-ios-core.git` contains a valid root `Package.swift` exposing product `LegatoCore`.
- Every version consumed by `@legato/capacitor` is published as an immutable semver tag (example: `0.1.0`).
- `packages/capacitor/native-artifacts.json` remains the single source of truth for the exact iOS version pin.
- Any product/package identity mismatch discovered in SwiftPM resolver logs must block release until fixed.

## Native setup CLI (Milestone 1 foundation)

This package now ships a repo-owned CLI entrypoint: `legato`.

Current supported commands:

- `legato native doctor` → inspect required native host setup, no file writes.
- `legato native configure --dry-run` → print the planned idempotent mutations without applying them.
- `legato native configure --apply` → apply only safe mutations in the supported repo-owned patch set.

Ownership/safety boundaries:

- The CLI never mutates Capacitor-generated artifacts (for example, `ios/App/CapApp-SPM/**`).
- `--apply` is intentionally conservative: unsupported file shapes are reported as `SKIP` for manual review.

Android values used by CLI checks/templates are centralized in:

- `src/cli/android-groundwork-contract.mjs`

This contract currently covers:
- playback service class identity,
- required Android permissions,
- baseline audio-focus policy intent.

It exists to reduce drift across CLI and manifest scaffolding while full runtime parity is still pending.

<!-- NATIVE_ARTIFACTS:BEGIN -->
### Native artifact distribution contract (foundation)

| Platform | Policy | Source of truth |
|---|---|---|
| Android | Maven Central coordinate `dev.dgutierrez:legato-android-core:0.1.0` | `native-artifacts.json` |
| iOS | SwiftPM remote package `LegatoCore` at `https://github.com/legato/legato-ios-core.git` pinned with `exact(0.1.0)` | `native-artifacts.json` |

> This section is generated by `scripts/sync-native-artifacts.mjs`.
> Android adapter switch-over is active (artifact coordinates only). iOS adapter switch-over is active (remote Swift package + exact pinning).
<!-- NATIVE_ARTIFACTS:END -->
