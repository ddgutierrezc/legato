# Package documentation foundation v1 source map

Verified documentation claims MUST map to source files below.

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

## CLI command map

Source: `packages/capacitor/src/cli/native-setup-cli.mjs` (`printUsage`)

- `legato native doctor [--json]`
- `legato native configure --dry-run [--json]`
- `legato native configure --apply [--json]`

CLI scope note from source:

- Repo-owned maintainer CLI.
- Does not mutate Capacitor-generated files such as `ios/App/CapApp-SPM/**`.
