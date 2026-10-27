// program-read: what we ask Gemini for, and the clean-up of what comes back.
// Pure (no Deno or network APIs), so test/program-read.test.mjs runs it under Node.

export const LIMITS = { weeks: 16, days: 7, exercises: 20, cell: 200, name: 80, note: 160, unsure: 60, why: 120 };

// The builder's own cell notation (app.js gridParseCell / parsePrescription): a coach can
// edit every cell exactly as they would in the program grid.
export const PROMPT = [
  'You read pictures and PDFs of strength-training programs (mostly powerlifting) and transcribe them into JSON.',
  'RULES',
  '1. Copy what is written. Never invent, compute or round a number. If you cannot read something, transcribe what you can and add an entry to "unsure".',
  '2. "days" are the training days in order, named as the program names them ("Day 1", "Monday", "Day 2 - Bench"). Each day lists its exercises in order.',
  '3. "weeks" is how many weeks the program covers. Every exercise has exactly one entry in "cells" per week: index 0 is week 1. Use "" for a week when the exercise is not done that week.',
  '4. Write each cell in this notation. Groups of sets: <sets>x<reps>, then the load, then the effort. Different groups are separated by ", ".',
  '   Load: "160kg" or "350lb" (if a number has no unit, use the program\'s unit), "75%" for a percentage of max, "140-145kg" or "70-75%" for a range.',
  '   Effort: "@8" for RPE 8, "@7-8" for an RPE range, "2RIR" for reps in reserve.',
  '   Extras go after the effort: "tempo 3-1-0", "paused 2s", "+ chains 20kg", "+ light bands". Any other short note goes last after " · " (for example "· belt").',
  '   Examples: "1x3 @8, 3x5 160kg @7" | "4x6 70-75%" | "3x8 2RIR" | "5x3 @7 paused 2s" | "3x10".',
  '   When sets, reps, load and RPE are in separate columns (Sets 3 | Reps 5 | Load 160 | RPE 7), combine them: "3x5 160kg @7".',
  '   When reps differ from set to set (5, 5, 3), write separate groups: "2x5 @7, 1x3 @8".',
  '   An AMRAP, a top set "to RPE 8" with no reps, or anything that does not fit: keep the readable part, put the rest after " · ", and add an "unsure" entry.',
  '5. Exercise names as written; spell out obvious short forms ("Comp Squat" -> "Competition Squat", "CG Bench" -> "Close Grip Bench"). Keep "RDL", "SSB Squat" and similar names as they are.',
  '6. "unit": "kg" or "lb", as the program uses. "name": the program\'s title if one is shown, else "".',
  '7. "unsure" entries point at a cell by 1-based numbers: day, exercise (within that day) and week (0 when it is about the whole row). "why" says what is unclear in a few words, e.g. "reps cut off" or "is this 140 or 145?".',
  '8. If the picture is not a training program, return {"notProgram": true} and nothing else.'
].join('\n');

// Gemini's response schema (OpenAPI subset, upper-case types).
export const SCHEMA = {
  type: 'OBJECT',
  properties: {
    notProgram: { type: 'BOOLEAN' },
    name: { type: 'STRING' },
    unit: { type: 'STRING' },
    weeks: { type: 'INTEGER' },
    days: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: { type: 'STRING' },
          exercises: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                name: { type: 'STRING' },
                note: { type: 'STRING' },
                cells: { type: 'ARRAY', items: { type: 'STRING' } }
              },
              required: ['name', 'cells']
            }
          }
        },
        required: ['name', 'exercises']
      }
    },
    unsure: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          day: { type: 'INTEGER' },
          exercise: { type: 'INTEGER' },
          week: { type: 'INTEGER' },
          why: { type: 'STRING' }
        },
        required: ['day', 'exercise', 'why']
      }
    }
  }
};

function text(v: unknown, max: number): string {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max).trim();
}
function int(v: unknown, lo: number, hi: number, dflt: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
}

export type Read = {
  name: string; unit: 'kg' | 'lb'; weeks: number;
  days: { name: string; exercises: { name: string; note: string; cells: string[] }[] }[];
  unsure: { day: number; exercise: number; week: number; why: string }[];
};

// Whatever the model sent back -> a bounded, well-formed read, or null when there is no program in it.
// "unsure" points at cells by the model's own positions; empty rows and days are dropped here, so each
// note rides on its exercise through the clean-up and gets renumbered at the end.
export function cleanRead(raw: any): Read | null {
  if (!raw || typeof raw !== 'object' || raw.notProgram === true) return null;
  const daysIn = Array.isArray(raw.days) ? raw.days : [];
  // The week count is the widest row the model wrote, never more than LIMITS.weeks.
  let widest = 0;
  daysIn.forEach((d: any) => (Array.isArray(d && d.exercises) ? d.exercises : []).forEach((e: any) => {
    if (e && Array.isArray(e.cells)) widest = Math.max(widest, e.cells.length);
  }));
  const weeks = int(raw.weeks || widest || 1, 1, LIMITS.weeks, 1);
  const notes: Record<string, { week: number; why: string }[]> = {};
  (Array.isArray(raw.unsure) ? raw.unsure : []).slice(0, LIMITS.unsure).forEach((u: any) => {
    const d = int(u && u.day, 0, 99, 0), e = int(u && u.exercise, 0, 99, 0), w = int(u && u.week, 0, 99, 0), why = text(u && u.why, LIMITS.why);
    if (d >= 1 && e >= 1 && w <= weeks && why) (notes[(d - 1) + ':' + (e - 1)] = notes[(d - 1) + ':' + (e - 1)] || []).push({ week: w, why });
  });
  const days = daysIn.slice(0, LIMITS.days).map((d: any, di: number) => {
    const exs = (Array.isArray(d && d.exercises) ? d.exercises : []).slice(0, LIMITS.exercises).map((e: any, ei: number) => {
      const cells: string[] = [];
      for (let w = 0; w < weeks; w++) cells.push(text(Array.isArray(e && e.cells) ? e.cells[w] : '', LIMITS.cell));
      return { name: text(e && e.name, LIMITS.name), note: text(e && e.note, LIMITS.note), cells, _u: notes[di + ':' + ei] || [] };
    }).filter((e: any) => e.name && e.cells.some((c: string) => c));
    return { name: text(d && d.name, LIMITS.name) || 'Day ' + (di + 1), exercises: exs };
  }).filter((d: any) => d.exercises.length);
  if (!days.length) return null;
  const unsure: Read['unsure'] = [];
  days.forEach((d: any, di: number) => d.exercises.forEach((e: any, ei: number) => {
    e._u.forEach((u: any) => unsure.push({ day: di + 1, exercise: ei + 1, week: u.week, why: u.why }));
    delete e._u;
  }));
  return { name: text(raw.name, LIMITS.name), unit: raw.unit === 'lb' ? 'lb' : 'kg', weeks, days, unsure: unsure.slice(0, LIMITS.unsure) };
}

// The first JSON object in a model reply (it should be bare JSON; tolerate a fenced block).
export function parseReply(t: string): any {
  const s = String(t || '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch { /* none */ } }
  return null;
}
