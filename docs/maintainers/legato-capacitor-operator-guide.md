# Legato Capacitor operator guide

Maintainer-only operational details for `@ddgutierrezc/legato-capacitor`.

## Local repo integration notes

- Publish-facing entrypoints (`main`/`types`/`exports` + `legato` CLI bin) resolve to `dist/**`.
- Build before pack/publish so `dist` is complete (`npm run build` in `packages/capacitor`).
- Tarball readiness checks run via `npm run pack:check` in `packages/capacitor`.
- Cross-package external-consumer validation runs from `apps/capacitor-demo` (`npm run validate:npm:readiness`).

## iOS Swift Package Manager integration

- Package name/product: `DdgutierrezcLegatoCapacitor`.
- Plugin target: `LegatoPlugin`.
- Transitive native dependency: `LegatoCore` (remote Swift package URL + exact version in `Package.swift`).

### iOS host polish v1 scope contract

This maintainer contract covers **package-specific iOS integration/onboarding/guardrails only**.

Explicit non-goals:

- no generic bundle-ID ownership workflow
- no signing/provisioning automation
- no provisioning-profile lifecycle ownership

Safety boundary:

- Never hand-edit `apps/capacitor-demo/ios/App/CapApp-SPM/Package.swift`.
- Regenerate generated iOS package wiring only through `npm run cap:sync` (or `npx cap sync ios`).
- After sync, re-check generated surfaces (`CapApp-SPM/Package.swift`, `ios/App/App/capacitor.config.json`) before trusting host wiring state.

## Native setup CLI (repo-owned maintainer CLI)

This package ships the `legato` command for repository maintenance workflows.

Supported commands:

- `legato native doctor`
- `legato native configure --dry-run`
- `legato native configure --apply`

Ownership/safety boundaries:

- Repo-owned maintainer CLI, not a general consumer bootstrap CLI.
- Does not mutate Capacitor-generated files (`ios/App/CapApp-SPM/**`).
- `--apply` is conservative and may report `SKIP` for unsupported file shapes.

## Native artifact distribution contract

| Platform | Policy | Source of truth |
|---|---|---|
| Android | Maven Central coordinate `dev.dgutierrez:legato-android-core:0.1.1` | `packages/capacitor/native-artifacts.json` |
| iOS | SwiftPM remote package `LegatoCore` pinned with `exact(0.1.1)` | `packages/capacitor/native-artifacts.json` |

## Consumer-facing docs

- Package onboarding: [`../../packages/capacitor/README.md`](../../packages/capacitor/README.md)
- Scope boundaries: [`./package-documentation-foundation-v1-scope.md`](./package-documentation-foundation-v1-scope.md)
