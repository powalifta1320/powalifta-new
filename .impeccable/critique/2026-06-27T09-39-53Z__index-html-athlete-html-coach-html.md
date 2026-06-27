---
target: index.html athlete.html coach.html
total_score: 31
p0_count: 0
p1_count: 1
timestamp: 2026-06-27T09-39-53Z
slug: index-html-athlete-html-coach-html
---
# Critique — POWALIFTA (index.html landing + athlete/coach dashboards)

Mixed-register review: index.html in BRAND register, athlete.html/coach.html in PRODUCT register. Live-inspected on localhost + deterministic detector.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Rich state (IN PROGRESS, 0/7 sets, unread dots, check-in pending) but spinners not skeletons |
| 2 | Match System / Real World | 4 | Fluent powerlifting vocabulary (RPE, e1RM, openers, top sets); jargon unexplained for first-timers |
| 3 | User Control & Freedom | 3 | Tabs, unpin, rest-day, skippable tour; modal cancel paths unverified |
| 4 | Consistency & Standards | 3 | Strong button/heading vocab, but side-stripe inconsistencies + two near-identical red-box treatments |
| 5 | Error Prevention | 3 | Demo "nothing saves"; confirm-on-destructive not fully verified |
| 6 | Recognition vs Recall | 4 | Labeled tabs (icon+text), visible controls, tap-to-plate-calc |
| 7 | Flexibility & Efficiency | 2 | No keyboard shortcuts, no bulk roster actions; everything click-only |
| 8 | Aesthetic & Minimalist | 3 | Clean hierarchy; demo callout overlap hurts |
| 9 | Error Recovery | 3 | Plain-language errors assumed, not deeply verified |
| 10 | Help & Documentation | 3 | 6-step onboarding tour + FAQ; contextual help present |
| **Total** | | **31/40** | **Good — solid foundation, address weak areas** |

## Anti-Patterns Verdict

**LLM assessment:** This does NOT read as AI slop. The landing page has a committed identity — Anton display caps, red italic "BARBELL", ghost wordmark, dot-grid field, and a genuinely interactive e1RM calculator (live proof, not a static hero screenshot). The dashboards pass the product-slop test: a lifter fluent in good tools would trust them. Earned familiarity, not strangeness.

**Deterministic scan (detector):** index.html CLEAN. Dashboards: 3 side-stripe borders in athlete.html inline `<style>` (lines 2316 gold, 2490 red, 2706 red) — same tell already fixed in styles.css but not in the page-level block; coach.html flags em-dash overuse (6+ in body copy). athlete helper copy shows the same em-dash cadence.

## Overall Impression

A confident, well-built product with a real point of view. The biggest single opportunity is the demo-mode experience: the floating "Live demo" callout — the first hands-on surface for prospects arriving from the hero "Try the live demo" link — overlaps real content on every pane.

## What's Working

1. **Brand identity + live hero.** Anton/red/ghost-wordmark/dot-grid hero with an interactive e1RM calculator. Reads as a product with conviction.
2. **Domain-fluent content.** RPE, e1RM, openers, paused reps; realistic athlete names + notes (Arjun, Sarah, Tom). Earns trust with the actual audience.
3. **Accessible foundation.** Scroll reveals correctly enhance an already-visible default (`.pre-reveal` added by JS, reduced-motion forces opacity:1) so crawlers/no-JS see content; contrast clears AA on every text token (mutest gray 5.17:1, red 5.34, gold 11.2); labeled tabs.

## Priority Issues

- **[P1] Demo callout overlaps content on every pane.** The fixed-position "Live demo … Start yours free" pill sits over real cards (athlete: "0/7 SETS DONE", "…rt history"; coach: "Codes you've generated"). This is the prospect's first hands-on impression. Fix: reposition to a corner with safe-area padding or a non-covering bottom bar; never overlap interactive cards. Likely worse on mobile. → /impeccable layout
- **[P2] Em-dash overuse in body copy.** Helper text leans on em-dashes throughout ("Status at a glance — click any card", "log your real RPE", "what your coach prescribed —"). AI-cadence tell + tiring. Fix: vary punctuation. → /impeccable clarify
- **[P2] Three inline side-stripe borders in athlete.html.** Lines 2316/2490/2706 — the most recognizable AI tell, already removed from styles.css but not the page block. Fix: full border or background tint. → /impeccable quieter
- **[P2] Two competing red-box treatments.** Active-tab indicator and the onboarding tour spotlight are near-identical red boxes; on the Progress pane the tour boxed "Today" while Progress was active — two red boxes at once, ambiguous. Fix: differentiate (active = underline/fill; spotlight = distinct). → /impeccable polish
- **[P2] No power-user accelerators.** Alex: no keyboard shortcuts, no bulk roster actions; set-ticking and RPE entry are click-only in a daily-use logging tool. Fix: keyboard set-tick / number-key RPE, roster bulk actions. → /impeccable harden
- **[P3] 7 athlete top-level tabs.** Today/Full program/Progress/Bodyweight/Coach/My library/Marketplace exceeds the ~5 nav guideline; Marketplace + My library could group. Minor cognitive load.

## Persona Red Flags

**Jordan (first-timer):** RPE / e1RM / DOTS / SBD appear unexplained on first contact; the landing calculator and tour soften this but the dashboard assumes fluency.
**Casey (mobile):** Not fully tested at mobile width — but the demo callout overlap will be worse on small screens where there's less room to avoid covering cards.
**Alex (power user):** No keyboard shortcuts or bulk actions detected; 7 click-only tabs.
**Sam (accessibility):** Contrast passes AA everywhere (verified). Watch: unread state is conveyed by a red dot (color-only, though "2 NEED A REPLY" gives a text backstop); verify focus order through the tour/modal.

## Minor Observations

- White-on-red button label (`#fff` on `#ff2d3f`) is ~3.4:1 — fine for bold/large, below 4.5 for small.
- Onboarding tour auto-fires in demo; good for teaching, has Skip, but interrupts immediately.
- Demo stat values are very low (28/18/34kg) — realistic-but-tiny; fine for a fake lifter.

## Questions to Consider

- What does a prospect see in the *first 5 seconds* of the live demo — and does anything cover it?
- Could the daily set-logging flow be driven entirely from the keyboard for a lifter mid-session with chalky hands?
- Do the active-tab and tour-spotlight need to look so alike, or should "where am I" and "look here" read differently?
