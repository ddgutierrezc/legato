# Package documentation foundation v1 source map

Verified documentation claims MUST map to source files below.

## JSDoc completeness validator ownership

Source: `packages/capacitor/scripts/assert-package-entries.mjs`

- `collectRootExportInventory` resolves root exports from each package `src/index.ts` using TypeScript symbol resolution.
- `validateDeclarationJsdocCoverage` validates retained docs in emitted `dist/index.d.ts` and linked declaration files.
- Failure output includes `symbol`, `category`, `declFile`, `sourceFile`, and `missing[]` fields.
- `sourceFile` comes from `.d.ts.map` sources when available.

Allowed evidence sources for public API documentation claims:

- Public type signatures in `packages/*/src/**/*.ts`.
- Runtime behavior directly observable in `packages/capacitor/src/{plugin,events,sync}.ts`.
- Contract semantics and invariants in `packages/contract/src/**/*.ts`.
- Existing maintainer source-map files under `docs/maintainers/`.

## Contract package export map

Source: `packages/contract/src/index.ts`

- Re-export modules: `track`, `state`, `queue`, `snapshot`, `errors`, `capability`, `invariants`
- Event constants: `PLAYER_EVENT_NAMES`, `MEDIA_SESSION_EVENT_NAMES`, `LEGACY_PLAYER_EVENT_NAMES`, `LEGATO_EVENT_NAMES`
- Event types and payload maps from `events.ts`

Source: `packages/contract/src/events.ts`

- `PLAYER_EVENT_NAMES` playback events
- `MEDIA_SESSION_EVENT_NAMES` remote events
- `LEGACY_PLAYER_EVENT_NAMES` union set
- `LEGATO_EVENT_NAMES` alias of `LEGACY_PLAYER_EVENT_NAMES`

Source: `packages/contract/package.json`

- Public package boundary is root-only via `exports["."]`.
- Undocumented deep import subpaths are intentionally unsupported.

Triage flow for JSDoc readiness failures in contract package:

1. Run `npm run build && npm run readiness:entries` in `packages/contract`.
2. Read failing `symbol`/`missing[]` entries.
3. Open `sourceFile` from failure output and add source-backed JSDoc.
4. Rebuild and rerun readiness until `documentedSymbols === totalSymbols`.

Source: `apps/capacitor-demo/scripts/run-external-consumer-validation.mjs`

- Packed/runtime proof executes `import('@ddgutierrezc/legato-contract')` and requires success.
- Packed/runtime proof executes deep import attempts and requires export-map rejection (`ERR_PACKAGE_PATH_NOT_EXPORTED`).

## Capacitor package export map

Source: `packages/capacitor/src/index.ts`

- Runtime entry points: `Legato`, `audioPlayer`, `mediaSession`
- Event helper exports: `AUDIO_PLAYER_EVENTS`, `MEDIA_SESSION_EVENTS`, `LEGATO_EVENTS`
- Listener helpers: `addAudioPlayerListener`, `addMediaSessionListener`, `addLegatoListener`
- Sync helpers: `createAudioPlayerSync`, `createLegatoSync`

Source: `packages/capacitor/src/plugin.ts`

- Confirms `audioPlayer` and `mediaSession` boundaries route through shared plugin delegate.

Triage flow for JSDoc readiness failures in capacitor package:

1. Run `npm run build && npm run readiness:entries` in `packages/capacitor`.
2. Use failure `declFile`/`sourceFile` to locate missing docs.
3. Update source JSDoc in `src/{definitions,plugin,events,sync}.ts` or contract aliases exposed through `definitions.ts`.
4. Rebuild and rerun readiness until `documentedSymbols === totalSymbols`.

## CLI command map

Source: `packages/capacitor/src/cli/native-setup-cli.mjs` (`printUsage`)

- `legato native doctor [--json]`
- `legato native configure --dry-run [--json]`
- `legato native configure --apply [--json]`

CLI scope note from source:

- Repo-owned maintainer CLI.
- Does not mutate Capacitor-generated files such as `ios/App/CapApp-SPM/**`.
