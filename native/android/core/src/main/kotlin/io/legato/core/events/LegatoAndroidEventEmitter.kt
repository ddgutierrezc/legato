package io.legato.core.events

import io.legato.core.core.LegatoAndroidEvent
import io.legato.core.core.LegatoAndroidEventName
import io.legato.core.core.LegatoAndroidEventPayload

class LegatoAndroidEventEmitter {
    private val lock = Any()
    private val listeners = linkedMapOf<Long, (LegatoAndroidEvent) -> Unit>()
    private var nextListenerId: Long = 1L

    fun emit(event: LegatoAndroidEvent) {
        val snapshot = synchronized(lock) { listeners.values.toList() }
        snapshot.forEach { listener -> listener(event) }
    }

    fun emit(name: LegatoAndroidEventName, payload: LegatoAndroidEventPayload? = null) {
        emit(LegatoAndroidEvent(name = name, payload = payload))
    }

    fun addListener(listener: (LegatoAndroidEvent) -> Unit): Long {
        return synchronized(lock) {
            val id = nextListenerId++
            listeners[id] = listener
            id
        }
    }

    fun removeListener(listenerId: Long) {
        synchronized(lock) {
            listeners.remove(listenerId)
        }
    }
}
