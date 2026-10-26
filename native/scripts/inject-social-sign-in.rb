#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-social-sign-in.rb — POWALIFTA: Continue with Apple / Continue with Google (2026-10-25)
#
# Puts the native sign-in pieces into the scaffolded Xcode project, the way inject-health.rb
# puts Apple Health in. The two plugins themselves (@capacitor-community/apple-sign-in and
# @codetrix-studio/capacitor-google-auth, in native/package.json) are registered and their
# pods added by `cap sync`; this adds what sync can't know:
#
#   1. Sign in with Apple: the entitlement (com.apple.developer.applesignin = [Default]) in the
#      App target's entitlements file, and the capability on the target, so automatic signing
#      adds it to the App ID. Nothing to configure: the bundle id is the client id.
#   2. Google, from native/social-sign-in.json (the owner fills it in; git holds placeholders):
#        Info.plist             GIDClientID (the iOS client id), GIDServerClientID (the web
#                               client id) and the URL scheme the Google sheet returns through
#                               (the iOS client id reversed: com.googleusercontent.apps.…)
#        capacitor.config.json  plugins.GoogleAuth { iosClientId, serverClientId, scopes }: the
#                               plugin reads these; the server id makes the token's audience the
#                               web client, which Supabase's Google provider lists first
#        public/social-sign-in.js  window.POWA_SOCIAL = { google: { iosClientId, webClientId } }:
#                               social-auth.js reads the client id from here, so without it the
#                               Google button says "not set up" instead of the plugin crashing
#      While the JSON still holds placeholders the Google parts are skipped, loudly, and stale
#      Google config is removed. Apple works on its own (App Review 4.8 wants Apple whenever
#      another login is offered, not the other way round).
#
# Run by inject-all.sh after inject-health.rb (which makes sure the entitlements file exists).
# Idempotent: safe to run any number of times. Owner steps: docs/social-sign-in-runbook.md.

require "fileutils"
require "json"
begin
  require "xcodeproj"
rescue LoadError
  warn "[inject-social] xcodeproj gem not found. Install with: gem install xcodeproj."
  exit 1
end

HERE      = File.expand_path("..", __dir__)            # native/
SRC       = File.join(HERE, "ios-native")
IOS       = File.join(HERE, "ios", "App")
PROJ_PATH = File.join(IOS, "App.xcodeproj")
APP_DIR   = File.join(IOS, "App")
CONFIG    = File.join(HERE, "social-sign-in.json")

abort "[inject-social] no Xcode project at #{PROJ_PATH} — run `npx cap add ios` first." unless Dir.exist?(PROJ_PATH)

# ---- the owner's ids -----------------------------------------------------------------------
def real_google_id?(v)
  s = v.to_s.strip
  !s.empty? && s !~ /PLACEHOLDER/i && s.end_with?(".apps.googleusercontent.com")
end
def reversed_client_id(id)
  "com.googleusercontent.apps." + id.to_s.sub(/\.apps\.googleusercontent\.com\z/, "")
end

cfg = File.exist?(CONFIG) ? JSON.parse(File.read(CONFIG)) : {}
google = cfg["google"] || {}
ios_id = google["iosClientId"].to_s.strip
web_id = google["webClientId"].to_s.strip
google_on = real_google_id?(ios_id)
unless google_on
  warn "[inject-social] WARNING: native/social-sign-in.json still has a placeholder iOS client id — " \
       "Google sign-in is left OUT of this build (Apple still works). Fill it in (runbook part 2) and re-run."
end
warn "[inject-social] note: webClientId is a placeholder; the token's audience will be the iOS client id (add it to Supabase's Google Client IDs)." if google_on && !real_google_id?(web_id)

project    = Xcodeproj::Project.open(PROJ_PATH)
app_target = project.targets.find { |t| t.name == "App" } or abort "[inject-social] no 'App' target found."

# ---- 1. Sign in with Apple: entitlement + capability ---------------------------------------
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
    warn "[inject-social] CODE_SIGN_ENTITLEMENTS points at missing #{rel}; Sign in with Apple NOT added."
    next
  end
  plist = Xcodeproj::Plist.read_from_path(path)
  unless plist["com.apple.developer.applesignin"] == ["Default"]
    plist["com.apple.developer.applesignin"] = ["Default"]
    Xcodeproj::Plist.write_to_path(plist, path)
  end
end
attrs = project.root_object.attributes["TargetAttributes"] ||= {}
ta    = attrs[app_target.uuid] ||= {}
caps  = ta["SystemCapabilities"] ||= {}
caps["com.apple.SignInWithApple"] = { "enabled" => "1" }
project.save
puts "[inject-social] Sign in with Apple: entitlement + capability on the App target."

# ---- 2. Google: Info.plist ------------------------------------------------------------------
URL_NAME = "com.powalifta.app.google"
app_plist = File.join(APP_DIR, "Info.plist")
if File.exist?(app_plist)
  plist = Xcodeproj::Plist.read_from_path(app_plist)
  types = (plist["CFBundleURLTypes"] || []).reject { |t| t.is_a?(Hash) && t["CFBundleURLName"] == URL_NAME }
  if google_on
    scheme = reversed_client_id(ios_id)
    types << { "CFBundleTypeRole" => "Editor", "CFBundleURLName" => URL_NAME, "CFBundleURLSchemes" => [scheme] }
    plist["GIDClientID"] = ios_id
    if real_google_id?(web_id) then plist["GIDServerClientID"] = web_id else plist.delete("GIDServerClientID") end
    puts "[inject-social] Info.plist: GIDClientID + URL scheme #{scheme}."
  else
    plist.delete("GIDClientID"); plist.delete("GIDServerClientID")
    puts "[inject-social] Info.plist: no Google ids (placeholders)."
  end
  if types.empty? then plist.delete("CFBundleURLTypes") else plist["CFBundleURLTypes"] = types end
  Xcodeproj::Plist.write_to_path(plist, app_plist)
else
  warn "[inject-social] WARNING: #{app_plist} not found."
end

# ---- 2. Google: capacitor.config.json (what the plugin reads) --------------------------------
cfg_path = File.join(APP_DIR, "capacitor.config.json")
if File.exist?(cfg_path)
  cap = JSON.parse(File.read(cfg_path))
  plugins = cap["plugins"] ||= {}
  if google_on
    ga = { "iosClientId" => ios_id, "scopes" => ["profile", "email"], "forceCodeForRefreshToken" => false }
    ga["serverClientId"] = web_id if real_google_id?(web_id)
    plugins["GoogleAuth"] = ga
  else
    plugins.delete("GoogleAuth")
  end
  File.write(cfg_path, JSON.pretty_generate(cap) + "\n")
  puts "[inject-social] capacitor.config.json: plugins.GoogleAuth #{google_on ? 'set' : 'absent'}."
else
  warn "[inject-social] WARNING: #{cfg_path} not found — run `npx cap copy ios` first, then re-run this."
end

# ---- 2. Google: the client id for the web code in the bundle ---------------------------------
public_dir = File.join(APP_DIR, "public")
if Dir.exist?(public_dir)
  social = google_on ? { "google" => { "iosClientId" => ios_id, "webClientId" => (real_google_id?(web_id) ? web_id : nil) } } : { "google" => nil }
  File.write(File.join(public_dir, "social-sign-in.js"),
             "// Written by native/scripts/inject-social-sign-in.rb from native/social-sign-in.json. Public client ids, not secrets.\n" \
             "window.POWA_SOCIAL = #{JSON.generate(social)};\n")
  puts "[inject-social] public/social-sign-in.js written (#{google_on ? 'Google on' : 'Google off'})."
else
  warn "[inject-social] WARNING: #{public_dir} not found — run `npx cap copy ios` first, then re-run this."
end
puts "[inject-social] done."
