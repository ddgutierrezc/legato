# Milestone-1 Readiness Checklist (Expo Binding)

- FAIL if canonical scaffold shape is modified beyond Expo standalone module roots (`src/`, `android/`, `ios/`, `mocks/`, `expo-module.config.json`, `package.json`).
- FAIL if Jest/wrapper/host validation evidence is missing.
- FAIL if Expo Go-only evidence is used to justify native behavior claims.
- FAIL if Phase 4.1 parity evidence is missing or partial.
- FAIL if Phase 4.2 compatibility/readiness doc is missing or does not declare normalized runtime proof state.
- FAIL if Phase 4.2 evidence record template is missing platform-specific placeholders for iOS/Android proof links.
- FAIL if iOS and Android dev-build runs are both required but only one platform is evidenced.
- FAIL if Phase 4.3 release checklist gate is missing (`node ./scripts/phase4-3-release-readiness-gate.mjs`).
- FAIL if `package.json` does not expose `readiness:phase4.3` script for release gating.
- FAIL if status normalization does not mark runtime proof as `proven` for both iOS and Android when dual-platform evidence exists.
- Config plugin decision record: currently **not required in Batch 2** (autolinking + prebuild defaults are sufficient for this batch).
- FAIL if prebuild native diff checklist is missing or incomplete at `apps/expo-demo/docs/evidence/plugin-prebuild-diff-checklist.md`.

## Required Host Validation Commands

- `expo prebuild`
- `expo run:ios`
- `expo run:android`

## Required Config Plugin Integration Evidence

- Record `expo prebuild --clean` output context and timestamp.
- Info.plist diff expected: `UIBackgroundModes` includes `audio` exactly once.
- AndroidManifest.xml diff expected: permissions `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_MEDIA_PLAYBACK`, `WAKE_LOCK` present.
- AndroidManifest.xml diff expected: one `expo.modules.legato.LegatoPlaybackService` service node with `android:exported="false"` and `android:foregroundServiceType="mediaPlayback"`.
- Evidence path: `apps/expo-demo/docs/evidence/plugin-prebuild-diff-checklist.md`.

## Manual Android conflict resolution

If your app previously added manual manifest edits for `expo.modules.legato.LegatoPlaybackService`, align them to the plugin contract before re-running prebuild:

1. Open `android/app/src/main/AndroidManifest.xml`.
2. Remove duplicate or incompatible `expo.modules.legato.LegatoPlaybackService` entries.
3. Keep exactly one service node for `expo.modules.legato.LegatoPlaybackService`.
4. Ensure the remaining node includes `android:exported="false"`.
5. Ensure the remaining node includes `android:foregroundServiceType="mediaPlayback"`.
6. Re-run `expo prebuild --clean` and confirm the native diff still matches the checklist above.

## Required Smoke Evidence

- Setup/init path works in development build host.
- Playback controls smoke (play/pause/seek).
- One queue mutation returns snapshot shape parity.
- Foreground/background resync evidence captured.

## Phase 4.1 Evidence Scaffold

- Generate baseline scaffold: `node ./scripts/phase4-1-dev-build-parity-evidence.mjs`.
- Record both platform runs (`ios`, `android`) for:
  - event delivery
  - foreground/background resync

## Phase 4.2 Compatibility + Evidence Contract

- Publish compatibility/readiness status in `docs/milestone-1-compatibility-and-readiness.md`.
- Maintain runtime evidence capture template in `docs/evidence/phase4-2-dev-build-evidence-template.md`.
- Keep status normalization as pending/blocked when evidence is incomplete; normalize to proven only after dual-platform evidence is linked.
