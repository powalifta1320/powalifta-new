// program-read's clean-up (supabase/functions/program-read/shape.ts), run under Node (type stripping).
// Run: node test/program-read.test.mjs
import { cleanRead, parseReply, LIMITS, SCHEMA, PROMPT } from '../supabase/functions/program-read/shape.ts';

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

t('a normal read comes through unchanged', () => {
  const r = cleanRead({ name: 'Block 2', unit: 'kg', weeks: 2, days: [{ name: 'Day 1', exercises: [{ name: 'Competition Squat', cells: ['1x3 @8, 3x5 75%', '1x2 @8.5, 3x4 77.5%'] }] }], unsure: [] });
  eq(r.weeks, 2); eq(r.days[0].exercises[0].cells, ['1x3 @8, 3x5 75%', '1x2 @8.5, 3x4 77.5%']); eq(r.unit, 'kg'); eq(r.name, 'Block 2');
});
t('not a program -> null', () => { eq(cleanRead({ notProgram: true }), null); eq(cleanRead(null), null); eq(cleanRead({ days: [] }), null); });
t('cells pad and trim to the week count', () => {
  const r = cleanRead({ weeks: 3, days: [{ name: 'D', exercises: [{ name: 'Bench', cells: ['3x5'] }, { name: 'Row', cells: ['3x8', '3x8', '3x8', '3x8'] }] }] });
  eq(r.days[0].exercises[0].cells, ['3x5', '', '']); eq(r.days[0].exercises[1].cells, ['3x8', '3x8', '3x8']);
});
t('no week count: the widest row decides, capped', () => {
  const r = cleanRead({ days: [{ name: 'D', exercises: [{ name: 'Bench', cells: Array(30).fill('3x5') }] }] });
  eq(r.weeks, LIMITS.weeks); eq(r.days[0].exercises[0].cells.length, LIMITS.weeks);
});
t('empty rows and days drop; unnamed days get a name', () => {
  const r = cleanRead({ weeks: 1, days: [{ name: '', exercises: [{ name: 'Squat', cells: ['3x5'] }] }, { name: 'Empty', exercises: [{ name: 'X', cells: [''] }] }] });
  eq(r.days.length, 1); eq(r.days[0].name, 'Day 1');
});
t('limits: days, exercises, text length, control characters', () => {
  const ex = Array.from({ length: 30 }, (_, i) => ({ name: 'Ex ' + i, cells: ['3x5'] }));
  const r = cleanRead({ weeks: 1, days: Array.from({ length: 9 }, (_, i) => ({ name: 'D' + i, exercises: ex })) });
  eq(r.days.length, LIMITS.days); eq(r.days[0].exercises.length, LIMITS.exercises);
  const r2 = cleanRead({ weeks: 1, days: [{ name: 'D\u0007ay', exercises: [{ name: 'Squat', cells: ['x'.repeat(500)] }] }] });
  eq(r2.days[0].name, 'D ay'); eq(r2.days[0].exercises[0].cells[0].length, LIMITS.cell);
});
t('unsure notes follow their exercise when rows before them drop', () => {
  const r = cleanRead({ weeks: 2, days: [{ name: 'D1', exercises: [{ name: 'Header row', cells: ['', ''] }, { name: 'Spoto Press', cells: ['4x5 @7', '4x? @7'] }] }],
    unsure: [{ day: 1, exercise: 2, week: 2, why: 'reps cut off' }, { day: 5, exercise: 1, week: 1, why: 'no such day' }, { day: 1, exercise: 2, week: 9, why: 'no such week' }] });
  eq(r.unsure, [{ day: 1, exercise: 1, week: 2, why: 'reps cut off' }]);
});
t('lb stays lb, anything else is kg', () => { eq(cleanRead({ unit: 'lb', weeks: 1, days: [{ name: 'D', exercises: [{ name: 'S', cells: ['3x5'] }] }] }).unit, 'lb'); eq(cleanRead({ unit: 'stone', weeks: 1, days: [{ name: 'D', exercises: [{ name: 'S', cells: ['3x5'] }] }] }).unit, 'kg'); });
t('parseReply: bare JSON, fenced JSON, junk', () => {
  eq(parseReply('{"a":1}'), { a: 1 }); eq(parseReply('```json\n{"a":2}\n```'), { a: 2 }); eq(parseReply('nope'), null);
});
t('schema and prompt are present', () => { ok(SCHEMA.properties.days.items.properties.exercises.items.properties.cells); ok(/never invent/i.test(PROMPT)); });

console.log('program-read shape: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
