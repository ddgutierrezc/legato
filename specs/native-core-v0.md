# Native Core v0

> Historical spec note: early "no AVPlayer integration yet" wording is superseded by shipped iOS AVPlayer runtime in later milestones (including `ios-runtime-playback-v1`).

## Goal
Establish native core locations and boundaries.

## Structure
- Android core root: `native/android/core/`
- iOS core root: `native/ios/LegatoCore/`

## Responsibilities (future phases)
- Playback engine orchestration
- Queue and transport control
- Audio session/focus handling
- Event emission to bindings

## v0 Scope
- Scaffolding directories only.

## Phase 2 Addendum (Skeleton Only)
- Add native source skeletons under:
  - `native/android/core/src/main/kotlin/...`
  - `native/ios/LegatoCore/Sources/LegatoCore/...`
- Define internal core boundaries for engine, queue, events, snapshot, mapping, errors, and state.
- Keep implementation placeholder-only (TODOs). No ExoPlayer/AVPlayer integration yet.

## Phase 3 Addendum (Semantic Core)
- Replace generic payload placeholders with typed native DTOs aligned to contract v0 (`Track`, queue/snapshot, errors, events).
- Implement canonical playback state-machine transitions in Android and iOS core modules.
- Implement in-memory snapshot stores and queue managers with minimal deterministic behavior.
- Keep real playback runtime integration deferred (no ExoPlayer/AVPlayer wiring yet).

## Phase 4 Addendum (Mobile Behavior Seams)
- Add manager scaffolding for session, now-playing metadata, and remote commands.
- Keep platform integration TODO-based while wiring engine dependencies to those managers.
- Add progress and metadata seam points that preserve canonical v0 event/state semantics.

## Phase 4.2 Addendum (Runtime Integration Seams)
- Introduce explicit playback runtime adapter boundaries in Android and iOS player engines.
- Route load/play/pause/seek/stop/track-selection through runtime seams while keeping canonical state-machine semantics as source of truth.
- Introduce session/now-playing/remote runtime adapter boundaries so Media3/AVFoundation objects can be connected without reshaping core APIs.
- Keep default adapters no-op/in-memory; no claim of complete device playback integration yet.
