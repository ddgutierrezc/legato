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
import io.legato.core.remote.LegatoAndroidMediaSessionBridge

class LegatoPlaybackService : Service() {
    private val coordinator = LegatoAndroidPlaybackCoordinatorStore.getOrCreate()
    private var modeListenerId: Long? = null
    private var playbackStateListenerId: Long? = null
    private var foregroundActive: Boolean = false
    private var currentMode: LegatoAndroidServiceMode = coordinator.currentServiceMode()
    private var currentPlaybackState: LegatoAndroidPlaybackState = coordinator.currentPlaybackState()
    private var mediaSession: MediaSession? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
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
                },
            )
            setFlags(MediaSession.FLAG_HANDLES_MEDIA_BUTTONS or MediaSession.FLAG_HANDLES_TRANSPORT_CONTROLS)
            isActive = true
        }
        syncMediaSessionPlaybackState(currentPlaybackState)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        LegatoPlaybackNotificationTransport.transportControlFromIntentAction(intent?.action)
            ?.let { control ->
                coordinator.core.mediaSessionBridge.dispatchTransportControl(control)
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

        val projectedControl = LegatoPlaybackNotificationTransport.projectedControlFor(currentPlaybackState)
        val transportPendingIntent = PendingIntent.getService(
            this,
            REQUEST_CODE_TRANSPORT,
            Intent(this, LegatoPlaybackService::class.java).apply {
                action = when (projectedControl) {
                    LegatoAndroidMediaSessionBridge.TransportControl.PLAY -> LegatoPlaybackNotificationTransport.ACTION_PLAY
                    LegatoAndroidMediaSessionBridge.TransportControl.PAUSE -> LegatoPlaybackNotificationTransport.ACTION_PAUSE
                }
            },
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
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
            .addAction(
                Notification.Action.Builder(
                    if (projectedControl == LegatoAndroidMediaSessionBridge.TransportControl.PAUSE) {
                        android.R.drawable.ic_media_pause
                    } else {
                        android.R.drawable.ic_media_play
                    },
                    if (projectedControl == LegatoAndroidMediaSessionBridge.TransportControl.PAUSE) "Pause" else "Play",
                    transportPendingIntent,
                ).build(),
            )

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            builder.setStyle(
                Notification.MediaStyle()
                    .setMediaSession(mediaSession?.sessionToken)
                    .setShowActionsInCompactView(0),
            )
        }

        return builder.build()
    }

    private fun syncMediaSessionPlaybackState(state: LegatoAndroidPlaybackState) {
        val playbackState = PlaybackState.Builder()
            .setActions(PlaybackState.ACTION_PLAY or PlaybackState.ACTION_PAUSE)
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

    companion object {
        internal const val EXTRA_SERVICE_MODE: String = "legato.service_mode"
        private const val CHANNEL_ID: String = "legato.playback"
        private const val CHANNEL_NAME: String = "Legato playback"
        private const val NOTIFICATION_ID: Int = 4242
        private const val REQUEST_CODE_OPEN_APP: Int = 1001
        private const val REQUEST_CODE_TRANSPORT: Int = 1002
        private const val MEDIA_SESSION_TAG: String = "legato.playback"
    }
}
