# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- GitHub Release communications contract (facts + required human narrative) wired to release-control evidence.

## [capacitor-publish-0-1-10-001] - 2026-04-27

### Added
- This release publishes the iOS background lifecycle hardening work to the public Capacitor package so host apps benefit from stronger interruption, route-change, and foreground/active reassert behavior.
- Version matrix: npm `@ddgutierrezc/legato-capacitor@0.1.10`, npm `@ddgutierrezc/legato-contract@0.1.5`, Android `dev.dgutierrez:legato-android-core:0.1.3`, iOS `LegatoCore@0.1.2`.
- Improved interruption and route-change handling while process is alive.
- Adds lifecycle reassertion support for foreground/active transitions.
- Aligns package distribution with `legato-ios-core` release `v0.1.2`.
- Durable evidence: https://www.npmjs.com/package/@ddgutierrezc%2Flegato-capacitor/v/0.1.10, https://www.npmjs.com/package/@ddgutierrezc%2Flegato-contract/v/0.1.5, https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.3/, https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.2.

### Changed
- User impact: Capacitor consumers on iOS get more stable playback lifecycle behavior while the process stays alive, plus the package now points to `LegatoCore` distribution `v0.1.2` for the corresponding native core changes.
- Upgrade notes: Upgrade to `@ddgutierrezc/legato-capacitor@0.1.10`. No `@ddgutierrezc/legato-contract` change is required. Regenerate or resync iOS hosts if you want the latest package-distributed lifecycle behavior and distribution reference updates.
- Breaking changes: None.

## [R-2026.04.26.1] - 2026-04-26

### Added
- Established durable root changelog baseline for cross-surface release communication.
- Captured version baseline from source-backed manifests: npm `@ddgutierrezc/legato-capacitor@0.1.9`, npm `@ddgutierrezc/legato-contract@0.1.5`, Android `dev.dgutierrez:legato-android-core:0.1.3`, iOS `LegatoCore@0.1.1`.

### Changed
- Standardized release narrative requirements so "Why it matters", "User impact", "Upgrade notes", and "Breaking changes" are always explicit.

### Fixed
- Removed silent drift path by introducing release-note/changelog/version reconciliation checks across package/native manifests and release facts.

### Security
- Kept ephemeral CI artifact links informational only; durable package/repository evidence is now required for factual release claims.

### Added
- Durable evidence references for this release: npm capacitor https://www.npmjs.com/package/@ddgutierrezc/legato-capacitor/v/0.1.9, npm contract https://www.npmjs.com/package/@ddgutierrezc/legato-contract/v/0.1.5, Android Maven https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.3/, iOS tag https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.1.
- Canonical manifest references recorded: `packages/capacitor/native-artifacts.json`, `packages/capacitor/package.json`, `packages/contract/package.json`.
