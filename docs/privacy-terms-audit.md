# Privacy & Terms — Pre-launch audit

Audited 23 May 2026 against `privacy.html` and `terms.html` (both dated "Last updated: 2 May 2026") and what the actual code does.

Pages read well overall — natural voice, not generic LLM slop. But there are real, launch-blocking gaps below. I've marked severity.

---

## 🚨 Critical (fix before launch)

### 1. Privacy policy LIES about where data is stored
**File:** `privacy.html`, "Where it lives" section.
**Current text:** *"In the current prototype, your data is stored locally in your browser using the localStorage API. It does not leave your device."*
**Reality:** `db.js` connects to a Supabase Postgres instance at `https://cxnotrikxvzncupswvio.supabase.co`. Every signup, every log, every program goes to Supabase's servers. This is a **material misrepresentation** — under GDPR/UK-GDPR/CCPA, telling users their data "does not leave your device" when it does is a real regulatory risk, not a paperwork issue.

**Suggested replacement:**
> Your account and training data are stored in a managed Postgres database operated by Supabase. Data is encrypted in transit (TLS) and at rest. The database is hosted in [REGION — e.g. eu-west-1 / aws-us-east-1 — fill in your actual Supabase project region]. We use Supabase's authentication service to manage logins; passwords are hashed (we never see or store the plaintext). Your browser also caches a small amount of non-sensitive UI state (theme preference, session tokens) in localStorage.

### 2. No sub-processors / third-party services named
GDPR Article 28 requires you to disclose who else processes user data. Right now privacy.html mentions "our payment processor — Lemon Squeezy" once but doesn't list anyone else. You actually use:
- **Supabase** — hosting + auth + database
- **Lemon Squeezy** — payments, subscriptions, marketplace
- **An email sender** — `send-welcome.ts` sends welcome emails (whatever provider that hits)
- **Vercel** — hosting / CDN
- **Google Fonts** — fonts.googleapis.com (loaded from CSS)

Add a "Sub-processors" section listing each with a one-liner on what they handle and link to their privacy policy.

### 3. Terms have no governing law / jurisdiction clause
**File:** `terms.html`. Completely missing.

Without it, if a dispute happens, the answer to "what law applies and which court hears it" is "whoever's lawyer is more aggressive." Add a section before "Contact":

> **Governing law.** These terms are governed by the laws of [YOUR COUNTRY/STATE], without regard to conflict-of-law principles. Any dispute arising from these terms or your use of POWALIFTA will be resolved in the courts of [YOUR CITY/COUNTRY], and you consent to that jurisdiction.

You need to pick a jurisdiction. Wherever you're based legally is fine. If you don't have a business entity yet, use your country of residence.

---

## ⚠️  High (should fix before launch)

### 4. Marketplace transactions aren't covered
Terms section "Payments (coaches)" covers coach **subscriptions** only. But your marketplace lets coaches sell programs to athletes (the LS marketplace webhook proves this is a real flow). That's a peer-to-peer digital goods sale where you're the platform. Add a section like:

> **Marketplace purchases.** The POWALIFTA marketplace lets coaches sell training programs to athletes. POWALIFTA acts as a platform; the seller of record for each program is the coach (or Lemon Squeezy as merchant of record where applicable). Programs are digital goods delivered immediately on purchase. By purchasing, you agree that you do not have a right of withdrawal under EU Directive 2011/83/EU once delivery has begun and you've consented to immediate access. Disputes about program content or quality are between you and the coach; we will act in good faith to mediate but are not a party to the transaction.

### 5. Refund language conflicts with EU/UK consumer law
**Current:** *"We don't issue prorated refunds."*
**Issue:** EU and UK consumers have statutory rights on digital purchases (14-day cooling off for digital goods not yet delivered/accessed). You can lawfully waive this *for digital content* only if you get explicit consent AND deliver immediately. Otherwise refund refusals can be challenged.

Either:
- Add an explicit refund policy section that distinguishes subscription vs. marketplace and explains the EU/UK exception, OR
- Soften to *"Refunds are at our discretion outside of statutory rights under applicable consumer protection law."*

### 6. Data retention period missing
Privacy policy doesn't say how long you keep data after account deletion. GDPR requires this. Suggested:

> **How long we keep data.** While your account is active, we keep your data indefinitely so you can see your training history. When you delete your account, we delete your personal data within 30 days, except where we are legally required to retain billing records (typically 6–7 years for tax purposes — these records are kept by our payment processor).

### 7. International data transfers
If your Supabase region is US and you have EU users (which you will), you need a sentence on this:

> **International transfers.** Where your data is transferred outside your region (for example, from the EU to the US), we rely on Standard Contractual Clauses (SCCs) entered into with our processors.

### 8. Lemon Squeezy as Merchant of Record
LS handles sales tax / VAT / Stripe-style merchant of record stuff for you. Your terms should reflect that — currently they just say "our payment processor."

> **Payments are processed by Lemon Squeezy, who acts as the merchant of record for subscriptions and marketplace purchases. By purchasing, you also agree to Lemon Squeezy's [Terms of Service] and [Privacy Policy].**

---

## 📝 Medium (would tighten before launch, not blocking)

### 9. Contact email is a gmail address
`powalifta1320@gmail.com` for legal contact looks unprofessional for a paid SaaS and signals "this might disappear next week." Set up `hello@powalifta.com` / `privacy@powalifta.com` / `legal@powalifta.com` on your domain (free with Cloudflare Email Routing or Google Workspace).

### 10. Children policy mismatch
You say "not intended for use by anyone under 16." US COPPA threshold is 13; EU GDPR threshold is 16 (or as low as 13 depending on member state). Your 16 is the safe high bar — good. Make it explicit:

> POWALIFTA is intended for users aged 16 and over. We do not knowingly collect data from anyone under 16, regardless of jurisdiction.

### 11. Cookie / localStorage disclosure
Privacy says *"We may use a single first-party cookie to keep you logged in."* The site actually uses localStorage (for theme + Supabase auth tokens). Should mention localStorage explicitly to be accurate.

### 12. Data export self-serve
"Email us and we'll handle it within 30 days" is GDPR-compliant but the gold standard is a self-serve export button in account settings. Not blocking but a roadmap item.

### 13. DMCA / IP takedown process
Marketplace coaches will upload program names, descriptions, maybe photos. If someone claims infringement, you need a documented takedown process. Add a short section in terms or a separate `dmca.html`.

### 14. No SLA / availability disclaimer
"As is" is good but doesn't address uptime. Add: *"We don't guarantee that the service will be uninterrupted, error-free, or available at any specific time. We do our best."*

### 15. Effective date
Both pages say "Last updated: 2 May 2026" — today is 23 May 2026. Fine if no changes since, but you'll want to bump it when you push the changes above.

---

## ✅ What's already good

- Plain language, not lawyer slop
- Health/safety disclaimer in terms is solid for a lifting platform
- Coach-athlete relationship disclaimer is sharp — protects you from coaching disputes
- "We do not sell user data" is explicit (good)
- No third-party analytics is a feature, not a bug — but make sure it stays that way before you bolt on Plausible/PostHog
- 30-day response to data requests is GDPR-compliant
- Footer links to Privacy + Terms from every page

---

## Order of operations

1. Fix the localStorage lie in privacy.html (10 min).
2. Add sub-processor list (15 min).
3. Add governing law clause to terms.html (5 min, once you pick a jurisdiction).
4. Add marketplace section to terms.html (15 min).
5. Soften refund language (5 min).
6. Add retention period to privacy.html (5 min).
7. Bump "Last updated" date.
8. Everything else can be a v1.1 follow-up.

Total: roughly an hour of writing.
