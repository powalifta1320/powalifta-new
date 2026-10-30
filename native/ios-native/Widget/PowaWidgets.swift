//
//  PowaWidgets.swift
//  PowaWidget — the widgets beside Total: Weigh-in, Today's session, This week, Meet day.
//
//  All read the snapshot the app writes (PowaHomeWidget.swift: PowaSnapshot) and never
//  touch the network. The weigh-in widget is interactive on iOS 17 (PowaWidgetIntents):
//  −/+ nudge a draft held in the App Group, Log queues an entry the app saves the next
//  time it opens (WidgetBridgePlugin.takePending). Every widget opens the app with a
//  powalifta:// URL that the bridge routes (lift / weigh / meet / train).
//
//  Each is lit by its own hue: Weigh-in the bodyweight blue, Today the colour of the lift
//  that's next (as Lift mode is), This week green, Meet day no light at all (the meet-day
//  slab: black (white in light), ink, a gold rule that fills as the meet comes, numbers in the
//  phone's monospace). The one action (Log, Log set, Lift mode) is the app's crimson.
//
import SwiftUI
import WidgetKit

// MARK: - Shared timeline

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

/// A trend line: smooth, a soft fill under it, the latest point marked.
struct Sparkline: View {
    let values: [Double]
    var color: Color? = nil
    @Environment(\.powaPal) private var p
    var body: some View {
        let c = color ?? p.bw
        GeometryReader { g in
            let pts = Sparkline.points(values, in: g.size)
            if pts.count > 1 {
                ZStack {
                    Sparkline.curve(pts, closeTo: g.size.height)
                        .fill(LinearGradient(colors: [c.opacity(0.26), c.opacity(0)], startPoint: .top, endPoint: .bottom))
                        .mask(LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: UnitPoint(x: 0.3, y: 0.5)))
                    Sparkline.curve(pts, closeTo: nil)
                        .stroke(c, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                        .widgetAccentable()
                    Circle().fill(c.opacity(0.22)).frame(width: 12, height: 12).position(pts[pts.count - 1])
                    Circle().fill(c).frame(width: 6, height: 6).position(pts[pts.count - 1])
                }
            }
        }
        .accessibilityHidden(true)
    }

    static func points(_ v: [Double], in s: CGSize) -> [CGPoint] {
        guard v.count > 1, let lo = v.min(), let hi = v.max() else { return [] }
        let span = max(hi - lo, 0.6)               // a steady week draws a calm line, not a zigzag
        let base = (lo + hi) / 2 - span / 2
        let px: CGFloat = 6, py: CGFloat = 7
        return v.enumerated().map { i, x in
            CGPoint(x: px + (s.width - 2 * px) * CGFloat(i) / CGFloat(v.count - 1),
                    y: py + (s.height - 2 * py) * CGFloat(1 - (x - base) / span))
        }
    }

    /// Midpoint-smoothed path through the points; closed down to `closeTo` for the fill.
    static func curve(_ p: [CGPoint], closeTo bottom: CGFloat?) -> Path {
        Path { path in
            path.move(to: p[0])
            for i in 1..<p.count {
                let mid = CGPoint(x: (p[i - 1].x + p[i].x) / 2, y: (p[i - 1].y + p[i].y) / 2)
                path.addQuadCurve(to: mid, control: p[i - 1])
            }
            path.addLine(to: p[p.count - 1])
            if let bottom {
                path.addLine(to: CGPoint(x: p[p.count - 1].x, y: bottom))
                path.addLine(to: CGPoint(x: p[0].x, y: bottom))
                path.closeSubpath()
            }
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
    func placeholder(in context: Context) -> WeighEntry {
        WeighEntry(date: Date(), snap: PowaSnapshot.sample, draft: Double(PowaSnapshot.sample.lastWeight ?? ""), loggedToday: false)
    }

    private func load(_ context: Context) -> WeighEntry {
        if context.isPreview { return placeholder(in: context) }
        let snap = PowaSnapshot.load()
        let d = PowaStore.defaults
        let draft = (d?.object(forKey: PowaStore.draftKey) as? Double) ?? Double(snap?.lastWeight ?? "")
        let logged = (snap?.writtenToday == true && snap?.weighedToday == true) || d?.string(forKey: PowaStore.loggedKey) == PowaStore.todayISO()
        return WeighEntry(date: Date(), snap: snap, draft: draft, loggedToday: logged)
    }
    func getSnapshot(in context: Context, completion: @escaping (WeighEntry) -> Void) { completion(load(context)) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<WeighEntry>) -> Void) {
        completion(Timeline(entries: [load(context)], policy: .after(PowaStore.nextMidnight())))
    }
}

struct WeighView: View {
    let entry: WeighEntry
    let family: WidgetFamily
    @Environment(\.powaPal) private var p
    private var unit: String { entry.snap?.unit ?? "kg" }
    private var trend: [Double] { entry.snap?.weighTrend ?? [] }
    private var canLog: Bool {
        if #available(iOS 17.0, macOS 14.0, *) { return !entry.loggedToday && entry.draft != nil }
        return false
    }

    var body: some View {
        if entry.draft == nil && trend.isEmpty {
            EmptyState(title: "Weigh-in", line: "Your first weigh-in lands here.")
        } else if family == .systemMedium {
            HStack(alignment: .top, spacing: 16) {
                column(medium: true).frame(width: 150, alignment: .leading)
                VStack(alignment: .leading, spacing: 6) {
                    if trend.count > 1 {
                        Sparkline(values: trend).padding(.top, 14).privacySensitive()
                        Text("Last \(trend.count) weigh-ins")
                            .font(.system(size: 11, weight: .medium)).foregroundColor(p.ink3)
                    } else {
                        Spacer(minLength: 0)
                        Text("Your trend draws itself after a few weigh-ins.")
                            .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink3)
                    }
                }
            }
        } else {
            column(medium: false)
        }
    }

    private func column(medium: Bool) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: "Weigh-in")
            Spacer(minLength: 4)
            number
            status.padding(.top, 3)
            Spacer(minLength: 8)
            if canLog {
                if #available(iOS 17.0, macOS 14.0, *) { WeighButtons() }
            } else if !medium && trend.count > 1 {
                Sparkline(values: trend).frame(height: 34).privacySensitive()
            } else if !entry.loggedToday {
                Text("Tap to log it in the app")
                    .font(.system(size: 11, weight: .medium)).foregroundColor(p.ink3)
            }
        }
    }

    @ViewBuilder private var number: some View {
        // Bodyweight: redacted on the Lock Screen / in StandBy until the phone is unlocked.
        let n = HeroNumber(value: entry.draft.map { String(format: "%.1f", $0) } ?? "–", unit: unit, size: 36).privacySensitive()
        if #available(iOS 17.0, macOS 14.0, *) { n.invalidatableContent() } else { n }
    }

    @ViewBuilder private var status: some View {
        if entry.loggedToday {
            HStack(spacing: 4) {
                Image(systemName: "checkmark.circle.fill")
                Text("Logged today")
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(p.okInk)
        } else if let d = entry.snap?.weighDelta, let first = d.first {
            let up = first == "+", down = first == "−" || first == "-"
            HStack(spacing: 3) {
                Image(systemName: up ? "arrow.up.right" : down ? "arrow.down.right" : "equal")
                    .font(.system(size: 10, weight: .heavy))
                Text(up || down ? "\(String(d.dropFirst())) \(unit) this week" : "Same as last week")
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(p.bwInk)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
            .privacySensitive()
        } else {
            Text("This morning's number")
                .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink3)
        }
    }
}

/// −0.1 / +0.1 / Log, right on the Home Screen (iOS 17). Log is the widget's one action.
@available(iOS 17.0, macOS 14.0, *)
struct WeighButtons: View {
    @Environment(\.powaPal) private var p
    var body: some View {
        HStack(spacing: 6) {
            Button(intent: WeighNudgeIntent(delta: -0.1)) { pill("minus") }
                .accessibilityLabel("Down 0.1")
            Button(intent: WeighNudgeIntent(delta: 0.1)) { pill("plus") }
                .accessibilityLabel("Up 0.1")
            Button(intent: WeighLogIntent()) {
                ActionCapsule(text: "Log", size: 14, expand: true)
            }
            .accessibilityLabel("Log this weigh-in")
        }
        .buttonStyle(.plain)
    }

    private func pill(_ symbol: String) -> some View {
        Image(systemName: symbol)
            .font(.system(size: 13, weight: .bold))
            .foregroundColor(p.ink)
            .frame(width: 34, height: 31)
            .background(Capsule().fill(p.quiet))
    }
}

struct PowaWeighInWidget: Widget {
    let kind = "PowaWeighInWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: WeighProvider()) { entry in
            FamilyReader { family in
                LifterOnly(snap: entry.snap, title: "Weigh-in", family: family) { WeighView(entry: entry, family: family) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .powaWidgetBackground(Hue.bw)
            .widgetURL(URL(string: "powalifta://weigh"))
        }
        .configurationDisplayName("Weigh-in")
        .description("Your morning number and its trend: nudge it and log it from the Home Screen.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Today's session (the next set, how far you are, one tap into Lift mode)

struct SessionView: View {
    let snap: PowaSnapshot?
    @Environment(\.powaPal) private var p

    /// Lit like Lift mode: in the colour of the lift that's next; green once it's done; steel
    /// otherwise (a rest day, nothing planned, yesterday's).
    static func hue(_ s: PowaSnapshot?) -> Color {
        guard let s, !s.sessionStale, !s.isCoach else { return Hue.steel }
        if s.session == "Rest day" { return Hue.steel }
        if let t = s.setsTotal, t > 0, (s.setsDone ?? 0) >= t { return Hue.ok }
        if let n = s.next, n.lift != "other" { return Lift.color(n.lift) }
        return Hue.steel
    }

    var body: some View {
        if let s = snap, !s.sessionStale {
            let rest = s.session == "Rest day"
            let logged = PowaSessionLog.keys(for: s)
            let total = s.setsTotal ?? 0
            let done = min(total, (s.setsDone ?? 0) + logged.count)
            let finished = total > 0 && done >= total
            let up = s.upNext(after: logged)
            VStack(alignment: .leading, spacing: 0) {
                HStack(alignment: .center, spacing: 8) {
                    WidgetTitle(text: rest || s.session == nil ? "Today" : "Today · \(s.session ?? "")")
                    Spacer(minLength: 4)
                    if !rest && !finished && total > 0 { SessionAction(canLog: up?.key != nil) }
                }
                Spacer(minLength: 6)
                if rest {
                    BigLine(text: "Rest day")
                    SubLine(text: "Recovery is part of the plan.")
                } else if finished {
                    HStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill").font(.system(size: 22, weight: .bold)).foregroundColor(p.okInk)
                        BigLine(text: "Session done")
                    }
                } else if let n = up {
                    NextSet(next: n, unit: s.unit ?? "kg")
                } else if total > 0 {
                    BigLine(text: "\(total - done) sets to go")
                } else {
                    BigLine(text: "Nothing planned")
                    SubLine(text: "Plan today's session in the app.")
                }
                Spacer(minLength: 8)
                if total > 0 && !rest {
                    SetProgress(done: done, total: total, color: finished ? p.ok : (up.map { p.lift($0.lift) } ?? p.ink))
                }
            }
        } else if snap != nil {
            EmptyState(title: "Today", line: "Open the app for today's session.")
        } else {
            EmptyState(title: "Today", line: "Open the app once and today's session shows up here.")
        }
    }
}

/// The next set, big: the lift, then the load, the reps and the target RPE.
private struct NextSet: View {
    let next: PowaSnapshot.Next
    let unit: String
    @Environment(\.powaPal) private var p
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 6) {
                Circle().fill(p.lift(next.lift)).frame(width: 7, height: 7)
                Text(next.name ?? "Next set")
                    .font(.system(size: 13, weight: .semibold)).foregroundColor(p.ink2).lineLimit(1)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let l = next.load, !l.isEmpty { HeroNumber(value: l, unit: unit, size: 32) }
                if let r = next.reps, !r.isEmpty {
                    Text("× \(r)")
                        .font(.system(size: 22, weight: .heavy).width(.expanded))
                        .monospacedDigit().foregroundColor(p.ink).lineLimit(1)
                }
                if let e = next.rpe, !e.isEmpty {
                    Text("@\(e)")
                        .font(.system(size: 15, weight: .bold)).monospacedDigit()
                        .foregroundColor(p.liftInk(next.lift)).lineLimit(1)
                }
            }
            .minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .combine)
    }
}

private struct BigLine: View {
    let text: String
    @Environment(\.powaPal) private var p
    var body: some View {
        Text(text)
            .font(.system(size: 24, weight: .heavy).width(.expanded))
            .foregroundColor(p.ink).lineLimit(1).minimumScaleFactor(0.7)
    }
}

private struct SubLine: View {
    let text: String
    @Environment(\.powaPal) private var p
    var body: some View {
        Text(text)
            .font(.system(size: 13, weight: .medium)).foregroundColor(p.ink2).lineLimit(2).padding(.top, 3)
    }
}

/// The session widget's one action: Log set on iOS 17 when the set on show can be logged
/// from here (it has a planned RPE), otherwise the Lift mode pill (the whole widget opens it).
private struct SessionAction: View {
    let canLog: Bool
    var body: some View {
        if #available(iOS 17.0, macOS 14.0, *), canLog {
            Button(intent: SessionLogSetIntent()) { ActionCapsule(text: "Log set", symbol: "checkmark") }
                .buttonStyle(.plain)
                .accessibilityLabel("Log this set at its planned RPE")
        } else {
            // Display only: the whole widget opens Lift mode.
            ActionCapsule(text: "Lift mode", symbol: "arrow.up.left.and.arrow.down.right", size: 12)
                .accessibilityHidden(true)
        }
    }
}

struct PowaSessionWidget: Widget {
    let kind = "PowaSessionWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in
                LifterOnly(snap: entry.snap, title: "Today", family: family) { SessionView(snap: entry.snap) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .powaWidgetBackground(SessionView.hue(entry.snap))
            .widgetURL(URL(string: "powalifta://lift"))
        }
        .configurationDisplayName("Today's session")
        .description("The next set and how far you are. Log it right here, or tap for Lift mode.")
        .supportedFamilies([.systemMedium])
    }
}

// MARK: - This week (sessions against your goal, the days you trained, the streak)

struct WeekView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    @Environment(\.powaPal) private var p

    var body: some View {
        let wk = snap?.week ?? (days: nil, today: nil, done: 0, streak: 0)
        let done = wk.done
        let goal = max(1, snap?.weekGoal ?? 3)
        let streak = wk.streak
        let met = done >= goal
        switch family {
        case .accessoryCircular:
            WeekCircle(done: done, goal: goal)
        case .accessoryRectangular:
            WeekLine(done: done, goal: goal, streak: streak, met: met)
        default:
            if snap == nil {
                EmptyState(title: "This week", line: "Open the app once to fill this in.")
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "This week")
                    Spacer(minLength: 4)
                    HStack(alignment: .firstTextBaseline, spacing: 5) {
                        HeroNumber(value: "\(done)", size: 40, color: met ? p.okInk : nil)
                        Text("of \(goal)")
                            .font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink3)
                    }
                    StreakLine(streak: streak, met: met).padding(.top, 2)
                    Spacer(minLength: 8)
                    if let days = wk.days, days.count == 7 {
                        WeekDots(days: days, today: wk.today)
                    } else {
                        Segments(done: min(done, goal), total: goal, color: p.ok)
                    }
                }
                .accessibilityElement(children: .combine)
            }
        }
    }
}

/// Lock Screen, round: sessions against the goal as a filling ring, the count inside.
struct WeekCircle: View {
    let done: Int
    let goal: Int
    var body: some View {
        Gauge(value: Double(min(done, goal)), in: 0...Double(max(1, goal))) {
            Text("wk")
        } currentValueLabel: {
            Text("\(done)").font(.system(size: 20, weight: .heavy).width(.expanded)).monospacedDigit()
        }
        .gaugeStyle(.accessoryCircularCapacity)
        .widgetAccentable()
        .accessibilityLabel("\(done) of \(goal) sessions this week")
    }
}

/// Lock Screen, a line: the mark and "This week", the count big, the streak.
struct WeekLine: View {
    let done: Int
    let goal: Int
    let streak: Int
    let met: Bool
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                BrandMark(size: 12)
                Text("This week").font(.system(size: 13, weight: .semibold))
            }
            .widgetAccentable()
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text("\(done)").font(.system(size: 22, weight: .heavy).width(.expanded)).monospacedDigit()
                Text("of \(goal) sessions").font(.system(size: 13, weight: .semibold)).opacity(0.8)
            }
            if streak > 0 || met {
                Text(streak > 0 ? "\(streak)-week streak" : "Goal hit").font(.system(size: 12, weight: .medium)).opacity(0.7)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

private struct StreakLine: View {
    let streak: Int
    let met: Bool
    @Environment(\.powaPal) private var p
    var body: some View {
        Group {
            if streak > 1 || (streak == 1 && !met) {
                HStack(spacing: 4) {
                    Image(systemName: "flame.fill").foregroundColor(p.gold)
                    Text("\(streak)-week streak").foregroundColor(p.ink)
                }
            } else if met {
                HStack(spacing: 4) {
                    Image(systemName: "checkmark.circle.fill").foregroundColor(p.okInk)
                    Text("Goal hit").foregroundColor(p.ink)
                }
            }
        }
        .font(.system(size: 12, weight: .semibold))
        .lineLimit(1)
    }
}

/// Monday to Sunday: lit where you trained, today ringed, the rest of the week still dark.
private struct WeekDots: View {
    let days: [Int]
    let today: Int?
    @Environment(\.powaPal) private var p
    private let letters = ["M", "T", "W", "T", "F", "S", "S"]
    var body: some View {
        HStack(spacing: 0) {
            ForEach(0..<7, id: \.self) { i in
                VStack(spacing: 5) {
                    dot(i).frame(width: 13, height: 13)
                    Text(letters[i])
                        .font(.system(size: 9, weight: .bold))
                        .foregroundColor(i == today ? p.ink : p.ink3)
                }
                .frame(maxWidth: .infinity)
            }
        }
        .accessibilityHidden(true)
    }

    @ViewBuilder private func dot(_ i: Int) -> some View {
        if days[i] > 0 {
            Circle().fill(p.ok).widgetAccentable()
        } else if i == today {
            Circle().strokeBorder(p.ink.opacity(0.75), lineWidth: 1.5)
        } else if let t = today, i < t {
            Circle().fill(p.track)
        } else {
            Circle().fill(p.track.opacity(0.5))
        }
    }
}

struct PowaWeekWidget: Widget {
    let kind = "PowaWeekWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in
                LifterOnly(snap: entry.snap, title: "This week", family: family) { WeekView(snap: entry.snap, family: family) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .powaWidgetBackground(Hue.ok)
            .widgetURL(URL(string: "powalifta://train"))
        }
        .configurationDisplayName("This week")
        .description("Sessions against your weekly goal, the days you trained, your streak.")
        .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
    }
}

// MARK: - Meet day (the countdown, the openers): the slab language

struct MeetView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    @Environment(\.powaPal) private var p
    var body: some View {
        let days = snap?.meetDaysNow
        switch family {
        case .accessoryInline:
            MeetInline(days: days)
        default:
            if let d = days {
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "Meet day")
                    Spacer(minLength: 2)
                    if d > 0 {
                        Text("\(d)")
                            .font(.system(size: 54, weight: .heavy, design: .monospaced))
                            .foregroundColor(p.ink).lineLimit(1).minimumScaleFactor(0.5)
                            .contentTransition(.numericText())
                            .widgetAccentable()
                        Text(d == 1 ? "DAY OUT" : "DAYS OUT")
                            .font(.system(size: 13, weight: .black).width(.condensed))
                            .tracking(0.8).foregroundColor(p.ink)
                    } else {
                        Text("GO LIFT.")
                            .font(.system(size: 38, weight: .black).width(.condensed))
                            .foregroundColor(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                            .widgetAccentable()
                        Text("TODAY")
                            .font(.system(size: 13, weight: .black).width(.condensed))
                            .tracking(0.8).foregroundColor(p.ink2)
                    }
                    CountdownRule(days: d).padding(.vertical, 8)
                    OpenersRow(openers: snap?.openers)
                }
                .accessibilityElement(children: .combine)
            } else {
                // No date yet: the same slab, waiting (a tap opens the meet sheet, date first).
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "Meet day")
                    Spacer(minLength: 2)
                    Text("NO MEET")
                        .font(.system(size: 38, weight: .black).width(.condensed))
                        .foregroundColor(p.ink3).lineLimit(1).minimumScaleFactor(0.6)
                    Text("TAP TO SET A DATE")
                        .font(.system(size: 13, weight: .black).width(.condensed))
                        .tracking(0.8).foregroundColor(p.ink)
                    Rectangle().fill(p.track).frame(height: 4).padding(.vertical, 8)
                    OpenersRow(openers: nil)
                }
            }
        }
    }
}

/// Lock Screen, one line: days to the meet.
struct MeetInline: View {
    let days: Int?
    var body: some View {
        if let d = days {
            Text(d == 0 ? "Meet day. Go lift." : "Meet in \(d) day\(d == 1 ? "" : "s")")
        } else {
            Text("No meet set")
        }
    }
}

/// The meet's gold rule: it fills as the meet comes closer (a twelve-week prep reads in full).
struct CountdownRule: View {
    let days: Int
    @Environment(\.powaPal) private var p
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Rectangle().fill(p.track)
                Rectangle().fill(p.gold)
                    .frame(width: g.size.width * CGFloat(max(0.06, min(1, 1 - Double(days) / 84))))
                    .widgetAccentable()
            }
        }
        .frame(height: 4)
        .accessibilityHidden(true)
    }
}

/// The three openers in the phone's monospace, each lift's letter in its colour.
private struct OpenersRow: View {
    let openers: PowaSnapshot.Openers?
    @Environment(\.powaPal) private var p
    var body: some View {
        let items: [(String, String?, String)] = [("S", openers?.squat, "squat"), ("B", openers?.bench, "bench"), ("D", openers?.deadlift, "deadlift")]
        HStack(spacing: 0) {
            ForEach(0..<3, id: \.self) { i in
                HStack(spacing: 3) {
                    Text(items[i].0).foregroundColor(p.liftInk(items[i].2))
                    Text(items[i].1 ?? "–").foregroundColor(p.ink)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .font(.system(size: 13, weight: .bold, design: .monospaced))
        .lineLimit(1)
        .minimumScaleFactor(0.7)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Openers: squat \(openers?.squat ?? "not set"), bench \(openers?.bench ?? "not set"), deadlift \(openers?.deadlift ?? "not set")")
    }
}

struct PowaMeetWidget: Widget {
    let kind = "PowaMeetWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in
                LifterOnly(snap: entry.snap, title: "Meet day", family: family) { MeetView(snap: entry.snap, family: family) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .powaWidgetBackground(nil)
            .widgetURL(URL(string: "powalifta://meet"))
        }
        .configurationDisplayName("Meet day")
        .description("Days to your meet and your three openers.")
        .supportedFamilies([.systemSmall, .accessoryInline])
    }
}
