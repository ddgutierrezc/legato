# Android Deploy Procedure Contract v1

## Source references

- Workflow: `.github/workflows/release-android.yml`
- Adapter: `apps/capacitor-demo/scripts/release-control-android-adapter.mjs`
- Lane integration: `.github/workflows/release-control.yml`

## Contract fields

- `source_of_truth`: `.github/workflows/release-android.yml`
- `publish_step_ref`: `android-publish`
- `verification_step_ref`: `android-verify`
- `durable_evidence_ref`: `apps/capacitor-demo/artifacts/release-control/<release_id>/android-summary.json`
- `rollback_or_hold_rule`: `preflight-only` lane remains `blocked`; publish/verify failures become `failed`

## Terminal states

- `published`
- `blocked`
- `failed`
- `not_selected`

## Required evidence

- `dispatch.json`
- `preflight.log`
- `publish.log`
- `verify.log`
- `summary.json`
