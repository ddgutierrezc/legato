# Open Source Repository Setup Tooling

This tooling applies an inspect → plan → apply workflow with non-destructive defaults.

## Commands

From repository root:

```bash
node tooling/open-source-repository-setup/inspect.mjs
node tooling/open-source-repository-setup/apply.mjs plan
node tooling/open-source-repository-setup/apply.mjs apply-files-only
node tooling/open-source-repository-setup/apply.mjs apply
node tooling/open-source-repository-setup/validate.mjs
```

## Behavior

- `inspect`: read-only snapshot into `out/inspection.json`.
- `plan`: classifies targets as `missing`, `present-compatible`, `present-divergent`, `permission-blocked`.
- `apply-files-only`: writes only local file ops; divergent files are preserved and documented under `out/suggestions/`.
- `apply`: includes API operation execution path, currently dry-run for permission-safe baseline.
- `validate`: emits `out/validation.json`, `out/summary.md`, and `out/final-state.json`.

## Rollback

1. Revert changed files from the current branch.
2. Restore API settings manually using the blocker list and repository settings UI.
