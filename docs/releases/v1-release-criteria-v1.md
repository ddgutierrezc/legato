# V1.0.0 Release Criteria

Canonical scope: Capacitor-first stable core for `1.0.0`.

## Criteria Table

| ID | Strength | Criterion | Rationale | Evidence Class | Blocks Release |
|---|---|---|---|---|---|
| RC-01 | MUST | Release governance executes with fail-closed protocol order (`preflight → publish → reconcile → closeout`). | Prevents partial/contradictory release communication and lane drift. | Governance runbook + workflow contract | Yes |
| RC-02 | MUST | Public release claims are backed by durable evidence references, with ephemeral artifacts treated as supplemental only. | Protects factual integrity of release notes/changelog. | Policy/governance docs + release runbook | Yes |
| RC-03 | MUST | Capacitor package boundary for `1.0.0` is explicit and does not imply deferred capabilities as delivered. | Avoids over-claiming vs current runtime scope. | Public package README + scope guardrails | Yes |
| RC-04 | MUST | Every PASS claim in the gap matrix includes source references and freshness status (`fresh`, `stale`, `historical-only`). | Decisions must be auditable and current enough for `1.0.0`. | Gap matrix contract | Yes |
| RC-05 | SHOULD | External consumer validation evidence is present for published package adoption path. | Increases confidence that install/sync path works for real consumers. | External validation evidence report | No |
| RC-06 | NICE | Multi-binding roadmap remains documented while `1.0.0` messaging stays Capacitor-first. | Preserves roadmap clarity without expanding `1.0.0` commitments. | Capability map + package README | No |

## Evidence Freshness Policy

- Governance/workflow evidence MUST reference current default branch state (`source_commit` aligned with current `HEAD`).
- Package/runtime evidence MUST reference the candidate release line (or explicitly state candidate mismatch).
- Evidence predating candidate baseline is `stale` or `historical-only` and is non-decisive for MUST-pass sign-off.
- PASS claims are allowed only when source references are present and freshness is explicitly qualified.

## MUST Classification Guardrail

Any newly proposed `MUST` criterion requires source-backed justification to remain `MUST`; otherwise it is downgraded (`SHOULD`/`NICE`) or rejected.
