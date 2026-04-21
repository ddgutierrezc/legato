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
        assertEquals(LegatoAndroidServiceMode.PLAYBACK_ACTIVE, components.playerEngine.getServiceMode())

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
    fun `stop tears down service mode after paused resumable session`() = runBlocking {
        val playbackRuntime = RemoteRoutingPlaybackRuntime()
        val dependencies = LegatoAndroidCoreDependencies(
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)

        components.playerEngine.setup()
        components.playerEngine.load(tracks = listOf(track()))
        components.playerEngine.play()
        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Pause)

        assertEquals(LegatoAndroidServiceMode.PLAYBACK_ACTIVE, components.playerEngine.getServiceMode())

        components.playerEngine.stop()

        assertEquals(LegatoAndroidServiceMode.OFF, components.playerEngine.getServiceMode())
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
    fun `remote next routes through canonical skip handler`() = runBlocking {
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
        components.playerEngine.load(tracks = listOf(track(id = "1"), track(id = "2")))
        components.playerEngine.play()
        playbackRuntime.resetCommandCounters()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Next)

        assertEquals(1, playbackRuntime.selectIndexCalls)
        assertEquals(0, playbackRuntime.seekCalls)
        assertEquals(1, components.playerEngine.getSnapshot().currentIndex)
        assertTrue(events.any { it.name == LegatoAndroidEventName.REMOTE_NEXT })
    }

    @Test
    fun `remote next at end transitions playback to ended and emits playbackEnded`() = runBlocking {
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
        components.playerEngine.load(tracks = listOf(track(id = "1"), track(id = "2")))
        components.playerEngine.play()
        components.playerEngine.skipToNext()
        playbackRuntime.resetCommandCounters()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Next)

        assertEquals(LegatoAndroidPlaybackState.ENDED, components.playerEngine.getSnapshot().state)
        assertEquals(0, playbackRuntime.selectIndexCalls)
        assertTrue(events.any { it.name == LegatoAndroidEventName.PLAYBACK_ENDED })
        assertTrue(events.any { it.name == LegatoAndroidEventName.REMOTE_NEXT })
    }

    @Test
    fun `remote next at end ignores stale buffering callbacks after ended`() = runBlocking {
        val playbackRuntime = RemoteRoutingPlaybackRuntime()
        val dependencies = LegatoAndroidCoreDependencies(
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)

        components.playerEngine.setup()
        components.playerEngine.load(tracks = listOf(track(id = "1"), track(id = "2")))
        components.playerEngine.play()
        components.playerEngine.skipToNext()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Next)
        assertEquals(LegatoAndroidPlaybackState.ENDED, components.playerEngine.getSnapshot().state)

        playbackRuntime.emitBuffering(false)
        assertEquals(LegatoAndroidPlaybackState.ENDED, components.playerEngine.getSnapshot().state)
    }

    @Test
    fun `remote next at end does not duplicate playbackEnded when runtime ended callback arrives late`() = runBlocking {
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
        components.playerEngine.load(tracks = listOf(track(id = "1"), track(id = "2")))
        components.playerEngine.play()
        components.playerEngine.skipToNext()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Next)
        playbackRuntime.emitEnded()

        val playbackEndedCount = events.count { it.name == LegatoAndroidEventName.PLAYBACK_ENDED }
        assertEquals(LegatoAndroidPlaybackState.ENDED, components.playerEngine.getSnapshot().state)
        assertEquals(1, playbackEndedCount)
    }

    @Test
    fun `remote previous seeks to zero when current position is greater than threshold`() = runBlocking {
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
        components.playerEngine.load(tracks = listOf(track(id = "1"), track(id = "2")))
        components.playerEngine.skipToNext()
        components.playerEngine.seekTo(7_500L)
        playbackRuntime.resetCommandCounters()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Previous)

        assertEquals(1, playbackRuntime.seekCalls)
        assertEquals(0, playbackRuntime.selectIndexCalls)
        assertEquals(1, components.playerEngine.getSnapshot().currentIndex)
        assertEquals(0L, components.playerEngine.getSnapshot().positionMs)
        assertTrue(events.any { it.name == LegatoAndroidEventName.REMOTE_PREVIOUS })
    }

    @Test
    fun `remote previous skips to previous track when position is at or below threshold`() = runBlocking {
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
        components.playerEngine.load(tracks = listOf(track(id = "1"), track(id = "2"), track(id = "3")))
        components.playerEngine.skipToNext()
        components.playerEngine.skipToNext()
        components.playerEngine.seekTo(2_000L)
        playbackRuntime.resetCommandCounters()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Previous)

        assertEquals(1, playbackRuntime.selectIndexCalls)
        assertEquals(0, playbackRuntime.seekCalls)
        assertEquals(1, components.playerEngine.getSnapshot().currentIndex)
        assertTrue(events.any { it.name == LegatoAndroidEventName.REMOTE_PREVIOUS })
    }

    @Test
    fun `remote previous on first track seeks to zero`() = runBlocking {
        val playbackRuntime = RemoteRoutingPlaybackRuntime()
        val dependencies = LegatoAndroidCoreDependencies(
            playbackRuntime = playbackRuntime,
        )
        val components = LegatoAndroidCoreFactory.create(dependencies)

        components.playerEngine.setup()
        components.playerEngine.load(tracks = listOf(track(id = "1"), track(id = "2")))
        components.playerEngine.seekTo(2_000L)
        playbackRuntime.resetCommandCounters()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Previous)

        assertEquals(1, playbackRuntime.seekCalls)
        assertEquals(0, playbackRuntime.selectIndexCalls)
        assertEquals(0, components.playerEngine.getSnapshot().currentIndex)
        assertEquals(0L, components.playerEngine.getSnapshot().positionMs)
    }

    @Test
    fun `remote seek routes through canonical seek handler`() = runBlocking {
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
        components.playerEngine.load(tracks = listOf(track(id = "1")))
        playbackRuntime.resetCommandCounters()

        dependencies.mediaSessionBridge.dispatchRemoteCommandForTesting(LegatoAndroidRemoteCommand.Seek(45_000L))

        assertEquals(1, playbackRuntime.seekCalls)
        assertEquals(45_000L, components.playerEngine.getSnapshot().positionMs)
        assertTrue(events.any { it.name == LegatoAndroidEventName.REMOTE_SEEK })
    }

    private fun track(id: String = "remote-routing-track"): LegatoAndroidTrack = LegatoAndroidTrack(
        id = id,
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

    fun emitBuffering(isBuffering: Boolean) {
        listener?.onBuffering(isBuffering)
    }

    fun emitEnded() {
        listener?.onEnded()
    }
}
