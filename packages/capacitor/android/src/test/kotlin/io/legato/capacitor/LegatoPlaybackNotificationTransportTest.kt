package io.legato.capacitor

import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.remote.LegatoAndroidMediaSessionBridge
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LegatoPlaybackNotificationTransportTest {
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
}
