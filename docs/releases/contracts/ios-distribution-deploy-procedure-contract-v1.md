# iOS Distribution Deploy Procedure Contract v1

## Source references

- Orchestration workflow: `.github/workflows/release-control.yml`
- Distribution promotion: `packages/capacitor/scripts/promote-ios-distribution.mjs`
- Contract source: `packages/capacitor/native-artifacts.json`

## Authority boundary

- `legato` is source-of-truth for feature authoring and canonical release narrative.
- `legato-ios-core` is distribution authority for immutable tag publication.

## Contract fields

- `source_of_truth`: `.github/workflows/release-control.yml` (`ios-lane`)
- `publish_step_ref`: `release:ios:publish`
- `verification_step_ref`: `release-ios-execution.mjs verify`
- `durable_evidence_ref`: `https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v<version>`
- `rollback_or_hold_rule`: immutable existing tag returns `already_published`; missing authority token or verify failure blocks/fails lane

## Terminal states

- `published`
- `already_published`
- `blocked`
- `failed`
- `not_selected`
