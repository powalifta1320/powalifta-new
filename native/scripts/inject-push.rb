#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-push.rb — POWALIFTA: push notifications in the iPhone app (2026-10-28)
#
# Turn on (the allow-notifications card, notify.js), You → Notifications and the quiet refresh at
# launch all register with Apple through @capacitor/push-notifications (native-bridge.js
# registerPush). The scaffolded project lacked two things, so Apple's answer never reached the page:
# Turn on waited 8 s and said "Couldn't reach Apple", and no device token was ever saved.
#
#   1. The aps-environment entitlement, merged into the App target's entitlements file
#      ("development"; exporting for TestFlight / the App Store signs it as production), and the
#      Push Notifications capability on the App target, so automatic signing adds Push to the App ID.
#   2. AppDelegate.swift handing Apple's answer to Capacitor. The plugin only fires its
#      'registration' / 'registrationError' events when the app delegate posts them:
#        didRegisterForRemoteNotificationsWithDeviceToken -> .capacitorDidRegisterForRemoteNotifications
#        didFailToRegisterForRemoteNotificationsWithError -> .capacitorDidFailToRegisterForRemoteNotifications
#      `cap add ios` writes an AppDelegate.swift without them; this adds them once, at the end of
#      the AppDelegate class.
#
# Run by inject-all.sh, last. Idempotent: safe to run any number of times. When it can't do its job
# (no entitlements file, no AppDelegate class, a hand-written token method that doesn't tell
# Capacitor) it stops with a reason: an archive without this can't get pushes.

require "fileutils"
begin
  require "xcodeproj"
rescue LoadError
  warn "[inject-push] xcodeproj gem not found. Install with: gem install xcodeproj."
  exit 1
end

HERE      = File.expand_path("..", __dir__)            # native/
SRC       = File.join(HERE, "ios-native")              # committed native sources
IOS       = File.join(HERE, "ios", "App")              # scaffolded Xcode project root
PROJ_PATH = File.join(IOS, "App.xcodeproj")
APP_DIR   = File.join(IOS, "App")
DELEGATE  = File.join(APP_DIR, "AppDelegate.swift")
REG_POST  = ".capacitorDidRegisterForRemoteNotifications"
FAIL_POST = ".capacitorDidFailToRegisterForRemoteNotifications"

abort "[inject-push] no Xcode project at #{PROJ_PATH} — run `npx cap add ios` first." unless Dir.exist?(PROJ_PATH)

project    = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "[inject-push] no 'App' target found."

# ---- 1. aps-environment + the Push Notifications capability -------------------------------
def ent_rel(value)
  value.to_s.sub(%r{\A\$\((SRCROOT|PROJECT_DIR)\)/}, "")
end
app_target.build_configurations.each do |config|
  rel = ent_rel(config.build_settings["CODE_SIGN_ENTITLEMENTS"])
  if rel.empty?
    rel = "App/App.entitlements"
    FileUtils.cp(File.join(SRC, "App", "App.entitlements"), File.join(IOS, rel)) unless File.exist?(File.join(IOS, rel))
    config.build_settings["CODE_SIGN_ENTITLEMENTS"] = rel
  end
  path = File.join(IOS, rel)
  abort "[inject-push] #{config.name}: CODE_SIGN_ENTITLEMENTS points at missing #{rel}; aps-environment NOT added." unless File.exist?(path)
  plist = Xcodeproj::Plist.read_from_path(path)
  env = plist["aps-environment"]
  next if env.is_a?(String) && !env.strip.empty?   # already there (a hand-set "production" stays)
  plist["aps-environment"] = "development"
  Xcodeproj::Plist.write_to_path(plist, path)
end
attrs = project.root_object.attributes["TargetAttributes"] ||= {}
ta    = attrs[app_target.uuid] ||= {}
caps  = ta["SystemCapabilities"] ||= {}
caps["com.apple.Push"] = { "enabled" => "1" }
project.save
puts "[inject-push] aps-environment + the Push Notifications capability on the App target."

# ---- 2. AppDelegate.swift hands Apple's answer to Capacitor ---------------------------------
abort "[inject-push] #{DELEGATE} not found — run `npx cap add ios` first." unless File.exist?(DELEGATE)
swift = File.read(DELEGATE)

# The index of the brace that closes the block opened at `open_idx`, skipping comments and strings.
def block_end(src, open_idx)
  depth = 0
  i = open_idx
  n = src.length
  while i < n
    c = src[i]
    two = src[i, 2]
    if two == "//"
      i = src.index("\n", i) || n
      next
    elsif two == "/*"                                 # Swift block comments nest
      level = 1
      i += 2
      while i < n && level.positive?
        if src[i, 2] == "/*" then level += 1; i += 2
        elsif src[i, 2] == "*/" then level -= 1; i += 2
        else i += 1
        end
      end
      next
    elsif c == '"'
      if src[i, 3] == '"""'
        j = src.index('"""', i + 3) or return nil
        i = j + 3
      else
        i += 1
        i += (src[i] == "\\" ? 2 : 1) while i < n && src[i] != '"' && src[i] != "\n"
        i += 1
      end
      next
    elsif c == "{"
      depth += 1
    elsif c == "}"
      depth -= 1
      return i if depth.zero?
    end
    i += 1
  end
  nil
end

has_reg   = swift.include?("didRegisterForRemoteNotificationsWithDeviceToken")
has_fail  = swift.include?("didFailToRegisterForRemoteNotificationsWithError")
if (has_reg && !swift.include?(REG_POST)) || (has_fail && !swift.include?(FAIL_POST))
  abort "[inject-push] AppDelegate.swift has its own remote-notification methods that don't post " \
        "#{REG_POST} / #{FAIL_POST}. Add those posts by hand (see this script's header); left as it is."
end

if has_reg && has_fail
  puts "[inject-push] AppDelegate.swift already hands Apple's answer to Capacitor."
else
  m = swift.match(/^[ \t]*(?:@\w+[ \t]*\n?[ \t]*)*(?:(?:public|open|final|internal)[ \t]+)*class[ \t]+AppDelegate\b[^{]*\{/)
  abort "[inject-push] no `class AppDelegate` in #{DELEGATE}; nothing patched." unless m
  close = block_end(swift, m.end(0) - 1)
  abort "[inject-push] couldn't find the end of the AppDelegate class in #{DELEGATE}; nothing patched." unless close
  methods = []
  methods << <<~SWIFT.chomp unless has_reg
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: #{REG_POST}, object: deviceToken)
    }
  SWIFT
  methods << <<~SWIFT.chomp unless has_fail
    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: #{FAIL_POST}, object: error)
    }
  SWIFT
  block = "    // POWALIFTA push (native/scripts/inject-push.rb): Apple's answer to registerForRemoteNotifications\n" \
          "    // goes to Capacitor, whose push plugin turns it into the 'registration' / 'registrationError'\n" \
          "    // events native-bridge.js waits for.\n" +
          methods.map { |s| s.gsub(/^/, "    ") }.join("\n\n") + "\n\n"
  line_start = swift.rindex("\n", close - 1)
  line_start = line_start ? line_start + 1 : close
  if swift[line_start...close].strip.empty?
    block = "\n" + block unless swift[0...line_start].end_with?("\n\n") || swift[0...line_start].rstrip.end_with?("{")
    swift.insert(line_start, block)                  # the closing brace is on a line of its own
  else
    swift.insert(close, "\n" + block)
  end
  swift.sub!(/^import UIKit[ \t]*\n/) { |l| l + "import Capacitor\n" } unless swift =~ /^import Capacitor\b/
  File.write(DELEGATE, swift)
  puts "[inject-push] AppDelegate.swift: #{has_reg || has_fail ? 'the missing' : 'both'} remote-notification method#{has_reg || has_fail ? '' : 's'} added."
end

final = File.read(DELEGATE)
unless final.include?(REG_POST) && final.include?(FAIL_POST) && final =~ /^import Capacitor\b/
  abort "[inject-push] AppDelegate.swift still doesn't hand Apple's answer to Capacitor. Check it by hand."
end
puts "[inject-push] done."
