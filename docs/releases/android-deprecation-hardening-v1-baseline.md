# Android Deprecation Hardening v1 — Baseline

## Command (pre-change safety net)

`sh ./gradlew :legato-capacitor:testDebugUnitTest --tests io.legato.capacitor.LegatoPlaybackNotificationTransportTest --tests io.legato.capacitor.LegatoPlaybackServiceBootstrapTest`

## Pre-change warning baseline (selected)

- Kotlin Java type mismatch warnings from mapper optional string extraction:
  - `LegatoCapacitorMapper.kt` lines around `optString("type", null)` and optional metadata keys.
- Android platform deprecations in service implementation:
  - `MediaSession.FLAG_HANDLES_MEDIA_BUTTONS`
  - `MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS`
  - `Notification.Builder(context)` pre-O constructor
  - `Notification.Action.Builder(icon, title, intent)` constructor
- Gradle warning during configuration:
  - `flatDir should be avoided because it doesn't support any meta-data formats`

## Post-change spot check (same targeted test command)

- Mapper nullability/type-mismatch warnings were removed from production compile output.
- Service deprecation warnings moved to narrow compatibility helpers with local suppressions.
- Gradle-level `flatDir` warning remains (tracked as known boundary, not changed in v1).
