# Expo Prebuild Diff Checklist — Legato Config Plugin

Use this checklist to validate that adding `"@ddgutierrezc/legato-react-native"` produced the expected native host wiring.

## Scope

- Host app: `apps/expo-demo`
- Command baseline: `expo prebuild --clean`
- Validation target: generated `ios/` and `android/` native output

## Evidence Metadata

- Date/time:
- Reviewer:
- Branch/commit:
- Plugin entry in `app.json` confirmed:

## iOS Diff Gate (Info.plist)

- [ ] `ios/**/Info.plist` contains `UIBackgroundModes` key.
- [ ] `UIBackgroundModes` includes `audio`.
- [ ] `audio` appears exactly once after repeated prebuilds (idempotent).
- [ ] No unrelated plist keys were removed by plugin mutation.
- Evidence links (diff/snippets/screenshots):

## Android Diff Gate (AndroidManifest.xml)

- [ ] `android/app/src/main/AndroidManifest.xml` includes permission `android.permission.FOREGROUND_SERVICE`.
- [ ] `android/app/src/main/AndroidManifest.xml` includes permission `android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK`.
- [ ] `android/app/src/main/AndroidManifest.xml` includes permission `android.permission.WAKE_LOCK`.
- [ ] Exactly one `<service android:name="expo.modules.legato.LegatoPlaybackService" ... />` remains after normalization.
- [ ] Service has `android:exported="false"`.
- [ ] Service has `android:foregroundServiceType="mediaPlayback"`.
- [ ] Unrelated service declarations remain intact.
- Evidence links (diff/snippets/screenshots):

## Runtime Boundary Confirmation

- [ ] Validation notes state plugin only automates build-time native wiring.
- [ ] Validation notes state runtime playback API calls remain app-owned.
- [ ] Validation notes state lifecycle listener registration remains app-owned.
- [ ] Validation notes state Expo Go is excluded from native runtime proof.

## Outcome

- [ ] PASS — all gates satisfied
- [ ] FAIL — unresolved items listed with owner and follow-up issue

## Follow-up Notes

-
