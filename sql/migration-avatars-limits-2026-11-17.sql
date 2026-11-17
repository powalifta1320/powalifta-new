-- migration-avatars-limits-2026-11-17.sql — POWALIFTA. STATUS-check.sql row 66.
-- The public `avatars` bucket takes only pictures, up to 2 MB (security audit 16 Nov 2026, M5). Until now it had no
-- size or type limit: any signed-in account (signup is free) could put HTML, SVG, programs or big files into a PUBLIC
-- bucket and share links on cxnotrikxvzncupswvio.supabase.co, the same host as the API, images and sign-in.
--
-- What uses the bucket (db.js): uploadAvatar (avatars/<id>/avatar.<ext>, the picker accepts png, jpeg and webp) and
-- uploadBrandLogo (avatars/<id>/brand.png, shrunk to 256 px first). Both fit. Storage refuses anything else with an
-- error the app already shows as a toast.
-- Note: the avatar pickers in app.js still let a photo up to 3 MB through on the phone; one of 2 to 3 MB now gets
-- Storage's "exceeded the maximum allowed size" instead of the app's own "over 3 MB" toast.
--
-- Applied live on 17 Nov 2026 (migration avatars_limits_2026_11_17); on that day the bucket held 2 files, the largest
-- 674 KB, jpeg and png, so nothing already there is affected (limits apply to new uploads only).
-- Idempotent: running it again sets the same values.
--
-- Undo (the values before 17 Nov):
--   update storage.buckets set file_size_limit = null, allowed_mime_types = null where id = 'avatars';
update storage.buckets
   set file_size_limit = 2097152,
       allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
 where id = 'avatars';

-- Verify (expected: avatars | true | 2097152 | {image/jpeg,image/png,image/webp}):
--   select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'avatars';
