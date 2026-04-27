# iOS Runtime Playback v1 — Scope Guardrails

This document defines what `ios-runtime-playback-v1` is allowed to include and what MUST stay out.
It now cross-references `ios-background-lifecycle-v1` to keep lifecycle hardening boundaries explicit.

## In Scope

- Canonical ownership for queue/playback mutations in iOS runtime path.
- Direct runtime evidence for AVPlayer-backed behavior (transport/progress/end/snapshot coherence).
- Smoke/report checklist hardening for reproducible iOS runtime-integrity artifacts.
- Documentation/spec cleanup where iOS runtime was still described as pending.
- Process-alive lifecycle hardening from `ios-background-lifecycle-v1`:
  - interruption begin/end policy hardening,
  - selected route-change policy hardening,
  - foreground/active reassertion of now-playing + remote-command surfaces,
  - guided harness evidence for lifecycle checkpoints.

## Non-goals

- Full background/interruption lifecycle hardening.
- Broad Android/iOS parity expansion.
- New end-user playback features.
- Process-death restore/relaunch recovery.
- Provisioning/signing/entitlements host setup.
- Full iOS/Android lifecycle parity redesign.

## Reviewer checklist

- Verify changes do not claim lifecycle/background completion.
- Verify docs keep runtime status as implemented with explicit current limits.
- Verify smoke evidence includes runtime-integrity payload fields.
- Verify lifecycle hardening claims are process-alive only (no process-death restore).
