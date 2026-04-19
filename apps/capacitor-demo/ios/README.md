# iOS host prep status (`apps/capacitor-demo/ios`)

This folder was scaffolded with:

```bash
npx cap add ios
```

## What is ready

- Xcode host app scaffold exists (`App/App.xcodeproj`).
- Capacitor iOS shell files are in place.
- Plugin class list includes `LegatoPlugin` in `App/App/capacitor.config.json`.

## Manual wiring still required (critical)

`@legato/capacitor` iOS plugin imports `LegatoCore`, but this host is **not auto-linked** to `native/ios/LegatoCore` by default Capacitor sync.

Before the first real iOS smoke attempt, do this in Xcode:

1. Open `ios/App/App.xcodeproj`.
2. Add local package dependency pointing to:
   - `../../../../native/ios/LegatoCore` (relative to `ios/App`), or equivalent absolute path.
3. Ensure product `LegatoCore` is linked to target `App` (Frameworks/Libraries).

## Notes

- During scaffold generation, Capacitor warned: `@legato/capacitor does not have a Package.swift`.
- Treat current state as **host prep complete, smoke pending manual LegatoCore linking**.
