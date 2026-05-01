package io.legato.capacitor

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import io.legato.core.core.LegatoAndroidError
import io.legato.core.core.LegatoAndroidEventPayload
import io.legato.core.core.LegatoAndroidHeaderGroup
import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidSetupOptions
import io.legato.core.core.LegatoAndroidTransportCapabilities
import io.legato.core.core.LegatoAndroidTrack
import io.legato.core.core.LegatoAndroidTrackType
import org.json.JSONArray
import org.json.JSONObject

internal class LegatoCapacitorMapper {
    private val alwaysSupportedCapabilities = listOf("play", "pause", "stop")

    fun tracksFromJs(array: JSArray?): List<LegatoAndroidTrack> {
        if (array == null) {
            return emptyList()
        }

        return buildList {
            for (index in 0 until array.length()) {
                val raw = array.opt(index)
                val trackJson = when (raw) {
                    is JSObject -> raw
                    is JSONObject -> JSObject.fromJSONObject(raw)
                    else -> JSObject()
                }
                add(trackFromJs(trackJson))
            }
        }
    }

    fun trackFromJs(track: JSObject): LegatoAndroidTrack {
        return trackFromMap(anyMapFromJson(track))
    }

    fun setupOptionsFromJs(options: JSObject?): LegatoAndroidSetupOptions {
        return setupOptionsFromMap(options?.let(::anyMapFromJson))
    }

    fun snapshotToJs(snapshot: LegatoAndroidPlaybackSnapshot): JSObject {
        return JSObject().apply {
            put("state", snapshot.state.wireValue)
            put("currentTrack", snapshot.currentTrack?.let(::trackToJs))
            put("currentIndex", snapshot.currentIndex)
            put("position", snapshot.positionMs)
            put("duration", snapshot.durationMs)
            put("bufferedPosition", snapshot.bufferedPositionMs)
            put("queue", queueToJs(snapshot.queue))
        }
    }

    fun queueToJs(queue: io.legato.core.core.LegatoAndroidQueueSnapshot): JSObject {
        return queueToJs(queue.items.map(::trackToJs), queue.currentIndex)
    }

    fun trackToJs(track: LegatoAndroidTrack): JSObject {
        val payload = trackToPublicMap(track)
        return JSObject().apply {
            put("id", payload["id"])
            put("url", payload["url"])
            put("title", payload["title"])
            put("artist", payload["artist"])
            put("album", payload["album"])
            put("artwork", payload["artwork"])
            put("duration", payload["duration"])
            put(
                "headers",
                JSObject().apply {
                    @Suppress("UNCHECKED_CAST")
                    (payload["headers"] as Map<String, String>).forEach { (key, value) ->
                        put(key, value)
                    }
                },
            )
            put("headerGroupId", payload["headerGroupId"])
            put("type", payload["type"])
        }
    }

    fun errorToJs(error: LegatoAndroidError): JSObject {
        return JSObject().apply {
            put("code", error.code.wireValue)
            put("message", error.message)
            put("details", error.details?.toString())
        }
    }

    fun supportedCapabilitiesFromTransport(capabilities: LegatoAndroidTransportCapabilities): List<String> {
        val supported = alwaysSupportedCapabilities.toMutableList()
        if (capabilities.canSeek) {
            supported += "seek"
        }
        if (capabilities.canSkipNext) {
            supported += "skip-next"
        }
        if (capabilities.canSkipPrevious) {
            supported += "skip-previous"
        }
        return supported
    }

    fun capabilitiesToJs(supported: List<String>): JSObject {
        val jsSupported = JSArray()
        supported.forEach(jsSupported::put)
        return JSObject().apply {
            put("supported", jsSupported)
        }
    }

    fun eventPayloadToJs(payload: LegatoAndroidEventPayload?): JSObject {
        if (payload == null) {
            return JSObject()
        }

        return when (payload) {
            is LegatoAndroidEventPayload.PlaybackStateChanged -> JSObject().apply {
                put("state", payload.state.wireValue)
            }

            is LegatoAndroidEventPayload.ActiveTrackChanged -> JSObject().apply {
                put("track", payload.track?.let(::trackToJs))
                put("index", payload.index)
            }

            is LegatoAndroidEventPayload.QueueChanged -> JSObject().apply {
                put("queue", queueToJs(payload.queue.items.map(::trackToJs), payload.queue.currentIndex))
            }

            is LegatoAndroidEventPayload.PlaybackProgress -> JSObject().apply {
                put("position", payload.positionMs)
                put("duration", payload.durationMs)
                put("bufferedPosition", payload.bufferedPositionMs)
            }

            is LegatoAndroidEventPayload.PlaybackEnded -> JSObject().apply {
                put("snapshot", snapshotToJs(payload.snapshot))
            }

            is LegatoAndroidEventPayload.PlaybackInterruption -> JSObject().apply {
                put("reason", payload.reason.wireValue)
                put("resumable", payload.resumable)
            }

            is LegatoAndroidEventPayload.PlaybackError -> JSObject().apply {
                put("error", errorToJs(payload.error))
            }

            LegatoAndroidEventPayload.RemotePlay,
            LegatoAndroidEventPayload.RemotePause,
            LegatoAndroidEventPayload.RemoteNext,
            LegatoAndroidEventPayload.RemotePrevious,
            -> JSObject()

            is LegatoAndroidEventPayload.RemoteSeek -> JSObject().apply {
                put("position", payload.positionMs)
            }
        }
    }

    private fun queueToJs(items: List<JSObject>, currentIndex: Int?): JSObject {
        val jsItems = JSArray()
        items.forEach(jsItems::put)

        return JSObject().apply {
            put("items", jsItems)
            put("currentIndex", currentIndex)
        }
    }

    private fun mapOfStringString(value: Any?): Map<String, String> {
        val json = when (value) {
            is JSObject -> value
            is JSONObject -> JSObject.fromJSONObject(value)
            else -> null
        } ?: return emptyMap()

        return json.keys().asSequence().associateWith { key ->
            json.optString(key)
        }
    }

    private fun trackTypeFromWire(value: String): LegatoAndroidTrackType? {
        return LegatoAndroidTrackType.entries.firstOrNull { it.wireValue == value }
    }

    private fun anyToLong(value: Any?): Long? {
        return when (value) {
            is Int -> value.toLong()
            is Long -> value
            is Float -> value.toLong()
            is Double -> value.toLong()
            is Number -> value.toLong()
            is String -> value.toLongOrNull()
            else -> null
        }
    }
}

internal fun trackFromMap(track: Map<String, Any?>): LegatoAndroidTrack {
    val trackType = coerceOptionalString(track["type"])?.let(::trackTypeFromWire)
    return LegatoAndroidTrack(
        id = coerceOptionalString(track["id"]).orEmpty(),
        url = coerceOptionalString(track["url"]).orEmpty(),
        title = coerceOptionalString(track["title"]),
        artist = coerceOptionalString(track["artist"]),
        album = coerceOptionalString(track["album"]),
        artwork = coerceOptionalString(track["artwork"]),
        durationMs = anyToLong(track["duration"]),
        headers = mapOfStringStringAny(track["headers"]),
        headerGroupId = coerceOptionalString(track["headerGroupId"]),
        type = trackType,
    )
}

internal fun setupOptionsFromMap(options: Map<String, Any?>?): LegatoAndroidSetupOptions {
    if (options == null) {
        return LegatoAndroidSetupOptions()
    }
    val groups = coerceList(options["headerGroups"]).mapNotNull { item ->
        val group = anyMap(item) ?: return@mapNotNull null
        val id = coerceOptionalString(group["id"]) ?: return@mapNotNull null
        LegatoAndroidHeaderGroup(id = id, headers = mapOfStringStringAny(group["headers"]))
    }
    return LegatoAndroidSetupOptions(headerGroups = groups)
}

internal fun trackToPublicMap(track: LegatoAndroidTrack): Map<String, Any?> {
    return mapOf(
        "id" to track.id,
        "url" to track.url,
        "title" to track.title,
        "artist" to track.artist,
        "album" to track.album,
        "artwork" to track.artwork,
        "duration" to track.durationMs,
        "headers" to track.headers,
        "headerGroupId" to track.headerGroupId,
        "type" to track.type?.wireValue,
    )
}

private fun anyMapFromJson(value: JSONObject): Map<String, Any?> {
    return value.keys().asSequence().associateWith { key -> value.opt(key) }
}

private fun anyMap(value: Any?): Map<String, Any?>? {
    return when (value) {
        is Map<*, *> -> value.entries.associate { (k, v) -> k.toString() to v }
        is JSObject -> anyMapFromJson(value)
        is JSONObject -> anyMapFromJson(value)
        else -> null
    }
}

private fun coerceList(value: Any?): List<Any?> {
    return when (value) {
        is List<*> -> value
        is JSArray -> List(value.length()) { index -> value.opt(index) }
        is JSONArray -> List(value.length()) { index -> value.opt(index) }
        else -> emptyList()
    }
}

private fun mapOfStringStringAny(value: Any?): Map<String, String> {
    val map = anyMap(value) ?: return emptyMap()
    return map.entries.associate { (key, raw) -> key to (coerceOptionalString(raw) ?: "") }
}

private fun trackTypeFromWire(value: String): LegatoAndroidTrackType? {
    return LegatoAndroidTrackType.entries.firstOrNull { it.wireValue == value }
}

private fun anyToLong(value: Any?): Long? {
    return when (value) {
        is Int -> value.toLong()
        is Long -> value
        is Float -> value.toLong()
        is Double -> value.toLong()
        is Number -> value.toLong()
        is String -> value.toLongOrNull()
        else -> null
    }
}

internal fun coerceOptionalString(rawValue: Any?): String? {
    val value = rawValue ?: return null
    if (value == JSONObject.NULL) {
        return null
    }
    return value.toString()
}
