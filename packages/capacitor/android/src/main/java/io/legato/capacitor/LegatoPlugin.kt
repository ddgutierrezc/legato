package io.legato.capacitor

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.legato.core.core.LegatoAndroidCoreFactory
import io.legato.core.core.LegatoAndroidEventName
import io.legato.core.core.LegatoAndroidEventPayload
import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidQueueSnapshot
import io.legato.core.core.LegatoAndroidErrorCode
import kotlinx.coroutines.runBlocking

@CapacitorPlugin(name = "Legato")
class LegatoPlugin : Plugin() {
    private val mapper = LegatoCapacitorMapper()
    private val core = LegatoAndroidCoreFactory.create()
    private var coreListenerId: Long? = null

    override fun load() {
        super.load()
        coreListenerId = core.eventEmitter.addListener { event ->
            notifyListeners(event.name.wireValue, mapper.eventPayloadToJs(event.payload))
        }
    }

    override fun handleOnDestroy() {
        coreListenerId?.let(core.eventEmitter::removeListener)
        coreListenerId = null
        core.playerEngine.release()
        super.handleOnDestroy()
    }

    @PluginMethod
    fun setup(call: PluginCall) {
        runCatching {
            runBlocking { core.playerEngine.setup() }
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun add(call: PluginCall) {
        runCatching {
            val tracks = mapper.tracksFromJs(call.getArray("tracks"))
            val startIndex = call.getInt("startIndex")

            val mappedTracks = core.trackMapper.mapContractTracks(tracks)
            val queueSnapshot = if (startIndex != null) {
                val mergedItems = core.queueManager.getQueueSnapshot().items + mappedTracks
                core.queueManager.replaceQueue(mergedItems, startIndex)
            } else {
                core.queueManager.addToQueue(mappedTracks)
            }

            val previous = core.snapshotStore.getPlaybackSnapshot()
            val next = snapshotWithQueue(previous, queueSnapshot)
            core.snapshotStore.replacePlaybackSnapshot(next)

            publishQueueTrackProgress(next)
            if (previous.state != next.state) {
                core.eventEmitter.emit(
                    name = LegatoAndroidEventName.PLAYBACK_STATE_CHANGED,
                    payload = LegatoAndroidEventPayload.PlaybackStateChanged(next.state),
                )
            }

            call.resolve(snapshotResult(next))
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        runCatching {
            val index = resolveRemovalIndex(call)
            val queue = core.queueManager.getQueueSnapshot()
            val mutableItems = queue.items.toMutableList()

            require(index in mutableItems.indices) { "remove index out of bounds" }
            mutableItems.removeAt(index)

            val previousSnapshot = core.snapshotStore.getPlaybackSnapshot()
            if (mutableItems.isEmpty()) {
                core.queueManager.clear()
                core.snapshotStore.replacePlaybackSnapshot(
                    LegatoAndroidPlaybackSnapshot(
                        state = LegatoAndroidPlaybackState.IDLE,
                        currentTrack = null,
                        currentIndex = null,
                        positionMs = 0L,
                        durationMs = null,
                        bufferedPositionMs = null,
                        queue = LegatoAndroidQueueSnapshot(items = emptyList(), currentIndex = null),
                    ),
                )
            } else {
                val targetIndex = when (val previousIndex = queue.currentIndex) {
                    null -> 0
                    in (index + 1)..Int.MAX_VALUE -> previousIndex - 1
                    index -> index.coerceAtMost(mutableItems.lastIndex)
                    else -> previousIndex.coerceAtMost(mutableItems.lastIndex)
                }

                val nextQueue = core.queueManager.replaceQueue(mutableItems, targetIndex)
                val nextSnapshot = snapshotWithQueue(previousSnapshot, nextQueue)
                core.snapshotStore.replacePlaybackSnapshot(nextSnapshot)
            }

            val next = core.snapshotStore.getPlaybackSnapshot()
            publishQueueTrackProgress(next)
            if (previousSnapshot.state != next.state) {
                core.eventEmitter.emit(
                    name = LegatoAndroidEventName.PLAYBACK_STATE_CHANGED,
                    payload = LegatoAndroidEventPayload.PlaybackStateChanged(next.state),
                )
            }

            call.resolve(snapshotResult(next))
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun reset(call: PluginCall) {
        runCatching {
            core.queueManager.clear()
            val snapshot = LegatoAndroidPlaybackSnapshot(
                state = LegatoAndroidPlaybackState.IDLE,
                currentTrack = null,
                currentIndex = null,
                positionMs = 0L,
                durationMs = null,
                bufferedPositionMs = null,
                queue = LegatoAndroidQueueSnapshot(items = emptyList(), currentIndex = null),
            )
            core.snapshotStore.replacePlaybackSnapshot(snapshot)
            publishQueueTrackProgress(snapshot)
            core.eventEmitter.emit(
                name = LegatoAndroidEventName.PLAYBACK_STATE_CHANGED,
                payload = LegatoAndroidEventPayload.PlaybackStateChanged(snapshot.state),
            )

            call.resolve(snapshotResult(snapshot))
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun play(call: PluginCall) {
        runCatching {
            runBlocking { core.playerEngine.play() }
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        runCatching {
            runBlocking { core.playerEngine.pause() }
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        runCatching {
            runBlocking { core.playerEngine.stop() }
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun seekTo(call: PluginCall) {
        runCatching {
            val position = call.getDouble("position")?.toLong()
                ?: error("seekTo.position is required")
            runBlocking { core.playerEngine.seekTo(position) }
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun skipTo(call: PluginCall) {
        runCatching {
            val index = call.getInt("index") ?: error("skipTo.index is required")
            val queueSnapshot = core.queueManager.getQueueSnapshot()
            require(index in queueSnapshot.items.indices) { "skipTo.index out of bounds" }

            val nextQueue = core.queueManager.replaceQueue(queueSnapshot.items, index)
            val previous = core.snapshotStore.getPlaybackSnapshot()
            val next = snapshotWithQueue(previous, nextQueue)
            core.snapshotStore.replacePlaybackSnapshot(next)
            publishQueueTrackProgress(next)
            call.resolve(snapshotResult(next))
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun skipToNext(call: PluginCall) {
        runCatching {
            runBlocking { core.playerEngine.skipToNext() }
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun skipToPrevious(call: PluginCall) {
        runCatching {
            runBlocking { core.playerEngine.skipToPrevious() }
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun getState(call: PluginCall) {
        val snapshot = core.playerEngine.getSnapshot()
        call.resolve(JSObject().apply { put("state", snapshot.state.wireValue) })
    }

    @PluginMethod
    fun getPosition(call: PluginCall) {
        val snapshot = core.playerEngine.getSnapshot()
        call.resolve(JSObject().apply { put("position", snapshot.positionMs) })
    }

    @PluginMethod
    fun getDuration(call: PluginCall) {
        val snapshot = core.playerEngine.getSnapshot()
        call.resolve(JSObject().apply { put("duration", snapshot.durationMs) })
    }

    @PluginMethod
    fun getCurrentTrack(call: PluginCall) {
        val snapshot = core.playerEngine.getSnapshot()
        call.resolve(
            JSObject().apply {
                put("track", snapshot.currentTrack?.let(mapper::trackToJs))
            },
        )
    }

    @PluginMethod
    fun getQueue(call: PluginCall) {
        val snapshot = core.playerEngine.getSnapshot()
        call.resolve(
            JSObject().apply {
                put("queue", mapper.queueToJs(snapshot.queue))
            },
        )
    }

    @PluginMethod
    fun getSnapshot(call: PluginCall) {
        call.resolve(snapshotResult(core.playerEngine.getSnapshot()))
    }

    private fun publishQueueTrackProgress(snapshot: LegatoAndroidPlaybackSnapshot) {
        core.eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_QUEUE_CHANGED,
            payload = LegatoAndroidEventPayload.QueueChanged(snapshot.queue),
        )
        core.eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_ACTIVE_TRACK_CHANGED,
            payload = LegatoAndroidEventPayload.ActiveTrackChanged(snapshot.currentTrack, snapshot.currentIndex),
        )
        core.eventEmitter.emit(
            name = LegatoAndroidEventName.PLAYBACK_PROGRESS,
            payload = LegatoAndroidEventPayload.PlaybackProgress(
                positionMs = snapshot.positionMs,
                durationMs = snapshot.durationMs,
                bufferedPositionMs = snapshot.bufferedPositionMs,
            ),
        )
    }

    private fun resolveRemovalIndex(call: PluginCall): Int {
        call.getInt("index")?.let { return it }

        val id = call.getString("id")?.trim().orEmpty()
        require(id.isNotEmpty()) { "remove requires index or id" }

        val queue = core.queueManager.getQueueSnapshot()
        val resolved = queue.items.indexOfFirst { it.id == id }
        require(resolved >= 0) { "remove.id was not found in queue" }
        return resolved
    }

    private fun snapshotWithQueue(
        previous: LegatoAndroidPlaybackSnapshot,
        queue: LegatoAndroidQueueSnapshot,
    ): LegatoAndroidPlaybackSnapshot {
        val fallbackIndex = if (queue.items.isNotEmpty()) 0 else null
        val nextIndex = queue.currentIndex ?: fallbackIndex
        val track = nextIndex?.let(queue.items::getOrNull)
        val nextState = when {
            queue.items.isEmpty() -> LegatoAndroidPlaybackState.IDLE
            previous.state == LegatoAndroidPlaybackState.IDLE -> LegatoAndroidPlaybackState.READY
            else -> previous.state
        }

        return LegatoAndroidPlaybackSnapshot(
            state = nextState,
            currentTrack = track,
            currentIndex = nextIndex,
            positionMs = if (track?.id == previous.currentTrack?.id) previous.positionMs else 0L,
            durationMs = track?.durationMs,
            bufferedPositionMs = if (track?.id == previous.currentTrack?.id) previous.bufferedPositionMs else 0L,
            queue = queue,
        )
    }

    private fun snapshotResult(snapshot: LegatoAndroidPlaybackSnapshot): JSObject {
        return JSObject().apply {
            put("snapshot", mapper.snapshotToJs(snapshot))
        }
    }

    private fun ok(): JSObject = JSObject().apply { put("ok", true) }

    private fun reject(call: PluginCall, throwable: Throwable) {
        val mapped = when (throwable) {
            is IllegalStateException -> io.legato.core.core.LegatoAndroidError(
                code = LegatoAndroidErrorCode.PLAYER_NOT_SETUP,
                message = throwable.message ?: "Player is not setup",
            )

            is IllegalArgumentException -> io.legato.core.core.LegatoAndroidError(
                code = LegatoAndroidErrorCode.INVALID_INDEX,
                message = throwable.message ?: "Invalid input",
            )

            else -> core.errorMapper.mapThrowable(throwable)
        }
        val exception = throwable as? Exception ?: Exception(throwable)
        call.reject(mapped.message, mapped.code.wireValue, exception)
    }
}
