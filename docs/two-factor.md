# Two-factor: what the server does (owner note, 28 Oct 2026)

Until now two-factor only lived in the sign-in screens: the password step already stored a working
session, so a password alone opened everything (the API, Storage, the edge functions, even the app
after a reload). Settings promised "Logins need a code from your authenticator app". This release
makes that true. Nobody has two-factor on today (28 Oct: 0 verified factors, 1 abandoned set-up,
14 sessions all aal1), so on day one nothing changes for anyone.

## What ships

1. **Database** `sql/migration-mfa-aal2-2026-10-28.sql` (STATUS-check row 60). An account with a
   verified authenticator reads and writes nothing until its session has entered the code (aal2):
   one restrictive policy on every table and on Storage, so the API, uploads/downloads and live
   updates all follow it. Accounts without an authenticator: no change (proved on all 4,920 x 10
   access probes in PGlite). If the check ever can't read the authenticators table it shuts
   (signed-in requests get nothing, or an error), it never opens; the file refuses to install so.
2. **Edge functions**: the eight that act for a signed-in user (delete-account, ls-portal, apple-iap,
   send-invite, send-program-assigned, send-push, program-read, ai-chat) refuse a session that owes
   its code with 403 `aal2_required`. Before, a password alone could delete a two-factor account.
3. **App** (web on the next push, iPhone on the next build): a dashboard opened with a session that
   still owes its code (reload during the code prompt, or /athlete.html straight after the
   password) asks for the code in place. "Sign out" there, and Cancel on the sign-in screens, sign
   out this device only (they used to sign the person out everywhere). Live updates get the new
   token as soon as the code is entered.

Order: the SQL (a no-op today), then the functions, then the web push / iPhone build.

## Old builds, until the next push and build

A two-factor account that signs in with its code works everywhere. If an old build opens a dashboard
with a half-finished sign-in, the database answers with nothing (not an error), so the app shows the
last copy saved on that phone or "Can't reach the server"; signing in again with the code fixes it.
No data leaves the server. Nobody has two-factor on today.

## What it does not cover yet: the definer functions

36 database functions that signed-in users can call run with the owner's rights, so table rules
never see them, and a session that owes its code can still call them. 14 only answer yes/no about
the caller (is_admin, is_current_coach_of...). The other 22:

- **The sharpest: `claim_invite`.** With only a lifter's password, someone who also has a coach
  account of their own can claim one of their own invite codes for that lifter. The lifter is then
  "coached" by them, and their coach account (no two-factor) reads the lifter's training data.
  `accept_coach_request` is the mirror case for a coach's password (it only links the asker).
- Actions: join, leave or run a club and its buddies, close a meet day, request a referral
  reward, finish an Apple/Google sign-up, `admin_set_plan` (admins).
- Reads: a bought program's content, the coach's check-in questions and branding, a challenge
  board, club search (the coach list and invite previews are public anyway).

No training log, message, health, pain or billing row can be read through them directly (those are
tables). Also small and inherent to Supabase Auth: such a session can still sign itself out
everywhere and change its own profile metadata, and a live DELETE event carries only a row id.

Nobody has two-factor on, so none of this reaches anyone today. Before the first account turns it
on, close it: the pre-request hook below covers every function in one step.

## The pre-request hook (tested, not applied)

What it adds: one check in front of every API request, tables and functions alike, so the definer
functions above are covered too. The refusal reads "Not authenticated…", which today's app already
treats as a dead session (sign in again, with the code).

Why it waits: if it ever errors, every API request fails, for everyone; in the pitch week that risk
buys nothing, because nobody has two-factor on. Apply it before the first account turns two-factor
on, once a test account has been through the checklist below. Row 60 must be applied first.

HOOK-APPLY (SQL editor, one run):

```sql
begin;
create or replace function public.powa_pre_request()
returns void
language plpgsql
stable
set search_path = ''
as $$
begin
  -- Only a signed-in user can owe a code; anon and service_role return at once
  -- (anon has no EXECUTE on powa_mfa_ok, so it must never reach the call below).
  if coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') <> 'authenticated' then
    return;
  end if;
  if not public.powa_mfa_ok() then
    -- "Not authenticated": app.js _isAuthError() reads it as a session to sign in again.
    raise exception 'Not authenticated: this account needs its two-factor code'
      using errcode = '42501', hint = 'aal2_required';
  end if;
end;
$$;
comment on function public.powa_pre_request() is
  'POWALIFTA two-factor: PostgREST db_pre_request. Before dropping it, run and commit: alter role authenticator reset pgrst.db_pre_request; notify pgrst, ''reload config'';';
revoke all on function public.powa_pre_request() from public;
grant execute on function public.powa_pre_request() to anon, authenticated, service_role;
alter role authenticator set pgrst.db_pre_request = 'public.powa_pre_request';
notify pgrst, 'reload config';
commit;
```

Check: `select rolconfig from pg_roles where rolname = 'authenticator';` includes
`pgrst.db_pre_request=public.powa_pre_request`, and the website still loads signed in and signed out.

Undo, in two separate runs (the notify only fires when the first one commits; dropping the function
while the setting still points at it fails every API request):

HOOK-UNDO-1:

```sql
alter role authenticator reset pgrst.db_pre_request;
notify pgrst, 'reload config';
```

HOOK-UNDO-2 (a few seconds later):

```sql
drop function if exists public.powa_pre_request();
```

If the hook is on, undo it before undoing row 60 (the hook calls `powa_mfa_ok()`).

## Running it

- **New tables**: the policy goes on every table that exists when the file runs. After a migration
  that adds a table, STATUS row 60 says false: run `migration-mfa-aal2-2026-10-28.sql` again.
- **Lost authenticator**: the account is really locked now (one factor, no backup codes). After
  checking it's them: Supabase dashboard → Authentication → Users → the user → delete the factor.
  They sign in with the password and can turn two-factor on again.
- **Checklist with a test account** (owner, after the SQL, the functions and the web push): turn
  two-factor on in Settings; sign out; sign in (the code is asked); reload a dashboard during the code
  prompt (asked again, in place); upload a form check and play a voice note; get a message live; Ask
  AI; open the billing portal; try delete-account with a password-only token (expect 403); reset the
  password (the reset page asks for the code); turn two-factor off.
