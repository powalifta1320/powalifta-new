# Continue with Apple / Continue with Google — the owner's runbook

Written 2026-10-25. This is everything you click to switch the two buttons on. The code is
already in place (website modals, iPhone sheets, the database function); nothing works until
the three dashboards below know about each other. **Every key and secret in this story is
yours**: you type it into Supabase, Apple or Google yourself. Git holds placeholders only, and
nothing in this file is a secret.

Budget about an hour the first time: Apple 15 min, Google 15 min, Supabase 10 min, the iPhone
build 10 min, trying it 10 min.

## What is built

- **Website** (`index.html`, Log in and Sign up): two buttons above the email form. Tap one,
  approve at Apple or Google, come straight back to the page you left, signed in. A first-time
  account is asked the sign-up's own questions (lifter on my own / with a coach / coach, a name,
  the 16+ tick) unless it already answered them on the form; then it lands on its dashboard.
- **iPhone app** (the sign-up and log-in sheets): the same two buttons. Apple's own sheet
  (Face ID), Google's own sheet. Same first-time questions, inside the sheet.
- **Server**: `sql/migration-social-sign-in-2026-10-25.sql` adds `finish_social_signup`, the
  one-time role choice for Apple / Google accounts. Until you run it, Apple / Google lifters can
  still sign up (as athletes); a coach is told to use email for now.

Apple's rule 4.8: an app that offers Google sign-in must offer Sign in with Apple too. That is
why both ship together and why the Apple button comes first in the app.

## Have handy

- Your Apple Developer account (the one the app is published with). You'll need its **Team ID**.
- The Supabase project: `cxnotrikxvzncupswvio` (project URL `https://cxnotrikxvzncupswvio.supabase.co`).
- A Google account to own a Google Cloud project (free).
- The callback URL both providers must know: `https://cxnotrikxvzncupswvio.supabase.co/auth/v1/callback`

## Part 1 — Apple Developer (developer.apple.com → Account)

1. **The App ID.** Certificates, Identifiers & Profiles → Identifiers → open **com.powalifta.app**
   → tick **Sign in with Apple** → Save (Confirm). Xcode does this too with automatic signing, but
   ticking it here avoids a "capability not found" build error.
2. **A Services ID for the website.** Identifiers → **+** → choose **Services IDs** → Continue →
   Description `POWALIFTA web`, Identifier `com.powalifta.web` → Continue → Register. Open it →
   tick **Sign in with Apple** → **Configure** → Primary App ID: POWALIFTA (com.powalifta.app) →
   Domains and Subdomains: `cxnotrikxvzncupswvio.supabase.co` → Return URLs:
   `https://cxnotrikxvzncupswvio.supabase.co/auth/v1/callback` → Next → Done → Continue → Save.
3. **A key.** Keys → **+** → Key Name `POWALIFTA Sign in with Apple` → tick **Sign in with Apple**
   → Configure → Primary App ID: POWALIFTA → Save → Continue → Register → **Download** (a `.p8`
   file; Apple lets you download it exactly once, keep it somewhere safe) → note the **Key ID**
   (10 characters, shown on the same page).
4. **Your Team ID.** Top right of the developer site (Membership details): 10 characters.
5. **Optional, recommended: email to hidden addresses.** Lifters who pick Apple's "Hide my
   email" get a `…@privaterelay.appleid.com` address. Apple only forwards mail to it from senders
   you register: More → **Sign in with Apple for Email Communication** → Configure → add the
   domain you send from (`powalifta.com`) and the exact From address Resend uses → Register.
   Until then the app simply skips the welcome email for those lifters (everything else works).

## Part 2 — Google Cloud (console.cloud.google.com)

1. **A project.** Top bar project picker → New project → Name `POWALIFTA` → Create → select it.
2. **The consent screen.** APIs & Services → **OAuth consent screen** (Google now calls it
   "Google Auth Platform → Branding") → External → App name `POWALIFTA`, User support email: you,
   App logo: optional, App domain: `https://www.powalifta.com`, Privacy policy
   `https://www.powalifta.com/privacy.html`, Terms `https://www.powalifta.com/terms.html`,
   Authorized domains: `powalifta.com` and `supabase.co`, Developer contact: you → Save.
   Under **Audience** (or "Publishing status") press **Publish app** so anyone can sign in, not
   only test users. (Scopes: email, profile and openid are the defaults; nothing to add.)
3. **The Web client (this is the one Supabase uses).** APIs & Services → **Credentials** →
   **+ Create credentials** → **OAuth client ID** → Application type **Web application** → Name
   `POWALIFTA web (Supabase)` → Authorized JavaScript origins: `https://www.powalifta.com` and
   `https://powalifta.com` → Authorized redirect URIs:
   `https://cxnotrikxvzncupswvio.supabase.co/auth/v1/callback` → Create. Copy the **Client ID**
   (ends in `.apps.googleusercontent.com`) and the **Client secret**. The secret goes to Supabase
   only, nowhere else.
4. **The iOS client.** + Create credentials → OAuth client ID → Application type **iOS** → Name
   `POWALIFTA iPhone` → Bundle ID `com.powalifta.app` → App Store ID `6788506689` → Team ID: yours
   → Create. Copy this **iOS client ID** too. (iOS clients have no secret.)

## Part 3 — Supabase (supabase.com/dashboard → the project)

1. **Apple.** Authentication → **Sign In / Providers** → Apple → switch **Enable Sign in with
   Apple** on.
   - **Client IDs:** `com.powalifta.web,com.powalifta.app` — the Services ID first (the website),
     then the app's bundle id (so the iPhone app's tokens are accepted). Comma, no spaces.
   - **Secret Key (for OAuth):** Apple wants a signed secret made from your Team ID, Key ID,
     Services ID and the `.p8`. Supabase's own generator is on the docs page "Login with Apple"
     (supabase.com/docs/guides/auth/social-login/auth-apple, section *Generate a client_secret*):
     paste the four values, copy the result into this field. It is valid for **6 months**: put a
     reminder in your calendar to generate a new one before it runs out.
   - Save.
2. **Google.** Same page → Google → switch on.
   - **Client IDs:** `<web client id>,<iOS client id>` — the Web client first (the website's and
     the one the iPhone tokens are made out to), then the iOS client. Comma, no spaces.
   - **Client Secret (for OAuth):** the Web client's secret from part 2 step 3.
   - Leave "Skip nonce checks" **off**. Save.
3. **Where sign-ins may return to.** Authentication → **URL Configuration** → Site URL
   `https://www.powalifta.com` → Redirect URLs → Add: `https://www.powalifta.com/**` and
   `https://powalifta.com/**`. (For a local test server also add e.g. `http://localhost:4191/**`.)
   Without these Supabase sends people to the Site URL instead, which is also the home page, so
   even then the sign-in finishes; it just ignores the page they started from.
4. **Linking.** Authentication → Sign In / Providers → Auth settings: leave **Allow manual
   linking** off. Automatic linking is already on: a confirmed email + password account that signs
   in with Google using the same email becomes one account (see *What to expect*).
5. **The database function.** SQL Editor → New query → paste the whole of
   `sql/migration-social-sign-in-2026-10-25.sql` → Run (it is safe to run twice). Then run
   `sql/STATUS-check.sql`: row 46 should say `true`.

## Part 4 — the iPhone build

1. Open `native/social-sign-in.json` and replace the two placeholders with the **iOS client ID**
   (part 2 step 4) and the **Web client ID** (part 2 step 3). These ids are public identifiers,
   not secrets (they ship inside every app and web page that uses them); the Google **secret**
   never goes in this file.
2. In Terminal: `cd native && npm install && npm run sync && bash scripts/inject-all.sh`.
   `npm install` adds the two plugins (`@capacitor-community/apple-sign-in`,
   `@codetrix-studio/capacitor-google-auth`); `inject-all.sh` now also runs
   `inject-social-sign-in.rb`, which adds the Sign in with Apple entitlement and capability,
   Google's client ids and the URL scheme Google returns through. Every `cap sync` after this
   needs `inject-all.sh` again (same rule as the Live Activity).
3. Xcode → the App target → **Signing & Capabilities**: **Sign in with Apple** is listed. If it
   shows red, press **+ Capability** → Sign in with Apple once; automatic signing then updates the
   provisioning profile. → **Info** tab → URL Types: an entry `com.googleusercontent.apps.…`
   (your iOS client id, reversed) is there.
4. Build to a real iPhone signed into iCloud (the Simulator's Apple sheet is unreliable) and try
   both buttons from the welcome screen: Get started → I coach lifters → name → Continue with
   Apple; and I already have an account → Continue with Google.

## Where each value goes

| Value | You get it from | It goes into |
|---|---|---|
| Team ID | Apple Developer → Membership | Supabase's Apple secret generator |
| Key ID + the `.p8` file | Apple Developer → Keys | Supabase's Apple secret generator only (the `.p8` never goes anywhere else) |
| Services ID `com.powalifta.web` | Apple Developer → Identifiers | Supabase → Apple → Client IDs (first) |
| Bundle ID `com.powalifta.app` | already yours | Supabase → Apple → Client IDs (second); the Google iOS client |
| Google Web client ID | Google Cloud → Credentials | Supabase → Google → Client IDs (first); `native/social-sign-in.json` → `webClientId` |
| Google Web client secret | Google Cloud → Credentials | Supabase → Google → Client Secret, nowhere else |
| Google iOS client ID | Google Cloud → Credentials | Supabase → Google → Client IDs (second); `native/social-sign-in.json` → `iosClientId` |
| Callback URL `https://cxnotrikxvzncupswvio.supabase.co/auth/v1/callback` | Supabase (shown under each provider) | Apple's Services ID → Return URLs; Google's Web client → Authorized redirect URIs |

## Trying it

- **Website:** open powalifta.com → Log in → Continue with Google → approve → you are back on
  the home page for a second, then on your dashboard. A brand-new Google account sees "Finish
  setting up" first (pick a tile, confirm the name, tick 16+).
- **Sign up with a tile:** Sign up → pick Coach → Continue with Apple → approve → straight to
  coach.html (the tile, name and tick were kept; Apple's name fills the name if the form was blank).
- **iPhone:** both buttons from both sheets; a first-time account gets the "How will you use
  POWALIFTA?" step inside the sheet.
- **Nothing else changed:** email + password log in, Forgot password → the reset email →
  reset-password.html, Delete account, and the demos work as before.

## What to expect

- **Same email as an existing email + password account, confirmed:** Google/Apple sign-in opens
  that same account (Supabase links the identity). They keep their role and data; nothing is
  duplicated, and they can keep using the password too.
- **Same email, but that account never confirmed its email:** Supabase refuses to link for
  safety; the lifter sees an error. Confirming the email (the link in the sign-up mail) fixes it.
- **Apple "Hide my email":** the account gets a `…@privaterelay.appleid.com` address, so it is a
  different account from one made with the real email. Mail to it only arrives after part 1
  step 5.
- **A name from Apple arrives once**, the very first time. The app saves it then; a lifter who
  deletes their account and signs up again is simply asked for the name.
- **Coach accounts need the migration** (part 3 step 5). Before it, a coach who signs up with
  Apple / Google is told to use email for now; athletes work regardless.
- **Password:** an Apple / Google account has none. You → Security → Change password sets one,
  after which email + password works for that account too.

## If something says no

| Message | Means | Fix |
|---|---|---|
| `redirect_uri_mismatch` (Google) | the callback URL isn't on the Web client | part 2 step 3: add the exact callback URL |
| `invalid_client` / `invalid_request` (Apple, web) | Services ID, domain or return URL missing, or the secret expired | part 1 step 2; regenerate the secret (part 3 step 1) |
| "Unacceptable audience in id_token" | the token's client id isn't in Supabase's list | add the iOS client id (Google) or `com.powalifta.app` (Apple) to Client IDs |
| "Passed nonce and nonce in id_token should either both exist or not" | a stale build; Apple's nonce check | make sure the build has the new social-auth.js |
| AuthorizationError 1000 (iPhone, Apple) | the entitlement/capability is missing or the device isn't in iCloud | part 4 steps 2–3; sign into iCloud on the device |
| "Google sign-in isn't set up in this build yet" | placeholders still in `native/social-sign-in.json` when inject-all ran | part 4 steps 1–2 |
| "Database error saving new user" | the sign-up trigger couldn't make the profile row | the account's provider sent no email; make sure the email scope is on (Apple: Client IDs, Google: consent screen) |
| "Coach accounts … switch on with the next update" | the migration isn't run yet | part 3 step 5 |

## Renewals and upkeep

- Apple's secret in Supabase expires every **6 months**: regenerate (part 3 step 1).
- Google's consent screen stays published; nothing renews.
- If you ever change the bundle id or the Supabase project, every row of the table above changes.
