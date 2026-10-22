import Foundation
import Capacitor
import AVFoundation
import UIKit

// Form-check clips for POWALIFTA (video review, M6). JS name "PowaVideo".
//
// iPhones film HEVC by default, and Chrome on Windows (and Firefox) shows HEVC as a black box,
// so a coach reviewing on a Windows laptop saw nothing. In the app the lifter films or picks the
// clip here instead of through the web file input, and it is exported to an H.264 MP4 before the
// web layer uploads it (video-review.js attachNativePicker → the usual DB.uploadFormCheck).
//
//   pickVideo({ source: "camera" | "library", quality: "standard" | "high" })
//     → { cancelled: true } or { path, webPath, name, size, duration, width, height, codec, transcoded }
//   exportH264({ path, quality })      the same export for a clip the app already has on disk
//   discard({ path })                  deletes an exported clip once it is uploaded
//   event "exportProgress" { progress: 0…1 } while a clip is being converted
//
// A clip that is already H.264 is re-wrapped as MP4 without re-encoding (fast, no quality loss).
// "standard" caps the picture at 720p (a 60 s set is about 25–40 MB, well under the 100 MB
// upload limit); "high" at 1080p. Exports land in tmp/powa-form-checks/ and are swept after a day.
//
// Concurrency: the app target builds in Swift 5 mode with iOS 13 as the floor, so this uses
// AVAssetExportSession's completion handler (not the iOS 18 async export) and hops every
// Capacitor call and UIKit touch back to the main queue. One export at a time.
@objc(VideoExportPlugin)
public class VideoExportPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public let identifier = "VideoExportPlugin"
    public let jsName = "PowaVideo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "pickVideo", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exportH264", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise)
    ]

    private var pickCall: CAPPluginCall?
    private var pickQuality = "standard"
    private var session: AVAssetExportSession?
    private var progressTimer: Timer?
    private let work = DispatchQueue(label: "com.powalifta.video-export", qos: .userInitiated)

    private static var outDir: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("powa-form-checks", isDirectory: true)
    }

    // ---- pick (camera or library) --------------------------------------------------------------
    @objc func pickVideo(_ call: CAPPluginCall) {
        let source = call.getString("source") ?? "library"
        let quality = call.getString("quality") ?? "standard"
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.pickCall != nil || self.session != nil { call.reject("A clip is already being prepared", "busy"); return }
            guard let host = self.bridge?.viewController else { call.reject("No screen to show the picker on", "no_view"); return }
            let picker = UIImagePickerController()
            if source == "camera" {
                guard UIImagePickerController.isSourceTypeAvailable(.camera) else { call.reject("This device has no camera", "no_camera"); return }
                picker.sourceType = .camera
                picker.mediaTypes = ["public.movie"]
                picker.cameraCaptureMode = .video
                picker.videoQuality = .typeHigh
                picker.videoMaximumDuration = 180
            } else {
                picker.sourceType = .photoLibrary
                picker.mediaTypes = ["public.movie"]
                // Hand over the original file: the export below converts it once, instead of the
                // picker transcoding it first and the export a second time.
                picker.videoExportPreset = AVAssetExportPresetPassthrough
                if UIDevice.current.userInterfaceIdiom == .pad {
                    picker.modalPresentationStyle = .popover
                    picker.popoverPresentationController?.sourceView = host.view
                    picker.popoverPresentationController?.sourceRect = CGRect(x: host.view.bounds.midX, y: host.view.bounds.midY, width: 1, height: 1)
                    picker.popoverPresentationController?.permittedArrowDirections = []
                }
            }
            picker.delegate = self
            self.pickCall = call
            self.pickQuality = quality
            host.present(picker, animated: true)
        }
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        let call = pickCall
        pickCall = nil
        call?.resolve(["cancelled": true])
    }

    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        guard let call = pickCall else { return }
        pickCall = nil
        guard let url = info[.mediaURL] as? URL else { call.reject("That wasn't a video", "not_video"); return }
        // The picker's file is deleted when the picker goes away: keep our own copy first.
        let staged = Self.outDir.appendingPathComponent("src-" + UUID().uuidString + "." + (url.pathExtension.isEmpty ? "mov" : url.pathExtension))
        do {
            try Self.prepareDir()
            try FileManager.default.copyItem(at: url, to: staged)
        } catch {
            call.reject("Couldn't read that clip", "read_failed", error)
            return
        }
        export(staged, quality: pickQuality, call: call, deleteSource: true)
    }

    // ---- export a clip already on disk ---------------------------------------------------------
    @objc func exportH264(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), !path.isEmpty else { call.reject("Missing path", "bad_args"); return }
        let url = path.hasPrefix("file://") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path)
        guard FileManager.default.fileExists(atPath: url.path) else { call.reject("No clip at that path", "not_found"); return }
        let quality = call.getString("quality") ?? "standard"
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            if self.session != nil { call.reject("A clip is already being prepared", "busy"); return }
            self.export(url, quality: quality, call: call, deleteSource: false)
        }
    }

    @objc func discard(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else { call.resolve(["removed": false]); return }
        let url = path.hasPrefix("file://") ? (URL(string: path) ?? URL(fileURLWithPath: path)) : URL(fileURLWithPath: path)
        // only ever our own exports: a file sitting directly in outDir (not a sibling folder that
        // shares the prefix, not a subfolder, not "..")
        let parent = url.standardizedFileURL.resolvingSymlinksInPath().deletingLastPathComponent().path
        let ours = Self.outDir.standardizedFileURL.resolvingSymlinksInPath().path
        guard parent == ours, !url.lastPathComponent.isEmpty, url.lastPathComponent != ".." else { call.resolve(["removed": false]); return }
        let removed = (try? FileManager.default.removeItem(at: url)) != nil
        call.resolve(["removed": removed])
    }

    // ---- the export ----------------------------------------------------------------------------
    // Called on the main queue. Reads the clip's tracks off the main queue, then runs the session.
    private func export(_ src: URL, quality: String, call: CAPPluginCall, deleteSource: Bool) {
        work.async { [weak self] in
            guard let self = self else { return }
            Self.sweepOld()
            let asset = AVURLAsset(url: src, options: [AVURLAssetPreferPreciseDurationAndTimingKey: true])
            guard let track = asset.tracks(withMediaType: .video).first else {
                DispatchQueue.main.async {
                    if deleteSource { try? FileManager.default.removeItem(at: src) }
                    call.reject("That clip has no video in it", "no_video")
                }
                return
            }
            let codec = Self.codec(of: track)
            let natural = track.naturalSize.applying(track.preferredTransform)
            let w = abs(natural.width), h = abs(natural.height)
            let longEdge = max(w, h)
            let cap: CGFloat = quality == "high" ? 1920 : 1280
            let duration = CMTimeGetSeconds(asset.duration)
            // Already H.264 and no bigger than asked: re-wrap only. Anything else: encode H.264.
            let rewrap = codec == "h264" && longEdge <= cap + 1
            let preset = rewrap ? AVAssetExportPresetPassthrough
                : (quality == "high" ? AVAssetExportPreset1920x1080 : AVAssetExportPreset1280x720)
            DispatchQueue.main.async {
                self.run(asset: asset, src: src, preset: preset, fallback: rewrap ? (quality == "high" ? AVAssetExportPreset1920x1080 : AVAssetExportPreset1280x720) : nil,
                         codec: codec, duration: duration, call: call, deleteSource: deleteSource)
            }
        }
    }

    private func run(asset: AVURLAsset, src: URL, preset: String, fallback: String?, codec: String,
                     duration: Double, call: CAPPluginCall, deleteSource: Bool) {
        let out = Self.outDir.appendingPathComponent("form-check-" + UUID().uuidString + ".mp4")
        guard let s = AVAssetExportSession(asset: asset, presetName: preset), s.supportedFileTypes.contains(.mp4) else {
            if let fb = fallback { run(asset: asset, src: src, preset: fb, fallback: nil, codec: codec, duration: duration, call: call, deleteSource: deleteSource); return }
            if deleteSource { try? FileManager.default.removeItem(at: src) }
            call.reject("This clip can't be converted", "unsupported")
            return
        }
        s.outputURL = out
        s.outputFileType = .mp4
        s.shouldOptimizeForNetworkUse = true   // moov atom first: the coach's player starts before the download ends
        session = s
        notifyListeners("exportProgress", data: ["progress": 0])
        progressTimer?.invalidate()
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self, weak s] _ in
            guard let self = self, let s = s else { return }
            self.notifyListeners("exportProgress", data: ["progress": Double(s.progress)])
        }
        s.exportAsynchronously { [weak self] in
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.progressTimer?.invalidate()
                self.progressTimer = nil
                self.session = nil
                switch s.status {
                case .completed:
                    if deleteSource { try? FileManager.default.removeItem(at: src) }
                    self.notifyListeners("exportProgress", data: ["progress": 1])
                    self.resolveExport(out, sourceCodec: codec, transcoded: preset != AVAssetExportPresetPassthrough, duration: duration, call: call)
                case .cancelled:
                    try? FileManager.default.removeItem(at: out)
                    if deleteSource { try? FileManager.default.removeItem(at: src) }
                    call.resolve(["cancelled": true])
                default:
                    try? FileManager.default.removeItem(at: out)
                    // A re-wrap can fail on an unusual audio track (e.g. PCM in a .mov): encode instead.
                    if let fb = fallback {
                        self.run(asset: asset, src: src, preset: fb, fallback: nil, codec: codec, duration: duration, call: call, deleteSource: deleteSource)
                        return
                    }
                    if deleteSource { try? FileManager.default.removeItem(at: src) }
                    call.reject("Couldn't convert the clip" + (s.error.map { ": " + $0.localizedDescription } ?? ""), "export_failed", s.error)
                }
            }
        }
    }

    private func resolveExport(_ out: URL, sourceCodec: String, transcoded: Bool, duration: Double, call: CAPPluginCall) {
        let size = ((try? FileManager.default.attributesOfItem(atPath: out.path))?[.size] as? NSNumber)?.intValue ?? 0
        let asset = AVURLAsset(url: out)
        var w: CGFloat = 0, h: CGFloat = 0
        if let t = asset.tracks(withMediaType: .video).first {
            let n = t.naturalSize.applying(t.preferredTransform)
            w = abs(n.width); h = abs(n.height)
        }
        var res: [String: Any] = [
            "path": out.path,
            "name": "form-check.mp4",
            "size": size,
            "duration": duration.isFinite ? duration : 0,
            "width": Int(w.rounded()),
            "height": Int(h.rounded()),
            "codec": "h264",
            "sourceCodec": sourceCodec,
            "transcoded": transcoded
        ]
        if let web = bridge?.portablePath(fromLocalURL: out) { res["webPath"] = web.absoluteString }
        call.resolve(res)
    }

    // ---- helpers -------------------------------------------------------------------------------
    private static func codec(of track: AVAssetTrack) -> String {
        guard let first = track.formatDescriptions.first else { return "unknown" }
        let desc = first as! CMFormatDescription   // formatDescriptions is [CMFormatDescription] bridged as [Any]
        switch CMFormatDescriptionGetMediaSubType(desc) {
        case kCMVideoCodecType_H264: return "h264"
        case kCMVideoCodecType_HEVC: return "hevc"
        default: return "other"
        }
    }

    private static func prepareDir() throws {
        try FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    }

    // Exports the web layer never discarded (the app was closed mid-upload): gone after a day.
    private static func sweepOld() {
        try? prepareDir()
        let fm = FileManager.default
        guard let items = try? fm.contentsOfDirectory(at: outDir, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let cutoff = Date().addingTimeInterval(-86_400)
        for u in items {
            let m = (try? u.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? Date()
            if m < cutoff { try? fm.removeItem(at: u) }
        }
    }
}
