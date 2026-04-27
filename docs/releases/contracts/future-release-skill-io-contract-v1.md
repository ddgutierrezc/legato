# Future Release Skill I/O Contract v1

## Status

This document defines contract requirements for a **future** release skill. The skill is not implemented in this change.

## Required inputs

- `release_id`
- `facts` (`release-facts.json` including authority + target procedure metadata)
- `narrative` (`docs/releases/notes/<release_id>.json`)
- `lane_summaries` (`android-summary.json`, `ios-summary.json`, `npm-summary.json`, `summary.json`)
- `policy_refs`:
  - `docs/releases/release-communication-governance-v1.md`
  - `docs/releases/release-notes-policy-v1.md`
  - `docs/releases/reconciliation-stop-the-line-rules-v1.md`

## Required outputs

- canonical notes (`github-release.md` + JSON envelope)
- derivative notes (`ios-derivative-release.md` or JSON payload)
- reconciliation report (policy verdicts + error list)
- evidence index references (`docs/releases/evidence-index/<release_id>.json`)

## Behavior contract

- Must separate factual assertions from human narrative content.
- Must fail closed on any stop-the-line rule violation.
- Must emit deterministic reason classes for failure.

### Stop-the-line reason codes

- `MISSING_DURABLE_EVIDENCE`
- `CANONICAL_AUTHORITY_DRIFT`
- `BROKEN_DERIVATIVE_BACKLINK`
- `LANE_STATUS_CONTRADICTION`
- `RECONCILIATION_VERSION_DRIFT`
