import Foundation
import LegatoCore

internal enum LegatoCapacitorMapper {
    static func track(from dictionary: [String: Any]) -> LegatoiOSTrack {
        let type = (dictionary["type"] as? String).flatMap(trackType(from:))
        let headers = dictionary["headers"] as? [String: String] ?? [:]

        return LegatoiOSTrack(
            id: dictionary["id"] as? String ?? "",
            url: dictionary["url"] as? String ?? "",
            title: dictionary["title"] as? String,
            artist: dictionary["artist"] as? String,
            album: dictionary["album"] as? String,
            artwork: dictionary["artwork"] as? String,
            durationMs: int64(from: dictionary["duration"]),
            headers: headers,
            type: type
        )
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
            "type": orNull(track.type?.rawValue)
        ]
    }

    static func errorToDictionary(_ error: LegatoiOSError) -> [String: Any] {
        [
            "code": error.code.rawValue,
            "message": error.message,
            "details": String(describing: error.details as Any)
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
            return [
                "track": track.map(trackToDictionary) ?? NSNull(),
                "index": orNull(index)
            ]
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
            return ["error": errorToDictionary(error)]
        case .remotePlay, .remotePause, .remoteNext, .remotePrevious:
            return [:]
        case .remoteSeek(let positionMs):
            return ["position": positionMs]
        }
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

    private static func trackType(from wire: String) -> LegatoiOSTrackType? {
        LegatoiOSTrackType(rawValue: wire)
    }

    private static func orNull(_ value: Any?) -> Any {
        value ?? NSNull()
    }
}
