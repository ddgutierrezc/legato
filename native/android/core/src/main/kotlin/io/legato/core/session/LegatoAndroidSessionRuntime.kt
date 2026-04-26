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
    val pauseOnTransientCanDuck: Boolean,
    val resumeAfterGainIfNotUserPaused: Boolean,
)

sealed interface LegatoAndroidInterruptionSignal {
    data object AudioFocusLost : LegatoAndroidInterruptionSignal

    data object AudioFocusLostTransient : LegatoAndroidInterruptionSignal

    data object AudioFocusLostTransientCanDuck : LegatoAndroidInterruptionSignal

    data object AudioFocusDenied : LegatoAndroidInterruptionSignal

    data object AudioFocusGained : LegatoAndroidInterruptionSignal

    data object BecomingNoisy : LegatoAndroidInterruptionSignal
}

object LegatoAndroidSessionDefaults {
    val MILESTONE1_AUDIO_FOCUS_POLICY = LegatoAndroidAudioFocusPolicy(
        gainHint = LegatoAndroidAudioFocusGainHint.AUDIOFOCUS_GAIN,
        pauseOnTransientLoss = true,
        pauseOnTransientCanDuck = true,
        resumeAfterGainIfNotUserPaused = false,
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

    fun setInterruptionListener(listener: ((LegatoAndroidInterruptionSignal) -> Unit)?)

    fun onInterruption(signal: LegatoAndroidInterruptionSignal)

    fun updatePlaybackState(state: LegatoAndroidPlaybackState)

    fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?)

    fun updateProgress(progress: LegatoAndroidProgressUpdate)

    fun releaseSession()
}

class LegatoAndroidNoopSessionRuntime : LegatoAndroidSessionRuntime {
    private var interruptionListener: ((LegatoAndroidInterruptionSignal) -> Unit)? = null

    override fun configureSession() {
        // Intentionally no-op. Use runtime-backed implementations when platform wiring is available.
    }

    override fun audioFocusPolicy(): LegatoAndroidAudioFocusPolicy =
        LegatoAndroidSessionDefaults.MILESTONE1_AUDIO_FOCUS_POLICY

    override fun setInterruptionListener(listener: ((LegatoAndroidInterruptionSignal) -> Unit)?) {
        interruptionListener = listener
    }

    override fun onInterruption(signal: LegatoAndroidInterruptionSignal) {
        // Intentionally no-op. No listener projection in noop runtime.
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
        interruptionListener = null
        // Intentionally no-op.
    }
}

class LegatoAndroidAudioFocusSessionRuntime : LegatoAndroidSessionRuntime {
    private var interruptionListener: ((LegatoAndroidInterruptionSignal) -> Unit)? = null

    override fun configureSession() {
        // Configuration is owned by the Android adapter (service/app) boundary.
    }

    override fun audioFocusPolicy(): LegatoAndroidAudioFocusPolicy =
        LegatoAndroidSessionDefaults.MILESTONE1_AUDIO_FOCUS_POLICY

    override fun setInterruptionListener(listener: ((LegatoAndroidInterruptionSignal) -> Unit)?) {
        interruptionListener = listener
    }

    override fun onInterruption(signal: LegatoAndroidInterruptionSignal) {
        interruptionListener?.invoke(signal)
    }

    override fun updatePlaybackState(state: LegatoAndroidPlaybackState) {
        // Publication is owned by service/media-session adapter.
    }

    override fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?) {
        // Publication is owned by service/media-session adapter.
    }

    override fun updateProgress(progress: LegatoAndroidProgressUpdate) {
        // Publication is owned by service/media-session adapter.
    }

    override fun releaseSession() {
        interruptionListener = null
    }

    fun dispatchAudioFocusChange(focusChange: Int) {
        val signal = when (focusChange) {
            android.media.AudioManager.AUDIOFOCUS_GAIN -> LegatoAndroidInterruptionSignal.AudioFocusGained
            android.media.AudioManager.AUDIOFOCUS_LOSS -> LegatoAndroidInterruptionSignal.AudioFocusLost
            android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> LegatoAndroidInterruptionSignal.AudioFocusLostTransient
            android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> LegatoAndroidInterruptionSignal.AudioFocusLostTransientCanDuck
            else -> null
        }

        if (signal != null) {
            interruptionListener?.invoke(signal)
        }
    }

    fun dispatchBecomingNoisy() {
        interruptionListener?.invoke(LegatoAndroidInterruptionSignal.BecomingNoisy)
    }
}
