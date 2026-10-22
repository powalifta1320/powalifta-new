// Draws every POWALIFTA widget, in every size and state, onto one PNG from the real SwiftUI views.
// Run: bash native/scripts/widget-preview/build.sh [out.png]   (macOS + Xcode command-line tools).
// Sizes are the iPhone 17 Pro Max's as WidgetKit reported them: small 176.67, medium 378 × 176.67,
// corner radius 30, content margins 16. The Apple Health widgets are also drawn at the smallest
// sizes (Phone.all): an iPhone SE gives a medium widget 321 × 148, i.e. 289pt of content.
import SwiftUI
import WidgetKit
import AppKit
import ImageIO
import UniformTypeIdentifiers

let S: CGFloat = 176.67
let MW: CGFloat = 378
let R: CGFloat = 30

struct Tile<C: View>: View {
    let w: CGFloat
    let h: CGFloat
    let hue: Color?
    let label: String
    @ViewBuilder let content: () -> C
    var body: some View {
        VStack(spacing: 6) {
            content()
                .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
                .padding(16)
                .frame(width: w, height: h)
                .background(PowaBG(hue: hue))
                .containerShape(RoundedRectangle(cornerRadius: R, style: .continuous))
                .clipShape(RoundedRectangle(cornerRadius: R, style: .continuous))
            Text(label).font(.system(size: 11, weight: .medium)).foregroundColor(.white.opacity(0.75))
        }
    }
}

/// As WeighProvider decides it: "weighed today" only counts on the day the app wrote it.
func weigh(_ s: PowaSnapshot?) -> WeighEntry {
    WeighEntry(date: Date(), snap: s, draft: s.flatMap { Double($0.lastWeight ?? "") },
               loggedToday: s?.writtenToday == true && s?.weighedToday == true)
}
let yesterday = (Date().timeIntervalSince1970 - 86400) * 1000
func variant(_ f: (inout PowaSnapshot) -> Void) -> PowaSnapshot { var s = PowaSnapshot.sample; f(&s); return s }

struct Sheet: View {
    var body: some View {
        let lbs = variant { $0.unit = "lbs"; $0.total = "1307"; $0.squat = "456"; $0.bench = "295"; $0.deadlift = "556"; $0.totalDelta = "−4" }
        let weekMet = variant { $0.weekDone = 4; $0.weekDays = [1, 0, 1, 0, 1, 1, 0]; $0.todayIdx = 5; $0.streak = 4 }
        let weekFresh = variant { $0.weekDone = 0; $0.weekDays = [0, 0, 0, 0, 0, 0, 0]; $0.todayIdx = 0; $0.streak = 0 }
        let meetDay = variant { $0.meetDays = 0 }
        let rest = variant { $0.session = "Rest day"; $0.next = nil; $0.setsDone = 0; $0.setsTotal = 0 }
        let done = variant { $0.setsDone = 12; $0.next = nil }
        let bench = variant { $0.session = "Bench day"; $0.next = PowaSnapshot.Next(lift: "bench", name: "Paused bench", load: "112.5", reps: "4", rpe: "7.5"); $0.queue = nil; $0.setsDone = 1; $0.setsTotal = 9 }
        let logged = variant { $0.weighedToday = true }
        let staleDone = variant { $0.setsDone = 12; $0.next = nil; $0.at = yesterday }
        let staleWeigh = variant { $0.weighedToday = true; $0.at = yesterday }
        let noTotal = variant { $0.total = "–"; $0.totalDelta = nil }
        let countedOn = variant { $0.meetDays = 3; $0.at = (Date().timeIntervalSince1970 - 86400) * 1000 }
        // What the app really writes (captured from the demo lifter by syncHomeWidget), decoded
        // with the widget's own Codable: proves the keys line up end to end.
        let live: PowaSnapshot? = (try? Data(contentsOf: URL(fileURLWithPath: "snapshot.json")))
            .flatMap { try? JSONDecoder().decode(PowaSnapshot.self, from: $0) }
        VStack(alignment: .leading, spacing: 20) {
            Text(live == nil ? "Live data: add snapshot.json (a JSON the app wrote) to see it here" : "Live data (decoded from the app's snapshot)")
                .font(.system(size: 13, weight: .bold)).foregroundColor(live == nil ? .red : .white)
            if let live {
                HStack(alignment: .top, spacing: 20) {
                    Tile(w: MW, h: S, hue: Hue.fire, label: "Total · medium") { TotalView(snap: live, family: .systemMedium) }
                    Tile(w: S, h: S, hue: Hue.ok, label: "This week") { WeekView(snap: live, family: .systemSmall) }
                    Tile(w: S, h: S, hue: Hue.bw, label: "Weigh-in · logged") { WeighView(entry: weigh(live), family: .systemSmall) }
                }
                HStack(alignment: .top, spacing: 20) {
                    Tile(w: MW, h: S, hue: Readiness.hue(live), label: "Readiness · medium") { ReadinessView(snap: live, family: .systemMedium) }
                    Tile(w: MW, h: S, hue: Hue.bw, label: "Weight class · medium") { CutView(snap: live, family: .systemMedium) }
                }
                HStack(alignment: .top, spacing: 20) {
                    Tile(w: S, h: S, hue: Readiness.hue(live), label: "Readiness") { ReadinessView(snap: live, family: .systemSmall) }
                    Tile(w: S, h: S, hue: Hue.bw, label: "Weight class") { CutView(snap: live, family: .systemSmall) }
                    LockTile(w: 76, h: 76, label: "Recovery · circular") { RecoveryCircle(snap: live) }
                    LockTile(w: 172, h: 76, label: "Recovery · rectangular") { RecoveryLine(snap: live) }
                }
                HStack(alignment: .top, spacing: 20) {
                    Tile(w: MW, h: S, hue: SessionView.hue(live), label: "Today's session") { SessionView(snap: live) }
                    Tile(w: S, h: S, hue: nil, label: "Meet day · none set") { MeetView(snap: live, family: .systemSmall) }
                    Tile(w: S, h: S, hue: Hue.fire, label: "Total") { TotalView(snap: live, family: .systemSmall) }
                }
            }
            Text("Gallery (the sample)").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
            HStack(alignment: .top, spacing: 20) {
                Tile(w: S, h: S, hue: Hue.fire, label: "Total") { TotalView(snap: .sample, family: .systemSmall) }
                Tile(w: S, h: S, hue: Hue.bw, label: "Weigh-in") { WeighView(entry: weigh(.sample), family: .systemSmall) }
                Tile(w: S, h: S, hue: Hue.ok, label: "This week") { WeekView(snap: .sample, family: .systemSmall) }
                Tile(w: S, h: S, hue: nil, label: "Meet day") { MeetView(snap: .sample, family: .systemSmall) }
            }
            HStack(alignment: .top, spacing: 20) {
                Tile(w: MW, h: S, hue: Hue.fire, label: "Total · medium") { TotalView(snap: .sample, family: .systemMedium) }
                Tile(w: MW, h: S, hue: Hue.bw, label: "Weigh-in · medium") { WeighView(entry: weigh(.sample), family: .systemMedium) }
            }
            HStack(alignment: .top, spacing: 20) {
                Tile(w: MW, h: S, hue: SessionView.hue(.sample), label: "Today's session") { SessionView(snap: .sample) }
                Tile(w: MW, h: S, hue: SessionView.hue(bench), label: "Today's session · bench next") { SessionView(snap: bench) }
            }
            Text("The day turned (app not opened since yesterday)").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
            HStack(alignment: .top, spacing: 20) {
                Tile(w: MW, h: S, hue: SessionView.hue(staleDone), label: "Session · yesterday's was done") { SessionView(snap: staleDone) }
                Tile(w: S, h: S, hue: Hue.bw, label: "Weigh-in · weighed yesterday") { WeighView(entry: weigh(staleWeigh), family: .systemSmall) }
                Tile(w: S, h: S, hue: nil, label: "Meet · 3 then, 2 now") { MeetView(snap: countedOn, family: .systemSmall) }
            }
            HStack(alignment: .top, spacing: 20) {
                Tile(w: MW, h: S, hue: Hue.fire, label: "Total · medium, yesterday's done") { TotalView(snap: staleDone, family: .systemMedium) }
                Tile(w: MW, h: S, hue: Hue.fire, label: "Total · medium, no total yet") { TotalView(snap: noTotal, family: .systemMedium) }
            }
            Text("States").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
            HStack(alignment: .top, spacing: 20) {
                Tile(w: S, h: S, hue: Hue.fire, label: "Total · lbs, down") { TotalView(snap: lbs, family: .systemSmall) }
                Tile(w: S, h: S, hue: Hue.bw, label: "Weigh-in · logged") { WeighView(entry: weigh(logged), family: .systemSmall) }
                Tile(w: S, h: S, hue: Hue.ok, label: "Week · goal hit") { WeekView(snap: weekMet, family: .systemSmall) }
                Tile(w: S, h: S, hue: Hue.ok, label: "Week · Monday") { WeekView(snap: weekFresh, family: .systemSmall) }
            }
            HStack(alignment: .top, spacing: 20) {
                Tile(w: S, h: S, hue: nil, label: "Meet · the day") { MeetView(snap: meetDay, family: .systemSmall) }
                Tile(w: S, h: S, hue: Hue.fire, label: "Total · empty") { TotalView(snap: nil, family: .systemSmall) }
                Tile(w: S, h: S, hue: Hue.bw, label: "Weigh-in · empty") { WeighView(entry: weigh(nil), family: .systemSmall) }
                Tile(w: S, h: S, hue: nil, label: "Meet · no date") { MeetView(snap: variant { $0.meetDays = nil }, family: .systemSmall) }
            }
            HStack(alignment: .top, spacing: 20) {
                Tile(w: MW, h: S, hue: SessionView.hue(done), label: "Session · done") { SessionView(snap: done) }
                Tile(w: MW, h: S, hue: SessionView.hue(rest), label: "Session · rest day") { SessionView(snap: rest) }
            }
            HStack(alignment: .top, spacing: 20) {
                Tile(w: MW, h: S, hue: Hue.fire, label: "Total · medium, rest day") { TotalView(snap: rest, family: .systemMedium) }
                Tile(w: MW, h: S, hue: Hue.bw, label: "Weigh-in · medium, logged") { WeighView(entry: weigh(logged), family: .systemMedium) }
            }
            ForEach(Phone.all, id: \.tag) { ph in
                Text("Apple Health (Readiness, Weight class, Recovery on the Lock Screen) · \(ph.label)").font(.system(size: 13, weight: .bold)).foregroundColor(.white)
                ForEach(Array(HealthTiles.rows(ph).enumerated()), id: \.offset) { _, row in
                    HStack(alignment: .top, spacing: 20) {
                        ForEach(row, id: \.name) { t in t.view }
                    }
                }
            }
        }
        .padding(28)
        .background(LinearGradient(colors: [Color(red: 0.42, green: 0.62, blue: 0.70), Color(red: 0.10, green: 0.22, blue: 0.48)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
        .environment(\.colorScheme, .dark)
    }
}

// MARK: - Apple Health widgets: every size and state, also written one PNG each (--split DIR)

struct NamedTile { let name: String; let view: AnyView }

/// A phone's widget sizes (points): small square, medium width, Lock Screen circle and rectangle.
struct Phone {
    let tag: String          // "" for the Pro Max (the plain file names), else "@<medium>x<small>"
    let label: String
    let small: CGFloat, medium: CGFloat, circle: CGFloat, rectW: CGFloat, rectH: CGFloat
    static let max = Phone(tag: "", label: "iPhone 17 Pro Max", small: S, medium: MW, circle: 76, rectW: 172, rectH: 76)
    static let std = Phone(tag: "@338x158", label: "6.1-inch iPhone", small: 158, medium: 338, circle: 72, rectW: 160, rectH: 72)
    static let se = Phone(tag: "@321x148", label: "iPhone SE", small: 148, medium: 321, circle: 68, rectW: 153, rectH: 68)
    static let all = [max, std, se]
}

/// A Lock Screen widget as iOS draws it over a wallpaper: monochrome white, no widget background.
struct LockTile<C: View>: View {
    let w: CGFloat
    let h: CGFloat
    let label: String
    @ViewBuilder let content: () -> C
    var body: some View {
        VStack(spacing: 6) {
            content()
                .foregroundStyle(.white)
                .tint(.white)
                .frame(width: w, height: h)
                .padding(10)
                .background(RoundedRectangle(cornerRadius: 18, style: .continuous).fill(LinearGradient(colors: [Color(red: 0.16, green: 0.20, blue: 0.32), Color(red: 0.05, green: 0.06, blue: 0.10)], startPoint: .top, endPoint: .bottom)))
            Text(label).font(.system(size: 11, weight: .medium)).foregroundColor(.white.opacity(0.75))
        }
    }
}

enum HealthTiles {
    static func v(_ f: (inout PowaSnapshot) -> Void) -> PowaSnapshot { variant(f) }
    static let normal = v { $0.health = PowaSnapshot.Health(day: nil, word: "Normal", level: 0.67,
        sleep: PowaSnapshot.Metric(value: "6 h 50", usual: "7 h 05", off: false), rhr: PowaSnapshot.Metric(value: "55", usual: "54", off: false),
        hrv: nil, line: "Slept 6 h 50 · HR 55"); $0.session = "Bench day"; $0.next = PowaSnapshot.Next(lift: "bench", name: "Paused bench", load: "112.5", reps: "4", rpe: "7.5") }
    static let rough = v { $0.health = PowaSnapshot.Health(day: nil, word: "Rough", level: 0.34,
        sleep: PowaSnapshot.Metric(value: "5 h 10", usual: "7 h 05", off: true), rhr: PowaSnapshot.Metric(value: "62", usual: "54", off: true),
        hrv: PowaSnapshot.Metric(value: "44", usual: "61", off: true), line: "Slept 5 h 10 · HR 62"); $0.next = PowaSnapshot.Next(lift: "deadlift", name: "Comp deadlift", load: "215", reps: "2", rpe: "8"); $0.session = "Pull day" }
    static let rest = v { $0.session = "Rest day"; $0.next = nil; $0.setsDone = 0; $0.setsTotal = 0 }
    static let waiting = v { $0.health = nil }
    static let stale = v { $0.health?.day = "2026-01-01"; $0.at = (Date().timeIntervalSince1970 - 86400) * 1000 }
    static let noHealth = v { $0.healthOn = nil; $0.health = nil }
    static let made = v { $0.cut = PowaSnapshot.Cut(cls: "83 kg class", classLine: 83, unit: "kg", cur: "82.6", status: "On weight", tone: "made",
        pace: "−0.2 a week", need: nil, by: "Nov 14", trend: [83.0, 82.9, 82.8, nil, 82.6, 82.5, 82.4]) }
    static let off = v { $0.cut = PowaSnapshot.Cut(cls: "74 kg class", classLine: 74, unit: "kg", cur: "76.1", status: "2.1 kg to go", tone: "off",
        pace: "Steady", need: "−0.7", by: "Nov 14", trend: [76.0, 76.3, nil, 76.1, 76.2, 75.9, 76.1]) }
    static let amber = v { $0.cut = PowaSnapshot.Cut(cls: "93 kg class", classLine: 93, unit: "kg", cur: "92.1", status: "On weight", tone: "amber",
        pace: "+0.4 a week", need: nil, by: nil, trend: [91.6, 91.8, 92.0, 92.1, nil, 92.3, 92.6]) }
    static let lbs = v { $0.unit = "lbs"; $0.cut = PowaSnapshot.Cut(cls: "83 kg class", classLine: 183, unit: "lbs", cur: "184.6", status: "1.6 lbs to go", tone: "good",
        pace: "−0.9 a week", need: "−0.3", by: "Nov 14", trend: [185.9, 185.4, 185.0, 185.2, 184.7, nil, 184.4]) }
    static let noWeigh = v { $0.cut = PowaSnapshot.Cut(cls: "83 kg class", classLine: 83, unit: "kg", cur: nil, status: nil, tone: nil, pace: nil, need: nil, by: "Nov 14", trend: nil) }
    static let noClass = v { $0.cut = nil }

    static func rows(_ ph: Phone) -> [[NamedTile]] {
    func r(_ name: String, _ s: PowaSnapshot?, _ f: WidgetFamily) -> NamedTile {
        NamedTile(name: name + ph.tag, view: AnyView(Tile(w: f == .systemMedium ? ph.medium : ph.small, h: ph.small, hue: Readiness.hue(s), label: name + ph.tag) { ReadinessView(snap: s, family: f) }))
    }
    func c(_ name: String, _ s: PowaSnapshot?, _ f: WidgetFamily) -> NamedTile {
        NamedTile(name: name + ph.tag, view: AnyView(Tile(w: f == .systemMedium ? ph.medium : ph.small, h: ph.small, hue: Hue.bw, label: name + ph.tag) { CutView(snap: s, family: f) }))
    }
    // The Lock Screen families are iOS-only, so the two Lock Screen views are drawn directly.
    func l(_ name: String, _ s: PowaSnapshot?, circle: Bool) -> NamedTile {
        NamedTile(name: name + ph.tag, view: AnyView(LockTile(w: circle ? ph.circle : ph.rectW, h: circle ? ph.circle : ph.rectH, label: name + ph.tag) {
            if circle { RecoveryCircle(snap: s) } else { RecoveryLine(snap: s) }
        }))
    }
    return [
        [r("readiness-small-fresh", .sample, .systemSmall), r("readiness-medium-fresh", .sample, .systemMedium)],
        [r("readiness-small-normal", normal, .systemSmall), r("readiness-medium-normal", normal, .systemMedium)],
        [r("readiness-small-rough", rough, .systemSmall), r("readiness-medium-rough", rough, .systemMedium)],
        [r("readiness-small-rest-day", variant { $0.session = "Rest day"; $0.next = nil; $0.setsDone = 0; $0.setsTotal = 0 }, .systemSmall), r("readiness-medium-no-hrv-rest-day", variant { $0.health?.hrv = nil; $0.session = "Rest day"; $0.next = nil; $0.setsDone = 0; $0.setsTotal = 0 }, .systemMedium)],
        [r("readiness-small-connect", noHealth, .systemSmall), r("readiness-medium-connect", noHealth, .systemMedium)],
        [r("readiness-small-first-run", nil, .systemSmall), r("readiness-medium-first-run", nil, .systemMedium)],
        [r("readiness-small-waiting", waiting, .systemSmall), r("readiness-medium-waiting", waiting, .systemMedium)],
        [r("readiness-small-stale", stale, .systemSmall), r("readiness-medium-stale", stale, .systemMedium)],
        [c("cut-small-on-pace", .sample, .systemSmall), c("cut-medium-on-pace", .sample, .systemMedium)],
        [c("cut-small-made", made, .systemSmall), c("cut-medium-made", made, .systemMedium)],
        [c("cut-small-off-pace", off, .systemSmall), c("cut-medium-off-pace", off, .systemMedium)],
        [c("cut-small-creeping-up-no-date", amber, .systemSmall), c("cut-medium-creeping-up-no-date", amber, .systemMedium)],
        [c("cut-small-lbs", lbs, .systemSmall), c("cut-medium-lbs", lbs, .systemMedium)],
        [c("cut-small-no-weigh-ins", noWeigh, .systemSmall), c("cut-medium-no-weigh-ins", noWeigh, .systemMedium)],
        [c("cut-small-no-class", noClass, .systemSmall), c("cut-medium-no-class", noClass, .systemMedium)],
        [c("cut-small-first-run", nil, .systemSmall), c("cut-medium-first-run", nil, .systemMedium)],
        [l("lock-circular-fresh", .sample, circle: true), l("lock-circular-rough", rough, circle: true),
         l("lock-circular-connect", noHealth, circle: true), l("lock-rectangular-fresh", .sample, circle: false)],
        [l("lock-rectangular-rough", rough, circle: false), l("lock-rectangular-connect", noHealth, circle: false),
         l("lock-rectangular-waiting", waiting, circle: false), l("lock-circular-waiting", waiting, circle: true)],
        [l("lock-rectangular-stale", stale, circle: false), l("lock-circular-stale", stale, circle: true)],
    ]
    }
}

@MainActor func writePNG<V: View>(_ view: V, to out: String) -> Bool {
    let r = ImageRenderer(content: view.environment(\.colorScheme, .dark))
    r.scale = 2
    guard let cg = r.cgImage,
          let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil) else { return false }
    CGImageDestinationAddImage(dest, cg, nil)
    return CGImageDestinationFinalize(dest)
}

@main
struct Render {
    @MainActor static func main() {
        let args = Array(CommandLine.arguments.dropFirst())
        // --split DIR: each Apple Health widget tile on its own PNG, then exit: DIR/<name>.png at the
        // Pro Max size, DIR/<name>@338x158.png (6.1-inch) and DIR/<name>@321x148.png (iPhone SE).
        if let i = args.firstIndex(of: "--split"), i + 1 < args.count {
            let dir = args[i + 1]
            try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
            var n = 0
            for t in Phone.all.flatMap({ HealthTiles.rows($0).flatMap { $0 } }) {
                let bg = LinearGradient(colors: [Color(red: 0.42, green: 0.62, blue: 0.70), Color(red: 0.10, green: 0.22, blue: 0.48)], startPoint: .topLeading, endPoint: .bottomTrailing)
                if writePNG(t.view.padding(18).background(bg), to: dir + "/" + t.name + ".png") { n += 1 }
            }
            print("wrote \(n) tiles to \(dir)")
            return
        }
        let out = args.first ?? "widgets.png"
        let r = ImageRenderer(content: Sheet())
        r.scale = 2
        guard let cg = r.cgImage else { FileHandle.standardError.write("render failed\n".data(using: .utf8)!); exit(1) }
        guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(2) }
        CGImageDestinationAddImage(dest, cg, nil)
        CGImageDestinationFinalize(dest)
        print("wrote \(out) \(cg.width)x\(cg.height)")
    }
}
