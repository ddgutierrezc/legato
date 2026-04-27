# iOS Derivative Release Template

## iOS Distribution Summary
- release_id: `<required>`
- canonical_legato_release: `<required, https://github.com/ddgutierrezc/legato/releases/tag/release/<release_id>>`
- canonical_changelog_anchor: `CHANGELOG.md#<required-anchor>`
- ios_distribution_release: `<required, https://github.com/ddgutierrezc/legato-ios-core/releases/tag/v<version>>`

## Distribution Facts
- package_name: `<required>`
- product: `<required>`
- version: `<required>`
- terminal_status: `<published|already_published|blocked|failed>`

## Notes
- Do not restate cross-platform canonical narrative here.
- Link to canonical `legato` communication for breaking changes and broad upgrade guidance.
