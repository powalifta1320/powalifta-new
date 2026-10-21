# PRODUCT.md — POWALIFTA

> Anchor for the `impeccable` design pipeline. Synthesized from CLAUDE.md + the
> landing-page elevation brief. Register: **brand** (the landing page IS the product
> impression — `index.html`).

## Register

**Brand.** `index.html` is a marketing surface: a visitor's gut impression in the
first 3 seconds is the thing being made. The app dashboards (athlete/coach) are
**utility** register and out of scope for this pass.

## Product purpose

POWALIFTA is a powerlifting platform — RPE-native programming, automatic e1RM
tracking, variant-aware strength math. Free for athletes forever; paid tiers for
coaches past 3 athletes. There's a public marketplace where coaches sell programs.

**Tagline:** Built for the barbell.

## Users

- **Solo athletes** — track their own training, no coach. Want it free and frictionless.
- **Coached athletes** — execute a coach's program, log RPE, watch e1RM climb.
- **Coaches** — build programs, manage a roster, sell on the marketplace. The monetizing audience.

The website must speak to all three without diluting. Solo lifters are the volume
(downloads), coaches are the revenue. The hero has one red action (Start free) beside
the App Store badge; the coach path is a link in the hero and its own section.

## Brand personality

Three physical-object words: **iron, chalk, precision.**

- **Iron** — heavy, uncompromising, matte-black gym at 6am. Not glossy SaaS.
- **Chalk** — the texture of effort. Grit, not polish-for-polish's-sake.
- **Precision** — RPE math, variant multipliers, e1RM to the kilo. The brand is *smart*
  about strength, not loud about it. Data is the proof.

Tone: confident, terse, athlete-to-athlete. Sentence case everywhere (the owner judged
wide capitals and glowing italic accents "cheap", 2026-10). Never corporate, never
hype-bro. "Stop training in a spreadsheet" is the energy: a real problem stated flatly.
Never claim what isn't true (no fake user counts, no "most coaches choose").

## Aesthetic lane (named reference)

**The app itself.** Since the 2026-10-22 redesign the website is a showcase of the
iPhone app in the app's own language: obsidian surfaces lit from above, hairlines,
Archivo in sentence case, one machined red button, and each section lit in the hue of
the app tab it shows (Train fire, Progress/Program cyan, Club gold, coaching green),
with the real app screens in a phone frame as the imagery. The one contrast moment is
the meet-day slab (black, condensed capitals, monospace, three white lights), which is
the app's own meet-day system. NOT editorial-magazine, NOT pastel SaaS, NOT glassy
crypto-gradient, NOT a fight poster.

## Brand tokens (identity: don't reinvent)

- Background `#060607` on the site (the app's v4 obsidian); surfaces `--bg-1..3`, hairlines
  `rgba(255,255,255,.075/.13)`. Light theme exists and must keep working.
- Action red: the machined gradient `#ff4a55 → #ee2b3b`, no glow. Brand red `#ff2d3f`
  lives in the logo plate and the meet-day rule.
- Lift colours: squat `#38c6ff`, bench `#a98bff`, deadlift `#ffbf3c`.
- Type: **Archivo** only (variable width/weight). Display = 800 weight, normal to 108%
  width, tight tracking; caps only in the POWALIFTA wordmark.
- Shapes: capsule buttons and chips; cards 16–28px radius; phone frames drawn in CSS.

## Anti-references

- **"Templated AI page."** If someone could say "AI made this" without hesitation, it failed.
- Centered hero + three icon-above-heading feature cards. Features are told with the
  real screen + a short inset list of facts instead.
- Tiny uppercase tracked kickers above every heading. The site's section marker is the
  app tab icon + name in its hue, because it maps to a real place in the app.
- Glows, red washes behind sections, gradient text, decorative particles. All removed.

## Design principles

1. **The app is the imagery.** Real screens (re-captured from `?demo=1` when the app
   changes) beat mock-ups and decorative blocks.
2. **One red, rationed.** One red button per viewport; colour otherwise has a job
   (tab hue, lift colour, status).
3. **Type in sentence case, scale with intent.** One display headline per page.
4. **Motion with intent.** One orchestrated hero load (copy, phone, two live chips);
   below-the-fold sections rise in once. Content is never hidden by default.
5. **Only show what's real.** The coach directory and programs teaser stay hidden until
   there are three real entries.

## Hard constraints (technical, non-negotiable)

- Vanilla JS, hand-written CSS, **no build step, no frameworks.** Vercel serves raw.
- Website styling lives in `site.css` (`s-*` classes, `body.site`), behaviour in `site.js`.
- `prefers-reduced-motion` honored everywhere.
- Do not break critical fixes (rest day, pin re-render, demo mode `?demo=1`) or the
  native welcome (`#nativeWelcome`), the auth modals and the calculator ids on index.html.

## Accessibility & inclusion

- Body text ≥ 4.5:1; the site uses `--text-2` (#b9b9c1) on obsidian for body copy.
- Every motion path has a reduced-motion fallback.
- Skip-link present; focus rings visible (cyan outline on the site).
- Screens in phone frames carry descriptive alt text.


## App register (athlete + coach dashboards, native iOS)

Product register, but the owner rejected Restrained-graphite as "grey, dead, plain"
(2026-10-16). App surfaces use a **full palette with roles**: brand fire for the one
primary action, one accent hue per destination for wayfinding (Train/Roster fire,
Progress/Program cyan, Club gold, Coach/Messages green, You violet), lift identity
colours (squat cyan, bench iris, deadlift gold), a stable colour per person, semantic
green/orange. Depth (lit surfaces, accent glow) and motion (press feedback, staggered
entrances, rings, count-ups) are part of the system — "UI v3 · LIVING DARK" in
styles.css. In the iOS app everything must read native: sheets from the bottom, step
flows, a tab bar with a gliding pill — never the website squeezed into a phone.
