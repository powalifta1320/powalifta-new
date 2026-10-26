-- ============================================================
-- migration-social-sign-in-2026-10-25.sql — POWALIFTA
-- Continue with Apple / Continue with Google: the server side.
--
-- WHAT A SOCIAL SIGN-UP LOOKS LIKE TODAY
--   Supabase creates the auth user, and the on_auth_user_created trigger (handle_new_user,
--   live database only) makes the profiles row from the provider's metadata: name from
--   `name` (Google sends one; Apple usually doesn't, so the email handle is used) and
--   user_type 'athlete', because the metadata carries no user_type (the email form sends
--   one, a provider can't). So a first-time Apple / Google account always starts as an
--   athlete called whatever the provider said, or "k4xq7m2tz" for a hidden Apple email.
--
-- WHAT THIS ADDS
--   finish_social_signup(p_user_type, p_name): the signed-in account says, once, how it
--   will use POWALIFTA (athlete | coach) and what to call them. It runs as its owner and:
--     * works only for accounts with a non-email identity (Apple, Google); the email form
--       never needs it
--     * works once: it leaves a marker in raw_app_meta_data (powa_role_chosen, user_type),
--       which the client can't write, and refuses when the marker is already there
--     * refuses an account that existed before the provider was linked to it (an email
--       lifter who later signs in with Google keeps their role: the first social identity
--       must be within 10 minutes of the profiles row)
--     * refuses admins; is_admin and subscription_tier are never touched
--     * updates the trigger's row (user_type + name), or inserts one when there is none
--     * mirrors user_type into raw_user_meta_data, where the email sign-up keeps it
--   The UPDATE guard (guard_profile_privileged_cols, migration-profiles-privilege-guard.sql)
--   freezes user_type for every caller with a JWT, this function included. It now steps
--   aside when the transaction carries the setting powa.social_role = 'allow', which only
--   this function sets (set_config is not an exposed RPC; the setting ends with the
--   transaction). The guard's own file carries the same body, so either order works.
--
-- The app copes until this runs: db.js finishSocialSignup falls back (an athlete keeps the
-- trigger's row and gets their name saved; a coach is told to sign up with email for now).
--
-- Run once in the Supabase SQL Editor, after migration-profiles-privilege-guard.sql and
-- migration-rls-hardening-3.sql. Idempotent (CREATE OR REPLACE), no data changes.
-- Tested in PGlite on 2026-10-25 with the auth schema stubbed (nine scenarios).
-- STATUS-check.sql row 46 reports it.
-- ============================================================

-- 1. The privileged-column guard, with its one exemption ------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_cols()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Server-side / service role (no JWT in context) may change anything.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  -- finish_social_signup (migration-social-sign-in-2026-10-25.sql) sets a first-time Apple /
  -- Google account's role once. It marks its own transaction with this setting, which no
  -- client can set (set_config is not an exposed RPC) and which ends with the transaction.
  IF current_setting('powa.social_role', true) = 'allow' THEN
    RETURN NEW;
  END IF;
  -- Admins may change anything (admin dashboard).
  IF is_admin() THEN
    RETURN NEW;
  END IF;
  -- Everyone else: privileged columns are pinned to their existing values.
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'subscription_tier is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF NEW.user_type IS DISTINCT FROM OLD.user_type THEN
    RAISE EXCEPTION 'user_type is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'is_admin is not user-editable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
-- The trigger trg_guard_profile_privileged_cols (created by the guard migration) keeps
-- calling this function; nothing to recreate.

-- 2. The one-time role choice for Apple / Google accounts -----------------------------------
CREATE OR REPLACE FUNCTION public.finish_social_signup(p_user_type text, p_name text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid          uuid := auth.uid();
  v_role         text := lower(trim(coalesce(p_user_type, '')));
  v_name         text := left(nullif(regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g'), ''), 80);   -- tidy, 80 chars at most
  v_email        text;
  v_app          jsonb;
  v_row          public.profiles%ROWTYPE;
  v_first_social timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Sign in first' USING ERRCODE = '42501';
  END IF;
  IF v_role NOT IN ('athlete', 'coach') THEN
    RAISE EXCEPTION 'Pick athlete or coach' USING ERRCODE = '22023';
  END IF;

  SELECT u.email, coalesce(u.raw_app_meta_data, '{}'::jsonb)
    INTO v_email, v_app
    FROM auth.users u
   WHERE u.id = v_uid;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'This account has no email address' USING ERRCODE = '22023';
  END IF;

  -- Once per account.
  IF coalesce(v_app->>'powa_role_chosen', '') = 'true' THEN
    RAISE EXCEPTION 'This account already chose how it uses POWALIFTA' USING ERRCODE = '42501';
  END IF;

  -- Only accounts that came in through a provider.
  SELECT min(i.created_at) INTO v_first_social
    FROM auth.identities i
   WHERE i.user_id = v_uid AND i.provider NOT IN ('email', 'phone');
  IF v_first_social IS NULL THEN
    RAISE EXCEPTION 'Only accounts signed in with Apple or Google choose a role here' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_row FROM public.profiles p WHERE p.id = v_uid;
  IF FOUND THEN
    IF v_row.user_type = 'admin' THEN
      RAISE EXCEPTION 'Admin accounts keep their role' USING ERRCODE = '42501';
    END IF;
    -- Not a sign-up: the account was here before Apple / Google was linked to it.
    IF v_first_social > coalesce(v_row.created_at, v_first_social) + interval '10 minutes' THEN
      RAISE EXCEPTION 'This account already has a role' USING ERRCODE = '42501';
    END IF;
    PERFORM set_config('powa.social_role', 'allow', true);
    UPDATE public.profiles
       SET user_type = v_role,
           name      = coalesce(v_name, name)
     WHERE id = v_uid;
  ELSE
    INSERT INTO public.profiles (id, name, email, user_type, bio, coach_id)
    VALUES (v_uid, coalesce(v_name, split_part(v_email, '@', 1)), v_email, v_role, NULL, NULL);
  END IF;

  UPDATE auth.users
     SET raw_app_meta_data  = coalesce(raw_app_meta_data,  '{}'::jsonb) || jsonb_build_object('powa_role_chosen', true, 'user_type', v_role),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('user_type', v_role)
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true, 'user_type', v_role);
END;
$$;

REVOKE ALL ON FUNCTION public.finish_social_signup(text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.finish_social_signup(text, text) TO authenticated;

-- ============================================================
-- VERIFICATION (after running)
--
-- 1. Both pieces are in place (STATUS-check.sql row 46 says the same):
--      SELECT to_regprocedure('public.finish_social_signup(text, text)') IS NOT NULL AS fn,
--             position('powa.social_role' IN pg_get_functiondef('public.guard_profile_privileged_cols()'::regprocedure)) > 0 AS guard;
--
-- 2. From a spare Apple / Google account, in the browser console right after the first sign-in
--    (before choosing): await sb.rpc('finish_social_signup', { p_user_type: 'coach', p_name: 'Test Coach' })
--      -> { ok: true, user_type: 'coach' }; run it again -> "already chose how it uses POWALIFTA".
--    From an email + password account: -> "Only accounts signed in with Apple or Google…".
--    The freeze still holds for everyone:
--      await sb.from('profiles').update({ user_type: 'coach' }).eq('id', (await sb.auth.getUser()).data.user.id)
--      -> error 42501 "user_type is not user-editable".
-- ============================================================
