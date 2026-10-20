//
//  PowaWidgets.swift
//  PowaWidget — the widgets beside Total: Weigh-in, Session, Week, Meet.
//
//  All read the snapshot the app writes (PowaHomeWidget.swift: PowaSnapshot) and never
//  touch the network. The weigh-in widget is interactive on iOS 17 (PowaWidgetIntents):
//  −/+ nudge a draft held in the App Group, Log queues an entry the app saves the next
//  time it opens (WidgetBridgePlugin.takePending). Every widget opens the app with a
//  powalifta:// URL that the bridge routes (lift / weigh / meet / train).
//
import SwiftUI
import WidgetKit

// MARK: - Shared

struct SnapEntry: TimelineEntry {
    let date: Date
    let snap: PowaSnapshot?
}

/// The app reloads timelines after every logged set; midnight is the only moment a
/// widget has to redraw on its own (a new day).
struct SnapProvider: TimelineProvider {
    func placeholder(in context: Context) -> SnapEntry { SnapEntry(date: Date(), snap: PowaSnapshot.sample) }
    func getSnapshot(in context: Context, completion: @escaping (SnapEntry) -> Void) {
        completion(SnapEntry(date: Date(), snap: context.isPreview ? PowaSnapshot.sample : PowaSnapshot.load()))
    }
    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapEntry>) -> Void) {
        completion(Timeline(entries: [SnapEntry(date: Date(), snap: PowaSnapshot.load())], policy: .after(PowaStore.nextMidnight())))
    }
}

private struct Ring: View {
    let frac: Double
    var color: Color = Powa.red
    var width: CGFloat = 7
    var body: some View {
        ZStack {
            Circle().stroke(Color.white.opacity(0.12), lineWidth: width)
            Circle().trim(from: 0, to: CGFloat(max(0, min(1, frac))))
                .stroke(color, style: StrokeStyle(lineWidth: width, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
    }
}

private struct EmptyNote: View {
    let text: String
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Wordmark()
            Text(text).font(.system(.footnote, design: .rounded)).foregroundColor(Powa.dim)
            Spacer(minLength: 0)
        }
    }
}

// MARK: - Weigh-in

struct WeighEntry: TimelineEntry {
    let date: Date
    let snap: PowaSnapshot?
    let draft: Double?
    let loggedToday: Bool
}

struct WeighProvider: TimelineProvider {
    func placeholder(in context: Context) -> WeighEntry { WeighEntry(date: Date(), snap: PowaSnapshot.sample, draft: 83.1, loggedToday: false) }

    private func load(_ context: Context) -> WeighEntry {
        let snap = context.isPreview ? PowaSnapshot.sample : PowaSnapshot.load()
        let d = PowaStore.defaults
        let draft = (d?.object(forKey: PowaStore.draftKey) as? Double) ?? Double(snap?.lastWeight ?? "")
        let logged = (snap?.weighedToday ?? false) || d?.string(forKey: PowaStore.loggedKey) == PowaStore.todayISO()
        return WeighEntry(date: Date(), snap: snap, draft: draft, loggedToday: logged)
    }
    func getSnapshot(in context: Context, completion: @escaping (WeighEntry) -> Void) { completion(load(context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WeighEntry>) -> Void) {
        completion(Timeline(entries: [load(context)], policy: .after(PowaStore.nextMidnight())))
    }
}

struct WeighView: View {
    let entry: WeighEntry
    var unit: String { entry.snap?.unit ?? "kg" }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Wordmark()
            Text(entry.loggedToday ? "Weighed in" : "Morning weigh-in")
                .font(.system(.caption, design: .rounded)).foregroundColor(Powa.dim)
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(entry.draft.map { String(format: "%.1f", $0) } ?? "–")
                    .font(.system(size: 34, weight: .heavy, design: .rounded))
                    .monospacedDigit().foregroundColor(.white).minimumScaleFactor(0.6).lineLimit(1)
                Text(unit).font(.system(.subheadline, design: .rounded).weight(.semibold)).foregroundColor(Powa.dim)
            }
            Spacer(minLength: 0)
            if #available(iOS 17.0, *), !entry.loggedToday, entry.draft != nil {
                HStack(spacing: 6) {
                    Button(intent: WeighNudgeIntent(delta: -0.1)) { Text("−").frame(maxWidth: .infinity) }
                    Button(intent: WeighNudgeIntent(delta: 0.1)) { Text("+").frame(maxWidth: .infinity) }
                    Button(intent: WeighLogIntent()) { Text("Log").frame(maxWidth: .infinity) }.tint(Powa.red)
                }
                .buttonStyle(.bordered)
                .buttonBorderShape(.capsule)
                .controlSize(.small)
                .font(.system(.footnote, design: .rounded).weight(.bold))
                .foregroundColor(.white)
                .tint(.white.opacity(0.25))
            } else {
                Text(entry.loggedToday ? "Done for today" : "Tap to log it in the app")
                    .font(.system(.caption2, design: .rounded)).foregroundColor(Powa.dim)
            }
        }
        .widgetURL(URL(string: "powalifta://weigh"))
    }
}

struct PowaWeighInWidget: Widget {
    let kind = "PowaWeighInWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WeighProvider()) { entry in
            WeighView(entry: entry)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground()
        }
        .configurationDisplayName("Weigh-in")
        .description("Your morning number: nudge it and log it from the Home Screen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Session (today's session, one tap into Lift mode)

struct SessionView: View {
    let snap: PowaSnapshot?
    var body: some View {
        if let s = snap, s.total != nil {
            HStack(alignment: .top, spacing: 14) {
                VStack(alignment: .leading, spacing: 4) {
                    Wordmark()
                    Text(s.session ?? "No session today")
                        .font(.system(.title3, design: .rounded).weight(.bold)).foregroundColor(.white).lineLimit(2)
                    if let sets = s.sets { Text(sets).font(.system(.caption, design: .rounded)).foregroundColor(Powa.dim) }
                    Spacer(minLength: 0)
                    if s.session != nil && s.session != "Rest day" {
                        Text("Open Lift mode")
                            .font(.system(.caption2, design: .rounded).weight(.bold)).foregroundColor(.white)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(Capsule().fill(Powa.red))
                    }
                }
                Spacer(minLength: 0)
                if let done = s.setsDone, let total = s.setsTotal, total > 0 {
                    ZStack {
                        Ring(frac: Double(done) / Double(total))
                        VStack(spacing: 0) {
                            Text("\(done)").font(.system(size: 24, weight: .heavy, design: .rounded)).monospacedDigit().foregroundColor(.white)
                            Text("of \(total)").font(.system(.caption2, design: .rounded)).foregroundColor(Powa.dim)
                        }
                    }
                    .frame(width: 76, height: 76)
                }
            }
        } else {
            EmptyNote(text: "Open the app once and today's session shows up here.")
        }
    }
}

struct PowaSessionWidget: Widget {
    let kind = "PowaSessionWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            SessionView(snap: entry.snap)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground()
                .widgetURL(URL(string: "powalifta://lift"))
        }
        .configurationDisplayName("Today's session")
        .description("What's on today, how far you are, and one tap into Lift mode.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - Week (sessions against your weekly goal, your streak)

struct WeekView: View {
    let snap: PowaSnapshot?
    @Environment(\.widgetFamily) private var family
    var done: Int { snap?.weekDone ?? 0 }
    var goal: Int { max(1, snap?.weekGoal ?? 3) }
    var streak: Int { snap?.streak ?? 0 }

    var body: some View {
        switch family {
        case .accessoryCircular:
            Gauge(value: Double(min(done, goal)), in: 0...Double(goal)) {
                Text("wk")
            } currentValueLabel: {
                Text("\(done)").font(.system(.headline, design: .rounded).weight(.bold))
            }
            .gaugeStyle(.accessoryCircularCapacity)
            .widgetAccentable()
        case .accessoryRectangular:
            VStack(alignment: .leading, spacing: 2) {
                Text("POWALIFTA").font(.system(.caption2, design: .rounded).weight(.heavy)).widgetAccentable()
                Text("This week \(done) of \(goal)").font(.system(.headline, design: .rounded).weight(.bold))
                Text(streak > 0 ? "\(streak)-week streak" : "Start a streak").font(.system(.caption, design: .rounded))
            }
        default:
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Wordmark()
                    Text("This week").font(.system(.caption, design: .rounded)).foregroundColor(Powa.dim)
                    Text("\(done) of \(goal)")
                        .font(.system(size: 28, weight: .heavy, design: .rounded)).monospacedDigit().foregroundColor(.white)
                    Spacer(minLength: 0)
                    Text(streak > 0 ? "\(streak)-week streak" : "Start a streak")
                        .font(.system(.caption2, design: .rounded).weight(.semibold)).foregroundColor(streak > 0 ? Powa.red : Powa.dim)
                }
                Spacer(minLength: 0)
                Ring(frac: Double(done) / Double(goal), width: 8).frame(width: 56, height: 56)
            }
        }
    }
}

struct PowaWeekWidget: Widget {
    let kind = "PowaWeekWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            WeekView(snap: entry.snap)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground()
                .widgetURL(URL(string: "powalifta://train"))
        }
        .configurationDisplayName("This week")
        .description("Sessions against your weekly goal, and your streak.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - Meet (the countdown, the openers)

struct MeetView: View {
    let snap: PowaSnapshot?
    @Environment(\.widgetFamily) private var family
    var body: some View {
        let days = snap?.meetDays
        switch family {
        case .accessoryInline:
            if let d = days { Text(d == 0 ? "Meet day" : "\(d) day\(d == 1 ? "" : "s") out") } else { Text("No meet set") }
        default:
            VStack(alignment: .leading, spacing: 4) {
                Wordmark()
                if let d = days {
                    Text(d == 0 ? "Meet day" : "Meet in")
                        .font(.system(.caption, design: .rounded)).foregroundColor(Powa.dim)
                    if d > 0 {
                        HStack(alignment: .firstTextBaseline, spacing: 4) {
                            Text("\(d)").font(.system(size: 34, weight: .heavy, design: .rounded)).monospacedDigit().foregroundColor(.white)
                            Text(d == 1 ? "day" : "days").font(.system(.subheadline, design: .rounded).weight(.semibold)).foregroundColor(Powa.dim)
                        }
                    } else {
                        Text("Go lift.").font(.system(size: 26, weight: .heavy, design: .rounded)).foregroundColor(.white)
                    }
                    Spacer(minLength: 0)
                    if let o = snap?.openers {
                        HStack(spacing: 8) {
                            LiftCell(name: "Squat", color: Lift.squat, value: o.squat ?? "–")
                            LiftCell(name: "Bench", color: Lift.bench, value: o.bench ?? "–")
                            LiftCell(name: "Deadlift", color: Lift.deadlift, value: o.deadlift ?? "–")
                        }
                    }
                } else {
                    Text("No meet date yet").font(.system(.subheadline, design: .rounded).weight(.bold)).foregroundColor(.white)
                    Text("Set one in Progress → Meet day").font(.system(.caption2, design: .rounded)).foregroundColor(Powa.dim)
                    Spacer(minLength: 0)
                }
            }
        }
    }
}

struct PowaMeetWidget: Widget {
    let kind = "PowaMeetWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            MeetView(snap: entry.snap)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground()
                .widgetURL(URL(string: "powalifta://meet"))
        }
        .configurationDisplayName("Meet day")
        .description("Days to your meet and your openers.")
        .supportedFamilies([.systemSmall, .accessoryInline])
    }
}
