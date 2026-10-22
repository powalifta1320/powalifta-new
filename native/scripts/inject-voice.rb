#!/usr/bin/env ruby
# frozen_string_literal: true
#
# inject-voice.rb — POWALIFTA voice notes (brief 4.4, milestone M5)
#
# The microphone permission text iOS shows the first time a lifter or coach holds the mic in a
# message thread. inject-live-activity.rb set a form-check-only text; voice notes are now the main
# use, so this replaces it with one that names both (App Review 5.1.1: the purpose string must say
# what the microphone is for). The recording itself is plain web code (getUserMedia +
# MediaRecorder in WKWebView, voice.js), so there is no plugin to register.
#
# Run by inject-all.sh AFTER inject-live-activity.rb (which would otherwise write the old text back).
# Idempotent: safe to run any number of times.

begin
  require "xcodeproj"
rescue LoadError
  warn "[inject-voice] xcodeproj gem not found. Install with: gem install xcodeproj."
  exit 1
end

HERE     = File.expand_path("..", __dir__)   # native/
APP_DIR  = File.join(HERE, "ios", "App", "App")
PLIST    = File.join(APP_DIR, "Info.plist")
MIC_TEXT = "POWALIFTA uses the microphone when you hold the mic button to record a voice note for your coach or athlete, " \
           "and for the sound on form-check videos you film. Nothing is recorded unless you hold the button or film a clip."

abort "[inject-voice] #{PLIST} not found — run `npx cap add ios` / `npx cap copy ios` first." unless File.exist?(PLIST)
plist = Xcodeproj::Plist.read_from_path(PLIST)
if plist["NSMicrophoneUsageDescription"] == MIC_TEXT
  puts "[inject-voice] microphone text already set."
else
  plist["NSMicrophoneUsageDescription"] = MIC_TEXT
  Xcodeproj::Plist.write_to_path(plist, PLIST)
  puts "[inject-voice] Info.plist: microphone text set for voice notes + form checks."
end
puts "[inject-voice] done."
