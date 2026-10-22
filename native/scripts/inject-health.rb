#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-health.rb — POWALIFTA (1.3, branch feat/apple-health)
#
# Puts Apple Health into the scaffolded Xcode project, the way inject-iap.rb puts StoreKit in:
#
#   1. copy native/ios-native/App/HealthPlugin.swift -> native/ios/App/App/ and add it to the
#      App target's compile sources (HealthKit links itself from the Swift import)
#   2. register "HealthPlugin" in capacitor.config.json's packageClassList (`cap sync` drops it)
#   3. the HealthKit entitlement, merged into the App target's entitlements file
#   4. the HealthKit capability on the App target (so automatic signing adds it to the App ID)
#   5. Info.plist: the two permission texts iOS shows (reading and saving). Reading names every
#      type HealthPlugin.swift asks for: bodyweight, sleep, resting HR, HRV, calories, protein
#
# Run by inject-all.sh, after inject-home-screen.rb (which makes sure the entitlements file
# exists). Idempotent: safe to run any number of times.

require "fileutils"
require "json"
begin
  require "xcodeproj"
rescue LoadError
  warn "[inject-health] xcodeproj gem not found. Install with: gem install xcodeproj."
  exit 1
end

HERE      = File.expand_path("..", __dir__)            # native/
SRC       = File.join(HERE, "ios-native")
IOS       = File.join(HERE, "ios", "App")
PROJ_PATH = File.join(IOS, "App.xcodeproj")
APP_DIR   = File.join(IOS, "App")

abort "[inject-health] no Xcode project at #{PROJ_PATH} — run `npx cap add ios` first." unless Dir.exist?(PROJ_PATH)

# ---- 1. the plugin ------------------------------------------------------------------------
FileUtils.cp(File.join(SRC, "App", "HealthPlugin.swift"), File.join(APP_DIR, "HealthPlugin.swift"))
project = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "[inject-health] no 'App' target found."
app_group = project.main_group["App"] || project.main_group
name = "HealthPlugin.swift"
ref = app_group.files.find { |f| f.display_name == name } || app_group.new_reference(File.join(APP_DIR, name))
app_target.source_build_phase.add_file_reference(ref, true) unless app_target.source_build_phase.files_references.include?(ref)

# ---- 3. the entitlement --------------------------------------------------------------------
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
  unless File.exist?(path)
    warn "[inject-health] CODE_SIGN_ENTITLEMENTS points at missing #{rel}; HealthKit NOT added."
    next
  end
  plist = Xcodeproj::Plist.read_from_path(path)
  changed = false
  unless plist["com.apple.developer.healthkit"] == true
    plist["com.apple.developer.healthkit"] = true
    changed = true
  end
  unless plist.key?("com.apple.developer.healthkit.access")
    plist["com.apple.developer.healthkit.access"] = []   # no clinical records
    changed = true
  end
  Xcodeproj::Plist.write_to_path(plist, path) if changed
end

# ---- 4. the capability ---------------------------------------------------------------------
attrs = project.root_object.attributes["TargetAttributes"] ||= {}
ta = attrs[app_target.uuid] ||= {}
caps = ta["SystemCapabilities"] ||= {}
caps["com.apple.HealthKit"] = { "enabled" => "1" }
project.save
puts "[inject-health] HealthPlugin.swift + the HealthKit entitlement and capability on the App target."

# ---- 2. register the plugin class ----------------------------------------------------------
cfg_path = File.join(APP_DIR, "capacitor.config.json")
if File.exist?(cfg_path)
  cfg = JSON.parse(File.read(cfg_path))
  list = cfg["packageClassList"] ||= []
  unless list.include?("HealthPlugin")
    list << "HealthPlugin"
    File.write(cfg_path, JSON.pretty_generate(cfg))
    puts "[inject-health] registered HealthPlugin in capacitor.config.json packageClassList."
  else
    puts "[inject-health] HealthPlugin already in packageClassList."
  end
else
  warn "[inject-health] WARNING: #{cfg_path} not found — run `npx cap copy ios` first, then re-run this."
end

# ---- 5. the permission texts ---------------------------------------------------------------
app_plist = File.join(APP_DIR, "Info.plist")
if File.exist?(app_plist)
  plist = Xcodeproj::Plist.read_from_path(app_plist)
  plist["NSHealthShareUsageDescription"] =
    "POWALIFTA reads your bodyweight to fill in your weigh-ins, which are saved to your account like any weigh-in; last night's sleep, your resting heart rate and heart rate variability to suggest longer rests on harder days; and the calories and protein you log to show your daily averages while you make weight. Sleep, heart and food data stay on your phone unless you choose to share them with your coach."
  plist["NSHealthUpdateUsageDescription"] =
    "POWALIFTA saves your weigh-ins and your finished training sessions to Apple Health."
  Xcodeproj::Plist.write_to_path(plist, app_plist)
  puts "[inject-health] Info.plist: Health permission texts set."
else
  warn "[inject-health] WARNING: #{app_plist} not found."
end
puts "[inject-health] done."
