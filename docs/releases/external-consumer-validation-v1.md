# External Consumer Validation V1 — Release Checklist

This runbook validates packaging/wiring behavior for a disposable external consumer. It is **NOT publication proof**.

## Scope Boundaries (v1)

- Validate installability from local `npm pack` tarballs.
- Run in a fixture app outside the monorepo root.
- Reuse existing native validators against fixture-generated hosts.
- Do **not** treat this as npm publication, provenance, or registry proof.

## Local Command Sequence

Run from `apps/capacitor-demo`:

1. `npm run build`
2. `npm run validate:external:consumer`
3. `npm run capture:release:native-artifacts`
4. `npm run validate:release:native-artifacts`

## Expected Artifacts

- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/summary.json`
- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/run-manifest.json`
- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/install-metadata.json`
- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/cap-sync.log`
- `apps/capacitor-demo/artifacts/external-consumer-validation-v1/validator-summary.txt`
- `apps/capacitor-demo/artifacts/release-native-artifact-foundation-v1/manifest.json`

## Evidence Interpretation

`summary.json` must report PASS for:

- `isolation`
- `installability`
- `typecheckAndSync`
- `validatorReuse`

Any FAIL blocks release readiness.
