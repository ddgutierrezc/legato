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
Do not hand-edit generated files (`apps/capacitor-demo/ios/App/CapApp-SPM/Package.swift`); regenerate them with `npm run cap:sync` (or `npx cap sync ios`).

## Ordered post-sync package checks

After `npm run cap:sync`, run this package-only checklist in order:

1. open `ios/App/App.xcodeproj`.
2. Confirm `CapApp-SPM` remains the source of package wiring for target `App`.
3. remove duplicate manual plugin/local package references (`../../../../packages/capacitor`) if they appear.
4. avoid direct `LegatoCore` host linkage so the dependency stays transitive through the plugin package.
5. Check `App/App/capacitor.config.json` and confirm `packageClassList` contains `LegatoPlugin`.

Out of scope: generic Apple signing/team/provisioning ownership.

## Notes

- Capacitor CLI-managed SPM package (`CapApp-SPM`) remains as generated and owns plugin package inclusion.
- The plugin package product expected by generated SPM integration is `CapacitorLegato`.
