# Publication Pipeline V2 — Cross-Platform Execution

This runbook defines the v2 control plane in `.github/workflows/release-control.yml`.

## Scope and authority

- Android publish authority remains `.github/workflows/release-android.yml` with `release` environment approval.
- iOS publish authority is CI-owned and scoped to the distribution repository (`legato-ios-core`) via GitHub App token.
- npm `protected-publish` uses npm Trusted Publishing (OIDC) from GitHub Actions, performs real `npm publish --access public`, and verifies release visibility with `npm view`.
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

- trusted publisher source of truth: `release-control.yml` caller + `release-npm.yml` reusable lane
- package selection: `package_target` supports `capacitor` (default) or `contract` and maps publish cwd to `packages/<target>`
- npm CLI requirement: `npm >= 11.5.1`
- publish command: `npm publish --access public`
- authentication: GitHub Actions OIDC (`id-token: write`), no long-lived publish token
- provenance: generated automatically by npm Trusted Publishing for this public package/repository
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

## GitHub release notes + changelog contract (v1)

Template and required sections:

- `.github/release-template.md`
- Required order: Summary, Highlights, Compatibility Matrix, Installation/Upgrade, Evidence, Known Limitations, Full Changelog Link
- Highlights MUST include required human narrative fields:
  - Why it matters
  - User impact
  - Upgrade notes
  - Breaking changes (or explicit `None`)
  - Affected platforms

Generation and validation commands:

- `npm run release:changelog:facts`
- `npm run release:notes:generate`
- `npm run validate:release:reconciliation`
- `npm run release:evidence:persist`

Narrative source file per release:

- `docs/releases/notes/<release_id>.json` (copy from `docs/releases/notes/release-narrative.template.json`)

Canonical release surfaces that must stay aligned:

- `CHANGELOG.md`
- GitHub Release body (`release-notes-<release_id>` artifact + release publish step)
- `packages/capacitor/package.json`
- `packages/contract/package.json`
- `packages/capacitor/native-artifacts.json`

Fail-closed behavior:

- Release publication is blocked when reconciliation detects version drift, missing required sections, or missing durable evidence links.
- Ephemeral artifact URLs are informational only and cannot be the sole support for a factual claim.

Required summary fields for closure traceability:

- `release_id`
- `source_commit` (must equal the commit SHA used for the mixed canary run)
- `overall_status`

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
3. Mixed run (`targets=android,ios,npm`) on latest `HEAD` after CI cleanup and after both single-lane canaries pass

## Pre-canary verification gate

Run this focused guard suite before canary execution:

- `npm run test:release:confidence`

This pre-canary verification gate catches workflow/script/docs drift before operational runs.

## Closure-reconciliation checklist (required before marking done)

1. Compare closure/task claims against the canonical mixed canary evidence.
2. Correct stale or contradictory closure claims before completion.
3. Execute freshness enforcement before sign-off:
   - `npm run release:confidence:fresh-head:check`
   - this command fails closed when closure evidence `source_commit` does not match latest `HEAD`
   - if this gate fails, sign-off remains blocked until a fresh mixed canary is captured from latest `HEAD`
4. Closure notes must include all traceability fields:
   - mixed canary run URL
   - `release-control-summary-<release_id>` artifact link
   - `source_commit`
5. If claims and evidence disagree, closeout remains blocked until reconciled.

Record run URLs and artifact links in release closure notes.

## Scope boundary (non-goal)

Broad `apps/capacitor-demo` typecheck cleanup is a non-goal for this change and stays out of scope unless a specific typecheck error directly blocks release validation or evidence capture.
