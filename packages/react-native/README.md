# @ddgutierrezc/legato-react-native

Expo Modules binding package for Legato host apps.

## Expo config plugin (milestone 1 baseline)

Add `"@ddgutierrezc/legato-react-native"` to your Expo plugins list to enable baseline native wiring during prebuild.

```json
{
  "expo": {
    "plugins": ["@ddgutierrezc/legato-react-native"]
  }
}
```

### What this plugin automates

- Automates native baseline wiring for Expo prebuild/dev-build hosts.
- iOS: ensures `UIBackgroundModes` includes `audio` exactly once.
- Android: ensures foreground-service permissions and a valid `expo.modules.legato.LegatoPlaybackService` manifest declaration.

### Milestone-1 option surface

- Use the plugin as a plain string entry: `"@ddgutierrezc/legato-react-native"`.
- Milestone 1 does not expose advanced option knobs (no custom channels, no service class overrides, no arbitrary plist/manifest patch options).

### What this plugin does NOT automate

- Does not automate runtime playback orchestration (you still call runtime APIs in app code).
- Does not automate lifecycle handling policy (you still register lifecycle listeners and validate behavior in your app).
- Does not guarantee OEM-specific background reliability beyond baseline native wiring.

### Host boundary

- Expo Go is not supported for native playback validation.
- Supported host for this claim is Expo dev build generated via `expo prebuild` and run with `expo run:ios` / `expo run:android`.

# API documentation

- [Documentation for the latest stable release](https://docs.expo.dev/versions/latest/sdk/@ddgutierrezc/legato-react-native/)
- [Documentation for the main branch](https://docs.expo.dev/versions/unversioned/sdk/@ddgutierrezc/legato-react-native/)

# Installation in managed Expo projects

For [managed](https://docs.expo.dev/archive/managed-vs-bare/) Expo projects, please follow the installation instructions in the [API documentation for the latest stable release](#api-documentation). If you follow the link and there is no documentation available then this library is not yet usable within managed projects &mdash; it is likely to be included in an upcoming Expo SDK release.

# Installation in bare React Native projects

For bare React Native projects, you must ensure that you have [installed and configured the `expo` package](https://docs.expo.dev/bare/installing-expo-modules/) before continuing.

### Add the package to your npm dependencies

```
npm install @ddgutierrezc/legato-react-native
```

### Configure for Android




### Configure for iOS

Run `npx pod-install` after installing the npm package.

# Contributing

Contributions are very welcome! Please refer to guidelines described in the [contributing guide]( https://github.com/expo/expo#contributing).
