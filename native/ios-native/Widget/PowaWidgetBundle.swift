//
//  PowaWidgetBundle.swift
//  PowaWidget — the widget extension entry point.
//
//  Hosts the Home Screen widgets (Total, Weigh-in, Session, Week, Meet, and with Apple Health
//  Readiness and Weight class), the Lock Screen Recovery gauge, and the rest-timer Live Activity.
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
        PowaReadinessWidget()
        PowaCutWidget()
        PowaRecoveryLockWidget()
        if #available(iOS 16.1, *) {
            RestLiveActivityWidget()
        }
    }
}
