#!/usr/bin/env bash
# Re-apply every committed native piece onto the scaffolded Xcode project, in order.
# Run after EVERY `npx cap sync` / `cap copy` / `cap add ios` (they drop the plugin
# registrations) and before archiving:
#   bash native/scripts/inject-all.sh
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"
ruby inject-live-activity.rb   # RestTimer plugin + PowaWidget target (Live Activity)
ruby inject-iap.rb             # StoreKit coach subscriptions
ruby inject-home-screen.rb     # plate-colour app icons + the Total widget
ruby inject-health.rb          # Apple Health (1.3): plugin, entitlement, permission texts
ruby inject-voice.rb           # voice notes: the microphone permission text (after inject-live-activity)
ruby inject-video-export.rb    # form-check clips exported to H.264 MP4 (video review, M6)
ruby inject-social-sign-in.rb  # Continue with Apple / Google: the Sign in with Apple entitlement + capability, Google's ids + URL scheme (native/social-sign-in.json)
