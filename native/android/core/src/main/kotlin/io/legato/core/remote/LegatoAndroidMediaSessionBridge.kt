package io.legato.core.remote

import io.legato.core.core.LegatoAndroidNowPlayingMetadata
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidProgressUpdate
import io.legato.core.core.LegatoAndroidRemoteCommand
import io.legato.core.core.LegatoAndroidTransportCapabilities
import io.legato.core.session.LegatoAndroidAudioFocusPolicy
import io.legato.core.session.LegatoAndroidInterruptionSignal
import io.legato.core.session.LegatoAndroidSessionDefaults
import io.legato.core.session.LegatoAndroidSessionRuntime

/**
 * Shared Android foundation runtime for MediaSession parity work.
 *
 * This bridge is intentionally minimal for v1 foundation:
 * - Session side: receives projected state/metadata/progress from the engine.
 * - Remote side: forwards platform transport callbacks into the engine listener.
 *
 * Concrete MediaSession wiring (platform callbacks + notification actions) is added
 * by follow-up Android runtime tasks while preserving this shared seam.
 */
class LegatoAndroidMediaSessionBridge : LegatoAndroidSessionRuntime, LegatoAndroidRemoteCommandRuntime {
    enum class TransportControl {
        PLAY,
        PAUSE,
    }

    private var interruptionListener: ((LegatoAndroidInterruptionSignal) -> Unit)? = null
    private var remoteDispatch: ((LegatoAndroidRemoteCommand) -> Unit)? = null

    internal var lastPlaybackState: LegatoAndroidPlaybackState? = null
        private set

    internal var lastNowPlayingMetadata: LegatoAndroidNowPlayingMetadata? = null
        private set

    internal var lastProgress: LegatoAndroidProgressUpdate? = null
        private set

    internal var lastTransportCapabilities: LegatoAndroidTransportCapabilities =
        LegatoAndroidTransportCapabilities(canSkipNext = false, canSkipPrevious = false, canSeek = false)
        private set

    override fun configureSession() {
        // Foundation-only: concrete MediaSession object wiring is deferred.
    }

    override fun audioFocusPolicy(): LegatoAndroidAudioFocusPolicy =
        LegatoAndroidSessionDefaults.MILESTONE1_AUDIO_FOCUS_POLICY

    override fun setInterruptionListener(listener: ((LegatoAndroidInterruptionSignal) -> Unit)?) {
        interruptionListener = listener
    }

    override fun onInterruption(signal: LegatoAndroidInterruptionSignal) {
        interruptionListener?.invoke(signal)
    }

    override fun updatePlaybackState(state: LegatoAndroidPlaybackState) {
        lastPlaybackState = state
    }

    override fun updateTransportCapabilities(capabilities: LegatoAndroidTransportCapabilities) {
        lastTransportCapabilities = capabilities
    }

    override fun updateNowPlayingMetadata(metadata: LegatoAndroidNowPlayingMetadata?) {
        lastNowPlayingMetadata = metadata
    }

    override fun updateProgress(progress: LegatoAndroidProgressUpdate) {
        lastProgress = progress
    }

    override fun releaseSession() {
        interruptionListener = null
    }

    override fun bind(dispatch: (LegatoAndroidRemoteCommand) -> Unit) {
        remoteDispatch = dispatch
    }

    override fun unbind() {
        remoteDispatch = null
    }

    fun projectedTransportControl(): TransportControl {
        val state = lastPlaybackState
        return if (state == LegatoAndroidPlaybackState.PLAYING || state == LegatoAndroidPlaybackState.BUFFERING) {
            TransportControl.PAUSE
        } else {
            TransportControl.PLAY
        }
    }

    fun dispatchProjectedTransportControl() {
        when (projectedTransportControl()) {
            TransportControl.PLAY -> remoteDispatch?.invoke(LegatoAndroidRemoteCommand.Play)
            TransportControl.PAUSE -> remoteDispatch?.invoke(LegatoAndroidRemoteCommand.Pause)
        }
    }

    fun dispatchMediaSessionPlay() {
        remoteDispatch?.invoke(LegatoAndroidRemoteCommand.Play)
    }

    fun dispatchMediaSessionPause() {
        remoteDispatch?.invoke(LegatoAndroidRemoteCommand.Pause)
    }

    fun dispatchMediaSessionSkipToNext() {
        remoteDispatch?.invoke(LegatoAndroidRemoteCommand.Next)
    }

    fun dispatchMediaSessionSkipToPrevious() {
        remoteDispatch?.invoke(LegatoAndroidRemoteCommand.Previous)
    }

    fun dispatchMediaSessionSeekTo(positionMs: Long) {
        if (!lastTransportCapabilities.canSeek) {
            return
        }
        remoteDispatch?.invoke(LegatoAndroidRemoteCommand.Seek(positionMs))
    }

    fun dispatchTransportControl(control: TransportControl) {
        when (control) {
            TransportControl.PLAY -> dispatchMediaSessionPlay()
            TransportControl.PAUSE -> dispatchMediaSessionPause()
        }
    }

    internal fun dispatchRemoteCommandForTesting(command: LegatoAndroidRemoteCommand) {
        remoteDispatch?.invoke(command)
    }
}
