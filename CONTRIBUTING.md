# Contributing to legato

Thanks for contributing.

## Before opening a PR

1. Open or link an issue first.
2. For implementation PRs, issue status must be `approved`.
3. Use a branch name in the form `type/description` (lowercase `a-z0-9._-`).
4. Use conventional commits.

## Pull request checklist

- Include `Closes #<issue>` / `Fixes #<issue>` / `Resolves #<issue>` in PR body.
- Add exactly one `type:*` label (`type:feature`, `type:bug`, `type:docs`, `type:chore`).
- Keep release workflows untouched unless your issue explicitly targets release automation.
- Run relevant validation checks locally before asking for review.

## Scope discipline

Legato uses focused scope and contracts for release and runtime safety. Keep changes minimal and evidence-driven.
