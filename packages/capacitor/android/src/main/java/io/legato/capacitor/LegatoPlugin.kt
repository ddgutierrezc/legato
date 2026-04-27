package io.legato.capacitor

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.legato.core.core.LegatoAndroidEventName
import io.legato.core.core.LegatoAndroidEventPayload
import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidErrorCode
import io.legato.core.queue.LegatoAndroidTransportCapabilitiesProjector

@CapacitorPlugin(name = "Legato")
class LegatoPlugin : Plugin() {
    private val mapper = LegatoCapacitorMapper()
    private lateinit var coordinator: LegatoAndroidPlaybackCoordinator
    private val core get() = coordinator.core
    private var coreListenerId: Long? = null

    override fun load() {
        super.load()
        coordinator = LegatoAndroidPlaybackCoordinatorStore.getOrCreate(context.applicationContext)
        coordinator.bindServiceRuntime(LegatoAndroidAppServiceRuntime(context.applicationContext))
        coreListenerId = coordinator.addCoreEventListener { event ->
            notifyListeners(event.name.wireValue, mapper.eventPayloadToJs(event.payload))
        }
    }

    override fun handleOnDestroy() {
        coreListenerId?.let(coordinator::removeCoreEventListener)
        coreListenerId = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun setup(call: PluginCall) {
        runCatching {
            coordinator.setup()
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun add(call: PluginCall) {
        runCatching {
            val tracks = mapper.tracksFromJs(call.getArray("tracks"))
            val startIndex = call.getInt("startIndex")

            coordinator.add(tracks = tracks, startIndex = startIndex)
            call.resolve(snapshotResult(core.playerEngine.getSnapshot()))
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        runCatching {
            val index = resolveRemovalIndex(call)
            coordinator.remove(index)
            call.resolve(snapshotResult(core.playerEngine.getSnapshot()))
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun reset(call: PluginCall) {
        runCatching {
            coordinator.reset()
            call.resolve(snapshotResult(core.playerEngine.getSnapshot()))
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun play(call: PluginCall) {
        runCatching {
            coordinator.play()
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        runCatching {
            coordinator.pause()
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        runCatching {
            coordinator.stop()
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun seekTo(call: PluginCall) {
        runCatching {
            val position = call.getDouble("position")?.toLong()
                ?: error("seekTo.position is required")
            coordinator.seekTo(position)
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun skipTo(call: PluginCall) {
        runCatching {
            val index = call.getInt("index") ?: error("skipTo.index is required")
            coordinator.skipTo(index)
            call.resolve(snapshotResult(core.playerEngine.getSnapshot()))
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun skipToNext(call: PluginCall) {
        runCatching {
            coordinator.skipToNext()
            call.resolve(ok())
        }.onFailure { reject(call, it) }
    }

    @PluginMethod
    fun skipToPrevious(call: PluginCall) {
        runCatching {
            coordinator.skipToPrevious()
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

    @PluginMethod
    fun getCapabilities(call: PluginCall) {
        val snapshot = core.playerEngine.getSnapshot()
        val transportCapabilities = LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot)
        val supported = mapper.supportedCapabilitiesFromTransport(transportCapabilities)
        call.resolve(mapper.capabilitiesToJs(supported))
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
