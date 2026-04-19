import Foundation

/// Runtime seam for AVPlayer-backed integration.
///
/// The core calls this protocol for runtime operations while preserving canonical
/// Legato state/event semantics outside the platform adapter.
public protocol LegatoiOSPlaybackRuntime {
    func configure()
    func replaceQueue(items: [LegatoiOSRuntimeTrackSource], startIndex: Int?) throws
    func selectIndex(_ index: Int) throws
    func play() throws
    func pause() throws
    func stop(resetPosition: Bool) throws
    func seek(to positionMs: Int64) throws
    func snapshot() -> LegatoiOSRuntimeSnapshot
    func release()
}

public struct LegatoiOSRuntimeTrackSource {
    public let id: String
    public let url: String
    public let headers: [String: String]
    public let type: LegatoiOSTrackType?

    public init(id: String, url: String, headers: [String: String], type: LegatoiOSTrackType?) {
        self.id = id
        self.url = url
        self.headers = headers
        self.type = type
    }
}

public struct LegatoiOSRuntimeProgress {
    public let positionMs: Int64
    public let durationMs: Int64?
    public let bufferedPositionMs: Int64?

    public init(positionMs: Int64, durationMs: Int64?, bufferedPositionMs: Int64?) {
        self.positionMs = positionMs
        self.durationMs = durationMs
        self.bufferedPositionMs = bufferedPositionMs
    }
}

public struct LegatoiOSRuntimeSnapshot {
    public let stateHint: LegatoiOSPlaybackState?
    public let currentIndex: Int?
    public let progress: LegatoiOSRuntimeProgress

    public init(
        stateHint: LegatoiOSPlaybackState? = nil,
        currentIndex: Int? = nil,
        progress: LegatoiOSRuntimeProgress = LegatoiOSRuntimeProgress(positionMs: 0, durationMs: nil, bufferedPositionMs: 0)
    ) {
        self.stateHint = stateHint
        self.currentIndex = currentIndex
        self.progress = progress
    }
}

/// Minimal in-memory runtime until AVPlayer wiring is introduced.
///
/// This intentionally does not play audio. It only keeps deterministic runtime-facing state.
public final class LegatoiOSNoopPlaybackRuntime: LegatoiOSPlaybackRuntime {
    private var currentIndex: Int?
    private var trackCount: Int = 0
    private var progress = LegatoiOSRuntimeProgress(positionMs: 0, durationMs: nil, bufferedPositionMs: 0)

    public init() {}

    public func configure() {
        // Intentionally no-op. AVPlayer object graph wiring is pending.
    }

    public func replaceQueue(items: [LegatoiOSRuntimeTrackSource], startIndex: Int?) throws {
        trackCount = items.count
        if items.isEmpty {
            currentIndex = nil
        } else if let startIndex, items.indices.contains(startIndex) {
            currentIndex = startIndex
        } else {
            currentIndex = 0
        }
        progress = LegatoiOSRuntimeProgress(positionMs: 0, durationMs: nil, bufferedPositionMs: 0)
    }

    public func selectIndex(_ index: Int) throws {
        guard index >= 0, index < trackCount else {
            return
        }
        currentIndex = index
        progress = LegatoiOSRuntimeProgress(positionMs: 0, durationMs: nil, bufferedPositionMs: 0)
    }

    public func play() throws {
        // Intentionally no-op. AVPlayer adapter should call player.play().
    }

    public func pause() throws {
        // Intentionally no-op. AVPlayer adapter should call player.pause().
    }

    public func stop(resetPosition: Bool) throws {
        if resetPosition {
            progress = LegatoiOSRuntimeProgress(positionMs: 0, durationMs: nil, bufferedPositionMs: 0)
        }
    }

    public func seek(to positionMs: Int64) throws {
        progress = LegatoiOSRuntimeProgress(positionMs: max(0, positionMs), durationMs: progress.durationMs, bufferedPositionMs: progress.bufferedPositionMs)
    }

    public func snapshot() -> LegatoiOSRuntimeSnapshot {
        LegatoiOSRuntimeSnapshot(currentIndex: currentIndex, progress: progress)
    }

    public func release() {
        currentIndex = nil
        trackCount = 0
        progress = LegatoiOSRuntimeProgress(positionMs: 0, durationMs: nil, bufferedPositionMs: 0)
    }
}
