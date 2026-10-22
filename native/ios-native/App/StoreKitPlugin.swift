//
//  StoreKitPlugin.swift
//  POWALIFTA — Capacitor plugin exposing StoreKit 2 coach subscriptions to the web app.
//
//  JS name: "PowaIAP". The web app calls, feature-detected:
//      window.Capacitor.Plugins.PowaIAP.getProducts()
//      window.Capacitor.Plugins.PowaIAP.purchase({ productId, appAccountToken })
//      window.Capacitor.Plugins.PowaIAP.restore()
//      window.Capacitor.Plugins.PowaIAP.getEntitlements()
//      window.Capacitor.Plugins.PowaIAP.manageSubscriptions()
//
//  Design notes:
//  - StoreKit 2 only (iOS 15+). On anything older every method rejects with
//    "unavailable" and the web layer keeps the tier-blind UI (no paywall).
//  - `purchase` accepts the caller's Supabase user id as appAccountToken (a UUID).
//    Apple embeds it in the signed transaction, so the server can verify that the
//    JWS being redeemed belongs to the authenticated caller — a replayed JWS from
//    another account fails the check server-side.
//  - Every success path returns the raw `jwsRepresentation` (Apple-signed JWS).
//    The web layer POSTs it to the `apple-iap` edge function, which verifies the
//    certificate chain + signature server-side and writes subscription_tier.
//    The client NEVER writes tier itself (profiles privilege guard blocks it anyway).
//  - Transactions are finished immediately after we hand the JWS to JS: the
//    entitlement lives on Apple's side (currentEntitlements), and the web app
//    syncs the highest current entitlement on every launch and resume
//    (app.js syncAppleEntitlements), so a failed server sync is retried: nothing is lost.
//  - Renewals/upgrades arrive via Transaction.updates while the app runs; we
//    notify the webview ("iapTransaction" event) so it can re-sync. Those that land
//    during launch, before the page is listening, are retained until it is.
//
//  Registered via CAPBridgedPlugin (Capacitor 6) — no ObjC .m file needed.
//  Injected into the Xcode project by native/scripts/inject-iap.rb (cap sync
//  regenerates the project config and would otherwise drop the registration).
//
import Foundation
import UIKit
import Capacitor
import StoreKit

@objc(StoreKitPlugin)
public class StoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "StoreKitPlugin"
    public let jsName = "PowaIAP"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restore", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "manageSubscriptions", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestReview", returnType: CAPPluginReturnPromise)
    ]

    // The coach auto-renewable subscriptions (App Store Connect product ids): each plan monthly
    // and yearly, all in the "Coach Plans" group. Yearly ones that don't exist in App Store
    // Connect yet are simply not returned. Keep in sync with PRODUCT_TIERS in
    // supabase/functions/apple-iap + apple-notifications and IAP_TIER_META in app.js.
    static let productIds = [
        "com.powalifta.app.coach.basic",
        "com.powalifta.app.coach.pro",
        "com.powalifta.app.coach.premium",
        "com.powalifta.app.coach.basic.yearly",
        "com.powalifta.app.coach.pro.yearly",
        "com.powalifta.app.coach.premium.yearly"
    ]

    private var updatesTask: Task<Void, Never>?

    override public func load() {
        // Listen for renewals / Ask-to-Buy approvals / upgrades that finish while
        // the app is running, and let the web layer know so it re-syncs the tier.
        if #available(iOS 15.0, *) {
            updatesTask = Task.detached { [weak self] in
                for await update in Transaction.updates {
                    guard case .verified(let txn) = update else { continue }
                    let jws = update.jwsRepresentation
                    await txn.finish()
                    self?.notifyListeners("iapTransaction", data: ["jws": jws], retainUntilConsumed: true)
                }
            }
        }
    }

    deinit { updatesTask?.cancel() }

    // Ask for an App Store rating (app.js maybeAskForRating calls this after a PR
    // or a plate milestone, at most once every four months). iOS decides whether
    // the prompt actually shows: three times a year at most, never in TestFlight.
    @objc func requestReview(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if #available(iOS 14.0, *),
               let scene = UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene {
                SKStoreReviewController.requestReview(in: scene)
            } else {
                SKStoreReviewController.requestReview()
            }
            call.resolve()
        }
    }

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) { call.resolve(["supported": true]) }
        else { call.resolve(["supported": false]) }
    }

    // Resolves with the products plus what the paywall needs to tell an empty answer apart
    // from a failed one: the ids asked for and returned, the store environment (Production,
    // Sandbox or Xcode), the storefront country and whether this iPhone allows purchases.
    // A failed request resolves too, with `error` set, so the web layer can say which it was.
    // Products are asked for FIRST: the environment (AppTransaction.shared, which can put up an
    // Apple ID sheet on development and TestFlight builds) and the storefront are only worked out
    // when the answer is empty or the request throws, which is the only time the paywall shows
    // them (app.js iapDiagnosticText). A good answer carries them empty.
    @objc func getProducts(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        Task {
            var info: [String: Any] = [
                "requested": Self.productIds,
                "canMakePayments": AppStore.canMakePayments,
                "storefront": "",
                "environment": ""
            ]
            var failure: String? = nil
            var products: [Product] = []
            do {
                products = try await Product.products(for: Self.productIds)
            } catch {
                failure = "products_failed: \(error.localizedDescription)"
            }
            info["products"] = products.map { p -> [String: Any] in
                [
                    "id": p.id,
                    "displayName": p.displayName,
                    "displayPrice": p.displayPrice,   // localized, e.g. "$49.99"
                    "description": p.description,
                    "price": NSDecimalNumber(decimal: p.price).doubleValue,   // for "save 17%"
                    "period": p.subscription?.subscriptionPeriod.unit == .year ? "year" : "month"
                ]
            }
            info["returned"] = products.map { $0.id }
            if products.isEmpty {
                info["storefront"] = await Storefront.current?.countryCode ?? ""
                info["environment"] = await Self.storeEnvironment()
            }
            if let failure = failure { info["error"] = failure }
            call.resolve(info)
        }
    }

    // "Production", "Sandbox" (TestFlight, a sandbox tester) or "Xcode" (a StoreKit
    // configuration file). Unknown before iOS 16 or when the app transaction isn't there.
    @available(iOS 15.0, *)
    static func storeEnvironment() async -> String {
        guard #available(iOS 16.0, *) else { return "unknown" }
        if let result = try? await AppTransaction.shared, case .verified(let app) = result {
            return app.environment.rawValue
        }
        return "unknown"
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        guard let productId = call.getString("productId") else {
            call.reject("productId required"); return
        }
        // The token binds the receipt to THIS account server-side; without it the buyer would
        // pay and get no plan. And only our three products are ever bought here.
        guard let token = call.getString("appAccountToken").flatMap({ UUID(uuidString: $0) }) else {
            call.reject("appAccountToken required"); return
        }
        guard Self.productIds.contains(productId) else { call.reject("unknown_product"); return }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("unknown_product"); return
                }
                var options: Set<Product.PurchaseOption> = []
                options.insert(.appAccountToken(token))
                let result = try await product.purchase(options: options)
                switch result {
                case .success(let verification):
                    guard case .verified(let txn) = verification else {
                        call.reject("unverified"); return
                    }
                    let jws = verification.jwsRepresentation
                    await txn.finish()
                    call.resolve(["state": "purchased", "jws": jws, "productId": productId])
                case .userCancelled:
                    call.resolve(["state": "cancelled"])
                case .pending:
                    // Ask to Buy — completes later via Transaction.updates.
                    call.resolve(["state": "pending"])
                @unknown default:
                    call.reject("unknown_state")
                }
            } catch {
                call.reject("purchase_failed: \(error.localizedDescription)")
            }
        }
    }

    // Re-sync with the App Store (required "Restore Purchases" affordance), then
    // return current entitlements exactly like getEntitlements.
    // `synced` is false when the App Store sign-in was cancelled or failed, so the web layer
    // doesn't report "no subscription" for an Apple ID it never reached.
    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        Task {
            var extra: [String: Any] = ["synced": true]
            do {
                try await AppStore.sync()
            } catch StoreKitError.userCancelled {
                extra = ["synced": false, "syncError": "userCancelled"]
            } catch {
                extra = ["synced": false, "syncError": error.localizedDescription]
            }
            await self.collectEntitlements(call, extra: extra)
        }
    }

    @objc func getEntitlements(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        Task { await self.collectEntitlements(call) }
    }

    // Apple's manage-subscriptions sheet, inside the app (iOS 15+): switch or cancel
    // an App Store plan without leaving POWALIFTA. Resolves when the sheet closes; the
    // web layer then re-syncs, and any change also arrives through Transaction.updates.
    @objc func manageSubscriptions(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else {
                call.reject("unavailable")
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve()
            } catch {
                call.reject(error.localizedDescription)
            }
        }
    }

    @available(iOS 15.0, *)
    private func collectEntitlements(_ call: CAPPluginCall, extra: [String: Any] = [:]) async {
        var out: [[String: Any]] = []
        for await entitlement in Transaction.currentEntitlements {
            guard case .verified(let txn) = entitlement else { continue }
            guard Self.productIds.contains(txn.productID) else { continue }
            out.append(["productId": txn.productID, "jws": entitlement.jwsRepresentation])
        }
        var result = extra
        result["entitlements"] = out
        call.resolve(result)
    }
}
