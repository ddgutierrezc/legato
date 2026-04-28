# V1.0.0 Post-1.0 Deferral Register

Only items outside declared `1.0.0` Capacitor-first scope are admissible here.

## Deferrals

| Item | Boundary | Reason | Acceptance Authority | Public Claim Impact | Revisit After |
|---|---|---|---|---|---|
| DRM/license authentication workflows | Outside v1 authenticated media request scope. | Explicitly listed as non-goal in current scope docs. | `docs/architecture/streaming-media-semantics-v1-scope-guardrails.md` | `1.0.0` claims MUST NOT imply DRM support. | `1.1.0` planning |
| Token refresh/rotation + dynamic auth callbacks | Outside static per-track header scope. | Explicitly deferred in package README and scope guardrails. | `packages/capacitor/README.md`; `docs/architecture/streaming-media-semantics-v1-scope-guardrails.md` | Public docs MUST state static headers only for v1. | `1.1.0` planning |
| Process-death restore/relaunch recovery | Outside process-alive lifecycle hardening scope. | Explicit non-goal in iOS runtime/lifecycle boundaries. | `docs/architecture/ios-runtime-playback-v1-scope-guardrails.md`; `packages/capacitor/README.md` | `1.0.0` messaging MUST constrain lifecycle guarantees to process-alive behavior. | `1.1.0` planning |
| React Native adapter runtime package | Not implemented; scaffold only. | Capability map marks adapter as future placeholder. | `docs/architecture/multi-binding-capability-map.md` | `1.0.0` cannot claim React Native runtime support. | adapter spike milestone |
| Flutter adapter runtime package | Not implemented; scaffold only. | Capability map marks adapter as future placeholder. | `docs/architecture/multi-binding-capability-map.md` | `1.0.0` cannot claim Flutter runtime support. | adapter spike milestone |

## Revision History (append-only)

| Timestamp (UTC) | Reason | Changed Fields |
|---|---|---|
| 2026-04-28T00:00:00Z | Initial deferral register publication. | Deferral rows initialized. |
