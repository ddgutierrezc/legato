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
- Android background playback/service wiring is groundwork-only in Milestone 1 (contract + stub service), not production parity.

## Local repo integration notes

- Package exports currently point to `src/` for local monorepo/demo consumption (no `dist/` build required for wiring).
- `@legato/contract` is a peer dependency and should be installed by host apps.
- This package is currently optimized for in-repo integration, not publish-ready distribution workflows.

## iOS Swift Package Manager integration

This package now includes a root `Package.swift` for Capacitor iOS SPM hosts.

- Package name/product: `CapacitorLegato`
- Plugin target: `LegatoPlugin`
- Transitive native dependency: `LegatoCore` (resolved via relative local-monorepo path in `Package.swift`)

When this package is consumed by Capacitor-generated iOS SPM integration, the expected product name is `CapacitorLegato`.

To keep iOS SPM integration clean and compatible with `npx cap sync ios` generated files:

- Do not modify `ios/App/CapApp-SPM` generated sources/packages.
- The plugin package itself provides the standard Capacitor SPM linkage shape (`Capacitor` + `Cordova`) through the `CapacitorLegato` product so `npx cap sync ios` generated wiring can remain the source of truth.

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
