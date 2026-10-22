//
//  PowaHealthWidgets.swift
//  PowaWidget — the widgets Apple Health makes possible (1.3): Readiness, Weight class, and
//  Recovery on the Lock Screen.
//
//  Same snapshot as every other widget (PowaHomeWidget.swift: PowaSnapshot.health / .cut /
//  .healthOn), built by syncHomeWidget in athlete.html from app.js widgetReadiness / widgetCut:
//  display strings, no maths here. Same look: graphite, one soft light in the widget's hue, the
//  brand mark, wide heavy numerals, colour only where it means something.
//
//    Readiness      last night's sleep, resting heart rate (and HRV with a Watch) against the
//                   lifter's own usual, one word for the morning, today's session. Lit green when
//                   fresh, indigo when normal, amber when rough. Without Health data: a calm
//                   "Connect Apple Health" that opens You → Apple Health (powalifta://health).
//    Weight class   the 7-day average against the class line, the last 7 days of weigh-ins
//                   (POWALIFTA's and Health's are one list in the app), the pace and the meet.
//                   Opens Bodyweight (powalifta://bodyweight); no class yet opens Make weight.
//    Recovery       Lock Screen: a gauge (the word as a level) and one rectangular line.
//
import SwiftUI
import WidgetKit

// MARK: - Shared bits

extension Hue {
    static let rest = Color(red: 0.498, green: 0.549, blue: 1.0)     // #7f8cff, a normal morning
    static let gold = Color(red: 1.0, green: 0.710, blue: 0.278)     // #ffb547, the class line (--gold)
}

enum Readiness {
    /// The word's colour: green when fresh, amber when rough, plain ink when normal.
    static func ink(_ word: String?) -> Color {
        switch word {
        case "Fresh": return Hue.ok
        case "Rough": return Hue.flame
        default: return .white
        }
    }
    /// The widget's light.
    static func hue(_ snap: PowaSnapshot?) -> Color {
        guard let h = snap?.healthNow else { return Hue.rest }
        switch h.word {
        case "Fresh": return Hue.ok
        case "Rough": return Hue.flame
        default: return Hue.rest
        }
    }
    /// The day turned without the app (healthNow expires at midnight): words that hold at any hour,
    /// the same on the Home Screen and the Lock Screen.
    static let staleLine = "Open POWALIFTA for today's readiness"
    /// Where a tap goes: Train ("How do you feel today?") with data, You → Apple Health without.
    static func url(_ snap: PowaSnapshot?) -> URL? {
        URL(string: snap?.healthNow != nil ? "powalifta://readiness" : "powalifta://health")
    }
}

/// What the morning's session is, in one line (nothing when the day turned without the app).
private func sessionLine(_ s: PowaSnapshot?) -> (text: String, lift: String?)? {
    guard let s, !s.sessionStale, let name = s.session, !name.isEmpty else { return nil }
    let total = s.setsTotal ?? 0
    if name != "Rest day" && total > 0 && (s.setsDone ?? 0) >= total { return ("\(name) · done", nil) }
    return (name, name == "Rest day" ? nil : s.next?.lift)
}

private struct SessionTag: View {
    let text: String
    let lift: String?
    var body: some View {
        HStack(spacing: 5) {
            if let lift, lift != "other" { Circle().fill(Lift.color(lift)).frame(width: 6, height: 6) }
            Text(text).lineLimit(1).minimumScaleFactor(0.8)
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(Hue.ink2)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Today: \(text)")
    }
}

/// The morning, in one word: wide and heavy, in its colour.
private struct ReadyWord: View {
    let word: String
    var size: CGFloat = 30
    var body: some View {
        Text(word)
            .font(.system(size: size, weight: .heavy).width(.expanded))
            .tracking(-0.02 * size)
            .foregroundColor(Readiness.ink(word))
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .contentTransition(.interpolate)
            .accessibilityLabel("Readiness: \(word)")
    }
}

/// One Health number: its symbol and the value; in medium also its (short) name above the value
/// and the usual it's measured against on the right. Only the number turns amber when it's off.
/// Sized for the narrowest medium widget (iPhone SE: 289pt of content, about 144 for this column).
private struct MetricRow: View {
    let symbol: String
    let label: String
    var spoken: String? = nil          // the full name for VoiceOver ("Resting heart rate")
    let metric: PowaSnapshot.Metric
    var unit: String? = nil
    var showUsual = true
    var body: some View {
        let off = metric.off == true
        // The name has the whole row to itself (above the number), so it never fights the usual
        // for width; the number never shrinks, the usual may a little.
        VStack(alignment: .leading, spacing: 0) {
            if showUsual {
                Text(label).font(.system(size: 11, weight: .medium)).foregroundColor(Hue.ink3)
                    .lineLimit(1).minimumScaleFactor(0.85)
                    .padding(.leading, 22)
            }
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Image(systemName: symbol)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundColor(Hue.ink3)
                    .frame(width: 14)
                HStack(alignment: .firstTextBaseline, spacing: 3) {
                    Text(metric.value ?? "–")
                        .font(.system(size: 15, weight: .bold))
                        .monospacedDigit()
                        .foregroundColor(off ? Hue.flame : .white)
                    if let unit {
                        Text(unit).font(.system(size: 11, weight: .semibold)).foregroundColor(Hue.ink3)
                    }
                }
                .lineLimit(1)
                .fixedSize()
                .privacySensitive()   // Health values: redacted on the Lock Screen / StandBy until unlocked
                if showUsual {
                    Spacer(minLength: 6)
                    Text(metric.usual.map { "usual \($0)" } ?? "")
                        .font(.system(size: 11, weight: .medium))
                        .monospacedDigit()
                        .foregroundColor(Hue.ink3)
                        .lineLimit(1)
                        .minimumScaleFactor(0.7)
                        .privacySensitive()
                }
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(spoken ?? label) \(metric.value ?? "not known")\(unit.map { " \($0)" } ?? "")" +
                            (metric.usual.map { ", your usual \($0)" } ?? "") + (off ? ", off your usual" : ""))
    }
}

/// A calm capsule (not the red action: nothing urgent about connecting).
private struct QuietPill: View {
    let symbol: String
    let text: String
    var body: some View {
        HStack(spacing: 4) {
            Image(systemName: symbol).font(.system(size: 11, weight: .bold))
            Text(text).font(.system(size: 12, weight: .bold)).lineLimit(1).minimumScaleFactor(0.75)
        }
        .foregroundColor(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Capsule().fill(Color.white.opacity(0.13)))
        .accessibilityHidden(true)
    }
}

// MARK: - Readiness (small + medium)

struct ReadinessView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily

    var body: some View {
        if let h = snap?.healthNow {
            if family == .systemMedium { medium(h) } else { small(h) }
        } else if snap?.healthOn == true {
            // On, but nothing from last night (no Watch at night, nothing logged), or the day
            // turned without the app: say so plainly, in the hero slot.
            waiting(snap?.health != nil ? Readiness.staleLine + "." : "Nothing from last night yet.")
        } else {
            connect
        }
    }

    private func small(_ h: PowaSnapshot.Health) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: "Readiness")
            Spacer(minLength: 2)
            ReadyWord(word: h.word ?? "Normal", size: 28)
            Spacer(minLength: 6)
            VStack(alignment: .leading, spacing: 4) {
                if let s = h.sleep { MetricRow(symbol: "moon.zzz.fill", label: "Sleep", metric: s, showUsual: false) }
                if let r = h.rhr { MetricRow(symbol: "heart.fill", label: "Resting HR", spoken: "Resting heart rate", metric: r, unit: "bpm", showUsual: false) }
                else if let v = h.hrv { MetricRow(symbol: "waveform.path.ecg", label: "HRV", metric: v, unit: "ms", showUsual: false) }
            }
            if let t = sessionLine(snap) { SessionTag(text: t.text, lift: t.lift).padding(.top, 7) }
        }
    }

    private func medium(_ h: PowaSnapshot.Health) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                WidgetTitle(text: "Readiness")
                Spacer(minLength: 4)
                ReadyWord(word: h.word ?? "Normal", size: 32)
                Text("Against your usual")
                    .font(.system(size: 12, weight: .medium)).foregroundColor(Hue.ink3).padding(.top, 1)
                Spacer(minLength: 8)
                if let t = sessionLine(snap) { SessionTag(text: t.text, lift: t.lift) }
            }
            .frame(width: 116, alignment: .leading)
            Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1).padding(.horizontal, 14)
            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: 0)
                VStack(alignment: .leading, spacing: 9) {
                    if let s = h.sleep { MetricRow(symbol: "moon.zzz.fill", label: "Sleep", metric: s) }
                    if let r = h.rhr { MetricRow(symbol: "heart.fill", label: "Resting HR", spoken: "Resting heart rate", metric: r, unit: "bpm") }
                    if let v = h.hrv { MetricRow(symbol: "waveform.path.ecg", label: "HRV", metric: v, unit: "ms") }
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }

    @ViewBuilder private func waiting(_ line: String) -> some View {
        let left = VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: "Readiness")
            Spacer(minLength: 4)
            Text(line)
                .font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if let t = sessionLine(snap) { SessionTag(text: t.text, lift: t.lift) }
        }
        if family == .systemMedium {
            HStack(spacing: 0) {
                left.frame(maxWidth: .infinity, alignment: .leading)
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1).padding(.horizontal, 14)
                GhostRows().frame(width: GhostRows.width).frame(maxHeight: .infinity)
            }
        } else {
            left
        }
    }

    /// No Health: what the widget will show, and one quiet way in.
    @ViewBuilder private var connect: some View {
        if family == .systemMedium {
            HStack(spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    WidgetTitle(text: "Readiness")
                    Spacer(minLength: 4)
                    Text("Fresh, normal or rough, from last night.")
                        .font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 8)
                    // The full name where it fits (Plus / Pro Max), the short one on smaller phones.
                    ViewThatFits(in: .horizontal) {
                        QuietPill(symbol: "heart.fill", text: "Connect Apple Health").fixedSize()
                        QuietPill(symbol: "heart.fill", text: "Connect Health")
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1).padding(.horizontal, 14)
                GhostRows().frame(width: GhostRows.width).frame(maxHeight: .infinity)
            }
        } else {
            VStack(alignment: .leading, spacing: 0) {
                WidgetTitle(text: "Readiness")
                Spacer(minLength: 4)
                Text("Sleep and heart rate, against your usual.")
                    .font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                QuietPill(symbol: "heart.fill", text: "Connect Health")
            }
        }
    }
}

/// The rows the numbers will fill once Health has them.
private struct GhostRows: View {
    /// Fixed, so the text column takes what's left: 140pt on an iPhone SE, 197 on a Pro Max.
    static let width: CGFloat = 120
    var body: some View {
        VStack(alignment: .leading, spacing: 13) {
            GhostRow(symbol: "moon.zzz.fill", label: "Sleep")
            GhostRow(symbol: "heart.fill", label: "Resting HR")
            GhostRow(symbol: "waveform.path.ecg", label: "HRV")
        }
    }
}

/// The row a metric will fill once Health is on: its symbol and name, a dash for the number.
private struct GhostRow: View {
    let symbol: String
    let label: String
    var body: some View {
        HStack(spacing: 7) {
            Image(systemName: symbol).font(.system(size: 11, weight: .semibold)).frame(width: 14)
            Text(label).font(.system(size: 12, weight: .medium)).lineLimit(1).minimumScaleFactor(0.85).layoutPriority(1)
            Spacer(minLength: 4)
            Capsule().fill(Hue.track).frame(width: 20, height: 6)
        }
        .foregroundColor(Hue.ink3)
        .accessibilityHidden(true)
    }
}

struct PowaReadinessWidget: Widget {
    let kind = "PowaReadinessWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in ReadinessView(snap: entry.snap, family: family) }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground(Readiness.hue(entry.snap))
                .widgetURL(Readiness.url(entry.snap))
        }
        .configurationDisplayName("Readiness")
        .description("Last night's sleep and resting heart rate against your usual, in one word, with today's session.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Weight class (small + medium)

/// The last seven days against the class line: a dashed line in gold at the class, the
/// weigh-ins as one smooth line (a missed day is simply skipped), the latest lit.
struct ClassChart: View {
    let trend: [Double?]
    let classLine: Double
    var showLabel = false
    var body: some View {
        GeometryReader { g in
            let vals = trend.compactMap { $0 }
            let lo = min(vals.min() ?? classLine, classLine), hi = max(vals.max() ?? classLine, classLine)
            let span = max(hi - lo, max(2, classLine * 0.025))   // a steady week reads calm, not a zigzag
            let base = (lo + hi) / 2 - span / 2
            let px: CGFloat = 6, py: CGFloat = 8
            let y = { (v: Double) -> CGFloat in py + (g.size.height - 2 * py) * CGFloat(1 - (v - base) / span) }
            let x = { (i: Int) -> CGFloat in px + (g.size.width - 2 * px) * CGFloat(i) / 6 }
            let pts: [CGPoint] = trend.enumerated().compactMap { i, v in v.map { CGPoint(x: x(i), y: y($0)) } }
            let cy = y(classLine)
            ZStack(alignment: .topLeading) {
                Path { p in p.move(to: CGPoint(x: 0, y: cy)); p.addLine(to: CGPoint(x: g.size.width, y: cy)) }
                    .stroke(Hue.gold.opacity(0.85), style: StrokeStyle(lineWidth: 1.2, lineCap: .round, dash: [3, 3]))
                if showLabel {
                    Text(Self.num(classLine))
                        .font(.system(size: 9, weight: .bold)).monospacedDigit()
                        .foregroundColor(Hue.gold)
                        .position(x: g.size.width - 10, y: cy + (pts.last.map { $0.y < cy + 1 } ?? true ? 7 : -7))
                }
                if vals.isEmpty {
                    // Nothing logged yet: a faint line coming down to the class, so the empty
                    // widget reads as "this is where your week goes", not as broken.
                    let ghost = [0.9, 0.75, 0.8, 0.6, 0.55, 0.4, 0.3].enumerated().map { i, f in CGPoint(x: x(i), y: y(classLine + span * 0.45 * f)) }
                    Sparkline.curve(ghost, closeTo: nil)
                        .stroke(Color.white.opacity(0.14), style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round, dash: [0.5, 5]))
                }
                if pts.count > 1 {
                    Sparkline.curve(pts, closeTo: nil)
                        .stroke(Hue.bw, style: StrokeStyle(lineWidth: 2, lineCap: .round, lineJoin: .round))
                }
                ForEach(0..<max(0, pts.count - 1), id: \.self) { i in
                    Circle().fill(Hue.bw.opacity(0.55)).frame(width: 3.5, height: 3.5).position(pts[i])
                }
                if let last = pts.last {
                    Circle().fill(Hue.bw.opacity(0.25)).frame(width: 12, height: 12).position(last)
                    Circle().fill(Hue.bw).frame(width: 6, height: 6).position(last)
                }
            }
        }
        .accessibilityHidden(true)
    }
    static func num(_ v: Double) -> String { v == v.rounded() ? String(Int(v)) : String(format: "%.1f", v) }
}

struct CutView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily

    static func statusInk(_ tone: String?) -> Color {
        switch tone {
        case "made": return Hue.ok
        case "amber": return Hue.flame
        case "off": return Hue.fire
        default: return .white
        }
    }
    static func url(_ snap: PowaSnapshot?) -> URL? {
        URL(string: snap?.cut == nil ? "powalifta://cut" : "powalifta://bodyweight")
    }

    var body: some View {
        if let c = snap?.cut, let cur = c.cur {
            if family == .systemMedium { medium(c, cur) } else { small(c, cur) }
        } else if let c = snap?.cut {
            empty(c.cls ?? "Weight class", "Your first weigh-in starts the line.", classLine: c.classLine)
        } else if snap != nil {
            empty("Weight class", "Pick the class you're making for your meet.", classLine: nil, pill: true)
        } else {
            empty("Weight class", "Open the app once and your class shows up here.", classLine: nil)
        }
    }

    private func status(_ c: PowaSnapshot.Cut) -> some View {
        HStack(spacing: 4) {
            if c.tone == "made" { Image(systemName: "checkmark.circle.fill").font(.system(size: 11, weight: .bold)) }
            Text(c.status ?? "")
        }
        .font(.system(size: 13, weight: .semibold))
        .foregroundColor(CutView.statusInk(c.tone))
        .lineLimit(1)
        .minimumScaleFactor(0.8)
    }

    private func small(_ c: PowaSnapshot.Cut, _ cur: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: c.cls ?? "Weight class")
            Spacer(minLength: 2)
            HeroNumber(value: cur, unit: c.unit ?? "kg", size: 32).privacySensitive()
            status(c).padding(.top, 1).privacySensitive()
            Spacer(minLength: 6)
            if let t = snap?.cutTrendNow, let line = c.classLine {
                ClassChart(trend: t, classLine: line).frame(height: 38).privacySensitive()
            }
        }
        .accessibilityElement(children: .combine)
    }

    private func medium(_ c: PowaSnapshot.Cut, _ cur: String) -> some View {
        HStack(spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                WidgetTitle(text: c.cls ?? "Weight class")
                Spacer(minLength: 4)
                HeroNumber(value: cur, unit: c.unit ?? "kg", size: 36).privacySensitive()
                Text("7-day average")
                    .font(.system(size: 11, weight: .medium)).foregroundColor(Hue.ink3)
                Spacer(minLength: 8)
                status(c).privacySensitive()
                if let by = c.by {
                    HStack(spacing: 4) {
                        Image(systemName: "flag.checkered").font(.system(size: 10, weight: .bold))
                        Text("Meet \(by)")
                    }
                    .font(.system(size: 12, weight: .medium)).foregroundColor(Hue.ink2).padding(.top, 3)
                }
            }
            .frame(width: 140, alignment: .leading)
            Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1).padding(.horizontal, 14)
            VStack(alignment: .leading, spacing: 6) {
                if let t = snap?.cutTrendNow, let line = c.classLine {
                    ClassChart(trend: t, classLine: line, showLabel: true).privacySensitive()
                } else {
                    Spacer(minLength: 0)
                }
                if let p = paceLine(c) {
                    Text(p)
                        .font(.system(size: 11, weight: .medium)).monospacedDigit()
                        .foregroundColor(Hue.ink3).lineLimit(1).minimumScaleFactor(0.8)
                        .privacySensitive()
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .combine)
    }

    /// "−0.4 a week, need −0.1": the pace now, and what the date still asks for.
    private func paceLine(_ c: PowaSnapshot.Cut) -> String? {
        switch (c.pace, c.need) {
        case let (p?, n?): return "\(p), need \(n)"
        case let (p?, nil): return p
        case let (nil, n?): return "Need \(n) a week"
        default: return nil
        }
    }

    @ViewBuilder private func empty(_ title: String, _ line: String, classLine: Double?, pill: Bool = false) -> some View {
        let left = VStack(alignment: .leading, spacing: 0) {
            WidgetTitle(text: title)
            Spacer(minLength: 4)
            Text(line)
                .font(.system(size: 15, weight: .semibold)).foregroundColor(.white)
                .fixedSize(horizontal: false, vertical: true)
            Spacer(minLength: 8)
            if pill { QuietPill(symbol: "scalemass.fill", text: "Set a class") }
        }
        if family == .systemMedium {
            HStack(spacing: 0) {
                left.frame(width: 168, alignment: .leading)
                Rectangle().fill(Color.white.opacity(0.08)).frame(width: 1).padding(.horizontal, 14)
                // The line the weigh-ins will be drawn against (a quiet one before a class).
                ClassChart(trend: Array(repeating: nil, count: 7), classLine: classLine ?? 83, showLabel: classLine != nil)
                    .opacity(classLine == nil ? 0.4 : 1)
            }
        } else {
            left
        }
    }
}

struct PowaCutWidget: Widget {
    let kind = "PowaCutWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in CutView(snap: entry.snap, family: family) }
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground(Hue.bw)
                .widgetURL(CutView.url(entry.snap))
        }
        .configurationDisplayName("Weight class")
        .description("Your 7-day bodyweight against the class you're making, and the pace to the meet.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

// MARK: - Recovery (Lock Screen)

struct RecoveryLockView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    var body: some View {
        switch family {
        case .accessoryCircular: RecoveryCircle(snap: snap)
        default: RecoveryLine(snap: snap)
        }
    }
}

/// The gauge: the morning's word as a level (rough a third, normal two thirds, fresh full).
struct RecoveryCircle: View {
    let snap: PowaSnapshot?
    var body: some View {
        if let h = snap?.healthNow {
            Gauge(value: min(1, max(0, h.level ?? 0.67))) {
                Image(systemName: "heart.fill")
            } currentValueLabel: {
                Text(h.word ?? "–").font(.system(size: 11, weight: .bold)).minimumScaleFactor(0.6)
            }
            .gaugeStyle(.accessoryCircular)
            .widgetAccentable()
            .accessibilityLabel("Readiness \(h.word ?? "")")
        } else {
            ZStack {
                AccessoryWidgetBackground()
                VStack(spacing: 1) {
                    Image(systemName: "heart").font(.system(size: 15, weight: .semibold))
                    Text(snap?.healthOn == true ? "–" : "Health").font(.system(size: 9, weight: .semibold))
                }
            }
            .accessibilityLabel(snap?.healthOn != true ? "Connect Apple Health"
                                : snap?.health != nil ? Readiness.staleLine : "No readiness yet")
        }
    }
}

/// The rectangular line: the word, last night, today's session.
struct RecoveryLine: View {
    let snap: PowaSnapshot?
    var body: some View {
        let h = snap?.healthNow
        VStack(alignment: .leading, spacing: 1) {
            HStack(spacing: 4) {
                Image(systemName: "heart.fill").font(.system(size: 12, weight: .bold))
                Text(h?.word ?? "Recovery").font(.system(size: 15, weight: .bold))
            }
            .widgetAccentable()
            if let h {
                // "Slept 5h 40m · HR 62": Health data, hidden while the phone is locked.
                Text(h.line ?? "").font(.system(size: 13, weight: .medium)).lineLimit(1).minimumScaleFactor(0.8)
                    .privacySensitive()
                if let t = sessionLine(snap) {
                    Text(t.text).font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary).lineLimit(1)
                }
            } else {
                Text(snap?.healthOn != true ? "Connect Apple Health"
                     : snap?.health != nil ? Readiness.staleLine : "Nothing from last night yet")
                    .font(.system(size: 13, weight: .medium)).lineLimit(2).minimumScaleFactor(0.85)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

#if os(iOS)
struct PowaRecoveryLockWidget: Widget {
    let kind = "PowaRecoveryLockWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in RecoveryLockView(snap: entry.snap, family: family) }
                .powaWidgetBackground(nil)
                .widgetURL(Readiness.url(entry.snap))
        }
        .configurationDisplayName("Recovery")
        .description("This morning's readiness from Apple Health, on your Lock Screen.")
        .supportedFamilies([.accessoryCircular, .accessoryRectangular])
    }
}
#endif
