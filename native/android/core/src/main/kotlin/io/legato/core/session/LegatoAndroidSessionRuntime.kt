package io.legato.core.session

import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidProgressUpdate

/**
 * Seam for Android media session/audio focus runtime integration.
 *
 * A Media3-backed implementation can translate these canonical updates into
 * MediaSession + AudioManager side effects.
 */
interface LegatoAndroidSessionRuntime {
    fun configureSession()

    fun updatePlaybackState(state: LegatoAndroidPlaybackState)

    fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?)

    fun updateProgress(progress: LegatoAndroidProgressUpdate)

    fun releaseSession()
}

class LegatoAndroidNoopSessionRuntime : LegatoAndroidSessionRuntime {
    override fun configureSession() {
        // Intentionally no-op. Media3/AudioFocus wiring is pending.
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
