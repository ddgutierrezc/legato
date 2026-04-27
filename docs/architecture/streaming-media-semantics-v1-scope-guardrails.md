# Streaming Media Semantics V1 — Scope Guardrails

## In Scope

- Capability-first semantic closure using existing signals only:
  - `Track.type`
  - nullable duration (`snapshot.duration`, `playback-progress.duration`, `getDuration()`)
  - projected capabilities (`getCapabilities().supported`)
  - remote seek enablement aligned with projected `canSeek`
- Conservative media-type policy:
  - `file` / `progressive`: seekable by default when active and not ended.
  - `hls` / `dash`: non-seekable by default unless runtime provides explicit finite seekability evidence.
- Support matrix clarity in docs and harness validators.

## Explicit Degrade Policy

When runtime evidence is insufficient or ambiguous, degrade to **non-seekable**.
Do not infer seekability from queue presence alone.

## Out of Scope (Deferred)

- DRM/license workflows.
- Token refresh/rotation and dynamic auth callbacks.
- Network resilience/buffering policy redesign.
- Process-death restoration and full lifecycle hardening.
- Live-edge/DVR-window advanced semantics.

## Public Contract Constraint

No public API shape expansion is required in this milestone.
Semantics are expressed through existing boundary fields and capability projection.
