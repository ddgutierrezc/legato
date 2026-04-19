package io.legato.core.state

import io.legato.core.core.LegatoAndroidPlaybackState

class LegatoAndroidStateMachine {
    enum class LegatoAndroidStateInput {
        PREPARE,
        PREPARED,
        PLAY,
        PAUSE,
        BUFFERING_STARTED,
        BUFFERING_ENDED,
        TRACK_ENDED,
        STOP,
        FAIL,
        RESET,
    }

    private val allowedTransitions: Map<LegatoAndroidPlaybackState, Set<LegatoAndroidPlaybackState>> =
        mapOf(
            LegatoAndroidPlaybackState.IDLE to setOf(
                LegatoAndroidPlaybackState.LOADING,
                LegatoAndroidPlaybackState.ERROR,
            ),
            LegatoAndroidPlaybackState.LOADING to setOf(
                LegatoAndroidPlaybackState.READY,
                LegatoAndroidPlaybackState.IDLE,
                LegatoAndroidPlaybackState.ERROR,
            ),
            LegatoAndroidPlaybackState.READY to setOf(
                LegatoAndroidPlaybackState.PLAYING,
                LegatoAndroidPlaybackState.LOADING,
                LegatoAndroidPlaybackState.IDLE,
                LegatoAndroidPlaybackState.ERROR,
            ),
            LegatoAndroidPlaybackState.PLAYING to setOf(
                LegatoAndroidPlaybackState.PAUSED,
                LegatoAndroidPlaybackState.BUFFERING,
                LegatoAndroidPlaybackState.ENDED,
                LegatoAndroidPlaybackState.READY,
                LegatoAndroidPlaybackState.LOADING,
                LegatoAndroidPlaybackState.IDLE,
                LegatoAndroidPlaybackState.ERROR,
            ),
            LegatoAndroidPlaybackState.PAUSED to setOf(
                LegatoAndroidPlaybackState.PLAYING,
                LegatoAndroidPlaybackState.BUFFERING,
                LegatoAndroidPlaybackState.READY,
                LegatoAndroidPlaybackState.LOADING,
                LegatoAndroidPlaybackState.IDLE,
                LegatoAndroidPlaybackState.ERROR,
            ),
            LegatoAndroidPlaybackState.BUFFERING to setOf(
                LegatoAndroidPlaybackState.PLAYING,
                LegatoAndroidPlaybackState.PAUSED,
                LegatoAndroidPlaybackState.READY,
                LegatoAndroidPlaybackState.LOADING,
                LegatoAndroidPlaybackState.IDLE,
                LegatoAndroidPlaybackState.ERROR,
            ),
            LegatoAndroidPlaybackState.ENDED to setOf(
                LegatoAndroidPlaybackState.PLAYING,
                LegatoAndroidPlaybackState.READY,
                LegatoAndroidPlaybackState.LOADING,
                LegatoAndroidPlaybackState.IDLE,
                LegatoAndroidPlaybackState.ERROR,
            ),
            LegatoAndroidPlaybackState.ERROR to setOf(
                LegatoAndroidPlaybackState.IDLE,
                LegatoAndroidPlaybackState.LOADING,
            ),
        )

    fun canTransition(from: LegatoAndroidPlaybackState, to: LegatoAndroidPlaybackState): Boolean {
        return allowedTransitions[from]?.contains(to) == true
    }

    fun reduce(
        current: LegatoAndroidPlaybackState,
        event: LegatoAndroidStateInput,
    ): LegatoAndroidPlaybackState {
        val candidate = when (event) {
            LegatoAndroidStateInput.PREPARE -> LegatoAndroidPlaybackState.LOADING
            LegatoAndroidStateInput.PREPARED -> LegatoAndroidPlaybackState.READY
            LegatoAndroidStateInput.PLAY -> LegatoAndroidPlaybackState.PLAYING
            LegatoAndroidStateInput.PAUSE -> LegatoAndroidPlaybackState.PAUSED
            LegatoAndroidStateInput.BUFFERING_STARTED -> LegatoAndroidPlaybackState.BUFFERING
            LegatoAndroidStateInput.BUFFERING_ENDED -> LegatoAndroidPlaybackState.PLAYING
            LegatoAndroidStateInput.TRACK_ENDED -> LegatoAndroidPlaybackState.ENDED
            LegatoAndroidStateInput.STOP -> LegatoAndroidPlaybackState.READY
            LegatoAndroidStateInput.RESET -> LegatoAndroidPlaybackState.IDLE

            LegatoAndroidStateInput.FAIL -> LegatoAndroidPlaybackState.ERROR
        }

        return if (canTransition(current, candidate)) candidate else current
    }
}
