# Milestone-1 Compatibility and Readiness (Expo Binding)

This document defines what can be claimed today with validated dual-platform runtime proof.

## Policy

- Expo Go is NOT valid runtime evidence for custom native binding behavior.
- Native claims require `expo prebuild` plus both dev-build runs: `expo run:ios` and `expo run:android`.

## Responsibility split

### Plugin-owned automation

- Inject iOS `UIBackgroundModes: ["audio"]` idempotently during prebuild.
- Inject Android baseline permissions for foreground media playback.
- Normalize one valid `expo.modules.legato.LegatoPlaybackService` manifest declaration.

### Developer-owned runtime responsibilities

- Integrate runtime API calls (setup/play/pause/seek/queue operations) in app code.
- Register lifecycle listeners and validate foreground/background/interruption behavior.
- Execute release validation with real host runs and retain evidence links for both platforms.

## Support matrix

| Platform | Host mode | Runtime proof status | Evidence link |
|---|---|---|---|
| iOS | Expo development build (prebuild + run:ios) | runtime proof status: proven | `docs/evidence/phase4-3-expo-host-validation-2026-05-02.md` |
| Android | Expo development build (prebuild + run:android) | runtime proof status: proven | `docs/evidence/phase4-3-expo-host-validation-2026-05-02.md` |
| Expo Go | Not supported for native proof | rejected as native validation evidence | N/A |

## Evidence workflow (execution-oriented)

1. Generate contract baseline:
   - `node ./scripts/phase4-2-dev-build-evidence-contract.mjs`
2. Copy the review template:
   - `packages/react-native/docs/evidence/phase4-2-dev-build-evidence-template.md`
3. Execute real host runs on each platform:
   - `expo prebuild`
   - `expo run:ios`
   - `expo run:android`
4. Attach logs/screenshots/video and replace placeholders with durable links.
5. Keep `runtime proof status: proven` only when both platforms contain real artifacts and reviewer sign-off.
6. Capture prebuild native diff evidence using:
   - `apps/expo-demo/docs/evidence/plugin-prebuild-diff-checklist.md`

## Current status

- Runtime proof is established for iOS/Android in this validation slice; evidence is recorded in `docs/evidence/phase4-3-expo-host-validation-2026-05-02.md`.
- Packaging readiness is normalized to proven runtime status while preserving the Expo Go exclusion policy.
