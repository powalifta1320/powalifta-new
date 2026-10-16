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
//  - ContentState (mutable per update): the target end date, paused flag, and the
//    frozen remaining seconds used to render a static readout while paused.
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

        public init(endDate: Date, paused: Bool, pausedRemaining: Double) {
            self.endDate = endDate
            self.paused = paused
            self.pausedRemaining = pausedRemaining
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
