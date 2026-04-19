package io.legato.core.remote

import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidRemoteCommand

/**
 * Seam for Android remote transport command sources (MediaSession/notification/BT controls).
 */
interface LegatoAndroidRemoteCommandRuntime {
    fun bind(dispatch: (LegatoAndroidRemoteCommand) -> Unit)

    fun updatePlaybackState(state: LegatoAndroidPlaybackState)

    fun unbind()
}

class LegatoAndroidNoopRemoteCommandRuntime : LegatoAndroidRemoteCommandRuntime {
    override fun bind(dispatch: (LegatoAndroidRemoteCommand) -> Unit) {
        // Intentionally no-op. Real runtime should register platform callbacks and forward with dispatch(...).
    }

    override fun updatePlaybackState(state: LegatoAndroidPlaybackState) {
        // Intentionally no-op.
    }

    override fun unbind() {
        // Intentionally no-op.
    }
}
