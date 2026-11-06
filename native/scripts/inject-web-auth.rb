#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-web-auth.rb — POWALIFTA: Continue with Google in the iPhone app (1.5), without Google's SDK
#
# Puts the system sign-in sheet plugin (WebAuthPlugin, JS name "PowaWebAuth") into the scaffolded Xcode
# project, the way inject-video-export.rb puts the form-check export in:
#
#   1. copy native/ios-native/App/WebAuthPlugin.swift -> native/ios/App/App/ and add it to the App
#      target's compile sources (AuthenticationServices links itself from the Swift import)
#   2. register "WebAuthPlugin" in capacitor.config.json's packageClassList (`cap sync` drops it, and
#      without it window.Capacitor.Plugins.PowaWebAuth never exists and the app shows no Google button)
#   3. CFBundleName "POWALIFTA" in the App's Info.plist: iOS asks before the sheet opens
#      ("POWALIFTA" Wants to Use "….supabase.co" to Sign In) and names the app by CFBundleName, not the
#      display name. `cap add ios` scaffolds $(PRODUCT_NAME), which is "App" (seen on the simulator, 6 Nov).
#
# Nothing else to set: the sheet catches its own powalifta://auth-callback return (no URL type, no
# entitlement), and Supabase must list that address under Redirect URLs (docs/social-sign-in-runbook.md).
# Run by inject-all.sh. Idempotent: safe to run any number of times.

require "fileutils"
require "json"
begin
  require "xcodeproj"
rescue LoadError
  warn "[inject-web-auth] xcodeproj gem not found. Install with: gem install xcodeproj."
  exit 1
end

HERE      = File.expand_path("..", __dir__)            # native/
SRC       = File.join(HERE, "ios-native")
IOS       = File.join(HERE, "ios", "App")
PROJ_PATH = File.join(IOS, "App.xcodeproj")
APP_DIR   = File.join(IOS, "App")
NAME      = "WebAuthPlugin.swift"
CLASS     = "WebAuthPlugin"

abort "[inject-web-auth] no Xcode project at #{PROJ_PATH} — run `npx cap add ios` first." unless Dir.exist?(PROJ_PATH)

# ---- 1. the plugin ------------------------------------------------------------------------
FileUtils.cp(File.join(SRC, "App", NAME), File.join(APP_DIR, NAME))
project = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "[inject-web-auth] no 'App' target found."
app_group = project.main_group["App"] || project.main_group
ref = app_group.files.find { |f| f.display_name == NAME } || app_group.new_reference(File.join(APP_DIR, NAME))
app_target.source_build_phase.add_file_reference(ref, true) unless app_target.source_build_phase.files_references.include?(ref)
project.save
puts "[inject-web-auth] #{NAME} in the App target."

# ---- 2. register the plugin class ----------------------------------------------------------
cfg_path = File.join(APP_DIR, "capacitor.config.json")
if File.exist?(cfg_path)
  cfg = JSON.parse(File.read(cfg_path))
  list = cfg["packageClassList"] ||= []
  if list.include?(CLASS)
    puts "[inject-web-auth] #{CLASS} already in packageClassList."
  else
    list << CLASS
    File.write(cfg_path, JSON.pretty_generate(cfg))
    puts "[inject-web-auth] registered #{CLASS} in capacitor.config.json packageClassList."
  end
else
  warn "[inject-web-auth] WARNING: #{cfg_path} not found — run `npx cap copy ios` first, then re-run this."
end

# ---- 3. the name iOS shows in "… Wants to Use … to Sign In" --------------------------------
BUNDLE_NAME = "POWALIFTA"   # at most 15 characters (CFBundleName); the Home Screen keeps CFBundleDisplayName
app_plist = File.join(APP_DIR, "Info.plist")
if File.exist?(app_plist)
  plist = Xcodeproj::Plist.read_from_path(app_plist)
  if plist["CFBundleName"] == BUNDLE_NAME
    puts "[inject-web-auth] Info.plist: CFBundleName already #{BUNDLE_NAME}."
  else
    was = plist["CFBundleName"]
    plist["CFBundleName"] = BUNDLE_NAME
    Xcodeproj::Plist.write_to_path(plist, app_plist)
    puts "[inject-web-auth] Info.plist: CFBundleName #{was.inspect} -> #{BUNDLE_NAME} (the sign-in sheet's question names the app by it)."
  end
else
  warn "[inject-web-auth] WARNING: #{app_plist} not found."
end
puts "[inject-web-auth] done."
