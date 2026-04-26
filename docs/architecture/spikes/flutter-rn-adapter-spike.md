# Flutter/RN adapter spike plan (post-foundation)

## Purpose

Define entry criteria and success metrics for future Flutter and React Native adapter spikes after foundation v1. This document is planning-only.

This plan does not implement Flutter or React Native runtime adapters in v1.

## Entry criteria

- Binding contract baseline is available at `packages/contract/src/binding-adapter.ts`.
- Current Capacitor adapter remains the only runtime implementation and stays release-safe.
- Guardrails in `docs/architecture/multi-binding-guardrails.md` remain intact.
- Capability map in `docs/architecture/multi-binding-capability-map.md` is accepted as source-backed baseline.

## Assumptions

- Canonical event/error/snapshot vocabulary continues to come from `packages/contract/src/events.ts`, `packages/contract/src/errors.ts`, and `packages/contract/src/snapshot.ts`.
- Native core composition seams stay reusable (`native/android/core/**`, `native/ios/LegatoCore/**`).
- Future bindings can introduce transport-specific glue without altering shared contract semantics.

## Contract conformance checklist

Reference contract: `packages/contract/src/binding-adapter.ts`.

- [ ] Method parity: adapter exposes the same command/query lifecycle surface.
- [ ] Event parity: adapter subscribes with canonical event names and payload typing.
- [ ] Capability parity: adapter reports supported capabilities via contract projection.
- [ ] Error-code parity: adapter error mapping aligns with canonical `LegatoError` code set.
- [ ] Listener lifecycle parity: subscribe/unsubscribe/remove-all semantics are equivalent.

## Success metrics

- Spike artifacts identify binding-specific transport constraints without changing shared contract semantics.
- Gap list is explicit per binding (`implemented`, `blocked`, `deferred`) and source-backed.
- Follow-up runtime scope is decomposed into dedicated changes, not merged into foundation v1.

## Non-goals

- Shipping Flutter runtime adapter in this change.
- Shipping React Native runtime adapter in this change.
- Rewiring release governance or native engine internals.
