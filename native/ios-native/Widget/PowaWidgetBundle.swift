//
//  PowaWidgetBundle.swift
//  PowaWidget — the widget extension entry point.
//
//  Hosts the Home Screen widgets (Total, Weigh-in, Session, Week, Meet) and the rest-timer
//  Live Activity.
//
import SwiftUI
import WidgetKit

@main
struct PowaWidgetBundle: WidgetBundle {
    var body: some Widget {
        PowaHomeWidget()
        PowaWeighInWidget()
        PowaSessionWidget()
        PowaWeekWidget()
        PowaMeetWidget()
        if #available(iOS 16.1, *) {
            RestLiveActivityWidget()
        }
    }
}
