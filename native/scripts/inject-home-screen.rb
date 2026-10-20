#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-home-screen.rb — POWALIFTA
#
# The Home Screen pair: plate-colour app icons + the Total widget. Like the other two
# injectors it re-applies committed sources onto the scaffolded (gitignored, regenerated)
# Xcode project. Run AFTER inject-live-activity.rb — it needs the PowaWidget target that
# script creates. `native/scripts/inject-all.sh` runs all three in the right order.
#
#   1. AppIconPlugin.swift + WidgetBridgePlugin.swift -> App target sources
#   2. PowaHomeWidget.swift -> PowaWidget target sources
#   3. App Group entitlements (group.com.powalifta.app) on BOTH targets — the widget
#      reads the snapshot the app writes. With automatic signing Xcode registers the
#      group on the App IDs itself; if a build complains, add it once by hand:
#      Signing & Capabilities → + Capability → App Groups → group.com.powalifta.app
#      on App and on PowaWidget.
#   4. native/assets/icons/AppIcon-*.png -> alternate app icon sets in Assets.xcassets,
#      listed in ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES (AppIcon stays primary)
#   5. both plugin classes registered in capacitor.config.json packageClassList
#
# Idempotent: safe to run any number of times.

require "fileutils"
require "json"
begin
  require "xcodeproj"
rescue LoadError
  warn "[inject-home] xcodeproj gem not found. Install with: gem install xcodeproj."
  exit 1
end

HERE       = File.expand_path("..", __dir__)            # native/
SRC        = File.join(HERE, "ios-native")              # committed native sources
ICONS_SRC  = File.join(HERE, "assets", "icons")         # committed 1024² alternate icons
IOS        = File.join(HERE, "ios", "App")              # scaffolded Xcode project root
PROJ_PATH  = File.join(IOS, "App.xcodeproj")
APP_DIR    = File.join(IOS, "App")
WIDGET_DIR = File.join(IOS, "PowaWidget")
APP_GROUP  = "group.com.powalifta.app"

abort "[inject-home] no Xcode project at #{PROJ_PATH} — run `npx cap add ios` first." unless Dir.exist?(PROJ_PATH)

project = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "[inject-home] no 'App' target found."
widget_target = project.targets.find { |t| t.name == "PowaWidget" } or
  abort "[inject-home] no 'PowaWidget' target — run inject-live-activity.rb first."
app_group = project.main_group["App"] || project.main_group
widget_group = project.main_group["PowaWidget"] || project.main_group.new_group("PowaWidget", "PowaWidget")

def ensure_source(group, target, abs_path)
  name = File.basename(abs_path)
  ref = group.files.find { |f| f.display_name == name } || group.new_reference(abs_path)
  target.source_build_phase.add_file_reference(ref, true) unless target.source_build_phase.files_references.include?(ref)
end

def ensure_reference(group, abs_path)
  name = File.basename(abs_path)
  group.files.find { |f| f.display_name == name } || group.new_reference(abs_path)
end

# ---- 1 + 2. plugins into the App target, the widget into PowaWidget -----------------
%w[AppIconPlugin.swift WidgetBridgePlugin.swift].each do |f|
  FileUtils.cp(File.join(SRC, "App", f), File.join(APP_DIR, f))
  ensure_source(app_group, app_target, File.join(APP_DIR, f))
end
FileUtils.mkdir_p(WIDGET_DIR)
%w[PowaHomeWidget.swift PowaWidgets.swift PowaWidgetIntents.swift].each do |f|
  FileUtils.cp(File.join(SRC, "Widget", f), File.join(WIDGET_DIR, f))
  ensure_source(widget_group, widget_target, File.join(WIDGET_DIR, f))
end
puts "[inject-home] AppIconPlugin + WidgetBridgePlugin (App) and PowaHomeWidget (PowaWidget) in place."

# ---- 3. App Group on both targets' entitlements (merged in, never overwritten) ---------
# The App target's App.entitlements is also where Xcode keeps the Push Notifications
# capability (aps-environment), so an existing file is read and extended, not replaced.
def ent_rel(value)
  value.to_s.sub(%r{\A\$\((SRCROOT|PROJECT_DIR)\)/}, "")
end
[[app_target, app_group, File.join(SRC, "App", "App.entitlements"), File.join(APP_DIR, "App.entitlements"), "App/App.entitlements"],
 [widget_target, widget_group, File.join(SRC, "Widget", "PowaWidget.entitlements"), File.join(WIDGET_DIR, "PowaWidget.entitlements"), "PowaWidget/PowaWidget.entitlements"]
].each do |target, group, src, dst, rel|
  target.build_configurations.each do |config|
    cur = ent_rel(config.build_settings["CODE_SIGN_ENTITLEMENTS"])
    if cur.empty?
      FileUtils.cp(src, dst) unless File.exist?(dst)
      config.build_settings["CODE_SIGN_ENTITLEMENTS"] = rel
      cur = rel
    end
    path = File.join(IOS, cur)
    unless File.exist?(path)
      warn "[inject-home] #{target.name}: CODE_SIGN_ENTITLEMENTS points at missing #{cur}; App Group NOT added."
      next
    end
    plist = Xcodeproj::Plist.read_from_path(path)
    groups = Array(plist["com.apple.security.application-groups"])
    unless groups.include?(APP_GROUP)
      plist["com.apple.security.application-groups"] = groups + [APP_GROUP]
      Xcodeproj::Plist.write_to_path(plist, path)
    end
  end
  ensure_reference(group, dst) if File.exist?(dst)
end
puts "[inject-home] App Group #{APP_GROUP} on App + PowaWidget."

# ---- 3b. the widget's privacy manifest (it reads the App Group's UserDefaults) --------
widget_privacy = File.join(SRC, "Widget", "PrivacyInfo.xcprivacy")
if File.exist?(widget_privacy)
  dst = File.join(WIDGET_DIR, "PrivacyInfo.xcprivacy")
  FileUtils.cp(widget_privacy, dst)
  pref = ensure_reference(widget_group, dst)
  widget_target.resources_build_phase.add_file_reference(pref, true) unless widget_target.resources_build_phase.files_references.include?(pref)
  puts "[inject-home] PowaWidget PrivacyInfo.xcprivacy in place."
end

# ---- 4. alternate app icons ----------------------------------------------------------
xcassets = File.join(APP_DIR, "Assets.xcassets")
names = []
Dir[File.join(ICONS_SRC, "AppIcon-*.png")].sort.each do |png|
  name = File.basename(png, ".png")
  set = File.join(xcassets, "#{name}.appiconset")
  FileUtils.mkdir_p(set)
  FileUtils.cp(png, File.join(set, "#{name}.png"))
  File.write(File.join(set, "Contents.json"), JSON.pretty_generate({
    "images" => [{ "filename" => "#{name}.png", "idiom" => "universal", "platform" => "ios", "size" => "1024x1024" }],
    "info" => { "author" => "xcode", "version" => 1 }
  }))
  names << name
end
# Icon sets that are no longer in native/assets/icons would still ship (INCLUDE_ALL): prune them.
Dir[File.join(xcassets, "AppIcon-*.appiconset")].each do |set|
  FileUtils.rm_rf(set) unless names.include?(File.basename(set, ".appiconset"))
end
if names.empty?
  warn "[inject-home] no alternate icons in #{ICONS_SRC} — none registered."
  app_target.build_configurations.each do |config|
    config.build_settings.delete("ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES")
    config.build_settings.delete("ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS")
  end
else
  app_target.build_configurations.each do |config|
    config.build_settings["ASSETCATALOG_COMPILER_ALTERNATE_APPICON_NAMES"] = names.join(" ")
    config.build_settings["ASSETCATALOG_COMPILER_INCLUDE_ALL_APPICON_ASSETS"] = "YES"
  end
  puts "[inject-home] alternate icons: #{names.join(', ')}."
end

project.save
puts "[inject-home] project saved."

# ---- 4b. the powalifta:// scheme (widgets and the Live Activity open the app with it) --
app_plist = File.join(APP_DIR, "Info.plist")
if File.exist?(app_plist)
  plist = Xcodeproj::Plist.read_from_path(app_plist)
  types = Array(plist["CFBundleURLTypes"])
  unless types.any? { |t| Array(t["CFBundleURLSchemes"]).include?("powalifta") }
    types << { "CFBundleURLName" => "com.powalifta.app", "CFBundleURLSchemes" => ["powalifta"] }
    plist["CFBundleURLTypes"] = types
    Xcodeproj::Plist.write_to_path(plist, app_plist)
  end
  puts "[inject-home] Info.plist: powalifta:// URL scheme registered."
end

# ---- 5. register the plugin classes (cap sync regenerates this list) ---------------
cfg_path = File.join(APP_DIR, "capacitor.config.json")
if File.exist?(cfg_path)
  cfg = JSON.parse(File.read(cfg_path))
  list = cfg["packageClassList"] ||= []
  added = %w[AppIconPlugin WidgetBridgePlugin].reject { |c| list.include?(c) }
  unless added.empty?
    list.concat(added)
    File.write(cfg_path, JSON.pretty_generate(cfg))
  end
  puts "[inject-home] packageClassList: #{added.empty? ? 'already registered' : added.join(' + ') + ' registered'}."
else
  warn "[inject-home] WARNING: #{cfg_path} not found — run `npx cap copy ios` first, then re-run this."
end

puts "[inject-home] done."
