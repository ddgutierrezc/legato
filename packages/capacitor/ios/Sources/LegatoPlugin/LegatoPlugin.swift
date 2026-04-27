import Capacitor
import Foundation
import LegatoCore
#if canImport(UIKit)
import UIKit
#endif

@objc(LegatoPlugin)
public final class LegatoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LegatoPlugin"
    public let jsName = "Legato"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "setup", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "add", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reset", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "pause", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "seekTo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skipTo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skipToNext", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "skipToPrevious", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPosition", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDuration", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentTrack", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getQueue", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSnapshot", returnType: CAPPluginReturnPromise)
    ]

    private let core = LegatoiOSCoreFactory.make()
    private var eventListenerID: UUID?
    private var willEnterForegroundObserver: NSObjectProtocol?
    private var didBecomeActiveObserver: NSObjectProtocol?

    public override func load() {
        super.load()

        eventListenerID = core.eventEmitter.addListener { [weak self] event in
            self?.notifyListeners(event.name.rawValue, data: LegatoCapacitorMapper.payloadToDictionary(event.payload))
        }

        registerLifecycleObservers()
    }

    deinit {
        if let eventListenerID {
            core.eventEmitter.removeListener(eventListenerID)
        }
        unregisterLifecycleObservers()
        core.playerEngine.release()
    }

    @objc func setup(_ call: CAPPluginCall) {
        do {
            try core.playerEngine.setup()
            call.resolve(["ok": true])
        } catch {
            reject(call, error)
        }
    }

    @objc func add(_ call: CAPPluginCall) {
        do {
            let rawTracks = call.getArray("tracks") ?? []
            let tracks = rawTracks.compactMap { $0 as? [String: Any] }.map(LegatoCapacitorMapper.track)

            if let startIndex = call.getInt("startIndex") {
                let mergedItems = core.playerEngine.snapshot().queue.items + tracks
                try core.playerEngine.load(tracks: mergedItems, startIndex: startIndex)
                let snapshot = core.playerEngine.snapshot()
                call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(snapshot)])
                return
            }

            let snapshot = try core.playerEngine.appendToQueue(tracks)
            call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(snapshot)])
        } catch {
            reject(call, error)
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        do {
            let index = try resolveRemovalIndex(call)
            let snapshot = try core.playerEngine.removeFromQueue(at: index)
            call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(snapshot)])
        } catch {
            reject(call, error)
        }
    }

    @objc func reset(_ call: CAPPluginCall) {
        do {
            let snapshot = try core.playerEngine.resetQueue()
            call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(snapshot)])
        } catch {
            reject(call, error)
        }
    }

    @objc func play(_ call: CAPPluginCall) {
        do {
            try core.playerEngine.play()
            call.resolve(["ok": true])
        } catch {
            reject(call, error)
        }
    }

    @objc func pause(_ call: CAPPluginCall) {
        do {
            try core.playerEngine.pause()
            call.resolve(["ok": true])
        } catch {
            reject(call, error)
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        do {
            try core.playerEngine.stop()
            call.resolve(["ok": true])
        } catch {
            reject(call, error)
        }
    }

    @objc func seekTo(_ call: CAPPluginCall) {
        do {
            guard let position = call.getDouble("position") else {
                throw LegatoiOSError(code: .seekFailed, message: "seekTo.position is required")
            }

            try core.playerEngine.seek(to: Int64(position))
            call.resolve(["ok": true])
        } catch {
            reject(call, error)
        }
    }

    @objc func skipTo(_ call: CAPPluginCall) {
        do {
            guard let index = call.getInt("index") else {
                throw LegatoiOSError(code: .invalidIndex, message: "skipTo.index is required")
            }

            let snapshot = try core.playerEngine.skipTo(index: index)
            call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(snapshot)])
        } catch {
            reject(call, error)
        }
    }

    @objc func skipToNext(_ call: CAPPluginCall) {
        do {
            try core.playerEngine.skipToNext()
            call.resolve(["ok": true])
        } catch {
            reject(call, error)
        }
    }

    @objc func skipToPrevious(_ call: CAPPluginCall) {
        do {
            try core.playerEngine.skipToPrevious()
            call.resolve(["ok": true])
        } catch {
            reject(call, error)
        }
    }

    @objc func getState(_ call: CAPPluginCall) {
        let snapshot = core.playerEngine.snapshot()
        call.resolve(["state": snapshot.state.rawValue])
    }

    @objc func getPosition(_ call: CAPPluginCall) {
        let snapshot = core.playerEngine.snapshot()
        call.resolve(["position": snapshot.positionMs])
    }

    @objc func getDuration(_ call: CAPPluginCall) {
        let snapshot = core.playerEngine.snapshot()
        call.resolve(["duration": snapshot.durationMs ?? NSNull()])
    }

    @objc func getCurrentTrack(_ call: CAPPluginCall) {
        let snapshot = core.playerEngine.snapshot()
        call.resolve(["track": snapshot.currentTrack.map(LegatoCapacitorMapper.trackToDictionary) ?? NSNull()])
    }

    @objc func getQueue(_ call: CAPPluginCall) {
        let snapshot = core.playerEngine.snapshot()
        call.resolve(["queue": LegatoCapacitorMapper.queueToDictionary(snapshot.queue)])
    }

    @objc func getSnapshot(_ call: CAPPluginCall) {
        call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(core.playerEngine.snapshot())])
    }

    private func resolveRemovalIndex(_ call: CAPPluginCall) throws -> Int {
        if let index = call.getInt("index") {
            return index
        }

        guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
            throw LegatoiOSError(code: .invalidIndex, message: "remove requires index or id")
        }

        let queue = core.playerEngine.snapshot().queue
        guard let resolved = queue.items.firstIndex(where: { $0.id == id }) else {
            throw LegatoiOSError(code: .invalidIndex, message: "remove.id was not found in queue")
        }

        return resolved
    }

    private func reject(_ call: CAPPluginCall, _ error: Error) {
        let mapped: LegatoiOSError
        if let known = error as? LegatoiOSError {
            mapped = known
        } else {
            mapped = core.errorMapper.map(error)
        }
        call.reject(mapped.message, mapped.code.rawValue, error)
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
