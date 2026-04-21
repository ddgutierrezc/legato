package io.legato.core.core

enum class LegatoAndroidPlaybackState(val wireValue: String) {
    IDLE("idle"),
    LOADING("loading"),
    READY("ready"),
    PLAYING("playing"),
    PAUSED("paused"),
    BUFFERING("buffering"),
    ENDED("ended"),
    ERROR("error"),
}

enum class LegatoAndroidPauseOrigin {
    USER,
    INTERRUPTION,
}

enum class LegatoAndroidServiceMode {
    OFF,
    PLAYBACK_ACTIVE,
    RESUME_PENDING_INTERRUPTION,
}

enum class LegatoAndroidTrackType(val wireValue: String) {
    FILE("file"),
    PROGRESSIVE("progressive"),
    HLS("hls"),
    DASH("dash"),
}

data class LegatoAndroidTrack(
    val id: String,
    val url: String,
    val title: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val artwork: String? = null,
    val durationMs: Long? = null,
    val headers: Map<String, String> = emptyMap(),
    val type: LegatoAndroidTrackType? = null,
)

enum class LegatoAndroidErrorCode(val wireValue: String) {
    PLAYER_NOT_SETUP("player_not_setup"),
    INVALID_INDEX("invalid_index"),
    EMPTY_QUEUE("empty_queue"),
    NO_ACTIVE_TRACK("no_active_track"),
    INVALID_URL("invalid_url"),
    LOAD_FAILED("load_failed"),
    PLAYBACK_FAILED("playback_failed"),
    SEEK_FAILED("seek_failed"),
    UNSUPPORTED_OPERATION("unsupported_operation"),
    PLATFORM_ERROR("platform_error"),
}

data class LegatoAndroidError(
    val code: LegatoAndroidErrorCode,
    val message: String,
    val details: Any? = null,
)

data class LegatoAndroidQueueSnapshot(
    val items: List<LegatoAndroidTrack>,
    val currentIndex: Int?,
)

data class LegatoAndroidPlaybackSnapshot(
    val state: LegatoAndroidPlaybackState,
    val currentTrack: LegatoAndroidTrack?,
    val currentIndex: Int?,
    val positionMs: Long,
    val durationMs: Long?,
    val bufferedPositionMs: Long? = null,
    val queue: LegatoAndroidQueueSnapshot,
)

data class LegatoAndroidNowPlayingMetadata(
    val trackId: String,
    val title: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val artwork: String? = null,
    val durationMs: Long? = null,
)

data class LegatoAndroidProgressUpdate(
    val positionMs: Long,
    val durationMs: Long?,
    val bufferedPositionMs: Long?,
)

sealed interface LegatoAndroidRemoteCommand {
    object Play : LegatoAndroidRemoteCommand
    object Pause : LegatoAndroidRemoteCommand
    object Next : LegatoAndroidRemoteCommand
    object Previous : LegatoAndroidRemoteCommand
    data class Seek(val positionMs: Long) : LegatoAndroidRemoteCommand
}

enum class LegatoAndroidEventName(val wireValue: String) {
    PLAYBACK_STATE_CHANGED("playback-state-changed"),
    PLAYBACK_ACTIVE_TRACK_CHANGED("playback-active-track-changed"),
    PLAYBACK_QUEUE_CHANGED("playback-queue-changed"),
    PLAYBACK_PROGRESS("playback-progress"),
    PLAYBACK_ENDED("playback-ended"),
    PLAYBACK_ERROR("playback-error"),
    REMOTE_PLAY("remote-play"),
    REMOTE_PAUSE("remote-pause"),
    REMOTE_NEXT("remote-next"),
    REMOTE_PREVIOUS("remote-previous"),
    REMOTE_SEEK("remote-seek"),
}

sealed interface LegatoAndroidEventPayload {
    data class PlaybackStateChanged(val state: LegatoAndroidPlaybackState) : LegatoAndroidEventPayload
    data class ActiveTrackChanged(val track: LegatoAndroidTrack?, val index: Int?) : LegatoAndroidEventPayload
    data class QueueChanged(val queue: LegatoAndroidQueueSnapshot) : LegatoAndroidEventPayload
    data class PlaybackProgress(
        val positionMs: Long,
        val durationMs: Long?,
        val bufferedPositionMs: Long?,
    ) : LegatoAndroidEventPayload

    data class PlaybackEnded(val snapshot: LegatoAndroidPlaybackSnapshot) : LegatoAndroidEventPayload
    data class PlaybackError(val error: LegatoAndroidError) : LegatoAndroidEventPayload

    object RemotePlay : LegatoAndroidEventPayload
    object RemotePause : LegatoAndroidEventPayload
    object RemoteNext : LegatoAndroidEventPayload
    object RemotePrevious : LegatoAndroidEventPayload
    data class RemoteSeek(val positionMs: Long) : LegatoAndroidEventPayload
}

data class LegatoAndroidEvent(
    val name: LegatoAndroidEventName,
    val payload: LegatoAndroidEventPayload? = null,
)
