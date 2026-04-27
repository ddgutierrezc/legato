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
import io.legato.core.session.LegatoAndroidInterruptionSignal
import io.legato.core.session.LegatoAndroidSessionDefaults
import io.legato.core.session.LegatoAndroidSessionManager
import io.legato.core.session.LegatoAndroidSessionRuntime
import io.legato.core.snapshot.LegatoAndroidSnapshotStore
import io.legato.core.state.LegatoAndroidStateMachine
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LegatoAndroidPlayerEngineInterruptionPolicyTest {
    @Test
    fun `milestone focus policy disables auto-resume on focus gain`() {
        val policy = LegatoAndroidSessionDefaults.MILESTONE1_AUDIO_FOCUS_POLICY

        assertEquals(LegatoAndroidAudioFocusGainHint.AUDIOFOCUS_GAIN, policy.gainHint)
        assertFalse(policy.resumeAfterGainIfNotUserPaused)
    }

    @Test
    fun `audio focus loss transitions canonical state to paused and projects resume pending mode`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val engine = LegatoAndroidPlayerEngine(
            queueManager = LegatoAndroidQueueManager(),
            eventEmitter = eventEmitter,
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

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/audio.mp3",
                    durationMs = 120_000L,
                ),
            ),
        )
        engine.play()

        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusLostTransient)

        assertEquals(LegatoAndroidPlaybackState.PAUSED, engine.getSnapshot().state)
        assertEquals(LegatoAndroidPauseOrigin.INTERRUPTION, engine.getPauseOrigin())
        assertEquals(LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION, engine.getServiceMode())
    }

    @Test
    fun `focus regain does not auto-resume playback`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/audio.mp3",
                ),
            ),
        )
        engine.play()
        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusLost)
        val playCallsAfterLoss = playbackRuntime.playCallCount

        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusGained)

        assertEquals(playCallsAfterLoss, playbackRuntime.playCallCount)
        assertEquals(LegatoAndroidPlaybackState.PAUSED, engine.getSnapshot().state)
    }

    @Test
    fun `service-originated becoming noisy signal pauses playback with interruption origin`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/audio.mp3",
                ),
            ),
        )
        engine.play()

        sessionRuntime.emit(LegatoAndroidInterruptionSignal.BecomingNoisy)

        assertEquals(LegatoAndroidPlaybackState.PAUSED, engine.getSnapshot().state)
        assertEquals(LegatoAndroidPauseOrigin.INTERRUPTION, engine.getPauseOrigin())
        assertEquals(LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION, engine.getServiceMode())
    }

    @Test
    fun `service-originated can-duck signal pauses playback and keeps interrupted mode`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(
                    id = "track-1",
                    url = "https://example.com/audio.mp3",
                ),
            ),
        )
        engine.play()

        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusLostTransientCanDuck)

        assertEquals(LegatoAndroidPlaybackState.PAUSED, engine.getSnapshot().state)
        assertEquals(LegatoAndroidPauseOrigin.INTERRUPTION, engine.getPauseOrigin())
        assertEquals(LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION, engine.getServiceMode())
    }

    @Test
    fun `focus-denied interruption emits canonical interruption event and keeps runtime non-playing`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event -> events += event }
        val engine = buildEngine(playbackRuntime, sessionRuntime, eventEmitter)

        engine.setup()
        engine.load(tracks = listOf(LegatoAndroidTrack(id = "track-1", url = "https://example.com/audio.mp3")))
        engine.play()

        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusDenied)

        assertEquals(LegatoAndroidPlaybackState.PAUSED, engine.getSnapshot().state)
        val interruptionEvents = events
            .filter { it.name == LegatoAndroidEventName.PLAYBACK_INTERRUPTION }
            .mapNotNull { it.payload as? LegatoAndroidEventPayload.PlaybackInterruption }
        assertTrue(interruptionEvents.any {
            it.reason == LegatoAndroidInterruptionReason.FOCUS_DENIED && !it.resumable
        })
    }

    @Test
    fun `focus-denied interruption before play does not enter playing or buffering`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event -> events += event }
        val engine = buildEngine(playbackRuntime, sessionRuntime, eventEmitter)

        engine.setup()
        engine.load(tracks = listOf(LegatoAndroidTrack(id = "track-1", url = "https://example.com/audio.mp3")))

        sessionRuntime.emit(LegatoAndroidInterruptionSignal.AudioFocusDenied)

        assertEquals(LegatoAndroidPlaybackState.READY, engine.getSnapshot().state)
        assertEquals(0, playbackRuntime.playCallCount)
        val interruptions = events
            .filter { it.name == LegatoAndroidEventName.PLAYBACK_INTERRUPTION }
            .mapNotNull { it.payload as? LegatoAndroidEventPayload.PlaybackInterruption }
        assertTrue(interruptions.any { it.reason == LegatoAndroidInterruptionReason.FOCUS_DENIED })
    }

    @Test
    fun `runtime ended callback transitions state and emits playback-ended event`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event -> events += event }
        val engine = buildEngine(playbackRuntime, sessionRuntime, eventEmitter)

        engine.setup()
        engine.load(tracks = listOf(LegatoAndroidTrack(id = "track-1", url = "https://example.com/audio.mp3")))
        engine.play()

        playbackRuntime.emitEnded()

        assertEquals(LegatoAndroidPlaybackState.ENDED, engine.getSnapshot().state)
        assertTrue(events.any { it.name == LegatoAndroidEventName.PLAYBACK_ENDED })
    }

    @Test
    fun `runtime ended callback is deduped and ignores late progress callbacks`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event -> events += event }
        val engine = buildEngine(playbackRuntime, sessionRuntime, eventEmitter)

        engine.setup()
        engine.load(tracks = listOf(LegatoAndroidTrack(id = "track-1", url = "https://example.com/audio.mp3")))
        engine.play()
        playbackRuntime.emitProgress(positionMs = 12_000L, durationMs = 120_000L, bufferedPositionMs = 24_000L)

        events.clear()
        playbackRuntime.emitEnded()
        val endedSnapshot = engine.getSnapshot()

        playbackRuntime.emitEnded()
        playbackRuntime.emitProgress(positionMs = 15_000L, durationMs = 120_000L, bufferedPositionMs = 30_000L)

        val finalSnapshot = engine.getSnapshot()
        val endedEvents = events.count { it.name == LegatoAndroidEventName.PLAYBACK_ENDED }
        val progressEvents = events.count { it.name == LegatoAndroidEventName.PLAYBACK_PROGRESS }

        assertEquals(1, endedEvents)
        assertEquals(0, progressEvents)
        assertEquals(LegatoAndroidPlaybackState.ENDED, finalSnapshot.state)
        assertEquals(endedSnapshot.positionMs, finalSnapshot.positionMs)
        assertEquals(endedSnapshot.bufferedPositionMs, finalSnapshot.bufferedPositionMs)
    }

    @Test
    fun `runtime buffering callbacks cannot rebound state after ended`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(tracks = listOf(LegatoAndroidTrack(id = "track-1", url = "https://example.com/audio.mp3")))
        engine.play()

        playbackRuntime.emitBuffering(true)
        assertEquals(LegatoAndroidPlaybackState.BUFFERING, engine.getSnapshot().state)

        playbackRuntime.emitEnded()
        assertEquals(LegatoAndroidPlaybackState.ENDED, engine.getSnapshot().state)

        playbackRuntime.emitBuffering(false)
        assertEquals(LegatoAndroidPlaybackState.ENDED, engine.getSnapshot().state)
    }

    @Test
    fun `runtime fatal error callback transitions state and emits playback error`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val eventEmitter = LegatoAndroidEventEmitter()
        val events = mutableListOf<LegatoAndroidEvent>()
        eventEmitter.addListener { event -> events += event }
        val engine = buildEngine(playbackRuntime, sessionRuntime, eventEmitter)

        engine.setup()
        engine.load(tracks = listOf(LegatoAndroidTrack(id = "track-1", url = "https://example.com/audio.mp3")))
        engine.play()

        playbackRuntime.emitFatalError(IllegalStateException("boom"))

        assertEquals(LegatoAndroidPlaybackState.ERROR, engine.getSnapshot().state)
        val errorPayloads = events
            .filter { it.name == LegatoAndroidEventName.PLAYBACK_ERROR }
            .mapNotNull { it.payload as? LegatoAndroidEventPayload.PlaybackError }
        assertTrue(errorPayloads.any { it.error.message == "boom" })
    }

    @Test
    fun `runtime progress and buffering callbacks update canonical snapshot`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(tracks = listOf(LegatoAndroidTrack(id = "track-1", url = "https://example.com/audio.mp3")))
        engine.play()

        playbackRuntime.emitBuffering(true)
        assertEquals(LegatoAndroidPlaybackState.BUFFERING, engine.getSnapshot().state)

        playbackRuntime.emitProgress(positionMs = 5_000L, durationMs = 120_000L, bufferedPositionMs = 20_000L)
        val snapshot = engine.getSnapshot()
        assertEquals(5_000L, snapshot.positionMs)
        assertEquals(120_000L, snapshot.durationMs)
        assertEquals(20_000L, snapshot.bufferedPositionMs)

        playbackRuntime.emitBuffering(false)
        assertEquals(LegatoAndroidPlaybackState.PLAYING, engine.getSnapshot().state)
    }

    @Test
    fun `runtime progress transition syncs active track index and progress`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3", durationMs = 100_000L),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3", durationMs = 200_000L),
            ),
        )
        engine.play()

        playbackRuntime.emitProgress(
            currentIndex = 1,
            positionMs = 3_000L,
            durationMs = 200_000L,
            bufferedPositionMs = 9_000L,
        )

        val snapshot = engine.getSnapshot()
        assertEquals(1, snapshot.currentIndex)
        assertEquals("track-2", snapshot.currentTrack?.id)
        assertEquals(3_000L, snapshot.positionMs)
        assertEquals(200_000L, snapshot.durationMs)
        assertEquals(9_000L, snapshot.bufferedPositionMs)
        assertEquals(1, snapshot.queue.currentIndex)
    }

    @Test
    fun `runtime progress item transition rebases stale callback progress to new active item snapshot`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3", durationMs = 100_000L),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3", durationMs = 200_000L),
            ),
        )
        engine.play()

        playbackRuntime.emitProgress(
            currentIndex = 1,
            positionMs = 100_000L,
            durationMs = 100_000L,
            bufferedPositionMs = 100_000L,
            runtimePositionMs = 0L,
            runtimeDurationMs = null,
            runtimeBufferedPositionMs = 0L,
        )

        val snapshot = engine.getSnapshot()
        assertEquals(1, snapshot.currentIndex)
        assertEquals("track-2", snapshot.currentTrack?.id)
        assertEquals(0L, snapshot.positionMs)
        assertEquals(200_000L, snapshot.durationMs)
        assertEquals(0L, snapshot.bufferedPositionMs)
    }

    @Test
    fun `user paused with active track remains playback active for service projection`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(tracks = listOf(LegatoAndroidTrack(id = "track-1", url = "https://example.com/audio.mp3")))
        engine.play()
        engine.pause()

        assertEquals(LegatoAndroidPlaybackState.PAUSED, engine.getSnapshot().state)
        assertEquals(LegatoAndroidPauseOrigin.USER, engine.getPauseOrigin())
        assertEquals(LegatoAndroidServiceMode.PLAYBACK_ACTIVE, engine.getServiceMode())
    }

    @Test
    fun `runtime progress ignores out of bounds index while still publishing progress`() = runBlocking {
        val playbackRuntime = RecordingPlaybackRuntime()
        val sessionRuntime = RecordingSessionRuntime()
        val engine = buildEngine(playbackRuntime, sessionRuntime)

        engine.setup()
        engine.load(
            tracks = listOf(
                LegatoAndroidTrack(id = "track-1", url = "https://example.com/1.mp3", durationMs = 100_000L),
                LegatoAndroidTrack(id = "track-2", url = "https://example.com/2.mp3", durationMs = 200_000L),
            ),
        )
        engine.play()

        playbackRuntime.emitProgress(
            currentIndex = 99,
            positionMs = 7_500L,
            durationMs = 333_000L,
            bufferedPositionMs = 11_000L,
        )

        val snapshot = engine.getSnapshot()
        assertEquals(0, snapshot.currentIndex)
        assertEquals("track-1", snapshot.currentTrack?.id)
        assertEquals(7_500L, snapshot.positionMs)
        assertEquals(333_000L, snapshot.durationMs)
        assertEquals(11_000L, snapshot.bufferedPositionMs)
        assertEquals(0, snapshot.queue.currentIndex)
    }

    private fun buildEngine(
        playbackRuntime: RecordingPlaybackRuntime,
        sessionRuntime: RecordingSessionRuntime,
        eventEmitter: LegatoAndroidEventEmitter = LegatoAndroidEventEmitter(),
    ): LegatoAndroidPlayerEngine = LegatoAndroidPlayerEngine(
        queueManager = LegatoAndroidQueueManager(),
        eventEmitter = eventEmitter,
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

private class RecordingPlaybackRuntime : LegatoAndroidPlaybackRuntime {
    private var listener: LegatoAndroidPlaybackRuntimeListener? = null
    private var snapshot = LegatoAndroidRuntimeSnapshot()

    var playCallCount: Int = 0
        private set

    override fun configure() = Unit

    override fun setListener(listener: LegatoAndroidPlaybackRuntimeListener?) {
        this.listener = listener
    }

    override fun replaceQueue(items: List<LegatoAndroidRuntimeTrackSource>, startIndex: Int?) {
        snapshot = snapshot.copy(currentIndex = if (items.isEmpty()) null else 0)
    }

    override fun selectIndex(index: Int) {
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

    fun emitEnded() {
        listener?.onEnded()
    }

    fun emitFatalError(error: Throwable) {
        listener?.onFatalError(error)
    }

    fun emitProgress(
        currentIndex: Int? = snapshot.currentIndex,
        positionMs: Long,
        durationMs: Long?,
        bufferedPositionMs: Long?,
        runtimePositionMs: Long = positionMs,
        runtimeDurationMs: Long? = durationMs,
        runtimeBufferedPositionMs: Long? = bufferedPositionMs,
    ) {
        snapshot = snapshot.copy(
            currentIndex = currentIndex,
            progress = snapshot.progress.copy(
                positionMs = runtimePositionMs,
                durationMs = runtimeDurationMs,
                bufferedPositionMs = runtimeBufferedPositionMs,
            ),
        )
        listener?.onProgress(
            io.legato.core.runtime.LegatoAndroidRuntimeProgress(
                positionMs = positionMs,
                durationMs = durationMs,
                bufferedPositionMs = bufferedPositionMs,
            ),
        )
    }

    fun emitBuffering(isBuffering: Boolean) {
        listener?.onBuffering(isBuffering)
    }
}

private class RecordingSessionRuntime : LegatoAndroidSessionRuntime {
    private var listener: ((LegatoAndroidInterruptionSignal) -> Unit)? = null

    override fun configureSession() = Unit

    override fun audioFocusPolicy() = LegatoAndroidSessionDefaults.MILESTONE1_AUDIO_FOCUS_POLICY

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
