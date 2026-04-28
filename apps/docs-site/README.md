# Legato Docs Site

This app is the canonical **public** documentation surface for Legato.

## Scope

- Public package guidance belongs in `apps/docs-site/src/content/docs/**`.
- Root `README.md` and package READMEs should stay concise and link here for deep docs.
- Maintainer runbooks and release evidence remain canonical in root `docs/`.

## Public-only guardrails

Do not import, transclude, or deep-link these internal-only paths from public docs pages:

- `docs/maintainers/**`
- `docs/releases/notes/**`
- `docs/architecture/spikes/**`

If a page needs maintainer details, summarize the public-safe intent here and point maintainers to root repo docs without copying runbook internals.

## Commands

Run from `apps/docs-site/`:

| Command | Action |
| :-- | :-- |
| `npm run dev` | Start local docs development server |
| `npm run check` | Validate content and type checks |
| `npm run build` | Build docs output |
| `npm run preview` | Preview the production output locally |
