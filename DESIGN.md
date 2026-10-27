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

The coach's desk (`html.desk`: at least 1000px wide, never the iPhone app) is a live coaching
platform: every set lands from the lifter's phone, with readiness from Apple Health, e1RM and RPE
read for the coach, pain, video, the season and the meet-day board. It is designed from those
strengths and never toward a spreadsheet: no "sheet" views or names, no cell-by-cell text tables as
a home, no two lines of grey text per cell. Phones and the app never see any of it. The system is
defined once at the top of desk.css; every desk rule (and meetday.css's `html.desk` block) reads it.

- Type, one family (Archivo), on the coach side's one scale (27 Oct polish): `--fs-1` and `--fs-2` 13
  (meta, counts, keys, buttons; colour and weight tell them apart) · `--fs-3` 15 (body, names in
  lists, inputs) · `--fs-4` 16 (row and card titles) · `--fs-5` 20 (section titles, an overlay's
  title, the block's name in the builder) · `--fs-6` 22 (a number) · `--fs-7` 28 (the page title).
  Every screen opens with the same 28 px display title on the same line and left edge (`--page-top`
  28, the rail + `--gut` 24 at every width): Today, Lifters, Programs, Meets, Teams, Messages,
  Clients, Club, Settings, the first run. Display numbers: 40 (the meet-day board), 56 (a lifter's
  total). No 12, 14 or 24. Tabular numbers in columns, proportional on a big standalone number.
  Avatar initials sit at 13, 11 in a 24 px face.
- Radius: `--r-1` 6 (controls: buttons, inputs, chips, menu items, badges) · `--r-2` 10 (inner
  surfaces: rows, menus, bubbles, week tabs) · `--r-3` 20 (cards and overlays: the app's card, every
  desk card, dialogs, the side card, Ask AI) · `--r-round` for avatars, dots, marks and set bars only. No pills on controls. A control nested in a 2px-padded control takes
  `--r-1 - 2px` so the corners stay concentric (segmented buttons).
- Space: 8pt, `--s-1`..`--s-7` = 4 8 12 16 24 32 48. Controls are 32 high (`--ctl-h`); icons 14 /
  16 / 18.
- Buttons, three tiers and an overflow: primary = the one fire action on a screen (Publish week N,
  Notify, Write the next block, Open the board, Invite on an empty roster) · secondary = a quiet fill
  (`.dk-btn`) · tertiary = text and icon, a fill on hover (`.is-quiet`) · everything else in the `⋯`
  menu. No outlined buttons, no dividers between buttons. A saved state is a dot and a few words
  (`.dk-state`), never a disabled button. Keys never sit on a button: they live in the tooltip.
- One badge style: a status is a 6px dot in its colour and the word in ink (`.dk-dot`, `.dk-chip`,
  the row's line on Today). Counts are plain tabular numbers (`.dk-btn-n`, `.dk-unread`), never a
  white disc; folded to icons, the rail's count is a 6px dot clear of the glyph.
- Colour budget: ink and surfaces; lift hues (squat `--dk-sq`, bench `--dk-bp`, deadlift `--dk-dl`)
  only on lift data (the lift dot, sparks); status colours (`--dk-ok` on target / live, `--dk-warn`
  over, `--dk-alert` a point or more over, missed, pain, `--dk-cool` under) only on a dot, a mark, a
  set bar or the gap word; `--dk-gold` for PRs and meets; fire red on the one action. On the desk
  the fire gradient is one step deeper than the phone's (`#dc2637` → `#c41a2c`) so its white label
  clears 4.5:1 top to bottom. Light-theme avatar hues are tokens (`--av-1-bg` / `--av-1-ink` ..
  `--av-8-*`), the dialog veil is `--dk-veil`, a tick box draws its tick from `--dk-cb-tick`.
- Nothing is drawn for an absent value: no dashes, no "–" cells. The slot stays empty and a
  visually hidden word (`.dk-nil`) tells a screen reader why. Status colour never sits on a number
  or a sentence (bodyweight over the class, drift, the Pain count): the dot carries it, the words
  stay ink.
- One card on every screen (`--dk-card`, `--dk-card-edge`, `--dk-card-lit`, `--dk-card-sheen`): the
  app's material lit from above, a hairline edge, a lit top edge and a soft sheen in dark; in light a
  white card with a hairline and a one-pixel shadow. No hue washes on tiles: the hue lives on the icon
  chip and the marks. Hairlines only between rows of one list, inset to the text.
- One red per screen, drafting included: a composer (the side card, Messages, Ask AI) sends with the
  secondary button and a voice note plays from a graphite one. Every `:hover` sits under
  `(hover: hover) and (pointer: fine)`; what a mouse reveals on hover is simply shown on touch.
- Motion: a screen arrives with a 140 ms fade (no travel); a lifter swaps in 120 ms; the side card and
  Ask AI slide 16 px from the right on the drawer curve; the palette never animates; everything is
  off under reduced motion. While the roster loads the desk shows its own shape (`.dk-skel`).
- Themes: dark by default (`#0a0a0c` ink); light is the app's light material, a soft grey canvas
  (`#f4f4f6`) with white cards and `#0b0b0d` ink, fills and hovers as ink at low alpha; role colours
  go one step deeper in light so status words and deltas clear AA. One token block per theme. The
  desk keeps its own choice under `powa-desk-theme` (the rail's Light mode, ⌘K, Settings), so
  `powa-theme` (the site and the lifter app) never turns it.
- Single-column screens (Club, Meets, Settings) share one page frame: `padding-inline: var(--gut)`
  and `max-width: var(--page-w)` (1040), so the left edge never jumps between screens.
- Layout: a text sidebar 232px (icons, 64px, below 1200 unless the coach opens it; the old
  `powa-desk-rail` key is ignored, `powa-desk-rail2` holds the choice); Today and the roster's list
  are two panes; the side card (thread or private notes) floats in on demand.
- Today: who needs you and why, worst first, one line each (the status word after its dot); the
  selected lifter's week opens beside it.
- Roster, the live board (`List | Board`, Board by default, V): one row per lifter with the ring of
  this week's sessions and the live dot, block and week; this week's sessions as outcome marks (on
  target, over, 1+ over, under, missed, to come; the detail on hover); readiness; RPE drift as a bar
  either side of zero; the e1RM spark; bodyweight against the class (the class a tick, the lifter a
  dot); the next meet as W-n (days inside two weeks); pain. Sortable (saved per view), filtered by the
  sidebar's views and the search, bulk select (X, or the box on hover), J/K, Enter opens the lifter.
  Columns step away as the pane narrows (bodyweight, readiness, e1RM): never a sideways scroll.
  RPE drift is read from the same program week the marks show; on target it is one faint tick and
  no number. e1RM carries its unit. Lifters with nothing to show yet (no week logged, no Health, no
  meet, no weigh-in) are one quiet line under the board with their names and "Write X's first block",
  never rows of empty slots.
- The lifter's week: session cards (one per training day, its state and date). Each exercise is one
  line: what was written, its sets as bars on an RPE 5.5-10 scale against the written RPE (a line;
  a range is a band), the top set in ink with the gap word only when off, then next week's block
  written in place with one suggestion from how it was lifted (Up to / Drop to / Load, taken in one
  click or Tab; Hold is a word; Swap, with a warn dot, when that lift hurt: a variant or 10% lighter).
  Videos and pain sit on the exercise they came from, their note on the session. A day not trained
  yet shows only what was written (the card head says "Not yet"); a line lifted exactly as written
  says so with a check, the sets in the tooltip. Written, bars and lifted sit left-packed. The
  suggestion slot has one width on every row (empty when there's nothing to suggest), so next
  week's fields end on one line; they write × like every other screen.
- How they are: readiness strips, never a table. Apple Health (sleep, resting HR, HRV) as 30-day
  lines over the lifter's own normal band, the latest in ink with a warn dot when outside it; the
  check-in as one line per question with its four weeks as marks (bar height for numbers, a dot for
  yes/no, hollow when not reported) and the latest answer in ink. "No check-ins before Oct 12" is
  said once. The header's facts end with a Ready / Readiness low dot.
- Programs, the block builder (`Sessions | Progression`, V): a header with the name, a quiet meta
  line (weeks, % logged, the maxes as a line with lift dots, the set fields) and one `⋯`; the block
  as a strip of week tabs (date, the meet's W-n in gold, a volume bar with the logged part in ink,
  the week's average RPE, "Now" on the week they're in; ← → or 1-9; + adds a week; the meet after
  the block sits at the end); one quiet bar of tools (Progress the block, Copy week, Templates, Team,
  Undo) ending in the save state or Notify, the one red. Sessions: the selected week's days as cards
  (two columns above 1180px of pane); each exercise one line: the lift dot and name, what's written
  in POWALIFTA notation (count×reps quiet, the load in ink, a % with its worked-out load beside it,
  an RPE-only block with "≈" the load its max points to, the effort, set fields small), edited in
  place over the drawing (the same parser as every builder; ↵ / ↑ ↓ save and move, Esc reverts,
  ⌘D same as the week before, ⌘⇧R progress it, ⌘Z undo); on a logged week the sets they lifted as
  bars on the same line, the top set and the gap word. Notes sit small under the line; "Add an
  exercise" takes "Pause squat 3x4 @7". Progression: each lift's planned top set across the block as
  a line in its lift colour, the lifted top sets as dots (ink on target, warn / alert over, cool
  under); a week's column opens that week with the lift in focus. Weeks between the block's end and
  its meet show as one hatched "Weeks 4–8 · 5 weeks not written" slot with Write them. Templates and past blocks read as
  the same weeks and cards with nothing to type into. The phone's set-by-set editor stays in `⋯`.
- An edit not yet published carries an ink mark (a small dot on a builder line, an outline on next
  week's field) until it goes out; a taken suggestion becomes a green check and ink words.
- Meets and the meet-day board: each meet row says, from the season, whether the block takes the
  lifter there ("Strength ends W-6 · 5 weeks not written") and "No attempts yet" in words. The
  board is lifter first: one row per lifter (name, lot, class, bodyweight), then three attempts per
  lift as the roster's outcome marks with the number beside each (planned hollow, declared ink,
  changed ink with a warn tick, good the ok dot, no lift an alert ring, struck through); no cell
  borders or column rules. Good lift / No lift are two equal quiet buttons, a status dot before an
  ink word; Board | Lifters and the flights are the one segmented control; the round's lifting order
  (who, the load, the time) fills the space under the board.
- Teams (Programs › Teams, desk-season.js): the team's name and one quiet line of facts, the weeks as one
  strip, then the loads: lifters down, the week's main sets across, each load an ink number over a 3px
  bar in its lift colour (against the team's heaviest), a small ink mark where you adjusted one lifter;
  click a load to adjust it. Push to team (the one red) opens a preview first: who gets what, logged sets
  kept, Keep | Overwrite per adjusted lifter, who is skipped and why. The team's week below as read-only
  session cards with Progress week N.
- The roster calendar (Board | List | Calendar): the same rows, 16 week columns, blocks as bars in four
  greys by phase (name and W-n in gold inside, or beside a bar under three weeks), meets as gold diamonds
  (planned outlined, done filled with the total), today a thin ink line, one warning line per row in plain
  words with a warn dot. Drag a bar (or ← →) moves its start; it settles on the week. Plan a meet is the
  calendar's one red, and a quiet flag on each row.
- A block's last week: the session cards take 55% and a side card takes the rest: what the block did
  (each lift's e1RM before → in it, the delta in ink), then Write the next block (the red) and The same
  block, heavier.
- First run leads with what only a live platform does: Invite your lifters (the fire action), then
  Write their first block, with "Or paste a block you already wrote" as a quiet link. The coaching
  style cards show which one counts (a filled card and a check).
- Motion, quiet and about state: 120-260ms, `cubic-bezier(0.23, 1, 0.32, 1)`; a set that just landed
  grows its bar once and pulses its board row; a live session's mark breathes; rows reorder with
  FLIP; the side card slides in 16px. All of it off under reduced motion.

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
| A status as one hanging dot beside grey text, wrapped lines on the text's edge (Needs attention, W6) | The whole reason sentence in salmon on every row |
| Row icons as a tinted glyph, the hue at 15% behind it (`.yr-ic`, tool tiles) | Solid colour squares down a settings list |
| Builder exercises as rows of their day with inset hairlines | An exercise tile inside the day card with chips inside the tile |
| A long prescription chip wraps inside itself | An ellipsis cutting off the coach's own words |
| Each tool icon in its destination's hue (meet gold, weigh-in teal) | Six identical icons, or a colour wash on each tile |
| Sheet title, subtitle and fields on one left edge | A subtitle nudged 4px in from its title |
