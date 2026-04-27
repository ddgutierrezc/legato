# Release Note Template Governance v1

## Ownership

- Canonical template owner: `legato` (`.github/release-template.md`).
- Derivative template owner: `legato` policy for `legato-ios-core` (`ios-derivative-release-template.md`).

## Allowed edits

- Allowed: clarity edits that preserve required sections/fields.
- Allowed: additional factual bullets when each claim has durable evidence.
- Not allowed: removing required human narrative fields.
- Not allowed: changing canonical authority from `legato`.
- Not allowed: derivative notes redefining cross-platform narrative.

## Synchronization rules

1. Canonical and derivative templates MUST stay synchronized on release identifiers and backlink semantics.
2. If canonical sections change, update derivative template guidance in the same PR.
3. Reconciliation tests MUST pass after template changes.

## References

- `.github/release-template.md`
- `docs/releases/templates/ios-derivative-release-template.md`
- `docs/releases/release-communication-governance-v1.md`
- `docs/releases/release-notes-policy-v1.md`
