# @ddgutierrezc/legato-contract

Library-only contract package for Legato shared types, events, and invariants.

## Install

```bash
npm install @ddgutierrezc/legato-contract
```

## Package role

Use this package when you need shared contract primitives only.

- Includes types, event-name constants, snapshots, queue/state models, and invariants.
- Does not include Capacitor runtime/plugin behavior.
- Does not ship a CLI.

## First import

```ts
import { LEGATO_EVENT_NAMES } from '@ddgutierrezc/legato-contract';
```

Supported import contract:

- ✅ Supported: root import from `@ddgutierrezc/legato-contract`
- ❌ Unsupported: undocumented deep imports such as `@ddgutierrezc/legato-contract/dist/*`

## Public surface

`packages/contract/src/index.ts` exports the following groups:

- `track`, `state`, `queue`, `snapshot`, `errors`
- Event types: `PlayerEventName`, `MediaSessionEventName`, `LegacyPlayerEventName`, `LegatoEventName`
- Event payload types/maps
- Event constants: `PLAYER_EVENT_NAMES`, `MEDIA_SESSION_EVENT_NAMES`, `LEGACY_PLAYER_EVENT_NAMES`, `LEGATO_EVENT_NAMES`
- `capability`, `invariants`
- `binding-adapter` (transport-neutral adapter contract primitives)

## Binding adapter contract foundation (v1)

`packages/contract/src/binding-adapter.ts` defines an adapter-agnostic surface for future bindings:

- lifecycle/setup (`setup`)
- playback command/query contract
- typed event subscription + neutral listener handle (`BindingListenerHandle`)
- capabilities projection (`BindingCapabilitiesSnapshot`)
- typed adapter error envelope (`BindingAdapterError`)

This is a **foundation contract only** for architecture alignment in v1.

- It does not implement runtime adapters for Flutter or React Native.
- It does not change current Capacitor runtime behavior.
- It does not promise parity timelines for future bindings.

Maintainer verification map: [`../../docs/maintainers/package-documentation-foundation-v1-source-map.md`](../../docs/maintainers/package-documentation-foundation-v1-source-map.md)

## Package role boundary

- This package is library-only and does not ship a CLI.
- If you need the `legato` command, install `@ddgutierrezc/legato-capacitor` instead.
- Public exports are intentionally root-only via `packages/contract/package.json` (`exports["."]`).

## Runtime prerequisites

- Supported Node.js + npm environment for your project toolchain.
- No Capacitor runtime/plugin bootstrap commands are provided by this package.
- Unsupported environment disclosure: non-LTS or end-of-life Node.js runtimes are not supported for this package onboarding guidance.
- Remediation: upgrade to a supported Node.js LTS release and reinstall dependencies.

## Non-goals for this change

- Non-goal: runtime behavior expansion.
- Non-goal: release-lane redesign.
- Non-goal: platform bootstrap automation.
