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
  // Meet week: the meet is today or inside the next 7 days. The taper is short by design, so a lifter in it is
  // never "behind" (a coach would never call Tom behind on the morning of his meet).
  function caIsMeetWeek(r) { return !!(r && r.meet && r.meet.days != null && r.meet.days >= 0 && r.meet.days <= 7); }
  function caIsBehind(r, w) {
    if (caIsMeetWeek(r)) return false;
    if (w && w.behind) return true;
    return (r.reasons || []).some(function (x) { return x && (x.type === 'quiet' || x.type === 'missed' || x.type === 'never'); });
  }
  // Why a lifter is behind, in the coach's words, for their row under the Behind filter: the sessions short in the
  // last 7 days, or the quiet / missed / never-logged flag behind it. '' when they aren't behind.
  function caBehindLine(r, w) {
    if (!caIsBehind(r, w)) return '';
    if (w && w.n && w.trained < w.n) return w.trained + ' of ' + plural(w.n, 'session') + ' in the last 7 days';
    var q = (r.reasons || []).filter(function (x) { return x && /^(quiet|missed|never)$/.test(x.type); })[0];
    if (!q) return '';
    if (q.type === 'never') return 'No sets logged yet';
    if (q.type === 'quiet') return r.status && r.status.ago != null ? 'Nothing logged for ' + plural(r.status.ago, 'day') : 'Quiet';
    return q.detail || q.text || '';
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
  // The dot before a row's line: coral for pain, amber for what to watch; none for a message, a note or a
  // planning job (the words say it). top: their worst open job.
  function caSev(top) {
    if (!top || top.tier > NEED_TIER) return '';
    if (top.type === 'pain') return 'alert';
    return /^(meetday|weight|overshoot|drift|checkin|readiness|quiet|never|missed|offpace|busy)$/.test(top.type) ? 'watch' : '';
  }
  // Plates (coach-app.css .pf-*): the plate family a job reads in. Pain is the 25's red; the meet, making
  // weight and the cut the 15's yellow (gold); their words waiting the Messages green; effort over, readiness,
  // going quiet and a busy week the felt scale's amber; planning (blocks, next weeks) steel. it: a job.
  function caJobFamily(it) {
    var t = it && it.type;
    if (!t) return '';
    if (t === 'pain') return 'alert';
    if (/^(meet|meetday|weight|offpace)$/.test(t)) return 'meet';
    if (/^(message|note|formcheck)$/.test(t)) return 'msg';
    if (/^(overshoot|drift|checkin|readiness|quiet|never|missed|busy)$/.test(t)) return 'watch';
    return 'steel';
  }
  // A lifter's family, worn as the lip round their face and the light on their page: what needs you this week
  // when it's pain, a watch or the meet (the triage order), else a meet inside 8 weeks (peaking), else under
  // the bar now, else '' (on plan: ink). Their words waiting don't colour the lifter; the flag says them.
  function caFamily(r, top) {
    if (!r) return '';
    var need = top && !top.done && top.tier <= NEED_TIER ? caJobFamily(top) : '';
    if (need === 'alert' || need === 'watch' || need === 'meet') return need;
    if (caIsMeetSoon(r)) return 'meet';
    if (r.live) return 'live';
    return '';
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

  /* ---------------------------------------------------------------- HOME's summary: the maths (pure)
     Every number on Home comes from the app's own maths: coach-report.js teamWeek (sessions), app.js
     getE1RMMomentum (strength), the written-against-felt rule of coach-lifters.js clTeam and app.js
     setOvershoot (effort), app.js deskNextMeet (meets) and deskWins (PRs). These only gather and count. */
  var LIFTS3 = ['squat', 'bench', 'deadlift'];
  var DAY1 = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  var DAYW = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  function caMonday(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00Z'); return addDays(iso, -((d.getUTCDay() + 6) % 7)); }
  // This week, Monday to Sunday: who logged on each day. A session is a lifter's training day (coach-report.js
  // counts them the same way), so the strip adds up to the sessions logged. logs: [{ athleteId, date }];
  // ids: the roster. → [{ iso, dow (Monday 0), n, who: [ids], today, future }]
  function caDayStrip(logs, ids, today) {
    var t = String(today).slice(0, 10), mon = caMonday(t), mine = {}, at = {}, days = [];
    (ids || []).forEach(function (id) { mine[id] = 1; });
    for (var i = 0; i < 7; i++) { var iso = addDays(mon, i); at[iso] = i; days.push({ iso: iso, dow: i, n: 0, who: [], today: iso === t, future: iso > t }); }
    (logs || []).forEach(function (l) {
      if (!l || !mine[l.athleteId]) return;
      var k = String(l.date || '').slice(0, 10), j = at[k];
      if (j == null || k > t) return;
      if (days[j].who.indexOf(l.athleteId) < 0) { days[j].who.push(l.athleteId); days[j].n++; }
    });
    return days;
  }
  // One lifter's e1RM total at the end of each of the last n weeks (weeks start on Monday, oldest first): each
  // main lift's best so far (logs before the window count), summed once all three have one, the rule of app.js
  // deskTotalTrend, so a squat-only first week never reads as a jump. logs: [{ lift, date, e1rmComp }].
  // → [n values], null before the lifter has all three.
  function caTotalSeries(logs, today, n) {
    n = n || 8;
    var t = String(today).slice(0, 10), first = addDays(caMonday(t), -7 * (n - 1)), best = { squat: 0, bench: 0, deadlift: 0 };
    var ls = (logs || []).filter(function (l) { return l && LIFTS3.indexOf(l.lift) >= 0 && Number(l.e1rmComp) > 0 && l.date && String(l.date).slice(0, 10) <= t; })
      .map(function (l) { return { lift: l.lift, date: String(l.date).slice(0, 10), v: Number(l.e1rmComp) }; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var out = [], i = 0;
    for (var w = 0; w < n; w++) {
      var end = addDays(first, 7 * (w + 1));
      while (i < ls.length && ls[i].date < end) { if (ls[i].v > best[ls[i].lift]) best[ls[i].lift] = ls[i].v; i++; }
      out.push(best.squat > 0 && best.bench > 0 && best.deadlift > 0 ? best.squat + best.bench + best.deadlift : null);
    }
    return out;
  }
  // Is the team getting stronger? Each lifter's last 4 weeks against the 4 before them, per main lift (app.js
  // getE1RMMomentum: the best e1RM of each window), summed over the lifters who have both windows. The total
  // is the three lifts' sums together, so it always sits between them. list: [{ id, name, m: momentum }].
  // → { lifts: { squat: { now, before, kg, pct, n } … }, total: { now, before, kg, pct, n },
  //     movers: [{ id, name, kg, pct }] most first, stalled: [{ id, name, kg }], none: [{ id, name }] }
  function caTeamStrength(list) {
    var lifts = {}, total = { now: 0, before: 0, kg: 0, pct: null, n: 0 }, movers = [], stalled = [], none = [];
    LIFTS3.forEach(function (L) { lifts[L] = { now: 0, before: 0, kg: 0, pct: null, n: 0 }; });
    (list || []).forEach(function (x) {
      if (!x) return;
      var per = (x.m && x.m.perLift) || {}, now = 0, before = 0, k = 0;
      LIFTS3.forEach(function (L) {
        var p = per[L];
        if (!p || p.delta == null || !(Number(p.prior) > 0) || !(Number(p.recent) > 0)) return;
        lifts[L].now += Number(p.recent); lifts[L].before += Number(p.prior); lifts[L].n++;
        now += Number(p.recent); before += Number(p.prior); k++;
      });
      if (!k) { none.push({ id: x.id, name: x.name }); return; }
      total.now += now; total.before += before; total.n++;
      movers.push({ id: x.id, name: x.name, kg: now - before, pct: (now - before) / before * 100 });
      if (x.m.stalling) stalled.push({ id: x.id, name: x.name, kg: now - before });
    });
    LIFTS3.concat(['total']).forEach(function (L) {
      var o = L === 'total' ? total : lifts[L];
      o.kg = o.now - o.before; o.pct = o.before > 0 ? o.kg / o.before * 100 : null;
    });
    movers.sort(function (a, b) { return b.pct - a.pct || String(a.name).localeCompare(String(b.name)); });
    return { lifts: lifts, total: total, movers: movers, stalled: stalled, none: none };
  }
  // The team's line: the lifters' totals (caTotalSeries) summed, for the weeks they all have one. It starts at
  // the first week that two thirds of the lifters with a total now already had one, and follows only them, so
  // a lifter joining later never reads as a jump. list: [{ id, series }]. → { start, values: [null… sums], ids } | null
  function caTeamLine(list) {
    var withNow = (list || []).filter(function (x) { return x && x.series && x.series.length && x.series[x.series.length - 1] != null; });
    if (!withNow.length) return null;
    var n = withNow[0].series.length, need = Math.max(1, Math.ceil(withNow.length * 2 / 3));
    for (var s = 0; s < n - 1; s++) {
      var who = withNow.filter(function (x) { return x.series[s] != null; });
      if (who.length < need) continue;
      var vals = [];
      for (var w = 0; w < n; w++) vals.push(w < s ? null : who.reduce(function (sum, x) { return sum + (x.series[w] || 0); }, 0));
      return { start: s, values: vals, ids: who.map(function (x) { return x.id; }) };
    }
    return null;
  }
  // Felt against written for one logged set, the lifter page's rule: on target within 0.5 RPE of what was written
  // (a range counts from its low end to its top), harder more than 0.5 over the top, easier more than 0.5 under the
  // low end. RPE moves in half points, so harder is a full point over: app.js setOvershoot's line, the one the
  // triage flags. RIR blocks and meet attempts aren't RPE sets. → { kind, over, felt, wrote } | null
  var HALF = 0.5 + 1e-9;
  function caEffortOf(s) {
    if (!s || s.attempt || s.rir) return null;
    if (s.actualRpe == null || s.actualRpe === '' || s.rpe == null || s.rpe === '') return null;
    var felt = Number(s.actualRpe), lo = Number(s.rpe);
    if (!isFinite(felt) || !isFinite(lo)) return null;
    var hi = s.rpeHi != null && s.rpeHi !== '' && Number(s.rpeHi) > lo ? Number(s.rpeHi) : lo;
    var over = felt - hi, under = lo - felt;
    return { kind: over > HALF ? 'harder' : under > HALF ? 'easier' : 'on', over: over, felt: felt, wrote: hi };
  }
  // The team's logged sets split three ways, and who is running hot by the triage's own rule (app.js deskReasons):
  // a set a full point or more over what was written, or their sets drifting half a point over on average across 3
  // or more (deskRpeDrift, rounded the same way). One set half a point over is noise, and stays on target.
  // sets: [{ id, name, set, title, date }]. → { easier, on, harder, over1, total,
  //   hot: [{ id, name, n (sets harder), why: 'over' | 'drift', avg, count, worst }] worst first }
  function caEffortSplit(sets) {
    var out = { easier: 0, on: 0, harder: 0, over1: 0, total: 0, hot: [], hard: [] }, by = {};
    (sets || []).forEach(function (x) {
      var e = x && caEffortOf(x.set);
      if (!e) return;
      out.total++; out[e.kind]++;
      if (e.over >= 1) out.over1++;
      if (e.kind === 'harder') out.hard.push({ id: x.id, name: x.name, title: x.title || '', felt: e.felt, wrote: e.wrote, over: e.over, date: x.date || '' });
      var h = by[x.id] || (by[x.id] = { id: x.id, name: x.name, n: 0, sum: 0, count: 0, worst: null });
      h.count++; h.sum += e.over;
      if (e.kind === 'harder') h.n++;
      if (!h.worst || e.over > h.worst.over || (e.over === h.worst.over && String(x.date) > String(h.worst.date))) h.worst = { over: e.over, felt: e.felt, wrote: e.wrote, title: x.title || '', date: x.date || '' };
    });
    out.hot = Object.keys(by).map(function (k) {
      var h = by[k], avg = Math.round(h.sum / h.count * 10) / 10;
      var why = h.worst && h.worst.over >= 1 ? 'over' : (h.count >= 3 && avg >= 0.5 ? 'drift' : '');
      return why ? { id: h.id, name: h.name, n: h.n, why: why, avg: avg, count: h.count, worst: h.worst } : null;
    }).filter(Boolean).sort(function (a, b) { return b.worst.over - a.worst.over || b.avg - a.avg || String(a.name).localeCompare(String(b.name)); });
    out.hard.sort(function (a, b) { return b.over - a.over || String(b.date).localeCompare(String(a.date)); });
    return out;
  }
  // Is the team getting stronger, week by week, on the headline's own measure? For each of the last n weeks, the
  // best e1RM of each lifter's lift in the window of win days ending that week (app.js getE1RMMomentum's windows,
  // slid back a week at a time), summed over the pairs the headline counts: the lifter-and-lift pairs with a
  // number in both the last window and the one before it. So the line's last point is the headline's "now" and the
  // point a window back is its "before", and the change the line shows is the change the number says.
  // A week with no log for a pair keeps that pair's last best (it never dips because a lift wasn't trained).
  // list: [{ id, logs: [{ lift, date, e1rmComp }] }]; now: ms. → { values: [n sums], now, before, pct, pairs } | null
  function caStrengthSeries(list, now, n, win) {
    n = n || 8; win = win || 28;
    var D = 86400000, back = Math.round(win / 7);
    if (back >= n) return null;
    var pairs = [];
    (list || []).forEach(function (x) {
      if (!x) return;
      LIFTS3.forEach(function (L) {
        var ls = (x.logs || []).filter(function (l) { return l && l.lift === L && Number(l.e1rmComp) > 0 && l.date; })
          .map(function (l) { return { t: Date.parse(l.date), v: Number(l.e1rmComp) }; }).filter(function (l) { return isFinite(l.t); });
        // The window that ends o weeks ago (the newest one runs a day past now, as getE1RMMomentum's does).
        var best = function (o) {
          var to = now - o * 7 * D + (o === 0 ? D : 0), from = now - o * 7 * D - win * D;
          return ls.reduce(function (m, l) { return l.t >= from && l.t < to && l.v > m ? l.v : m; }, 0);
        };
        var vals = [];
        for (var o = n - 1; o >= 0; o--) vals.push(best(o));
        if (!(vals[n - 1] > 0) || !(vals[n - 1 - back] > 0)) return;
        var firstSeen = -1;
        for (var i = 0; i < n; i++) { if (vals[i] > 0) { if (firstSeen < 0) firstSeen = i; } else if (firstSeen >= 0) vals[i] = vals[i - 1]; }
        for (var j = 0; j < firstSeen; j++) vals[j] = vals[firstSeen];
        pairs.push({ id: x.id, lift: L, vals: vals });
      });
    });
    if (!pairs.length) return null;
    var values = [];
    for (var k = 0; k < n; k++) values.push(pairs.reduce(function (s, p) { return s + p.vals[k]; }, 0));
    var nowV = values[n - 1], before = values[n - 1 - back];
    return { values: values, now: nowV, before: before, pct: before > 0 ? (nowV - before) / before * 100 : null, pairs: pairs.length, back: back };
  }
  // The next 12 weeks of meets: one mark per lifter at their next meet (rows' meet, app.js deskNextMeet), nearest
  // first, x across the span (0 today, 1 at its end). → { span, next: { days, name, ids }, marks: [{ id, name, days, x, meet }] }
  function caMeetLane(rows, span) {
    span = span || 84;
    var marks = [];
    (rows || []).forEach(function (r) {
      var m = r && r.meet;
      if (!m || m.days == null || m.days < 0 || m.days > span || !r.athlete) return;
      marks.push({ id: r.athlete.id, name: r.athlete.name, days: m.days, x: m.days / span, meet: String((m.meet && m.meet.name) || 'Meet').trim() || 'Meet' });
    });
    marks.sort(function (a, b) { return a.days - b.days || String(a.name).localeCompare(String(b.name)); });
    var f = marks[0], next = f ? { days: f.days, name: f.meet, ids: marks.filter(function (x) { return x.days === f.days && x.meet === f.meet; }).map(function (x) { return x.id; }) } : null;
    return { span: span, next: next, marks: marks };
  }
  // The lane's stops: one per meet (its name and date), with everyone going to it, nearest first. A crowded meet is
  // one face with "+N", never a face for each lifter piled on one date. marks: caMeetLane's. → [{ key, days, x, meet, ids }]
  function caLaneGroups(marks) {
    var by = {}, out = [];
    (marks || []).forEach(function (m) {
      var k = String(m.meet || 'Meet').trim().toLowerCase() + '|' + m.days;
      if (!by[k]) { by[k] = { key: k, days: m.days, x: m.x, meet: m.meet, ids: [] }; out.push(by[k]); }
      by[k].ids.push(m.id);
    });
    return out.sort(function (a, b) { return a.days - b.days || String(a.meet).localeCompare(String(b.meet)); });
  }
  // The countdown Home sets big: the nearest meet, unless Needs you above already leads with it (Tom's meet today
  // is the focal job), then the one after it, so the page never says the same meet twice in big type.
  // groups: caLaneGroups'; skip: ids the focal job is about. → { days, meet, ids, after: group | null, skipped } | null
  function caCountdown(groups, skip) {
    skip = skip || [];
    var gs = groups || [];
    var said = function (g) { return g.ids.every(function (id) { return skip.indexOf(id) >= 0; }); };
    var i = 0;
    while (i < gs.length && said(gs[i])) i++;
    if (i >= gs.length) i = 0;
    var g = gs[i];
    if (!g) return null;
    return { days: g.days, meet: g.meet, ids: g.ids, after: gs[i + 1] || null, skipped: i > 0 ? gs.slice(0, i) : [] };
  }
  // Faces that would overlap on the lane step up a tier; past the last tier they fold into the face before them
  // ("+1"). xs: positions in px, nearest first; gap: a face's width. → [tier, or -1 when folded]
  function caLaneTiers(xs, gap, tiers) {
    tiers = tiers || 2;
    var last = [], out = [];
    for (var t = 0; t < tiers; t++) last.push(-Infinity);
    (xs || []).forEach(function (x) {
      var k = -1;
      for (var t2 = 0; t2 < tiers; t2++) if (x - last[t2] >= gap) { k = t2; break; }
      if (k >= 0) last[k] = x;
      out.push(k);
    });
    return out;
  }
  // A signed percentage the way a coach says it: "+3.1%", "−0.4%", "0%" (one decimal under 10, none over).
  function caPct(p) {
    if (p == null || !isFinite(p)) return '';
    var a = Math.abs(p), r = a >= 10 ? String(Math.round(a)) : (Math.round(a * 10) / 10).toFixed(1);
    if (Number(r) === 0) return '0%';
    return (p > 0 ? '+' : '−') + r + '%';
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
  // A face in its week ring. opts.fam: the lifter's plate family (caFamily), worn by the ring.
  function faceHtml(r, w, size, opts) {
    opts = opts || {};
    var a = r.athlete;
    return '<span class="ca-face is-f' + size + (opts.cls ? ' ' + opts.cls : '') + (opts.fam ? ' pf-' + opts.fam : '') + '" style="--fs:' + size + 'px" data-face="' + esc(a.id) + '">' + caRingSvg(w, size, opts.sw || (size >= 80 ? 3.5 : 3)) + avHtml(a) +
      (r.live ? '<i class="ca-live" title="Training now"></i>' : '') + '</span>';
  }
  function famOf(r, X) { return caFamily(r, topJob(r, X.jobs)); }

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
      // Home's own shape: the week's hero (its line, the ring, the words, the days), the two tiles, who needs you.
      body = '<div class="ca-sk-tw">' + sk('ca-sk-line', '58%') + '<div class="ca-sk-twb">' + sk('ca-sk-ring') + '<span class="ca-sk-tx">' + sk('ca-sk-t', '82%') + sk('ca-sk-line', '56%') +
          '<span class="ca-sk-cols">' + times(7, function () { return sk('ca-sk-col'); }) + '</span></span></div></div>' +
        '<div class="ca-sk-duo">' + times(2, function () { return '<span class="ca-sk-t2">' + sk('ca-sk-line', '46%') + sk('ca-sk-num2', '58%') + sk('ca-sk-line', '40%') + sk('ca-sk-spark') + '</span>'; }) + '</div>' +
        '<div class="ca-sk-need">' + sk('ca-sk-t', '38%') + '</div>' +
        '<div class="ca-sk-focal">' + sk('ca-sk-av is-56') + '<span class="ca-sk-tx">' + sk('ca-sk-t', '78%') + sk('ca-sk-line', '52%') + '</span></div>' + sk('ca-sk-btn');
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
    var S = summaryModel(X);
    X.S = S;
    // The week fills on the first look of a visit. The boot can draw Home twice in one task, so every draw before
    // that task ends counts as the first look; a later redraw (an unread count arriving) shows it filled.
    if (H.burst == null) { H.burst = true; setTimeout(function () { H.burst = false; }, 0); }
    var firstLook = H.burst === true;
    // THE FIRST SCREEN IS THE TEAM (lead, 28 Oct 16:40): the week as the lit hero, strength and effort as two
    // pictures, then who needs you with the one red action, all above the tab bar on a 393 x 852 phone. On a short
    // screen (an SE, 667 tall) the job comes straight after the week, so the red is never below the fold; the two
    // trends follow it. Then the next jobs, the meets, the PRs, the roster, everything else.
    var short = hasDom && window.innerHeight && window.innerHeight < SHORT_H;
    H.short = !!short;
    var html = '<div class="ca-home ca-root' + (firstLook ? ' is-first' : '') + (short ? ' is-short' : '') + '">';
    html += teamWeekHtml(X, S);
    if (!short) html += duoHtml(X, S);
    html += needsHtml(X);
    if (short) html += duoHtml(X, S);
    html += meetsHtml(X, S);
    html += prsHtml(X, S);
    html += facesHtml(X);
    html += tilesHtml(X);
    html += reportRowHtml(0);
    html += '</div>';
    area.innerHTML = html;
    area._X = X;
    wireHome(area);
    var i = 0;
    area.querySelectorAll('.ca-rise').forEach(function (n) { n.style.setProperty('--i', String(Math.min(i++, 8))); });
    layoutLane(area);
    wireStrip(area);
    paintBadges();
  }
  // Below this height the first screen can't hold the week, both trends and the job: the job goes second.
  var SHORT_H = 720;
  if (hasDom && window.matchMedia) {
    try {
      var mqShort = window.matchMedia('(max-height: ' + (SHORT_H - 1) + 'px)');
      var onShort = function () { if (H.host && !isDeskNow() && (window.innerHeight < SHORT_H) !== H.short && shown('home')) renderHome(H.host); };
      if (mqShort.addEventListener) mqShort.addEventListener('change', onShort); else if (mqShort.addListener) mqShort.addListener(onShort);
    } catch (e) {}
  }
  // Needs you's head: how many need you, and their words waiting (the unread count, one tap to Messages).
  function heroHtml(X) {
    var st = caHeroStats(X.rows, { daysOf: trainedDays, unread: unreadMap() });
    var hl = caHeadline(X.need.length);
    var head = hl.n ? '<b class="ca-big">' + hl.n + '</b><span class="ca-big-w">' + hl.words + '</span>'
      : '<span class="ca-big-ok" aria-hidden="true">' + ic('check', 2.6) + '</span><span class="ca-big-w is-clear">All clear</span>';
    // All clear: say what's below only when something is (the next weeks and blocks to write).
    var sub = hl.n ? '' : '<p class="ca-hero-sub">' + (caLeadJobs(X.jobs, null).length ? 'Nobody needs you this week. Next weeks and blocks are below.' : 'Nobody needs you this week. Everyone is on plan.') + '</p>';
    return '<div class="ca-hero ca-rise"><div class="ca-hero-head">' + head +
      '<div class="ca-stats is-inbox">' + unreadStatHtml(st.unread) + '</div></div>' + sub + '</div>';
  }
  function unreadStatHtml(n) {
    var u = unreadState();
    var v = u === 'loading' ? '<i class="ca-sk ca-sk-stat" aria-hidden="true"></i>' : u === 'failed' ? '\u2013' : String(n);
    var aria = u === 'loading' ? 'Unread messages loading' : u === 'failed' ? 'Unread messages couldn\u2019t load' : plural(n, 'unread message');
    return '<button type="button" class="ca-stat is-btn' + (u === 'ready' && !n ? ' is-zero' : '') + '" data-go="messages" aria-label="' + esc(aria) + ', open Messages">' + ic('msg', 2.1) + '<b>' + v + '</b><span>unread</span></button>';
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
      if (!nxt.length) return '<div class="ca-sec is-deck ca-need" aria-label="Needs you">' + heroHtml(X) + '</div>';
      lead = nxt; title = 'Up next';
    }
    var urgent = title === 'Needs you';
    var top = lead[0], rest = lead.slice(1, 3);
    // Its head ("4 need you", the .ca-hero) is this deck's title: no second title saying it again.
    var shownN = lead.slice(0, 3).reduce(function (n, x) { return n + ((x.rows && x.rows.length) || 1); }, 0);
    var totalN = urgent ? X.need.length : lead.reduce(function (n, x) { return n + ((x.rows && x.rows.length) || 1); }, 0);
    var more = lead.length > 3 || totalN > shownN ? '<button type="button" class="ca-more" data-lifters="' + (urgent ? 'need' : 'all') + '"><span>See all ' + totalN + '</span>' + ic('chev', 2.2) + '</button>' : '';
    var html = '<div class="ca-sec is-deck ca-need" aria-label="' + title + '">' + heroHtml(X) + (urgent ? '' : '<div class="ca-h"><h2>' + title + '</h2></div>');
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
    // The face wears its lip in the job's family (the card's --pf), like every face on Home.
    var face = group ? '<span class="ca-stack" aria-hidden="true">' + (it.rows || []).slice(0, 2).map(function (q) { return avHtml(q.athlete); }).join('') + '</span>' : avHtml(r.athlete, 'is-56 pl-lip');
    var sub = '<span class="ca-focal-n">' + esc(who) + '</span>' + (d ? '<span class="ca-focal-d">' + (t.voice && it.type === 'message' ? '<i class="ca-vplay" aria-hidden="true">' + ic('play') + '</i>' : '') + keepDots(esc(d)) + '</span>' : '');
    return '<div class="ca-focal ca-rise tone-' + esc(t.tone) + '" data-job="' + esc(it.key) + '" data-aid="' + esc(r.athlete.id) + '">' +
      '<button type="button" class="ca-focal-main" data-open="' + esc(r.athlete.id) + '" aria-label="' + esc(caFocalTitle(it1) + '. Open ' + r.athlete.name) + '">' + face +
        '<span class="ca-focal-tx"><span class="ca-focal-t">' + esc(caFocalTitle(it1)) + '</span>' + sub + '</span></button>' +
      '<button type="button" class="ca-btn ' + (red ? 'is-red' : 'is-soft') + '" data-fix="' + esc(it.key) + '">' + esc(caFixLabel(it, f)) + '</button></div>';
  }
  function jobRowHtml(x) {
    var it = x.job, r = x.r, t = jobText(it, r.athlete.id), f = fixOf(it) || {};
    var short = CL() && CL().shortLabel ? CL().shortLabel(f) : (f.label || 'Open');
    var fam = caJobFamily(it);
    return '<div class="ca-jrow" data-job="' + esc(it.key) + '" data-aid="' + esc(r.athlete.id) + '">' +
      '<button type="button" class="ca-jrow-main" data-open="' + esc(r.athlete.id) + '">' + avHtml(r.athlete, 'is-40' + (fam && fam !== 'steel' ? ' pl-lip pf-' + fam : '')) +
        '<span class="ca-jrow-tx"><span class="ca-jrow-n">' + esc(first(r.athlete.name)) + '</span><span class="ca-jrow-t">' + keepDots(esc((it.type === 'busy' && caBusyLine(it)) || t.short || t.title)) + '</span></span></button>' +
      '<button type="button" class="ca-pill" data-fix="' + esc(it.key) + '" aria-label="' + esc(f.label || short) + '">' + esc(short) + '</button></div>';
  }
  /* ====================================================================================================
     HOME'S SUMMARY: this week, strength, effort, meets, PRs. One picture each, its words and numbers beside
     it, a tap on every mark. The facts come from the maths above; nothing here invents a number.
     ==================================================================================================== */
  function summaryModel(X) {
    var s = store(), u = me() || {}, t = todayIso();
    var ids = X.rows.map(function (r) { return r.athlete.id; });
    var logsBy = {};
    ids.forEach(function (id) { logsBy[id] = []; });
    (s.workoutLogs || []).forEach(function (l) { if (l && logsBy[l.athleteId]) logsBy[l.athleteId].push(l); });
    // This week (coach-report.js, the Monday report's own maths): Monday to today against the week's plan.
    var CR = typeof window !== 'undefined' ? window.CoachReport : null, W = null, LW = null, lastStrip = null, range = '';
    if (CR && CR.teamWeek && CR.fromStore) {
      var win = CR.weekSoFar(t);
      W = CR.teamWeek(CR.fromStore(s, u.id, win), win);
      range = CR.rangeLabel(win.from, CR.addDays(win.from, 6));
    }
    var strip = caDayStrip(s.workoutLogs, ids, t);
    // A quiet week (nothing logged since Monday) shows last week, labelled, never an empty picture.
    var quiet = !!W && !(W.sessionsDone > 0) && !strip.some(function (d) { return d.n > 0; });
    if (quiet && CR) {
      var lw = CR.lastWeek(t); LW = CR.teamWeek(CR.fromStore(s, u.id, lw), lw);
      lastStrip = caDayStrip(s.workoutLogs, ids, lw.to).map(function (d) { d.today = false; return d; });
    }
    // Behind: the Lifters tab's own Behind (caIsBehind), so the words and the list a tap opens agree.
    var behind = X.rows.filter(function (r) { return caIsBehind(r, X.week(r)); });
    // Strength: app.js getE1RMMomentum over 4-week windows (the headline and each lift), and the line on the same
    // measure, its windows slid back a week at a time, so its last 4 weeks rise by exactly the headline.
    var mom = typeof getE1RMMomentum === 'function' ? X.rows.map(function (r) { return { id: r.athlete.id, name: r.athlete.name, m: getE1RMMomentum(r.athlete.id, 28) }; }) : [];
    var ser = caStrengthSeries(X.rows.map(function (r) { return { id: r.athlete.id, logs: logsBy[r.athlete.id] }; }), Date.now(), 8, 28);
    var line = ser ? { start: 0, values: ser.values, back: ser.back } : null;
    // Effort: every set logged in the last 7 days against the RPE written for it.
    var since = addDays(t, -6), sets = [];
    X.rows.forEach(function (r) {
      var prog = r.status && r.status.program;
      if (!prog || typeof programLoggedSets !== 'function') return;
      programLoggedSets(prog).forEach(function (x) {
        if (!x.date || x.date < since || x.date > t) return;
        sets.push({ id: r.athlete.id, name: r.athlete.name, set: x.set, title: typeof _exShortTitle === 'function' ? _exShortTitle(x.ex) : '', date: x.date });
      });
    });
    var wins = caWins(X.rows).filter(function (w) { return w.lifts.length; });
    var lane = caMeetLane(X.rows, 84), groups = caLaneGroups(lane.marks);
    // The focal job above: when it is a meet, the countdown sets the next one big instead (never the same meet twice).
    var f = X.lead && X.lead[0], skip = f && f.job && /^(meet|meetday)$/.test(f.job.type) ? (f.rows || [f.r]).map(function (r) { return r.athlete.id; }) : [];
    return {
      t: t, range: range, week: W, lastWeek: LW, strip: strip, lastStrip: lastStrip, quiet: quiet, behind: behind,
      strength: caTeamStrength(mom), line: line, effort: caEffortSplit(sets), lane: lane, groups: groups, countdown: caCountdown(groups, skip),
      wins: wins, prs: wins.reduce(function (n, w) { return n + w.lifts.length; }, 0), roster: ids.length
    };
  }
  function nameList(names, max) {
    max = max || 3;
    names = (names || []).filter(Boolean);
    if (names.length <= max) return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : (names[0] || '');
    return names.slice(0, max).join(', ') + ' and ' + (names.length - max) + ' more';
  }
  var MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function dayMon(iso) { var p = String(iso).slice(0, 10).split('-'); return p.length === 3 ? Number(p[2]) + ' ' + MON3[Number(p[1]) - 1] : ''; }
  function firstOf(id) { var a = (store().athletes || []).find(function (x) { return x.id === id; }); return first(a && a.name); }
  function athleteOf(id) { return (store().athletes || []).find(function (x) { return x.id === id; }) || { id: id, name: '' }; }
  function secHead(title, end) { return '<div class="ca-h"><h2>' + esc(title) + '</h2>' + (end || '') + '</div>'; }
  function metaHtml(t) { return '<span class="ca-h-meta">' + esc(t) + '</span>'; }
  // The team's sessions as one plate-face ring: a segment per session written this week, the lifted ones
  // filled. Past 24 sessions it's one arc. size: outer diameter; sw: the band.
  function teamRingSvg(done, planned, size, sw) {
    var r = (size - sw) / 2 - 4, c = size / 2, n = Math.max(0, Math.round(planned)), k = Math.max(0, Math.min(n, Math.round(done)));
    var o = '<svg class="ca-tring" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '" aria-hidden="true">';
    var pt = function (a) { return (c + r * Math.sin(a)).toFixed(2) + ' ' + (c - r * Math.cos(a)).toFixed(2); };
    var arc = function (a0, a1) { return 'M' + pt(a0) + ' A' + r.toFixed(2) + ' ' + r.toFixed(2) + ' 0 ' + (a1 - a0 > Math.PI ? 1 : 0) + ' 1 ' + pt(a1); };
    o += '<circle class="ca-tring-lip" cx="' + c + '" cy="' + c + '" r="' + (size / 2 - 0.5).toFixed(2) + '"/>';
    if (!n) return o + '<circle class="ca-tring-track" cx="' + c + '" cy="' + c + '" r="' + r.toFixed(2) + '" stroke-width="' + sw + '"/></svg>';
    var TAU = Math.PI * 2;
    if (n > 24) {
      o += '<circle class="ca-tring-track" cx="' + c + '" cy="' + c + '" r="' + r.toFixed(2) + '" stroke-width="' + sw + '"/>';
      if (k) o += k >= n ? '<circle class="ca-tring-fill" cx="' + c + '" cy="' + c + '" r="' + r.toFixed(2) + '" stroke-width="' + sw + '"/>' : '<path class="ca-tring-fill" style="--i:0" d="' + arc(0, TAU * k / n) + '" stroke-width="' + sw + '"/>';
      return o + '</svg>';
    }
    var gap = 2.4 / r;   // 2.4 pt between segments, measured on the band's centre line
    for (var i = 0; i < n; i++) {
      var a0 = TAU * i / n + gap / 2, a1 = TAU * (i + 1) / n - gap / 2;
      o += '<path class="' + (i < k ? 'ca-tring-fill' : 'ca-tring-track') + '" style="--i:' + i + '" d="' + arc(a0, a1) + '" stroke-width="' + sw + '"/>';
    }
    return o + '</svg>';
  }
  // Monday to Sunday: a column per day, as tall as the share of the team that trained that day.
  function stripPick(days) {
    return days.filter(function (d) { return d.today; })[0] || days.filter(function (d) { return !d.future && d.n; }).slice(-1)[0] || days.filter(function (d) { return !d.future; }).slice(-1)[0] || days[0];
  }
  // The strip is one picture under one finger: touching anywhere along it picks the nearest day (like a chart in
  // Health), so the whole strip is the target, never a 27 pt column. A screen reader and a keyboard get it as a
  // slider over the days, with every day's count and names in its label (the table a chart owes them).
  function stripHtml(days, roster, last) {
    // Scaled to the week's busiest day or half the team, whichever is more: a full column is a big day, and a
    // small team's two sessions still read as two (the number on each column says how many).
    var max = Math.max(1, roster / 2, Math.max.apply(null, days.map(function (d) { return d.n; })));
    var sel = stripPick(days);
    var said = function (d) { return DAYW[d.dow] + (d.today ? ', today' : '') + ': ' + (d.future ? 'still to come' : d.n ? plural(d.n, 'session') + ', ' + nameList(d.who.map(firstOf), 6) : 'no sessions'); };
    var label = (last ? 'Last week' : 'This week') + ', sessions logged each day. ' + days.map(said).join('. ');
    var picks = days.filter(function (d) { return !d.future; });
    return '<div class="ca-strip' + (last ? ' is-last' : '') + '" role="slider" tabindex="0" aria-label="' + esc(label) + '" aria-valuemin="0" aria-valuemax="' + Math.max(0, picks.length - 1) + '" aria-valuenow="' + Math.max(0, picks.indexOf(sel)) + '" aria-valuetext="' + esc(said(sel)) + '">' +
      days.map(function (d) {
        var inner = '<span class="ca-sday-plot">' + (d.future ? '<i class="ca-sday-dot"></i>' : (d.n ? '<b class="ca-sday-n">' + d.n + '</b>' : '') + '<i class="ca-sday-bar' + (d.n ? '' : ' is-zero') + '" style="--h:' + (d.n / max).toFixed(3) + ';--i:' + d.dow + '"></i>') + '</span>' +
          '<span class="ca-sday-l">' + DAY1[d.dow] + '</span>';
        return '<span class="ca-sday' + (d.today && !last ? ' is-today' : '') + (d.future ? ' is-future' : '') + (d === sel ? ' on' : '') + '"' + (d.future ? '' : ' data-day="' + d.iso + '"') + ' aria-hidden="true">' + inner + '</span>';
      }).join('') + '</div>';
  }
  // The line over the hero says what the chosen day was: today's own line (who is training, who trained), or a day
  // picked on the strip ("Monday · Arjun and Sarah trained"); last week's days say so.
  function dayLine(d, X, last) {
    if (!d) return '';
    if (d.today && !last) return caTodayLine(X.rows, { weekday: DAYW[d.dow] });
    var who = d.who.map(firstOf);
    return (last ? 'Last ' : '') + DAYW[d.dow] + ' · ' + (d.n ? nameList(who, 3) + ' trained' : 'no one trained');
  }
  function dayReadout(d) {
    if (!d) return '';
    var who = d.who.map(firstOf);
    return (d.today ? 'Today' : DAYW[d.dow]) + ' · ' + (d.n ? nameList(who, 4) : 'no sessions');
  }
  // 2. THE HERO: this week. The team's sessions lifted against the sessions written, as one ring (a segment per
  // session written, the lifted ones lit in the green that means done), who is behind beside it, and Monday to
  // Sunday under the words. The line on top is the day: today's, or the one a finger picks on the strip.
  // A quiet week (nothing logged since Monday) keeps this week's ring as its plan, unlit, says so, and draws last
  // week's days, labelled: never an empty chart.
  function teamWeekHtml(X, S) {
    if (!S.week) return '';
    var W = S.week, quiet = S.quiet, LW = S.lastWeek;
    var done = W.sessionsDone || 0, planned = W.sessionsPlanned || 0;
    var days = quiet ? (S.lastStrip || S.strip) : S.strip, last = !!(quiet && S.lastStrip);
    var names = S.behind.map(function (r) { return first(r.athlete.name); });
    var hi = caTodayLine(X.rows, { weekday: localDate(todayIso(), { weekday: 'long' }) });
    var t1 = quiet ? 'Nothing logged yet' : planned ? W.trained + ' of ' + W.of + ' lifters trained' : plural(done, 'session') + ' logged';
    var t2 = quiet ? '<span class="ca-wk-s">' + esc(LW && LW.sessionsPlanned ? 'Last week ' + LW.sessionsDone + ' of ' + LW.sessionsPlanned + ' lifted' : 'Sessions light up as they land') + '</span>'
      : S.behind.length ? '<span class="ca-wk-b"><i class="ca-wk-bdot" aria-hidden="true"></i><span>' + esc(S.behind.length + ' behind') + '</span><span class="ca-wk-bn">' + esc(nameList(names, 1)) + '</span>' + ic('chev', 2.4) + '</span>'
      : '<span class="ca-wk-b is-clear">Nobody behind' + ic('chev', 2.4) + '</span>';
    var digits = String(done).length + String(planned).length;
    var centre = planned ? '<b' + (digits > 3 ? ' class="is-long"' : '') + '>' + done + '</b><small>of ' + planned + '</small>' : '<b>' + done + '</b><small>logged</small>';
    var aria = (quiet ? 'Nothing logged yet this week, ' + plural(planned, 'session') + ' written' + (LW && LW.sessionsPlanned ? '. Last week ' + LW.sessionsDone + ' of ' + LW.sessionsPlanned + ' lifted' : '')
      : 'This week, ' + (planned ? done + ' of ' + planned + ' sessions lifted' : plural(done, 'session') + ' logged') + ', ' + W.trained + ' of ' + W.of + ' lifters trained') + '. ' +
      (S.behind.length ? S.behind.length + ' behind: ' + nameList(names, 6) : 'Nobody behind') + '. Show who is behind';
    return '<div class="ca-sum ca-tw ca-rise' + (quiet ? ' is-quiet' : '') + '">' +
      '<div class="ca-tw-top"><p class="ca-hero-hi" data-readout="week" aria-live="polite">' + esc(hi) + '</p><span class="ca-h-meta">' + esc(S.range) + '</span></div>' +
      '<div class="ca-tw-body">' +
        '<div class="ca-stats is-week"><button type="button" class="ca-stat is-btn is-week" data-lifters="behind" aria-label="' + esc(aria) + '">' +
          '<span class="ca-wk-ring">' + teamRingSvg(done, planned, 120, 11) + '<span class="ca-wk-c">' + centre + '</span></span>' +
          '<span class="ca-wk-tx"><b class="ca-wk-t">' + esc(t1) + '</b>' + t2 + '</span>' +
        '</button></div>' +
        stripHtml(days, S.roster, last) +
      '</div></div>';
  }
  // A small line for a tile: the 8 weeks as one stroke, the 4 the number compares in ink, the 4 before them in
  // steel, the latest point marked. No labels: the tile's number says it, and its sheet has the full chart.
  function miniLineHtml(L) {
    if (!L) return '';
    var pts = [];
    L.values.forEach(function (v, i) { if (v != null) pts.push({ i: i, v: Number(kgShow(v)) }); });
    if (pts.length < 2) return '';
    var lo = Math.min.apply(null, pts.map(function (p) { return p.v; })), hi = Math.max.apply(null, pts.map(function (p) { return p.v; }));
    var span = Math.max(hi - lo, hi * 0.01);
    lo -= span * 0.12; hi += span * 0.12;
    var n = L.values.length - 1, Hh = 40, X = function (i) { return 2 + i / n * 96; }, Y = function (v) { return Hh - (v - lo) / (hi - lo) * Hh; };
    var xy = pts.map(function (p) { return [X(p.i), Y(p.v)]; });
    var path = function (a) { return typeof _smoothPath === 'function' ? _smoothPath(a) : a.map(function (q, j) { return (j ? 'L' : 'M') + q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join(' '); };
    var cutAt = n - (L.back || 4), cut = pts.findIndex(function (p) { return p.i >= cutAt; });
    var older = cut > 0 ? xy.slice(0, cut + 1) : null, recent = xy.slice(Math.max(0, cut)), lp = xy[xy.length - 1];
    return '<div class="ca-mline" aria-hidden="true"><svg viewBox="0 0 100 ' + Hh + '" preserveAspectRatio="none">' +
      (older ? '<path class="ca-line-old" d="' + path(older) + '" vector-effect="non-scaling-stroke"/>' : '') +
      '<path class="ca-line-now" d="' + path(recent) + '" vector-effect="non-scaling-stroke"/></svg>' +
      (cut > 0 ? '<span class="ca-line-dot is-was" style="left:' + xy[cut][0].toFixed(2) + '%;top:' + (xy[cut][1] / Hh * 100).toFixed(2) + '%"></span>' : '') +
      '<span class="ca-line-dot" style="left:' + lp[0].toFixed(2) + '%;top:' + (lp[1] / Hh * 100).toFixed(2) + '%"></span></div>';
  }
  // The team's e1RM line, full size (the strength sheet): 8 weeks, the last 4 in ink and the 4 before them in
  // steel (the window the headline compares), the latest point marked and labelled. Drawn in a 100-wide box that
  // stretches to the card; the dots and labels are HTML, so they stay round and on the type scale.
  function lineHtml(L, t) {
    if (!L) return '';
    var vals = L.values, pts = [];
    vals.forEach(function (v, i) { if (v != null) pts.push({ i: i, v: Number(kgShow(v)) }); });
    if (pts.length < 2) return '';
    var lo = Math.min.apply(null, pts.map(function (p) { return p.v; })), hi = Math.max.apply(null, pts.map(function (p) { return p.v; }));
    var span = Math.max(hi - lo, hi * 0.01);
    lo -= span * 0.22; hi += span * 0.12;
    var n = vals.length - 1, cutAt = n - (L.back || 4);
    var Wd = 100, Hh = 40, X = function (i) { return 2 + i / n * 96; }, Y = function (v) { return Hh - (v - lo) / (hi - lo) * Hh; };
    var xy = pts.map(function (p) { return [X(p.i), Y(p.v)]; });
    var path = function (a) { return typeof _smoothPath === 'function' ? _smoothPath(a) : a.map(function (q, j) { return (j ? 'L' : 'M') + q[0].toFixed(2) + ' ' + q[1].toFixed(2); }).join(' '); };
    var cut = pts.findIndex(function (p) { return p.i >= cutAt; });
    var older = cut > 0 ? xy.slice(0, cut + 1) : null, recent = xy.slice(Math.max(0, cut));
    var last = pts[pts.length - 1], lp = xy[xy.length - 1];
    var wash = path(recent) + ' L' + recent[recent.length - 1][0].toFixed(2) + ' ' + Hh + ' L' + recent[0][0].toFixed(2) + ' ' + Hh + ' Z';
    var mon0 = addDays(caMonday(t), -7 * n);
    var weeks = pts.map(function (p) { return { i: p.i, v: p.v, wk: addDays(mon0, 7 * p.i) }; });
    var data = esc(JSON.stringify(weeks.map(function (w) { return [w.i, Math.round(w.v), w.wk, +(Y(w.v) / Hh * 100).toFixed(2), +(X(w.i)).toFixed(2)]; })));
    var tick = function (i, text, cls) { return '<span class="ca-line-xl' + (cls ? ' ' + cls : '') + '" style="left:' + (X(i) / Wd * 100).toFixed(2) + '%">' + esc(text) + '</span>'; };
    return '<div class="ca-line-w" data-line="' + data + '" role="img" aria-label="Team e1RM total each week: ' + esc(weeks.map(function (w) { return 'week of ' + dayMon(w.wk) + ', ' + Math.round(w.v).toLocaleString() + ' ' + unit(); }).join('; ')) + '">' +
      '<svg class="ca-line" viewBox="0 0 ' + Wd + ' ' + Hh + '" preserveAspectRatio="none" aria-hidden="true">' +
        '<defs><linearGradient id="caLineWash" x1="0" y1="0" x2="0" y2="1"><stop offset="0" class="ca-line-a0"/><stop offset="1" class="ca-line-a1"/></linearGradient></defs>' +
        '<path class="ca-line-a" fill="url(#caLineWash)" d="' + wash + '"/>' +
        (older ? '<path class="ca-line-old" d="' + path(older) + '" vector-effect="non-scaling-stroke"/>' : '') +
        '<path class="ca-line-now" d="' + path(recent) + '" vector-effect="non-scaling-stroke"/></svg>' +
      (cut > 0 ? '<span class="ca-line-dot is-was" style="left:' + (xy[cut][0]).toFixed(2) + '%;top:' + (xy[cut][1] / Hh * 100).toFixed(2) + '%"></span>' : '') +
      '<span class="ca-line-dot" style="left:' + lp[0].toFixed(2) + '%;top:' + (lp[1] / Hh * 100).toFixed(2) + '%"></span>' +
      '<span class="ca-line-end" style="right:' + (100 - lp[0]).toFixed(2) + '%;top:' + (lp[1] / Hh * 100).toFixed(2) + '%"><b>' + Math.round(last.v).toLocaleString() + '</b> ' + esc(unit()) + '</span>' +
      '<span class="ca-line-hair" aria-hidden="true"></span><span class="ca-line-sel" aria-hidden="true"></span>' +
      '</div><div class="ca-line-x" aria-hidden="true">' + tick(pts[0].i, dayMon(addDays(mon0, 7 * pts[0].i)), 'is-first') +
        (pts[0].i < cutAt ? tick(cutAt, '4 weeks ago') : '') + tick(n, 'Now', 'is-last') + '</div>';
  }
  var LIFT_W = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' }, LIFT_K = { squat: 'S', bench: 'B', deadlift: 'D' };
  // Each lift's change: its letter on a mark in its lift colour (the colour is the mark, the words stay ink).
  function liftChipsHtml(st, full) {
    return '<div class="ca-lchips' + (full ? ' is-full' : '') + '">' + LIFTS3.map(function (L) {
      var o = st.lifts[L];
      return '<span class="ca-lchip lift-' + L + '"><i class="ca-lchip-k" aria-hidden="true">' + (full ? '' : LIFT_K[L]) + '</i>' + (full ? '<span class="ca-lchip-l">' + LIFT_W[L] + '</span>' : '<span class="ca-sr">' + LIFT_W[L] + '</span>') +
        '<b>' + (o.n ? esc(full ? caPct(o.pct) : caPct(o.pct).replace('%', '')) : '<span class="ca-sr">no data</span>–') + '</b>' + (o.n && !full ? '<span class="ca-sr">%</span>' : '') + '</span>';
    }).join('') + '</div>';
  }
  function strengthAria(st) {
    var T = st.total, dir = T.kg > 0.05 ? 'up' : T.kg < -0.05 ? 'down' : 'flat';
    return 'Team e1RM total ' + (dir === 'flat' ? 'flat' : dir + ' ' + caPct(Math.abs(T.pct)).replace(/^[+−]/, '')) + ' over the last 4 weeks, ' + plural(T.n, 'lifter') + '. ' +
      LIFTS3.map(function (L) { return LIFT_W[L] + ' ' + (st.lifts[L].n ? caPct(st.lifts[L].pct) : 'no data'); }).join(', ');
  }
  // A tile's head: its name and its window on one line, the answer as a numeral, a few words. The head is the
  // tile's one button: its target is the whole tile (it opens the sheet with the full chart and the people).
  function tileHead(name, win, num, words, attr, aria) {
    return '<button type="button" class="ca-sum-head is-tile" ' + attr + ' aria-label="' + esc(aria) + '">' +
      '<span class="ca-t2-top"><span class="ca-t2-l">' + esc(name) + '</span><span class="ca-h-meta">' + esc(win) + '</span></span>' +
      '<b class="ca-sum-num">' + num + '</b><span class="ca-sum-s">' + esc(words) + '</span></button>';
  }
  // 3. Strength, as a tile: the team's e1RM change over 4 weeks, its 8-week line, each lift's change.
  function strengthHtml(X, S) {
    var st = S.strength, T = st.total;
    if (!T.n) {
      return '<div class="ca-sum ca-str ca-t2 ca-rise is-none"><span class="ca-t2-top"><span class="ca-t2-l">Strength</span><span class="ca-h-meta">4 weeks</span></span>' +
        '<p class="ca-sum-none"><b>After 8 weeks of logs</b>Each lifter’s best e1RM now against 4 weeks ago.</p></div>';
    }
    var words = st.stalled.length ? plural(st.stalled.length, 'lifter') + ' flat' : 'Team e1RM';
    return '<div class="ca-sum ca-str ca-t2 ca-rise">' + tileHead('Strength', '4 weeks', esc(caPct(T.pct)), words, 'data-sheet="movers"', strengthAria(st) + '. Show who moved most and who is flat') +
      miniLineHtml(S.line) + liftChipsHtml(st) + '</div>';
  }
  // 4. Effort against what was written, as a tile: how many sets came in on target, one bar split three ways.
  function effortBar(E, mini) {
    var segs = [['easier', E.easier], ['on', E.on], ['harder', E.harder]];
    return '<div class="ca-ebar' + (mini ? ' is-mini' : '') + '" aria-hidden="true">' + segs.filter(function (g) { return g[1] > 0; }).map(function (g, i) {
      return '<i class="ca-eseg is-' + g[0] + '" data-seg="' + g[0] + '" style="flex-grow:' + g[1] + ';--i:' + i + '"></i>';
    }).join('') + '</div>';
  }
  function effortHtml(X, S) {
    var E = S.effort;
    if (!E.total) {
      return '<div class="ca-sum ca-eff ca-t2 ca-rise is-none"><span class="ca-t2-top"><span class="ca-t2-l">Effort</span><span class="ca-h-meta">7 days</span></span>' +
        '<p class="ca-sum-none"><b>No RPE logged</b>Each set lands here against the RPE you wrote.</p></div>';
    }
    var hot = E.hot.map(function (h) { return first(h.name); });
    var aria = E.on + ' of ' + plural(E.total, 'set') + ' on target in the last 7 days, ' + E.harder + ' harder, ' + E.easier + ' easier' + (hot.length ? '. Running hot: ' + nameList(hot, 6) : '') + '. Show the sets and who is running hot';
    return '<div class="ca-sum ca-eff ca-t2 ca-rise' + (E.harder ? ' has-hard' : '') + '">' + tileHead('Effort', '7 days', E.on + '<small> of ' + E.total + '</small>', hot.length ? 'Running hot: ' + nameList(hot, 1) : 'sets on target', 'data-sheet="hot"', aria) +
      effortBar(E, true) +
      '<p class="ca-ekeys" aria-hidden="true"><span class="is-harder"><i></i><b>' + E.harder + '</b> harder</span><span class="is-easier"><i></i><b>' + E.easier + '</b> easier</span></p></div>';
  }
  function duoHtml(X, S) { return '<div class="ca-duo">' + strengthHtml(X, S) + effortHtml(X, S) + '</div>'; }
  function effortReadout(E, kind) {
    if (!kind) return '';
    if (kind === 'harder') return E.hard.slice(0, 2).map(function (h) { return first(h.name) + ': ' + (h.title ? h.title + ' ' : '') + '@' + num(h.felt) + ' where you wrote @' + num(h.wrote); }).join(' · ') + (E.hard.length > 2 ? ' · ' + (E.hard.length - 2) + ' more' : '') || 'No set a full point over what you wrote';
    var n = kind === 'on' ? E.on : E.easier;
    return plural(n, 'set') + (kind === 'on' ? ' within 0.5 RPE of what you wrote' : ' a full point or more under what you wrote');
  }
  // 5. Meets, as a tile: the next 12 weeks on one lane, a face at each meet (a crowded meet is one face and "+N"),
  // the nearest meet the page hasn't already led with set big as its countdown.
  function meetsHtml(X, S) {
    var G = S.groups || [], C = S.countdown;
    var top = '<span class="ca-t2-top"><span class="ca-t2-l">Meets</span><button type="button" class="ca-h-end" data-sc="meets">All meets</button></span>';
    if (!G.length || !C) {
      return '<div class="ca-sum ca-mt ca-rise is-none">' + top + '<p class="ca-sum-none"><b>No meets in the next 12 weeks</b>' +
        'Plan one from a lifter’s page and it lands here, with the countdown.</p></div>';
    }
    var who = C.ids.map(firstOf);
    var big = C.days <= 0 ? 'Today' : C.days === 1 ? 'Tomorrow' : C.days + ' days';
    var sub = nameList(who, 3);
    if (C.skipped.length) sub += ' · ' + nameList(C.skipped.reduce(function (a, g) { return a.concat(g.ids.map(firstOf)); }, []), 2) + ' compete' + (C.skipped.reduce(function (n, g) { return n + g.ids.length; }, 0) === 1 ? 's' : '') + (C.skipped[0].days <= 0 ? ' today' : C.skipped[0].days === 1 ? ' tomorrow' : ' in ' + C.skipped[0].days + ' days');
    else if (C.after) sub += ' · then ' + nameList(C.after.ids.map(firstOf), 1) + ' ' + (C.after.days === 1 ? 'tomorrow' : 'in ' + C.after.days + ' days');
    var faces = G.map(function (g, i) {
      var when = g.days <= 0 ? 'today' : g.days === 1 ? 'tomorrow' : 'in ' + g.days + ' days';
      var one = g.ids.length === 1, a = athleteOf(g.ids[0]);
      var label = (one ? a.name : nameList(g.ids.map(firstOf), 6)) + ': ' + g.meet + ', ' + when + (one ? '. Open the meet plan' : '. Open the meets');
      return '<button type="button" class="ca-lane-f" ' + (one ? 'data-meetplan="' + esc(g.ids[0]) + '" data-plan="' + esc(g.ids[0]) + '"' : 'data-sc="meets"') + ' data-more="' + (g.ids.length - 1) + '" data-label="' + esc(label) + '" style="--x:' + g.x.toFixed(4) + ';--z:' + (G.length - i) + '" aria-label="' + esc(label) + '">' +
        '<i class="ca-lane-stem" aria-hidden="true"></i>' + avHtml(a, 'is-36') + '<i class="ca-lane-more" aria-hidden="true">' + (one ? '' : '+' + (g.ids.length - 1)) + '</i></button>';
    }).join('');
    var ticks = '';
    for (var w = 1; w < 12; w++) ticks += '<i class="ca-lane-tick' + (w % 4 ? '' : ' is-major') + '" style="--x:' + (w / 12).toFixed(4) + '"></i>';
    var marks = G.map(function (g) { return '<i class="ca-lane-mark" style="--x:' + g.x.toFixed(4) + '"></i>'; }).join('');
    var lab = function (w, t) { return '<span class="ca-lane-xl" style="--x:' + (w / 12).toFixed(4) + '">' + esc(t) + '</span>'; };
    return '<div class="ca-sum ca-mt ca-rise">' + top +
      '<div class="ca-sum-head"><b class="ca-sum-num">' + esc(big) + '</b><span class="ca-sum-tx"><span class="ca-sum-t">' + esc(C.meet) + '</span><span class="ca-sum-s">' + esc(sub) + '</span></span></div>' +
      '<div class="ca-lane" role="group" aria-label="Meets in the next 12 weeks"><div class="ca-lane-faces">' + faces + '</div>' +
        '<div class="ca-lane-track" aria-hidden="true">' + ticks + marks + '</div>' +
        '<div class="ca-lane-x" aria-hidden="true">' + lab(0, 'Now') + lab(4, '4 wk') + lab(8, '8 wk') + lab(12, '12 wk') + '</div></div>' +
      '</div>';
  }
  // The lane's faces step up a tier when they'd touch the one before (caLaneTiers). A face is a whole meet, so a
  // fold (only when three tiers are full) folds a whole meet into the one before it: that face then opens the
  // list of meets, never one lifter's plan. Measured after the lane is laid out, and again when it resizes.
  function layoutLane(area) {
    var lane = area && area.querySelector('.ca-lane');
    if (!lane) return;
    var place = function () {
      var w = lane.clientWidth, fs = [].slice.call(lane.querySelectorAll('.ca-lane-f'));
      if (!w || !fs.length) return;
      var F = 36, xs = fs.map(function (f) { return Number(f.style.getPropertyValue('--x')) * (w - F); });
      var tiers = caLaneTiers(xs, F + 6, 3), lastShown = -1, extra = {};
      fs.forEach(function (f, i) {
        f.classList.toggle('is-folded', tiers[i] < 0);
        f.style.setProperty('--tier', String(Math.max(0, tiers[i])));
        if (tiers[i] < 0) { if (lastShown >= 0) extra[lastShown] = (extra[lastShown] || 0) + Number(f.getAttribute('data-more') || 0) + 1; }
        else lastShown = i;
      });
      fs.forEach(function (f, i) {
        var more = Number(f.getAttribute('data-more') || 0) + (extra[i] || 0), m = f.querySelector('.ca-lane-more'), plan = f.getAttribute('data-plan');
        if (m) m.textContent = more ? '+' + more : '';
        if (!more && plan) { f.setAttribute('data-meetplan', plan); f.removeAttribute('data-sc'); }
        else { f.removeAttribute('data-meetplan'); f.setAttribute('data-sc', 'meets'); }
        f.setAttribute('aria-label', (f.getAttribute('data-label') || '').replace(/\. Open the (meet plan|meets)$/, '') + (extra[i] ? ', and ' + plural(extra[i], 'lifter') + ' at meets beside it' : '') + (!more && plan ? '. Open the meet plan' : '. Open the meets'));
      });
      var top = Math.max.apply(null, tiers.concat([0]));
      lane.style.setProperty('--tiers', String(top));
      lane.classList.toggle('has-tier', top > 0);
    };
    place();
    if (typeof ResizeObserver !== 'undefined' && !lane._ro) { lane._ro = new ResizeObserver(function () { place(); }); lane._ro.observe(lane); }
  }
  // 6. PRs, as a tile: the count, and the faces that set them.
  function prsHtml(X, S) {
    var top = '<span class="ca-t2-top"><span class="ca-t2-l">PRs</span><span class="ca-h-meta">7 days</span></span>';
    if (!S.prs) {
      return '<div class="ca-sum ca-pr ca-rise is-none">' + top + '<div class="ca-stats is-pr"><button type="button" class="ca-stat is-btn" data-wins="1" aria-label="No personal records in the last 7 days. Show the wins">' +
        '<span class="ca-sum-none"><b>No PRs in the last 7 days</b>Every e1RM PR lands here the moment it’s logged.</span></button></div></div>';
    }
    var L0 = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
    var faces = S.wins.map(function (w) {
      var lifts = LIFTS3.filter(function (L) { return w.lifts.indexOf(L) >= 0; }).map(function (L) { return L0[L]; });
      return '<button type="button" class="ca-prf" data-prof="' + esc(w.id) + '" aria-label="' + esc(w.name + ': ' + lifts.join(', ') + ' PR' + (lifts.length > 1 ? 's' : '') + '. Open their progress') + '">' +
        '<span class="ca-prf-face">' + avHtml(athleteOf(w.id)) + '<i class="ca-prf-n">' + w.lifts.length + '</i></span><span class="ca-prf-l">' + esc(first(w.name)) + '</span></button>';
    }).join('');
    return '<div class="ca-sum ca-pr ca-rise">' + top + '<div class="ca-pr-body">' +
      '<div class="ca-stats is-pr"><button type="button" class="ca-stat is-btn" data-wins="1" aria-label="' + esc(plural(S.prs, 'personal record') + ' in the last 7 days, by ' + plural(S.wins.length, 'lifter') + '. Show the wins') + '">' +
        '<b>' + S.prs + '</b><span>' + (S.prs === 1 ? 'PR' : 'PRs') + '</span>' + ic('chev', 2.4) + '</button></div>' +
      '<div class="ca-pr-faces">' + faces + '</div></div></div>';
  }

  // Your lifters: every face, ringed by this week's sessions, the live dot when they're under the bar.
  function facesHtml(X) {
    var rows = caFaceOrder(X.rows, X.need);
    if (!rows.length) return '';
    var shown = rows.slice(0, 24);
    var faces = shown.map(function (r) {
      var w = X.week(r), live = r.live ? ', training now' : '';
      return '<button type="button" class="ca-fb" data-open="' + esc(r.athlete.id) + '" aria-label="' + esc(r.athlete.name + ': ' + w.text + live) + '">' + faceHtml(r, w, 64, { fam: famOf(r, X) }) +
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
    // (The meets live in Meets above, with their countdown; its All meets is the way in.)
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
      return '<button type="button" class="ca-tile ' + cls + '" data-sc="' + key + '" aria-label="' + esc(aria || (label + (value != null ? ': ' + value : '') + (sub ? ', ' + sub : ''))) + '">' +
        '<span class="ca-tic">' + ic(icon) + '</span><span class="ca-tl">' + esc(label) + '</span>' +
        (value != null ? '<b class="ca-tv">' + esc(value) + '</b>' : '') + (sub ? '<span class="ca-ts' + (key === 'clients' && money ? ' is-warn' : '') + (key === 'checkins' && ciFlag ? ' is-warn' : '') + '">' + esc(sub) + '</span>' : '') + ic('chev', 2.2) + '</button>';
    };
    return '<div class="ca-sec"><div class="ca-h"><h2>Coaching</h2></div><div class="ca-tiles ca-rise">' +
      tile('clients', 'is-wide t-clients' + (money ? ' is-owed' : ''), 'wallet', 'Clients', clientsV, clientsS) +
      tile('checkins', 'is-wide t-checkins', 'clip', 'Check-ins', ciV, ciS) +
      tile('challenges', 'is-small t-club', 'flag', 'Challenges', null, chRun ? chRun + ' running' : 'Start one', 'Challenges: ' + (chRun ? chRun + ' running' : 'none running')) +
      tile('club', 'is-small t-club', 'shield', 'Club', null, 'Feed and board') +
      tile('templates', 'is-small t-tpl', 'copy', 'Templates', null, tpls ? plural(tpls, 'saved', 'saved') : 'None yet') +
      '</div></div>';
  }
  function reportRowHtml(top) {
    // Its line is the week it covers: its own numbers (last week's PRs, last week's trained) sat under this week's
    // on the same page and read as two answers to one question.
    var line = '';
    try { var CR = window.CoachReport; if (CR && CR.lastWeek && CR.rangeLabel) { var lw = CR.lastWeek(todayIso()); line = CR.rangeLabel(lw.from, lw.to); } } catch (e) {}
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
    // No picture: the owner's answer of 28 Oct (no plate, bar or lamp renders on Home). The welcome is the app's own
    // lit card, the invite its one red; what Home becomes is said below in words, never sample numbers.
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
    // What Home becomes once they train: the summary's sections, in words. No sample numbers: a made-up week
    // would be the only invented figures in the app, and the first thing a new coach reads.
    var soon = [
      ['alert', 'Who needs you', 'Pain, a close meet, a set over plan: worst first'],
      ['cal', 'This week', 'Sessions lifted against the ones you wrote'],
      ['trend', 'Strength and effort', 'The team\u2019s e1RM, and every set against its RPE'],
      ['trophy', 'Meets and PRs', 'The next 12 weeks, and every PR as it lands']
    ];
    html += '<div class="ca-sec ca-soon"><div class="ca-h"><h2>Once they train</h2></div><div class="ca-list ca-rise" role="list">' + soon.map(function (x) {
      return '<div class="ca-lrow is-static" role="listitem"><span class="ca-tic t-step">' + ic(x[0]) + '</span><span class="ca-lrow-tx"><span class="ca-lrow-t">' + esc(x[1]) + '</span><span class="ca-lrow-s">' + esc(x[2]) + '</span></span></div>';
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
      if ((b = t.closest('[data-open]'))) { e.preventDefault(); openLifter(b.getAttribute('data-open'), b); return; }
      if ((b = t.closest('[data-lifters]'))) { e.preventDefault(); openLifters(b.getAttribute('data-lifters')); return; }
      if ((b = t.closest('[data-wins]'))) { e.preventDefault(); openWins(area._X); return; }
      // The summary's marks: a day on the week's strip (wireStrip picks it under a finger; a click lands here too),
      // a tile's sheet, a face on the meets lane or the PRs.
      if ((b = t.closest('[data-day]'))) { e.preventDefault(); pickDay(area, b); return; }
      if ((b = t.closest('[data-sheet]'))) { e.preventDefault(); if (b.getAttribute('data-sheet') === 'movers') openMovers(area._X); else openHot(area._X); return; }
      if ((b = t.closest('[data-meetplan]'))) { e.preventDefault(); var mid = b.getAttribute('data-meetplan'); if (window.MeetDay && MeetDay.planFor) MeetDay.planFor(mid); else openLifter(mid, b); return; }
      if ((b = t.closest('[data-prof]'))) { e.preventDefault(); P.pending = 'progress'; P.id = b.getAttribute('data-prof'); openLifter(P.id, b); return; }
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
  // Opening a lifter from a face or a row carries that face to the page's header (coach-app.css MOTION).
  function openLifter(id, src) {
    if (!id || !CL() || !CL().open) return;
    var from = carryFrom(src);
    CL().open(id);
    if (from) carry(from, document.querySelector('#lifterPage .ca-ph .ca-face'), 'carry', id, src);
  }

  /* ---------------------------------------------------------------- the carry
     The face you tapped is the face on the page: it travels from where you tapped it to the header on the heavy
     spring while the page settles in place (body[data-nav=carry]), and Back carries it home again. FLIP with
     WAAPI on transform only, started before the first frame of the new screen, so nothing jumps; a tap during
     the flight just lands it (the animation is dropped with the screen it was on). Never under reduced motion. */
  var CARRY = { id: null, kind: '' };
  function reducedMotion() { try { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }
  function faceIn(node) { return node && node.querySelector ? node.querySelector('.ca-face') || node.querySelector('.ca-av') : null; }
  function rectOf(n) { if (!n) return null; var b = n.getBoundingClientRect(); return b.width > 0 ? { x: b.left, y: b.top, w: b.width, h: b.height } : null; }
  function carryFrom(src) { return src && hasDom && !reducedMotion() ? rectOf(faceIn(src)) : null; }
  function springOf(name) {
    var cs = getComputedStyle(document.body);
    return { ease: (cs.getPropertyValue('--pl-spring') || '').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)', ms: parseFloat(cs.getPropertyValue(name)) || 440 };
  }
  function carry(from, to, nav, id, src) {
    var b = rectOf(to);
    if (!from || !b || typeof to.animate !== 'function') return false;
    // Off screen at either end: no flight, the screen's own push or pop does it.
    var vh = window.innerHeight || 852;
    if (from.y + from.h < 0 || from.y > vh || b.y + b.h < 0 || b.y > vh) return false;
    var dx = (from.x + from.w / 2) - (b.x + b.w / 2), dy = (from.y + from.h / 2) - (b.y + b.h / 2), s = from.w / b.w;
    document.body.dataset.nav = nav;
    var sp = springOf('--pl-d-heavy');
    var frames = [{ transform: 'translate3d(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px,0) scale(' + s.toFixed(3) + ')' }, { transform: 'none' }];
    to.classList.add('is-carry');
    var a;
    try { a = to.animate(frames, { duration: sp.ms, easing: sp.ease }); }
    catch (e) { try { a = to.animate(frames, { duration: 420, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); } catch (e2) { a = null; } }
    var done = function () { to.classList.remove('is-carry'); };
    if (a) { a.onfinish = done; a.oncancel = done; } else done();
    if (nav === 'carry' && id) { CARRY.id = id; CARRY.kind = src && src.classList ? ['ca-fb', 'ca-focal-main', 'ca-jrow-main', 'ca-row'].filter(function (k) { return src.classList.contains(k); })[0] || '' : ''; }
    return true;
  }
  // Back from the card (the pane's back or the bar's copy of it) carries the face back to where it came from.
  if (hasDom) {
    document.addEventListener('click', function (e) {
      var back = e.target && e.target.closest && e.target.closest('.pane-back, #clNavBack');
      if (!back || !CARRY.id || P.view !== 'card' || reducedMotion()) return;
      var pane = document.querySelector('section[data-pane="lifter"]');
      if (!pane || pane.classList.contains('hidden') || P.id !== CARRY.id) return;
      var from = rectOf(document.querySelector('#lifterPage .ca-ph .ca-face'));
      var id = CARRY.id, kind = CARRY.kind, t0 = Date.now();
      CARRY.id = null;
      if (!from) return;
      // After the tab has switched (window is the last stop of this click), before the frame is drawn.
      window.addEventListener('click', function land() {
        if (Date.now() - t0 > 600) return;
        var shown = document.querySelector('.dash-main > section[data-pane]:not(.hidden)');
        if (!shown || shown.getAttribute('data-pane') === 'lifter') return;
        var sel = '[data-open="' + String(id).replace(/"/g, '') + '"]' + (kind ? '.' + kind : '');
        var src = shown.querySelector(sel) || shown.querySelector('[data-open="' + String(id).replace(/"/g, '') + '"]');
        carry(from, faceIn(src), 'carry-back');
      }, { once: true });
    }, true);
  }
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
    // Under Behind, the line says what they're behind on (Home's "1 behind" opens this list, so it answers why).
    var bl = L.filter === 'behind' ? caBehindLine(r, w) : '';
    var line = bl || (top && top.type === 'busy' && caBusyLine(top) ? caBusyLine(top) : CL() && CL().clLine ? CL().clLine(r, top && top.tier <= 3 ? top : null) : '');
    var sev = bl ? 'watch' : caSev(top);
    var n = CL() && CL().clNumber ? CL().clNumber(r) : { text: '', tone: 'none', title: '' };
    return '<button type="button" class="ca-row' + (i < 9 ? ' ca-rise' : '') + '" data-open="' + esc(r.athlete.id) + '">' + faceHtml(r, w, 52, { fam: caFamily(r, top) }) +
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
      if ((b = t.closest('[data-open]'))) { e.preventDefault(); openLifter(b.getAttribute('data-open'), b); }
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
  var P = { id: null, view: 'card', host: null, pending: null, direct: false };
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
    // Their plate family lights their page from the top (coach-app.css body[data-screen=lifter][data-pf]),
    // on the card and on every view a row pushes in.
    var fam = caFamily(r, topJob(r, X.jobs));
    if (hasDom && document.body) { if (fam) document.body.setAttribute('data-pf', fam); else document.body.removeAttribute('data-pf'); }
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
    var html = '<header class="ca-ph">' + faceHtml(r, w, 96, { cls: 'is-big', fam: caFamily(r, top) }) +
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
    // The total is the page's object, lit by where it's going: up green, down amber, flat by the page's own light.
    var lit = d > 0 ? ' pf-up' : d < 0 ? ' pf-down' : '';
    return '<button type="button" class="ca-ov' + lit + '" data-view="progress" aria-label="e1RM total ' + Math.round(kgShow(T.value)) + ' ' + esc(unit()) + (d != null ? ', ' + (d >= 0 ? 'up ' : 'down ') + Math.abs(d) + ' in 4 weeks' : '') + '. Open progress">' + head +
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
    // Straight in from Home (a PR, a mover) the back says Home, so the view names whose it is.
    var a = r.athlete, html = (P.direct ? '<p class="ca-subk">' + esc(a.name) + '</p>' : '') + '<h2 class="ca-subt">' + esc(VIEWS[view] || '') + '</h2>';
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
    P.view = v; P.direct = false;
    animatePush('push');
    renderLifter(P.host, P.id);
    window.scrollTo(0, 0);
  }
  function popView() {
    if (P.view === 'card' || !P.host) return false;
    P.view = 'card'; P.direct = false;
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
    uiSheet('Wins in the last 7 days', function (sheet, close) {
      if (!wins.length) { sheet.appendChild(el('div', { class: 'ca-empty', html: ic('trophy') + '<b>No PRs in the last 7 days</b><p>Every PR lands here the moment it\u2019s logged.</p>' })); return; }
      sheet.appendChild(uiList(wins.map(function (w) {
        var a = (store().athletes || []).find(function (y) { return y.id === w.id; }) || { name: w.name };
        var sub = w.lifts.length ? w.lifts.map(function (l) { return L0[l] || l; }).join(', ') + ' PR' + (w.lifts.length > 1 ? 's' : '') : '';
        if (w.extra.length) sub = [sub].concat(w.extra).filter(Boolean).join(' \u00b7 ');
        return uiRow({ av: a.name, avUrl: a.avatarUrl, title: a.name, sub: sub, chevron: true,
          onClick: function () { close(); setTimeout(function () { P.pending = 'progress'; P.id = w.id; if (CL() && CL().open) CL().open(w.id); }, 230); } });
      })));
    }, { cls: 'ca-wins-sheet' });
  }
  // Strength's sheet: the rule in one sentence, the team's 8 weeks as the full chart (scrub it for any week), each
  // lift's change, then the people: who moved most over the last 4 weeks (their total, the same window as Home and
  // their own page), who is flat, and who has no 8 weeks yet. A row opens their Progress.
  function openMovers(X) {
    if (typeof uiSheet !== 'function') return;
    X = X || model();
    var S = X.S || summaryModel(X), st = S.strength, T = st.total;
    var row = function (x, sub, close) {
      var a = athleteOf(x.id);
      return uiRow({ av: a.name, avUrl: a.avatarUrl, title: a.name || x.name, sub: sub, chevron: true,
        onClick: function () { close(); setTimeout(function () { P.pending = 'progress'; P.id = x.id; if (CL() && CL().open) CL().open(x.id); }, 230); } });
    };
    var kgTxt = function (kg) { var v = Math.round(kgShow(kg)); return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v) + ' ' + unit(); };
    uiSheet('Strength, last 4 weeks', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ca-sheet-sub' }, 'Each lifter’s best e1RM on each main lift in the last 4 weeks, against their best in the 4 weeks before, added up for the team.'));
      if (T.n) {
        var dk = T.kg;
        var card = el('div', { class: 'ca-sum ca-str is-sheet', html:
          '<div class="ca-sum-head"><b class="ca-sum-num">' + esc(caPct(T.pct)) + '</b><span class="ca-sum-tx"><span class="ca-sum-t">Team e1RM total</span>' +
          '<span class="ca-sum-s">' + esc(kgTxt(dk) + ' in all · ' + plural(T.n, 'lifter')) + '</span></span></div>' + lineHtml(S.line, S.t) + liftChipsHtml(st, true) });
        sheet.appendChild(card);
        wireLine(card);
      }
      var up = st.movers.filter(function (x) { return x.kg > 0.05; }), flat = st.movers.filter(function (x) { return x.kg <= 0.05; });
      if (up.length) {
        sheet.appendChild(el('h3', { class: 'ca-h3' }, 'Moved most'));
        sheet.appendChild(uiList(up.map(function (x) { return row(x, kgTxt(x.kg) + ' e1RM total · ' + caPct(x.pct), close); })));
      }
      if (flat.length) {
        sheet.appendChild(el('h3', { class: 'ca-h3' }, 'Flat or down'));
        sheet.appendChild(uiList(flat.map(function (x) { return row(x, (Math.round(kgShow(x.kg)) ? kgTxt(x.kg) + ' e1RM total' : 'No lift up') + ' · the best of the last 4 weeks against the 4 before', close); })));
      }
      if (st.none.length) {
        sheet.appendChild(el('h3', { class: 'ca-h3' }, 'Not enough logs yet'));
        sheet.appendChild(uiList(st.none.map(function (x) { return row(x, 'Needs a main lift logged in both 4-week windows', close); })));
      }
    }, { cls: 'ca-movers-sheet' });
  }
  // Effort's sheet: the rule in one sentence, the bar with its three parts named and counted (each part a 44 pt
  // key: tap it and the line under the bar says what's in it), then who is running hot by the triage's rule, worst
  // set first. A row opens their page.
  function openHot(X) {
    if (typeof uiSheet !== 'function') return;
    X = X || model();
    var E = (X.S || summaryModel(X)).effort;
    uiSheet('Effort, last 7 days', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ca-sheet-sub' }, 'Every set logged with an RPE, against the RPE you wrote. On target is within half a point of it; harder or easier is a full point or more past it.'));
      if (E.total) {
        var segs = [['easier', 'Easier', E.easier], ['on', 'On target', E.on], ['harder', 'Harder', E.harder]];
        var legend = '<div class="ca-elegend">' + segs.map(function (g) {
          return '<button type="button" class="ca-ekey is-' + g[0] + (g[2] ? '' : ' is-zero') + '" data-eff="' + g[0] + '" aria-pressed="false" aria-label="' + esc(plural(g[2], 'set') + ' ' + g[1].toLowerCase()) + '"><i class="ca-ekey-m" aria-hidden="true"></i><b>' + g[2] + '</b><span>' + esc(g[1].toLowerCase()) + '</span></button>';
        }).join('') + '</div>';
        var card = el('div', { class: 'ca-sum ca-eff is-sheet', html:
          '<div class="ca-sum-head"><b class="ca-sum-num">' + E.on + '<small> of ' + E.total + '</small></b><span class="ca-sum-tx"><span class="ca-sum-t">sets on target</span>' +
          '<span class="ca-sum-s">' + esc(E.over1 ? plural(E.over1, 'set') + ' a full point or more over' : 'None a full point over what you wrote') + '</span></span></div>' +
          effortBar(E, false) + legend + '<p class="ca-readout" data-readout="eff" aria-live="polite"></p>' });
        sheet.appendChild(card);
        card.addEventListener('click', function (e) {
          var k = e.target.closest && e.target.closest('[data-eff]');
          if (k) { pickEffort(card, k.getAttribute('data-eff'), E); return; }
          var bar = e.target.closest && e.target.closest('.ca-ebar');
          if (!bar) return;
          var hit = [].slice.call(bar.querySelectorAll('[data-seg]')).filter(function (g) { var r = g.getBoundingClientRect(); return e.clientX >= r.left - 1 && e.clientX <= r.right + 1; })[0];
          if (hit) pickEffort(card, hit.getAttribute('data-seg'), E);
        });
      }
      sheet.appendChild(el('h3', { class: 'ca-h3' }, 'Running hot'));
      if (!E.hot.length) { sheet.appendChild(el('div', { class: 'ca-empty', html: ic('gauge') + '<b>Nobody is running hot</b><p>No set a full point over what you wrote, and nobody drifting half a point over across 3 or more sets.</p>' })); return; }
      sheet.appendChild(uiList(E.hot.map(function (h) {
        var a = athleteOf(h.id), w = h.worst;
        var sub = h.why === 'over' ? (w.title ? w.title + ' ' : '') + '@' + num(w.felt) + ', you wrote @' + num(w.wrote) + (h.n > 1 ? ' · ' + plural(h.n, 'set') + ' a point or more over' : '')
          : '+' + num(h.avg) + ' RPE across ' + plural(h.count, 'set');
        return uiRow({ av: a.name, avUrl: a.avatarUrl, title: a.name || h.name, sub: sub, chevron: true,
          onClick: function () { close(); setTimeout(function () { openLifter(h.id); }, 230); } });
      })));
    }, { cls: 'ca-hot-sheet' });
  }
  // A day on the week's strip: its column lifts to full colour and the line over the hero says who trained.
  function pickDay(area, b) {
    var card = b.closest('.ca-tw'), S = area._X && area._X.S;
    if (!card || !S) return;
    var last = card.querySelector('.ca-strip.is-last') != null;
    var days = last ? (S.lastStrip || S.strip) : S.strip;
    var d = days.filter(function (x) { return x.iso === b.getAttribute('data-day'); })[0];
    if (!d) return;
    var strip = card.querySelector('.ca-strip');
    card.querySelectorAll('.ca-sday[data-day]').forEach(function (x) { x.classList.toggle('on', x === b); });
    if (strip) {
      var picks = days.filter(function (x) { return !x.future; });
      strip.setAttribute('aria-valuenow', String(Math.max(0, picks.indexOf(d))));
      strip.setAttribute('aria-valuetext', DAYW[d.dow] + ': ' + (d.n ? plural(d.n, 'session') + ', ' + nameList(d.who.map(firstOf), 6) : 'no sessions'));
    }
    var ro = card.querySelector('[data-readout="week"]');
    if (ro) setReadout(ro, dayLine(d, area._X, last));
  }
  // The strip under a finger: the nearest day, picked while the finger moves along it; arrows on a keyboard.
  function wireStrip(area) {
    var strip = area.querySelector('.ca-tw .ca-strip');
    if (!strip || strip._wired) return;
    strip._wired = true;
    var cols = function () { return [].slice.call(strip.querySelectorAll('.ca-sday[data-day]')); };
    var at = function (x) {
      var best = null, bd = Infinity;
      cols().forEach(function (c) { var r = c.getBoundingClientRect(), d = Math.abs(r.left + r.width / 2 - x); if (d < bd) { bd = d; best = c; } });
      return best;
    };
    var down = false;
    strip.addEventListener('pointerdown', function (e) { down = true; try { strip.setPointerCapture(e.pointerId); } catch (x) {} var c = at(e.clientX); if (c) pickDay(area, c); });
    strip.addEventListener('pointermove', function (e) { if (!down) return; var c = at(e.clientX); if (c && !c.classList.contains('on')) pickDay(area, c); });
    strip.addEventListener('pointerup', function () { down = false; });
    strip.addEventListener('pointercancel', function () { down = false; });
    strip.addEventListener('click', function (e) { e.stopPropagation(); var c = e.target.closest && e.target.closest('[data-day]'); if (c) pickDay(area, c); });
    strip.addEventListener('keydown', function (e) {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
      e.preventDefault();
      var cs = cols(), i = cs.indexOf(strip.querySelector('.ca-sday.on'));
      var j = e.key === 'Home' ? 0 : e.key === 'End' ? cs.length - 1 : Math.max(0, Math.min(cs.length - 1, i + (e.key === 'ArrowLeft' ? -1 : 1)));
      if (cs[j]) pickDay(area, cs[j]);
    });
  }
  // A part of the effort bar (in its sheet): it stays lit, the others step back, and the line under the bar says
  // what's in it. The same part again puts the bar back.
  function pickEffort(card, kind, E) {
    if (!card || !E) return;
    var was = card.getAttribute('data-pick');
    var now = was === kind ? '' : kind;
    if (now) card.setAttribute('data-pick', now); else card.removeAttribute('data-pick');
    card.querySelectorAll('[data-eff]').forEach(function (x) { x.setAttribute('aria-pressed', String(x.getAttribute('data-eff') === now)); });
    card.querySelectorAll('[data-seg]').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-seg') === now); });
    var ro = card.querySelector('[data-readout="eff"]');
    if (ro) setReadout(ro, effortReadout(E, now));
  }
  // Readouts change by a short cross-fade (the words, never the layout).
  function setReadout(node, text) {
    if (node.textContent === text) return;
    node.textContent = text;
    if (!hasDom || reducedMotion() || !node.animate) return;
    try { node.animate([{ opacity: 0.45 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }); } catch (e) {}
  }
  // The strength line under a finger (its sheet): the nearest week's total, a hairline at it. Scrubs while the
  // finger moves (pointer capture), and stays on the week it was let go at; a tap outside the line puts it away.
  // The line put away: the hairline goes, the subtitle comes back.
  function lineRest(w) {
    w.classList.remove('is-scrub');
    var sub = w.closest('.ca-str') && w.closest('.ca-str').querySelector('.ca-sum-s');
    if (sub && sub.hasAttribute('data-rest')) { sub.classList.remove('is-read'); setReadout(sub, sub.getAttribute('data-rest')); }
  }
  function wireLine(root) {
    var w = root && root.querySelector('.ca-line-w');
    if (!w || w._wired) return;
    w._wired = true;
    var pts = [];
    try { pts = JSON.parse(w.getAttribute('data-line') || '[]'); } catch (e) { pts = []; }
    if (!pts.length) return;
    // The readout takes the subtitle's place (the way Health reads a chart), so nothing covers the line.
    var hair = w.querySelector('.ca-line-hair'), sel = w.querySelector('.ca-line-sel');
    var sub = w.closest('.ca-str') && w.closest('.ca-str').querySelector('.ca-sum-s');
    if (sub && !sub.hasAttribute('data-rest')) sub.setAttribute('data-rest', sub.textContent);
    var show = function (clientX) {
      var r = w.getBoundingClientRect(), fx = (clientX - r.left) / r.width * 100;
      var best = pts[0], bd = Infinity;
      pts.forEach(function (p) { var d = Math.abs(p[4] - fx); if (d < bd) { bd = d; best = p; } });
      w.classList.add('is-scrub');
      hair.style.left = best[4] + '%';
      sel.style.left = best[4] + '%'; sel.style.top = best[3] + '%';
      if (sub) { sub.classList.add('is-read'); setReadout(sub, 'Week of ' + dayMon(best[2]) + ' · ' + best[1].toLocaleString() + ' ' + unit()); }
    };
    var down = false;
    w.addEventListener('pointerdown', function (e) { down = true; try { w.setPointerCapture(e.pointerId); } catch (x) {} show(e.clientX); });
    w.addEventListener('pointermove', function (e) { if (down) show(e.clientX); });
    w.addEventListener('pointerup', function () { down = false; });
    w.addEventListener('pointercancel', function () { down = false; lineRest(w); });
    var host = root.closest ? (root.closest('.ui-sheet') || root) : root;
    host.addEventListener('pointerdown', function (e) { if (w.classList.contains('is-scrub') && !w.contains(e.target)) lineRest(w); });
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
  // Home's light is the warm fire of the lifter app's Train, at most 9% from above; the one action under it is the
  // owner's crimson with a white label (28 Oct), so the light and the action never read as one.
  try { if (window.SCREEN_ACCENT && !SCREEN_ACCENT.home) SCREEN_ACCENT.home = 'fire'; } catch (e) {}

  window.CoachApp = {
    renderHome: renderHome, renderLifters: renderLifters, renderLifter: renderLifter, refresh: refresh, paintHomeIfShown: paintHomeIfShown,
    openSearch: openSearch, openCheckins: openCheckins, openWins: openWins, openLifters: openLifters, popView: popView, paintBadges: paintBadges,
    lifterView: function () { return P.view; }, enterLifter: function () { P.direct = !!(P.pending && VIEWS[P.pending]); P.view = P.direct ? P.pending : 'card'; P.pending = null; },
    skeletonHtml: skeletonHtml, gate: gate, bootFailed: bootFailed, bootState: bootState,
    ringSvg: caRingSvg, week: caWeek, avHtml: avHtml, faceHtml: faceHtml, ic: ic,
    // pure, for tests
    caTodayLine: caTodayLine, caSev: caSev, caNeedIds: caNeedIds, caLeadJobs: caLeadJobs, caWeek: caWeek, caRingSvg: caRingSvg, caFilterMatch: caFilterMatch,
    caFilterCounts: caFilterCounts, caSortRows: caSortRows, caFaceOrder: caFaceOrder, caStatus: caStatus, caHeadChip: caHeadChip, caBusyLine: caBusyLine, caFixLabel: caFixLabel, caHeroStats: caHeroStats, caHeadline: caHeadline,
    caCheckins: caCheckins, caNextMeet: caNextMeet, caNorm: caNorm, caFocalTitle: caFocalTitle, caFocalDetail: caFocalDetail, caWins: caWins, caIsBehind: caIsBehind, caIsMeetSoon: caIsMeetSoon, NEED_TIER: NEED_TIER,
    caJobFamily: caJobFamily, caFamily: caFamily,
    // Home's summary (pure)
    caDayStrip: caDayStrip, caTotalSeries: caTotalSeries, caTeamStrength: caTeamStrength, caTeamLine: caTeamLine, caEffortOf: caEffortOf,
    caEffortSplit: caEffortSplit, caMeetLane: caMeetLane, caLaneTiers: caLaneTiers, caPct: caPct,
    caIsMeetWeek: caIsMeetWeek, caBehindLine: caBehindLine, caStrengthSeries: caStrengthSeries, caLaneGroups: caLaneGroups, caCountdown: caCountdown,
    openMovers: openMovers, openHot: openHot
  };
})();
