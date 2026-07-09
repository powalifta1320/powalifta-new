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
                    Text(ctx.state.paused ? "\(ctx.attributes.liftName) · PAUSED" : "\(ctx.attributes.liftName) rest")
                        .font(.system(.subheadline, design: .rounded).weight(.semibold))
                        .foregroundColor(.white)
                }
                Spacer()
                Countdown(ctx: ctx, font: .system(size: 34, weight: .heavy, design: .rounded))
            }
            Bar(ctx: ctx)
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
                    Bar(ctx: context)
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
