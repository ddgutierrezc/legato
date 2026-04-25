# Task Breakdown v0

## Phase 0
- [x] Create base directory structure.
- [x] Add concise architecture/spec markdown artifacts.

## Phase 1
- [x] Bootstrap `packages/contract`.
- [x] Define/export canonical types for tracks, state, queue, snapshot.
- [x] Define/export canonical errors, event names, capabilities.
- [x] Define/document key invariants/constants.

## Phase 2
- [x] Add Android native core skeleton package layout and placeholder APIs.
- [x] Add iOS native core skeleton source layout and placeholder APIs.
- [x] Establish initial native runtime seam baseline for v0 (later superseded by Android runtime playback implementation/integrity hardening milestones).

## Phase 3
- [x] Replace map/dictionary payload placeholders with typed native DTOs (Android + iOS).
- [x] Implement canonical playback state machine transitions in native cores.
- [x] Implement in-memory snapshot store behavior with v0-aligned empty/default snapshot.
- [x] Implement minimal queue manager semantics (replace/add/clear/current/next/previous).
- [x] Update player engine signatures to typed DTOs from the original v0 seam baseline (runtime playback later implemented on Android).

## Phase 4
- [x] Add Android session/remote manager scaffolding with typed command/metadata seams.
- [x] Add iOS session/now playing/remote manager scaffolding with typed command/metadata seams.
- [x] Wire player engines to session/remote/metadata/progress seams; Android now runs real Media3 runtime playback, while iOS runtime parity remains deferred.

## Phase 4.1
- [x] Add native composition roots/factories for Android and iOS core assembly.
- [x] Keep composition explicit and lightweight for upcoming Capacitor adapter wiring.

## Phase 4.2
- [x] Add Android playback runtime adapter seam and wire player engine transport operations through it.
- [x] Add iOS playback runtime adapter seam and wire player engine transport operations through it.
- [x] Add Android/iOS session + remote + now playing runtime adapter seams with default no-op backends.
- [x] Update native readmes/spec notes to clarify integrated runtime scope and deferred follow-up milestones.

## Deferred
- [ ] Android process-death queue/session restoration hardening (`android-background-lifecycle-v1`).
- [ ] Broad Android background lifecycle + OEM matrix parity hardening (`android-background-lifecycle-v1` follow-ups).
- [ ] iOS runtime parity closure and cross-platform behavior convergence (parity milestone tracks).
- [ ] Framework binding implementations.
- [ ] CI/tooling automation.
