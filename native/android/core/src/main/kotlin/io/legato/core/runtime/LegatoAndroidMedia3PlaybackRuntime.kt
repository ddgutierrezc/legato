package io.legato.core.runtime

import android.os.Handler
import android.os.Looper
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import io.legato.core.core.LegatoAndroidPlaybackState

class LegatoAndroidMedia3PlaybackRuntime(
    private val player: Player? = null,
    private val playerCommandExecutor: PlayerCommandExecutor = MainThreadPlayerCommandExecutor,
    private val requestEvidenceSink: LegatoAndroidRequestEvidenceSink = NoOpLegatoAndroidRequestEvidenceSink,
    private val trackMediaSourceFactory: LegatoAndroidTrackMediaSourceFactory = DefaultLegatoAndroidTrackMediaSourceFactory(requestEvidenceSink),
) : LegatoAndroidPlaybackRuntime {
    private var listener: LegatoAndroidPlaybackRuntimeListener? = null
    private var runtimeSnapshot: LegatoAndroidRuntimeSnapshot = LegatoAndroidRuntimeSnapshot()

    override fun configure() {
        withPlayer { currentPlayer ->
            currentPlayer.addListener(
                object : Player.Listener {
                    override fun onPlaybackStateChanged(playbackState: Int) {
                        when (playbackState) {
                            Player.STATE_BUFFERING -> dispatchBuffering(true)
                            Player.STATE_ENDED -> dispatchEnded()
                        }
                    }

                    override fun onIsLoadingChanged(isLoading: Boolean) {
                        dispatchBuffering(isLoading)
                    }

                    override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
                        dispatchFatalError(error)
                    }

                    override fun onEvents(player: Player, events: Player.Events) {
                        if (
                            events.contains(Player.EVENT_POSITION_DISCONTINUITY) ||
                            events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED) ||
                            events.contains(Player.EVENT_MEDIA_ITEM_TRANSITION)
                        ) {
                            dispatchProgress(
                                positionMs = player.currentPosition,
                                durationMs = player.duration.takeIf { it >= 0L },
                                bufferedPositionMs = player.bufferedPosition,
                                currentIndex = player.currentMediaItemIndex.takeIf { it >= 0 },
                            )
                        }
                    }
                }
            )
        }
    }

    override fun setListener(listener: LegatoAndroidPlaybackRuntimeListener?) {
        this.listener = listener
    }

    override fun replaceQueue(items: List<LegatoAndroidRuntimeTrackSource>, startIndex: Int?) {
        val selectedIndex = when {
            items.isEmpty() -> null
            startIndex == null -> 0
            startIndex in items.indices -> startIndex
            else -> 0
        }

        withPlayer { currentPlayer ->
            if (currentPlayer is ExoPlayer) {
                currentPlayer.setMediaSources(
                    items.map { source -> trackMediaSourceFactory.create(source) },
                    selectedIndex ?: 0,
                    0L,
                )
            } else {
                currentPlayer.setMediaItems(
                    items.map { source -> MediaItem.fromUri(source.url) },
                    selectedIndex ?: 0,
                    0L,
                )
            }
        }

        runtimeSnapshot = runtimeSnapshot.copy(
            currentIndex = selectedIndex,
            progress = runtimeSnapshot.progress.copy(positionMs = 0L, durationMs = null, bufferedPositionMs = 0L),
            stateHint = LegatoAndroidPlaybackState.READY,
            isBufferingHint = false,
        )
    }

    override fun selectIndex(index: Int) {
        withPlayer { currentPlayer -> currentPlayer.seekToDefaultPosition(index) }
        runtimeSnapshot = runtimeSnapshot.copy(
            currentIndex = index,
            progress = runtimeSnapshot.progress.copy(positionMs = 0L, durationMs = null, bufferedPositionMs = 0L),
        )
    }

    override fun play() {
        withPlayer { currentPlayer ->
            if (currentPlayer.playbackState == Player.STATE_IDLE) {
                currentPlayer.prepare()
            }
            currentPlayer.play()
        }
    }

    override fun pause() {
        withPlayer { currentPlayer -> currentPlayer.pause() }
    }

    override fun stop(resetPosition: Boolean) {
        withPlayer { currentPlayer -> currentPlayer.stop() }
        if (resetPosition) {
            runtimeSnapshot = runtimeSnapshot.copy(
                progress = runtimeSnapshot.progress.copy(positionMs = 0L, bufferedPositionMs = 0L),
                isBufferingHint = false,
            )
        }
    }

    override fun seekTo(positionMs: Long) {
        val safePositionMs = positionMs.coerceAtLeast(0L)
        withPlayer { currentPlayer -> currentPlayer.seekTo(safePositionMs) }
        runtimeSnapshot = runtimeSnapshot.copy(
            progress = runtimeSnapshot.progress.copy(positionMs = safePositionMs),
        )
    }

    override fun snapshot(): LegatoAndroidRuntimeSnapshot = runtimeSnapshot

    override fun release() {
        listener = null
        withPlayer { currentPlayer -> currentPlayer.release() }
    }

    private inline fun withPlayer(crossinline operation: (Player) -> Unit) {
        val currentPlayer = player ?: return
        playerCommandExecutor.execute {
            operation(currentPlayer)
        }
    }

    fun dispatchProgress(positionMs: Long, durationMs: Long?, bufferedPositionMs: Long?, currentIndex: Int? = runtimeSnapshot.currentIndex) {
        val progress = LegatoAndroidRuntimeProgress(
            positionMs = positionMs.coerceAtLeast(0L),
            durationMs = durationMs?.takeIf { it >= 0L },
            bufferedPositionMs = bufferedPositionMs?.coerceAtLeast(0L),
        )

        runtimeSnapshot = runtimeSnapshot.copy(currentIndex = currentIndex, progress = progress)
        listener?.onProgress(progress)
    }

    fun dispatchBuffering(isBuffering: Boolean) {
        runtimeSnapshot = runtimeSnapshot.copy(
            stateHint = if (isBuffering) LegatoAndroidPlaybackState.BUFFERING else runtimeSnapshot.stateHint,
            isBufferingHint = isBuffering,
        )
        listener?.onBuffering(isBuffering)
    }

    fun dispatchEnded() {
        runtimeSnapshot = runtimeSnapshot.copy(
            stateHint = LegatoAndroidPlaybackState.ENDED,
            isBufferingHint = false,
        )
        listener?.onEnded()
    }

    fun dispatchFatalError(error: Throwable) {
        runtimeSnapshot = runtimeSnapshot.copy(
            stateHint = LegatoAndroidPlaybackState.ERROR,
            isBufferingHint = false,
        )
        listener?.onFatalError(error)
    }
}

fun interface PlayerCommandExecutor {
    fun execute(operation: () -> Unit)
}

private object MainThreadPlayerCommandExecutor : PlayerCommandExecutor {
    private val handler: Handler by lazy { Handler(Looper.getMainLooper()) }

    override fun execute(operation: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            operation()
            return
        }

        handler.post(operation)
    }
}
