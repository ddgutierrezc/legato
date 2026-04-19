import Foundation

/// Seam for AVAudioSession-facing runtime integration.
public protocol LegatoiOSSessionRuntime {
    func configureSession()
    func updatePlaybackState(_ state: LegatoiOSPlaybackState)
    func releaseSession()
}

public final class LegatoiOSNoopSessionRuntime: LegatoiOSSessionRuntime {
    public init() {}

    public func configureSession() {
        // Intentionally no-op. AVAudioSession activation/interruption wiring is pending.
    }

    public func updatePlaybackState(_ state: LegatoiOSPlaybackState) {
        // Intentionally no-op.
    }

    public func releaseSession() {
        // Intentionally no-op.
    }
}
