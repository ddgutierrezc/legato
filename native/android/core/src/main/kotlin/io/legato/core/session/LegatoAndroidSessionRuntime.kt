package io.legato.core.session

import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidProgressUpdate

enum class LegatoAndroidAudioFocusGainHint {
    AUDIOFOCUS_GAIN,
}

data class LegatoAndroidAudioFocusPolicy(
    val gainHint: LegatoAndroidAudioFocusGainHint,
    val pauseOnTransientLoss: Boolean,
    val duckOnTransientCanDuck: Boolean,
    val resumeAfterGainIfNotUserPaused: Boolean,
)

sealed interface LegatoAndroidInterruptionSignal {
    data object AudioFocusLost : LegatoAndroidInterruptionSignal

    data object AudioFocusLostTransient : LegatoAndroidInterruptionSignal

    data object AudioFocusLostTransientCanDuck : LegatoAndroidInterruptionSignal

    data object AudioFocusGained : LegatoAndroidInterruptionSignal

    data object BecomingNoisy : LegatoAndroidInterruptionSignal
}

object LegatoAndroidSessionDefaults {
    val MILESTONE1_AUDIO_FOCUS_POLICY = LegatoAndroidAudioFocusPolicy(
        gainHint = LegatoAndroidAudioFocusGainHint.AUDIOFOCUS_GAIN,
        pauseOnTransientLoss = true,
        duckOnTransientCanDuck = true,
        resumeAfterGainIfNotUserPaused = true,
    )
}

/**
 * Seam for Android media session/audio focus runtime integration.
 *
 * A Media3-backed implementation can translate these canonical updates into
 * MediaSession + AudioManager side effects.
 */
interface LegatoAndroidSessionRuntime {
    fun configureSession()

    fun audioFocusPolicy(): LegatoAndroidAudioFocusPolicy

    fun onInterruption(signal: LegatoAndroidInterruptionSignal)

    fun updatePlaybackState(state: LegatoAndroidPlaybackState)

    fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?)

    fun updateProgress(progress: LegatoAndroidProgressUpdate)

    fun releaseSession()
}

class LegatoAndroidNoopSessionRuntime : LegatoAndroidSessionRuntime {
    override fun configureSession() {
        // Intentionally no-op. Media3/AudioFocus wiring is pending.
    }

    override fun audioFocusPolicy(): LegatoAndroidAudioFocusPolicy =
        LegatoAndroidSessionDefaults.MILESTONE1_AUDIO_FOCUS_POLICY

    override fun onInterruption(signal: LegatoAndroidInterruptionSignal) {
        // Intentionally no-op. Runtime callback handling is pending.
    }

    override fun updatePlaybackState(state: LegatoAndroidPlaybackState) {
        // Intentionally no-op.
    }

    override fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?) {
        // Intentionally no-op.
    }

    override fun updateProgress(progress: LegatoAndroidProgressUpdate) {
        // Intentionally no-op.
    }

    override fun releaseSession() {
        // Intentionally no-op.
    }
}
