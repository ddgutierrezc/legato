# Package documentation foundation v1 scope

This document defines scope boundaries for `package-documentation-foundation-v1`.

## In-scope outcomes

- Root `README.md` is a GitHub landing page with package-selection guidance.
- `packages/contract/README.md` and `packages/capacitor/README.md` are consumer-first and source-backed.
- Maintainer-heavy operational details are linked from READMEs instead of expanded inline.
- Docs drift checks exist in `apps/capacitor-demo/scripts/package-documentation-foundation-v1-docs.test.mjs`.

## Non-goals

- Non-goal: no full Diátaxis rollout across the repository.
- Non-goal: no invented API docs or undocumented behavior claims.
- Non-goal: no runtime behavior expansion.
- Non-goal: no release-lane redesign.
- Non-goal: no platform bootstrap automation changes.

## Canonical source-of-truth files

- `packages/contract/src/index.ts`
- `packages/contract/src/events.ts`
- `packages/capacitor/src/index.ts`
- `packages/capacitor/src/plugin.ts`
- `packages/capacitor/src/cli/native-setup-cli.mjs`
- `apps/capacitor-demo/package.json`
- `.github/workflows/npm-release-readiness.yml`

## Implementation notes

- Root/package onboarding remains consumer-first.
- Maintainer operations are linked via `docs/maintainers/legato-capacitor-operator-guide.md`.
- Verification is enforced by `node --test ./scripts/package-documentation-foundation-v1-docs.test.mjs` from `apps/capacitor-demo`.
- Confirmation: implementation stayed within scope (no full docs migration and no fabricated API surface).

## Non-public boundary

- `docs/maintainers/*` remains root-canonical maintainer material unless a page is explicitly rewritten for the public docs site.
- Source-backed maintainer/release evidence under root `docs/` must not be published in `apps/docs-site` by default.
- Public docs in `apps/docs-site` may link to maintainer paths when needed, but must not mirror maintainer-only operational detail as consumer-facing guidance.
