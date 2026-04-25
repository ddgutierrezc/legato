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
    private companion object {
        const val PREVIOUS_RESTART_THRESHOLD_MS: Long = 3_000L
    }

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

    suspend fun add(tracks: List<LegatoAndroidTrack>, startIndex: Int? = null) {
        guardSetup()

        runCatching {
            val mappedTracks = trackMapper.mapContractTracks(tracks)
            if (mappedTracks.isEmpty() && startIndex == null) {
                return
            }

            val previousSnapshot = snapshotStore.getPlaybackSnapshot()
            val existingQueue = queueManager.getQueueSnapshot()
            val mergedItems = existingQueue.items + mappedTracks
            val targetIndex = startIndex ?: previousSnapshot.currentIndex
            val queueSnapshot = queueManager.replaceQueue(mergedItems, targetIndex)
            playbackRuntime.replaceQueue(mergedItems.map(::toRuntimeTrackSource), targetIndex)

            val runtimeSnapshot = playbackRuntime.snapshot()
            val currentTrack = queueManager.getCurrentTrack()
            val isSameTrack = currentTrack?.id == previousSnapshot.currentTrack?.id
            val nextState = when {
                queueSnapshot.items.isEmpty() -> LegatoAndroidPlaybackState.IDLE
                previousSnapshot.state == LegatoAndroidPlaybackState.IDLE -> LegatoAndroidPlaybackState.READY
                else -> previousSnapshot.state
            }

            val snapshot = LegatoAndroidPlaybackSnapshot(
                state = nextState,
                currentTrack = currentTrack,
                currentIndex = runtimeSnapshot.currentIndex ?: queueSnapshot.currentIndex,
                positionMs = if (isSameTrack) previousSnapshot.positionMs else runtimeSnapshot.progress.positionMs,
                durationMs = runtimeSnapshot.progress.durationMs ?: currentTrack?.durationMs,
                bufferedPositionMs = if (isSameTrack) {
                    previousSnapshot.bufferedPositionMs
                } else {
                    runtimeSnapshot.progress.bufferedPositionMs
                },
                queue = queueSnapshot,
            )

            snapshotStore.replacePlaybackSnapshot(snapshot)
            publishQueueAndTrack(snapshot)
            publishMetadata(snapshot.currentTrack)
            publishProgress(snapshot)
            if (snapshot.state != previousSnapshot.state) {
                publishState(snapshot.state)
            }
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

    suspend fun remove(index: Int): LegatoAndroidPlaybackSnapshot {
        guardSetup()

        return runCatching {
            val queueSnapshot = queueManager.getQueueSnapshot()
            require(index in queueSnapshot.items.indices) { "remove index out of bounds" }

            val remainingItems = queueSnapshot.items.toMutableList().apply {
                removeAt(index)
            }

            val previousSnapshot = snapshotStore.getPlaybackSnapshot()
            val nextSnapshot = if (remainingItems.isEmpty()) {
                if (!runRuntimeOperation {
                    playbackRuntime.replaceQueue(emptyList(), null)
                }) {
                    return snapshotStore.getPlaybackSnapshot()
                }

                val clearedQueue = queueManager.replaceQueue(emptyList(), null)
                pauseOrigin = LegatoAndroidPauseOrigin.USER
                LegatoAndroidPlaybackSnapshot(
                    state = LegatoAndroidPlaybackState.IDLE,
                    currentTrack = null,
                    currentIndex = null,
                    positionMs = 0L,
                    durationMs = null,
                    bufferedPositionMs = null,
                    queue = clearedQueue,
                )
            } else {
                val targetIndex = resolvePostRemovalIndex(queueSnapshot.currentIndex, index, remainingItems.lastIndex)
                if (!runRuntimeOperation {
                    playbackRuntime.replaceQueue(remainingItems.map(::toRuntimeTrackSource), targetIndex)
                }) {
                    return snapshotStore.getPlaybackSnapshot()
                }

                val updatedQueue = queueManager.replaceQueue(remainingItems, targetIndex)
                val runtimeSnapshot = playbackRuntime.snapshot()
                val currentTrack = queueManager.getCurrentTrack()
                val isSameTrack = currentTrack?.id == previousSnapshot.currentTrack?.id
                val nextState = when {
                    updatedQueue.items.isEmpty() -> LegatoAndroidPlaybackState.IDLE
                    previousSnapshot.state == LegatoAndroidPlaybackState.IDLE -> LegatoAndroidPlaybackState.READY
                    else -> previousSnapshot.state
                }

                LegatoAndroidPlaybackSnapshot(
                    state = nextState,
                    currentTrack = currentTrack,
                    currentIndex = runtimeSnapshot.currentIndex ?: updatedQueue.currentIndex,
                    positionMs = if (isSameTrack) previousSnapshot.positionMs else runtimeSnapshot.progress.positionMs,
                    durationMs = runtimeSnapshot.progress.durationMs ?: currentTrack?.durationMs,
                    bufferedPositionMs = if (isSameTrack) {
                        previousSnapshot.bufferedPositionMs
                    } else {
                        runtimeSnapshot.progress.bufferedPositionMs
                    },
                    queue = updatedQueue,
                )
            }

            snapshotStore.replacePlaybackSnapshot(nextSnapshot)
            publishQueueAndTrack(nextSnapshot)
            publishMetadata(nextSnapshot.currentTrack)
            publishProgress(nextSnapshot)
            if (nextSnapshot.state != previousSnapshot.state) {
                publishState(nextSnapshot.state)
            }

            nextSnapshot
        }.getOrElse { error ->
            publishPlatformFailure(error)
            snapshotStore.getPlaybackSnapshot()
        }
    }

    suspend fun reset(): LegatoAndroidPlaybackSnapshot {
        guardSetup()

        return runCatching {
            if (!runRuntimeOperation {
                playbackRuntime.stop(resetPosition = true)
            }) {
                return snapshotStore.getPlaybackSnapshot()
            }
            if (!runRuntimeOperation {
                playbackRuntime.replaceQueue(emptyList(), null)
            }) {
                return snapshotStore.getPlaybackSnapshot()
            }

            val previousSnapshot = snapshotStore.getPlaybackSnapshot()
            val clearedQueue = queueManager.replaceQueue(emptyList(), null)
            pauseOrigin = LegatoAndroidPauseOrigin.USER
            val resetSnapshot = LegatoAndroidPlaybackSnapshot(
                state = LegatoAndroidPlaybackState.IDLE,
                currentTrack = null,
                currentIndex = null,
                positionMs = 0L,
                durationMs = null,
                bufferedPositionMs = null,
                queue = clearedQueue,
            )

            snapshotStore.replacePlaybackSnapshot(resetSnapshot)
            publishQueueAndTrack(resetSnapshot)
            publishMetadata(null)
            publishProgress(resetSnapshot)
            if (previousSnapshot.state != resetSnapshot.state) {
                publishState(resetSnapshot.state)
            }

            resetSnapshot
        }.getOrElse { error ->
            publishPlatformFailure(error)
            snapshotStore.getPlaybackSnapshot()
        }
    }

    suspend fun seekTo(positionMs: Long) {
        guardSetup()
        executeSeekTo(positionMs)
    }

    suspend fun skipToNext() {
        guardSetup()
        executeSkipToNext()
    }

    suspend fun skipTo(index: Int) {
        guardSetup()
        executeSkipTo(index)
    }

    suspend fun skipToPrevious() {
        guardSetup()
        executeSkipToPrevious()
    }

    private fun executeSeekTo(positionMs: Long) {
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

    private fun resolvePostRemovalIndex(previousIndex: Int?, removedIndex: Int, lastIndex: Int): Int {
        if (lastIndex < 0) {
            return 0
        }

        return when (previousIndex) {
            null -> 0
            in (removedIndex + 1)..Int.MAX_VALUE -> (previousIndex - 1).coerceIn(0, lastIndex)
            removedIndex -> removedIndex.coerceIn(0, lastIndex)
            else -> previousIndex.coerceIn(0, lastIndex)
        }
    }

    private fun executeSkipToNext() {
        val movedIndex = queueManager.moveToNext()
        if (movedIndex == null) {
            endPlaybackAtQueueBoundaryIfNeeded()
            return
        }

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

        val updatedSnapshot = snapshotStore.getPlaybackSnapshot()
        publishQueueAndTrack(updatedSnapshot)
        publishMetadata(track)
        publishProgress(updatedSnapshot)
    }

    private fun executeSkipTo(index: Int) {
        val queueSnapshot = queueManager.getQueueSnapshot()
        require(index in queueSnapshot.items.indices) { "skipTo.index out of bounds" }

        if (!runRuntimeOperation {
            playbackRuntime.selectIndex(index)
        }) return

        val updatedQueue = queueManager.replaceQueue(queueSnapshot.items, index)
        val runtimeSnapshot = playbackRuntime.snapshot()
        val track = queueManager.getCurrentTrack()

        snapshotStore.updatePlaybackSnapshot { snapshot ->
            snapshot.copy(
                currentTrack = track,
                currentIndex = runtimeSnapshot.currentIndex ?: index,
                durationMs = runtimeSnapshot.progress.durationMs ?: track?.durationMs,
                positionMs = runtimeSnapshot.progress.positionMs,
                bufferedPositionMs = runtimeSnapshot.progress.bufferedPositionMs,
                queue = updatedQueue,
            )
        }

        val updatedSnapshot = snapshotStore.getPlaybackSnapshot()
        publishQueueAndTrack(updatedSnapshot)
        publishMetadata(track)
        publishProgress(updatedSnapshot)
    }

    private fun executeSkipToPrevious() {
        val snapshot = snapshotStore.getPlaybackSnapshot()
        val currentIndex = snapshot.currentIndex ?: return

        if (snapshot.positionMs > PREVIOUS_RESTART_THRESHOLD_MS) {
            executeSeekTo(0L)
            return
        }

        if (currentIndex <= 0) {
            executeSeekTo(0L)
            return
        }

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

        val updatedSnapshot = snapshotStore.getPlaybackSnapshot()
        publishQueueAndTrack(updatedSnapshot)
        publishMetadata(track)
        publishProgress(updatedSnapshot)
    }

    private fun endPlaybackAtQueueBoundaryIfNeeded() {
        val snapshot = snapshotStore.getPlaybackSnapshot()
        val currentIndex = snapshot.currentIndex ?: return
        val queueItems = snapshot.queue.items

        if (queueItems.isEmpty() || currentIndex != queueItems.lastIndex) {
            return
        }

        val transitioned = transitionTo(LegatoAndroidStateMachine.LegatoAndroidStateInput.TRACK_ENDED)
        if (!transitioned) {
            return
        }

        val endedSnapshot = snapshotStore.getPlaybackSnapshot()
        eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_ENDED,
            payload = LegatoAndroidEventPayload.PlaybackEnded(endedSnapshot),
        )
    }

    fun getSnapshot(): LegatoAndroidPlaybackSnapshot = snapshotStore.getPlaybackSnapshot()

    fun getPauseOrigin(): LegatoAndroidPauseOrigin = pauseOrigin

    fun getServiceMode(): LegatoAndroidServiceMode {
        val snapshot = snapshotStore.getPlaybackSnapshot()
        val state = snapshot.state
        return when {
            state == LegatoAndroidPlaybackState.PLAYING || state == LegatoAndroidPlaybackState.BUFFERING ->
                LegatoAndroidServiceMode.PLAYBACK_ACTIVE

            state == LegatoAndroidPlaybackState.PAUSED && pauseOrigin == LegatoAndroidPauseOrigin.INTERRUPTION ->
                LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION

            state == LegatoAndroidPlaybackState.PAUSED && snapshot.currentTrack != null ->
                LegatoAndroidServiceMode.PLAYBACK_ACTIVE

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
            if (snapshotStore.getPlaybackSnapshot().state == LegatoAndroidPlaybackState.ENDED) {
                return
            }

            val runtimeSnapshot = playbackRuntime.snapshot()
            var activeItemChanged = false

            snapshotStore.updatePlaybackSnapshot { snapshot ->
                val syncedSnapshot = synchronizeActiveItemFromRuntime(snapshot, runtimeSnapshot.currentIndex)
                activeItemChanged = syncedSnapshot.currentIndex != snapshot.currentIndex ||
                    syncedSnapshot.currentTrack?.id != snapshot.currentTrack?.id

                val projectedProgress = if (activeItemChanged) {
                    runtimeSnapshot.progress
                } else {
                    progress
                }

                syncedSnapshot.copy(
                    positionMs = projectedProgress.positionMs,
                    durationMs = projectedProgress.durationMs
                        ?: syncedSnapshot.currentTrack?.durationMs
                        ?: syncedSnapshot.durationMs,
                    bufferedPositionMs = projectedProgress.bufferedPositionMs,
                )
            }

            val updatedSnapshot = snapshotStore.getPlaybackSnapshot()
            if (activeItemChanged) {
                publishQueueAndTrack(updatedSnapshot)
                publishMetadata(updatedSnapshot.currentTrack)
            }
            publishProgress(updatedSnapshot)
        }

        override fun onBuffering(isBuffering: Boolean) {
            if (snapshotStore.getPlaybackSnapshot().state == LegatoAndroidPlaybackState.ENDED) {
                return
            }

            val input = if (isBuffering) {
                LegatoAndroidStateMachine.LegatoAndroidStateInput.BUFFERING_STARTED
            } else {
                LegatoAndroidStateMachine.LegatoAndroidStateInput.BUFFERING_ENDED
            }
            transitionTo(input)
        }

        override fun onEnded() {
            val transitioned = transitionTo(LegatoAndroidStateMachine.LegatoAndroidStateInput.TRACK_ENDED)
            if (!transitioned) {
                return
            }

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

    private fun transitionTo(input: LegatoAndroidStateMachine.LegatoAndroidStateInput): Boolean {
        val previous = snapshotStore.getPlaybackSnapshot()
        val nextState = stateMachine.reduce(previous.state, input)
        if (nextState == previous.state) {
            return false
        }

        snapshotStore.updatePlaybackSnapshot { it.copy(state = nextState) }
        publishState(nextState)
        return true
    }

    private fun synchronizeActiveItemFromRuntime(
        snapshot: LegatoAndroidPlaybackSnapshot,
        runtimeIndex: Int?,
    ): LegatoAndroidPlaybackSnapshot {
        val resolvedIndex = runtimeIndex?.takeIf { it in snapshot.queue.items.indices } ?: return snapshot
        if (resolvedIndex == snapshot.currentIndex) {
            return snapshot
        }

        val syncedQueue = queueManager.replaceQueue(snapshot.queue.items, resolvedIndex)
        val syncedTrack = syncedQueue.items.getOrNull(resolvedIndex)
        return snapshot.copy(
            currentTrack = syncedTrack,
            currentIndex = resolvedIndex,
            durationMs = syncedTrack?.durationMs,
            queue = syncedQueue,
        )
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
            ).also {
                executeSkipToNext()
            }

            LegatoAndroidRemoteCommand.Previous -> eventEmitter.emit(
                name = LegatoAndroidEventName.REMOTE_PREVIOUS,
                payload = LegatoAndroidEventPayload.RemotePrevious,
            ).also {
                executeSkipToPrevious()
            }

            is LegatoAndroidRemoteCommand.Seek -> eventEmitter.emit(
                name = LegatoAndroidEventName.REMOTE_SEEK,
                payload = LegatoAndroidEventPayload.RemoteSeek(command.positionMs),
            ).also {
                executeSeekTo(command.positionMs)
            }
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
