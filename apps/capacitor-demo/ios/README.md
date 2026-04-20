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

`@legato/capacitor` now provides a Swift package manifest, but this host still needs an explicit Xcode package link for the plugin package.

Before the first real iOS smoke attempt, do this in Xcode:

1. Open `ios/App/App.xcodeproj`.
2. Add local package dependency pointing to:
   - `../../../../packages/capacitor` (relative to `ios/App`), or equivalent absolute path.
3. Ensure product `CapacitorLegato` is linked to target `App` (Frameworks/Libraries).
4. If present, remove direct `LegatoCore` target linkage; `LegatoCore` is transitive through `CapacitorLegato`.

## Notes

- Capacitor CLI-managed SPM package (`CapApp-SPM`) remains as generated; the plugin package link is an additional local dependency in the Xcode project.
- Treat current state as **host prep complete with plugin-package wiring via `CapacitorLegato`**.
