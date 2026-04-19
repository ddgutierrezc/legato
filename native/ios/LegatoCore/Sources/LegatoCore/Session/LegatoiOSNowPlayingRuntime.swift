import Foundation

/// Seam for MPNowPlayingInfoCenter integration.
public protocol LegatoiOSNowPlayingRuntime {
    func updateMetadata(_ metadata: LegatoiOSNowPlayingMetadata?)
    func updateProgress(_ progress: LegatoiOSProgressUpdate)
    func clear()
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
