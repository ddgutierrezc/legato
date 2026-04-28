# Publication Pipeline V2 — Cross-Platform Execution

This runbook defines the v2 control plane in `.github/workflows/release-control.yml`.

## Scope and authority

- Android publish authority remains `.github/workflows/release-android.yml` with `release` environment approval.
- iOS publish authority is CI-owned and scoped to the distribution repository (`legato-ios-core`) via GitHub App token.
- npm `protected-publish` uses npm Trusted Publishing (OIDC) from GitHub Actions, performs real `npm publish --access public`, and verifies release visibility with `npm view`.
- All selected lanes use one immutable `release_id` and produce a single terminal summary.
- Canonical cross-platform communication authority is `legato`; `legato-ios-core` is derivative communication except for immutable iOS distribution facts.

Governance references:

- `docs/releases/release-communication-governance-v1.md`
- `docs/releases/release-notes-policy-v1.md`
- `docs/releases/reconciliation-stop-the-line-rules-v1.md`
- `docs/releases/contracts/android-deploy-procedure-contract-v1.md`
- `docs/releases/contracts/npm-deploy-procedure-contract-v1.md`
- `docs/releases/contracts/ios-distribution-deploy-procedure-contract-v1.md`
- `docs/releases/contracts/future-release-skill-io-contract-v1.md`
- `docs/releases/templates/release-note-template-governance-v1.md`
- `docs/releases/templates/ios-derivative-release-template.md`

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

Deterministic gate before lane fanout:

- `release-execution-packet/v1` is materialized first at `apps/capacitor-demo/artifacts/release-control/<release_id>/release-execution-packet.json`.
- `release-preflight-completeness.mjs` runs after dispatch validation and before Android/iOS/npm fanout.
- Gate artifact: `apps/capacitor-demo/artifacts/release-control/<release_id>/preflight.json`
- Fanout hard-blocks unless `preflight.ok === true`.

## Preflight completeness contract

Required run-level checks:

- Narrative file exists: `docs/releases/notes/<release_id>.json`
- Changelog anchor format is canonical: `CHANGELOG.md#r-...`

Lane-scoped checks:

- iOS selected: `docs/releases/notes/<release_id>-ios-derivative.md` is required.
- npm selected: `npm_package_target` must be `capacitor|contract`.

Reason-coded diagnostics emitted by preflight/retry paths:

| Reason code | Meaning | Retryable | Operator action |
|---|---|---|---|
| `PATH_OR_CWD` | Repo root/path resolution failed. | No | Run from repo root or pass explicit `--repo-root`. |
| `SERIALIZATION_ERROR` | JSON payload malformed/unsafe for aggregation. | No | Fix payload source (summary/facts) before rerun. |
| `PACKAGE_TARGET_SCOPE` | npm package target out of allowed scope. | No | Use `npm_package_target=capacitor|contract`. |
| `MISSING_RELEASE_PACKET` | The release execution packet is missing before gate execution. | No | Regenerate `release-execution-packet/v1` and rerun. |
| `MISSING_REQUIRED_INPUT` | Required packet input reference is missing. | No | Fill packet refs (`narrative_ref`, `changelog_anchor`, lane refs) and rerun. |
| `MISSING_NARRATIVE_OR_DERIVATIVE_NOTES` | Required narrative/derivative note file is missing. | No | Author required notes from templates, then rerun. |
| `DERIVATIVE_BACKLINK_DRIFT` | iOS derivative note is missing canonical backlinks. | No | Restore canonical release/changelog backlink fields. |
| `CANONICAL_AUTHORITY_DRIFT` | Facts contradict canonical authority ownership. | No | Reconcile authority metadata and release notes before publish. |
| `MISSING_DURABLE_EVIDENCE` | Claimed publish lacks durable evidence URLs/paths. | No | Attach durable evidence and rerun reconciliation. |
| `STALE_HEAD` | Closeout head is stale against expected head. | No | Fetch/rebase and regenerate fresh mixed evidence. |
| `NON_FAST_FORWARD_HEAD` | Branch state is diverged/non-fast-forward. | No | Restore fast-forward state and rerun closeout validation. |
| `STEP_ORDER_VIOLATION` | Attempted step execution out of protocol order. | No | Continue from required next step in protocol. |
| `UNKNOWN` | Unclassified release failure class. | No | Inspect lane artifacts and rerun with corrected inputs. |

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

Malformed lane summary payloads fail with `SERIALIZATION_ERROR` before final summary publication.

## Closure bundle artifact

When reconciliation passes, release-control emits one canonical closure bundle:

- `apps/capacitor-demo/artifacts/release-control/<release_id>/closure-bundle.json`
- `apps/capacitor-demo/artifacts/release-control/<release_id>/closure-bundle.md`
- uploaded artifact: `release-closure-bundle-<release_id>`

Mandatory closure fields:

- `schema_version` (`release-closure-bundle/v1`)
- `release_id`
- `source_commit`
- `run_url`
- `reconciliation_verdict`
- `published_artifacts[]`
- `evidence_index_refs[]`
- `generated_at`

Closure links are reference-only; full evidence payload duplication is intentionally out of scope.

## GitHub release notes + changelog contract (v1)

Template and required sections:

- `.github/release-template.md`
- Canonical-vs-derivative template policy: `docs/releases/templates/release-note-template-governance-v1.md`
- iOS derivative template: `docs/releases/templates/ios-derivative-release-template.md`
- Required order: Summary, Highlights, Compatibility Matrix, Installation/Upgrade, Evidence, Known Limitations, Full Changelog Link
- Highlights MUST include required human narrative fields:
  - Why it matters
  - User impact
  - Upgrade notes
  - Breaking changes (or explicit `None`)
  - Affected platforms

Generation and validation commands:

- `npm run release:changelog:facts`
- `npm run release:changelog:update`
- `npm run release:notes:generate`
- `npm run validate:release:reconciliation`
- `npm run release:evidence:persist`

Narrative source file per release:

- `docs/releases/notes/<release_id>.json` (copy from `docs/releases/notes/release-narrative.template.json`)
- `docs/releases/notes/<release_id>-ios-derivative.md` (required when iOS lane is selected; use `docs/releases/templates/ios-derivative-release-template.md`)

Canonical release surfaces that must stay aligned:

- Canonical authority declaration (`legato`) and derivative backlink (`legato-ios-core` -> `legato` release/changelog)

- `CHANGELOG.md`
- GitHub Release body (`release-notes-<release_id>` artifact + release publish step)
- `packages/capacitor/package.json`
- `packages/contract/package.json`
- `packages/capacitor/native-artifacts.json`

Mandatory release communication lifecycle:

Required protocol order: `preflight → publish → reconcile → closeout`.

1. Collect lane summaries (`android`, `ios`, `npm`) and generate `summary.json`.
2. Generate facts (`release:changelog:facts`) including authority metadata and target procedure references.
3. Update canonical changelog entry (`release:changelog:update`) from facts + required human narrative.
4. Render canonical notes (`release:notes:generate`) from facts + required human narrative.
5. Validate reconciliation (`validate:release:reconciliation`) against `CHANGELOG.md`, durable evidence policy, and stop-the-line rules.
6. Persist evidence dossier (`release:evidence:persist`) and publish canonical release surface.
7. Produce closure bundle (`release-closure-bundle.mjs`) with run URL, reconciliation verdict, and evidence index refs.
8. Validate closeout freshness (`validate-release-closeout.mjs`) and persist `fresh-head-closeout.json`.
9. Produce derivative iOS communication using `docs/releases/templates/ios-derivative-release-template.md` with explicit backlinks to canonical `legato` release + changelog anchor.

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

Additional explicit non-goals for release-ops maturity v1:

- No centralized release platform rewrite/replacement.
- No automation that replaces human-authored release narrative ownership.
