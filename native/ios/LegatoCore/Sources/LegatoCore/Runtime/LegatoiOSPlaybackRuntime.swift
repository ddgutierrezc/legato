import AVFoundation
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

/// Minimal in-memory fallback runtime.
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

/// AVPlayer-backed runtime for foreground audible playback.
///
/// This adapter intentionally keeps scope minimal for MVP:
/// - single active AVPlayerItem selected by index
/// - no background playback behavior
/// - no interruptions/remote command orchestration
public final class LegatoiOSAVPlayerPlaybackRuntime: LegatoiOSPlaybackRuntime {
    private let player: AVPlayer
    private var trackSources: [LegatoiOSRuntimeTrackSource] = []
    private var currentIndex: Int?

    public init(player: AVPlayer = AVPlayer()) {
        self.player = player
    }

    public func configure() {
        // Runtime initialization is completed at init time.
    }

    public func replaceQueue(items: [LegatoiOSRuntimeTrackSource], startIndex: Int?) throws {
        trackSources = items

        guard !items.isEmpty else {
            currentIndex = nil
            player.replaceCurrentItem(with: nil)
            return
        }

        let nextIndex: Int
        if let startIndex, items.indices.contains(startIndex) {
            nextIndex = startIndex
        } else {
            nextIndex = 0
        }

        try loadItem(at: nextIndex)
    }

    public func selectIndex(_ index: Int) throws {
        guard trackSources.indices.contains(index) else {
            return
        }

        try loadItem(at: index)
    }

    public func play() throws {
        guard player.currentItem != nil else {
            throw LegatoiOSError(code: .playbackFailed, message: "No active AVPlayer item to play")
        }
        player.play()
    }

    public func pause() throws {
        player.pause()
    }

    public func stop(resetPosition: Bool) throws {
        player.pause()
        guard resetPosition else {
            return
        }

        player.seek(to: .zero)
    }

    public func seek(to positionMs: Int64) throws {
        let clamped = max(0, positionMs)
        let seconds = Double(clamped) / 1000
        let target = CMTime(seconds: seconds, preferredTimescale: 1000)
        player.seek(to: target)
    }

    public func snapshot() -> LegatoiOSRuntimeSnapshot {
        let item = player.currentItem
        let duration = durationMs(for: item)
        let bufferedPosition = bufferedPositionMs(for: item)
        let position = positionMs(for: item)

        return LegatoiOSRuntimeSnapshot(
            stateHint: stateHint(),
            currentIndex: currentIndex,
            progress: LegatoiOSRuntimeProgress(
                positionMs: position,
                durationMs: duration,
                bufferedPositionMs: bufferedPosition
            )
        )
    }

    public func release() {
        player.pause()
        player.replaceCurrentItem(with: nil)
        trackSources = []
        currentIndex = nil
    }

    private func loadItem(at index: Int) throws {
        guard trackSources.indices.contains(index) else {
            throw LegatoiOSError(code: .invalidIndex, message: "Requested runtime index is out of bounds")
        }

        let source = trackSources[index]
        guard let url = URL(string: source.url), url.scheme != nil else {
            throw LegatoiOSError(code: .invalidURL, message: "Track URL is invalid: \(source.url)")
        }

        // Keep the audible-playback MVP on public AVFoundation APIs only.
        // Demo smoke URLs currently do not require custom headers.
        let asset = AVURLAsset(url: url)
        let item = AVPlayerItem(asset: asset)

        player.replaceCurrentItem(with: item)
        currentIndex = index
    }

    private func stateHint() -> LegatoiOSPlaybackState? {
        guard player.currentItem != nil else {
            return .idle
        }

        if player.timeControlStatus == .playing {
            return .playing
        }

        if player.timeControlStatus == .waitingToPlayAtSpecifiedRate {
            return .buffering
        }

        return .paused
    }

    private func positionMs(for item: AVPlayerItem?) -> Int64 {
        guard item != nil else {
            return 0
        }

        return milliseconds(from: player.currentTime()) ?? 0
    }

    private func durationMs(for item: AVPlayerItem?) -> Int64? {
        guard let item else {
            return nil
        }

        return milliseconds(from: item.duration)
    }

    private func bufferedPositionMs(for item: AVPlayerItem?) -> Int64? {
        guard let item,
              let loaded = item.loadedTimeRanges.first?.timeRangeValue
        else {
            return nil
        }

        return milliseconds(from: CMTimeAdd(loaded.start, loaded.duration))
    }

    private func milliseconds(from time: CMTime) -> Int64? {
        guard time.isValid else {
            return nil
        }

        let seconds = CMTimeGetSeconds(time)
        guard seconds.isFinite, !seconds.isNaN else {
            return nil
        }

        return Int64(max(0, seconds * 1000))
    }
}
