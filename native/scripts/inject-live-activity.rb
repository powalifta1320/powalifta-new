#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-live-activity.rb — POWALIFTA
#
# `native/ios/` is gitignored and rebuilt from scratch by every cloud build
# (`npx cap add ios`), so native Swift can't just live there. This script re-applies
# the committed native sources (native/ios-native/) onto the freshly-scaffolded Xcode
# project on every build: it adds the RestTimer Capacitor plugin to the App target and
# creates the PowaWidget app-extension target that renders the rest-timer Live Activity
# in the Dynamic Island / Lock Screen.
#
# Run AFTER `npx cap add ios` and BEFORE `pod install` / the build.
#   ruby native/scripts/inject-live-activity.rb
#
# Idempotent: safe to run twice (skips work already done). Uses the `xcodeproj` gem,
# which ships with CocoaPods (present on Codemagic's mac_mini and any pod install box).
#
# Env (optional):
#   DEVELOPMENT_TEAM   Apple team id to stamp on the widget target (else left blank so
#                      `xcode-project use-profiles` / Xcode signing fills it in).

require "fileutils"
begin
  require "xcodeproj"
rescue LoadError
  warn "[inject] xcodeproj gem not found. Install with: gem install xcodeproj (or run via CocoaPods)."
  exit 1
end

HERE      = File.expand_path("..", __dir__)            # native/
SRC       = File.join(HERE, "ios-native")             # committed native sources
IOS       = File.join(HERE, "ios", "App")             # scaffolded Xcode project root
PROJ_PATH = File.join(IOS, "App.xcodeproj")
APP_DIR   = File.join(IOS, "App")                     # App target sources dir
WIDGET_DIR = File.join(IOS, "PowaWidget")             # widget target sources dir
WIDGET_NAME = "PowaWidget"
WIDGET_BUNDLE = "com.powalifta.app.PowaWidget"

abort "[inject] no Xcode project at #{PROJ_PATH} — run `npx cap add ios` first." unless Dir.exist?(PROJ_PATH)

# ---- 1. copy committed sources into the scaffolded tree -----------------------------
FileUtils.mkdir_p(WIDGET_DIR)
# Shared attributes + plugin -> App target dir
FileUtils.cp(File.join(SRC, "App", "RestActivityAttributes.swift"), File.join(APP_DIR, "RestActivityAttributes.swift"))
FileUtils.cp(File.join(SRC, "App", "RestTimerPlugin.swift"),        File.join(APP_DIR, "RestTimerPlugin.swift"))
# Widget sources -> widget dir (attributes is shared: compiled into BOTH targets)
FileUtils.cp(File.join(SRC, "App", "RestActivityAttributes.swift"), File.join(WIDGET_DIR, "RestActivityAttributes.swift"))
FileUtils.cp(File.join(SRC, "Widget", "RestLiveActivity.swift"),    File.join(WIDGET_DIR, "RestLiveActivity.swift"))
FileUtils.cp(File.join(SRC, "Widget", "PowaWidgetBundle.swift"),    File.join(WIDGET_DIR, "PowaWidgetBundle.swift"))
FileUtils.cp(File.join(SRC, "Widget", "Info.plist"),                File.join(WIDGET_DIR, "Info.plist"))

project = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "[inject] no 'App' target found."

# Match the App target's Swift version + team for the widget.
def setting(target, key)
  target.build_configurations.map { |c| c.build_settings[key] }.compact.first
end
swift_version = setting(app_target, "SWIFT_VERSION") || "5.0"
team = ENV["DEVELOPMENT_TEAM"] || setting(app_target, "DEVELOPMENT_TEAM")

app_group = project.main_group["App"] || project.main_group

# ---- 2. add the plugin + shared attributes to the App target ------------------------
def ensure_file_in_target(project, group, target, abs_path)
  name = File.basename(abs_path)
  ref = group.files.find { |f| f.display_name == name } || group.new_reference(abs_path)
  unless target.source_build_phase.files_references.include?(ref)
    target.source_build_phase.add_file_reference(ref, true)
  end
  ref
end

ensure_file_in_target(project, app_group, app_target, File.join(APP_DIR, "RestActivityAttributes.swift"))
ensure_file_in_target(project, app_group, app_target, File.join(APP_DIR, "RestTimerPlugin.swift"))
puts "[inject] RestTimer plugin added to App target."

# ---- 3. create the PowaWidget app-extension target (idempotent) ---------------------
widget_target = project.targets.find { |t| t.name == WIDGET_NAME }
if widget_target.nil?
  widget_target = project.new_target(:app_extension, WIDGET_NAME, :ios, "16.1")
  puts "[inject] created #{WIDGET_NAME} app-extension target."
else
  puts "[inject] #{WIDGET_NAME} target already present — updating in place."
end

widget_group = project.main_group[WIDGET_NAME] || project.main_group.new_group(WIDGET_NAME, WIDGET_NAME)
%w[RestActivityAttributes.swift RestLiveActivity.swift PowaWidgetBundle.swift].each do |fname|
  ensure_file_in_target(project, widget_group, widget_target, File.join(WIDGET_DIR, fname))
end

# Best-effort explicit system frameworks (Swift auto-links these too — belt & braces).
if widget_target.respond_to?(:add_system_framework)
  %w[WidgetKit SwiftUI].each do |fw|
    begin; widget_target.add_system_framework(fw); rescue StandardError; end
  end
end

# ---- 4. widget build settings -------------------------------------------------------
widget_target.build_configurations.each do |config|
  bs = config.build_settings
  bs["PRODUCT_BUNDLE_IDENTIFIER"] = WIDGET_BUNDLE
  bs["PRODUCT_NAME"] = "$(TARGET_NAME)"
  bs["INFOPLIST_FILE"] = "PowaWidget/Info.plist"
  bs["IPHONEOS_DEPLOYMENT_TARGET"] = "16.1"
  bs["SWIFT_VERSION"] = swift_version
  bs["TARGETED_DEVICE_FAMILY"] = "1,2"
  bs["MARKETING_VERSION"] = setting(app_target, "MARKETING_VERSION") || "1.0"
  bs["CURRENT_PROJECT_VERSION"] = setting(app_target, "CURRENT_PROJECT_VERSION") || "1"
  bs["GENERATE_INFOPLIST_FILE"] = "NO"
  bs["SKIP_INSTALL"] = "NO"
  bs["CODE_SIGN_STYLE"] = "Automatic"
  bs["DEVELOPMENT_TEAM"] = team if team && !team.to_s.empty?
  bs["LD_RUNPATH_SEARCH_PATHS"] = "$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks"
  bs["ASSETCATALOG_COMPILER_GLOBAL_ACCENT_COLOR_NAME"] = nil
end

# ---- 5. embed the extension into the App target -------------------------------------
app_target.add_dependency(widget_target)
embed = app_target.build_phases.find do |ph|
  ph.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase) && ph.symbol_dst_subfolder_spec == :plug_ins
end
if embed.nil?
  embed = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
  embed.name = "Embed App Extensions"
  embed.symbol_dst_subfolder_spec = :plug_ins
  app_target.build_phases << embed
end
product_ref = widget_target.product_reference
unless embed.files_references.include?(product_ref)
  bf = embed.add_file_reference(product_ref, true)
  bf.settings = { "ATTRIBUTES" => ["RemoveHeadersOnCopy"] }
end
puts "[inject] widget embedded into App target (Embed App Extensions phase)."

# ---- 5b. silence the CocoaPods "[CP] … will run every build" warnings -----------------
# The generated [CP] Embed Pods Frameworks / Check Pods Manifest.lock script phases have
# no declared outputs, so Xcode warns they run every build. Mark them always-out-of-date
# (the pbxproj equivalent of unchecking "Based on dependency analysis") to clear the noise.
app_target.build_phases.each do |ph|
  next unless ph.respond_to?(:name) && ph.name.to_s.start_with?("[CP]")
  ph.always_out_of_date = "1" if ph.respond_to?(:always_out_of_date=)
end
puts "[inject] silenced [CP] run-every-build warnings."

project.save
puts "[inject] project saved."

# ---- 6. flip on Live Activities support in the App Info.plist -----------------------
app_plist = File.join(APP_DIR, "Info.plist")
if File.exist?(app_plist)
  plist = Xcodeproj::Plist.read_from_path(app_plist)
  plist["NSSupportsLiveActivities"] = true
  Xcodeproj::Plist.write_to_path(plist, app_plist)
  puts "[inject] NSSupportsLiveActivities = YES set in App Info.plist."
else
  warn "[inject] App Info.plist not found at #{app_plist} — NSSupportsLiveActivities NOT set."
end

# ---- 7. Capacitor archive-rsync fix -------------------------------------------------
# `cap add ios` regenerates a stock Podfile WITHOUT the archive fix, so on every fresh
# scaffold the CocoaPods "[CP] Embed Pods Frameworks" script uses a plain `readlink`
# (relative path). During an ARCHIVE (install-action build) the pod frameworks are
# staged under UninstalledProducts/, and rsync can't resolve that relative symlink ->
#   rsync ... UninstalledProducts/iphoneos/Capacitor.framework: (l)stat: No such file
#   ** ARCHIVE FAILED **
# (A plain build/Run never touches UninstalledProducts, which is why it only bites on
# Archive.) `readlink -f` resolves the symlink to an absolute path so the copy works.
# We patch the generated script directly (this runs after pod install in the pipeline),
# and self-heal the Podfile so a later manual `pod install` keeps the fix.
frameworks_script = File.join(IOS, "Pods", "Target Support Files", "Pods-App", "Pods-App-frameworks.sh")
if File.exist?(frameworks_script)
  contents = File.read(frameworks_script)
  patched = contents.gsub('$(readlink "', '$(readlink -f "')
  if patched != contents
    File.write(frameworks_script, patched)
    puts "[inject] archive-rsync fix: readlink -> readlink -f in Pods-App-frameworks.sh."
  else
    puts "[inject] archive-rsync fix: already applied (or script shape changed)."
  end
end

podfile = File.join(IOS, "Podfile")
if File.exist?(podfile)
  pf = File.read(podfile)
  marker = "[POWALIFTA] archive-rsync readlink -f self-heal"
  unless pf.include?(marker) || pf.include?("assertDeploymentTarget(installer)") == false
    heal = <<~RUBY.chomp
      assertDeploymentTarget(installer)
        # #{marker}: rewrite the generated embed script to absolute-resolve symlinks so
        # `xcodebuild archive` doesn't fail copying pod frameworks from UninstalledProducts/.
        fw = File.join(__dir__, 'Pods', 'Target Support Files', 'Pods-App', 'Pods-App-frameworks.sh')
        if File.exist?(fw)
          c = File.read(fw); p = c.gsub('$(readlink "', '$(readlink -f "')
          File.write(fw, p) if p != c
        end
    RUBY
    if pf.include?("assertDeploymentTarget(installer)")
      pf = pf.sub("assertDeploymentTarget(installer)", heal)
      File.write(podfile, pf)
      puts "[inject] archive-rsync fix: Podfile post_install self-heal installed."
    end
  end
end

# ---- 8. register the RestTimer plugin with the Capacitor bridge --------------------
# THIS is what actually makes window.Capacitor.Plugins.RestTimer exist on device.
# Capacitor's registerPlugins() (CapacitorBridge.swift) does NOT scan the runtime for
# CAPBridgedPlugin classes — it only registers the class names listed in the bundle's
# capacitor.config.json -> packageClassList (generated by `cap sync` from npm packages).
# Our plugin is an app-target class, so it never appears there and stays unregistered
# (every RestTimer.start/update/stop silently no-ops). Add its @objc name to the list.
# `cap sync` regenerates this file, so this runs AFTER sync (and re-run after any sync).
require "json"
cap_cfg = File.join(APP_DIR, "capacitor.config.json")
if File.exist?(cap_cfg)
  cfg = JSON.parse(File.read(cap_cfg))
  list = cfg["packageClassList"] ||= []
  unless list.include?("RestTimerPlugin")
    list << "RestTimerPlugin"
    File.write(cap_cfg, JSON.pretty_generate(cfg))
    puts "[inject] registered RestTimerPlugin in capacitor.config.json packageClassList."
  else
    puts "[inject] RestTimerPlugin already in packageClassList."
  end
else
  warn "[inject] generated capacitor.config.json not found — run `npx cap sync ios` FIRST."
end

puts "[inject] all done."

puts "[inject] done."
