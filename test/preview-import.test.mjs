// The coach site's spreadsheet reader (coach-preview/kit/r6/import.js): the layouts coaches really use, each read into
// a programme with no hints, the corrections a coach can make on the check screen, and the sheets it must refuse in
// plain words rather than guess at. What the site says it reads is what passes here.
// Run: node test/preview-import.test.mjs
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'coach-preview', 'kit');
globalThis.window = globalThis;
for (const f of ['data.js', 'kit.js', 'coach.js', 'r6/block.js', 'r6/import.js']) vm.runInThisContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), { filename: f });
const BL = globalThis.BLOCK, IM = globalThis.IMPORT;

let pass = 0, fail = 0;
const t = (name, fn) => { try { fn(); pass++; } catch (e) { fail++; console.log('FAIL', name, '-', e.message); } };
const eq = (a, b, m) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((m || '') + ' expected ' + JSON.stringify(b) + ' got ' + JSON.stringify(a)); };
const ok = (v, m) => { if (!v) throw new Error(m || 'not ok'); };
const csv = (lines) => lines.join('\n');
/* a line of the programme read: its text in each week ('' where it is not written) */
const line = (res, day, name, li = 0) => { const b = res.block, r = b.rows.findIndex((x) => x.day === day && x.name === name && x.line === li); return r < 0 ? null : b.weeks.map((w) => (b.rows[r].cells[w.uid] ? BL.text(b.rows[r].cells[w.uid]) : '')); };
const days = (res) => res.block.days.map((d) => d.name);
const namesOf = (res, day) => res.block.rows.filter((x) => x.day === day && x.line === 0).map((x) => x.name);
const roles = (res) => res.analysis.cols.map((c) => (c.week != null ? 'w' + c.week + ':' : '') + c.role);

// ---------------------------------------------------------------- one line a row
t('a plain table with a header: Week, Day, Exercise, Sets, Reps, Load, RPE', () => {
  const res = IM.read(csv(['Week,Day,Exercise,Sets,Reps,Load,RPE', '1,Day 1,Squat,3,5,140,7', '1,Day 1,Leg Press,3,10,180,8', '1,Day 2,Bench,4,6,90,7.5', '2,Day 1,Squat,3,5,142.5,7.5', '2,Day 1,Leg Press,3,10,185,8', '2,Day 2,Bench,4,6,92.5,8']));
  ok(res.ok, res.why);
  eq([res.weeks, days(res), res.bad.length, res.unknown], [2, ['Day 1', 'Day 2'], 0, []]);
  eq(line(res, 'Day 1', 'Squat'), ['3x5 @7 140kg', '3x5 @7.5 142.5kg']);
  eq(line(res, 'Day 2', 'Bench'), ['4x6 @7.5 90kg', '4x6 @8 92.5kg']);
  eq(roles(res), ['week', 'day', 'exercise', 'sets', 'reps', 'load', 'rpe']);
});
t('day blocks: a row that only names the day, its lifts under it, the header once', () => {
  const res = IM.read(csv(['Exercise,Sets,Reps,RPE,Weight (kg),Notes', 'Monday - Squat focus,,,,,', 'Comp Squat,1,3,8,160,Belt on', 'Paused Squat,3,4,7,130,', 'Leg Curl,3,12,,,', 'Wednesday,,,,,', 'Bench Press,4,5,7,95,', 'DB Row,3,10,8,30,']));
  ok(res.ok, res.why);
  eq(days(res), ['Monday - Squat focus', 'Wednesday']);
  eq(namesOf(res, 'Monday - Squat focus'), ['Squat', 'Paused squat', 'Hamstring curl']);
  eq(line(res, 'Monday - Squat focus', 'Squat'), ['3 @8 160kg']);
  eq(line(res, 'Monday - Squat focus', 'Hamstring curl'), ['3x12']);
  eq(namesOf(res, 'Wednesday'), ['Bench', 'Dumbbell row']);
  const b = res.block, r = b.rows.findIndex((x) => x.name === 'Squat');
  eq(b.fieldText(r, 0, 'note'), 'Belt on', 'the note comes with its line');
  eq(b.days.map((d) => d.wd), [1, 3], 'a day named for a weekday sits on that weekday');
});
t('days with no names, set apart by empty rows', () => {
  const res = IM.read(csv(['Exercise,Sets,Reps,Load', 'Squat,3,5,140', 'Leg Press,3,10,180', ',,,', 'Bench,4,6,90', 'Barbell Row,4,8,70', ',,,', 'Deadlift,2,3,180']));
  ok(res.ok, res.why);
  eq([days(res), namesOf(res, 'Day 2'), namesOf(res, 'Day 3')], [['Day 1', 'Day 2', 'Day 3'], ['Bench', 'Barbell row'], ['Deadlift']]);
});
t('sets and reps in one column, percent as a decimal, pounds', () => {
  const res = IM.read(csv(['Movement,Sets x Reps,% 1RM,Weight (lbs)', 'Back Squat,5x5,0.75,315', 'Bench Press,3x8,0.7,185', 'RDL,3x8-10,,225']));
  ok(res.ok, res.why);
  eq([res.unit, roles(res)], ['lb', ['exercise', 'setsreps', 'pct', 'load']]);
  eq(line(res, 'Day 1', 'Squat'), ['5x5 75%'], 'a percent and the kilos it came to: the percent is kept, the kilos follow from the max');
  eq(line(res, 'Day 1', 'Romanian deadlift'), ['3x8-10 102.5kg'], 'pounds become kilos once, to the step');
});
t('a whole set written in one cell, the way a coach types it', () => {
  const res = IM.read(csv(['Movement\tPrescription\tNotes', 'Squat\t3x5 @ RPE 8\tsame stance', 'Bench\t4 sets of 6 @ 72.5%\t', 'Chin-ups\t3xAMRAP\t', 'Plank\t3x30s\thold']));
  ok(res.ok, res.why);
  eq(line(res, 'Day 1', 'Squat'), ['3x5 @8']);
  eq(line(res, 'Day 1', 'Bench'), ['4x6 72.5%']);
  eq(line(res, 'Day 1', 'Chin-ups'), ['3x1+']);
  eq(res.bad.map((x) => [x.name, x.text]), [['Plank', '3x30s']], 'what cannot be read is listed with its own text, never dropped');
  eq(res.bad[0].r, 4, 'and it points at the row in the coach’s sheet');
});
t('RIR instead of RPE, a tempo, and a rest column left out', () => {
  const res = IM.read(csv(['Exercise,Sets,Reps,RIR,Tempo,Rest', 'Squat,3,5,2,3-1-0,180', 'Lat Pulldown,3,12,1,,90']));
  ok(res.ok, res.why);
  eq(roles(res), ['exercise', 'sets', 'reps', 'rir', 'tempo', 'skip']);
  eq(line(res, 'Day 1', 'Squat'), ['3x5 2RIR tempo 3-1-0']);
});
t('junk above the header and a totals row under it', () => {
  const res = IM.read(csv(['Athlete: Mei Tanaka,,,', 'Block 3 - Hypertrophy,,,', ',,,', 'Exercise,Sets,Reps,Load', 'Squat,3,5,140', 'Bench,4,6,90', 'Total volume,7,,']));
  ok(res.ok, res.why);
  eq([res.analysis.head, namesOf(res, 'Day 1'), res.bad.length], [3, ['Squat', 'Bench'], 0]);
});
t('no header at all: the columns are told apart by what they hold', () => {
  const res = IM.read(csv(['Squat\t3x5\t@8', 'Bench\t4x6\t@7', 'Barbell row\t4x8\t@8', 'Plank\t3x1\t']));
  ok(res.ok, res.why);
  eq(res.analysis.head, -1);
  eq(line(res, 'Day 1', 'Bench'), ['4x6 @7']);
});

// ---------------------------------------------------------------- weeks across, weeks stacked
t('weeks across, a whole set in each cell, a top set and its back-offs in one cell', () => {
  const res = IM.read(csv(['Exercise,Week 1,Week 2,Week 3,Week 4', 'Day 1 · Squat / Bench,,,,', 'Squat,"1x3 @8, 3x5 75%","1x2 @8, 3x4 78%","1x1 @8.5, 3x3 82%",3x3 70% @6',
    'Bench,4x6 72.5%,4x5 75%,4x4 80%,3x5 67.5%', 'Barbell Row,4x8 2RIR,4x8 2RIR,4x8 1RIR,3x8 3RIR', 'Day 2 · Deadlift,,,,', 'Deadlift,"1x3 @8, 2x3 75%","1x2 @8, 2x3 78%","1x1 @8.5, 2x2 82%",2x3 70% @6', 'Leg Curl,3x12,3x12,3x10,2x12']));
  ok(res.ok, res.why);
  eq([res.analysis.layout, res.weeks, days(res), res.bad.length], ['across', 4, ['Day 1 · Squat / Bench', 'Day 2 · Deadlift'], 0]);
  eq(line(res, 'Day 1 · Squat / Bench', 'Squat', 0), ['3 @8', '2 @8', '1 @8.5', '3x3 70% @6']);
  eq(line(res, 'Day 1 · Squat / Bench', 'Squat', 1), ['3x5 75%', '3x4 78%', '3x3 82%', ''], 'the back-offs are their own line under the top set');
  eq(line(res, 'Day 2 · Deadlift', 'Hamstring curl'), ['3x12', '3x12', '3x10', '2x12']);
});
t('weeks across, each week over its own Sets, Reps, Load and RPE', () => {
  const res = IM.read(csv([',Week 1,,,,Week 2,,,', 'Exercise,Sets,Reps,Load,RPE,Sets,Reps,Load,RPE', 'Day 1,,,,,,,,', 'Squat,3,5,140,7,3,5,145,8', 'Bench,4,6,90,7,4,5,95,8', 'Day 2,,,,,,,,', 'Deadlift,2,3,180,8,2,2,190,8.5']));
  ok(res.ok, res.why);
  eq([res.analysis.layout, res.analysis.sub, res.weeks], ['across', 1, 2]);
  eq(roles(res), ['exercise', 'w1:sets', 'w1:reps', 'w1:load', 'w1:rpe', 'w2:sets', 'w2:reps', 'w2:load', 'w2:rpe']);
  eq(line(res, 'Day 1', 'Squat'), ['3x5 @7 140kg', '3x5 @8 145kg']);
  eq(line(res, 'Day 2', 'Deadlift'), ['2x3 @8 180kg', '2x2 @8.5 190kg']);
});
t('weeks stacked: a row names the week, then its days', () => {
  const res = IM.read(csv(['Week 1,,,', 'Exercise,Sets,Reps,Load', 'Day 1,,,', 'Squat,3,5,140', 'Day 2,,,', 'Bench,4,6,90', ',,,', 'Week 2,,,', 'Exercise,Sets,Reps,Load', 'Day 1,,,', 'Squat,3,5,145', 'Day 2,,,', 'Bench,4,6,92.5']));
  ok(res.ok, res.why);
  eq([res.weeks, days(res)], [2, ['Day 1', 'Day 2']]);
  eq([line(res, 'Day 1', 'Squat'), line(res, 'Day 2', 'Bench')], [['3x5 140kg', '3x5 145kg'], ['4x6 90kg', '4x6 92.5kg']]);
});
t('a semicolon file from a European Excel, decimal commas', () => {
  const res = IM.read(csv(['Exercise;Sets;Reps;Load;RPE', 'Squat;3;5;142,5;7,5', 'Bench;4;6;92,5;8']));
  ok(res.ok, res.why);
  eq(line(res, 'Day 1', 'Squat'), ['3x5 @7.5 142.5kg']);
});

// ---------------------------------------------------------------- what the coach can correct
t('names the library does not know are listed once, and the coach’s own names are used when given', () => {
  const sheet = csv(['Exercise,Sets,Reps', 'Comp SQ,3,5', 'Kang squat,3,8', 'Kang squat,2,8', 'CGBP,3,6']);
  const res = IM.read(sheet);
  ok(res.ok, res.why);
  eq(res.unknown, ['Kang squat']);
  eq(namesOf(res, 'Day 1'), ['Squat', 'Kang squat', 'Close-grip bench'], 'short names find their exercise without being asked');
  const res2 = IM.read(sheet, { names: { 'kang squat': 'Good morning' } });
  eq([res2.unknown, namesOf(res2, 'Day 1')], [[], ['Squat', 'Good morning', 'Close-grip bench']]);
});
t('a column read wrongly is put right by the coach, and the programme follows', () => {
  const sheet = csv(['Lift,Vol,Top', 'Squat,3x5,80', 'Bench,4x6,75']);
  const a = IM.read(sheet);
  eq(a.ok && line(a, 'Day 1', 'Squat'), ['3x5 80kg'], 'a column called Top holding 80 is first read as kilos');
  const b = IM.read(sheet, { roles: { 2: 'pct' } });
  ok(b.ok, b.why);
  eq(line(b, 'Day 1', 'Squat'), ['3x5 80%']);
});
t('a row read as a lift is marked as a day’s name, and the other way round', () => {
  const sheet = csv(['Exercise,Sets,Reps', 'Upper A,,', 'Bench,4,6', 'Hip thrust,,', 'Squat,3,5']);
  const a = IM.read(sheet);
  eq(days(a), ['Upper A'], 'a library exercise with nothing written is not a day');
  const b = IM.read(sheet, { kinds: { 3: 'day' } });
  eq([days(b), namesOf(b, 'Hip thrust')], [['Upper A', 'Hip thrust'], ['Squat']]);
  const c = IM.read(sheet, { kinds: { 1: 'skip' } });
  eq(days(c), ['Day 1']);
});
t('the header can be switched off when the sheet has none the reader should trust', () => {
  const sheet = csv(['My block,,', 'Squat,3,5', 'Bench,4,6']);
  const a = IM.read(sheet, { head: -1 });
  ok(a.ok, a.why);
  eq([days(a), namesOf(a, 'My block')], [['My block'], ['Squat', 'Bench']], 'a title over the lifts reads as the day’s name');
});

// ---------------------------------------------------------------- what it must refuse
t('a sheet that is not a programme is refused in words, never guessed into one', () => {
  const people = IM.read(csv(['First Name,Last Name,Phone', 'Maya,Chen,555-0101', 'Leo,Grant,555-0102']));
  ok(!people.ok && /lift|exercise/i.test(people.why), JSON.stringify(people.why));
  eq(IM.read('').ok, false);
  eq(IM.read(csv(['Notes', 'call the gym', 'buy chalk'])).ok, false);
});
t('a training log with a column for every set is refused rather than misread', () => {
  const log = IM.read(csv(['Date,Exercise,Set 1 Weight,Set 1 Reps,Set 2 Weight,Set 2 Reps', '05/10/2026,Squat,160,5,165,5', '05/10/2026,Bench,105,5,105,5']));
  ok(!log.ok, 'it does not invent sets from a log: ' + JSON.stringify(log.ok && log.lines.map((l) => l.cells)));
});
t('tidy reads the ways coaches write a set', () => {
  eq(['3x5 @ RPE 8', '3x5 RPE 8', '4 sets of 6 @ 72.5%', '3 sets x 10 reps', '8, 8, 8', '3xAMRAP', '5x5'].map(IM.tidy), ['3x5 @8', '3x5 @8', '4x6 72.5%', '3x10', '3x8', '3x1+', '5x5']);
});

// 22 Nov, from a cold review: a day named above the column names, and an "Intensity" column that holds RPE
t('a day named above the column names is the first day, and Intensity of 7, 7.5, 8 is RPE', () => {
  const r = IM.read('DAY 1 - Lower\nExercise\tSets\tReps\tIntensity\tLoad\tNotes\nSquat\t3\t5\t7\t140\tbelt\nRDL\t3\t8\t7.5\t120\t\nDAY 2 - Upper\nBench\t4\t4\t8\t95\t\nRow\t3\t10\t8\t70\t');
  ok(r.ok, r.why);
  eq(r.days.length, 2, 'two days');
  ok(/^day 1/i.test(r.lines[0].day) && /lower/i.test(r.lines[0].day), 'the first day keeps its own name: ' + r.lines[0].day);
  eq(r.lines[0].cells[1], '3x5 @7 140kg', 'RPE and the load, not a percent');
});
t('an Intensity column of percents stays a percent', () => {
  const r = IM.read('Exercise\tSets\tReps\tIntensity\nSquat\t3\t5\t75\nBench\t4\t4\t80');
  ok(r.ok, r.why); eq(r.lines[0].cells[1], '3x5 75%');
});
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
