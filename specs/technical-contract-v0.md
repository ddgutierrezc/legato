# Technical Contract v0

## Goal
Define a framework-agnostic, contract-first API surface for mobile audio playback.

## Source of Truth
- Package: `packages/contract`
- Language: TypeScript types/constants (no framework/runtime coupling)

## Core Domain Types
- `Track`
- `PlaybackState`
- `QueueSnapshot`
- `PlaybackSnapshot`
- `LegatoError` + error codes
- `Capability`

## Design Principles
1. Contract evolves first; bindings/native implementations follow.
2. Public names are canonical and shared across Capacitor, React Native, and Flutter bindings.
3. Keep v0 minimal and stable: prioritize compatibility over breadth.
4. Use explicit event names and error codes to avoid adapter ambiguity.

## Non-Goals (v0)
- No native playback implementation in this phase.
- No framework-specific API extensions.
- No transport/storage concerns beyond track URL metadata.
