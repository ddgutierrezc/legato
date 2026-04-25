# External Consumer Validation V2 — Registry-First Release Gate

This runbook is the release gate that proves Legato is adoptable from the **public npm registry** by a clean Ionic + Capacitor consumer app.

## Scope Boundaries (v2)

- Registry-first release gate: npm metadata is the source of truth.
- Manual proof in `/Volumes/S3/daniel/github/legato-consumer-smoke` is required before automation is accepted.
- Native validation must inspect consumer-owned/generated artifacts (`android/settings.gradle`, `ios/App/CapApp-SPM/Package.swift`, `ios/App/App/capacitor.config.json`).
- Do NOT use `file:`, workspace, tarball, or `link:` dependencies as consumer-adoption evidence.

## Phase 0 — Registry peer/version alignment blocker

Run in any shell with npm access:

1. `npm view @ddgutierrezc/legato-capacitor version peerDependencies --json`
2. `npm view @ddgutierrezc/legato-contract versions --json`

### Baseline mismatch evidence

- Observed capacitor metadata: `version=0.1.2`, peer `@ddgutierrezc/legato-contract=^0.1.2`.
- Observed contract versions: `["0.1.1", "0.1.2"]`.
- Historical note: before `@ddgutierrezc/legato-contract@0.1.2` was published, this gate correctly failed.

### Current compatible pair for active proof

- `@ddgutierrezc/legato-capacitor@0.1.2`
- `@ddgutierrezc/legato-contract@0.1.2`

Phase 1 is allowed only when the selected versions are peer-compatible from npm metadata.

## Phase 1 — Manual proof in real consumer app

Run from `/Volumes/S3/daniel/github/legato-consumer-smoke`:

1. Guardrails: confirm `package.json` contains no `file:`, `workspace:`, `.tgz`, or `link:` values.
2. Install from npm only:
   - `npm install --no-audit --no-fund @ddgutierrezc/legato-contract@0.1.2 @ddgutierrezc/legato-capacitor@0.1.2`
3. Compile baseline:
   - `npm run build`
4. Capacitor onboarding:
   - `npx cap add android`
   - `npx cap add ios`
   - `npx cap sync ios android`
5. Native discovery checks:
   - Android: verify consumer `android/settings.gradle` and installed plugin `node_modules/@ddgutierrezc/legato-capacitor/android/build.gradle`.
   - iOS: verify `ios/App/CapApp-SPM/Package.swift` and `ios/App/App/capacitor.config.json` includes `packageClassList` with `LegatoPlugin`.

## Phase 2 — Automation parity with manual flow

Run from `apps/capacitor-demo`:

1. `node ./scripts/run-external-consumer-validation.mjs`
2. `node ./scripts/validate-native-artifacts.mjs ...`

Automation MUST reject local-shortcut proofs and preserve parity with the manual sequence above.

## Required Evidence Artifacts

- Manual command transcript (install, build, cap add/sync) from `legato-consumer-smoke`.
- Consumer lockfile entries resolving to npm registry URLs.
- Consumer Android discovery files: `android/settings.gradle`, `node_modules/@ddgutierrezc/legato-capacitor/android/build.gradle`.
- Consumer iOS discovery files: `ios/App/CapApp-SPM/Package.swift`, `ios/App/App/capacitor.config.json` with `packageClassList`.
- Automation outputs:
  - `apps/capacitor-demo/artifacts/external-consumer-validation-v1/summary.json`
  - `apps/capacitor-demo/artifacts/external-consumer-validation-v1/run-manifest.json`
  - `apps/capacitor-demo/artifacts/external-consumer-validation-v1/dependency-scan.json`

## Release Readiness Checklist

- [ ] Phase 0 npm-view gate passes for selected versions.
- [ ] Phase 1 manual proof captured from `legato-consumer-smoke` with no local shortcut sources.
- [ ] Phase 2 automation report matches manual PASS signals.
- [ ] Manual and automation artifacts are linked in the same release evidence ticket.
