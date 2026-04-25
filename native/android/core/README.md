# Legato Android Native Core (Runtime + Integrity v1)

This directory contains the Android native core and runtime integration seams for Legato.

Current scope includes:
- canonical queue/state/snapshot/event behavior,
- manager/runtime integration for session + remote command surfaces,
- explicit runtime adapters/seams for playback/session/remote surfaces,
- typed interruption + audio-focus policy surfaces wired through canonical interruption signals.

Out of scope for this pass:
- process-death restoration/persistent queue recovery,
- broad Android lifecycle/OEM matrix hardening,
- cross-platform parity expansion beyond Android runtime integrity closure.

Deferred scope is tracked under follow-up milestones (`android-background-lifecycle-v1` and parity tracks) rather than this runtime-v1 integrity pass.

The module ships a real Media3 runtime path and also keeps default no-op adapters for explicit seam tests.

## Runtime-v1 interruption contract

- Focus loss (`AUDIOFOCUS_LOSS`, `AUDIOFOCUS_LOSS_TRANSIENT`, `AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK`) and becoming noisy signals pause playback with interruption pause origin.
- Focus gain does **not** auto-resume playback in v1.
- Service/app adapters ingest Android callbacks and forward canonical interruption signals to the session runtime.

## Gradle module bootstrap

`native/android/core` is now an Android library module (`com.android.library` + Kotlin Android)
with namespace `io.legato.core`, `compileSdk 34`, `minSdk 24`, and Java/Kotlin 17.

Historically this module was wired into `@ddgutierrezc/legato-capacitor` through the monorepo-local Gradle path:

`project(':native:android:core')`

That local-path coupling is no longer the target architecture. The current direction is artifact-based distribution (Maven/AAR publication) so host adapters consume versioned native artifacts instead of monorepo-only project references.

## Dependency composition

This module currently uses **manual composition + constructor injection**, not a DI container like Koin.

The canonical composition root is:

- `LegatoAndroidCoreDependencies`
- `LegatoAndroidCoreFactory.create(...)`

That is the current project standard unless the graph grows enough to justify a dedicated container.
