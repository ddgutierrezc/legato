# Changelog
All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- GitHub Release communications contract (facts + required human narrative) wired to release-control evidence.
- Canonical `1.0.0` decision artifacts published under `docs/releases/`: criteria (`v1-release-criteria-v1.md`), gap matrix (`v1-release-gap-matrix-v1.md`), deferrals (`v1-release-deferral-register-v1.md`), and final verdict record (`v1-release-go-no-go-record-v1.md`).

## [1.0.0] - 2026-04-28

### Added
- First stable **Capacitor-first** Legato release line published across npm, Maven Central, and iOS distribution.
- Stable public package line:
  - `@ddgutierrezc/legato-contract@1.0.0`
  - `@ddgutierrezc/legato-capacitor@1.0.0`
- Stable native distribution line:
  - `dev.dgutierrez:legato-android-core:1.0.0`
  - `legato-ios-core v1.0.0`
- Durable 1.0.0 release governance, changelog, and GitHub release communication flow.

### Changed
- Android and iOS runtimes are now aligned enough to support the declared 1.0.0 Capacitor-first contract.
- Consumer validation, public API JSDoc, authenticated media requests, and streaming semantics are now part of the supported release baseline.

### Fixed
- Closed the gap between package API promises and runtime behavior for authenticated media headers.
- Closed key observable parity gaps between Android and iOS for capabilities, seekability, and playback semantics.

### Security
- No new security capability claims beyond the documented scope; advanced DRM/token-refresh remain explicitly out of scope for 1.0.0.

## [contract-publish-1-0-0-001] - 2026-04-28

### Added
- This is the first stable 1.0.0 release of the Legato shared contract package for Capacitor-first consumers.
- Version matrix: npm `@ddgutierrezc/legato-capacitor@1.0.0`, npm `@ddgutierrezc/legato-contract@1.0.0`, Android `dev.dgutierrez:legato-android-core:1.0.0`, iOS `LegatoCore@1.0.0`.
- Stabilizes the public contract surface for Capacitor-first 1.0.0.
- Includes authenticated media request and streaming semantics support in the contract model.
- Aligns with the current runtime parity and lifecycle milestones.
- Durable evidence: https://www.npmjs.com/package/@ddgutierrezc%2Flegato-capacitor/v/1.0.0, https://www.npmjs.com/package/@ddgutierrezc%2Flegato-contract/v/1.0.0, https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/1.0.0/, https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v1.0.0.

### Changed
- User impact: Consumers now have a stable 1.0.0 contract surface covering events, capabilities, streaming semantics, and authenticated media request fields used by the current platform runtimes.
- Upgrade notes: Upgrade to @ddgutierrezc/legato-contract@1.0.0. Downstream packages should align to the 1.0.0 line.
- Breaking changes: None relative to the final 0.1.x line; 1.0.0 formalizes the existing stable contract.

## [capacitor-publish-0-1-11-002] - 2026-04-28

### Added
- This release delivers authenticated media request support and explicit streaming media semantics to the published Capacitor package, aligning the runtime behavior with the public API and support matrix.
- Version matrix: npm `@ddgutierrezc/legato-capacitor@0.1.11`, npm `@ddgutierrezc/legato-contract@0.1.7`, Android `dev.dgutierrez:legato-android-core:0.1.4`, iOS `LegatoCore@0.1.3`.
- Honors static per-track request headers in Android and iOS playback.
- Makes streaming vs non-streaming semantics explicit and validated.
- Aligns package distribution with Android core 0.1.4 and iOS distribution v0.1.3.
- Durable evidence: https://www.npmjs.com/package/@ddgutierrezc%2Flegato-capacitor/v/0.1.11, https://www.npmjs.com/package/@ddgutierrezc%2Flegato-contract/v/0.1.7, https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.4/, https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.3.

### Changed
- User impact: Capacitor consumers can now rely on per-track request headers in real playback requests, and on clearer streaming/non-streaming capability, duration, and seek semantics across Android and iOS.
- Upgrade notes: Upgrade to @ddgutierrezc/legato-capacitor@0.1.11 and pair it with @ddgutierrezc/legato-contract@0.1.7. No extra artifact selection is required beyond the package update.
- Breaking changes: None.

## [contract-publish-0-1-7-004] - 2026-04-27

### Added
- This release publishes the streaming semantics update for the shared contract package so downstream bindings and consumers rely on a clear, source-backed model for capabilities, duration, seekability, and media-type semantics.
- Version matrix: npm `@ddgutierrezc/legato-capacitor@0.1.10`, npm `@ddgutierrezc/legato-contract@0.1.7`, Android `dev.dgutierrez:legato-android-core:0.1.3`, iOS `LegatoCore@0.1.2`.
- Clarifies capability and seekability semantics by media type.
- Aligns duration expectations for streaming-like media.
- Provides the semantic contract used by the current Capacitor runtimes.
- Durable evidence: https://www.npmjs.com/package/@ddgutierrezc%2Flegato-capacitor/v/0.1.10, https://www.npmjs.com/package/@ddgutierrezc%2Flegato-contract/v/0.1.7, https://repo1.maven.org/maven2/dev/dgutierrez/legato-android-core/0.1.3/, https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v0.1.2.

### Changed
- User impact: Consumers of `@ddgutierrezc/legato-contract` now receive the updated streaming/non-streaming semantics used by current runtime parity and playback behavior across platforms.
- Upgrade notes: Upgrade to `@ddgutierrezc/legato-contract@0.1.7`. Downstream packages that depend on the contract should align to this version to get the clarified semantics model.
- Breaking changes: None.

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
