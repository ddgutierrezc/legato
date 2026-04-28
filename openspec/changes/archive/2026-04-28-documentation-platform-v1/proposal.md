# Proposal: documentation-platform-v1

## Intent

Establish a canonical documentation platform for Legato that matches the real monorepo shape: public package/runtime guidance for `packages/contract` and `packages/capacitor`, while keeping release/runbook material out of the public navigation layer.

## Scope

### In Scope
- Create a dedicated Starlight docs app at `apps/docs-site/`.
- Define public vs maintainer vs archive documentation boundaries.
- Make root/package READMEs short entrypoints that route readers to canonical docs-site pages.
- Plan phased migration to reduce release-path disruption and drift.

### Out of Scope
- Rewriting release governance or maintainer runbooks.
- Moving active `docs/releases/*` procedures into the public site now.
- Implementing deployment, content migration, or drift automation in this phase.

## Capabilities

### New Capabilities
- `documentation-platform`: Starlight-based canonical navigation for public Legato documentation.
- `documentation-governance`: Audience classification and ownership rules for public, maintainer, and archive docs.

### Modified Capabilities
- None.

## Approach

Adopt `apps/docs-site/` instead of reusing root `docs/`. Seed the site with consumer-facing IA (getting started, package guides, API/reference entrypoints, release notes surface), keep maintainer operations in root `docs/maintainers` and `docs/releases`, and migrate in phases: classify content, scaffold site, port public essentials, convert READMEs to pointers, then add drift controls.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `apps/docs-site/` | New | Public Starlight application and docs IA home |
| `README.md` | Modified | Concise project entrypoint to canonical docs |
| `packages/contract/README.md` | Modified | Short package entrypoint linked to docs-site |
| `packages/capacitor/README.md` | Modified | Short package/runtime entrypoint linked to docs-site |
| `docs/maintainers/*`, `docs/releases/*` | Modified | Explicitly retained as maintainer-only corpus |
| `docs/architecture/spikes/*` | Modified | Treated as archive/planning, not product docs |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Internal-doc exposure | Med | Classify audience before migration |
| README/docs drift | Med | Keep READMEs thin and add later drift checks |
| Release path breakage | Low | Preserve runbook paths during phased rollout |

## Rollback Plan

If the docs-site plan proves disruptive, keep existing READMEs and root `docs/` as canonical, remove `apps/docs-site/`, and retain only the audience-classification inventory for later reuse.

## Dependencies

- Exploration artifact `sdd/documentation-platform-v1/explore`
- Starlight as the documentation framework

## Success Criteria

- [ ] Proposal defines `apps/docs-site/` as the canonical public documentation destination.
- [ ] Proposal documents explicit public vs maintainer vs archive boundaries.
- [ ] Proposal preserves release/runbook stability through phased migration.
