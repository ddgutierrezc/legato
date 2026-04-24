# Publication Pipeline V1 — Validation Evidence (Local)

Date: 2026-04-23  
Change: `publication-pipeline-v1`

This artifact captures the ordered local validation run plus the real publish/verify closeout evidence for Android `0.1.1`.

## 2026-04-23 — publication-execution-v1 / Batch A (preflight readiness)

Command (run from `apps/capacitor-demo`):

```bash
npm run release:android:preflight
```

Raw output:

```text
> @legato/capacitor-demo@0.1.1 release:android:preflight
> node ../../native/android/core/scripts/release-android.mjs preflight --contract ../../packages/capacitor/native-artifacts.json --build-gradle ../../native/android/core/build.gradle --project-dir ../../native/android/core

Mode: preflight
Overall: PASS
Expected coordinate: dev.dgutierrez:legato-android-core:0.1.1
Resolved coordinate: dev.dgutierrez:legato-android-core:0.1.1
```

Interpretation: preflight gate is ready for first maintainer-run Android publish attempt; publish/verify/evidence steps were intentionally not executed in this batch.

## 2026-04-24 — publication-execution-v1 / Batch C closeout (real publish + verify)

Status: `success`

Closeout evidence (completed publication `0.1.1`):

- Operator: `Daniel Gutierrez (dgutierrez)`
- Commit SHA used for release runbook closeout: `19c7f96`
- Publish start UTC: `2026-04-24T00:54:42Z` (first published POM `Last-Modified`)
- Publish end UTC: `2026-04-24T01:09:17Z` (`maven-metadata.xml` `lastUpdated`)
- Verify confirmation UTC: `2026-04-24T01:19:58Z` (repo verify rerun)
- Verify attempt window: `2026-04-24T00:54:42Z` → `2026-04-24T01:19:58Z`
- Target coordinate: `dev.dgutierrez:legato-android-core:0.1.1`
- Portal namespace URL: `https://central.sonatype.com/namespace/dev.dgutierrez`
- POM URL: `https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.1/legato-android-core-0.1.1.pom`
- Release outcome: `success`

Verification evidence snapshots:

```text
$ npm run release:android:verify
Mode: verify
Overall: PASS
Expected coordinate: dev.dgutierrez:legato-android-core:0.1.1
Resolved coordinate: dev.dgutierrez:legato-android-core:0.1.1
POM URL: https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.1/legato-android-core-0.1.1.pom
```

```text
$ curl -sI https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.1/legato-android-core-0.1.1.pom
HTTP/2 200
last-modified: Fri, 24 Apr 2026 00:54:42 GMT
```

```text
$ curl -s https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/maven-metadata.xml
<lastUpdated>20260424010917</lastUpdated>
```

## 1) Android preflight (local rehearsal)

Command:

```bash
npm run release:android:preflight
```

Result:

```text
Mode: preflight
Overall: PASS
Expected coordinate: dev.dgutierrez:legato-android-core:0.1.1
Resolved coordinate: dev.dgutierrez:legato-android-core:0.1.1
```

## 2) Android publish (local credential boundary check)

Command:

```bash
npm run release:android:publish
```

Result:

```text
Mode: publish
Overall: FAIL
Failures:
- Publish blocked: missing required Maven Central/signing credentials.
- Missing: ORG_GRADLE_PROJECT_mavenCentralUsername or MAVEN_CENTRAL_USERNAME
- Missing: ORG_GRADLE_PROJECT_mavenCentralPassword or MAVEN_CENTRAL_PASSWORD
```

Interpretation: expected in local/dev environments without release secrets.

Signing backend note for first real publish attempt:

- Preferred path is local GPG (`SIGNING_GNUPG_KEY_NAME`, optional `SIGNING_GNUPG_PASSPHRASE`, optional executable/home-dir overrides).
- In-memory key aliases remain available as fallback only.

## 3) Android verify (local post-publish resolver gate)

Command:

```bash
npm run release:android:verify
```

Result:

```text
Mode: verify
Overall: FAIL
Expected coordinate: dev.dgutierrez:legato-android-core:0.1.1
POM URL: https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.1/legato-android-core-0.1.1.pom
Failures:
- Android publish verification failed: Maven Central returned HTTP 404 for the expected POM URL.
```

Interpretation: expected until first real publish occurs.

## 4) iOS preflight

Command:

```bash
IOS_RELEASE_TAG=v0.1.1 npm run release:ios:preflight
```

Result:

```text
Mode: ios-preflight
Overall: PASS
Manual handoff ready: YES
```

## 5) Namespace migration scope safety

Command:

```bash
npm run release:scope:check
```

Result:

```text
Overall: PASS
Needle: dev.dgutierrez
Scanned files: 34
Expected matches: 6
Unexpected matches: 0
```

Interpretation: no `dev.dgutierrez` leakage into out-of-scope files for this v1 migration.
