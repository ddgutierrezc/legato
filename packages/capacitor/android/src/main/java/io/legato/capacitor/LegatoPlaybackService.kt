package io.legato.capacitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.util.Log
import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidServiceMode
import io.legato.core.queue.LegatoAndroidTransportCapabilitiesProjector
import io.legato.core.remote.LegatoAndroidMediaSessionBridge
import java.net.URL
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

class LegatoPlaybackService : Service() {
    private lateinit var coordinator: LegatoAndroidPlaybackCoordinator
    private var metadataListenerId: Long? = null
    private var modeListenerId: Long? = null
    private var playbackStateListenerId: Long? = null
    private var foregroundActive: Boolean = false
    private var currentMode: LegatoAndroidServiceMode = LegatoAndroidServiceMode.OFF
    private var currentPlaybackState: LegatoAndroidPlaybackState = LegatoAndroidPlaybackState.IDLE
    private var currentNowPlayingMetadata: LegatoAndroidNowPlayingMetadata? = null
    private var currentArtworkBitmap: Bitmap? = null
    private var activeArtworkRequestToken: ArtworkRequestToken? = null
    private var activeArtworkJob: Job? = null
    private var mediaSession: MediaSession? = null
    private var lastMediaSessionProjection: MediaSessionPlaybackProjection? = null
    private val artworkRequestTokenFactory: ArtworkRequestTokenFactory = ArtworkRequestTokenFactory()
    private val artworkLoader: LegatoPlaybackArtworkLoader = DefaultLegatoPlaybackArtworkLoader
    private val artworkDiagnostics: LegatoPlaybackArtworkDiagnostics = AndroidLogcatArtworkDiagnostics
    private val artworkScope: CoroutineScope = CoroutineScope(SupervisorJob())

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        coordinator = resolveOnCreateDependency(
            contextProvider = { applicationContext },
            resolver = LegatoAndroidPlaybackCoordinatorStore::getOrCreate,
        )
        currentMode = coordinator.currentServiceMode()
        currentPlaybackState = coordinator.currentPlaybackState()
        currentNowPlayingMetadata = coordinator.currentNowPlayingMetadata()
        modeListenerId = coordinator.addServiceModeListener(::onServiceModeChanged)
        playbackStateListenerId = coordinator.addPlaybackStateListener(::onPlaybackStateChanged)
        metadataListenerId = coordinator.addNowPlayingMetadataListener(::onNowPlayingMetadataChanged)

        mediaSession = MediaSession(this, MEDIA_SESSION_TAG).apply {
            setCallback(
                object : MediaSession.Callback() {
                    override fun onPlay() {
                        coordinator.core.mediaSessionBridge.dispatchMediaSessionPlay()
                    }

                    override fun onPause() {
                        coordinator.core.mediaSessionBridge.dispatchMediaSessionPause()
                    }

                    override fun onSkipToNext() {
                        coordinator.core.mediaSessionBridge.dispatchMediaSessionSkipToNext()
                    }

                    override fun onSkipToPrevious() {
                        coordinator.core.mediaSessionBridge.dispatchMediaSessionSkipToPrevious()
                    }

                    override fun onSeekTo(pos: Long) {
                        coordinator.core.mediaSessionBridge.dispatchMediaSessionSeekTo(pos)
                    }
                },
            )
            setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
            isActive = true
        }
        syncMediaSessionPlaybackState(currentPlaybackState)
        publishNowPlayingSurfaces()
        refreshArtworkFor(currentNowPlayingMetadata)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        LegatoPlaybackNotificationTransport.remoteCommandFromIntentAction(intent?.action)
            ?.let { command ->
                dispatchNotificationRemoteCommand(command)
                return START_STICKY
            }

        val mode = intent?.getStringExtra(EXTRA_SERVICE_MODE)
            ?.runCatching { LegatoAndroidServiceMode.valueOf(this) }
            ?.getOrNull()
            ?: coordinator.currentServiceMode()

        onServiceModeChanged(mode)
        return START_STICKY
    }

    override fun onDestroy() {
        modeListenerId?.let(coordinator::removeServiceModeListener)
        modeListenerId = null
        playbackStateListenerId?.let(coordinator::removePlaybackStateListener)
        playbackStateListenerId = null
        metadataListenerId?.let(coordinator::removeNowPlayingMetadataListener)
        metadataListenerId = null

        activeArtworkJob?.cancel()
        activeArtworkJob = null
        artworkScope.cancel()

        mediaSession?.release()
        mediaSession = null

        if (foregroundActive) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            foregroundActive = false
        }
        super.onDestroy()
    }

    private fun onServiceModeChanged(mode: LegatoAndroidServiceMode) {
        currentMode = mode
        if (mode == LegatoAndroidServiceMode.OFF) {
            if (foregroundActive) {
                stopForeground(STOP_FOREGROUND_REMOVE)
                foregroundActive = false
            }
            stopSelf()
            return
        }

        startForegroundInternal(mode)
    }

    private fun onPlaybackStateChanged(state: LegatoAndroidPlaybackState) {
        currentPlaybackState = state
        syncMediaSessionPlaybackState(state)
        publishNowPlayingSurfaces()
    }

    private fun onNowPlayingMetadataChanged(metadata: LegatoAndroidNowPlayingMetadata?) {
        val previousTrackId = currentNowPlayingMetadata?.trackId
        currentNowPlayingMetadata = metadata
        currentArtworkBitmap = null
        if (previousTrackId != metadata?.trackId) {
            syncMediaSessionPlaybackState(currentPlaybackState)
        }
        publishNowPlayingSurfaces()
        refreshArtworkFor(metadata)
    }

    private fun refreshArtworkFor(metadata: LegatoAndroidNowPlayingMetadata?) {
        activeArtworkJob?.cancel()
        activeArtworkJob = null

        val artworkUrl = metadata?.artwork?.takeIf { it.isNotBlank() }
        if (metadata == null || artworkUrl == null) {
            activeArtworkRequestToken = null
            return
        }

        val token = artworkRequestTokenFactory.next(trackId = metadata.trackId, artworkUrl = artworkUrl)
        activeArtworkRequestToken = token
        artworkDiagnostics.record(
            stage = "load",
            outcome = "started",
            token = token,
            detail = "url_present",
        )
        activeArtworkJob = artworkScope.launch {
            val loadResult = artworkLoader.load(artworkUrl)
            val bitmap = when (loadResult) {
                is ArtworkLoadResult.Success -> {
                    artworkDiagnostics.record(
                        stage = "decode",
                        outcome = "success",
                        token = token,
                        detail = "bitmap_ready",
                    )
                    loadResult.bitmap
                }

                is ArtworkLoadResult.FetchFailure -> {
                    artworkDiagnostics.record(
                        stage = "fetch",
                        outcome = "failure",
                        token = token,
                        detail = loadResult.error::class.java.simpleName,
                    )
                    null
                }

                ArtworkLoadResult.DecodeFailure -> {
                    artworkDiagnostics.record(
                        stage = "decode",
                        outcome = "failure",
                        token = token,
                        detail = "bitmap_null",
                    )
                    null
                }
            }
            if (shouldApplyArtworkResult(activeArtworkRequestToken, token, currentNowPlayingMetadata)) {
                currentArtworkBitmap = bitmap
                val metadataPublished = publishNowPlayingSurfaces()
                artworkDiagnostics.record(
                    stage = "publish",
                    outcome = if (bitmap != null && metadataPublished) "success" else "failure",
                    token = token,
                    detail = when {
                        bitmap == null -> "no_bitmap"
                        !metadataPublished -> "media_session_missing"
                        else -> "metadata_updated"
                    },
                )
            } else {
                artworkDiagnostics.record(
                    stage = "publish",
                    outcome = "failure",
                    token = token,
                    detail = "stale_request",
                )
            }
        }
    }

    private fun publishNowPlayingSurfaces(): Boolean {
        val metadataPublished = syncMediaSessionMetadata(currentNowPlayingMetadata, currentArtworkBitmap)
        if (foregroundActive && currentMode != LegatoAndroidServiceMode.OFF) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(NOTIFICATION_ID, buildNotification(currentMode))
        }
        return metadataPublished
    }

    private fun startForegroundInternal(mode: LegatoAndroidServiceMode) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            notificationManager.createNotificationChannel(
                NotificationChannel(
                    CHANNEL_ID,
                    CHANNEL_NAME,
                    NotificationManager.IMPORTANCE_LOW,
                ),
            )
        }

        startForeground(NOTIFICATION_ID, buildNotification(mode))
        foregroundActive = true
    }

    private fun buildNotification(mode: LegatoAndroidServiceMode): Notification {
        val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
        val launchPendingIntent = launchIntent?.let {
            PendingIntent.getActivity(
                this,
                REQUEST_CODE_OPEN_APP,
                it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        }

        val capabilities = LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(coordinator.core.playerEngine.getSnapshot())
        val notificationActions = LegatoPlaybackNotificationTransport.notificationActionModelFor(
            state = currentPlaybackState,
            capabilities = capabilities,
        )

        val metadataModel = LegatoPlaybackNotificationTransport.notificationMetadataModelFor(
            mode = mode,
            metadata = currentNowPlayingMetadata,
            largeIcon = currentArtworkBitmap,
        )

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(metadataModel.title)
            .setContentText(metadataModel.contentText)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setContentIntent(launchPendingIntent)
            .setLargeIcon(metadataModel.largeIcon)

        notificationActions.forEachIndexed { index, model ->
            val actionPendingIntent = PendingIntent.getService(
                this,
                REQUEST_CODE_TRANSPORT_BASE + index,
                Intent(this, LegatoPlaybackService::class.java).apply {
                    action = model.intentAction
                },
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
            builder.addAction(
                Notification.Action.Builder(
                    iconForAction(model.intentAction),
                    model.label,
                    actionPendingIntent,
                ).build(),
            )
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            val compactIndexes = IntArray(minOf(notificationActions.size, MAX_COMPACT_ACTIONS)) { it }
            builder.setStyle(
                Notification.MediaStyle()
                    .setMediaSession(mediaSession?.sessionToken)
                    .setShowActionsInCompactView(*compactIndexes),
            )
        }

        return builder.build()
    }

    private fun syncMediaSessionPlaybackState(state: LegatoAndroidPlaybackState) {
        val snapshot = coordinator.core.playerEngine.getSnapshot()
        val capabilities = LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot)
        val projectedState = projectMediaSessionPlaybackState(
            state = state,
            snapshotPositionMs = snapshot.positionMs,
            activeTrackId = currentNowPlayingMetadata?.trackId ?: snapshot.currentTrack?.id,
            previousProjection = lastMediaSessionProjection,
        )
        val playbackState = PlaybackState.Builder()
            .setActions(LegatoPlaybackNotificationTransport.playbackStateActionsFor(state, capabilities))
            .setState(
                projectedState.playbackStateCode,
                projectedState.positionMs,
                projectedState.playbackSpeed,
            )
            .build()
        lastMediaSessionProjection = projectedState
        mediaSession?.setPlaybackState(playbackState)
    }

    private fun syncMediaSessionMetadata(metadata: LegatoAndroidNowPlayingMetadata?, artwork: Bitmap?): Boolean {
        val mediaMetadata = MediaMetadata.Builder().apply {
            metadata?.title?.takeIf { it.isNotBlank() }?.let {
                putString(MediaMetadata.METADATA_KEY_TITLE, it)
            }
            metadata?.artist?.takeIf { it.isNotBlank() }?.let {
                putString(MediaMetadata.METADATA_KEY_ARTIST, it)
            }
            metadata?.album?.takeIf { it.isNotBlank() }?.let {
                putString(MediaMetadata.METADATA_KEY_ALBUM, it)
            }
            metadata?.durationMs?.let {
                putLong(MediaMetadata.METADATA_KEY_DURATION, it)
            }
            artwork?.let {
                putBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART, it)
                putBitmap(MediaMetadata.METADATA_KEY_ART, it)
                putBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON, it)
            }
        }.build()
        val session = mediaSession ?: return false
        session.setMetadata(mediaMetadata)
        return true
    }

    private fun iconForAction(action: String): Int {
        return when (action) {
            LegatoPlaybackNotificationTransport.ACTION_PLAY -> android.R.drawable.ic_media_play
            LegatoPlaybackNotificationTransport.ACTION_PAUSE -> android.R.drawable.ic_media_pause
            LegatoPlaybackNotificationTransport.ACTION_NEXT -> android.R.drawable.ic_media_next
            LegatoPlaybackNotificationTransport.ACTION_PREVIOUS -> android.R.drawable.ic_media_previous
            else -> android.R.drawable.ic_media_play
        }
    }

    private fun dispatchNotificationRemoteCommand(command: io.legato.core.core.LegatoAndroidRemoteCommand) {
        when (command) {
            io.legato.core.core.LegatoAndroidRemoteCommand.Play -> coordinator.core.mediaSessionBridge.dispatchMediaSessionPlay()
            io.legato.core.core.LegatoAndroidRemoteCommand.Pause -> coordinator.core.mediaSessionBridge.dispatchMediaSessionPause()
            io.legato.core.core.LegatoAndroidRemoteCommand.Next -> coordinator.core.mediaSessionBridge.dispatchMediaSessionSkipToNext()
            io.legato.core.core.LegatoAndroidRemoteCommand.Previous -> coordinator.core.mediaSessionBridge.dispatchMediaSessionSkipToPrevious()
            is io.legato.core.core.LegatoAndroidRemoteCommand.Seek -> {
                coordinator.core.mediaSessionBridge.dispatchMediaSessionSeekTo(command.positionMs)
            }
        }
    }

    companion object {
        internal const val EXTRA_SERVICE_MODE: String = "legato.service_mode"
        private const val CHANNEL_ID: String = "legato.playback"
        private const val CHANNEL_NAME: String = "Legato playback"
        private const val NOTIFICATION_ID: Int = 4242
        private const val REQUEST_CODE_OPEN_APP: Int = 1001
        private const val REQUEST_CODE_TRANSPORT_BASE: Int = 1002
        private const val MAX_COMPACT_ACTIONS: Int = 3
        private const val MEDIA_SESSION_TAG: String = "legato.playback"
    }
}

internal fun <C, R> resolveOnCreateDependency(contextProvider: () -> C, resolver: (C) -> R): R {
    return resolver(contextProvider())
}

internal data class MediaSessionPlaybackProjection(
    val playbackStateCode: Int,
    val positionMs: Long,
    val playbackSpeed: Float,
    val activeTrackId: String?,
)

internal fun projectMediaSessionPlaybackState(
    state: LegatoAndroidPlaybackState,
    snapshotPositionMs: Long,
    activeTrackId: String?,
    previousProjection: MediaSessionPlaybackProjection?,
): MediaSessionPlaybackProjection {
    val playbackStateCode = when (state) {
        LegatoAndroidPlaybackState.PLAYING -> PlaybackState.STATE_PLAYING

        LegatoAndroidPlaybackState.BUFFERING,
        LegatoAndroidPlaybackState.LOADING,
        -> PlaybackState.STATE_BUFFERING

        LegatoAndroidPlaybackState.PAUSED,
        LegatoAndroidPlaybackState.READY,
        -> PlaybackState.STATE_PAUSED

        LegatoAndroidPlaybackState.ENDED,
        LegatoAndroidPlaybackState.IDLE,
        LegatoAndroidPlaybackState.ERROR,
        -> PlaybackState.STATE_STOPPED
    }
    val playbackSpeed = if (state == LegatoAndroidPlaybackState.PLAYING) {
        1f
    } else {
        0f
    }
    val projectedPositionMs = when {
        shouldResetProjectionForTrackTransition(state, activeTrackId, previousProjection) -> 0L
        shouldClampProjectionRewind(state, activeTrackId, snapshotPositionMs, previousProjection) -> {
            previousProjection?.positionMs ?: snapshotPositionMs
        }

        else -> snapshotPositionMs
    }

    return MediaSessionPlaybackProjection(
        playbackStateCode = playbackStateCode,
        positionMs = projectedPositionMs,
        playbackSpeed = playbackSpeed,
        activeTrackId = activeTrackId,
    )
}

private const val MAX_MEDIA_SESSION_REWIND_JITTER_MS: Long = 1_500L

internal fun shouldResetProjectionForTrackTransition(
    state: LegatoAndroidPlaybackState,
    activeTrackId: String?,
    previousProjection: MediaSessionPlaybackProjection?,
): Boolean {
    if (state != LegatoAndroidPlaybackState.BUFFERING && state != LegatoAndroidPlaybackState.LOADING) {
        return false
    }

    val previousTrackId = previousProjection?.activeTrackId ?: return false
    return activeTrackId != null && activeTrackId != previousTrackId
}

internal fun shouldClampProjectionRewind(
    state: LegatoAndroidPlaybackState,
    activeTrackId: String?,
    snapshotPositionMs: Long,
    previousProjection: MediaSessionPlaybackProjection?,
): Boolean {
    if (state != LegatoAndroidPlaybackState.PLAYING && state != LegatoAndroidPlaybackState.BUFFERING) {
        return false
    }

    val previous = previousProjection ?: return false
    if (activeTrackId == null || previous.activeTrackId != activeTrackId) {
        return false
    }

    if (snapshotPositionMs >= previous.positionMs) {
        return false
    }

    val rewindDelta = previous.positionMs - snapshotPositionMs
    return rewindDelta <= MAX_MEDIA_SESSION_REWIND_JITTER_MS
}

internal data class ArtworkRequestToken(
    val requestId: Long,
    val trackId: String,
    val artworkUrl: String,
) {
    fun matches(requestId: Long, trackId: String, artworkUrl: String): Boolean {
        return this.requestId == requestId && this.trackId == trackId && this.artworkUrl == artworkUrl
    }
}

internal fun currentArtworkRequestKey(metadata: LegatoAndroidNowPlayingMetadata?): String? {
    val artworkUrl = metadata?.artwork?.takeIf { it.isNotBlank() } ?: return null
    return "${metadata.trackId}|$artworkUrl"
}

internal fun shouldApplyArtworkResult(
    activeToken: ArtworkRequestToken?,
    completedToken: ArtworkRequestToken,
    activeMetadata: LegatoAndroidNowPlayingMetadata?,
): Boolean {
    val activeKey = currentArtworkRequestKey(activeMetadata) ?: return false
    val completedKey = "${completedToken.trackId}|${completedToken.artworkUrl}"
    return activeToken?.matches(
        requestId = completedToken.requestId,
        trackId = completedToken.trackId,
        artworkUrl = completedToken.artworkUrl,
    ) == true && activeKey == completedKey
}

internal fun interface LegatoPlaybackArtworkLoader {
    suspend fun load(artworkUrl: String): ArtworkLoadResult
}

internal object DefaultLegatoPlaybackArtworkLoader : LegatoPlaybackArtworkLoader {
    override suspend fun load(artworkUrl: String): ArtworkLoadResult = withContext(Dispatchers.IO) {
        val stream = runCatching { URL(artworkUrl).openStream() }
            .getOrElse { error -> return@withContext ArtworkLoadResult.FetchFailure(error) }

        stream.use {
            val bitmap = BitmapFactory.decodeStream(it)
            if (bitmap != null) {
                ArtworkLoadResult.Success(bitmap)
            } else {
                ArtworkLoadResult.DecodeFailure
            }
        }
    }
}

internal sealed interface ArtworkLoadResult {
    data class Success(val bitmap: Bitmap) : ArtworkLoadResult

    data class FetchFailure(val error: Throwable) : ArtworkLoadResult

    data object DecodeFailure : ArtworkLoadResult
}

internal interface LegatoPlaybackArtworkDiagnostics {
    fun record(stage: String, outcome: String, token: ArtworkRequestToken, detail: String)
}

internal object AndroidLogcatArtworkDiagnostics : LegatoPlaybackArtworkDiagnostics {
    override fun record(stage: String, outcome: String, token: ArtworkRequestToken, detail: String) {
        Log.d(
            ARTWORK_DIAGNOSTICS_TAG,
            "event=artwork stage=$stage outcome=$outcome requestId=${token.requestId} trackId=${token.trackId} detail=$detail",
        )
    }

    private const val ARTWORK_DIAGNOSTICS_TAG: String = "LegatoArtwork"
}

internal class ArtworkRequestTokenFactory(
    initialRequestId: Long = 0L,
) {
    private var counter: Long = initialRequestId

    fun next(trackId: String, artworkUrl: String): ArtworkRequestToken {
        counter += 1L
        return ArtworkRequestToken(
            requestId = counter,
            trackId = trackId,
            artworkUrl = artworkUrl,
        )
    }
}
