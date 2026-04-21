package io.legato.core.runtime

import io.legato.core.core.LegatoAndroidPlaybackState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class LegatoAndroidMedia3PlaybackRuntimeTest {
    @Test
    fun `dispatch progress updates snapshot and emits callback`() {
        val runtime = LegatoAndroidMedia3PlaybackRuntime()
        val listener = RecordingListener()
        runtime.setListener(listener)

        runtime.dispatchProgress(positionMs = 2_000L, durationMs = 120_000L, bufferedPositionMs = 8_000L)

        val snapshot = runtime.snapshot()
        assertEquals(2_000L, snapshot.progress.positionMs)
        assertEquals(120_000L, snapshot.progress.durationMs)
        assertEquals(8_000L, snapshot.progress.bufferedPositionMs)
        assertEquals(1, listener.progressCalls)
    }

    @Test
    fun `dispatch buffering toggles buffering state and emits callback`() {
        val runtime = LegatoAndroidMedia3PlaybackRuntime()
        val listener = RecordingListener()
        runtime.setListener(listener)

        runtime.dispatchBuffering(isBuffering = true)
        assertEquals(LegatoAndroidPlaybackState.BUFFERING, runtime.snapshot().stateHint)
        assertTrue(listener.lastBuffering)

        runtime.dispatchBuffering(isBuffering = false)
        assertFalse(listener.lastBuffering)
    }
}

private class RecordingListener : LegatoAndroidPlaybackRuntimeListener {
    var progressCalls: Int = 0
    var lastBuffering: Boolean = false

    override fun onProgress(progress: LegatoAndroidRuntimeProgress) {
        progressCalls += 1
    }

    override fun onBuffering(isBuffering: Boolean) {
        lastBuffering = isBuffering
    }

    override fun onEnded() = Unit

    override fun onFatalError(error: Throwable) = Unit
}
