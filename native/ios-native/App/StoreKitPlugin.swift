//
//  StoreKitPlugin.swift
//  POWALIFTA — Capacitor plugin exposing StoreKit 2 coach subscriptions to the web app.
//
//  JS name: "PowaIAP". The web app calls, feature-detected:
//      window.Capacitor.Plugins.PowaIAP.getProducts()
//      window.Capacitor.Plugins.PowaIAP.purchase({ productId, appAccountToken })
//      window.Capacitor.Plugins.PowaIAP.restore()
//      window.Capacitor.Plugins.PowaIAP.getEntitlements()
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
//    entitlement lives on Apple's side (currentEntitlements), so if the server
//    sync fails the app just re-syncs on next launch — nothing is lost.
//  - Renewals/upgrades arrive via Transaction.updates while the app runs; we
//    notify the webview ("iapTransaction" event) so it can re-sync.
//
//  Registered via CAPBridgedPlugin (Capacitor 6) — no ObjC .m file needed.
//  Injected into the Xcode project by native/scripts/inject-iap.rb (cap sync
//  regenerates the project config and would otherwise drop the registration).
//
import Foundation
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
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise)
    ]

    // The three coach auto-renewable subscriptions (App Store Connect product ids).
    // Keep in sync with PRODUCT_TIERS in supabase/functions/apple-iap/index.ts.
    static let productIds = [
        "com.powalifta.app.coach.basic",
        "com.powalifta.app.coach.pro",
        "com.powalifta.app.coach.premium"
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
                    self?.notifyListeners("iapTransaction", data: ["jws": jws])
                }
            }
        }
    }

    deinit { updatesTask?.cancel() }

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 15.0, *) { call.resolve(["supported": true]) }
        else { call.resolve(["supported": false]) }
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        Task {
            do {
                let products = try await Product.products(for: Self.productIds)
                let out: [[String: Any]] = products.map { p in
                    [
                        "id": p.id,
                        "displayName": p.displayName,
                        "displayPrice": p.displayPrice,   // localized, e.g. "$49.99"
                        "description": p.description
                    ]
                }
                call.resolve(["products": out])
            } catch {
                call.reject("products_failed: \(error.localizedDescription)")
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        guard let productId = call.getString("productId") else {
            call.reject("productId required"); return
        }
        let token = call.getString("appAccountToken").flatMap { UUID(uuidString: $0) }
        Task {
            do {
                guard let product = try await Product.products(for: [productId]).first else {
                    call.reject("unknown_product"); return
                }
                var options: Set<Product.PurchaseOption> = []
                if let token = token { options.insert(.appAccountToken(token)) }
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
    @objc func restore(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        Task {
            try? await AppStore.sync()
            await self.collectEntitlements(call)
        }
    }

    @objc func getEntitlements(_ call: CAPPluginCall) {
        guard #available(iOS 15.0, *) else { call.reject("unavailable"); return }
        Task { await self.collectEntitlements(call) }
    }

    @available(iOS 15.0, *)
    private func collectEntitlements(_ call: CAPPluginCall) async {
        var out: [[String: Any]] = []
        for await entitlement in Transaction.currentEntitlements {
            guard case .verified(let txn) = entitlement else { continue }
            guard Self.productIds.contains(txn.productID) else { continue }
            out.append(["productId": txn.productID, "jws": entitlement.jwsRepresentation])
        }
        call.resolve(["entitlements": out])
    }
}
