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

The landing page must speak to all three without diluting. Athletes are the volume;
coaches are the revenue. The hero already triages with three CTAs (Train solo / Join
your coach / Become a coach) — keep that triage sharp.

## Brand personality

Three physical-object words: **iron, chalk, precision.**

- **Iron** — heavy, uncompromising, matte-black gym at 6am. Not glossy SaaS.
- **Chalk** — the texture of effort. White dust on a black bar. Grit, not polish-for-polish's-sake.
- **Precision** — RPE math, variant multipliers, e1RM to the kilo. The brand is *smart*
  about strength, not just loud about it. Data is the proof.

Tone: confident, terse, athlete-to-athlete. ALL CAPS display headlines (Anton),
sentence-case body. Never corporate, never hype-bro. "Stop training in a spreadsheet"
is the energy — a real problem stated flatly.

## Aesthetic lane (named reference)

**Linear/Vercel structural rigor × a fight-poster's heat.** Dark near-black canvas,
one committed red (`#ff2d3f`) used as a weapon not a garnish, Anton condensed display
doing the shouting, data-viz (the e1RM chart, progress bars, plate calc) as the hero
imagery. NOT editorial-magazine (no serif drop-caps), NOT pastel SaaS, NOT glassy
crypto-gradient. Think: the strength-sport equivalent of a Linear release page that
got into powerlifting.

## Existing brand tokens (DO NOT reinvent — these ARE the identity)

- Background `#0b0b0c`; surfaces step up from there.
- Primary red `#ff2d3f` (deep variant `#b71629`). Accents: gold `#ffb547`, green `#4ed884`.
- Display: **Anton** (the condensed all-caps shout). Body: **Plus Jakarta Sans**.
  Mono/chart labels: **Space Grotesk**. These are committed identity fonts — the
  reflex-reject list does not apply; identity-preservation wins.
- Radii `--r-sm 6px`, `--r-lg 14px`. Caps eyebrows, sentence-case body.

The brief is explicit: **same soul, sharper execution.** Push palette/type/spacing/
motion further within these tokens. Do not swap the red, do not swap Anton, do not
go light-mode-first.

## Anti-references (what "godly-professional" must NOT look like)

- **"Templated AI page."** The user's exact fear. The brand slop test is the bar:
  if someone could say "AI made this" without hesitation, it failed.
- Generic SaaS hero: centered headline + two pill buttons + three evenly-spaced
  feature cards with rounded-corner icons above each heading. We already have some
  of this scaffolding (`.feat-grid` icon-above-heading) — it's the #1 thing to make
  feel intentional rather than default.
- Repeated tiny uppercase tracked `.section-tag` kickers above every single `<h2>`.
  Currently every section has one. Keep them only where they earn it; vary the rhythm.
- Evenly-weighted everything. Award-worthy pages have a dominant idea per fold and
  deliberate pacing — peaks and valleys, not a uniform grid scroll.

## Design principles for this pass

1. **The data IS the imagery.** The e1RM chart, the +18% pill, the plate-calc SVG,
   the progress bars — these are POWALIFTA's proof and its hero art. Elevate them;
   never replace them with decorative blocks.
2. **One red, wielded.** Restraint then strike. Red earns attention because most of
   the page withholds it.
3. **Type does the shouting.** Anton at genuine display scale with committed contrast
   (≥1.25 modular ratio, fluid clamp). Flat scales read as uncommitted.
4. **Motion with intent.** One orchestrated hero load beats scattered fade-ins.
   Everything respects `prefers-reduced-motion`. Animation lives in the `fx-*` modules.
5. **Signature elements are sacred:** +18% counter, hero chart card, marketplace
   teaser, pricing band. Elevate, don't gut.

## Hard constraints (technical, non-negotiable)

- Vanilla JS, hand-written CSS, **no build step, no frameworks.** Vercel serves raw.
- Animation goes in existing `fx-*` modules (hero-fx, scroll-fx, ui-fx, insane-fx).
- `prefers-reduced-motion` honored everywhere.
- Do not break critical fixes (rest day, pin re-render, demo mode `?demo=1`).
- Keep `data-fx` attributes in sync if hero markup is touched.

## Accessibility & inclusion

- Contrast: red `#ff2d3f` on `#0b0b0c` passes for large/display text; verify any
  red-on-dark used at body size. Light text on dark gets +0.05–0.1 line-height.
- Every motion path needs a reduced-motion fallback (already the module convention).
- Skip-link present; keep focus rings visible (red focus rings via ui-fx).
- Charts/SVGs need text alternatives or adjacent legible labels — don't let the
  data-as-imagery principle strand screen-reader users.
