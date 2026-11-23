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

// ---------------------------------------------------------------- 22 Nov, the sheets QA: fixes, each with its test
t('a percent ladder in one cell, Sheiko style: percent x reps x sets', () => {
  eq(['50%x5, 60%x4, 70%x3x2', '50% x 5, 60% x 4, 75% x 3 x 4', '70%x3x2 75%x3x4'].map(IM.tidy), ['1x5 50%, 1x4 60%, 2x3 70%', '1x5 50%, 1x4 60%, 4x3 75%', '2x3 70%, 4x3 75%']);
  const r = IM.read('Exercise\tWeek 1\tWeek 2\nSquat\t50%x5, 60%x4, 70%x3x2\t50%x5, 60%x4, 75%x3x2');
  ok(r.ok, r.why); eq([r.bad.length, line(r, 'Day 1', 'Squat', 0), line(r, 'Day 1', 'Squat', 2)], [0, ['1x5 50%', '1x5 50%'], ['2x3 70%', '2x3 75%']]);
});
t('AMRAP alone is one set as many as they can', () => { eq(IM.tidy('AMRAP'), '1x1+'); eq(IM.tidy('3 x AMRAP'), '3 x1+'); });
t('a Sets cell holding the whole set, with no Reps beside it, is read or listed, never dropped', () => {
  const r = IM.read('Exercise\tSets\tReps\nSquat\t3\t5\nPlank\t3x30s\t\nBench\t4x6\t');
  ok(r.ok, r.why); eq(namesOf(r, 'Day 1'), ['Squat', 'Plank', 'Bench']); eq(line(r, 'Day 1', 'Bench'), ['4x6']);
  eq(r.bad.map((b) => b.text), ['3x30s']);
});
t('a tempo the set cannot hold goes in the note and is said', () => {
  const r = IM.read('Exercise\tSets\tReps\tTempo\nLeg extension\t3\t12\t31X0');
  ok(r.ok, r.why); const b = r.block, i = b.rows.findIndex((x) => x.name === 'Leg extension');
  eq(line(r, 'Day 1', 'Leg extension'), ['3x12']); ok(/31X0/.test(b.fieldText(i, 0, 'note')), b.fieldText(i, 0, 'note'));
  eq(r.notRead.filter((x) => x.kept).map((x) => x.text), ['Tempo 31X0']);
});
t('superset labels come off the name and into the note; extras like (2s) too', () => {
  const r = IM.read('Exercise\tSets\tReps\nA1. Incline DB Press\t3\t10\nA2) Face Pull\t3\t20\nB1 - Hammer Curl\t2\t12\nPaused Squat (2s)\t3\t3\nPause SQ\t3\t3');
  ok(r.ok, r.why); eq([namesOf(r, 'Day 1'), r.unknown], [['Incline dumbbell bench', 'Face pull', 'Hammer curl', 'Paused squat'], []], 'Pause SQ under Paused squat (2s) is more sets of it');
  const b = r.block; eq(b.fieldText(b.rows.findIndex((x) => x.name === 'Face pull'), 0, 'note'), 'A2 superset');
  eq(b.fieldText(b.rows.findIndex((x) => x.name === 'Paused squat'), 0, 'note'), '2s');
});
t('names in other languages find the lift', () => {
  const r = IM.read('Exercise\tSets\tReps\nSentadilla\t3\t5\nBankdrücken\t3\t5\nPeso muerto\t2\t3\nDéveloppé couché\t3\t5');
  eq(namesOf(r, 'Day 1'), ['Squat', 'Bench', 'Deadlift', 'Bench (2)']);
});
t('the same exercise again later in the day is its own line, not written over the first', () => {
  const r = IM.read('Exercise\tSets\tReps\tRPE\nBench\t4\t5\t7\nRow\t3\t10\t\nBench\t1\t1\t8');
  eq(namesOf(r, 'Day 1'), ['Bench', 'Row', 'Bench (2)']); eq(line(r, 'Day 1', 'Bench'), ['4x5 @7']);
});
t('weeks that start past 1 (the end of a prep) come in from week 1, and it is said', () => {
  const r = IM.read('Exercise\tWeek 10\tWeek 11\tWeek 12\nSquat\t3x2 @8\t2x1 @8\t1x1 @7');
  ok(r.ok, r.why); eq([r.weeks, r.renumbered, line(r, 'Day 1', 'Squat')], [3, { from: 10, to: 12 }, ['3x2 @8', '2x1 @8', '1 @7']]);
});
t('the columns change between weeks: each week is read under its own header', () => {
  const r = IM.read(['Week 1', 'Exercise\tSets\tReps\tWeight\tRPE', 'Squat\t3\t5\t140\t7', '', 'Week 2', 'Lift\tSets x Reps\tRPE\tWeight\tNotes', 'Squat\t3x5\t7.5\t145\tadd a belt'].join('\n'));
  ok(r.ok, r.why); eq([r.weeks, days(r), r.bad.length, line(r, 'Day 1', 'Squat')], [2, ['Day 1'], 0, ['3x5 @7 140kg', '3x5 @7.5 145kg']]);
  const b = r.block; eq(b.fieldText(0, 1, 'note'), 'add a belt');
});
t('a note longer than a set holds is kept whole on the exercise', () => {
  const long = 'Brace before you unrack, knees out on the way down, stay over mid-foot. If set two moves slower than RPE 7, hold the load and tell me how it felt.';
  const r = IM.read('Exercise\tSets\tReps\tNotes\nSquat\t3\t5\t' + long);
  ok(long.length > 140); eq(r.block.rows[0].note, long);
});
t('a column or a row left out that holds something is said, never dropped quietly', () => {
  const r = IM.read('Exercise\tSets\tReps\tRest\tNotes\tVideo\nSquat\t3\t5\t3 min\tbelt\thttps://youtu.be/x\nBench\t4\t6\t2 min\t\t\nTotal volume\t7\t\t\t\t');
  ok(r.ok, r.why);
  eq(r.notRead.filter((x) => x.col != null).map((x) => x.text), ['Column D “Rest”', 'Column F “Video”']);
  eq(r.notRead.filter((x) => x.row).map((x) => x.text), ['Total volume, 7']);
});
t('a cell the spreadsheet turned into a date is said to be one', () => {
  const r = IM.read('Exercise\tScheme\nSquat\t3x5\nBench\t2001-05-03');
  ok(r.ok && r.bad.length === 1 && /into a date/.test(r.bad[0].why), JSON.stringify(r.bad));
});
t('a workbook’s rows keep their empty rows, so days split by them stay apart', () => {
  const tables = [{ name: 'Sheet1', rows: [{ cells: ['Exercise', 'Sets', 'Reps'], line: 1 }, { cells: ['Squat', '3', '5'], line: 2 }, { cells: ['Bench', '4', '6'], line: 4 }] }];
  const pr = IM.prepare(tables); eq(pr.tables[0].rows.map((r) => r.length), [3, 3, 0, 3]);
  eq(days(IM.read(pr.tables[0].rows)), ['Day 1', 'Day 2']);
});
t('one tab per week is offered as one program, first, each tab still there', () => {
  const wk = (n, kg) => ({ name: 'Week ' + n, rows: [['Block A, week ' + n], ['Day 1'], ['Exercise', 'Sets', 'Reps', 'Load'], ['Squat', '3', '5', String(kg)]] });
  const pr = IM.prepare([wk(2, 145), wk(1, 140), { name: 'Maxes', rows: [['Lift', 'Max'], ['Squat', '200']] }]);
  eq([pr.tables.map((t) => t.name), pr.best], [['2 week tabs as one program', 'Week 2', 'Week 1', 'Maxes'], 0]);
  const r = IM.read(pr.tables[0].rows); ok(r.ok, r.why); eq([r.weeks, days(r), line(r, 'Day 1', 'Squat')], [2, ['Day 1'], ['3x5 140kg', '3x5 145kg']]);
});
t('the tab chosen first is the one that reads as the most programme, not the most lines', () => {
  const pr = IM.prepare([{ name: 'Maxes', rows: [['Lift', 'Max (kg)'], ['Squat', '200'], ['Bench', '130'], ['Deadlift', '240']] }, { name: 'Program', rows: [['Exercise', 'Week 1', 'Week 2'], ['Squat', '3x5 75%', '3x4 80%']] }]);
  eq(pr.tables[pr.best].name, 'Program');
});

// ---------------------------------------------------------------- the corpus: test/fixtures/import, every entrance
// Each fixture is an invented coach spreadsheet with what it must read as. It goes in three ways: as a range copied out
// of Google Sheets (tabs between cells), as a .csv file, and as an .xlsx (what a chosen file and a Google Sheets link
// both hand the reader, written here with the same vendored SheetJS the page uses), then through IMPORT.prepare.
{
  const REPO = path.join(ROOT, '..', '..'), FIX = path.join(REPO, 'test', 'fixtures', 'import');
  globalThis.self = globalThis;
  for (const f of ['import-lib-fflate.js', 'import-lib-xlsx.js', 'switch-kit.js', 'import-core.js']) vm.runInThisContext(fs.readFileSync(path.join(REPO, f), 'utf8'), { filename: f });
  const X = globalThis.XLSX, IC = globalThis.ImportCore;
  const shown = (c) => (c == null ? '' : typeof c === 'object' ? c.w : String(c));
  const csvq = (v) => (/[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v);
  const book = (fx) => { const wb = X.utils.book_new(); fx.tabs.forEach((tb) => {
    const ws = X.utils.aoa_to_sheet(tb.rows.map((r) => r.map((c) => (c == null ? null : typeof c === 'object' ? (c.d ? new Date(c.d + 'T00:00:00Z') : c.v) : c))), { cellDates: true });
    tb.rows.forEach((r, ri) => r.forEach((c, ci) => { if (c && typeof c === 'object' && c.z) ws[X.utils.encode_cell({ r: ri, c: ci })].z = c.z; }));
    if (tb.merges) ws['!merges'] = tb.merges.map((m) => X.utils.decode_range(m)); X.utils.book_append_sheet(wb, ws, tb.name); });
    return X.write(wb, { type: 'array', bookType: 'xlsx' }); };
  const cellOf = (res, d, n, w) => { const b = res.block, r = b.rows.find((x) => x.day === d && x.name === n && x.line === 0), wk = b.weeks[w - 1]; return r && wk && r.cells[wk.uid] ? BL.text(r.cells[wk.uid]) : undefined; };
  const files = fs.readdirSync(FIX).filter((f) => f.endsWith('.json')).sort();
  t('the corpus has at least 15 coach spreadsheets', () => ok(files.length >= 15, files.length));
  for (const f of files) {
    const fx = JSON.parse(fs.readFileSync(path.join(FIX, f), 'utf8')), tab = (fx.expect.tab && fx.tabs.find((x) => x.name === fx.expect.tab)) || fx.tabs[0];
    const ways = { pasted: [{ name: 'Pasted cells', rows: IM.table(tab.rows.map((r) => r.map(shown).join('\t')).join('\n')) }], csv: [{ name: f, rows: IM.table(tab.rows.map((r) => r.map((c) => csvq(shown(c))).join(',')).join('\n')) }], xlsx: null };
    for (const way of ['pasted', 'csv', 'xlsx']) t('corpus ' + f.replace('.json', '') + ', ' + way, () => {
      const tables = way === 'xlsx' ? IC.readWorkbook(book(fx), {}) : ways[way];
      const pr = IM.prepare(tables), chosen = pr.tables[pr.best], res = IM.read(chosen.rows);
      const E = Object.assign({}, fx.expect, way !== 'xlsx' && fx.expect.pasted ? fx.expect.pasted : {});
      ok(res.ok, res.why);
      if (E.tab && way === 'xlsx') eq(chosen.name, E.tab, 'the tab');
      if (E.weeks != null) eq(res.weeks, E.weeks, 'weeks');
      if (E.days) eq(res.days, E.days, 'days');
      if (E.lines != null) eq(res.lines.length, E.lines, 'lines');
      if (E.bad != null) eq(res.bad.map((b) => b.text), [], 'nothing unread');
      if (E.badCount != null) eq(res.bad.length, E.badCount, 'unread');
      if (E.unit) eq(res.unit, E.unit, 'unit');
      if (E.unknown != null) eq(res.unknown, [], 'every name known');
      (E.has || []).forEach(([d, n, w, x]) => eq(cellOf(res, d, n, w), x, d + ' / ' + n + ' / week ' + w));
      (E.badText || []).forEach((x) => ok(res.bad.some((b) => b.text.indexOf(x) >= 0), 'listed as not read: ' + x));
      if (E.names) Object.entries(E.names).forEach(([d, ns]) => eq(namesOf(res, d), ns, 'names on ' + d));
      (E.skippedCols || []).forEach((h) => ok(res.notRead.some((x) => x.col != null && x.text.indexOf(h) >= 0), 'the column left out is said: ' + h));
      (E.noteText || []).forEach((x) => ok(res.notRead.some((y) => y.text.indexOf(x) >= 0), 'said, not dropped: ' + x));
    });
  }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
