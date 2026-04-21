package io.legato.core.core

import io.legato.core.errors.LegatoAndroidErrorMapper
import io.legato.core.events.LegatoAndroidEventEmitter
import io.legato.core.mapping.LegatoAndroidTrackMapper
import io.legato.core.queue.LegatoAndroidQueueManager
import io.legato.core.remote.LegatoAndroidRemoteCommandManager
import io.legato.core.runtime.LegatoAndroidMedia3PlaybackRuntime
import io.legato.core.runtime.LegatoAndroidPlaybackRuntime
import io.legato.core.session.LegatoAndroidAudioFocusSessionRuntime
import io.legato.core.session.LegatoAndroidSessionManager
import io.legato.core.snapshot.LegatoAndroidSnapshotStore
import io.legato.core.state.LegatoAndroidStateMachine

data class LegatoAndroidCoreDependencies(
    val queueManager: LegatoAndroidQueueManager = LegatoAndroidQueueManager(),
    val eventEmitter: LegatoAndroidEventEmitter = LegatoAndroidEventEmitter(),
    val snapshotStore: LegatoAndroidSnapshotStore = LegatoAndroidSnapshotStore(),
    val trackMapper: LegatoAndroidTrackMapper = LegatoAndroidTrackMapper(),
    val errorMapper: LegatoAndroidErrorMapper = LegatoAndroidErrorMapper(),
    val stateMachine: LegatoAndroidStateMachine = LegatoAndroidStateMachine(),
    val sessionManager: LegatoAndroidSessionManager =
        LegatoAndroidSessionManager(runtime = LegatoAndroidAudioFocusSessionRuntime()),
    val remoteCommandManager: LegatoAndroidRemoteCommandManager = LegatoAndroidRemoteCommandManager(),
    val playbackRuntime: LegatoAndroidPlaybackRuntime = LegatoAndroidMedia3PlaybackRuntime(),
)

data class LegatoAndroidCoreComponents(
    val queueManager: LegatoAndroidQueueManager,
    val eventEmitter: LegatoAndroidEventEmitter,
    val snapshotStore: LegatoAndroidSnapshotStore,
    val trackMapper: LegatoAndroidTrackMapper,
    val errorMapper: LegatoAndroidErrorMapper,
    val stateMachine: LegatoAndroidStateMachine,
    val sessionManager: LegatoAndroidSessionManager,
    val remoteCommandManager: LegatoAndroidRemoteCommandManager,
    val playbackRuntime: LegatoAndroidPlaybackRuntime,
    val playerEngine: LegatoAndroidPlayerEngine,
)

object LegatoAndroidCoreFactory {
    @JvmStatic
    fun create(
        dependencies: LegatoAndroidCoreDependencies = LegatoAndroidCoreDependencies(),
    ): LegatoAndroidCoreComponents {
        val playerEngine = LegatoAndroidPlayerEngine(
            queueManager = dependencies.queueManager,
            eventEmitter = dependencies.eventEmitter,
            snapshotStore = dependencies.snapshotStore,
            trackMapper = dependencies.trackMapper,
            errorMapper = dependencies.errorMapper,
            stateMachine = dependencies.stateMachine,
            sessionManager = dependencies.sessionManager,
            remoteCommandManager = dependencies.remoteCommandManager,
            playbackRuntime = dependencies.playbackRuntime,
        )

        return LegatoAndroidCoreComponents(
            queueManager = dependencies.queueManager,
            eventEmitter = dependencies.eventEmitter,
            snapshotStore = dependencies.snapshotStore,
            trackMapper = dependencies.trackMapper,
            errorMapper = dependencies.errorMapper,
            stateMachine = dependencies.stateMachine,
            sessionManager = dependencies.sessionManager,
            remoteCommandManager = dependencies.remoteCommandManager,
            playbackRuntime = dependencies.playbackRuntime,
            playerEngine = playerEngine,
        )
    }
}
