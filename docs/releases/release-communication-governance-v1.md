# Release Communication Governance v1

## Decision

- `legato` is the **canonical** authority for cross-platform release communication.
- `legato-ios-core` is **derivative** communication for iOS distribution, except that immutable iOS release tags/assets in `legato-ios-core` remain canonical for distribution publication facts.

## Canonical vs derivative surfaces

| Claim type | Canonical surface | Derivative surface | Rule |
|---|---|---|---|
| Cross-platform narrative and upgrade guidance | `legato` GitHub release + `CHANGELOG.md` | `legato-ios-core` release note | Derivative must backlink to canonical release + changelog anchor |
| npm package versions | `packages/capacitor/package.json`, `packages/contract/package.json` and npm package URLs | Optional mention in derivative iOS note | Derivative cannot redefine versions |
| Android publish status | `.github/workflows/release-android.yml` outputs + Maven URL | Optional mention in derivative iOS note | Derivative cannot redefine Android lane outcome |
| iOS distribution tag publication | `legato-ios-core` release/tag URL | Canonical release may reference the iOS tag URL | `legato` remains canonical for narrative context |

## Required backlink contract

If iOS lane is selected, derivative communication in `legato-ios-core` MUST include:

1. canonical `legato` release URL (`release/<release_id>`)
2. canonical changelog anchor (`CHANGELOG.md#...`)
3. iOS distribution release tag URL in `legato-ios-core`

## Mandatory protocol order

Release execution uses `release-execution-packet/v1` and enforces ordered phases:

`preflight -> publish -> reconcile -> closeout`

Any skip/reorder is a `STEP_ORDER_VIOLATION` and blocks release progression.

## Source references (facts)

- `.github/workflows/release-control.yml`
- `.github/workflows/release-android.yml`
- `.github/workflows/release-npm.yml`
- `apps/capacitor-demo/scripts/release-changelog-facts.mjs`
- `apps/capacitor-demo/scripts/validate-release-reconciliation.mjs`
- `packages/capacitor/native-artifacts.json`
- `packages/capacitor/scripts/promote-ios-distribution.mjs`
