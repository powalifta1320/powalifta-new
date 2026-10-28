/* coach-app.js: the coach's iPhone app (2026-10-28). Home, Lifters and a lifter, phone only (the laptop
   desk, html.desk, keeps desk.js / coach-home.js / coach-lifters.js). Programs is coach-program.js.
   The owner's verdict on the old screens: "at first glance it's just info ... this should be more of an
   overview and easy way to access anything they need". So:
     Home     an overview you act from: who needs you (the fix on each), your lifters as faces with their
              week, one tap to everything else (Meets, Clients, Check-ins, Challenges, Club, Templates).
     Lifters  the hub: search, filters with counts, one calm row per lifter.
     A lifter like a contact card: who and where, four actions, the one flag with the screen's red, one
              overview card, everything else one tap away as rows (Progress, Notes & check-ins, Client...).
   Everything comes from the app's own model (coach-lifters.js CoachLifters.model: desk.js dkRowsFresh →
   app.js deskRows / deskReasons, the jobs and their tiers, Home's fixes), so a fix does the same thing on
   every screen. Styles: coach-app.css. Pure helpers (ca*) are unit-tested in tests.html. */
(function () {
  'use strict';
  var hasDom = typeof document !== 'undefined';
  function CL() { return window.CoachLifters || null; }

  /* ---------------------------------------------------------------- tiny helpers */
  var IC = {
    home: '<path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19z"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.3-4.3"/>',
    chev: '<path d="m9 6 6 6-6 6"/>',
    msg: '<path d="M20 11.5a7.8 7.8 0 0 1-11.4 6.9L4 20l1.5-4.3A7.8 7.8 0 1 1 20 11.5z"/>',
    cal: '<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 9.5h16M8.5 3v4M15.5 3v4"/>',
    chart: '<path d="M5 19V11M12 19V5M19 19v-6"/>',
    wallet: '<rect x="3.5" y="6" width="17" height="13" rx="3"/><path d="M16 12.5h1.5M3.5 9.5h17"/>',
    trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.8 2.8 0 0 0 2.8 3.6M16 6h2.5a2.8 2.8 0 0 1-2.8 3.6M12 13v3.5M8.5 20h7M10 16.5h4"/>',
    flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>',
    shield: '<path d="M12 3l7 3v5.5c0 4.4-3 8-7 9.5-4-1.5-7-5.1-7-9.5V6z"/>',
    copy: '<rect x="9" y="9" width="11" height="11" rx="2.5"/><path d="M5 15H4.5A1.5 1.5 0 0 1 3 13.5v-9A1.5 1.5 0 0 1 4.5 3h9A1.5 1.5 0 0 1 15 4.5V5"/>',
    clip: '<rect x="5" y="4.5" width="14" height="16" rx="3"/><path d="M9 3.5h6v3H9zM9 12l2 2 4-4"/>',
    pen: '<path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16z"/><path d="m13.5 6.5 4 4"/>',
    note: '<path d="M6 4h12a2 2 0 0 1 2 2v9l-5 5H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M15 20v-5h5M8 9h8M8 13h5"/>',
    blocks: '<path d="M4 20V10M9 20V4M15 20v-7M20 20V8"/>',
    steps: '<path d="M4 19h4.5v-4.5H13V10h4.5V5.5H20"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.8v5M12 16.2v.01"/>',
    scale: '<rect x="4" y="5" width="16" height="15" rx="4"/><path d="M8.8 10.2a3.6 3.6 0 0 1 6.4 0"/><path d="m12 10.6 1.4-1.6"/>',
    gauge: '<path d="M4.5 16.5a7.5 7.5 0 1 1 15 0"/><path d="m12 16.5 3.4-4.2"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    video: '<rect x="3" y="6" width="13" height="12" rx="3"/><path d="m16 10 5-3v10l-5-3z"/>',
    heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
    pulse: '<path d="M3 12h4l2.2-4.5 4 9 2.3-4.5H21"/>',
    eye: '<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.6"/>',
    trend: '<path d="m4 16 5-5 4 3 7-7"/><path d="M15 7h5v5"/>',
    down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/>',
    play: '<path d="M8 5.8v12.4a.8.8 0 0 0 1.2.7l9.7-6.2a.8.8 0 0 0 0-1.4L9.2 5.1A.8.8 0 0 0 8 5.8z"/>',
    cloudOff: '<path d="M8.2 7.1A6 6 0 0 1 18 11a4 4 0 0 1 1.9 6.9M16 19H7.5a4.75 4.75 0 0 1-1.2-9.35"/><path d="M3.5 3.5l17 17"/>'
  };
  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || IC.chev) + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function first(n) { return String(n || '').trim().split(/\s+/)[0] || ''; }
  function num(v) { return typeof _num === 'function' ? _num(v) : Math.round(Number(v) * 100) / 100; }
  function kgShow(v) { return typeof kgToDisplay === 'function' ? kgToDisplay(v) : Number(v); }
  function unit() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function store() { return typeof Store !== 'undefined' && Store.get ? Store.get() : {}; }
  function me() { return typeof getCurrentUser === 'function' ? getCurrentUser() : null; }
  function todayIso() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function addDays(iso, n) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function daysBetween(a, b) { return Math.round((Date.parse(String(b).slice(0, 10) + 'T12:00:00Z') - Date.parse(String(a).slice(0, 10) + 'T12:00:00Z')) / 86400000); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  // Text as search reads it: lower case, accents aside ("tomas" finds Tomás). Programs' picker does the same.
  function caNorm(t) { var x = String(t == null ? '' : t); try { x = x.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (e) {} return x.toLowerCase().trim(); }
  function clip(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trim() + '…' : s; }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function localDate(iso, o) { try { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString(undefined, o); } catch (e) { return ''; } }
  function whenText(iso) { var d = daysBetween(String(iso).slice(0, 10), todayIso()); if (d <= 0) return 'today'; if (d === 1) return 'yesterday'; if (d < 7) return localDate(iso, { weekday: 'long' }); return localDate(iso, { day: 'numeric', month: 'short' }); }
  // " · " holds the words either side on a wrap; a number keeps its unit.
  function keepDots(text) { return String(text).replace(/ · /g, ' · ').replace(/(\d) (?=[A-Za-z%])/g, '$1 '); }
  function avHtml(a, cls) {
    var name = (a && a.name) || '?';
    var hue = typeof avatarHue === 'function' ? avatarHue(name) : 0;
    var ini = typeof initials === 'function' ? initials(name) : name.slice(0, 2).toUpperCase();
    return '<span class="ui-av ca-av av-h' + hue + (cls ? ' ' + cls : '') + '" data-name="' + esc(name) + '" aria-hidden="true">' + (a && a.avatarUrl ? '<img src="' + esc(a.avatarUrl) + '" alt="">' : esc(ini)) + '</span>';
  }
  function tab(name) { var t = hasDom && document.getElementById('tab-' + name); if (t) t.click(); return !!t; }
  function trainedDays(id) { try { return typeof trainingDays === 'function' ? trainingDays(id, 7) : []; } catch (e) { return []; } }
  function unreadMap() { try { return typeof _unreadByAthlete !== 'undefined' && _unreadByAthlete ? _unreadByAthlete : {}; } catch (e) { return {}; } }

  /* ====================================================================================================
     PURE (tests.html "coach app (coach-app.js)")
     ==================================================================================================== */

  // Home's first line: the day, and what is happening in it that nothing else on Home says: who is under
  // the bar now, else who trained today, else that nobody has yet. (It was "Good evening", which the delete
  // test took.) o: { weekday: 'Tuesday' }. Names are first names; two long ones, or three and more, a count.
  function caTodayLine(rows, o) {
    o = o || {};
    var day = String(o.weekday || '').trim();
    var names = function (list) { return list.map(function (r) { return first(r.athlete && r.athlete.name); }).filter(Boolean); };
    var said = function (list, one, many) {
      var n = names(list);
      if (n.length === 1) return n[0] + ' ' + one;
      if (n.length === 2 && (n[0] + n[1]).length <= 18) return n[0] + ' and ' + n[1] + ' ' + many;
      return list.length + ' lifters ' + many;
    };
    var live = (rows || []).filter(function (r) { return r && r.live; });
    var today = (rows || []).filter(function (r) { return r && !r.live && r.status && r.status.ago === 0; });
    var fact = live.length ? said(live, 'is training now', 'are training now')
      : today.length ? said(today, 'trained today', 'trained today')
      : 'No one has trained yet today';
    return day ? day + ' \u00b7 ' + fact : fact;
  }

  // Who needs the coach this week: every lifter with an open job due now, today or this week (tiers 0-2
  // of coach-lifters.js clTier; tiers 3-4 are planning: blocks and next weeks to write), worst first.
  // A meet-day job counts each lifter at the meet. jobs: CoachLifters.clJobs (already worst first).
  var NEED_TIER = 2;
  function caNeedIds(jobs, maxTier) {
    var mt = maxTier == null ? NEED_TIER : maxTier, out = [];
    (jobs || []).forEach(function (it) {
      if (!it || it.done || it.tier > mt) return;
      (it.r ? [it.r] : (it.rows || [])).forEach(function (r) { var id = r && r.athlete && r.athlete.id; if (id && out.indexOf(id) < 0) out.push(id); });
    });
    return out;
  }
  // Each lifter's worst open job, in the jobs' order, for the lifters in ids. A meet day is one entry for
  // everyone at it (rows: who). → [{ id, job, r, rows }]
  function caLeadJobs(jobs, ids) {
    var seen = {}, out = [];
    (jobs || []).forEach(function (it) {
      if (!it || it.done) return;
      var who = (it.r ? [it.r] : (it.rows || [])).filter(function (r) {
        var id = r && r.athlete && r.athlete.id;
        return id && !seen[id] && (!ids || ids.indexOf(id) >= 0);
      });
      if (!who.length) return;
      if (it.type === 'meetday') {
        who.forEach(function (r) { seen[r.athlete.id] = 1; });
        out.push({ id: who[0].athlete.id, job: it, r: who[0], rows: who });
        return;
      }
      who.forEach(function (r) { seen[r.athlete.id] = 1; out.push({ id: r.athlete.id, job: it, r: r, rows: [r] }); });
    });
    return out;
  }
  // This week's sessions as a ring: one segment per planned session, the trained ones filled. Behind =
  // two or more short in the last 7 days. trained/planned are counts; planned 0 = no block running.
  function caWeek(trained, planned) {
    var n = Math.max(0, Math.min(7, Math.round(Number(planned) || 0)));
    var t = Math.max(0, Math.round(Number(trained) || 0));
    if (!n) return { n: 0, k: 0, trained: t, behind: false, text: t ? plural(t, 'session') + ' in the last 7 days' : 'No block running' };
    var k = Math.min(n, t);
    return { n: n, k: k, trained: t, behind: n >= 2 && t <= n - 2, text: t + ' of ' + n + ' sessions in the last 7 days' };
  }
  // The ring around a face, as SVG: segments around a circle with gaps, the first k filled. size: the
  // ring's outer diameter in px; sw: stroke width. A ring with no block is one faint full circle.
  function caRingSvg(w, size, sw) {
    size = size || 60; sw = sw || 3;
    var r = (size - sw) / 2, c = 2 * Math.PI * r, cx = size / 2;
    var open = '<svg class="ca-ring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">';
    if (!w || !w.n) return open + '<circle class="ca-ring-none" cx="' + cx + '" cy="' + cx + '" r="' + r.toFixed(2) + '" stroke-width="' + sw + '"/></svg>';
    var gap = w.n > 1 ? Math.min(6, c / w.n * 0.18) + sw : 0;   // the round caps eat into the gap
    var seg = c / w.n - gap;
    var dash = function (k) {
      var parts = [];
      for (var i = 0; i < k; i++) parts.push(seg.toFixed(2), gap.toFixed(2));
      parts.push('0', c.toFixed(2));
      return parts.join(' ');
    };
    var rot = 'transform="rotate(-90 ' + cx + ' ' + cx + ')"', off = (-gap / 2).toFixed(2);
    var o = open + '<circle class="ca-ring-track' + (w.behind ? ' is-behind' : '') + '" cx="' + cx + '" cy="' + cx + '" r="' + r.toFixed(2) + '" stroke-width="' + sw + '" stroke-dasharray="' + dash(w.n) + '" stroke-dashoffset="' + off + '" ' + rot + '/>';
    if (w.k) o += '<circle class="ca-ring-fill" cx="' + cx + '" cy="' + cx + '" r="' + r.toFixed(2) + '" stroke-width="' + sw + '" stroke-dasharray="' + dash(w.k) + '" stroke-dashoffset="' + off + '" ' + rot + '/>';
    return o + '</svg>';
  }
  // The filters on Lifters, with counts. ctx: { need: [ids], week(r) → caWeek }.
  var FILTERS = [['all', 'All'], ['need', 'Needs you'], ['meet', 'Meet soon'], ['behind', 'Behind']];
  function caIsMeetSoon(r) { return !!(r && r.meet && r.meet.days != null && r.meet.days >= 0 && r.meet.days <= 56); }
  function caIsBehind(r, w) {
    if (w && w.behind) return true;
    return (r.reasons || []).some(function (x) { return x && (x.type === 'quiet' || x.type === 'missed'); });
  }
  function caFilterMatch(key, r, ctx) {
    ctx = ctx || {};
    if (key === 'need') return (ctx.need || []).indexOf(r.athlete.id) >= 0;
    if (key === 'meet') return caIsMeetSoon(r);
    if (key === 'behind') return caIsBehind(r, ctx.week ? ctx.week(r) : null);
    return true;
  }
  function caFilterCounts(rows, ctx) {
    var out = {};
    FILTERS.forEach(function (f) { out[f[0]] = (rows || []).filter(function (r) { return caFilterMatch(f[0], r, ctx); }).length; });
    return out;
  }
  // The list's order: who needs you (worst first), then the nearest meets, then everyone else by name.
  function caSortRows(rows, need) {
    need = need || [];
    var meetDays = function (r) { return caIsMeetSoon(r) ? r.meet.days : 9999; };
    return (rows || []).slice().sort(function (a, b) {
      var ia = need.indexOf(a.athlete.id), ib = need.indexOf(b.athlete.id);
      ia = ia < 0 ? 9999 : ia; ib = ib < 0 ? 9999 : ib;
      return ia - ib || meetDays(a) - meetDays(b) || String(a.athlete.name).localeCompare(String(b.athlete.name));
    });
  }
  // The faces on Home: under the bar right now first, then who needs you, then by name.
  function caFaceOrder(rows, need) {
    var sorted = caSortRows(rows, need);
    return sorted.filter(function (r) { return r.live; }).concat(sorted.filter(function (r) { return !r.live; }));
  }
  // A lifter's status, one dot and a few words: under the bar, the worst open job's severity, the meet,
  // on plan, or no block. top: their worst open job (CoachLifters.clTopJob).
  function caStatus(r, top) {
    if (r && r.live) return { tone: 'live', text: 'Training now' };
    if (top && top.tier <= NEED_TIER) return { tone: top.type === 'pain' ? 'alert' : 'watch', text: 'Needs you' };
    if (caIsMeetSoon(r)) return { tone: 'meet', text: r.meet.days === 0 ? 'Meet today' : r.meet.days === 1 ? 'Meet tomorrow' : 'Meet in ' + r.meet.days + ' days' };
    if (r && r.status && r.status.program) return { tone: 'ok', text: 'On plan' };
    return { tone: 'none', text: 'No block yet' };
  }
  // A lifter's header line under their name: under the bar now, else the meet (its name, how far, their
  // weight against the class), else on plan. Null when the flag below already says it ("Needs you") or the
  // meta line does ("No block yet"). r.bw: { bw, cls, over } in kg; r.meet: { days, meet: { name } }.
  function caHeadChip(r, top) {
    if (!r) return null;
    if (r.live) return { tone: 'live', text: 'Training now' };
    if (caIsMeetSoon(r)) {
      var m = r.meet.meet || {}, nm = clip(String(m.name || '').trim() || 'Meet', 24), d = r.meet.days;
      var said = top && (top.type === 'meet' || top.type === 'meetday');   // the flag already says when
      var when = said ? '' : d <= 0 ? ' is today' : d === 1 ? ' is tomorrow' : ' in ' + plural(d, 'day');
      var bw = r.bw && Number(r.bw.bw) > 0 ? num(kgShow(r.bw.bw)) + ' ' + unit() + ' in the ' + String(r.bw.cls).replace(/\s*kg$/i, '') + 's' : '';
      return { tone: 'meet', text: nm + when + (bw ? ' \u00b7 ' + bw : '') };
    }
    if (top && top.tier <= NEED_TIER) return null;
    if (r.status && r.status.program) return { tone: 'ok', text: 'On plan' };
    return null;
  }
  // Home's three numbers: who trained in the last 7 days (of the roster), this week's PRs, unread messages.
  // opts: { daysOf(id) → [{ on }], unread: { athleteId: n } }
  function caHeroStats(rows, opts) {
    opts = opts || {};
    var daysOf = opts.daysOf || function () { return []; };
    var trained = 0, prs = 0, unread = 0;
    (rows || []).forEach(function (r) {
      if ((daysOf(r.athlete.id) || []).some(function (d) { return d && d.on; })) trained++;
      (r.wins || []).forEach(function (w) { if (w && w.type === 'pr') prs += (w.lifts && w.lifts.length) || 1; });
    });
    Object.keys(opts.unread || {}).forEach(function (k) { unread += Math.max(0, Number(opts.unread[k]) || 0); });
    return { trained: trained, of: (rows || []).length, prs: prs, unread: unread };
  }
  // This week's wins, the lifters with a PR first: [{ id, name, lifts: ['squat'..], text }]
  function caWins(rows) {
    var out = [];
    (rows || []).forEach(function (r) {
      var lifts = [], extra = [];
      (r.wins || []).forEach(function (w) { if (!w) return; if (w.type === 'pr') lifts = lifts.concat(w.lifts || []); else if (w.text) extra.push(w.text); });
      if (lifts.length || extra.length) out.push({ id: r.athlete.id, name: r.athlete.name, lifts: lifts, extra: extra });
    });
    return out.sort(function (a, b) { return b.lifts.length - a.lifts.length || String(a.name).localeCompare(String(b.name)); });
  }
  // The headline: "3 need you", "1 needs you", or all clear.
  function caHeadline(n) { return n > 0 ? { n: n, words: n === 1 ? 'needs you' : 'need you' } : { n: 0, words: 'All clear' }; }
  // The focal job as a sentence about the lifter ("Tom's meet is today"), for the one big job on Home and
  // the flag on a lifter's card. it: a job from clJobs; jt: its jobText (the detail comes from there).
  function poss(n) { return n ? n + '\u2019s' : 'Their'; }
  function caFocalTitle(it) {
    var r = (it && (it.r || (it.rows && it.rows[0]))) || {}, a = r.athlete || {}, f = first(a.name) || 'They', st = r.status || {}, x = (it && it.reason) || {};
    var days = r.meet ? r.meet.days : null;
    switch (it && it.type) {
      case 'meetday': return it.rows && it.rows.length > 1 ? (it.name || 'The meet') + (it.days <= 0 ? ' is today' : ' is tomorrow') : poss(f) + ' meet is ' + (it.days <= 0 ? 'today' : 'tomorrow');
      case 'meet': return poss(f) + ' meet is ' + (days <= 0 ? 'today' : days === 1 ? 'tomorrow' : 'in ' + days + ' days');
      case 'pain': {
        var rep0 = st.pain && st.pain.report, part = rep0 && typeof painPartLabel === 'function' ? painPartLabel(rep0.bodyPart, rep0.side) : '';
        return f + ' reported ' + (part ? String(part).replace(/^([LR]) /, function (m0, s0) { return (s0 === 'L' ? 'left ' : 'right '); }).toLowerCase() + ' pain' : 'pain');
      }
      case 'weight': return r.bw ? f + ' is ' + num(kgShow(r.bw.over)) + ' ' + unit() + ' over the ' + String(r.bw.cls).replace(/\s*kg$/i, '') + ' class' : f + ' is over the class';
      case 'offpace': return poss(f) + ' cut is off pace';
      case 'overshoot': { var m = /^(.*?) @/.exec(x.text || ''); return poss(f) + ' ' + (m ? m[1].toLowerCase() : 'top set') + ' felt heavier than you wrote'; }
      case 'drift': return poss(f) + ' effort is drifting up';
      case 'message': return f + ' wrote you';
      case 'note': return f + ' left you a note';
      case 'formcheck': return f + ' sent a form check';
      case 'checkin': return poss(f) + ' check-in is worth a look';
      case 'nocheckin': return f + ' hasn\u2019t checked in';
      case 'readiness': return poss(f) + ' readiness is low';
      case 'quiet': return f + ' has been quiet' + (st.ago != null ? ' for ' + plural(st.ago, 'day') : '');
      case 'never': return f + ' hasn\u2019t logged a set yet';
      case 'missed': return f + ' missed a session';
      case 'noprogram': return f + ' has no block yet';
      case 'blockend': return poss(f) + ' block ends this week';
      case 'blockdone': return f + ' finished the block';
      case 'stalling': return f + ' has been flat for 3 weeks';
      case 'write': return poss(f) + ' next week is ready to write';
      case 'busy': { var bl = caBusyLine(it); return bl ? f + ' ' + bl.charAt(0).toLowerCase() + bl.slice(1) : f + ' has a busy week'; }
    }
    return f;
  }
  // A busy week in the lifter's words, for a row: "Can train 2 days this week". '' without its info.
  function caBusyLine(it) {
    if (!it || !it.info) return '';
    var nd = Number(it.info.days) || 0;
    return nd > 0 ? 'Can train ' + plural(nd, 'day') + ' this week' : 'Can\u2019t train this week';
  }
  // A meet day with several lifters at it: who's over their class, whether the attempts are in.
  function caMeetDayDetail(it) {
    var over = it.over || [], un = it.unplanned || [], rows = it.rows || [];
    var bits = [];
    if (over.length === 1) bits.push(first(over[0].athlete.name) + ' ' + num(kgShow(over[0].bw.over)) + ' ' + unit() + ' over');
    else if (over.length > 1) bits.push(over.length + ' over their class');
    bits.push(!un.length ? 'attempts set' : un.length === rows.length ? 'attempts not set' : un.length + ' without attempts');
    return bits.join(' \u00b7 ');
  }
  // The line under it: the evidence, in one short line with at most one dot.
  function caFocalDetail(it, jt) {
    jt = jt || {};
    if (!it) return '';
    var r = it.r || (it.rows && it.rows[0]) || {}, st = r.status || {};
    if (it.type === 'pain') {
      var p = st.pain, rp = p && p.report;
      if (!rp) return jt.detail || '';
      var sev = rp.severity != null ? num(rp.severity) + '/10' : '';
      var lift = rp.lift && typeof painLiftLabel === 'function' ? String(painLiftLabel(rp.lift)).toLowerCase() : '';
      var times = p.count >= 2 ? (typeof _ordinal === 'function' ? _ordinal(p.count) : p.count + 'th') + ' time this week' : (rp.day ? 'reported ' + whenText(rp.day) : '');
      return [sev + (lift ? (sev ? ' on ' : 'On ') + lift : ''), times].filter(Boolean).join(', ');
    }
    if (it.type === 'message') {
      var ago = String(jt.title || '').replace(/^Wrote you( · )?/, '');
      var vm = /^Voice note · (\d+:\d{2})$/.exec(String(jt.detail || ''));
      var body = vm ? 'voice note ' + vm[1] : (jt.detail || '');
      return [ago, body].filter(Boolean).join(' \u00b7 ');
    }
    if (it.type === 'busy') return String((it.info && it.info.line) || jt.detail || '').replace(/ · /g, ', ');
    if (it.type === 'overshoot' || it.type === 'weight' || it.type === 'quiet' || it.type === 'never' || it.type === 'noprogram' || it.type === 'readiness') return jt.detail || '';
    return jt.detail || (jt.title !== caFocalTitle(it) ? jt.title || '' : '');
  }
  // The roster's next meet, one entry per meet: { days, name, who: [first names] } or null.
  function caNextMeet(rows) {
    var groups = {};
    (rows || []).forEach(function (r) {
      if (!r || !r.meet || r.meet.days == null || r.meet.days < 0) return;
      var m = r.meet.meet || {}, k = String(m.name || 'Meet').trim().toLowerCase() + '|' + String(m.date || '').slice(0, 10);
      var g = groups[k] || (groups[k] = { days: r.meet.days, name: String(m.name || 'Meet').trim() || 'Meet', who: [] });
      g.who.push(first(r.athlete.name));
    });
    return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.days - b.days || a.name.localeCompare(b.name); })[0] || null;
  }
  // Check-ins worth the coach's eye this week, per lifter: the newest answers and anything flagged
  // (app.js checkinAlerts). → [{ id, name, last (date), alerts: [text], answered }]
  function caCheckins(questions, answers, athletes, today) {
    var t = today || todayIso(), since = addDays(t, -6);
    return (athletes || []).map(function (a) {
      var mine = (answers || []).filter(function (x) { return x && x.athleteId === a.id; });
      var last = mine.reduce(function (m, x) { return String(x.period || '') > m ? String(x.period || '') : m; }, '');
      var alerts = typeof checkinAlerts === 'function' ? checkinAlerts(questions || [], answers || [], a.id, t).map(function (x) { return x.text; }) : [];
      return { id: a.id, name: a.name, last: last || null, answered: !!last && last >= since, alerts: alerts };
    }).filter(function (x) { return x.last; })
      .sort(function (x, y) { return (y.alerts.length ? 1 : 0) - (x.alerts.length ? 1 : 0) || String(y.last).localeCompare(String(x.last)) || String(x.name).localeCompare(String(y.name)); });
  }

  /* ====================================================================================================
     THE MODEL for a render: CoachLifters' rows and jobs, plus who needs you and each lifter's week.
     ==================================================================================================== */
  function model() {
    var M = CL() && CL().model ? CL().model() : { rows: [], jobs: [], open: [] };
    var need = caNeedIds(M.jobs);
    var weekCache = {};
    var week = function (r) {
      var id = r.athlete.id;
      if (weekCache[id]) return weekCache[id];
      var w = r.status && r.status.week, planned = w && w.sessionsPerWeek && r.status.program ? w.sessionsPerWeek : 0;
      return (weekCache[id] = caWeek(trainedDays(id).filter(function (d) { return d.on; }).length, planned));
    };
    return { M: M, rows: M.rows || [], jobs: M.jobs || [], need: need, week: week, lead: caLeadJobs(M.jobs, need) };
  }
  function topJob(r, jobs) { return CL() && CL().clTopJob ? CL().clTopJob(r, jobs) : null; }
  function jobText(it, forId) {
    if (!CL() || !CL().jobText) return { title: '', detail: '', tone: 'quiet', icon: 'eye' };
    return CL().jobText(it.type === 'meetday' && forId ? Object.assign({}, it, { forId: forId }) : it);
  }
  function fixOf(it) { return CL() && CL().fixForJob ? CL().fixForJob(it) : null; }
  // The red's words: the desk's fix label, but a busy week says what Approve agrees to ("Approve 2 days").
  function caFixLabel(it, f) {
    var lb = (f && f.label) || 'Open';
    if (it && it.type === 'busy' && it.info && Number(it.info.days) > 0 && /^Approve$/.test(lb)) return 'Approve ' + plural(Number(it.info.days), 'day');
    return lb;
  }
  function runFix(r, f, btn) { if (CL() && CL().runFix) CL().runFix(r, f, btn); }
  function faceHtml(r, w, size, opts) {
    opts = opts || {};
    var a = r.athlete;
    return '<span class="ca-face is-f' + size + (opts.cls ? ' ' + opts.cls : '') + '" style="--fs:' + size + 'px">' + caRingSvg(w, size, opts.sw || (size >= 80 ? 3.5 : 3)) + avHtml(a) +
      (r.live ? '<i class="ca-live" title="Training now"></i>' : '') + '</span>';
  }

  /* ====================================================================================================
     STATES: before the roster is in, each screen draws a skeleton in its own shape; if it couldn't load,
     one calm card with Try again. coach.html keeps the boot's state in window._coachBoot ('loading',
     'ready', 'failed'); Home's skeleton is also in coach.html itself, so it shows before any script runs.
     ==================================================================================================== */
  function sk(cls, w) { return '<i class="ca-sk ' + cls + '"' + (w ? ' style="--w:' + w + '"' : '') + '></i>'; }
  function times(n, f) { var o = ''; for (var i = 0; i < n; i++) o += f(i); return o; }
  function skeletonHtml(kind) {
    kind = kind || 'home';
    var row = function (end) { return '<div class="ca-sk-row">' + sk('ca-sk-av') + '<span class="ca-sk-tx">' + sk('ca-sk-t', '42%') + sk('ca-sk-line', '66%') + '</span>' + sk(end) + '</div>'; };
    var body;
    if (kind === 'lifters') {
      body = '<div class="ca-sk-seg">' + times(4, function () { return '<span>' + sk('ca-sk-num') + sk('ca-sk-cap') + '</span>'; }) + '</div>' +
        '<div class="ca-sk-rows is-list">' + times(5, function () { return row('ca-sk-end'); }) + '</div>';
    } else if (kind === 'lifter') {
      body = '<div class="ca-sk-head">' + sk('ca-sk-av is-96') + sk('ca-sk-name', '56%') + sk('ca-sk-line', '40%') + '</div>' +
        '<div class="ca-sk-acts">' + times(4, function () { return sk('ca-sk-act'); }) + '</div>' + sk('ca-sk-card');
    } else if (kind === 'program') {
      body = '<div class="ca-hero ca-sk-hero is-short">' + sk('ca-sk-t', '48%') + sk('ca-sk-line', '64%') + '</div>' + sk('ca-sk-weeks') +
        '<div class="ca-sk-chips">' + times(3, function () { return sk('ca-sk-chip'); }) + '</div>' + sk('ca-sk-card');
    } else {
      body = '<div class="ca-hero ca-sk-hero">' + sk('ca-sk-line', '46%') + sk('ca-sk-big', '52%') +
          '<div class="ca-sk-stats">' + times(3, function () { return '<span>' + sk('ca-sk-num') + sk('ca-sk-cap') + '</span>'; }) + '</div></div>' +
        '<div class="ca-sk-focal">' + sk('ca-sk-av is-56') + '<span class="ca-sk-tx">' + sk('ca-sk-t', '78%') + sk('ca-sk-line', '52%') + '</span></div>' + sk('ca-sk-btn') +
        '<div class="ca-sk-rows">' + row('ca-sk-pill') + row('ca-sk-pill') + '</div>' +
        '<div class="ca-sk-faces">' + times(4, function () { return sk('ca-sk-face'); }) + '</div>';
    }
    var say = kind === 'program' ? 'Loading the program' : kind === 'lifter' ? 'Loading the lifter' : 'Loading your lifters';
    return '<div class="ca-root ca-skel is-' + kind + '" role="status"><span class="ca-sr">' + say + '</span><div class="ca-skel-in" aria-hidden="true">' + body + '</div></div>';
  }
  function errorHtml() {
    var off = hasDom && typeof navigator !== 'undefined' && navigator.onLine === false;
    return '<div class="ca-root ca-state" role="alert"><span class="ca-state-ic">' + ic('cloudOff') + '</span>' +
      '<h2 class="ca-state-t">' + (off ? 'You\u2019re offline' : 'Your lifters didn\u2019t load') + '</h2>' +
      '<p class="ca-state-s">' + (off ? 'Your lifters show here once this phone is back online.' : 'POWALIFTA couldn\u2019t be reached just now. Check your connection, then try again.') + '</p>' +
      '<button type="button" class="ca-btn is-red" data-retry>Try again</button></div>';
  }
  var ST = { retry: null };
  function bootState() { return hasDom && window._coachBoot ? window._coachBoot : 'ready'; }
  // Before the roster is in, a screen draws its skeleton; when it couldn't load, the card with Try again.
  function gate(area, kind) {
    var st = bootState();
    if (st === 'ready' || !area) return false;
    area.innerHTML = st === 'failed' ? errorHtml() : skeletonHtml(kind);
    area.setAttribute('data-ca-state', kind || 'home');
    wireRetry(area);
    return true;
  }
  function wireRetry(area) {
    if (area._caRetry) return;
    area._caRetry = true;
    area.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-retry]');
      if (!b) return;
      e.preventDefault(); e.stopPropagation();
      window._coachBoot = 'loading';
      area.innerHTML = skeletonHtml(area.getAttribute('data-ca-state') || 'home');
      if (ST.retry) ST.retry();
    });
  }
  // coach.html's bootstrap couldn't load the roster (and had no copy on this phone): Home says so.
  function bootFailed(retry) {
    window._coachBoot = 'failed';
    ST.retry = retry || ST.retry;
    var area = hasDom && document.getElementById('homeArea');
    if (area) gate(area, 'home');
    // Back online: it tries again without being asked.
    if (hasDom && !ST.online) {
      ST.online = true;
      window.addEventListener('online', function () {
        if (bootState() !== 'failed' || !ST.retry) return;
        var a = document.getElementById('homeArea');
        window._coachBoot = 'loading';
        if (a) a.innerHTML = skeletonHtml(a.getAttribute('data-ca-state') || 'home');
        ST.retry();
      });
    }
  }
  // The unread count loads after the screen (Messages): a skeleton until it's in, a dash if it failed.
  function unreadState() { try { return typeof _unreadState !== 'undefined' ? _unreadState : 'ready'; } catch (e) { return 'ready'; } }

  /* ====================================================================================================
     HOME
     ==================================================================================================== */
  var H = { host: null };
  function renderHome(area) {
    area = area || (hasDom ? document.getElementById('homeArea') : null);
    if (!area) return;
    if (gate(area, 'home')) return;
    area.removeAttribute('data-ca-state');
    H.host = area;
    var u = me() || {};
    var roster = (store().athletes || []).filter(function (a) { return a.coachId === u.id; });
    try { if (/#lifter=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    if (!roster.length) { area.innerHTML = welcomeHtml(u); wireHome(area); return; }
    var X = model();
    var html = '<div class="ca-home ca-root">';
    html += heroHtml(X, u);
    var monday = new Date().getDay() === 1;
    if (monday) html += reportRowHtml(1);
    html += needsHtml(X);
    html += facesHtml(X);
    html += tilesHtml(X);
    if (!monday) html += reportRowHtml(0);
    html += '</div>';
    area.innerHTML = html;
    area._X = X;
    wireHome(area);
    var i = 0;
    area.querySelectorAll('.ca-rise').forEach(function (n) { n.style.setProperty('--i', String(Math.min(i++, 8))); });
    paintBadges();
  }
  function heroHtml(X, u) {
    var st = caHeroStats(X.rows, { daysOf: trainedDays, unread: unreadMap() });
    var hl = caHeadline(X.need.length);
    var hi = caTodayLine(X.rows, { weekday: localDate(todayIso(), { weekday: 'long' }) });
    var head = hl.n ? '<b class="ca-big">' + hl.n + '</b><span class="ca-big-w">' + hl.words + '</span>'
      : '<span class="ca-big-ok" aria-hidden="true">' + ic('check', 2.6) + '</span><span class="ca-big-w is-clear">All clear</span>';
    // All clear: say what's below only when something is (the next weeks and blocks to write).
    var sub = hl.n ? '' : '<p class="ca-hero-sub">' + (caLeadJobs(X.jobs, null).length ? 'Nobody needs you this week. Next weeks and blocks are below.' : 'Nobody needs you this week. Everyone is on plan.') + '</p>';
    return '<div class="ca-hero ca-rise"><p class="ca-hero-hi">' + esc(hi) + '</p><div class="ca-hero-head">' + head + '</div>' + sub +
      '<div class="ca-stats">' +
        statHtml(st.trained, '/' + st.of, 'Trained', 'Trained in the last 7 days: ' + st.trained + ' of ' + st.of + '. Show who is behind', 'data-lifters="behind"') +
        statHtml(st.prs, '', st.prs === 1 ? 'PR' : 'PRs', plural(st.prs, 'personal record') + ' this week. Show the wins', 'data-wins="1"') +
        unreadStatHtml(st.unread) +
      '</div></div>';
  }
  function unreadStatHtml(n) {
    var u = unreadState();
    var v = u === 'loading' ? '<i class="ca-sk ca-sk-stat" aria-hidden="true"></i>' : u === 'failed' ? '\u2013' : String(n);
    var aria = u === 'loading' ? 'Unread messages loading' : u === 'failed' ? 'Unread messages couldn\u2019t load' : plural(n, 'unread message');
    return '<button type="button" class="ca-stat is-btn" data-go="messages" aria-label="' + esc(aria) + ', open Messages"><b>' + v + '</b><span>Unread</span></button>';
  }
  function statHtml(v, small, label, aria, attr) {
    return '<button type="button" class="ca-stat is-btn" ' + (attr || '') + ' aria-label="' + esc(aria) + '"><b>' + esc(String(v)) + (small ? '<small>' + esc(small) + '</small>' : '') + '</b><span>' + esc(label) + '</span></button>';
  }
  // Needs you: the worst job as one big card with the screen's red, the next two as rows with their fix
  // in graphite, "See all" when there are more. With nobody needing you: what's next (blocks, next weeks).
  function needsHtml(X) {
    var lead = X.lead;
    var title = 'Needs you';
    if (!lead.length) {
      // Planning work (tiers 3-4): nothing urgent, so show what's next, calm, no red.
      var nxt = caLeadJobs(X.jobs, null);
      if (!nxt.length) return '';
      lead = nxt; title = 'Up next';
    }
    var urgent = title === 'Needs you';
    var top = lead[0], rest = lead.slice(1, 3);
    // The hero's headline ("4 need you") is this deck's title: no second title saying it again.
    var shownN = lead.slice(0, 3).reduce(function (n, x) { return n + ((x.rows && x.rows.length) || 1); }, 0);
    var totalN = urgent ? X.need.length : lead.reduce(function (n, x) { return n + ((x.rows && x.rows.length) || 1); }, 0);
    var more = lead.length > 3 || totalN > shownN ? '<button type="button" class="ca-more" data-lifters="' + (urgent ? 'need' : 'all') + '"><span>See all ' + totalN + '</span>' + ic('chev', 2.2) + '</button>' : '';
    var html = '<div class="ca-sec' + (urgent ? ' is-deck' : '') + '" aria-label="' + title + '">' + (urgent ? '' : '<div class="ca-h"><h2>' + title + '</h2></div>');
    html += leadCardHtml(top, urgent);
    if (rest.length || more) html += '<div class="ca-plain ca-rise">' + rest.map(function (x) { return jobRowHtml(x); }).join('') + more + '</div>';
    return html + '</div>';
  }
  // The one big job: open on the page (not a third box), a bigger face, the job as a sentence, the red.
  function leadCardHtml(x, red) {
    var it = x.job, r = x.r, group = it.type === 'meetday' && (it.rows || []).length > 1;
    var t = jobText(it, group ? null : r.athlete.id), f = fixOf(it) || {};
    var it1 = it.type === 'meetday' ? Object.assign({}, it, { r: r }) : it;
    var d = group ? caMeetDayDetail(it) : caFocalDetail(it1, t);
    var names = group ? (it.rows || []).map(function (q) { return first(q.athlete.name); }) : null;
    var who = group ? names.slice(0, 3).join(', ') + (names.length > 3 ? ' +' + (names.length - 3) : '') : r.athlete.name;
    var face = group ? '<span class="ca-stack" aria-hidden="true">' + (it.rows || []).slice(0, 2).map(function (q) { return avHtml(q.athlete); }).join('') + '</span>' : avHtml(r.athlete, 'is-56');
    var sub = '<span class="ca-focal-n">' + esc(who) + '</span>' + (d ? '<span class="ca-focal-d">' + (t.voice && it.type === 'message' ? '<i class="ca-vplay" aria-hidden="true">' + ic('play') + '</i>' : '') + keepDots(esc(d)) + '</span>' : '');
    return '<div class="ca-focal ca-rise tone-' + esc(t.tone) + '" data-job="' + esc(it.key) + '" data-aid="' + esc(r.athlete.id) + '">' +
      '<button type="button" class="ca-focal-main" data-open="' + esc(r.athlete.id) + '" aria-label="' + esc(caFocalTitle(it1) + '. Open ' + r.athlete.name) + '">' + face +
        '<span class="ca-focal-tx"><span class="ca-focal-t">' + esc(caFocalTitle(it1)) + '</span>' + sub + '</span></button>' +
      '<button type="button" class="ca-btn ' + (red ? 'is-red' : 'is-soft') + '" data-fix="' + esc(it.key) + '">' + esc(caFixLabel(it, f)) + '</button></div>';
  }
  function jobRowHtml(x) {
    var it = x.job, r = x.r, t = jobText(it, r.athlete.id), f = fixOf(it) || {};
    var short = CL() && CL().shortLabel ? CL().shortLabel(f) : (f.label || 'Open');
    return '<div class="ca-jrow" data-job="' + esc(it.key) + '" data-aid="' + esc(r.athlete.id) + '">' +
      '<button type="button" class="ca-jrow-main" data-open="' + esc(r.athlete.id) + '">' + avHtml(r.athlete, 'is-40') +
        '<span class="ca-jrow-tx"><span class="ca-jrow-n">' + esc(first(r.athlete.name)) + '</span><span class="ca-jrow-t">' + keepDots(esc((it.type === 'busy' && caBusyLine(it)) || t.short || t.title)) + '</span></span></button>' +
      '<button type="button" class="ca-pill" data-fix="' + esc(it.key) + '" aria-label="' + esc(f.label || short) + '">' + esc(short) + '</button></div>';
  }
  // Your lifters: every face, ringed by this week's sessions, the live dot when they're under the bar.
  function facesHtml(X) {
    var rows = caFaceOrder(X.rows, X.need);
    if (!rows.length) return '';
    var shown = rows.slice(0, 24);
    var faces = shown.map(function (r) {
      var w = X.week(r), live = r.live ? ', training now' : '';
      return '<button type="button" class="ca-fb" data-open="' + esc(r.athlete.id) + '" aria-label="' + esc(r.athlete.name + ': ' + w.text + live) + '">' + faceHtml(r, w, 64) +
        '<span class="ca-fb-n">' + esc(first(r.athlete.name)) + '</span></button>';
    }).join('');
    var more = rows.length > shown.length ? '<button type="button" class="ca-fb is-more" data-lifters="all"><span class="ca-fb-more">+' + (rows.length - shown.length) + '</span><span class="ca-fb-n">More</span></button>' : '';
    return '<div class="ca-sec"><div class="ca-h"><h2>Your lifters</h2><button type="button" class="ca-h-end" data-lifters="all">See all</button></div>' +
      '<div class="ca-faces ca-rise" role="list">' + faces + more + '</div></div>';
  }
  // Everything else, one tap away, each with the one number that says whether to go there today.
  function tilesHtml(X) {
    var s = store(), u = me() || {}, t = todayIso();
    var ids = X.rows.map(function (r) { return r.athlete.id; });
    // Meets: the next one on the roster.
    var next = caNextMeet(X.rows);
    var meetV = next ? (next.days <= 0 ? 'Today' : next.days === 1 ? 'Tomorrow' : 'In ' + next.days + ' days') : 'None planned';
    var meetS = next ? clip(next.name, 22) + ' · ' + next.who.slice(0, 2).join(', ') + (next.who.length > 2 ? ' +' + (next.who.length - 2) : '') : 'Plan one from a lifter';
    // Clients: money owed on the coach's own record.
    var cs = null;
    try { if (window.Clients && Clients.clientsSummary) cs = Clients.clientsSummary(s.clientBilling || [], s.clientPayments || [], t, ids); } catch (e) { cs = null; }
    var money = cs && cs.overdue.n ? (window.Clients && Clients.formatMoney ? Clients.formatMoney(cs.overdue.cents, cs.currency) : String(cs.overdue.cents / 100)) : null;
    var clientsV = money || (cs ? String(cs.active) : '0');
    var clientsS = money ? plural(cs.overdue.n, 'payment') + ' overdue' : (cs && cs.active ? 'All paid up' : 'Packages and payments');
    // Check-ins: answers this week, and anything flagged.
    var qs = (s.checkinQuestions || []).filter(function (q) { return q.coachId === u.id; });
    var ci = caCheckins(qs, s.checkinAnswers || [], X.rows.map(function (r) { return r.athlete; }), t);
    var ciNew = ci.filter(function (x) { return x.answered; }).length, ciFlag = ci.filter(function (x) { return x.alerts.length; }).length;
    var ciV = qs.length ? String(ciNew) : 'Set up';
    var ciS = !qs.length ? 'Questions they answer' : ciFlag ? plural(ciFlag, 'to look at', 'to look at') : 'answered this week';
    // Challenges: running now.
    var chRun = (s.challenges || []).filter(function (c) { return c && c.coachId === u.id && !c.endedAt && (!c.endsOn || String(c.endsOn).slice(0, 10) >= t); }).length;
    var tpls = (s.programTemplates || []).filter(function (x) { return x.coachId === u.id; }).length;
    var tile = function (key, cls, icon, label, value, sub, aria) {
      return '<button type="button" class="ca-tile ' + cls + '" data-sc="' + key + '" aria-label="' + esc(aria || (label + ': ' + value + (sub ? ', ' + sub : ''))) + '">' +
        '<span class="ca-tic">' + ic(icon) + '</span><span class="ca-tl">' + esc(label) + '</span>' +
        (value != null ? '<b class="ca-tv">' + esc(value) + '</b>' : '') + (sub ? '<span class="ca-ts' + (key === 'clients' && money ? ' is-warn' : '') + (key === 'checkins' && ciFlag ? ' is-warn' : '') + '">' + esc(sub) + '</span>' : '') + '</button>';
    };
    return '<div class="ca-sec"><div class="ca-h"><h2>Coaching</h2></div><div class="ca-tiles ca-rise">' +
      tile('meets', 'is-wide t-meet', 'trophy', 'Meets', meetV, meetS) +
      tile('clients', 't-clients', 'wallet', 'Clients', clientsV, clientsS) +
      tile('checkins', 't-checkins', 'clip', 'Check-ins', ciV, ciS) +
      tile('challenges', 'is-small t-club', 'flag', 'Challenges', null, chRun ? chRun + ' running' : 'Start one', 'Challenges: ' + (chRun ? chRun + ' running' : 'none running')) +
      tile('club', 'is-small t-club', 'shield', 'Club', null, 'Feed and board') +
      tile('templates', 'is-small t-tpl', 'copy', 'Templates', null, tpls ? plural(tpls, 'saved', 'saved') : 'None yet') +
      '</div></div>';
  }
  function reportRowHtml(top) {
    var line = '';
    try { var T = window.CoachReportUI && CoachReportUI.model ? CoachReportUI.model() : null; if (T && T.of) line = T.trained + ' of ' + T.of + ' trained' + (T.prs && T.prs.length ? ' · ' + plural(T.prs.length, 'PR') : ''); } catch (e) {}
    if (!window.CoachReportUI) return '';
    return '<button type="button" class="ca-rowcard ca-rise' + (top ? ' is-top' : '') + '" data-sc="report"><span class="ca-tic t-report">' + ic('chart') + '</span>' +
      '<span class="ca-rowcard-tx"><span class="ca-rowcard-t">Last week’s report</span>' + (line ? '<span class="ca-rowcard-s">' + esc(line) + '</span>' : '') + '</span>' + ic('chev', 2.2) + '</button>';
  }
  // A brand-new coach: a real welcome with the invite as the one red, the other two steps as rows, then
  // what Home becomes (the real components, a made-up week, not tappable).
  function welcomeHtml(u) {
    var steps = typeof coachSetupSteps === 'function' ? coachSetupSteps() : [];
    var nm = first(u && u.name);
    var invited = steps[1] && steps[1].done;
    var html = '<div class="ca-home ca-root is-fresh"><div class="ca-hero ca-welcome ca-rise">' +
      '<p class="ca-hero-hi">' + esc(nm ? 'Welcome, ' + nm : 'Welcome') + '</p>' +
      '<h2 class="ca-welcome-t">' + (invited ? 'Your invite is out' : 'Bring in your first lifter') + '</h2>' +
      '<p class="ca-hero-sub">' + (invited ? 'They land here the moment they sign up with your link. Send another any time.' : 'Send them your link. They get the app and land here, with their week and the fix for anything off.') + '</p>' +
      '<button type="button" class="ca-btn is-red" data-sc="invite">' + ic('plus', 2.4) + '<span>' + (invited ? 'Invite another lifter' : 'Invite a lifter') + '</span></button></div>';
    var others = steps.filter(function (x, i) { return i !== 1; });
    if (others.length) {
      html += '<div class="ca-sec"><div class="ca-h"><h2>While you wait</h2></div><div class="ca-list ca-rise">' + others.map(function (x, i) {
        return '<button type="button" class="ca-lrow" data-step="' + (i === 0 ? 0 : 2) + '"><span class="ca-tic ' + (x.done ? 't-done' : 't-step') + '">' + ic(x.done ? 'check' : (i === 0 ? 'copy' : 'user')) + '</span>' +
          '<span class="ca-lrow-tx"><span class="ca-lrow-t">' + esc(x.title) + '</span><span class="ca-lrow-s">' + esc(x.sub) + '</span></span>' + ic('chev', 2.2) + '</button>';
      }).join('') + '</div></div>';
    }
    // The sample: what Needs you looks like once they train.
    var sample = [
      { name: 'Maya Chen', line: 'Bench felt @9, you wrote @8', fix: 'Apply', tone: 'warn' },
      { name: 'Jonah Reed', line: 'Quiet for 9 days', fix: 'Check in', tone: 'quiet' }
    ];
    html += '<div class="ca-sec ca-sample" aria-hidden="true"><div class="ca-h"><h2>Home, once they train</h2><span class="ca-chip-sample">Sample</span></div>' +
      '<div class="ca-list" inert>' + sample.map(function (x) {
        return '<div class="ca-jrow"><span class="ca-jrow-main">' + avHtml({ name: x.name }, 'is-40') + '<span class="ca-jrow-tx"><span class="ca-jrow-n">' + esc(first(x.name)) + '</span><span class="ca-jrow-t">' + esc(x.line) + '</span></span></span><span class="ca-pill">' + esc(x.fix) + '</span></div>';
      }).join('') + '</div></div>';
    return html + '</div>';
  }
  function wireHome(area) {
    if (area._caWired) return;
    area._caWired = true;
    area.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-fix]'))) {
        e.preventDefault();
        var X = area._X; if (!X) return;
        var key = b.getAttribute('data-fix'), it = null;
        (X.jobs || []).some(function (j) { if (j.key === key) { it = j; return true; } return false; });
        if (!it) return;
        var row = b.closest('[data-aid]'), aid = row ? row.getAttribute('data-aid') : null;
        var r = it.r || (it.rows || []).filter(function (x) { return x.athlete.id === aid; })[0] || (it.rows || [])[0];
        runFix(r, fixOf(it), b);
        return;
      }
      if ((b = t.closest('[data-open]'))) { e.preventDefault(); openLifter(b.getAttribute('data-open')); return; }
      if ((b = t.closest('[data-lifters]'))) { e.preventDefault(); openLifters(b.getAttribute('data-lifters')); return; }
      if ((b = t.closest('[data-wins]'))) { e.preventDefault(); openWins(area._X); return; }
      if ((b = t.closest('[data-go]'))) { e.preventDefault(); tab(b.getAttribute('data-go')); return; }
      if ((b = t.closest('[data-sc]'))) { e.preventDefault(); shortcut(b.getAttribute('data-sc'), b); return; }
      if ((b = t.closest('[data-step]'))) {
        e.preventDefault();
        var steps = typeof coachSetupSteps === 'function' ? coachSetupSteps() : [];
        var st = steps[Number(b.getAttribute('data-step'))];
        if (st && st.onClick) st.onClick();
      }
    });
  }
  function shortcut(key, btn) {
    if (key === 'meets') { if (window.MeetDay && MeetDay.openMeetsScreen) MeetDay.openMeetsScreen(); return; }
    if (key === 'clients') { tab('clients'); return; }
    if (key === 'checkins') { openCheckins(); return; }
    if (key === 'challenges') { tab('challenges'); return; }
    if (key === 'club') { tab('club'); return; }
    if (key === 'templates') { tab('templates'); return; }
    if (key === 'report') { if (window.CoachReportUI) CoachReportUI.open(); return; }
    if (key === 'invite') { if (typeof openInviteModal === 'function') openInviteModal(); return; }
    if (key === 'search') { openSearch(); return; }
  }
  function openLifter(id) { if (id && CL() && CL().open) CL().open(id); }
  function openLifters(filter) {
    L.filter = FILTERS.some(function (f) { return f[0] === filter; }) ? filter : 'all';
    L.q = '';
    tab('athletes');
  }
  // The Messages tab's unread count, a small number on its icon (the lifter app's way).
  function paintBadges() {
    if (!hasDom) return;
    var n = 0, m = unreadMap();
    Object.keys(m).forEach(function (k) { n += Math.max(0, Number(m[k]) || 0); });
    var bt = document.querySelector('.bottom-tab[data-src="messages"]');
    if (!bt) return;
    var b = bt.querySelector('.ca-tbadge');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = document.createElement('span'); b.className = 'ca-tbadge'; b.setAttribute('aria-hidden', 'true'); bt.appendChild(b); }
    b.textContent = n > 9 ? '9+' : String(n);
    bt.setAttribute('aria-label', 'Messages, ' + plural(n, 'unread'));
  }

  /* ====================================================================================================
     LIFTERS: the hub
     ==================================================================================================== */
  var L = { filter: 'all', q: '' };
  function renderLifters(area) {
    if (bootState() !== 'ready' && area) { var w0 = document.createElement('div'); area.appendChild(w0); return gate(w0, 'lifters'); }
    var X = model();
    if (!X.rows.length) return false;
    var wrap = document.createElement('div');
    wrap.className = 'ca-hub ca-root';
    var counts = caFilterCounts(X.rows, { need: X.need, week: X.week });
    if (!counts[L.filter]) L.filter = 'all';
    var search = X.rows.length > 6 ? '<label class="ca-search ca-rise">' + ic('search') + '<input class="ca-q" type="search" placeholder="Find a lifter" aria-label="Find a lifter" autocomplete="off" spellcheck="false" value="' + esc(L.q) + '"></label>' : '';
    var chips = '<div class="ca-seg is-hero ca-rise" role="tablist" aria-label="Show">' + FILTERS.map(function (f) {
      var on = L.filter === f[0];
      return '<button type="button" class="ca-seg-b' + (on ? ' on' : '') + '" role="tab" aria-selected="' + on + '" data-filter="' + f[0] + '" aria-label="' + esc(f[1] + ', ' + counts[f[0]]) + '"' + (counts[f[0]] || f[0] === 'all' ? '' : ' disabled') + '><b>' + counts[f[0]] + '</b><span>' + esc(f[1]) + '</span></button>';
    }).join('') + '</div>';
    wrap.innerHTML = chips + search + '<div class="ca-rows-host"></div>';
    area.appendChild(wrap);
    wrap._X = X;
    paintRows(wrap);
    wireHub(wrap);
    try { if (/#lifter=/.test(location.hash)) history.replaceState(null, '', location.pathname + location.search); } catch (e) {}
    return true;
  }
  function paintRows(wrap) {
    var X = wrap._X, host = wrap.querySelector('.ca-rows-host');
    if (!X || !host) return;
    var q = caNorm(L.q);
    var rows = caSortRows(X.rows, X.need).filter(function (r) {
      return caFilterMatch(L.filter, r, { need: X.need, week: X.week }) &&
        (!q || caNorm(r.athlete.name).indexOf(q) >= 0 || caNorm(r.status && r.status.program && r.status.program.name).indexOf(q) >= 0);
    });
    if (!rows.length) {
      host.innerHTML = q ? '<div class="ca-none is-search"><p>No one called \u201c' + esc(String(L.q).trim()) + '\u201d</p><button type="button" class="ca-link" data-clear-q>Clear search</button></div>'
        : '<p class="ca-none">Nobody here right now</p>';
      return;
    }
    var anyN = CL() && CL().clNumber ? rows.some(function (r) { return CL().clNumber(r).tone !== 'none'; }) : false;
    var cap = '<div class="ca-rows-cap"><span>' + esc(plural(rows.length, 'lifter')) + '</span>' + (anyN ? '<span>e1RM total, 4 weeks</span>' : '') + '</div>';
    host.innerHTML = cap + '<div class="ca-plain ca-rows">' + rows.map(function (r, i) { return rowHtml(r, X, i); }).join('') + '</div>';
  }
  function rowHtml(r, X, i) {
    var top = topJob(r, X.jobs), w = X.week(r);
    var line = top && top.type === 'busy' && caBusyLine(top) ? caBusyLine(top) : CL() && CL().clLine ? CL().clLine(r, top && top.tier <= 3 ? top : null) : '';
    var sev = !top || top.tier > NEED_TIER ? '' : top.type === 'pain' ? 'alert' : /^(meetday|weight|overshoot|drift|checkin|readiness|quiet|never|missed|offpace|busy)$/.test(top.type) ? 'watch' : '';
    var n = CL() && CL().clNumber ? CL().clNumber(r) : { text: '', tone: 'none', title: '' };
    return '<button type="button" class="ca-row' + (i < 9 ? ' ca-rise' : '') + '" data-open="' + esc(r.athlete.id) + '">' + faceHtml(r, w, 52) +
      '<span class="ca-row-main"><span class="ca-row-n">' + esc(r.athlete.name) + '</span>' +
        '<span class="ca-row-l' + (sev ? ' sev-' + sev : '') + '">' + (sev ? '<i class="ca-dot" aria-hidden="true"></i>' : '') + '<span>' + keepDots(esc(line)) + '</span></span></span>' +
      (n.tone !== 'none' ? '<span class="ca-row-end t-' + esc(n.tone) + '" title="' + esc(n.title) + '"><b>' + esc(n.text) + '</b><small>' + esc(unit()) + '</small></span>' : '') + '</button>';
  }
  function wireHub(wrap) {
    wrap.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-filter]'))) {
        e.preventDefault();
        L.filter = b.getAttribute('data-filter');
        wrap.querySelectorAll('.ca-seg-b').forEach(function (c) { var on = c === b; c.classList.toggle('on', on); c.setAttribute('aria-selected', String(on)); });
        paintRows(wrap);
        return;
      }
      if ((b = t.closest('[data-clear-q]'))) {
        e.preventDefault();
        var qi = wrap.querySelector('.ca-q');
        L.q = ''; if (qi) { qi.value = ''; qi.focus(); }
        paintRows(wrap);
        return;
      }
      if ((b = t.closest('[data-open]'))) { e.preventDefault(); openLifter(b.getAttribute('data-open')); }
    });
    var q = wrap.querySelector('.ca-q');
    if (q) {
      var tm = null;
      q.addEventListener('input', function () { L.q = q.value; clearTimeout(tm); tm = setTimeout(function () { paintRows(wrap); }, 60); });
      q.addEventListener('keydown', function (e) { if (e.key === 'Escape') { q.value = ''; L.q = ''; paintRows(wrap); q.blur(); } });
    }
  }

  /* ====================================================================================================
     A LIFTER: the contact card, and the rows it opens (Progress, Notes & check-ins, Client & About)
     ==================================================================================================== */
  var P = { id: null, view: 'card', host: null, pending: null };
  var VIEWS = { progress: 'Progress', notes: 'Notes & check-ins', client: 'Client & About' };
  function renderLifter(host, id, view) {
    host = host || (hasDom ? document.getElementById('lifterPage') : null);
    if (!host) return;
    if (id !== P.id && !P.pending) P.view = 'card';
    P.id = id; P.host = host;
    if (view) P.view = view;
    if (gate(host, 'lifter')) return;
    host.removeAttribute('data-ca-state');
    var r = CL() && CL().rowOf ? CL().rowOf(id) : null;
    if (!r) { host.innerHTML = ''; return; }
    var X = model();
    host._X = X; host._r = r;
    host.innerHTML = '<div class="ca-pg ca-root' + (P.view !== 'card' ? ' is-sub' : '') + '">' + (P.view === 'card' ? cardHtml(r, X) : subHtml(r, X, P.view)) + '</div>';
    if (CL() && CL().paint) CL().paint(host);
    if (P.view === 'notes') mountNotes(host.querySelector('[data-notes-host]'), r);
    syncBack(r);
    if (!host._caWired) { host._caWired = true; wireLifter(host); }
  }
  function cardHtml(r, X) {
    var a = r.athlete, st = r.status || {}, prog = st.program, w = X.week(r), top = topJob(r, X.jobs);
    var cls = r.meet && r.meet.meet && r.meet.meet.weightClass ? String(r.meet.meet.weightClass).replace(/\s*kg$/i, '') : (r.bw ? String(r.bw.cls) : null);
    var meta = [prog ? clip(prog.name, 28) + (st.week && st.week.total ? ' · week ' + (st.week.idx + 1) + ' of ' + st.week.total : '') : 'No block yet'];
    if (cls && !caIsMeetSoon(r)) meta.push(cls + ' ' + unit() + ' class');
    var status = caHeadChip(r, top);
    var unread = unreadMap()[a.id] || 0;
    var html = '<header class="ca-ph">' + faceHtml(r, w, 96, { cls: 'is-big' }) +
      '<h2 class="ca-pname">' + esc(a.name) + '</h2><p class="ca-pmeta">' + keepDots(esc(meta.join(' · '))) + '</p>' +
      (status ? '<span class="ca-status s-' + status.tone + '"><i aria-hidden="true"></i>' + keepDots(esc(status.text)) + '</span>' : '') + '</header>';
    // Four actions, like a contact card.
    var act = function (key, icon, label, badge) { return '<button type="button" class="ca-act" data-act="' + key + '">' + ic(icon) + '<span>' + label + '</span>' + (badge ? '<b class="ca-act-n" aria-label="' + esc(plural(badge, 'unread')) + '">' + badge + '</b>' : '') + '</button>'; };
    html += '<div class="ca-acts">' + act('message', 'msg', 'Message', unread) + act('program', 'cal', 'Program') + act('progress', 'chart', 'Progress') + act('client', 'wallet', 'Client') + '</div>';
    // The one flag, with the screen's one red.
    if (top) {
      var jt = jobText(top, a.id), f = fixOf(top) || {};
      var busy = top.type === 'busy' ? (jt.note ? '<span class="ca-flag-q">“' + esc(clip(jt.note, 140)) + '”</span>' : '') + '<button type="button" class="ca-link" data-busy-keep>Keep the week as written</button>' : '';
      var red = top.tier <= NEED_TIER;
      var top1 = top.type === 'meetday' ? Object.assign({}, top, { r: r }) : top, fd = caFocalDetail(top1, jt);
      var said = '';
      if (top.type === 'message') {
        // What they wrote, not a summary of it: the message (or the voice note), then when.
        var body = String((top.reason && top.reason.body) || '').trim(), vm = /(\d+:\d{2})/.exec(String(jt.detail || ''));
        said = jt.voice ? '<span class="ca-flag-voice"><i class="ca-vplay" aria-hidden="true">' + ic('play') + '</i>Voice note' + (vm ? ' \u00b7 ' + esc(vm[1]) : '') + '</span>'
          : body ? '<span class="ca-flag-q">\u201c' + esc(clip(body, 160)) + '\u201d</span>' : '';
        fd = String(jt.title || '').replace(/^Wrote you( · )?/, '');
      }
      html += '<div class="ca-flag tone-' + esc(jt.tone) + '" data-job="' + esc(top.key) + '"><span class="ca-flag-ic">' + ic(jt.icon in IC ? jt.icon : 'eye') + '</span>' +
        '<span class="ca-flag-tx"><b>' + esc(caFocalTitle(top1)) + '</b>' + said + (fd ? '<span>' + keepDots(esc(fd)) + '</span>' : '') + busy + '</span>' +
        '<button type="button" class="ca-btn ' + (red ? 'is-red' : 'is-soft') + '" data-fix="' + esc(top.key) + '">' + esc(caFixLabel(top, f)) + '</button></div>';
    }
    html += overviewHtml(r, w);
    html += rowsHtml(r);
    return html;
  }
  // One overview card: the e1RM total, its change over 4 weeks and a small trend, then this week.
  function overviewHtml(r, w) {
    var D = CL() && CL().clLifter ? CL().clLifter(r) : null;
    var T = D && D.total;
    var days = trainedDays(r.athlete.id);
    var dots = '<span class="ca-days" aria-hidden="true">' + days.map(function (d, i) { return '<i class="' + (d.on ? 'on' : '') + (i === days.length - 1 ? ' today' : '') + '"></i>'; }).join('') + '</span>';
    var weekLine = '<span class="ca-ov-week"><span class="ca-ov-wl">Last 7 days</span>' + dots + '<span class="ca-ov-wn">' + (w.n ? w.k + ' of ' + w.n : plural(w.trained, 'session')) + '</span></span>';
    var head = '<span class="ca-ov-h"><span class="ca-ov-l">e1RM total</span><span class="ca-ov-go">Progress' + ic('chev', 2.4) + '</span></span>';
    if (!T) {
      return '<button type="button" class="ca-ov is-empty" data-view="progress">' + head + '<span class="ca-ov-none">Shows once squat, bench and deadlift are all logged.</span>' + weekLine + '</button>';
    }
    var d = T.delta != null ? Math.round(kgShow(T.delta)) : null;
    var chip = d != null ? '<span class="ca-chg ' + (d > 0 ? 'up' : d < 0 ? 'down' : 'flat') + '">' + (d > 0 ? '+' : d < 0 ? '−' : '') + Math.abs(d) + ' ' + esc(unit()) + ' in 4 weeks</span>' : '';
    return '<button type="button" class="ca-ov" data-view="progress" aria-label="e1RM total ' + Math.round(kgShow(T.value)) + ' ' + esc(unit()) + (d != null ? ', ' + (d >= 0 ? 'up ' : 'down ') + Math.abs(d) + ' in 4 weeks' : '') + '. Open progress">' + head +
      '<span class="ca-ov-num"><b>' + Math.round(kgShow(T.value)) + '</b><small>' + esc(unit()) + '</small>' + chip + '</span>' +
      sparkHtml(T.pts) + weekLine + '</button>';
  }
  // The trend: the total's weekly points as one line with a soft wash and the latest point marked.
  function sparkHtml(pts) {
    var ys = (pts || []).map(function (p) { return Number(kgShow(p.value)) || 0; });
    if (ys.length < 2) return '';
    var W = 320, Hh = 48, pad = 4;
    var lo = Math.min.apply(null, ys), hi = Math.max.apply(null, ys), span = hi - lo || 1;
    var X = function (i) { return pad + i / (ys.length - 1) * (W - pad * 2); };
    var Y = function (v) { return pad + (hi - v) / span * (Hh - pad * 2); };
    var pts2 = ys.map(function (v, i) { return [X(i), Y(v)]; });
    var path = typeof _smoothPath === 'function' ? _smoothPath(pts2) : pts2.map(function (p, i) { return (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1); }).join(' ');
    var lp = pts2[pts2.length - 1];
    return '<span class="ca-spark-w"><svg class="ca-spark" viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none" aria-hidden="true">' +
      '<path class="ca-spark-a" d="' + path + ' L' + lp[0].toFixed(1) + ' ' + Hh + ' L' + pts2[0][0].toFixed(1) + ' ' + Hh + ' Z"/>' +
      '<path class="ca-spark-l" d="' + path + '" vector-effect="non-scaling-stroke"/></svg>' +
      '<span class="ca-spark-dot" style="left:' + (lp[0] / W * 100).toFixed(2) + '%;top:' + (lp[1] / Hh * 100).toFixed(2) + '%"></span></span>';
  }
  // Everything else about them, one tap away.
  function rowsHtml(r) {
    var a = r.athlete, s = store();
    var words = CL() && CL().clWords ? CL().clWords(r) : null;
    var notesN = (s.sessionNotes || []).filter(function (n) { return n.athleteId === a.id && n.note && String(n.note).trim() && !n.coachComment; }).length;
    var notesSub = notesN ? plural(notesN, 'note') + ' waiting' + (words ? ' · “' + clip(words.text, 34) + '”' : '') : words ? '“' + clip(words.text, 44) + '”' : 'Their session notes and check-ins';
    var blk = window.BlockDNA && BlockDNA.linkInfo ? BlockDNA.linkInfo(a.id) : null;
    var car = null;
    try { if (window.Career && Career.careerEvents && Career.careerLine) { var C = Career.careerEvents(a.id, s); if (C.hero.sessions || C.hero.meets) car = Career.careerLine(C); } } catch (e) { car = null; }
    var row = function (key, icon, tint, title, sub) {
      return '<button type="button" class="ca-lrow" data-row="' + key + '"><span class="ca-tic ' + tint + '">' + ic(icon) + '</span><span class="ca-lrow-tx"><span class="ca-lrow-t">' + esc(title) + '</span>' + (sub ? '<span class="ca-lrow-s">' + esc(sub) + '</span>' : '') + '</span>' + ic('chev', 2.2) + '</button>';
    };
    return '<div class="ca-plain ca-rowsx">' +
      row('notes', 'note', 't-msg', 'Notes & check-ins', notesSub) +
      (window.WeeklyNote ? row('weeknote', 'pen', 't-msg', 'Week’s note', 'Drafted from their last 7 days') : '') +
      (blk ? row('blocks', 'blocks', 't-prog', 'Blocks', blk.text) : '') +
      (car != null ? row('career', 'steps', 't-you', 'Career', car) : '') +
      row('everything', 'list', 't-neutral', 'Everything', 'Lifts, check-ins, recovery, meets') +
      '</div>';
  }
  function subHtml(r, X, view) {
    var a = r.athlete, html = '<h2 class="ca-subt">' + esc(VIEWS[view] || '') + '</h2>';
    if (view === 'progress') {
      var D = CL() && CL().clLifter ? CL().clLifter(r) : null;
      var anyLog = D && (D.total || D.lifts.some(function (L2) { return L2.e1 > 0; }) || D.weeks.some(function (x) { return x.done > 0; }) || D.bw.length);
      if (!D || !anyLog) return html + '<div class="ca-empty">' + ic('chart') + '<b>Nothing logged yet</b><p>Once ' + esc(first(a.name)) + ' logs a session, their total, the three lifts, training and bodyweight show here.</p></div>';
      return html + '<div class="ca-charts cl-root cl-pg cl-pg-phone">' + CL().chartsHtml(r, D, { phone: true }) + '</div>';
    }
    if (view === 'client') {
      var c = window.ClientsUI ? ClientsUI.sectionHtml(a.id, { phone: true }) : '';
      return html + (c ? '<div class="ca-client cl-root">' + c + '</div>' : '<div class="ca-empty"><b>Clients is not loaded</b></div>');
    }
    if (view === 'notes') return html + '<div data-notes-host></div>';
    return html;
  }
  // Notes & check-ins: their session notes with your reply (coach.html _feedbackCard), their answers to your
  // check-in questions, and the weekly check-ins, newest first.
  function mountNotes(host, r) {
    if (!host || !hasDom || typeof el !== 'function') return;
    var a = r.athlete, s = store(), u = me() || {};
    host.innerHTML = '';
    var notes = (s.sessionNotes || []).filter(function (n) { return n.athleteId === a.id && n.note && String(n.note).trim(); }).sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });
    var days = (((s.programs || []).find(function (p) { return p.athleteId === a.id; }) || {}).weeks || []).reduce(function (all, w) { return all.concat(w.days || []); }, []);
    var any = false;
    if (notes.length && typeof _feedbackCard === 'function') {
      any = true;
      host.appendChild(el('h3', { class: 'ca-h3' }, 'Session notes'));
      var box = el('div', { class: 'ca-notes' });
      notes.slice(0, 8).forEach(function (n) { box.appendChild(_feedbackCard(a.id, n, days)); });
      host.appendChild(box);
    }
    var qs = typeof checkinQuestionsFor === 'function' ? checkinQuestionsFor((s.checkinQuestions || []).filter(function (q) { return q.coachId === u.id; }), a.id) : [];
    var ciRows = qs.map(function (q) {
      var sm = typeof checkinSummary === 'function' ? checkinSummary(q, s.checkinAnswers, a.id) : null;
      if (!sm || !sm.last) return null;
      return uiRow({ title: q.prompt, sub: typeof checkinSummaryText === 'function' ? checkinSummaryText(q, sm) : '' });
    }).filter(Boolean);
    if (ciRows.length) { any = true; host.appendChild(el('h3', { class: 'ca-h3' }, 'Check-in answers')); host.appendChild(uiList(ciRows)); }
    var weekly = (s.checkins || []).filter(function (c) { return c.athleteId === a.id; }).sort(function (x, y) { return String(y.weekStart).localeCompare(String(x.weekStart)); });
    if (weekly.length) {
      any = true;
      host.appendChild(el('h3', { class: 'ca-h3' }, 'Weekly check-ins'));
      host.appendChild(uiList(weekly.slice(0, 6).map(function (c) {
        return uiRow({ title: 'Week of ' + localDate(c.weekStart, { day: 'numeric', month: 'short' }), sub: [['Sleep', c.sleep], ['Fresh', c.soreness], ['Calm', c.stress], ['Feel', c.feel]].filter(function (x) { return x[1] != null; }).map(function (x) { return x[0] + ' ' + num(x[1]); }).join(' · ') + (c.note ? ' · “' + clip(c.note, 60) + '”' : '') });
      })));
    }
    if (!any) host.appendChild(el('div', { class: 'ca-empty', html: ic('note') + '<b>Nothing yet</b><p>When ' + esc(first(a.name)) + ' leaves a note on a session or answers your check-in, it shows here with a place to reply.</p>' }));
  }
  function wireLifter(host) {
    host.addEventListener('click', function (e) {
      var t = e.target, b, r = host._r, X = host._X;
      if (!r) return;
      var aid = r.athlete.id;
      if ((b = t.closest('[data-fix]'))) {
        e.preventDefault();
        var key = b.getAttribute('data-fix'), it = null;
        ((X && X.jobs) || []).some(function (j) { if (j.key === key) { it = j; return true; } return false; });
        if (it) runFix(it.r || r, fixOf(it), b);
        return;
      }
      if ((b = t.closest('[data-busy-keep]'))) {
        e.preventDefault();
        var tj = topJob(r, X ? X.jobs : []);
        if (tj && tj.type === 'busy' && tj.info && window.BusyWeek) BusyWeek.decline(tj.info.req);
        return;
      }
      if ((b = t.closest('[data-act]'))) {
        e.preventDefault();
        var k = b.getAttribute('data-act');
        if (k === 'message') { if (CL() && CL().message) CL().message(r, ''); else if (typeof openAthleteMessages === 'function') openAthleteMessages(aid, r.athlete.name, ''); }
        else if (k === 'program') { if (typeof openAthleteProgram === 'function') openAthleteProgram(aid); }
        else pushView(k);
        return;
      }
      if ((b = t.closest('[data-view]'))) { e.preventDefault(); pushView(b.getAttribute('data-view')); return; }
      if ((b = t.closest('[data-row]'))) {
        e.preventDefault();
        var row = b.getAttribute('data-row');
        if (row === 'notes') pushView('notes');
        else if (row === 'weeknote' && window.WeeklyNote) WeeklyNote.openSheet(aid, { onSent: function () { renderLifter(host, aid); } });
        else if (row === 'blocks' && window.BlockDNA) BlockDNA.open(aid, { from: b });
        else if (row === 'career' && window.Career) Career.openForCoach(aid, r.athlete);
        else if (row === 'everything' && typeof openAthleteSheet === 'function') openAthleteSheet(aid);
      }
    });
  }
  // A row pushes its view in from the right; back (the bar's "‹ Arjun") comes back to the card.
  function pushView(v) {
    if (!VIEWS[v] || !P.host) return;
    try { history.pushState({ lifter: P.id, view: v }, '', '#lifter=' + P.id + '/' + v); } catch (e) {}
    P.view = v;
    animatePush('push');
    renderLifter(P.host, P.id);
    window.scrollTo(0, 0);
  }
  function popView() {
    if (P.view === 'card' || !P.host) return false;
    P.view = 'card';
    try { history.replaceState({ lifter: P.id }, '', '#lifter=' + P.id); } catch (e) {}
    animatePush('pop');
    renderLifter(P.host, P.id);
    window.scrollTo(0, 0);
    return true;
  }
  function animatePush(dir) {
    if (!hasDom) return;
    var b = document.body;
    b.dataset.nav = '';
    void b.offsetWidth;
    b.dataset.nav = dir;
  }
  // The pane's back link ("‹ Lifters", syncPaneBack) names the card while a row's view is open, and goes
  // back to it first; the docked copy in the bar (coach.html _syncNavBack) follows.
  function syncBack(r) {
    if (!hasDom) return;
    var pane = document.querySelector('section[data-pane="lifter"]');
    var back = pane && pane.querySelector(':scope > .pane-back');
    if (!back) return;
    var span = back.querySelector('span');
    if (!back._caLabel) back._caLabel = span ? span.textContent : '';
    if (span) span.textContent = P.view === 'card' ? back._caLabel : first(r.athlete.name);
    if (typeof _syncNavBack === 'function') { try { _syncNavBack(); } catch (e) {} }
    if (!pane._caBack) {
      pane._caBack = true;
      pane.addEventListener('click', function (e) {
        var bb = e.target.closest && e.target.closest('.pane-back');
        if (!bb || P.view === 'card') return;
        e.preventDefault(); e.stopPropagation();
        popView();
      }, true);
    }
  }

  /* ====================================================================================================
     SHEETS: find anything (Home's search), check-ins
     ==================================================================================================== */
  var SCREENS = [
    ['Clients', 'packages payments money overdue billing', function () { tab('clients'); }],
    ['Meets', 'competition attempts meet day weigh-in', function () { if (window.MeetDay) MeetDay.openMeetsScreen(); }],
    ['Check-ins', 'answers questions readiness', function () { openCheckins(); }],
    ['Check-in questions', 'ask edit questions', function () { if (typeof openCheckinQuestionsSheet === 'function') openCheckinQuestionsSheet(); }],
    ['Challenges', 'competition most sessions prs board', function () { tab('challenges'); }],
    ['Club', 'feed board posts members', function () { tab('club'); }],
    ['Templates', 'saved programs blocks', function () { tab('templates'); }],
    ['Programs', 'builder block week day exercise', function () { tab('program'); }],
    ['Messages', 'chat reply thread inbox', function () { tab('messages'); }],
    ['Last week’s report', 'monday summary weekly', function () { if (window.CoachReportUI) CoachReportUI.open(); }],
    ['Invite a lifter', 'add new code link', function () { if (typeof openInviteModal === 'function') openInviteModal(); }],
    ['Lifter progress', 'charts e1rm trends roster', function () { tab('progress'); }],
    ['Progression rules', 'rules next week loads', function () { tab('rules'); }],
    ['Capacity', 'hours seats time', function () { tab('capacity'); }],
    ['Settings', 'profile notifications units security you account', function () { tab('you'); }]
  ];
  function openSearch() {
    if (typeof uiSheet !== 'function') return;
    uiSheet('', function (sheet, close) {
      var box = el('label', { class: 'ca-search is-sheet' });
      box.innerHTML = ic('search');
      var inp = el('input', { type: 'search', class: 'ca-q', placeholder: 'Lifters, programs, messages', 'aria-label': 'Search lifters, programs, messages and screens', autocomplete: 'off', spellcheck: 'false' });
      box.appendChild(inp);
      sheet.appendChild(box);
      var res = el('div', { class: 'ca-results' });
      sheet.appendChild(res);
      var go = function (fn) { close(); setTimeout(fn, 230); };
      var paint = function () {
        var q = inp.value.trim().toLowerCase(), s = store(), u = me() || {};
        var roster = (s.athletes || []).filter(function (a) { return a.coachId === u.id; });
        var groups = [];
        var lifters = roster.filter(function (a) { return !q || String(a.name).toLowerCase().indexOf(q) >= 0; }).slice(0, q ? 6 : 8);
        if (lifters.length) groups.push(['Lifters', lifters.map(function (a) { return { av: a, title: a.name, run: function () { openLifter(a.id); } }; })]);
        if (q) {
          var progs = (s.programs || []).filter(function (p) { var a = roster.find(function (x) { return x.id === p.athleteId; }); return a && (String(p.name || '').toLowerCase().indexOf(q) >= 0 || String(a.name).toLowerCase().indexOf(q) >= 0); }).slice(0, 4);
          if (progs.length) groups.push(['Programs', progs.map(function (p) { var a = roster.find(function (x) { return x.id === p.athleteId; }); return { icon: 'cal', title: p.name || 'Program', sub: a ? a.name : '', run: function () { if (typeof openAthleteProgram === 'function') openAthleteProgram(p.athleteId); } }; })]);
          var msgs = (s.messages || []).filter(function (m) { return m && m.body && !(m.meta && m.meta.type && m.meta.type !== 'text') && String(m.body).toLowerCase().indexOf(q) >= 0 && roster.some(function (a) { return a.id === m.athleteId; }); })
            .sort(function (x, y) { return String(y.createdAt).localeCompare(String(x.createdAt)); }).slice(0, 4);
          if (msgs.length) groups.push(['Messages', msgs.map(function (m) { var a = roster.find(function (x) { return x.id === m.athleteId; }) || {}; return { icon: 'msg', title: a.name || 'Message', sub: '“' + clip(m.body, 60) + '”', run: function () { if (typeof openAthleteMessages === 'function') openAthleteMessages(a.id, a.name, ''); } }; })]);
        }
        var screens = SCREENS.filter(function (x) { return !q || (x[0] + ' ' + x[1]).toLowerCase().indexOf(q) >= 0; }).slice(0, q ? 5 : 15);
        if (screens.length) groups.push([q ? 'Screens' : 'Go to', screens.map(function (x) { return { icon: 'chev', title: x[0], run: x[2] }; })]);
        res.innerHTML = '';
        if (!groups.length) { res.appendChild(el('p', { class: 'ca-none' }, 'Nothing called “' + inp.value.trim() + '”')); return; }
        groups.forEach(function (g) {
          res.appendChild(el('h3', { class: 'ca-h3' }, g[0]));
          res.appendChild(uiList(g[1].map(function (it) {
            var row = uiRow({ av: it.av ? it.av.name : null, avUrl: it.av && it.av.avatarUrl, lead: it.icon && !it.av ? el('span', { class: 'ca-tic t-neutral', html: ic(it.icon) }) : null, title: it.title, sub: it.sub, chevron: true, onClick: function () { go(it.run); } });
            return row;
          })));
        });
      };
      inp.addEventListener('input', paint);
      paint();
      setTimeout(function () { try { inp.focus(); } catch (e) {} }, 420);
    }, { cls: 'ca-search-sheet' });
  }
  // This week's PRs (Home's PRs number): who, which lifts; a row opens their Progress.
  function openWins(X) {
    if (typeof uiSheet !== 'function') return;
    X = X || model();
    var wins = caWins(X.rows);
    var L0 = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
    uiSheet('This week\u2019s wins', function (sheet, close) {
      if (!wins.length) { sheet.appendChild(el('div', { class: 'ca-empty', html: ic('trophy') + '<b>No PRs yet this week</b><p>Every PR lands here the moment it\u2019s logged.</p>' })); return; }
      sheet.appendChild(uiList(wins.map(function (w) {
        var a = (store().athletes || []).find(function (y) { return y.id === w.id; }) || { name: w.name };
        var sub = w.lifts.length ? w.lifts.map(function (l) { return L0[l] || l; }).join(', ') + ' PR' + (w.lifts.length > 1 ? 's' : '') : '';
        if (w.extra.length) sub = [sub].concat(w.extra).filter(Boolean).join(' \u00b7 ');
        return uiRow({ av: a.name, avUrl: a.avatarUrl, title: a.name, sub: sub, chevron: true,
          onClick: function () { close(); setTimeout(function () { P.pending = 'progress'; P.id = w.id; if (CL() && CL().open) CL().open(w.id); }, 230); } });
      })));
    }, { cls: 'ca-wins-sheet' });
  }
  function openCheckins() {
    if (typeof uiSheet !== 'function') return;
    uiSheet('Check-ins', function (sheet, close) {
      var s = store(), u = me() || {}, t = todayIso();
      var qs = (s.checkinQuestions || []).filter(function (q) { return q.coachId === u.id; });
      var roster = (s.athletes || []).filter(function (a) { return a.coachId === u.id; });
      var list = caCheckins(qs, s.checkinAnswers || [], roster, t);
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, qs.length ? 'The newest answers to your questions, anything worth a look first.' : 'Ask your lifters a few questions each day or week: sleep, soreness, how they feel.'));
      if (list.length) {
        sheet.appendChild(uiList(list.map(function (x) {
          var a = roster.find(function (y) { return y.id === x.id; }) || { name: x.name };
          return uiRow({ av: a.name, avUrl: a.avatarUrl, title: a.name, sub: x.alerts.length ? x.alerts.join(' · ') : 'Answered ' + whenText(x.last), subTone: x.alerts.length ? 'alert' : null, chevron: true,
            onClick: function () { close(); setTimeout(function () { P.pending = 'notes'; P.id = x.id; if (CL() && CL().open) CL().open(x.id); }, 230); } });
        })));
      } else if (qs.length) sheet.appendChild(el('div', { class: 'ca-empty', html: ic('clip') + '<b>No answers yet</b><p>They show here as your lifters fill in their check-in.</p>' }));
      var edit = el('button', { class: 'btn btn-lg btn-block ui-btn-soft ca-sheet-btn', type: 'button' }, qs.length ? 'Edit your questions' : 'Write your questions');
      edit.addEventListener('click', function () { close(); setTimeout(function () { if (typeof openCheckinQuestionsSheet === 'function') openCheckinQuestionsSheet(); }, 230); });
      sheet.appendChild(edit);
    }, { cls: 'ca-ci-sheet' });
  }

  /* ====================================================================================================
     WIRING: refresh after a fix, the thread closing, back from a row's view
     ==================================================================================================== */
  function shown(pane) { var p = hasDom && document.querySelector('[data-pane="' + pane + '"]'); return !!(p && !p.classList.contains('hidden')); }
  // CoachLifters.refresh (after a fix) and renderRoster (an unread count, a plan change) land here.
  function refresh() {
    if (isDeskNow()) return false;
    if (shown('home')) { renderHome(); return true; }
    if (shown('program') && typeof loadProgram === 'function') { loadProgram(); return true; }
    return false;
  }
  function paintHomeIfShown() { if (!isDeskNow() && shown('home')) renderHome(); else paintBadges(); }
  if (hasDom) {
    window.addEventListener('popstate', function () {
      if (!shown('lifter') || !P.host) return;
      var m = /#lifter=([\w-]+)(?:\/(\w+))?/.exec(location.hash || '');
      if (m && m[1] === P.id) { var v = m[2] && VIEWS[m[2]] ? m[2] : 'card'; if (v !== P.view) { P.view = v; animatePush(v === 'card' ? 'pop' : 'push'); renderLifter(P.host, P.id); } }
    });
    // A thread closed (Reply, Message): the unread count and the jobs move; Home and the card redraw.
    var mm = null;
    var watch = function () {
      var m = document.getElementById('messageModal');
      if (!m || mm) return;
      var was = m.classList.contains('open');
      mm = new MutationObserver(function () {
        var now = m.classList.contains('open');
        if (was && !now) setTimeout(function () { if (shown('home')) renderHome(); else if (shown('lifter') && P.host && P.id) renderLifter(P.host, P.id); }, 120);
        was = now;
      });
      mm.observe(m, { attributes: true, attributeFilter: ['class'] });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', watch); else watch();
  }
  // Home's accent: gold (meets and wins), so the screen's one red reads as the action, not as the light.
  try { if (window.SCREEN_ACCENT && !SCREEN_ACCENT.home) SCREEN_ACCENT.home = 'gold'; } catch (e) {}

  window.CoachApp = {
    renderHome: renderHome, renderLifters: renderLifters, renderLifter: renderLifter, refresh: refresh, paintHomeIfShown: paintHomeIfShown,
    openSearch: openSearch, openCheckins: openCheckins, openWins: openWins, openLifters: openLifters, popView: popView, paintBadges: paintBadges,
    lifterView: function () { return P.view; }, enterLifter: function () { P.view = P.pending && VIEWS[P.pending] ? P.pending : 'card'; P.pending = null; },
    skeletonHtml: skeletonHtml, gate: gate, bootFailed: bootFailed, bootState: bootState,
    ringSvg: caRingSvg, week: caWeek, avHtml: avHtml, faceHtml: faceHtml, ic: ic,
    // pure, for tests
    caTodayLine: caTodayLine, caNeedIds: caNeedIds, caLeadJobs: caLeadJobs, caWeek: caWeek, caRingSvg: caRingSvg, caFilterMatch: caFilterMatch,
    caFilterCounts: caFilterCounts, caSortRows: caSortRows, caFaceOrder: caFaceOrder, caStatus: caStatus, caHeadChip: caHeadChip, caBusyLine: caBusyLine, caFixLabel: caFixLabel, caHeroStats: caHeroStats, caHeadline: caHeadline,
    caCheckins: caCheckins, caNextMeet: caNextMeet, caNorm: caNorm, caFocalTitle: caFocalTitle, caFocalDetail: caFocalDetail, caWins: caWins, caIsBehind: caIsBehind, caIsMeetSoon: caIsMeetSoon, NEED_TIER: NEED_TIER
  };
})();
