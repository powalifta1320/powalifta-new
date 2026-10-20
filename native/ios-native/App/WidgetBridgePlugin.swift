//
//  WidgetBridgePlugin.swift
//  POWALIFTA — hands the Home Screen widget its numbers.
//
//  JS name: "PowaWidget". The web app calls, feature-detected, after every logged set:
//      window.Capacitor.Plugins.PowaWidget.update({ json })
//  `json` is one snapshot of display-ready strings (total, the three lifts, today's
//  session, the meet countdown); an empty string clears it (sign-out, account deletion),
//  so the widget never shows a lifter who has left. It lands in the App Group's UserDefaults
//  (group.com.powalifta.app — both targets carry the entitlement, see
//  native/scripts/inject-home-screen.rb) and WidgetKit is asked to redraw. The widget
//  (PowaHomeWidget.swift) only reads; it never touches the network or the account.
//
import Foundation
import Capacitor
#if canImport(WidgetKit)
import WidgetKit
#endif

@objc(WidgetBridgePlugin)
public class WidgetBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WidgetBridgePlugin"
    public let jsName = "PowaWidget"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise)
    ]

    static let suite = "group.com.powalifta.app"
    static let key = "powa.widget.snapshot"

    @objc func update(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? ""
        // Without the App Group entitlement UserDefaults(suiteName:) still hands back a store
        // the widget can't see, so check the container itself and say so.
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.suite) != nil,
              let defaults = UserDefaults(suiteName: Self.suite) else { call.resolve(["ok": false, "reason": "no app group"]); return }
        if json.isEmpty || json == "{}" {
            defaults.removeObject(forKey: Self.key)
        } else {
            guard json.utf8.count <= 8192 else { call.resolve(["ok": false, "reason": "too big"]); return }
            defaults.set(json, forKey: Self.key)
        }
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        #endif
        call.resolve(["ok": true])
    }
}
