# legato
La metáfora es perfecta: en música, legato significa tocar notas de forma suave y continua, sin interrupciones entre ellas — exactamente lo que hace tu librería: audio que fluye sin interrupciones entre frameworks.

## Demo apps

- `apps/capacitor-demo`: minimal Capacitor v8 host scaffold showing TypeScript-level wiring for `@ddgutierrezc/legato-capacitor`.

## Milestones

- 2026-04-19: first successful **Android Capacitor smoke** in a real host app for `@ddgutierrezc/legato-capacitor` minimal flow.
  - See: `specs/milestones/2026-04-19-android-capacitor-smoke.md`
- 2026-04-19: generated **iOS Capacitor host scaffold** for `apps/capacitor-demo` with Capacitor-managed SPM plugin wiring (`CapacitorLegato`, no direct host `LegatoCore` link required).

## Architecture decisions

### Native dependency composition

Legato currently uses **manual dependency composition** on both Android and iOS:

- **Android**: `LegatoAndroidCoreDependencies` + `LegatoAndroidCoreFactory.create(...)`
- **iOS**: `LegatoiOSCoreDependencies` + `LegatoiOSCoreFactory.make(...)`

This means the project relies on:

- constructor injection,
- explicit dependency bags,
- manual composition roots/factories,
- and a small number of explicit shared coordinators where lifecycle sharing is required.

### Why we are not using DI containers today

For the current size and lifecycle shape of the project, we are **not** adopting Koin/Swinject/Factory as runtime containers yet.

Rationale:

- the native graph is still relatively small and explicit,
- the current factories are readable and predictable,
- Capacitor plugin lifecycle is bridge/service-driven and does not automatically become simpler with a container,
- most recent bugs were runtime/lifecycle issues, not missing-container issues,
- constructor injection is already in place, so testability and future migration remain possible.

### Re-evaluation trigger

We should revisit DI containers only if one or more of these become true:

- composition roots become large enough that manual factories stop being readable,
- shared scopes/lifecycles multiply beyond plugin + service coordination,
- test setup cost becomes dominated by manual graph assembly,
- we start adding many environment-specific implementations that are hard to wire explicitly.

Until then, **manual composition is the project standard**.
