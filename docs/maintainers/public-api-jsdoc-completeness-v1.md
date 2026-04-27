# Public API JSDoc completeness v1

This document defines the declaration-level JSDoc closure rules for:

- `@ddgutierrezc/legato-contract`
- `@ddgutierrezc/legato-capacitor`

## Scope boundaries

The required symbol set is the root-exported surface resolved from each package entrypoint:

- `packages/contract/src/index.ts`
- `packages/capacitor/src/index.ts`

Deep-import-only symbols are out of scope.

## Validation command

Run per package:

```bash
npm run build && npm run readiness:entries
```

The readiness validator executes `packages/capacitor/scripts/assert-package-entries.mjs` and enforces declaration-level docs against emitted `.d.ts` output.

## Category rules

- `functions/methods`
  - summary sentence
  - `@param` for each public parameter
  - `@returns` when return type is non-`void`
- `types/interfaces`
  - summary sentence
  - property docs for externally consumed option/snapshot/event-map members (where enforced by validator heuristics)
- `constants/enums`
  - summary sentence
- `event maps/payload types`
  - summary sentence
  - property/key docs on payload map members

## Staged rollout closure

- Stage 1 (contract): `documentedSymbols === totalSymbols` for contract root exports.
- Stage 2 (capacitor): `documentedSymbols === totalSymbols` for capacitor root exports.
- Stage 3 (global): both package readiness commands pass with zero uncovered symbols.

## Failure remediation workflow

Validator failures include:

- `symbol`
- `category`
- `declFile`
- `sourceFile` (from `.d.ts.map` when available)
- `missing[]`

Fix loop:

1. Open `sourceFile` and add or adjust JSDoc.
2. Rebuild package to emit updated declarations.
3. Rerun readiness.
4. Repeat until no failures remain.

## Current closure target

Global closure is complete only when both packages report `status: "PASS"` and every root-exported symbol is documented in emitted declaration output.
