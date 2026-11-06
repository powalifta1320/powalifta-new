# inject-ios-min.rb — POWALIFTA: the app needs iOS 15.0 or later (2026-11-06)
#
# Apple, on every 1.4 upload (ITMS-90068): "Your app targets iOS 13.0. Starting in April 2027, iOS apps must target
# 15.0 or later to be uploaded to App Store Connect or submitted for distribution." Every iPhone that runs iOS 13 also
# runs iOS 15 (iPhone 6s / SE and later), so no one loses the app. `cap add ios` scaffolds 13.0, so this raises
# IPHONEOS_DEPLOYMENT_TARGET to at least 15.0 on the project, the app and its extensions (PowaWidget keeps its 16.1),
# and the Podfile's platform to 15.0 (a `pod install` applies that to the Pods project; cap sync runs one). Idempotent.
require "xcodeproj"
MIN     = "15.0"
HERE    = File.expand_path("..", __dir__)                 # native/
IOS     = File.join(HERE, "ios", "App")
PROJ    = File.join(IOS, "App.xcodeproj")
PODFILE = File.join(IOS, "Podfile")
abort "[inject-ios-min] no Xcode project at #{PROJ} — run `npx cap add ios` first." unless Dir.exist?(PROJ)
low = ->(v) { v.nil? || v.to_s.strip.empty? || Gem::Version.new(v.to_s) < Gem::Version.new(MIN) }
kinds = ["com.apple.product-type.application", "com.apple.product-type.app-extension", "com.apple.product-type.extensionkit-extension"]

proj = Xcodeproj::Project.open(PROJ)
changed = []
proj.build_configurations.each do |c|
  v = c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"]
  next unless v && low.(v)
  c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = MIN
  changed << "project [#{c.name}] #{v} -> #{MIN}"
end
proj.targets.each do |t|
  next unless kinds.include?(t.product_type)
  t.build_configurations.each do |c|
    v = c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"]
    next unless low.(v)
    c.build_settings["IPHONEOS_DEPLOYMENT_TARGET"] = MIN
    changed << "#{t.name} [#{c.name}] #{v.inspect} -> #{MIN}"
  end
end
proj.save if changed.any?
puts changed.any? ? "[inject-ios-min] iOS #{MIN}: #{changed.join('; ')}" : "[inject-ios-min] app and extensions already need iOS #{MIN} or later."

if File.exist?(PODFILE)
  pf = File.read(PODFILE)
  if pf =~ /^platform :ios, '([\d.]+)'/ && low.($1)
    File.write(PODFILE, pf.sub(/^platform :ios, '[\d.]+'/, "platform :ios, '#{MIN}'"))
    puts "[inject-ios-min] Podfile platform :ios, '#{MIN}' (run pod install to apply it to the Pods project)."
  else
    puts "[inject-ios-min] Podfile platform already #{MIN} or later."
  end
end
