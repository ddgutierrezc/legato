# Publication Pipeline V1 — Cross-Platform Control Plane

This runbook defines the v1 control plane implemented in `.github/workflows/release-control.yml`.

> Legacy reference: v2 execution runbook lives in [`publication-pipeline-v2.md`](./publication-pipeline-v2.md).

## Scope Boundary

- Android publication is still CI-driven and protected by the existing release environment gates.
- iOS publication action in `legato-ios-core` remains manual/external in v1.
- npm v1 lane is a policy lane (`readiness`, `release-candidate`, `protected-publish`) with explicit intent evidence for protected flows.
- The control plane correlates all selected lanes with one shared `release_id`; it does not pretend all lanes have identical semantics.
- **Do not implement automated iOS publication in this v1 milestone.**

## Workflow Entry Point

Use `.github/workflows/release-control.yml` via **Run workflow** (`workflow_dispatch`).

Required inputs:

| Input | Allowed values | Purpose |
|---|---|---|
| `release_id` | free-form string | One release identifier for Android/iOS/npm evidence correlation. |
| `target` | `android|ios|npm` | Logical target set accepted by contract validation (`targets` input can contain one or many). |
| `targets` | `android|ios|npm` (comma-separated) | Which lanes are selected in this run. |
| `target_modes` | `target=mode` pairs | Explicit per-target mode contract. |

## Target mode contract

- Android modes: `preflight-only`, `publish`
- iOS modes: `preflight`, `handoff`, `verify`, `closeout`, `full-manual-lane`
- npm modes: `readiness`, `release-candidate`, `protected-publish`

Invalid targets or mode/target mismatches fail fast in `validate-dispatch` via `release-control-contract.mjs`.

## Lane boundaries (honest by design)

### Android lane

- Reused through `.github/workflows/release-android.yml` (`workflow_call` + `workflow_dispatch`).
- Publish still requires environment `release` approval.
- Existing preflight → publish → verify safeguards remain unchanged.

### iOS lane

- Runs preflight/handoff/verify/closeout visibility stages.
- If handoff proof inputs are missing, the lane stays `incomplete`/non-published and lists missing evidence.
- Never runs TestFlight/App Store publish actions.
- Lane artifacts live under `artifacts/ios-publication-v1/<release_id>/` (`preflight.json`, `handoff.json`, `verify.json`, `closeout.json`).
- Handoff evidence requires immutable `proofType` + `proofValue`; placeholder values are rejected.

Commands referenced in this repo:

- `release:ios:preflight`
- `release:ios:handoff`
- `release:ios:verify`
- `release:ios:closeout`

### npm lane

- Orchestrated through `.github/workflows/release-npm.yml`.
- Readiness mode runs checks only.
- `protected-publish` requires explicit publish intent evidence before passing policy.

## Aggregated evidence artifacts

The control-plane uploads one final artifact per run:

- `release-control-summary-<release_id>`

Included files:

- `android-summary.json`
- `ios-summary.json`
- `npm-summary.json`
- `summary.json`
- `summary.md`

Lane-specific artifacts remain available (`release-evidence-<release_id>-android`, `release-evidence-<release_id>-ios`, `release-evidence-<release_id>-npm`).

Validation checklist and audit template: [`publication-pipeline-v1-validation.md`](./publication-pipeline-v1-validation.md).
