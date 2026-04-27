# Reconciliation Stop-the-line Rules v1

## Hard-fail conditions

The reconciliation gate MUST stop release publication when any of the following is true:

1. Missing durable evidence for a selected target.
2. Canonical/derivative drift (authority mismatch or derivative redefining canonical claims).
3. Broken backlinks (derivative note missing canonical release/changelog backlink).
4. Lane/status contradictions (selected lane marked `not_selected` or `incomplete`).
5. Changelog/release factual mismatch (release ID, versions, or source commit drift).

## Reason code mapping

| Reason code | Trigger |
|---|---|
| `MISSING_DURABLE_EVIDENCE` | selected target lacks required durable evidence class |
| `CANONICAL_AUTHORITY_DRIFT` | `facts.authority` conflicts with governance contract |
| `BROKEN_DERIVATIVE_BACKLINK` | derivative release note missing canonical release/changelog backlink |
| `LANE_STATUS_CONTRADICTION` | selected target reports incompatible terminal status |
| `RECONCILIATION_VERSION_DRIFT` | release notes/changelog do not match facts |

## Evidence requirements for closure

- reconciliation report artifact (`reconciliation-report.json`)
- canonical release markdown artifact (`github-release.md`)
- summary artifact (`summary.json`)
- evidence index (`docs/releases/evidence-index/<release_id>.json`)
