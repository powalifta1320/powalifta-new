# POWALIFTA test harness

Dev-only. Not shipped — `copy-web.sh` excludes `test/` from the native bundle,
and it's outside every served page.

## Unit tests (no dependencies)

Runs the whole `tests.html` assertion suite headlessly in Node — same pure
helpers (e1RM, variants, units, PRs, weekly delta, totals, signals, pager,
export, …) with a stubbed DOM + real `localStorage`.

```bash
node test/run-unit-tests.js
```

Exit code 0 = all executed tests pass. The fetch-based `importer (athlete.html)`
group only runs in a real browser and is reported as "not run headless" (not a
failure) — open `tests.html` in a browser for the full count.

Good for a pre-commit / CI gate on the shared logic in `app.js`.

## Coach alerts and the Monday report (no dependencies)

The report's core (`coach-report.js`, and that its copy in `supabase/functions/_shared` is
byte-identical), the server's push rules and grouping helpers, and `send-weekly-digest` run end to end
with its imports swapped for in-memory fakes (no Deno, no network: the secret gate, jobs by weekday,
dry runs that write nothing, the coach report's push and email, the Thursday push, paging).

```bash
node test/coach-report.test.mjs
node test/coach-jobs.test.mjs
node test/send-weekly-digest.test.mjs
```

## Mobile overflow check (needs puppeteer)

Loads every page at 375px in headless Chromium and asserts no horizontal
overflow (`scrollWidth <= innerWidth`) — the automated guard against the
off-edge / missing-safe-area class of mobile bugs.

```bash
npm i -g puppeteer            # one-time; intentionally not a repo dependency
node test/check-mobile-overflow.mjs
```

Without puppeteer it prints the enable step and skips (exit 0), so it never
blocks a machine that doesn't have a browser installed.

## Small-stuff scanner (needs playwright-core)

Opens 100 screens (the four demos in the iPhone layout, their sheets, the onboarding, every
public page at desktop and phone width, dark and light) and reports overlapping text or buttons,
text cut off by its box, sideways scroll, controls outside their card, side-by-side buttons that
don't match, tiny tap targets and unreadable text. Run it before every App Store build.

```bash
python3 -m http.server 4191 --bind 127.0.0.1     # from the repo root, in another tab
node test/uiscan.mjs /tmp/powa-uiscan             # screenshots + issues.json for anything found
```
