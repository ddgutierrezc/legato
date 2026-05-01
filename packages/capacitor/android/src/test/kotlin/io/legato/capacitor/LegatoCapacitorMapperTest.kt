package io.legato.capacitor

import io.legato.core.core.LegatoAndroidTransportCapabilities
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertNull
import org.junit.Test
import org.json.JSONObject

class LegatoCapacitorMapperTest {
    @Test
    fun `coerce optional string returns null for missing value`() {
        val value = coerceOptionalString(null)

        assertNull(value)
    }

    @Test
    fun `coerce optional string returns concrete value when present`() {
        val value = coerceOptionalString("Track title")

        assertEquals("Track title", value)
    }

    @Test
    fun `coerce optional string treats JSONObject null sentinel as missing`() {
        val value = coerceOptionalString(JSONObject.NULL)

        assertNull(value)
    }

    @Test
    fun `supported capabilities include playback baseline and projected transport controls`() {
        val mapper = LegatoCapacitorMapper()

        val supported = mapper.supportedCapabilitiesFromTransport(
            LegatoAndroidTransportCapabilities(
                canSkipNext = true,
                canSkipPrevious = false,
                canSeek = true,
            ),
        )

        assertEquals(listOf("play", "pause", "stop", "seek", "skip-next"), supported)
    }

    @Test
    fun `supported capabilities omit unavailable transport controls`() {
        val mapper = LegatoCapacitorMapper()

        val supported = mapper.supportedCapabilitiesFromTransport(
            LegatoAndroidTransportCapabilities(
                canSkipNext = false,
                canSkipPrevious = false,
                canSeek = false,
            ),
        )

        assertEquals(listOf("play", "pause", "stop"), supported)
    }

    @Test
    fun `track mapping preserves declarative headerGroupId`() {
        val mappedTrack = trackFromMap(
            mapOf(
                "id" to "track-1",
                "url" to "https://example.com/track.mp3",
                "headerGroupId" to "premium",
            ),
        )
        val mappedPublic = trackToPublicMap(mappedTrack)

        assertEquals("premium", mappedTrack.headerGroupId)
        assertEquals("premium", mappedPublic["headerGroupId"])
    }

    @Test
    fun `setup options mapping parses headerGroups payload`() {
        val options = setupOptionsFromMap(
            mapOf(
                "headerGroups" to listOf(
                    mapOf(
                        "id" to "premium",
                        "headers" to mapOf("Authorization" to "Bearer group"),
                    ),
                ),
            ),
        )

        assertEquals(1, options.headerGroups.size)
        assertEquals("premium", options.headerGroups.first().id)
        assertEquals("Bearer group", options.headerGroups.first().headers["Authorization"])
        assertTrue(options.headerGroups.first().headers.containsKey("Authorization"))
    }
}
