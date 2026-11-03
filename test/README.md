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

## Sessions in a URL (no dependencies)

Which sign-in sessions in an address db.js lets supabase-js take (login CSRF, security sweep of
28 Oct): this tab's own Apple/Google return yes, a reset link only on reset-password.html (its own
unsaved client), anything else refused and cleaned out of the address. db.js runs in a vm against a
stub client, so nothing reaches Supabase.

```bash
node test/url-session.test.cjs
```

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

The Monday report's v2 (2 Nov) runs on one world for both, `test/coach-report-fixture.mjs`: five coaches as the
database's rows (Sam Ellis and the demo team of 20, 3 lifters on the free plan in lbs, 60 lifters, one with no
billing or meets, a dormant one), the same world as the app's Store, and the RPCs answered as the SQL does. The core's
effort is checked against the app's own Effort functions (clEffort, caEffortOf / caEffortSplit / caEffortBins),
lifted out of their files.

The SQL itself (`sql/migration-coach-report-v2-2026-11-02.sql`) against `coach-report.js` in PGlite (needs PGlite,
not a repo dependency; without it the test says so and skips): the migration twice after rows 53 and 56,
coach_week_stats' old answers kept and its 4-week windows equal to the app's, planned sessions and weeks left (drafts
skipped) and the effort sets equal to the JS on 600+ generated blocks, the threads' last message (never its words),
service_role only, STATUS-check row 63 false before and true after.

```bash
PGLITE=/path/to/@electric-sql/pglite/dist/index.js node test/coach-report-sql.test.mjs
```

When the report comes (2 Nov): each coach picks Sunday evening or Monday morning, the hour, in their time zone. The
pick's columns and their own-row policies in PGlite, and the app's quiet time-zone save (awaited: tests.html's runner
doesn't await):

```bash
PGLITE=/path/to/@electric-sql/pglite/dist/index.js node test/coach-report-schedule-sql.test.mjs
node test/coach-report-ui.test.mjs
```

## Applications to a coach (no dependencies)

The apply-to-coach edge function end to end under Node, the supabase client, web-push and fetch faked: the gate the
profile's form waits for, the limits (per IP, per email silently, everyone), the honeypot, the confirm link and its
hash, the database's own words, a failed email, the confirm with the coach's push and email (never the note).
The SQL itself is tested in PGlite (scratchpad/pgtest/coach-applications-test.mjs).

```bash
node test/apply-to-coach.test.mjs
```

## Two-factor in the edge functions (no dependencies)

The nine functions that act for a signed-in user, run for real under Node with the supabase client,
web-push, jose and fetch faked: an account with a verified authenticator gets 403 `aal2_required` at
aal1 (or with no or unreadable claims) and nothing else happens; at aal2, and for accounts without a
verified factor, every function answers exactly as it does without the guard.

```bash
node test/edge-aal.test.mjs
```

## The Feedback box (3 Nov 2026)

The send-feedback edge function end to end under Node, its supabase client and fetch faked (no Deno, no network): who
sent it comes from the token only, two-factor, the kind, the words and a problem's technical details (allow-listed,
scrubbed of emails and tokens, at most 8 KB; an idea keeps none), the cap of 20 a day counted before any insert, the
table's own cap for two sends at once, the admins' email (subject, escaping, reply-to, the details) and that a failed
email still answers 200 with the row saved, 503 before the migration. It also checks the app's details (feedback.js)
against the server's: the same keys, the same scrubbing.

```bash
node test/send-feedback.test.mjs
```

The table, its policies and its guard (`sql/migration-feedback-2026-11-03.sql`, STATUS-check row 65) in PGlite, with
Supabase's default grants: runs twice; a user inserts and reads only their own and can't update or delete; an admin
reads, updates and deletes all and the guard keeps the words; anon has nothing; the checks; the cap at 20 in 24 hours
for a user and the service role; an account's deletion takes its rows; with two-factor (row 60) in either order the
table gets `powa_mfa_aal2` and row 60 stays true.

```bash
PGLITE=/path/to/@electric-sql/pglite/dist/index.js node test/feedback-sql.test.mjs
```

The sheet's pure parts (the details, the scrub, the device in words, the words as sent, the draft) are in tests.html,
"feedback (feedback.js)"; its screens are in the small-stuff scanner (`UISCAN_ONLY='^(sh-fb|w-fb)'`).

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

Opens 233 screens (the four demos in the iPhone layout, their sheets, the onboarding, every
public page at desktop and phone width, dark and light) and reports overlapping text or buttons,
text cut off by its box, sideways scroll, controls outside their card, side-by-side buttons that
don't match, tiny tap targets and unreadable text. A screen that fails to load counts as a finding.
It never reaches the live services: Supabase and Plausible are refused on this machine, and the
public pages show their offline states. Run it before every App Store build.

```bash
python3 -m http.server 4191 --bind 127.0.0.1     # from the repo root, in another tab
node test/uiscan.mjs /tmp/powa-uiscan             # screenshots + issues.json for anything found
UISCAN_ONLY='^w-index' node test/uiscan.mjs       # only the screens whose name matches
```

## The homepage's pictures (needs playwright-core and Pillow)

The homepage shows the app's own screens: re-take them from this repo's demos whenever those screens change (desk:
Sam's Lifters and Arjun's page; phone: Arjun's Train; thread, brand, program (Marcus's week in the Programs editor), clients, import; lifter: Arjun's PR moment and
Progress, carrying his own numbers from the coach demo), then cut them into
`site-img/home/` and follow what `mkimg.py` prints (after a desk re-take: where index.html's live numbers, rings and
pins go). The laptop pictures (desk, program, clients, import) are the dark desk by default, as the homepage is all dark
(30 Oct); `THEME=light` takes the light desk for the light version. The phone pictures are always the app's dark.

```bash
python3 -m http.server 4191 --bind 127.0.0.1     # from the repo root, in another tab
for s in desk phone thread brand program clients import lifter; do node test/site-capture/cap-$s.mjs; done; python3 test/site-capture/mkimg.py
```
