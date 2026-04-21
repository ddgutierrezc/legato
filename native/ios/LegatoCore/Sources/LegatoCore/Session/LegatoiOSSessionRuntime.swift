import AVFAudio
import Foundation

public enum LegatoiOSSessionSignal {
    case interruptionBegan
    case interruptionEnded(shouldResume: Bool)
    case outputRouteRemoved
    case runtimeError(message: String)
}

/// Seam for AVAudioSession-facing runtime integration.
public protocol LegatoiOSSessionRuntime: AnyObject {
    var onSignal: ((LegatoiOSSessionSignal) -> Void)? { get set }
    func configureSession()
    func updatePlaybackState(_ state: LegatoiOSPlaybackState)
    func releaseSession()
}

public final class LegatoiOSNoopSessionRuntime: LegatoiOSSessionRuntime {
    public var onSignal: ((LegatoiOSSessionSignal) -> Void)?

    public init() {}

    public func configureSession() {
        // Intentionally no-op. AVAudioSession activation/interruption wiring is pending.
    }

    public func updatePlaybackState(_ state: LegatoiOSPlaybackState) {
        // Intentionally no-op.
    }

    public func releaseSession() {
        // Intentionally no-op.
    }
}

public final class LegatoiOSAVAudioSessionRuntime: LegatoiOSSessionRuntime {
    public var onSignal: ((LegatoiOSSessionSignal) -> Void)?

    private let audioSession: AVAudioSession
    private let notificationCenter: NotificationCenter

    private var isConfigured = false
    private var isSessionActive = false
    private var interruptionObserver: NSObjectProtocol?
    private var routeChangeObserver: NSObjectProtocol?

    public init(
        audioSession: AVAudioSession = .sharedInstance(),
        notificationCenter: NotificationCenter = .default
    ) {
        self.audioSession = audioSession
        self.notificationCenter = notificationCenter
    }

    public func configureSession() {
        guard !isConfigured else {
            return
        }

        do {
            try audioSession.setCategory(.playback, mode: .default, options: [])
            registerNotificationsIfNeeded()
            isConfigured = true
        } catch {
            onSignal?(.runtimeError(message: "Failed to configure AVAudioSession: \(error.localizedDescription)"))
        }
    }

    public func updatePlaybackState(_ state: LegatoiOSPlaybackState) {
        switch state {
        case .loading, .ready, .playing, .paused, .buffering:
            setSessionActive(true)
        case .idle, .ended, .error:
            setSessionActive(false)
        }
    }

    public func releaseSession() {
        removeObservers()
        setSessionActive(false)
        isConfigured = false
    }

    private func setSessionActive(_ shouldBeActive: Bool) {
        guard shouldBeActive != isSessionActive else {
            return
        }

        do {
            if shouldBeActive {
                try audioSession.setActive(true)
            } else {
                try audioSession.setActive(false, options: [.notifyOthersOnDeactivation])
            }
            isSessionActive = shouldBeActive
        } catch {
            let action = shouldBeActive ? "activate" : "deactivate"
            onSignal?(.runtimeError(message: "Failed to \(action) AVAudioSession: \(error.localizedDescription)"))
        }
    }

    private func registerNotificationsIfNeeded() {
        if interruptionObserver == nil {
            interruptionObserver = notificationCenter.addObserver(
                forName: AVAudioSession.interruptionNotification,
                object: audioSession,
                queue: nil
            ) { [weak self] notification in
                self?.handleInterruptionNotification(notification)
            }
        }

        if routeChangeObserver == nil {
            routeChangeObserver = notificationCenter.addObserver(
                forName: AVAudioSession.routeChangeNotification,
                object: audioSession,
                queue: nil
            ) { [weak self] notification in
                self?.handleRouteChangeNotification(notification)
            }
        }
    }

    private func handleInterruptionNotification(_ notification: Notification) {
        guard
            let typeRaw = notification.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            let type = AVAudioSession.InterruptionType(rawValue: typeRaw)
        else {
            return
        }

        switch type {
        case .began:
            onSignal?(.interruptionBegan)
        case .ended:
            let optionsRaw = notification.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
            onSignal?(.interruptionEnded(shouldResume: options.contains(.shouldResume)))
        @unknown default:
            break
        }
    }

    private func handleRouteChangeNotification(_ notification: Notification) {
        guard
            let reasonRaw = notification.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
            let reason = AVAudioSession.RouteChangeReason(rawValue: reasonRaw)
        else {
            return
        }

        switch reason {
        case .oldDeviceUnavailable, .noSuitableRouteForCategory:
            onSignal?(.outputRouteRemoved)
        default:
            break
        }
    }

    private func removeObservers() {
        if let interruptionObserver {
            notificationCenter.removeObserver(interruptionObserver)
            self.interruptionObserver = nil
        }

        if let routeChangeObserver {
            notificationCenter.removeObserver(routeChangeObserver)
            self.routeChangeObserver = nil
        }
    }
}
