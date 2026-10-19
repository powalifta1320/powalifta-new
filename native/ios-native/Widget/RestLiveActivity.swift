//
//  RestLiveActivity.swift
//  PowaWidget — SwiftUI rendering of the POWALIFTA rest-timer Live Activity.
//
//  Lock Screen banner + Dynamic Island (compact / minimal / expanded). The countdown
//  and progress bar are driven by the OS from the Activity's `endDate`
//  (Text(timerInterval:) / ProgressView(timerInterval:)) so they tick every second
//  with no push updates. Brand: red #ff2d3f on near-black #0b0b0c.
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
    static let red = Color(red: 1.0, green: 0.176, blue: 0.247)      // #ff2d3f
    static let bg = Color(red: 0.043, green: 0.043, blue: 0.047)     // #0b0b0c
    static let dim = Color.white.opacity(0.55)

    /// The countdown window (start -> end) used for both the numerals and the bar so
    /// they always agree. Falls back to a 1s window if the state is degenerate.
    static func range(_ ctx: ActivityViewContext<RestTimerAttributes>) -> ClosedRange<Date> {
        let end = ctx.state.endDate
        let start = end.addingTimeInterval(-max(1, ctx.attributes.totalSeconds))
        return start <= end ? start...end : end...end.addingTimeInterval(1)
    }

    static func fmt(_ seconds: Double) -> String {
        let s = max(0, Int(seconds.rounded()))
        return String(format: "%d:%02d", s / 60, s % 60)
    }
}

// MARK: - Shared numerals

@available(iOS 16.1, *)
private struct Countdown: View {
    let ctx: ActivityViewContext<RestTimerAttributes>
    var font: Font = .system(.title, design: .rounded).weight(.bold)

    var body: some View {
        Group {
            if ctx.state.paused {
                Text(Powa.fmt(ctx.state.pausedRemaining))
            } else {
                Text(timerInterval: Powa.range(ctx), countsDown: true)
                    .multilineTextAlignment(.trailing)
            }
        }
        .font(font)
        .monospacedDigit()
        .foregroundColor(.white)
    }
}

@available(iOS 16.1, *)
private struct Bar: View {
    let ctx: ActivityViewContext<RestTimerAttributes>
    var body: some View {
        Group {
            if ctx.state.paused {
                ProgressView(value: min(1, ctx.state.pausedRemaining / max(1, ctx.attributes.totalSeconds)))
            } else {
                ProgressView(timerInterval: Powa.range(ctx), countsDown: true) { EmptyView() } currentValueLabel: { EmptyView() }
            }
        }
        .tint(Powa.red)
        .progressViewStyle(.linear)
    }
}

// MARK: - Controls (iOS 17+: Button(intent:) in Live Activities)

/// Pause/resume, ±time, Log set (when the app handed over a next set) and skip —
/// executed by RestTimerIntents in the APP's
/// process (LiveActivityIntent), so they work with the app suspended. On iOS 16
/// this renders nothing and the activity stays display-only.
@available(iOS 16.1, *)
private struct Controls: View {
    let ctx: ActivityViewContext<RestTimerAttributes>
    var body: some View {
        if #available(iOS 17.0, *) {
            HStack(spacing: 8) {
                Button(intent: RestAdjustIntent(seconds: -15)) {
                    Text("−15s").font(.system(.caption2, design: .rounded).weight(.bold))
                }
                Button(intent: RestPauseResumeIntent()) {
                    Image(systemName: ctx.state.paused ? "play.fill" : "pause.fill")
                        .font(.system(size: 12, weight: .bold))
                }
                Button(intent: RestAdjustIntent(seconds: 30)) {
                    Text("+30s").font(.system(.caption2, design: .rounded).weight(.bold))
                }
                Spacer(minLength: 0)
                if ctx.state.canLog {
                    // Logs the next set at its planned RPE (RestLogSetIntent).
                    Button(intent: RestLogSetIntent()) {
                        Label("Log set", systemImage: "checkmark")
                            .font(.system(.caption2, design: .rounded).weight(.bold))
                    }
                    .buttonStyle(.borderedProminent)
                }
                Button(intent: RestStopIntent()) {
                    Image(systemName: "xmark")
                        .font(.system(size: 11, weight: .bold))
                }
                .tint(.white.opacity(0.25))
            }
            .buttonStyle(.bordered)
            .buttonBorderShape(.capsule)
            .controlSize(.small)
            .tint(Powa.red)
            .foregroundColor(.white)
        }
    }
}

// MARK: - Lock Screen

@available(iOS 16.1, *)
private struct LockScreenView: View {
    let ctx: ActivityViewContext<RestTimerAttributes>
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("POWALIFTA").font(.system(.caption2, design: .rounded).weight(.heavy))
                        .foregroundColor(Powa.red).tracking(1.5)
                    Text(ctx.state.paused ? "\(ctx.attributes.liftName) · PAUSED"
                         : (ctx.state.nextLabel.isEmpty ? "\(ctx.attributes.liftName) rest" : "Next · \(ctx.state.nextLabel)"))
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                }
                Spacer()
                Countdown(ctx: ctx, font: .system(size: 34, weight: .heavy, design: .rounded))
            }
            Bar(ctx: ctx)
            Controls(ctx: ctx)
        }
        .padding(16)
        .activityBackgroundTint(Powa.bg)
        .activitySystemActionForegroundColor(Powa.red)
    }
}

// MARK: - Widget

@available(iOS 16.1, *)
struct RestLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: RestTimerAttributes.self) { context in
            LockScreenView(ctx: context)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Label(context.attributes.liftName, systemImage: "figure.strengthtraining.traditional")
                        .font(.system(.caption, design: .rounded).weight(.semibold))
                        .foregroundColor(Powa.red)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Countdown(ctx: context, font: .system(.title2, design: .rounded).weight(.bold))
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 10) {
                        Bar(ctx: context)
                        Controls(ctx: context)
                    }
                }
            } compactLeading: {
                Image(systemName: "timer").foregroundColor(Powa.red)
            } compactTrailing: {
                Countdown(ctx: context, font: .system(.body, design: .rounded).weight(.bold))
                    .frame(maxWidth: 56)
            } minimal: {
                Image(systemName: "timer").foregroundColor(Powa.red)
            }
            .keylineTint(Powa.red)
            .widgetURL(URL(string: "powalifta://rest"))
        }
    }
}
