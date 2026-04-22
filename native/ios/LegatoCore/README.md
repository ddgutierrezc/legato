# Legato iOS Native Core (Runtime-Seam MVP)

This directory contains the iOS native core and runtime integration seams for Legato.

Current scope includes:
- canonical queue/state/snapshot/event behavior,
- manager scaffolding for AVAudioSession/Now Playing/Remote Command boundaries,
- explicit runtime adapter protocols for future AVPlayer integration.

Out of scope for this pass:
- fully wired AVPlayer runtime playback,
- complete AVAudioSession interruption/route-change handling,
- production-grade background playback behavior.

Default runtime adapters are intentionally no-op/in-memory and define stable handoff points for real iOS runtime wiring.

## Dependency composition

This module currently uses **manual composition + constructor injection**, not a DI container such as Swinject or Factory.

The canonical composition root is:

- `LegatoiOSCoreDependencies`
- `LegatoiOSCoreFactory.make(...)`

That is the current project standard unless the graph/lifecycle complexity grows enough to justify containerization later.
