# documentation-governance Specification

## Purpose
Define audience boundaries, canonical authority, and verification rules to avoid internal-doc leakage.

## Requirements

### Requirement: Audience Classification
Every document MUST be classified as exactly one audience: Public, Maintainer, or Archive/Evidence.

#### Scenario: Single-class assignment
- GIVEN a document under review
- WHEN classification is recorded
- THEN exactly one audience class is assigned

#### Scenario: Mixed-content document
- GIVEN a doc mixes public guidance and maintainer procedures
- WHEN classification is attempted
- THEN it SHALL be split or rewritten before public publication

### Requirement: Canonical Authority Order
Authority SHALL be:
1) docs-site pages for Public content;
2) root/package READMEs as summaries linking to docs-site;
3) `docs/maintainers/*` and `docs/releases/*` as Maintainer-only canonical sources;
4) `docs/architecture/spikes/*` as Archive/Evidence, not product guidance.

#### Scenario: README conflicts with docs-site
- GIVEN README guidance differs from docs-site
- WHEN canonical source is resolved
- THEN docs-site is authoritative and README is corrected

#### Scenario: Maintainer runbook in public nav
- GIVEN `docs/releases/*` content is proposed for public navigation
- WHEN governance review runs
- THEN proposal is rejected for this phase

### Requirement: Maintainer and Archive Preservation
Migration planning MUST preserve maintainer workflows and archive evidence paths.

#### Scenario: Maintainer workflow continuity
- GIVEN an existing runbook path
- WHEN migration planning occurs
- THEN that path remains valid for maintainers

#### Scenario: Evidence retention
- GIVEN historical spikes/evidence documents
- WHEN migration planning occurs
- THEN artifacts remain retained and not promoted as public docs

### Requirement: Drift and Leakage Verification
Governance MUST require checks for README↔docs-site drift and accidental publication of Maintainer/Archive material.

#### Scenario: Public navigation leakage check
- GIVEN a public nav change proposal
- WHEN verification is executed
- THEN no Maintainer/Archive paths are published

#### Scenario: README alignment check
- GIVEN README updates
- WHEN verification is executed
- THEN READMEs remain concise and link to canonical docs-site pages
