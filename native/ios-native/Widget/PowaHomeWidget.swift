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
//  The look (2026-10-30, the app's own): graphite lit by one soft light in the widget's hue, a
//  hairline edge, the brand mark instead of a wordmark, wide heavy numerals with a plain label, and
//  colour only where it means something: the lift colours, green for done / up / their words /
//  money in, gold for a PR, a meet or a streak, an orange triangle for a warning (never red), and
//  the app's crimson for the one action (white label). Dark first; light follows the phone (white
//  graphite, deeper inks), and on a tinted or clear Home Screen and the Lock Screen (one tint,
//  opacity only) every level is ink at an opacity, with the number that matters accentable.
//
//  One snapshot, two people: the lifter's app writes role "lifter" (athlete.html syncHomeWidget),
//  the coach's writes role "coach" and its `coach` block (coach-widget.js). A widget for the other
//  one says so in one line, never someone else's numbers.
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
    // 2026-10-30 (the PR widget, the coach's widgets). All optional, as ever.
    var role: String?           // "lifter" | "coach"; nil = a build from before (always a lifter)
    var lastPR: PR?             // the lifter's latest PR, as the PR moment shows it; nil = none yet
    var coach: Coach?           // the coach's block (role "coach"); nil on a lifter's phone

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
    /// The latest PR (app.js widgetLastPR): the competition-equivalent e1RM, rounded in the unit shown,
    /// the jump over the best before it, the lift and the day it was lifted.
    struct PR: Codable {
        var lift: String?       // squat | bench | deadlift
        var value: String?      // "212"
        var delta: String?      // "+5"
        var unit: String?       // kg | lbs
        var date: String?       // "YYYY-MM-DD"
    }
    /// The coach's widgets (coach-widget.js CoachWidget.build), over the app's own model.
    struct Coach: Codable {
        var need: Int?          // how many need you this week (Home's "4 need you")
        var jobs: [Job]?        // the top three, Home's order: pain first, then a meet today, then how soon
        var meets: [Meet]?      // the next meets, nearest first, one per meet
        var money: Money?       // this month's money; nil = Clients not set up on this build
        var week: TeamWeek?     // the team's sessions this week
    }
    struct Job: Codable {
        var id: String?         // the lifter (opens their page); nil for a meet day with several
        var name: String?       // "Sarah"; a meet day with several lifters: the meet ("Autumn Open")
        var flag: String?       // "Low back 6/10"; for that meet: "Today · Tom, Priya, Callum"
        var verb: String?       // the fix, one word or two: Message | Meet day | Approve | Reply…
        var tone: String?       // pain | watch | meet | msg | plan
    }
    struct Meet: Codable {
        var name: String?       // "Autumn Open"
        var date: String?       // "YYYY-MM-DD"
        var who: [String]?      // first names
    }
    struct Money: Codable {
        var any: Bool?          // false: no packages yet
        var got: String?        // "$590": received this calendar month
        var of: String?         // "$810": received + still owed by the month's end
        var pct: Double?        // 0…1, the meter
        var month: String?      // "YYYY-MM" these belong to
        var due: [String]?      // each active package's next due date ("YYYY-MM-DD"): overdue is counted here, today
    }
    struct TeamWeek: Codable {
        var done: Int?          // sessions lifted this week so far (Home's ring)
        var planned: Int?       // sessions written this week
        var behind: Int?        // lifters behind (Lifters › Behind)
        var behindName: String? // the first of them
        var weekStart: String?  // "YYYY-MM-DD", the Monday
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

    /// The gallery's lifter (mid-block, mid-session, three weeks into a streak, 23 days out, a squat
    /// PR two days ago) and the gallery's coach (six need you, a meet today, a month two-thirds paid).
    /// No role: the gallery shows every widget with its own half of it.
    static let sample: PowaSnapshot = {
        let today = PowaStore.todayISO()
        let day = { (n: Int) -> String in PowaStore.iso(PowaStore.day.date(byAdding: .day, value: n, to: Date()) ?? Date()) }
        return PowaSnapshot(
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
                     pace: "−0.4 a week", need: "−0.1", by: "Nov 14", trend: [83.6, 83.4, 83.3, 83.4, 83.2, nil, 83.1]),
            role: nil,
            lastPR: PR(lift: "squat", value: "212", delta: "+5", unit: "kg", date: day(-2)),
            coach: Coach(
                need: 6,
                jobs: [Job(id: "sample-sarah", name: "Sarah", flag: "Low back 6/10", verb: "Message", tone: "pain"),
                       Job(id: nil, name: "Autumn Open", flag: "Today · Tom, Priya, Callum", verb: "Meet day", tone: "meet"),
                       Job(id: "sample-nina", name: "Nina", flag: "Busy week · 2 days", verb: "Approve", tone: "watch")],
                meets: [Meet(name: "Autumn Open", date: today, who: ["Tom", "Priya", "Callum"]),
                        Meet(name: "City Classic", date: day(33), who: ["Sarah"])],
                money: Money(any: true, got: "$590", of: "$810", pct: 0.73, month: String(today.prefix(7)), due: [day(-3), day(4), day(12)]),
                week: TeamWeek(done: 18, planned: 24, behind: 2, behindName: "Ines", weekStart: nil)))
    }()

    /// The app writes `at` (ms) with every snapshot. Facts tied to a date (weighed today, a rest
    /// day, a finished session) only hold on the day it was written: the lifter's own calendar
    /// day, as the app counts it (todayISO()). No `at` means the gallery sample, always "today".
    var writtenToday: Bool {
        guard let at else { return true }
        return PowaStore.day.isDate(Date(timeIntervalSince1970: at / 1000), inSameDayAs: Date())
    }

    /// Written on an earlier day: when, in a word ("Yesterday", "Tue", "Oct 12"), for the coach's
    /// widgets to say beside their title; nil when it's today's (or the sample).
    var writtenWhen: String? {
        guard let at, !writtenToday else { return nil }
        let d = Date(timeIntervalSince1970: at / 1000)
        let n = PowaStore.days(from: d, to: Date())
        if n == 1 { return "Yesterday" }
        return PowaFormat.shortDay(d, within: n < 7)
    }
    /// The same in the fewest letters, for a title with no room ("Wed" for yesterday).
    var writtenWhenShort: String? {
        guard let at, !writtenToday else { return nil }
        let d = Date(timeIntervalSince1970: at / 1000)
        return PowaFormat.shortDay(d, within: PowaStore.days(from: d, to: Date()) < 7)
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

    /// A coach's widget on this phone: the coach block, unless the app says this is a lifter.
    var coachNow: Coach? { role == "lifter" ? nil : coach }
    /// A lifter's widget on a coach's phone shows one line instead (never a coach's empty numbers).
    var isCoach: Bool { role == "coach" }
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
    /// Whole calendar days from one date to another (local midnights, so an hour either side of
    /// midnight is still a day).
    static func days(from a: Date, to b: Date) -> Int {
        let c = day
        return c.dateComponents([.day], from: c.startOfDay(for: a), to: c.startOfDay(for: b)).day ?? 0
    }
    /// Days from today to a 'YYYY-MM-DD' (negative once it has passed); nil for a bad date.
    static func daysUntil(_ iso: String?) -> Int? {
        guard let iso, let d = date(iso) else { return nil }
        return days(from: Date(), to: d)
    }
    /// The Monday of this week, as the app writes weekStart.
    static func mondayISO() -> String {
        let c = day, now = Date()
        let idx = (c.component(.weekday, from: now) + 5) % 7
        return iso(c.date(byAdding: .day, value: -idx, to: now) ?? now)
    }
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

extension Color {
    /// 0xRRGGBB, as the app's CSS writes it.
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB, red: Double((hex >> 16) & 0xff) / 255, green: Double((hex >> 8) & 0xff) / 255,
                  blue: Double(hex & 0xff) / 255, opacity: opacity)
    }
}

/// The lift identity colours the app uses everywhere (styles.css --lift-*).
enum Lift {
    static let squat = Color(hex: 0x38c6ff)
    static let bench = Color(hex: 0xa98bff)
    static let deadlift = Color(hex: 0xffbf3c)
    static func color(_ key: String?) -> Color {
        switch key {
        case "squat": return squat
        case "bench": return bench
        case "deadlift": return deadlift
        default: return Color(white: 0.8)
        }
    }
    static func name(_ key: String?) -> String {
        switch key {
        case "squat": return "Squat"
        case "bench": return "Bench"
        case "deadlift": return "Deadlift"
        default: return "Lift"
        }
    }
}

/// Every colour, by what it means (the app's tokens: styles.css, coach-app.css). The light each
/// widget is lit by comes from here; what draws on top comes from the palette (`Pal`).
enum Hue {
    static let crimson1 = Color(hex: 0xdc2637)   // the one action, lit from above (--crimson)
    static let crimson2 = Color(hex: 0xc41a2c)
    static let logo = Color(hex: 0xff2d3f)       // the 25 kg plate in the brand mark (BRAND_MARK)
    static let steel = Color(hex: 0xc9ced6)      // the light of a widget with no colour of its own
    static let ok = Color(hex: 0x34e08c)         // done, up, their words, money in
    static let gold = Color(hex: 0xffc23d)       // a PR, a meet, a streak, the class line
    static let warn = Color(hex: 0xff9f45)       // the triangle: a warning (never red)
    static let bw = Color(hex: 0x5ac8fa)         // bodyweight
    static let rest = Color(hex: 0x7f8cff)       // a normal morning (Readiness)
    /// The one action's fill: the crimson, lit from above, in full colour; on a tinted or clear Home
    /// Screen (one tint, opacity only) a light fill, so its white label still reads.
    static func action(_ mode: WidgetRenderingMode) -> AnyShapeStyle {
        mode == .fullColor
            ? AnyShapeStyle(LinearGradient(colors: [crimson1, crimson2], startPoint: .top, endPoint: .bottom))
            : AnyShapeStyle(Color.white.opacity(0.22))
    }
}

/// What a widget draws with: ink levels that hold 4.5:1 on its graphite, and the meaning colours,
/// deepened in light so they read on white. `mono`: a tinted or clear Home Screen, StandBy at night
/// and the Lock Screen, where iOS keeps only opacity, so every level is ink at an opacity.
struct Pal {
    var dark = true
    var mono = false
    private var light: Bool { !dark && !mono }
    var ink: Color { light ? Color(hex: 0x16161a) : Color(white: 0.97) }
    var ink2: Color { light ? Color(hex: 0x45454d) : Color.white.opacity(0.66) }
    var ink3: Color { light ? Color(hex: 0x5d5d67) : Color.white.opacity(0.5) }
    var track: Color { light ? Color(hex: 0x0f0f19, opacity: 0.09) : Color.white.opacity(0.13) }
    var rule: Color { light ? Color(hex: 0x0f0f19, opacity: 0.09) : Color.white.opacity(0.09) }
    var quiet: Color { light ? Color(hex: 0x0f0f19, opacity: 0.065) : Color.white.opacity(0.12) }
    /// A lift's fill (a capsule, a dot) and its words.
    func lift(_ key: String?) -> Color {
        if mono { return ink }
        if dark { return Lift.color(key) }
        switch key {
        case "squat": return Color(hex: 0x2d9ecc)
        case "bench": return Color(hex: 0x876fcc)
        case "deadlift": return Color(hex: 0xcc9930)
        default: return ink3
        }
    }
    func liftInk(_ key: String?) -> Color {
        if mono || dark { return lift(key) }
        switch key {
        case "squat": return Color(hex: 0x1f6f8f)
        case "bench": return Color(hex: 0x5f4e8f)
        case "deadlift": return Color(hex: 0x8f6b22)
        default: return ink2
        }
    }
    var ok: Color { mono ? ink : dark ? Hue.ok : Color(hex: 0x2ab370) }
    var okInk: Color { mono ? ink : dark ? Hue.ok : Color(hex: 0x0c7a45) }
    var gold: Color { mono ? ink : dark ? Hue.gold : Color(hex: 0xcc9b31) }
    var goldInk: Color { mono ? ink : dark ? Hue.gold : Color(hex: 0x8a5d00) }
    var warn: Color { mono ? ink : dark ? Hue.warn : Color(hex: 0xe06414) }
    var bw: Color { mono ? ink : dark ? Hue.bw : Color(hex: 0x48a0c8) }
    var bwInk: Color { mono ? ink : dark ? Hue.bw : Color(hex: 0x32708c) }
    var rest: Color { mono ? ink : dark ? Hue.rest : Color(hex: 0x6670cc) }
    var restInk: Color { mono ? ink : dark ? Hue.rest : Color(hex: 0x474e8f) }
}

private struct PalKey: EnvironmentKey { static let defaultValue = Pal() }
extension EnvironmentValues {
    var powaPal: Pal {
        get { self[PalKey.self] }
        set { self[PalKey.self] = newValue }
    }
}

/// Graphite, one soft light from the top left in the widget's hue, a hairline edge. In light: white
/// graphite, the light fainter, the edge in ink. `hue: nil`: no light (the meet-day slab).
struct PowaBG: View {
    var hue: Color?
    @Environment(\.colorScheme) private var scheme
    var body: some View {
        let dark = scheme != .light
        ZStack {
            LinearGradient(colors: dark ? [Color(hex: 0x18181c), Color(hex: 0x0b0b0c)] : [Color(hex: 0xffffff), Color(hex: 0xf1f1f4)],
                           startPoint: .top, endPoint: .bottom)
            if let hue {
                RadialGradient(colors: [hue.opacity(dark ? 0.16 : 0.11), hue.opacity(0)],
                               center: UnitPoint(x: 0.12, y: -0.08), startRadius: 0, endRadius: 210)
            }
            ContainerRelativeShape()
                .strokeBorder(LinearGradient(colors: dark ? [Color.white.opacity(0.12), Color.white.opacity(0.03)]
                                                          : [Color(hex: 0x0f0f19, opacity: 0.10), Color(hex: 0x0f0f19, opacity: 0.04)],
                                             startPoint: .top, endPoint: .bottom), lineWidth: 1)
        }
    }
}

/// iOS 17 draws the widget's background itself (and pads the content); iOS 16 needs both from
/// us, except on the Lock Screen, where widgets have neither. Every widget's palette is set here,
/// from the appearance and the way iOS renders it.
private struct PowaWidgetBackground: ViewModifier {
    let hue: Color?
    @Environment(\.widgetFamily) private var family
    @Environment(\.colorScheme) private var scheme
    @Environment(\.widgetRenderingMode) private var mode
    @ViewBuilder func body(content: Content) -> some View {
        let inner = content.environment(\.powaPal, Pal(dark: scheme != .light, mono: mode != .fullColor))
        if #available(iOS 17.0, macOS 14.0, *) {
            inner.containerBackground(for: .widget) { PowaBG(hue: hue) }
        } else if family == .systemSmall || family == .systemMedium || family == .systemLarge || family == .systemExtraLarge {
            inner.padding(16).background(PowaBG(hue: hue))
        } else {
            inner
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
/// The 25 kg plate is the logo's red; the bar and the small plates are ink.
struct BrandMark: View {
    var size: CGFloat = 14
    @Environment(\.powaPal) private var p
    var body: some View {
        let k = size / 32
        ZStack(alignment: .topLeading) {
            RoundedRectangle(cornerRadius: 1.4 * k, style: .continuous).fill(p.ink)
                .frame(width: 29 * k, height: 2.8 * k).offset(x: 1.5 * k, y: 14.6 * k)
            RoundedRectangle(cornerRadius: 2.2 * k, style: .continuous).fill(p.mono ? p.ink : Hue.logo)
                .frame(width: 7.5 * k, height: 26 * k).offset(x: 8 * k, y: 3 * k)
                .widgetAccentable()
            RoundedRectangle(cornerRadius: 1.6 * k, style: .continuous).fill(p.ink)
                .frame(width: 4 * k, height: 17 * k).offset(x: 17 * k, y: 7.5 * k)
            RoundedRectangle(cornerRadius: 1.1 * k, style: .continuous).fill(p.ink)
                .frame(width: 2.6 * k, height: 8 * k).offset(x: 22.5 * k, y: 12 * k)
        }
        .frame(width: size, height: size, alignment: .topLeading)
        .accessibilityHidden(true)
    }
}

/// The quiet header every widget opens with: the mark, and what the widget is; on the right, when
/// the numbers are from an earlier day, when ("Yesterday", or "Wed" where that doesn't fit).
struct WidgetTitle: View {
    let text: String
    var stamp: String? = nil
    var stampShort: String? = nil
    @Environment(\.powaPal) private var p
    var body: some View {
        if let stamp {
            ViewThatFits(in: .horizontal) {
                row(stamp, whole: true)
                row(stampShort ?? stamp, whole: true)
                row(stampShort ?? stamp, whole: false)
            }
        } else {
            row(nil, whole: false)
        }
    }

    private func row(_ s: String?, whole: Bool) -> some View {
        HStack(spacing: 0) {
            HStack(spacing: 6) {
                BrandMark(size: 14)
                Text(text)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundColor(p.ink2)
                    .lineLimit(1)
                    .fixedSize(horizontal: whole, vertical: false)
            }
            if let s {
                Spacer(minLength: 6)
                Text(s)
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(p.ink3)
                    .lineLimit(1)
                    .fixedSize()
                    .accessibilityLabel("As of \(s.lowercased())")
            }
        }
    }
}

/// A wide, heavy number with its unit; it rolls when the value changes.
struct HeroNumber: View {
    let value: String
    var unit: String? = nil
    var size: CGFloat = 40
    var color: Color? = nil
    @Environment(\.powaPal) private var p
    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: size * 0.08) {
            Text(value)
                .font(.system(size: size, weight: .heavy).width(.expanded))
                .monospacedDigit()
                .tracking(-0.02 * size)
                .foregroundColor(color ?? p.ink)
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .contentTransition(.numericText())
                .widgetAccentable()
            if let unit {
                Text(unit)
                    .font(.system(size: max(12, size * 0.34), weight: .semibold))
                    .foregroundColor(p.ink3)
                    .lineLimit(1)
                    .fixedSize()
            }
        }
    }
}

/// The warning, the app's one status shape: an orange triangle beside ink words (never red).
struct WarnMark: View {
    var size: CGFloat = 11
    @Environment(\.powaPal) private var p
    var body: some View {
        Image(systemName: "exclamationmark.triangle.fill")
            .font(.system(size: size, weight: .bold))
            .foregroundColor(p.warn)
            .accessibilityHidden(true)
    }
}

/// The one action, as a capsule (display only, or inside a Button(intent:)): crimson, white label.
struct ActionCapsule: View {
    let text: String
    var symbol: String? = nil
    var size: CGFloat = 13
    var expand = false
    @Environment(\.widgetRenderingMode) private var mode
    var body: some View {
        HStack(spacing: 5) {
            if let symbol { Image(systemName: symbol).font(.system(size: size - 2, weight: .heavy)) }
            Text(text).font(.system(size: size, weight: .bold)).lineLimit(1).minimumScaleFactor(0.8)
        }
        .foregroundColor(.white)
        .padding(.horizontal, expand ? 0 : 12)
        .frame(maxWidth: expand ? .infinity : nil, minHeight: size + 17)
        .background(Capsule().fill(Hue.action(mode)))
    }
}

/// A calm capsule: graphite in dark, a faint ink wash in light; never the action's crimson.
struct QuietCapsule: View {
    let text: String
    var symbol: String? = nil
    var size: CGFloat = 12
    @Environment(\.powaPal) private var p
    var body: some View {
        HStack(spacing: 4) {
            if let symbol { Image(systemName: symbol).font(.system(size: size - 1, weight: .bold)) }
            Text(text).font(.system(size: size, weight: .bold)).lineLimit(1).minimumScaleFactor(0.75)
        }
        .foregroundColor(p.ink)
        .padding(.horizontal, 10)
        .frame(minHeight: size + 15)
        .background(Capsule().fill(p.quiet))
    }
}

/// The total, split: one capsule per lift as wide as its share, the number under it.
struct LiftBar: View {
    let squat: String?
    let bench: String?
    let deadlift: String?
    @Environment(\.powaPal) private var p
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
        let keys = ["squat", "bench", "deadlift"]
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
                        Capsule().fill(vals[i] > 0 ? p.lift(keys[i]) : p.track)
                            .frame(width: segW, height: 6)
                        Text(labels[i])
                            .font(.system(size: 13, weight: .bold))
                            .monospacedDigit()
                            .foregroundColor(vals[i] > 0 ? p.ink : p.ink3)
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
    var color: Color? = nil
    var maxSegments = 24
    @Environment(\.powaPal) private var p
    var body: some View {
        let n = max(1, total)
        let fill = color ?? p.ink
        if n <= maxSegments {
            HStack(spacing: 3) {
                ForEach(0..<n, id: \.self) { i in
                    if i < done {
                        Capsule().fill(fill).frame(height: 6).widgetAccentable()
                    } else {
                        Capsule().fill(p.track).frame(height: 6)
                    }
                }
            }
            .frame(height: 6)
        } else {
            GeometryReader { g in
                ZStack(alignment: .leading) {
                    Capsule().fill(p.track)
                    Capsule().fill(fill).frame(width: g.size.width * CGFloat(min(done, n)) / CGFloat(n)).widgetAccentable()
                }
            }
            .frame(height: 6)
        }
    }
}

struct SetProgress: View {
    let done: Int
    let total: Int
    var color: Color? = nil
    var maxSegments = 24
    @Environment(\.powaPal) private var p
    var body: some View {
        HStack(spacing: 8) {
            Segments(done: done, total: total, color: color, maxSegments: maxSegments)
            Text("\(done)/\(total)")
                .font(.system(size: 11, weight: .bold))
                .monospacedDigit()
                .foregroundColor(p.ink2)
                .fixedSize()
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(done) of \(total) sets done")
    }
}

/// A thin meter: a share of one thing (this month's money in), the rest a track.
struct Meter: View {
    let fraction: Double
    var color: Color? = nil
    var height: CGFloat = 5
    @Environment(\.powaPal) private var p
    var body: some View {
        GeometryReader { g in
            ZStack(alignment: .leading) {
                Capsule().fill(p.track)
                if fraction > 0 {
                    Capsule().fill(color ?? p.ink)
                        .frame(width: max(height, g.size.width * CGFloat(min(1, fraction))))
                        .widgetAccentable()
                }
            }
        }
        .frame(height: height)
        .accessibilityHidden(true)
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
    /// A day as a short word: the weekday within the week ("Tue"), else the month and day ("Oct 12"),
    /// in the phone's own order.
    static func shortDay(_ d: Date, within week: Bool) -> String {
        let f = DateFormatter()
        f.calendar = PowaStore.day; f.timeZone = .current
        f.setLocalizedDateFormatFromTemplate(week ? "EEE" : "MMMd")
        return f.string(from: d)
    }
    /// When a 'YYYY-MM-DD' was, from today: "today", "yesterday", "2 days ago" (to 13), then the date.
    static func ago(_ iso: String?) -> String? {
        guard let iso, let d = PowaStore.date(iso) else { return nil }
        let n = PowaStore.days(from: d, to: Date())
        if n <= 0 { return "today" }
        if n == 1 { return "yesterday" }
        if n < 14 { return "\(n) days ago" }
        return shortDay(d, within: false)
    }
}

/// The next set in two short lines: the lift (its colour, its name), then the prescription.
struct NextLines: View {
    let next: PowaSnapshot.Next
    let unit: String
    @Environment(\.powaPal) private var p
    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 5) {
                Circle().fill(p.lift(next.lift)).frame(width: 6, height: 6)
                Text(next.name ?? "Next set").foregroundColor(p.ink2).lineLimit(1)
            }
            .font(.system(size: 12, weight: .semibold))
            if let pr = PowaFormat.prescription(next, unit: unit) {
                Text(pr)
                    .font(.system(size: 13, weight: .bold))
                    .monospacedDigit()
                    .foregroundColor(p.ink)
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
    @Environment(\.powaPal) private var p
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: title)
            Spacer(minLength: 4)
            Text(line)
                .font(.system(size: 15, weight: .semibold))
                .foregroundColor(p.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
        }
    }
}

/// A widget for the other person (a lifter's widget on a coach's phone, a coach's on a lifter's):
/// one line, in every family it comes in.
struct RoleLine: View {
    let title: String
    let line: String
    let family: WidgetFamily
    var body: some View {
        switch family {
        case .accessoryCircular:
            ZStack { AccessoryWidgetBackground(); BrandMark(size: 22) }
                .accessibilityLabel(line)
        case .accessoryRectangular:
            RoleRect(title: title, line: line)
        case .accessoryInline:
            Text(line)
        default:
            EmptyState(title: title, line: line)
        }
    }
}

/// RoleLine on the Lock Screen: the mark and the widget's name, then the line.
struct RoleRect: View {
    let title: String
    let line: String
    var body: some View {
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 5) {
                BrandMark(size: 12)
                Text(title).font(.system(size: 13, weight: .semibold))
            }
            .widgetAccentable()
            Text(line).font(.system(size: 13, weight: .medium)).lineLimit(2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

enum PowaRole {
    static let lifterLine = "Open POWALIFTA as a lifter"
    static let coachLine = "Open POWALIFTA as a coach"
}

/// A lifter's widget: the lifter's view, unless the app on this phone is a coach's.
struct LifterOnly<Content: View>: View {
    let snap: PowaSnapshot?
    let title: String
    let family: WidgetFamily
    @ViewBuilder let content: () -> Content
    var body: some View {
        if snap?.isCoach == true {
            RoleLine(title: title, line: PowaRole.lifterLine, family: family)
        } else {
            content()
        }
    }
}

// MARK: - Total

struct TotalView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    @Environment(\.powaPal) private var p
    var body: some View {
        let total = snap?.total.flatMap { $0 == "–" || $0.isEmpty ? nil : $0 }
        if let s = snap, family == .systemMedium {
            // Two equal halves in every state; a lifter with no total yet still sees today.
            HStack(spacing: 0) {
                Group {
                    if let total { TotalColumn(s: s, total: total) } else { EmptyState(title: "Total", line: "Your first set starts it.") }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Rectangle().fill(p.rule).frame(width: 1).padding(.horizontal, 16)
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
    @Environment(\.powaPal) private var p
    var body: some View {
        if let d = delta, d.hasPrefix("+") {
            HStack(spacing: 3) {
                Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .heavy))
                Text("\(String(d.dropFirst())) \(unit) in 4 weeks")
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(p.okInk)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        } else {
            Text("From your best sets")
                .font(.system(size: 12, weight: .medium))
                .foregroundColor(p.ink3)
                .lineLimit(1)
        }
    }
}

/// Medium Total's right half: today's session, the next set, how far you are.
private struct TodayColumn: View {
    let s: PowaSnapshot
    @Environment(\.powaPal) private var p
    var body: some View {
        let rest = s.session == "Rest day"
        let total = s.setsTotal ?? 0
        let done = s.setsDone ?? 0
        VStack(alignment: .leading, spacing: 0) {
            Text("Today")
                .font(.system(size: 12, weight: .semibold))
                .foregroundColor(p.ink2)
            Spacer(minLength: 4)
            if s.sessionStale {
                Text("Open the app for today's session.")
                    .font(.system(size: 13, weight: .medium)).foregroundColor(p.ink2)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Text(s.session ?? "Nothing planned")
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(p.ink)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if rest {
                    Text("Recovery is part of the plan.")
                        .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink2).padding(.top, 3)
                } else if total > 0 && done >= total {
                    Text("Session done")
                        .font(.system(size: 12, weight: .semibold)).foregroundColor(p.okInk).padding(.top, 3)
                } else if let n = s.next {
                    NextLines(next: n, unit: s.unit ?? "kg").padding(.top, 4)
                }
            }
            Spacer(minLength: 8)
            if total > 0 && !rest && !s.sessionStale {
                // A narrow column draws one bar, not a row of dots.
                SetProgress(done: done, total: total, color: done >= total ? p.ok : nil, maxSegments: 8)
            }
        }
    }
}

struct PowaHomeWidget: Widget {
    let kind = "PowaHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PowaProvider()) { entry in
            FamilyReader { family in
                LifterOnly(snap: entry.snap, title: "Total", family: family) { TotalView(snap: entry.snap, family: family) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .powaWidgetBackground(Hue.steel)
        }
        .configurationDisplayName("Total")
        .description("Your total, the three lifts behind it and today's session.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
