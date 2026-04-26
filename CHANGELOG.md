# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- GitHub Release communications contract (facts + required human narrative) wired to release-control evidence.

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
