package io.legato.core.core

import io.legato.core.events.LegatoAndroidEventEmitter
import io.legato.core.runtime.LegatoAndroidPlaybackRuntime
import io.legato.core.runtime.LegatoAndroidPlaybackRuntimeListener
import io.legato.core.runtime.LegatoAndroidRuntimeSnapshot
import io.legato.core.runtime.LegatoAndroidRuntimeTrackSource
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class LegatoAndroidPlayerEngineRemoteCommandRoutingTest {
    @Test
    fun `remote pause routes through canonical playback path`() = runBlocking {
        val playbackRuntime = RemoteRoutingPlaybackRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val dependencies = LegatoAndroidCoreDependencies(
            eventEmitter = eventEmitter,
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event -> events += event }

        components.playerEngine.setup()
        components.playerEngine.load(tracks = listOf(track()))
        components.playerEngine.play()
        playbackRuntime.resetCommandCounters()

        val eventsBeforeRemote = events.size
        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Pause)

        assertEquals(1, playbackRuntime.pauseCalls)
        assertEquals(LegatoAndroidPlaybackState.PAUSED, components.playerEngine.getSnapshot().state)

        val remoteEvents = events.drop(eventsBeforeRemote)
        assertTrue(remoteEvents.any { it.name == LegatoAndroidEventName.REMOTE_PAUSE })
        assertTrue(
            remoteEvents.any {
                it.name == LegatoAndroidEventName.PLAYBACK_STATE_CHANGED &&
                    (it.payload as? LegatoAndroidEventPayload.PlaybackStateChanged)?.state == LegatoAndroidPlaybackState.PAUSED
            },
        )
    }

    @Test
    fun `remote play routes through canonical playback path`() = runBlocking {
        val playbackRuntime = RemoteRoutingPlaybackRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val dependencies = LegatoAndroidCoreDependencies(
            eventEmitter = eventEmitter,
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event -> events += event }

        components.playerEngine.setup()
        components.playerEngine.load(tracks = listOf(track()))
        playbackRuntime.resetCommandCounters()

        val eventsBeforeRemote = events.size
        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Play)

        assertEquals(1, playbackRuntime.playCalls)
        assertEquals(LegatoAndroidPlaybackState.PLAYING, components.playerEngine.getSnapshot().state)

        val remoteEvents = events.drop(eventsBeforeRemote)
        assertTrue(remoteEvents.any { it.name == LegatoAndroidEventName.REMOTE_PLAY })
        assertTrue(
            remoteEvents.any {
                it.name == LegatoAndroidEventName.PLAYBACK_STATE_CHANGED &&
                    (it.payload as? LegatoAndroidEventPayload.PlaybackStateChanged)?.state == LegatoAndroidPlaybackState.PLAYING
            },
        )
    }

    @Test
    fun `remote next previous and seek stay no-op in v1`() = runBlocking {
        val playbackRuntime = RemoteRoutingPlaybackRuntime()
        val dependencies = LegatoAndroidCoreDependencies(
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)

        components.playerEngine.setup()
        components.playerEngine.load(tracks = listOf(track()))
        components.playerEngine.play()
        playbackRuntime.resetCommandCounters()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Next)
        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Previous)
        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Seek(45_000L))

        assertEquals(0, playbackRuntime.pauseCalls)
        assertEquals(0, playbackRuntime.playCalls)
        assertEquals(0, playbackRuntime.seekCalls)
        assertEquals(0, playbackRuntime.selectIndexCalls)
        assertEquals(LegatoAndroidPlaybackState.PLAYING, components.playerEngine.getSnapshot().state)
    }

    private fun track(): LegatoAndroidTrack = LegatoAndroidTrack(
        id = "remote-routing-track",
        url = "https://example.com/audio.mp3",
        title = "Remote Routing",
        artist = "Legato",
        durationMs = 180_000L,
    )
}

private class RemoteRoutingPlaybackRuntime : LegatoAndroidPlaybackRuntime {
    private var snapshot = LegatoAndroidRuntimeSnapshot()
    private var listener: LegatoAndroidPlaybackRuntimeListener? = null

    var playCalls: Int = 0
        private set

    var pauseCalls: Int = 0
        private set

    var seekCalls: Int = 0
        private set

    var selectIndexCalls: Int = 0
        private set

    override fun configure() = Unit

    override fun setListener(listener: LegatoAndroidPlaybackRuntimeListener?) {
        this.listener = listener
    }

    override fun replaceQueue(items: List<LegatoAndroidRuntimeTrackSource>, startIndex: Int?) {
        snapshot = snapshot.copy(currentIndex = if (items.isEmpty()) null else (startIndex ?: 0))
    }

    override fun selectIndex(index: Int) {
        selectIndexCalls += 1
        snapshot = snapshot.copy(currentIndex = index)
    }

    override fun play() {
        playCalls += 1
    }

    override fun pause() {
        pauseCalls += 1
    }

    override fun stop(resetPosition: Boolean) = Unit

    override fun seekTo(positionMs: Long) {
        seekCalls += 1
        snapshot = snapshot.copy(progress = snapshot.progress.copy(positionMs = positionMs))
    }

    override fun snapshot(): LegatoAndroidRuntimeSnapshot = snapshot

    override fun release() {
        listener = null
    }

    fun resetCommandCounters() {
        playCalls = 0
        pauseCalls = 0
        seekCalls = 0
        selectIndexCalls = 0
    }
}
