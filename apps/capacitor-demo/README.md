# Capacitor Demo App (`apps/capacitor-demo`)

Minimal host app to stage the **first real manual smoke path** for `@legato/capacitor`, without pretending playback is already fully integrated.

## Milestone status

### 2026-04-19 — Android smoke passed (real host app)

Validated in Android Capacitor host execution:

- `audioPlayer.setup()` (preferred) and `Legato.setup()` (compatibility)
- `audioPlayer.add()` (preferred) and `Legato.add()` (compatibility)
- `audioPlayer.play()` (preferred) and `Legato.play()` (compatibility)
- `audioPlayer.pause()` (preferred) and `Legato.pause()` (compatibility)
- `Legato.getSnapshot()`
- Snapshot serialization for `queue`, `currentTrack`, and `currentIndex`
- `createAudioPlayerSync()` (preferred) and `createLegatoSync()` (compatibility)

Not validated by this milestone:

- Production-grade playback/runtime behavior (long sessions, interruptions, lifecycle edge cases)
- Background mode correctness and lockscreen/remote control behavior
- Real transport reliability guarantees across devices/OS versions
- iOS host parity

## Smoke objective (namespaced-first, compatibility-aware)

Validate native bridge + snapshot/event plumbing for the minimal flow in `src/main.ts`:

- `audioPlayer.setup()` (preferred)
- `createAudioPlayerSync()` (preferred)
- `addAudioPlayerListener('playback-*', ...)` (preferred)
- `addMediaSessionListener('remote-*', ...)` (preferred)
- `audioPlayer.add()` / `audioPlayer.play()` / `audioPlayer.pause()` / `audioPlayer.getSnapshot()`
- Compatibility validation: equivalent `Legato.*` flow remains available and unchanged

This is a **native smoke** (Android/iOS host), not a browser-only check.

## Smoke automation (v1, smoke-only)

This repository now includes a smoke report collector + validator pipeline for Android and iOS.

- Do not broaden this automation beyond `smoke` in v1.
- The manual harness is still the primary debugging workflow.
- Automation is meant to make PASS/FAIL artifacts repeatable, not replace interactive debugging controls.

Run from `apps/capacitor-demo` after running the smoke flow in native hosts:

```bash
# 1) Refresh host assets before native test loops
npm run build
npm run cap:sync

# 2) Collect latest smoke marker report from platform logs
npm run collect:smoke:android
npm run collect:smoke:ios

# 3) Validate artifacts with shared PASS/FAIL semantics
npm run validate:smoke:android
npm run validate:smoke:ios
npm run validate:smoke:all
```

`validate:smoke:*` returns:

- exit code `0` only when all supplied artifacts pass schema + check semantics
- non-zero when any artifact fails schema/check/collector expectations

When automation reports FAIL, capture logs/events/snapshot from the harness panel and continue diagnosis manually.

## Remote transport richness v2 validation

Harness now supports both one-click smoke and manual controls for:

- `setup`, `sync.start`, `sync.stop`
- `add`, `play`, `pause`, `stop`, `skipToPrevious`, `skipToNext`, `seekTo`, `getSnapshot`
- copy-friendly recent events + raw log + snapshot summary/json
- a compact **Remote parity inspector** summary (state/progress trend/metadata presence/event signals)
- a compact **Capability projection** summary (`canSkipNext`, `canSkipPrevious`, `canSeek`, queue/index)

Default fixtures now include title/artist/album/artwork/duration metadata and direct samplelib MP3 URLs (no redirect links) to keep playback behavior deterministic during native checks.

Before opening Android Studio/Xcode after harness changes, ALWAYS refresh native hosts:

```bash
npm run build
npm run cap:sync
```

Manual parity checklist to close milestone validation:

1. Run guided button `Case: remote pause parity` (it auto-baselines and waits for remote pause).
2. Run guided button `Case: remote play resume parity` (it auto-baselines paused state and waits for remote play).
3. Run guided button `Case: remote next/previous parity` and complete both prompts.
4. Run guided button `Case: remote seek parity` and seek to a clearly different position when prompted.
5. Verify now-playing surfaces show title/artist/album/artwork/duration from fixture metadata.
6. Run `Run API boundary validation` to keep Legato/audioPlayer/mediaSession boundary coverage current.
7. Validate capability projection summary: mid-queue enables next/previous, first track disables previous, ended disables all (`canSkipNext=false`, `canSkipPrevious=false`, `canSeek=false`).
8. Run `Run artwork race` and confirm no stale artwork survives rapid track switches/fallback.
9. (Android lifecycle carry-over) `stop()` + idle tears down foreground service/notification.

## Quick smoke checklist (manual, lightweight)

> Commands below are from `apps/capacitor-demo`.

1. Install deps

```bash
npm install
```

2. Build web assets required by Capacitor sync

```bash
npm run build
```

3. Create native shells (first time only)

```bash
npm run cap:add:android
npm run cap:add:ios
```

4. Sync Capacitor

```bash
npm run cap:sync
```

5. Open native project

```bash
npm run cap:open:android
# or
npm run cap:open:ios
```

6. Run app on device/simulator and press **Run minimal flow**.

## Expected vs not expected (be honest)

### Expected now

- App boots in native host and plugin is callable.
- Demo button runs without web-bridge confusion (browser preview keeps button disabled).
- Log shows progress for setup/snapshot/queue-related calls, or a concrete native wiring error.

### Not expected yet

- Guaranteed audible playback.
- Production-grade runtime behavior (stable progress ticks, lockscreen/remote controls, background lifecycle correctness).
- Complete ExoPlayer/AVPlayer parity.

### 2026-04-19 — iOS host scaffold generated (prep only)

`apps/capacitor-demo/ios` now exists and was generated via `npx cap add ios`.

What this gives us now:

- Real Xcode host project scaffold (`ios/App/App.xcodeproj`)
- Capacitor iOS app shell with bundled web assets (`ios/App/App/public`)
- Plugin registration surface already generated (`ios/App/App/capacitor.config.json` with `LegatoPlugin`)

What this does **not** give us yet:

- Verified iOS smoke execution end-to-end
- Captured iOS smoke logs/evidence for setup/add/play/pause/getSnapshot

## Native linking caveats (current seam status)

### Android

`@legato/capacitor` Android now resolves native core through artifact coordinates declared by the plugin package.

`apps/capacitor-demo/android/settings.gradle` should keep only Capacitor-managed includes (`:app`, `:capacitor-cordova-android-plugins`) plus `apply from: 'capacitor.settings.gradle'`.

Do **not** re-add `include ':native:android:core'` host wiring. If this line appears again, native artifact gate validation must fail.

### iOS

`packages/capacitor/ios/Sources/LegatoPlugin/*.swift` imports `LegatoCore`.

The host iOS app should rely on Capacitor-generated `CapApp-SPM` integration (which includes local `@legato/capacitor`).
The plugin package product name expected by generated SPM integration is `CapacitorLegato`, and `LegatoCore` resolves transitively from that plugin package.
The host target should not keep a duplicate manual local package reference or direct `LegatoCore` linkage.
Never hand-edit `ios/App/CapApp-SPM/Package.swift`; refresh via `npm run cap:sync` instead.

See `ios/README.md` for the minimal iOS package-integration checklist before first iOS smoke.

## Future iOS smoke path (first attempt)

1. Ensure iOS host exists (`npm run cap:add:ios`, already done once in repo).
2. Run `npm run cap:sync` after web asset changes.
3. Open Xcode project (`npm run cap:open:ios`).
4. Ensure `CapApp-SPM` remains the only package wiring for plugin integration in the host target.
5. Ensure there is no duplicate manual package reference to `packages/capacitor` and no direct `LegatoCore` product linked to target `App`.
6. Build/run on simulator/device and trigger **Run minimal flow**.
7. Capture either:
   - successful `setup/add/play/pause/getSnapshot` smoke logs, or
   - concrete compile/runtime error for next iteration.

## Native artifact foundation v1 release gate

Run from `apps/capacitor-demo`:

```bash
# 1) Refresh host assets before any native resolver/smoke checks
npm run build
npm run cap:sync

# 2) Capture dependency-resolution evidence
npm run collect:native:android-resolution
npm run collect:native:ios-resolution

# 3) Capture smoke evidence artifacts
npm run collect:smoke:android
npm run collect:smoke:ios

# 4) Bundle release evidence into manifest + copied artifacts
npm run capture:release:native-artifacts

# 5) Run single PASS/FAIL release gate
npm run validate:release:native-artifacts
```

Gate notes:

- `validate:release:native-artifacts` runs adapter/host native artifact checks and smoke validation from captured evidence.
- Any local-path regression (`project(':native:android:core')`, `.package(path: ...LegatoCore...)`, or manual host wiring) is a hard FAIL.
- Missing evidence files (`android-dependency-resolution.log`, `ios-spm-resolution.log`, smoke reports) is a hard FAIL.

## Helper scripts in this demo

- `npm run smoke:prep` → `build` + `cap:sync`
- `npm run cap:add:android`
- `npm run cap:add:ios`
- `npm run cap:open:android`
- `npm run cap:open:ios`

## Web build resolution note

This demo uses `@legato/capacitor` as a local `file:` dependency and that package currently exports from `src/`.
`vite.config.ts` sets `resolve.preserveSymlinks = true` so imports like `@capacitor/core` and `@legato/contract`
are resolved from `apps/capacitor-demo/node_modules` instead of breaking on monorepo realpaths.
