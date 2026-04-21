package io.legato.core.core

import io.legato.core.events.LegatoAndroidEventEmitter
import io.legato.core.remote.LegatoAndroidMediaSessionBridge
import io.legato.core.runtime.LegatoAndroidPlaybackRuntime
import io.legato.core.runtime.LegatoAndroidPlaybackRuntimeListener
import io.legato.core.runtime.LegatoAndroidRuntimeSnapshot
import io.legato.core.runtime.LegatoAndroidRuntimeTrackSource
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LegatoAndroidCoreCompositionMediaSessionBridgeTest {
    @Test
    fun `factory defaults project session state into shared media-session bridge`() = runBlocking {
        val playbackRuntime = BridgeRecordingPlaybackRuntime()
        val dependencies = LegatoAndroidCoreDependencies(
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)

        components.playerEngine.setup()
        components.playerEngine.load(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/audio.mp3",
                    title = "Track 1",
                    artist = "Legato",
                    durationMs = 120_000L,
                ),
            ),
        )
        components.playerEngine.play()

        assertEquals(LegatoAndroidPlaybackState.PLAYING, dependencies.mediaSessionBridge.lastPlaybackState)
        assertEquals("track-1", dependencies.mediaSessionBridge.lastNowPlayingMetadata?.trackId)
        assertNotNull(dependencies.mediaSessionBridge.lastProgress)
    }

    @Test
    fun `shared media-session bridge dispatches remote commands to engine listener`() = runBlocking {
        val playbackRuntime = BridgeRecordingPlaybackRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val dependencies = LegatoAndroidCoreDependencies(
            eventEmitter = eventEmitter,
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event: LegatoAndroidEvent -> events += event }

        components.playerEngine.setup()
        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Pause)

        assertTrue(events.any { it.name == LegatoAndroidEventName.REMOTE_PAUSE })
    }

    @Test
    fun `shared media-session bridge projects pause transport action while playing`() = runBlocking {
        val playbackRuntime = BridgeRecordingPlaybackRuntime()
        val dependencies = LegatoAndroidCoreDependencies(
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)

        components.playerEngine.setup()
        components.playerEngine.load(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/audio.mp3",
                ),
            ),
        )
        components.playerEngine.play()

        assertEquals(
            LegatoAndroidMediaSessionBridge.TransportControl.PAUSE,
            dependencies.mediaSessionBridge.projectedTransportControl(),
        )
    }

    @Test
    fun `shared media-session bridge dispatches projected transport control to canonical remote path`() = runBlocking {
        val playbackRuntime = BridgeRecordingPlaybackRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val dependencies = LegatoAndroidCoreDependencies(
            eventEmitter = eventEmitter,
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event: LegatoAndroidEvent -> events += event }

        components.playerEngine.setup()
        components.playerEngine.load(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/audio.mp3",
                ),
            ),
        )
        components.playerEngine.play()

        dependencies.mediaSessionBridge.dispatchProjectedTransportControl()

        assertTrue(events.any { it.name == LegatoAndroidEventName.REMOTE_PAUSE })
    }
}

private class BridgeRecordingPlaybackRuntime : LegatoAndroidPlaybackRuntime {
    private var listener: LegatoAndroidPlaybackRuntimeListener? = null
    private var snapshot = LegatoAndroidRuntimeSnapshot()

    override fun configure() = Unit

    override fun setListener(listener: LegatoAndroidPlaybackRuntimeListener?) {
        this.listener = listener
    }

    override fun replaceQueue(items: List<LegatoAndroidRuntimeTrackSource>, startIndex: Int?) {
        snapshot = snapshot.copy(currentIndex = if (items.isEmpty()) null else (startIndex ?: 0))
    }

    override fun selectIndex(index: Int) {
        snapshot = snapshot.copy(currentIndex = index)
    }

    override fun play() = Unit

    override fun pause() = Unit

    override fun stop(resetPosition: Boolean) = Unit

    override fun seekTo(positionMs: Long) {
        snapshot = snapshot.copy(progress = snapshot.progress.copy(positionMs = positionMs))
    }

    override fun snapshot(): LegatoAndroidRuntimeSnapshot = snapshot

    override fun release() {
        listener = null
    }
}
