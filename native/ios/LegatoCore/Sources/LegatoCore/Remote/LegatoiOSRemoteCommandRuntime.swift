import Foundation

/// Seam for MPRemoteCommandCenter integration.
public protocol LegatoiOSRemoteCommandRuntime {
    func bind(dispatch: @escaping (LegatoiOSRemoteCommand) -> Void)
    func updatePlaybackState(_ state: LegatoiOSPlaybackState)
    func unbind()
}

public final class LegatoiOSNoopRemoteCommandRuntime: LegatoiOSRemoteCommandRuntime {
    public init() {}

    public func bind(dispatch: @escaping (LegatoiOSRemoteCommand) -> Void) {
        // Intentionally no-op. Real runtime should register command targets and forward with dispatch(...).
    }

    public func updatePlaybackState(_ state: LegatoiOSPlaybackState) {
        // Intentionally no-op.
    }

    public func unbind() {
        // Intentionally no-op.
    }
}
