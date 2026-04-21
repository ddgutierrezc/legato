package io.legato.capacitor

import android.app.Service
import android.content.Intent
import android.os.IBinder

/**
 * Milestone 1 groundwork service stub.
 *
 * This class intentionally avoids Media3/session/runtime wiring for now and only
 * exists to anchor manifest + contract identity with a concrete Android Service.
 */
class LegatoPlaybackService : Service() {
    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Non-production placeholder: foreground notification + transport runtime are pending.
        stopSelfResult(startId)
        return START_NOT_STICKY
    }
}
