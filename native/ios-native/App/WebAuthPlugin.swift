import Foundation
import UIKit
import Capacitor
import AuthenticationServices

// Continue with Google in the iPhone app (1.5), without Google's SDK. JS name "PowaWebAuth".
//
// 1.4 dropped @codetrix-studio/capacitor-google-auth: its Google SDK (6.2.4) has no privacy manifest
// (Apple refused the upload, ITMS-91061), and every Google SDK version that has one declares phone
// number, coarse location and analytics data the app doesn't collect. So Google signs in the way the
// website does, through Supabase's own web sign-in, shown in the system's sign-in sheet
// (ASWebAuthenticationSession: Safari's cookies, so an iPhone already signed in to Google is one tap,
// and Google accepts it, unlike a web view). No Google code ships and App Privacy stays as it is.
//
//   start({ url, callbackScheme })   url: Supabase's https …/auth/v1/authorize address (db.js
//                                    oauthSignInUrl); callbackScheme: "powalifta"
//     → { url }              the address the sheet came back to: powalifta://auth-callback#access_token=…
//                            (social-auth.js reads the session from it and hands it to DB.setSession)
//     → { cancelled: true }  the person closed the sheet, or said no to "POWALIFTA wants to use … to sign in"
//     rejects with a message  the sheet couldn't open (no window, already open, a bad address)
//
// The callback never reaches the WebView's address bar: the session hands it to this plugin only, so
// db.js's guard against sessions in links (refuseUrlSession) never sees it. The scheme doesn't need to be
// in Info.plist for this (the session catches it), though powalifta:// is there for widgets and invite links.
//
// The session is kept (strongly) until it completes, as is the call. One sign-in at a time. Every UIKit and
// session touch is on the main queue. Injected by native/scripts/inject-web-auth.rb (run by inject-all.sh).
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WebAuthPlugin"
    public let jsName = "PowaWebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?
    private var pending: CAPPluginCall?
    private var anchor: UIWindow?

    @objc func start(_ call: CAPPluginCall) {
        // The sheet only opens http(s) pages; sign-in pages are https.
        guard let raw = call.getString("url"), let url = URL(string: raw),
              url.scheme?.lowercased() == "https", let host = url.host, !host.isEmpty else {
            call.reject("Missing or invalid sign-in address", "bad_args")
            return
        }
        let scheme = (call.getString("callbackScheme") ?? "powalifta").lowercased()
        guard scheme.range(of: "^[a-z][a-z0-9+.-]*$", options: .regularExpression) != nil,
              scheme != "http", scheme != "https" else {
            call.reject("Invalid callback scheme", "bad_args")
            return
        }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.session != nil || self.pending != nil {
                call.reject("A sign-in is already open", "busy")
                return
            }
            guard let window = self.bridge?.webView?.window ?? self.bridge?.viewController?.view.window else {
                call.reject("No screen to show the sign-in on", "no_view")
                return
            }
            let done: ASWebAuthenticationSession.CompletionHandler = { [weak self] callbackURL, error in
                DispatchQueue.main.async { self?.finish(callbackURL, error) }
            }
            let s: ASWebAuthenticationSession
            if #available(iOS 17.4, *) {
                s = ASWebAuthenticationSession(url: url, callback: .customScheme(scheme), completionHandler: done)
            } else {
                s = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme, completionHandler: done)
            }
            s.presentationContextProvider = self
            // Share Safari's cookies: an iPhone already signed in to Google picks the account in one tap.
            // iOS asks first ("POWALIFTA" wants to use "supabase.co" to sign in).
            s.prefersEphemeralWebBrowserSession = false
            self.anchor = window
            self.session = s
            self.pending = call
            if !s.canStart || !s.start() {
                self.session = nil
                self.pending = nil
                self.anchor = nil
                call.reject("Couldn't open the sign-in", "start_failed")
            }
        }
    }

    // Main queue. Resolves (or rejects) the call once and lets the session go.
    private func finish(_ callbackURL: URL?, _ error: Error?) {
        let call = pending
        pending = nil
        session = nil
        anchor = nil
        guard let call = call else { return }
        if let url = callbackURL {
            call.resolve(["url": url.absoluteString])
            return
        }
        if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin {
            call.resolve(["cancelled": true])
            return
        }
        call.reject(error?.localizedDescription ?? "The sign-in didn't finish", "auth_failed", error)
    }
}

// In an extension, so only this method takes the protocol's main-actor isolation (the plugin class stays
// as Capacitor expects). The sheet asks on the main queue; the window was found when the session started.
extension WebAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        if let w = anchor ?? bridge?.webView?.window { return w }
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        if let w = scenes.flatMap({ $0.windows }).first(where: { $0.isKeyWindow }) ?? scenes.first?.windows.first { return w }
        return ASPresentationAnchor()   // not reached: start() found a window before opening the sheet
    }
}
