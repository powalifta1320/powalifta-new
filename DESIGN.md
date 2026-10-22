---
name: POWALIFTA
description: Built for the barbell. A dark, native-feeling powerlifting app where the data is the imagery.
colors:
  bg: "#050506"
  bg-1: "#0f0f11"
  bg-2: "#161619"
  bg-3: "#1e1e22"
  text: "#f4f4f6"
  fire: "#ee2b3b"
  fire-top: "#ff4a55"
  brand-red: "#ff2d3f"
  lift-squat: "#38c6ff"
  lift-bench: "#a98bff"
  lift-deadlift: "#ffbf3c"
  lift-acc: "#9a9aa6"
  pr: "#f2c25b"
  ok: "#34d982"
  warn: "#ff9f43"
  soft-alert: "#ff8f80"
  bw: "#5ac8fa"
  instagram: "#ff5c93"
  fill-1: "#ffffff09"
  fill-2: "#ffffff0f"
  fill-3: "#ffffff14"
  fill-4: "#ffffff24"
  hair: "#ffffff12"
typography:
  display:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 750
    lineHeight: 1.05
    letterSpacing: "-0.028em"
  title:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 700
    letterSpacing: "-0.018em"
  row:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 650
  body:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 450
    lineHeight: 1.45
  control:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
  meta:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
  label:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 650
  num:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 700
  num-xl:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontSize: "44px"
    fontWeight: 700
    letterSpacing: "-0.02em"
rounded:
  ctl: "12px"
  inner: "14px"
  card: "20px"
  chip: "999px"
spacing:
  gutter: "16px"
  card-pad: "16px"
  stack: "12px"
  section: "28px"
components:
  button-primary:
    backgroundColor: "{colors.fire}"
    textColor: "{colors.text}"
    rounded: "{rounded.chip}"
    height: "52px"
  button-soft:
    backgroundColor: "{colors.fill-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.chip}"
    height: "44px"
  card:
    backgroundColor: "{colors.bg-1}"
    rounded: "{rounded.card}"
    padding: "16px"
  row-inner:
    backgroundColor: "{colors.fill-1}"
    rounded: "{rounded.inner}"
  chip:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.chip}"
    height: "30px"
  field:
    backgroundColor: "{colors.fill-3}"
    rounded: "{rounded.ctl}"
    height: "42px"
  instagram-chip:
    backgroundColor: "{colors.fill-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.chip}"
    height: "30px"
---

# POWALIFTA design system

Source of truth in code: `styles.css` (the "UI v3 · LIVING DARK" → "UI v6 · ALIVE" layers at the end, with
the v6 system tokens at the top of the v6 block) and the `ui*` builders in `app.js`. The website pages keep
their own marketing layer; this file is about the app (athlete + coach dashboards, native iOS shell).

## Overview

A 6 am gym with the lights half on: matte black, chalk, one red. The app is a tool you use between sets, so
it reads like a native iOS app, not a website: large sentence-case titles, grouped lists, bottom sheets, a
floating glass tab bar. Premium comes from restraint (one red action per screen, ink numbers, no glows) and
character comes from things only a powerlifting app has: the bar loaded with real plates, RPE as a felt
scale from green to red, podiums and club records, lift colours that follow a lift everywhere.

Rules that decide "cheap" vs "premium" (from owner reviews, 2026-10):
- One family (Archivo) at normal width. Wide caps survive only in the POWALIFTA wordmark.
- Sentence case everywhere; caps only for true acronyms (RPE, PR, DOTS). Units lowercase (kg, lb).
- Colour has a job or it isn't there. Numbers are ink; colour marks a real delta, a lift, a person or a status.
- One shape system (rounded tokens below). Nothing nests a card in a card.
- Features with character beat decoration: when a screen feels plain, add something to do or something only
  this app knows, not another gradient.

## Colors

- **Canvas** `bg` with three neutral surfaces `bg-1..3`. Inside surfaces, neutrals are `fill-1..4`
  (white-alpha on dark, ink-alpha on the light website theme: one token, both themes) and `hair` separators,
  which are inset where the text starts.
- **Primary action**: `fire`, a vertical machined red (`fire-top` → `fire`), no glow. One per screen.
  `brand-red` is for true alerts only.
- **Lift identity**: squat `lift-squat`, bench `lift-bench`, deadlift `lift-deadlift`, accessories `lift-acc`.
  Used for dots, tiles, cards, chart lines, set cards, plates never (plates use IPF competition colours).
- **Roles**: `pr` gold for PRs, crowns, medals and lift of the week; `ok` for done/trained/up; `warn` and
  `soft-alert` for watch/needs-you; `bw` for bodyweight; `instagram` pink only on the Instagram glyph.
- **People**: a stable muted tint per name (`avatarHue()` → `.av-h0..7`); register new avatar classes in
  `AVATAR_SEL`.
- **Destinations** tint their stage light and heroes: Train/Roster fire, Progress/Program cyan, Club gold,
  Coach/Messages green, You violet (`body[data-accent]`, `--acc`).

## Typography

Archivo, product scale with fixed px steps (`--fs-*` on `body.powa-app`): label 11 · meta 13 · control 14
(`--fs-sm`) · body 15 · row 16 · title 20 · num 22 · num-xl 44 · display 28/32. Inputs stay 16px (iOS zooms
smaller fields). Numbers use `--font-num` (tabular). Big display numbers in sheets (40–54px) are the only
off-scale sizes and are deliberate. Never letter-space tighter than -0.03em.

## Elevation

Flat-dark with light, not shadow: surfaces are `bg-1` with a 1px `--edge` border and a faint top highlight
(`--lit`). Heroes get one soft corner light in the screen's accent. The barbell and set cards carry a soft
drop shadow so the plates read as objects. Glass (`backdrop-filter`) is reserved for fixed chrome: tab bar,
top bar, chat composer, toasts, the reaction picker. Motion tokens: `--t-press` 150ms (press feedback),
`--t-state` 220ms (state changes), `--t-enter` 420ms (entrances, plates sliding on, podium rising), all on
`--ease-out-quint`. No bounce. Every animation has a reduced-motion fallback; motion shows state (a set
logged, the next set arriving), never decoration.

## Components

Built in `app.js`; reuse them before writing new markup.
- `uiRow` / `uiList` (grouped rows, inset separators) · `uiLabel` (20px section title, optional count/action)
- `uiStats` (three numbers) · `uiRing` / `uiRingHero` · `uiEmpty`
- `uiSheet(title, build)` form sheet · `uiActionSheet` menu · `uiSwitch` · `uiStepper` (− value +, typeable)
- `uiRpeScale` RPE 6–10 with "reps left in the tank" · `uiBarbell(kg)` + `plateChipsHtml` the loaded bar
- `toastAction` toast with one action · `uiLongPress` · `reactionChips` (used reactions + one add button)
  + `openReactionPicker`
- `uiInstagramChip(handle)` the "@handle" link (`{big:true}` on lifter cards); handles go through
  `normalizeInstagram()` and open only `instagram.com/<handle>`.
- `uiTikTokChip(handle)` the same pill for TikTok (ink glyph: TikTok's brand is black and white), and
  `uiSocialChips(model)` = Instagram + TikTok side by side, whichever the lifter has. Handles go through
  `normalizeTikTok()` and open only `tiktok.com/@<handle>`.
- `uiRpeScale(value, onPick, { target, simple })`: the planned RPE gets the one quiet tick; `simple`
  (new lifters) shows five "reps left" buttons 4+ · 3 · 2 · 1 · 0 instead of nine numbers.
- Screen patterns: Train NOW card (`buildTodayHero`), exercise card (`buildExerciseCard`), lifter card
  (`openLifterCard`), athlete quick look (`openAthleteSheet`), meet / plate / load sheets.

Every interactive element has press feedback (`:active` scale ≈0.94–0.97 or a fill step) and a visible
focus ring on the web. Touch targets are at least 44px.

## Desk (laptop coach, `desk.css`)

The coach's desk (`html.desk`: at least 1000px wide, never the iPhone app) is denser than the phone
and has its own small scale. Phones and the app never see it.

- Radius: 10px rows, cards and panes; 8px controls (rail items, icon buttons, menu items); 12px menus;
  16px dialogs; 6px keycaps and tiny marks; capsules (999px) for buttons, chips and badges.
- Rows: `--row-h` 44px, 36px compact (the density toggle). Table type 13px tabular, section titles 16px.
- Status tokens, used only on flags (dark / light, light measured at 4.5:1 or better on their 13% tint):
  `--dk-alert` soft-alert / `#a8192b` (pain, a set 1.5+ RPE over); `--dk-warn` soft-warn / `#8a4500`
  (quiet, drift, block done); `--dk-gold` `#ffc23d` / `#7a4f00` (PRs, meets); `--dk-ok` `#34d982` / `#0f7d47`.
- No stage light, no tinted washes: plain `--bg` surfaces. Red only on the one primary action and pain.
- Avatars are muted tints in both themes (light: about 12% of the hue, initials in its dark ink).
- Three button weights (W1b): the red primary (one per screen: Message / Reply / Publish / Assign),
  the ink button (`.dk-btn.is-ink`, text-on-ink) for a strong second action such as Apply next week
  or Save, and the bordered / quiet buttons for the rest. A disabled ink button goes to a hairline.
- An edit not yet published or applied carries a 1px ink outline (grid cells, next-week inputs) until
  it goes out; nothing else outlines in ink.
- Tables inside a pane fold columns by the pane's width (container queries), never by the window:
  the workspace folds "written" under the exercise name below 640px; Programs drops the block size,
  then the maxes, then the Grid/Weeks toggle into ⋯ as the inspector narrows it.

## Do's and Don'ts

| Do | Don't |
|---|---|
| Use the tokens: `--fill-*`, `--hair`, `--r-*`, `--fs-*`, `--t-*`, role colours | Hard-code white-alpha fills, new radii or one-off font sizes |
| One red primary per screen | Red text for warnings (use `soft-alert`) or a second red button |
| Show the real thing: plates, lift colours, the podium | Decorative gradients, glows, glassmorphism on content |
| Sentence case, lowercase units, ink numbers | ALL-CAPS micro-labels, "KG", numbers tinted for decoration |
| Bottom sheets for tasks, action sheets for menus | Web modals, `confirm()`, `prompt()` inside the app |
| Animate state changes 150–420ms with ease-out | Bounce, elastic, or entrance choreography on every list |
| Test in the iOS simulator and the light website theme | Ship a component that only works in dark |
| Say each fact once (calm, v7): the target lives on the scale, plates in the bar | Repeat it as a pill, a sub-line and a read-out on the same card |
| Show tools where the lifter is: the current exercise only | The same three chips on every exercise card |
| Flat lists with inset separators inside a card | A tile per row, a card inside a card |
| Colour where something is being chosen (the RPE pick, a real delta) | A rainbow of RPE colours on every row |
