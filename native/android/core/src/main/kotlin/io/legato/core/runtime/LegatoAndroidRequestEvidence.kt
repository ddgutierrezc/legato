package io.legato.core.runtime

import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.ResolvingDataSource
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.MediaSource
import io.legato.core.core.LegatoAndroidTrackType

data class RequestEvidenceRecord(
    val runtime: String,
    val trackId: String,
    val requestUrl: String,
    val requestHeaders: Map<String, String>,
)

fun interface LegatoAndroidRequestEvidenceSink {
    fun record(record: RequestEvidenceRecord)
}

object NoOpLegatoAndroidRequestEvidenceSink : LegatoAndroidRequestEvidenceSink {
    override fun record(record: RequestEvidenceRecord) = Unit
}

class RecordingLegatoAndroidRequestEvidenceSink : LegatoAndroidRequestEvidenceSink {
    private val mutableRecords = mutableListOf<RequestEvidenceRecord>()

    val records: List<RequestEvidenceRecord>
        get() = synchronized(this) { mutableRecords.toList() }

    override fun record(record: RequestEvidenceRecord) {
        synchronized(this) {
            mutableRecords += record
        }
    }
}

class LegatoAndroidTrackRequestTransformer(
    private val trackId: String,
    private val trackHeaders: Map<String, String>,
    private val evidenceSink: LegatoAndroidRequestEvidenceSink,
) {
    fun transform(requestUrl: String, existingHeaders: Map<String, String>): Map<String, String> {
        val mergedHeaders = if (trackHeaders.isEmpty()) {
            existingHeaders
        } else {
            existingHeaders + trackHeaders
        }

        evidenceSink.record(
            RequestEvidenceRecord(
                runtime = "android",
                trackId = trackId,
                requestUrl = requestUrl,
                requestHeaders = mergedHeaders,
            ),
        )

        return mergedHeaders
    }

    fun apply(dataSpec: DataSpec): DataSpec {
        val mergedHeaders = transform(dataSpec.uri.toString(), dataSpec.httpRequestHeaders)

        if (mergedHeaders == dataSpec.httpRequestHeaders) {
            return dataSpec
        }

        return dataSpec.withRequestHeaders(mergedHeaders)
    }
}

interface LegatoAndroidTrackMediaSourceFactory {
    fun create(source: LegatoAndroidRuntimeTrackSource): MediaSource
}

class DefaultLegatoAndroidTrackMediaSourceFactory(
    private val evidenceSink: LegatoAndroidRequestEvidenceSink,
) : LegatoAndroidTrackMediaSourceFactory {
    override fun create(source: LegatoAndroidRuntimeTrackSource): MediaSource {
        val requestTransformer = LegatoAndroidTrackRequestTransformer(
            trackId = source.id,
            trackHeaders = source.headers,
            evidenceSink = evidenceSink,
        )

        val dataSourceFactory = ResolvingDataSource.Factory(DefaultHttpDataSource.Factory()) { dataSpec ->
            requestTransformer.apply(dataSpec)
        }

        val mediaItem = MediaItem.Builder()
            .setMediaId(source.id)
            .setUri(source.url)
            .setMimeType(resolveMimeType(source.type))
            .build()

        return DefaultMediaSourceFactory(dataSourceFactory).createMediaSource(mediaItem)
    }

    private fun resolveMimeType(type: LegatoAndroidTrackType?): String? = when (type) {
        LegatoAndroidTrackType.HLS -> MimeTypes.APPLICATION_M3U8
        LegatoAndroidTrackType.DASH -> MimeTypes.APPLICATION_MPD
        LegatoAndroidTrackType.PROGRESSIVE,
        LegatoAndroidTrackType.FILE,
        null,
        -> null
    }
}
