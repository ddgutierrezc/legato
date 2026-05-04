package expo.modules.legato

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LegatoModule : Module() {
  private val core = LegatoAndroidCoreFactory.make()
  private var observing = false

  override fun definition() = ModuleDefinition {
    Name("Legato")

    Events(
      "playback-state-changed",
      "playback-active-track-changed",
      "playback-queue-changed",
      "playback-progress",
      "playback-ended",
      "playback-error",
      "remote-play",
      "remote-pause",
      "remote-next",
      "remote-previous",
      "remote-seek"
    )

    Function("setup") { options: Map<String, Any?>? ->
      core.player.setup(options ?: emptyMap<String, Any?>())
      mapOf("ok" to true)
    }

    Function("add") { options: Map<String, Any?> ->
      val snapshot = core.player.add(options)
      mapOf("snapshot" to snapshot)
    }

    Function("remove") { options: Map<String, Any?> ->
      val snapshot = core.player.remove(resolveRemovalOptions(options))
      mapOf("snapshot" to snapshot)
    }

    Function("reset") {
      val snapshot = core.player.reset()
      mapOf("snapshot" to snapshot)
    }

    Function("play") {
      core.player.play()
      mapOf("ok" to true)
    }

    Function("pause") {
      core.player.pause()
      mapOf("ok" to true)
    }

    Function("stop") {
      core.player.stop()
      mapOf("ok" to true)
    }

    Function("seekTo") { options: Map<String, Any?> ->
      val position = (options["position"] as? Number)?.toLong()
        ?: throw CodedException("seekTo.position is required")
      core.player.seekTo(position)
      mapOf("ok" to true)
    }

    Function("skipTo") { options: Map<String, Any?> ->
      val index = (options["index"] as? Number)?.toInt()
        ?: throw CodedException("skipTo.index is required")
      val snapshot = core.player.skipTo(index)
      mapOf("snapshot" to snapshot)
    }

    Function("skipToNext") {
      core.player.skipToNext()
      mapOf("ok" to true)
    }

    Function("skipToPrevious") {
      core.player.skipToPrevious()
      mapOf("ok" to true)
    }

    Function("getState") {
      mapOf("state" to core.player.snapshot()["state"])
    }

    Function("getPosition") {
      core.player.position()
    }

    Function("getDuration") {
      core.player.duration()
    }

    Function("getCurrentTrack") {
      core.player.currentTrack()
    }

    Function("getQueue") {
      core.player.queue()
    }

    Function("getSnapshot") {
      mapOf("snapshot" to core.player.snapshot())
    }

    Function("getCapabilities") {
      mapOf("supported" to core.player.capabilities())
    }

    Function("removeAllListeners") {
      core.events.removeAllListeners()
    }

    OnStartObserving {
      if (observing) return@OnStartObserving
      observing = true
      core.events.startForwarding { eventName, payload ->
        sendEvent(eventName, payload)
      }
    }

    OnStopObserving {
      observing = false
      core.events.stopForwarding()
    }
  }

  private fun resolveRemovalOptions(options: Map<String, Any?>): Map<String, Any?> {
    if (options["index"] != null) {
      return options
    }

    val id = (options["id"] as? String)?.trim().orEmpty()
    if (id.isEmpty()) {
      throw CodedException("remove requires index or id")
    }

    val index = core.player.resolveQueueIndexById(id)
    if (index < 0) {
      throw CodedException("remove.id was not found in queue")
    }

    return mapOf("index" to index)
  }
}
