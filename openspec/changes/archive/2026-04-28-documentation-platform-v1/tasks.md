# Tasks: documentation-platform-v1

## Phase 1: Docs Site Foundation

- [x] 1.1 Create `apps/docs-site/package.json` with Astro/Starlight scripts (`dev`, `build`, `check`) and workspace-compatible metadata.
- [x] 1.2 Create `apps/docs-site/astro.config.mjs` with site metadata and top-level sidebar groups: Getting Started, Package Guides, Reference, Releases, Community.
- [x] 1.3 Create `apps/docs-site/src/content/docs/index.mdx` as public landing page that states docs-site is canonical public surface.
- [x] 1.4 Add docs-site contribution guardrails in `apps/docs-site/README.md` (public-only content policy and forbidden maintainer/archive imports).

## Phase 2: Information Architecture + Public Core Content

- [x] 2.1 Create `apps/docs-site/src/content/docs/getting-started/index.mdx` from root onboarding (install, package selection matrix, first-use flows).
- [x] 2.2 Create `apps/docs-site/src/content/docs/concepts/index.mdx` defining public concepts and boundary between consumer docs vs maintainer operations.
- [x] 2.3 Create `apps/docs-site/src/content/docs/community/index.mdx` with contribution/community pointers that avoid embedding runbook details.
- [x] 2.4 Update `apps/docs-site/astro.config.mjs` sidebar to include Concepts and Community pages as explicit manual entries.

## Phase 3: Package Guides + Reference Surfaces

- [x] 3.1 Create `apps/docs-site/src/content/docs/packages/contract/index.mdx` from `packages/contract/README.md` plus public exports in `packages/contract/src/index.ts`.
- [x] 3.2 Create `apps/docs-site/src/content/docs/packages/capacitor/index.mdx` from `packages/capacitor/README.md` and documented integration flows.
- [x] 3.3 Create `apps/docs-site/src/content/docs/reference/index.mdx` as public API/reference entrypoint for contract/capacitor surfaces.
- [x] 3.4 Create `apps/docs-site/src/content/docs/releases/index.mdx` with consumer-safe release notes sourced from `CHANGELOG.md` only.

## Phase 4: Canonical Entrypoints + Maintainer/Archive Safety

- [x] 4.1 Refactor `README.md` into thin orientation page that links to canonical docs-site sections instead of hosting deep tutorials.
- [x] 4.2 Refactor `packages/contract/README.md` into concise package summary linking to docs-site canonical contract guide.
- [x] 4.3 Refactor `packages/capacitor/README.md` into concise package summary linking to docs-site canonical capacitor guide.
- [x] 4.4 Add explicit non-public boundary note in `docs/maintainers/package-documentation-foundation-v1-scope.md` confirming maintainer/archive docs remain root-canonical.

## Phase 5: Verification, Drift, and Leakage Guardrails

- [x] 5.1 Create `apps/capacitor-demo/scripts/documentation-platform-v1-docs.test.mjs` to assert mandatory IA pages exist in `apps/docs-site/src/content/docs/**`.
- [x] 5.2 Extend `apps/capacitor-demo/scripts/package-documentation-foundation-v1-docs.test.mjs` to enforce thin-README + canonical docs-site link rules for root and package READMEs.
- [x] 5.3 Add leakage checks in `apps/capacitor-demo/scripts/documentation-platform-v1-docs.test.mjs` blocking imports/links to `docs/maintainers/**`, `docs/releases/notes/**`, and `docs/architecture/spikes/**` from public docs-site content.

## Phase 6: Optional / Follow-up Decisions

- [ ] 6.1 Add a follow-up note in `apps/docs-site/src/content/docs/releases/index.mdx` for pending decision: full changelog mirroring vs curated release summaries.
- [ ] 6.2 Add a follow-up note in `apps/docs-site/src/content/docs/community/index.mdx` for pending decision: whether to expose a public-safe Maintainers page.
- [ ] 6.3 Capture unresolved policy choices in `openspec/changes/documentation-platform-v1/design.md` Open Questions section after implementation evidence is available.
