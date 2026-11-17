// node test/solo-start.test.mjs: the rules behind a solo lifter's start (solo-start.js): the training log
// (log a session with no program), the first-run numbers, the block preview and the exercise picker.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const S = require('../solo-start.js');

let pass = 0, fail = 0;
const test = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.error('FAIL ' + name + '\n  ' + (e && e.message)); } };

let n = 0;
const mk = { uid: (p) => p + '-' + (++n), day: (name) => ({ id: 'day-' + (++n), name, exercises: [] }) };
const ex = (lift, sets) => ({ id: 'ex-' + (++n), lift, variant: lift === 'squat' || lift === 'bench' || lift === 'deadlift' ? 'Competition' : '', exerciseName: '', sets });
const set = (weight, reps, rpe) => ({ weight, reps, rpe, completed: false });

// ---------- the training log ----------
test('mondayIso: the Monday of the week, Sunday belongs to the week before', () => {
  assert.equal(S.mondayIso('2026-11-17'), '2026-11-16');   // Tuesday
  assert.equal(S.mondayIso('2026-11-16'), '2026-11-16');   // Monday
  assert.equal(S.mondayIso('2026-11-22'), '2026-11-16');   // Sunday
  assert.equal(S.mondayIso('2026-11-23'), '2026-11-23');
  assert.equal(S.mondayIso('nonsense'), null);
});
test('a log session: first one makes week 1 and a dated, marked, empty day', () => {
  const p = { id: 'p', weeks: [] };
  const r = S.addLogSession(p, '2026-11-17', mk);
  assert.equal(r.created, true);
  assert.equal(p.weeks.length, 1);
  assert.equal(p.weeks[0].number, 1);
  assert.equal(p.weeks[0].logWeek, '2026-11-16');
  assert.equal(r.day.log, true);
  assert.equal(r.day.scheduledDate, '2026-11-17');
  assert.deepEqual(r.day.exercises, []);
  assert.match(r.day.name, /session$/);
  assert.equal(S.isLogProgram(p), true);
});
test('a log session: the same date twice is the same session', () => {
  const p = { id: 'p', weeks: [] };
  const a = S.addLogSession(p, '2026-11-17', mk);
  const b = S.addLogSession(p, '2026-11-17', mk);
  assert.equal(b.created, false);
  assert.equal(b.day, a.day);
  assert.equal(p.weeks[0].days.length, 1);
  assert.equal(S.logDayFor(p, '2026-11-17').day, a.day);
  assert.equal(S.logDayFor(p, '2026-11-18'), null);
});
test('a log session: same week shares a week (in date order), a later week is week 2, an earlier one renumbers', () => {
  const p = { id: 'p', weeks: [] };
  S.addLogSession(p, '2026-11-20', mk);
  S.addLogSession(p, '2026-11-17', mk);
  assert.equal(p.weeks.length, 1);
  assert.deepEqual(p.weeks[0].days.map(d => d.scheduledDate), ['2026-11-17', '2026-11-20']);
  S.addLogSession(p, '2026-11-24', mk);
  assert.equal(p.weeks.length, 2);
  assert.equal(p.weeks[1].number, 2);
  S.addLogSession(p, '2026-11-10', mk);   // logged for a past week
  assert.deepEqual(p.weeks.map(w => w.logWeek), ['2026-11-09', '2026-11-16', '2026-11-23']);
  assert.deepEqual(p.weeks.map(w => w.number), [1, 2, 3]);
});
test('isLogProgram / isEmptyProgram: a generated block is neither; the blank builder program is empty', () => {
  const block = { weeks: [{ days: [{ name: 'Squat day', exercises: [ex('squat', [set(100, 5, 7)])] }] }] };
  assert.equal(S.isLogProgram(block), false);
  assert.equal(S.isEmptyProgram(block), false);
  const blank = { weeks: [{ days: [{ name: 'Day 1', exercises: [] }, { name: 'Day 2', exercises: [] }] }] };
  assert.equal(S.isEmptyProgram(blank), true);
  assert.equal(S.isLogProgram(blank), false);
  assert.equal(S.isEmptyProgram(null), true);
  assert.equal(S.isLogProgram({ weeks: [] }), false);
  const mixed = { weeks: [{ days: [{ log: true, exercises: [] }, { name: 'Day 2', exercises: [] }] }] };
  assert.equal(S.isLogProgram(mixed), false);
});

// ---------- the first-run numbers ----------
test('repMaxToE1rm: a single is the max; a 3RM and 5RM read up (app.js calcE1RM at RPE 10); reps capped at 10', () => {
  assert.equal(S.repMaxToE1rm(140, 1), 140);
  assert.equal(Math.round(S.repMaxToE1rm(140, 3) * 10) / 10, 150.0);
  assert.equal(Math.round(S.repMaxToE1rm(140, 5)), 162);
  assert.equal(S.repMaxToE1rm(100, 20), S.repMaxToE1rm(100, 10));
  assert.equal(S.repMaxToE1rm(0, 5), 0);
});
test('checkSetupLifts: all three, in order, each named when wrong', () => {
  assert.deepEqual(S.checkSetupLifts({ squat: 140, bench: 0, deadlift: 180 }, 1), { ok: false, lift: 'bench', why: 'missing' });
  assert.deepEqual(S.checkSetupLifts({ squat: 0, bench: 0, deadlift: 0 }, 1), { ok: false, lift: 'squat', why: 'missing' });
  assert.deepEqual(S.checkSetupLifts({ squat: 1450, bench: 100, deadlift: 180 }, 1), { ok: false, lift: 'squat', why: 'high' });
  assert.deepEqual(S.checkSetupLifts({ squat: 140, bench: 10, deadlift: 180 }, 1), { ok: false, lift: 'bench', why: 'low' });
  const ok = S.checkSetupLifts({ squat: 140, bench: 100, deadlift: 180 }, 1);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.e1rms, { squat: 140, bench: 100, deadlift: 180 });
  const three = S.checkSetupLifts({ squat: 140, bench: 100, deadlift: 180 }, 3);
  assert.deepEqual(three.e1rms, { squat: 150, bench: 107, deadlift: 193 });
});

// ---------- the preview ----------
const block = () => ({
  name: '3-week block',
  weeks: [1, 2, 3].map(w => ({ number: w, days: [
    { name: 'Squat day', exercises: [ex('squat', [set(100 + w * 5, 5, 7), set(90, 5, null), set(90, 5, null)]), ex('legs', [set(0, 10, 8), set(0, 10, 8), set(0, 10, 8)])] },
    { name: 'Bench day', exercises: [ex('bench', [set(80 + w * 2.5, 5, 7), set(70, 5, null)]), ex('squat', [set(90, 3, 6)])] },
    { name: 'Rest', exercises: [] }
  ] }))
});
test('previewSummary: days a week (rest days out), sessions, the most sets of one exercise, lift days in week 1', () => {
  const s = S.previewSummary(block());
  assert.equal(s.weeks, 3);
  assert.equal(s.daysPerWeek, 2);
  assert.equal(s.sessions, 6);
  assert.equal(s.maxLiftSets, 3);
  assert.deepEqual(s.liftDays, { squat: 2, bench: 1, deadlift: 0 });
});
test('weekOutline: each week\'s heaviest planned set per main lift; a lift not trained is null', () => {
  const o = S.weekOutline(block());
  assert.deepEqual(o.map(w => w.number), [1, 2, 3]);
  assert.deepEqual(o[0].lifts.squat, { kg: 105, reps: 5 });
  assert.deepEqual(o[2].lifts.squat, { kg: 115, reps: 5 });
  assert.deepEqual(o[1].lifts.bench, { kg: 85, reps: 5 });
  assert.equal(o[0].lifts.deadlift, null);
});

// ---------- the exercise picker ----------
const lib = { variants: { squat: ['Competition', 'Paused', 'Tempo'], bench: ['Competition', 'Close Grip'], deadlift: ['Competition', 'RDL'] },
  accessories: { push: ['Overhead Press'], pull: ['Lat Pulldown', 'Barbell Row'], legs: ['Leg Press'] }, cardio: ['Rowing'] };
test('exerciseChoices: the big three first (competition), then variations, then accessories and cardio', () => {
  const c = S.exerciseChoices(lib);
  assert.deepEqual(c.slice(0, 3).map(x => [x.lift, x.variant, x.title]), [['squat', 'Competition', 'Squat'], ['bench', 'Competition', 'Bench'], ['deadlift', 'Competition', 'Deadlift']]);
  assert.ok(c.some(x => x.title === 'Paused Squat' && x.lift === 'squat' && x.variant === 'Paused' && x.group === 'Variations'));
  assert.ok(!c.some(x => x.group === 'Variations' && x.variant === 'Competition'));
  assert.ok(c.some(x => x.title === 'Lat Pulldown' && x.lift === 'pull' && x.name === 'Lat Pulldown'));
  assert.equal(c[c.length - 1].lift, 'cardio');
});
test('filterChoices: word starts match ("pa sq"), a group name matches, an unknown name is offered as typed', () => {
  const c = S.exerciseChoices(lib);
  assert.deepEqual(S.filterChoices(c, 'pa sq').filter(x => !x.custom).map(x => x.title), ['Paused Squat']);
  assert.ok(S.filterChoices(c, 'pull').some(x => x.title === 'Barbell Row'));
  const own = S.filterChoices(c, '  Zercher  squat ');
  assert.equal(own[own.length - 1].custom, true);
  assert.equal(own[own.length - 1].lift, 'other');
  assert.equal(own[own.length - 1].name, 'Zercher squat');
  assert.ok(!S.filterChoices(c, 'lat pulldown').some(x => x.custom), 'an exact name is not offered twice');
  assert.equal(S.filterChoices(c, '').length, c.length);
  assert.deepEqual(S.filterChoices(c, 'dead').filter(x => !x.custom).map(x => x.title), ['Deadlift', 'RDL Deadlift'], 'the big three\'s group name finds nothing');
  assert.deepEqual(S.filterChoices(c, 'row').filter(x => !x.custom).map(x => x.title), ['Barbell Row', 'Rowing'], 'list order among name matches');
  assert.deepEqual(S.filterChoices(c, 'pull').filter(x => !x.custom).map(x => x.title), ['Lat Pulldown', 'Barbell Row'], 'name matches first, then the group');
});
test('seedSets: the big three 3 × 5 @ 7, accessories 3 × 10 @ 8 (never a 5-rep pulldown), cardio one bout', () => {
  assert.deepEqual(S.seedSets('squat', 100), [{ weight: 100, reps: 5, rpe: 7 }, { weight: 100, reps: 5, rpe: 7 }, { weight: 100, reps: 5, rpe: 7 }]);
  assert.deepEqual(S.seedSets('pull', 0).map(s => [s.reps, s.rpe, s.weight]), [[10, 8, 0], [10, 8, 0], [10, 8, 0]]);
  assert.deepEqual(S.seedSets('cardio'), [{ weight: 30, reps: 5, rpe: null }]);
  const a = S.seedSets('bench', 60); a[0].weight = 1;
  assert.equal(a[1].weight, 60, 'each set is its own object');
});

console.log('solo-start: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
