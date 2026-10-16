//
//  RestTimerIntents.swift
//  POWALIFTA — App Intents that make the rest-timer Live Activity interactive.
//
//  Compiled into BOTH the App target and the PowaWidget extension (the widget needs
//  the types to render Button(intent:); conforming to LiveActivityIntent makes the
//  system execute perform() in the APP's process — launching it in the background if
//  needed — so the buttons work even while the app is suspended in the pocket).
//
//  Each intent mutates the Activity's ContentState directly via ActivityKit (the
//  island/lock-screen UI updates instantly, no push needed) and then posts a
//  NotificationCenter notification that RestTimerPlugin forwards to the webview as a
//  "restAction" plugin event, so the in-page timer reconciles to the same state.
//
//  All iOS 17.0+ (Button(intent:) in Live Activities is 17-only). On 16.x the widget
//  simply renders without controls — display-only, exactly as before.
//
import Foundation

// Bridge channel to RestTimerPlugin (no availability gate — it's just a name).
extension Notification.Name {
    static let powaRestAction = Notification.Name("PowaRestAction")
}

#if canImport(ActivityKit) && canImport(AppIntents)
import ActivityKit
import AppIntents

@available(iOS 17.0, *)
enum RestIntentCore {
    static func current() -> Activity<RestTimerAttributes>? {
        Activity<RestTimerAttributes>.activities.first
    }

    /// Push the new state to the Live Activity and mirror it to the webview.
    /// `remaining` travels in MILLISECONDS (matches the JS timer's ms-epoch model).
    static func apply(_ activity: Activity<RestTimerAttributes>,
                      _ state: RestTimerAttributes.ContentState,
                      action: String) async {
        await activity.update(ActivityContent(state: state, staleDate: state.endDate.addingTimeInterval(300)))
        notifyJS(action: action,
                 endMs: state.endDate.timeIntervalSince1970 * 1000,
                 paused: state.paused,
                 remainingMs: state.paused
                    ? state.pausedRemaining * 1000
                    : max(0, state.endDate.timeIntervalSinceNow) * 1000)
    }

    static func notifyJS(action: String, endMs: Double, paused: Bool, remainingMs: Double) {
        NotificationCenter.default.post(name: .powaRestAction, object: nil, userInfo: [
            "action": action, "endTime": endMs, "paused": paused, "remaining": remainingMs
        ])
    }
}

@available(iOS 17.0, *)
struct RestPauseResumeIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Pause or resume rest timer"
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        guard let a = RestIntentCore.current() else { return .result() }
        let st = a.content.state
        let next: RestTimerAttributes.ContentState
        if st.paused {
            // Resume: new deadline = now + what was left when paused.
            next = .init(endDate: Date().addingTimeInterval(max(1, st.pausedRemaining)),
                         paused: false, pausedRemaining: 0)
        } else {
            // Pause: freeze the remaining time.
            next = .init(endDate: st.endDate,
                         paused: true, pausedRemaining: max(0, st.endDate.timeIntervalSinceNow))
        }
        await RestIntentCore.apply(a, next, action: st.paused ? "resume" : "pause")
        return .result()
    }
}

@available(iOS 17.0, *)
struct RestAdjustIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Adjust rest time"
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Seconds") var seconds: Int

    init() {}
    init(seconds: Int) { self.seconds = seconds }

    func perform() async throws -> some IntentResult {
        guard let a = RestIntentCore.current() else { return .result() }
        let st = a.content.state
        let d = Double(seconds)
        let next: RestTimerAttributes.ContentState
        if st.paused {
            // Mirror the JS floor: never adjust below 5s remaining.
            next = .init(endDate: st.endDate,
                         paused: true, pausedRemaining: max(5, st.pausedRemaining + d))
        } else {
            let end = max(Date().addingTimeInterval(5), st.endDate.addingTimeInterval(d))
            next = .init(endDate: end, paused: false, pausedRemaining: 0)
        }
        await RestIntentCore.apply(a, next, action: "adjust")
        return .result()
    }
}

@available(iOS 17.0, *)
struct RestStopIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Skip rest"
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        for a in Activity<RestTimerAttributes>.activities {
            await a.end(nil, dismissalPolicy: .immediate)
        }
        RestIntentCore.notifyJS(action: "stop", endMs: 0, paused: false, remainingMs: 0)
        return .result()
    }
}
#endif
