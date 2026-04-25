# Android Deprecation Hardening v1 — Scope Guardrails

## In Scope (repo-owned)

- `packages/capacitor/android/src/main/java/io/legato/capacitor/LegatoCapacitorMapper.kt`
- `packages/capacitor/android/src/main/java/io/legato/capacitor/LegatoPlaybackNotificationTransport.kt`
- `packages/capacitor/android/src/main/java/io/legato/capacitor/LegatoPlaybackService.kt`
- `packages/capacitor/android/src/test/kotlin/io/legato/capacitor/LegatoCapacitorMapperTest.kt`
- `packages/capacitor/android/src/test/kotlin/io/legato/capacitor/LegatoPlaybackNotificationTransportTest.kt`
- `packages/capacitor/android/src/test/kotlin/io/legato/capacitor/LegatoPlaybackServiceBootstrapTest.kt`
- `packages/capacitor/android/build.gradle`
- `packages/capacitor/scripts/__tests__/android-build-gradle.test.mjs`
- `apps/capacitor-demo/android/build.gradle`
- `apps/capacitor-demo/android/app/build.gradle`
- `apps/capacitor-demo/scripts/android-gradle-hardening.test.mjs`

## Explicitly Out of Scope

- Media stack migration (no Media3 session migration, no session model rewrite).
- Runtime architecture changes in playback coordinator/core contracts.
- Broad warning suppression that hides unrelated regressions.

## Generated/Managed File Boundaries (do not edit)

- `apps/capacitor-demo/android/app/capacitor.build.gradle`
- `apps/capacitor-demo/android/capacitor.settings.gradle`

## Remaining Known Deprecation/Warning Boundaries

- Gradle still reports deprecations at build level (`--warning-mode all` required for full trace).
- `flatDir` warning remains in demo Android host configuration and Cordova plugin wiring; this is intentionally left unchanged in v1 to avoid Capacitor/Cordova integration churn.
