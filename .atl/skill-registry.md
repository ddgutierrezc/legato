# Skill Registry

## Mandatory Release Context Resolution

For any request that includes release-adjacent intents (`release`, `publish`, `deploy`, `changelog`, `release notes`, `what changed`), the resolver MUST load `.agents/skills/release-communications/SKILL.md` before any execution step.

Release actions MUST follow this ordered protocol and cannot skip steps:

1. `preflight`
2. `publish`
3. `reconcile`
4. `closeout`

If resolution cannot guarantee this load + order contract, execution is blocked.
