package io.legato.capacitor

import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidServiceMode
import io.legato.core.core.LegatoAndroidTransportCapabilities
import io.legato.core.remote.LegatoAndroidMediaSessionBridge
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LegatoPlaybackNotificationTransportTest {
    @Test
    fun `notification metadata prefers track title and artist`() {
        val projected = LegatoPlaybackNotificationTransport.notificationMetadataModelFor(
            mode = LegatoAndroidServiceMode.PLAYBACK_ACTIVE,
            metadata = LegatoAndroidNowPlayingMetadata(
                trackId = "track-1",
                title = "Song title",
                artist = "Artist name",
            ),
            largeIcon = null,
        )

        assertEquals("Song title", projected.title)
        assertEquals("Artist name", projected.contentText)
        assertEquals(null, projected.largeIcon)
    }

    @Test
    fun `notification metadata falls back to mode copy when track text is missing`() {
        val projected = LegatoPlaybackNotificationTransport.notificationMetadataModelFor(
            mode = LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION,
            metadata = LegatoAndroidNowPlayingMetadata(trackId = "track-1"),
            largeIcon = null,
        )

        assertEquals("Legato Playback", projected.title)
        assertEquals("Paused by interruption", projected.contentText)
        assertEquals(null, projected.largeIcon)
    }

    @Test
    fun `notification projects pause action while currently playing`() {
        val projectedAction = LegatoPlaybackNotificationTransport.projectedControlFor(
            LegatoAndroidPlaybackState.PLAYING,
        )

        assertEquals(LegatoAndroidMediaSessionBridge.TransportControl.PAUSE, projectedAction)
    }

    @Test
    fun `notification projects play action while paused`() {
        val projectedAction = LegatoPlaybackNotificationTransport.projectedControlFor(
            LegatoAndroidPlaybackState.PAUSED,
        )

        assertEquals(LegatoAndroidMediaSessionBridge.TransportControl.PLAY, projectedAction)
    }

    @Test
    fun `notification intent action maps into supported transport controls only`() {
        assertEquals(
            LegatoAndroidMediaSessionBridge.TransportControl.PLAY,
            LegatoPlaybackNotificationTransport.transportControlFromIntentAction(
                LegatoPlaybackNotificationTransport.ACTION_PLAY,
            ),
        )
        assertEquals(
            LegatoAndroidMediaSessionBridge.TransportControl.PAUSE,
            LegatoPlaybackNotificationTransport.transportControlFromIntentAction(
                LegatoPlaybackNotificationTransport.ACTION_PAUSE,
            ),
        )
        assertNull(LegatoPlaybackNotificationTransport.transportControlFromIntentAction("unsupported"))
    }

    @Test
    fun `playback-state actions include next previous and seek when capabilities allow`() {
        val actions = LegatoPlaybackNotificationTransport.playbackStateActionsFor(
            capabilities = LegatoAndroidTransportCapabilities(
                canSkipNext = true,
                canSkipPrevious = true,
                canSeek = true,
            ),
        )

        assertTrue(actions and android.media.session.PlaybackState.ACTION_SKIP_TO_NEXT != 0L)
        assertTrue(actions and android.media.session.PlaybackState.ACTION_SKIP_TO_PREVIOUS != 0L)
        assertTrue(actions and android.media.session.PlaybackState.ACTION_SEEK_TO != 0L)
    }

    @Test
    fun `playback-state actions omit next when capability is false`() {
        val actions = LegatoPlaybackNotificationTransport.playbackStateActionsFor(
            capabilities = LegatoAndroidTransportCapabilities(
                canSkipNext = false,
                canSkipPrevious = true,
                canSeek = true,
            ),
        )

        assertEquals(0L, actions and android.media.session.PlaybackState.ACTION_SKIP_TO_NEXT)
        assertTrue(actions and android.media.session.PlaybackState.ACTION_SKIP_TO_PREVIOUS != 0L)
    }

    @Test
    fun `notification actions include capability-driven previous and next around projected transport control`() {
        val actions = LegatoPlaybackNotificationTransport.notificationActionModelFor(
            state = LegatoAndroidPlaybackState.PAUSED,
            capabilities = LegatoAndroidTransportCapabilities(
                canSkipNext = true,
                canSkipPrevious = true,
                canSeek = true,
            ),
        )

        assertEquals(
            listOf(
                LegatoPlaybackNotificationTransport.ACTION_PREVIOUS,
                LegatoPlaybackNotificationTransport.ACTION_PLAY,
                LegatoPlaybackNotificationTransport.ACTION_NEXT,
            ),
            actions.map { it.intentAction },
        )
    }

    @Test
    fun `interruption mode forces primary notification action to play even if playback state still reports playing`() {
        val actions = LegatoPlaybackNotificationTransport.notificationActionModelFor(
            state = LegatoAndroidPlaybackState.PLAYING,
            capabilities = LegatoAndroidTransportCapabilities(
                canSkipNext = true,
                canSkipPrevious = true,
                canSeek = true,
            ),
            mode = LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION,
        )

        assertEquals(LegatoPlaybackNotificationTransport.ACTION_PLAY, actions[1].intentAction)
    }

    @Test
    fun `notification intent action maps previous and next to remote commands`() {
        assertEquals(
            io.legato.core.core.LegatoAndroidRemoteCommand.Previous,
            LegatoPlaybackNotificationTransport.remoteCommandFromIntentAction(
                LegatoPlaybackNotificationTransport.ACTION_PREVIOUS,
            ),
        )
        assertEquals(
            io.legato.core.core.LegatoAndroidRemoteCommand.Next,
            LegatoPlaybackNotificationTransport.remoteCommandFromIntentAction(
                LegatoPlaybackNotificationTransport.ACTION_NEXT,
            ),
        )
    }
}
