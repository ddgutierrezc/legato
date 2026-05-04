# @ddgutierrezc/legato-react-native

Expo Modules binding package for Legato host apps.

## Status

- Milestone 1 verified on iOS and Android Expo dev-build hosts.
- Intended for Expo prebuild / development builds.
- Expo Go is not supported for native playback validation.

## Expo config plugin (milestone 1 baseline)

Add `"@ddgutierrezc/legato-react-native"` to your Expo plugins list to enable baseline native wiring during prebuild.

```json
{
  "expo": {
    "plugins": ["@ddgutierrezc/legato-react-native"]
  }
}
```

### What this plugin automates

- Automates native baseline wiring for Expo prebuild/dev-build hosts.
- iOS: ensures `UIBackgroundModes` includes `audio` exactly once.
- Android: ensures foreground-service permissions and a valid `expo.modules.legato.LegatoPlaybackService` manifest declaration.

### Milestone-1 option surface

- Use the plugin as a plain string entry: `"@ddgutierrezc/legato-react-native"`.
- Milestone 1 does not expose advanced option knobs (no custom channels, no service class overrides, no arbitrary plist/manifest patch options).

### What this plugin does NOT automate

- Does not automate runtime playback orchestration (you still call runtime APIs in app code).
- Does not automate lifecycle handling policy (you still register lifecycle listeners and validate behavior in your app).
- Does not guarantee OEM-specific background reliability beyond baseline native wiring.

### Host boundary

- Expo Go is not supported for native playback validation.
- Supported host for this claim is Expo dev build generated via `expo prebuild` and run with `expo run:ios` / `expo run:android`.

## Installation

Install the package together with the published contract package:

```bash
npm install @ddgutierrezc/legato-react-native @ddgutierrezc/legato-contract
```

Add the Expo plugin to your app config:

```json
{
  "expo": {
    "plugins": ["@ddgutierrezc/legato-react-native"]
  }
}
```

Then regenerate native projects and run the host app:

```bash
npx expo prebuild --clean
npx expo run:ios
npx expo run:android
```

## What remains app-owned

- runtime playback orchestration in app code
- lifecycle policy and listener integration
- app-specific UX around playback notifications and interruptions
- validation on your target devices and OEMs

## Capacitor parity mapping

This milestone aligns the React Native package to the same baseline surface used by `@ddgutierrezc/legato-capacitor`.

| Capacitor baseline export | React Native export | Notes |
|---|---|---|
| `audioPlayer` | `audioPlayer` | Command/query parity target for setup, queue mutation, transport, and snapshot queries. |
| `mediaSession` | `mediaSession` | Remote command listener parity target. |
| `Legato` | `Legato` | Unified facade parity target across player + media session. |
| `AUDIO_PLAYER_EVENTS` / `MEDIA_SESSION_EVENTS` / `LEGATO_EVENTS` | same names | Event constants and listener tuple parity. |
| `createLegatoSync` / `createAudioPlayerSync` | same names | Snapshot-first sync semantics (`start()` resync then subscribe). |

## In-scope vs out-of-scope boundaries

In-scope for `expo-react-native-parity-v1`:

- Baseline API shape parity with Capacitor exports.
- Public type strictness for parity-covered inputs/outputs/events.
- Runtime semantics parity evidence in Expo dev-build hosts (iOS + Android).

Out-of-scope for this milestone:

- New product features not present in Capacitor baseline.
- Expo Go runtime parity claims.
- OEM/device-specific reliability guarantees beyond baseline host proof.

## Troubleshooting parity validation

- **Host mismatch**: Ensure validation runs in Expo dev builds only (`expo prebuild`, `expo run:ios`, `expo run:android`). Expo Go is not supported for native playback parity claims.
- **Missing evidence**: Complete all required artifacts in `docs/evidence/parity-readiness-checklist.md` before claiming parity.
- **Unexpected behavior gaps**: Record the mismatch and disposition in the evidence checklist; parity claim must stay blocked until disposition is resolved.

## Package contents

- Expo config plugin export via `app.plugin.js`
- JavaScript binding surface under `build/**`
- iOS native module file `ios/LegatoModule.swift`
- CocoaPods spec `legato-react-native.podspec`
- Android native module and playback service scaffolding under `android/src/**`

## Repository

- Source: https://github.com/ddgutierrezc/legato/tree/main/packages/react-native
- Issues: https://github.com/ddgutierrezc/legato/issues

## Contributing

Contributions are very welcome! Please refer to guidelines described in the [contributing guide]( https://github.com/expo/expo#contributing).
