# Milestone — 2026-04-19 Android Capacitor Smoke

## Scope

First successful end-to-end smoke of `@legato/capacitor` minimal flow inside a **real Android Capacitor host app**.

## Validated

- Setup path executes: `Legato.setup()`
- Queue insert path executes: `Legato.add()`
- Transport commands execute: `Legato.play()` and `Legato.pause()`
- Snapshot read path executes: `Legato.getSnapshot()`
- Snapshot payload serialization confirmed for:
  - `queue`
  - `currentTrack`
  - `currentIndex`
- `createLegatoSync()` helper behavior validated for minimal sync/resync flow

## Explicitly Not Validated

- Production-ready playback behavior
- Background/lifecycle/audio focus correctness
- Lockscreen/remote command runtime behavior
- Cross-device/OS reliability envelope
- iOS host parity
