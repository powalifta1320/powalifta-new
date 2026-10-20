//
//  PowaHomeWidget.swift
//  PowaWidget — the Home Screen widget: your total, the three lifts, today's session.
//
//  Small: the total with the three lifts under it. Medium: that, plus today's session
//  (or the meet countdown once a date is set). Data arrives from the app through the
//  shared App Group (group.com.powalifta.app): WidgetBridgePlugin stores one JSON
//  snapshot of display-ready STRINGS — the app has already done the unit maths — and
//  asks WidgetKit to reload. Brand as the Live Activity: red #ff2d3f on #0b0b0c.
//
import SwiftUI
import WidgetKit

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

    static let suite = "group.com.powalifta.app"
    static let key = "powa.widget.snapshot"

    static func load() -> PowaSnapshot? {
        guard let d = UserDefaults(suiteName: suite), let s = d.string(forKey: key), let data = s.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(PowaSnapshot.self, from: data)
    }

    static let sample = PowaSnapshot(total: "593", unit: "kg", squat: "207", bench: "134", deadlift: "252",
                                     session: "Squat day", sets: "1 of 3 sets", meet: nil, at: nil)
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
        // The app reloads the timeline itself after every logged set; this is only a backstop.
        let entry = PowaEntry(date: Date(), snap: PowaSnapshot.load())
        completion(Timeline(entries: [entry], policy: .after(Date().addingTimeInterval(6 * 3600))))
    }
}

// The lift identity colours the app uses everywhere (styles.css --lift-*).
private enum Lift {
    static let squat = Color(red: 0.220, green: 0.776, blue: 1.0)      // #38c6ff
    static let bench = Color(red: 0.663, green: 0.545, blue: 1.0)      // #a98bff
    static let deadlift = Color(red: 1.0, green: 0.749, blue: 0.235)   // #ffbf3c
}

private struct LiftCell: View {
    let name: String
    let color: Color
    let value: String
    var body: some View {
        HStack(spacing: 4) {
            Circle().fill(color).frame(width: 6, height: 6)
            Text(value)
                .font(.system(.footnote, design: .rounded).weight(.bold))
                .monospacedDigit()
                .foregroundColor(.white)
                .lineLimit(1)
                .minimumScaleFactor(0.7)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(name) \(value)")
    }
}

private struct Wordmark: View {
    var body: some View {
        Text("POWALIFTA")
            .font(.system(.caption2, design: .rounded).weight(.heavy))
            .foregroundColor(Powa.red)
            .tracking(1.5)
    }
}

private struct TotalBlock: View {
    let snap: PowaSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Wordmark()
            HStack(alignment: .firstTextBaseline, spacing: 3) {
                Text(snap.total ?? "–")
                    .font(.system(size: 38, weight: .heavy, design: .rounded))
                    .monospacedDigit()
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(snap.unit ?? "kg")
                    .font(.system(.subheadline, design: .rounded).weight(.semibold))
                    .foregroundColor(Powa.dim)
            }
            Text("Total")
                .font(.system(.caption, design: .rounded))
                .foregroundColor(Powa.dim)
            Spacer(minLength: 0)
            HStack(spacing: 10) {
                LiftCell(name: "Squat", color: Lift.squat, value: snap.squat ?? "–")
                LiftCell(name: "Bench", color: Lift.bench, value: snap.bench ?? "–")
                LiftCell(name: "Deadlift", color: Lift.deadlift, value: snap.deadlift ?? "–")
            }
        }
    }
}

private struct TodayBlock: View {
    let snap: PowaSnapshot
    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(snap.meet == nil ? "TODAY" : "MEET")
                .font(.system(.caption2, design: .rounded).weight(.heavy))
                .foregroundColor(Powa.dim)
                .tracking(1.5)
            Text(snap.meet ?? snap.session ?? "No session")
                .font(.system(.headline, design: .rounded).weight(.bold))
                .foregroundColor(.white)
                .lineLimit(2)
            if snap.meet != nil, let session = snap.session {
                Text(session).font(.system(.caption, design: .rounded)).foregroundColor(Powa.dim).lineLimit(1)
            } else if let sets = snap.sets {
                Text(sets).font(.system(.caption, design: .rounded)).foregroundColor(Powa.dim).lineLimit(1)
            }
            Spacer(minLength: 0)
        }
    }
}

struct PowaWidgetView: View {
    let entry: PowaEntry
    @Environment(\.widgetFamily) private var family

    var body: some View {
        if let snap = entry.snap, snap.total != nil {
            if family == .systemMedium {
                HStack(alignment: .top, spacing: 14) {
                    TotalBlock(snap: snap)
                    Rectangle().fill(Color.white.opacity(0.1)).frame(width: 1)
                    TodayBlock(snap: snap)
                }
            } else {
                TotalBlock(snap: snap)
            }
        } else {
            VStack(alignment: .leading, spacing: 6) {
                Wordmark()
                Text("Open the app once and your total shows up here.")
                    .font(.system(.footnote, design: .rounded))
                    .foregroundColor(Powa.dim)
                Spacer(minLength: 0)
            }
        }
    }
}

extension View {
    /// iOS 17 draws the widget's background itself (and pads the content); iOS 16 needs both from us.
    @ViewBuilder func powaWidgetBackground() -> some View {
        if #available(iOS 17.0, *) {
            self.containerBackground(for: .widget) { Powa.bg }
        } else {
            self.padding(14).background(Powa.bg)
        }
    }
}

struct PowaHomeWidget: Widget {
    let kind = "PowaHomeWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: PowaProvider()) { entry in
            PowaWidgetView(entry: entry)
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .powaWidgetBackground()
        }
        .configurationDisplayName("Total")
        .description("Your total, the three lifts and today's session.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
