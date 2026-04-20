---
name: capacitor-native-test-harness
description: >
  Keep the Capacitor demo app usable as a native debugging console for playback and plugin integration work.
  Trigger: When native Capacitor/Android/iOS behavior changes and the app-side test UI should be updated to make validation easier.
license: Apache-2.0
compatibility: opencode
metadata:
  author: gentleman-programming
  version: "1.0"
---

## When to Use

- When native playback behavior changes and the demo app should expose new controls or signals
- When a one-click smoke button is no longer enough to validate runtime behavior
- When logs, snapshots, queue editing, or event visibility need to improve for native debugging

## Critical Patterns

- Treat `apps/capacitor-demo` as a plain HTML/TS native test harness, not a polished product UI.
- Always preserve both paths: a one-click smoke flow **and** manual step-by-step controls.
- Prefer separate actions for `setup`, `start sync`, `add`, `play`, `pause`, `stop`, `seekTo`, and `getSnapshot`.
- Keep raw logs copy-friendly (textarea + copy button) and keep recent events/progress visible without opening Xcode logs.
- Show a concise snapshot summary plus raw JSON so state and payloads can be inspected quickly.
- Use direct audio URLs for AVPlayer smoke validation; avoid redirects when testing audible playback.
- When native behavior changes, update the harness in the same change so validation remains easy for the next iteration.
- After UI/demo changes, refresh the native host with `npm run build` + `npm run cap:sync` before testing in Xcode.

## Commands

```bash
cd apps/capacitor-demo
npm run build
npm run cap:sync
open "ios/App/App.xcodeproj"
```

## Resources

- Demo entry files: `apps/capacitor-demo/index.html`, `apps/capacitor-demo/src/main.ts`
- Native host: `apps/capacitor-demo/ios/App`
