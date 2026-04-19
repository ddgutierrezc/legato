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
- [x] Keep native implementations as TODO-only (no ExoPlayer/AVPlayer wiring).

## Phase 3
- [x] Replace map/dictionary payload placeholders with typed native DTOs (Android + iOS).
- [x] Implement canonical playback state machine transitions in native cores.
- [x] Implement in-memory snapshot store behavior with v0-aligned empty/default snapshot.
- [x] Implement minimal queue manager semantics (replace/add/clear/current/next/previous).
- [x] Update player engine signatures to typed DTOs while keeping runtime playback wiring as TODO.

## Phase 4
- [x] Add Android session/remote manager scaffolding with typed command/metadata seams.
- [x] Add iOS session/now playing/remote manager scaffolding with typed command/metadata seams.
- [x] Wire player engines to session/remote/metadata/progress seam points without real ExoPlayer/AVPlayer integration.

## Phase 4.1
- [x] Add native composition roots/factories for Android and iOS core assembly.
- [x] Keep composition explicit and lightweight for upcoming Capacitor adapter wiring.

## Phase 4.2
- [x] Add Android playback runtime adapter seam and wire player engine transport operations through it.
- [x] Add iOS playback runtime adapter seam and wire player engine transport operations through it.
- [x] Add Android/iOS session + remote + now playing runtime adapter seams with default no-op backends.
- [x] Update native readmes/spec notes to clarify what is integrated vs still pending for first real playback.

## Deferred
- [ ] Native core implementation (real Media3/AVPlayer wiring and runtime behavior on device).
- [ ] Framework binding implementations.
- [ ] CI/tooling automation.
