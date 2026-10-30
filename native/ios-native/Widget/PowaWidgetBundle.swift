//
//  PowaWidgetBundle.swift
//  PowaWidget — the widget extension entry point.
//
//  The lifter's Home Screen widgets (Total, Weigh-in, Session, Week, Meet, PR, and with Apple Health
//  Readiness and Weight class), the Lock Screen Recovery gauge, the coach's (Need you, Next meet,
//  Clients, Team week) and the rest-timer Live Activity. A bundle's body takes ten widgets at most,
//  so the lifter's and the coach's are bundles of their own.
//
import SwiftUI
import WidgetKit

@main
struct PowaWidgetBundle: WidgetBundle {
    var body: some Widget {
        PowaLifterWidgets().body
        PowaCoachWidgetSet().body
        if #available(iOS 16.1, *) {
            RestLiveActivityWidget()
        }
    }
}

/// The lifter's, in the gallery's order.
struct PowaLifterWidgets: WidgetBundle {
    var body: some Widget {
        PowaHomeWidget()
        PowaSessionWidget()
        PowaPRWidget()
        PowaWeighInWidget()
        PowaWeekWidget()
        PowaMeetWidget()
        PowaReadinessWidget()
        PowaCutWidget()
        PowaRecoveryLockWidget()
    }
}

/// The coach's.
struct PowaCoachWidgetSet: WidgetBundle {
    var body: some Widget {
        PowaCoachNeedWidget()
        PowaCoachMeetWidget()
        PowaCoachClientsWidget()
        PowaCoachWeekWidget()
    }
}
