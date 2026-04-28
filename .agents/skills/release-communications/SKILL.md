---
name: release-communications
description: >
  Execute professional cross-repo release operations and release communication for Legato.
  Trigger: MUST load this skill before any Android/npm/iOS artifact publish, GitHub Release create/edit, CHANGELOG.md update, release-note generation, release evidence reconciliation, derivative iOS release note handling, or any request to explain/document what changed in a release.
license: MIT
metadata:
  author: ddgutierrezc
  version: "1.0"
---

## Purpose

This skill governs how to perform and communicate releases across the Legato ecosystem.

It covers two responsibilities together:

1. **Deploy / publish operations**
   - Android core → Maven Central
   - npm packages → npm registry
   - iOS distribution → `legato-ios-core` GitHub release/tag

2. **Release communication**
   - Canonical GitHub Release in `legato`
   - Durable root `CHANGELOG.md`
   - Derivative iOS release notes in `legato-ios-core`
   - Facts + evidence reconciliation

This skill is **not** for inventing release notes from vague memory. It is for
building release communication from verified evidence and then adding bounded,
human-useful narrative.

---

## Canonical Authority Model

### `legato` (source of truth)

Canonical for:
- cross-platform release narrative
- root `CHANGELOG.md`
- GitHub release notes for the ecosystem
- npm + Maven + iOS distribution fact aggregation

### `legato-ios-core` (distribution repo)

Canonical for:
- iOS distribution tag/release event
- SwiftPM distribution release notes specific to iOS delivery

### Rule

If both repos mention the same iOS release:
- `legato` owns the **umbrella story**
- `legato-ios-core` owns the **distribution event**
- derivative notes MUST backlink to canonical `legato` release notes

---

## When to Use

- ALWAYS before any real release or deploy operation in Legato.
- ALWAYS before creating or editing a GitHub Release in `legato` or `legato-ios-core`.
- ALWAYS before updating `CHANGELOG.md` as part of a release.
- ALWAYS before dispatching release workflows when the task includes publish/deploy/release-note expectations.
- When publishing `@ddgutierrezc/legato-contract`
- When publishing `@ddgutierrezc/legato-capacitor`
- When publishing `dev.dgutierrez:legato-android-core`
- When publishing/updating `legato-ios-core` releases
- When updating `CHANGELOG.md`
- When creating or editing GitHub Releases in `legato`
- When reconciling facts/evidence before a release goes public
- When the user asks for “release notes”, “changelog”, “publish”, “deploy”, “release communication”, or similar

---

## Critical Patterns

### 1. Facts first, narrative second

Always separate:

#### Facts (machine-verifiable)
- package versions
- Maven coordinates
- iOS tag/release id
- `source_commit`
- selected targets
- run URLs / evidence pointers
- target outcomes (`published`, `already_published`, `failed`, etc.)

#### Narrative (human-curated)
- why it matters
- upgrade/install actions
- breaking changes
- known limitations
- rollout notes

Never invent facts in narrative.

### 1b. Mandatory load rule

If the user request includes any of these concepts, this skill MUST be loaded before continuing:
- release
- publish
- deploy
- changelog
- GitHub Release
- what changed in this release
- Android publish
- npm publish
- iOS distribution release
- canonical / derivative release notes

Do not proceed with artifact publication or release-note generation without this skill active.

### 1c. Mandatory packet + ordered protocol rule

This skill requires `release-execution-packet/v1` as the execution contract.

Required step order (no skips, no reorder):

`preflight -> publish -> reconcile -> closeout`

If packet is missing or phase/order is inconsistent, stop with reason code guidance and do not continue.

---

### 2. Stop-the-line rules

DO NOT publish release communication if any of these are true:

- artifact version mismatch across npm / Maven / iOS distribution / changelog / release notes
- missing required evidence for a claimed publish
- missing required narrative sections
- derivative iOS notes required but absent
- canonical release facts cannot be reconciled from source evidence

If any fail-closed rule triggers, STOP and report the exact mismatch.

---

### 3. Release order matters

Use the correct artifact order:

#### Android + npm paired releases
1. Publish Maven Android core first
2. Wait for Maven visibility
3. Publish `@ddgutierrezc/legato-capacitor`

#### npm peer-dependent pair releases
1. Publish `@ddgutierrezc/legato-contract` first
2. Wait for npm visibility
3. Publish `@ddgutierrezc/legato-capacitor`

#### iOS distribution
1. Publish distribution tag/release in `legato-ios-core`
2. Verify package resolution
3. Publish/update canonical release note in `legato`

---

### 4. Root changelog is durable truth

`CHANGELOG.md` must be:
- Keep a Changelog compatible
- durable
- human readable
- aligned with published artifacts

Do not use CI artifact URLs as the only release record.

---

### 5. GitHub Release body contract

Every canonical `legato` release should contain these top-level sections:

- `## Summary`
- `## Published artifacts`
- `## Why it matters`
- `## Upgrade / install`
- `## Breaking changes`
- `## Evidence`
- `## Known limitations`

If a required section is removed, validation must fail.

---

## Target-Specific Deploy Procedures

### Android / Maven Central

#### Preconditions
- version prepared in repo
- relevant runtime/tests pass
- scope checks clean

#### Procedure
1. Run Android preflight
2. Publish `dev.dgutierrez:legato-android-core:<version>`
3. Verify bounded retry against Maven Central visibility
4. Persist evidence summary
5. Only then continue to npm package if it depends on the new artifact

#### Required facts
- coordinate
- version
- verify result
- evidence path / release run id

---

### npm

#### Preconditions
- package version bumped
- peer ranges aligned
- `pack:check` / readiness green
- required upstream artifact already visible (if needed)

#### Procedure
1. Publish `contract` first when peer alignment requires it
2. Publish `capacitor` after `contract` visibility if applicable
3. Verify npm visibility with bounded retry
4. Persist evidence summary
5. Reconcile release notes/changelog facts

#### Required facts
- package name
- version
- peerDependencies
- publish status
- verify result

---

### iOS distribution (`legato-ios-core`)

#### Preconditions
- source-of-truth version/tag decided in `legato`
- distribution repo prepared/taggable
- verification path known

#### Procedure
1. Create/push tag in `legato-ios-core`
2. Create/update GitHub Release in `legato-ios-core`
3. Verify SwiftPM/package resolution
4. Create derivative iOS notes
5. Link derivative notes back to canonical `legato` release

#### Required facts
- repo release URL
- tag
- package URL / product
- verify result
- backlink to canonical `legato` release

---

## Canonical Release Flow (`legato`)

### Inputs
- release id
- selected targets
- target outputs/evidence
- source commit
- human narrative JSON/template

### Outputs
- changelog entry
- GitHub release body
- durable evidence index
- reconciliation status

### Required narrative fields
- why it matters
- upgrade / install actions
- breaking changes
- known limitations

If any required field is absent, fail.

---

## Future Skill IO Contract

When this skill is invoked for a real release, it should expect to gather:

### Inputs
- release id
- target list (`android`, `npm`, `ios`)
- current package/native versions
- evidence manifests/summaries
- human narrative payload

### Outputs
- updated `CHANGELOG.md`
- GitHub Release body for `legato`
- derivative release body for `legato-ios-core` when relevant
- reconciliation report
- operator summary of what was published vs skipped

### Failure Modes
- missing evidence
- version drift
- missing derivative release when iOS included
- missing required narrative field
- missing canonical release section

---

## Commands

### Inspect published versions
```bash
npm view @ddgutierrezc/legato-contract version --json
npm view @ddgutierrezc/legato-capacitor version --json
python3 - <<'PY'
import urllib.request
url='https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/maven-metadata.xml'
with urllib.request.urlopen(url, timeout=20) as r:
    print(r.status)
PY
```

### Publish Android core via control plane
```bash
gh workflow run "Cross-platform release control (v2)" --ref main \
  -f release_id=android-core-publish-<version>-001 \
  -f targets=android \
  -f target_modes=android=publish
```

### Publish npm package via control plane
```bash
gh workflow run "Cross-platform release control (v2)" --ref main \
  -f release_id=package-publish-<version>-001 \
  -f targets=npm \
  -f target_modes=npm=protected-publish \
  -f npm_package_target=contract
```

### Validate release communication
```bash
cd apps/capacitor-demo
npm run test:release:confidence
```

### GitHub Releases
```bash
gh release list --repo ddgutierrezc/legato
gh release list --repo ddgutierrezc/legato-ios-core
gh release edit <tag> --repo ddgutierrezc/legato-ios-core --notes-file /path/to/notes.md
```

---

## What This Skill Must Not Do

- Must not invent release claims not supported by evidence
- Must not publish canonical release notes if reconciliation fails
- Must not treat ephemeral CI artifact links as the only durable source of truth
- Must not bypass version order rules (`contract` before `capacitor`, Maven before Android-backed npm)
- Must not blur canonical `legato` release notes with derivative `legato-ios-core` distribution notes

---

## Resources

- Canonical release governance docs live under `docs/releases/`
- Future evidence and release-note templates live under `docs/releases/templates/` and `docs/releases/notes/`
- This skill is expected to operate alongside the release workflows already present in `.github/workflows/`
