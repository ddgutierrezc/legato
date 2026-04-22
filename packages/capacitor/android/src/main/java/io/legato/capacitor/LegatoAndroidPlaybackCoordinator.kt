package io.legato.capacitor

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.media3.exoplayer.ExoPlayer
import io.legato.core.core.LegatoAndroidCoreComponents
import io.legato.core.core.LegatoAndroidCoreDependencies
import io.legato.core.core.LegatoAndroidCoreFactory
import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPauseOrigin
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidServiceMode
import io.legato.core.core.LegatoAndroidTrack
import io.legato.core.runtime.LegatoAndroidMedia3PlaybackRuntime
import java.util.concurrent.atomic.AtomicLong

internal fun interface LegatoAndroidCoordinatorServiceRuntime {
    fun ensureServiceRunning(mode: LegatoAndroidServiceMode)
}

internal object NoopLegatoAndroidCoordinatorServiceRuntime : LegatoAndroidCoordinatorServiceRuntime {
    override fun ensureServiceRunning(mode: LegatoAndroidServiceMode) = Unit
}

internal class LegatoAndroidAppServiceRuntime(
    private val appContext: Context,
) : LegatoAndroidCoordinatorServiceRuntime {
    override fun ensureServiceRunning(mode: LegatoAndroidServiceMode) {
        if (mode == LegatoAndroidServiceMode.OFF) {
            return
        }

        val intent = Intent(appContext, LegatoPlaybackService::class.java).apply {
            putExtra(LegatoPlaybackService.EXTRA_SERVICE_MODE, mode.name)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            appContext.startForegroundService(intent)
        } else {
            appContext.startService(intent)
        }
    }
}

internal class LegatoAndroidPlaybackCoordinator(
    val core: LegatoAndroidCoreComponents,
    private var serviceRuntime: LegatoAndroidCoordinatorServiceRuntime = NoopLegatoAndroidCoordinatorServiceRuntime,
) {
    private val modeListeners = linkedMapOf<Long, (LegatoAndroidServiceMode) -> Unit>()
    private val playbackStateListeners = linkedMapOf<Long, (LegatoAndroidPlaybackState) -> Unit>()
    private val nowPlayingMetadataListeners = linkedMapOf<Long, (LegatoAndroidNowPlayingMetadata?) -> Unit>()
    private val modeListenerIds = AtomicLong(0L)
    private val lock = Any()

    private var projectedMode: LegatoAndroidServiceMode = core.playerEngine.getServiceMode()
    private var projectedPlaybackState: LegatoAndroidPlaybackState = core.playerEngine.getSnapshot().state
    private var projectedNowPlayingMetadata: LegatoAndroidNowPlayingMetadata? =
        core.playerEngine.getSnapshot().currentTrack?.toNowPlayingMetadata()

    private val coreProjectionListenerId: Long = core.eventEmitter.addListener {
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun bindServiceRuntime(runtime: LegatoAndroidCoordinatorServiceRuntime) {
        synchronized(lock) {
            serviceRuntime = runtime
        }
        projectServiceMode()
    }

    fun setup() {
        kotlinx.coroutines.runBlocking { core.playerEngine.setup() }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun load(tracks: List<io.legato.core.core.LegatoAndroidTrack>, startIndex: Int? = null) {
        kotlinx.coroutines.runBlocking {
            core.playerEngine.load(tracks = tracks, startIndex = startIndex)
        }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun add(tracks: List<LegatoAndroidTrack>, startIndex: Int? = null) {
        kotlinx.coroutines.runBlocking {
            core.playerEngine.add(tracks = tracks, startIndex = startIndex)
        }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun play() {
        kotlinx.coroutines.runBlocking { core.playerEngine.play() }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun pause() {
        kotlinx.coroutines.runBlocking { core.playerEngine.pause() }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun stop() {
        kotlinx.coroutines.runBlocking { core.playerEngine.stop() }
        projectServiceMode()
        projectPlaybackState()
        clearNowPlayingMetadata()
    }

    fun seekTo(positionMs: Long) {
        kotlinx.coroutines.runBlocking { core.playerEngine.seekTo(positionMs) }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun skipToNext() {
        kotlinx.coroutines.runBlocking { core.playerEngine.skipToNext() }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun skipToPrevious() {
        kotlinx.coroutines.runBlocking { core.playerEngine.skipToPrevious() }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun skipTo(index: Int) {
        kotlinx.coroutines.runBlocking { core.playerEngine.skipTo(index) }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun addCoreEventListener(listener: (io.legato.core.core.LegatoAndroidEvent) -> Unit): Long =
        core.eventEmitter.addListener(listener)

    fun removeCoreEventListener(listenerId: Long) {
        core.eventEmitter.removeListener(listenerId)
    }

    fun addServiceModeListener(listener: (LegatoAndroidServiceMode) -> Unit): Long {
        val id = modeListenerIds.incrementAndGet()
        synchronized(lock) {
            modeListeners[id] = listener
        }
        listener(currentServiceMode())
        return id
    }

    fun addPlaybackStateListener(listener: (LegatoAndroidPlaybackState) -> Unit): Long {
        val id = modeListenerIds.incrementAndGet()
        synchronized(lock) {
            playbackStateListeners[id] = listener
        }
        listener(currentPlaybackState())
        return id
    }

    fun addNowPlayingMetadataListener(listener: (LegatoAndroidNowPlayingMetadata?) -> Unit): Long {
        val id = modeListenerIds.incrementAndGet()
        synchronized(lock) {
            nowPlayingMetadataListeners[id] = listener
        }
        listener(currentNowPlayingMetadata())
        return id
    }

    fun removeServiceModeListener(listenerId: Long) {
        synchronized(lock) {
            modeListeners.remove(listenerId)
        }
    }

    fun removePlaybackStateListener(listenerId: Long) {
        synchronized(lock) {
            playbackStateListeners.remove(listenerId)
        }
    }

    fun removeNowPlayingMetadataListener(listenerId: Long) {
        synchronized(lock) {
            nowPlayingMetadataListeners.remove(listenerId)
        }
    }

    fun currentServiceMode(): LegatoAndroidServiceMode = synchronized(lock) { projectedMode }

    fun currentPlaybackState(): LegatoAndroidPlaybackState = synchronized(lock) { projectedPlaybackState }

    fun currentNowPlayingMetadata(): LegatoAndroidNowPlayingMetadata? = synchronized(lock) { projectedNowPlayingMetadata }

    fun currentPauseOrigin(): LegatoAndroidPauseOrigin = core.playerEngine.getPauseOrigin()

    fun projectServiceMode() {
        val nextMode = core.playerEngine.getServiceMode()
        val listenersToNotify: List<(LegatoAndroidServiceMode) -> Unit>
        val shouldNotify: Boolean
        val runtime: LegatoAndroidCoordinatorServiceRuntime

        synchronized(lock) {
            shouldNotify = nextMode != projectedMode
            projectedMode = nextMode
            listenersToNotify = modeListeners.values.toList()
            runtime = serviceRuntime
        }

        if (nextMode != LegatoAndroidServiceMode.OFF) {
            runtime.ensureServiceRunning(nextMode)
        }

        if (shouldNotify) {
            listenersToNotify.forEach { it(nextMode) }
        }
    }

    fun projectPlaybackState() {
        val nextState = core.playerEngine.getSnapshot().state
        val listenersToNotify: List<(LegatoAndroidPlaybackState) -> Unit>
        val shouldNotify: Boolean

        synchronized(lock) {
            shouldNotify = nextState != projectedPlaybackState
            projectedPlaybackState = nextState
            listenersToNotify = playbackStateListeners.values.toList()
        }

        if (shouldNotify) {
            listenersToNotify.forEach { it(nextState) }
        }
    }

    fun projectNowPlayingMetadata() {
        val nextMetadata = core.playerEngine.getSnapshot().currentTrack?.toNowPlayingMetadata()
        val listenersToNotify: List<(LegatoAndroidNowPlayingMetadata?) -> Unit>
        val shouldNotify: Boolean

        synchronized(lock) {
            shouldNotify = nextMetadata != projectedNowPlayingMetadata
            projectedNowPlayingMetadata = nextMetadata
            listenersToNotify = nowPlayingMetadataListeners.values.toList()
        }

        if (shouldNotify) {
            listenersToNotify.forEach { it(nextMetadata) }
        }
    }

    private fun clearNowPlayingMetadata() {
        val listenersToNotify: List<(LegatoAndroidNowPlayingMetadata?) -> Unit>
        val shouldNotify: Boolean

        synchronized(lock) {
            shouldNotify = projectedNowPlayingMetadata != null
            projectedNowPlayingMetadata = null
            listenersToNotify = nowPlayingMetadataListeners.values.toList()
        }

        if (shouldNotify) {
            listenersToNotify.forEach { it(null) }
        }
    }

    fun release() {
        core.eventEmitter.removeListener(coreProjectionListenerId)
        core.playerEngine.release()
    }

    private fun LegatoAndroidTrack.toNowPlayingMetadata(): LegatoAndroidNowPlayingMetadata =
        LegatoAndroidNowPlayingMetadata(
            trackId = id,
            title = title,
            artist = artist,
            album = album,
            artwork = artwork,
            durationMs = durationMs,
        )
}

internal object LegatoAndroidPlaybackCoordinatorStore {
    private val lock = Any()
    private var coordinator: LegatoAndroidPlaybackCoordinator? = null

    fun getOrCreate(appContext: Context): LegatoAndroidPlaybackCoordinator = synchronized(lock) {
        coordinator ?: LegatoAndroidPlaybackCoordinator(
            core = LegatoAndroidCoreFactory.create(
                dependencies = LegatoAndroidCoreDependencies(
                    playbackRuntime = LegatoAndroidMedia3PlaybackRuntime(
                        player = ExoPlayer.Builder(appContext).build(),
                    ),
                ),
            ),
        ).also {
            coordinator = it
        }
    }

    fun resetForTests() {
        synchronized(lock) {
            coordinator?.release()
            coordinator = null
        }
    }
}
