# React Native Parity Readiness Checklist

This checklist is the parity proof scaffold for `expo-react-native-parity-v1`.

## Required evidence paths

- `packages/react-native/docs/evidence/phase4-3-expo-host-validation-2026-05-02.md`
- `packages/react-native/scripts/__tests__/expo-parity-surface.test.mjs` execution record (`node --test`)
- `packages/react-native` full package Jest execution record (`npm test -- --runInBand`)

## Scenario checklist (must be explicit pass/fail)

- [x] Baseline API export inventory parity verified
- [x] Public type strictness verified (invalid payloads fail compile-time)
- [x] iOS Expo dev-build runtime scenario evidence attached
- [x] Android Expo dev-build runtime scenario evidence attached
- [x] Queue/state/snapshot/event semantic parity outcomes logged
- [x] Any mismatch disposition documented with owner + resolution status

## Evidence mapping

- API/type/doc parity checks: `node --test packages/react-native/scripts/__tests__/expo-parity-surface.test.mjs` → pass (15 tests)
- Runtime semantic parity checks: `npm test -- --runInBand src/__tests__/sync-behavior-parity.test.ts src/__tests__/legato-wrapper-contract.test.ts` → pass
- Full package quality gate: `npm test -- --runInBand` in `packages/react-native` → pass (6 suites, 21 tests)
- iOS/Android Expo dev-build runtime evidence: `packages/react-native/docs/evidence/phase4-3-expo-host-validation-2026-05-02.md`

## Mismatch disposition

- Status: **No open parity mismatches** for the baseline scope in this milestone.
- Owner: React Native package maintainers.
- Resolution status: Verified by executable parity tests plus Expo host validation evidence.

## Parity claim gate

If any required scenario is missing a pass/fail outcome, if evidence links are absent, or if mismatch disposition is undocumented, **parity claim must be blocked**.

Parity can be declared only when all checklist items above are complete and traceable. Current status: **ready**.
