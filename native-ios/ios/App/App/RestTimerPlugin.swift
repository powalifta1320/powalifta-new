//
//  RestTimerPlugin.swift
//  Capacitor plugin (App target). Bridges the web rest timer to ActivityKit.
//
//  The browser calls window.Capacitor.Plugins.RestTimer.{start,update,stop}.
//  Those calls land here and drive a single RestActivityAttributes Live Activity.
//  We translate the web's millisecond `endTime` into an absolute Date and let the
//  widget's Text(timerInterval:) handle the visible ticking.
//
//  Requires iOS 16.2+ for the ActivityContent API; older OSes resolve to no-ops.
//

import Foundation
import Capacitor
import ActivityKit

@objc(RestTimerPlugin)
public class RestTimerPlugin: CAPPlugin {

    @objc func start(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        guard ActivityAuthorizationInfo().areActivitiesEnabled else {
            call.resolve(); return   // user disabled Live Activities — degrade silently
        }
        let endDate = Self.dateFromMs(call.getDouble("endTime"))
        let label = call.getString("label") ?? "Rest"

        Self.endAll()   // never run two rest activities at once

        let attributes = RestActivityAttributes(label: label)
        let state = RestActivityAttributes.ContentState(
            endDate: endDate, paused: false, pausedRemaining: 0
        )
        do {
            _ = try Activity.request(
                attributes: attributes,
                content: .init(state: state, staleDate: endDate.addingTimeInterval(30)),
                pushType: nil
            )
            call.resolve()
        } catch {
            call.reject("Could not start Live Activity: \(error.localizedDescription)")
        }
    }

    @objc func update(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        let endDate = Self.dateFromMs(call.getDouble("endTime"))
        let paused = call.getBool("paused") ?? false
        let remaining = max(0, Int(endDate.timeIntervalSinceNow.rounded()))
        let state = RestActivityAttributes.ContentState(
            endDate: endDate, paused: paused, pausedRemaining: remaining
        )
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.update(
                    .init(state: state, staleDate: endDate.addingTimeInterval(30))
                )
            }
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard #available(iOS 16.2, *) else { call.resolve(); return }
        Self.endAll()
        call.resolve()
    }

    // MARK: - Helpers

    private static func dateFromMs(_ ms: Double?) -> Date {
        Date(timeIntervalSince1970: (ms ?? 0) / 1000.0)
    }

    @available(iOS 16.2, *)
    private static func endAll() {
        Task {
            for activity in Activity<RestActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }
}
