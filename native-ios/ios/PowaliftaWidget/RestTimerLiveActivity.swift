//
//  RestTimerLiveActivity.swift
//  PowaliftaWidget extension.
//
//  The rest timer as it appears in the Dynamic Island and on the Lock Screen.
//  When running, Text(timerInterval:countsDown:) auto-ticks from the system clock
//  even while the host app is suspended — no background JS, no polling. When the
//  user pauses in-app, the plugin pushes paused=true and we show a frozen MM:SS.
//

import ActivityKit
import WidgetKit
import SwiftUI

// POWALIFTA brand red (#ff2d3f).
private let powaRed = Color(red: 1.0, green: 0.176, blue: 0.247)

struct RestTimerLiveActivity: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestActivityAttributes.self) { context in
            // Lock Screen / notification-banner presentation.
            RestLockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.9))
                .activitySystemActionForegroundColor(powaRed)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.label.uppercased(), systemImage: "timer")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(powaRed)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RestCountdownText(context: context)
                        .font(.system(.title2, design: .rounded).weight(.bold))
                        .monospacedDigit()
                        .foregroundStyle(.white)
                        .frame(maxWidth: .infinity, alignment: .trailing)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.paused ? "Paused" : "Back to the bar when it hits zero")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundStyle(powaRed)
            } compactTrailing: {
                RestCountdownText(context: context)
                    .monospacedDigit()
                    .foregroundStyle(powaRed)
                    .frame(width: 46)
            } minimal: {
                RestCountdownText(context: context)
                    .monospacedDigit()
                    .foregroundStyle(powaRed)
            }
            .keylineTint(powaRed)
        }
    }
}

/// Live-ticking countdown while running; a frozen value while paused.
struct RestCountdownText: View {
    let context: ActivityViewContext<RestActivityAttributes>
    var body: some View {
        if context.state.paused {
            Text(restMMSS(context.state.pausedRemaining))
        } else {
            // System keeps this ticking down to the endDate on its own.
            Text(timerInterval: Date()...context.state.endDate, countsDown: true)
                .multilineTextAlignment(.trailing)
        }
    }
}

struct RestLockScreenView: View {
    let context: ActivityViewContext<RestActivityAttributes>
    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: "timer")
                .font(.largeTitle)
                .foregroundStyle(powaRed)
            VStack(alignment: .leading, spacing: 2) {
                Text(context.attributes.label.uppercased())
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
                Group {
                    if context.state.paused {
                        Text(restMMSS(context.state.pausedRemaining))
                    } else {
                        Text(timerInterval: Date()...context.state.endDate, countsDown: true)
                    }
                }
                .font(.system(.largeTitle, design: .rounded).weight(.bold))
                .monospacedDigit()
                .foregroundStyle(.white)
            }
            Spacer()
        }
        .padding()
    }
}

/// Formats whole seconds as M:SS (used only for the paused snapshot).
private func restMMSS(_ seconds: Int) -> String {
    let s = max(0, seconds)
    return String(format: "%d:%02d", s / 60, s % 60)
}
