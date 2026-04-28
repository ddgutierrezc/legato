# V1.0.0 Go/No-Go Decision Record

## Verdict: GO

## Decision Date: 2026-04-28

## Release Candidate: 1.0.0-capacitor-core

## Criteria Summary

- Total criteria: 6 (`MUST`: 4, `SHOULD`: 1, `NICE`: 1).
- MUST criteria status: PASS (`RC-01`..`RC-04`).
- Non-MUST status: `RC-05 = PASS`, `RC-06 = BLOCKED` (accepted as post-`1.0.0` roadmap boundary).

## Unresolved Blockers

- No unresolved MUST blockers at this revision.
- `RC-05` is now PASS with fresh candidate-line evidence.
- `RC-06` remains intentionally deferred and is accepted as post-`1.0.0` scope, not a launch blocker.

## Accepted Deferrals

See `docs/releases/v1-release-deferral-register-v1.md`.

## Evidence Index

- `docs/releases/v1-release-criteria-v1.md`
- `docs/releases/v1-release-gap-matrix-v1.md`
- `docs/releases/v1-release-deferral-register-v1.md`
- `docs/releases/publication-pipeline-v2.md`
- `.github/workflows/release-control.yml`
- `docs/releases/release-notes-policy-v1.md`
- `docs/releases/reconciliation-stop-the-line-rules-v1.md`
- `packages/capacitor/README.md`

## Approver Sign-off

- Product owner: `Approved 2026-04-28 — Capacitor-first 1.0.0 scope accepted with explicit limits.`
- Release governance owner: `Approved 2026-04-28 — Canonical/derivative release governance and fail-closed release communication in place.`
- Capacitor maintainer owner: `Approved 2026-04-28 — Current runtime/lifecycle/auth/streaming scope accepted for 1.0.0.`

## Revision History (append-only)

| Timestamp (UTC) | Reason | Changed Fields |
|---|---|---|
| 2026-04-28T00:00:00Z | Initial decision publication from v1 criteria/matrix/deferrals. | Verdict=`NO-GO`, summary, blockers, approvers placeholder. |
| 2026-04-28T00:20:00Z | RC-05 refreshed against current candidate line and no longer blocks confidence. | Criteria summary, blocker rationale. |
| 2026-04-28T00:30:00Z | Owner accepted Capacitor-first 1.0.0 launch scope and explicit post-1.0 deferrals. | Verdict `NO-GO` → `GO`, sign-off, blocker rationale. |
