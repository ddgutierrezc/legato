# Publication Pipeline V1 — Validation Evidence (Local)

Date: 2026-04-23  
Change: `publication-pipeline-v1`

This artifact captures the ordered local validation run required before a real publish attempt.

## 1) Android preflight

Command:

```bash
npm run release:android:preflight
```

Result:

```text
Mode: preflight
Overall: PASS
Expected coordinate: dev.dgutierrez:legato-android-core:0.1.0
Resolved coordinate: dev.dgutierrez:legato-android-core:0.1.0
```

## 2) Android publish (credential boundary check)

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
- Missing: ORG_GRADLE_PROJECT_signingInMemoryKey or SIGNING_KEY
- Missing: ORG_GRADLE_PROJECT_signingInMemoryKeyPassword or SIGNING_PASSWORD
```

Interpretation: expected in local/dev environments without release secrets.

## 3) Android verify (post-publish resolver gate)

Command:

```bash
npm run release:android:verify
```

Result:

```text
Mode: verify
Overall: FAIL
Expected coordinate: dev.dgutierrez:legato-android-core:0.1.0
POM URL: https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.0/legato-android-core-0.1.0.pom
Failures:
- Android publish verification failed: Maven Central returned HTTP 404 for the expected POM URL.
```

Interpretation: expected until first real publish occurs.

## 4) iOS preflight

Command:

```bash
IOS_RELEASE_TAG=v0.1.0 npm run release:ios:preflight
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
