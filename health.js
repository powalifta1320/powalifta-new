/* health.js — Apple Health for POWALIFTA (1.3, branch feat/apple-health). iPhone app only.
   Off until the lifter turns it on (You → Apple Health); nothing reads or writes Health before
   that. The web app never sees it, and neither do the demos, except in a Debug build of the app
   (the simulator), where the demo may try it; a Release build never lets the demo near Health.

     weigh-ins in    bodyweight from Health (smart scales, other apps) fills days POWALIFTA has
                     none of; a day with two different weights asks which to keep, and keeps
                     POWALIFTA's if the lifter doesn't say
     weigh-ins out   every weigh-in logged in POWALIFTA goes to Health (sync id powa-bw-<id>);
                     one that came from Health never goes back
     sessions out    a finished session is saved as a strength workout (powa-session-<day>-<date>),
                     with its sets and total lifted; undo takes it back out, finishing again
                     replaces it, so never two
     recovery        last night's sleep and resting heart rate: on Train's "How do you feel
                     today?", on Progress, in check-in questions about sleep, and with the coach
                     only when the lifter shares them (health_daily, migration-health-2026-10-22.sql)

   The lifter's choices live per account on this device (Health permissions are per device too). */
(function () {
  'use strict';
  const P = () => (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.PowaHealth) || null;
  const uidNow = () => ((typeof getCurrentUser === 'function' && getCurrentUser()) || {}).id || '';
  const K = (name) => 'powa-health-' + name + '-' + uidNow();
  const get = (name, d) => { try { const v = localStorage.getItem(K(name)); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const put = (name, v) => { try { localStorage.setItem(K(name), JSON.stringify(v)); } catch (e) {} };
  const r1 = (n) => Math.round(Number(n) * 10) / 10;
  const isoDay = (d) => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const daysAgo = (n) => isoDay(Date.now() - n * 86400000);

  let _avail = null, _debug = false;
  async function available() {
    if (_avail != null) return _avail;
    const p = P();
    if (!p) return (_avail = false);
    try {
      const r = await p.isAvailable();
      _debug = !!r.debug;
      _avail = !!r.available && (!window._demoMode || _debug);
    } catch (e) { _avail = false; }
    return _avail;
  }
  // Cheap, synchronous: could this device offer Apple Health at all (for showing the setting)?
  function couldOffer() { return !!P() && document.documentElement.classList.contains('native'); }
  function isOn() { return get('on', false) === true; }

  // ---------------------------------------------------------------- switching on and off
  async function enable() {
    if (!(await available())) return { ok: false, reason: window._demoMode ? 'demo' : 'unavailable' };
    let r;
    try { r = await P().requestAccess(); } catch (e) { return { ok: false, reason: 'error' }; }
    put('on', true);
    put('since', null);
    // HealthKit can drop its connection for a moment as the permission sheet closes.
    await new Promise(r => setTimeout(r, 500));
    const pulled = await pullWeights();
    await recovery(true);
    return { ok: true, canWriteWeight: !!r.canWriteWeight, canWriteWorkouts: !!r.canWriteWorkouts, imported: pulled.imported, conflicts: pulled.conflicts };
  }
  async function disable() {
    put('on', false);
    if (getShare()) await setShare(false);
  }

  // ---------------------------------------------------------------- weigh-ins in
  // The last Health reading of each day, against POWALIFTA's weigh-ins. New days come in;
  // different weights on a day POWALIFTA has are returned as conflicts (once per day).
  function planWeights(samples, mine, decided, imported) {
    const byDay = {};
    (samples || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).forEach(s => { if (s && s.day && Number(s.kg) > 0) byDay[s.day] = s; });
    const toImport = [], conflicts = [], updates = [];
    Object.keys(byDay).sort().forEach(day => {
      const s = byDay[day], kg = r1(s.kg);
      const have = (mine || []).find(b => b.date === day);
      if (!have) toImport.push({ day, kg, source: s.source || 'Apple Health' });
      else if (Math.abs(Number(have.weight) - kg) < 0.05) return;
      else if ((imported || {})[have.id]) updates.push({ id: have.id, kg });   // came from Health: follow its latest
      else if (!(decided || {})[day]) conflicts.push({ day, health: kg, source: s.source || 'Apple Health', ours: r1(have.weight), id: have.id });
    });
    return { toImport, conflicts, updates };
  }
  async function pullWeights() {
    const none = { imported: 0, conflicts: [] };
    if (!isOn() || !(await available())) return none;
    const since = get('since', null) || daysAgo(60);
    let res;
    try { res = await P().readWeights({ since }); } catch (e) { return none; }
    const uid = uidNow();
    const mine = (Store.get().bodyweight || []).filter(b => b.athleteId === uid);
    const decided = get('decided', {}), imported = get('imported', {});
    const plan = planWeights(res.samples, mine, decided, imported);
    for (const w of plan.toImport) {
      const b = { id: uid_('bw'), athleteId: uid, date: w.day, weight: w.kg };
      imported[b.id] = true;   // never echo back to Health
      put('imported', imported);
      Store.update(s => { s.bodyweight = (s.bodyweight || []).concat([b]); });
      try { await persistBw(b); } catch (e) {}
    }
    for (const u of plan.updates) {
      let b = null;
      Store.update(s => { const x = (s.bodyweight || []).find(y => y.id === u.id); if (x) { x.weight = u.kg; b = Object.assign({}, x); } });
      if (b) { try { await persistBw(b); } catch (e) {} }
    }
    put('since', daysAgo(2));   // re-read the last two days next time (late scale syncs)
    if (plan.toImport.length) { try { syncHomeWidget(); } catch (e) {} }
    return { imported: plan.toImport.length, conflicts: plan.conflicts };
  }
  const uid_ = (p) => (typeof uid === 'function' ? uid(p) : p + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  // The lifter's answer: 'ours' keeps POWALIFTA's number, 'health' takes Health's.
  async function resolveConflict(c, pick) {
    const decided = get('decided', {});
    decided[c.day] = pick === 'health' ? 'health' : 'ours';
    put('decided', decided);
    if (pick !== 'health') return;
    const imported = get('imported', {});
    imported[c.id] = true;
    put('imported', imported);
    let b = null;
    Store.update(s => { const x = (s.bodyweight || []).find(y => y.id === c.id); if (x) { x.weight = c.health; b = Object.assign({}, x); } });
    if (b) { try { await persistBw(b); } catch (e) {} }
  }

  // ---------------------------------------------------------------- weigh-ins out
  async function weightSaved(b) {
    if (!b || !isOn() || !(Number(b.weight) > 0) || get('imported', {})[b.id]) return;
    if (!(await available())) return;
    try { await P().writeWeight({ kg: Number(b.weight), id: String(b.id), date: b.date }); } catch (e) {}
  }

  // ---------------------------------------------------------------- sessions out
  const dayKey = (cur, date) => String(cur.day.id) + '-' + date;
  // The clock time of each logged set, kept here (sets carry only the day).
  function setLogged(cur, date) {
    if (!cur || !isOn()) return;
    const t = get('times', {}), k = dayKey(cur, date), now = new Date().toISOString();
    t[k] = t[k] ? { first: t[k].first, last: now } : { first: now, last: now };
    const keys = Object.keys(t);
    if (keys.length > 40) keys.sort((a, b) => String(t[a].last).localeCompare(String(t[b].last))).slice(0, keys.length - 40).forEach(x => delete t[x]);
    put('times', t);
  }
  // What a finished day adds up to; null while sets are still to do.
  function sessionWorkout(day, times, nowIso) {
    const sets = (day.exercises || []).flatMap(e => (e.sets || []).map(s => ({ s, e })));
    if (!sets.length || sets.some(x => !x.s.completed && !x.s.skipped)) return null;
    const done = sets.filter(x => x.s.completed && x.e.lift !== 'cardio');
    if (!done.length) return null;
    const totalKg = done.reduce((a, x) => a + (Number(x.s.weight) || 0) * (Number(x.s.reps) || 0), 0);
    const end = times && times.last ? Date.parse(times.last) + 2 * 60000 : Date.parse(nowIso);
    let start = times && times.first ? Date.parse(times.first) - 10 * 60000 : NaN;
    const minMin = Math.max(20, Math.min(120, done.length * 3));
    if (!(start > 0) || end - start < minMin * 60000) start = end - minMin * 60000;   // other devices, or a quick tap-through
    const by = {};
    done.forEach(x => {
      const name = typeof exTitleOf === 'function' ? exTitleOf(x.e) : (x.e.exerciseName || x.e.lift);
      (by[name] = by[name] || []).push((Number(x.s.weight) > 0 ? r1(x.s.weight) + ' kg × ' : '') + x.s.reps);
    });
    const summary = Object.keys(by).map(n => n + ': ' + by[n].join(', ')).join(' · ');
    return { title: day.name || 'Training', sets: done.length, totalKg: Math.round(totalKg * 10) / 10, summary,
      start: new Date(start).toISOString(), end: new Date(end).toISOString(), sig: done.length + ':' + Math.round(totalKg) };
  }
  let _sessBusy = false;
  async function sessionChanged(cur, date) {
    if (!cur || !isOn() || _sessBusy) return;
    if (!(await available())) return;
    _sessBusy = true;
    try {
      const k = dayKey(cur, date), saved = get('sessions', {});
      const w = sessionWorkout(cur.day, get('times', {})[k], new Date().toISOString());
      if (w && saved[k] !== w.sig) {
        await P().saveWorkout({ id: k, start: w.start, end: w.end, title: w.title, sets: w.sets, totalKg: w.totalKg, summary: w.summary });
        saved[k] = w.sig; put('sessions', saved);
      } else if (!w && saved[k]) {
        await P().deleteWorkout({ id: k });
        delete saved[k]; put('sessions', saved);
      }
    } catch (e) { /* Health refused (permission off): try again next time */ }
    finally { _sessBusy = false; }
  }

  // ---------------------------------------------------------------- recovery
  function rhrBaseline(samples) {
    // the usual: the median of the days before the latest one (two weeks)
    const days = {};
    (samples || []).forEach(s => { if (s && s.day && Number(s.bpm) > 0 && !(s.day in days)) days[s.day] = Number(s.bpm); });
    const keys = Object.keys(days).sort().reverse();
    const prior = keys.slice(1, 15).map(k => days[k]).sort((a, b) => a - b);
    if (prior.length < 3) return null;
    const mid = Math.floor(prior.length / 2);
    return prior.length % 2 ? prior[mid] : Math.round((prior[mid - 1] + prior[mid]) / 2);
  }
  function cachedRecovery() {
    if (!isOn()) return null;
    const r = get('recovery', null);
    return r && r.day === (typeof todayISO === 'function' ? todayISO() : isoDay(Date.now())) ? r : null;
  }
  async function recovery(force) {
    if (!isOn() || !(await available())) return null;
    const today = typeof todayISO === 'function' ? todayISO() : isoDay(Date.now());
    const c = get('recovery', null);
    const hasData = (x) => !!x && (x.sleepMin != null || x.rhr != null || (x.nights || []).some(n => n.minutes > 0) || (x.rhrDays || []).length > 0);
    // An empty answer is never kept for long: it's read again next time.
    if (!force && c && c.day === today && Date.now() - c.at < 30 * 60000 && hasData(c)) return c;
    const p = P();
    // A read that fails (HealthKit busy, the connection dropping) is tried once more.
    const once = (fn) => fn().catch(() => new Promise(r => setTimeout(r, 700)).then(fn));
    const [sl, hr] = await Promise.all([
      once(() => p.readSleep({ nights: 14 })).catch(() => ({ nights: [] })),
      once(() => p.readRestingHeartRate({ days: 21 })).catch(() => ({ samples: [] }))
    ]);
    const nights = (sl.nights || []).map(n => ({ night: n.night, minutes: Number(n.minutes) || 0 }));
    const hrs = hr.samples || [];
    const latest = hrs[0] || null;
    const rec = {
      day: today, at: Date.now(),
      sleepMin: nights[0] && nights[0].minutes > 0 ? nights[0].minutes : null,
      nights,
      rhr: latest && latest.day >= daysAgo(1) ? Number(latest.bpm) : null,
      rhrBase: rhrBaseline(hrs),
      rhrDays: (() => { const d = {}; hrs.forEach(s => { if (!(s.day in d)) d[s.day] = Number(s.bpm); }); return Object.keys(d).sort().map(k => ({ day: k, bpm: d[k] })); })()
    };
    put('recovery', rec);
    if (getShare()) { try { await shareRecovery(rec); } catch (e) {} }
    return rec;
  }
  // A suggestion for "How do you feel today?" from last night and the heart rate.
  function suggestReadiness(rec) {
    if (!rec || (rec.sleepMin == null && rec.rhr == null)) return null;
    const short = rec.sleepMin != null && rec.sleepMin < 6 * 60;
    const high = rec.rhr != null && rec.rhrBase != null && rec.rhr >= rec.rhrBase + 7;
    if (short || high) return 'rough';
    const great = rec.sleepMin != null && rec.sleepMin >= 8 * 60 && (rec.rhr == null || rec.rhrBase == null || rec.rhr <= rec.rhrBase);
    return great ? 'fresh' : 'normal';
  }
  function sleepText(min) {
    if (!(Number(min) > 0)) return '';
    const h = Math.floor(min / 60), m = Math.round(min % 60);
    return h + ' h' + (m ? ' ' + String(m).padStart(2, '0') : '');
  }
  // One line: "Slept 7 h 20 · resting HR 54".
  function recoveryLine(rec) {
    if (!rec) return '';
    const bits = [];
    if (rec.sleepMin != null) bits.push('Slept ' + sleepText(rec.sleepMin));
    if (rec.rhr != null) bits.push('resting HR ' + Math.round(rec.rhr) + (rec.rhrBase != null && Math.abs(rec.rhr - rec.rhrBase) >= 3 ? ' (' + (rec.rhr > rec.rhrBase ? '+' : '−') + Math.abs(Math.round(rec.rhr - rec.rhrBase)) + ')' : ''));
    const s = bits.join(' · ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
  }

  // ---------------------------------------------------------------- sharing with the coach
  // The profile says (profiles.share_health_with_coach); the demo keeps it on this device.
  function getShare() {
    const u = (typeof getCurrentUser === 'function' && getCurrentUser()) || {};
    if (!window._demoMode && typeof u.shareHealth === 'boolean') return u.shareHealth;
    return get('share', false) === true;
  }
  async function setShare(on) {
    put('share', !!on);
    const u = (typeof getCurrentUser === 'function' && getCurrentUser()) || null;
    if (u) u.shareHealth = !!on;
    if (window._demoMode || !(window.DB && DB.setShareHealth)) return { ok: true };
    const r = await DB.setShareHealth(!!on);
    if (r && r.ok && on) { const rec = get('recovery', null); if (rec) { try { await shareRecovery(rec); } catch (e) {} } }
    return r || { ok: false };
  }
  async function shareRecovery(rec) {
    if (window._demoMode || !(window.DB && DB.saveHealthDaily)) return;
    const rows = [];
    (rec.nights || []).slice(0, 7).forEach(n => rows.push({ day: n.night, sleepMin: n.minutes > 0 ? n.minutes : null }));
    (rec.rhrDays || []).slice(-7).forEach(d => {
      const row = rows.find(r => r.day === d.day);
      if (row) row.rhr = d.bpm; else rows.push({ day: d.day, sleepMin: null, rhr: d.bpm });
    });
    if (rows.length) await DB.saveHealthDaily(rows.filter(r => r.sleepMin != null || r.rhr != null));
  }

  // ---------------------------------------------------------------- once per open
  // On launch and when the app comes back: pull weigh-ins, refresh recovery, ask about clashes.
  let _refreshing = false, _askedThisLaunch = false;
  async function refresh(onConflicts) {
    if (_refreshing || !isOn()) return;
    _refreshing = true;
    try {
      // Once per launch, ask iOS again: it shows nothing when access is settled, and shows the
      // sheet when it isn't (a reinstall, a restored phone), which a read would otherwise just fail on.
      if (!_askedThisLaunch && (await available())) {
        _askedThisLaunch = true;
        try { await P().requestAccess(); } catch (e) {}
        await new Promise(r => setTimeout(r, 400));
      }
      const pulled = await pullWeights();
      await recovery(false);
      if (pulled.conflicts.length && typeof onConflicts === 'function') onConflicts(pulled.conflicts);
      return pulled;
    } finally { _refreshing = false; }
  }

  window.PowaHealthJS = {
    available, couldOffer, isOn, enable, disable, refresh, pullWeights, resolveConflict, weightSaved,
    setLogged, sessionChanged, recovery, cachedRecovery, suggestReadiness, recoveryLine, sleepText,
    getShare, setShare,
    // pure, for tests
    _planWeights: planWeights, _sessionWorkout: sessionWorkout, _rhrBaseline: rhrBaseline
  };
})();
