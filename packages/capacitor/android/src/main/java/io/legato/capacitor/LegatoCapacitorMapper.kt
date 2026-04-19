package io.legato.capacitor

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import io.legato.core.core.LegatoAndroidError
import io.legato.core.core.LegatoAndroidEventPayload
import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidTrack
import io.legato.core.core.LegatoAndroidTrackType
import org.json.JSONObject

internal class LegatoCapacitorMapper {
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
        val trackType = track.optString("type", null)?.let(::trackTypeFromWire)
        val headers = mapOfStringString(track.opt("headers"))

        return LegatoAndroidTrack(
            id = track.optString("id"),
            url = track.optString("url"),
            title = track.optString("title", null),
            artist = track.optString("artist", null),
            album = track.optString("album", null),
            artwork = track.optString("artwork", null),
            durationMs = anyToLong(track.opt("duration")),
            headers = headers,
            type = trackType,
        )
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
        return JSObject().apply {
            put("id", track.id)
            put("url", track.url)
            put("title", track.title)
            put("artist", track.artist)
            put("album", track.album)
            put("artwork", track.artwork)
            put("duration", track.durationMs)
            put(
                "headers",
                JSObject().apply {
                    track.headers.forEach { (key, value) ->
                        put(key, value)
                    }
                },
            )
            put("type", track.type?.wireValue)
        }
    }

    fun errorToJs(error: LegatoAndroidError): JSObject {
        return JSObject().apply {
            put("code", error.code.wireValue)
            put("message", error.message)
            put("details", error.details?.toString())
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
        return LegatoAndroidTrackType.values().firstOrNull { it.wireValue == value }
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
