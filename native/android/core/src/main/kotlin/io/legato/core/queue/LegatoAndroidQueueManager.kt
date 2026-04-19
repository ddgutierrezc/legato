package io.legato.core.queue

import io.legato.core.core.LegatoAndroidQueueSnapshot
import io.legato.core.core.LegatoAndroidTrack

class LegatoAndroidQueueManager {
    private val lock = Any()
    private var queueSnapshot: LegatoAndroidQueueSnapshot =
        LegatoAndroidQueueSnapshot(items = emptyList(), currentIndex = null)

    fun replaceQueue(tracks: List<LegatoAndroidTrack>, startIndex: Int? = null): LegatoAndroidQueueSnapshot {
        return synchronized(lock) {
            val resolvedStartIndex = resolveStartIndex(tracks, startIndex)
            queueSnapshot = LegatoAndroidQueueSnapshot(items = tracks.toList(), currentIndex = resolvedStartIndex)
            queueSnapshot
        }
    }

    fun addToQueue(tracks: List<LegatoAndroidTrack>): LegatoAndroidQueueSnapshot {
        return synchronized(lock) {
            if (tracks.isNotEmpty()) {
                queueSnapshot = queueSnapshot.copy(items = queueSnapshot.items + tracks)
            }
            queueSnapshot
        }
    }

    fun getQueueSnapshot(): LegatoAndroidQueueSnapshot {
        return synchronized(lock) { queueSnapshot }
    }

    fun moveToNext(): Int? {
        return synchronized(lock) {
            if (queueSnapshot.items.isEmpty()) {
                return@synchronized null
            }

            val current = queueSnapshot.currentIndex ?: run {
                queueSnapshot = queueSnapshot.copy(currentIndex = 0)
                return@synchronized 0
            }

            if (current + 1 >= queueSnapshot.items.size) {
                return@synchronized null
            }

            val next = current + 1
            queueSnapshot = queueSnapshot.copy(currentIndex = next)
            next
        }
    }

    fun moveToPrevious(): Int? {
        return synchronized(lock) {
            if (queueSnapshot.items.isEmpty()) {
                return@synchronized null
            }

            val current = queueSnapshot.currentIndex ?: return@synchronized null
            if (current - 1 < 0) {
                return@synchronized null
            }

            val previous = current - 1
            queueSnapshot = queueSnapshot.copy(currentIndex = previous)
            previous
        }
    }

    fun getCurrentTrack(): LegatoAndroidTrack? {
        return synchronized(lock) {
            queueSnapshot.currentIndex?.let(queueSnapshot.items::getOrNull)
        }
    }

    fun getNextTrack(): LegatoAndroidTrack? {
        return synchronized(lock) {
            val current = queueSnapshot.currentIndex ?: return@synchronized null
            queueSnapshot.items.getOrNull(current + 1)
        }
    }

    fun getPreviousTrack(): LegatoAndroidTrack? {
        return synchronized(lock) {
            val current = queueSnapshot.currentIndex ?: return@synchronized null
            queueSnapshot.items.getOrNull(current - 1)
        }
    }

    fun clear() {
        synchronized(lock) {
            queueSnapshot = LegatoAndroidQueueSnapshot(items = emptyList(), currentIndex = null)
        }
    }

    private fun resolveStartIndex(tracks: List<LegatoAndroidTrack>, startIndex: Int?): Int? {
        if (tracks.isEmpty()) {
            require(startIndex == null) {
                "startIndex must be null when queue is empty"
            }
            return null
        }

        val resolvedStartIndex = startIndex ?: 0
        require(resolvedStartIndex in tracks.indices) {
            "startIndex must be within queue bounds"
        }

        return resolvedStartIndex
    }
}
