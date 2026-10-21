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

/// LOCK-SCREEN LOGGING. When rest starts, the web app hands over the next sets it
/// can log in one tap (each `key` = "exerciseId|setIndex", with a label). The
/// "Log set" intent pops the first one into `pendingKey`; the webview logs those
/// (at the set's planned RPE) as soon as it runs. Lives in the app's own
/// UserDefaults: LiveActivityIntent.perform() runs in the APP process, so no App
/// Group is needed. (Compiled into the widget too; it never calls these.)
enum RestQueue {
    static let queueKey = "powa.restQueue"
    static let pendingKey = "powa.pendingLogs"
    struct Item { let key: String; let label: String }

    static func load() -> [Item] {
        let raw = UserDefaults.standard.array(forKey: queueKey) as? [[String: String]] ?? []
        return raw.compactMap { d in
            guard let k = d["key"], !k.isEmpty else { return nil }
            return Item(key: k, label: d["label"] ?? "")
        }
    }
    static func save(_ items: [Item]) {
        UserDefaults.standard.set(items.map { ["key": $0.key, "label": $0.label] }, forKey: queueKey)
    }
    static func appendPending(_ key: String) {
        var p = UserDefaults.standard.stringArray(forKey: pendingKey) ?? []
        p.append(key)
        UserDefaults.standard.set(p, forKey: pendingKey)
    }
    static func takePending() -> [String] {
        let p = UserDefaults.standard.stringArray(forKey: pendingKey) ?? []
        UserDefaults.standard.removeObject(forKey: pendingKey)
        return p
    }
}

#if canImport(ActivityKit) && canImport(AppIntents)
import ActivityKit
import AppIntents
import UserNotifications

/// REST IS UP. When the app leaves the screen mid-rest, the page arms one local notification
/// (id 8090, native-bridge.js scheduleRestEnd) for the end of the rest. Island taps change the
/// rest while the app sleeps, so they move it (pause drops it, +30 / log set move it, skip
/// drops it). With nothing armed (the app is on screen) they leave notifications alone.
@available(iOS 17.0, *)
enum RestAlert {
    static let id = "8090"   // Capacitor's LocalNotifications uses the numeric id as the identifier

    static func sync(_ state: RestTimerAttributes.ContentState?) async {
        let center = UNUserNotificationCenter.current()
        let armed = await center.pendingNotificationRequests().contains { $0.identifier == id }
        guard armed else { return }
        center.removePendingNotificationRequests(withIdentifiers: [id])
        guard let s = state, !s.paused else { return }
        let secs = s.endDate.timeIntervalSinceNow
        guard secs > 1 else { return }
        let content = UNMutableNotificationContent()
        content.title = "Rest's up"
        content.body = s.canLog && !s.nextLabel.isEmpty ? "Next: " + s.nextLabel : "Time for your next set."
        content.sound = .default
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: secs, repeats: false)
        try? await center.add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}

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
        await RestAlert.sync(state)
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
                         paused: false, pausedRemaining: 0, nextLabel: st.nextLabel, canLog: st.canLog)
        } else {
            // Pause: freeze the remaining time.
            next = .init(endDate: st.endDate,
                         paused: true, pausedRemaining: max(0, st.endDate.timeIntervalSinceNow),
                         nextLabel: st.nextLabel, canLog: st.canLog)
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
                         paused: true, pausedRemaining: max(5, st.pausedRemaining + d),
                         nextLabel: st.nextLabel, canLog: st.canLog)
        } else {
            let end = max(Date().addingTimeInterval(5), st.endDate.addingTimeInterval(d))
            next = .init(endDate: end, paused: false, pausedRemaining: 0, nextLabel: st.nextLabel, canLog: st.canLog)
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
        await RestAlert.sync(nil)
        RestIntentCore.notifyJS(action: "stop", endMs: 0, paused: false, remainingMs: 0)
        return .result()
    }
}

/// Logs the next set (at its planned RPE) from the Lock Screen / island, then
/// restarts the rest countdown and shows the set after it.
@available(iOS 17.0, *)
struct RestLogSetIntent: LiveActivityIntent {
    static var title: LocalizedStringResource = "Log the next set"
    static var openAppWhenRun: Bool = false

    func perform() async throws -> some IntentResult {
        guard let a = RestIntentCore.current() else { return .result() }
        var queue = RestQueue.load()
        guard !queue.isEmpty else { return .result() }
        let done = queue.removeFirst()
        RestQueue.save(queue)
        RestQueue.appendPending(done.key)
        let rest = max(30, a.attributes.totalSeconds)
        let next = RestTimerAttributes.ContentState(
            endDate: Date().addingTimeInterval(rest), paused: false, pausedRemaining: 0,
            nextLabel: queue.first?.label ?? "Logged. Open POWALIFTA for the next one",
            canLog: !queue.isEmpty)
        await RestIntentCore.apply(a, next, action: "logSet")
        return .result()
    }
}
#endif
