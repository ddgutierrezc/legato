# legato

[![Discord](https://img.shields.io/badge/Discord-Join%20Community-5865F2?logo=discord&logoColor=white)](https://discord.gg/Hhnumyk2N)

Legato provides a contract package and a Capacitor integration package for continuous audio playback flows.

![Texto alternativo](brand.png)



## Which package should I install?

## Package decision matrix

| If you need... | Install | Read first |
|---|---|---|
| Shared playback types/events/contracts with no Capacitor runtime | `@ddgutierrezc/legato-contract` | [`packages/contract/README.md`](packages/contract/README.md) |
| Capacitor plugin runtime + namespaced APIs (`audioPlayer`, `mediaSession`) | `@ddgutierrezc/legato-capacitor` + `@ddgutierrezc/legato-contract` | [`packages/capacitor/README.md`](packages/capacitor/README.md) |

## Install

```bash
npm install @ddgutierrezc/legato-contract
```

or

```bash
npm install @ddgutierrezc/legato-capacitor @ddgutierrezc/legato-contract
```

## Usage

- Contract-only consumers: use shared symbols like `LEGATO_EVENT_NAMES` from `@ddgutierrezc/legato-contract`.
- Capacitor consumers: start from `@ddgutierrezc/legato-capacitor` and use `audioPlayer` / `mediaSession`.

## Releases

- Canonical release timeline: [`CHANGELOG.md`](CHANGELOG.md)
- GitHub Release notes are generated from source-backed facts (`summary.json`, package/native manifests) plus required human narrative fields.

## Maintainers

Maintainer-only scope and operational boundaries are documented in [`docs/maintainers/package-documentation-foundation-v1-scope.md`](docs/maintainers/package-documentation-foundation-v1-scope.md).

## Non-goals for package-documentation-foundation-v1

- Non-goal: runtime behavior expansion in native/player engines.
- Non-goal: release-lane redesign.
- Non-goal: platform bootstrap automation.

## Contributing

If you update README/package docs, also run docs drift checks from `apps/capacitor-demo`.

<!-- OSS_LINKS:START -->
## Community

- [Contributing](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)
<!-- OSS_LINKS:END -->
