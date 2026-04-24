# NPM Tech-Preview Checklist (v1)

This checklist defines the **go/no-go** contract for publishing the first npm tech-preview of `@ddgutierrezc/legato-contract` and `@ddgutierrezc/legato-capacitor`.

## Risk Posture

- This is a **tech-preview** release, not a production hardening claim.
- Publish only if readiness checks pass from packed artifacts (not repo paths).
- If any readiness gate fails post-release, rollback by deprecating the broken version and republishing a fixed patch.
- Do not promote as production-ready until native/runtime parity and extended install matrix verification are complete.

## Blocking Readiness Gates (must all pass)

Run from `apps/capacitor-demo`:

1. `npm run validate:npm:readiness`
   - Packs `@ddgutierrezc/legato-contract` + `@ddgutierrezc/legato-capacitor` tarballs.
   - Enforces tarball hygiene (`dist` truth + forbidden transient output such as `android/build/**`).
   - Runs external-consumer install + typecheck + `cap add/sync` using those tarballs.
2. `npm run test:npm:readiness`
   - Verifies workflow contract and checklist documentation are still aligned with the gate.

Any FAIL is a **NO-GO** for publication.

## Control-plane npm policy modes

When npm is selected from the release control plane, one explicit mode is required:

- `readiness`: checks only, never publish.
- `release-candidate`: checks plus candidate evidence capture.
- `protected-publish`: publish-capable intent that still requires explicit publish intent evidence.

If `protected-publish` is requested without publish intent evidence, the lane returns `policy_blocked` and the run is a NO-GO.

### Expected PASS/FAIL signals (CI-parity order)

1. `validate:npm:readiness`
   - PASS: exits `0`, emits `apps/capacitor-demo/artifacts/npm-release-readiness-v1/{contract-pack-summary.json,capacitor-pack-summary.json}` and external consumer `summary.json` with all areas `PASS`.
   - FAIL: non-zero exit, and at least one failing contract message (missing `dist` entry, forbidden tarball path like `android/build/**`, or external-consumer sync/typecheck failure).
2. `test:npm:readiness`
   - PASS: all Node tests green (workflow + docs + tarball consumer contracts).
   - FAIL: any drift in workflow trigger/gate commands or checklist language breaks tests and blocks merge.

## CI Enforcement

- Workflow: `.github/workflows/npm-release-readiness.yml`
- Expected outcome: PRs touching package/release-readiness surfaces must pass `npm-readiness` before merge.
- Repository admins must configure this workflow job as a required blocking check in branch protection.

## Manual Release Sign-off Template

- Candidate version(s): `@ddgutierrezc/legato-contract@<version>`, `@ddgutierrezc/legato-capacitor@<version>`
- Readiness run URL / local evidence path:
- `validate:npm:readiness`: PASS/FAIL
- `test:npm:readiness`: PASS/FAIL
- Noted risks accepted for tech-preview:
- Final decision: GO / NO-GO
