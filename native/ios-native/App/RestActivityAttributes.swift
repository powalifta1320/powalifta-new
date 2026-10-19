//
//  RestActivityAttributes.swift
//  POWALIFTA — shared ActivityKit model for the rest-timer Live Activity.
//
//  This file is compiled into BOTH the App target (which starts/updates/ends the
//  Activity from RestTimerPlugin) AND the PowaWidget extension (which renders it in
//  the Dynamic Island + Lock Screen). The injector adds it to both targets' Sources.
//
//  Kind: RestTimerAttributes.
//  - Fixed attributes (set once at start): the lift name + total duration for the ring.
//  - ContentState (mutable per update): the target end date, paused flag, the
//    frozen remaining seconds used to render a static readout while paused, and
//    the next set (label + whether the Lock Screen "Log set" button can log it).
//
//  Countdown strategy: while running we hand SwiftUI `endDate` and let the OS tick the
//  label every second via `Text(timerInterval:)` / `ProgressView(timerInterval:)` — no
//  per-second push from the app, so it stays alive on the Lock Screen with zero battery
//  cost. On pause we swap to the frozen `pausedRemaining` readout.
//
import Foundation

#if canImport(ActivityKit)
import ActivityKit

@available(iOS 16.1, *)
public struct RestTimerAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Wall-clock instant the countdown reaches zero (used for the self-ticking label).
        public var endDate: Date
        /// True while the athlete has the timer paused.
        public var paused: Bool
        /// Seconds left at the moment of pause — renders the frozen numerals + ring.
        public var pausedRemaining: Double
        /// The next set, e.g. "Squat · 165 kg × 5" ("" = none handed over).
        public var nextLabel: String
        /// True while there's a set the Lock Screen "Log set" button can log.
        public var canLog: Bool

        public init(endDate: Date, paused: Bool, pausedRemaining: Double, nextLabel: String = "", canLog: Bool = false) {
            self.endDate = endDate
            self.paused = paused
            self.pausedRemaining = pausedRemaining
            self.nextLabel = nextLabel
            self.canLog = canLog
        }

        // Tolerant decode: a state written by an older build has no next-set fields.
        private enum CodingKeys: String, CodingKey { case endDate, paused, pausedRemaining, nextLabel, canLog }
        public init(from decoder: Decoder) throws {
            let c = try decoder.container(keyedBy: CodingKeys.self)
            endDate = try c.decode(Date.self, forKey: .endDate)
            paused = try c.decode(Bool.self, forKey: .paused)
            pausedRemaining = try c.decode(Double.self, forKey: .pausedRemaining)
            nextLabel = try c.decodeIfPresent(String.self, forKey: .nextLabel) ?? ""
            canLog = try c.decodeIfPresent(Bool.self, forKey: .canLog) ?? false
        }
    }

    /// e.g. "Squat" / "Bench" / "Rest" — shown as the label under the countdown.
    public var liftName: String
    /// Total programmed rest in seconds — the denominator for the progress ring.
    public var totalSeconds: Double

    public init(liftName: String, totalSeconds: Double) {
        self.liftName = liftName
        self.totalSeconds = totalSeconds
    }
}
#endif
