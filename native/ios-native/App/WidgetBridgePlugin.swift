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
        CAPPluginMethod(name: "update", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "takePending", returnType: CAPPluginReturnPromise)
    ]

    static let suite = "group.com.powalifta.app"
    static let key = "powa.widget.snapshot"
    // Shared with the widget extension (PowaHomeWidget.swift: PowaStore). Keep in sync.
    static let draftKey = "powa.weigh.draft"
    static let loggedKey = "powa.weigh.loggedDate"
    static let pendingKey = "powa.widget.pending"
    static let setsPendingKey = "powa.widget.pendingSets"

    // The powalifta:// URL a widget (or the Live Activity) opened the app with. Capacitor
    // posts it on open; the app collects it with takePending and routes it in JS.
    private var launchURL: String?

    override public func load() {
        let handle: (Notification) -> Void = { [weak self] note in
            var url: URL?
            if let dict = note.object as? [String: Any] { url = dict["url"] as? URL }
            if url == nil, let dict = note.userInfo { url = dict["url"] as? URL }
            if let u = url { self?.route(u) }
        }
        NotificationCenter.default.addObserver(forName: Notification.Name.capacitorOpenURL, object: nil, queue: .main, using: handle)
        // Universal Links: an invite link tapped in Messages or Mail opens the installed app.
        NotificationCenter.default.addObserver(forName: Notification.Name.capacitorOpenUniversalLink, object: nil, queue: .main, using: handle)
        // Opened by a link before this plugin loaded: Capacitor keeps the last one.
        if let u = ApplicationDelegateProxy.shared.lastURL { route(u) }
    }

    /// powalifta://… goes to the web app as it is. An invite link (https://www.powalifta.com/j/ABC123)
    /// goes as powalifta://join?code=ABC123, so the web app routes both the same way: sign-up with
    /// the code when signed out, "Join the coach who sent this invite?" when signed in.
    private func route(_ u: URL) {
        var out: String?
        if u.scheme == "powalifta" {
            out = u.absoluteString
        } else if let host = u.host?.lowercased(), host == "www.powalifta.com" || host == "powalifta.com" {
            let parts = u.path.split(separator: "/").map(String.init)
            if parts.count == 2, parts[0] == "j" {
                let code = parts[1].uppercased()
                if code.range(of: "^[A-Z0-9]{6}$", options: .regularExpression) != nil { out = "powalifta://join?code=" + code }
            }
        }
        guard let s = out else { return }
        launchURL = s
        notifyListeners("widgetOpen", data: ["url": s])
    }

    @objc func update(_ call: CAPPluginCall) {
        let json = call.getString("json") ?? ""
        // Without the App Group entitlement UserDefaults(suiteName:) still hands back a store
        // the widget can't see, so check the container itself and say so.
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: Self.suite) != nil,
              let defaults = UserDefaults(suiteName: Self.suite) else { call.resolve(["ok": false, "reason": "no app group"]); return }
        if json.isEmpty || json == "{}" {
            defaults.removeObject(forKey: Self.key)
            defaults.removeObject(forKey: Self.draftKey)
            defaults.removeObject(forKey: Self.loggedKey)
        } else {
            guard json.utf8.count <= 8192 else { call.resolve(["ok": false, "reason": "too big"]); return }
            defaults.set(json, forKey: Self.key)
            // The app's number is the truth: the weigh-in dial restarts from it, and a
            // widget-logged day the app has now saved stops reading as "logged" here.
            if let data = json.data(using: .utf8), let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any] {
                if let lw = obj["lastWeight"] as? String, let v = Double(lw) { defaults.set(v, forKey: Self.draftKey) }
                if (obj["weighedToday"] as? Bool) == true { defaults.removeObject(forKey: Self.loggedKey) }
            }
        }
        #if canImport(WidgetKit)
        if #available(iOS 14.0, *) { WidgetCenter.shared.reloadAllTimelines() }
        #endif
        call.resolve(["ok": true])
    }

    /// Everything the widgets queued while the app was away, and the URL that opened it.
    /// All cleared on read: { weighins: [{date, value, unit}], sets: [{key, date}], open: "powalifta://…" | null }.
    @objc func takePending(_ call: CAPPluginCall) {
        var out: [String: Any] = ["weighins": [], "sets": [], "open": NSNull()]
        if let d = UserDefaults(suiteName: Self.suite) {
            if let data = d.data(forKey: Self.pendingKey), let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] { out["weighins"] = arr }
            d.removeObject(forKey: Self.pendingKey)
            if let data = d.data(forKey: Self.setsPendingKey), let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] { out["sets"] = arr }
            d.removeObject(forKey: Self.setsPendingKey)
        }
        if let u = launchURL { out["open"] = u; launchURL = nil }
        call.resolve(out)
    }
}
