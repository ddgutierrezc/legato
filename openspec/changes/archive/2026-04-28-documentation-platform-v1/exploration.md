## Exploration: documentation-platform-v1

### Current State
Legato reached `v1.0.0` with a docs footprint split across consumer READMEs and maintainer/release runbooks in root `docs/`. The repository currently has no Starlight app in `docs/` (no `package.json`, no `astro.config.*`, no `src/content/docs/`), but it does contain `docs/node_modules/`, indicating historical/partial tooling residue without a maintainable docs app structure.

Documentation is audience-mixed today:
- Public consumer onboarding is concentrated in `README.md`, `packages/contract/README.md`, and `packages/capacitor/README.md`.
- Maintainer operations and governance live under `docs/maintainers/*` and `docs/releases/*`.
- Architecture notes (including future-facing spikes) live in `docs/architecture/*`.

Primary audiences and jobs-to-be-done observed from source docs:
1. **Contract consumers** (`@ddgutierrezc/legato-contract`): decide package fit, install quickly, import root symbols safely, understand public-surface boundaries.
2. **Capacitor integrators** (`@ddgutierrezc/legato-capacitor`): onboard with install + first-use API path, understand namespaced APIs and compatibility posture.
3. **Maintainers/release operators**: execute release governance, evidence/reconciliation workflows, packaging, native/SPM safety rules, and API documentation quality checks.
4. **Architecture contributors**: understand guardrails, boundaries, and deferred tracks (e.g., multi-binding spikes) without treating planning artifacts as end-user docs.

### Affected Areas
- `README.md` — public landing and package-routing entrypoint; should remain concise and point to canonical docs site.
- `packages/contract/README.md` — core contract onboarding content candidate for public “Reference/Package” section.
- `packages/capacitor/README.md` — core integration onboarding and API boundary content candidate for public docs.
- `docs/maintainers/package-documentation-foundation-v1-scope.md` — explicit consumer-vs-maintainer split policy.
- `docs/maintainers/legato-capacitor-operator-guide.md` — maintainer-only operational runbook (not public onboarding).
- `docs/maintainers/public-api-jsdoc-completeness-v1.md` — maintainer quality gate process.
- `docs/releases/publication-pipeline-v2.md` — high-complexity release operations/governance runbook (internal).
- `docs/releases/release-communication-governance-v1.md` — canonical-vs-derivative authority rules (internal policy).
- `docs/releases/release-notes-policy-v1.md` — release communication policy and stop-the-line conditions.
- `docs/releases/v1-release-go-no-go-record-v1.md` — historical decision evidence (archive/evidence).
- `docs/architecture/multi-binding-capability-map.md` — architecture boundary artifact useful for contributors, not first-run consumers.
- `docs/architecture/spikes/flutter-rn-adapter-spike.md` — planning-only spike artifact; should not be surfaced as stable product documentation.

### Approaches
1. **Dedicated Starlight app at `apps/docs-site/` + selective migration**
   - Pros:
      - Avoids collision with occupied root `docs/` and its `node_modules` residue.
      - Clean separation between product docs app and operational/archive evidence corpus.
      - Better long-term monorepo ergonomics (`apps/*` convention) and isolated dependency lifecycle.
      - Enables gradual migration without destabilizing release runbook paths immediately.
    - Cons:
      - Introduces dual-doc locations during transition.
      - Requires explicit link governance so READMEs and runbooks don’t drift.
    - Effort: **Medium**

2. **Reuse root `docs/` as Starlight project in place**
    - Pros:
      - Shorter public URL/path semantics (`/docs` origin) and fewer top-level directories.
      - Could preserve relative links for some existing docs if deeply curated.
    - Cons:
      - High migration risk due to mixed content and existing non-app artifacts (`docs/releases`, `docs/node_modules`, governance contracts).
      - Hard to separate public docs UX from maintainer-only evidence corpus.
      - Higher chance of accidental publication of internal-only operational material.
    - Effort: **High**

3. **No Starlight app; improve README + markdown only**
    - Pros:
      - Lowest immediate setup cost.
      - No new build/deploy surface.
    - Cons:
      - Fails the documentation-platform objective at v1 scale.
      - Poor discoverability/navigation for multiple audiences.
      - Harder to enforce information architecture, versioned navigation, and search.
    - Effort: **Low**

### Recommendation
Proceed with **Approach 1: `apps/docs-site/` Starlight app + selective migration**.

Recommended IA split:
- **Public docs (docs site)**
  - Getting Started: package decision matrix, install, first-use
  - Contract package reference
  - Capacitor integration guide + API boundaries
  - Versioning/release notes surface for consumers (high-level, not operator procedure)
- **Maintainer docs (keep internal in root `docs/maintainers` + `docs/releases`)**
  - Operator guides, release protocol contracts, reconciliation/closeout gates, evidence policy
  - JSDoc completeness and internal validation workflows
- **Archive-only / historical evidence**
  - Time-stamped release records, gap matrices, deferral registers, one-off canary closure evidence
  - Planning spikes in `docs/architecture/spikes/*`

Migration strategy (incremental):
1. Define canonical docs ownership matrix (public vs maintainer vs archive) per existing file.
2. Stand up `apps/docs-site/` with initial IA and explicit “maintainer docs remain internal” boundaries.
3. Port high-value public content from root/package READMEs into docs pages (maintain source-backed claims).
4. Convert root and package READMEs into concise entrypoints linking to docs-site canonical pages.
5. Add drift checks/link checks so docs-site and README pointers stay synchronized.
6. Only after stable adoption, decide whether to prune or retain legacy root `docs/` sections as archive.

### Risks
- **Audience leakage risk**: internal release governance docs could be unintentionally exposed as public onboarding unless content classification is explicit.
- **Drift risk**: duplicated guidance across README/package docs/docs-site can diverge without automated checks.
- **Path stability risk**: existing links in release/governance docs may break if files are moved instead of linked/aliased.
- **Authority ambiguity**: consumer-facing “release notes” vs maintainer “release execution policy” can be conflated unless canonical source boundaries are documented.
- **Sequencing constraint**: release-critical runbooks in `docs/releases/*` should not be structurally moved during active release cadence.

### Ready for Proposal
**Yes** — enough repository evidence exists to draft proposal/spec with:
- audience-based documentation taxonomy,
- docs-site location decision (`apps/docs-site/`),
- initial IA,
- phased migration/backlink strategy,
- and explicit non-goals (no immediate release runbook migration or governance rewrites).
