package io.legato.capacitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.os.Build
import android.os.IBinder
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidServiceMode
import io.legato.core.queue.LegatoAndroidTransportCapabilitiesProjector
import io.legato.core.remote.LegatoAndroidMediaSessionBridge

class LegatoPlaybackService : Service() {
    private lateinit var coordinator: LegatoAndroidPlaybackCoordinator
    private var modeListenerId: Long? = null
    private var playbackStateListenerId: Long? = null
    private var foregroundActive: Boolean = false
    private var currentMode: LegatoAndroidServiceMode = LegatoAndroidServiceMode.OFF
    private var currentPlaybackState: LegatoAndroidPlaybackState = LegatoAndroidPlaybackState.IDLE
    private var mediaSession: MediaSession? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        coordinator = LegatoAndroidPlaybackCoordinatorStore.getOrCreate(applicationContext)
        currentMode = coordinator.currentServiceMode()
        currentPlaybackState = coordinator.currentPlaybackState()
        modeListenerId = coordinator.addServiceModeListener(::onServiceModeChanged)
        playbackStateListenerId = coordinator.addPlaybackStateListener(::onPlaybackStateChanged)

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
        if (foregroundActive && currentMode != LegatoAndroidServiceMode.OFF) {
            val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            notificationManager.notify(NOTIFICATION_ID, buildNotification(currentMode))
        }
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

        val contentText = when (mode) {
            LegatoAndroidServiceMode.PLAYBACK_ACTIVE -> "Playback active"
            LegatoAndroidServiceMode.RESUME_PENDING_INTERRUPTION -> "Paused by interruption"
            LegatoAndroidServiceMode.OFF -> "Idle"
        }

        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Notification.Builder(this, CHANNEL_ID)
        } else {
            Notification.Builder(this)
        }

        builder
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("Legato Playback")
            .setContentText(contentText)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setCategory(Notification.CATEGORY_TRANSPORT)
            .setContentIntent(launchPendingIntent)

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
        val capabilities = LegatoAndroidTransportCapabilitiesProjector.fromSnapshot(coordinator.core.playerEngine.getSnapshot())
        val playbackState = PlaybackState.Builder()
            .setActions(LegatoPlaybackNotificationTransport.playbackStateActionsFor(state, capabilities))
            .setState(
                when (state) {
                    LegatoAndroidPlaybackState.PLAYING,
                    LegatoAndroidPlaybackState.BUFFERING,
                    -> PlaybackState.STATE_PLAYING

                    LegatoAndroidPlaybackState.PAUSED,
                    LegatoAndroidPlaybackState.READY,
                    -> PlaybackState.STATE_PAUSED

                    LegatoAndroidPlaybackState.LOADING -> PlaybackState.STATE_BUFFERING
                    LegatoAndroidPlaybackState.ENDED,
                    LegatoAndroidPlaybackState.IDLE,
                    LegatoAndroidPlaybackState.ERROR,
                    -> PlaybackState.STATE_STOPPED
                },
                0L,
                if (state == LegatoAndroidPlaybackState.PLAYING || state == LegatoAndroidPlaybackState.BUFFERING) {
                    1f
                } else {
                    0f
                },
            )
            .build()
        mediaSession?.setPlaybackState(playbackState)
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
