# inject-pod-signing.rb — POWALIFTA: CocoaPods resource bundles need no signing team (2026-11-05)
#
# Xcode 14+ asks for a development team for every CocoaPods resource bundle target (e.g. AppAuth's
# "AppAuth-AppAuthCore_Privacy"), so an Archive for a device stops with "Signing for ... requires a development
# team" while simulator builds never notice. A resource bundle is signed inside the app and needs no signature of
# its own, so: CODE_SIGNING_ALLOWED = NO on every bundle target in Pods.xcodeproj, and the same in the Podfile's
# post_install so a later `pod install` (cap sync / cap update) keeps it. Idempotent.
require "xcodeproj"
HERE    = File.expand_path("..", __dir__)                 # native/
IOS     = File.join(HERE, "ios", "App")
PODS    = File.join(IOS, "Pods", "Pods.xcodeproj")
PODFILE = File.join(IOS, "Podfile")
MARKER  = "[POWALIFTA] pod resource bundles: no signing"
bundle = ->(t) { t.respond_to?(:product_type) && t.product_type == "com.apple.product-type.bundle" }

if Dir.exist?(PODS)
  pods = Xcodeproj::Project.open(PODS)
  fixed = pods.targets.select(&bundle)
  fixed.each { |t| t.build_configurations.each { |c| c.build_settings["CODE_SIGNING_ALLOWED"] = "NO" } }
  pods.save
  puts "[inject-pod-signing] resource bundles unsigned (#{fixed.size}): #{fixed.map(&:name).join(', ')}"
else
  warn "[inject-pod-signing] no Pods project yet (run pod install / cap sync first)."
end

if File.exist?(PODFILE)
  pf = File.read(PODFILE)
  if pf.include?(MARKER)
    puts "[inject-pod-signing] Podfile already keeps it."
  elsif pf.include?("assertDeploymentTarget(installer)")
    heal = <<~RUBY.chomp
      assertDeploymentTarget(installer)
        # #{MARKER}: Xcode 14+ asks a team for each CocoaPods resource bundle; they need none.
        installer.pods_project.targets.each do |t|
          next unless t.respond_to?(:product_type) && t.product_type == 'com.apple.product-type.bundle'
          t.build_configurations.each { |c| c.build_settings['CODE_SIGNING_ALLOWED'] = 'NO' }
        end
    RUBY
    File.write(PODFILE, pf.sub("assertDeploymentTarget(installer)", heal))
    puts "[inject-pod-signing] Podfile post_install keeps it from now on."
  else
    warn "[inject-pod-signing] Podfile has no assertDeploymentTarget(installer) line; left as it is."
  end
end
