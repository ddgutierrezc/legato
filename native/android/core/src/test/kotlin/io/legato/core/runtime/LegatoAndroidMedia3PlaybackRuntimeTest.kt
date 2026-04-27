package io.legato.core.runtime

import androidx.media3.common.Player
import io.legato.core.core.LegatoAndroidPlaybackState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.lang.reflect.InvocationHandler
import java.lang.reflect.Proxy

private const val AUTH_HEADER = "Authorization"
private const val AUTH_VALUE_A = "Bearer track-a"
private const val AUTH_VALUE_B = "Bearer track-b"

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
    fun `dispatch progress can update active runtime index`() {
        val runtime = LegatoAndroidMedia3PlaybackRuntime()

        runtime.dispatchProgress(
            positionMs = 2_000L,
            durationMs = 120_000L,
            bufferedPositionMs = 8_000L,
            currentIndex = 1,
        )

        val snapshot = runtime.snapshot()
        assertEquals(1, snapshot.currentIndex)
        assertEquals(2_000L, snapshot.progress.positionMs)
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

    @Test
    fun `play executes player access through command executor`() {
        val playerCalls = mutableListOf<String>()
        val player = recordingPlayer(playerCalls, playbackState = Player.STATE_READY)
        val executor = QueueingCommandExecutor()
        val runtime = LegatoAndroidMedia3PlaybackRuntime(player = player, playerCommandExecutor = executor)

        runtime.play()

        assertEquals(1, executor.calls)
        assertTrue(playerCalls.isEmpty())

        executor.runAll()

        assertEquals(listOf("play"), playerCalls)
    }

    @Test
    fun `select index executes player access through command executor`() {
        val playerCalls = mutableListOf<String>()
        val player = recordingPlayer(playerCalls)
        val executor = QueueingCommandExecutor()
        val runtime = LegatoAndroidMedia3PlaybackRuntime(player = player, playerCommandExecutor = executor)

        runtime.selectIndex(3)

        assertEquals(1, executor.calls)
        assertTrue(playerCalls.isEmpty())

        executor.runAll()

        assertEquals(listOf("seekToDefaultPosition"), playerCalls)
    }

    @Test
    fun `play prepares player when runtime is idle`() {
        val playerCalls = mutableListOf<String>()
        val player = recordingPlayer(playerCalls)
        val executor = QueueingCommandExecutor()
        val runtime = LegatoAndroidMedia3PlaybackRuntime(player = player, playerCommandExecutor = executor)

        runtime.play()

        executor.runAll()

        assertEquals(listOf("prepare", "play"), playerCalls)
    }

    @Test
    fun `replace queue rebind clears progress and keeps provided start index`() {
        val runtime = LegatoAndroidMedia3PlaybackRuntime()
        runtime.dispatchProgress(positionMs = 9_500L, durationMs = 120_000L, bufferedPositionMs = 12_000L, currentIndex = 1)

        runtime.replaceQueue(
            items = listOf(
                LegatoAndroidRuntimeTrackSource(id = "track-1", url = "https://example.com/1.mp3", headers = emptyMap(), type = null),
                LegatoAndroidRuntimeTrackSource(id = "track-2", url = "https://example.com/2.mp3", headers = emptyMap(), type = null),
            ),
            startIndex = 1,
        )

        val snapshot = runtime.snapshot()
        assertEquals(1, snapshot.currentIndex)
        assertEquals(0L, snapshot.progress.positionMs)
        assertEquals(0L, snapshot.progress.bufferedPositionMs)
        assertEquals(null, snapshot.progress.durationMs)
    }

    @Test
    fun `replace queue with empty items clears active index`() {
        val runtime = LegatoAndroidMedia3PlaybackRuntime()
        runtime.dispatchProgress(positionMs = 4_000L, durationMs = 60_000L, bufferedPositionMs = 8_000L, currentIndex = 0)

        runtime.replaceQueue(items = emptyList(), startIndex = null)

        val snapshot = runtime.snapshot()
        assertEquals(null, snapshot.currentIndex)
        assertEquals(0L, snapshot.progress.positionMs)
    }

    @Test
    fun `track request transformer injects configured headers and records evidence`() {
        val sink = RecordingLegatoAndroidRequestEvidenceSink()
        val transformer = LegatoAndroidTrackRequestTransformer(
            trackId = "track-auth",
            trackHeaders = mapOf(AUTH_HEADER to AUTH_VALUE_A),
            evidenceSink = sink,
        )

        val transformed = transformer.transform(
            requestUrl = "https://media.example.com/auth-a.m3u8",
            existingHeaders = emptyMap(),
        )

        assertEquals(AUTH_VALUE_A, transformed[AUTH_HEADER])
        assertEquals(1, sink.records.size)
        assertEquals("android", sink.records.first().runtime)
        assertEquals("track-auth", sink.records.first().trackId)
        assertEquals(AUTH_VALUE_A, sink.records.first().requestHeaders[AUTH_HEADER])
    }

    @Test
    fun `track request transformer with empty headers does not inject synthetic auth`() {
        val sink = RecordingLegatoAndroidRequestEvidenceSink()
        val transformer = LegatoAndroidTrackRequestTransformer(
            trackId = "track-public",
            trackHeaders = emptyMap(),
            evidenceSink = sink,
        )

        val transformed = transformer.transform(
            requestUrl = "https://media.example.com/public.mp3",
            existingHeaders = emptyMap(),
        )

        assertTrue(transformed.isEmpty())
        assertEquals(1, sink.records.size)
        assertTrue(sink.records.first().requestHeaders.isEmpty())
    }

    @Test
    fun `track request transformers keep headers isolated across queue transitions`() {
        val sink = RecordingLegatoAndroidRequestEvidenceSink()
        val authTrackTransformer = LegatoAndroidTrackRequestTransformer(
            trackId = "track-auth-a",
            trackHeaders = mapOf(AUTH_HEADER to AUTH_VALUE_A),
            evidenceSink = sink,
        )
        val publicTrackTransformer = LegatoAndroidTrackRequestTransformer(
            trackId = "track-public",
            trackHeaders = emptyMap(),
            evidenceSink = sink,
        )
        val secondAuthTrackTransformer = LegatoAndroidTrackRequestTransformer(
            trackId = "track-auth-b",
            trackHeaders = mapOf(AUTH_HEADER to AUTH_VALUE_B),
            evidenceSink = sink,
        )

        val authRequest = authTrackTransformer.transform(
            requestUrl = "https://media.example.com/auth-a.m3u8",
            existingHeaders = emptyMap(),
        )
        val publicRequest = publicTrackTransformer.transform(
            requestUrl = "https://media.example.com/public.mp3",
            existingHeaders = emptyMap(),
        )
        val secondAuthRequest = secondAuthTrackTransformer.transform(
            requestUrl = "https://media.example.com/auth-b.m3u8",
            existingHeaders = emptyMap(),
        )

        assertEquals(AUTH_VALUE_A, authRequest[AUTH_HEADER])
        assertTrue(publicRequest.isEmpty())
        assertEquals(AUTH_VALUE_B, secondAuthRequest[AUTH_HEADER])

        assertEquals(3, sink.records.size)
        assertEquals(AUTH_VALUE_A, sink.records[0].requestHeaders[AUTH_HEADER])
        assertTrue(sink.records[1].requestHeaders.isEmpty())
        assertEquals(AUTH_VALUE_B, sink.records[2].requestHeaders[AUTH_HEADER])
    }
}

private class QueueingCommandExecutor : PlayerCommandExecutor {
    private val queued = mutableListOf<() -> Unit>()
    var calls: Int = 0

    override fun execute(operation: () -> Unit) {
        calls += 1
        queued += operation
    }

    fun runAll() {
        queued.toList().forEach { operation -> operation() }
        queued.clear()
    }
}

private fun recordingPlayer(calls: MutableList<String>, playbackState: Int = Player.STATE_IDLE): Player {
    val handler = InvocationHandler { _, method, _ ->
        when (method.name) {
            "play", "seekToDefaultPosition", "prepare" -> calls += method.name
        }

        if (method.name == "getPlaybackState") {
            return@InvocationHandler playbackState
        }

        when (method.returnType) {
            java.lang.Boolean.TYPE -> false
            java.lang.Integer.TYPE -> 0
            java.lang.Long.TYPE -> 0L
            java.lang.Float.TYPE -> 0f
            java.lang.Double.TYPE -> 0.0
            else -> null
        }
    }

    return Proxy.newProxyInstance(Player::class.java.classLoader, arrayOf(Player::class.java), handler) as Player
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
