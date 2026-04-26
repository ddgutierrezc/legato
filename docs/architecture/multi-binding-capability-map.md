# Multi-binding capability map (foundation v1)

## Current (implemented)

| Layer | Classification | State | Source path(s) | Evidence note |
|---|---|---|---|---|
| Domain contract (`events`, `errors`, `snapshot`, `capability`) | Reusable Core | Current | `packages/contract/src/events.ts`, `packages/contract/src/errors.ts`, `packages/contract/src/snapshot.ts`, `packages/contract/src/capability.ts` | Canonical shared vocabularies/types are already centralized in `@ddgutierrezc/legato-contract`. |
| Android native composition | Reusable Core | Current | `native/android/core/src/main/kotlin/io/legato/core/core/LegatoAndroidCoreComposition.kt` | Native composition seam exists independently of JS binding transport. |
| iOS native composition | Reusable Core | Current | `native/ios/LegatoCore/Sources/LegatoCore/Core/LegatoiOSCoreComposition.swift` | Native composition seam exists independently of JS binding transport. |
| Capacitor TS binding surface | Binding-Specific Adapter | Current | `packages/capacitor/src/definitions.ts`, `packages/capacitor/src/plugin.ts`, `packages/capacitor/src/events.ts`, `packages/capacitor/src/sync.ts` | Public TS API and adapter glue are Capacitor-specific runtime entrypoints today. |
| Capacitor native bridge (Android + iOS plugin wrappers) | Binding-Specific Adapter | Current | `packages/capacitor/android/src/main/java/io/legato/capacitor/LegatoPlugin.kt`, `packages/capacitor/ios/Sources/LegatoPlugin/LegatoPlugin.swift` | Current runtime transport is implemented through Capacitor plugin bridge files. |
| Demo host harness and release evidence runner | Binding-Specific Adapter | Current | `apps/capacitor-demo/README.md`, `apps/capacitor-demo/scripts/*` | Operational smoke/release validation path is currently Capacitor-host based. |

## Future (planned)

| Layer | Classification | State | Source path(s) | Evidence note |
|---|---|---|---|---|
| Transport-neutral binding contract seam | Reusable Core | Future | `packages/contract/src/binding-adapter.ts` | Contract shape is defined to align adapters; runtime implementations beyond Capacitor are deferred. |
| React Native binding package | Binding-Specific Adapter | Future | `packages/react-native/.gitkeep` | Package scaffold exists, but no runtime adapter implementation is present. |
| Flutter binding package | Binding-Specific Adapter | Future | `packages/flutter/legato/.gitkeep` | Package scaffold exists, but no runtime adapter implementation is present. |

## Reusable vs binding-specific matrix

| Path | Classification | Current/Future | Why |
|---|---|---|---|
| `packages/contract/src/*` | Reusable Core | Current (+ foundation extension) | Shared domain contract for events/errors/snapshot/capabilities and adapter seam primitives. |
| `native/android/core/**` | Reusable Core | Current | Android native composition is transport-independent. |
| `native/ios/LegatoCore/**` | Reusable Core | Current | iOS native composition is transport-independent. |
| `packages/capacitor/**` | Binding-Specific Adapter | Current | Active JS + native bridge adapter shipped to consumers today. |
| `apps/capacitor-demo/**` | Binding-Specific Adapter | Current | Existing host validation harness coupled to Capacitor path. |
| `packages/react-native/.gitkeep` | Binding-Specific Adapter | Future | Placeholder only for future adapter work. |
| `packages/flutter/legato/.gitkeep` | Binding-Specific Adapter | Future | Placeholder only for future adapter work. |
