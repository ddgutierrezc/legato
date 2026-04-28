# @ddgutierrezc/legato-capacitor

Modern Capacitor binding MVP for Legato.

This package provides Capacitor-native integration and is not a replacement for contract-only consumers.

## npm quickstart

```bash
npm install @ddgutierrezc/legato-capacitor @ddgutierrezc/legato-contract
```

## Canonical docs

For installation flow, API surface, and migration guidance, use the canonical docs-site guide:

- [`apps/docs-site/src/content/docs/packages/capacitor/index.mdx`](../../apps/docs-site/src/content/docs/packages/capacitor/index.mdx)

This README is an orientation entrypoint only.

## Contractual scope notes

- Streaming semantics claims follow a **conservative policy**: capability signals are inferred only from source-backed native/runtime evidence and must not be expanded into unsupported guarantees.
- Inference and scope constraints for streaming behavior remain bounded to the documented v1 guardrails; out-of-scope claims (for example DRM/process-death coverage in this milestone) are intentionally excluded.
- `@ddgutierrezc/legato-capacitor` is the **first concrete adapter** and currently the **only implemented binding** for the contract's transport-neutral surface.
- Release decision traceability for v1 is anchored in [`../../docs/releases/v1-release-go-no-go-record-v1.md`](../../docs/releases/v1-release-go-no-go-record-v1.md).

## CLI scope note

This package is the only public package that ships the `legato` command.
The `legato native` CLI remains a repo-owned maintainer helper for native setup and diagnostics, not a contract-only consumer surface.

## Maintainer operations

Maintainer-heavy CLI/release/SPM operational details are documented in [`../../docs/maintainers/legato-capacitor-operator-guide.md`](../../docs/maintainers/legato-capacitor-operator-guide.md).
