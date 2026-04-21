package io.legato.core.runtime

import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidTrackType

/**
 * Runtime seam for real playback engines.
 *
 * This abstraction exists so the core can start driving a concrete runtime lifecycle
 * without hard-coding Media3/ExoPlayer types in this MVP step.
 */
interface LegatoAndroidPlaybackRuntime {
    fun configure()

    fun setListener(listener: LegatoAndroidPlaybackRuntimeListener?)

    fun replaceQueue(items: List<LegatoAndroidRuntimeTrackSource>, startIndex: Int?)

    fun selectIndex(index: Int)

    fun play()

    fun pause()

    fun stop(resetPosition: Boolean = true)

    fun seekTo(positionMs: Long)

    fun snapshot(): LegatoAndroidRuntimeSnapshot

    fun release()
}

interface LegatoAndroidPlaybackRuntimeListener {
    fun onProgress(progress: LegatoAndroidRuntimeProgress)

    fun onBuffering(isBuffering: Boolean)

    fun onEnded()

    fun onFatalError(error: Throwable)
}

data class LegatoAndroidRuntimeTrackSource(
    val id: String,
    val url: String,
    val headers: Map<String, String>,
    val type: LegatoAndroidTrackType?,
)

data class LegatoAndroidRuntimeProgress(
    val positionMs: Long,
    val durationMs: Long?,
    val bufferedPositionMs: Long?,
)

data class LegatoAndroidRuntimeSnapshot(
    val stateHint: LegatoAndroidPlaybackState? = null,
    val currentIndex: Int? = null,
    val isBufferingHint: Boolean = false,
    val progress: LegatoAndroidRuntimeProgress = LegatoAndroidRuntimeProgress(
        positionMs = 0L,
        durationMs = null,
        bufferedPositionMs = 0L,
    ),
)

/**
 * Minimal in-memory runtime used until Media3 is wired.
 *
 * This is intentionally NOT real playback: it only keeps deterministic runtime-facing state.
 */
class LegatoAndroidNoopPlaybackRuntime : LegatoAndroidPlaybackRuntime {
    private var listener: LegatoAndroidPlaybackRuntimeListener? = null
    private var currentIndex: Int? = null
    private var trackCount: Int = 0
    private var progress = LegatoAndroidRuntimeProgress(positionMs = 0L, durationMs = null, bufferedPositionMs = 0L)

    override fun configure() {
        // Intentionally no-op. Real implementation should initialize Media3 player/session objects.
    }

    override fun setListener(listener: LegatoAndroidPlaybackRuntimeListener?) {
        this.listener = listener
    }

    override fun replaceQueue(items: List<LegatoAndroidRuntimeTrackSource>, startIndex: Int?) {
        trackCount = items.size
        currentIndex = when {
            items.isEmpty() -> null
            startIndex == null -> 0
            startIndex in items.indices -> startIndex
            else -> null
        }
        progress = progress.copy(positionMs = 0L, bufferedPositionMs = 0L)
    }

    override fun selectIndex(index: Int) {
        if (index !in 0 until trackCount) {
            return
        }
        currentIndex = index
        progress = progress.copy(positionMs = 0L, bufferedPositionMs = 0L)
    }

    override fun play() {
        // Intentionally no-op. Media3 adapter should delegate to player.play().
    }

    override fun pause() {
        // Intentionally no-op. Media3 adapter should delegate to player.pause().
    }

    override fun stop(resetPosition: Boolean) {
        if (resetPosition) {
            progress = progress.copy(positionMs = 0L, bufferedPositionMs = 0L)
        }
    }

    override fun seekTo(positionMs: Long) {
        progress = progress.copy(positionMs = positionMs.coerceAtLeast(0L))
    }

    override fun snapshot(): LegatoAndroidRuntimeSnapshot = LegatoAndroidRuntimeSnapshot(
        currentIndex = currentIndex,
        progress = progress,
    )

    override fun release() {
        listener = null
        currentIndex = null
        trackCount = 0
        progress = LegatoAndroidRuntimeProgress(positionMs = 0L, durationMs = null, bufferedPositionMs = 0L)
    }
}
