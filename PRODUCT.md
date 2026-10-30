# PRODUCT.md — POWALIFTA

> Anchor for the `impeccable` design pipeline. The website's part (Register to Accessibility) is the context
> of the homepage the owner approved on 29 Oct ("A coach's week, on the real product"), synthesised from the
> earlier PRODUCT.md and the owner's recorded decisions of 28 and 29 Oct; where they differ, the owner's newest
> words win. Nothing here was invented for this file. Register: **brand** for `index.html` and the public pages;
> the dashboards and the iPhone app are the **product** register (App register, at the end).

## Register

brand

## Users

- **Serious powerlifting coaches** (the paying audience): online first, 5 to 60 tested lifters each,
  about 22 months per lifter. They judge a tool by whether it shows their own week: who needs them,
  what changed, what's next, and the minute after the lights on meet day.
- **Their lifters**: log every set and how hard it felt (RPE); the app works out their max (e1RM). Free forever.
- **Solo lifters**: the volume; same lifter app, no coach.
- The owner judges at 1440 x 775 in Brave and on his iPhone (393 x 852). He gives a page three seconds.

## Product Purpose

POWALIFTA is one app with two sides: the lifter's phone and the coach's screen. Sets land live with
their load, reps and RPE; the app works out each max; the coach sees every set, the whole team worst
first, and runs meet day. Free for lifters; coaches get three lifters free, then Basic $24.99 (4 to 10),
Pro $49.99 (11 to 25), Premium $99.99 (26+). Success for the website: in three seconds a visitor can say
what it is and who it is for, and a serious coach recognises his own job in it.

## Brand Personality

Iron, chalk, precision. Calm tool, loud sport: the sport supplies the drama (the set, the lights, the
minute), the interface supplies the calm. Voice: the lifter first, then the fact, then the reason; the
sport's words; sentence case; short declaratives; numerals with the unit after a no-break space; no hype,
no exclamation marks, no em dashes, at most one middle dot per line.

## Anti-references

- The owner's rejected rounds: an effects layer (marquee, chalk particles, mouse-follow glow, 3D barbell,
  steel gradient text); lit phone frames repeated per section; dark SaaS with stat rows ("One Tuesday");
  a pinned phone story and a desk tour that cycles by itself ("overwhelming, way too AI generated");
  a brand board built on competition-plate colours and plate/bar renders ("ass", "doesn't feel like our app");
  a giant number with no context ("I don't understand what that is").
- Generic AI SaaS: a centred hero over icon cards, stat counters, logo walls, testimonials, eyebrow labels,
  bento grids, a punchline close, gradient text, glows, red washes, particles.
- Any comparison with spreadsheets or named competitors; any fake number, testimonial or logo.

## Design Principles

1. **The app is the brand.** Its colours (per-destination hues as light, lift colours on lift data, gold
   for PRs), Archivo in three roles, big numbers, real screens in the iPhone app layout or the desk at
   true size. No new tokens; no barbell, plate or lamp pictures.
2. **Plain words first.** What it is and who it is for, in the first frame, with the app recognisable.
   Big numbers only after context, always with a plain label.
3. **One crimson action per screen** (#dc2637 to #c41a2c, white label). Colour otherwise has a job.
4. **Show the coach's real job.** One set from the lifter's phone to the coach's laptop and back; worst
   first; meet day's minute. One roster per page; numbers that add up.
5. **Motion the reader drives.** 8 to 12 moments, each a scroll or a state change, critically damped,
   nothing loops, numbers move old to new, a designed still for reduced motion, readable without JS.

## Accessibility & Inclusion

WCAG 2.1 AA: text contrast 4.5:1 (3:1 large), visible focus, keyboard reachable controls (the meet-day
plan picker is a radio group), every product image with descriptive alt text, reduced motion honoured as
a designed still, nothing hidden until a reveal fires, no information by colour alone (flags carry words).

## Hard constraints (technical, non-negotiable)

- Vanilla JS, hand-written CSS, **no build step, no frameworks.** Vercel serves raw; third-party code is
  vendored (GSAP 3.15 in `vendor/gsap-3.15.0/`) and loaded async or deferred.
- Website styling: `site.css` for every public page (Archivo self-hosted, the bar, the footer, the inside
  pages' `s-*` classes under `body.site`); the homepage's own `home.css` + `home.js` (`body.home`).
- `prefers-reduced-motion` honoured everywhere: the designed still, never a hidden page.
- Do not break critical fixes (rest day, pin re-render, demo mode `?demo=1`) or the
  native welcome (`#nativeWelcome`), the auth modals and the calculator ids on index.html.

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
