-- migration-security-fixes-2026-10-28.sql — POWALIFTA. The database half of the 28 Oct security sweep.
--
-- 1. A coach link needs the coach's consent again. Any signed-in lifter could set their own profiles.coach_id
--    to any coach (no invite, no request), which filled a paying coach's seats and opened their messages, form
--    checks and intake to a stranger. The freeze from 21 Oct (migration-rls-hardening-4.sql, H1) was lost on
--    25 Oct, when migration-social-sign-in-2026-10-25.sql rewrote guard_profile_privileged_cols() from an older
--    copy. It is back, added to the body live runs today (the powa.social_role exemption exactly as it is), and
--    for every row, not just your own: with a signed-in session nobody sets a coach_id that isn't null except
--    claim_invite and accept_coach_request, which mark their own transaction with powa.link_ok
--    (accept_coach_request now sets it too). Clearing coach_id needs no flag: a lifter leaving, a coach
--    releasing them, the ON DELETE SET NULL when a coach deletes their account, the service role, admins.
--    A profile row a signed-in user inserts starts with no coach.
-- 2. Remove from roster works again. coach.html updated the lifter's row and got 42501: with a WHERE on id
--    Postgres also checks the new row against the read policies, and a released lifter is no longer the
--    coach's to read. coach_release_lifter(p_athlete) does it on the server, for the lifter's current coach
--    or an admin only: it clears coach_id as the app did, and the triggers on profiles do the rest, as when a
--    lifter leaves (the coach's programs become the lifter's own, team places and a live meet-day link end,
--    shared Apple Health and nutrition switch off). A lifter leaving (their own row) already worked.
-- 3. A session note's feedback is the coach's. A lifter could insert or edit their own note carrying
--    coach_comment / coach_comment_at / coach_id, and the app showed it as the coach's words. On insert, those
--    fields are now cleared for anyone but the lifter's current coach (admins and the service role write as
--    they please); the coach's reply is signed (coach_id = them) and stamped (coach_comment_at = now) by the
--    server, with an empty note text (the lifter's words are the lifter's: a reply on a day the lifter wrote
--    nothing failed before this on the missing note). On update the lifter's edits keep the coach's fields as
--    they were, and a reply the coach changes is signed and stamped the same way; a coach still may only touch
--    the feedback fields.
-- 4. A former coach is read-only (the owner's call, 28 Oct: "Keep the history: a former coach is read-only -
--    can't send, react or mark read without a live link"). Marking messages read, deleting your own message,
--    and adding, changing or removing a reaction now need the live link (the lifter's profiles.coach_id is the
--    thread's coach), as sending already did. The same for a lifter in a thread with a coach they left.
--    Reading the thread stays open to both: messages, reactions and voice notes (whose upload already needed
--    the link).
-- 5. Twelve policies applied to every role though no signed-out request can pass them (each needs auth.uid() or
--    is_admin()); they now say TO authenticated. Nobody's access changes (PGlite probes, every table x anon
--    and nine users). Still TO public: marketplace_programs_select and pr_public_read, the shop and its
--    reviews, which signed-out visitors read.
-- 6. Invite seats are counted on the server, not only in the app. A new unused invite is refused when the
--    coach's lifters plus their unused invites under 60 days old (the invite page's window) already fill the
--    plan: the athlete limit's own rules (enforce_athlete_limit): the plan in force (powa_effective_tier, so an
--    admin's comp never lapses), Free 3, Basic 10, Pro 25, Premium unlimited. The error starts
--    INVITE_LIMIT_REACHED (P0001); the invite sheet already shows it as "Your plan is full: upgrade to invite
--    more". Marking a used invite unused again counts the same way, and created_at is the server's (so an
--    invite can't be dated back out of the count).
-- 7. invite_preview's per-IP limit reads the client's IP the way the edge functions do (_shared/rate-limit.ts
--    clientIp): cf-connecting-ip, then the LAST x-forwarded-for hop (the first one is whatever the client
--    sent), then x-real-ip.
--
-- Who may do what, after this:
--   a lifter        joins a coach only by claiming an invite or through a request the coach accepts; leaves
--                   at will; writes their own session notes, never the coach's reply; in the thread with their
--                   coach sends, reacts and marks read; in a thread with a coach they left, reads.
--   their coach     takes them off the roster (coach_release_lifter); replies to their notes (signed, stamped);
--                   in a live thread sends, reacts and marks read; makes invites while the plan has a seat.
--   a former coach  reads the old thread; nothing else in it.
--   admins          as before: the guards let them through, and they may release any lifter.
--   signed out      as before: the shop, its reviews, the leaderboard, invite_preview.
-- Not in this file (from the same sweep): challenge member_ids (confirmed[1], the owner's call), two-factor
-- (track B), the Auth settings switch (confirmed[10], the owner's).
--
-- Run after STATUS-check row 58 (rows 55 and 58 are live). One transaction; idempotent (a second run changes
-- nothing). It first checks that each function and policy it changes reads as it did live on 28 Oct (06:25 UTC),
-- as an older file in sql/ defines it, or as this file left it, and stops with nothing changed if not (someone
-- else's change it would overwrite; or not run as postgres). Running an older file that defines one of these
-- functions again (migration-profiles-privilege-guard.sql, migration-rls-hardening.sql / -3 / -4,
-- migration-social-sign-in-2026-10-25.sql, migration-coach-requests.sql, migration-security-2026-10-22.sql,
-- migration-invite-links-2026-10-22.sql, migration-invite-brand-2026-10-27.sql) puts its old body back (an old
-- accept_coach_request can't link under the freeze): run this one again after it. STATUS-check.sql row 59 reads
-- false until you do.
-- Undo: put   set local powa.security_fixes_undo = 'on';   on the line after begin; and run the file. Every
-- function and policy goes back to its 28 Oct text (kept at the end of this file); coach_release_lifter, the
-- two new guards and their triggers are dropped.
-- PGlite-tested on a rebuild of live (scratchpad/pgtest/sec59-*.mjs). STATUS-check.sql row 59.
begin;

-- 0. The right database, in the state this file was written against ----------------------------------
do $$
declare
  problems text[] := '{}';
  r record;
  cur record;
begin
  if to_regclass('public.profiles') is null or to_regclass('public.invites') is null
     or to_regclass('public.session_notes') is null or to_regclass('public.messages') is null
     or to_regclass('public.message_reactions') is null then
    raise exception 'migration-security-fixes: public.profiles / invites / session_notes / messages / message_reactions not found. This is not the POWALIFTA database. Nothing was changed.';
  end if;

  -- coach_release_lifter (SECURITY DEFINER) belongs to whoever runs this file: that must be the tables' owner
  -- (postgres, as for every other definer function here), or its update would answer to RLS itself.
  if not exists (select 1 from pg_roles where rolname = current_user and (rolsuper or rolbypassrls)) then
    problems := problems || format('run this as postgres (the tables'' owner), not %s', current_user);
  end if;

  -- What the new code calls.
  for r in select x.sig from unnest(array['public.is_admin()', 'public.is_current_coach_of(uuid)',
             'public.powa_effective_tier(text,timestamp with time zone)', 'public.claim_invite(text)']) x(sig) loop
    if to_regprocedure(r.sig) is null then
      problems := problems || format('%s is missing', r.sig);
    end if;
  end loop;
  -- claim_invite must mark its own link (it has since migration-rls-hardening-4.sql): without that the freeze
  -- below would stop invites working.
  if not exists (select 1 from pg_proc where oid = to_regprocedure('public.claim_invite(text)')
                  and position('powa.link_ok' in prosrc) > 0) then
    problems := problems || 'public.claim_invite(text) does not set powa.link_ok'::text;
  end if;
  -- The triggers that run the guards this file rewrites.
  for r in select * from (values ('profiles', 'trg_guard_profile_privileged_cols', 'guard_profile_privileged_cols'),
                                 ('profiles', 'trg_guard_profile_privileged_cols_insert', 'guard_profile_privileged_cols_insert'),
                                 ('session_notes', 'trg_guard_session_notes_update', 'guard_session_notes_update')) v(tbl, trg, fn) loop
    if not exists (select 1 from pg_trigger t where t.tgrelid = to_regclass('public.' || r.tbl) and t.tgname = r.trg
                     and t.tgfoid = to_regprocedure('public.' || r.fn || '()')) then
      problems := problems || format('trigger %s on public.%s is missing', r.trg, r.tbl);
    end if;
  end loop;

  -- The functions this file replaces: this file's body (it says so inside), the body live ran on 28 Oct (md5 of
  -- prosrc, first in each list), or the body of an older file that defines it (run again since: this file puts
  -- it right). Anything else is someone's change this file would overwrite.
  for r in select * from (values
      ('public.guard_profile_privileged_cols()',        array['697ac2e4d5dc57ccd6216f1eba6bbe93',     -- live 28 Oct
                                                              '20ac900d38240a31d4c55c20fddcb1c7',     -- migration-profiles-privilege-guard.sql
                                                              'e162eba4be020b48ace54c0533c6de2a',     -- migration-rls-hardening-4.sql
                                                              '0e6a5cd67ba21a10e7d46d829bf6c9be']),   -- migration-social-sign-in-2026-10-25.sql
      ('public.guard_profile_privileged_cols_insert()', array['bd77ce640a5de4ce60f9d49a0ebe941e']),   -- live = migration-rls-hardening-3.sql
      ('public.accept_coach_request(uuid)',             array['232102665f44946ca0596ab384a18776',     -- live = migration-rls-hardening.sql
                                                              '1529428e215b66844e7d1c7929114d30']),   -- migration-coach-requests.sql
      ('public.guard_session_notes_update()',           array['25e3e6434b671f61578df74ad8dc0791']),   -- live = migration-rls-hardening.sql
      ('public.invite_preview(text)',                   array['1d05d528c219e0636c8d3539f8660111',     -- live = migration-invite-brand-2026-10-27.sql
                                                              'f56c7822fb5fdc36f86333e101b3ba23',     -- migration-security-2026-10-22.sql
                                                              '6b46f5db9bc4c7052eee6c2d54c30717'])    -- migration-invite-links-2026-10-22.sql
      ) v(sig, known) loop
    if to_regprocedure(r.sig) is null then
      problems := problems || format('%s is missing', r.sig);
    elsif not exists (select 1 from pg_proc where oid = to_regprocedure(r.sig)
                        and (md5(prosrc) = any (r.known) or position('migration-security-fixes-2026-10-28' in prosrc) > 0)) then
      problems := problems || format('%s changed since 28 Oct', r.sig);
    end if;
  end loop;

  -- The policies this file changes: their 28 Oct text and roles, or this file's. Texts as pg_policies prints
  -- them, whitespace runs folded to one space.
  for r in select * from (values
    ('messages', 'msg_member_update', 'w', '{authenticated}', '{authenticated}',
     $q$((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id))$q$,
     $q$((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id))$q$,
     $q$(((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = messages.athlete_id) AND (p.coach_id = messages.coach_id)))))$q$,
     $q$(((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = messages.athlete_id) AND (p.coach_id = messages.coach_id)))))$q$),
    ('messages', 'msg_sender_delete', 'd', '{authenticated}', '{authenticated}',
     $q$((sender_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
     null,
     $q$(((sender_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = messages.athlete_id) AND (p.coach_id = messages.coach_id))))) OR ( SELECT is_admin() AS is_admin))$q$,
     null),
    ('message_reactions', 'mr_own_insert', 'a', '{authenticated}', '{authenticated}',
     null,
     $q$((user_id = ( SELECT auth.uid() AS uid)) AND ((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id)) AND (EXISTS ( SELECT 1 FROM messages m WHERE ((m.id = message_reactions.message_id) AND (m.coach_id = message_reactions.coach_id) AND (m.athlete_id = message_reactions.athlete_id)))))$q$,
     null,
     $q$((user_id = ( SELECT auth.uid() AS uid)) AND ((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id)) AND (EXISTS ( SELECT 1 FROM messages m WHERE ((m.id = message_reactions.message_id) AND (m.coach_id = message_reactions.coach_id) AND (m.athlete_id = message_reactions.athlete_id)))) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = message_reactions.athlete_id) AND (p.coach_id = message_reactions.coach_id)))))$q$),
    ('message_reactions', 'mr_own_update', 'w', '{authenticated}', '{authenticated}',
     $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
     $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
     $q$((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = message_reactions.athlete_id) AND (p.coach_id = message_reactions.coach_id)))))$q$,
     $q$((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = message_reactions.athlete_id) AND (p.coach_id = message_reactions.coach_id)))))$q$),
    ('message_reactions', 'mr_own_delete', 'd', '{authenticated}', '{authenticated}',
     $q$(user_id = ( SELECT auth.uid() AS uid))$q$,
     null,
     $q$((user_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = message_reactions.athlete_id) AND (p.coach_id = message_reactions.coach_id)))))$q$,
     null),
    ('checkins', 'checkins_athlete_all', '*', '{public}', '{authenticated}',
     $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
     $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
     $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$,
     $q$(athlete_id = ( SELECT auth.uid() AS uid))$q$),
    ('checkins', 'checkins_coach_select', 'r', '{public}', '{authenticated}',
     $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = checkins.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
     null,
     $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = checkins.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
     null),
    ('client_errors', 'client_errors_admin_read', 'r', '{public}', '{authenticated}',
     $q$( SELECT is_admin() AS is_admin)$q$,
     null,
     $q$( SELECT is_admin() AS is_admin)$q$,
     null),
    ('marketplace_programs', 'mp_coach_delete_own', 'd', '{public}', '{authenticated}',
     $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
     null,
     $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
     null),
    ('marketplace_programs', 'mp_coach_insert', 'a', '{public}', '{authenticated}',
     null,
     $q$(( SELECT is_admin() AS is_admin) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type = 'coach'::text))))))$q$,
     null,
     $q$(( SELECT is_admin() AS is_admin) OR ((coach_id = ( SELECT auth.uid() AS uid)) AND (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.user_type = 'coach'::text))))))$q$),
    ('marketplace_programs', 'mp_coach_update_own', 'w', '{public}', '{authenticated}',
     $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
     $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
     $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$,
     $q$((coach_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin))$q$),
    ('program_sales', 'ps_admin_all', '*', '{public}', '{authenticated}',
     $q$( SELECT is_admin() AS is_admin)$q$,
     $q$( SELECT is_admin() AS is_admin)$q$,
     $q$( SELECT is_admin() AS is_admin)$q$,
     $q$( SELECT is_admin() AS is_admin)$q$),
    ('program_sales', 'ps_buyer_read', 'r', '{public}', '{authenticated}',
     $q$(buyer_id = ( SELECT auth.uid() AS uid))$q$,
     null,
     $q$(buyer_id = ( SELECT auth.uid() AS uid))$q$,
     null),
    ('program_sales', 'ps_coach_read', 'r', '{public}', '{authenticated}',
     $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
     null,
     $q$(coach_id = ( SELECT auth.uid() AS uid))$q$,
     null),
    ('session_notes', 'session_notes_coach_insert', 'a', '{public}', '{authenticated}',
     null,
     $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
     null,
     $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$),
    ('session_notes', 'session_notes_coach_select', 'r', '{public}', '{authenticated}',
     $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
     null,
     $q$((athlete_id = ( SELECT auth.uid() AS uid)) OR (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
     null),
    ('session_notes', 'session_notes_coach_update', 'w', '{public}', '{authenticated}',
     $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
     null,
     $q$((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = session_notes.athlete_id) AND (p.coach_id = ( SELECT auth.uid() AS uid))))) OR ( SELECT is_admin() AS is_admin))$q$,
     null)
    ) v(tbl, pol, cmd, roles_was, roles_now, using_was, check_was, using_now, check_now) loop
    select p.polcmd::text cmd, p.polpermissive perm,
           (select array_agg(rl order by rl) from (select case when x = 0 then 'public' else x::regrole::text end rl
                                                     from unnest(p.polroles) x) xr)::text roles,
           regexp_replace(btrim(pg_get_expr(p.polqual, p.polrelid)), '\s+', ' ', 'g') using_txt,
           regexp_replace(btrim(pg_get_expr(p.polwithcheck, p.polrelid)), '\s+', ' ', 'g') check_txt
      into cur
      from pg_policy p
     where p.polrelid = to_regclass('public.' || r.tbl) and p.polname = r.pol;
    if not found then
      problems := problems || format('policy %s on public.%s is missing', r.pol, r.tbl);
    elsif not (cur.cmd = r.cmd and cur.perm
               and ((cur.roles = r.roles_was and cur.using_txt is not distinct from r.using_was and cur.check_txt is not distinct from r.check_was)
                 or (cur.roles = r.roles_now and cur.using_txt is not distinct from r.using_now and cur.check_txt is not distinct from r.check_now))) then
      problems := problems || format('policy %s on public.%s changed since 28 Oct', r.pol, r.tbl);
    end if;
  end loop;

  if cardinality(problems) > 0 then
    raise exception 'migration-security-fixes: %. Nothing was changed: carry those changes into this file first.', array_to_string(problems, '; ');
  end if;
end $$;

-- 1. The coach link freeze ------------------------------------------------------------------------------
-- The body live ran on 28 Oct (migration-social-sign-in-2026-10-25.sql's), with the freeze added at the end.
create or replace function public.guard_profile_privileged_cols()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  -- migration-security-fixes-2026-10-28.sql (STATUS-check row 59): the coach_id freeze at the end is back.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF current_setting('powa.social_role', true) = 'allow' THEN
    RETURN NEW;
  END IF;
  IF is_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'subscription_tier is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF NEW.user_type IS DISTINCT FROM OLD.user_type THEN
    RAISE EXCEPTION 'user_type is not user-editable' USING ERRCODE = '42501';
  END IF;
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    RAISE EXCEPTION 'is_admin is not user-editable' USING ERRCODE = '42501';
  END IF;
  -- A coach link is made only by claim_invite and accept_coach_request, which set powa.link_ok for their own
  -- transaction (set_config is not an exposed RPC; the setting ends with the transaction). Clearing coach_id
  -- needs no flag: a lifter leaving, coach_release_lifter, an account deletion's ON DELETE SET NULL.
  IF NEW.coach_id IS DISTINCT FROM OLD.coach_id
     AND NEW.coach_id IS NOT NULL
     AND coalesce(current_setting('powa.link_ok', true), '') <> '1' THEN
    RAISE EXCEPTION 'coach_id can only be set by claiming an invite or an accepted coach request'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
revoke all on function public.guard_profile_privileged_cols() from public, anon, authenticated;

-- The insert guard (migration-rls-hardening-3.sql's body) also starts a new profile with no coach.
create or replace function public.guard_profile_privileged_cols_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
BEGIN
  -- migration-security-fixes-2026-10-28.sql (STATUS-check row 59): the coach_id line is new.
  -- Service role (no JWT — LS webhook, or a SECURITY DEFINER signup trigger)
  -- and admins may set anything.
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  -- Ordinary caller inserting a profile row: force privileged columns to safe
  -- values. A legitimate client signup never sets these to anything else.
  IF NEW.is_admin IS DISTINCT FROM false THEN
    NEW.is_admin := false;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM 'free' THEN
    NEW.subscription_tier := 'free';
  END IF;
  IF NEW.user_type IS NULL OR NEW.user_type NOT IN ('athlete', 'coach') THEN
    NEW.user_type := 'athlete';
  END IF;
  -- No coach yet: a link comes from claim_invite or accept_coach_request (powa.link_ok), never an insert.
  IF NEW.coach_id IS NOT NULL AND coalesce(current_setting('powa.link_ok', true), '') <> '1' THEN
    NEW.coach_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;
revoke all on function public.guard_profile_privileged_cols_insert() from public, anon, authenticated;

-- accept_coach_request as live runs it, plus one line: it marks its coach_id write with powa.link_ok.
create or replace function public.accept_coach_request(request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
DECLARE
  v_athlete uuid;
  v_coach   uuid;
  v_status  text;
  v_current uuid;
BEGIN
  -- migration-security-fixes-2026-10-28.sql (STATUS-check row 59): the powa.link_ok line is new.
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT athlete_id, coach_id, status
    INTO v_athlete, v_coach, v_status
    FROM public.coach_requests
   WHERE id = request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_coach <> auth.uid() THEN
    RAISE EXCEPTION 'Not your request to accept';
  END IF;
  IF v_status = 'accepted' THEN
    RETURN v_athlete;  -- idempotent
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending';
  END IF;

  -- Don't silently poach an athlete already linked to another coach.
  SELECT coach_id INTO v_current FROM public.profiles WHERE id = v_athlete;
  IF v_current IS NOT NULL AND v_current <> v_coach THEN
    RAISE EXCEPTION 'Athlete is already linked to another coach';
  END IF;

  -- Authorise the guarded 'accepted' transition for THIS transaction only.
  PERFORM set_config('powa.cr_accept', '1', true);
  -- ... and the coach_id write below, which the profiles guard freezes otherwise.
  PERFORM set_config('powa.link_ok', '1', true);

  UPDATE public.profiles
     SET coach_id = v_coach
   WHERE id = v_athlete;

  UPDATE public.coach_requests
     SET status = 'accepted', updated_at = now()
   WHERE id = request_id;

  RETURN v_athlete;
END;
$$;
revoke all on function public.accept_coach_request(uuid) from public, anon;
grant execute on function public.accept_coach_request(uuid) to authenticated;

-- 2. Remove from roster ---------------------------------------------------------------------------------
create or replace function public.coach_release_lifter(p_athlete uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- migration-security-fixes-2026-10-28.sql (STATUS-check row 59).
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  if p_athlete is null or not (public.is_current_coach_of(p_athlete) or public.is_admin()) then
    raise exception 'Only this lifter''s coach can take them off the roster' using errcode = '42501';
  end if;
  -- What Remove from roster always did (coach.html removeAthleteFromRoster): coach_id = null. The triggers on
  -- profiles do the rest, as when a lifter leaves.
  update public.profiles
     set coach_id = null
   where id = p_athlete
     and coach_id is not null;
end;
$$;
revoke all on function public.coach_release_lifter(uuid) from public, anon;
grant execute on function public.coach_release_lifter(uuid) to authenticated;

-- 3. Session notes: the feedback is the coach's ------------------------------------------------------
create or replace function public.guard_session_notes_insert()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- migration-security-fixes-2026-10-28.sql (STATUS-check row 59). The insert side of guard_session_notes_update.
  -- No signed-in user (the service role, the SQL editor; a signed-out insert is refused by RLS) and admins:
  -- the row as written.
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if new.athlete_id is distinct from auth.uid() and public.is_current_coach_of(new.athlete_id) then
    -- The lifter's coach: the reply is theirs, signed and stamped here; the note text is the lifter's to write.
    new.coach_id := auth.uid();
    new.coach_comment_at := case when nullif(btrim(new.coach_comment), '') is not null then now() end;
    new.note := '';
  else
    -- Anyone else, the note's own lifter included: no coach's words on it.
    new.coach_comment := null;
    new.coach_comment_at := null;
    new.coach_id := null;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_session_notes_insert() from public, anon, authenticated;

drop trigger if exists trg_guard_session_notes_insert on public.session_notes;
create trigger trg_guard_session_notes_insert
  before insert on public.session_notes
  for each row execute function public.guard_session_notes_insert();

-- The update guard live runs (migration-rls-hardening.sql's), with the lifter's branch and the coach's stamp.
create or replace function public.guard_session_notes_update()
returns trigger
language plpgsql
set search_path = public
as $$
BEGIN
  -- migration-security-fixes-2026-10-28.sql (STATUS-check row 59): the stamp and the lifter's branch are new.
  IF is_admin() THEN RETURN NEW; END IF;
  -- Coach (anyone who is not the note's athlete) may only touch feedback fields.
  IF auth.uid() IS DISTINCT FROM OLD.athlete_id THEN
    IF (to_jsonb(NEW) - 'coach_comment' - 'coach_comment_at' - 'coach_id')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'coach_comment' - 'coach_comment_at' - 'coach_id') THEN
      RAISE EXCEPTION 'A coach may only write feedback fields on a session note.';
    END IF;
    -- The lifter's current coach changing the reply: signed and stamped here.
    IF auth.uid() IS NOT NULL
       AND NEW.coach_comment IS DISTINCT FROM OLD.coach_comment
       AND public.is_current_coach_of(OLD.athlete_id) THEN
      NEW.coach_id := auth.uid();
      NEW.coach_comment_at := CASE WHEN nullif(btrim(NEW.coach_comment), '') IS NOT NULL THEN now() END;
    END IF;
  ELSE
    -- The note's own lifter edits their note; the coach's reply stays as the coach left it.
    NEW.coach_comment := OLD.coach_comment;
    NEW.coach_comment_at := OLD.coach_comment_at;
    NEW.coach_id := OLD.coach_id;
  END IF;
  RETURN NEW;
END;
$$;
revoke all on function public.guard_session_notes_update() from public, anon, authenticated;

-- 4. A former coach is read-only: every write in a thread needs the live link, as sending already did --
-- (msg_member_insert checks the same EXISTS; msg_member_read and mr_member_read are unchanged.)
alter policy msg_member_update on public.messages
  using (((select auth.uid()) = coach_id or (select auth.uid()) = athlete_id)
         and exists (select 1 from public.profiles p where p.id = messages.athlete_id and p.coach_id = messages.coach_id))
  with check (((select auth.uid()) = coach_id or (select auth.uid()) = athlete_id)
              and exists (select 1 from public.profiles p where p.id = messages.athlete_id and p.coach_id = messages.coach_id));
alter policy msg_sender_delete on public.messages
  using ((sender_id = (select auth.uid())
          and exists (select 1 from public.profiles p where p.id = messages.athlete_id and p.coach_id = messages.coach_id))
         or (select public.is_admin()));
alter policy mr_own_insert on public.message_reactions
  with check (user_id = (select auth.uid())
              and ((select auth.uid()) = coach_id or (select auth.uid()) = athlete_id)
              and exists (select 1 from public.messages m
                           where m.id = message_reactions.message_id and m.coach_id = message_reactions.coach_id
                             and m.athlete_id = message_reactions.athlete_id)
              and exists (select 1 from public.profiles p
                           where p.id = message_reactions.athlete_id and p.coach_id = message_reactions.coach_id));
alter policy mr_own_update on public.message_reactions
  using (user_id = (select auth.uid())
         and exists (select 1 from public.profiles p
                      where p.id = message_reactions.athlete_id and p.coach_id = message_reactions.coach_id))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.profiles p
                           where p.id = message_reactions.athlete_id and p.coach_id = message_reactions.coach_id));
alter policy mr_own_delete on public.message_reactions
  using (user_id = (select auth.uid())
         and exists (select 1 from public.profiles p
                      where p.id = message_reactions.athlete_id and p.coach_id = message_reactions.coach_id));

-- 5. Signed-in-only policies say so (their USING / WITH CHECK are unchanged) -------------------------------
alter policy checkins_athlete_all on public.checkins to authenticated;
alter policy checkins_coach_select on public.checkins to authenticated;
alter policy client_errors_admin_read on public.client_errors to authenticated;
alter policy mp_coach_delete_own on public.marketplace_programs to authenticated;
alter policy mp_coach_insert on public.marketplace_programs to authenticated;
alter policy mp_coach_update_own on public.marketplace_programs to authenticated;
alter policy ps_admin_all on public.program_sales to authenticated;
alter policy ps_buyer_read on public.program_sales to authenticated;
alter policy ps_coach_read on public.program_sales to authenticated;
alter policy session_notes_coach_insert on public.session_notes to authenticated;
alter policy session_notes_coach_select on public.session_notes to authenticated;
alter policy session_notes_coach_update on public.session_notes to authenticated;

-- 6. Invite seats -----------------------------------------------------------------------------------
-- SECURITY INVOKER: only the coach (or an admin) gets as far as the count, and they read all of that coach's
-- lifters and invites through their own policies (profiles_select, invites_owner).
create or replace function public.guard_invite_seats()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_tier  text;
  v_limit int;
  v_taken int;
begin
  -- migration-security-fixes-2026-10-28.sql (STATUS-check row 59).
  -- No signed-in user: the service role or the SQL editor (a signed-out write is refused by RLS anyway).
  if auth.uid() is null then
    return new;
  end if;
  -- The server's clock: an invite holds a seat for 60 days, and can't be dated out of the count.
  if tg_op = 'INSERT' then
    new.created_at := now();
  else
    new.created_at := old.created_at;
  end if;
  -- Counted: a write that makes a seat, i.e. a new unused invite or a used one made unused again.
  if coalesce(new.used, false) then
    return new;
  end if;
  if tg_op = 'UPDATE' and not coalesce(old.used, false) and new.coach_id is not distinct from old.coach_id then
    return new;
  end if;
  -- Another coach's id: invites_owner refuses the write, and this says nothing about how full their plan is.
  if new.coach_id is distinct from auth.uid() and not public.is_admin() then
    return new;
  end if;
  -- The athlete limit's rules (enforce_athlete_limit), under the same per-coach lock as an invite claim.
  perform pg_advisory_xact_lock(hashtext(new.coach_id::text));
  select public.powa_effective_tier(p.subscription_tier, p.subscription_period_end) into v_tier
    from public.profiles p
   where p.id = new.coach_id;
  v_limit := case coalesce(v_tier, 'free')
    when 'basic'   then 10
    when 'pro'     then 25
    when 'premium' then null   -- unlimited
    else 3                     -- free / unknown
  end;
  if v_limit is null then
    return new;
  end if;
  select (select count(*) from public.profiles p where p.coach_id = new.coach_id)
       + (select count(*) from public.invites i
           where i.coach_id = new.coach_id
             and not coalesce(i.used, false)
             and i.created_at > now() - interval '60 days'
             and (tg_op = 'INSERT' or i.code is distinct from old.code))
    into v_taken;
  if v_taken >= v_limit then
    raise exception 'INVITE_LIMIT_REACHED: this coach is at their plan limit (% athletes, counting unused invites). Delete an unused invite or upgrade to add more.', v_limit
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_invite_seats() from public, anon, authenticated;

drop trigger if exists trg_guard_invite_seats on public.invites;
create trigger trg_guard_invite_seats
  before insert or update on public.invites
  for each row execute function public.guard_invite_seats();

-- 7. invite_preview: the client's IP the way the edge functions read it --------------------------------
-- An older file run again (migration-security-2026-10-22.sql, -invite-links-) leaves the two-column version, whose
-- return type create or replace can't change: drop that one first (as migration-invite-brand-2026-10-27.sql does).
do $$
begin
  if position('brand_name' in pg_get_function_result(to_regprocedure('public.invite_preview(text)'))) = 0 then
    drop function public.invite_preview(text);
  end if;
end $$;
create or replace function public.invite_preview(p_code text)
returns table (coach_name text, avatar_url text, brand_name text, brand_logo_url text, brand_color text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hdr  json;
  v_hops text[];
  v_ip   text;
  v_ok   boolean;
begin
  -- migration-security-fixes-2026-10-28.sql (STATUS-check row 59): the IP is read in _shared/rate-limit.ts
  -- clientIp's order: cf-connecting-ip (Cloudflare sets it), then the LAST x-forwarded-for hop (the first is
  -- whatever the client sent), then x-real-ip.
  if to_regprocedure('public.rl_bump(text,text,integer,integer)') is not null then
    begin
      v_hdr := nullif(current_setting('request.headers', true), '')::json;
    exception when others then v_hdr := null;
    end;
    select coalesce(array_agg(btrim(h.hop) order by h.n) filter (where btrim(h.hop) <> ''), '{}')
      into v_hops
      from unnest(string_to_array(coalesce(v_hdr->>'x-forwarded-for', ''), ',')) with ordinality as h(hop, n);
    v_ip := coalesce(nullif(btrim(v_hdr->>'cf-connecting-ip'), ''),
                     v_hops[cardinality(v_hops)],
                     nullif(btrim(v_hdr->>'x-real-ip'), ''),
                     'unknown');
    select r.allowed into v_ok from public.rl_bump('invite-preview-all', 'all', 3600, 3000) r;
    if v_ok is false then
      raise exception 'Too many lookups. Try again later' using errcode = 'check_violation';
    end if;
    select r.allowed into v_ok from public.rl_bump('invite-preview', left(v_ip, 64), 3600, 30) r;
    if v_ok is false then
      raise exception 'Too many lookups. Try again later' using errcode = 'check_violation';
    end if;
  end if;

  return query
  select split_part(trim(coalesce(p.name, '')), ' ', 1) as coach_name,
         p.avatar_url,
         case when b.ok then p.brand_name end as brand_name,
         case when b.ok then p.brand_logo_url end as brand_logo_url,
         case when b.ok then p.brand_color end as brand_color
    from public.invites i
    join public.profiles p on p.id = i.coach_id
    cross join lateral (
      select public.powa_effective_tier(p.subscription_tier, p.subscription_period_end) in ('pro', 'premium') as ok
    ) b
   where i.code = upper(trim(coalesce(p_code, '')))
     and i.used = false
     and i.created_at > now() - interval '60 days'
   limit 1;
end;
$$;
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated;

-- Undo (set local powa.security_fixes_undo = 'on' after begin;): the 28 Oct state, exactly ---------------
do $undo$
begin
  if coalesce(current_setting('powa.security_fixes_undo', true), '') <> 'on' then
    raise notice 'security fixes (row 59): coach links frozen (accept_coach_request marks its link), coach_release_lifter, session-note guards, former coach read-only (5 policies), 12 policies TO authenticated, invite seats, invite_preview reads the last x-forwarded-for hop';
    return;
  end if;
  -- The five functions as live printed them on 28 Oct (pg_get_functiondef).
  execute $u1$
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_cols()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF current_setting('powa.social_role', true) = 'allow' THEN
    RETURN NEW;
  END IF;
  IF is_admin() THEN
    RETURN NEW;
  END IF;
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
$function$
$u1$;
  execute $u2$
CREATE OR REPLACE FUNCTION public.guard_profile_privileged_cols_insert()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role (no JWT — LS webhook, or a SECURITY DEFINER signup trigger)
  -- and admins may set anything.
  IF auth.uid() IS NULL OR is_admin() THEN
    RETURN NEW;
  END IF;

  -- Ordinary caller inserting a profile row: force privileged columns to safe
  -- values. A legitimate client signup never sets these to anything else.
  IF NEW.is_admin IS DISTINCT FROM false THEN
    NEW.is_admin := false;
  END IF;
  IF NEW.subscription_tier IS DISTINCT FROM 'free' THEN
    NEW.subscription_tier := 'free';
  END IF;
  IF NEW.user_type IS NULL OR NEW.user_type NOT IN ('athlete', 'coach') THEN
    NEW.user_type := 'athlete';
  END IF;

  RETURN NEW;
END;
$function$
$u2$;
  execute $u3$
CREATE OR REPLACE FUNCTION public.accept_coach_request(request_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_athlete uuid;
  v_coach   uuid;
  v_status  text;
  v_current uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT athlete_id, coach_id, status
    INTO v_athlete, v_coach, v_status
    FROM public.coach_requests
   WHERE id = request_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  IF v_coach <> auth.uid() THEN
    RAISE EXCEPTION 'Not your request to accept';
  END IF;
  IF v_status = 'accepted' THEN
    RETURN v_athlete;  -- idempotent
  END IF;
  IF v_status <> 'pending' THEN
    RAISE EXCEPTION 'Request is no longer pending';
  END IF;

  -- Don't silently poach an athlete already linked to another coach.
  SELECT coach_id INTO v_current FROM public.profiles WHERE id = v_athlete;
  IF v_current IS NOT NULL AND v_current <> v_coach THEN
    RAISE EXCEPTION 'Athlete is already linked to another coach';
  END IF;

  -- Authorise the guarded 'accepted' transition for THIS transaction only.
  PERFORM set_config('powa.cr_accept', '1', true);

  UPDATE public.profiles
     SET coach_id = v_coach
   WHERE id = v_athlete;

  UPDATE public.coach_requests
     SET status = 'accepted', updated_at = now()
   WHERE id = request_id;

  RETURN v_athlete;
END;
$function$
$u3$;
  execute $u4$
CREATE OR REPLACE FUNCTION public.guard_session_notes_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF is_admin() THEN RETURN NEW; END IF;
  -- Coach (anyone who is not the note's athlete) may only touch feedback fields.
  IF auth.uid() IS DISTINCT FROM OLD.athlete_id THEN
    IF (to_jsonb(NEW) - 'coach_comment' - 'coach_comment_at' - 'coach_id')
       IS DISTINCT FROM
       (to_jsonb(OLD) - 'coach_comment' - 'coach_comment_at' - 'coach_id') THEN
      RAISE EXCEPTION 'A coach may only write feedback fields on a session note.';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$
$u4$;
  execute $u5$
CREATE OR REPLACE FUNCTION public.invite_preview(p_code text)
 RETURNS TABLE(coach_name text, avatar_url text, brand_name text, brand_logo_url text, brand_color text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_hdr json;
  v_ip  text;
  v_ok  boolean;
begin
  if to_regprocedure('public.rl_bump(text,text,integer,integer)') is not null then
    begin
      v_hdr := nullif(current_setting('request.headers', true), '')::json;
    exception when others then v_hdr := null;
    end;
    v_ip := coalesce(nullif(btrim(v_hdr->>'cf-connecting-ip'), ''),
                     nullif(btrim(v_hdr->>'x-real-ip'), ''),
                     nullif(btrim(split_part(coalesce(v_hdr->>'x-forwarded-for', ''), ',', 1)), ''),
                     'unknown');
    select r.allowed into v_ok from public.rl_bump('invite-preview-all', 'all', 3600, 3000) r;
    if v_ok is false then
      raise exception 'Too many lookups. Try again later' using errcode = 'check_violation';
    end if;
    select r.allowed into v_ok from public.rl_bump('invite-preview', left(v_ip, 64), 3600, 30) r;
    if v_ok is false then
      raise exception 'Too many lookups. Try again later' using errcode = 'check_violation';
    end if;
  end if;

  return query
  select split_part(trim(coalesce(p.name, '')), ' ', 1) as coach_name,
         p.avatar_url,
         case when b.ok then p.brand_name end as brand_name,
         case when b.ok then p.brand_logo_url end as brand_logo_url,
         case when b.ok then p.brand_color end as brand_color
    from public.invites i
    join public.profiles p on p.id = i.coach_id
    cross join lateral (
      select public.powa_effective_tier(p.subscription_tier, p.subscription_period_end) in ('pro', 'premium') as ok
    ) b
   where i.code = upper(trim(coalesce(p_code, '')))
     and i.used = false
     and i.created_at > now() - interval '60 days'
   limit 1;
end;
$function$
$u5$;
  drop trigger if exists trg_guard_invite_seats on public.invites;
  drop function if exists public.guard_invite_seats();
  drop trigger if exists trg_guard_session_notes_insert on public.session_notes;
  drop function if exists public.guard_session_notes_insert();
  drop function if exists public.coach_release_lifter(uuid);
  -- The policies' 28 Oct texts and roles.
  alter policy msg_member_update on public.messages
    using ((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id))
    with check ((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id));
  alter policy msg_sender_delete on public.messages
    using ((sender_id = ( SELECT auth.uid() AS uid)) OR ( SELECT is_admin() AS is_admin));
  alter policy mr_own_insert on public.message_reactions
    with check ((user_id = ( SELECT auth.uid() AS uid)) AND ((( SELECT auth.uid() AS uid) = coach_id) OR (( SELECT auth.uid() AS uid) = athlete_id)) AND (EXISTS ( SELECT 1 FROM messages m WHERE ((m.id = message_reactions.message_id) AND (m.coach_id = message_reactions.coach_id) AND (m.athlete_id = message_reactions.athlete_id)))));
  alter policy mr_own_update on public.message_reactions
    using (user_id = ( SELECT auth.uid() AS uid)) with check (user_id = ( SELECT auth.uid() AS uid));
  alter policy mr_own_delete on public.message_reactions
    using (user_id = ( SELECT auth.uid() AS uid));
  alter policy checkins_athlete_all on public.checkins to public;
  alter policy checkins_coach_select on public.checkins to public;
  alter policy client_errors_admin_read on public.client_errors to public;
  alter policy mp_coach_delete_own on public.marketplace_programs to public;
  alter policy mp_coach_insert on public.marketplace_programs to public;
  alter policy mp_coach_update_own on public.marketplace_programs to public;
  alter policy ps_admin_all on public.program_sales to public;
  alter policy ps_buyer_read on public.program_sales to public;
  alter policy ps_coach_read on public.program_sales to public;
  alter policy session_notes_coach_insert on public.session_notes to public;
  alter policy session_notes_coach_select on public.session_notes to public;
  alter policy session_notes_coach_update on public.session_notes to public;
  raise notice 'security fixes (row 59) undone: functions and policies as on 28 Oct; coach_release_lifter, guard_session_notes_insert and guard_invite_seats dropped';
end $undo$;

commit;

-- Verify (STATUS-check.sql rows 24, 46, 49 and 59 read true):
--   select p.oid::regprocedure, position('migration-security-fixes-2026-10-28' in p.prosrc) > 0 as this_file
--     from pg_proc p where p.oid in ('public.guard_profile_privileged_cols()'::regprocedure,
--       'public.guard_profile_privileged_cols_insert()'::regprocedure, 'public.accept_coach_request(uuid)'::regprocedure,
--       'public.guard_session_notes_update()'::regprocedure, 'public.invite_preview(text)'::regprocedure,
--       'public.coach_release_lifter(uuid)'::regprocedure, 'public.guard_session_notes_insert()'::regprocedure,
--       'public.guard_invite_seats()'::regprocedure);                                   -- 8 rows, all true
--   select tgname from pg_trigger where tgname in ('trg_guard_session_notes_insert', 'trg_guard_invite_seats');   -- 2 rows
--   select tablename, policyname, roles from pg_policies where schemaname = 'public' and roles = '{public}';
--     -- 2 rows: marketplace_programs_select, pr_public_read
--   select count(*) from pg_policies where schemaname = 'public';                     -- 164, as before
