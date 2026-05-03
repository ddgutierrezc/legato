# Phase 4.2 Dev-Build Evidence Record

Use this template to capture real runtime proof from iOS/Android development builds.

## Required commands

- `expo prebuild`
- `expo run:ios`
- `expo run:android`

## iOS run

- Build/run log: `REPLACE_WITH_IOS_BUILD_LOG_LINK`
- Device/simulator: `REPLACE_WITH_IOS_DEVICE`
- Commit SHA: `REPLACE_WITH_COMMIT_SHA`
- Observed events: `REPLACE_WITH_IOS_EVENT_LOG_LINK`
- Foreground/background resync evidence: `REPLACE_WITH_IOS_RESYNC_LINK`
- Queue mutation snapshot parity evidence: `REPLACE_WITH_IOS_QUEUE_PARITY_LINK`

## Android run

- Build/run log: `REPLACE_WITH_ANDROID_BUILD_LOG_LINK`
- Device/emulator: `REPLACE_WITH_ANDROID_DEVICE`
- Commit SHA: `REPLACE_WITH_COMMIT_SHA`
- Observed events: `REPLACE_WITH_ANDROID_EVENT_LOG_LINK`
- Foreground/background resync evidence: `REPLACE_WITH_ANDROID_RESYNC_LINK`
- Queue mutation snapshot parity evidence: `REPLACE_WITH_ANDROID_QUEUE_PARITY_LINK`

## Reviewer checklist

- [ ] Evidence generated from prebuild + dev-build flow (not Expo Go)
- [ ] iOS runtime proof attached
- [ ] Android runtime proof attached
- [ ] Event delivery and resync verified on both platforms
