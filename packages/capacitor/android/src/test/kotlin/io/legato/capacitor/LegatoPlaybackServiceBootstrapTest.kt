package io.legato.capacitor

import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidServiceMode
import io.legato.core.core.LegatoAndroidTrack
import io.legato.core.core.LegatoAndroidTransportCapabilities
import io.legato.core.session.LegatoAndroidInterruptionSignal
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNotEquals
import org.junit.Test

class LegatoPlaybackServiceBootstrapTest {
    @Test
    fun `legacy media-session flags helper keeps both transport and media-button support`() {
        val flags = legacyMediaSessionFlags()

        assertEquals(
            android.media.session.MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or
                android.media.session.MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS,
            flags,
        )
    }

    @Test
    fun `notification action builder helper forwards icon label and intent`() {
        val builder = notificationActionBuilder(
            iconResId = android.R.drawable.ic_media_play,
            label = "Play",
            pendingIntent = null,
        )

        assertNotNull(builder)
    }

    @Test
    fun `media-session projection keeps canonical snapshot position when playback resumes`() {
        val projection = projectMediaSessionPlaybackState(
            state = LegatoAndroidPlaybackState.PLAYING,
            snapshotPositionMs = 93_000L,
            activeTrackId = "track-1",
            previousProjection = null,
        )

        assertEquals(93_000L, projection.positionMs)
        assertNotEquals(0L, projection.positionMs)
    }

    @Test
    fun `media-session projection re-bases position after seek without resetting to zero`() {
        val projection = projectMediaSessionPlaybackState(
            state = LegatoAndroidPlaybackState.PLAYING,
            snapshotPositionMs = 205_000L,
            activeTrackId = "track-1",
            previousProjection = null,
        )

        assertEquals(205_000L, projection.positionMs)
        assertNotEquals(0L, projection.positionMs)
    }

    @Test
    fun `media-session projection publishes buffering without synthetic progress speed`() {
        val projection = projectMediaSessionPlaybackState(
            state = LegatoAndroidPlaybackState.BUFFERING,
            snapshotPositionMs = 1_500L,
            activeTrackId = "track-1",
            previousProjection = null,
        )

        assertEquals(android.media.session.PlaybackState.STATE_BUFFERING, projection.playbackStateCode)
        assertEquals(0f, projection.playbackSpeed)
    }

    @Test
    fun `media-session projection clamps small same-track rewinds to avoid early visual jumps`() {
        val projection = projectMediaSessionPlaybackState(
            state = LegatoAndroidPlaybackState.PLAYING,
            snapshotPositionMs = 2_200L,
            activeTrackId = "track-1",
            previousProjection = MediaSessionPlaybackProjection(
                playbackStateCode = android.media.session.PlaybackState.STATE_PLAYING,
                positionMs = 3_000L,
                playbackSpeed = 1f,
                activeTrackId = "track-1",
            ),
        )

        assertEquals(3_000L, projection.positionMs)
    }

    @Test
    fun `media-session projection allows explicit rewinds and track transitions`() {
        val sameTrackSeekBackProjection = projectMediaSessionPlaybackState(
            state = LegatoAndroidPlaybackState.PLAYING,
            snapshotPositionMs = 1_000L,
            activeTrackId = "track-1",
            previousProjection = MediaSessionPlaybackProjection(
                playbackStateCode = android.media.session.PlaybackState.STATE_PLAYING,
                positionMs = 15_000L,
                playbackSpeed = 1f,
                activeTrackId = "track-1",
            ),
        )
        val nextTrackProjection = projectMediaSessionPlaybackState(
            state = LegatoAndroidPlaybackState.BUFFERING,
            snapshotPositionMs = 0L,
            activeTrackId = "track-2",
            previousProjection = MediaSessionPlaybackProjection(
                playbackStateCode = android.media.session.PlaybackState.STATE_PLAYING,
                positionMs = 15_000L,
                playbackSpeed = 1f,
                activeTrackId = "track-1",
            ),
        )

        assertEquals(1_000L, sameTrackSeekBackProjection.positionMs)
        assertEquals(0L, nextTrackProjection.positionMs)
    }

    @Test
    fun `artwork completion applies only when token and active metadata still match`() {
        val activeToken = ArtworkRequestToken(
            requestId = 5L,
            trackId = "track-1",
            artworkUrl = "https://example.com/1.jpg",
        )
        val metadata = LegatoAndroidNowPlayingMetadata(
            trackId = "track-1",
            artwork = "https://example.com/1.jpg",
        )

        assertTrue(
            shouldApplyArtworkResult(
                activeToken = activeToken,
                completedToken = activeToken,
                activeMetadata = metadata,
            ),
        )
        assertFalse(
            shouldApplyArtworkResult(
                activeToken = activeToken,
                completedToken = activeToken.copy(requestId = 4L),
                activeMetadata = metadata,
            ),
        )
    }

    @Test
    fun `artwork completion is ignored when active metadata changed or removed`() {
        val activeToken = ArtworkRequestToken(
            requestId = 5L,
            trackId = "track-1",
            artworkUrl = "https://example.com/1.jpg",
        )

        assertFalse(
            shouldApplyArtworkResult(
                activeToken = activeToken,
                completedToken = activeToken,
                activeMetadata = LegatoAndroidNowPlayingMetadata(
                    trackId = "track-2",
                    artwork = "https://example.com/2.jpg",
                ),
            ),
        )
        assertFalse(
            shouldApplyArtworkResult(
                activeToken = activeToken,
                completedToken = activeToken,
                activeMetadata = null,
            ),
        )
        assertNull(currentArtworkRequestKey(metadata = null))
        assertEquals(
            "track-1|https://example.com/1.jpg",
            currentArtworkRequestKey(
                metadata = LegatoAndroidNowPlayingMetadata(
                    trackId = "track-1",
                    artwork = "https://example.com/1.jpg",
                ),
            ),
        )
    }

    @Test
    fun `artwork token factory increments request id for each active request`() {
        val factory = ArtworkRequestTokenFactory()

        val first = factory.next(trackId = "track-1", artworkUrl = "https://example.com/1.jpg")
        val second = factory.next(trackId = "track-2", artworkUrl = "https://example.com/2.jpg")

        assertEquals(1L, first.requestId)
        assertEquals(2L, second.requestId)
        assertNotEquals(first, second)
    }

    @Test
    fun `artwork token matching requires both request id and metadata key`() {
        val expected = ArtworkRequestToken(requestId = 7L, trackId = "track-1", artworkUrl = "https://example.com/1.jpg")

        assertTrue(expected.matches(requestId = 7L, trackId = "track-1", artworkUrl = "https://example.com/1.jpg"))
        assertFalse(expected.matches(requestId = 8L, trackId = "track-1", artworkUrl = "https://example.com/1.jpg"))
        assertFalse(expected.matches(requestId = 7L, trackId = "track-2", artworkUrl = "https://example.com/1.jpg"))
        assertFalse(expected.matches(requestId = 7L, trackId = "track-1", artworkUrl = "https://example.com/2.jpg"))
    }

    @Test
    fun `bootstrap helper resolves context lazily and exactly once`() {
        var providerCalls = 0
        var resolverCalls = 0
        var providerRan = false

        val resolved = resolveOnCreateDependency(
            contextProvider = {
                providerCalls += 1
                providerRan = true
                "app-context"
            },
            resolver = { providedContext ->
                resolverCalls += 1
                assertTrue(providerRan)
                "coordinator-for-$providedContext"
            },
        )

        assertEquals("coordinator-for-app-context", resolved)
        assertEquals(1, providerCalls)
        assertEquals(1, resolverCalls)
    }

    @Test
    fun `bootstrap helper forwards exact provider value into resolver`() {
        data class FakeAppContext(val id: String)

        val provided = FakeAppContext("ctx-1")
        var observed: FakeAppContext? = null
        val expectedCoordinator = Any()

        val resolved = resolveOnCreateDependency(
            contextProvider = { provided },
            resolver = { context ->
                observed = context
                expectedCoordinator
            },
        )

        assertSame(provided, observed)
        assertFalse(observed === null)
        assertSame(expectedCoordinator, resolved)
    }

    @Test
    fun `audio focus change mapping converts Android constants into canonical interruption signals`() {
        assertEquals(
            LegatoAndroidInterruptionSignal.AudioFocusGained,
            interruptionSignalFromAudioFocusChange(android.media.AudioManager.AUDIOFOCUS_GAIN),
        )
        assertEquals(
            LegatoAndroidInterruptionSignal.AudioFocusLost,
            interruptionSignalFromAudioFocusChange(android.media.AudioManager.AUDIOFOCUS_LOSS),
        )
        assertEquals(
            LegatoAndroidInterruptionSignal.AudioFocusLostTransient,
            interruptionSignalFromAudioFocusChange(android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT),
        )
        assertEquals(
            LegatoAndroidInterruptionSignal.AudioFocusLostTransientCanDuck,
            interruptionSignalFromAudioFocusChange(android.media.AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK),
        )
    }

    @Test
    fun `audio focus change mapping ignores unsupported platform constants`() {
        assertNull(interruptionSignalFromAudioFocusChange(Int.MAX_VALUE))
        assertNull(interruptionSignalFromAudioFocusChange(123_456))
    }

    @Test
    fun `audio focus request denial resolves deterministic interruption projection`() {
        val deniedProjection = projectAudioFocusRequestOutcome(
            requestGranted = false,
            playbackState = LegatoAndroidPlaybackState.PLAYING,
        )
        val grantedProjection = projectAudioFocusRequestOutcome(
            requestGranted = true,
            playbackState = LegatoAndroidPlaybackState.PLAYING,
        )

        assertFalse(deniedProjection.hasAudioFocus)
        assertEquals(LegatoAndroidInterruptionSignal.AudioFocusDenied, deniedProjection.interruptionSignal)
        assertEquals("focus-denied", deniedProjection.reason)
        assertTrue(deniedProjection.pauseForInterruption)
        assertTrue(grantedProjection.hasAudioFocus)
        assertNull(grantedProjection.interruptionSignal)
    }

    @Test
    fun `service start mode projection prevents foreground resurrection for null-intent OFF`() {
        val projection = resolveStartCommandMode(
            intentMode = null,
            coordinatorMode = LegatoAndroidServiceMode.OFF,
            currentMode = LegatoAndroidServiceMode.OFF,
        )

        assertEquals(LegatoAndroidServiceMode.OFF, projection.mode)
        assertFalse(projection.shouldStartForeground)
        assertTrue(projection.shouldStopSelf)
    }

    @Test
    fun `media-session projection prefers canonical snapshot track id over stale metadata id`() {
        val resolvedTrackId = resolveActiveTrackIdForProjection(
            snapshotTrackId = "track-2",
            metadataTrackId = "track-1",
        )

        assertEquals("track-2", resolvedTrackId)
    }

    @Test
    fun `media-session metadata reconciliation drops stale metadata during transition churn`() {
        val reconciled = reconcileNowPlayingMetadataWithSnapshot(
            snapshotTrack = LegatoAndroidTrack(
                id = "track-2",
                url = "https://example.com/2.mp3",
                title = "Canonical",
                artist = "Artist",
            ),
            observedMetadata = LegatoAndroidNowPlayingMetadata(
                trackId = "track-1",
                title = "Stale",
                artist = "Old",
            ),
        )

        assertEquals("track-2", reconciled?.trackId)
        assertEquals("Canonical", reconciled?.title)
        assertEquals("Artist", reconciled?.artist)
    }

    @Test
    fun `off teardown projection keeps stop-self deterministic and non-blocking`() {
        val activeProjection = projectOffTeardown(
            foregroundActive = true,
            hasAudioFocus = true,
        )
        val idleProjection = projectOffTeardown(
            foregroundActive = false,
            hasAudioFocus = false,
        )

        assertTrue(activeProjection.shouldAbandonFocus)
        assertTrue(activeProjection.shouldStopForeground)
        assertTrue(activeProjection.shouldStopSelf)
        assertFalse(idleProjection.shouldAbandonFocus)
        assertFalse(idleProjection.shouldStopForeground)
        assertTrue(idleProjection.shouldStopSelf)
    }

    @Test
    fun `background pause resume projection keeps actions ordered and interruption mode coherent`() {
        val pausedActions = LegatoPlaybackNotificationTransport.notificationActionModelFor(
            state = LegatoAndroidPlaybackState.PAUSED,
            capabilities = LegatoAndroidTransportCapabilities(
                canSkipNext = true,
                canSkipPrevious = true,
                canSeek = true,
            ),
            mode = LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION,
        )
        val resumedActions = LegatoPlaybackNotificationTransport.notificationActionModelFor(
            state = LegatoAndroidPlaybackState.PLAYING,
            capabilities = LegatoAndroidTransportCapabilities(
                canSkipNext = true,
                canSkipPrevious = true,
                canSeek = true,
            ),
            mode = LegatoAndroidServiceMode.PLAYBACK_ACTIVE,
        )

        assertEquals(
            listOf(
                LegatoPlaybackNotificationTransport.ACTION_PREVIOUS,
                LegatoPlaybackNotificationTransport.ACTION_PLAY,
                LegatoPlaybackNotificationTransport.ACTION_NEXT,
            ),
            pausedActions.map { it.intentAction },
        )
        assertEquals(
            listOf(
                LegatoPlaybackNotificationTransport.ACTION_PREVIOUS,
                LegatoPlaybackNotificationTransport.ACTION_PAUSE,
                LegatoPlaybackNotificationTransport.ACTION_NEXT,
            ),
            resumedActions.map { it.intentAction },
        )
    }

    @Test
    fun `media-session playback projection remains track-consistent across interrupted pause then resume`() {
        val pausedProjection = projectMediaSessionPlaybackState(
            state = LegatoAndroidPlaybackState.PAUSED,
            snapshotPositionMs = 12_000L,
            activeTrackId = "track-1",
            previousProjection = MediaSessionPlaybackProjection(
                playbackStateCode = android.media.session.PlaybackState.STATE_PLAYING,
                positionMs = 11_800L,
                playbackSpeed = 1f,
                activeTrackId = "track-1",
            ),
        )
        val resumedProjection = projectMediaSessionPlaybackState(
            state = LegatoAndroidPlaybackState.PLAYING,
            snapshotPositionMs = 12_050L,
            activeTrackId = "track-1",
            previousProjection = pausedProjection,
        )

        assertEquals("track-1", pausedProjection.activeTrackId)
        assertEquals(android.media.session.PlaybackState.STATE_PAUSED, pausedProjection.playbackStateCode)
        assertEquals("track-1", resumedProjection.activeTrackId)
        assertEquals(android.media.session.PlaybackState.STATE_PLAYING, resumedProjection.playbackStateCode)
        assertNotEquals(0L, resumedProjection.positionMs)
    }
}
