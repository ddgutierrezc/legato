import XCTest
@testable import LegatoCore

final class LegatoiOSNowPlayingRuntimeTests: XCTestCase {
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
}

private final class FakeNowPlayingInfoCenter: LegatoiOSNowPlayingInfoCenter {
    var nowPlayingInfo: [String: Any]?
}
