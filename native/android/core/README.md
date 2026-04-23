# Legato Android Native Core (Runtime-Seam MVP)

This directory contains the Android native core and runtime integration seams for Legato.

Current scope includes:
- canonical queue/state/snapshot/event behavior,
- manager scaffolding for session + remote command integration,
- explicit runtime adapters/seams for playback/session/remote surfaces,
- typed interruption + audio-focus policy contract surfaces (Milestone 1 groundwork only).

Out of scope for this pass:
- full Media3/ExoPlayer runtime binding,
- complete Android AudioFocus/MediaSession lifecycle behavior,
- production-grade background playback behavior.

The default runtime adapters are intentionally no-op/in-memory and exist to define stable integration boundaries.

## Milestone 1 contract note

Android session interruption/audio-focus surfaces in this module are contract seams only.
They are intentionally no-op and DO NOT provide full Media3 audio-focus/background parity yet.

## Gradle module bootstrap

`native/android/core` is now an Android library module (`com.android.library` + Kotlin Android)
with namespace `io.legato.core`, `compileSdk 34`, `minSdk 24`, and Java/Kotlin 17.

Historically this module was wired into `@legato/capacitor` through the monorepo-local Gradle path:

`project(':native:android:core')`

That local-path coupling is no longer the target architecture. The current direction is artifact-based distribution (Maven/AAR publication) so host adapters consume versioned native artifacts instead of monorepo-only project references.

## Dependency composition

This module currently uses **manual composition + constructor injection**, not a DI container like Koin.

The canonical composition root is:

- `LegatoAndroidCoreDependencies`
- `LegatoAndroidCoreFactory.create(...)`

That is the current project standard unless the graph grows enough to justify a dedicated container.
