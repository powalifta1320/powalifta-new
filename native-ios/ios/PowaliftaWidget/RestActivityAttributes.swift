//
//  RestActivityAttributes.swift
//  Shared between the App target and the PowaliftaWidget extension.
//  IMPORTANT: add this file to BOTH targets' membership in Xcode.
//
//  This mirrors the web timer's model exactly: an absolute endDate is the source
//  of truth (the same `restEndTime` the browser tracks), so the countdown stays
//  accurate without any background work — SwiftUI's Text(timerInterval:) ticks it.
//

import ActivityKit
import Foundation

struct RestActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        /// Absolute moment the rest ends. Drives Text(timerInterval:) when running.
        var endDate: Date
        /// True while the user has paused; we then show a frozen value instead of ticking.
        var paused: Bool
        /// Remaining whole seconds captured at the moment of pause (only read when paused).
        var pausedRemaining: Int
    }

    /// Static label for the whole activity, e.g. "Rest".
    var label: String
}
