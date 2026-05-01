package io.legato.core.core

import io.legato.core.events.LegatoAndroidEventEmitter
import io.legato.core.queue.LegatoAndroidQueueManager
import io.legato.core.remote.LegatoAndroidRemoteCommandManager
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
import org.junit.Assert.assertTrue
import org.junit.Test

class LegatoAndroidPlayerEngineQueueOwnershipTest {
    @Test
    fun `remove rebinds runtime queue and keeps canonical snapshot in sync`() = runBlocking {
        val runtime = RecordingQueuePlaybackRuntime()
        val engine = buildEngine(runtime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3", durationMs = 111_000L),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3", durationMs = 222_000L),
                LegatoAndroidTrack(id = "track-3", url = "https://example.com/3.mp3", durationMs = 333_000L),
            ),
            startIndex = 1,
        )

        engine.remove(index = 1)

        assertEquals(listOf("track-1", "track-3"), runtime.lastQueueIds)
        assertEquals(1, runtime.lastStartIndex)
        val snapshot = engine.getSnapshot()
        assertEquals(listOf("track-1", "track-3"), snapshot.queue.items.map { it.id })
        assertEquals(1, snapshot.currentIndex)
        assertEquals("track-3", snapshot.currentTrack?.id)
    }

    @Test
    fun `remove shifts current index when deleting earlier queue item`() = runBlocking {
        val runtime = RecordingQueuePlaybackRuntime()
        val engine = buildEngine(runtime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3"),
                LegatoAndroidTrack(id = "track-3", url = "https://example.com/3.mp3"),
            ),
            startIndex = 2,
        )

        engine.remove(index = 0)

        assertEquals(listOf("track-2", "track-3"), runtime.lastQueueIds)
        assertEquals(1, runtime.lastStartIndex)
        assertEquals(1, engine.getSnapshot().currentIndex)
        assertEquals("track-3", engine.getSnapshot().currentTrack?.id)
    }

    @Test
    fun `reset clears queue and projects service mode off`() = runBlocking {
        val runtime = RecordingQueuePlaybackRuntime()
        val engine = buildEngine(runtime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3"),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3"),
            ),
        )
        engine.play()

        engine.reset()

        val snapshot = engine.getSnapshot()
        assertTrue(snapshot.queue.items.isEmpty())
        assertEquals(null, snapshot.currentIndex)
        assertEquals(LegatoAndroidPlaybackState.IDLE, snapshot.state)
        assertEquals(LegatoAndroidServiceMode.OFF, engine.getServiceMode())
    }

    @Test
    fun `reset from idle remains idempotent and keeps empty queue`() = runBlocking {
        val runtime = RecordingQueuePlaybackRuntime()
        val engine = buildEngine(runtime)

        engine.setup()
        engine.reset()

        val snapshot = engine.getSnapshot()
        assertTrue(snapshot.queue.items.isEmpty())
        assertEquals(LegatoAndroidPlaybackState.IDLE, snapshot.state)
    }

    @Test
    fun `add startIndex resolves against appended batch instead of absolute queue index`() = runBlocking {
        val runtime = RecordingQueuePlaybackRuntime()
        val engine = buildEngine(runtime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(id = "base-1", url = "https://example.com/base-1.mp3"),
                LegatoAndroidTrack(id = "base-2", url = "https://example.com/base-2.mp3"),
            ),
            startIndex = 0,
        )

        engine.add(
            tracks = listOf(
                LegatoAndroidTrack(id = "new-1", url = "https://example.com/new-1.mp3"),
                LegatoAndroidTrack(id = "new-2", url = "https://example.com/new-2.mp3"),
            ),
            startIndex = 1,
        )

        assertEquals(listOf("base-1", "base-2", "new-1", "new-2"), runtime.lastQueueIds)
        assertEquals(3, runtime.lastStartIndex)
        val snapshot = engine.getSnapshot()
        assertEquals(3, snapshot.currentIndex)
        assertEquals("new-2", snapshot.currentTrack?.id)
    }

    @Test
    fun `shared header group resolution merges track headers with track precedence`() = runBlocking {
        val runtime = RecordingQueuePlaybackRuntime()
        val engine = buildEngine(runtime)

        engine.setup(
            options = LegatoAndroidSetupOptions(
                headerGroups = listOf(
                    LegatoAndroidHeaderGroup(
                        id = "group-a",
                        headers = mapOf("Authorization" to "Bearer A", "X-Tenant" to "tenant-a"),
                    ),
                ),
            ),
        )

        engine.add(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/1.mp3",
                    headerGroupId = "group-a",
                    headers = mapOf("Authorization" to "Bearer override", "X-Track" to "yes"),
                ),
            ),
        )

        val runtimeTrack = runtime.lastQueueSources.first()
        assertEquals("Bearer override", runtimeTrack.headers["Authorization"])
        assertEquals("tenant-a", runtimeTrack.headers["X-Tenant"])
        assertEquals("yes", runtimeTrack.headers["X-Track"])
    }

    @Test
    fun `unknown header group fails fast and does not mutate queue`() = runBlocking {
        val runtime = RecordingQueuePlaybackRuntime()
        val engine = buildEngine(runtime)

        engine.setup(options = LegatoAndroidSetupOptions(headerGroups = emptyList()))

        val result = runCatching {
            engine.add(
                tracks = listOf(
                    LegatoAndroidTrack(
                        id = "track-1",
                        url = "https://example.com/1.mp3",
                        headerGroupId = "missing-group",
                    ),
                ),
            )
        }
        assertTrue(result.isFailure)

        assertTrue(engine.getSnapshot().queue.items.isEmpty())
    }

    @Test
    fun `setup header groups are immutable after initial setup`() = runBlocking {
        val runtime = RecordingQueuePlaybackRuntime()
        val engine = buildEngine(runtime)

        engine.setup(
            options = LegatoAndroidSetupOptions(
                headerGroups = listOf(
                    LegatoAndroidHeaderGroup(id = "group-a", headers = mapOf("Authorization" to "Bearer A")),
                ),
            ),
        )

        engine.setup(
            options = LegatoAndroidSetupOptions(
                headerGroups = listOf(
                    LegatoAndroidHeaderGroup(id = "group-b", headers = mapOf("Authorization" to "Bearer B")),
                ),
            ),
        )

        val result = runCatching {
            engine.add(
                tracks = listOf(
                    LegatoAndroidTrack(
                        id = "track-1",
                        url = "https://example.com/1.mp3",
                        headerGroupId = "group-b",
                    ),
                ),
            )
        }
        assertTrue(result.isFailure)
    }

    private fun buildEngine(playbackRuntime: RecordingQueuePlaybackRuntime): LegatoAndroidPlayerEngine {
        val sessionRuntime = object : LegatoAndroidSessionRuntime {
            override fun configureSession() = Unit

            override fun audioFocusPolicy(): LegatoAndroidAudioFocusPolicy =
                LegatoAndroidAudioFocusPolicy(
                    gainHint = LegatoAndroidAudioFocusGainHint.AUDIOFOCUS_GAIN,
                    pauseOnTransientLoss = true,
                    pauseOnTransientCanDuck = true,
                    resumeAfterGainIfNotUserPaused = false,
                )

            override fun setInterruptionListener(listener: ((LegatoAndroidInterruptionSignal) -> Unit)?) = Unit

            override fun onInterruption(signal: LegatoAndroidInterruptionSignal) = Unit

            override fun updatePlaybackState(state: LegatoAndroidPlaybackState) = Unit

            override fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?) = Unit

            override fun updateProgress(progress: LegatoAndroidProgressUpdate) = Unit

            override fun releaseSession() = Unit
        }

        return LegatoAndroidPlayerEngine(
            queueManager = LegatoAndroidQueueManager(),
            eventEmitter = LegatoAndroidEventEmitter(),
            snapshotStore = LegatoAndroidSnapshotStore(),
            trackMapper = io.legato.core.mapping.LegatoAndroidTrackMapper(),
            errorMapper = io.legato.core.errors.LegatoAndroidErrorMapper(),
            stateMachine = LegatoAndroidStateMachine(),
            sessionManager = LegatoAndroidSessionManager(sessionRuntime),
            remoteCommandManager = LegatoAndroidRemoteCommandManager(object : LegatoAndroidRemoteCommandRuntime {
                override fun bind(listener: (LegatoAndroidRemoteCommand) -> Unit) = Unit
                override fun updatePlaybackState(state: LegatoAndroidPlaybackState) = Unit
                override fun updateTransportCapabilities(capabilities: LegatoAndroidTransportCapabilities) = Unit
                override fun unbind() = Unit
            }),
            playbackRuntime = playbackRuntime,
        )
    }
}

private class RecordingQueuePlaybackRuntime : LegatoAndroidPlaybackRuntime {
    private var listener: LegatoAndroidPlaybackRuntimeListener? = null
    private var snapshot = LegatoAndroidRuntimeSnapshot()

    var lastQueueIds: List<String> = emptyList()
        private set

    var lastQueueSources: List<LegatoAndroidRuntimeTrackSource> = emptyList()
        private set

    var lastStartIndex: Int? = null
        private set

    override fun configure() = Unit

    override fun setListener(listener: LegatoAndroidPlaybackRuntimeListener?) {
        this.listener = listener
    }

    override fun replaceQueue(items: List<LegatoAndroidRuntimeTrackSource>, startIndex: Int?) {
        lastQueueSources = items
        lastQueueIds = items.map { it.id }
        lastStartIndex = startIndex
        snapshot = snapshot.copy(
            currentIndex = if (items.isEmpty()) null else (startIndex ?: 0),
            progress = snapshot.progress.copy(positionMs = 0L, bufferedPositionMs = 0L),
        )
    }

    override fun selectIndex(index: Int) {
        snapshot = snapshot.copy(currentIndex = index)
    }

    override fun play() = Unit

    override fun pause() = Unit

    override fun stop(resetPosition: Boolean) {
        if (resetPosition) {
            snapshot = snapshot.copy(progress = snapshot.progress.copy(positionMs = 0L, bufferedPositionMs = 0L))
        }
    }

    override fun seekTo(positionMs: Long) {
        snapshot = snapshot.copy(progress = snapshot.progress.copy(positionMs = positionMs))
    }

    override fun snapshot(): LegatoAndroidRuntimeSnapshot = snapshot

    override fun release() {
        listener = null
    }
}
