# iOS host prep status (`apps/capacitor-demo/ios`)

This folder was scaffolded with:

```bash
npx cap add ios
```

## What is ready

- Xcode host app scaffold exists (`App/App.xcodeproj`).
- Capacitor iOS shell files are in place.
- Plugin class list includes `LegatoPlugin` in `App/App/capacitor.config.json`.

## Wiring model (current)

This host should rely on Capacitor CLI-generated SPM integration only (`App/CapApp-SPM/Package.swift`).
Never hand-edit `App/CapApp-SPM/Package.swift`; regenerate it with `npm run cap:sync`.

Before the first real iOS smoke attempt, do this in Xcode:

1. Open `ios/App/App.xcodeproj`.
2. Confirm target `App` links `CapApp-SPM` only (no extra manual local package reference to `../../../../packages/capacitor`).
3. If present, remove direct `LegatoCore` target linkage; `LegatoCore` must remain transitive via the plugin package.

## Notes

- Capacitor CLI-managed SPM package (`CapApp-SPM`) remains as generated and owns plugin package inclusion.
- The plugin package product expected by generated SPM integration is `CapacitorLegato`.
