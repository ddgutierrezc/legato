import XCTest
@testable import LegatoCore

final class LegatoiOSNowPlayingRuntimeTests: XCTestCase {
    func testUpdateMetadataRotatesActiveArtworkToken() {
        let center = FakeNowPlayingInfoCenter()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(
            infoCenter: center,
            artworkLoader: FakeArtworkLoader()
        )

        runtime.updateMetadata(
            .init(
                trackId: "track-1",
                title: "Song",
                artist: "Artist",
                album: "Album",
                durationMs: 90_000
            )
        )
        let firstToken = runtime.activeArtworkToken

        runtime.updateMetadata(
            .init(
                trackId: "track-2",
                title: "Song 2",
                artist: "Artist",
                album: "Album",
                durationMs: 90_000
            )
        )

        XCTAssertNotNil(firstToken)
        XCTAssertNotEqual(firstToken, runtime.activeArtworkToken)
    }

    func testUpdateMetadataNilClearsActiveArtworkToken() {
        let center = FakeNowPlayingInfoCenter()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(
            infoCenter: center,
            artworkLoader: FakeArtworkLoader()
        )

        runtime.updateMetadata(
            .init(
                trackId: "track-1",
                title: "Song",
                artist: "Artist",
                album: "Album",
                durationMs: 90_000
            )
        )

        runtime.updateMetadata(nil)

        XCTAssertNil(runtime.activeArtworkToken)
    }

    func testUpdateMetadataWritesTextFieldsAndDuration() {
        let center = FakeNowPlayingInfoCenter()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(infoCenter: center)

        runtime.updateMetadata(
            .init(
                trackId: "track-1",
                title: "Song",
                artist: "Artist",
                album: "Album",
                durationMs: 90_000
            )
        )

        let info = center.nowPlayingInfo
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.trackIdentifier] as? String, "track-1")
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.title] as? String, "Song")
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.artist] as? String, "Artist")
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.album] as? String, "Album")
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.duration] as? Double, 90)
    }

    func testUpdateProgressWritesElapsedAndUpdatesDurationWhenPresent() {
        let center = FakeNowPlayingInfoCenter()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(infoCenter: center)

        runtime.updateProgress(.init(positionMs: 15_500, durationMs: 120_000, bufferedPositionMs: nil))

        let info = center.nowPlayingInfo
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.elapsedTime] as? Double, 15.5)
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.duration] as? Double, 120)
    }

    func testClearRemovesNowPlayingInfo() {
        let center = FakeNowPlayingInfoCenter()
        center.nowPlayingInfo = [LegatoiOSNowPlayingInfoKey.title: "Song"]
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(infoCenter: center)

        runtime.clear()

        XCTAssertNil(center.nowPlayingInfo)
    }

    // MARK: - Artwork Tests

    func testUpdateMetadataWritesTextFieldsImmediatelyWithoutWaitingForArtwork() {
        let center = FakeNowPlayingInfoCenter()
        let loader = FakeArtworkLoader()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(
            infoCenter: center,
            artworkLoader: loader,
            artworkDispatch: { $0() }
        )

        runtime.updateMetadata(
            .init(
                trackId: "track-1",
                title: "Song",
                artist: "Artist",
                album: "Album",
                artwork: "https://example.com/art.jpg",
                durationMs: 90_000
            )
        )

        let info = center.nowPlayingInfo
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.title] as? String, "Song")
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.artist] as? String, "Artist")
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.album] as? String, "Album")
        XCTAssertEqual(info?[LegatoiOSNowPlayingInfoKey.duration] as? Double, 90)
        XCTAssertNil(info?[LegatoiOSNowPlayingInfoKey.artwork])
    }

    func testUpdateMetadataPublishesArtworkOnFetchSuccess() {
        let center = FakeNowPlayingInfoCenter()
        let loader = FakeArtworkLoader()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(
            infoCenter: center,
            artworkLoader: loader,
            artworkDispatch: { $0() }
        )

        runtime.updateMetadata(
            .init(
                trackId: "track-1",
                title: "Song",
                artwork: "https://example.com/art.jpg",
                durationMs: 90_000
            )
        )

        loader.completeFirst(with: .success(makeValidImageData()))

        XCTAssertNotNil(center.nowPlayingInfo?[LegatoiOSNowPlayingInfoKey.artwork])
    }

    func testUpdateMetadataWithMissingArtworkUrlClearsPreviousArtwork() {
        let center = FakeNowPlayingInfoCenter()
        let loader = FakeArtworkLoader()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(
            infoCenter: center,
            artworkLoader: loader,
            artworkDispatch: { $0() }
        )

        runtime.updateMetadata(
            .init(
                trackId: "track-1",
                title: "Song",
                artwork: "https://example.com/art.jpg",
                durationMs: 90_000
            )
        )
        loader.completeFirst(with: .success(makeValidImageData()))
        XCTAssertNotNil(center.nowPlayingInfo?[LegatoiOSNowPlayingInfoKey.artwork])

        runtime.updateMetadata(
            .init(
                trackId: "track-2",
                title: "Song 2",
                artwork: nil,
                durationMs: 90_000
            )
        )
        XCTAssertNil(center.nowPlayingInfo?[LegatoiOSNowPlayingInfoKey.artwork])
    }

    func testUpdateMetadataWithInvalidArtworkUrlClearsPreviousArtwork() {
        let center = FakeNowPlayingInfoCenter()
        let loader = FakeArtworkLoader()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(
            infoCenter: center,
            artworkLoader: loader,
            artworkDispatch: { $0() }
        )

        runtime.updateMetadata(
            .init(
                trackId: "track-1",
                title: "Song",
                artwork: "https://example.com/art.jpg",
                durationMs: 90_000
            )
        )
        loader.completeFirst(with: .success(makeValidImageData()))
        XCTAssertNotNil(center.nowPlayingInfo?[LegatoiOSNowPlayingInfoKey.artwork])

        runtime.updateMetadata(
            .init(
                trackId: "track-2",
                title: "Song 2",
                artwork: "not a url",
                durationMs: 90_000
            )
        )
        XCTAssertNil(center.nowPlayingInfo?[LegatoiOSNowPlayingInfoKey.artwork])
    }

    func testStaleArtworkFetchIsIgnored() {
        let center = FakeNowPlayingInfoCenter()
        let loader = FakeArtworkLoader()
        let runtime = LegatoiOSMediaPlayerNowPlayingRuntime(
            infoCenter: center,
            artworkLoader: loader,
            artworkDispatch: { $0() }
        )

        runtime.updateMetadata(
            .init(
                trackId: "track-1",
                title: "Song",
                artwork: "https://example.com/art1.jpg",
                durationMs: 90_000
            )
        )
        XCTAssertEqual(loader.requests.count, 1)

        runtime.updateMetadata(
            .init(
                trackId: "track-2",
                title: "Song 2",
                artwork: "https://example.com/art2.jpg",
                durationMs: 90_000
            )
        )
        XCTAssertEqual(loader.requests.count, 2)

        loader.completeFirst(with: .success(makeValidImageData()))
        XCTAssertNil(center.nowPlayingInfo?[LegatoiOSNowPlayingInfoKey.artwork])

        loader.completeFirst(with: .success(makeValidImageData()))
        XCTAssertNotNil(center.nowPlayingInfo?[LegatoiOSNowPlayingInfoKey.artwork])
    }
}

private final class FakeNowPlayingInfoCenter: LegatoiOSNowPlayingInfoCenter {
    var nowPlayingInfo: [String: Any]?
}

private final class FakeArtworkLoader: LegatoiOSArtworkLoader {
    private(set) var requests: [(url: URL, completion: (Result<Data, Error>) -> Void)] = []

    func loadArtworkData(from url: URL, completion: @escaping (Result<Data, Error>) -> Void) {
        requests.append((url, completion))
    }

    func completeFirst(with result: Result<Data, Error>) {
        guard !requests.isEmpty else { return }
        let request = requests.removeFirst()
        request.completion(result)
    }

    func completeAll(with result: Result<Data, Error>) {
        for request in requests {
            request.completion(result)
        }
        requests.removeAll()
    }
}

private func makeValidImageData() -> Data {
    #if canImport(UIKit) && os(iOS)
    let renderer = UIGraphicsImageRenderer(size: CGSize(width: 1, height: 1))
    let image = renderer.image { ctx in
        UIColor.red.setFill()
        ctx.fill(CGRect(x: 0, y: 0, width: 1, height: 1))
    }
    return image.pngData()!
    #else
    // macOS compilation fallback — runtime stores raw Data when UIKit is unavailable
    return Data([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
    #endif
}
