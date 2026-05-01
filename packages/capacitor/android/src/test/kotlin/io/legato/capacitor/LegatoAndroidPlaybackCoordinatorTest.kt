package io.legato.capacitor

import io.legato.core.core.LegatoAndroidCoreComponents
import io.legato.core.core.LegatoAndroidCoreDependencies
import io.legato.core.core.LegatoAndroidCoreFactory
import io.legato.core.core.LegatoAndroidPauseOrigin
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidProgressUpdate
import io.legato.core.core.LegatoAndroidRemoteCommand
import io.legato.core.core.LegatoAndroidServiceMode
import io.legato.core.core.LegatoAndroidSetupOptions
import io.legato.core.core.LegatoAndroidTransportCapabilities
import io.legato.core.core.LegatoAndroidTrack
import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidHeaderGroup
import io.legato.core.queue.LegatoAndroidQueueManager
import io.legato.core.remote.LegatoAndroidRemoteCommandRuntime
import io.legato.core.runtime.LegatoAndroidPlaybackRuntime
import io.legato.core.runtime.LegatoAndroidPlaybackRuntimeListener
import io.legato.core.runtime.LegatoAndroidRuntimeSnapshot
import io.legato.core.runtime.LegatoAndroidRuntimeTrackSource
import io.legato.core.session.LegatoAndroidAudioFocusGainHint
import io.legato.core.session.LegatoAndroidAudioFocusPolicy
import io.legato.core.session.LegatoAndroidInterruptionSignal
import io.legato.core.session.LegatoAndroidSessionManager
import io.legato.core.session.LegatoAndroidSessionRuntime
import io.legato.core.snapshot.LegatoAndroidSnapshotStore
import io.legato.core.state.LegatoAndroidStateMachine
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test

class LegatoAndroidPlaybackCoordinatorTest {
    @Test
    fun `coordinator exposes current now-playing metadata from active track`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/track.mp3",
                    title = "Song",
                    artist = "Artist",
                    album = "Album",
                    artwork = "https://example.com/artwork.jpg",
                    durationMs = 42_000,
                ),
            ),
        )

        val metadata = coordinator.currentNowPlayingMetadata()
        assertEquals("track-1", metadata?.trackId)
        assertEquals("Song", metadata?.title)
        assertEquals("Artist", metadata?.artist)
        assertEquals("Album", metadata?.album)
        assertEquals("https://example.com/artwork.jpg", metadata?.artwork)
        assertEquals(42_000L, metadata?.durationMs)
    }

    @Test
    fun `coordinator notifies now-playing metadata listeners when active track changes`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )
        val observed = mutableListOf<LegatoAndroidNowPlayingMetadata?>()
        coordinator.addNowPlayingMetadataListener { observed += it }

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/track.mp3",
                    title = "Song",
                ),
            ),
        )
        assertNull(observed.first())
        assertTrue(observed.any { it?.trackId == "track-1" })
    }

    @Test
    fun `coordinator now-playing metadata listener emits null after stop`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )
        val observed = mutableListOf<LegatoAndroidNowPlayingMetadata?>()
        coordinator.addNowPlayingMetadataListener { observed += it }

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/track.mp3",
                    title = "Song",
                ),
            ),
        )
        coordinator.stop()

        assertEquals("track-1", observed.firstOrNull { it?.trackId == "track-1" }?.trackId)
        assertNull(observed.last())
    }

    @Test
    fun `coordinator stop without active track does not emit duplicate null metadata`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )
        val observed = mutableListOf<LegatoAndroidNowPlayingMetadata?>()
        coordinator.addNowPlayingMetadataListener { observed += it }

        coordinator.setup()
        coordinator.stop()

        assertEquals(1, observed.size)
        assertNull(observed.single())
        assertNull(coordinator.currentNowPlayingMetadata())
    }

    @Test
    fun `coordinator projects active and off service modes from engine transitions`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val serviceRuntime = RecordingCoordinatorServiceRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = serviceRuntime,
        )
        val modes = mutableListOf<LegatoAndroidServiceMode>()
        coordinator.addServiceModeListener { modes += it }

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/track.mp3",
                ),
            ),
        )

        coordinator.play()
        coordinator.stop()

        assertTrue(modes.contains(LegatoAndroidServiceMode.PLAYBACK_ACTIVE))
        assertEquals(LegatoAndroidServiceMode.OFF, coordinator.currentServiceMode())
        assertTrue(serviceRuntime.ensureServiceRunningCalls > 0)
    }

    @Test
    fun `coordinator projects interruption pending mode on focus loss without auto resume`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/track.mp3",
                ),
            ),
        )
        coordinator.play()

        val playCallsBeforeLoss = runtime.playCallCount
        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusLostTransient)
        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusGained)

        assertEquals(LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION, coordinator.currentServiceMode())
        assertEquals(playCallsBeforeLoss, runtime.playCallCount)
        assertEquals(LegatoAndroidPauseOrigin.INTERRUPTION, coordinator.currentPauseOrigin())
    }

    @Test
    fun `coordinator projects playback state and notifies listeners on transitions`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )
        val projectedStates = mutableListOf<LegatoAndroidPlaybackState>()
        coordinator.addPlaybackStateListener { projectedStates += it }

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/track.mp3",
                ),
            ),
        )

        coordinator.play()
        coordinator.pause()

        assertEquals(LegatoAndroidPlaybackState.PAUSED, coordinator.currentPlaybackState())
        assertTrue(projectedStates.contains(LegatoAndroidPlaybackState.PLAYING))
        assertTrue(projectedStates.contains(LegatoAndroidPlaybackState.PAUSED))
    }

    @Test
    fun `coordinator play is gated by focus denial and emits canonical denied interruption without entering playing`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val focusGate = RecordingPlaybackFocusGate(granted = false)
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
            focusGate = focusGate,
        )
        val events = mutableListOf<io.legato.core.core.LegatoAndroidEvent>()
        coordinator.addCoreEventListener { event -> events += event }

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/track.mp3",
                ),
            ),
        )

        coordinator.play()

        assertEquals("play should be blocked when focus gate denies", 0, runtime.playCallCount)
        assertEquals("state must remain non-playing after denied play attempt", LegatoAndroidPlaybackState.READY, coordinator.currentPlaybackState())
        val interruptions = events
            .filter { it.name == io.legato.core.core.LegatoAndroidEventName.PLAYBACK_INTERRUPTION }
            .mapNotNull { it.payload as? io.legato.core.core.LegatoAndroidEventPayload.PlaybackInterruption }
        assertTrue(
            "focus-denied interruption should be emitted",
            interruptions.any { it.reason == io.legato.core.core.LegatoAndroidInterruptionReason.FOCUS_DENIED },
        )
        assertEquals("focus gate should be consulted exactly once", 1, focusGate.requestCalls)
    }

    @Test
    fun `coordinator add rebinds merged queue through runtime`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
            ),
        )

        coordinator.add(
            tracks = listOf(
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3"),
            ),
        )

        assertEquals(2, runtime.replaceQueueCalls)
        assertEquals(listOf("track-1", "track-2"), runtime.lastReplacedQueueIds)
        assertEquals(2, coordinator.core.playerEngine.getSnapshot().queue.items.size)
    }

    @Test
    fun `coordinator setup forwards header groups to engine for headerGroupId admission`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup(
            LegatoAndroidSetupOptions(
                headerGroups = listOf(
                    LegatoAndroidHeaderGroup(
                        id = "premium",
                        headers = mapOf("Authorization" to "Bearer shared"),
                    ),
                ),
            ),
        )

        coordinator.add(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-2",
                    url = "https://example.com/2.mp3",
                    headerGroupId = "premium",
                ),
            ),
        )

        val queuedTrack = coordinator.core.playerEngine.getSnapshot().queue.items.single()
        assertEquals("premium", queuedTrack.headerGroupId)
        assertEquals(1, runtime.replaceQueueCalls)
    }

    @Test
    fun `coordinator add with empty tracks keeps runtime queue untouched`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
            ),
        )

        coordinator.add(tracks = emptyList())

        assertEquals(1, runtime.replaceQueueCalls)
        assertEquals(listOf("track-1"), runtime.lastReplacedQueueIds)
    }

    @Test
    fun `coordinator skipTo routes index selection through runtime`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3"),
            ),
        )

        coordinator.skipTo(1)

        assertEquals(listOf(1), runtime.selectedIndices)
        assertEquals(1, coordinator.core.playerEngine.getSnapshot().currentIndex)
    }

    @Test
    fun `coordinator skipTo rejects out of bounds index`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
            ),
        )

        try {
            coordinator.skipTo(5)
            fail("Expected skipTo to reject out of bounds index")
        } catch (_: IllegalArgumentException) {
            assertTrue(runtime.selectedIndices.isEmpty())
        }
    }

    @Test
    fun `coordinator remove rebinds canonical queue through runtime`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3"),
                LegatoAndroidTrack(id = "track-3", url = "https://example.com/3.mp3"),
            ),
            startIndex = 1,
        )

        coordinator.remove(index = 1)

        assertEquals(listOf("track-1", "track-3"), runtime.lastReplacedQueueIds)
        assertEquals(2, runtime.replaceQueueCalls)
        assertEquals("track-3", coordinator.core.playerEngine.getSnapshot().currentTrack?.id)
    }

    @Test
    fun `coordinator remove shifts selected index when deleting item before active track`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3"),
                LegatoAndroidTrack(id = "track-3", url = "https://example.com/3.mp3"),
            ),
            startIndex = 2,
        )

        coordinator.remove(index = 0)

        assertEquals(listOf("track-2", "track-3"), runtime.lastReplacedQueueIds)
        assertEquals(1, coordinator.core.playerEngine.getSnapshot().currentIndex)
    }

    @Test
    fun `coordinator reset clears queue and returns idle snapshot`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3"),
            ),
        )

        coordinator.reset()

        val snapshot = coordinator.core.playerEngine.getSnapshot()
        assertTrue(snapshot.queue.items.isEmpty())
        assertEquals(null, snapshot.currentIndex)
        assertEquals(LegatoAndroidPlaybackState.IDLE, snapshot.state)
    }

    @Test
    fun `coordinator reset keeps idle state when queue already empty`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.reset()

        val snapshot = coordinator.core.playerEngine.getSnapshot()
        assertTrue(snapshot.queue.items.isEmpty())
        assertEquals(LegatoAndroidPlaybackState.IDLE, snapshot.state)
    }

    @Test
    fun `coordinator interruption projection stays coherent after canonical remove transition`() = runBlocking {
        val runtime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val coordinator = LegatoAndroidPlaybackCoordinator(
            core = buildCore(runtime, sessionRuntime),
            serviceRuntime = RecordingCoordinatorServiceRuntime(),
        )

        coordinator.setup()
        coordinator.load(
            listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3"),
            ),
            startIndex = 1,
        )
        coordinator.play()
        coordinator.remove(index = 0)

        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusLost)

        assertEquals(LegatoAndroidPlaybackState.PAUSED, coordinator.currentPlaybackState())
        assertEquals(LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION, coordinator.currentServiceMode())
        assertEquals(LegatoAndroidPauseOrigin.INTERRUPTION, coordinator.currentPauseOrigin())
    }

    @Test
    fun `service runtime mode projection starts service only for active interruption modes`() {
        assertFalse(shouldEnsureServiceRunning(LegatoAndroidServiceMode.OFF))
        assertTrue(shouldEnsureServiceRunning(LegatoAndroidServiceMode.PLAYBACK_ACTIVE))
        assertTrue(shouldEnsureServiceRunning(LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION))
    }

    private fun buildCore(
        runtime: RecordingPlaybackRuntime,
        sessionRuntime: RecordingSessionRuntime,
    ): LegatoAndroidCoreComponents = LegatoAndroidCoreFactory.create(
        dependencies = LegatoAndroidCoreDependencies(
            queueManager = LegatoAndroidQueueManager(),
            snapshotStore = LegatoAndroidSnapshotStore(),
            stateMachine = LegatoAndroidStateMachine(),
            sessionManager = LegatoAndroidSessionManager(sessionRuntime),
            remoteCommandManager = io.legato.core.remote.LegatoAndroidRemoteCommandManager(
                object : LegatoAndroidRemoteCommandRuntime {
                    override fun bind(listener: (LegatoAndroidRemoteCommand) -> Unit) = Unit

                    override fun updatePlaybackState(state: LegatoAndroidPlaybackState) = Unit

                    override fun updateTransportCapabilities(capabilities: LegatoAndroidTransportCapabilities) = Unit

                    override fun unbind() = Unit
                },
            ),
            playbackRuntime = runtime,
        ),
    )
}

private class RecordingCoordinatorServiceRuntime : LegatoAndroidCoordinatorServiceRuntime {
    var ensureServiceRunningCalls: Int = 0
        private set

    override fun ensureServiceRunning(mode: LegatoAndroidServiceMode) {
        ensureServiceRunningCalls += 1
    }
}

private class RecordingPlaybackRuntime : LegatoAndroidPlaybackRuntime {
    private var listener: LegatoAndroidPlaybackRuntimeListener? = null
    private var snapshot = LegatoAndroidRuntimeSnapshot()

    var playCallCount: Int = 0
        private set

    var replaceQueueCalls: Int = 0
        private set

    var lastReplacedQueueIds: List<String> = emptyList()
        private set

    var selectedIndices: List<Int> = emptyList()
        private set

    override fun configure() = Unit

    override fun setListener(listener: LegatoAndroidPlaybackRuntimeListener?) {
        this.listener = listener
    }

    override fun replaceQueue(items: List<LegatoAndroidRuntimeTrackSource>, startIndex: Int?) {
        replaceQueueCalls += 1
        lastReplacedQueueIds = items.map { it.id }
        snapshot = snapshot.copy(currentIndex = if (items.isEmpty()) null else (startIndex ?: 0))
    }

    override fun selectIndex(index: Int) {
        selectedIndices = selectedIndices + index
        snapshot = snapshot.copy(currentIndex = index)
    }

    override fun play() {
        playCallCount += 1
    }

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

private class RecordingSessionRuntime : LegatoAndroidSessionRuntime {
    private var listener: ((LegatoAndroidInterruptionSignal) -> Unit)? = null

    override fun configureSession() = Unit

    override fun audioFocusPolicy(): LegatoAndroidAudioFocusPolicy =
        LegatoAndroidAudioFocusPolicy(
            gainHint = LegatoAndroidAudioFocusGainHint.AUDIOFOCUS_GAIN,
            pauseOnTransientLoss = true,
            pauseOnTransientCanDuck = true,
            resumeAfterGainIfNotUserPaused = false,
        )

    override fun setInterruptionListener(listener: ((LegatoAndroidInterruptionSignal) -> Unit)?) {
        this.listener = listener
    }

    override fun onInterruption(signal: LegatoAndroidInterruptionSignal) = Unit

    override fun updatePlaybackState(state: LegatoAndroidPlaybackState) = Unit

    override fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?) = Unit

    override fun updateProgress(progress: LegatoAndroidProgressUpdate) = Unit

    override fun releaseSession() {
        listener = null
    }

    fun emit(signal: LegatoAndroidInterruptionSignal) {
        listener?.invoke(signal)
    }
}

private class RecordingPlaybackFocusGate(
    private val granted: Boolean,
) : LegatoAndroidPlaybackFocusGate {
    var requestCalls: Int = 0
        private set

    override fun requestPlaybackFocus(): Boolean {
        requestCalls += 1
        return granted
    }

    override fun abandonPlaybackFocus() = Unit
}
