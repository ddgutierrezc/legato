# State Machine v0

## Playback States
- `idle`
- `loading`
- `ready`
- `playing`
- `paused`
- `buffering`
- `ended`
- `error`

## High-Level Transition Rules
- `idle -> loading` when initial source/queue is prepared.
- `loading -> ready` when a playable item is resolved.
- `ready -> playing` on play command.
- `playing -> paused` on pause command.
- `playing -> buffering` when data underrun/network wait occurs.
- `buffering -> playing` when enough data is available.
- `playing -> ended` when track completes and queue cannot advance.
- `* -> error` on unrecoverable operation failure.

## Notes
- v0 focuses on observable state contract, not engine internals.
- Bindings should emit transitions consistently using canonical event names.
