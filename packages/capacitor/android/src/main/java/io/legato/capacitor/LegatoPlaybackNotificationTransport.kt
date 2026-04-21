package io.legato.capacitor

import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.remote.LegatoAndroidMediaSessionBridge

internal object LegatoPlaybackNotificationTransport {
    const val ACTION_PLAY: String = "io.legato.capacitor.action.PLAY"
    const val ACTION_PAUSE: String = "io.legato.capacitor.action.PAUSE"

    fun projectedControlFor(state: LegatoAndroidPlaybackState): LegatoAndroidMediaSessionBridge.TransportControl {
        return if (state == LegatoAndroidPlaybackState.PLAYING || state == LegatoAndroidPlaybackState.BUFFERING) {
            LegatoAndroidMediaSessionBridge.TransportControl.PAUSE
        } else {
            LegatoAndroidMediaSessionBridge.TransportControl.PLAY
        }
    }

    fun transportControlFromIntentAction(action: String?): LegatoAndroidMediaSessionBridge.TransportControl? {
        return when (action) {
            ACTION_PLAY -> LegatoAndroidMediaSessionBridge.TransportControl.PLAY
            ACTION_PAUSE -> LegatoAndroidMediaSessionBridge.TransportControl.PAUSE
            else -> null
        }
    }
}
