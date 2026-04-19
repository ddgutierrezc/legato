# Legato Android Native Core (Runtime-Seam MVP)

This directory contains the Android native core and runtime integration seams for Legato.

Current scope includes:
- canonical queue/state/snapshot/event behavior,
- manager scaffolding for session + remote command integration,
- explicit runtime adapters/seams for playback/session/remote surfaces.

Out of scope for this pass:
- full Media3/ExoPlayer runtime binding,
- complete Android AudioFocus/MediaSession lifecycle behavior,
- production-grade background playback behavior.

The default runtime adapters are intentionally no-op/in-memory and exist to define stable integration boundaries.

## Gradle module bootstrap

`native/android/core` is now an Android library module (`com.android.library` + Kotlin Android)
with namespace `io.legato.core`, `compileSdk 34`, `minSdk 24`, and Java/Kotlin 17.

This keeps it directly referenceable from `@legato/capacitor` via:

`project(':native:android:core')`
