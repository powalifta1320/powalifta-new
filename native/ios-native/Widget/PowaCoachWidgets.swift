//
//  PowaCoachWidgets.swift
//  PowaWidget — the coach's widgets (2026-10-30): Need you (small, medium, Lock Screen), Next meet,
//  Clients and Team week.
//
//  The same snapshot as every widget (PowaHomeWidget.swift: PowaSnapshot.coach), written by the coach's
//  app (coach-widget.js CoachWidget.build, over the app's own model: the jobs and their order are Home's,
//  pain first, then a meet today, then how soon; the money is Clients'; the ring is Home's week). On a
//  lifter's phone there is no coach block, and each widget says so in one line. Dates travel as dates,
//  so a meet's countdown and an overdue payment stay true without the app; numbers from an earlier day
//  say when beside the title ("Yesterday").
//
//    Need you     how many need you this week and, pain first, who: medium shows the top three with the
//                 fix on each (the first in the app's crimson, as on Home), each row opening that lifter.
//    Next meet    the lifters competing today or next: the meet, how far off, who.
//    Clients      this month's money in against what falls due, a thin meter, who is overdue (the triangle).
//    Team week    the team's sessions this week as Home's ring (lifted of written), and who is behind.
//
//  Taps open the coach's app on the right screen (powalifta://coach/…, coach.html drainCoachWidgetOpen).
//
import SwiftUI
import WidgetKit

// MARK: - Reading the coach block against today

extension PowaSnapshot.Coach {
    /// The next meet from today on: the snapshot keeps a few, so one that has passed gives way.
    func nextMeet() -> (meet: PowaSnapshot.Meet, days: Int)? {
        for m in meets ?? [] {
            if let d = PowaStore.daysUntil(m.date), d >= 0 { return (m, d) }
        }
        return nil
    }
}

extension PowaSnapshot.Money {
    /// Payments overdue today: a due date before today ('YYYY-MM-DD' strings sort as dates).
    var overdueNow: Int {
        let t = PowaStore.todayISO()
        return (due ?? []).filter { $0 < t }.count
    }
    /// The month these numbers belong to is this one.
    var thisMonth: Bool { month == nil || month == String(PowaStore.todayISO().prefix(7)) }
}

extension PowaSnapshot.TeamWeek {
    var thisWeek: Bool { weekStart == nil || weekStart == PowaStore.mondayISO() }
}

enum CoachLinks {
    static let need = URL(string: "powalifta://coach/need")
    static let meets = URL(string: "powalifta://coach/meets")
    static let clients = URL(string: "powalifta://coach/clients")
    static let week = URL(string: "powalifta://coach/week")
    static func lifter(_ id: String?) -> URL? {
        guard let id, let q = id.addingPercentEncoding(withAllowedCharacters: .alphanumerics) else { return meets }
        return URL(string: "powalifta://coach/lifter?id=" + q)
    }
    /// A row of Need you: that lifter's page; a meet day with several lifters, the meets.
    static func row(_ j: PowaSnapshot.Job) -> URL {
        (j.id != nil ? lifter(j.id) : meets) ?? URL(string: "powalifta://coach/need")!
    }
}

/// "Tom, Priya, Callum", "Tom, Priya, Callum +2".
private func names(_ who: [String]?, max: Int = 3) -> String {
    let w = (who ?? []).filter { !$0.isEmpty }
    if w.count <= max { return w.joined(separator: ", ") }
    return w.prefix(max).joined(separator: ", ") + " +\(w.count - max)"
}

/// A brand-new coach (nobody on the roster yet): where the lifters will show.
private struct NoLiftersYet: View {
    let title: String
    @Environment(\.powaPal) private var p
    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: title)
            Spacer(minLength: 4)
            Text("Your lifters show up here.")
                .font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink)
                .fixedSize(horizontal: false, vertical: true)
            Text("Invite your first from Lifters.")
                .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink2)
                .fixedSize(horizontal: false, vertical: true).padding(.top, 3)
            Spacer(minLength: 8)
        }
    }
}

/// A coach's widget before the app has written, or on a lifter's phone: one line.
private struct CoachOnlyLine: View {
    let title: String
    let snap: PowaSnapshot?
    let family: WidgetFamily
    var body: some View {
        RoleLine(title: title, line: snap == nil ? "Open POWALIFTA once and your lifters show up here." : PowaRole.coachLine, family: family)
    }
}

/// A job's mark: the triangle for pain and what to watch; a dot in its family's colour otherwise
/// (gold the meet, green their words, steel planning).
struct JobMark: View {
    let tone: String?
    @Environment(\.powaPal) private var p
    var body: some View {
        Group {
            switch tone {
            case "pain", "watch": WarnMark(size: 11)
            case "meet": Circle().fill(p.gold).frame(width: 7, height: 7)
            case "msg": Circle().fill(p.ok).frame(width: 7, height: 7)
            default: Circle().fill(p.ink3).frame(width: 7, height: 7)
            }
        }
        .frame(width: 14, alignment: .center)
        .accessibilityHidden(true)
    }
}

// MARK: - Need you

struct NeedView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    @Environment(\.powaPal) private var p

    /// Lit by the top job's family, as Home's focal card is: the orange of a warning for pain and
    /// what to watch, gold for a meet, green for their words (and all clear), steel for planning.
    static func hue(_ s: PowaSnapshot?) -> Color {
        guard let c = s?.coachNow, c.lifters != 0 else { return Hue.steel }
        guard (c.need ?? 0) > 0, let top = c.jobs?.first else { return Hue.ok }
        switch top.tone {
        case "pain", "watch": return Hue.warn
        case "meet": return Hue.gold
        case "msg": return Hue.ok
        default: return Hue.steel
        }
    }

    var body: some View {
        if let c = snap?.coachNow {
            switch family {
            case .accessoryRectangular: NeedLine(c: c)
            default:
                if c.lifters == 0 { NoLiftersYet(title: "Need you") } else if family == .systemMedium { medium(c) } else { small(c) }
            }
        } else {
            CoachOnlyLine(title: "Need you", snap: snap, family: family)
        }
    }

    private func count(_ c: PowaSnapshot.Coach) -> Int { c.jobs?.isEmpty == false ? (c.need ?? 0) : 0 }

    private func small(_ c: PowaSnapshot.Coach) -> some View {
        let n = count(c)
        return VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: "Need you", stamp: snap?.writtenWhen, stampShort: snap?.writtenWhenShort)
            Spacer(minLength: 4)
            if n > 0, let top = c.jobs?.first {
                HStack(alignment: .firstTextBaseline, spacing: 6) {
                    HeroNumber(value: "\(n)", size: 40)
                    Text(n == 1 ? "needs you" : "need you")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink3).lineLimit(1)
                }
                Spacer(minLength: 8)
                HStack(spacing: 6) {
                    JobMark(tone: top.tone)
                    Text(top.name ?? "")
                        .font(.system(size: 15, weight: .bold)).foregroundColor(p.ink)
                        .lineLimit(1).minimumScaleFactor(0.8)
                }
                .privacySensitive()
                Text(top.flag ?? "")
                    .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink2)
                    .lineLimit(1).minimumScaleFactor(0.85)
                    .padding(.leading, 20)
                    .privacySensitive()
            } else {
                AllClear()
                Spacer(minLength: 8)
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func medium(_ c: PowaSnapshot.Coach) -> some View {
        let n = count(c)
        let jobs = Array((c.jobs ?? []).prefix(3))
        return Group {
            if n > 0 && !jobs.isEmpty {
                HStack(spacing: 0) {
                    VStack(alignment: .leading, spacing: 0) {
                        WidgetTitle(text: "Need you")
                        Spacer(minLength: 4)
                        HeroNumber(value: "\(n)", size: 44)
                        Text(n == 1 ? "needs you" : "need you")
                            .font(.system(size: 14, weight: .semibold)).foregroundColor(p.ink3).lineLimit(1)
                        Spacer(minLength: 6)
                        if let w = snap?.writtenWhen {
                            Text("As of \(w.lowercased())")
                                .font(.system(size: 11, weight: .medium)).foregroundColor(p.ink3)
                                .lineLimit(2).fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .frame(width: 76, alignment: .leading)
                    Rectangle().fill(p.rule).frame(width: 1).padding(.horizontal, 12)
                    VStack(spacing: 0) {
                        ForEach(0..<jobs.count, id: \.self) { i in
                            if i > 0 { Spacer(minLength: 4) }
                            Link(destination: CoachLinks.row(jobs[i])) {
                                JobRow(job: jobs[i], lead: i == 0)
                            }
                        }
                        if jobs.count < 3 { Spacer(minLength: 0) }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "Need you", stamp: snap?.writtenWhen, stampShort: snap?.writtenWhenShort)
                    Spacer(minLength: 4)
                    AllClear(big: true)
                    Spacer(minLength: 8)
                }
            }
        }
    }
}

/// Nobody needs you this week: Home's own words.
private struct AllClear: View {
    var big = false
    @Environment(\.powaPal) private var p
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(spacing: 7) {
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: big ? 24 : 20, weight: .bold)).foregroundColor(p.okInk)
                    .widgetAccentable()
                Text("All clear")
                    .font(.system(size: big ? 26 : 22, weight: .heavy).width(.expanded)).foregroundColor(p.ink)
                    .lineLimit(1).minimumScaleFactor(0.7)
            }
            Text("Nobody needs you this week.")
                .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink2)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// One job: its mark, who, their flag, and the fix (the first in the crimson, the rest graphite).
private struct JobRow: View {
    let job: PowaSnapshot.Job
    let lead: Bool
    @Environment(\.powaPal) private var p
    var body: some View {
        HStack(spacing: 8) {
            JobMark(tone: job.tone)
            VStack(alignment: .leading, spacing: 1) {
                Text(job.name ?? "")
                    .font(.system(size: 13.5, weight: .bold)).foregroundColor(p.ink)
                    .lineLimit(1).minimumScaleFactor(0.75)
                Text(job.flag ?? "")
                    .font(.system(size: 11.5, weight: .medium)).foregroundColor(p.ink2)
                    .lineLimit(1).minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .privacySensitive()
            if let v = job.verb, !v.isEmpty {
                Group {
                    if lead { ActionCapsule(text: v, size: 12) } else { QuietCapsule(text: v, size: 12) }
                }
                .fixedSize()
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(job.name ?? ""): \(job.flag ?? ""). \(job.verb ?? "")")
    }
}

/// Lock Screen, a line: how many need you, then the top two.
struct NeedLine: View {
    let c: PowaSnapshot.Coach
    var body: some View {
        let jobs = Array((c.jobs ?? []).prefix(2))
        let n = jobs.isEmpty ? 0 : (c.need ?? 0)
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 5) {
                BrandMark(size: 12)
                Text(n > 0 ? "\(n) need you" : "All clear")
                    .font(.system(size: 15, weight: .heavy).width(.expanded))
                    .lineLimit(1)
            }
            .widgetAccentable()
            if n > 0 {
                ForEach(0..<jobs.count, id: \.self) { i in
                    Text([jobs[i].name, jobs[i].flag].compactMap { $0 }.filter { !$0.isEmpty }.joined(separator: " · "))
                        .font(.system(size: 13, weight: i == 0 ? .semibold : .medium))
                        .opacity(i == 0 ? 1 : 0.75)
                        .lineLimit(1).minimumScaleFactor(0.85)
                        .privacySensitive()
                }
            } else {
                Text("Nobody needs you this week").font(.system(size: 13, weight: .medium)).lineLimit(2)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

// MARK: - Next meet

struct CoachMeetView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    @Environment(\.powaPal) private var p
    var body: some View {
        if let c = snap?.coachNow {
            if let next = c.nextMeet() {
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "Next meet")
                    Spacer(minLength: 4)
                    if next.days <= 1 {
                        Text(next.days == 0 ? "Today" : "Tomorrow")
                            .font(.system(size: next.days == 0 ? 34 : 28, weight: .heavy).width(.expanded))
                            .foregroundColor(p.ink).lineLimit(1).minimumScaleFactor(0.6)
                            .widgetAccentable()
                    } else {
                        HStack(alignment: .firstTextBaseline, spacing: 5) {
                            HeroNumber(value: "\(next.days)", size: 40)
                            Text("days").font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink3)
                        }
                    }
                    Text(next.meet.name ?? "Meet")
                        .font(.system(size: 15, weight: .bold)).foregroundColor(p.ink)
                        .lineLimit(1).minimumScaleFactor(0.75)
                    Spacer(minLength: 6)
                    CountdownRule(days: next.days)
                    Text(names(next.meet.who))
                        .font(.system(size: 12, weight: .semibold)).foregroundColor(p.ink2)
                        .lineLimit(1).minimumScaleFactor(0.8)
                        .padding(.top, 7)
                }
                .accessibilityElement(children: .combine)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "Next meet")
                    Spacer(minLength: 4)
                    Text("No meets ahead.")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink)
                    Text("Add one on a lifter's page and it counts down here.")
                        .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink2)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 3)
                    Spacer(minLength: 8)
                }
            }
        } else {
            CoachOnlyLine(title: "Next meet", snap: snap, family: family)
        }
    }
}

// MARK: - Clients

struct ClientsView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    @Environment(\.powaPal) private var p
    var body: some View {
        if let c = snap?.coachNow {
            if let m = c.money, m.any == true, let got = m.got {
                if m.thisMonth {
                    month(m, got)
                } else {
                    line("Open POWALIFTA for this month's money.")
                }
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "Clients")
                    Spacer(minLength: 4)
                    Text("No packages yet.")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink)
                    Text("Add what each lifter pays you. They never see it.")
                        .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink2)
                        .fixedSize(horizontal: false, vertical: true).padding(.top, 3)
                    Spacer(minLength: 8)
                }
            }
        } else {
            CoachOnlyLine(title: "Clients", snap: snap, family: family)
        }
    }

    private func line(_ text: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: "Clients")
            Spacer(minLength: 4)
            Text(text).font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
        }
    }

    private func ofText(_ of: String) -> some View {
        Text("of \(of)").font(.system(size: 13, weight: .semibold)).foregroundColor(p.ink3).lineLimit(1)
    }

    private func month(_ m: PowaSnapshot.Money, _ got: String) -> some View {
        let late = m.overdueNow
        return VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: "Clients", stamp: snap?.writtenWhen, stampShort: snap?.writtenWhenShort)
            Spacer(minLength: 4)
            Text("This month")
                .font(.system(size: 12, weight: .semibold)).foregroundColor(p.ink2)
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 5) {
                    HeroNumber(value: got, size: 30).fixedSize()
                    if let of = m.of { ofText(of).fixedSize() }
                }
                VStack(alignment: .leading, spacing: 0) {
                    HeroNumber(value: got, size: 30)
                    if let of = m.of { ofText(of) }
                }
            }
            .privacySensitive()
            Meter(fraction: m.pct ?? 0, color: p.ok).padding(.top, 7)
            Spacer(minLength: 8)
            HStack(spacing: 5) {
                if late > 0 {
                    WarnMark(size: 11)
                    Text("\(late) overdue").foregroundColor(p.ink)
                } else {
                    Image(systemName: "checkmark.circle.fill").foregroundColor(p.okInk)
                    Text("All paid up").foregroundColor(p.ink)
                }
            }
            .font(.system(size: 12, weight: .semibold))
            .lineLimit(1)
        }
        .accessibilityElement(children: .combine)
    }
}

// MARK: - Team week

/// Home's ring: one segment per session written this week, the lifted ones filled (past 24, one arc).
struct TeamRing: View {
    let done: Int
    let planned: Int
    var size: CGFloat = 60
    var band: CGFloat = 7
    @Environment(\.powaPal) private var p
    var body: some View {
        let n = max(0, planned), k = max(0, min(n, done))
        let r = (size - band) / 2
        let gap = n > 1 ? min(0.4 / CGFloat(n), 2.4 / (2 * .pi * r)) : 0
        ZStack {
            if n == 0 || n > 24 {
                Circle().stroke(p.track, lineWidth: band)
                if n > 0 && k > 0 {
                    Circle().trim(from: 0, to: CGFloat(k) / CGFloat(n))
                        .stroke(p.ok, style: StrokeStyle(lineWidth: band, lineCap: .butt))
                        .rotationEffect(.degrees(-90))
                        .widgetAccentable()
                }
            } else {
                ForEach(0..<n, id: \.self) { i in
                    Circle()
                        .trim(from: CGFloat(i) / CGFloat(n) + gap / 2, to: CGFloat(i + 1) / CGFloat(n) - gap / 2)
                        .stroke(i < k ? p.ok : p.track, style: StrokeStyle(lineWidth: band, lineCap: .butt))
                        .rotationEffect(.degrees(-90))
                        .widgetAccentable(i < k)
                }
            }
        }
        .frame(width: size - band, height: size - band)
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct TeamWeekView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    @Environment(\.powaPal) private var p
    var body: some View {
        if let c = snap?.coachNow {
            if c.lifters == 0 {
                NoLiftersYet(title: "Team week")
            } else if let w = c.week, w.thisWeek {
                week(w)
            } else {
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "Team week")
                    Spacer(minLength: 4)
                    HStack(spacing: 12) {
                        TeamRing(done: 0, planned: 0, size: 58)
                        Text("A new week.")
                            .font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink)
                    }
                    Spacer(minLength: 8)
                    Text("Open POWALIFTA to start it.")
                        .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink2)
                }
            }
        } else {
            CoachOnlyLine(title: "Team week", snap: snap, family: family)
        }
    }

    private func week(_ w: PowaSnapshot.TeamWeek) -> some View {
        let done = w.done ?? 0, planned = w.planned ?? 0, behind = w.behind ?? 0
        return VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: "Team week", stamp: snap?.writtenWhen, stampShort: snap?.writtenWhenShort)
            Spacer(minLength: 4)
            HStack(spacing: 12) {
                TeamRing(done: done, planned: planned, size: 58)
                VStack(alignment: .leading, spacing: 0) {
                    HeroNumber(value: "\(done)", size: 30)
                    Text(planned > 0 ? "of \(planned)" : "sessions")
                        .font(.system(size: 13, weight: .semibold)).foregroundColor(p.ink3)
                        .lineLimit(1)
                    Text(planned > 0 ? "lifted" : "logged")
                        .font(.system(size: 12, weight: .medium)).foregroundColor(p.ink3)
                        .lineLimit(1)
                }
            }
            Spacer(minLength: 8)
            HStack(spacing: 5) {
                if behind > 0 {
                    WarnMark(size: 11)
                    Text("\(behind) behind" + (w.behindName.map { " · \($0)" } ?? "")).foregroundColor(p.ink)
                } else {
                    Image(systemName: "checkmark.circle.fill").foregroundColor(p.okInk)
                    Text("Nobody behind").foregroundColor(p.ink)
                }
            }
            .font(.system(size: 12, weight: .semibold))
            .lineLimit(1).minimumScaleFactor(0.85)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Team week: \(done) of \(planned) sessions lifted. " + (behind > 0 ? "\(behind) behind" : "Nobody behind"))
    }
}

// MARK: - The widgets

struct PowaCoachNeedWidget: Widget {
    let kind = "PowaCoachNeedWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in NeedView(snap: entry.snap, family: family) }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground(NeedView.hue(entry.snap))
                .widgetURL(CoachLinks.need)
        }
        .configurationDisplayName("Need you")
        .description("For coaches: who needs you this week, pain first, with the fix for each.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
    }
}

struct PowaCoachMeetWidget: Widget {
    let kind = "PowaCoachMeetWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in CoachMeetView(snap: entry.snap, family: family) }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground(Hue.gold)
                .widgetURL(CoachLinks.meets)
        }
        .configurationDisplayName("Next meet")
        .description("For coaches: your lifters competing today or next, and how far off it is.")
        .supportedFamilies([.systemSmall])
    }
}

struct PowaCoachClientsWidget: Widget {
    let kind = "PowaCoachClientsWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in ClientsView(snap: entry.snap, family: family) }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground(Hue.ok)
                .widgetURL(CoachLinks.clients)
        }
        .configurationDisplayName("Clients")
        .description("For coaches: this month's money in against what's due, and who is overdue.")
        .supportedFamilies([.systemSmall])
    }
}

struct PowaCoachWeekWidget: Widget {
    let kind = "PowaCoachWeekWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in TeamWeekView(snap: entry.snap, family: family) }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground(Hue.steel)
                .widgetURL(CoachLinks.week)
        }
        .configurationDisplayName("Team week")
        .description("For coaches: your team's sessions this week, lifted against written, and who is behind.")
        .supportedFamilies([.systemSmall])
    }
}
