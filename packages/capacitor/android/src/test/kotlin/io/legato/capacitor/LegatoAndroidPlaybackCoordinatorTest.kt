package io.legato.capacitor

import io.legato.core.core.LegatoAndroidCoreComponents
import io.legato.core.core.LegatoAndroidCoreDependencies
import io.legato.core.core.LegatoAndroidCoreFactory
import io.legato.core.core.LegatoAndroidPauseOrigin
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidProgressUpdate
import io.legato.core.core.LegatoAndroidRemoteCommand
import io.legato.core.core.LegatoAndroidServiceMode
import io.legato.core.core.LegatoAndroidTrack
import io.legato.core.core.LegatoAndroidNowPlayingMetadata
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
import org.junit.Assert.assertTrue
import org.junit.Test

class LegatoAndroidPlaybackCoordinatorTest {
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
            duckOnTransientCanDuck = true,
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
