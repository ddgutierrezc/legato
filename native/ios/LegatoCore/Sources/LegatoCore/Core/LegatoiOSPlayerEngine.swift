import Foundation

public final class LegatoiOSPlayerEngine {
    private let queueManager: LegatoiOSQueueManager
    private let eventEmitter: LegatoiOSEventEmitter
    private let snapshotStore: LegatoiOSSnapshotStore
    private let trackMapper: LegatoiOSTrackMapper
    private let errorMapper: LegatoiOSErrorMapper
    private let stateMachine: LegatoiOSStateMachine
    private let sessionManager: LegatoiOSSessionManager
    private let nowPlayingManager: LegatoiOSNowPlayingManager
    private let remoteCommandManager: LegatoiOSRemoteCommandManager
    private let playbackRuntime: LegatoiOSPlaybackRuntime

    private var isSetup = false

    public init(
        queueManager: LegatoiOSQueueManager,
        eventEmitter: LegatoiOSEventEmitter,
        snapshotStore: LegatoiOSSnapshotStore,
        trackMapper: LegatoiOSTrackMapper,
        errorMapper: LegatoiOSErrorMapper,
        stateMachine: LegatoiOSStateMachine,
        sessionManager: LegatoiOSSessionManager,
        nowPlayingManager: LegatoiOSNowPlayingManager,
        remoteCommandManager: LegatoiOSRemoteCommandManager,
        playbackRuntime: LegatoiOSPlaybackRuntime
    ) {
        self.queueManager = queueManager
        self.eventEmitter = eventEmitter
        self.snapshotStore = snapshotStore
        self.trackMapper = trackMapper
        self.errorMapper = errorMapper
        self.stateMachine = stateMachine
        self.sessionManager = sessionManager
        self.nowPlayingManager = nowPlayingManager
        self.remoteCommandManager = remoteCommandManager
        self.playbackRuntime = playbackRuntime
    }

    public func setup() throws {
        if isSetup {
            return
        }

        sessionManager.configureSession()
        remoteCommandManager.bind(handler: onRemoteCommand)
        playbackRuntime.configure()
        isSetup = true
    }

    public func load(tracks: [LegatoiOSTrack], startIndex: Int? = nil) throws {
        try guardSetup()

        do {
            let mappedTracks = try trackMapper.mapContractTracks(tracks)
            let queueSnapshot = try queueManager.replaceQueue(mappedTracks, startIndex: startIndex)
            try playbackRuntime.replaceQueue(items: mappedTracks.map(toRuntimeTrackSource), startIndex: startIndex)
            let runtimeSnapshot = playbackRuntime.snapshot()
            let currentTrack = queueManager.getCurrentTrack()
            let currentState = snapshotStore.getPlaybackSnapshot().state
            let loadingState = stateMachine.reduce(current: currentState, event: .prepare)
            let readyState = stateMachine.reduce(current: loadingState, event: .prepared)

            let snapshot = LegatoiOSPlaybackSnapshot(
                state: readyState,
                currentTrack: currentTrack,
                currentIndex: runtimeSnapshot.currentIndex ?? queueSnapshot.currentIndex,
                positionMs: runtimeSnapshot.progress.positionMs,
                durationMs: runtimeSnapshot.progress.durationMs ?? currentTrack?.durationMs,
                bufferedPositionMs: runtimeSnapshot.progress.bufferedPositionMs,
                queue: queueSnapshot
            )

            snapshotStore.replacePlaybackSnapshot(snapshot)
            publishQueueAndTrack(snapshot)
            publishState(snapshot.state)
            publishMetadata(snapshot.currentTrack)
            publishProgress(snapshot)
        } catch {
            publishPlatformFailure(error)
            throw error
        }
    }

    public func play() throws {
        try guardSetup()
        try performRuntimeOperation {
            try playbackRuntime.play()
        }
        transition(event: .play)
    }

    public func pause() throws {
        try guardSetup()
        try performRuntimeOperation {
            try playbackRuntime.pause()
        }
        transition(event: .pause)
    }

    public func stop() throws {
        try guardSetup()
        try performRuntimeOperation {
            try playbackRuntime.stop(resetPosition: true)
        }
        transition(event: .stop)
        let runtimeSnapshot = playbackRuntime.snapshot()
        snapshotStore.updatePlaybackSnapshot {
            LegatoiOSPlaybackSnapshot(
                state: $0.state,
                currentTrack: $0.currentTrack,
                currentIndex: $0.currentIndex,
                positionMs: runtimeSnapshot.progress.positionMs,
                durationMs: runtimeSnapshot.progress.durationMs ?? $0.durationMs,
                bufferedPositionMs: runtimeSnapshot.progress.bufferedPositionMs,
                queue: $0.queue
            )
        }
        publishProgress(snapshotStore.getPlaybackSnapshot())
    }

    public func seek(to positionMs: Int64) throws {
        try guardSetup()
        try performRuntimeOperation {
            try playbackRuntime.seek(to: positionMs)
        }
        let runtimeSnapshot = playbackRuntime.snapshot()
        snapshotStore.updatePlaybackSnapshot {
            LegatoiOSPlaybackSnapshot(
                state: $0.state,
                currentTrack: $0.currentTrack,
                currentIndex: $0.currentIndex,
                positionMs: runtimeSnapshot.progress.positionMs,
                durationMs: runtimeSnapshot.progress.durationMs ?? $0.durationMs,
                bufferedPositionMs: runtimeSnapshot.progress.bufferedPositionMs,
                queue: $0.queue
            )
        }
        publishProgress(snapshotStore.getPlaybackSnapshot())
    }

    public func skipToNext() throws {
        try guardSetup()
        guard let movedIndex = queueManager.moveToNext() else {
            return
        }

        try performRuntimeOperation {
            try playbackRuntime.selectIndex(movedIndex)
        }

        let runtimeSnapshot = playbackRuntime.snapshot()
        let track = queueManager.getCurrentTrack()
        snapshotStore.updatePlaybackSnapshot {
            LegatoiOSPlaybackSnapshot(
                state: $0.state,
                currentTrack: track,
                currentIndex: runtimeSnapshot.currentIndex ?? movedIndex,
                positionMs: runtimeSnapshot.progress.positionMs,
                durationMs: runtimeSnapshot.progress.durationMs ?? track?.durationMs,
                bufferedPositionMs: runtimeSnapshot.progress.bufferedPositionMs,
                queue: queueManager.getQueueSnapshot()
            )
        }

        let snapshot = snapshotStore.getPlaybackSnapshot()
        publishQueueAndTrack(snapshot)
        publishMetadata(track)
        publishProgress(snapshot)
    }

    public func skipToPrevious() throws {
        try guardSetup()
        guard let movedIndex = queueManager.moveToPrevious() else {
            return
        }

        try performRuntimeOperation {
            try playbackRuntime.selectIndex(movedIndex)
        }

        let runtimeSnapshot = playbackRuntime.snapshot()
        let track = queueManager.getCurrentTrack()
        snapshotStore.updatePlaybackSnapshot {
            LegatoiOSPlaybackSnapshot(
                state: $0.state,
                currentTrack: track,
                currentIndex: runtimeSnapshot.currentIndex ?? movedIndex,
                positionMs: runtimeSnapshot.progress.positionMs,
                durationMs: runtimeSnapshot.progress.durationMs ?? track?.durationMs,
                bufferedPositionMs: runtimeSnapshot.progress.bufferedPositionMs,
                queue: queueManager.getQueueSnapshot()
            )
        }

        let snapshot = snapshotStore.getPlaybackSnapshot()
        publishQueueAndTrack(snapshot)
        publishMetadata(track)
        publishProgress(snapshot)
    }

    public func snapshot() -> LegatoiOSPlaybackSnapshot {
        snapshotStore.getPlaybackSnapshot()
    }

    public func release() {
        guard isSetup else {
            return
        }

        remoteCommandManager.unbind()
        playbackRuntime.release()
        nowPlayingManager.clear()
        sessionManager.releaseSession()
        isSetup = false
    }

    private func toRuntimeTrackSource(_ track: LegatoiOSTrack) -> LegatoiOSRuntimeTrackSource {
        LegatoiOSRuntimeTrackSource(id: track.id, url: track.url, headers: track.headers, type: track.type)
    }

    private func guardSetup() throws {
        guard isSetup else {
            let error = errorMapper.playerNotSetup()
            eventEmitter.emit(name: .playbackError, payload: .playbackError(error: error))
            throw error
        }
    }

    private func transition(event: LegatoiOSStateInput) {
        let previous = snapshotStore.getPlaybackSnapshot()
        let next = stateMachine.reduce(current: previous.state, event: event)
        guard next != previous.state else {
            return
        }

        snapshotStore.updatePlaybackSnapshot {
            LegatoiOSPlaybackSnapshot(
                state: next,
                currentTrack: $0.currentTrack,
                currentIndex: $0.currentIndex,
                positionMs: $0.positionMs,
                durationMs: $0.durationMs,
                bufferedPositionMs: $0.bufferedPositionMs,
                queue: $0.queue
            )
        }

        publishState(next)
    }

    private func publishQueueAndTrack(_ snapshot: LegatoiOSPlaybackSnapshot) {
        eventEmitter.emit(name: .playbackQueueChanged, payload: .queueChanged(snapshot: snapshot.queue))
        eventEmitter.emit(
            name: .playbackActiveTrackChanged,
            payload: .activeTrackChanged(track: snapshot.currentTrack, index: snapshot.currentIndex)
        )
    }

    private func publishState(_ state: LegatoiOSPlaybackState) {
        eventEmitter.emit(name: .playbackStateChanged, payload: .playbackStateChanged(state: state))
        sessionManager.updatePlaybackState(state)
        remoteCommandManager.updatePlaybackState(state)
    }

    private func publishProgress(_ snapshot: LegatoiOSPlaybackSnapshot) {
        let progress = LegatoiOSProgressUpdate(
            positionMs: snapshot.positionMs,
            durationMs: snapshot.durationMs,
            bufferedPositionMs: snapshot.bufferedPositionMs
        )

        eventEmitter.emit(
            name: .playbackProgress,
            payload: .playbackProgress(
                positionMs: progress.positionMs,
                durationMs: progress.durationMs,
                bufferedPositionMs: progress.bufferedPositionMs
            )
        )
        nowPlayingManager.updateProgress(progress)
    }

    private func publishMetadata(_ track: LegatoiOSTrack?) {
        let metadata = track.map {
            LegatoiOSNowPlayingMetadata(
                trackId: $0.id,
                title: $0.title,
                artist: $0.artist,
                album: $0.album,
                artwork: $0.artwork,
                durationMs: $0.durationMs
            )
        }

        nowPlayingManager.updateMetadata(metadata)
    }

    private func publishPlatformFailure(_ error: Error) {
        let mapped = errorMapper.map(error)
        let previous = snapshotStore.getPlaybackSnapshot()
        let next = stateMachine.reduce(current: previous.state, event: .fail)

        snapshotStore.updatePlaybackSnapshot {
            LegatoiOSPlaybackSnapshot(
                state: next,
                currentTrack: $0.currentTrack,
                currentIndex: $0.currentIndex,
                positionMs: $0.positionMs,
                durationMs: $0.durationMs,
                bufferedPositionMs: $0.bufferedPositionMs,
                queue: $0.queue
            )
        }

        eventEmitter.emit(name: .playbackError, payload: .playbackError(error: mapped))
        publishState(next)
    }

    private func performRuntimeOperation(_ operation: () throws -> Void) throws {
        do {
            try operation()
        } catch {
            publishPlatformFailure(error)
            throw error
        }
    }

    private func onRemoteCommand(_ command: LegatoiOSRemoteCommand) {
        switch command {
        case .play:
            eventEmitter.emit(name: .remotePlay, payload: .remotePlay)
        case .pause:
            eventEmitter.emit(name: .remotePause, payload: .remotePause)
        case .next:
            eventEmitter.emit(name: .remoteNext, payload: .remoteNext)
        case .previous:
            eventEmitter.emit(name: .remotePrevious, payload: .remotePrevious)
        case .seek(let positionMs):
            eventEmitter.emit(name: .remoteSeek, payload: .remoteSeek(positionMs: positionMs))
        }

        // TODO(phase-4): Route remote commands through canonical transport command handlers.
    }
}
