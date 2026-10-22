#!/bin/bash
# Widget preview: draws every Home Screen widget, in every size and state, onto one PNG from the
# real SwiftUI views, on a Mac, without the Xcode project. Usage:
#   bash native/scripts/widget-preview/build.sh [out.png]        (default: $TMPDIR/powa-widgets.png)
#   bash native/scripts/widget-preview/build.sh --split DIR      (each Apple Health widget tile as DIR/<name>.png at the
#                                                                Pro Max size, plus <name>@338x158.png and <name>@321x148.png)
# To see real data in the top row, save a snapshot the app wrote (the JSON syncHomeWidget() passes
# to PowaNative.updateWidget) as native/scripts/widget-preview/snapshot.json (not committed).
# The Lock Screen families are iOS-only, so the copies compiled here drop them from
# .supportedFamilies; the views are compiled unchanged. shim.swift stands in for the Powa colours
# (RestLiveActivity.swift needs ActivityKit).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
W="$HERE/../../ios-native/Widget"
TMP="$(mktemp -d)"
for f in PowaHomeWidget.swift PowaWidgets.swift PowaWidgetIntents.swift PowaHealthWidgets.swift; do
  sed -E 's/, \.accessory(Circular|Rectangular|Inline)//g' "$W/$f" > "$TMP/$f"
done
xcrun -sdk macosx swiftc -parse-as-library -swift-version 5 -target arm64-apple-macos15.0 \
  -o "$TMP/render" "$HERE/shim.swift" "$HERE/render.swift" "$TMP"/*.swift
if [ "${1:-}" = "--split" ]; then
  DIR="${2:?usage: build.sh --split DIR}"
  case "$DIR" in /*) ;; *) DIR="$PWD/$DIR" ;; esac
  cd "$HERE" && "$TMP/render" --split "$DIR"
  exit 0
fi
OUT="${1:-${TMPDIR:-/tmp}/powa-widgets.png}"
case "$OUT" in /*) ;; *) OUT="$PWD/$OUT" ;; esac
cd "$HERE" && "$TMP/render" "$OUT"
