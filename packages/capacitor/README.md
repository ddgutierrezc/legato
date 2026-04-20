# @legato/capacitor

Modern Capacitor binding MVP for Legato.

## API surface (v0)

Commands/queries exposed:

- `setup`, `add`, `remove`, `reset`
- `play`, `pause`, `stop`, `seekTo`
- `skipTo`, `skipToNext`, `skipToPrevious`
- `getState`, `getPosition`, `getDuration`, `getCurrentTrack`, `getQueue`, `getSnapshot`

It also exports typed event helpers aligned with `@legato/contract`, and `createLegatoSync()` for lightweight snapshot/event resync.

## MVP limitations

- Native runtime playback wiring (ExoPlayer/AVPlayer) is still pending in core.
- This binding only bridges the current native core semantics/state/events.
- Behavior is intentionally minimal and contract-first.

## Local repo integration notes

- Package exports currently point to `src/` for local monorepo/demo consumption (no `dist/` build required for wiring).
- `@legato/contract` is a peer dependency and should be installed by host apps.
- This package is currently optimized for in-repo integration, not publish-ready distribution workflows.

## iOS Swift Package Manager integration

This package now includes a root `Package.swift` for Capacitor iOS SPM hosts.

- Package product: `CapacitorLegato`
- Plugin target: `LegatoPlugin`
- Transitive native dependency: `LegatoCore` (resolved from `../../native/ios/LegatoCore` for local monorepo usage)

When adding this package to an iOS host app in Xcode, link product `CapacitorLegato` to the app target.
