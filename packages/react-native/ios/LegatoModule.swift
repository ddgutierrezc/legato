import ExpoModulesCore
import Foundation
import LegatoCore
#if canImport(UIKit)
import UIKit
#endif

public class LegatoModule: Module {
  private let core = LegatoiOSCoreFactory.make()
  private var eventListenerID: UUID?
  private var willEnterForegroundObserver: NSObjectProtocol?
  private var didBecomeActiveObserver: NSObjectProtocol?

  deinit {
    teardownEventForwarding()
    unregisterLifecycleObservers()
    core.playerEngine.release()
  }

  public func definition() -> ModuleDefinition {
    Name("Legato")

    Events(
      "playback-state-changed",
      "playback-active-track-changed",
      "playback-queue-changed",
      "playback-progress",
      "playback-ended",
      "playback-error",
      "remote-play",
      "remote-pause",
      "remote-next",
      "remote-previous",
      "remote-seek"
    )

    Function("setup") { (options: [String: Any]?) throws -> [String: Any] in
      let setupOptions = LegatoExpoMapper.setupOptions(from: options ?? [:])
      try self.core.playerEngine.setup(options: setupOptions)
      return ["ok": true]
    }

    Function("add") { (options: [String: Any]) throws -> [String: Any] in
      let rawTracks = options["tracks"] as? [[String: Any]] ?? []
      let tracks = rawTracks.map(LegatoExpoMapper.track)
      let startIndex = options["startIndex"] as? Int
      let snapshot = try self.core.playerEngine.add(tracks: tracks, startIndex: startIndex)
      return ["snapshot": LegatoExpoMapper.snapshotToDictionary(snapshot)]
    }

    Function("remove") { (options: [String: Any]) throws -> [String: Any] in
      let index = try self.resolveRemovalIndex(options)
      let snapshot = try self.core.playerEngine.removeFromQueue(at: index)
      return ["snapshot": LegatoExpoMapper.snapshotToDictionary(snapshot)]
    }

    Function("reset") { () throws -> [String: Any] in
      let snapshot = try self.core.playerEngine.resetQueue()
      return ["snapshot": LegatoExpoMapper.snapshotToDictionary(snapshot)]
    }

    Function("play") { () throws -> [String: Any] in
      try self.core.playerEngine.play()
      return ["ok": true]
    }

    Function("pause") { () throws -> [String: Any] in
      try self.core.playerEngine.pause()
      return ["ok": true]
    }

    Function("stop") { () throws -> [String: Any] in
      try self.core.playerEngine.stop()
      return ["ok": true]
    }

    Function("seekTo") { (options: [String: Any]) throws -> [String: Any] in
      guard let position = options["position"] as? Double else {
        throw LegatoiOSError(code: .seekFailed, message: "seekTo.position is required")
      }

      try self.core.playerEngine.seek(to: Int64(position))
      return ["ok": true]
    }

    Function("skipTo") { (options: [String: Any]) throws -> [String: Any] in
      guard let index = options["index"] as? Int else {
        throw LegatoiOSError(code: .invalidIndex, message: "skipTo.index is required")
      }

      let snapshot = try self.core.playerEngine.skipTo(index: index)
      return ["snapshot": LegatoExpoMapper.snapshotToDictionary(snapshot)]
    }

    Function("skipToNext") { () throws -> [String: Any] in
      try self.core.playerEngine.skipToNext()
      return ["ok": true]
    }

    Function("skipToPrevious") { () throws -> [String: Any] in
      try self.core.playerEngine.skipToPrevious()
      return ["ok": true]
    }

    Function("getState") { () -> [String: Any] in
      let snapshot = self.core.playerEngine.snapshot()
      return ["state": snapshot.state.rawValue]
    }

    Function("getPosition") { () -> Int64 in
      self.core.playerEngine.snapshot().positionMs
    }

    Function("getDuration") { () -> Int64? in
      self.core.playerEngine.snapshot().durationMs
    }

    Function("getCurrentTrack") { () -> [String: Any]? in
      self.core.playerEngine.snapshot().currentTrack.map(LegatoExpoMapper.trackToDictionary)
    }

    Function("getQueue") { () -> [String: Any] in
      let queue = self.core.playerEngine.snapshot().queue
      return LegatoExpoMapper.queueToDictionary(queue)
    }

    Function("getSnapshot") { () -> [String: Any] in
      ["snapshot": LegatoExpoMapper.snapshotToDictionary(self.core.playerEngine.snapshot())]
    }

    Function("getCapabilities") { () -> [String: Any] in
      let snapshot = self.core.playerEngine.snapshot()
      let transport = LegatoiOSTransportCapabilitiesProjector.fromSnapshot(snapshot)
      return ["supported": LegatoExpoMapper.supportedCapabilities(from: transport)]
    }

    Function("removeAllListeners") {
      self.teardownEventForwarding()
    }

    OnStartObserving {
      self.startEventForwarding()
      self.registerLifecycleObservers()
    }

    OnStopObserving {
      self.teardownEventForwarding()
      self.unregisterLifecycleObservers()
    }
  }

  private func startEventForwarding() {
    guard eventListenerID == nil else {
      return
    }

    eventListenerID = core.eventEmitter.addListener { [weak self] event in
      self?.sendEvent(event.name.rawValue, LegatoExpoMapper.payloadToDictionary(event.payload))
    }
  }

  private func teardownEventForwarding() {
    if let eventListenerID {
      core.eventEmitter.removeListener(eventListenerID)
      self.eventListenerID = nil
    }
  }

  private func resolveRemovalIndex(_ options: [String: Any]) throws -> Int {
    if let index = options["index"] as? Int {
      return index
    }

    guard let id = (options["id"] as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
      throw LegatoiOSError(code: .invalidIndex, message: "remove requires index or id")
    }

    let queue = core.playerEngine.snapshot().queue
    guard let resolved = queue.items.firstIndex(where: { $0.id == id }) else {
      throw LegatoiOSError(code: .invalidIndex, message: "remove.id was not found in queue")
    }

    return resolved
  }

  private func registerLifecycleObservers() {
#if canImport(UIKit)
    let center = NotificationCenter.default

    if willEnterForegroundObserver == nil {
      willEnterForegroundObserver = center.addObserver(
        forName: UIApplication.willEnterForegroundNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.core.playerEngine.reassertPlaybackSurfaces()
      }
    }

    if didBecomeActiveObserver == nil {
      didBecomeActiveObserver = center.addObserver(
        forName: UIApplication.didBecomeActiveNotification,
        object: nil,
        queue: .main
      ) { [weak self] _ in
        self?.core.playerEngine.reassertPlaybackSurfaces()
      }
    }
#endif
  }

  private func unregisterLifecycleObservers() {
#if canImport(UIKit)
    let center = NotificationCenter.default

    if let willEnterForegroundObserver {
      center.removeObserver(willEnterForegroundObserver)
      self.willEnterForegroundObserver = nil
    }

    if let didBecomeActiveObserver {
      center.removeObserver(didBecomeActiveObserver)
      self.didBecomeActiveObserver = nil
    }
#endif
  }
}

private enum LegatoExpoMapper {
  private static let alwaysSupportedCapabilities = ["play", "pause", "stop"]

  static func track(from dictionary: [String: Any]) -> LegatoiOSTrack {
    LegatoiOSTrack(
      id: dictionary["id"] as? String ?? "",
      url: dictionary["url"] as? String ?? "",
      title: dictionary["title"] as? String,
      artist: dictionary["artist"] as? String,
      album: dictionary["album"] as? String,
      artwork: dictionary["artwork"] as? String,
      durationMs: int64(from: dictionary["duration"]),
      headers: dictionary["headers"] as? [String: String] ?? [:],
      headerGroupId: dictionary["headerGroupId"] as? String,
      type: (dictionary["type"] as? String).flatMap(LegatoiOSTrackType.init(rawValue:))
    )
  }

  static func setupOptions(from dictionary: [String: Any]) -> LegatoiOSSetupOptions {
    let groups = (dictionary["headerGroups"] as? [[String: Any]] ?? []).compactMap(headerGroup(from:))
    return LegatoiOSSetupOptions(headerGroups: groups)
  }

  static func snapshotToDictionary(_ snapshot: LegatoiOSPlaybackSnapshot) -> [String: Any] {
    [
      "state": snapshot.state.rawValue,
      "currentTrack": snapshot.currentTrack.map(trackToDictionary) ?? NSNull(),
      "currentIndex": snapshot.currentIndex.map { $0 as Any } ?? NSNull(),
      "position": snapshot.positionMs,
      "duration": snapshot.durationMs.map { $0 as Any } ?? NSNull(),
      "bufferedPosition": snapshot.bufferedPositionMs.map { $0 as Any } ?? NSNull(),
      "queue": queueToDictionary(snapshot.queue)
    ]
  }

  static func queueToDictionary(_ queue: LegatoiOSQueueSnapshot) -> [String: Any] {
    [
      "items": queue.items.map(trackToDictionary),
      "currentIndex": queue.currentIndex.map { $0 as Any } ?? NSNull()
    ]
  }

  static func trackToDictionary(_ track: LegatoiOSTrack) -> [String: Any] {
    [
      "id": track.id,
      "url": track.url,
      "title": orNull(track.title),
      "artist": orNull(track.artist),
      "album": orNull(track.album),
      "artwork": orNull(track.artwork),
      "duration": orNull(track.durationMs),
      "headers": track.headers,
      "headerGroupId": orNull(track.headerGroupId),
      "type": orNull(track.type?.rawValue)
    ]
  }

  static func payloadToDictionary(_ payload: LegatoiOSEventPayload?) -> [String: Any] {
    guard let payload else {
      return [:]
    }

    switch payload {
    case .playbackStateChanged(let state):
      return ["state": state.rawValue]
    case .activeTrackChanged(let track, let index):
      return ["track": track.map(trackToDictionary) ?? NSNull(), "index": orNull(index)]
    case .queueChanged(let queue):
      return ["queue": queueToDictionary(queue)]
    case .playbackProgress(let positionMs, let durationMs, let bufferedPositionMs):
      return [
        "position": positionMs,
        "duration": orNull(durationMs),
        "bufferedPosition": orNull(bufferedPositionMs)
      ]
    case .playbackEnded(let snapshot):
      return ["snapshot": snapshotToDictionary(snapshot)]
    case .playbackError(let error):
      return [
        "error": [
          "code": error.code.rawValue,
          "message": error.message,
          "details": String(describing: error.details as Any)
        ]
      ]
    case .remotePlay, .remotePause, .remoteNext, .remotePrevious:
      return [:]
    case .remoteSeek(let positionMs):
      return ["position": positionMs]
    }
  }

  static func supportedCapabilities(from capabilities: LegatoiOSTransportCapabilities) -> [String] {
    var supported = alwaysSupportedCapabilities
    if capabilities.canSeek {
      supported.append("seek")
    }
    if capabilities.canSkipNext {
      supported.append("skip-next")
    }
    if capabilities.canSkipPrevious {
      supported.append("skip-previous")
    }
    return supported
  }

  private static func headerGroup(from dictionary: [String: Any]) -> LegatoiOSHeaderGroup? {
    guard let id = dictionary["id"] as? String else {
      return nil
    }
    return LegatoiOSHeaderGroup(id: id, headers: dictionary["headers"] as? [String: String] ?? [:])
  }

  private static func int64(from value: Any?) -> Int64? {
    switch value {
    case let int as Int:
      return Int64(int)
    case let int64 as Int64:
      return int64
    case let double as Double:
      return Int64(double)
    case let float as Float:
      return Int64(float)
    case let number as NSNumber:
      return number.int64Value
    case let string as String:
      return Int64(string)
    default:
      return nil
    }
  }

  private static func orNull(_ value: Any?) -> Any {
    value ?? NSNull()
  }
}
