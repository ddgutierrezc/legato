package io.legato.core.remote

import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidRemoteCommand

class LegatoAndroidRemoteCommandManager(
    private val runtime: LegatoAndroidRemoteCommandRuntime = LegatoAndroidNoopRemoteCommandRuntime(),
) {
    private var commandListener: ((LegatoAndroidRemoteCommand) -> Unit)? = null

    fun bind(listener: (LegatoAndroidRemoteCommand) -> Unit) {
        commandListener = listener
        runtime.bind(::dispatch)
    }

    fun updatePlaybackState(state: LegatoAndroidPlaybackState) {
        runtime.updatePlaybackState(state)
    }

    fun unbind() {
        runtime.unbind()
        commandListener = null
    }

    internal fun dispatch(command: LegatoAndroidRemoteCommand) {
        commandListener?.invoke(command)
    }
}
