package io.legato.core.mapping

import io.legato.core.core.LegatoAndroidTrack

class LegatoAndroidTrackMapper {
    fun mapContractTrack(track: LegatoAndroidTrack): LegatoAndroidTrack {
        require(track.id.isNotBlank()) { "track.id must be a non-empty string" }
        require(track.url.isNotBlank()) { "track.url must be a non-empty string" }
        return track
    }

    fun mapContractTracks(tracks: List<LegatoAndroidTrack>): List<LegatoAndroidTrack> {
        return tracks.map(::mapContractTrack)
    }
}
