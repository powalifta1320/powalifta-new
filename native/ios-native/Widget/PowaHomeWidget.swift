//
//  PowaHomeWidget.swift
//  PowaWidget — the snapshot every widget reads, the shared look, and the Total widget.
//
//  Data arrives from the app through the App Group (group.com.powalifta.app):
//  WidgetBridgePlugin stores one JSON snapshot of display-ready STRINGS (the app has
//  already done the unit maths) and asks WidgetKit to reload. The widget gallery always
//  gets `PowaSnapshot.sample`, a full set of believable numbers, so no widget ever
//  previews as an empty state.
//
//  The look ("light, not paint"): graphite lit by one soft light in the widget's own hue,
//  a hairline edge, the brand mark instead of a wordmark, wide heavy numerals (the app's
//  display face is wide and heavy), and colour only where it means something: the lift
//  colours, the green of a goal hit, the one red action.
//
import SwiftUI
import WidgetKit

// MARK: - The snapshot the app writes

struct PowaSnapshot: Codable {
    var total: String?
    var unit: String?
    var squat: String?
    var bench: String?
    var deadlift: String?
    var session: String?
    var sets: String?
    var meet: String?
    var at: Double?
    // 2026-10-20 (Session / Week / Meet / Weigh-in). All optional: an older app build
    // writes fewer fields and each widget shows what it has.
    var setsDone: Int?
    var setsTotal: Int?
    var weekDone: Int?
    var weekGoal: Int?
    var streak: Int?
    var meetDays: Int?
    var openers: Openers?
    var lastWeight: String?
    var weighedToday: Bool?
    // 2026-10-21 (the redesign): what makes each widget more than one number.
    var totalDelta: String?     // "+12": the total's move over 28 days, as Progress shows it
    var next: Next?             // the next set as Train shows it (smart load included)
    var weekStart: String?      // "YYYY-MM-DD", the Monday the week fields belong to
    var weekDays: [Int]?        // Monday…Sunday, 1 = trained
    var todayIdx: Int?          // 0 = Monday (used when weekStart is absent)
    var weighTrend: [Double]?   // the latest weigh-ins, oldest first, display units
    var weighDelta: String?     // "−0.4": against the weigh-in a week before the latest
    // 2026-10-21 (interactive session widget): up to six sets from the next one on. A set
    // with a `key` ("exerciseId|setIndex") can be logged from the widget at its planned RPE.
    var queue: [Next]?
    // 2026-10-22 (Apple Health widgets, PowaHealthWidgets.swift). All optional: a build from
    // before writes none of them, and Readiness / Weight class show their calm first-run states.
    var healthOn: Bool?         // Apple Health switched on in the app (You → Apple Health)
    var health: Health?         // last night against the usual; nil = nothing from last night
    var cut: Cut?               // the weigh-ins against the class line; nil = no class picked

    /// One Health number against the lifter's own usual ("7 h 20" against "7 h 05").
    struct Metric: Codable {
        var value: String?
        var usual: String?
        var off: Bool?          // worse than the usual by enough to matter
    }
    struct Health: Codable {
        var day: String?        // "YYYY-MM-DD", the morning it belongs to
        var word: String?       // Fresh | Normal | Rough
        var level: Double?      // 0…1 for the Lock Screen gauge (rough 0.34, normal 0.67, fresh 1)
        var sleep: Metric?
        var rhr: Metric?
        var hrv: Metric?
        var line: String?       // "Slept 7 h 20 · HR 54"
    }
    struct Cut: Codable {
        var cls: String?        // "83 kg class"
        var classLine: Double?  // the class limit in display units, for the chart
        var unit: String?
        var cur: String?        // the 7-day average, display units ("83.3"); nil = no weigh-ins yet
        var status: String?     // "0.3 kg to go" | "On weight" | "0.4 kg over"
        var tone: String?       // made | good | amber | off
        var pace: String?       // "−0.4 a week" | "Steady"
        var need: String?       // "−0.1": a week, still needed by the date
        var by: String?         // "Nov 14", the meet (or the cut-by date)
        var trend: [Double?]?   // the last 7 days, oldest first: that day's weigh-in or null
    }

    struct Openers: Codable {
        var squat: String?
        var bench: String?
        var deadlift: String?
    }
    struct Next: Codable {
        var lift: String?       // squat | bench | deadlift | other
        var name: String?       // "Comp squat"
        var load: String?
        var reps: String?
        var rpe: String?
        var key: String?        // set id the app logs it by; nil = log it in the app
    }

    /// The set the session widget shows now: the first one in `queue` not yet logged from the
    /// widget (a set without a key stops the line: it has to be logged in the app).
    func upNext(after logged: [String]) -> Next? {
        if let q = queue, !q.isEmpty {
            return q.first(where: { n in n.key.map { !logged.contains($0) } ?? true })
        }
        return logged.isEmpty ? next : nil
    }

    static let suite = PowaStore.suite
    static let key = "powa.widget.snapshot"

    static func load() -> PowaSnapshot? {
        guard let d = UserDefaults(suiteName: suite), let s = d.string(forKey: key), let data = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(PowaSnapshot.self, from: data)
    }

    /// The gallery's lifter: mid-block, mid-session, three weeks into a streak, 23 days out.
    static let sample = PowaSnapshot(
        total: "593", unit: "kg", squat: "207", bench: "134", deadlift: "252",
        session: "Squat day", sets: "4 of 12 sets", meet: "23 days out", at: nil,
        setsDone: 4, setsTotal: 12, weekDone: 2, weekGoal: 4, streak: 3, meetDays: 23,
        openers: Openers(squat: "190", bench: "125", deadlift: "230"),
        lastWeight: "83.1", weighedToday: false,
        totalDelta: "+12",
        next: Next(lift: "squat", name: "Comp squat", load: "185", reps: "3", rpe: "8", key: "sample|4"),
        weekStart: nil, weekDays: [1, 0, 1, 0, 0, 0, 0], todayIdx: 3,
        weighTrend: [83.9, 83.7, 83.8, 83.5, 83.6, 83.4, 83.3, 83.4, 83.2, 83.1], weighDelta: "−0.4",
        queue: [Next(lift: "squat", name: "Comp squat", load: "185", reps: "3", rpe: "8", key: "sample|4"),
                Next(lift: "squat", name: "Comp squat", load: "185", reps: "3", rpe: "8", key: "sample|5")],
        healthOn: true,
        health: Health(day: nil, word: "Fresh", level: 1,
                       sleep: Metric(value: "7 h 40", usual: "7 h 05", off: false),
                       rhr: Metric(value: "52", usual: "54", off: false),
                       hrv: Metric(value: "68", usual: "61", off: false),
                       line: "Slept 7 h 40 · HR 52"),
        cut: Cut(cls: "83 kg class", classLine: 83, unit: "kg", cur: "83.3", status: "0.3 kg to go", tone: "good",
                 pace: "−0.4 a week", need: "−0.1", by: "Nov 14", trend: [83.6, 83.4, 83.3, 83.4, 83.2, nil, 83.1]))

    /// The app writes `at` (ms) with every snapshot. Facts tied to a date (weighed today, a rest
    /// day, a finished session) only hold on the day it was written: the lifter's own calendar
    /// day, as the app counts it (todayISO()). No `at` means the gallery sample, always "today".
    var writtenToday: Bool {
        guard let at else { return true }
        return PowaStore.day.isDate(Date(timeIntervalSince1970: at / 1000), inSameDayAs: Date())
    }

    /// The meet countdown, counted on from when the app wrote it (daysUntil counts local days),
    /// so it still reaches "Go lift." when the app isn't opened. Nil once the meet has passed.
    var meetDaysNow: Int? {
        guard let d = meetDays else { return nil }
        guard let at else { return d }
        let cal = Calendar.current
        let gone = cal.dateComponents([.day], from: cal.startOfDay(for: Date(timeIntervalSince1970: at / 1000)),
                                      to: cal.startOfDay(for: Date())).day ?? 0
        return d - gone >= 0 ? d - gone : nil
    }

    /// A rest day or a finished session belongs to the day it was written; an unfinished
    /// session carries on (Train offers the same day again).
    var sessionStale: Bool {
        guard !writtenToday else { return false }
        let total = setsTotal ?? 0
        return session == "Rest day" || (total > 0 && (setsDone ?? 0) >= total)
    }

    /// Last night's numbers, only on the morning they belong to (no `day` = the gallery sample).
    var healthNow: Health? {
        guard let h = health else { return nil }
        if let d = h.day, d != PowaStore.todayISO() { return nil }
        return h
    }

    /// The weight-class trend moved on to today: days since the app wrote drop off the front
    /// and come in empty at the end, so a week-old line never passes for this week's.
    var cutTrendNow: [Double?]? {
        guard let t = cut?.trend, t.count == 7, let at else { return cut?.trend }
        let cal = PowaStore.day
        let gone = cal.dateComponents([.day], from: cal.startOfDay(for: Date(timeIntervalSince1970: at / 1000)),
                                      to: cal.startOfDay(for: Date())).day ?? 0
        if gone <= 0 { return t }
        if gone >= 7 { return Array(repeating: nil, count: 7) }
        return Array(t.dropFirst(gone)) + Array(repeating: nil, count: gone)
    }

    /// This week, read against today's date: once a new week starts, last week's dots and
    /// count clear even before the app writes again, and the streak only carries over when last
    /// week hit the goal.
    var week: (days: [Int]?, today: Int?, done: Int, streak: Int) {
        let cal = PowaStore.day
        let now = Date()
        let idx = (cal.component(.weekday, from: now) + 5) % 7                     // Monday = 0
        guard let ws = weekStart, let written = PowaStore.date(ws) else { return (weekDays, todayIdx, weekDone ?? 0, streak ?? 0) }
        let monday = cal.startOfDay(for: cal.date(byAdding: .day, value: -idx, to: now) ?? now)
        if PowaStore.iso(monday) == ws { return (weekDays, idx, weekDone ?? 0, streak ?? 0) }
        let weeksOn = Int((monday.timeIntervalSince(written) / 86400 / 7).rounded())
        let lastMet = (weekDone ?? 0) >= max(1, weekGoal ?? 3)
        return ([0, 0, 0, 0, 0, 0, 0], idx, 0, weeksOn == 1 && lastMet ? (streak ?? 0) : 0)
    }
}

/// The App Group keys the widgets and WidgetBridgePlugin share (keep the plugin in sync).
enum PowaStore {
    static let suite = "group.com.powalifta.app"
    static var defaults: UserDefaults? { UserDefaults(suiteName: suite) }
    static let draftKey = "powa.weigh.draft"          // Double, display units, the weigh-in widget's dial
    static let loggedKey = "powa.weigh.loggedDate"    // "YYYY-MM-DD": logged from the widget today
    static let pendingKey = "powa.widget.pending"     // JSON [{date, value, unit}] the app still has to save
    static let setsPendingKey = "powa.widget.pendingSets" // JSON [{key, date}] sets logged from the session widget
    /// The app's dates are the lifter's local calendar days (todayISO() in app.js, since
    /// 2026-10-21), so the widgets count days the same way: a weigh-in or a set logged from a
    /// widget lands on the date the app would give it. Gregorian, so a Buddhist or Japanese
    /// system calendar can't change the year in the 'YYYY-MM-DD' strings.
    static var day: Calendar {
        var c = Calendar(identifier: .gregorian)
        c.timeZone = .current
        return c
    }
    private static func formatter() -> DateFormatter {
        let f = DateFormatter()
        let c = day
        f.calendar = c; f.timeZone = c.timeZone; f.locale = Locale(identifier: "en_US_POSIX"); f.dateFormat = "yyyy-MM-dd"
        return f
    }
    static func iso(_ date: Date) -> String { formatter().string(from: date) }
    static func date(_ iso: String) -> Date? { formatter().date(from: iso) }
    static func todayISO() -> String { iso(Date()) }
    /// The next redraw: local midnight (the app's day: the week, weighed today, a finished
    /// session, the meet countdown).
    static func nextMidnight() -> Date {
        let t = DateComponents(hour: 0, minute: 0, second: 10)
        return day.nextDate(after: Date(), matching: t, matchingPolicy: .nextTime) ?? Date().addingTimeInterval(6 * 3600)
    }
}

/// Sets logged from the session widget since the app last wrote. Tied to that snapshot's `at`,
/// so the app's next snapshot (which already counts them) starts the list afresh.
enum PowaSessionLog {
    static let key = "powa.session.logged"
    static func keys(for snap: PowaSnapshot) -> [String] {
        guard let d = PowaStore.defaults, let obj = d.dictionary(forKey: key),
              let at = obj["at"] as? Double, at == (snap.at ?? -1) else { return [] }
        return obj["keys"] as? [String] ?? []
    }
    static func save(_ snap: PowaSnapshot, keys: [String]) {
        PowaStore.defaults?.set(["at": snap.at ?? -1, "keys": keys] as [String: Any], forKey: key)
    }
}

struct PowaEntry: TimelineEntry {
    let date: Date
    let snap: PowaSnapshot?
}

struct PowaProvider: TimelineProvider {
    func placeholder(in context: Context) -> PowaEntry { PowaEntry(date: Date(), snap: PowaSnapshot.sample) }

    func getSnapshot(in context: Context, completion: @escaping (PowaEntry) -> Void) {
        // The gallery gets the sample; a real Home Screen never shows numbers that aren't yours.
        completion(PowaEntry(date: Date(), snap: context.isPreview ? PowaSnapshot.sample : PowaSnapshot.load()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<PowaEntry>) -> Void) {
        // The app reloads the timeline itself after every logged set; this is the backstop, and the
        // redraw at the day's turn (a finished session or a rest day doesn't carry over).
        let entry = PowaEntry(date: Date(), snap: PowaSnapshot.load())
        let next = min(PowaStore.nextMidnight(), Date().addingTimeInterval(6 * 3600))
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - The look

/// The lift identity colours the app uses everywhere (styles.css --lift-*).
enum Lift {
    static let squat = Color(red: 0.220, green: 0.776, blue: 1.0)      // #38c6ff
    static let bench = Color(red: 0.663, green: 0.545, blue: 1.0)      // #a98bff
    static let deadlift = Color(red: 1.0, green: 0.749, blue: 0.235)   // #ffbf3c
    static func color(_ key: String?) -> Color {
        switch key {
        case "squat": return squat
        case "bench": return bench
        case "deadlift": return deadlift
        default: return Color(white: 0.8)
        }
    }
}

/// The light each widget is lit by, the status colours, and ink levels that hold 4.5:1 on graphite.
enum Hue {
    static let fire = Color(red: 1.0, green: 0.231, blue: 0.290)     // #ff3b4a, the one action
    static let fire2 = Color(red: 1.0, green: 0.416, blue: 0.239)    // #ff6a3d
    static let ok = Color(red: 0.204, green: 0.851, blue: 0.510)     // #34d982, goal hit / done
    static let bw = Color(red: 0.353, green: 0.784, blue: 0.980)     // #5ac8fa, bodyweight
    static let flame = Color(red: 1.0, green: 0.624, blue: 0.263)    // #ff9f43, the streak
    static let slab = Color(red: 0.898, green: 0.149, blue: 0.184)   // #e5262f, referee red (meet day)
    /// The one red action's fill: the fire gradient in full colour; on a tinted or clear Home
    /// Screen (one tint, opacity only) a light fill, so its white label still reads.
    static func action(_ mode: WidgetRenderingMode) -> AnyShapeStyle {
        mode == .fullColor
            ? AnyShapeStyle(LinearGradient(colors: [fire, fire2], startPoint: .topLeading, endPoint: .bottomTrailing))
            : AnyShapeStyle(Color.white.opacity(0.22))
    }
    static let ink2 = Color.white.opacity(0.64)
    static let ink3 = Color.white.opacity(0.5)
    static let track = Color.white.opacity(0.13)
}

/// Graphite, one soft light from the top left in the widget's hue (18%), a hairline edge.
/// `hue: nil` is the meet-day slab: black and white, no light.
struct PowaBG: View {
    var hue: Color?
    var body: some View {
        ZStack {
            LinearGradient(colors: [Color(red: 0.094, green: 0.094, blue: 0.110), Color(red: 0.043, green: 0.043, blue: 0.047)],
                           startPoint: .top, endPoint: .bottom)
            if let hue {
                RadialGradient(colors: [hue.opacity(0.18), hue.opacity(0)],
                               center: UnitPoint(x: 0.12, y: -0.08), startRadius: 0, endRadius: 210)
            }
            ContainerRelativeShape()
                .strokeBorder(LinearGradient(colors: [Color.white.opacity(0.12), Color.white.opacity(0.03)],
                                             startPoint: .top, endPoint: .bottom), lineWidth: 1)
        }
    }
}

/// iOS 17 draws the widget's background itself (and pads the content); iOS 16 needs both from
/// us, except on the Lock Screen, where widgets have neither.
private struct PowaWidgetBackground: ViewModifier {
    let hue: Color?
    @Environment(\.widgetFamily) private var family
    @ViewBuilder func body(content: Content) -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            content.containerBackground(for: .widget) { PowaBG(hue: hue) }
        } else if family == .systemSmall || family == .systemMedium || family == .systemLarge || family == .systemExtraLarge {
            content.padding(16).background(PowaBG(hue: hue))
        } else {
            content
        }
    }
}

extension View {
    func powaWidgetBackground(_ hue: Color?) -> some View { modifier(PowaWidgetBackground(hue: hue)) }
}

/// Reads the family once at the top, so every view below takes it as a plain value.
struct FamilyReader<Content: View>: View {
    @Environment(\.widgetFamily) private var family
    let content: (WidgetFamily) -> Content
    init(@ViewBuilder content: @escaping (WidgetFamily) -> Content) { self.content = content }
    var body: some View { content(family) }
}

/// The brand mark: one sleeve of a loaded bar, side-on (app.js BRAND_MARK, on its 32-unit grid).
struct BrandMark: View {
    var size: CGFloat = 14
    var body: some View {
        let k = size / 32
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 1.4 * k, style: .continuous).fill(Color.white)
                .frame(width: 29 * k, height: 2.8 * k).offset(x: 1.5 * k, y: 14.6 * k)
            RoundedRectangle(cornerRadius: 2.2 * k, style: .continuous).fill(Powa.red)
                .frame(width: 7.5 * k, height: 26 * k).offset(x: 8 * k, y: 3 * k)
                .widgetAccentable()
            RoundedRectangle(cornerRadius: 1.6 * k, style: .continuous).fill(Color.white)
                .frame(width: 4 * k, height: 17 * k).offset(x: 17 * k, y: 7.5 * k)
            RoundedRectangle(cornerRadius: 1.1 * k, style: .continuous).fill(Color.white)
                .frame(width: 2.6 * k, height: 8 * k).offset(x: 22.5 * k, y: 12 * k)
        }
        .frame(width: size, height: size, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}

/// The quiet header every widget opens with: the mark, and what the widget is.
struct WidgetTitle: View {
    let text: String
    var body: some View {
        HStack(spacing: 6) {
            BrandMark(size: 14)
            Text(text)
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Hue.ink2)
                .lineLimit(1)
        }
    }
}

/// A wide, heavy number with its unit; it rolls when the value changes.
struct HeroNumber: View {
    let value: String
    var unit: String? = nil
    var size: CGFloat = 40
    var color: Color = .white
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: size * 0.08) {
            Text(value)
                .font(.system(size: size, weight: .heavy).width(.expanded))
                .monospacedDigit()
                .tracking(-0.02 * size)
                .foregroundColor(color)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText())
            if let unit {
                Text(unit)
                    .font(.system(size: max(12, size * 0.34), weight: .semibold))
                    .foregroundColor(Hue.ink3)
                    .lineLimit(1)
                    .fixedSize()
            }
        }
    }
}

/// The total, split: one capsule per lift as wide as its share, the number under it.
struct LiftBar: View {
    let squat: String?
    let bench: String?
    let deadlift: String?
    var body: some View {
        let labels = [squat, bench, deadlift].map { v -> String in
            guard let v, !v.isEmpty else { return "–" }
            return v
        }
        let vals = labels.map { Double($0) ?? 0 }
        let known = vals.allSatisfy { $0 > 0 }
        let sum = vals.reduce(0, +)
        // Every lift keeps room for its number (20% of the bar at least); unknown lifts share evenly.
        let shares: [Double] = known ? vals.map { max($0 / sum, 0.2) } : [1, 1, 1]
        let norm = shares.reduce(0, +)
        let colors = [Lift.squat, Lift.bench, Lift.deadlift]
        GeometryReader { g in
            let gap: CGFloat = 3
            let w = max(0, g.size.width - gap * 2)
            HStack(alignment: .top, spacing: gap) {
                ForEach(0..<3, id: \.self) { i in
                    let segW = w * CGFloat(shares[i] / norm)
                    // First number flush left, middle centred, last flush right: even gaps
                    // whatever the split, and each number still sits inside its own lift.
                    let align: Alignment = i == 0 ? .leading : i == 1 ? .center : .trailing
                    VStack(spacing: 6) {
                        Capsule().fill(colors[i].opacity(vals[i] > 0 ? 1 : 0.3))
                            .frame(width: segW, height: 6)
                        Text(labels[i])
                            .font(.system(size: 13, weight: .bold))
                            .monospacedDigit()
                            .foregroundColor(vals[i] > 0 ? .white : Hue.ink3)
                            .lineLimit(1)
                            .minimumScaleFactor(0.6)
                            .frame(width: segW, alignment: align)
                    }
                }
            }
        }
        .frame(height: 28)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Squat \(labels[0]), bench \(labels[1]), deadlift \(labels[2])")
    }
}

/// Sets as segments: lit for done, a dim track for to do (one bar past `maxSegments`).
struct Segments: View {
    let done: Int
    let total: Int
    var color: Color = .white
    var maxSegments = 24
    var body: some View {
        let n = max(1, total)
        if n <= maxSegments {
            HStack(spacing: 3) {
                ForEach(0..<n, id: \.self) { i in
                    Capsule().fill(i < done ? color : Hue.track).frame(height: 6)
                }
            }
            .frame(height: 6)
        } else {
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(Hue.track)
                    Capsule().fill(color).frame(width: g.size.width * CGFloat(min(done, n)) / CGFloat(n))
                }
            }
            .frame(height: 6)
        }
    }
}

struct SetProgress: View {
    let done: Int
    let total: Int
    var color: Color = .white
    var maxSegments = 24
    var body: some View {
        HStack(spacing: 8) {
            Segments(done: done, total: total, color: color, maxSegments: maxSegments)
            Text("\(done)/\(total)")
                .font(.system(size: 11, weight: .bold))
                .monospacedDigit()
                .foregroundColor(Hue.ink2)
                .fixedSize()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(done) of \(total) sets done")
    }
}

enum PowaFormat {
    /// "185 × 3 @8", or "× 5 @7" before the load is set; nil when the set has nothing to show.
    static func prescription(_ n: PowaSnapshot.Next, unit: String? = nil) -> String? {
        var parts: [String] = []
        if let l = n.load, !l.isEmpty { parts.append(unit.map { "\(l) \($0)" } ?? l) }
        if let r = n.reps, !r.isEmpty { parts.append("× \(r)") }
        if let e = n.rpe, !e.isEmpty { parts.append("@\(e)") }
        return parts.isEmpty ? nil : parts.joined(separator: " ")
    }
}

/// The next set in two short lines: the lift (its colour, its name), then the prescription.
struct NextLines: View {
    let next: PowaSnapshot.Next
    let unit: String
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                Circle().fill(Lift.color(next.lift)).frame(width: 6, height: 6)
                Text(next.name ?? "Next set").foregroundColor(Hue.ink2).lineLimit(1)
            }
            .font(.system(size: 12, weight: .semibold))
            if let p = PowaFormat.prescription(next, unit: unit) {
                Text(p)
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
        }
        .accessibilityElement(children: .combine)
    }
}

/// What a widget says on a real Home Screen before the app has written anything (never in the
/// gallery): one plain line where the number will be, so it reads as waiting, not broken.
struct EmptyState: View {
    let title: String
    let line: String
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: title)
            Spacer(minLength: 4)
            Text(line)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(.white)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
        }
    }
}

// MARK: - Total

struct TotalView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    var body: some View {
        let total = snap?.total.flatMap { $0 == "–" || $0.isEmpty ? nil : $0 }
        if let s = snap, family == .systemMedium {
            // Two equal halves in every state; a lifter with no total yet still sees today.
            HStack(spacing: 0) {
                Group {
                    if let total { TotalColumn(s: s, total: total) } else { EmptyState(title: "Total", line: "Your first set starts it.") }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1).padding(.horizontal, 16)
                TodayColumn(s: s).frame(maxWidth: .infinity, alignment: .leading)
            }
        } else if let s = snap, let total {
            TotalColumn(s: s, total: total)
        } else {
            EmptyState(title: "Total", line: "Log a set and your total lands here.")
        }
    }
}

private struct TotalColumn: View {
    let s: PowaSnapshot
    let total: String
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: "Total")
            Spacer(minLength: 4)
            HeroNumber(value: total, unit: s.unit ?? "kg", size: 40)
            DeltaLine(delta: s.totalDelta, unit: s.unit ?? "kg").padding(.top, 2)
            Spacer(minLength: 8)
            LiftBar(squat: s.squat, bench: s.bench, deadlift: s.deadlift)
        }
    }
}

/// Up over four weeks in green (the move Progress shows); otherwise where the number comes from.
private struct DeltaLine: View {
    let delta: String?
    let unit: String
    var body: some View {
        if let d = delta, d.hasPrefix("+") {
            HStack(spacing: 3) {
                Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .heavy))
                Text("\(String(d.dropFirst())) \(unit) in 4 weeks")
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(Hue.ok)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        } else {
            Text("From your best sets")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(Hue.ink3)
                .lineLimit(1)
        }
    }
}

/// Medium Total's right half: today's session, the next set, how far you are.
private struct TodayColumn: View {
    let s: PowaSnapshot
    var body: some View {
        let rest = s.session == "Rest day"
        let total = s.setsTotal ?? 0
        let done = s.setsDone ?? 0
        VStack(alignment: .leading, spacing: 0) {
            Text("Today")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(Hue.ink2)
            Spacer(minLength: 4)
            if s.sessionStale {
                Text("Open the app for today's session.")
                    .font(.system(size: 13, weight: .medium)).foregroundColor(Hue.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(s.session ?? "Nothing planned")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(.white)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if rest {
                    Text("Recovery is part of the plan.")
                        .font(.system(size: 12, weight: .medium)).foregroundColor(Hue.ink2).padding(.top, 3)
                } else if total > 0 && done >= total {
                    Text("Session done")
                        .font(.system(size: 12, weight: .semibold)).foregroundColor(Hue.ok).padding(.top, 3)
                } else if let n = s.next {
                    NextLines(next: n, unit: s.unit ?? "kg").padding(.top, 4)
                }
            }
            Spacer(minLength: 8)
            if total > 0 && !rest && !s.sessionStale {
                // A narrow column draws one bar, not a row of dots.
                SetProgress(done: done, total: total, color: done >= total ? Hue.ok : .white, maxSegments: 8)
            }
        }
    }
}

struct PowaHomeWidget: Widget {
    let kind = "PowaHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PowaProvider()) { entry in
            FamilyReader { family in TotalView(snap: entry.snap, family: family) }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground(Hue.fire)
        }
        .configurationDisplayName("Total")
        .description("Your total, the three lifts behind it and today's session.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
