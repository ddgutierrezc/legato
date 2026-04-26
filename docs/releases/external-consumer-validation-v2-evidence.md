# External Consumer Validation V3 — Evidence Report

## Phase 0 — Registry alignment baseline

### Command

`npm view @ddgutierrezc/legato-capacitor version peerDependencies --json`

### Output

```json
{
  "version": "0.1.2",
  "peerDependencies": {
    "@capacitor/core": "^8.0.0",
    "@ddgutierrezc/legato-contract": "^0.1.2"
  }
}
```

### Command

`npm view @ddgutierrezc/legato-contract versions --json`

### Output

```json
[
  "0.1.1",
  "0.1.2"
]
```

### Result

- Registry parity now available: latest capacitor (`0.1.2`) peer `@ddgutierrezc/legato-contract@^0.1.2` is satisfiable because contract `0.1.2` is published.
- Historical mismatch (`0.1.2` vs contract-only `0.1.1`) is retained as timeline context, not as active baseline.
- Current compatible published pair: `@ddgutierrezc/legato-capacitor@0.1.2` + `@ddgutierrezc/legato-contract@0.1.2`.

## Phase 1 — Manual proof (`/Volumes/S3/daniel/github/legato-consumer-smoke`)

### Guardrail checks

- Root manifest (`package.json`) uses no `file:`, `workspace:`, `link:`, or tarball dependencies.
- Lockfile proof:
  - `package-lock.json` line 1837 resolves `@ddgutierrezc/legato-capacitor` from npm URL.
  - `package-lock.json` line 1850 resolves `@ddgutierrezc/legato-contract` from npm URL.

### Command outputs (captured logs)

- Install: `artifacts/consumer-adoption-validation-v2/01-npm-install.log`
- Baseline dependency update: `artifacts/consumer-adoption-validation-v2/01b-npm-install-baseline.log`
- Build: `artifacts/consumer-adoption-validation-v2/02-build.log` ✅
- Capacitor add android: `artifacts/consumer-adoption-validation-v2/03-cap-add-android.log` ✅
- Capacitor add ios: `artifacts/consumer-adoption-validation-v2/04-cap-add-ios.log` ✅
- Capacitor sync ios/android: `artifacts/consumer-adoption-validation-v2/05-cap-sync.log` + `05b-cap-sync-android.log` ✅

### Focused re-validation batch (real consumer app)

- Registry-only reinstall confirmation: `artifacts/consumer-adoption-validation-v2/07-npm-install-registry-only.log` ✅
- Installed package tree at root depth: `artifacts/consumer-adoption-validation-v2/08-npm-ls-legato.log` ✅
- App import proof in source: `/Volumes/S3/daniel/github/legato-consumer-smoke/src/pages/Home.tsx` imports both published packages and uses them in rendered output.
- Build after imports: `artifacts/consumer-adoption-validation-v2/10-build.log` ✅
- Fresh iOS sync: `artifacts/consumer-adoption-validation-v2/11-cap-sync-ios.log` ✅
- Fresh Android sync: `artifacts/consumer-adoption-validation-v2/12-cap-sync-android.log` ✅

### Packaging caveat discovered during direct Node import

- Direct Node ESM import check (`artifacts/consumer-adoption-validation-v2/09-node-import-check.log`) fails because package runtime resolves `dist/plugin` without Node-resolvable path in this environment.
- This does **not** invalidate consumer adoption proof for Ionic/Vite integration because the browser build and Capacitor syncs pass with the published packages.

### Android discovery evidence

- Consumer host file: `/Volumes/S3/daniel/github/legato-consumer-smoke/android/settings.gradle`
- Installed plugin file: `/Volumes/S3/daniel/github/legato-consumer-smoke/node_modules/@ddgutierrezc/legato-capacitor/android/build.gradle`

### iOS discovery evidence

- Consumer generated CapApp-SPM: `/Volumes/S3/daniel/github/legato-consumer-smoke/ios/App/CapApp-SPM/Package.swift`
- Consumer generated capacitor config: `/Volumes/S3/daniel/github/legato-consumer-smoke/ios/App/App/capacitor.config.json`
- `packageClassList` contains `LegatoPlugin`.
- Plugin metadata proof:
  - `/Volumes/S3/daniel/github/legato-consumer-smoke/node_modules/@ddgutierrezc/legato-capacitor/Package.swift`
  - `/Volumes/S3/daniel/github/legato-consumer-smoke/node_modules/@ddgutierrezc/legato-capacitor/ios/Sources/LegatoPlugin/LegatoPlugin.swift`

## Phase 2 — Automated parity run

### Command

`node apps/capacitor-demo/scripts/run-external-consumer-validation.mjs --validation-profile manual-consumer-proof --proof-mode consumer-adoption --consumer-root /Volumes/S3/daniel/github/legato-consumer-smoke --skip-pack --registry-capacitor @ddgutierrezc/legato-capacitor@0.1.1 --registry-contract @ddgutierrezc/legato-contract@0.1.1 --artifacts-dir apps/capacitor-demo/artifacts/external-consumer-validation-v1`

### Output summary

- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/summary.json` reports `status=PASS`
- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/summary-cli.json` reports `status=PASS`
- All areas PASS: `registryPreflight`, `isolation`, `installability`, `packedEntrypoints`, `typecheckAndSync`, `validatorReuse`.

### Current 0.1.2 parity run

#### Command

`node apps/capacitor-demo/scripts/run-external-consumer-validation.mjs --validation-profile ci-npm-readiness --proof-mode npm-readiness --consumer-root /Volumes/S3/daniel/github/legato-consumer-smoke --skip-pack --registry-capacitor @ddgutierrezc/legato-capacitor@0.1.2 --registry-contract @ddgutierrezc/legato-contract@0.1.2 --artifacts-dir apps/capacitor-demo/artifacts/external-consumer-validation-v1`

#### Output summary

- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/summary-cli.json` reports `status=PASS`.
- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/install-metadata.json` shows both packages resolved from npm registry at `0.1.2`.

### Boundary acknowledgement

- Manual/real-device playback proof remains required and is attached separately.
- Automated profile output is evidence support, not a full replacement for hands-on validation.

### Native validator proof

- `/Volumes/S3/daniel/github/legato-consumer-smoke/artifacts/consumer-adoption-validation-v2/06-native-validator.log` reports:
  - `Overall: PASS`
  - `android-artifacts: PASS`
  - `ios-artifacts: PASS`
