# Android Deprecation Hardening v1 — Validation

## Node test validations

### Plugin Gradle contract

Command:

`node --test ./scripts/__tests__/android-build-gradle.test.mjs`

Result:

- ✅ Passes.
- Confirms plugin module keeps `buildscript` + `apply plugin` compatibility path.
- Confirms `defaultConfig` now uses `minSdk =`.

### Demo Gradle hardening checks

Command:

`node --test ./scripts/android-gradle-hardening.test.mjs`

Result:

- ✅ Passes.
- Confirms top-level demo Android build uses `tasks.register("clean", Delete)`.
- Confirms app module uses `plugins { id 'com.android.application' }` and `minSdk`/`targetSdk` DSL while preserving `apply from: 'capacitor.build.gradle'`.

## Kotlin unit validations

Command:

`sh ./gradlew :legato-capacitor:testDebugUnitTest --tests io.legato.capacitor.LegatoCapacitorMapperTest --tests io.legato.capacitor.LegatoPlaybackNotificationTransportTest --tests io.legato.capacitor.LegatoPlaybackServiceBootstrapTest`

Result:

- ✅ Passes.
- Locks mapper optional-string coercion behavior.
- Locks notification action projection after removing unused `state` argument.
- Locks service compatibility helpers (`legacyMediaSessionFlags`, notification action builder helper) and existing media-session projection invariants.

## Scope gates

- ✅ No edits to generated Capacitor files (`capacitor.build.gradle`, `capacitor.settings.gradle`).
- ✅ No media architecture migration landed.

## Phase 5 — Demo harness/manual + external consumer evidence

### 5.1 Demo harness/manual controls evidence

Commands:

- `node --test ./scripts/smoke-automation-docs.test.mjs ./scripts/collect-android-smoke.test.mjs ./scripts/validate-smoke-report.test.mjs`
- `npm run smoke:prep`
- `npm run collect:smoke:android`
- `npm run validate:smoke:android`

Result:

- ✅ Smoke/manual-control guardrail tests pass (`13/13`).
- ✅ Demo smoke prep succeeds (`vite build` + `npx cap sync`).
- ⚠️ Android collector artifact is FAIL because no `LEGATO_SMOKE_REPORT` marker was found in adb logcat (`apps/capacitor-demo/artifacts/android-smoke-report.json`).
- ⚠️ Runtime smoke validation therefore fails: `Overall: FAIL` with collector step `find-marker`.

Interpretation:

- Harness wiring and manual-control documentation guardrails remain intact.
- Device/emulator runtime evidence could not be finalized in this environment because no active log marker-producing smoke session was captured.

### 5.3 External consumer validation (Android preservation-relevant)

Commands:

- `npm run validate:external:consumer`
- `node ./scripts/run-external-consumer-validation.mjs --skip-pack --registry-capacitor @ddgutierrezc/legato-capacitor@0.1.2 --registry-contract @ddgutierrezc/legato-contract@0.1.2 --artifacts-dir ./artifacts/android-deprecation-hardening-v1-external-consumer`

Result:

- ⚠️ Overall status remains `FAIL` in both runs.
- ✅ Android-relevant sub-areas still pass in summary (`registryPreflight`, `isolation`, `installability`, `packedEntrypoints`, `typecheckAndSync`).
- ❌ Failure is concentrated in `validatorReuse` due:
  - documented package-root Node import failure in published contract package (`ERR_MODULE_NOT_FOUND` for `dist/track`), and
  - iOS product identity mismatch reported by validator (`expected .product(name: "LegatoCore", package: "legato-ios-core")`).

Artifacts:

- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/summary.json`
- `apps/capacitor-demo/artifacts/android-deprecation-hardening-v1-external-consumer/summary.json`

### 5.4 Final behavior-preservation gate

- ⚠️ **Partially satisfied only**.
- Confirmed in this batch:
  - ✅ no architecture migration landed,
  - ✅ no generated Capacitor file edits landed,
  - ✅ warning/deprecation reduction evidence remains documented vs baseline.
- Still blocking full closure:
  - ❌ runtime Android smoke marker capture (task 5.1) not completed,
  - ❌ external consumer workflow remains red for pre-existing cross-package/iOS validator issues (task 5.3 result not green).

## Phase 5 follow-up — validatorReuse fix batch

### Scope

- Fixed only external-consumer `validatorReuse` blockers from prior run:
  - documented root-import runtime mismatch handling,
  - iOS product identity expectation in native-artifacts validator.

### Commands

- `node --test ./scripts/validate-native-artifacts.test.mjs`
- `node --test ./scripts/run-external-consumer-validation.test.mjs`
- `npm run validate:external:consumer`
- `node ./scripts/run-external-consumer-validation.mjs --skip-pack --registry-capacitor @ddgutierrezc/legato-capacitor@0.1.2 --registry-contract @ddgutierrezc/legato-contract@0.1.2 --artifacts-dir ./artifacts/android-deprecation-hardening-v1-external-consumer-fixcheck`

### Result

- ✅ Script test suites pass after targeted fixes.
- ✅ External consumer validation now reports `status: PASS` and `areas.validatorReuse: PASS` in both default and explicit-registry runs.
- ℹ️ Runtime proof still records `documentedImport.status: FAIL` with known published-contract ESM packaging mismatch (`ERR_MODULE_NOT_FOUND` for `dist/track`), but this known signature is now treated as non-blocking evidence for consumer-adoption flow.

### Artifacts

- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/summary.json`
- `apps/capacitor-demo/artifacts/android-deprecation-hardening-v1-external-consumer-fixcheck/summary.json`
