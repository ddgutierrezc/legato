import Capacitor
import Foundation
import LegatoCore

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

    public override func load() {
        super.load()

        eventListenerID = core.eventEmitter.addListener { [weak self] event in
            self?.notifyListeners(event.name.rawValue, data: LegatoCapacitorMapper.payloadToDictionary(event.payload))
        }
    }

    deinit {
        if let eventListenerID {
            core.eventEmitter.removeListener(eventListenerID)
        }
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
            let mappedTracks = try core.trackMapper.mapContractTracks(tracks)

            let queueSnapshot: LegatoiOSQueueSnapshot
            if let startIndex = call.getInt("startIndex") {
                let mergedItems = core.queueManager.getQueueSnapshot().items + mappedTracks
                queueSnapshot = try core.queueManager.replaceQueue(mergedItems, startIndex: startIndex)
            } else {
                queueSnapshot = core.queueManager.addToQueue(mappedTracks)
            }

            let previous = core.snapshotStore.getPlaybackSnapshot()
            let next = snapshotWithQueue(previous: previous, queue: queueSnapshot)
            core.snapshotStore.replacePlaybackSnapshot(next)
            publishQueueTrackProgress(next)

            if previous.state != next.state {
                core.eventEmitter.emit(name: .playbackStateChanged, payload: .playbackStateChanged(state: next.state))
            }

            call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(next)])
        } catch {
            reject(call, error)
        }
    }

    @objc func remove(_ call: CAPPluginCall) {
        do {
            let index = try resolveRemovalIndex(call)
            let queue = core.queueManager.getQueueSnapshot()

            guard queue.items.indices.contains(index) else {
                throw LegatoiOSError(code: .invalidIndex, message: "remove index out of bounds")
            }

            var items = queue.items
            items.remove(at: index)

            let previous = core.snapshotStore.getPlaybackSnapshot()
            if items.isEmpty {
                core.queueManager.clear()
                core.snapshotStore.replacePlaybackSnapshot(LegatoiOSSnapshotStore.emptySnapshot)
            } else {
                let nextIndex: Int
                if let currentIndex = queue.currentIndex {
                    if currentIndex > index {
                        nextIndex = currentIndex - 1
                    } else if currentIndex == index {
                        nextIndex = min(index, items.count - 1)
                    } else {
                        nextIndex = min(currentIndex, items.count - 1)
                    }
                } else {
                    nextIndex = 0
                }

                let nextQueue = try core.queueManager.replaceQueue(items, startIndex: nextIndex)
                core.snapshotStore.replacePlaybackSnapshot(snapshotWithQueue(previous: previous, queue: nextQueue))
            }

            let next = core.snapshotStore.getPlaybackSnapshot()
            publishQueueTrackProgress(next)
            if previous.state != next.state {
                core.eventEmitter.emit(name: .playbackStateChanged, payload: .playbackStateChanged(state: next.state))
            }

            call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(next)])
        } catch {
            reject(call, error)
        }
    }

    @objc func reset(_ call: CAPPluginCall) {
        core.queueManager.clear()
        core.snapshotStore.replacePlaybackSnapshot(LegatoiOSSnapshotStore.emptySnapshot)

        let snapshot = core.snapshotStore.getPlaybackSnapshot()
        publishQueueTrackProgress(snapshot)
        core.eventEmitter.emit(name: .playbackStateChanged, payload: .playbackStateChanged(state: snapshot.state))

        call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(snapshot)])
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

            let queue = core.queueManager.getQueueSnapshot()
            guard queue.items.indices.contains(index) else {
                throw LegatoiOSError(code: .invalidIndex, message: "skipTo.index out of bounds")
            }

            let nextQueue = try core.queueManager.replaceQueue(queue.items, startIndex: index)
            let previous = core.snapshotStore.getPlaybackSnapshot()
            let next = snapshotWithQueue(previous: previous, queue: nextQueue)
            core.snapshotStore.replacePlaybackSnapshot(next)
            publishQueueTrackProgress(next)
            call.resolve(["snapshot": LegatoCapacitorMapper.snapshotToDictionary(next)])
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

    private func publishQueueTrackProgress(_ snapshot: LegatoiOSPlaybackSnapshot) {
        core.eventEmitter.emit(name: .playbackQueueChanged, payload: .queueChanged(snapshot: snapshot.queue))
        core.eventEmitter.emit(
            name: .playbackActiveTrackChanged,
            payload: .activeTrackChanged(track: snapshot.currentTrack, index: snapshot.currentIndex)
        )
        core.eventEmitter.emit(
            name: .playbackProgress,
            payload: .playbackProgress(
                positionMs: snapshot.positionMs,
                durationMs: snapshot.durationMs,
                bufferedPositionMs: snapshot.bufferedPositionMs
            )
        )
    }

    private func snapshotWithQueue(
        previous: LegatoiOSPlaybackSnapshot,
        queue: LegatoiOSQueueSnapshot
    ) -> LegatoiOSPlaybackSnapshot {
        let fallbackIndex = queue.items.isEmpty ? nil : 0
        let nextIndex = queue.currentIndex ?? fallbackIndex
        let track = nextIndex.flatMap { queue.items.indices.contains($0) ? queue.items[$0] : nil }

        let nextState: LegatoiOSPlaybackState
        if queue.items.isEmpty {
            nextState = .idle
        } else if previous.state == .idle {
            nextState = .ready
        } else {
            nextState = previous.state
        }

        let sameTrack = previous.currentTrack?.id == track?.id

        return LegatoiOSPlaybackSnapshot(
            state: nextState,
            currentTrack: track,
            currentIndex: nextIndex,
            positionMs: sameTrack ? previous.positionMs : 0,
            durationMs: track?.durationMs,
            bufferedPositionMs: sameTrack ? previous.bufferedPositionMs : 0,
            queue: queue
        )
    }

    private func resolveRemovalIndex(_ call: CAPPluginCall) throws -> Int {
        if let index = call.getInt("index") {
            return index
        }

        guard let id = call.getString("id")?.trimmingCharacters(in: .whitespacesAndNewlines), !id.isEmpty else {
            throw LegatoiOSError(code: .invalidIndex, message: "remove requires index or id")
        }

        let queue = core.queueManager.getQueueSnapshot()
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
}
