//
//  PowaWidgetIntents.swift
//  PowaWidget — the Weigh-in widget's buttons and the session widget's Log set
//  (iOS 17 interactive widgets).
//
//  Log set marks the set on show as logged (PowaSessionLog, so the widget moves on to the next
//  one at once) and appends {key, date} to powa.widget.pendingSets. The app logs those at their
//  planned RPE the next time it runs (takePending → athlete.html drainWidgetPending), the same
//  way the Lock Screen's Log set works.
//
//  These run inside the widget extension, not the app: they only touch the App Group.
//  −/+ move a draft weight (display units, the unit the snapshot carries); Log appends
//  {date, value, unit} to the pending queue and stamps today as logged. The app drains
//  the queue the next time it's open (WidgetBridgePlugin.takePending → athlete.html
//  drainWidgetPending → saveBodyweightEntry), so the weigh-in reaches the account.
//
import Foundation
import WidgetKit
#if canImport(AppIntents)
import AppIntents

@available(iOS 17.0, *)
struct WeighNudgeIntent: AppIntent {
    static var title: LocalizedStringResource = "Adjust the weigh-in"
    static var isDiscoverable: Bool = false

    @Parameter(title: "Change") var delta: Double

    init() {}
    init(delta: Double) { self.delta = delta }

    func perform() async throws -> some IntentResult {
        guard let d = PowaStore.defaults else { return .result() }
        let cur = (d.object(forKey: PowaStore.draftKey) as? Double) ?? Double(PowaSnapshot.load()?.lastWeight ?? "") ?? 80
        let next = (cur * 10 + delta * 10).rounded() / 10
        d.set(min(450, max(20, next)), forKey: PowaStore.draftKey)
        WidgetCenter.shared.reloadTimelines(ofKind: "PowaWeighInWidget")
        return .result()
    }
}

@available(iOS 17.0, *)
struct WeighLogIntent: AppIntent {
    static var title: LocalizedStringResource = "Log the weigh-in"
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        guard let d = PowaStore.defaults else { return .result() }
        let snap = PowaSnapshot.load()
        guard let value = (d.object(forKey: PowaStore.draftKey) as? Double) ?? Double(snap?.lastWeight ?? "") else { return .result() }
        var queue: [[String: Any]] = []
        if let data = d.data(forKey: PowaStore.pendingKey), let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] { queue = arr }
        queue.append(["date": PowaStore.todayISO(), "value": value, "unit": snap?.unit ?? "kg"])
        if let data = try? JSONSerialization.data(withJSONObject: queue) { d.set(data, forKey: PowaStore.pendingKey) }
        d.set(PowaStore.todayISO(), forKey: PowaStore.loggedKey)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}
@available(iOS 17.0, *)
struct SessionLogSetIntent: AppIntent {
    static var title: LocalizedStringResource = "Log the next set"
    static var isDiscoverable: Bool = false

    func perform() async throws -> some IntentResult {
        guard let d = PowaStore.defaults, let snap = PowaSnapshot.load(), !snap.sessionStale else { return .result() }
        var logged = PowaSessionLog.keys(for: snap)
        guard let item = snap.upNext(after: logged), let key = item.key else { return .result() }
        logged.append(key)
        PowaSessionLog.save(snap, keys: logged)
        var queue: [[String: Any]] = []
        if let data = d.data(forKey: PowaStore.setsPendingKey), let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] { queue = arr }
        queue.append(["key": key, "date": PowaStore.todayISO()])
        if let data = try? JSONSerialization.data(withJSONObject: queue) { d.set(data, forKey: PowaStore.setsPendingKey) }
        WidgetCenter.shared.reloadTimelines(ofKind: "PowaSessionWidget")
        return .result()
    }
}
#endif
