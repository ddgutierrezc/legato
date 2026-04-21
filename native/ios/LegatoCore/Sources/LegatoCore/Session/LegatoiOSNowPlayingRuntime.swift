import Foundation

/// Seam for MPNowPlayingInfoCenter integration.
public protocol LegatoiOSNowPlayingRuntime {
    func updateMetadata(_ metadata: LegatoiOSNowPlayingMetadata?)
    func updateProgress(_ progress: LegatoiOSProgressUpdate)
    func clear()
}

public protocol LegatoiOSNowPlayingInfoCenter: AnyObject {
    var nowPlayingInfo: [String: Any]? { get set }
}

public enum LegatoiOSNowPlayingInfoKey {
    public static let trackIdentifier = "legato.track.id"
    public static let title = "title"
    public static let artist = "artist"
    public static let album = "albumTitle"
    public static let duration = "playbackDuration"
    public static let elapsedTime = "elapsedPlaybackTime"
}

public final class LegatoiOSMediaPlayerNowPlayingRuntime: LegatoiOSNowPlayingRuntime {
    private let infoCenter: LegatoiOSNowPlayingInfoCenter

    public init(infoCenter: LegatoiOSNowPlayingInfoCenter = LegatoiOSLiveNowPlayingInfoCenter()) {
        self.infoCenter = infoCenter
    }

    public func updateMetadata(_ metadata: LegatoiOSNowPlayingMetadata?) {
        guard let metadata else {
            clear()
            return
        }

        var info = infoCenter.nowPlayingInfo ?? [:]
        info[LegatoiOSNowPlayingInfoKey.trackIdentifier] = metadata.trackId
        info[LegatoiOSNowPlayingInfoKey.title] = metadata.title
        info[LegatoiOSNowPlayingInfoKey.artist] = metadata.artist
        info[LegatoiOSNowPlayingInfoKey.album] = metadata.album

        if let durationMs = metadata.durationMs {
            info[LegatoiOSNowPlayingInfoKey.duration] = Self.seconds(fromMs: durationMs)
        } else {
            info.removeValue(forKey: LegatoiOSNowPlayingInfoKey.duration)
        }

        infoCenter.nowPlayingInfo = info
    }

    public func updateProgress(_ progress: LegatoiOSProgressUpdate) {
        var info = infoCenter.nowPlayingInfo ?? [:]
        info[LegatoiOSNowPlayingInfoKey.elapsedTime] = Self.seconds(fromMs: progress.positionMs)

        if let durationMs = progress.durationMs {
            info[LegatoiOSNowPlayingInfoKey.duration] = Self.seconds(fromMs: durationMs)
        }

        infoCenter.nowPlayingInfo = info
    }

    public func clear() {
        infoCenter.nowPlayingInfo = nil
    }

    private static func seconds(fromMs value: Int64) -> Double {
        Double(max(0, value)) / 1_000.0
    }
}

public final class LegatoiOSNoopNowPlayingRuntime: LegatoiOSNowPlayingRuntime {
    public init() {}

    public func updateMetadata(_ metadata: LegatoiOSNowPlayingMetadata?) {
        // Intentionally no-op. MPNowPlayingInfoCenter mapping is pending.
    }

    public func updateProgress(_ progress: LegatoiOSProgressUpdate) {
        // Intentionally no-op.
    }

    public func clear() {
        // Intentionally no-op.
    }
}

#if canImport(MediaPlayer) && os(iOS)
import MediaPlayer

public final class LegatoiOSLiveNowPlayingInfoCenter: LegatoiOSNowPlayingInfoCenter {
    private let infoCenter: MPNowPlayingInfoCenter

    public init(infoCenter: MPNowPlayingInfoCenter = .default()) {
        self.infoCenter = infoCenter
    }

    public var nowPlayingInfo: [String: Any]? {
        get { infoCenter.nowPlayingInfo }
        set { infoCenter.nowPlayingInfo = newValue }
    }
}
#else
public final class LegatoiOSLiveNowPlayingInfoCenter: LegatoiOSNowPlayingInfoCenter {
    public var nowPlayingInfo: [String: Any]?

    public init() {}
}
#endif
