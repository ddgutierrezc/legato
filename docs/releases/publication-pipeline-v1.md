# Publication Pipeline V1 — Android CI + iOS Manual-Execution Runbook

This runbook defines release execution for Android CI automation plus iOS manual publication execution hardening (`ios-publication-execution-v1`).

## Scope Boundary

- Android publication is CI-driven through GitHub Actions in v1.
- iOS publication action in `legato-ios-core` remains manual/external in v1.
- iOS in-repo work covers preflight, handoff evidence, remote verification, and closeout gates only.
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

## iOS manual-execution lane (repo-owned gates)

iOS remains outside CI publication automation, but v1 requires a complete auditable lane:

1. **Preflight gate** (repo-owned)
   - Command: `IOS_RELEASE_ID=<id> IOS_RELEASE_TAG=vX.Y.Z npm run release:ios:preflight`
   - Output: `artifacts/ios-publication-v1/<release_id>/preflight.json`
   - Gate must pass anti-drift checks and set `readyForManualHandoff=true`.

2. **Manual external publish** (outside this repo)
   - Operator publishes in external authority repo: `legato-ios-core`.
   - This repo does **not** create tags/publish remotely.

3. **Handoff evidence capture** (repo-owned)
   - Command:
      - `IOS_RELEASE_ID=<id> IOS_RELEASE_TAG=vX.Y.Z IOS_EXTERNAL_REPO=<repo-url> IOS_EXTERNAL_TAG=vX.Y.Z IOS_PROOF_TYPE=<tag-release-url|commit-sha> IOS_PROOF_VALUE=<immutable-proof> IOS_OPERATOR=<operator> IOS_PUBLISHED_AT=<ISO8601> npm run release:ios:handoff`
   - Output: `artifacts/ios-publication-v1/<release_id>/handoff.json`
    - Required fields: pinned version/tag, external repo ref, `proofType`, `proofValue`, operator, timestamp, linked preflight artifact.
    - Placeholder values (`TBD`, `example`, `placeholder`, angle-bracket templates) are rejected.

4. **Remote verification gate** (repo-owned, read-only)
   - Command:
     - `IOS_RELEASE_ID=<id> IOS_VERIFY_ATTEMPTS=6 IOS_VERIFY_BACKOFF_MS=120000 npm run release:ios:verify`
   - Output: `artifacts/ios-publication-v1/<release_id>/verify.json`
   - Checks:
      - `git ls-remote --tags` confirms pinned tag propagation.
      - scratch SwiftPM resolve confirms pinned package URL/version is installable.
      - verify output must include `proofReference` and match immutable handoff proof fields.
   - Retry is bounded and idempotent; diagnostics are captured in `verify.json`.

5. **Closeout gate** (repo-owned)
   - Command: `IOS_RELEASE_ID=<id> npm run release:ios:closeout`
   - Output: `artifacts/ios-publication-v1/<release_id>/closeout.json`
    - Allowed only when `preflight + handoff + verify` are all PASS, version/release-id chain is consistent, and `verify.proofReference` matches `handoff` immutable proof.

### iOS artifacts (required evidence chain)

For a valid iOS closeout, the same `<release_id>` directory must include:

- `preflight.json`
- `handoff.json`
- `verify.json`
- `closeout.json`

This workflow intentionally does not auto-publish iOS artifacts.
