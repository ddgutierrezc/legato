# Framework Binding v0

## Goal
Provide thin bindings for:
- Capacitor (`packages/capacitor`)
- React Native (`packages/react-native`)
- Flutter (`packages/flutter/legato`)

## Binding Rules
1. Bindings map 1:1 to contract types/events/error codes from `@ddgutierrezc/legato-contract`.
2. Bindings must not redefine domain semantics.
3. Any platform-specific limitation is represented via `Capability` and/or typed errors.
4. Keep adapter layers thin: translation, marshaling, lifecycle wiring.

## v0 Scope
- Directory scaffolding only for framework packages.
- No runtime implementation yet.
