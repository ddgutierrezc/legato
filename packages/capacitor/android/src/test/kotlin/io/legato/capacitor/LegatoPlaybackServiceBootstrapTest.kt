package io.legato.capacitor

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Test

class LegatoPlaybackServiceBootstrapTest {
    @Test
    fun `bootstrap helper resolves context lazily and exactly once`() {
        var providerCalls = 0
        var resolverCalls = 0
        var providerRan = false

        val resolved = resolveOnCreateDependency(
            contextProvider = {
                providerCalls += 1
                providerRan = true
                "app-context"
            },
            resolver = { providedContext ->
                resolverCalls += 1
                assertTrue(providerRan)
                "coordinator-for-$providedContext"
            },
        )

        assertEquals("coordinator-for-app-context", resolved)
        assertEquals(1, providerCalls)
        assertEquals(1, resolverCalls)
    }

    @Test
    fun `bootstrap helper forwards exact provider value into resolver`() {
        data class FakeAppContext(val id: String)

        val provided = FakeAppContext("ctx-1")
        var observed: FakeAppContext? = null
        val expectedCoordinator = Any()

        val resolved = resolveOnCreateDependency(
            contextProvider = { provided },
            resolver = { context ->
                observed = context
                expectedCoordinator
            },
        )

        assertSame(provided, observed)
        assertFalse(observed === null)
        assertSame(expectedCoordinator, resolved)
    }
}
