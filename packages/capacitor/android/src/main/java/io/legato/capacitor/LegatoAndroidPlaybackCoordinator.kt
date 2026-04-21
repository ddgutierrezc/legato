package io.legato.capacitor

import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.media3.exoplayer.ExoPlayer
import io.legato.core.core.LegatoAndroidCoreComponents
import io.legato.core.core.LegatoAndroidCoreDependencies
import io.legato.core.core.LegatoAndroidCoreFactory
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
    private val modeListenerIds = AtomicLong(0L)
    private val lock = Any()

    private var projectedMode: LegatoAndroidServiceMode = core.playerEngine.getServiceMode()
    private var projectedPlaybackState: LegatoAndroidPlaybackState = core.playerEngine.getSnapshot().state

    private val coreProjectionListenerId: Long = core.eventEmitter.addListener {
        projectServiceMode()
        projectPlaybackState()
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
    }

    fun load(tracks: List<io.legato.core.core.LegatoAndroidTrack>, startIndex: Int? = null) {
        kotlinx.coroutines.runBlocking {
            core.playerEngine.load(tracks = tracks, startIndex = startIndex)
        }
        projectServiceMode()
        projectPlaybackState()
    }

    fun add(tracks: List<LegatoAndroidTrack>, startIndex: Int? = null) {
        kotlinx.coroutines.runBlocking {
            core.playerEngine.add(tracks = tracks, startIndex = startIndex)
        }
        projectServiceMode()
        projectPlaybackState()
    }

    fun play() {
        kotlinx.coroutines.runBlocking { core.playerEngine.play() }
        projectServiceMode()
        projectPlaybackState()
    }

    fun pause() {
        kotlinx.coroutines.runBlocking { core.playerEngine.pause() }
        projectServiceMode()
        projectPlaybackState()
    }

    fun stop() {
        kotlinx.coroutines.runBlocking { core.playerEngine.stop() }
        projectServiceMode()
        projectPlaybackState()
    }

    fun seekTo(positionMs: Long) {
        kotlinx.coroutines.runBlocking { core.playerEngine.seekTo(positionMs) }
        projectServiceMode()
        projectPlaybackState()
    }

    fun skipToNext() {
        kotlinx.coroutines.runBlocking { core.playerEngine.skipToNext() }
        projectServiceMode()
        projectPlaybackState()
    }

    fun skipToPrevious() {
        kotlinx.coroutines.runBlocking { core.playerEngine.skipToPrevious() }
        projectServiceMode()
        projectPlaybackState()
    }

    fun skipTo(index: Int) {
        kotlinx.coroutines.runBlocking { core.playerEngine.skipTo(index) }
        projectServiceMode()
        projectPlaybackState()
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

    fun currentServiceMode(): LegatoAndroidServiceMode = synchronized(lock) { projectedMode }

    fun currentPlaybackState(): LegatoAndroidPlaybackState = synchronized(lock) { projectedPlaybackState }

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

    fun release() {
        core.eventEmitter.removeListener(coreProjectionListenerId)
        core.playerEngine.release()
    }
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
