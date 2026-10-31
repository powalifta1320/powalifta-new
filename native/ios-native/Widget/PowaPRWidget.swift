//
//  PowaPRWidget.swift
//  PowaWidget — the lifter's latest PR (2026-10-30), small and medium.
//
//  The PR moment on the Home Screen, as the app shows it (athlete.html showPRToast): the gold
//  plate (drawn here in shapes, never an image), "New PR", the number big with its unit, the jump
//  over the old best in green, the lift and when ("Squat · 2 days ago"). The numbers are the app's
//  (app.js widgetLastPR over the PR feed Progress shows: the competition-equivalent e1RM, a lift's
//  first sets never a PR), sent as PowaSnapshot.lastPR; "when" is counted here from its date, so
//  it stays true without the app. Older than a week it reads "Latest PR". Before the first PR, a
//  calm outline where the plate will be. A tap opens Progress (powalifta://progress).
//
import SwiftUI
import WidgetKit

/// The PR moment's gold plate, in shapes: a gold disc lit from the top left, a ring pressed into
/// it, the steel hub and the bar's hole. On a tinted or clear Home Screen (opacity only) the disc and
/// the hub are two rings of ink, the disc accentable; the empty state draws its outline.
struct PRPlate: View {
    var size: CGFloat = 40
    var ghost = false
    @Environment(\.powaPal) private var p
    var body: some View {
        let u = size / 120
        ZStack {
            if ghost {
                Circle().strokeBorder(p.track, lineWidth: max(1.5, 4 * u))
                Circle().strokeBorder(p.track, lineWidth: max(1.2, 3 * u)).frame(width: 38 * u, height: 38 * u)
            } else if p.mono {
                Circle().strokeBorder(p.ink, lineWidth: 41 * u).widgetAccentable()
                Circle().strokeBorder(p.ink.opacity(0.5), lineWidth: 11 * u).frame(width: 38 * u, height: 38 * u)
            } else {
                Circle().fill(RadialGradient(colors: [Color(hex: 0xffe9a8), Hue.gold, Color(hex: 0xa87a24)],
                                             center: UnitPoint(x: 0.38, y: 0.32), startRadius: 0, endRadius: 90 * u))
                Circle().strokeBorder(Color(hex: 0x3c2800, opacity: 0.22), lineWidth: max(1, 2 * u))
                    .frame(width: 90 * u, height: 90 * u)
                Circle().fill(Color(hex: 0xdcdfe5)).frame(width: 38 * u, height: 38 * u)
                Circle().strokeBorder(Color.black.opacity(0.18), lineWidth: max(0.75, 1.5 * u)).frame(width: 38 * u, height: 38 * u)
                Circle().fill(Color(hex: 0x0b0b0c)).frame(width: 16 * u, height: 16 * u)
                if size >= 64 {
                    Text("PR")
                        .font(.system(size: 13 * u, weight: .heavy))
                        .foregroundColor(Color(hex: 0x3c2800, opacity: 0.5))
                        .offset(y: -27 * u)
                }
            }
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

struct PRView: View {
    let snap: PowaSnapshot?
    let family: WidgetFamily
    @Environment(\.powaPal) private var p

    var body: some View {
        if let pr = snap?.lastPR, let v = pr.value, !v.isEmpty {
            if family == .systemMedium { medium(pr, v) } else { small(pr, v) }
        } else {
            empty
        }
    }

    /// "New PR" for a week, then "Latest PR": an old PR never claims to be new.
    private func label(_ pr: PowaSnapshot.PR) -> String {
        guard let d = pr.date, let n = PowaStore.daysUntil(d) else { return "New PR" }
        return -n <= 7 ? "New PR" : "Latest PR"
    }
    /// "Squat · 2 days ago"; with room, "Squat e1RM · 2 days ago" (an estimate, as the moment says).
    private func whenLine(_ pr: PowaSnapshot.PR, e1rm: Bool = false) -> String {
        let lift = Lift.name(pr.lift) + (e1rm ? " e1RM" : "")
        if let ago = PowaFormat.ago(pr.date) { return "\(lift) · \(ago)" }
        return lift
    }

    private func small(_ pr: PowaSnapshot.PR, _ v: String) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 7) {
                PRPlate(size: 22)
                Text(label(pr))
                    .font(.system(size: 13, weight: .bold))
                    .foregroundColor(p.goldInk)
                    .lineLimit(1)
            }
            Spacer(minLength: 4)
            HeroNumber(value: v, unit: pr.unit ?? snap?.unit ?? "kg", size: 40)
            DeltaUp(delta: pr.delta, unit: pr.unit ?? snap?.unit ?? "kg").padding(.top, 2)
            Spacer(minLength: 8)
            LiftWhen(lift: pr.lift, text: whenLine(pr))
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label(pr)): \(v) \(pr.unit ?? "kg"), \(pr.delta ?? "") \(pr.unit ?? "kg"). \(whenLine(pr))")
    }

    private func medium(_ pr: PowaSnapshot.PR, _ v: String) -> some View {
        HStack(spacing: 18) {
            PRPlate(size: 104)
            VStack(alignment: .leading, spacing: 0) {
                Text(label(pr))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(p.goldInk)
                Spacer(minLength: 2)
                HeroNumber(value: v, unit: pr.unit ?? snap?.unit ?? "kg", size: 48)
                DeltaUp(delta: pr.delta, unit: pr.unit ?? snap?.unit ?? "kg", over: true).padding(.top, 3)
                Spacer(minLength: 8)
                LiftWhen(lift: pr.lift, text: whenLine(pr, e1rm: true))
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(label(pr)): \(v) \(pr.unit ?? "kg"), \(pr.delta ?? "") \(pr.unit ?? "kg") over your best. \(whenLine(pr))")
    }

    /// Before the first PR: the plate's outline where the plate will be, one calm line.
    @ViewBuilder private var empty: some View {
        if family == .systemMedium {
            HStack(spacing: 18) {
                PRPlate(size: 104, ghost: true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Your next PR lands here.")
                        .font(.system(size: 17, weight: .bold)).foregroundColor(p.ink)
                        .fixedSize(horizontal: false, vertical: true)
                    Text("Every top set is measured against your best.")
                        .font(.system(size: 13, weight: .medium)).foregroundColor(p.ink2)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .frame(maxHeight: .infinity)
        } else {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 7) {
                    PRPlate(size: 22, ghost: true)
                    Text("PR").font(.system(size: 13, weight: .bold)).foregroundColor(p.ink2)
                }
                Spacer(minLength: 4)
                Text("Your next PR lands here.")
                    .font(.system(size: 15, weight: .semibold)).foregroundColor(p.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
            }
        }
    }
}

/// The jump over the old best, in green, as the moment shows it.
private struct DeltaUp: View {
    let delta: String?
    let unit: String
    var over = false
    @Environment(\.powaPal) private var p
    var body: some View {
        if let d = delta, !d.isEmpty {
            HStack(spacing: 3) {
                Image(systemName: "arrow.up.right").font(.system(size: 10, weight: .heavy))
                Text("\(d.hasPrefix("+") ? String(d.dropFirst()) : d) \(unit)\(over ? " over your best" : "")")
                    .monospacedDigit()
            }
            .font(.system(size: 12, weight: .semibold))
            .foregroundColor(p.okInk)
            .lineLimit(1)
            .minimumScaleFactor(0.8)
        }
    }
}

/// The lift in its colour, and when: "Squat · 2 days ago".
private struct LiftWhen: View {
    let lift: String?
    let text: String
    @Environment(\.powaPal) private var p
    var body: some View {
        HStack(spacing: 5) {
            Circle().fill(p.lift(lift)).frame(width: 6, height: 6)
            Text(text).lineLimit(1).minimumScaleFactor(0.8)
        }
        .font(.system(size: 12, weight: .semibold))
        .foregroundColor(p.ink2)
    }
}

struct PowaPRWidget: Widget {
    let kind = "PowaPRWidget"
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SnapProvider()) { entry in
            FamilyReader { family in
                LifterOnly(snap: entry.snap, title: "PR", family: family) { PRView(snap: entry.snap, family: family) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .powaWidgetBackground(Hue.gold)
            .widgetURL(URL(string: "powalifta://progress"))
        }
        .configurationDisplayName("PR")
        .description("Your latest PR: the number, the jump over your best, the lift and when.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}
