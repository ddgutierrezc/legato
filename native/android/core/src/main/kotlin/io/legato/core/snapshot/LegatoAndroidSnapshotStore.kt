package io.legato.core.snapshot

import io.legato.core.core.LegatoAndroidPlaybackSnapshot
import io.legato.core.core.LegatoAndroidPlaybackState
import io.legato.core.core.LegatoAndroidQueueSnapshot

class LegatoAndroidSnapshotStore {
    private val lock = Any()
    private var playbackSnapshot: LegatoAndroidPlaybackSnapshot = emptySnapshot()

    fun getPlaybackSnapshot(): LegatoAndroidPlaybackSnapshot {
        return synchronized(lock) { playbackSnapshot }
    }

    fun replacePlaybackSnapshot(snapshot: LegatoAndroidPlaybackSnapshot) {
        synchronized(lock) {
            playbackSnapshot = snapshot
        }
    }

    fun updatePlaybackSnapshot(transform: (LegatoAndroidPlaybackSnapshot) -> LegatoAndroidPlaybackSnapshot) {
        synchronized(lock) {
            playbackSnapshot = transform(playbackSnapshot)
        }
    }

    companion object {
        fun emptySnapshot(): LegatoAndroidPlaybackSnapshot = LegatoAndroidPlaybackSnapshot(
            state = LegatoAndroidPlaybackState.IDLE,
            currentTrack = null,
            currentIndex = null,
            positionMs = 0L,
            durationMs = null,
            bufferedPositionMs = null,
            queue = LegatoAndroidQueueSnapshot(items = emptyList(), currentIndex = null),
        )
    }
}
