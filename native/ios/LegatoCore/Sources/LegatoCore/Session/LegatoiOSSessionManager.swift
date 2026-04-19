import Foundation

public final class LegatoiOSSessionManager {
    private let runtime: LegatoiOSSessionRuntime

    public init(runtime: LegatoiOSSessionRuntime = LegatoiOSNoopSessionRuntime()) {
        self.runtime = runtime
    }

    public func configureSession() {
        runtime.configureSession()
    }

    public func updatePlaybackState(_ state: LegatoiOSPlaybackState) {
        runtime.updatePlaybackState(state)
    }

    public func releaseSession() {
        runtime.releaseSession()
    }
}
