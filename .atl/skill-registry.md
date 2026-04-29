# Skill Registry

**Delegator use only.** Any agent that launches sub-agents reads this registry to resolve compact rules, then injects them directly into sub-agent prompts. Sub-agents do NOT read this registry or individual SKILL.md files.

## User Skills

| Trigger | Skill | Path |
|---------|-------|------|
| When wiring or debugging Capacitor iOS SPM plugins, CapApp-SPM autoload, package naming, packageClassList, or UNIMPLEMENTED plugin issues | capacitor-ios-spm | /home/david/development/repositories/legato/legato/.agents/skills/capacitor-ios-spm/SKILL.md |
| When native Capacitor/Android/iOS behavior changes and the app-side test UI should be updated to make validation easier | capacitor-native-test-harness | /home/david/development/repositories/legato/legato/.agents/skills/capacitor-native-test-harness/SKILL.md |
| When given a repository URL, source code, or existing docs to audit/generate | oss-documenter | /home/david/development/repositories/legato/legato/.agents/skills/oss-documenter/SKILL.md |
| Before any Android/npm/iOS artifact publish, GitHub Release create/edit, CHANGELOG.md update, release-note generation, release evidence reconciliation, derivative iOS release note handling, or any request to explain/document what changed in a release | release-communications | /home/david/development/repositories/legato/legato/.agents/skills/release-communications/SKILL.md |
| When creating a GitHub issue, reporting a bug, or requesting a feature | issue-creation | /home/david/.config/opencode/skills/issue-creation/SKILL.md |
| When creating a pull request, opening a PR, or preparing changes for review | branch-pr | /home/david/.config/opencode/skills/branch-pr/SKILL.md |
| When writing Go tests, using teatest, or adding test coverage | go-testing | /home/david/.config/opencode/skills/go-testing/SKILL.md |
| When user says "judgment day", "review adversarial", "dual review", "doble review", "juzgar", "que lo juzguen" | judgment-day | /home/david/.config/opencode/skills/judgment-day/SKILL.md |
| When user asks to create a new skill, add agent instructions, or document patterns for AI | skill-creator | /home/david/.config/opencode/skills/skill-creator/SKILL.md |

## Compact Rules

### capacitor-ios-spm
- Follow official Capacitor plugin SPM shape: standard `.library(...)`, no custom `type: .dynamic` unless upstream docs require it
- Treat `ios/App/CapApp-SPM/Package.swift` as CLI-generated — never hand-edit it
- Plugin `Package.swift` must expose exact same package/product names that `CapApp-SPM` requests
- Plugin discovery is class-based: `@objc(PluginClassName)` + `CAPPlugin, CAPBridgedPlugin` + `identifier`, `jsName`, `pluginMethods`
- Verify `ios/App/App/capacitor.config.json` contains plugin class in `packageClassList` after `npx cap sync ios`
- For monorepo local path deps, validate `Package.swift` paths from real consumer entrypoint (`node_modules/...`)
- If Xcode shows `Missing package product 'CapApp-SPM'`, inspect the real SwiftPM resolution error first

### capacitor-native-test-harness
- Treat `apps/capacitor-demo` as a plain HTML/TS native test harness, not a polished product UI
- Always preserve both paths: a one-click smoke flow **and** manual step-by-step controls
- Prefer separate actions for `setup`, `start sync`, `add`, `play`, `pause`, `stop`, `seekTo`, `getSnapshot`
- Keep raw logs copy-friendly (textarea + copy button) and recent events/progress visible
- Show concise snapshot summary plus raw JSON so state and payloads can be inspected quickly
- Use direct audio URLs for AVPlayer smoke validation; avoid redirects when testing audible playback
- After UI/demo changes, refresh native host with `npm run build` + `npm run cap:sync` before testing in Xcode

### oss-documenter
- Follow Diátaxis quadrants: tutorials, how-to, reference, explanation — one quadrant per file, never mix
- Never invent APIs, parameters, or behaviors; mark gaps with `> [!CAUTION] Undocumented — verify with maintainer.`
- One H1 per file. All code blocks have language specifiers. Internal links are relative only
- Keep a Changelog 1.1.0 format: versions latest-first, ISO 8601 dates, sections Added/Changed/Deprecated/Removed/Fixed/Security
- Standard Readme Spec order: Title → Badges → Description → ToC → Background → Install → Usage → API → Contributing → License

### release-communications
- Facts first, narrative second. Separate machine-verifiable facts from human-curated narrative
- Mandatory ordered protocol: `preflight -> publish -> reconcile -> closeout` — no skips, no reorder
- Stop-the-line rules: do NOT publish if version mismatch, missing evidence, missing narrative sections, or failed reconciliation
- Release order: publish `@ddgutierrezc/legato-contract` before `@ddgutierrezc/legato-capacitor`; Maven Android core before npm; iOS distribution tag before canonical release notes
- Root `CHANGELOG.md` is durable truth — never use ephemeral CI artifact links as the only source
- Derivative iOS release notes MUST backlink to canonical `legato` release notes

### issue-creation
- Issue-first enforcement: every PR must reference an issue
- Follow the full workflow in the skill file when creating GitHub issues

### branch-pr
- PR creation workflow following issue-first enforcement system
- Load `issue-creation` skill context before creating PRs if no issue exists

### go-testing
- Go testing patterns for Gentleman.Dots, including Bubbletea TUI testing with teatest
- Use table-driven tests where applicable. Prefer `assert` helpers over manual error checking

### judgment-day
- Parallel adversarial review protocol: two independent blind judges review the same target simultaneously
- Synthesize findings, apply fixes, and re-judge until both pass or escalate after 2 iterations

### skill-creator
- Create new AI agent skills following the Agent Skills spec
- Frontmatter must include: name, description (with trigger), license, metadata (author, version)

## Project Conventions

| File | Path | Notes |
|------|------|-------|
| AGENTS.md | /home/david/.config/opencode/AGENTS.md | Global agent instructions — gentle-ai persona, engram protocol, rules |

No project-level `agents.md`, `CLAUDE.md`, `.cursorrules`, `GEMINI.md`, or `copilot-instructions.md` found in repo root.
