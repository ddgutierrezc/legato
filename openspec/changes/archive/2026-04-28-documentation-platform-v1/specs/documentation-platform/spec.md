# documentation-platform Specification

## Purpose
Set `apps/docs-site/` as the canonical public docs platform and define required public IA.

## Requirements

### Requirement: Canonical Public Platform
Public Legato documentation SHALL be canonical in `apps/docs-site/`. Root `docs/` MUST NOT be the canonical public entrypoint.

#### Scenario: Public docs entry
- GIVEN a reader needs product/package docs
- WHEN they open public Legato docs
- THEN canonical navigation starts in `apps/docs-site/`

#### Scenario: Legacy public content
- GIVEN a public topic still exists in root `docs/`
- WHEN it is reviewed
- THEN it is migrated or redirected to docs-site canonical pages

### Requirement: Mandatory Public IA
The docs site MUST include: Getting Started, Package Guides (`contract`, `capacitor`), API/Reference entrypoints, and Release Notes surface.

#### Scenario: IA checklist
- GIVEN an initial docs-site navigation
- WHEN reviewers validate top-level sections
- THEN all mandatory IA sections are present and discoverable

### Requirement: README Entrypoints
`README.md`, `packages/contract/README.md`, and `packages/capacitor/README.md` MUST be concise and SHALL link to canonical docs-site pages for full guidance.

#### Scenario: Root README behavior
- GIVEN a user opens `README.md`
- WHEN they look for detailed docs
- THEN README provides orientation and links to docs-site canonical pages

#### Scenario: README drift prevention
- GIVEN detailed tutorials are added to a README
- WHEN governance verification runs
- THEN content is flagged for relocation to docs-site

### Requirement: Early-Phase Non-Goals
This phase MUST NOT require deployment automation, full content migration, or drift-tool implementation. It SHOULD define phased checkpoints without breaking existing runbook paths.

#### Scenario: Phase scope review
- GIVEN this change deliverables are reviewed
- WHEN acceptance is evaluated
- THEN only specification/governance outcomes are required for approval
