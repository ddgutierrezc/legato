# @ddgutierrezc/legato-contract

Library-only contract package for Legato shared types, events, and invariants.

## Install

```bash
npm install @ddgutierrezc/legato-contract
```

## First import

```ts
import { LEGATO_EVENTS } from '@ddgutierrezc/legato-contract';
```

## Package role boundary

- This package is library-only and does not ship a CLI.
- If you need the `legato` command, install `@ddgutierrezc/legato-capacitor` instead.

## Runtime prerequisites

- Supported Node.js + npm environment for your project toolchain.
- No Capacitor runtime/plugin bootstrap commands are provided by this package.
- Unsupported environment disclosure: non-LTS or end-of-life Node.js runtimes are not supported for this package onboarding guidance.
- Remediation: upgrade to a supported Node.js LTS release and reinstall dependencies.

## Non-goals for this change

- Non-goal: runtime behavior expansion.
- Non-goal: release-lane redesign.
- Non-goal: platform bootstrap automation.
