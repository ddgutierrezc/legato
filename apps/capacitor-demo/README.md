# Capacitor Demo App (`apps/capacitor-demo`)

Minimal host app to stage the **first real manual smoke path** for `@legato/capacitor`, without pretending playback is already fully integrated.

## Milestone status

### 2026-04-19 — Android smoke passed (real host app)

Validated in Android Capacitor host execution:

- `Legato.setup()`
- `Legato.add()`
- `Legato.play()`
- `Legato.pause()`
- `Legato.getSnapshot()`
- Snapshot serialization for `queue`, `currentTrack`, and `currentIndex`
- `createLegatoSync()` helper behavior for minimal resync path

Not validated by this milestone:

- Production-grade playback/runtime behavior (long sessions, interruptions, lifecycle edge cases)
- Background mode correctness and lockscreen/remote control behavior
- Real transport reliability guarantees across devices/OS versions
- iOS host parity

## Smoke objective (current)

Validate native bridge + snapshot/event plumbing for the minimal flow in `src/main.ts`:

- `Legato.setup()`
- `createLegatoSync()`
- `Legato.add()`
- `Legato.play()`
- `Legato.pause()`
- `Legato.getSnapshot()`

This is a **native smoke** (Android/iOS host), not a browser-only check.

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

- Automatic `CapacitorLegato` package wiring/linking into the iOS host
- A completed iOS smoke run

## Native linking caveats (current seam status)

### Android

`packages/capacitor/android/build.gradle` depends on:

- `project(':native:android:core')`

Capacitor-generated Android projects do not include that Gradle module by default. This demo host now wires it manually in `apps/capacitor-demo/android/settings.gradle`:

- `include ':native:android:core'`
- `project(':native:android:core').projectDir = new File('../../../native/android/core')`

After creating the Android host, run `npm run cap:sync` (once `dist/` is buildable) so Capacitor regenerates `capacitor.settings.gradle` / `app/capacitor.build.gradle` with the local `@legato/capacitor` plugin include.

### iOS

`packages/capacitor/ios/Sources/LegatoPlugin/*.swift` imports `LegatoCore`.

The host iOS app must manually add local package `packages/capacitor` and link product `CapacitorLegato`.
`LegatoCore` then resolves transitively from the plugin package, so the host target should not keep a direct `LegatoCore` linkage.

See `ios/README.md` for the minimal manual linking checklist before first iOS smoke.

## Future iOS smoke path (first attempt)

1. Ensure iOS host exists (`npm run cap:add:ios`, already done once in repo).
2. Run `npm run cap:sync` after web asset changes.
3. Open Xcode project (`npm run cap:open:ios`).
4. Manually add local Swift package:
   - `packages/capacitor` (from `ios/App` this is `../../../../packages/capacitor`).
5. Link `CapacitorLegato` product to the `App` target.
6. Ensure there is no direct `LegatoCore` product linked to target `App`.
7. Build/run on simulator/device and trigger **Run minimal flow**.
8. Capture either:
   - successful `setup/add/play/pause/getSnapshot` smoke logs, or
   - concrete compile/runtime error for next iteration.

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
