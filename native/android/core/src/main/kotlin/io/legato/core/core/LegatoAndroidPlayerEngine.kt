package io.legato.core.core

import io.legato.core.errors.LegatoAndroidErrorMapper
import io.legato.core.events.LegatoAndroidEventEmitter
import io.legato.core.mapping.LegatoAndroidTrackMapper
import io.legato.core.queue.LegatoAndroidQueueManager
import io.legato.core.remote.LegatoAndroidRemoteCommandManager
import io.legato.core.runtime.LegatoAndroidPlaybackRuntime
import io.legato.core.runtime.LegatoAndroidPlaybackRuntimeListener
import io.legato.core.runtime.LegatoAndroidRuntimeProgress
import io.legato.core.runtime.LegatoAndroidRuntimeTrackSource
import io.legato.core.session.LegatoAndroidInterruptionSignal
import io.legato.core.session.LegatoAndroidSessionManager
import io.legato.core.snapshot.LegatoAndroidSnapshotStore
import io.legato.core.state.LegatoAndroidStateMachine

class LegatoAndroidPlayerEngine(
    private val queueManager: LegatoAndroidQueueManager,
    private val eventEmitter: LegatoAndroidEventEmitter,
    private val snapshotStore: LegatoAndroidSnapshotStore,
    private val trackMapper: LegatoAndroidTrackMapper,
    private val errorMapper: LegatoAndroidErrorMapper,
    private val stateMachine: LegatoAndroidStateMachine,
    private val sessionManager: LegatoAndroidSessionManager,
    private val remoteCommandManager: LegatoAndroidRemoteCommandManager,
    private val playbackRuntime: LegatoAndroidPlaybackRuntime,
) {
    private var isSetup: Boolean = false
    private var pauseOrigin: LegatoAndroidPauseOrigin = LegatoAndroidPauseOrigin.USER

    suspend fun setup() {
        if (isSetup) {
            return
        }

        sessionManager.configureSession()
        sessionManager.setInterruptionListener(::onInterruption)
        remoteCommandManager.bind(::onRemoteCommand)
        playbackRuntime.setListener(runtimeListener)
        playbackRuntime.configure()
        isSetup = true
    }

    suspend fun load(tracks: List<LegatoAndroidTrack>, startIndex: Int? = null) {
        guardSetup()

        runCatching {
            val mappedTracks = trackMapper.mapContractTracks(tracks)
            val queueSnapshot = queueManager.replaceQueue(mappedTracks, startIndex)
            playbackRuntime.replaceQueue(mappedTracks.map(::toRuntimeTrackSource), startIndex)
            val runtimeSnapshot = playbackRuntime.snapshot()
            val currentTrack = queueManager.getCurrentTrack()
            val currentState = snapshotStore.getPlaybackSnapshot().state
            val loadingState = stateMachine.reduce(currentState, LegatoAndroidStateMachine.LegatoAndroidStateInput.PREPARE)
            val readyState = stateMachine.reduce(loadingState, LegatoAndroidStateMachine.LegatoAndroidStateInput.PREPARED)

            val snapshot = LegatoAndroidPlaybackSnapshot(
                state = readyState,
                currentTrack = currentTrack,
                currentIndex = runtimeSnapshot.currentIndex ?: queueSnapshot.currentIndex,
                positionMs = runtimeSnapshot.progress.positionMs,
                durationMs = runtimeSnapshot.progress.durationMs ?: currentTrack?.durationMs,
                bufferedPositionMs = runtimeSnapshot.progress.bufferedPositionMs,
                queue = queueSnapshot,
            )

            snapshotStore.replacePlaybackSnapshot(snapshot)
            publishQueueAndTrack(snapshot)
            publishState(snapshot.state)
            publishMetadata(snapshot.currentTrack)
            publishProgress(snapshot)
        }.onFailure(::publishPlatformFailure)
    }

    suspend fun play() {
        guardSetup()
        executePlay()
    }

    suspend fun pause() {
        guardSetup()
        executePause()
    }

    suspend fun stop() {
        guardSetup()
        if (!runRuntimeOperation {
            playbackRuntime.stop(resetPosition = true)
        }) return
        pauseOrigin = LegatoAndroidPauseOrigin.USER
        transitionTo(LegatoAndroidStateMachine.LegatoAndroidStateInput.STOP)
        val runtimeSnapshot = playbackRuntime.snapshot()
        snapshotStore.updatePlaybackSnapshot {
            it.copy(
                positionMs = runtimeSnapshot.progress.positionMs,
                bufferedPositionMs = runtimeSnapshot.progress.bufferedPositionMs,
                durationMs = runtimeSnapshot.progress.durationMs ?: it.durationMs,
            )
        }
        publishProgress(snapshotStore.getPlaybackSnapshot())
    }

    suspend fun seekTo(positionMs: Long) {
        guardSetup()
        if (!runRuntimeOperation {
            playbackRuntime.seekTo(positionMs)
        }) return

        val runtimeSnapshot = playbackRuntime.snapshot()
        snapshotStore.updatePlaybackSnapshot { snapshot ->
            snapshot.copy(
                positionMs = runtimeSnapshot.progress.positionMs,
                bufferedPositionMs = runtimeSnapshot.progress.bufferedPositionMs,
                durationMs = runtimeSnapshot.progress.durationMs ?: snapshot.durationMs,
            )
        }
        publishProgress(snapshotStore.getPlaybackSnapshot())
    }

    suspend fun skipToNext() {
        guardSetup()
        val movedIndex = queueManager.moveToNext() ?: return
        if (!runRuntimeOperation {
            playbackRuntime.selectIndex(movedIndex)
        }) return

        val runtimeSnapshot = playbackRuntime.snapshot()
        val track = queueManager.getCurrentTrack()

        snapshotStore.updatePlaybackSnapshot { snapshot ->
            snapshot.copy(
                currentTrack = track,
                currentIndex = runtimeSnapshot.currentIndex ?: movedIndex,
                durationMs = runtimeSnapshot.progress.durationMs ?: track?.durationMs,
                positionMs = runtimeSnapshot.progress.positionMs,
                bufferedPositionMs = runtimeSnapshot.progress.bufferedPositionMs,
                queue = queueManager.getQueueSnapshot(),
            )
        }

        val snapshot = snapshotStore.getPlaybackSnapshot()
        publishQueueAndTrack(snapshot)
        publishMetadata(track)
        publishProgress(snapshot)
    }

    suspend fun skipToPrevious() {
        guardSetup()
        val movedIndex = queueManager.moveToPrevious() ?: return
        if (!runRuntimeOperation {
            playbackRuntime.selectIndex(movedIndex)
        }) return

        val runtimeSnapshot = playbackRuntime.snapshot()
        val track = queueManager.getCurrentTrack()

        snapshotStore.updatePlaybackSnapshot { snapshot ->
            snapshot.copy(
                currentTrack = track,
                currentIndex = runtimeSnapshot.currentIndex ?: movedIndex,
                durationMs = runtimeSnapshot.progress.durationMs ?: track?.durationMs,
                positionMs = runtimeSnapshot.progress.positionMs,
                bufferedPositionMs = runtimeSnapshot.progress.bufferedPositionMs,
                queue = queueManager.getQueueSnapshot(),
            )
        }

        val snapshot = snapshotStore.getPlaybackSnapshot()
        publishQueueAndTrack(snapshot)
        publishMetadata(track)
        publishProgress(snapshot)
    }

    fun getSnapshot(): LegatoAndroidPlaybackSnapshot = snapshotStore.getPlaybackSnapshot()

    fun getPauseOrigin(): LegatoAndroidPauseOrigin = pauseOrigin

    fun getServiceMode(): LegatoAndroidServiceMode {
        val state = snapshotStore.getPlaybackSnapshot().state
        return when {
            state == LegatoAndroidPlaybackState.PLAYING || state == LegatoAndroidPlaybackState.BUFFERING ->
                LegatoAndroidServiceMode.PLAYBACK_ACTIVE

            state == LegatoAndroidPlaybackState.PAUSED && pauseOrigin == LegatoAndroidPauseOrigin.INTERRUPTION ->
                LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION

            else -> LegatoAndroidServiceMode.OFF
        }
    }

    fun release() {
        if (!isSetup) {
            return
        }

        remoteCommandManager.unbind()
        playbackRuntime.setListener(null)
        playbackRuntime.release()
        sessionManager.setInterruptionListener(null)
        sessionManager.releaseSession()
        isSetup = false
    }

    private val runtimeListener = object : LegatoAndroidPlaybackRuntimeListener {
        override fun onProgress(progress: LegatoAndroidRuntimeProgress) {
            snapshotStore.updatePlaybackSnapshot { snapshot ->
                snapshot.copy(
                    positionMs = progress.positionMs,
                    durationMs = progress.durationMs ?: snapshot.durationMs,
                    bufferedPositionMs = progress.bufferedPositionMs,
                )
            }
            publishProgress(snapshotStore.getPlaybackSnapshot())
        }

        override fun onBuffering(isBuffering: Boolean) {
            val input = if (isBuffering) {
                LegatoAndroidStateMachine.LegatoAndroidStateInput.BUFFERING_STARTED
            } else {
                LegatoAndroidStateMachine.LegatoAndroidStateInput.BUFFERING_ENDED
            }
            transitionTo(input)
        }

        override fun onEnded() {
            transitionTo(LegatoAndroidStateMachine.LegatoAndroidStateInput.TRACK_ENDED)
            eventEmitter.emit(
                name = LegatoAndroidEventName.PLAYBACK_ENDED,
                payload = LegatoAndroidEventPayload.PlaybackEnded(snapshotStore.getPlaybackSnapshot()),
            )
        }

        override fun onFatalError(error: Throwable) {
            publishPlatformFailure(error)
        }
    }

    private fun toRuntimeTrackSource(track: LegatoAndroidTrack): LegatoAndroidRuntimeTrackSource =
        LegatoAndroidRuntimeTrackSource(
            id = track.id,
            url = track.url,
            headers = track.headers,
            type = track.type,
        )

    private inline fun runRuntimeOperation(block: () -> Unit): Boolean =
        runCatching(block).onFailure(::publishPlatformFailure).isSuccess

    private fun transitionTo(input: LegatoAndroidStateMachine.LegatoAndroidStateInput) {
        val previous = snapshotStore.getPlaybackSnapshot()
        val nextState = stateMachine.reduce(previous.state, input)
        if (nextState == previous.state) {
            return
        }

        snapshotStore.updatePlaybackSnapshot { it.copy(state = nextState) }
        publishState(nextState)
    }

    private fun guardSetup() {
        if (!isSetup) {
            val error = errorMapper.playerNotSetup()
            eventEmitter.emit(
                name = LegatoAndroidEventName.PLAYBACK_ERROR,
                payload = LegatoAndroidEventPayload.PlaybackError(error = error),
            )
            throw IllegalStateException(error.message)
        }
    }

    private fun publishQueueAndTrack(snapshot: LegatoAndroidPlaybackSnapshot) {
        eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_QUEUE_CHANGED,
            payload = LegatoAndroidEventPayload.QueueChanged(snapshot.queue),
        )
        eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_ACTIVE_TRACK_CHANGED,
            payload = LegatoAndroidEventPayload.ActiveTrackChanged(
                track = snapshot.currentTrack,
                index = snapshot.currentIndex,
            ),
        )
    }

    private fun publishState(state: LegatoAndroidPlaybackState) {
        eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_STATE_CHANGED,
            payload = LegatoAndroidEventPayload.PlaybackStateChanged(state),
        )
        sessionManager.updatePlaybackState(state)
        remoteCommandManager.updatePlaybackState(state)
    }

    private fun publishProgress(snapshot: LegatoAndroidPlaybackSnapshot) {
        val progress = LegatoAndroidProgressUpdate(
            positionMs = snapshot.positionMs,
            durationMs = snapshot.durationMs,
            bufferedPositionMs = snapshot.bufferedPositionMs,
        )

        eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_PROGRESS,
            payload = LegatoAndroidEventPayload.PlaybackProgress(
                positionMs = progress.positionMs,
                durationMs = progress.durationMs,
                bufferedPositionMs = progress.bufferedPositionMs,
            ),
        )
        sessionManager.updateProgress(progress)
    }

    private fun publishMetadata(track: LegatoAndroidTrack?) {
        val metadata = track?.let {
            LegatoAndroidNowPlayingMetadata(
                trackId = it.id,
                title = it.title,
                artist = it.artist,
                album = it.album,
                artwork = it.artwork,
                durationMs = it.durationMs,
            )
        }

        sessionManager.updateNowPlayingMetadata(metadata)
    }

    private fun publishPlatformFailure(throwable: Throwable) {
        val mappedError = errorMapper.mapThrowable(throwable)
        val previous = snapshotStore.getPlaybackSnapshot()
        val nextState = stateMachine.reduce(previous.state, LegatoAndroidStateMachine.LegatoAndroidStateInput.FAIL)
        snapshotStore.updatePlaybackSnapshot { it.copy(state = nextState) }

        eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_ERROR,
            payload = LegatoAndroidEventPayload.PlaybackError(mappedError),
        )
        publishState(nextState)
    }

    private fun onInterruption(signal: LegatoAndroidInterruptionSignal) {
        when (signal) {
            LegatoAndroidInterruptionSignal.AudioFocusGained -> {
                // v1 policy: no automatic resume.
            }

            LegatoAndroidInterruptionSignal.AudioFocusLost,
            LegatoAndroidInterruptionSignal.AudioFocusLostTransient,
            LegatoAndroidInterruptionSignal.AudioFocusLostTransientCanDuck,
            LegatoAndroidInterruptionSignal.BecomingNoisy,
            -> pauseForInterruption()
        }
    }

    private fun pauseForInterruption() {
        val state = snapshotStore.getPlaybackSnapshot().state
        if (state != LegatoAndroidPlaybackState.PLAYING && state != LegatoAndroidPlaybackState.BUFFERING) {
            return
        }

        runRuntimeOperation {
            playbackRuntime.pause()
        }
        pauseOrigin = LegatoAndroidPauseOrigin.INTERRUPTION
        transitionTo(LegatoAndroidStateMachine.LegatoAndroidStateInput.PAUSE)
    }

    private fun onRemoteCommand(command: LegatoAndroidRemoteCommand) {
        when (command) {
            LegatoAndroidRemoteCommand.Play -> {
                executePlay()
                eventEmitter.emit(
                    name = LegatoAndroidEventName.REMOTE_PLAY,
                    payload = LegatoAndroidEventPayload.RemotePlay,
                )
            }

            LegatoAndroidRemoteCommand.Pause -> {
                executePause()
                eventEmitter.emit(
                    name = LegatoAndroidEventName.REMOTE_PAUSE,
                    payload = LegatoAndroidEventPayload.RemotePause,
                )
            }

            LegatoAndroidRemoteCommand.Next -> eventEmitter.emit(
                name = LegatoAndroidEventName.REMOTE_NEXT,
                payload = LegatoAndroidEventPayload.RemoteNext,
            )

            LegatoAndroidRemoteCommand.Previous -> eventEmitter.emit(
                name = LegatoAndroidEventName.REMOTE_PREVIOUS,
                payload = LegatoAndroidEventPayload.RemotePrevious,
            )

            is LegatoAndroidRemoteCommand.Seek -> eventEmitter.emit(
                name = LegatoAndroidEventName.REMOTE_SEEK,
                payload = LegatoAndroidEventPayload.RemoteSeek(command.positionMs),
            )
        }
    }

    private fun executePlay() {
        if (!runRuntimeOperation {
            playbackRuntime.play()
        }) return

        pauseOrigin = LegatoAndroidPauseOrigin.USER
        transitionTo(LegatoAndroidStateMachine.LegatoAndroidStateInput.PLAY)
    }

    private fun executePause() {
        if (!runRuntimeOperation {
            playbackRuntime.pause()
        }) return

        pauseOrigin = LegatoAndroidPauseOrigin.USER
        transitionTo(LegatoAndroidStateMachine.LegatoAndroidStateInput.PAUSE)
    }
}
