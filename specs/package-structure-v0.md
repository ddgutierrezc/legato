# Package Structure v0

## Top-Level Layout
- `apps/`
- `docs/architecture/`
- `docs/guides/`
- `native/android/core/`
- `native/ios/LegatoCore/`
- `packages/contract/`
- `packages/capacitor/`
- `packages/react-native/`
- `packages/flutter/legato/`
- `specs/`
- `tooling/`

## Package Intent
- `packages/contract`: canonical API model and constants.
- `packages/capacitor`: Capacitor binding layer.
- `packages/react-native`: React Native binding layer.
- `packages/flutter/legato`: Flutter binding package.

## Rule
Contract package is the source-of-truth. Other packages consume it.
