# iOS Runtime Playback v1 — Scope Guardrails

This document defines what `ios-runtime-playback-v1` is allowed to include and what MUST stay out.

## In Scope

- Canonical ownership for queue/playback mutations in iOS runtime path.
- Direct runtime evidence for AVPlayer-backed behavior (transport/progress/end/snapshot coherence).
- Smoke/report checklist hardening for reproducible iOS runtime-integrity artifacts.
- Documentation/spec cleanup where iOS runtime was still described as pending.

## Non-goals

- Full background/interruption lifecycle hardening.
- Broad Android/iOS parity expansion.
- New end-user playback features.

## Reviewer checklist

- Verify changes do not claim lifecycle/background completion.
- Verify docs keep runtime status as implemented with explicit current limits.
- Verify smoke evidence includes runtime-integrity payload fields.
