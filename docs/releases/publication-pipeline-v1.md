# Publication Pipeline V1 — Release Runbook

This runbook is the release boundary for change `publication-pipeline-v1`.

## Scope Boundary

- Android distribution target in v1 is Maven Central.
- iOS distribution strategy is a remote Swift package (`legato-ios-core`), but publication remains manual in this milestone.
- **Do not implement automated iOS publication in this v1 milestone.**

## Validation Evidence Closeout (local readiness gates)

Run from `apps/capacitor-demo` in this order:

```bash
npm run release:android:preflight
npm run release:android:publish
npm run release:android:verify
IOS_RELEASE_TAG=v0.1.0 npm run release:ios:preflight
npm run release:scope:check
```

- `release:android:publish` is expected to fail without maintainer credentials; this is the intended secret boundary.
- `release:android:verify` is expected to fail until a real Maven Central release exists.
- `release:scope:check` confirms v1 namespace migration stayed inside publication-scope files.

Captured command outputs for this batch are recorded in [`publication-pipeline-v1-validation.md`](./publication-pipeline-v1-validation.md).

## iOS Preflight (automatable)

Run from `apps/capacitor-demo`:

```bash
IOS_RELEASE_TAG=v0.1.0 npm run release:ios:preflight
```

This preflight validates the iOS release identity contract before any manual handoff:

1. `packages/capacitor/native-artifacts.json`
   - `ios.packageUrl`
   - `ios.packageName`
   - `ios.product`
   - `ios.version`
   - `ios.versionPolicy` (`exact`)
2. `native/ios/LegatoCore/Package.swift`
   - package `name` matches contract package name
   - `.library(name: ...)` includes the expected product
3. `packages/capacitor/Package.swift`
   - managed native-artifacts block matches iOS contract fields
   - remote SwiftPM dependency URL + `exact` version align with contract
   - plugin `.product(name:, package:)` for `LegatoCore` matches contract identity
4. Release tag readiness
   - `--release-tag` (or `IOS_RELEASE_TAG`) must match contract version (`vX.Y.Z` ↔ `X.Y.Z`)

Expected successful summary:

- `Mode: ios-preflight`
- `Overall: PASS`
- `Manual handoff ready: YES`

## Manual Handoff (non-automated in v1)

After preflight is PASS, hand off manually to the `legato-ios-core` maintainers/repo owners:

1. Create/push the release tag in `legato-ios-core` using approved maintainer credentials.
2. Publish the Swift package release in the remote repository.
3. Confirm release notes and ownership policy compliance.

Manual responsibilities stay outside this repo by design:

- tag authority and protected branch/release permissions
- remote secret/token ownership
- publication approvals in external systems

## Runbook Checklist Artifact

Attach this checklist in the PR/release ticket before manual iOS handoff:

| Item | Evidence |
|---|---|
| Release tag submitted to preflight | Tag value used in command (example: `v0.1.0`) |
| Preflight summary output | Captured terminal output showing `Overall: PASS` |
| Link/path to the output attached in PR | Relative path or CI artifact URL |
| Manual handoff confirmation | Comment/checklist note naming maintainer + handoff timestamp |

If any checklist item is missing, iOS manual handoff is blocked.
