# npm Deploy Procedure Contract v1

## Source references

- Workflow: `.github/workflows/release-npm.yml`
- Execution script: `apps/capacitor-demo/scripts/release-npm-execution.mjs`
- Policy lane: `apps/capacitor-demo/scripts/run-npm-release-policy.mjs`

## Modes

- `readiness`
- `release-candidate`
- `protected-publish`

## Contract fields

- `source_of_truth`: `.github/workflows/release-npm.yml`
- `publish_step_ref`: `release:npm:execute protected-publish`
- `verification_step_ref`: `npm view <name>@<version> version --json`
- `durable_evidence_ref`: npm package URL (`https://www.npmjs.com/package/<name>/v/<version>`)
- `rollback_or_hold_rule`: policy lane blocks protected publish when evidence is missing; failed publish/verify maps to `failed`

## Terminal states

- `published`
- `already_published`
- `failed`
- `blocked`
- `not_selected`
