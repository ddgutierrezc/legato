package io.legato.capacitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaMetadata
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import android.util.Log
import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidServiceMode
import io.legato.core.core.LegatoAndroidTrack
import io.legato.core.queue.LegatoAndroidTransportCapabilitiesProjector
import io.legato.core.session.LegatoAndroidInterruptionSignal
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
    private var foregroundMode: LegatoAndroidServiceMode? = null
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
    private var audioManager: AudioManager? = null
    private var audioFocusListener: AudioManager.OnAudioFocusChangeListener? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var hasAudioFocus: Boolean = false
    private var noisyReceiver: BroadcastReceiver? = null
    private var noisyReceiverRegistered: Boolean = false

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
            setFlags(legacyMediaSessionFlags())
            isActive = true
        }
        syncMediaSessionPlaybackState()
        publishNowPlayingSurfaces()
        refreshArtworkFor(currentNowPlayingMetadata)
        setupInterruptionIngestion()
        reconcileAudioFocusForState(currentPlaybackState)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        LegatoPlaybackNotificationTransport.remoteCommandFromIntentAction(intent?.action)
            ?.let { command ->
                dispatchNotificationRemoteCommand(command)
                return START_STICKY
            }

        val intentMode = intent?.getStringExtra(EXTRA_SERVICE_MODE)
            ?.runCatching { LegatoAndroidServiceMode.valueOf(this) }
            ?.getOrNull()
        val startProjection = resolveStartCommandMode(
            intentMode = intentMode,
            coordinatorMode = coordinator.currentServiceMode(),
            currentMode = currentMode,
        )

        onServiceModeChanged(startProjection.mode)
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
        teardownInterruptionIngestion()

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
            val teardown = projectOffTeardown(
                foregroundActive = foregroundActive,
                hasAudioFocus = hasAudioFocus,
            )
            if (teardown.shouldAbandonFocus) {
                abandonAudioFocusIfHeld()
            }
            if (teardown.shouldStopForeground) {
                stopForeground(STOP_FOREGROUND_REMOVE)
                foregroundActive = false
                foregroundMode = null
            }
            if (teardown.shouldStopSelf) {
                stopSelf()
            }
            return
        }

        startForegroundInternal(mode)
    }

    private fun onPlaybackStateChanged(state: LegatoAndroidPlaybackState) {
        currentPlaybackState = state
        syncMediaSessionPlaybackState()
        publishNowPlayingSurfaces()
        reconcileAudioFocusForState(state)
    }

    private fun onNowPlayingMetadataChanged(metadata: LegatoAndroidNowPlayingMetadata?) {
        val previousTrackId = currentNowPlayingMetadata?.trackId
        currentNowPlayingMetadata = metadata
        currentArtworkBitmap = null
        if (previousTrackId != metadata?.trackId) {
            syncMediaSessionPlaybackState()
        }
        publishNowPlayingSurfaces()
        refreshArtworkFor(metadata)
    }

    private fun setupInterruptionIngestion() {
        val manager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager = manager

        val focusListener = AudioManager.OnAudioFocusChangeListener { focusChange ->
            val signal = interruptionSignalFromAudioFocusChange(focusChange) ?: return@OnAudioFocusChangeListener
            coordinator.core.sessionManager.onInterruption(signal)
        }
        audioFocusListener = focusListener
        audioFocusRequest = buildAudioFocusRequest(focusListener)

        if (noisyReceiver == null) {
            noisyReceiver = object : BroadcastReceiver() {
                override fun onReceive(context: Context?, intent: Intent?) {
                    if (intent?.action == AudioManager.ACTION_AUDIO_BECOMING_NOISY) {
                        coordinator.core.sessionManager.onInterruption(
                            LegatoAndroidInterruptionSignal.BecomingNoisy,
                        )
                    }
                }
            }
        }

        if (!noisyReceiverRegistered) {
            registerReceiver(noisyReceiver, IntentFilter(AudioManager.ACTION_AUDIO_BECOMING_NOISY))
            noisyReceiverRegistered = true
        }
    }

    private fun teardownInterruptionIngestion() {
        abandonAudioFocusIfHeld()
        if (noisyReceiverRegistered) {
            runCatching { unregisterReceiver(noisyReceiver) }
            noisyReceiverRegistered = false
        }

        noisyReceiver = null
        audioFocusListener = null
        audioFocusRequest = null
        audioManager = null
    }

    private fun reconcileAudioFocusForState(state: LegatoAndroidPlaybackState) {
        if (state == LegatoAndroidPlaybackState.PLAYING || state == LegatoAndroidPlaybackState.BUFFERING) {
            requestAudioFocusIfNeeded()
        } else {
            abandonAudioFocusIfHeld()
        }
    }

    private fun requestAudioFocusIfNeeded() {
        if (hasAudioFocus) {
            return
        }

        val manager = audioManager ?: return
        val focusRequest = audioFocusRequest
        val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && focusRequest != null) {
            manager.requestAudioFocus(focusRequest) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(
                audioFocusListener,
                AudioManager.STREAM_MUSIC,
                AudioManager.AUDIOFOCUS_GAIN,
            ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
        }
        val projection = projectAudioFocusRequestOutcome(
            requestGranted = granted,
            playbackState = currentPlaybackState,
        )
        hasAudioFocus = projection.hasAudioFocus
        projection.interruptionSignal?.let { signal ->
            Log.w("LegatoPlaybackService", "Audio focus request denied; reason=${projection.reason}")
            coordinator.core.sessionManager.onInterruption(signal)
        }
    }

    private fun abandonAudioFocusIfHeld() {
        if (!hasAudioFocus) {
            return
        }

        val manager = audioManager ?: return
        val abandonResult = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val focusRequest = audioFocusRequest
            if (focusRequest != null) {
                manager.abandonAudioFocusRequest(focusRequest)
            } else {
                AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            }
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(audioFocusListener)
        }
        if (abandonResult != AudioManager.AUDIOFOCUS_REQUEST_GRANTED) {
            Log.w("LegatoPlaybackService", "Audio focus abandon did not report granted result: $abandonResult")
        }
        hasAudioFocus = false
    }

    private fun buildAudioFocusRequest(
        listener: AudioManager.OnAudioFocusChangeListener,
    ): AudioFocusRequest? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return null
        }

        return AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
            .setAcceptsDelayedFocusGain(false)
            .setWillPauseWhenDucked(true)
            .setOnAudioFocusChangeListener(listener)
            .build()
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
        val snapshot = coordinator.core.playerEngine.getSnapshot()
        val reconciledMetadata = reconcileNowPlayingMetadataWithSnapshot(
            snapshotTrack = snapshot.currentTrack,
            observedMetadata = currentNowPlayingMetadata,
        )
        val metadataPublished = syncMediaSessionMetadata(reconciledMetadata, currentArtworkBitmap)
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

        if (foregroundActive && foregroundMode == mode) {
            notificationManager.notify(NOTIFICATION_ID, buildNotification(mode))
            return
        }

        startForeground(NOTIFICATION_ID, buildNotification(mode))
        foregroundActive = true
        foregroundMode = mode
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
            mode = mode,
        )

        val metadataModel = LegatoPlaybackNotificationTransport.notificationMetadataModelFor(
            mode = mode,
            metadata = currentNowPlayingMetadata,
            largeIcon = currentArtworkBitmap,
        )

        val builder = notificationBuilderForSdk(this, Build.VERSION.SDK_INT, CHANNEL_ID)

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
            builder.addAction(notificationActionBuilder(iconForAction(model.intentAction), model.label, actionPendingIntent).build())
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

    private fun syncMediaSessionPlaybackState() {
        val snapshot = coordinator.core.playerEngine.getSnapshot()
        val canonicalState = snapshot.state
        val activeTrackId = resolveActiveTrackIdForProjection(
            snapshotTrackId = snapshot.currentTrack?.id,
            metadataTrackId = currentNowPlayingMetadata?.trackId,
        )
        val capabilities = LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(snapshot)
        val projectedState = projectMediaSessionPlaybackState(
            state = canonicalState,
            snapshotPositionMs = snapshot.positionMs,
            activeTrackId = activeTrackId,
            previousProjection = lastMediaSessionProjection,
        )
        val playbackState = PlaybackState.Builder()
            .setActions(LegatoPlaybackNotificationTransport.playbackStateActionsFor(capabilities))
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

internal fun interruptionSignalFromAudioFocusChange(focusChange: Int): LegatoAndroidInterruptionSignal? {
    return when (focusChange) {
        AudioManager.AUDIOFOCUS_GAIN -> LegatoAndroidInterruptionSignal.AudioFocusGained
        AudioManager.AUDIOFOCUS_LOSS -> LegatoAndroidInterruptionSignal.AudioFocusLost
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> LegatoAndroidInterruptionSignal.AudioFocusLostTransient
        AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> LegatoAndroidInterruptionSignal.AudioFocusLostTransientCanDuck
        else -> null
    }
}

internal fun resolveActiveTrackIdForProjection(
    snapshotTrackId: String?,
    metadataTrackId: String?,
): String? {
    return snapshotTrackId ?: metadataTrackId
}

internal fun reconcileNowPlayingMetadataWithSnapshot(
    snapshotTrack: LegatoAndroidTrack?,
    observedMetadata: LegatoAndroidNowPlayingMetadata?,
): LegatoAndroidNowPlayingMetadata? {
    val track = snapshotTrack ?: return null
    if (observedMetadata?.trackId == track.id) {
        return observedMetadata
    }

    return LegatoAndroidNowPlayingMetadata(
        trackId = track.id,
        title = track.title,
        artist = track.artist,
        album = track.album,
        artwork = track.artwork,
        durationMs = track.durationMs,
    )
}

internal data class AudioFocusRequestOutcome(
    val hasAudioFocus: Boolean,
    val interruptionSignal: LegatoAndroidInterruptionSignal?,
    val reason: String?,
    val pauseForInterruption: Boolean,
)

internal fun projectAudioFocusRequestOutcome(
    requestGranted: Boolean,
    playbackState: LegatoAndroidPlaybackState,
): AudioFocusRequestOutcome {
    if (requestGranted) {
        return AudioFocusRequestOutcome(
            hasAudioFocus = true,
            interruptionSignal = null,
            reason = null,
            pauseForInterruption = false,
        )
    }

    val playingState = playbackState == LegatoAndroidPlaybackState.PLAYING || playbackState == LegatoAndroidPlaybackState.BUFFERING
    return AudioFocusRequestOutcome(
        hasAudioFocus = false,
        interruptionSignal = if (playingState) LegatoAndroidInterruptionSignal.AudioFocusDenied else null,
        reason = if (playingState) "focus-denied" else null,
        pauseForInterruption = playingState,
    )
}

internal data class StartCommandModeProjection(
    val mode: LegatoAndroidServiceMode,
    val shouldStartForeground: Boolean,
    val shouldStopSelf: Boolean,
)

internal data class OffTeardownProjection(
    val shouldAbandonFocus: Boolean,
    val shouldStopForeground: Boolean,
    val shouldStopSelf: Boolean,
)

internal fun resolveStartCommandMode(
    intentMode: LegatoAndroidServiceMode?,
    coordinatorMode: LegatoAndroidServiceMode,
    currentMode: LegatoAndroidServiceMode,
): StartCommandModeProjection {
    val projectedMode = intentMode ?: coordinatorMode
    val shouldStartForeground = projectedMode != LegatoAndroidServiceMode.OFF
    val shouldStopSelf = projectedMode == LegatoAndroidServiceMode.OFF && currentMode == LegatoAndroidServiceMode.OFF
    return StartCommandModeProjection(
        mode = projectedMode,
        shouldStartForeground = shouldStartForeground,
        shouldStopSelf = shouldStopSelf,
    )
}

internal fun projectOffTeardown(
    foregroundActive: Boolean,
    hasAudioFocus: Boolean,
): OffTeardownProjection {
    return OffTeardownProjection(
        shouldAbandonFocus = hasAudioFocus,
        shouldStopForeground = foregroundActive,
        shouldStopSelf = true,
    )
}

internal fun <C, R> resolveOnCreateDependency(contextProvider: () -> C, resolver: (C) -> R): R {
    return resolver(contextProvider())
}

@Suppress("DEPRECATION") // Required while service stays on android.media.session compatibility path.
internal fun legacyMediaSessionFlags(): Int {
    return MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS
}

internal fun notificationBuilderForSdk(context: Context, sdkInt: Int, channelId: String): Notification.Builder {
    return if (sdkInt >= Build.VERSION_CODES.O) {
        Notification.Builder(context, channelId)
    } else {
        notificationBuilderLegacy(context)
    }
}

@Suppress("DEPRECATION") // Pre-O fallback constructor is deprecated by platform API design.
private fun notificationBuilderLegacy(context: Context): Notification.Builder {
    return Notification.Builder(context)
}

@Suppress("DEPRECATION") // Legacy action builder is required for current support floor.
internal fun notificationActionBuilder(
    iconResId: Int,
    label: CharSequence,
    pendingIntent: PendingIntent?,
): Notification.Action.Builder {
    return Notification.Action.Builder(iconResId, label, pendingIntent)
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
