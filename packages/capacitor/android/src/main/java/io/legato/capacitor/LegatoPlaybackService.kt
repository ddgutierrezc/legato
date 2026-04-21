package io.legato.capacitor

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import io.legato.core.core.LegatoAndroidServiceMode

class LegatoPlaybackService : Service() {
    private val coordinator = LegatoAndroidPlaybackCoordinatorStore.getOrCreate()
    private var modeListenerId: Long? = null
    private var foregroundActive: Boolean = false

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        modeListenerId = coordinator.addServiceModeListener(::onServiceModeChanged)
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
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
        if (foregroundActive) {
            stopForeground(STOP_FOREGROUND_REMOVE)
            foregroundActive = false
        }
        super.onDestroy()
    }

    private fun onServiceModeChanged(mode: LegatoAndroidServiceMode) {
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
        val pendingIntent = launchIntent?.let {
            PendingIntent.getActivity(
                this,
                1001,
                it,
                PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
            )
        }

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
            .setContentIntent(pendingIntent)

        return builder.build()
    }

    companion object {
        internal const val EXTRA_SERVICE_MODE: String = "legato.service_mode"
        private const val CHANNEL_ID: String = "legato.playback"
        private const val CHANNEL_NAME: String = "Legato playback"
        private const val NOTIFICATION_ID: Int = 4242
    }
}
