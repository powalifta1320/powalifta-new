// The coach site's programme model (coach-preview/kit/r6/block.js): the moves the editor needs to be
// editable everywhere. Changing a line's exercise, duplicating a line or a day, moving a lift to
// another day, inserting, copying and duplicating weeks, and the exercise library the picker reads.
// The model needs no DOM, so it loads straight into Node.
// Run: node test/preview-block.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'coach-preview', 'kit');
globalThis.window = globalThis;
for (const f of ['data.js', 'kit.js', 'coach.js', 'r6/block.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const BL = globalThis.BLOCK, DEMO = globalThis.DEMO, K = globalThis.K;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };

const row = (b, day, name, line = 0) => b.rows.findIndex((x) => x.day === day && x.name === name && x.line === line);
const texts = (b, r) => b.weeks.map((w) => (b.rows[r].cells[w.uid] ? BL.text(b.rows[r].cells[w.uid]) : ''));
const dayNames = (b, day) => b.rows.filter((x) => x.day === day && x.line === 0).map((x) => x.name);
const firstOf = (b, state) => b.weeks.findIndex((w) => w.state === state);
const sorted = (b) => b.rows.every((x, i) => !i || b.dayAt(b.rows[i - 1].day) < b.dayAt(x.day) || (b.rows[i - 1].day === x.day && (b.rows[i - 1].ex < x.ex || (b.rows[i - 1].ex === x.ex && b.rows[i - 1].line < x.line))));
const uniqueKeys = (b) => new Set(b.rows.map((x) => x.key)).size === b.rows.length;
const byKey = (b, key) => b.rows.find((x) => x.key === key);
/* a lifter whose whole block is still to write and one with lifted weeks behind her and weeks to come */
const FREE = DEMO.lifters.filter((l) => { const b = BL.build(l); return b.rows.length >= 15 && b.days.length >= 3 && b.weeks.length >= 3 && b.weeks.every((w) => w.state !== 'lifted'); })[0];
const PAST = DEMO.lifters.filter((l) => { const b = BL.build(l); return b.weeks.filter((w) => w.state === 'lifted').length >= 2 && b.weeks.filter((w) => w.state === 'next').length >= 2; })[0];
ok(FREE && PAST, 'the demo data has a lifter with nothing lifted and one with lifted and coming weeks');
/* nothing begun, so every line can be written: the week under way has no session started */
const free = () => { const b = BL.build(FREE); b.weeks.forEach((w) => { w.started = {}; }); return b; };
const past = () => BL.build(PAST);

// ---------------------------------------------------------------- changing a line's exercise
t('a line with nothing lifted takes the new exercise: name, lift and variant', () => {
  const b = free(), d = b.days[0].name, r = b.rows.findIndex((x) => x.day === d && !x.lift && x.line === 0);
  ok(r >= 0, 'an accessory on the first day');
  const key = b.rows[r].key, before = texts(b, r);
  const res = b.changeExercise(r, 0, 'Front squat');
  ok(res && !res.error, res && res.error && res.error.message);
  const x = byKey(b, key);
  eq([x.name, x.lift, x.variant], ['Front squat', 'squat', 'Competition']);
  /* 22 Nov: the sets, reps and RPE stay; the kilos typed for the old movement do not follow it to a new one */
  const strip = (t) => t.replace(/\s*\d+(\.\d+)?kg$/, '');
  eq(texts(b, b.rows.indexOf(x)).map(strip), before.map(strip), 'its sets, reps and RPE stay as written');
  const open = b.weeks.map((w, c) => !b.isRO(b.rows.indexOf(x), c) && !(x.cells[w.uid] && x.cells[w.uid].lifted));   /* a session already trained keeps what was on the bar */
  ok(texts(b, b.rows.indexOf(x)).every((t, c) => !open[c] || !/kg$/.test(t)), 'the loads typed for the old exercise are gone from the weeks still to write');
  ok(res.data.cleared >= 1, 'and the move says how many');
  b.undo();
  eq(byKey(b, key).lift, null, 'undo puts the old exercise back');
  eq(texts(b, r), before, 'with its loads');
});
t('a squat that becomes another squat keeps its typed loads', () => {
  const b = free(), r = b.rows.findIndex((x) => x.lift === 'squat' && x.line === 0);
  const c = b.weeks.findIndex((w, k) => !b.isRO(r, k)); b.setField(r, c, 'load', '100');
  const key = b.rows[r].key, res = b.changeExercise(r, c, 'Tempo squat');
  ok(res && !res.error, res && res.error && res.error.message);
  ok(/100kg$/.test(texts(b, b.rows.indexOf(byKey(b, key)))[c]), 'the same lift, the same max: the kilos stay');
});
t('a duplicated day and a new day take a free weekday, never another day’s date', () => {
  const b = free(), day = b.days[0].name, used = b.days.map((d) => d.wd).filter((x) => x != null);
  if (!used.length) return;   /* a block that keeps no weekdays has none to give */
  const nd = b.duplicateDay(day).data.day, wd = b.days.find((d) => d.name === nd).wd;
  ok(wd != null && used.indexOf(wd) < 0, 'a weekday no other day trains on: ' + wd);
  const dates = b.daysOf(0).map((d) => d.iso);
  eq(new Set(dates).size, dates.length, 'every day of the week on its own date');
  const ad = b.addDay().data.day, wd2 = b.days.find((d) => d.name === ad).wd;
  ok(wd2 == null || (used.concat([wd]).indexOf(wd2) < 0), 'the added day too');
});
t('a week copied with the weekly step steps the main lifts and says which', () => {
  const b = free(), r = b.rows.findIndex((x) => x.lift === 'squat' && x.line === 0);
  b.setField(r, 0, 'load', '100'); b.rows[r].prog = 'same';
  const acc = b.rows.findIndex((x) => !x.lift && x.line === 0 && x.cells[b.weeks[0].uid]); b.rows[acc].prog = 'same'; b.setField(acc, 0, 'load', '40');
  const res = b.copyWeek(0, 1, {});
  ok(/100kg|102\.5kg/.test(texts(b, r)[0]), 'the week copied from is untouched');
  ok(/102\.5kg$/.test(texts(b, r)[1]), 'squat is 2.5 on: ' + texts(b, r)[1]);
  ok(/40kg$/.test(texts(b, acc)[1]), 'an accessory stays as written: ' + texts(b, acc)[1]);
  ok(res.data.stepped.some((x) => x.name === b.rows[r].name && x.kg === 102.5) && res.data.same >= 1, 'the move lists what stepped and counts what did not');
});
t('a main lift changed to another lift takes every line with it', () => {
  const b = free(), r = b.rows.findIndex((x) => x.lift === 'squat' && x.variant === 'Competition' && x.line === 0);
  const day = b.rows[r].day, ex = b.rows[r].ex, n = b.rows.filter((x) => x.day === day && x.ex === ex).length;
  b.changeExercise(r, 0, 'Paused bench');
  const all = b.rows.filter((x) => x.day === day && x.ex === ex);
  eq(all.length, n);
  ok(all.every((x) => x.name === 'Paused bench' && x.lift === 'bench' && x.variant === 'Paused'), JSON.stringify(all.map((x) => [x.name, x.lift, x.variant])));
});
t('a name the library does not know keeps the words typed and takes the lift given', () => {
  const b = free(), r = b.rows.findIndex((x) => !x.lift && x.line === 0), key = b.rows[r].key;
  b.changeExercise(r, 0, 'tyre flip', { lift: null });
  eq([byKey(b, key).name, byKey(b, key).lift], ['Tyre flip', null]);
  b.changeExercise(b.rows.indexOf(byKey(b, key)), 0, 'Kang squat', { lift: 'squat' });
  eq([byKey(b, key).name, byKey(b, key).lift, byKey(b, key).variant], ['Kang squat', 'squat', 'Competition']);
});
t('a longer name keeps the coach’s words and still reads its variant', () => {
  const b = free(), r = b.rows.findIndex((x) => !x.lift && x.line === 0), key = b.rows[r].key;
  b.changeExercise(r, 0, 'paused high handle trap bar squat');
  eq([byKey(b, key).name, byKey(b, key).lift, byKey(b, key).variant], ['Paused high handle trap bar squat', 'squat', 'Paused']);
  b.changeExercise(b.rows.indexOf(byKey(b, key)), 0, 'Close Grip Bench Press');
  eq([byKey(b, key).name, byKey(b, key).lift, byKey(b, key).variant], ['Close-grip bench', 'bench', 'Close Grip']);
});
t('the same exercise again is no change and no undo step', () => {
  const b = free(), r = b.rows.findIndex((x) => x.line === 0), steps = b.history().steps;
  const res = b.changeExercise(r, 0, b.rows[r].name);
  eq([res.data.changed, b.history().steps], [false, steps]);
});
t('a line with lifted weeks changes from the first week still to come; the lifted weeks keep their name', () => {
  const b = past(), c = firstOf(b, 'next'), r = b.rows.findIndex((x) => x.line === 0 && !x.lift && b.weeks.some((w) => w.state === 'lifted' && x.cells[w.uid]) && x.cells[b.weeks[c].uid]);
  ok(r >= 0, 'an accessory lifted before and written ahead');
  const old = b.rows[r].name, day = b.rows[r].day, n = b.rows.length;
  const res = b.changeExercise(r, c, 'Hack squat');
  ok(res && !res.error, res && res.error && res.error.message);
  eq(b.rows.length, n + 1, 'a new line carries the weeks to come');
  const was = b.rows.find((x) => x.day === day && x.name === old && x.line === 0), now = b.rows.find((x) => x.day === day && x.name === 'Hack squat');
  ok(was && now, 'both lines are there');
  ok(b.weeks.every((w, i) => (w.state === 'lifted' ? !now.cells[w.uid] : i < c || !was.cells[w.uid])), 'lifted weeks stay on the old line, the coming ones move');
  ok(sorted(b) && uniqueKeys(b));
});

// ---------------------------------------------------------------- duplicating a line
t('duplicate an exercise: the copy sits right under it with every line and the same sets', () => {
  const b = free(), r = b.rows.findIndex((x, i) => x.line === 0 && b.rows[i + 1] && b.rows[i + 1].ex === x.ex && b.rows[i + 1].line === 1);
  ok(r >= 0, 'an exercise with back-offs');
  const day = b.rows[r].day, names = dayNames(b, day), at = names.indexOf(b.rows[r].name), top = texts(b, r), backs = texts(b, r + 1), n = b.rows.length;
  const res = b.duplicateRow(r);
  ok(res && !res.error, res && res.error && res.error.message);
  eq(b.rows.length, n + 2);
  const after = dayNames(b, day);
  eq(after.slice(0, at + 2), names.slice(0, at + 1).concat(names[at]), 'the copy is next in the day');
  eq(after.slice(at + 2), names.slice(at + 1), 'the rest keep their order');
  const nr = res.data.r;
  eq([b.rows[nr].line, b.rows[nr + 1].line, b.rows[nr].ex === b.rows[nr + 1].ex, b.rows[nr].ex !== b.rows[r].ex], [0, 1, true, true]);
  eq([texts(b, nr), texts(b, nr + 1)], [top, backs]);
  ok(uniqueKeys(b) && sorted(b), 'keys are unique and the rows stay in day order');
  b.undo(); eq(b.rows.length, n);
});
t('duplicate with lifted weeks: the copy holds only the weeks still to write', () => {
  const b = past(), r = b.rows.findIndex((x) => x.line === 0 && b.weeks.every((w) => x.cells[w.uid]));
  ok(r >= 0, 'a line written in every week');
  const key = b.rows[r].key, res = b.duplicateRow(r), x = b.rows[res.data.r], src = b.rows.indexOf(byKey(b, key));
  ok(b.weeks.every((w, c) => (b.isRO(src, c) ? !x.cells[w.uid] : !!x.cells[w.uid])), 'no lifted cell is copied');
  ok(Object.values(x.cells).every((cell) => !cell.lifted), 'and nothing lifted rides along');
});
t('duplicate a back-off line: one more line under the same exercise', () => {
  const b = free(), r = b.rows.findIndex((x) => x.line === 1), day = b.rows[r].day, key = b.rows[r].key, n = b.rows.filter((x) => x.day === day && x.ex === b.rows[r].ex).length, was = texts(b, r);
  const res = b.duplicateRow(r), ex = byKey(b, key).ex;
  eq(b.rows.filter((x) => x.day === day && x.ex === ex).length, n + 1);
  eq([b.rows[res.data.r].ex, res.data.r, texts(b, res.data.r)], [ex, b.rows.indexOf(byKey(b, key)) + 1, was]);
  eq(b.rows.filter((x) => x.day === day && x.ex === ex).map((x) => x.line), [...Array(n + 1).keys()], 'lines number on');
  ok(uniqueKeys(b));
});

// ---------------------------------------------------------------- moving a lift
t('move to a place on its own day', () => {
  const b = free(), day = b.days[0].name, names = dayNames(b, day);
  ok(names.length >= 3, 'three lifts on the day');
  const res = b.moveRowTo(row(b, day, names[names.length - 1]), day, 0);
  ok(res && !res.error, res && res.error && res.error.message);
  eq(dayNames(b, day), [names[names.length - 1]].concat(names.slice(0, -1)));
  ok(sorted(b) && uniqueKeys(b));
  b.moveRowTo(row(b, day, names[0]), day, 99);
  eq(dayNames(b, day), [names[names.length - 1]].concat(names.slice(1, -1)).concat(names[0]), 'past the end is the end');
  eq(b.moveRowTo(row(b, day, names[0]), day, 99).data.changed, false, 'already there is no change');
});
t('move to another day, between two of its lifts, with its back-offs', () => {
  const b = free(), from = b.days[0].name, to = b.days[1].name;
  const r = b.rows.findIndex((x, i) => x.day === from && x.line === 0 && b.rows[i + 1] && b.rows[i + 1].ex === x.ex);
  const name = b.rows[r].name, top = texts(b, r), backs = texts(b, r + 1), a = dayNames(b, from), z = dayNames(b, to);
  const res = b.moveRowTo(r, to, 1);
  ok(res && !res.error, res && res.error && res.error.message);
  eq(dayNames(b, from), a.filter((n) => n !== name));
  eq(dayNames(b, to), [z[0], name].concat(z.slice(1)));
  const nr = res.data.r;
  eq([b.rows[nr].day, b.rows[nr + 1].day, b.rows[nr + 1].line, texts(b, nr), texts(b, nr + 1)], [to, to, 1, top, backs]);
  eq([b.rows[nr].key.split('|')[0], b.rows[nr + 1].key.split('|')[0]], [to, to], 'its keys name the day it is on');
  ok(sorted(b) && uniqueKeys(b));
  b.undo(); eq([dayNames(b, from), dayNames(b, to)], [a, z], 'one undo puts it back');
});
t('a lift with lifted weeks moves from the first week still to write; what was lifted stays on its day', () => {
  const b = past(), c = firstOf(b, 'next'), r = b.rows.findIndex((x) => x.line === 0 && b.weeks.some((w) => w.state === 'lifted' && x.cells[w.uid]) && x.cells[b.weeks[c].uid]);
  const day = b.rows[r].day, other = b.days.find((d) => d.name !== day && !/opener/i.test(d.name)).name, name = b.rows[r].name, n = b.rows.length;
  const res = b.moveRowTo(r, other, 0);
  ok(res && !res.error, res && res.error && res.error.message);
  ok(res.data.split && b.rows.length > n, 'the line splits');
  const stay = b.rows.find((x) => x.day === day && x.name === name && x.line === 0), moved = b.rows[res.data.r];
  eq([moved.day, moved.name], [other, name]);
  ok(b.weeks.every((w, i) => (i < res.data.from ? !moved.cells[w.uid] : !stay.cells[w.uid])), 'weeks before stay, weeks from there on move');
  ok(b.weeks.filter((w) => w.state === 'lifted').every((w) => stay.cells[w.uid]), 'every lifted week is still where it was lifted');
  ok(moved.cells[b.weeks[c].uid], 'the week to write is on the new day');
  ok(sorted(b) && uniqueKeys(b));
  ok(!b.moveRowTo(b.rows.indexOf(stay), day, 99).error, 'and it can still change places within its day');
});
t('a line that only ever lived in lifted weeks has nothing to move to another day', () => {
  const b = past(), c = firstOf(b, 'next'), r = b.rows.findIndex((x) => x.line === 0 && b.weeks.some((w) => w.state === 'lifted' && x.cells[w.uid]));
  const day = b.rows[r].day, ex = b.rows[r].ex;
  b.rows.forEach((x) => { if (x.day === day && x.ex === ex) b.weeks.forEach((w) => { if (w.state !== 'lifted') delete x.cells[w.uid]; }); });
  const other = b.days.find((d) => d.name !== day).name;
  ok(b.moveRowTo(r, other, 0).error, 'refused, with words');
  ok(c >= 0);
});

// ---------------------------------------------------------------- days
t('duplicate a day: a new day after it with the same lifts and sets', () => {
  const b = free(), day = b.days[0].name, names = dayNames(b, day), nDays = b.days.length, lines = b.rowsOfDay(day).length;
  const res = b.duplicateDay(day);
  ok(res && !res.error, res && res.error && res.error.message);
  const nd = res.data.day;
  eq([b.days.length, b.days[1].name, nd !== day], [nDays + 1, nd, true]);
  eq(dayNames(b, nd), names);
  eq(b.rowsOfDay(nd).length, lines);
  eq(b.rowsOfDay(nd).map((r) => texts(b, r)), b.rowsOfDay(day).map((r) => texts(b, r)));
  ok(b.rowsOfDay(nd).every((r) => b.rows[r].key.split('|')[0] === nd));
  ok(sorted(b) && uniqueKeys(b));
  const again = b.duplicateDay(day);
  ok(again.data.day !== nd && again.data.day !== day, 'a second copy gets its own name');
  b.undo(); b.undo(); eq(b.days.length, nDays);
});
t('duplicate a day with lifted weeks: only the weeks still to write are copied', () => {
  const b = past(), day = b.days[0].name, res = b.duplicateDay(day), nd = res.data.day;
  ok(b.rowsOfDay(nd).length > 0);
  ok(b.rowsOfDay(nd).every((r) => b.weeks.every((w) => w.state !== 'lifted' || !b.rows[r].cells[w.uid])), 'nothing in a lifted week');
  ok(b.rowsOfDay(nd).every((r) => Object.values(b.rows[r].cells).every((cell) => !cell.lifted)));
});
t('renaming a day takes its dates and its out-of-the-week mark with it', () => {
  const b = free(), day = b.days[0].name, c = b.weeks.length - 1, iso = b.dateOf(c, day), moved = K.add(iso, 1);
  b.moveDay(c, day, moved); b.dropDay(c, day);
  b.renameDay(day, 'Heavy squats');
  eq([b.dateOf(c, 'Heavy squats'), !!b.weeks[c].off['Heavy squats'], b.weeks[c].off[day] === undefined, (b.weeks[c].dates || {})[day] === undefined], [moved, true, true, true]);
});

// ---------------------------------------------------------------- weeks
t('insert a week before a week still to come: it lands there, empty, and the later weeks move on seven days', () => {
  const b = past(), c = firstOf(b, 'next'), n = b.weeks.length, uid = b.weeks[c].uid, day = b.days[0].name, was = b.dateOf(c, day);
  const res = b.insertWeek(c);
  ok(res && !res.error, res && res.error && res.error.message);
  eq([b.weeks.length, res.data.c, b.weeks[c + 1].uid, b.weeks[c].state], [n + 1, c, uid, 'next']);
  eq(b.weeks.map((w) => w.n), b.weeks.map((w, i) => i + 1));
  ok(b.rows.every((x) => !x.cells[b.weeks[c].uid]), 'the new week is empty');
  eq([b.dateOf(c, day), b.dateOf(c + 1, day)], [was, K.add(was, 7)], 'the new week takes the dates; the one after is a week later');
  eq(b.insertWeek(0).error && b.insertWeek(0).error.code, 'locked', 'never before a lifted week');
  b.undo(); eq([b.weeks.length, b.dateOf(c, day)], [n, was]);
});
t('copy a week onto a later week, as written', () => {
  const b = free(), a = 0, z = b.weeks.length - 1;
  const res = b.copyWeek(a, z, { same: true });
  ok(res && !res.error, res && res.error && res.error.message);
  ok(b.rows.every((x, r) => x.only || texts(b, r)[z] === texts(b, r)[a]), 'every line matches');
});
t('copy a week onto a later week, one step on, follows each line’s progression', () => {
  const b = free(), r = b.rows.findIndex((x) => x.line === 0 && x.cells[b.weeks[0].uid]);
  b.setProg(r, 'kg2.5'); b.set(r, 0, '3x5 100');
  b.copyWeek(0, 1, {});
  eq(texts(b, r)[1], '3x5 102.5kg');
});
t('copy back onto an earlier week that is not lifted, and never onto a lifted one or itself', () => {
  const b = past(), n = firstOf(b, 'next'), last = b.weeks.length - 1;
  ok(last > n, 'two weeks to come');
  const res = b.copyWeek(last, n, {});
  ok(!res.error, res.error && res.error.message);
  ok(b.rows.every((x, r) => x.only || b.isRO(r, n) || texts(b, r)[n] === texts(b, r)[last]), 'backwards is always as written');
  eq(b.copyWeek(n, 0, { same: true }).error.code, 'locked');
  eq(b.copyWeek(n, n, { same: true }).error.code, 'invalid');
});
t('duplicate a week: a copy as written goes in right after it', () => {
  const b = past(), c = firstOf(b, 'next'), n = b.weeks.length, was = b.rows.map((x, r) => texts(b, r)[c]), steps = b.history().steps;
  const res = b.duplicateWeek(c);
  ok(res && !res.error, res && res.error && res.error.message);
  eq([b.weeks.length, res.data.c], [n + 1, c + 1]);
  eq(b.rows.map((x, r) => (x.only ? was[r] : texts(b, r)[c + 1])), was);
  eq(b.weeks.map((w) => w.n), b.weeks.map((w, i) => i + 1));
  eq(b.history().steps, steps + 1, 'one step back');
  ok(b.duplicateWeek(firstOf(b, 'lifted')).error, 'a copy never lands among lifted weeks');
  const last = b.weeks.length - 1, r2 = b.duplicateWeek(last);
  eq([b.weeks.length, r2.data.c], [n + 2, last + 1], 'the last week’s copy is a new last week');
});

// ---------------------------------------------------------------- the exercise library
t('the library is wide enough to write a programme from, and every entry has a group', () => {
  ok(BL.LIBRARY.length >= 140, BL.LIBRARY.length + ' entries');
  ok(BL.LIBRARY.every((e) => e.name && e.group && Array.isArray(e.loads)), 'name, group, loads');
  eq(new Set(BL.LIBRARY.map((e) => e.name.toLowerCase())).size, BL.LIBRARY.length, 'no name twice');
  ok(BL.LIBRARY.filter((e) => e.lift).every((e) => e.group === e.lift), 'a squat, bench or deadlift line sits in its lift’s group');
  eq(BL.LIB_GROUPS.map((g) => g.id).slice(0, 3), ['squat', 'bench', 'deadlift']);
  ok(BL.LIBRARY.every((e) => BL.LIB_GROUPS.some((g) => g.id === e.group)), 'every group is named');
});
t('the short names coaches type find their exercise', () => {
  const find = (n) => (BL.libFind(n) || {}).name || null;
  eq([find('SQ'), find('comp squat'), find('comp bench'), find('BP'), find('CGBP'), find('SSB'), find('DL'), find('RDL'), find('OHP'), find('BSS'), find('GHR'), find('pull ups'), find('Lat Pulldowns'), find('close grip bench press'), find('Bench Press')],
    ['Squat', 'Squat', 'Bench', 'Bench', 'Close-grip bench', 'Safety bar squat', 'Deadlift', 'Romanian deadlift', 'Overhead press', 'Bulgarian split squat', 'Glute-ham raise', 'Pull-ups', 'Lat pulldown', 'Close-grip bench', 'Bench']);
  eq(find('made up thing'), null);
});
t('search ranks a name that starts with what was typed first, reads short names, and never repeats', () => {
  const names = (q, o) => BL.libSearch(q, o).map((e) => e.name);
  eq(names('sq')[0], 'Squat');
  ok(names('paus').slice(0, 3).every((n) => /^Paused /.test(n)), names('paus').join(', '));
  ok(names('row').includes('Barbell row') && names('row').includes('Dumbbell row'), names('row').join(', '));
  eq(names('cgbp')[0], 'Close-grip bench');
  eq(names('rdl')[0], 'Romanian deadlift');
  eq(new Set(names('press')).size, names('press').length);
  const bench = names('', { group: 'bench' });
  ok(bench.length >= 8 && bench.every((n) => BL.libFind(n).group === 'bench'), bench.join(', '));
  eq(names('zzzz'), []);
  eq(names('b', { limit: 5 }).length, 5);
});
t('names a coach adds are found like the library’s, in this block', () => {
  const b = free();
  b.changeExercise(b.rows.findIndex((x) => !x.lift && x.line === 0), 0, 'Kang squat', { lift: 'squat' });
  const hits = BL.libSearch('kan', { block: b });
  eq([hits[0].name, hits[0].lift, hits[0].own], ['Kang squat', 'squat', true]);
  const sq = BL.libSearch('squat', { block: b });
  ok(sq.some((e) => e.name === 'Squat' && e.here), 'a library name already in the block says so');
});

// 22 Nov, from a second cold review
t('an import by day keeps the sheet’s days: a lift is never matched to another day’s line', () => {
  const b = free(), d0 = b.days[0].name, d1 = b.days[1].name;
  const other = b.rows.find((x) => x.day === d1 && x.line === 0 && !b.rows.some((y) => y.day === d0 && y.name === x.name));
  ok(other, 'a lift only the second day has');
  const src = BL.fromTable([['Day', 'Exercise', 'Week 1'], [d0, other.name, '3x8'], [d0, 'Plank', '3x30']]);
  ok(src && !src.error, 'the sheet reads');
  const blk = src.block || src.data || src, c = b.weeks.findIndex((w, k) => !b.rows.some((row, r) => row.cells[w.uid] && b.isRO(r, k)));
  const res = b.importWeeks(c + 1, [blk], { byDay: true });
  ok(res && !res.error, res && res.error && res.error.message);
  const u = b.weeks[c].uid, on0 = b.rows.filter((x) => x.day === d0 && x.cells[u]).map((x) => x.name), on1 = b.rows.filter((x) => x.day === d1 && x.cells[u]).map((x) => x.name);
  ok(on0.includes(other.name), 'it is on the sheet’s day: ' + on0.join(', '));
  ok(!on1.includes(other.name), 'and not on the day that had a line of that name: ' + on1.join(', '));
});
t('a line taken out of one week reads as out, and comes back', () => {
  const b = free(), r = b.rows.findIndex((x) => x.line === 0 && !x.lift), c = b.weeks.findIndex((w, k) => !b.isRO(r, k) && b.rows[r].cells[w.uid]);
  const was = texts(b, r)[c], res = b.dropLine(r, c);
  ok(res && !res.error, res && res.error && res.error.message);
  eq(texts(b, r)[c], '', 'nothing in that week');
  ok(b.weeks[c].out && b.weeks[c].out[b.rows[r].key], 'marked out of the week');
  b.restoreLine(r, c); eq(texts(b, r)[c], was, 'put back as it was');
});
t('a load typed over a rule’s step drops the rule’s note', () => {
  const b = free(), r = b.rows.findIndex((x) => x.line === 0 && !x.lift), c = b.weeks.findIndex((w, k) => !b.isRO(r, k) && b.rows[r].cells[w.uid]), w = b.weeks[c];
  w.why = w.why || {}; w.why[b.rows[r].key] = { kind: 'rule', was: 180, now: 182.5 };
  b.setField(r, c, 'load', '170');
  ok(!w.why[b.rows[r].key], 'the note went with the typed load');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
