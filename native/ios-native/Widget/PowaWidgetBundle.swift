//
//  PowaWidgetBundle.swift
//  PowaWidget — the widget extension entry point.
//
//  Only hosts the rest-timer Live Activity for now. A meet-day countdown Live Activity
//  can be added here later as a second ActivityConfiguration/attributes kind.
//
import SwiftUI
import WidgetKit

@main
struct PowaWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            RestLiveActivityWidget()
        }
    }
}
