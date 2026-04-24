# Publication Pipeline V2 — Cross-Platform Execution

This runbook defines the v2 control plane in `.github/workflows/release-control.yml`.

## Scope and authority

- Android publish authority remains `.github/workflows/release-android.yml` with `release` environment approval.
- iOS publish authority is CI-owned and scoped to the distribution repository (`legato-ios-core`) via GitHub App token.
- npm `protected-publish` performs real `npm publish --provenance` and verifies release visibility with `npm view`.
- All selected lanes use one immutable `release_id` and produce a single terminal summary.

## Dispatch contract

Required inputs:

| Input | Allowed values | Purpose |
|---|---|---|
| `release_id` | string | Shared release identifier for Android/iOS/npm lanes |
| `targets` | `android,ios,npm` subset | Lane fanout selection |
| `target_modes` | `target=mode` pairs | Explicit lane mode contract |

Allowed modes:

- Android: `preflight-only`, `publish`
- iOS: `publish`
- npm: `readiness`, `release-candidate`, `protected-publish`

Any unsupported mode is rejected preflight by `release-control-contract.mjs` before lane execution.

## iOS publish transaction (CI-owned)

The iOS lane runs a deterministic transaction:

1. `release:ios:preflight`
2. `release:ios:publish` (`release-ios-execution.mjs publish`)
3. Cross-repo checkout on distribution repo/ref
4. Apply payload generated from `promote-ios-distribution.mjs`
5. Commit only when diff exists
6. Immutable tag guard (`already_published` when tag exists)
7. Push branch and tag
8. Verify remote tag and SwiftPM resolution

Terminal states:

- `published`
- `already_published`
- `blocked`
- `failed`
- `not_selected`

## npm protected publish lane

`release-npm.yml` keeps readiness/policy checks and delegates protected execution to `release-npm-execution.mjs`.

- publish command: `npm publish --provenance`
- verification: `npm view <name>@<version> version --json`
- fail-closed behavior: registry rejection maps lane to `failed` with artifact reference.

## Aggregated summary

Artifact: `release-control-summary-<release_id>`

Files:

- `android-summary.json`
- `ios-summary.json`
- `npm-summary.json`
- `summary.json`
- `summary.md`

Run-level outcomes:

- `success`
- `partial_success`
- `failed`

## Evidence checklist (per release_id)

- Android lane evidence artifact
- iOS publish artifact (`publish.json` + `ios-summary.json`)
- npm policy/execution evidence (`summary.json` + `publish.json` when protected)
- Aggregated `summary.json` and `summary.md`

## Protected canary rollout

1. iOS-only canary (`targets=ios`, `ios=publish`)
2. npm-only canary (`targets=npm`, `npm=protected-publish`)
3. Mixed run (`targets=android,ios,npm`) after both single-lane canaries pass

Record run URLs and artifact links in release closure notes.
