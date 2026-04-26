# Multi-binding guardrails (foundation v1)

## Do-not-touch protected paths

This milestone is additive and must not rewire current release/runtime validation layers.

| Protected path | Protection reason | Rule in v1 |
|---|---|---|
| `docs/releases/native-artifact-foundation-v1.md` | Release gate/source-of-truth for native artifact distribution policy | Do not edit as part of this change; use follow-up release changes only. |
| `docs/releases/publication-pipeline-v2.md` | Current publication governance and evidence checklist spine | Do not edit as part of this change; preserve existing release workflow semantics. |
| `apps/capacitor-demo/ios/App/CapApp-SPM/Package.swift` | Generated host wiring for demo iOS shell | Do not manually edit in this milestone. |
| `packages/capacitor/android/**` | Active Android runtime bridge implementation | No runtime behavior rewrites in foundation v1. |
| `packages/capacitor/ios/**` | Active iOS runtime bridge implementation | No runtime behavior rewrites in foundation v1. |
| `native/android/core/**` | Native core engine/composition stability layer | Engine rewrite is out of scope. |
| `native/ios/LegatoCore/**` | Native core engine/composition stability layer | Engine rewrite is out of scope. |

## Scope enforcement

Reject for this change:

- runtime parity implementation for Flutter or React Native
- native engine refactors unrelated to adapter contract foundation
- release-pipeline rewiring or policy changes
- generated host wiring modifications

Accept for this change:

- source-backed architecture docs clarifying reusable vs binding-specific layers
- additive transport-neutral adapter contract type surface
- Capacitor typing alignment that preserves current runtime behavior/API compatibility
