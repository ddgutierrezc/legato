# Release Notes Policy v1

## Facts vs narrative

- **Facts**: machine-verifiable values (versions, lane statuses, release IDs, evidence URLs, contract references).
- **Narrative**: human-curated fields in `Required Human Narrative`.

Facts must be source-backed. Narrative is mandatory but intentionally human-owned.

## Required human narrative

Canonical release notes MUST include:

- Why it matters
- User impact
- Upgrade notes
- Breaking changes
- Affected platforms

## Durable vs ephemeral evidence

- Durable evidence is REQUIRED for factual claims.
- Ephemeral evidence is allowed only as supplemental diagnostics.

Required durable link classes per release:

1. npm package URL(s) (`npmjs.com/package/...`)
2. Maven artifact URL (`repo1.maven.org/...`)
3. iOS `legato-ios-core` release tag URL (`/releases/tag/v...`)
4. manifest/changelog sources (`packages/*/package.json`, `packages/capacitor/native-artifacts.json`, `CHANGELOG.md`)

## Stop-the-line policy

Release communication is blocked when:

- required facts are not source-backed,
- required human narrative is incomplete,
- canonical/derivative backlinks are broken,
- lane statuses contradict selected targets,
- or durable evidence is missing for selected lanes.

See `docs/releases/reconciliation-stop-the-line-rules-v1.md` for fail-closed reason classes.
