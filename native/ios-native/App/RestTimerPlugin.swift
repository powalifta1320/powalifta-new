//
//  RestTimerPlugin.swift
//  POWALIFTA — Capacitor plugin bridging the web rest timer to an iOS Live Activity.
//
//  JS name: "RestTimer". The web app (athlete.html) already calls, feature-detected:
//      window.Capacitor.Plugins.RestTimer.start({ endTime, total, label })
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
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise)
    ]

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

            // Only one rest Activity at a time — clear any straggler first.
            endAllActivities()

            let attributes = RestTimerAttributes(liftName: label, totalSeconds: max(1, total))
            let state = RestTimerAttributes.ContentState(endDate: end, paused: false, pausedRemaining: 0)
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
            let state = RestTimerAttributes.ContentState(
                endDate: end,
                paused: paused,
                pausedRemaining: paused ? remaining : 0
            )
            Task {
                for activity in Activity<RestTimerAttributes>.activities {
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

    @objc func stop(_ call: CAPPluginCall) {
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
