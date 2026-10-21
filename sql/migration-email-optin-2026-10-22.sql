-- migration-email-optin-2026-10-22.sql — POWALIFTA. Optional, idempotent, run any time after
-- migration-email-preferences.sql.
-- "Product tips & announcements" becomes opt-in: new accounts start with it off (some lifters
-- are 16 or 17, and marketing email needs consent). The app already treats a missing row as off.
alter table public.email_preferences alter column product_emails set default false;

-- Existing rows were switched on by default when the table was created, and nobody can tell
-- a default from a choice. To make everyone opt in again, remove the two dashes below and run
-- this line too (it only touches the marketing switch, never the weekly progress email):
-- update public.email_preferences set product_emails = false where product_emails is true;
