// The self-coached lifter's program editor (lifter-program.js) against the coach desk's REAL engine (coach-preview/kit/r6/
// block.js): the app's program → the editor's block → edits made with the block's own moves → the app's program again.
// What it proves: a logged set is never changed, dropped, reordered or re-identified; an untouched program comes back as
// the same object; each kind of edit lands where it should and only there; a set field the editor has no word for (cx,
// acc, pauseAt, a swap, an id) survives on lines nobody touched and on a line whose edit is about something else.
// No browser, no dependencies:  node test/lifter-program.test.mjs   (exit 0 = all passed)
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sb = { console, Math, Date, JSON };
sb.window = sb; sb.location = { search: '', hash: '', pathname: '/' };
const mem = {}; sb.sessionStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); }, removeItem: (k) => { delete mem[k]; }, key: () => null, length: 0 };
sb.localStorage = sb.sessionStorage;
vm.createContext(sb);
for (const f of ['coach-preview/kit/data.js', 'coach-preview/kit/kit.js', 'coach-preview/kit/coach.js', 'coach-preview/kit/r6/block.js', 'lifter-program.js']) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), sb, { filename: f });
const B = sb.BLOCK, LP = sb.LifterProgram;
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra != null && extra !== '' ? '  (' + extra + ')' : '')); };
const J = (x) => JSON.stringify(x);
const clone = (x) => JSON.parse(J(x));

/* a program as the app keeps one: 4 weeks of 3 days and a rest day; weeks 1 and 2 logged (a skipped set, a warm-up,
   set fields the editor has no word for); week 3 under way (Squat Day logged in part); week 4 to come; a pinned day */
let n = 0; const id = () => 'id-' + (++n);
const S = (o) => Object.assign({ id: id(), weight: 100, reps: 5, rpe: 8, completed: false }, o);
const L = (o, on) => S(Object.assign({ completed: true, completedAt: on, actualRpe: 8.5 }, o));
function week(wi) {
  const on = ['2026-11-02', '2026-11-09', '2026-11-23', null][wi], logged = wi < 2;
  const sq = (o) => logged ? L(o, on) : S(o);
  const squat = { id: id(), lift: 'squat', variant: 'Competition', exerciseName: '', note: 'Stay tight.', swap: wi === 3 ? { to: 'Box squat' } : undefined, sets: [
    S({ weight: 60, reps: 5, rpe: null, extra: true }),
    sq({ weight: 175 + wi * 2.5, reps: 3, rpe: 8.5, cx: { Belt: 'on' } }),
    sq({ weight: 160 + wi * 2.5, reps: 5, rpe: 8, tempo: '3-1-0', cx: { Belt: 'off' } }),
    sq({ weight: 160 + wi * 2.5, reps: 5, rpe: 8, tempo: '3-1-0', cx: { Belt: 'off' } })] };
  if (squat.swap === undefined) delete squat.swap;
  const paused = { id: id(), lift: 'squat', variant: 'Paused', exerciseName: '', note: '', sets: [
    (logged ? L : (o) => S(o))({ weight: 130 + wi * 2.5, weightHi: 135 + wi * 2.5, reps: 4, rpe: 8, pause: 2, pauseAt: 'bottom' }, on),
    (logged ? L : (o) => S(o))({ weight: 130 + wi * 2.5, weightHi: 135 + wi * 2.5, reps: 4, rpe: 8, pause: 2, pauseAt: 'bottom' }, on)] };
  const legs = { id: id(), lift: 'legs', variant: '', exerciseName: 'Leg Press', note: '', sets: [sq({ weight: 120, reps: 10, rpe: 8 }), sq({ weight: 120, reps: 10, rpe: 8 })] };
  if (logged) legs.sets[1] = Object.assign(legs.sets[1], { completed: false, skipped: true, completedAt: null });
  const bench = { id: id(), lift: 'bench', variant: 'Competition', exerciseName: '', note: '', sets: [
    (logged ? L : (o) => S(o))({ weight: 110 + wi * 2.5, reps: 3, rpe: 8.5 }, on),
    (logged ? L : (o) => S(o))({ weight: 100 + wi * 2.5, reps: 5, rpe: 8, acc: 'bands', accTxt: 'light' }, on),
    (logged ? L : (o) => S(o))({ weight: 100 + wi * 2.5, reps: 5, rpe: 8, acc: 'bands', accTxt: 'light' }, on)] };
  const dl = { id: id(), lift: 'deadlift', variant: 'Competition', exerciseName: '', note: '', sets: [
    (logged ? L : (o) => S(o))({ weight: 220 + wi * 2.5, reps: 2, rpe: 8.5 }, on),
    (logged ? L : (o) => S(o))({ weight: 200 + wi * 2.5, reps: 4, rpe: 8, acc: 'chains', accKg: 20 }, on)] };
  const days = [
    { id: id(), name: 'Squat Day', exercises: [squat, paused, legs] },
    { id: id(), name: 'Bench Day', exercises: [bench] },
    { id: id(), name: 'Deadlift Day', exercises: [dl] },
    { id: id(), name: 'Rest', exercises: [] }];
  if (wi === 2) { squat.sets[1] = L({ weight: squat.sets[1].weight, reps: 3, rpe: 8.5, cx: { Belt: 'on' } }, on); }   // week 3: the squat top set logged today
  if (wi === 3) days[1].scheduledDate = '2026-12-02';
  return { id: id(), number: wi + 1, days };
}
const PROG = { id: 'prog-1', athleteId: 'me', coachId: 'me', name: 'Strength Block', setFields: { tempo: true }, weeks: [0, 1, 2, 3].map(week) };
const FROZEN = clone(PROG);
const loggedSets = (p) => { const o = []; p.weeks.forEach((w, wi) => w.days.forEach((d) => d.exercises.forEach((e) => e.sets.forEach((s) => { if (LP.isLogged(s)) o.push(s); })))); return o; };
const LOGGED0 = loggedSets(PROG);

/* the editor's side, as kit/r6/solo.js and programs.html do it: the block from the program, the engine's loads */
const te = LP.toEditor(PROG, { today: '2026-11-26' });
ok('the week under way is week 3', te.map.weekIdx === 2, te.map.weekIdx);
const lifter = { id: 'me', name: 'You', first: 'you', program: te.program, logs: [], lifts: {}, intake: null, week: null };
const b0 = B.build(lifter);
const base = b0.toJSON();
const loadsOf = (j) => { const b = B.from(clone(j)), out = {}; b.rows.forEach((row, r) => b.weeks.forEach((w, c) => { const x = row.cells[w.uid]; if (!x || x.lifted || w.state === 'lifted') return; const l = b.load(r, c); if (l && typeof l.kg === 'number') out[row.key + '|' + w.uid] = l.kg; })); return out; };
const L0 = loadsOf(base);
ok('the block reads every week and day of the program', base.weeks.length === 4 && base.days.map((d) => d.name).join() === 'Squat Day,Bench Day,Deadlift Day', base.days.map((d) => d.name).join());
ok('weeks 1 and 2 are lifted, week 3 is this week', base.weeks.map((w) => w.state).join() === 'lifted,lifted,now,next', base.weeks.map((w) => w.state).join());
let k = 0; const mkId = () => 'new-' + (++k);
const apply = (next) => LP.applyBlock(PROG, te.map, base, next, { loads0: L0, loads: loadsOf(next), id: mkId });
const edit = (f) => { const b = B.from(clone(base)); const r = f(b); if (r && r.error) throw new Error(J(r.error)); return apply(b.toJSON()); };
const row = (b, day, name, line) => b.rows.findIndex((x) => x.day === day && x.name === name && (x.line || 0) === (line || 0));
const sameLogged = (p) => { const a = loggedSets(p); return a.length === LOGGED0.length && a.every((s, i) => s === LOGGED0[i]); };
const exOf = (p, wi, day, pick) => p.weeks[wi].days.find((d) => d.name === day).exercises.find(pick);
const isSq = (e) => e.lift === 'squat' && e.variant === 'Competition';

// 1. untouched
let r = apply(base);
ok('an untouched program comes back as the same object', r.program === PROG && r.changed === false);
r = apply(B.from(clone(base)).toJSON());
ok('read and written again with no edit: the same object', r.program === PROG && !r.changed);
ok('the program itself was never changed in place', J(PROG) === J(FROZEN));

// 2. a load on a week to come
r = edit((b) => { const i = row(b, 'Squat Day', 'Squat', 0), x = B.cellOf(b.rows[i].cells[b.weeks[3].uid]); x.w = 187.5; return b.set(i, 3, B.text(x)); });
let sq4 = exOf(r.program, 3, 'Squat Day', isSq);
ok('a load lands on the top set of week 4, and only there', sq4.sets[1].weight === 187.5 && sq4.sets[2].weight === 167.5 && sq4.sets[3].weight === 167.5, J(sq4.sets.map((s) => s.weight)));
ok('its set keeps its id, Belt column and RPE', sq4.sets[1].id === PROG.weeks[3].days[0].exercises[0].sets[1].id && J(sq4.sets[1].cx) === '{"Belt":"on"}' && sq4.sets[1].rpe === 8.5);
ok('the warm-up stays first, as it was', sq4.sets[0] === PROG.weeks[3].days[0].exercises[0].sets[0]);
ok('the exercise keeps its swap and id', J(sq4.swap) === '{"to":"Box squat"}' && sq4.id === PROG.weeks[3].days[0].exercises[0].id);
ok('every other week is the same object', [0, 1, 2].every((i) => r.program.weeks[i] === PROG.weeks[i]));
ok('the other days of week 4 are the same objects (the pin kept)', r.program.weeks[3].days[1] === PROG.weeks[3].days[1] && r.program.weeks[3].days[1].scheduledDate === '2026-12-02');
ok('the other lines of the day are the same objects', r.program.weeks[3].days[0].exercises[1] === PROG.weeks[3].days[0].exercises[1]);
ok('logged sets identical', sameLogged(r.program));

// 2b. a note typed on a line for one week (the editor keeps it on that week's cell): Train shows the EXERCISE's note,
//     so that week's exercise takes it; the first line's words lead, another line's own words follow
const noteOn = (pairs) => { const j = clone(base); pairs.forEach(([line, text]) => { const i = j.rows.findIndex((x) => x.day === 'Squat Day' && x.name === 'Squat' && (x.line || 0) === line); j.rows[i].cells[j.weeks[3].uid].note = text; }); return apply(j); };
r = noteOn([[0, 'Keep them tight, 20 kg plates']]);
sq4 = exOf(r.program, 3, 'Squat Day', isSq);
ok('a note typed for week 4 is that week\'s exercise note (what Train shows)', sq4.note === 'Keep them tight, 20 kg plates', J(sq4.note));
ok('the note changes nothing else: ids, loads and the other weeks as they were', sq4.id === PROG.weeks[3].days[0].exercises[0].id && sq4.sets[1].weight === PROG.weeks[3].days[0].exercises[0].sets[1].weight && [0, 1, 2].every((i) => r.program.weeks[i] === PROG.weeks[i]) && r.program.weeks[3].days[1] === PROG.weeks[3].days[1]);
ok('logged sets identical', sameLogged(r.program));
r = noteOn([[0, 'Keep them tight'], [1, 'Slow on the way down']]);
ok('a back-off line\'s own words follow the first line\'s', exOf(r.program, 3, 'Squat Day', isSq).note === 'Keep them tight · Slow on the way down', J(exOf(r.program, 3, 'Squat Day', isSq).note));

// 3. reps and RPE on the back-offs of week 4 (their tempo, Belt off and ids stay)
r = edit((b) => { const i = row(b, 'Squat Day', 'Squat', 1), x = B.cellOf(b.rows[i].cells[b.weeks[3].uid]); x.r = 6; x.rpe = 8.5; return b.set(i, 3, B.text(x)); });
sq4 = exOf(r.program, 3, 'Squat Day', isSq);
ok('reps and RPE land on both back-off sets', sq4.sets[2].reps === 6 && sq4.sets[3].reps === 6 && sq4.sets[2].rpe === 8.5 && sq4.sets[3].rpe === 8.5, J(sq4.sets.slice(2)));
ok('their tempo, Belt off and ids are kept', sq4.sets[2].tempo === '3-1-0' && J(sq4.sets[3].cx) === '{"Belt":"off"}' && sq4.sets[2].id === PROG.weeks[3].days[0].exercises[0].sets[2].id);
ok('the top set is the same object', sq4.sets[1] === PROG.weeks[3].days[0].exercises[0].sets[1]);

// 4. a set more and a set fewer
r = edit((b) => { const i = row(b, 'Bench Day', 'Bench', 1), x = B.cellOf(b.rows[i].cells[b.weeks[3].uid]); x.n = 3; return b.set(i, 3, B.text(x)); });
let be4 = exOf(r.program, 3, 'Bench Day', (e) => e.lift === 'bench');
ok('a third back-off set copies the second (bands and all), with an id of its own', be4.sets.length === 4 && be4.sets[3].acc === 'bands' && be4.sets[3].accTxt === 'light' && be4.sets[3].id && be4.sets[3].id !== be4.sets[2].id && !be4.sets[3].completed, J(be4.sets[3]));
r = edit((b) => { const i = row(b, 'Bench Day', 'Bench', 1), x = B.cellOf(b.rows[i].cells[b.weeks[3].uid]); x.n = 1; return b.set(i, 3, B.text(x)); });
be4 = exOf(r.program, 3, 'Bench Day', (e) => e.lift === 'bench');
ok('one back-off set fewer drops the last', be4.sets.length === 2 && be4.sets[1] !== undefined && be4.sets[1].acc === 'bands');

// 5. a changed exercise (Leg press has lifted weeks: it becomes Hack squat from week 3 on)
r = edit((b) => b.changeExercise(row(b, 'Squat Day', 'Leg press', 0), 2, 'Hack squat'));
const legName = (p, wi) => p.weeks[wi].days[0].exercises.map((e) => e.exerciseName || e.variant).join(',');
ok('Hack squat in week 4', /Hack squat/.test(legName(r.program, 3)) && !/Leg Press/.test(legName(r.program, 3)), legName(r.program, 3));
ok('weeks 1 and 2 keep Leg Press (the same objects)', r.program.weeks[0] === PROG.weeks[0] && r.program.weeks[1] === PROG.weeks[1]);
ok('week 3: the logged Squat Day is never rewritten, the change waits for the days not started', r.program.weeks[2].days[0] === PROG.weeks[2].days[0]);
ok('logged sets identical', sameLogged(r.program));

// 6. a line added (a new exercise on week 4's Bench Day)
r = edit((b) => { const a = b.addExercise('Bench Day', 'Dumbbell row', { lift: null }); if (a.error) return a; return b.set(a.data.r, 3, '3x10 @8'); });
be4 = r.program.weeks[3].days[1];
const row4 = be4.exercises.find((e) => /row/i.test(e.exerciseName));
ok('the new line is on Bench Day in week 4: 3 × 10 @8, not logged', row4 && row4.sets.length === 3 && row4.sets.every((s) => s.reps === 10 && s.rpe === 8 && s.completed === false), J(row4));
ok('the bench before it is the same object; the day keeps its pin and id', be4.exercises[0] === PROG.weeks[3].days[1].exercises[0] && be4.scheduledDate === '2026-12-02' && be4.id === PROG.weeks[3].days[1].id);

// 7. a week added after the last, from it
r = edit((b) => b.addWeek());
ok('week 5 is in the program, numbered 5, with its days and a rest day', r.program.weeks.length === 5 && r.program.weeks[4].number === 5 && r.program.weeks[4].days.map((d) => d.name).join() === 'Squat Day,Bench Day,Deadlift Day,Rest', r.program.weeks[4].days.map((d) => d.name).join());
ok('its sets are new and not logged', r.program.weeks[4].days.every((d) => d.exercises.every((e) => e.sets.every((s) => !s.completed && s.id && s.reps > 0))));
ok('weeks 1 to 4 are the same objects', [0, 1, 2, 3].every((i) => r.program.weeks[i] === PROG.weeks[i]));

// 8. a week removed (week 4, never lifted), and a lifted week can never go
r = edit((b) => b.removeWeek(3));
ok('week 4 removed', r.program.weeks.length === 3 && r.program.weeks[2] === PROG.weeks[2]);
const bad = B.from(clone(base)); bad.weeks.splice(0, 1);
r = apply(bad.toJSON());
ok('a block missing a lifted week is refused, the program as it was', !!r.error && r.program === PROG, r.error);

// 9. a deload on week 4
r = edit((b) => b.deload(3));
const sets = (w) => w.days.reduce((a, d) => a + d.exercises.reduce((x, e) => x + e.sets.filter((s) => !s.extra).length, 0), 0);
ok('week 4 is a deload: fewer sets, easier', sets(r.program.weeks[3]) < sets(PROG.weeks[3]) && exOf(r.program, 3, 'Squat Day', isSq).sets[1].rpe < 8.5, sets(PROG.weeks[3]) + ' -> ' + sets(r.program.weeks[3]));
ok('the deload keeps the warm-up and the pin', exOf(r.program, 3, 'Squat Day', isSq).sets[0] === PROG.weeks[3].days[0].exercises[0].sets[0] && r.program.weeks[3].days[1].scheduledDate === '2026-12-02');
ok('logged sets identical', sameLogged(r.program));

// 10. a renamed day
r = edit((b) => b.renameDay('Deadlift Day', 'Pull Day'));
ok('Pull Day in week 4 (and the days not started in week 3)', r.program.weeks[3].days[2].name === 'Pull Day' && r.program.weeks[2].days[2].name === 'Pull Day', r.program.weeks.map((w) => w.days[2].name).join());
ok('the lifted weeks keep Deadlift Day', r.program.weeks[0] === PROG.weeks[0] && r.program.weeks[0].days[2].name === 'Deadlift Day');
ok('the renamed day keeps its id and exercises', r.program.weeks[3].days[2].id === PROG.weeks[3].days[2].id && r.program.weeks[3].days[2].exercises[0] === PROG.weeks[3].days[2].exercises[0]);

// 11. a lifted week edited by force is never written
const forced = B.from(clone(base)); forced.rows.forEach((x) => { const c = x.cells[forced.weeks[0].uid]; if (c) c.r = 99; });
r = apply(forced.toJSON());
ok('cells of a lifted week changed in the block: the week is kept as it was', r.program.weeks[0] === PROG.weeks[0]);

// 12. a series of edits, then undo to the start
const series = B.from(clone(base));
series.set(row(series, 'Squat Day', 'Squat', 0), 3, '1x3 @9 190kg');
series.addWeek(); series.deload(4); series.renameDay('Bench Day', 'Press Day');
const a = series.addExercise('Press Day', 'Overhead press', { lift: null }); series.set(a.data.r, 3, '3x8 @7');
r = apply(series.toJSON());
ok('after a series of edits: logged sets identical (same objects, same order)', sameLogged(r.program));
ok('the lifted weeks are the same objects', r.program.weeks[0] === PROG.weeks[0] && r.program.weeks[1] === PROG.weeks[1]);
r = apply(B.from(clone(base)).toJSON());
ok('and back to the block as it was: the program at the start, the same object', r.program === PROG);

// 13. a new block from a block (Start your next block)
const tb = B.asTemplate(b0, { name: 'Next' }); tb.maxes = { squat: 200, bench: 130, deadlift: 240 }; tb.maxFrom = { squat: 'typed', bench: 'typed', deadlift: 'typed' };
const np = LP.blockToProgram(tb, { loads: loadsOf(tb), id: mkId, name: 'Next', athleteId: 'me', programId: 'prog-1' });
ok('a new block: the same program id, every week, nothing logged', np.id === 'prog-1' && np.weeks.length === 4 && np.weeks.every((w) => w.days.every((d) => d.exercises.every((e) => e.sets.every((s) => !s.completed)))));
ok('its loads are the engine\'s from the maxes', np.weeks[0].days[0].exercises.find(isSq).sets[0].weight > 0, J(np.weeks[0].days[0].exercises.find(isSq).sets[0]));

console.log('\nRESULT: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
