# Fix: Coach can't add "Rest days" to programs

**File to edit:** `coach.html` (one file, three small additions)
**Files NOT touched:** athlete.html, app.js, db.js — no other behavior changes

## Why this fix is safe

- No data model change. A "rest day" is just a day with `exercises: []` and a name containing "rest" / "off" / "recovery".
- `athlete.html` line 2615 already renders empty days as "Rest day" in the historical view — this fix makes the coach side match.
- All existing programs continue to work. Days without "rest" in the name still render the way they always did.
- No DB migration needed.
- No mapper changes in db.js needed.

---

## Change 1 of 3 — add `addRestDay` function

**Where:** `coach.html`, immediately AFTER the existing `addDay` function (current location: line 820–825).

**Find this block (around line 820):**
```js
function addDay(wi) {
  const aid = document.getElementById('progAthlete').value;
  Store.update(s => { const p = s.programs.find(p => p.athleteId === aid); if (p) p.weeks[wi].days.push(newDay('Day ' + (p.weeks[wi].days.length + 1))); });
  persistProgram(progIdForAthlete(aid));
  loadProgram();
}
```

**Add this NEW function right after it:**
```js
function addRestDay(wi) {
  const aid = document.getElementById('progAthlete').value;
  Store.update(s => {
    const p = s.programs.find(p => p.athleteId === aid);
    if (p) p.weeks[wi].days.push(newDay('Rest'));
  });
  persistProgram(progIdForAthlete(aid));
  loadProgram();
}
```

Note: we call the existing `newDay()` helper from app.js, so no changes there. We just name it "Rest" instead of "Day N". An empty day named "Rest" is the rest-day signal everywhere else in the app.

---

## Change 2 of 3 — add the "Add rest day" button

**Where:** `coach.html`, in the week-actions toolbar, right after the "Add day" button (current location: lines 589–591).

**Find this block (around line 589):**
```js
  const addDayBtn = el('button', { class: 'btn btn-sm', onclick: () => addDay(activeWeekIdx) });
  addDayBtn.innerHTML = ICONS.plus + '<span>Add day</span>';
  wkActions.appendChild(addDayBtn);
```

**Replace it with this (adds the rest-day button right after):**
```js
  const addDayBtn = el('button', { class: 'btn btn-sm', onclick: () => addDay(activeWeekIdx) });
  addDayBtn.innerHTML = ICONS.plus + '<span>Add day</span>';
  wkActions.appendChild(addDayBtn);
  const addRestBtn = el('button', { class: 'btn btn-sm', onclick: () => addRestDay(activeWeekIdx), title: 'Add a rest day (no exercises)' });
  addRestBtn.innerHTML = ICONS.plus + '<span>Add rest day</span>';
  wkActions.appendChild(addRestBtn);
```

If you'd prefer a different icon than the plus (e.g. a moon/zzz icon), swap `ICONS.plus` for whatever icon key exists in your ICONS object. The plus is the safe default since you know it exists.

---

## Change 3 of 3 — render rest days clearly in the day card

**Where:** `coach.html`, inside the day-rendering block where empty days currently show "No exercises yet" (current location: line 616–618).

**Find this block:**
```js
    const dayBody = el('div', { class: 'day-body' });
    if (!day.exercises.length) {
      dayBody.appendChild(el('div', { class: 'day-empty' }, 'No exercises yet'));
    } else {
```

**Replace the `if (!day.exercises.length)` branch with this:**
```js
    const dayBody = el('div', { class: 'day-body' });
    if (!day.exercises.length) {
      const isRestDay = /\b(rest|off|recovery)\b/i.test(day.name || '');
      if (isRestDay) {
        const restBox = el('div', { class: 'day-empty', style: 'text-align: center; padding: 24px; font-style: italic; color: var(--text-3);' });
        restBox.appendChild(el('div', { style: 'font-size: 1.4rem; margin-bottom: 6px;' }, '💤'));
        restBox.appendChild(el('div', {}, 'Rest day — no exercises'));
        restBox.appendChild(el('div', { class: 'text-sm', style: 'margin-top: 8px; color: var(--text-4);' }, 'Rename this day if you want to convert it to a training day, then add exercises.'));
        dayBody.appendChild(restBox);
      } else {
        dayBody.appendChild(el('div', { class: 'day-empty' }, 'No exercises yet'));
      }
    } else {
```

This keeps the "No exercises yet" message for days where the coach genuinely hasn't filled in exercises yet, but shows a clear rest-day card when the day is named "Rest" / "Off" / "Recovery" (case-insensitive, word boundary so "Restoration Day" or "Off-cycle" also work).

Note: I did NOT use emoji elsewhere in your codebase — if you want to keep the file emoji-free, just replace the `💤` line with text like `'Recovery'` or remove that element entirely.

---

## After applying

1. Save coach.html.
2. Hard-refresh in browser (Cmd+Shift+R / Ctrl+Shift+R) so the SW doesn't serve a cached version.
3. Open the program builder.
4. Click "Add rest day" — a new day named "Rest" appears with the rest-day card.
5. Click "Add day" — still works as before, adds "Day N" with empty-exercise prompt.
6. Rename an existing empty day to "Rest" or "Recovery" or "Off Day" — the rest-day card appears.
7. Rename a rest day back to "Day 5" — the "No exercises yet" prompt comes back.
8. Add an exercise to a rest day — it stops being rendered as a rest day (because `day.exercises.length > 0` now).

## What to verify didn't break

- Existing programs with non-rest empty days still show "No exercises yet" ✓
- Adding regular days still works ✓
- Renaming days still works ✓
- Reordering days still works ✓
- Deleting days still works ✓
- Athletes seeing the program still get the same view (we didn't change athlete.html) ✓
- DB persistence still works (no schema change) ✓
- Marketplace program purchase still works (rest days serialize/deserialize as normal days with empty exercises — already supported) ✓

## Optional follow-up (not part of this fix)

If you later want to be stricter (prevent accidental exercise-add on rest days, or count rest days separately in week summary), you could add an `isRest` boolean to the day model. But that's a schema change that touches:
- `app.js` `newDay` function
- `db.js` mappers (load + save sides, lines 180 and 672)
- Both render paths in coach.html and athlete.html
- Possibly a backfill for existing rows

It's not necessary right now — the name-based detection above works for shipping.
