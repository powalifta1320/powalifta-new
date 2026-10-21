// Renderer-only stand-in for the Powa colours (RestLiveActivity.swift needs ActivityKit, iOS only).
import SwiftUI
enum Powa {
    static let red = Color(red: 1.0, green: 0.176, blue: 0.247)
    static let bg = Color(red: 0.043, green: 0.043, blue: 0.047)
    static let dim = Color.white.opacity(0.55)
}
