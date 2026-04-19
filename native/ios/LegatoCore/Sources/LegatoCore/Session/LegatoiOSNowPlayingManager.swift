import Foundation

public final class LegatoiOSNowPlayingManager {
    private let runtime: LegatoiOSNowPlayingRuntime

    public init(runtime: LegatoiOSNowPlayingRuntime = LegatoiOSNoopNowPlayingRuntime()) {
        self.runtime = runtime
    }

    public func updateMetadata(_ metadata: LegatoiOSNowPlayingMetadata?) {
        runtime.updateMetadata(metadata)
    }

    public func updateProgress(_ progress: LegatoiOSProgressUpdate) {
        runtime.updateProgress(progress)
    }

    public func clear() {
        runtime.clear()
    }
}
