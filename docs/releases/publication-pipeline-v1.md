# Publication Pipeline V1 — Release Runbook

This runbook is the release boundary for change `publication-pipeline-v1`.

## Scope Boundary

- Android distribution target in v1 is Maven Central.
- iOS distribution strategy is a remote Swift package (`legato-ios-core`), but publication remains manual in this milestone.
- **Do not implement automated iOS publication in this v1 milestone.**

## Validation Evidence Closeout (local readiness gates)

Run from `apps/capacitor-demo` in this order:

```bash
npm run release:android:preflight
npm run release:android:publish
npm run release:android:verify
IOS_RELEASE_TAG=v0.1.1 npm run release:ios:preflight
npm run release:scope:check
```

- `release:android:publish` is expected to fail without maintainer credentials; this is the intended secret boundary.
- `release:android:verify` is expected to fail until a real Maven Central release exists or propagates.
- `release:scope:check` confirms v1 namespace migration stayed inside publication-scope files.

Captured command outputs for this batch are recorded in [`publication-pipeline-v1-validation.md`](./publication-pipeline-v1-validation.md).

## Android First Publish — Preflight Readiness (Batch A)

Before any maintainer executes a real `release:android:publish`, complete this preflight gate from the repository root context below.

### Required working directory

- Run from: `apps/capacitor-demo`
- Why: release scripts in this app bind the exact contract/build/project paths used by v1 publish.

### Tooling prerequisites

1. Node/npm available to run `npm run release:android:preflight`.
2. Android Gradle toolchain resolvable from `native/android/core`:
   - prefers `native/android/core/gradlew`
   - falls back to `gradle` in PATH when wrapper is unavailable
3. Repo files present and readable:
   - `packages/capacitor/native-artifacts.json`
   - `native/android/core/build.gradle`

### Coordinate source-of-truth expectations

Preflight must prove the publish coordinate comes from the native-artifacts contract and matches Gradle resolution:

- Contract source: `packages/capacitor/native-artifacts.json` (`android.group`, `android.artifact`, `android.version`)
- Gradle probe: `printPublicationCoordinate`
- Expected result: exact match for `dev.dgutierrez:legato-android-core:<version>` (currently `0.1.1`)

### Fail-fast checks enforced by preflight

- Missing/invalid Android contract fields (`repositoryUrl`, `group`, `artifact`, `version`)
- Missing publication metadata hooks in `build.gradle`
- Gradle toolchain not executable (`--version` probe fails)
- `printPublicationCoordinate` probe failure or coordinate mismatch
- Placeholder publish-secret values detected in required aliases (`ORG_GRADLE_PROJECT_*` or fallback env names)

If any gate fails, **do not run publish**. Fix the failing gate first and re-run preflight.

## Android Publish Execution (maintainer-authorized)

This section defines the first real publish flow for `dev.dgutierrez:legato-android-core`.

### Ownership matrix (automation vs maintainer secrets)

| Item | Owner | Notes |
|---|---|---|
| `npm run release:android:preflight` | Automatable | Safe in any environment; no real credentials required. |
| `npm run release:android:publish` command invocation | Automatable | Command is scripted, but execution is maintainer-authorized only. |
| Maven Central credentials (`mavenCentralUsername/password`) | Maintainer-only | Must come from maintainer account that owns namespace rights. |
| Signing backend configuration (`signing.gnupg.*` preferred, in-memory fallback) | Maintainer-only | Prefer local GPG signing (`signing.gnupg.keyName`) for real publish runs; use in-memory key/file only as fallback. Never persist raw keys in repo/logs/CI artifacts. |
| `npm run release:android:verify` | Automatable | Runs bounded retries against Maven Central/POM reachability. |
| Release evidence closeout in docs | Operator-owned | Operator identity, UTC timestamps, commit SHA, URLs, and outcomes are mandatory. |

### Credential handling policy (no persistence)

1. Secrets are user-owned inputs, not repo-owned state.
2. Do **not** commit secrets to any tracked file (`gradle.properties`, `.env`, docs, scripts).
3. If local `native/android/core/gradle.properties` is used, keep it untracked and delete/rotate after release.
4. Prefer ephemeral environment injection per shell session (export only for the command window).
5. Validation/evidence docs must show **which aliases were used**, never raw secret values.

Accepted secret aliases for release gate checks:

- `ORG_GRADLE_PROJECT_mavenCentralUsername` or `MAVEN_CENTRAL_USERNAME`
- `ORG_GRADLE_PROJECT_mavenCentralPassword` or `MAVEN_CENTRAL_PASSWORD`
- Preferred local-GPG aliases:
  - `ORG_GRADLE_PROJECT_signingGnupgKeyName` or `SIGNING_GNUPG_KEY_NAME` (or `SIGNING_GNUPG_KEYNAME`)
  - `ORG_GRADLE_PROJECT_signingGnupgPassphrase` or `SIGNING_GNUPG_PASSPHRASE` (optional when `gpg-agent` already unlocks key)
  - `ORG_GRADLE_PROJECT_signingGnupgExecutable` or `SIGNING_GNUPG_EXECUTABLE` (optional override)
  - `ORG_GRADLE_PROJECT_signingGnupgHomeDir` or `SIGNING_GNUPG_HOME_DIR` (optional override)
- In-memory fallback aliases:
  - `ORG_GRADLE_PROJECT_signingInMemoryKey` or `SIGNING_KEY`
  - `ORG_GRADLE_PROJECT_signingInMemoryKeyFile` or `SIGNING_KEY_FILE`
  - `ORG_GRADLE_PROJECT_signingInMemoryKeyPassword` or `SIGNING_PASSWORD`

### Ordered publish run (when secrets are present)

Run from `apps/capacitor-demo` in this exact order:

```bash
npm run release:android:preflight
npm run release:android:publish
npm run release:android:verify
```

Operational notes:

- `release:android:publish` now prints the expected coordinate, Maven Central namespace URL, POM URL, and next-step guidance.
- `native/android/core/build.gradle` now auto-switches to `signing.useGpgCmd()` when `signing.gnupg.keyName` is provided, which prevents Gradle `no configured signatory` failures on local-GPG publish runs.
- On publish failure, stop and classify the error before rerunning.
- Rerun publish for the same version only when Central confirms the version is not released.
- Verify uses bounded retry judgment (for example every 10-15 minutes up to the agreed cutoff window).
- If verify cutoff is reached without HTTP 200 on POM URL, mark release as incomplete/blocked and open follow-up.

### iOS safeguard (unchanged in v1)

iOS remains `release:ios:preflight` + manual handoff only. This runbook does not authorize automated iOS publication.

## iOS Preflight (automatable)

Run from `apps/capacitor-demo`:

```bash
IOS_RELEASE_TAG=v0.1.1 npm run release:ios:preflight
```

This preflight validates the iOS release identity contract before any manual handoff:

1. `packages/capacitor/native-artifacts.json`
   - `ios.packageUrl`
   - `ios.packageName`
   - `ios.product`
   - `ios.version`
   - `ios.versionPolicy` (`exact`)
2. `native/ios/LegatoCore/Package.swift`
   - package `name` matches contract package name
   - `.library(name: ...)` includes the expected product
3. `packages/capacitor/Package.swift`
   - managed native-artifacts block matches iOS contract fields
   - remote SwiftPM dependency URL + `exact` version align with contract
   - plugin `.product(name:, package:)` for `LegatoCore` matches contract identity
4. Release tag readiness
   - `--release-tag` (or `IOS_RELEASE_TAG`) must match contract version (`vX.Y.Z` ↔ `X.Y.Z`)

Expected successful summary:

- `Mode: ios-preflight`
- `Overall: PASS`
- `Manual handoff ready: YES`

## Manual Handoff (non-automated in v1)

After preflight is PASS, hand off manually to the `legato-ios-core` maintainers/repo owners:

1. Create/push the release tag in `legato-ios-core` using approved maintainer credentials.
2. Publish the Swift package release in the remote repository.
3. Confirm release notes and ownership policy compliance.

Manual responsibilities stay outside this repo by design:

- tag authority and protected branch/release permissions
- remote secret/token ownership
- publication approvals in external systems

## Runbook Checklist Artifact

Attach this checklist in the PR/release ticket before manual iOS handoff:

| Item | Evidence |
|---|---|
| Release tag submitted to preflight | Tag value used in command (example: `v0.1.1`) |
| Preflight summary output | Captured terminal output showing `Overall: PASS` |
| Link/path to the output attached in PR | Relative path or CI artifact URL |
| Manual handoff confirmation | Comment/checklist note naming maintainer + handoff timestamp |

If any checklist item is missing, iOS manual handoff is blocked.
