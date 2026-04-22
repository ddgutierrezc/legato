# Native Smoke Validation Template

Use this checklist after syncing the demo app to native hosts.

## Preconditions
- Run `npm run build` and `npm run cap:sync` from `apps/capacitor-demo`.
- Launch the app from Android Studio or Xcode (native bridge required).
- Confirm harness header shows `native=true`.

## Flow Results
| Flow | Verdict | Snapshot Summary | Key Checks | Evidence |
|---|---|---|---|---|
| smoke | PASS/FAIL | `state=... | track=... | position=... | duration=...` | `current track present`, `state is present`, `position available`, `duration available`, `smoke flow ends paused` | Paste from **Copy recent events** + screenshot of verdict panel |
| let-end | PASS/FAIL | `state=... | track=... | position=... | duration=...` | same base checks + `let-end reaches active playback lifecycle` | Paste from **Copy recent events** + screenshot of verdict panel |
| boundary | PASS/FAIL | `state=... | track=... | position=... | duration=...` | same base checks + `boundary flow reaches ended state` | Paste from **Copy recent events** + screenshot of verdict panel |
| artwork-race | PASS/FAIL | `state=... | track=... | ...` + parity `artwork signal: ...` | `rapid switch keeps final artwork aligned`, `fallback track clears artwork`, `no stale artwork after returning to track 2` | Paste **Copy recent events** + screenshot of lock screen/notification artwork before/after race |

## Manual Controls Regression
- [ ] `setup()` still works after smoke runs
- [ ] `add()` still works after smoke runs
- [ ] `play()` / `pause()` / `stop()` still work after smoke runs
- [ ] `seekTo()` still works after smoke runs
- [ ] `getSnapshot()` still updates summary/json after smoke runs
- [ ] `Copy raw log` and `Copy recent events` remain usable
- [ ] `Run artwork race` logs stale/fallback hints and parity summary updates `artwork signal`
- [ ] iOS lock screen artwork updates to track 1/2 images and clears on track 3 (no artwork)
- [ ] Android media notification artwork updates to track 1/2 images and clears on track 3 (no artwork)

## Notes
- If any smoke run shows `PASS` without at least one snapshot update, record as **FAIL** and attach events/logs.
- Capture both a verdict screenshot and copied events so native regressions are reproducible outside IDE logs.
- For artwork race, capture two screenshots: one where track 3 has no artwork (cleared state) and one after switching back where track 2 artwork is restored.
