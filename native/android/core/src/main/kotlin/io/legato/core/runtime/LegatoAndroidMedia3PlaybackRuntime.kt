package io.legato.core.runtime

import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import io.legato.core.core.LegatoAndroidPlaybackState

class LegatoAndroidMedia3PlaybackRuntime(
    private val player: Player? = null,
) : LegatoAndroidPlaybackRuntime {
    private var listener: LegatoAndroidPlaybackRuntimeListener? = null
    private var runtimeSnapshot: LegatoAndroidRuntimeSnapshot = LegatoAndroidRuntimeSnapshot()

    override fun configure() {
        player?.addListener(
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
                    if (events.contains(Player.EVENT_POSITION_DISCONTINUITY) || events.contains(Player.EVENT_PLAYBACK_STATE_CHANGED)) {
                        dispatchProgress(
                            positionMs = player.currentPosition,
                            durationMs = player.duration.takeIf { it >= 0L },
                            bufferedPositionMs = player.bufferedPosition,
                        )
                    }
                }
            },
        )
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

        player?.setMediaItems(
            items.map { source -> MediaItem.fromUri(source.url) },
            selectedIndex ?: 0,
            0L,
        )

        runtimeSnapshot = runtimeSnapshot.copy(
            currentIndex = selectedIndex,
            progress = runtimeSnapshot.progress.copy(positionMs = 0L, bufferedPositionMs = 0L),
            stateHint = LegatoAndroidPlaybackState.READY,
            isBufferingHint = false,
        )
    }

    override fun selectIndex(index: Int) {
        player?.seekToDefaultPosition(index)
        runtimeSnapshot = runtimeSnapshot.copy(
            currentIndex = index,
            progress = runtimeSnapshot.progress.copy(positionMs = 0L, bufferedPositionMs = 0L),
        )
    }

    override fun play() {
        player?.play()
    }

    override fun pause() {
        player?.pause()
    }

    override fun stop(resetPosition: Boolean) {
        player?.stop()
        if (resetPosition) {
            runtimeSnapshot = runtimeSnapshot.copy(
                progress = runtimeSnapshot.progress.copy(positionMs = 0L, bufferedPositionMs = 0L),
                isBufferingHint = false,
            )
        }
    }

    override fun seekTo(positionMs: Long) {
        val safePositionMs = positionMs.coerceAtLeast(0L)
        player?.seekTo(safePositionMs)
        runtimeSnapshot = runtimeSnapshot.copy(
            progress = runtimeSnapshot.progress.copy(positionMs = safePositionMs),
        )
    }

    override fun snapshot(): LegatoAndroidRuntimeSnapshot = runtimeSnapshot

    override fun release() {
        listener = null
        player?.release()
    }

    fun dispatchProgress(positionMs: Long, durationMs: Long?, bufferedPositionMs: Long?) {
        val progress = LegatoAndroidRuntimeProgress(
            positionMs = positionMs.coerceAtLeast(0L),
            durationMs = durationMs?.takeIf { it >= 0L },
            bufferedPositionMs = bufferedPositionMs?.coerceAtLeast(0L),
        )

        runtimeSnapshot = runtimeSnapshot.copy(progress = progress)
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
