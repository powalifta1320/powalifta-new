import Foundation
import Capacitor
import HealthKit

// Apple Health for POWALIFTA (1.3, branch feat/apple-health). JS name "PowaHealth".
// Reads: bodyweight (smart scales and other apps), sleep, resting heart rate, heart rate
// variability (SDNN, for the rest suggestion), and calories + protein eaten (the cut tracker).
// Writes: bodyweight (the lifter's weigh-ins) and finished sessions as strength workouts.
// Everything the app writes carries a sync identifier ("powa-bw-<id>", "powa-session-<id>")
// with a version, so saving again replaces the old copy instead of adding a second one, and
// deleting finds exactly ours. Nothing here runs until the lifter turns Apple Health on in the
// app (health.js); a Debug build tells the web layer so, which lets the demo try Health in the
// simulator (a Release build never does).
@objc(HealthPlugin)
public class HealthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HealthPlugin"
    public let jsName = "PowaHealth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readWeights", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "writeWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWeight", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "deleteWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readSleep", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readRestingHeartRate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readHRV", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readNutrition", returnType: CAPPluginReturnPromise)
    ]

    private let store = HKHealthStore()
    private var bodyMass: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .bodyMass)! }
    private var restingHR: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .restingHeartRate)! }
    private var sleepType: HKCategoryType { HKCategoryType.categoryType(forIdentifier: .sleepAnalysis)! }
    private var hrvType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .heartRateVariabilitySDNN)! }
    private var energyType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .dietaryEnergyConsumed)! }
    private var proteinType: HKQuantityType { HKQuantityType.quantityType(forIdentifier: .dietaryProtein)! }

    // ---- dates: "YYYY-MM-DD" (a weigh-in: 08:00 local that day) or ISO 8601 -------------------
    private static func parseDate(_ s: String?) -> Date? {
        guard let s = s, !s.isEmpty else { return nil }
        if s.count == 10 {
            let f = DateFormatter()
            f.calendar = Calendar(identifier: .gregorian)
            f.locale = Locale(identifier: "en_US_POSIX")
            f.timeZone = .current
            f.dateFormat = "yyyy-MM-dd HH:mm"
            return f.date(from: s + " 08:00")
        }
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f.date(from: s) { return d }
        return ISO8601DateFormatter().date(from: s)
    }
    private static func iso(_ d: Date) -> String { ISO8601DateFormatter().string(from: d) }
    // "not_determined" when the lifter hasn't answered iOS for a type yet (a reinstall resets it).
    private static func code(_ err: Error) -> String {
        if let hk = err as? HKError, hk.code == .errorAuthorizationNotDetermined { return "not_determined" }
        return "read_failed"
    }
    private static func day(_ d: Date) -> String {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f.string(from: d)
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        #if DEBUG
        let debug = true
        #else
        let debug = false
        #endif
        call.resolve(["available": HKHealthStore.isHealthDataAvailable(), "debug": debug])
    }

    // One permission sheet for everything. iOS never says what was allowed to be READ (privacy),
    // only whether writing was allowed.
    @objc func requestAccess(_ call: CAPPluginCall) {
        guard HKHealthStore.isHealthDataAvailable() else { call.resolve(["shown": false]); return }
        let share: Set<HKSampleType> = [bodyMass, HKObjectType.workoutType()]
        // One sheet for everything (brief M7: one HealthKit change, one prompt). Adding types here
        // makes iOS ask again for just the new ones on the next launch (health.js asks once a launch).
        let read: Set<HKObjectType> = [bodyMass, restingHR, sleepType, hrvType, energyType, proteinType]   // workouts are only written (and our own deleted), never read
        store.requestAuthorization(toShare: share, read: read) { [weak self] ok, err in
            guard let self = self else { return }
            call.resolve([
                "shown": ok,
                "error": err?.localizedDescription ?? "",
                "canWriteWeight": self.store.authorizationStatus(for: self.bodyMass) == .sharingAuthorized,
                "canWriteWorkouts": self.store.authorizationStatus(for: HKObjectType.workoutType()) == .sharingAuthorized
            ])
        }
    }

    // Bodyweight from everything except this app (our own weigh-ins come back as POWALIFTA's).
    @objc func readWeights(_ call: CAPPluginCall) {
        let since = Self.parseDate(call.getString("since")) ?? Date().addingTimeInterval(-60 * 86400)
        let pred = HKQuery.predicateForSamples(withStart: since, end: Date(), options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: true)
        let q = HKSampleQuery(sampleType: bodyMass, predicate: pred, limit: 1000, sortDescriptors: [sort]) { _, samples, err in
            if let err = err { call.reject(Self.code(err), nil, err); return }
            let mine = Bundle.main.bundleIdentifier ?? ""
            let out: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).compactMap { s in
                if s.sourceRevision.source.bundleIdentifier == mine { return nil }
                return [
                    "uuid": s.uuid.uuidString,
                    "kg": s.quantity.doubleValue(for: .gramUnit(with: .kilo)),
                    "date": Self.iso(s.startDate),
                    "day": Self.day(s.startDate),
                    "source": s.sourceRevision.source.name
                ]
            }
            call.resolve(["samples": out])
        }
        store.execute(q)
    }

    @objc func writeWeight(_ call: CAPPluginCall) {
        guard let kg = call.getDouble("kg"), kg > 0, kg < 700,
              let id = call.getString("id"), !id.isEmpty,
              let date = Self.parseDate(call.getString("date")) else { call.reject("bad_args"); return }
        let meta: [String: Any] = [
            HKMetadataKeySyncIdentifier: "powa-bw-" + id,
            HKMetadataKeySyncVersion: NSNumber(value: Int(Date().timeIntervalSince1970 * 1000))
        ]
        let sample = HKQuantitySample(type: bodyMass, quantity: HKQuantity(unit: .gramUnit(with: .kilo), doubleValue: kg), start: date, end: date, metadata: meta)
        store.save(sample) { ok, err in
            if ok { call.resolve(["ok": true]) } else { call.reject("write_failed", nil, err) }
        }
    }

    @objc func deleteWeight(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("bad_args"); return }
        let pred = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: ["powa-bw-" + id])
        store.deleteObjects(of: bodyMass, predicate: pred) { ok, n, err in
            if ok { call.resolve(["deleted": n]) } else { call.reject("delete_failed", nil, err) }
        }
    }

    // A finished session as a traditional strength training workout. Saving the same id again
    // replaces it (a newer version), so finish → undo → finish never makes two.
    @objc func saveWorkout(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty,
              let start = Self.parseDate(call.getString("start")),
              let end = Self.parseDate(call.getString("end")), end > start else { call.reject("bad_args"); return }
        var meta: [String: Any] = [
            HKMetadataKeySyncIdentifier: "powa-session-" + id,
            HKMetadataKeySyncVersion: NSNumber(value: Int(Date().timeIntervalSince1970 * 1000)),
            HKMetadataKeyIndoorWorkout: NSNumber(value: true)
        ]
        if let title = call.getString("title"), !title.isEmpty { meta["POWALIFTA session"] = String(title.prefix(80)) }
        if let sets = call.getInt("sets") { meta["Sets"] = NSNumber(value: sets) }
        if let kg = call.getDouble("totalKg") { meta["Total lifted (kg)"] = NSNumber(value: (kg * 10).rounded() / 10) }
        if let summary = call.getString("summary"), !summary.isEmpty { meta["Lifts"] = String(summary.prefix(400)) }
        let workout = HKWorkout(activityType: .traditionalStrengthTraining, start: start, end: end,
                                duration: end.timeIntervalSince(start), totalEnergyBurned: nil, totalDistance: nil, metadata: meta)
        store.save(workout) { ok, err in
            if ok { call.resolve(["ok": true]) } else { call.reject("write_failed", nil, err) }
        }
    }

    @objc func deleteWorkout(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), !id.isEmpty else { call.reject("bad_args"); return }
        let pred = HKQuery.predicateForObjects(withMetadataKey: HKMetadataKeySyncIdentifier, allowedValues: ["powa-session-" + id])
        store.deleteObjects(of: HKObjectType.workoutType(), predicate: pred) { ok, n, err in
            if ok { call.resolve(["deleted": n]) } else { call.reject("delete_failed", nil, err) }
        }
    }

    // Minutes asleep per night for the last `nights` nights (0 = last night: 18:00 the evening
    // before to 14:00 that day). Overlapping samples (a watch and a phone) count once; a night with
    // no "asleep" samples falls back to time in bed.
    @objc func readSleep(_ call: CAPPluginCall) {
        let nights = max(1, min(30, call.getInt("nights") ?? 1))
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        guard let from = cal.date(byAdding: .hour, value: -6 - 24 * (nights - 1), to: today) else { call.reject("bad_args"); return }
        let pred = HKQuery.predicateForSamples(withStart: from, end: Date(), options: [])
        let q = HKSampleQuery(sampleType: sleepType, predicate: pred, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, err in
            if let err = err { call.reject(Self.code(err), nil, err); return }
            let all = samples as? [HKCategorySample] ?? []
            var out: [[String: Any]] = []
            for i in 0..<nights {
                guard let morning = cal.date(byAdding: .day, value: -i, to: today),
                      let wStart = cal.date(byAdding: .hour, value: -6, to: morning),
                      let wEnd = cal.date(byAdding: .hour, value: 14, to: morning) else { continue }
                var asleep: [(Date, Date)] = [], inBed: [(Date, Date)] = []
                for s in all where s.endDate > wStart && s.startDate < wEnd {
                    let span = (max(s.startDate, wStart), min(s.endDate, wEnd))
                    if Self.isAsleep(s.value) { asleep.append(span) }
                    else if s.value == HKCategoryValueSleepAnalysis.inBed.rawValue { inBed.append(span) }
                }
                let mins = Self.mergedMinutes(asleep.isEmpty ? inBed : asleep)
                out.append(["night": Self.day(morning), "minutes": mins, "inBedOnly": asleep.isEmpty && !inBed.isEmpty])
            }
            call.resolve(["nights": out])
        }
        store.execute(q)
    }

    private static func isAsleep(_ v: Int) -> Bool {
        if #available(iOS 16.0, *) {
            return HKCategoryValueSleepAnalysis.allAsleepValues.map { $0.rawValue }.contains(v)
        }
        return v == HKCategoryValueSleepAnalysis.asleep.rawValue
    }
    private static func mergedMinutes(_ spans: [(Date, Date)]) -> Int {
        let sorted = spans.filter { $0.1 > $0.0 }.sorted { $0.0 < $1.0 }
        var total: TimeInterval = 0
        var cur: (Date, Date)? = nil
        for s in sorted {
            if let c = cur, s.0 <= c.1 { cur = (c.0, max(c.1, s.1)) }
            else { if let c = cur { total += c.1.timeIntervalSince(c.0) }; cur = s }
        }
        if let c = cur { total += c.1.timeIntervalSince(c.0) }
        return Int((total / 60).rounded())
    }

    // Resting heart rate samples, newest first.
    @objc func readRestingHeartRate(_ call: CAPPluginCall) {
        let days = max(1, min(60, call.getInt("days") ?? 14))
        let from = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let pred = HKQuery.predicateForSamples(withStart: from, end: Date(), options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let q = HKSampleQuery(sampleType: restingHR, predicate: pred, limit: 200, sortDescriptors: [sort]) { _, samples, err in
            if let err = err { call.reject(Self.code(err), nil, err); return }
            let bpm = HKUnit.count().unitDivided(by: .minute())
            let out: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).map {
                ["bpm": ($0.quantity.doubleValue(for: bpm)).rounded(), "date": Self.iso($0.startDate), "day": Self.day($0.startDate)]
            }
            call.resolve(["samples": out])
        }
        store.execute(q)
    }

    // Heart rate variability (SDNN, ms), newest first. Only a Watch (or another wearable writing to
    // Health) records it, and sparsely: an iPhone alone has none, and the app then shows nothing.
    @objc func readHRV(_ call: CAPPluginCall) {
        let days = max(1, min(60, call.getInt("days") ?? 35))
        let from = Calendar.current.date(byAdding: .day, value: -days, to: Date()) ?? Date()
        let pred = HKQuery.predicateForSamples(withStart: from, end: Date(), options: [])
        let sort = NSSortDescriptor(key: HKSampleSortIdentifierStartDate, ascending: false)
        let q = HKSampleQuery(sampleType: hrvType, predicate: pred, limit: 500, sortDescriptors: [sort]) { _, samples, err in
            if let err = err { call.reject(Self.code(err), nil, err); return }
            let ms = HKUnit.secondUnit(with: .milli)
            let out: [[String: Any]] = (samples as? [HKQuantitySample] ?? []).map {
                ["ms": ($0.quantity.doubleValue(for: ms) * 10).rounded() / 10, "date": Self.iso($0.startDate), "day": Self.day($0.startDate)]
            }
            call.resolve(["samples": out])
        }
        store.execute(q)
    }

    // Calories and protein eaten per day (Health's own daily sums, so two apps logging the same
    // meal aren't double-counted beyond what Health itself shows). A day with nothing logged is
    // left out, never sent as 0: the app reads it as "not logged".
    @objc func readNutrition(_ call: CAPPluginCall) {
        let days = max(1, min(60, call.getInt("days") ?? 14))
        let cal = Calendar.current
        let today = cal.startOfDay(for: Date())
        guard let from = cal.date(byAdding: .day, value: -(days - 1), to: today) else { call.reject("bad_args"); return }
        let group = DispatchGroup()
        var kcal: [String: Double] = [:], protein: [String: Double] = [:]
        var failed: Error? = nil
        let lock = NSLock()
        func sums(_ type: HKQuantityType, _ unit: HKUnit, _ put: @escaping (String, Double) -> Void) {
            group.enter()
            let q = HKStatisticsCollectionQuery(quantityType: type, quantitySamplePredicate: HKQuery.predicateForSamples(withStart: from, end: Date(), options: []),
                                                options: .cumulativeSum, anchorDate: today, intervalComponents: DateComponents(day: 1))
            q.initialResultsHandler = { _, results, err in
                if let err = err { lock.lock(); failed = err; lock.unlock() }
                results?.enumerateStatistics(from: from, to: Date()) { st, _ in
                    if let sum = st.sumQuantity() { lock.lock(); put(Self.day(st.startDate), sum.doubleValue(for: unit)); lock.unlock() }
                }
                group.leave()
            }
            store.execute(q)
        }
        sums(energyType, .kilocalorie()) { d, v in kcal[d] = v }
        sums(proteinType, .gram()) { d, v in protein[d] = v }
        group.notify(queue: .global()) {
            if let err = failed, kcal.isEmpty && protein.isEmpty { call.reject(Self.code(err), nil, err); return }
            let keys = Set(kcal.keys).union(protein.keys).sorted(by: >)
            let out: [[String: Any]] = keys.map { d in
                var row: [String: Any] = ["day": d]
                if let k = kcal[d] { row["kcal"] = k.rounded() }
                if let p = protein[d] { row["proteinG"] = (p * 10).rounded() / 10 }
                return row
            }
            call.resolve(["days": out])
        }
    }
}
