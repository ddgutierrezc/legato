package io.legato.core.queue

import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidTrackType
import io.legato.core.core.LegatoAndroidTransportCapabilities

object LegatoAndroidTransportCapabilitiesProjector {
    fun fromSnapshot(snapshot: LegatoAndroidPlaybackSnapshot): LegatoAndroidTransportCapabilities {
        if (snapshot.state == LegatoAndroidPlaybackState.ENDED) {
            return LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = false)
        }

        val queue = snapshot.queue.items
        if (queue.isEmpty()) {
            return LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = false)
        }

        val currentIndex = snapshot.currentIndex ?: snapshot.queue.currentIndex
        val hasActiveTrack = currentIndex != null && currentIndex in queue.indices
        if (!hasActiveTrack) {
            return LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = false)
        }

        val index = checkNotNull(currentIndex)
        val activeTrack = queue[index]
        val canSeek = when (activeTrack.type) {
            LegatoAndroidTrackType.HLS,
            LegatoAndroidTrackType.DASH,
            -> snapshot.durationMs != null && snapshot.isSeekableHint == true

            else -> true
        }

        return LegatoAndroidTransportCapabilities(
            canSkipNext = index < queue.lastIndex,
            canSkipPrevious = index > 0,
            canSeek = canSeek,
        )
    }
}
