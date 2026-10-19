//
//  RestTimerPlugin.swift
//  POWALIFTA — Capacitor plugin bridging the web rest timer to an iOS Live Activity.
//
//  JS name: "RestTimer". The web app (athlete.html) already calls, feature-detected:
//      window.Capacitor.Plugins.RestTimer.start({ endTime, total, label, queue })
//      window.Capacitor.Plugins.RestTimer.takePendingLogs() → { keys }
//      window.Capacitor.Plugins.RestTimer.update({ endTime, paused })
//      window.Capacitor.Plugins.RestTimer.stop()
//  so this plugin lights up the Dynamic Island / Lock Screen countdown without any
//  change to the web UI. Everything is gated on iOS 16.1+ and ActivityKit being
//  available/enabled; on anything older (or if the user disabled Live Activities)
//  every call is a graceful no-op and the in-page timer keeps working unchanged.
//
//  Registered via CAPBridgedPlugin (Capacitor 6) — no ObjC .m file needed.
//
import Foundation
import Capacitor

#if canImport(ActivityKit)
import ActivityKit
#endif

@objc(RestTimerPlugin)
public class RestTimerPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "RestTimerPlugin"
    public let jsName = "RestTimer"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getState", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePendingLogs", returnType: CAPPluginReturnPromise)
    ]

    // Island buttons (RestTimerIntents) → NotificationCenter → webview "restAction"
    // event, so the in-page timer mirrors what the lifter did on the Dynamic Island.
    override public func load() {
        NotificationCenter.default.addObserver(
            forName: .powaRestAction, object: nil, queue: .main
        ) { [weak self] note in
            guard let self = self, let info = note.userInfo else { return }
            self.notifyListeners("restAction", data: [
                "action": info["action"] as? String ?? "",
                "endTime": info["endTime"] as? Double ?? 0,
                "paused": info["paused"] as? Bool ?? false,
                "remaining": info["remaining"] as? Double ?? 0
            ])
        }
    }

    // Convert the JS millisecond epoch into a Date.
    private func date(fromMs ms: Double) -> Date {
        return Date(timeIntervalSince1970: ms / 1000.0)
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            call.resolve(["supported": ActivityAuthorizationInfo().areActivitiesEnabled])
            return
        }
        #endif
        call.resolve(["supported": false])
    }

    @objc func start(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            guard ActivityAuthorizationInfo().areActivitiesEnabled else {
                call.resolve(["started": false, "reason": "disabled"]); return
            }
            let endMs = call.getDouble("endTime") ?? (Date().timeIntervalSince1970 * 1000 + 90_000)
            let total = call.getDouble("total") ?? 90
            let label = call.getString("label") ?? "Rest"
            let end = date(fromMs: endMs)
            // The next sets the Lock Screen can log, in order: [{ key, label }].
            let queue: [RestQueue.Item] = (call.getArray("queue") ?? []).compactMap { v in
                guard let d = v as? [String: Any], let k = d["key"] as? String, !k.isEmpty else { return nil }
                return RestQueue.Item(key: k, label: (d["label"] as? String) ?? "")
            }
            RestQueue.save(queue)

            // Only one rest Activity at a time — clear any straggler first.
            endAllActivities()

            let attributes = RestTimerAttributes(liftName: label, totalSeconds: max(1, total))
            let state = RestTimerAttributes.ContentState(endDate: end, paused: false, pausedRemaining: 0,
                                                         nextLabel: queue.first?.label ?? "", canLog: !queue.isEmpty)
            do {
                if #available(iOS 16.2, *) {
                    _ = try Activity.request(
                        attributes: attributes,
                        content: ActivityContent(state: state, staleDate: end.addingTimeInterval(300)),
                        pushType: nil
                    )
                } else {
                    _ = try Activity.request(attributes: attributes, contentState: state)
                }
                call.resolve(["started": true])
            } catch {
                call.resolve(["started": false, "reason": "\(error.localizedDescription)"])
            }
            return
        }
        #endif
        call.resolve(["started": false, "reason": "unsupported"])
    }

    @objc func update(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            let paused = call.getBool("paused") ?? false
            let endMs = call.getDouble("endTime") ?? (Date().timeIntervalSince1970 * 1000)
            let end = date(fromMs: endMs)
            let remaining = max(0, end.timeIntervalSinceNow)
            Task {
                for activity in Activity<RestTimerAttributes>.activities {
                    // Keep the next-set line + Log button the activity already shows.
                    let cur: RestTimerAttributes.ContentState
                    if #available(iOS 16.2, *) { cur = activity.content.state } else { cur = activity.contentState }
                    let state = RestTimerAttributes.ContentState(
                        endDate: end,
                        paused: paused,
                        pausedRemaining: paused ? remaining : 0,
                        nextLabel: cur.nextLabel,
                        canLog: cur.canLog
                    )
                    if #available(iOS 16.2, *) {
                        await activity.update(ActivityContent(state: state, staleDate: end.addingTimeInterval(300)))
                    } else {
                        await activity.update(using: state)
                    }
                }
            }
            call.resolve(["updated": true])
            return
        }
        #endif
        call.resolve(["updated": false])
    }

    // Foreground-resync read: the webview calls this when it becomes visible to pick
    // up whatever the island buttons did while it was suspended. remaining is in MS
    // (matches the JS timer's ms-epoch model and the restAction event payload).
    @objc func getState(_ call: CAPPluginCall) {
        #if canImport(ActivityKit)
        if #available(iOS 16.2, *) {
            if let a = Activity<RestTimerAttributes>.activities.first {
                let st = a.content.state
                call.resolve([
                    "active": true,
                    "endTime": st.endDate.timeIntervalSince1970 * 1000,
                    "paused": st.paused,
                    "remaining": st.paused
                        ? st.pausedRemaining * 1000
                        : max(0, st.endDate.timeIntervalSinceNow) * 1000,
                    "total": a.attributes.totalSeconds
                ])
                return
            }
            call.resolve(["active": false])
            return
        }
        #endif
        call.resolve(["active": false])
    }

    // Sets logged from the Lock Screen since the webview last looked ("exId|setIndex").
    @objc func takePendingLogs(_ call: CAPPluginCall) {
        call.resolve(["keys": RestQueue.takePending()])
    }

    @objc func stop(_ call: CAPPluginCall) {
        RestQueue.save([])
        #if canImport(ActivityKit)
        if #available(iOS 16.1, *) {
            endAllActivities()
            call.resolve(["stopped": true])
            return
        }
        #endif
        call.resolve(["stopped": false])
    }

    #if canImport(ActivityKit)
    @available(iOS 16.1, *)
    private func endAllActivities() {
        Task {
            for activity in Activity<RestTimerAttributes>.activities {
                if #available(iOS 16.2, *) {
                    await activity.end(nil, dismissalPolicy: .immediate)
                } else {
                    await activity.end(dismissalPolicy: .immediate)
                }
            }
        }
    }
    #endif
}
