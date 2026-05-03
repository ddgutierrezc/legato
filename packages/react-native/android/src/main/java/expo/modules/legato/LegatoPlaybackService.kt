package expo.modules.legato

import android.app.Service
import android.content.Intent
import android.os.IBinder

class LegatoPlaybackService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null
}
