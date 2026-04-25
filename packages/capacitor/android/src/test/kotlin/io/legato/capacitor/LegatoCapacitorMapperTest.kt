package io.legato.capacitor

import org.junit.Assert.assertEquals
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
}
