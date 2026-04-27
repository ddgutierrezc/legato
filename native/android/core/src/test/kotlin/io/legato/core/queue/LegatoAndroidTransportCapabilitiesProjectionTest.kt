package io.legato.core.queue

import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidQueueSnapshot
import io.legato.core.core.LegatoAndroidTrack
import io.legato.core.core.LegatoAndroidTrackType
import io.legato.core.core.LegatoAndroidTransportCapabilities
import org.junit.Assert.assertEquals
import org.junit.Test

class LegatoAndroidTransportCapabilitiesProjectionTest {
    @Test
    fun `projects full transport capabilities for mid queue snapshot`() {
        val snapshot = playbackSnapshot(
            state = LegatoAndroidPlaybackState.PLAYING,
            items = listOf(track("1"), track("2"), track("3")),
            currentIndex = 1,
        )

        assertEquals(
            LegatoAndroidTransportCapabilities(canSkipNext = true, canSkipPrevious = true, canSeek = true),
            LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot),
        )
    }

    @Test
    fun `projects no skip capabilities for single track snapshot`() {
        val snapshot = playbackSnapshot(
            state = LegatoAndroidPlaybackState.READY,
            items = listOf(track("1", type = LegatoAndroidTrackType.PROGRESSIVE)),
            currentIndex = 0,
        )

        assertEquals(
            LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = true),
            LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot),
        )
    }

    @Test
    fun `projects all false for empty queue snapshot`() {
        val snapshot = playbackSnapshot(
            state = LegatoAndroidPlaybackState.IDLE,
            items = emptyList(),
            currentIndex = null,
        )

        assertEquals(
            LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = false),
            LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot),
        )
    }

    @Test
    fun `projects all false while ended regardless of queue contents`() {
        val snapshot = playbackSnapshot(
            state = LegatoAndroidPlaybackState.ENDED,
            items = listOf(track("1"), track("2"), track("3")),
            currentIndex = 2,
        )

        assertEquals(
            LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = false),
            LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot),
        )
    }

    @Test
    fun `projects hls as non seekable when finite seekability evidence is missing`() {
        val snapshot = playbackSnapshot(
            state = LegatoAndroidPlaybackState.PLAYING,
            items = listOf(track("hls-1", type = LegatoAndroidTrackType.HLS)),
            currentIndex = 0,
            durationMs = null,
            isSeekableHint = null,
        )

        assertEquals(
            LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = false),
            LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot),
        )
    }

    @Test
    fun `projects hls as seekable only when duration is finite and runtime hint is true`() {
        val snapshot = playbackSnapshot(
            state = LegatoAndroidPlaybackState.PLAYING,
            items = listOf(track("hls-1", type = LegatoAndroidTrackType.HLS)),
            currentIndex = 0,
            durationMs = 180_000L,
            isSeekableHint = true,
        )

        assertEquals(
            LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = true),
            LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot),
        )
    }

    private fun playbackSnapshot(
        state: LegatoAndroidPlaybackState,
        items: List<LegatoAndroidTrack>,
        currentIndex: Int?,
        durationMs: Long? = null,
        isSeekableHint: Boolean? = null,
    ): LegatoAndroidPlaybackSnapshot = LegatoAndroidPlaybackSnapshot(
        state = state,
        currentTrack = currentIndex?.let(items::getOrNull),
        currentIndex = currentIndex,
        positionMs = 0L,
        durationMs = durationMs,
        isSeekableHint = isSeekableHint,
        bufferedPositionMs = null,
        queue = LegatoAndroidQueueSnapshot(items = items, currentIndex = currentIndex),
    )

    private fun track(id: String, type: LegatoAndroidTrackType? = null): LegatoAndroidTrack = LegatoAndroidTrack(
        id = id,
        url = "https://example.com/$id.mp3",
        type = type,
    )
}
