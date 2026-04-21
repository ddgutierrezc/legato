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

## Manual Controls Regression
- [ ] `setup()` still works after smoke runs
- [ ] `add()` still works after smoke runs
- [ ] `play()` / `pause()` / `stop()` still work after smoke runs
- [ ] `seekTo()` still works after smoke runs
- [ ] `getSnapshot()` still updates summary/json after smoke runs
- [ ] `Copy raw log` and `Copy recent events` remain usable

## Notes
- If any smoke run shows `PASS` without at least one snapshot update, record as **FAIL** and attach events/logs.
- Capture both a verdict screenshot and copied events so native regressions are reproducible outside IDE logs.
