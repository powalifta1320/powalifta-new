//
//  PowaliftaWidgetBundle.swift
//  Entry point for the PowaliftaWidget extension.
//
//  If you add home-screen widgets later, list them here alongside the Live Activity.
//

import WidgetKit
import SwiftUI

@main
struct PowaliftaWidgetBundle: WidgetBundle {
    var body: some Widget {
        RestTimerLiveActivity()
    }
}
