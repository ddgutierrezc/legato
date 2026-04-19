package io.legato.core.session

import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidProgressUpdate

class LegatoAndroidSessionManager(
    private val runtime: LegatoAndroidSessionRuntime = LegatoAndroidNoopSessionRuntime(),
) {

    fun configureSession() {
        runtime.configureSession()
    }

    fun updatePlaybackState(state: LegatoAndroidPlaybackState) {
        runtime.updatePlaybackState(state)
    }

    fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?) {
        runtime.updateNowPlayingMetadata(metadata)
    }

    fun updateProgress(progress: LegatoAndroidProgressUpdate) {
        runtime.updateProgress(progress)
    }

    fun releaseSession() {
        runtime.releaseSession()
    }
}
