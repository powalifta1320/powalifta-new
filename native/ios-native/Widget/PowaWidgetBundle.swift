//
//  PowaWidgetBundle.swift
//  PowaWidget — the widget extension entry point.
//
//  Hosts the Total Home Screen widget (PowaHomeWidget) and the rest-timer Live Activity.
//
import SwiftUI
import WidgetKit

@main
struct PowaWidgetBundle: WidgetBundle {
    var body: some Widget {
        PowaHomeWidget()
        if #available(iOS 16.1, *) {
            RestLiveActivityWidget()
        }
    }
}
