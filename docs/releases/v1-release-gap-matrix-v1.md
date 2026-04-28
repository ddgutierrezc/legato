# V1.0.0 Release Gap Matrix

Candidate reference: `1.0.0-capacitor-core`  
Assessment source commit: `7e0f73e3c8b092d22c3d3d110ec9af6b0fcde028`

## Matrix

| Criterion ID | Status | Evidence References | Freshness | Owner | Action |
|---|---|---|---|---|---|
| RC-01 | PASS | `docs/releases/publication-pipeline-v2.md`; `.github/workflows/release-control.yml` | fresh | release-governance | Keep protocol ordering unchanged for `1.0.0` sign-off. |
| RC-02 | PASS | `docs/releases/release-notes-policy-v1.md`; `docs/releases/reconciliation-stop-the-line-rules-v1.md`; `docs/releases/publication-pipeline-v2.md` | fresh | release-governance | Keep durable-evidence requirement enforced at reconcile/closeout. |
| RC-03 | PASS | `packages/capacitor/README.md`; `docs/architecture/streaming-media-semantics-v1-scope-guardrails.md`; `docs/architecture/ios-runtime-playback-v1-scope-guardrails.md` | fresh | capacitor-maintainers | Keep deferred boundaries explicitly linked from package docs. |
| RC-04 | PASS | `docs/releases/v1-release-gap-matrix-v1.md`; `docs/releases/v1-release-go-no-go-record-v1.md` | fresh | release-governance | Preserve freshness field + source references in every PASS row. |
| RC-05 | PASS | `docs/releases/external-consumer-validation-v2-evidence.md`; `apps/capacitor-demo/artifacts/external-consumer-validation-1.0-candidate/summary.json`; `apps/capacitor-demo/artifacts/external-consumer-validation-1.0-candidate/install-metadata.json` | fresh | release-validation | Keep the candidate-line consumer evidence refreshed whenever the candidate line changes. |
| RC-06 | BLOCKED | `docs/architecture/multi-binding-capability-map.md`; `packages/react-native/.gitkeep`; `packages/flutter/legato/.gitkeep` | fresh | product/architecture | Keep roadmap as post-`1.0.0`; do not advertise non-Capacitor adapters as shipped. |

No PASS claim without source-backed evidence.

## Revision History (append-only)

| Timestamp (UTC) | Reason | Changed Fields |
|---|---|---|
| 2026-04-28T00:00:00Z | Initial `v1` matrix publication. | All rows initialized. |
| 2026-04-28T00:20:00Z | Refreshed RC-05 against current candidate line (`contract@0.1.7`, `capacitor@0.1.11`). | `RC-05`: `GAP` → `PASS`, evidence refs, freshness, action. |
