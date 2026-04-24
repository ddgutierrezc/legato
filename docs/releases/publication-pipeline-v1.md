# Publication Pipeline V1 — CI Android Release Runbook

This runbook defines change `ci-publication-release-automation-v1`.

## Scope Boundary

- Android publication is CI-driven through GitHub Actions in v1.
- iOS remains preflight/manual-handoff only in v1.
- **Do not implement automated iOS publication in this v1 milestone.**

## Workflow Entry Point (manual dispatch only)

Use `.github/workflows/release-android.yml` via **Run workflow** in GitHub Actions (`workflow_dispatch`).

Required inputs:

| Input | Allowed values | Purpose |
|---|---|---|
| `target` | `android` | Hard guard for v1 scope. Any non-Android target is rejected before preflight. |
| `mode` | `preflight-only` \| `publish` | Safe rehearsal vs protected publish path. |
| `release_id` | free-form string | Audit correlation key used in logs and evidence artifact names. |

## Stage contract (ordered, fail-fast)

1. `validate-dispatch`
   - Enforces Android-only v1 target and valid mode.
   - Persists `dispatch.json` for audit.
2. `android-preflight`
   - Runs `npm ci`, `npm run release:scope:check`, and `npm run release:android:preflight` from `apps/capacitor-demo`.
   - Captures `preflight.log`.
3. `android-publish` (mode=`publish` only)
   - Requires protected GitHub Environment: `release`.
   - Runs `npm run release:android:publish` with env-scoped Maven/signing secrets.
   - Captures `publish.log`.
4. `android-verify`
   - Runs after preflight (and publish when mode=`publish`).
   - Executes retry wrapper around canonical verify command.
   - Captures `verify.log` and `verify-summary.json`.
5. `evidence` (always)
   - Aggregates stage outcomes and uploads the evidence bundle.

## Protected approval + secrets boundary

### Environment gate

- Publish requires environment `release` approval.
- With mode=`publish`, execution is blocked until required reviewers approve.
- With mode=`preflight-only`, publish is skipped and no protected publish secrets are required.

### Accepted secret aliases (resolved in publish job)

- Maven credentials:
  - `ORG_GRADLE_PROJECT_mavenCentralUsername` or `MAVEN_CENTRAL_USERNAME`
  - `ORG_GRADLE_PROJECT_mavenCentralPassword` or `MAVEN_CENTRAL_PASSWORD`
- Preferred local-GPG signing aliases:
  - `ORG_GRADLE_PROJECT_signingGnupgKeyName` or `SIGNING_GNUPG_KEY_NAME` (`SIGNING_GNUPG_KEYNAME` accepted)
  - `ORG_GRADLE_PROJECT_signingGnupgPassphrase` or `SIGNING_GNUPG_PASSPHRASE`
  - `ORG_GRADLE_PROJECT_signingGnupgExecutable` or `SIGNING_GNUPG_EXECUTABLE`
  - `ORG_GRADLE_PROJECT_signingGnupgHomeDir` or `SIGNING_GNUPG_HOME_DIR`
- In-memory signing fallback aliases:
  - `ORG_GRADLE_PROJECT_signingInMemoryKey` or `SIGNING_KEY`
  - `ORG_GRADLE_PROJECT_signingInMemoryKeyFile` or `SIGNING_KEY_FILE`
  - `ORG_GRADLE_PROJECT_signingInMemoryKeyPassword` or `SIGNING_PASSWORD`

Secret values must never be printed, committed, or attached to artifacts.

## Evidence bundle (required on every run)

Artifact name: `release-evidence-<release_id>`

Included files:

- `dispatch.json`
- `preflight.log`
- `publish.log`
- `verify.log`
- `summary.json`
- `summary.md`

`summary.md` and the Actions Job Summary include stage-by-stage status plus the run URL for post-release monitoring.

Validation checklist and audit template: [`publication-pipeline-v1-validation.md`](./publication-pipeline-v1-validation.md).

## Operator quick paths

### Safe rehearsal (no protected approval)

- Dispatch with: `target=android`, `mode=preflight-only`, `release_id=<ticket-or-tag>`
- Expected: preflight runs, publish skipped, verify runs against current artifact state.

### Real release path

- Dispatch with: `target=android`, `mode=publish`, `release_id=<release-identifier>`
- Required: `release` environment approval and valid environment secrets.
- Expected order: preflight → approved publish → verify → evidence.

## iOS boundary (unchanged in v1)

iOS remains outside CI publication automation:

- iOS Preflight (automatable): `IOS_RELEASE_TAG=vX.Y.Z npm run release:ios:preflight`
- Manual Handoff (non-automated in v1): publish in the external iOS release authority (`legato-ios-core`) after preflight PASS.

This workflow intentionally does not auto-publish iOS artifacts.
