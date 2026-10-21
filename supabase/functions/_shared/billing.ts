// Shared by the billing functions (apple-iap, apple-notifications, ls-webhook).
//
// The newer profile columns (sql/migration-payments-2026-10-22.sql: billing_provider,
// subscription_period_end) are read and written when they exist and skipped when they don't,
// so the functions can be deployed before or after that migration runs.

export const NEW_BILLING_COLS = ["billing_provider", "subscription_period_end"];

// PostgREST says "column ... does not exist" (42703) for a select and PGRST204 ("Could not
// find the '...' column") for a write.
export function missingColumn(err: unknown): boolean {
  const e = err as { message?: string; code?: string } | null;
  const text = `${e?.code ?? ""} ${e?.message ?? ""}`;
  return /PGRST204|42703|does not exist|Could not find the/i.test(text);
}

function withoutNew(patch: Record<string, unknown>): Record<string, unknown> {
  const p = { ...patch };
  for (const c of NEW_BILLING_COLS) delete p[c];
  return p;
}

// Select profiles with the new columns when the migration has run, without them before.
// `build` adds the filters: (q) => q.eq("id", uid).limit(1)
// deno-lint-ignore no-explicit-any
export async function selectProfilesSoft(admin: any, baseCols: string, build: (q: any) => any) {
  const full = `${baseCols}, ${NEW_BILLING_COLS.join(", ")}`;
  let r = await build(admin.from("profiles").select(full));
  if (r.error && missingColumn(r.error)) r = await build(admin.from("profiles").select(baseCols));
  return r;
}

// Update one profile; retried without the new columns before the migration.
// `build` can add conditions or a returning select: (q) => q.or("...").select("id")
// deno-lint-ignore no-explicit-any
export async function updateProfileSoft(admin: any, id: string, patch: Record<string, unknown>, build?: (q: any) => any) {
  const run = (p: Record<string, unknown>) => {
    let q = admin.from("profiles").update(p).eq("id", id);
    if (build) q = build(q);
    return q;
  };
  let r = await run(patch);
  if (r.error && missingColumn(r.error)) r = await run(withoutNew(patch));
  return r;
}

// Is Lemon Squeezy billing this coach right now? With billing_provider (after the migration) it's
// explicit; before it, the old guess (an LS id plus a live status).
// deno-lint-ignore no-explicit-any
export function lsLive(profile: any): boolean {
  const live = ["active", "on_trial", "trialing", "past_due"].includes(profile?.subscription_status ?? "");
  if (profile && "billing_provider" in profile) return profile.billing_provider === "ls" && live;
  return !!profile?.ls_subscription_id && live;
}

// Is Apple billing this coach right now?
// deno-lint-ignore no-explicit-any
export function appleLive(profile: any): boolean {
  const live = (profile?.subscription_status ?? "") === "active";
  if (profile && "billing_provider" in profile) return profile.billing_provider === "apple" && live;
  return !!profile?.apple_original_transaction_id && !profile?.ls_subscription_id && live;
}
