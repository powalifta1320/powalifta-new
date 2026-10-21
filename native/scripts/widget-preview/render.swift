// Draws every POWALIFTA widget, in every size and state, onto one PNG from the real SwiftUI views.
// Run: bash native/scripts/widget-preview/build.sh [out.png]   (macOS + Xcode command-line tools).
// Sizes are the iPhone 17 Pro Max's as WidgetKit reported them: small 176.67, medium 378 × 176.67,
// corner radius 30, content margins 16.
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
        }
        .padding(28)
        .background(LinearGradient(colors: [Color(red: 0.42, green: 0.62, blue: 0.70), Color(red: 0.10, green: 0.22, blue: 0.48)],
                                   startPoint: .topLeading, endPoint: .bottomTrailing))
        .environment(\.colorScheme, .dark)
    }
}

@main
struct Render {
    @MainActor static func main() {
        let out = CommandLine.arguments.dropFirst().first ?? "widgets.png"
        let r = ImageRenderer(content: Sheet())
        r.scale = 2
        guard let cg = r.cgImage else { FileHandle.standardError.write("render failed\n".data(using: .utf8)!); exit(1) }
        guard let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: out) as CFURL, UTType.png.identifier as CFString, 1, nil) else { exit(2) }
        CGImageDestinationAddImage(dest, cg, nil)
        CGImageDestinationFinalize(dest)
        print("wrote \(out) \(cg.width)x\(cg.height)")
    }
}
