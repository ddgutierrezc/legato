package io.legato.core.queue

import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidPlaybackState
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
        return LegatoAndroidTransportCapabilities(
            canSkipNext = index < queue.lastIndex,
            canSkipPrevious = index > 0,
            canSeek = true,
        )
    }
}
