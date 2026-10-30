#!/usr/bin/env bash
# Rebuild opl-percentiles.json (Stronger than X%, night C 2026-10-30) from OpenPowerlifting's public-domain bulk CSV.
# Downloads the official zip into an empty folder of its own (data only, never run), streams the CSV out of it (never
# unzipped to disk), keeps each lifter's best per IPF class, writes the table, checks it, then deletes the download.
# Usage: bash test/opl-build/build.sh <empty work dir>    (then commit opl-percentiles.json and note the date in the vault)
# Built 2026-10-30 from openpowerlifting-2026-10-24 (sha256 of the zip 26be6b73f4b16ba5f4f8fb568f258d2c5ab165f379aed21e2489af9d0022afe7).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"; ROOT="$(cd "$HERE/../.." && pwd)"
W="${1:?an empty work dir}"; mkdir -p "$W/data"
curl -sS --fail -o "$W/data/opl.zip" https://openpowerlifting.gitlab.io/opl-csv/files/openpowerlifting-latest.zip
CSV="$(unzip -Z1 "$W/data/opl.zip" | grep -E '\.csv$' | head -1)"
DATE="$(echo "$CSV" | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | head -1)"
unzip -p "$W/data/opl.zip" "$CSV" | python3 -I "$HERE/filter.py" 2021-01-01 > "$W/filtered.tsv"
LC_ALL=C sort -t$'\t' -k1,1 -k2,2 -S 64M "$W/filtered.tsv" | python3 -I "$HERE/aggregate.py" "$DATE" 2021-01-01 100 > "$ROOT/opl-percentiles.json"
rm -f "$W/data/opl.zip" "$W/filtered.tsv"
python3 -I "$HERE/check.py" "$ROOT/opl-percentiles.json"
