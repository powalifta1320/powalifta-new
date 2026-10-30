//
//  RestLiveActivity.swift
//  PowaWidget — SwiftUI rendering of the POWALIFTA rest-timer Live Activity.
//
//  Lock Screen banner + Dynamic Island (compact / minimal / expanded). The countdown
//  and progress bar are driven by the OS from the Activity's `endDate`
//  (Text(timerInterval:) / ProgressView(timerInterval:)) so they tick every second
//  with no push updates.
//
//  The look (2026-10-30, the widgets' own): near-black, the brand mark where the red
//  POWALIFTA caps were, the countdown wide and heavy in ink, the bar in ink, the controls
//  graphite, and the one action (Log set) in the app's crimson with a white label. The
//  banner's parts are plain views over the state, so they can be drawn off the phone.
//
//  Requires iOS 16.1+ (the whole widget is gated below); the injector sets the widget
//  extension deployment target to 16.1 while the App target stays at 13.
//
import SwiftUI
import WidgetKit
import ActivityKit
#if canImport(AppIntents)
import AppIntents
#endif

// MARK: - Brand

@available(iOS 16.1, *)
enum Powa {
    static let bg = Color(red: 0.043, green: 0.043, blue: 0.047)     // #0b0b0c
    static let dim = Color.white.opacity(0.55)

    /// The countdown window (start -> end) used for both the numerals and the bar so
    /// they always agree. Falls back to a 1s window if the state is degenerate.
    static func range(end: Date, total: Double) -> ClosedRange<Date> {
        let start = end.addingTimeInterval(-max(1, total))
        return start <= end ? start...end : end...end.addingTimeInterval(1)
    }

    static func fmt(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded()))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

// MARK: - The banner's parts (plain views over the state)

@available(iOS 16.1, *)
struct RestCountdown: View {
    let state: RestTimerAttributes.ContentState
    let total: Double
    var size: CGFloat = 34

    var body: some View {
        Group {
            if state.paused {
                Text(Powa.fmt(state.pausedRemaining))
            } else {
                Text(timerInterval: Powa.range(end: state.endDate, total: total), countsDown: true)
                    .multilineTextAlignment(.trailing)
            }
        }
        .font(.system(size: size, weight: .heavy).width(.expanded))
        .monospacedDigit()
        .foregroundColor(.white)
    }
}

@available(iOS 16.1, *)
struct RestBar: View {
    let state: RestTimerAttributes.ContentState
    let total: Double
    var body: some View {
        Group {
            if state.paused {
                ProgressView(value: min(1, state.pausedRemaining / max(1, total)))
            } else {
                ProgressView(timerInterval: Powa.range(end: state.endDate, total: total), countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
            }
        }
        .tint(state.paused ? Color.white.opacity(0.4) : Color.white)
        .progressViewStyle(.linear)
    }
}

/// Pause/resume, ±time, Log set (when the app handed over a next set) and skip —
/// executed by RestTimerIntents in the APP's
/// process (LiveActivityIntent), so they work with the app suspended. On iOS 16
/// this renders nothing and the activity stays display-only. Graphite controls; Log set
/// is the one action, in the crimson.
@available(iOS 16.1, *)
struct RestControls: View {
    let state: RestTimerAttributes.ContentState
    var body: some View {
        if #available(iOS 17.0, *) {
            HStack(spacing: 8) {
                Button(intent: RestAdjustIntent(seconds: -15)) {
                    Text("−15s").font(.system(size: 12, weight: .bold))
                }
                Button(intent: RestPauseResumeIntent()) {
                    Image(systemName: state.paused ? "play.fill" : "pause.fill")
                        .font(.system(size: 12, weight: .bold))
                }
                Button(intent: RestAdjustIntent(seconds: 30)) {
                    Text("+30s").font(.system(size: 12, weight: .bold))
                }
                Spacer(minLength: 0)
                if state.canLog {
                    // Logs the next set at its planned RPE (RestLogSetIntent).
                    Button(intent: RestLogSetIntent()) {
                        Label("Log set", systemImage: "checkmark")
                            .font(.system(size: 12, weight: .bold))
                            .foregroundColor(.white)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Hue.crimson1)
                }
                Button(intent: RestStopIntent()) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                }
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .controlSize(.small)
            .tint(.white)
            .foregroundColor(.white)
        }
    }
}

/// The Lock Screen banner: the mark and what's resting (or the next set), the countdown, the bar,
/// the controls.
@available(iOS 16.1, *)
struct RestBanner: View {
    let liftName: String
    let total: Double
    let state: RestTimerAttributes.ContentState
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center) {
                HStack(spacing: 7) {
                    BrandMark(size: 16)
                    Text(state.paused ? "\(liftName) · Paused"
                         : (state.nextLabel.isEmpty ? "\(liftName) · Rest" : "Next · \(state.nextLabel)"))
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(.white.opacity(0.78))
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 8)
                RestCountdown(state: state, total: total, size: 32)
            }
            RestBar(state: state, total: total)
            RestControls(state: state)
        }
        .padding(16)
    }
}

// MARK: - Widget

@available(iOS 16.1, *)
struct RestLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            RestBanner(liftName: context.attributes.liftName, total: context.attributes.totalSeconds, state: context.state)
                .activityBackgroundTint(Powa.bg)
                .activitySystemActionForegroundColor(.white)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    HStack(spacing: 6) {
                        BrandMark(size: 16)
                        Text(context.attributes.liftName)
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(.white.opacity(0.78))
                            .lineLimit(1)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    RestCountdown(state: context.state, total: context.attributes.totalSeconds, size: 24)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 10) {
                        RestBar(state: context.state, total: context.attributes.totalSeconds)
                        RestControls(state: context.state)
                    }
                }
            } compactLeading: {
                BrandMark(size: 16)
            } compactTrailing: {
                RestCountdown(state: context.state, total: context.attributes.totalSeconds, size: 15)
                    .frame(maxWidth: 56)
            } minimal: {
                BrandMark(size: 16)
            }
            .keylineTint(Color.white.opacity(0.4))
            .widgetURL(URL(string: "powalifta://rest"))
        }
    }
}
