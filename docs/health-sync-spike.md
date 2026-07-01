# Apple Health / Google Fit bodyweight sync — SPIKE (#23)

**Status:** design spike. No code shipped. This documents the honest options and
the recommended path so a future build starts from a decision, not a blank page.

## The hard constraint

POWALIFTA is a **no-build-step vanilla-JS PWA**. There is **no browser API** that
reads Apple Health (HealthKit) or Android Health Connect:

- **HealthKit** is native-only (Swift/Obj-C, entitlement-gated). Safari — even an
  installed PWA — cannot touch it.
- **Health Connect** (Google's successor to the Google Fit APIs) is Android-native
  only (Kotlin/Java + a permissions contract). No web surface.
- **Google Fit REST API** *does* exist on the web via OAuth… but Google **shut the
  Fit APIs down (data read/write disabled 2026, endpoints returning empty)** in
  favour of Health Connect. Building against it now is building against a corpse.

So: **a pure web PWA cannot read the phone's health store directly.** Anyone who
claims otherwise is shipping a native wrapper. That wrapper is issue **#32** (native
app) — Health sync is one of its strongest justifications, not a thing to fake here.

## What already covers the 80%

The Bodyweight tab already has:
1. **Manual weigh-in entry** (`logBodyweight()` — one tap, dated).
2. **CSV / paste import** (`openImportModal` → `_impBuild`) that ingests both
   training logs **and** `bodyweight` rows from any spreadsheet with a
   `date,weight` header. Apple Health's own **Export All Health Data** (Health app →
   profile → Export) produces an `export.xml` the user can convert to that CSV; the
   import path then accepts it unchanged.

For most lifters, manual entry + occasional CSV is enough. Automatic daily sync is a
convenience, not a gap in core function.

## Recommended path when automatic sync is wanted

### Tier 1 (web-possible, no native app) — iOS Shortcuts → webhook
iOS **Shortcuts** can read Health and hit a URL. This is the one automatic path that
works **without** shipping to the App Store:

1. New edge function `ingest-bodyweight` (Verify JWT **OFF** — no user session in a
   Shortcut). Auth = a **per-user sync token** the user pastes into the Shortcut.
   Fails closed on a bad/absent token, exactly like `send-weekly-digest`'s
   `CRON_SECRET` model.
2. New column `profiles.bw_sync_token uuid UNIQUE DEFAULT gen_random_uuid()` (its own
   `migration-bw-sync-token.sql`), backfilled; rotatable from Settings.
3. Function resolves token → user, then **upserts** one `bodyweight` row
   (`onConflict = athlete_id,date`, same shape `commitImport` already writes).
4. Settings card: "Connect Apple Health" → shows the token + a one-tap **Add to
   Shortcuts** iCloud link (a template Shortcut: *Get latest Body Mass → POST JSON*),
   run daily by a Personal Automation. Rotate-token button.

Android parity in this tier: **Tasker** (or HTTP Shortcuts) can POST to the same
endpoint from Health Connect data — power-user territory, but the endpoint is shared.

### Tier 2 (needs #32, the native app) — first-class sync
Once a Capacitor/native shell exists, use the **HealthKit** and **Health Connect**
plugins to read Body Mass with a real permission prompt and background delivery. Same
`bodyweight` upsert underneath — Tier 1's endpoint + schema are forward-compatible,
so Tier 1 is not throwaway work.

## Why this stays a spike right now

The Tier-1 build is **secret- and deploy-gated end to end**: a new edge function that
must be deployed, a new `profiles` column migration the user must run, and a token
surfaced in the UI that is meaningless until both land. Per the build rules
(build only what needs no secrets/deploy; PREP the gated parts; SPIKE the native
path), the right deliverable today is this decision doc, not a dangling half-feature.
The manual + CSV paths already give users a working way in.

## If we promote this to PREP later — concrete checklist

- [ ] `sql/migration-bw-sync-token.sql` — `profiles.bw_sync_token` uuid UNIQUE +
      backfill + own-row RLS read (token is a secret to its owner). Add to the
      ordered migration list in CLAUDE.md.
- [ ] `supabase/functions/ingest-bodyweight/index.ts` — POST `{token, weightKg, date?}`,
      resolve token via service role, clamp weight (20–400 kg) + date (≤ today,
      ≥ 2000-01-01), upsert `bodyweight` `onConflict=athlete_id,date`. CORS + JSON.
      Add to `deploy.sh` `NO_JWT` group.
- [ ] `db.js` — `DB.getBwSyncToken()` / `DB.rotateBwSyncToken()`.
- [ ] Settings modal — "Connect Apple Health (via Shortcuts)" card: token (masked +
      copy), template-Shortcut iCloud link, rotate button, plain-language steps.
      Demo-safe (show a fake token, no network).
- [ ] Template Shortcut authored + hosted (iCloud share link).
- [ ] `.env.example` — no new secret (token lives in the DB, not function env).
