package io.legato.capacitor

import android.media.session.PlaybackState
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidRemoteCommand
import io.legato.core.core.LegatoAndroidTransportCapabilities
import io.legato.core.remote.LegatoAndroidMediaSessionBridge

internal object LegatoPlaybackNotificationTransport {
    data class NotificationActionModel(
        val intentAction: String,
        val label: String,
    )

    const val ACTION_PLAY: String = "io.legato.capacitor.action.PLAY"
    const val ACTION_PAUSE: String = "io.legato.capacitor.action.PAUSE"
    const val ACTION_NEXT: String = "io.legato.capacitor.action.NEXT"
    const val ACTION_PREVIOUS: String = "io.legato.capacitor.action.PREVIOUS"

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

    fun remoteCommandFromIntentAction(action: String?): LegatoAndroidRemoteCommand? {
        return when (action) {
            ACTION_PLAY -> LegatoAndroidRemoteCommand.Play
            ACTION_PAUSE -> LegatoAndroidRemoteCommand.Pause
            ACTION_NEXT -> LegatoAndroidRemoteCommand.Next
            ACTION_PREVIOUS -> LegatoAndroidRemoteCommand.Previous
            else -> null
        }
    }

    fun playbackStateActionsFor(
        state: LegatoAndroidPlaybackState,
        capabilities: LegatoAndroidTransportCapabilities,
    ): Long {
        var actions = PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE
        if (capabilities.canSeek) {
            actions = actions or PlaybackState.ACTION_SEEK_TO
        }
        if (capabilities.canSkipNext) {
            actions = actions or PlaybackState.ACTION_SKIP_TO_NEXT
        }
        if (capabilities.canSkipPrevious) {
            actions = actions or PlaybackState.ACTION_SKIP_TO_PREVIOUS
        }
        return actions
    }

    fun notificationActionModelFor(
        state: LegatoAndroidPlaybackState,
        capabilities: LegatoAndroidTransportCapabilities,
    ): List<NotificationActionModel> {
        val actions = mutableListOf<NotificationActionModel>()
        if (capabilities.canSkipPrevious) {
            actions += NotificationActionModel(intentAction = ACTION_PREVIOUS, label = "Previous")
        }

        val projectedControl = projectedControlFor(state)
        actions += NotificationActionModel(
            intentAction = if (projectedControl == LegatoAndroidMediaSessionBridge.TransportControl.PAUSE) ACTION_PAUSE else ACTION_PLAY,
            label = if (projectedControl == LegatoAndroidMediaSessionBridge.TransportControl.PAUSE) "Pause" else "Play",
        )

        if (capabilities.canSkipNext) {
            actions += NotificationActionModel(intentAction = ACTION_NEXT, label = "Next")
        }
        return actions
    }
}
