# Expo Binding Architecture V1 — Batch 1 Boundary Hardening

This document records milestone-1 preparation gates so the future Expo binding remains contract-first and does not inherit Capacitor-shaped seams.

## Boundary Checklist

Reference contract surface: `packages/contract/src/binding-adapter.ts`.

| Contract capability category | Contract source | Planned Expo-facing API category | Boundary rule | Expo-specific leakage status |
|---|---|---|---|---|
| Setup/init | `BindingAdapter.setup()` | Module bootstrap/setup API | Preserve `SetupOptions` semantics; no Expo host assumptions in shared core. | Allowed in adapter only |
| Playback transport | `play/pause/stop/seekTo/skip*` | Playback command API | Keep async fire-and-observe semantics; no core mutation from Expo JS runtime details. | Allowed in adapter only |
| Queue mutation/query | `add/remove/reset/getQueue/getCurrentTrack` | Queue API | Mutating calls return snapshot parity with contract semantics. | Allowed in adapter only |
| Snapshot/state access | `getState/getPosition/getDuration/getSnapshot` | Snapshot/state query API | Returned shapes remain contract-owned and transport-neutral. | Allowed in adapter only |
| Event delivery | `addListener/removeAllListeners` + `events.ts` names | Event subscription API | Canonical event names and payload shapes must come from contract. | Allowed in adapter only |
| Capability projection | `getCapabilities()` | Capability gating API | Capability flags remain runtime observation only, not entitlement. | Allowed in adapter only |

### Blocked leakage

The following are blocked as Expo-specific leakage into shared native cores (`native/android/core/**`, `native/ios/LegatoCore/**`):

- Expo host lifecycle primitives as core dependencies.
- Expo module registration/autolinking concepts in core interfaces.
- Expo-only error naming or event-name variants that diverge from contract literals.

## Milestone-1 Host Support Matrix

| Host mode | Status (`supported` / `unsupported` / `conditional`) | Why |
|---|---|---|
| Expo prebuild + development build | supported | Required path for custom native playback capabilities. |
| Expo development build without prebuild changes | conditional | Supported only when native module registration and required host config are satisfied. |
| Expo Go | unsupported | Not a target for native-capability validation in milestone 1. |

### New Architecture assumptions

- New Architecture is a baseline planning constraint for milestone 1.
- Any exception is a documented risk, not default behavior.

## Non-Goals Gate

Batch 1 gates keep scope constrained:

- no TurboModule-first requirement;
- no broad non-Expo React Native support claims;
- no host implementation promises (no guarantee of full example app behavior in this batch).

Work that violates these rules is rejected from milestone-1 apply scope.

## Baseline Naming and Package Conventions

Conventions for planned `packages/react-native` surface (contract-first references):

- Package namespace: `@ddgutierrezc/legato-react-native` (placeholder planning name, validated during scaffold batch).
- Export groups mirror contract categories: `setup`, `playback`, `queue`, `snapshot`, `events`, `capabilities`.
- Event names are canonical event names from `packages/contract/src/events.ts` (no Expo-specific event aliases).
- Capability flags are read from the contract capability vocabulary (`packages/contract/src/capability.ts`) and exposed as runtime observations only.
- Error model preserves contract error-code semantics (`packages/contract/src/errors.ts`) without Expo-specific code forks.
