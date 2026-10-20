//
//  AppIconPlugin.swift
//  POWALIFTA — Capacitor plugin that switches the Home Screen icon between the plate
//  colours (the red 25 kg plate is the primary icon; blue / yellow / green / white are
//  alternate icons in the asset catalog, see native/scripts/inject-home-screen.rb).
//
//  JS name: "PowaIcon". The web app calls, feature-detected:
//      window.Capacitor.Plugins.PowaIcon.get()            → { name, supported }
//      window.Capacitor.Plugins.PowaIcon.set({ name })    → { ok, reason? }
//  `name` is the alternate icon's asset name ("AppIcon-Blue"); "" means the primary.
//  iOS shows its own "You have changed the icon" alert on every switch — that's the
//  system, not us. Registered via CAPBridgedPlugin (Capacitor 6).
//
import Foundation
import UIKit
import Capacitor

@objc(AppIconPlugin)
public class AppIconPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppIconPlugin"
    public let jsName = "PowaIcon"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "get", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)
    ]

    @objc func get(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            let app = UIApplication.shared
            call.resolve(["name": app.alternateIconName ?? "", "supported": app.supportsAlternateIcons])
        }
    }

    @objc func set(_ call: CAPPluginCall) {
        let raw = call.getString("name") ?? ""
        let name: String? = raw.isEmpty ? nil : raw
        DispatchQueue.main.async {
            let app = UIApplication.shared
            guard app.supportsAlternateIcons else { call.resolve(["ok": false, "reason": "unsupported"]); return }
            if app.alternateIconName == name { call.resolve(["ok": true]); return }
            app.setAlternateIconName(name) { error in
                if let error = error { call.resolve(["ok": false, "reason": error.localizedDescription]) }
                else { call.resolve(["ok": true]) }
            }
        }
    }
}
