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

## CLI scope note

This package is the only public package that ships the `legato` command.
The `legato native` CLI remains a repo-owned maintainer helper for native setup and diagnostics, not a contract-only consumer surface.

## Maintainer operations

Maintainer-heavy CLI/release/SPM operational details are documented in [`../../docs/maintainers/legato-capacitor-operator-guide.md`](../../docs/maintainers/legato-capacitor-operator-guide.md).
