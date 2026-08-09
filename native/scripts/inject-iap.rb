#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-iap.rb — POWALIFTA
#
# Injects the StoreKit 2 coach-subscription plugin (StoreKitPlugin.swift, JS name
# "PowaIAP") into the scaffolded Xcode project, exactly the way
# inject-live-activity.rb injects the RestTimer plugin:
#
#   1. copy native/ios-native/App/StoreKitPlugin.swift -> native/ios/App/App/
#   2. add the file to the App target's compile sources (idempotent)
#   3. register "StoreKitPlugin" in capacitor.config.json's packageClassList
#      (`cap sync` regenerates that list from npm packages, silently dropping
#      custom plugins — same trap as the RestTimer plugin, same fix)
#
# Run AFTER `npx cap add ios` / every `cap sync`, alongside inject-live-activity.rb:
#   ruby native/scripts/inject-live-activity.rb
#   ruby native/scripts/inject-iap.rb
#
# Idempotent: safe to run any number of times.

require "fileutils"
require "json"
begin
  require "xcodeproj"
rescue LoadError
  warn "[inject-iap] xcodeproj gem not found. Install with: gem install xcodeproj."
  exit 1
end

HERE      = File.expand_path("..", __dir__)            # native/
SRC       = File.join(HERE, "ios-native")              # committed native sources
IOS       = File.join(HERE, "ios", "App")              # scaffolded Xcode project root
PROJ_PATH = File.join(IOS, "App.xcodeproj")
APP_DIR   = File.join(IOS, "App")                      # App target sources dir

abort "[inject-iap] no Xcode project at #{PROJ_PATH} — run `npx cap add ios` first." unless Dir.exist?(PROJ_PATH)

# ---- 1. copy the committed plugin source into the scaffolded tree -------------------
FileUtils.cp(File.join(SRC, "App", "StoreKitPlugin.swift"), File.join(APP_DIR, "StoreKitPlugin.swift"))

project = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "[inject-iap] no 'App' target found."
app_group = project.main_group["App"] || project.main_group

# ---- 2. add to the App target's compile sources (idempotent) ------------------------
name = "StoreKitPlugin.swift"
abs  = File.join(APP_DIR, name)
ref  = app_group.files.find { |f| f.display_name == name } || app_group.new_reference(abs)
unless app_target.source_build_phase.files_references.include?(ref)
  app_target.source_build_phase.add_file_reference(ref, true)
end
project.save
puts "[inject-iap] StoreKitPlugin.swift added to App target."

# ---- 3. register the plugin class in capacitor.config.json --------------------------
cfg_path = File.join(APP_DIR, "capacitor.config.json")
if File.exist?(cfg_path)
  cfg = JSON.parse(File.read(cfg_path))
  list = cfg["packageClassList"] ||= []
  unless list.include?("StoreKitPlugin")
    list << "StoreKitPlugin"
    File.write(cfg_path, JSON.pretty_generate(cfg))
    puts "[inject-iap] registered StoreKitPlugin in capacitor.config.json packageClassList."
  else
    puts "[inject-iap] StoreKitPlugin already in packageClassList."
  end
else
  warn "[inject-iap] WARNING: #{cfg_path} not found — run `npx cap copy ios` first, then re-run this."
end
