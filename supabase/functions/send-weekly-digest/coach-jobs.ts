// The coach jobs' pure helpers (send-weekly-digest): group the roster by coach, index rows by lifter,
// read programs lean, build the unsubscribe link. No Deno, no network: tested under Node
// (test/coach-jobs.test.mjs). What the report says lives in _shared/coach-report.js.
import '../_shared/coach-report.js'

// deno-lint-ignore no-explicit-any
const CR = (globalThis as any).CoachReport

type Row = Record<string, unknown>

export function chunk<T>(list: T[], n: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n))
  return out
}

// coach id → their lifters [{ id, name }]. A lifter on their own (no coach, or "coached" by themselves)
// belongs to nobody's report.
export function rosterByCoach(profiles: (Row | null)[]): Map<string, { id: string; name: string }[]> {
  const out = new Map<string, { id: string; name: string }[]>()
  for (const p of profiles || []) {
    if (!p || !p.id || !p.coach_id || p.coach_id === p.id) continue
    const k = String(p.coach_id)
    if (!out.has(k)) out.set(k, [])
    out.get(k)!.push({ id: String(p.id), name: String(p.name || '') })
  }
  return out
}

export function indexByAthlete<T extends Row>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>()
  for (const r of rows || []) {
    if (!r || !r.athlete_id) continue
    const k = String(r.athlete_id)
    if (!out.has(k)) out.set(k, [])
    out.get(k)!.push(r)
  }
  return out
}

export function pick<T>(index: Map<string, T[]>, ids: string[]): T[] {
  const out: T[] = []
  for (const id of ids || []) for (const r of index.get(id) || []) out.push(r)
  return out
}

// Programs as the report needs them: the sessions planned this week, the block's JSON dropped as soon
// as it's read (it is the heaviest thing the job touches).
export function leanPrograms(rows: Row[]): { athlete_id: unknown; coach_id: unknown; updated_at: unknown; planned: number }[] {
  return (rows || []).map((r) => ({
    athlete_id: r.athlete_id,
    coach_id: r.coach_id ?? null,
    updated_at: r.updated_at ?? null,
    planned: CR.plannedPerWeek(r.weeks),
  }))
}

// The coach's one-click unsubscribe: their own token, and r=coach so the page names the Monday report.
export function unsubLink(base: string, token: string | null | undefined): string {
  if (!token) return ''
  return base + encodeURIComponent(token) + (base.includes('?') ? '&r=coach' : '')
}

// Dry runs show who would get an email without spelling the address out.
export function maskEmail(e: unknown): string {
  const m = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/.exec(String(e || ''))
  if (!m) return ''
  const u = m[1]
  return (u.length <= 2 ? u.charAt(0) + '•••' : u.charAt(0) + '•••' + u.charAt(u.length - 1)) + '@' + m[2]
}
