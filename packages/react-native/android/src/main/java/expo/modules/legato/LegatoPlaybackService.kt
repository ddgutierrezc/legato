package expo.modules.legato

import android.app.Service
import android.content.Intent
import android.os.IBinder

class LegatoPlaybackService : Service() {
  private val core = LegatoAndroidCoreFactory.make()

  override fun onCreate() {
    super.onCreate()
    core.playback.onServiceCreated()
  }

  override fun onDestroy() {
    core.playback.onServiceDestroyed()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}
