#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-video-export.rb — POWALIFTA (video review, M6)
#
# Puts the form-check export plugin into the scaffolded Xcode project, the way inject-health.rb
# puts Apple Health in:
#
#   1. copy native/ios-native/App/VideoExportPlugin.swift -> native/ios/App/App/ and add it to the
#      App target's compile sources (AVFoundation links itself from the Swift import)
#   2. register "VideoExportPlugin" in capacitor.config.json's packageClassList (`cap sync`
#      drops it, and without it window.Capacitor.Plugins.PowaVideo never exists)
#
# The camera, photo-library and microphone permission texts it needs are already set by
# inject-live-activity.rb (step 6). Run by inject-all.sh. Idempotent: safe to run any number of times.

require "fileutils"
require "json"
begin
  require "xcodeproj"
rescue LoadError
  warn "[inject-video-export] xcodeproj gem not found. Install with: gem install xcodeproj."
  exit 1
end

HERE      = File.expand_path("..", __dir__)            # native/
SRC       = File.join(HERE, "ios-native")
IOS       = File.join(HERE, "ios", "App")
PROJ_PATH = File.join(IOS, "App.xcodeproj")
APP_DIR   = File.join(IOS, "App")
NAME      = "VideoExportPlugin.swift"

abort "[inject-video-export] no Xcode project at #{PROJ_PATH} — run `npx cap add ios` first." unless Dir.exist?(PROJ_PATH)

# ---- 1. the plugin ------------------------------------------------------------------------
FileUtils.cp(File.join(SRC, "App", NAME), File.join(APP_DIR, NAME))
project = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "[inject-video-export] no 'App' target found."
app_group = project.main_group["App"] || project.main_group
ref = app_group.files.find { |f| f.display_name == NAME } || app_group.new_reference(File.join(APP_DIR, NAME))
app_target.source_build_phase.add_file_reference(ref, true) unless app_target.source_build_phase.files_references.include?(ref)
project.save
puts "[inject-video-export] #{NAME} in the App target."

# ---- 2. register the plugin class ----------------------------------------------------------
cfg_path = File.join(APP_DIR, "capacitor.config.json")
if File.exist?(cfg_path)
  cfg = JSON.parse(File.read(cfg_path))
  list = cfg["packageClassList"] ||= []
  if list.include?("VideoExportPlugin")
    puts "[inject-video-export] VideoExportPlugin already in packageClassList."
  else
    list << "VideoExportPlugin"
    File.write(cfg_path, JSON.pretty_generate(cfg))
    puts "[inject-video-export] registered VideoExportPlugin in capacitor.config.json packageClassList."
  end
else
  warn "[inject-video-export] WARNING: #{cfg_path} not found — run `npx cap copy ios` first, then re-run this."
end
puts "[inject-video-export] done."
