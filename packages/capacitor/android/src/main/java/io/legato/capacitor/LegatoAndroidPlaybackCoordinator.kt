package io.legato.capacitor

import android.content.Context
import android.content.Intent
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.os.Build
import androidx.media3.exoplayer.ExoPlayer
import io.legato.core.core.LegatoAndroidCoreComponents
import io.legato.core.core.LegatoAndroidCoreDependencies
import io.legato.core.core.LegatoAndroidCoreFactory
import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPauseOrigin
import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidQueueSnapshot
import io.legato.core.core.LegatoAndroidSetupOptions
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
    private val focusGate: LegatoAndroidPlaybackFocusGate = AlwaysGrantedLegatoAndroidPlaybackFocusGate,
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

    fun setup(options: LegatoAndroidSetupOptions = LegatoAndroidSetupOptions()) {
        kotlinx.coroutines.runBlocking { core.playerEngine.setup(options) }
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
        if (!focusGate.requestPlaybackFocus()) {
            core.playerEngine.handleExternalInterruption(
                io.legato.core.session.LegatoAndroidInterruptionSignal.AudioFocusDenied,
            )
            projectServiceMode()
            projectPlaybackState()
            projectNowPlayingMetadata()
            return
        }
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

    fun remove(index: Int) {
        val previousSnapshot = core.playerEngine.getSnapshot()
        val queueSnapshot = core.queueManager.getQueueSnapshot()
        require(index in queueSnapshot.items.indices) { "remove index out of bounds" }

        val remainingItems = queueSnapshot.items.toMutableList().apply { removeAt(index) }
        if (remainingItems.isEmpty()) {
            core.playbackRuntime.replaceQueue(emptyList(), null)
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
            val targetIndex = resolvePostRemovalIndex(queueSnapshot.currentIndex, index, remainingItems.lastIndex)
            val nextQueue = core.queueManager.replaceQueue(remainingItems, targetIndex)
            core.playbackRuntime.replaceQueue(remainingItems.map(::toRuntimeTrackSource), targetIndex)
            val runtimeSnapshot = core.playbackRuntime.snapshot()
            val nextSnapshot = snapshotWithQueue(previousSnapshot, nextQueue, runtimeSnapshot.currentIndex)
            core.snapshotStore.replacePlaybackSnapshot(nextSnapshot)
        }

        val next = core.snapshotStore.getPlaybackSnapshot()
        publishQueueTrackProgress(next)
        if (previousSnapshot.state != next.state) {
            core.eventEmitter.emit(
                name = io.legato.core.core.LegatoAndroidEventName.PLAYBACK_STATE_CHANGED,
                payload = io.legato.core.core.LegatoAndroidEventPayload.PlaybackStateChanged(next.state),
            )
        }
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    fun reset() {
        core.playbackRuntime.stop(resetPosition = true)
        core.playbackRuntime.replaceQueue(emptyList(), null)
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
            name = io.legato.core.core.LegatoAndroidEventName.PLAYBACK_STATE_CHANGED,
            payload = io.legato.core.core.LegatoAndroidEventPayload.PlaybackStateChanged(snapshot.state),
        )
        projectServiceMode()
        projectPlaybackState()
        projectNowPlayingMetadata()
    }

    private fun publishQueueTrackProgress(snapshot: LegatoAndroidPlaybackSnapshot) {
        core.eventEmitter.emit(
            name = io.legato.core.core.LegatoAndroidEventName.PLAYBACK_QUEUE_CHANGED,
            payload = io.legato.core.core.LegatoAndroidEventPayload.QueueChanged(snapshot.queue),
        )
        core.eventEmitter.emit(
            name = io.legato.core.core.LegatoAndroidEventName.PLAYBACK_ACTIVE_TRACK_CHANGED,
            payload = io.legato.core.core.LegatoAndroidEventPayload.ActiveTrackChanged(snapshot.currentTrack, snapshot.currentIndex),
        )
        core.eventEmitter.emit(
            name = io.legato.core.core.LegatoAndroidEventName.PLAYBACK_PROGRESS,
            payload = io.legato.core.core.LegatoAndroidEventPayload.PlaybackProgress(
                positionMs = snapshot.positionMs,
                durationMs = snapshot.durationMs,
                bufferedPositionMs = snapshot.bufferedPositionMs,
            ),
        )
    }

    private fun resolvePostRemovalIndex(previousIndex: Int?, removedIndex: Int, lastIndex: Int): Int {
        return when (previousIndex) {
            null -> 0
            in (removedIndex + 1)..Int.MAX_VALUE -> (previousIndex - 1).coerceIn(0, lastIndex)
            removedIndex -> removedIndex.coerceIn(0, lastIndex)
            else -> previousIndex.coerceIn(0, lastIndex)
        }
    }

    private fun snapshotWithQueue(
        previous: LegatoAndroidPlaybackSnapshot,
        queue: LegatoAndroidQueueSnapshot,
        runtimeCurrentIndex: Int?,
    ): LegatoAndroidPlaybackSnapshot {
        val fallbackIndex = if (queue.items.isNotEmpty()) 0 else null
        val nextIndex = runtimeCurrentIndex ?: queue.currentIndex ?: fallbackIndex
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

    private fun toRuntimeTrackSource(track: LegatoAndroidTrack): io.legato.core.runtime.LegatoAndroidRuntimeTrackSource {
        return io.legato.core.runtime.LegatoAndroidRuntimeTrackSource(
            id = track.id,
            url = track.url,
            headers = track.headers,
            type = track.type,
        )
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

        if (shouldEnsureServiceRunning(nextMode)) {
            runtime.ensureServiceRunning(nextMode)
        } else {
            focusGate.abandonPlaybackFocus()
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

internal fun shouldEnsureServiceRunning(mode: LegatoAndroidServiceMode): Boolean {
    return mode != LegatoAndroidServiceMode.OFF
}

internal interface LegatoAndroidPlaybackFocusGate {
    fun requestPlaybackFocus(): Boolean

    fun abandonPlaybackFocus()
}

internal object AlwaysGrantedLegatoAndroidPlaybackFocusGate : LegatoAndroidPlaybackFocusGate {
    override fun requestPlaybackFocus(): Boolean = true

    override fun abandonPlaybackFocus() = Unit
}

internal class AndroidAudioManagerPlaybackFocusGate(
    private val appContext: Context,
) : LegatoAndroidPlaybackFocusGate {
    private val audioManager: AudioManager? = appContext.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    private var focusRequest: AudioFocusRequest? = null
    private var hasFocus: Boolean = false

    override fun requestPlaybackFocus(): Boolean {
        if (hasFocus) {
            return true
        }
        val manager = audioManager ?: return true

        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val request = focusRequest ?: AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                .setAcceptsDelayedFocusGain(false)
                .setWillPauseWhenDucked(true)
                .setOnAudioFocusChangeListener { }
                .build()
                .also { created -> focusRequest = created }
            manager.requestAudioFocus(request) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(
                null,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN,
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        hasFocus = granted
        return granted
    }

    override fun abandonPlaybackFocus() {
        if (!hasFocus) {
            return
        }
        val manager = audioManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            focusRequest?.let { manager.abandonAudioFocusRequest(it) }
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(null)
        }
        hasFocus = false
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
            focusGate = AndroidAudioManagerPlaybackFocusGate(appContext),
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
