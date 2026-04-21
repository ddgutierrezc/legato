import XCTest
@testable import LegatoCore

final class LegatoiOSRemoteCommandRuntimeTests: XCTestCase {
    func testBindRegistersAllHandlersAndDispatchesCommands() {
        let center = FakeRemoteCommandCenter()
        let runtime = LegatoiOSMediaPlayerRemoteCommandRuntime(commandCenter: center)
        var received: [LegatoiOSRemoteCommand] = []

        runtime.bind { received.append($0) }

        center.playCommand.trigger()
        center.pauseCommand.trigger()
        center.nextTrackCommand.trigger()
        center.previousTrackCommand.trigger()
        center.changePlaybackPositionCommand.trigger(positionTimeSeconds: 42.5)

        XCTAssertEqual(received.count, 5)
        if case .play = received[0] {} else { XCTFail("Expected play command") }
        if case .pause = received[1] {} else { XCTFail("Expected pause command") }
        if case .next = received[2] {} else { XCTFail("Expected next command") }
        if case .previous = received[3] {} else { XCTFail("Expected previous command") }

        if case let .seek(positionMs) = received[4] {
            XCTAssertEqual(positionMs, 42_500)
        } else {
            XCTFail("Expected seek command")
        }
    }

    func testUpdateTransportCapabilitiesTogglesNextPreviousSeek() {
        let center = FakeRemoteCommandCenter()
        let runtime = LegatoiOSMediaPlayerRemoteCommandRuntime(commandCenter: center)

        runtime.bind { _ in }
        runtime.updateTransportCapabilities(.init(canSkipNext: false, canSkipPrevious: true, canSeek: false))

        XCTAssertFalse(center.nextTrackCommand.isEnabled)
        XCTAssertTrue(center.previousTrackCommand.isEnabled)
        XCTAssertFalse(center.changePlaybackPositionCommand.isEnabled)
    }

    func testUnbindRemovesRegisteredHandlers() {
        let center = FakeRemoteCommandCenter()
        let runtime = LegatoiOSMediaPlayerRemoteCommandRuntime(commandCenter: center)

        runtime.bind { _ in }
        runtime.unbind()

        XCTAssertEqual(center.playCommand.removeTargetCount, 1)
        XCTAssertEqual(center.pauseCommand.removeTargetCount, 1)
        XCTAssertEqual(center.nextTrackCommand.removeTargetCount, 1)
        XCTAssertEqual(center.previousTrackCommand.removeTargetCount, 1)
        XCTAssertEqual(center.changePlaybackPositionCommand.removeTargetCount, 1)
    }
}

private final class FakeRemoteCommandCenter: LegatoiOSRemoteCommandCenter {
    let playCommand = FakeButtonCommand()
    let pauseCommand = FakeButtonCommand()
    let nextTrackCommand = FakeButtonCommand()
    let previousTrackCommand = FakeButtonCommand()
    let changePlaybackPositionCommand = FakePositionCommand()
}

private final class FakeButtonCommand: LegatoiOSRemoteCommandHandler {
    var isEnabled: Bool = false
    private var handlerByToken: [UUID: () -> Void] = [:]
    private(set) var removeTargetCount = 0

    @discardableResult
    func addTarget(_ handler: @escaping () -> Void) -> AnyObject {
        let token = UUID()
        handlerByToken[token] = handler
        return token as NSUUID
    }

    func removeTarget(_ token: AnyObject) {
        removeTargetCount += 1
        if let uuid = token as? NSUUID {
            handlerByToken.removeValue(forKey: uuid as UUID)
        }
    }

    func trigger() {
        handlerByToken.values.forEach { $0() }
    }
}

private final class FakePositionCommand: LegatoiOSChangePlaybackPositionCommandHandler {
    var isEnabled: Bool = false
    private var handlerByToken: [UUID: (Double) -> Void] = [:]
    private(set) var removeTargetCount = 0

    @discardableResult
    func addTarget(_ handler: @escaping (Double) -> Void) -> AnyObject {
        let token = UUID()
        handlerByToken[token] = handler
        return token as NSUUID
    }

    func removeTarget(_ token: AnyObject) {
        removeTargetCount += 1
        if let uuid = token as? NSUUID {
            handlerByToken.removeValue(forKey: uuid as UUID)
        }
    }

    func trigger(positionTimeSeconds: Double) {
        handlerByToken.values.forEach { $0(positionTimeSeconds) }
    }
}
