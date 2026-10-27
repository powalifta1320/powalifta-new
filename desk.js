/* =====================================================================
   desk.js: the coach's laptop desk (v2, 2026-10-22)
   ---------------------------------------------------------------------
   html.desk only (at least 1000px wide and not the iPhone app; set by
   the head script in coach.html). Phones and the app never run any of it.

   v2 (spec: vault Specs/Desk + website v2): B's clean dark look, C's
   practical structure. A text sidebar (Today, Roster, Programs, Meets,
   Messages, saved views with counts, Club, Settings, the plan and the
   theme), icons at 1280 and below. Today and the roster are two panes:
   the athletes as plain sentences with a ring of this week's sessions
   (needs-you first, worst first), and the selected athlete's week as one
   lifted this week as session cards (each exercise's sets against what
   was written, video, notes and pain where they happened) and next week
   written in place with suggestions from what was lifted, then the one
   red Publish. The thread and private notes open in a side card on
   demand. The roster switches to the live board (a row per lifter: this
   week's sessions as outcome marks, readiness, RPE drift, e1RM, bodyweight
   against the class, the next meet, pain; a row opens the lifter).
   Every action is a button; keys are accelerators shown in tooltips.

   The logic (reasons, queue, views, next week from RPE) is pure and
   lives in app.js (deskReasons / deskQueue / deskViewMatch /
   deskWeekReview / deskApplyNextWeek, unit-tested). This file draws it.
   Loaded after app.js and before coach.html's own script: everything
   here is a function declaration or a var, and anything of coach.html's
   (user, renderRoster, openAthletePage…) is only touched at call time.
   ===================================================================== */

var _dk = {
  booted: false,
  screen: 'today',          // today | roster | programs | meets | messages | club | settings
  view: null,               // the roster's saved view (DESK_VIEWS key) or null
  search: '',
  sel: null,                // Today: the selected athlete { id, lane }
  rsel: null,               // Roster: the selected athlete (list) / the keyboard row (board)
  rmode: null,              // Roster: 'list' | 'board' (remembered)
  picked: {},               // Roster board: rows ticked for the bulk bar
  wpick: {},                // Today: wins ticked for kudos
  card: null,               // the side card: null | 'thread' | 'notes'
  rows: null,               // last deskRows() result
  queue: null,              // last deskQueue() result
  order: [],                // Today's J/K order: [{ id, lane: 'q' | 'w' }]
  rorder: [],               // Roster's J/K order (ids, as drawn)
  threads: null,            // real accounts: DB.listThreadsForCoach digest
  state: null,              // { week, reviewed, snoozed, winsSeen, times }
  last: null,               // the last E / S, for U (undo)
  wasCaughtUp: null,
  mq: null,
  seen: null,               // the newest logged set per athlete, for the "set landed" pulse
  ws: null,                 // the athlete page's ‹ › list: { ids, label }
  wsPend: {},               // next-week edits waiting on Publish, per athlete
  pbMode: 'athletes',       // Programs' list pane: athletes | templates
  pbTpl: null, pbSearch: '', pbSnap: null, pbInfo: null, pbHead: null,
  msgSel: null, msgFilter: 'all', msgSearch: '', msgOrder: [],
  setSec: null, coachStyle: null
};
var DK_SORT_KEY = 'powa-desk-sort';

function isDesk() {
  if (document.documentElement.classList.contains('native')) return false;
  if (!_dk.mq && window.matchMedia) _dk.mq = window.matchMedia('(min-width: 1000px)');
  return !!(_dk.mq && _dk.mq.matches);
}
window.isDesk = isDesk;

function _dkLS(k, v) {
  try { if (v === undefined) return localStorage.getItem(k); if (v === null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) {}
  return null;
}
function _dkUser() { try { return user || getCurrentUser(); } catch (e) { return getCurrentUser(); } }
function _dkMac() { return /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent || ''); }
function _dkFirst(name) { return String(name || '').trim().split(/\s+/)[0] || 'them'; }
function _dkFormChecks() { try { return _coachFormChecks || []; } catch (e) { return []; } }
function _dkUnread() { try { return _unreadByAthlete || {}; } catch (e) { return {}; } }
// The first match that's on screen (Today's centre stays in the DOM while another screen shows).
function _dkVis(sel) { return Array.prototype.find.call(document.querySelectorAll(sel), function (n) { return n.offsetParent || n.getClientRects().length; }) || null; }
function _dkReduced() { return !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); }

// ---------- icons (house style: 24px stroke, currentColor) ----------
function _dkSvg(d, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; }
var DK_IC = {
  gear: _dkSvg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  spark: _dkSvg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>'),
  search: _dkSvg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>'),
  rail: _dkSvg('<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/>'),
  chevL: _dkSvg('<path d="M15 6l-6 6 6 6"/>', 2.2),
  chevR: _dkSvg('<path d="M9 6l6 6-6 6"/>', 2.2),
  chevD: _dkSvg('<path d="M6 9l6 6 6-6"/>', 2.2),
  download: _dkSvg('<path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>'),
  open: _dkSvg('<path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>'),
  snooze: _dkSvg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M5 3L2 6M19 3l3 3"/>'),
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  key: _dkSvg('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/>'),
  today: _dkSvg('<path d="M4 12h3l2.5-6 5 12 2.5-6h3"/>'),
  roster: _dkSvg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 20a6.5 6.5 0 0 0-2.6-5.2"/>'),
  programs: _dkSvg('<rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M9.5 9.5V20"/>'),
  meets: _dkSvg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4M12 13v4M8.5 20h7"/>'),
  messages: _dkSvg('<path d="M20 12a8 8 0 0 1-11.6 7.1L4 20l1-4.1A8 8 0 1 1 20 12z"/>'),
  clients: _dkSvg('<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M3 6.5A2.5 2.5 0 0 0 5.5 9h13A1.5 1.5 0 0 1 20 10.5V15h-4a2 2 0 0 1 0-4h4"/>'),
  club: _dkSvg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>'),
  sun: _dkSvg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon: _dkSvg('<path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z"/>'),
  note: _dkSvg('<path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4M8.5 12.5h7M8.5 16h5"/>'),
  check: _dkSvg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 2.2),
  x: _dkSvg('<path d="M6 6l12 12M18 6L6 18"/>', 2.1),
  list: _dkSvg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r=".6"/><circle cx="4.5" cy="12" r=".6"/><circle cx="4.5" cy="18" r=".6"/>'),
  board: _dkSvg('<path d="M4 6.5h4M4 12h4M4 17.5h4"/><circle cx="12.5" cy="6.5" r="1.4"/><circle cx="16.5" cy="6.5" r="1.4"/><circle cx="20.5" cy="6.5" r="1.4"/><circle cx="12.5" cy="12" r="1.4"/><circle cx="16.5" cy="12" r="1.4"/><circle cx="12.5" cy="17.5" r="1.4"/><circle cx="16.5" cy="17.5" r="1.4"/><circle cx="20.5" cy="17.5" r="1.4"/>'),
  prog: _dkSvg('<path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19V8"/>'),
  plus: _dkSvg('<path d="M12 5v14M5 12h14"/>', 2.1),
  send: _dkSvg('<path d="M4 12l16-8-6 16-2.5-6.5z"/><path d="M11.5 13.5L20 4"/>'),
  ai: _dkSvg('<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>'),
  pain: _dkSvg('<path d="M12 3.5l9 16H3z"/><path d="M12 10v4.2M12 17h.01"/>'),
  video: _dkSvg('<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="M16 10.5l5-3v9l-5-3z"/>'),
  trophy: _dkSvg('<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M12 13v4M8.5 20h7"/>')
};

// ---------- small builders ----------
function dkAv(a, cls) {
  var name = (a && a.name) || '?';
  var av = el('span', { class: 'ui-av dk-av av-h' + avatarHue(name) + (cls ? ' ' + cls : ''), 'data-name': name, 'aria-hidden': 'true' }, initials(name));
  if (a && a.avatarUrl) av.innerHTML = '<img src="' + escHtml(a.avatarUrl) + '" alt="">';
  return av;
}
// The avatar inside a ring of this week's sessions (B): done over planned, green as it closes.
// A lifter training right now gets the live dot.
function dkRingAv(r, size) {
  var a = r.athlete, st = r.status || {}, s = st.sessions || { done: 0, planned: 0 };
  var n = Math.max(s.planned || 0, s.done || 0);
  var frac = n ? Math.min(1, (s.done || 0) / n) : 0;
  var w = el('span', { class: 'dk-ring-av' + (size ? ' is-' + size : '') + (frac >= 1 ? ' is-full' : '') });
  var R = 21, C = 2 * Math.PI * R;
  w.innerHTML = '<svg viewBox="0 0 48 48" aria-hidden="true"><circle class="dk-ring-bg" cx="24" cy="24" r="' + R + '"/>' +
    (n ? '<circle class="dk-ring-fg" cx="24" cy="24" r="' + R + '" stroke-dasharray="' + C.toFixed(2) + '" stroke-dashoffset="' + (C * (1 - frac)).toFixed(2) + '"/>' : '') + '</svg>';
  w.appendChild(dkAv(a));
  if (r.live) w.appendChild(el('span', { class: 'dk-live' }));
  w.title = n ? (s.done || 0) + ' of ' + n + ' sessions this week' : 'No sessions planned this week';
  return w;
}
function dkChip(text, tone) { return el('span', { class: 'dk-chip t-' + (tone || 'info') }, text); }
function dkKbd(k) { return el('kbd', { class: 'dk-kbd' }, k); }
// An absent value draws nothing: the slot stays empty, a screen reader still hears why.
function dkNil(why) { return el('span', { class: 'dk-nil' }, why || 'None'); }
// A button. opts.kbd is an accelerator: it lives in the tooltip (and aria-keyshortcuts), never on
// the button itself. opts.tone: 'primary' (the one red) | 'ink' | 'quiet' | 'line' (default).
function dkBtn(label, opts) {
  opts = opts || {};
  var b = el('button', { type: 'button', class: 'dk-btn' + (opts.primary ? ' is-primary' : '') + (opts.cls ? ' ' + opts.cls : '') });
  if (opts.icon) b.insertAdjacentHTML('beforeend', opts.icon);
  b.appendChild(el('span', { class: 'dk-btn-l' }, label));
  if (opts.count != null) b.appendChild(el('span', { class: 'dk-btn-n', 'aria-hidden': 'true' }, String(opts.count)));
  // The words can fold away in a narrow pane: the name stays for assistive tech.
  b.setAttribute('aria-label', label + (opts.count != null ? ', ' + opts.count : ''));
  dkTip(b, opts.title || (opts.kbd ? label : ''), opts.kbd);
  if (opts.kbd) b.setAttribute('aria-keyshortcuts', String(opts.kbd).replace(/^⌘/, 'Meta+'));
  if (opts.onClick) b.addEventListener('click', opts.onClick);
  return b;
}
function dkIconBtn(icon, label, onClick, kbd) {
  var b = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': label, html: icon });
  dkTip(b, label, kbd);
  if (onClick) b.addEventListener('click', onClick);
  return b;
}
function dkSpark(values, cls) {
  var v = (values || []).filter(function (n) { return isFinite(n); });
  if (v.length < 2) return '';
  var W = 56, H = 18, min = Math.min.apply(null, v), max = Math.max.apply(null, v), span = (max - min) || 1;
  var d = v.map(function (n, i) { return (i ? 'L' : 'M') + (i / (v.length - 1) * (W - 2) + 1).toFixed(1) + ' ' + (H - 2 - (n - min) / span * (H - 4)).toFixed(1); }).join(' ');
  return '<svg class="dk-spark ' + (cls || '') + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true"><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>';
}
function dkWt(kg) { var v = kgToDisplay(kg); return v == null ? '–' : String(Math.round(v)); }
function dkAgoShort(ago) { return ago == null ? '–' : ago <= 0 ? 'Today' : ago + 'd'; }
// One block label everywhere: "Strength · wk 1/3" (a trailing " Block" says nothing).
function deskBlockLabel(prog, week) {
  if (!prog) return 'No program';
  var name = String(prog.name || 'Program').replace(/\s+block$/i, '') || 'Program';
  return name + (week ? ' · ' + (week.finished ? 'done' : 'wk ' + week.number + '/' + week.total) : '');
}
function dkBlockText(st) { return deskBlockLabel(st.program, st.week); }

// ---------- one plain sentence per athlete (no chip clusters) ----------
// Text with its numbers in ink weight: "Pain · Low back · Deadlift · 6/10 · meet in 9d".
function dkRich(text) {
  var span = el('span', { class: 'dk-rich' });
  String(text || '').split(/((?:[+−-]?\d[\d.,]*(?:\/\d+)?(?:\s?(?:kg|lb|d|h|wk))?)|(?:@\d+(?:\.\d)?))/).forEach(function (p, i) {
    if (!p) return;
    span.appendChild(i % 2 ? el('b', {}, p) : document.createTextNode(p));
  });
  return span;
}
function _dkLowerLead(t) { return /^(Meet|Note|Notes|Message|Quiet|Missed|Block|No|Form|Slept|Soreness|Last|Said|Nothing|Waiting|Answer)\b/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
function dkSentence(r, lane) {
  if (lane === 'w') return r.wins.map(function (w, i) { return i ? _dkLowerLead(w.text) : w.text; }).join(' · ');
  if (r.reasons.length) {
    // One line, never an ellipsis: the worst reason written short, a second only if it fits, then +n.
    var a0 = dkShortReason(r.reasons[0]), parts = [a0], used = 1;
    var a1 = r.reasons[1] ? _dkLowerLead(dkShortReason(r.reasons[1])) : '';
    if (a1 && a0.length + a1.length <= 26) { parts.push(a1); used = 2; }
    if (r.reasons.length > used) parts.push('+' + (r.reasons.length - used));
    return parts.join(' · ');
  }
  if (r.live) return 'Training now · ' + r.live.sets + (r.live.sets === 1 ? ' set in' : ' sets in');
  if (r.wins.length) return r.wins[0].text;
  var st = r.status, s = st.sessions;
  if (!st.program) return 'No program yet';
  return 'On plan · ' + dkBlockText(st) + (s.planned ? ' · ' + s.done + ' of ' + s.planned + ' this week' : '');
}

// A reason in a few words: "Pain · Low back · Deadlift · 6/10 · 2nd this week" → "Low back 6/10, 2nd this week".
function dkShortReason(x) {
  var t = String((x && x.text) || ''), p = t.split(' · ');
  if (x.type === 'pain' && p.length >= 3) {
    var sev = p.find(function (y) { return /\d+\/10/.test(y); }), wk = p.find(function (y) { return /this week|times?/.test(y); });
    return p[1] + (sev ? ' ' + sev : '') + (wk ? ', ' + wk : '');
  }
  if (x.type === 'readiness' && p.length >= 2) return 'Readiness low, ' + p[1].replace(/^resting HR/i, 'RHR');
  if (x.type === 'weight') return t.replace(/ over class$/, ' over').replace(/ under class$/, ' under');
  return p.length > 2 ? p.slice(0, 2).join(' · ') : t;
}
// The whole of it, for the tooltip.
function dkFullReasons(r) { return r.reasons.map(function (x, i) { return i ? _dkLowerLead(x.text) : x.text; }).join(' · '); }
// ---------- tooltips: the keys live here (instant once one is showing) ----------
function dkTip(node, text, kbd) {
  if (!node || (!text && !kbd)) return node;
  node.dataset.tip = text || '';
  if (kbd) node.dataset.kbd = kbd;
  node.removeAttribute('title');
  return node;
}
function dkTipInit() {
  if (_dk.tipOn) return;
  _dk.tipOn = true;
  var tip = el('div', { class: 'dk-tip', role: 'tooltip', 'aria-hidden': 'true' });
  document.body.appendChild(tip);
  var timer = null, shownAt = 0, cur = null;
  var hide = function () { clearTimeout(timer); if (cur) { cur = null; tip.classList.remove('on'); shownAt = Date.now(); } };
  var show = function (t) {
    if (!t.isConnected || !isDesk()) return;
    // A sidebar item says its name only when the sidebar is folded to icons.
    if (t.classList.contains('dk-tip-min') && !document.documentElement.classList.contains('rail-min')) return;
    tip.innerHTML = '';
    if (t.dataset.tip) tip.appendChild(el('span', {}, t.dataset.tip));
    if (t.dataset.kbd) t.dataset.kbd.split('  ').forEach(function (k) { tip.appendChild(dkKbd(k)); });
    var r = t.getBoundingClientRect();
    tip.style.left = '0px'; tip.style.top = '0px';
    tip.classList.add('on');
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var below = r.bottom + 8 + th < window.innerHeight;
    tip.style.left = Math.max(8, Math.min(window.innerWidth - tw - 8, r.left + r.width / 2 - tw / 2)) + 'px';
    tip.style.top = (below ? r.bottom + 8 : r.top - th - 8) + 'px';
    cur = t;
  };
  document.addEventListener('pointerover', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip],[data-kbd]');
    if (!t || t === cur) return;
    if (!t.dataset.tip && !t.dataset.kbd) return;
    clearTimeout(timer);
    var warm = cur || Date.now() - shownAt < 450;
    if (cur) { cur = null; }
    if (warm) { tip.classList.add('is-instant'); show(t); }
    else { tip.classList.remove('is-instant'); timer = setTimeout(function () { show(t); }, 480); }
  });
  document.addEventListener('pointerout', function (e) {
    var t = e.target.closest && e.target.closest('[data-tip],[data-kbd]');
    if (t && (!e.relatedTarget || !t.contains(e.relatedTarget))) hide();
  });
  ['pointerdown', 'keydown', 'scroll', 'wheel'].forEach(function (ev) { document.addEventListener(ev, hide, true); });
}

// ---------- state: reviews and snoozes (per coach, per training week) ----------
function _dkStateKey() { var u = _dkUser(); return 'powa-desk-review-' + (u ? u.id : 'x'); }
function dkState() {
  var mon = _monISO(todayISO());
  if (_dk.state && _dk.state.week === mon) return _dk.state;
  var s = null;
  if (!window._demoMode) { try { s = JSON.parse(_dkLS(_dkStateKey()) || 'null'); } catch (e) { s = null; } }
  if (!s || s.week !== mon) {
    // A new training week: reviews start over; a snooze into the new week still holds.
    var keep = {};
    if (s && s.snoozed) Object.keys(s.snoozed).forEach(function (k) { if (s.snoozed[k] > todayISO()) keep[k] = s.snoozed[k]; });
    s = { week: mon, reviewed: {}, snoozed: keep, winsSeen: {}, handled: {}, times: [] };
  }
  s.reviewed = s.reviewed || {}; s.snoozed = s.snoozed || {}; s.winsSeen = s.winsSeen || {}; s.handled = s.handled || {}; s.times = s.times || [];
  _dk.state = s;
  return s;
}
function dkSaveState() {
  // The demo keeps it in memory: every visit starts with the full queue, and nothing is written.
  if (window._demoMode || !_dk.state) return;
  _dkLS(_dkStateKey(), JSON.stringify(_dk.state));
}

// ---------- the model ----------
// The desk's reasons are app.js deskReasons, plus what coachAthleteStatus already knows and the
// queue should see: an open pain report (it replaces the check-in's "Pain…", one fact once),
// a cut off pace for the class, and low readiness from shared Apple Health.
function dkAugment(r) {
  var st = r.status, out = r.reasons.slice();
  if (st.pain && st.pain.open) {
    out = out.filter(function (x) { return x.type !== 'pain'; });
    out.push({ type: 'pain', group: 1, text: st.pain.text, tone: st.pain.severity >= 3 ? 'alert' : 'warn', detail: st.pain.count >= 2 ? 'Reported ' + st.pain.count + ' times in two weeks' : 'Reported from training', painReport: st.pain.report });
  }
  if (st.cut && st.cut.offPace && !out.some(function (x) { return x.type === 'weight'; })) out.push({ type: 'offpace', group: 2, text: st.cut.flag || 'Cut off pace', tone: 'warn', detail: st.cut.line || '' });
  if (st.readiness && st.readiness.state === 'low' && st.readiness.text) out.push({ type: 'readiness', group: 6, text: st.readiness.text, tone: 'info', detail: 'From their shared Apple Health' });
  out.sort(function (a, b) { return a.group - b.group; });
  r.reasons = out;
  r.drift = dkWeekDrift(st);   // the board reads drift from the same week its marks show
  return r;
}
// RPE drift across the program week the board's marks show (null until a set in it is logged).
function dkWeekDrift(st) {
  var prog = st && st.program, wk = st && st.week, W = prog && wk && prog.weeks && prog.weeks[wk.idx];
  if (!W) return null;
  var d = [];
  (W.days || []).forEach(function (day) { (day.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (x) {
    if (!x.completed || x.attempt || x.rir || x.actualRpe == null || x.actualRpe === '' || x.rpe == null || x.rpe === '') return;
    var top = x.rpeHi != null && Number(x.rpeHi) > Number(x.rpe) ? Number(x.rpeHi) : Number(x.rpe);
    var v = Number(x.actualRpe) - top;
    if (isFinite(v)) d.push(v);
  }); }); });
  if (!d.length) return null;
  return { avg: Math.round(d.reduce(function (a, b) { return a + b; }, 0) / d.length * 10) / 10, n: d.length };
}
function dkRowsFresh() {
  var u = _dkUser();
  _dk.rows = u ? deskRows(u.id, { threads: _dk.threads || undefined, formChecks: _dkFormChecks() }).map(dkAugment) : [];
  var st = dkState();
  _dk.queue = deskQueue(_dk.rows, { reviewed: st.reviewed, snoozed: st.snoozed, winsSeen: st.winsSeen, handled: st.handled });
  return _dk.rows;
}
// The coach acted on them (published next week, sent a reply): Today's bar counts them as handled
// now. They stay in the list until E, so nothing jumps under the coach mid-review. The reasons
// are signed as they stood when the coach acted, so a NEW reason un-handles them.
function dkNoteHandled(athleteId, via) {
  var st = dkState();
  var r = dkRow(athleteId);
  if (!r || !r.reasons.length) return;
  st.handled[athleteId] = { at: Date.now(), sig: deskReasonSig(r.reasons), via: via };
  dkSaveState();
}
function dkRow(id) { return (_dk.rows || []).find(function (r) { return r.athlete.id === id; }) || null; }
// The newest logged set per athlete: a new one since the last paint is a set that just landed.
function dkLanded() {
  var now = {}, out = {};
  (Store.get().programs || []).forEach(function (p) {
    (p.weeks || []).forEach(function (w) { (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) {
      if (s.completed && s.completedAt && String(s.completedAt) > (now[p.athleteId] || '')) now[p.athleteId] = String(s.completedAt);
    }); }); }); });
  });
  if (_dk.seen) Object.keys(now).forEach(function (k) { if (_dk.seen[k] && now[k] > _dk.seen[k]) out[k] = 1; });
  _dk.seen = now;
  return out;
}


// =====================================================================
// BOOT, ROUTING, SHELL
// =====================================================================
// coach.html calls this once at boot on every device: a window that grows past 1000px becomes the
// desk, one that shrinks goes back to the phone layout. The iPhone app never matches.
function deskWatch() {
  if (document.documentElement.classList.contains('native')) return;
  isDesk();
  if (_dk.mq && _dk.mq.addEventListener && !_dk.watching) {
    _dk.watching = true;
    _dk.mq.addEventListener('change', dkOnResize);
    // Below 1200px the sidebar folds to icons, unless the coach opened it.
    if (window.matchMedia) { _dk.mqRail = matchMedia('(max-width: 1199px)'); if (_dk.mqRail.addEventListener) _dk.mqRail.addEventListener('change', dkAutoRail); }
  }
  if (isDesk()) deskBoot();
}
// The sidebar's open / folded choice. v2 keeps it under a new key: the W1a one ('powa-desk-rail')
// was set when 1280 folded by default, and kept a 1440 screen on icons.
var DK_RAIL_KEY = 'powa-desk-rail2';
function dkAutoRail() {
  if (_dkLS('powa-desk-rail') != null) _dkLS('powa-desk-rail', null);
  var pref = _dkLS(DK_RAIL_KEY);
  var small = !!(_dk.mqRail && _dk.mqRail.matches);
  document.documentElement.classList.toggle('rail-min', pref === 'min' || (pref !== 'open' && small));
}
function deskBoot() {
  if (!isDesk()) return;
  document.documentElement.classList.add('desk');
  dkAutoRail();
  if (!_dk.booted) {
    _dk.booted = true;
    // The demo's meet day joins the roster's meets from the first paint, so every count agrees.
    if (window._demoMode && window.MeetDay && MeetDay.deskDemo) { try { MeetDay.deskDemo(); } catch (e) {} }
    dkBuildRail();
    dkBuildCtx();
    dkBuildMeetsPane();
    if (typeof dsBuildPanes === 'function') dsBuildPanes();   // desk-season.js: Teams
    dkTipInit();
    document.addEventListener('keydown', dkOnKey);
    // A legacy tab (the program builder, messages, club, You) opened from anywhere keeps the
    // rail in step and says where it is in the address bar.
    document.querySelectorAll('.sidebar-tab').forEach(function (b) {
      b.addEventListener('click', function () { if (isDesk()) dkOnTab(b.dataset.tab); });
    });
    window.addEventListener('themechange', function () { if (isDesk()) dkPaintRail(); });
    // Real accounts: who wrote last in each thread (the demo reads its seeded messages).
    dkFetchThreads(0);
  }
  deskRoute(true);
}
// The address bar → the screen. #today · #roster · #roster?view=pain · #roster?mode=board ·
// #programs · #teams · #meets · #messages · #clients · #club · #settings. (#athlete=ID is coach.html's athlete page.)
function deskRoute(first) {
  var h = (location.hash || '').replace(/^#/, '');
  if (/^athlete=/.test(h)) return;   // coach.html opens the athlete page itself
  var m = /^(today|roster|programs|teams|meets|messages|clients|club|settings)(?:\?(.*))?$/.exec(h);
  var screen = m ? m[1] : 'today';
  var q = {};
  if (m && m[2]) m[2].split('&').forEach(function (kv) { var p = kv.split('='); q[p[0]] = p[1] || ''; });
  var view = q.view && DESK_VIEWS.some(function (v) { return v.key === q.view; }) ? q.view : null;
  if (q.mode === 'sheet') q.mode = 'board';   // an old link
  if (q.mode === 'board' || q.mode === 'list' || q.mode === 'calendar') { if (q.mode === 'board' && _dk.rmode !== 'board') _dk.rsel = null; _dk.rmode = q.mode; }
  if (first && screen !== 'today' && screen !== 'roster' && screen !== 'meets' && screen !== 'teams' && screen !== 'clients') {
    // A legacy screen at boot: the demo boots while coach.html's script is still running, and the
    // builder reads lets declared further down it. A microtask runs once that script is done,
    // before the first paint.
    queueMicrotask(function () { deskGo(screen, { view: view, noPush: true }); });
    return;
  }
  deskGo(screen, { view: view, noPush: true, replace: first && !m });
}
var DK_TAB_FOR = { roster: 'athletes', programs: 'program', messages: 'messages', club: 'club', settings: 'you' };
// clients is a desk screen of its own (clients-ui.js draws the same pane on the phone, under You).
var DK_SCREEN_FOR = { athletes: 'roster', program: 'programs', templates: 'programs', messages: 'messages', club: 'club', you: 'settings', progress: 'settings', marketplace: 'settings', clients: 'clients' };
function deskGo(screen, opts) {
  opts = opts || {};
  if (!isDesk()) return;
  closeDkMenus();
  if (screen === 'meets' && !dkPlannedMeets().length) screen = 'roster';
  if (screen !== _dk.screen) _dk.card = null;   // the side card belongs to the screen it opened on
  // The board opens with no row picked out.
  if (screen === 'roster' && _dk.screen !== 'roster' && dkRMode() === 'board') _dk.rsel = null;
  _dk.screen = screen;
  _dk.ws = null;
  if (screen === 'roster') _dk.view = opts.view || null;
  dkSetHash(screen, opts);
  if (screen === 'teams' && typeof dsRenderTeams !== 'function') screen = 'programs';
  if (screen === 'clients' && !window.ClientsUI) screen = 'roster';
  if (screen === 'today' || screen === 'meets' || screen === 'teams' || screen === 'clients') {
    document.querySelectorAll('.sidebar-tab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('[data-pane]').forEach(function (p) { p.classList.toggle('hidden', p.dataset.pane !== screen); });
    document.body.dataset.accent = 'fire';
    document.body.dataset.screen = screen;
    if (screen === 'today') renderDeskToday(); else if (screen === 'teams') dsRenderTeams(); else if (screen === 'clients') ClientsUI.render(document.getElementById('clientsArea')); else dkRenderMeets();
    try { syncPaneBack(); } catch (e) {}
  } else {
    var tab = document.getElementById('tab-' + DK_TAB_FOR[screen]);
    _dk.fromGo = true;
    if (tab) tab.click();   // the legacy handler renders it (the roster draws through deskRenderRoster)
    _dk.fromGo = false;
  }
  dkSyncCtx();
  if (screen === 'programs') dkPaintInspector();
  if (screen === 'messages') dkPaintMsgCtx();
  dkPaintRail();
  // Keys work straight away: focus leaves the rail button for the screen's list.
  if (!opts.noPush && document.activeElement && document.activeElement.closest && document.activeElement.closest('.dk-rail')) {
    var to = screen === 'today' ? document.querySelector('#deskToday .dk-qrow.is-sel, #deskToday .dk-list')
      : screen === 'roster' ? document.querySelector('#rosterArea .dk-qrow.is-sel, #rosterArea .dk-bd-row.is-sel, #rosterArea .dk-list')
      : screen === 'messages' ? document.querySelector('#messagesArea .dk-msg-row.is-sel') : null;
    if (to) to.focus({ preventScroll: true }); else document.activeElement.blur();
  }
}
function dkSetHash(screen, opts) {
  var hash = '#' + screen + (screen === 'roster' && _dk.view ? '?view=' + _dk.view : '');
  if (location.hash === hash) return;
  try {
    if (opts.noPush || opts.replace) history.replaceState(history.state, '', hash);
    else history.pushState({ desk: screen }, '', hash);
  } catch (e) {}
}
function dkOnTab(tab) {
  var screen = DK_SCREEN_FOR[tab];
  if (!screen) return;
  if (screen !== 'programs') _dk.pbInfo = null;
  if (!_dk.fromGo) {
    if (screen !== _dk.screen) _dk.card = null;
    _dk.screen = screen;
    if (screen === 'roster') _dk.view = null;
    dkSetHash(screen, {});
  }
  dkSyncCtx();
  dkPaintRail();
}
// coach.html calls this when the athlete page opens: the rail keeps the screen it came from.
function deskOnAthletePage() { if (!isDesk()) return; closeDkMenus(); dkSyncCtx(); dkPaintCard(); dkPaintRail(); }
function deskBackLabel() { return ({ today: 'Today', roster: 'Lifters', meets: 'Meets', teams: 'Teams', messages: 'Messages', clients: 'Clients', programs: 'Programs', club: 'Club', settings: 'Settings' })[_dk.screen] || 'Roster'; }
function dkOnResize() {
  var on = isDesk();
  document.documentElement.classList.toggle('desk', on);
  if (on) { deskBoot(); return; }
  closeDkMenus();
  document.querySelectorAll('.dk-veil').forEach(function (v) { if (v._close) v._close(); else v.remove(); });
  document.documentElement.classList.remove('ctx-show', 'ctx-card');
  dkCtxClear();
  // Back to the phone layout: Today, Meets and the athlete page have no place there, so land on
  // the roster; a roster already showing redraws as the phone's.
  var t = document.querySelector('[data-pane="today"]'), ap = document.querySelector('[data-pane="athlete"]'), mp = document.querySelector('[data-pane="meets"]:not(.hidden), [data-pane="teams"]:not(.hidden)');
  var tab = document.getElementById('tab-athletes');
  var act = document.querySelector('.sidebar-tab.active');
  _dk.pbInfo = null;
  if ((t && !t.classList.contains('hidden')) || (ap && !ap.classList.contains('hidden')) || (mp && !mp.classList.contains('hidden'))) { if (tab) tab.click(); }
  // Programs, Messages and Settings were drawn as desk screens: draw them again as the phone's.
  else if (act && /^(program|messages|you)$/.test(act.dataset.tab)) act.click();
  else {
    var ra = document.querySelector('[data-pane="athletes"]');
    if (ra && !ra.classList.contains('hidden') && typeof renderRoster === 'function') { try { renderRoster(); } catch (e) {} }
  }
}
// The side pane. On Today, the roster and an athlete's page it's the card (thread or private
// notes), opened on demand and closed with ×/Esc. Messages keeps the athlete beside the thread,
// Programs the inspector; ] hides those (remembered).
function _dkOnPage() { return !!document.querySelector('[data-pane="athlete"]:not(.hidden)'); }
function dkCardAid() {
  if (_dkOnPage()) return window._apAthlete || null;
  if (_dk.screen === 'today') return _dk.sel ? _dk.sel.id : null;
  if (_dk.screen === 'roster') return _dk.rsel || null;
  return null;
}
function dkSyncCtx(off) {
  var root = document.documentElement;
  var onPage = _dkOnPage();
  var scr = _dk.screen, has = false, card = false;
  if (off) has = false;
  else if (onPage || scr === 'today' || scr === 'roster') { card = true; has = !!_dk.card && !!dkCardAid(); }
  else if (scr === 'messages') has = !!(_dk.msgSel && document.querySelector('#messagesArea .dk-msg-list') && !document.querySelector('[data-pane="messages"].hidden'));
  // Programs: the inspector, on demand (⋯ › Details or ]) for the exercise in focus.
  else if (scr === 'programs') has = !!_dk.pbInfo && !!_dk.pbInsp && _dk.pbMode !== 'templates' && deskPbView() === 'sessions' && !!document.querySelector('#programArea .dk-bx-wk') && !document.querySelector('[data-pane="program"].hidden');
  var was = root.classList.contains('ctx-show');
  root.classList.toggle('ctx-show', has && (card || !root.classList.contains('ctx-off')));
  root.classList.toggle('ctx-card', card && has);
  // The grid's cell font and padding change with the inspector: re-measure the columns.
  if (scr === 'programs' && was !== root.classList.contains('ctx-show')) deskGridFit();
  var ctx = document.getElementById('deskCtx');
  if (ctx) ctx.hidden = !root.classList.contains('ctx-show');
  // A hidden pane holds no live thread: its realtime channel closes with it.
  if (!root.classList.contains('ctx-show')) dkCtxClear();
}
function dkCtxClear() {
  var host = dkCtxHost();
  if (!host) return;
  clearTimeout(_dk.ctxT);
  if (host._msgCleanupBox && host._msgCleanupBox._msgCleanup) { try { host._msgCleanupBox._msgCleanup(); } catch (e) {} }
  host._msgCleanupBox = null;
  host.dataset.aid = '';
  host.innerHTML = '';
}
// A realtime event (a message, a form check, a logged set): repaint in place, then re-read who
// wrote last.
function deskRefresh() {
  if (!isDesk() || !_dk.booted) return;
  dkRepaint();
  dkFetchThreads(1200);
}
// LIVE (app.js liveFlush, one event per burst): a set landed, a program or a check-in changed.
// Repaint in place (no thread re-read: a logged set doesn't change messages); each athlete whose set
// just landed gets the set-landed pulse (dkLanded reads _dk.seen).
window.addEventListener('powa:live', function (e) {
  var d = (e && e.detail) || {};
  if (_dk.seen) (d.landed || []).forEach(function (id) { _dk.seen[id] = '0'; });
  dkRepaint();
});
function dkRepaint() {
  if (!isDesk() || !_dk.booted) return;
  var onPage = _dkOnPage();
  if (_dk.screen === 'today' && !onPage && !document.querySelector('[data-pane="today"].hidden')) {
    var listHadFocus = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#deskToday .dk-list'));
    renderDeskToday({ keepCentre: true });
    if (listHadFocus) { var sel = document.querySelector('#deskToday .dk-qrow.is-sel, #deskToday .dk-list'); if (sel) sel.focus({ preventScroll: true }); }
    return;
  }
  dkRowsFresh();
  // The roster's head (and its search box) stays; only the rows and the counts repaint.
  if (_dk.screen === 'roster' && !onPage && document.querySelector('#rosterArea .dk-rbody')) { dkPaintRosterBody({ keepCentre: true }); dkPaintRmeta(); }
  if (_dk.screen === 'meets' && !onPage) dkRenderMeets();
  if (_dk.screen === 'clients' && !onPage && window.ClientsUI && !document.querySelector('.ui-sheet-veil')) ClientsUI.render(document.getElementById('clientsArea'));
  if (_dk.screen === 'teams' && !onPage && typeof dsRenderTeams === 'function' && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#deskTeams input'))) dsRenderTeams();
  // Messages: the list repaints (who wrote last, unread); the open thread updates itself.
  if (_dk.screen === 'messages' && !onPage && document.querySelector('#messagesArea .dk-msg-list')) dkPaintMsgList();
  // Programs: a set landing shows on the open block (its bar grows in), never under the coach's cursor.
  if (_dk.screen === 'programs' && !onPage) dkPbLive();
  dkPaintRail();
}
// Real accounts: the thread digest behind "Message 31h". Debounced; the demo reads Store live.
function dkFetchThreads(delay) {
  if (window._demoMode || !window.DB || !DB.listThreadsForCoach) return;
  clearTimeout(_dk.threadT);
  _dk.threadT = setTimeout(function () {
    var u = _dkUser();
    if (!u) return;
    DB.listThreadsForCoach(u.id).then(function (rows) { _dk.threads = deskThreadDigest(null, rows || []); dkRepaint(); }).catch(function () {});
  }, delay || 0);
}
// The coach just wrote to them: their "Message" reason clears now, not at the next fetch.
function dkNoteSent(athleteId, body) {
  if (!_dk.threads) return;
  var u = _dkUser();
  _dk.threads[athleteId] = { athleteId: athleteId, lastAt: new Date().toISOString(), lastSenderId: u && u.id, lastBody: body || '' };
}

// ---------- the sidebar ----------
function dkRailItem(key, label, icon, onClick, opts) {
  opts = opts || {};
  var b = el('button', { class: 'dk-item' + (opts.cls ? ' ' + opts.cls : ''), type: 'button' });
  if (opts.go) b.dataset.go = key;
  b.innerHTML = icon;
  b.appendChild(el('span', { class: 'dk-item-label' }, label));
  if (opts.count) b.appendChild(el('span', { class: 'dk-count', 'data-count': key }));
  // Folded to icons the label leaves: the tooltip says it (and its key, if any).
  b.dataset.tip = label;
  if (opts.kbd) b.dataset.kbd = opts.kbd;
  b.classList.add('dk-tip-min');
  b.addEventListener('click', onClick);
  return b;
}
function dkBuildRail() {
  if (document.getElementById('deskRail')) return;
  var rail = el('aside', { class: 'dk-rail', id: 'deskRail', 'aria-label': 'Coach desk' });
  var u = _dkUser();
  var top = el('div', { class: 'dk-rail-top' });
  var brand = el('a', { class: 'dk-brand', href: 'coach.html' + (window._demoMode ? location.search : ''), 'aria-label': 'POWALIFTA, Today' });
  brand.innerHTML = BRAND_MARK + '<span class="brand-word">POWALIFTA</span>';
  brand.addEventListener('click', function (e) { e.preventDefault(); deskGo('today'); });
  top.appendChild(brand);
  var fold = dkIconBtn(DK_IC.rail, 'Fold the sidebar', dkToggleRail, '[');
  fold.classList.add('dk-fold');
  top.appendChild(fold);
  rail.appendChild(top);
  // ⌘K as a visible button: find an athlete, a screen or an action.
  var find = el('button', { type: 'button', class: 'dk-find', 'aria-label': 'Find an athlete or an action', html: DK_IC.search });
  find.appendChild(el('span', { class: 'dk-item-label' }, 'Find'));
  find.appendChild(dkKbd(_dkMac() ? '⌘K' : 'Ctrl K'));
  find.dataset.tip = 'Find an athlete or an action';
  find.dataset.kbd = _dkMac() ? '⌘K' : 'Ctrl K';
  find.classList.add('dk-tip-min');
  find.addEventListener('click', function () { openDeskPalette(); });
  rail.appendChild(find);

  var nav = el('nav', { class: 'dk-nav', 'aria-label': 'Work' });
  nav.appendChild(dkRailItem('today', 'Today', DK_IC.today, function () { deskGo('today'); }, { go: true, count: true }));
  nav.appendChild(dkRailItem('roster', 'Lifters', DK_IC.roster, function () { deskGo('roster'); }, { go: true, count: true }));
  nav.appendChild(dkRailItem('programs', 'Programs', DK_IC.programs, function () { deskGo('programs'); }, { go: true }));
  // Room for Programs' sub-entries (Teams, from the team-programs track): it draws into this slot
  // through window.deskProgramsSubnav(slot) when it lands. Nothing shows until then.
  var sub = el('div', { class: 'dk-nav-sub', 'data-slot': 'programs' });
  nav.appendChild(sub);
  nav.appendChild(dkRailItem('meets', 'Meets', DK_IC.meets, function () { deskGo('meets'); }, { go: true, count: true }));
  nav.appendChild(dkRailItem('messages', 'Messages', DK_IC.messages, function () { deskGo('messages'); }, { go: true, count: true }));
  // Clients (clients-ui.js): packages and payments; the count is who's overdue.
  if (window.ClientsUI) nav.appendChild(dkRailItem('clients', 'Clients', DK_IC.clients, function () { deskGo('clients'); }, { go: true, count: true }));
  rail.appendChild(nav);

  var views = el('div', { class: 'dk-views', role: 'group', 'aria-label': 'Saved views' });
  views.appendChild(el('div', { class: 'dk-sub' }, 'Views'));
  // "Needs you" is Today's count: not a second time here.
  DESK_VIEWS.filter(function (v) { return v.key !== 'needs'; }).forEach(function (v) {
    var b = el('button', { class: 'dk-item dk-view', type: 'button', 'data-view': v.key });
    b.appendChild(el('span', { class: 'dk-item-label' }, v.label));
    b.appendChild(el('span', { class: 'dk-count', 'data-vcount': v.key }));
    b.addEventListener('click', function () { deskGo('roster', { view: _dk.screen === 'roster' && _dk.view === v.key ? null : v.key }); });
    views.appendChild(b);
  });
  rail.appendChild(views);

  var foot = el('div', { class: 'dk-rail-foot' });
  foot.appendChild(dkRailItem('club', 'Club', DK_IC.club, function () { deskGo('club'); }, { go: true }));
  foot.appendChild(dkRailItem('settings', 'Settings', DK_IC.gear, function () { deskGo('settings'); }, { go: true }));
  foot.appendChild(dkRailItem('ai', 'Ask AI', DK_IC.ai, function () { if (typeof openAIAssistant === 'function') openAIAssistant(); }, { cls: 'dk-item-quiet' }));
  var theme = dkRailItem('theme', 'Light mode', DK_IC.sun, function () { toggleTheme(); }, { cls: 'dk-item-quiet dk-theme' });
  foot.appendChild(theme);
  if (window._demoMode) {
    // The demo's banner, docked: one quiet row instead of a pill over the table.
    var demo = el('div', { class: 'dk-demo' });
    demo.appendChild(el('span', { class: 'dk-demo-text' }, el('b', {}, 'Live demo'), el('span', {}, 'Nothing saves')));
    demo.appendChild(el('a', { class: 'dk-demo-link', href: 'index.html' }, 'Start yours'));
    foot.appendChild(demo);
  }
  var me = el('button', { class: 'dk-me', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false' });
  me.appendChild(dkAv(u || { name: 'You' }, 'dk-me-av'));
  var who = el('span', { class: 'dk-me-who' });
  who.appendChild(el('span', { class: 'dk-me-name' }, (u && u.name) || 'You'));
  who.appendChild(el('span', { class: 'dk-plan', 'data-plan': '' }));
  me.appendChild(who);
  me.insertAdjacentHTML('beforeend', '<span class="dk-me-more">' + DK_IC.more + '</span>');
  me.dataset.tip = (u && u.name) || 'You';
  me.classList.add('dk-tip-min');
  me.addEventListener('click', function (e) { e.stopPropagation(); dkMeMenu(me); });
  foot.appendChild(me);
  rail.appendChild(foot);
  document.body.appendChild(rail);
  dkPaintSubnav(true);
}
// Programs' sub-entries (Teams): drawn by window.deskProgramsSubnav(slot) whenever it exists. The
// rail asks again on every paint while the slot is empty (the hook may load after the rail), and
// window.deskRepaintSubnav() redraws it on demand (its data arrived, or changed).
function dkPaintSubnav(force) {
  var slot = document.querySelector('#deskRail .dk-nav-sub[data-slot="programs"]');
  if (!slot || typeof window.deskProgramsSubnav !== 'function') return;
  if (!force && slot.childNodes.length) return;
  slot.innerHTML = '';
  try { window.deskProgramsSubnav(slot); } catch (e) { console.warn('deskProgramsSubnav', e); }
}
window.deskRepaintSubnav = function () { dkPaintSubnav(true); };
function dkPaintRail() {
  var rail = document.getElementById('deskRail');
  if (!rail) return;
  if (!_dk.rows) dkRowsFresh();
  var rows = _dk.rows || [], q = _dk.queue;
  var athletePage = _dkOnPage();
  dkPaintSubnav(false);
  rail.querySelectorAll('[data-go]').forEach(function (b) {
    var on = b.dataset.go === _dk.screen && !(_dk.screen === 'roster' && _dk.view && !athletePage);
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  rail.querySelectorAll('[data-view]').forEach(function (b) {
    var on = _dk.screen === 'roster' && _dk.view === b.dataset.view && !athletePage;
    b.classList.toggle('on', on);
    if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  var unread = 0, ur = _dkUnread();
  if (window._demoMode) {
    var u0 = _dkUser();
    (Store.get().messages || []).forEach(function (m) { if (u0 && m.senderId !== u0.id && !m.readAt) unread++; });
  } else Object.keys(ur).forEach(function (k) { unread += ur[k] || 0; });
  var meets = dkPlannedMeets();
  var counts = { today: q ? q.queue.length : 0, roster: rows.length, messages: unread, meets: meets.length, clients: window.ClientsUI ? ClientsUI.overdueCount() : 0 };
  var tipFor = { today: function (n) { return n + ' need you'; }, messages: function (n) { return n + ' unread'; }, roster: function (n) { return n + (n === 1 ? ' athlete' : ' athletes'); }, meets: function (n) { return n + (n === 1 ? ' meet' : ' meets'); }, clients: function (n) { return n + ' overdue'; } };
  rail.querySelectorAll('[data-count]').forEach(function (c) {
    var n = counts[c.dataset.count];
    c.textContent = n ? String(n) : '';
    // Today's queue and unread messages need the coach; the others are just counts.
    c.classList.toggle('is-hot', (c.dataset.count === 'today' || c.dataset.count === 'messages' || c.dataset.count === 'clients') && n > 0);
    // Folded to icons the count is a dot: the tooltip says the number.
    var item = c.closest('.dk-item'), lab = item && item.querySelector('.dk-item-label');
    if (item && lab) item.dataset.tip = lab.textContent + (n && tipFor[c.dataset.count] ? ' · ' + tipFor[c.dataset.count](n) : '');
  });
  // Meets shows only when there's a meet on the calendar.
  var mb = rail.querySelector('[data-go="meets"]');
  if (mb) mb.hidden = !meets.length;
  var now = Date.now();
  var views = rail.querySelector('.dk-views');
  if (views) views.hidden = !rows.length;   // nobody yet: no empty views to count
  rail.querySelectorAll('[data-vcount]').forEach(function (c) {
    var n = deskViewCount(rows, c.dataset.vcount, now);
    c.textContent = String(n);
    c.closest('.dk-view').classList.toggle('is-zero', !n);
    c.classList.toggle('t-alert', c.dataset.vcount === 'pain' && n > 0);
  });
  var light = document.documentElement.getAttribute('data-theme') === 'light';
  var th = rail.querySelector('.dk-theme');
  if (th) {
    th.innerHTML = light ? DK_IC.moon : DK_IC.sun;
    th.appendChild(el('span', { class: 'dk-item-label' }, light ? 'Dark mode' : 'Light mode'));
    th.dataset.tip = light ? 'Dark mode' : 'Light mode';
  }
  var plan = rail.querySelector('[data-plan]');
  if (plan) {
    var t = getCurrentTier(), lim = getCurrentTierLimit(), u = _dkUser();
    var n = u ? getAthleteCount(u.id) : rows.length;
    plan.textContent = (TIER_LABELS[t] || t) + (lim >= 9999 ? ' · ' + n + ' athletes' : ' · ' + n + '/' + lim);
  }
}
function dkToggleRail() {
  var on = document.documentElement.classList.toggle('rail-min');
  _dkLS(DK_RAIL_KEY, on ? 'min' : 'open');
}
function dkToggleCtx() {
  var root = document.documentElement;
  // The card (Today, the roster, an athlete): ] opens or closes it.
  if (_dkOnPage() || _dk.screen === 'today' || _dk.screen === 'roster') {
    if (_dk.card) dkCloseCard(); else dkOpenCard('thread', { noFocus: true });
    return;
  }
  // Programs: ] opens or closes the inspector on the exercise in focus (else the first one).
  if (_dk.screen === 'programs') {
    _dk.pbInsp = !_dk.pbInsp;
    if (_dk.pbInsp) {
      root.classList.remove('ctx-off');
      if (!_dk.pbInfo) { var f = _dkVis('#programArea .dk-bx-wk input.dk-bx-in'); if (f) _dk.pbInfo = { athleteId: dkPbAthleteId(), wi: +f.dataset.wi, di: +f.dataset.di, ei: +f.dataset.ei, label: '' }; }
    }
    dkSyncCtx();
    if (_dk.pbInsp && dkCtxReady()) dkPaintInspector();
    else if (_dk.pbInsp) { _dk.pbInsp = false; toast('Open a program’s Sessions to see an exercise’s details'); }
    return;
  }
  var off = root.classList.toggle('ctx-off');
  _dkLS('powa-desk-ctx', off ? 'off' : 'on');
  dkSyncCtx();
  if (off) return;
  if (_dk.screen === 'messages') dkPaintMsgCtx();
  if (_dk.screen === 'programs') dkPaintInspector();
}
function dkToggleDensity() {
  var root = document.documentElement;
  var compact = root.getAttribute('data-density') !== 'compact';
  if (compact) root.setAttribute('data-density', 'compact'); else root.removeAttribute('data-density');
  _dkLS('powa-desk-density', compact ? 'compact' : null);
  document.querySelectorAll('.dk-dens').forEach(function (b) { b.setAttribute('aria-pressed', String(compact)); });
}

// ---------- menus (the avatar menu, the column chooser): one at a time ----------
function closeDkMenus() { document.querySelectorAll('.dk-menu').forEach(function (m) { if (m._close) m._close(); else m.remove(); }); }
function dkPopMenu(anchor, items, opts) {
  closeDkMenus();
  opts = opts || {};
  var m = el('div', { class: 'dk-menu', role: 'menu' });
  items.forEach(function (it) {
    if (it === '-') { m.appendChild(el('div', { class: 'dk-menu-sep', role: 'separator' })); return; }
    if (it.node) { m.appendChild(it.node); return; }
    var b = el('button', { type: 'button', class: 'dk-menu-item' + (it.danger ? ' is-danger' : ''), role: it.check != null ? 'menuitemcheckbox' : 'menuitem' });
    if (it.id) b.id = it.id;
    if (it.check != null) { b.setAttribute('aria-checked', String(!!it.check)); b.insertAdjacentHTML('beforeend', '<span class="dk-check">' + (it.check ? ICONS.check : '') + '</span>'); }
    b.appendChild(el('span', { class: 'dk-menu-label' }, it.label));
    if (it.hint) b.appendChild(el('span', { class: 'dk-menu-hint' }, it.hint));
    b.addEventListener('click', function (e) { e.stopPropagation(); if (!it.keep) close(); it.run && it.run(b); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  var r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  var left = opts.alignRight ? r.right - mw : r.left;
  var up = opts.above || r.bottom + 6 + mh > window.innerHeight - 8;
  var top = up ? r.top - mh - 6 : r.bottom + 6;
  m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, left)) + 'px';
  m.style.top = Math.max(8, Math.min(window.innerHeight - mh - 8, top)) + 'px';
  m.style.transformOrigin = (opts.alignRight ? 'right ' : 'left ') + (up ? 'bottom' : 'top');
  anchor.setAttribute('aria-expanded', 'true');
  var closed = false;
  function close() {
    closed = true;
    clearTimeout(armT);
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey, true);
    anchor.setAttribute('aria-expanded', 'false');
    m.remove();
  }
  function outside(e) { if (!m.contains(e.target) && !anchor.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); anchor.focus(); } }
  m._close = close;
  var armT = setTimeout(function () { if (!closed) document.addEventListener('click', outside, true); }, 0);
  document.addEventListener('keydown', onKey, true);
  var first = m.querySelector('button');
  if (first) first.focus({ preventScroll: true });
  return m;
}
function dkMeMenu(anchor) {
  var compact = document.documentElement.getAttribute('data-density') === 'compact';
  dkPopMenu(anchor, [
    { label: 'Show weights in ' + (getUnit() === 'kg' ? 'lb' : 'kg'), run: function () { toggleUnit(); } },
    { label: compact ? 'Comfortable rows' : 'Compact rows', run: dkToggleDensity },
    '-',
    { label: 'Command palette', hint: _dkMac() ? '⌘K' : 'Ctrl K', run: openDeskPalette },
    { label: 'Keyboard shortcuts', hint: '?', run: openDeskKeys },
    '-',
    { label: 'Log out', run: function () { logout(); } }
  ], { above: true });
}

// ---------- the side card: the thread or private notes, on demand ----------
function dkBuildCtx() {
  if (document.getElementById('deskCtx')) return;
  var ctx = el('aside', { class: 'dk-ctx', id: 'deskCtx', 'aria-label': 'Details', hidden: '' });
  document.body.appendChild(ctx);
}
function dkCtxHost() { return document.getElementById('deskCtx'); }
function dkCtxReady() { return document.documentElement.classList.contains('ctx-show'); }
// opts.peek: the thread only previews (the card followed J/K): nothing is marked read, and no
// "Seen" goes to the athlete, until the coach clicks in it or focuses the composer.
function dkThreadInto(host, a, opts) {
  opts = opts || {};
  var u = _dkUser();
  var box = el('div', { class: 'dk-thread' });
  host.appendChild(box);
  var onRead = function () {
    var un = _dkUnread();
    if (un[a.id]) { un[a.id] = 0; if (typeof refreshUnreadBadges === 'function') { try { refreshUnreadBadges(); } catch (e) {} } }
    dkPaintRail();
  };
  renderMessageThread(box, { coachId: u.id, athleteId: a.id, viewerId: u.id, otherName: _dkFirst(a.name),
    markRead: !opts.peek, onRead: onRead, emptyText: opts.emptyText,
    onSent: function (m) { dkNoteHandled(a.id, 'reply'); dkNoteSent(a.id, m && m.body); setTimeout(function () { dkRepaint(); dkWsAsksRefresh(a.id); }, 0); } });
  if (opts.focus) dkFocusComposer();
  return box;
}
function dkFocusComposer() {
  var tries = 0;
  (function f() {
    var ta = document.querySelector('#deskCtx .msg-input');
    if (ta) { ta.focus(); return; }
    if (++tries < 20) setTimeout(f, 40);
  })();
}
// Open the card on a tab ('thread' | 'notes'). opts.compose: start a new private note.
function dkOpenCard(tab, opts) {
  opts = opts || {};
  if (!dkCardAid()) return;
  var was = _dk.card;
  _dk.card = tab || 'thread';
  dkSyncCtx();
  dkPaintCard({ force: true, intent: !opts.noFocus });
  dkPaintCardButtons();
  var host = dkCtxHost();
  if (host && !was && !_dkReduced()) { host.classList.remove('is-in'); void host.offsetWidth; host.classList.add('is-in'); }
  if (_dk.card === 'thread' && !opts.noFocus) dkFocusComposer();
  if (_dk.card === 'notes' && opts.compose) { var box = host && host.querySelector('.dk-pn'); if (box && box._compose) box._compose(); }
}
function dkCloseCard() {
  _dk.card = null;
  dkSyncCtx();
  dkPaintCardButtons();
  var back = _dk.screen === 'today' ? document.querySelector('#deskToday .dk-qrow.is-sel') : _dk.screen === 'roster' ? document.querySelector('#rosterArea .dk-qrow.is-sel, #rosterArea .dk-bd-row.is-sel') : null;
  if (back && !_dkOnPage()) back.focus({ preventScroll: true });
}
// The workspace's Message / Notes buttons say which tab is open.
function dkPaintCardButtons() {
  document.querySelectorAll('[data-card]').forEach(function (b) { b.setAttribute('aria-pressed', String(_dk.card === b.dataset.card)); });
}
function dkPaintCard(opts) {
  opts = opts || {};
  var host = dkCtxHost();
  if (!host) return;
  var aid = dkCardAid();
  if (!_dk.card || !aid || !dkCtxReady()) { if (host.dataset.aid) dkCtxClear(); return; }
  var key = 'card:' + aid + ':' + _dk.card;
  // The same card already open (a background refresh): keep it, and whatever is being typed.
  if (!opts.force && host.dataset.aid === key) return;
  dkCtxClear();
  var r = dkRow(aid) || (dkRowsFresh(), dkRow(aid));
  if (!r) return;
  var a = r.athlete;
  host.dataset.aid = key;
  var head = el('div', { class: 'dk-card-head' });
  head.appendChild(dkAv(a, 'is-sm'));
  head.appendChild(el('div', { class: 'dk-card-who' }, el('b', {}, a.name), el('span', {}, _dk.card === 'thread' ? (function () { var th = _dkThreadLast(aid); return th ? 'Last message ' + _dkAgoTime(th.lastAt) : 'No messages yet'; })() : 'Only you see these')));
  head.appendChild(dkIconBtn(DK_IC.x, 'Close', dkCloseCard, 'Esc'));
  host.appendChild(head);
  var tabs = el('div', { class: 'dk-seg dk-card-tabs', role: 'tablist', 'aria-label': 'Card' });
  [['thread', 'Messages'], ['notes', 'Private notes']].forEach(function (x) {
    var on = _dk.card === x[0];
    var b = el('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'tab', 'aria-selected': String(on) }, x[1]);
    dkTip(b, '', x[0] === 'thread' ? 'R' : 'N');
    b.addEventListener('click', function () { if (!on) dkOpenCard(x[0]); });
    tabs.appendChild(b);
  });
  host.appendChild(tabs);
  if (_dk.card === 'notes') {
    var nb = dkNotesBox(aid);
    nb.classList.add('is-card');
    host.appendChild(nb);
    return;
  }
  // Opened on purpose: the thread is read. Following J/K: a peek until the coach touches it.
  var mount = function () {
    if (host.dataset.aid !== key || !dkCtxReady()) return;
    host._msgCleanupBox = dkThreadInto(host, a, { peek: !opts.intent, emptyText: dkReplyPrompt(r) });
  };
  if (opts.intent || opts.now) mount(); else _dk.ctxT = setTimeout(mount, 200);
}


// =====================================================================
// TODAY: who needs me (left), their week (right)
// =====================================================================
// FLIP: rows that moved since the last paint glide to their new place (a reorder reads as one).
function _dkFlipBefore(scope) {
  var m = {};
  (scope ? scope.querySelectorAll('.dk-qrow[data-id], .dk-bd-row[data-id]') : []).forEach(function (n) { m[n.dataset.id + (n.dataset.lane || '')] = n.getBoundingClientRect().top; });
  return m;
}
function _dkFlipAfter(scope, before) {
  if (!scope || _dkReduced()) return;
  scope.querySelectorAll('.dk-qrow[data-id], .dk-bd-row[data-id]').forEach(function (n) {
    var k = n.dataset.id + (n.dataset.lane || ''), was = before[k];
    if (was == null) return;
    var dy = was - n.getBoundingClientRect().top;
    if (Math.abs(dy) < 2) return;
    n.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  });
}
function renderDeskToday(opts) {
  opts = opts || {};
  var host = document.getElementById('deskToday');
  if (!host) return;
  // Home (coach-home.js) draws Today as the roster summary; ?oldtoday=1 keeps the old list + workspace.
  if (window.CoachHome && !/\boldtoday=1\b/.test(location.search)) { CoachHome.renderDesk(host); dkSyncCtx(true); dkPaintRail(); return; }
  host.classList.remove('ch-host', 'loaded');
  dkRowsFresh();
  var landed = dkLanded();
  var rows = _dk.rows, q = _dk.queue;
  var oldList = host.querySelector('.dk-list');
  var before = _dkFlipBefore(oldList);
  var listScroll = oldList ? oldList.scrollTop : 0;
  host.classList.toggle('is-setup', !rows.length);
  if (!rows.length) {
    // Nobody yet: Today is the first run (how do you coach, three steps, a sample roster).
    host.innerHTML = '';
    var c = el('div', { class: 'dk-setup' });
    try { c.appendChild(dkFirstRun()); } catch (e) { console.warn('dkFirstRun', e); }
    host.appendChild(c);
    _dk.order = []; _dk.sel = null;
    dkSyncCtx(true); dkPaintRail();
    return;
  }
  if (q.queue.length) _dk.wasCaughtUp = false;
  _dk.order = q.queue.map(function (r) { return { id: r.athlete.id, lane: 'q' }; })
    .concat(q.wins.map(function (r) { return { id: r.athlete.id, lane: 'w' }; }));
  var ids = _dk.order.map(function (o) { return o.id + o.lane; });
  var prevSel = _dk.sel ? _dk.sel.id + _dk.sel.lane : null;
  if (!_dk.sel || ids.indexOf(_dk.sel.id + _dk.sel.lane) < 0) _dk.sel = q.queue.length ? { id: q.queue[0].athlete.id, lane: 'q' } : null;

  var list = el('div', { class: 'dk-list', role: 'listbox', 'aria-label': 'Who needs you', tabindex: '-1' });
  var head = el('div', { class: 'dk-list-head' });
  var h = el('div', { class: 'dk-title-row' });
  h.appendChild(el('h1', { class: 'dk-h1' }, 'Today'));
  h.appendChild(el('span', { class: 'dk-date' }, new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })));
  head.appendChild(h);
  if (q.total) head.appendChild(dkProgressBar(q));
  // The last Done / Snooze, undoable from a button too (U).
  if (_dk.last && dkRow(_dk.last.id)) {
    var lr = dkRow(_dk.last.id);
    var ub = dkBtn('Undo: ' + _dkFirst(lr.athlete.name) + (_dk.last.lane === 'w' ? ' seen' : _dk.last.kind === 'snooze' ? ' snoozed' : ' done'), { cls: 'dk-btn-sm is-quiet dk-undo', kbd: 'U', onClick: dkUndo });
    head.appendChild(ub);
  }
  list.appendChild(head);

  if (q.queue.length) {
    var ql = el('div', { class: 'dk-lane', role: 'group', 'aria-label': 'Needs you' });
    ql.appendChild(el('div', { class: 'dk-lane-head' }, el('span', { class: 'dk-lane-title' }, 'Needs you'), el('span', { class: 'dk-lane-count' }, String(q.queue.length))));
    q.queue.forEach(function (r, i) { ql.appendChild(dkQueueRow(r, 'q', { landed: landed[r.athlete.id], i: i })); });
    list.appendChild(ql);
  }
  if (q.snoozed.length) list.appendChild(el('div', { class: 'dk-list-foot' }, q.snoozed.length + ' snoozed till tomorrow'));
  if (q.wins.length) {
    var wl = el('div', { class: 'dk-lane dk-wins' + (Object.keys(_dk.wpick).some(function (k) { return _dk.wpick[k]; }) ? ' has-picks' : ''), role: 'group', 'aria-label': 'Wins' });
    var wh = el('div', { class: 'dk-lane-head' });
    wh.appendChild(el('span', { class: 'dk-lane-title' }, 'Wins'));
    wh.appendChild(el('span', { class: 'dk-lane-count' }, String(q.wins.length)));
    var picked = Object.keys(_dk.wpick).filter(function (k) { return _dk.wpick[k]; }).length;
    wh.appendChild(dkBtn(picked ? 'Kudos to ' + picked : 'Send kudos', { cls: 'dk-btn-sm is-quiet', onClick: dkKudos, kbd: _dkMac() ? '⌘⇧K' : 'Ctrl Shift K' }));
    wl.appendChild(wh);
    q.wins.forEach(function (r) { wl.appendChild(dkQueueRow(r, 'w', { landed: landed[r.athlete.id] })); });
    list.appendChild(wl);
  }
  // Everyone else, as one line: "12 more on plan · Dev training now".
  var inQ = {};
  q.queue.forEach(function (r) { inQ[r.athlete.id] = 1; });
  q.wins.forEach(function (r) { inQ[r.athlete.id] = 1; });
  var rest = rows.filter(function (r) { return !inQ[r.athlete.id]; });
  if (rest.length) list.appendChild(dkMoreRow(rest, 'on plan'));

  if (opts.keepCentre && oldList && _dk.sel && prevSel === _dk.sel.id + _dk.sel.lane && document.getElementById('deskTodayCentre')) {
    oldList.replaceWith(list);
    list.scrollTop = listScroll;
  } else {
    host.innerHTML = '';
    var centre = el('div', { class: 'dk-centre', id: 'deskTodayCentre' });
    host.appendChild(list);
    host.appendChild(centre);
    list.scrollTop = listScroll;
    dkPaintTodayCentre();
  }
  _dkFlipAfter(list, before);
  dkSyncCtx(!_dk.sel);
  dkPaintCard();
  dkPaintRail();
  var selEl = list.querySelector('.dk-qrow.is-sel');
  if (selEl && !opts.keepCentre) selEl.scrollIntoView({ block: 'nearest' });
}
// "12 more on plan" with their faces; who's training right now is named. Opens the roster.
function dkMoreRow(rest, what) {
  var live = rest.filter(function (r) { return r.live; });
  var b = el('button', { type: 'button', class: 'dk-more' });
  var stack = el('span', { class: 'dk-stack', 'aria-hidden': 'true' });
  rest.slice(0, 4).forEach(function (r) { stack.appendChild(dkAv(r.athlete, 'is-sm')); });
  b.appendChild(stack);
  var t = el('span', { class: 'dk-more-t' });
  t.appendChild(el('b', {}, rest.length + ' more ' + what));
  if (live.length) t.appendChild(el('span', { class: 'is-live' }, live.map(function (r) { return _dkFirst(r.athlete.name); }).slice(0, 2).join(' and ') + (live.length > 2 ? ' and ' + (live.length - 2) + ' more' : '') + ' training now'));
  else t.appendChild(el('span', {}, 'See them in the roster'));
  b.appendChild(t);
  b.insertAdjacentHTML('beforeend', DK_IC.chevR);
  b.addEventListener('click', function () { deskGo('roster'); });
  return b;
}
// Today's bar counts real work, one athlete each: done (E), acted on (published next week or
// replied), snoozed. Nothing is counted for opening a row. Up to 24 it's one segment per athlete,
// so 0 of N reads as N empty slots, not a stray divider; past that, one continuous line.
function dkProgressBar(q) {
  var total = q.total, snz = q.snoozed.length, act = Math.min(total, q.progress - snz);
  var all = q.progress >= total;
  var label = all ? 'All ' + total + ' handled' : q.progress + ' of ' + total + ' handled';
  var vt = label + (snz ? ', ' + snz + ' snoozed' : '');
  var bar = el('div', { class: 'dk-progress' + (all ? ' is-all' : '') + (q.progress ? '' : ' is-zero'), role: 'progressbar',
    'aria-label': 'Today', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(q.progress), 'aria-valuetext': vt });
  var line = el('div', { class: 'dk-progress-line' + (total <= 24 ? ' is-seg' : ''), 'aria-hidden': 'true' });
  if (total <= 24) {
    for (var i = 0; i < total; i++) line.appendChild(el('i', { class: i < act ? 'is-done' : i < act + snz ? 'is-snz' : '' }));
  } else {
    line.appendChild(el('i', { class: 'is-done', style: 'width:' + (100 * act / total).toFixed(2) + '%' }));
    if (snz) line.appendChild(el('i', { class: 'is-snz', style: 'width:' + (100 * snz / total).toFixed(2) + '%' }));
  }
  bar.appendChild(line);
  var txt = el('div', { class: 'dk-progress-text' });
  txt.appendChild(el('span', {}, label));
  var left = q.queue.length - q.handled.length;
  if (snz || (left && q.progress)) txt.appendChild(el('span', { class: 'dk-progress-sub' }, [left && q.progress ? left + ' to go' : '', snz ? snz + ' snoozed' : ''].filter(Boolean).join(' · ')));
  bar.appendChild(txt);
  return bar;
}
// One athlete in the list: the ring, the name, how fresh, and one plain sentence.
function dkQueueRow(r, lane, opts) {
  opts = opts || {};
  var a = r.athlete;
  var on = _dk.sel && _dk.sel.id === a.id && _dk.sel.lane === lane;
  var row = el('div', { class: 'dk-qrow' + (on ? ' is-sel' : '') + (lane === 'w' && _dk.wpick[a.id] ? ' is-picked' : '') + (opts.landed ? ' is-landed' : ''), role: 'option', 'aria-selected': String(!!on), 'data-id': a.id, 'data-lane': lane, tabindex: on ? '0' : '-1' });
  if (lane === 'w') {
    var cb = el('input', { type: 'checkbox', class: 'dk-cb', 'aria-label': 'Select ' + a.name + ' for kudos', tabindex: '-1' });
    cb.checked = !!_dk.wpick[a.id];
    cb.addEventListener('click', function (e) { e.stopPropagation(); _dk.wpick[a.id] = cb.checked; renderDeskToday({ keepCentre: true }); });
    row.appendChild(cb);
  }
  row.appendChild(dkRingAv(r));
  row.appendChild(dkRowMain(r, lane, lane === 'q' && _dk.queue && _dk.queue.handled.indexOf(r) >= 0 ? (dkState().handled[a.id] || {}).via : null));
  row.addEventListener('click', function () { dkSelect(a.id, lane); });
  row.addEventListener('dblclick', function () { openAthletePage(a.id); });
  return row;
}
function dkRowMain(r, lane, handledVia) {
  var main = el('div', { class: 'dk-qmain' });
  var top = el('div', { class: 'dk-qtop' });
  top.appendChild(el('span', { class: 'dk-qname' }, r.athlete.name));
  var un = _dkUnread()[r.athlete.id];
  if (un) top.appendChild(el('span', { class: 'dk-unread', 'aria-label': un + ' unread' }, String(un)));
  var sentence = dkSentence(r, lane);
  top.appendChild(dkRowTag(r, lane, handledVia, sentence));
  main.appendChild(top);
  main.appendChild(dkQLine(r, lane, sentence));
  return main;
}
// The row's one line: a dot in the status colour, the status itself in ink, the rest in the
// secondary ink; one line with an ellipsis, the whole sentence in the tooltip.
function dkQLine(r, lane, sentence) {
  var tone = lane === 'w' ? 'win' : r.reasons.length ? (r.reasons[0].tone || 'info') : r.live ? 'live' : '';
  var line = el('div', { class: 'dk-qline' + (tone ? ' t-' + tone : '') });
  if (tone) line.appendChild(el('i', { class: 'dk-qline-dot', 'aria-hidden': 'true' }));
  var t = el('span', { class: 'dk-qline-t' });
  var lead = lane === 'w' ? (r.wins[0] && r.wins[0].text) : r.reasons.length ? dkShortReason(r.reasons[0]) : '';
  if (lead && sentence.indexOf(lead) === 0) {
    var leadEl = dkRich(lead);
    leadEl.classList.add('dk-qline-lead');
    t.appendChild(leadEl);
    if (sentence.length > lead.length) t.appendChild(dkRich(sentence.slice(lead.length)));
  } else t.appendChild(dkRich(sentence));
  line.appendChild(t);
  dkTip(line, lane !== 'w' && r.reasons.length ? dkFullReasons(r) : sentence);
  return line;
}
// The row's right-hand tag: a draft waiting on Publish, handled, live, the meet, or last trained.
function dkRowTag(r, lane, handledVia, sentence) {
  var pn = lane !== 'w' ? dkPendCount(r.athlete.id) : 0;
  if (pn) return el('span', { class: 'dk-qago is-draft', title: pn + (pn === 1 ? ' change' : ' changes') + ' to next week, not published yet' }, 'Draft · ' + pn);
  if (handledVia) return el('span', { class: 'dk-qago is-handled', html: DK_IC.check }, el('span', {}, handledVia === 'apply' ? 'Week sent' : 'Replied'));
  if (r.live) return el('span', { class: 'dk-qago is-live' }, 'Now');
  // The meet once: when the sentence already names it, the tag says when they last trained.
  if (r.meet && r.meet.days <= 56 && !/\bmeet\b/i.test(sentence)) return el('span', { class: 'dk-qago is-meet' }, r.meet.days <= 0 ? 'Meet today' : r.meet.days <= 14 ? 'Meet ' + r.meet.days + 'd' : 'Meet ' + Math.ceil(r.meet.days / 7) + 'w');
  if (r.status.ago == null) return el('span', { class: 'dk-qago dk-nil' }, 'Not trained yet');
  return el('span', { class: 'dk-qago' }, dkAgoShort(r.status.ago));
}
// A draft changed: the list rows' tags follow without a repaint.
function dkPaintRowTags(aid) {
  var r = dkRow(aid);
  if (!r) return;
  document.querySelectorAll('.dk-qrow[data-id="' + CSS.escape(aid) + '"]').forEach(function (row) {
    var lane = row.dataset.lane || 'r';
    if (lane === 'w') return;
    var old = row.querySelector('.dk-qago');
    if (!old) return;
    var hv = row.closest('#deskToday') && lane === 'q' && _dk.queue && _dk.queue.handled.indexOf(r) >= 0 ? (dkState().handled[aid] || {}).via : null;
    old.replaceWith(dkRowTag(r, lane, hv, dkSentence(r, lane)));
  });
}
function dkSelect(id, lane, fromKey) {
  _dk.sel = { id: id, lane: lane };
  document.querySelectorAll('#deskToday .dk-qrow').forEach(function (r) {
    var on = r.dataset.id === id && r.dataset.lane === lane;
    r.classList.toggle('is-sel', on);
    r.setAttribute('aria-selected', String(on));
    r.tabIndex = on ? 0 : -1;
    if (on) { r.scrollIntoView({ block: 'nearest' }); if (fromKey) r.focus({ preventScroll: true }); }
  });
  dkPaintTodayCentre({ swap: !fromKey });
  dkSyncCtx(false);
  dkPaintCard();
}
function dkMove(step) {
  if (!_dk.order.length) return;
  var i = _dk.sel ? _dk.order.findIndex(function (o) { return o.id === _dk.sel.id && o.lane === _dk.sel.lane; }) : -1;
  var n = Math.max(0, Math.min(_dk.order.length - 1, i + step));
  if (i < 0) n = step > 0 ? 0 : _dk.order.length - 1;
  dkSelect(_dk.order[n].id, _dk.order[n].lane, true);
}
// E: done for this week. S: snooze till tomorrow. The athlete drops out and the next opens.
function dkMark(kind, opts) {
  if (!_dk.sel) return;
  var r = dkRow(_dk.sel.id);
  if (!r) return;
  // Done with a draft of next week still waiting: it would never reach them. Ask first.
  var pn = kind !== 'snooze' && _dk.sel.lane === 'q' && !(opts && opts.force) ? dkPendCount(r.athlete.id) : 0;
  if (pn) { dkDraftAsk(r, pn); return; }
  var st = dkState();
  var lane = _dk.sel.lane;
  var i = _dk.order.findIndex(function (o) { return o.id === _dk.sel.id && o.lane === lane; });
  var prev = { kind: kind, id: r.athlete.id, lane: lane, reviewed: st.reviewed[r.athlete.id], snoozed: st.snoozed[r.athlete.id], win: st.winsSeen[r.athlete.id] };
  if (lane === 'w') st.winsSeen[r.athlete.id] = 1;
  else if (kind === 'snooze') st.snoozed[r.athlete.id] = _addDaysISO(todayISO(), 1);
  else { st.reviewed[r.athlete.id] = { at: Date.now(), sig: deskReasonSig(r.reasons) }; st.times.push(Date.now()); }
  _dk.last = prev;
  dkSaveState();
  var next = _dk.order[i + 1] && _dk.order[i + 1].lane === lane ? _dk.order[i + 1] : null;
  _dk.sel = next;
  renderDeskToday();
  if (!next && _dk.sel === null && _dk.queue.queue.length && lane === 'q') dkSelect(_dk.queue.queue[0].athlete.id, 'q');
  toast(lane === 'w' ? 'Seen' : kind === 'snooze' ? _dkFirst(r.athlete.name) + ' snoozed till tomorrow · U to undo' : _dkFirst(r.athlete.name) + ' done for this week · U to undo');
}
function dkDraftAsk(r, n) {
  var aid = r.athlete.id;
  var prog = dkProgOf(aid), rev = prog ? deskWeekReview(prog) : null;
  var wk = rev && rev.nextIdx >= 0 ? (prog.weeks[rev.nextIdx].number || rev.nextIdx + 1) : '';
  var anchor = _dkVis('.dk-ws[data-aid="' + CSS.escape(aid) + '"] .dk-ws-bar .dk-btn') || _dkVis('.dk-pub[data-aid="' + CSS.escape(aid) + '"] .dk-btn');
  var items = [
    { label: 'Publish week ' + wk + ' and mark done', run: function () {
      dkWsApply(aid);
      if (dkPendCount(aid)) return;
      dkMark('done', { force: true });
      toast('Week ' + wk + ' published' + (window._demoMode ? ' in the demo' : '') + '. ' + _dkFirst(r.athlete.name) + ' done for this week · U to undo');
    } },
    { label: 'Discard the draft and mark done', danger: true, run: function () { dkPendDrop(aid); dkMark('done', { force: true }); } },
    '-',
    { label: 'Keep editing', run: function () { var i = _dkVis('.dk-ws[data-aid="' + CSS.escape(aid) + '"] input.dk-wk-in.is-pend'); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); } } }
  ];
  if (anchor) { items.unshift({ node: el('div', { class: 'dk-menu-title', role: 'presentation' }, 'Week ' + wk + ' has ' + n + (n === 1 ? ' unpublished change' : ' unpublished changes')) }); dkPopMenu(anchor, items); }
  else toastAction('Week ' + wk + ' has ' + n + (n === 1 ? ' unpublished change' : ' unpublished changes'), 'Publish', function () { dkWsApply(aid); });
}
function dkUndo() {
  var p = _dk.last;
  if (!p) return;
  var st = dkState();
  var put = function (obj, k, v) { if (v === undefined) delete obj[k]; else obj[k] = v; };
  put(st.reviewed, p.id, p.reviewed); put(st.snoozed, p.id, p.snoozed); put(st.winsSeen, p.id, p.win);
  if (p.kind === 'done' && p.lane === 'q') st.times.pop();
  _dk.last = null;
  dkSaveState();
  _dk.sel = { id: p.id, lane: p.lane };
  renderDeskToday();
  toast('Undone');
}
// The centre: the selected athlete's week, opened at what needs the coach.
function dkPaintTodayCentre(opts) {
  opts = opts || {};
  var c = document.getElementById('deskTodayCentre');
  if (!c) return;
  c.innerHTML = '';
  c.scrollTop = 0;
  var q = _dk.queue;
  if (!_dk.sel) { c.appendChild(dkCaughtUp()); return; }
  var r = dkRow(_dk.sel.id);
  if (!r) return;
  var lane = _dk.sel.lane;
  var lanePos = (lane === 'q' ? q.queue : q.wins).findIndex(function (x) { return x.athlete.id === r.athlete.id; });
  c.appendChild(dkWorkspace(r, { mode: 'today', lane: lane,
    pos: lane === 'q' ? (lanePos + 1) + ' of ' + q.queue.length : 'Win ' + (lanePos + 1) + ' of ' + q.wins.length }));
  if (opts.swap) dkSwapIn(c.firstChild);
}
// A clicked selection crossfades in; J/K swaps instantly (keys are used all day).
function dkSwapIn(node) {
  if (!node || _dkReduced() || !node.animate) return;
  node.animate([{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 180, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
}
function dkSection(title, body, end) {
  var s = el('div', { class: 'dk-sec' });
  if (end) { var h = el('div', { class: 'dk-sec-head' }); h.appendChild(el('h3', { class: 'dk-sec-title' }, title)); h.appendChild(el('span', { class: 'dk-sp' })); h.appendChild(end); s.appendChild(h); }
  else s.appendChild(el('h3', { class: 'dk-sec-title' }, title));
  s.appendChild(body);
  return s;
}
function dkCaughtUp() {
  var q = _dk.queue, st = dkState();
  var box = el('div', { class: 'dk-done' });
  var closing = _dk.wasCaughtUp === false;   // this visit worked the queue down to nothing
  var ring = el('div', { class: 'dk-ring', html: '<svg viewBox="0 0 80 80" aria-hidden="true"><circle class="dk-ring-track" cx="40" cy="40" r="34"/><circle class="dk-ring-fill" cx="40" cy="40" r="34" pathLength="100"' + (closing ? ' style="stroke-dashoffset:' + (100 / Math.max(1, q.total)).toFixed(1) + '"' : '') + '/></svg>' + ICONS.check });
  box.appendChild(ring);
  if (closing) requestAnimationFrame(function () { requestAnimationFrame(function () { var f = ring.querySelector('.dk-ring-fill'); if (f) f.style.strokeDashoffset = '0'; }); });
  var times = st.times.slice().sort();
  var mins = times.length > 1 ? Math.max(1, Math.round((times[times.length - 1] - times[0]) / 60000)) : 0;
  box.appendChild(el('h2', { class: 'dk-done-title' }, 'All caught up'));
  box.appendChild(el('p', { class: 'dk-done-sub' }, q.total
    ? (q.progress - q.snoozed.length) + (q.progress - q.snoozed.length === 1 ? ' athlete' : ' athletes') + ' handled' + (mins ? ' in ' + mins + ' min' : '') + (q.snoozed.length ? ' · ' + q.snoozed.length + ' snoozed' : '')
    : 'Nobody needs you right now.'));
  var acts = el('div', { class: 'dk-actions' });
  if (q.wins.length) acts.appendChild(dkBtn('Celebrate wins', { icon: DK_IC.spark, onClick: function () { dkSelect(q.wins[0].athlete.id, 'w', true); } }));
  acts.appendChild(dkBtn('Open the live board', { icon: DK_IC.board, onClick: function () { _dk.rmode = 'board'; _dkLS('powa-desk-rmode', null); deskGo('roster'); } }));
  box.appendChild(acts);
  box.appendChild(dkSection('Who trained, last 7 days', dkWhoTrained()));
  _dk.wasCaughtUp = true;
  return box;
}
function dkWhoTrained() {
  var t = todayISO(), days = [];
  for (var i = 6; i >= 0; i--) days.push(_addDaysISO(t, -i));
  var on = {};
  (Store.get().workoutLogs || []).forEach(function (l) { if (l.date >= days[0]) on[l.athleteId + l.date] = 1; });
  var g = el('div', { class: 'dk-who', role: 'table', 'aria-label': 'Who trained in the last 7 days' });
  var hr = el('div', { class: 'dk-who-row is-head', role: 'row' });
  hr.appendChild(el('span', { role: 'columnheader' }));
  days.forEach(function (d, i) { hr.appendChild(el('span', { role: 'columnheader', class: i === 6 ? 'is-today' : '' }, new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' }))); });
  g.appendChild(hr);
  (_dk.rows || []).slice().sort(function (a, b) { return (a.status.ago == null ? 999 : a.status.ago) - (b.status.ago == null ? 999 : b.status.ago); }).forEach(function (r) {
    var row = el('div', { class: 'dk-who-row', role: 'row' });
    row.appendChild(el('span', { class: 'dk-who-name', role: 'rowheader' }, r.athlete.name));
    days.forEach(function (d) { row.appendChild(el('span', { role: 'cell', class: on[r.athlete.id + d] ? 'is-on' : '', 'aria-label': on[r.athlete.id + d] ? 'trained' : '' }, el('i', {}))); });
    g.appendChild(row);
  });
  return g;
}
function _dkThreadLast(id) {
  if (_dk.threads) return _dk.threads[id] || null;
  var t = deskThreadDigest(null);
  return t[id] || null;
}
function _dkAgoTime(iso) {
  var h = Math.floor((Date.now() - Date.parse(iso)) / 3600000);
  if (!isFinite(h)) return '';
  return h < 1 ? 'just now' : h < 24 ? h + 'h ago' : Math.floor(h / 24) + 'd ago';
}
// An empty thread opens on the top reason, not on their name a fourth time.
function dkReplyPrompt(r) {
  var t = r.reasons[0] ? r.reasons[0].type : (r.wins.length ? 'win' : '');
  return ({ pain: 'Ask how the pain is.', overshoot: 'Ask how the heavy set felt.', drift: 'Ask how the week is feeling.',
    quiet: 'Check in: nothing logged lately.', never: 'Help them log their first session.', meet: 'Talk through meet week.',
    weight: 'Check in on the cut.', offpace: 'Check in on the cut.', note: 'Answer their note.', checkin: 'Ask about their check-in.',
    blockdone: 'Tell them what comes next.', blockend: 'Tell them what comes next.', noprogram: 'Tell them their program is coming.',
    readiness: 'Ask how they slept.', win: 'Say well done.' })[t] || 'Start the thread.';
}
// R: the thread in the side card takes the cursor.
function dkReply() { dkOpenCard('thread'); }
function dkWsMessage() { dkOpenCard('thread'); }
function dkNoteCompose() { dkOpenCard('notes', { compose: true }); }

// ---------- kudos + broadcast: one composer, sent per athlete ----------
function dkKudos() {
  var q = _dk.queue;
  if (!q || !q.wins.length) return;
  var ids = Object.keys(_dk.wpick).filter(function (k) { return _dk.wpick[k]; });
  if (!ids.length) ids = q.wins.map(function (r) { return r.athlete.id; });
  var one = ids.length === 1 ? dkRow(ids[0]) : null;
  dkCompose(ids, { title: one ? 'Kudos to ' + _dkFirst(one.athlete.name) : 'Kudos to ' + ids.length + ' athletes', text: 'Big week. That work is paying off.', kudos: true });
}

function dkCompose(ids, opts) {
  opts = opts || {};
  var who = ids.map(dkRow).filter(Boolean);
  if (!who.length) return;
  var veil = el('div', { class: 'dk-veil' });
  var box = el('div', { class: 'dk-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || 'Message' });
  box.appendChild(el('h2', { class: 'dk-modal-title' }, opts.title || 'Message ' + who.length + ' athletes'));
  var faces = el('div', { class: 'dk-faces' });
  who.slice(0, 8).forEach(function (r) { faces.appendChild(dkAv(r.athlete, 'is-sm')); });
  faces.appendChild(el('span', { class: 'dk-faces-names' }, who.slice(0, 3).map(function (r) { return _dkFirst(r.athlete.name); }).join(', ') + (who.length > 3 ? ' and ' + (who.length - 3) + ' more' : '')));
  box.appendChild(faces);
  var ta = el('textarea', { class: 'dk-ta', rows: '4', maxlength: '2000', 'aria-label': 'Message' });
  ta.value = opts.text || '';
  box.appendChild(ta);
  box.appendChild(el('p', { class: 'dk-modal-note' }, 'Each athlete gets it in their own thread, as if you wrote to them alone.'));
  var row = el('div', { class: 'dk-modal-actions' });
  // Saved replies (weekly-note.js): one quiet button at the start of the row, a menu above it.
  if (window.WeeklyNote) { var sr = dkBtn('Saved replies', { cls: 'is-quiet wn-saved-btn', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"/></svg>', onClick: function () { WeeklyNote.pickReply(sr, ta); } }); sr.setAttribute('aria-haspopup', 'true'); row.appendChild(sr); }
  var cancel = dkBtn('Cancel', { onClick: close });
  var send = dkBtn(who.length === 1 ? 'Send' : 'Send to ' + who.length, { primary: true, onClick: go });
  row.appendChild(cancel); row.appendChild(send);
  box.appendChild(row);
  veil.appendChild(box);
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
  function onKey(e) {
    if (document.querySelector('.dk-pal, .wn-rmenu')) return;   // a palette or the saved replies on top handle their own keys
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); go(); }
  }
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(veil);
  ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
  veil._close = close;
  async function go() {
    if (send.disabled) return;
    var body = ta.value.trim();
    if (!body) { ta.focus(); return; }
    send.disabled = true; cancel.disabled = true;
    var ok = 0;
    for (var i = 0; i < who.length; i++) { if (await dkSendMessage(who[i].athlete.id, body)) ok++; }
    close();
    if (opts.kudos) { var st = dkState(); who.forEach(function (r) { st.winsSeen[r.athlete.id] = 1; }); _dk.wpick = {}; dkSaveState(); }
    if (opts.onSent) opts.onSent();
    if (_dk.screen === 'today') renderDeskToday();
    toast(ok === who.length ? (window._demoMode ? 'Sent to ' + ok + ' in the demo. Nothing leaves this page.' : 'Sent to ' + ok) : 'Sent to ' + ok + ' of ' + who.length + '. Check your connection.');
  }
}
// meta (optional) rides on the message: weekly-note.js marks a week's note { weekly: 'YYYY-MM-DD' }.
async function dkSendMessage(athleteId, body, meta) {
  var u = _dkUser();
  try {
    if (window._demoMode) {
      var s = Store.get(), dm = { id: 'demo-msg-' + Date.now() + '-' + athleteId, coachId: u.id, athleteId: athleteId, senderId: u.id, body: body, createdAt: new Date().toISOString(), readAt: null };
      if (meta) dm.meta = meta;
      (s.messages || (s.messages = [])).push(dm);
      return true;
    }
    var m = await DB.sendMessage({ coachId: u.id, athleteId: athleteId, senderId: u.id, body: body, meta: meta || undefined });
    if (m) dkNoteSent(athleteId, body);
    if (m && typeof DB.sendPush === 'function') {
      DB.sendPush({ toUserId: athleteId, title: 'New message from ' + _dkFirst(u.name), body: body.slice(0, 140), url: '/athlete.html', tag: 'powa-msg-' + athleteId, category: 'messages' }).catch(function () {});
    }
    return !!m;
  } catch (e) { console.warn('desk send', e); return false; }
}

// =====================================================================
// ROSTER: Board (the live board, the default) | List (two panes, like Today)
// =====================================================================
var DK_SORTS = {
  name: { label: 'Lifter' },
  week: { fn: function (r) { var s = r.status.sessions || {}; return r.live ? 2 : s.planned ? (s.done || 0) / s.planned : -1; }, desc: true },
  ready: { fn: function (r) { var x = r.status.readiness; return !x ? -1 : x.state === 'low' ? 10 + (x.rhrDelta || 0) : (x.rhrDelta || 0); }, desc: true },
  drift: { fn: function (r) { return r.drift ? r.drift.avg : -99; }, desc: true },
  e1rm: { fn: function (r) { return r.total.delta == null ? -9999 : r.total.delta; }, desc: true },
  bw: { fn: function (r) { return r.bw ? r.bw.over : -99; }, desc: true },
  meet: { fn: function (r) { return r.meet ? r.meet.days : 9999; } },
  pain: { fn: function (r) { var p = r.status.pain; return p && p.open && p.report ? Number(p.report.severity) || 1 : 0; }, desc: true },
  last: { fn: function (r) { return r.live ? -1 : r.status.ago == null ? 9999 : r.status.ago; } }
};
// The roster opens on the live board; the list is one click (or V) away. An old 'sheet' choice
// is the board now.
function dkRMode() {
  if (!_dk.rmode) { var sv = _dkLS('powa-desk-rmode'); _dk.rmode = sv === 'list' || sv === 'calendar' ? sv : 'board'; }
  if (_dk.rmode === 'calendar' && typeof dsPaintCalendar !== 'function') _dk.rmode = 'board';
  return _dk.rmode;
}
function dkSetRMode(m) {
  if (dkRMode() === m) return;
  _dk.rmode = m;
  _dkLS('powa-desk-rmode', m === 'list' || m === 'calendar' ? m : null);
  _dk.card = null;
  if (m === 'board') _dk.rsel = null;
  if (typeof renderRoster === 'function') renderRoster(); else deskRenderRoster(document.getElementById('rosterArea'));
}
function dkSorts() {
  if (!_dk.sort) { try { _dk.sort = JSON.parse(_dkLS(DK_SORT_KEY) || 'null') || {}; } catch (e) { _dk.sort = {}; } }
  return _dk.sort;
}
// The board's sort: grouped (Needs you, then on plan) unless a header was clicked.
function dkSortOf() {
  var s = dkSorts()[_dk.view || 'all'];
  return s && (DK_SORTS[s.key] || s.key === 'status') ? s : { key: 'status', dir: 1 };
}
function dkSetSort(key) {
  var cur = dkSortOf(), col = DK_SORTS[key] || {};
  var next = cur.key === key ? (cur.dir === (col.desc ? -1 : 1) ? { key: key, dir: -cur.dir } : { key: 'status', dir: 1 }) : { key: key, dir: col.desc ? -1 : 1 };
  dkSorts()[_dk.view || 'all'] = next;
  _dkLS(DK_SORT_KEY, JSON.stringify(_dk.sort));
  dkPaintRosterBody();
}
// Worst first, the same order Today uses.
function _dkWorst(a, b) {
  var toneRank = { alert: 0, warn: 1, meet: 2, info: 3 };
  return a.reasons[0].group - b.reasons[0].group || (toneRank[a.reasons[0].tone] || 3) - (toneRank[b.reasons[0].tone] || 3) ||
    b.reasons.length - a.reasons.length || String(a.athlete.name).localeCompare(String(b.athlete.name));
}
function dkVisibleRows() {
  var rows = (_dk.rows || []).slice(), now = Date.now();
  if (_dk.view) rows = rows.filter(function (r) { return deskViewMatch(_dk.view, r, now); });
  var q = _dk.search.trim().toLowerCase();
  if (q) rows = rows.filter(function (r) {
    var a = r.athlete;
    return (String(a.name || '') + ' ' + String(a.email || '') + ' ' + (r.status.program ? r.status.program.name || '' : '')).toLowerCase().indexOf(q) >= 0;
  });
  return rows;
}
// { groups: [{ key, label, rows }] }: Needs you (worst first) and On plan (by name), or one sorted list.
function dkRosterGroups(rows, flat) {
  var s = dkSortOf();
  if (flat && s.key !== 'status') {
    var col = DK_SORTS[s.key];
    rows = rows.slice().sort(function (a, b) {
      var d = col && col.fn ? (col.fn(a) - col.fn(b)) * s.dir : String(a.athlete.name).localeCompare(String(b.athlete.name)) * s.dir;
      return d || String(a.athlete.name).localeCompare(String(b.athlete.name));
    });
    return [{ key: 'all', label: null, rows: rows }];
  }
  var now = Date.now();
  var needs = rows.filter(function (r) { return r.reasons.length && deskViewMatch('needs', r, now); }).sort(_dkWorst);
  var ok = rows.filter(function (r) { return needs.indexOf(r) < 0; }).sort(function (a, b) { return String(a.athlete.name).localeCompare(String(b.athlete.name)); });
  return [{ key: 'needs', label: 'Needs you', rows: needs }, { key: 'ok', label: 'On plan', rows: ok }].filter(function (g) { return g.rows.length; });
}
// coach.html's renderRoster hands the desk its area; join requests are already pinned in it.
function deskRenderRoster(area) {
  if (!area) return;
  dkRowsFresh();
  area.querySelectorAll('.dk-rhead, .dk-rhome, .dk-rbody, .dk-empty, .dk-bulk, .cl-desk').forEach(function (n) { n.remove(); });
  area.classList.remove('cl-on');
  var rows = _dk.rows;
  var mode = dkRMode();
  // Lifters (coach-lifters.js) draws the roster: the list beside one lifter's page. The Calendar
  // keeps its own mode; ?oldroster=1 shows the old board and list.
  if (rows.length && window.CoachLifters && mode !== 'calendar' && !/\boldroster=1\b/.test(location.search)) { CoachLifters.renderDesk(area); dkPaintRail(); dkSyncCtx(); return; }
  if (window.CoachLifters) CoachLifters.offDesk();
  area.classList.remove('is-list', 'is-sheet', 'is-board', 'is-cal', 'has-bulk');
  if (!rows.length) { area.appendChild(dkRosterEmpty()); dkPaintRail(); dkSyncCtx(true); return; }
  area.classList.add(mode === 'list' ? 'is-list' : 'is-board');
  if (mode === 'calendar') area.classList.add('is-cal');
  var req = area.firstElementChild && !area.firstElementChild.className ? area.firstElementChild : null;   // coach.html's join requests

  var head = el('div', { class: 'dk-rhead' });
  var tr = el('div', { class: 'dk-title-row' });
  tr.appendChild(el('h1', { class: 'dk-h1' }, 'Roster'));
  tr.appendChild(el('span', { class: 'dk-rmeta' }));
  head.appendChild(tr);
  var tools = el('div', { class: 'dk-rtools' });
  var seg = el('div', { class: 'dk-seg', role: 'radiogroup', 'aria-label': 'Roster view' });
  [['board', 'Board', DK_IC.board], ['list', 'List', DK_IC.list]].concat(typeof dsPaintCalendar === 'function' ? [['calendar', 'Calendar', DS_IC.cal]] : []).forEach(function (x) {
    var on = mode === x[0];
    var b = el('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on), 'data-rmode': x[0], html: x[2] });
    b.appendChild(el('span', {}, x[1]));
    dkTip(b, x[0] === 'board' ? 'Everyone live: this week, readiness, RPE, e1RM, the meet' : x[0] === 'calendar' ? 'The season: every block and meet, 16 weeks at a time' : 'One lifter at a time, their week beside the list', 'V');
    b.addEventListener('click', function () { dkSetRMode(x[0]); });
    seg.appendChild(b);
  });
  tools.appendChild(seg);
  var sw = el('label', { class: 'dk-search' });
  sw.insertAdjacentHTML('beforeend', DK_IC.search);
  var si = el('input', { type: 'search', placeholder: 'Find an athlete', 'aria-label': 'Search athletes', autocomplete: 'off', spellcheck: 'false' });
  si.value = _dk.search;
  si.addEventListener('input', function () { _dk.search = si.value; dkPaintRosterBody(); });
  si.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); if (si.value) { si.value = ''; _dk.search = ''; dkPaintRosterBody(); } else si.blur(); }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); si.blur(); if (_dk.rorder.length) dkRSelect(_dk.rorder[0], { key: true }); }
  });
  sw.appendChild(si);
  sw.appendChild(dkKbd('/'));
  tools.appendChild(sw);
  var inv = dkBtn('Invite', { icon: DK_IC.plus, onClick: function () { openInviteModal(); } });
  inv.id = 'deskInvite';
  tools.appendChild(inv);
  // The calendar's one red: Plan a meet (desk-season.js).
  if (mode === 'calendar' && typeof dsPlanMeet === 'function') tools.appendChild(dkBtn('Plan a meet', { primary: true, icon: DS_IC.meetPlus, onClick: function () { dsPlanMeet(null); } }));
  head.appendChild(tools);
  var chips = el('div', { class: 'dk-rchips' });
  if (_dk.view) {
    var v = DESK_VIEWS.find(function (x) { return x.key === _dk.view; });
    var vb = el('button', { type: 'button', class: 'dk-vchip on', 'aria-label': 'Clear the ' + v.label + ' view' }, v.label, el('span', { class: 'dk-x', 'aria-hidden': 'true', html: DK_IC.x }));
    vb.addEventListener('click', function () { deskGo('roster', { view: null }); });
    chips.appendChild(vb);
  }
  if (mode === 'board') chips.appendChild(dkBoardLegend());
  if (chips.childNodes.length) head.appendChild(chips);

  var body = el('div', { class: 'dk-rbody' });
  if (mode === 'list') {
    var home = el('div', { class: 'dk-rhome' });
    var list = el('div', { class: 'dk-list', role: 'listbox', 'aria-label': 'Athletes', tabindex: '-1' });
    list.appendChild(head);
    if (req) list.appendChild(req);
    list.appendChild(body);
    home.appendChild(list);
    home.appendChild(el('div', { class: 'dk-centre', id: 'deskRosterCentre' }));
    area.appendChild(home);
  } else {
    if (req) area.insertBefore(head, req); else area.appendChild(head);
    area.appendChild(body);
  }
  dkPaintRmeta();
  dkPaintRosterBody();
  dkPaintRail();
}
function dkPaintRmeta() {
  var m = document.querySelector('#rosterArea .dk-rmeta');
  if (!m) return;
  var rows = _dk.rows || [], lim = getCurrentTierLimit();
  var trained = rows.filter(function (r) { return r.status.sessions.done > 0; }).length;
  var live = rows.filter(function (r) { return r.live; }).length;
  var u = _dkUser();
  var pend = u ? (Store.get().invites || []).filter(function (i) { return i.coachId === u.id && !i.used; }).length : 0;
  m.innerHTML = '';
  m.appendChild(el('span', { class: 'dk-rmeta-t' }, (lim >= 9999 ? rows.length + ' lifters' : rows.length + ' of ' + lim) + ' · ' + trained + ' trained this week'));
  if (live) m.appendChild(el('span', { class: 'dk-rmeta-live' }, live + ' training now'));
  if (pend) {
    // Invites waiting: a dot and ink words in the meta line, opening Settings › Athletes.
    var ib = el('button', { type: 'button', class: 'dk-rmeta-inv' }, pend + (pend === 1 ? ' invite waiting' : ' invites waiting'));
    ib.addEventListener('click', function () { _dk.setSec = 'athletes'; _dkLS('powa-desk-set', 'athletes'); deskGo('settings'); });
    m.appendChild(ib);
  }
}
function dkPaintRosterBody(opts) {
  opts = opts || {};
  var body = document.querySelector('#rosterArea .dk-rbody');
  if (!body) return;
  var rows = dkVisibleRows();
  if (dkRMode() === 'board') { dkPaintBoard(body, rows); return; }
  if (dkRMode() === 'calendar') { dsPaintCalendar(body, rows); dkPaintBulk(); dkSyncCtx(); return; }
  var before = _dkFlipBefore(body);
  body.innerHTML = '';
  var groups = dkRosterGroups(rows, false);
  _dk.rorder = [];
  groups.forEach(function (g) { g.rows.forEach(function (r) { _dk.rorder.push(r.athlete.id); }); });
  var prev = _dk.rsel;
  if (!_dk.rsel || _dk.rorder.indexOf(_dk.rsel) < 0) _dk.rsel = _dk.rorder[0] || null;
  var landed = dkLanded();
  if (!rows.length) {
    var v = _dk.view ? DESK_VIEWS.find(function (x) { return x.key === _dk.view; }) : null;
    body.appendChild(el('div', { class: 'dk-noresults' }, el('b', {}, _dk.search ? 'Nobody matches “' + _dk.search + '”' : 'Nobody in ' + (v ? v.label : 'this view')), el('span', {}, _dk.view && !_dk.search ? 'That is good news.' : 'Try another name.')));
  }
  groups.forEach(function (g) {
    var lane = el('div', { class: 'dk-lane', role: 'group', 'aria-label': g.label });
    lane.appendChild(el('div', { class: 'dk-lane-head' }, el('span', { class: 'dk-lane-title' }, g.label), el('span', { class: 'dk-lane-count' }, String(g.rows.length))));
    g.rows.forEach(function (r) {
      var a = r.athlete, on = _dk.rsel === a.id;
      var row = el('div', { class: 'dk-qrow' + (on ? ' is-sel' : '') + (landed[a.id] ? ' is-landed' : ''), role: 'option', 'aria-selected': String(on), 'data-id': a.id, tabindex: on ? '0' : '-1' });
      row.appendChild(dkRingAv(r));
      row.appendChild(dkRowMain(r, g.key === 'needs' ? 'q' : 'r'));
      row.addEventListener('click', function () { dkRSelect(a.id); });
      row.addEventListener('dblclick', function () { openAthletePage(a.id); });
      lane.appendChild(row);
    });
    body.appendChild(lane);
  });
  _dkFlipAfter(body, before);
  var c = document.getElementById('deskRosterCentre');
  var typing = c && c.contains(document.activeElement) && _dkTyping(document.activeElement);
  if (c && !(opts.keepCentre && prev === _dk.rsel && (typing || c.firstChild))) dkPaintRosterCentre();
  dkSyncCtx();
  dkPaintCard();
}
function dkPaintRosterCentre(swap) {
  var c = document.getElementById('deskRosterCentre');
  if (!c) return;
  c.innerHTML = '';
  c.scrollTop = 0;
  var r = _dk.rsel ? dkRow(_dk.rsel) : null;
  if (!r) { c.appendChild(el('div', { class: 'dk-ctx-empty' }, 'Pick an athlete to see their week.')); return; }
  var i = _dk.rorder.indexOf(r.athlete.id);
  c.appendChild(dkWorkspace(r, { mode: 'roster', pos: _dk.rorder.length > 1 ? (i + 1) + ' of ' + _dk.rorder.length : null }));
  if (swap) dkSwapIn(c.firstChild);
}
function dkRSelect(id, opts) {
  opts = opts || {};
  if (dkRMode() === 'board') {
    // The board: J/K picks a row out (Enter opens it); the card, if open, follows it.
    _dk.rsel = id;
    document.querySelectorAll('#rosterArea .dk-bd-row[data-id]').forEach(function (tr) {
      var on = tr.dataset.id === id;
      tr.classList.toggle('is-sel', on);
      tr.tabIndex = on ? 0 : -1;
      if (on) {
        var sc = tr.closest('[data-pane="athletes"]'), rr = tr.getBoundingClientRect(), head = document.querySelector('#rosterArea .dk-bd-row.is-head'), hb = head ? head.getBoundingClientRect().bottom : 0;
        if (sc && rr.top < hb) sc.scrollTop -= hb - rr.top + 8;
        else if (sc && rr.bottom > window.innerHeight - 8) sc.scrollTop += rr.bottom - window.innerHeight + 8;
        if (opts.key) tr.focus({ preventScroll: true });
      }
    });
    dkSyncCtx();
    dkPaintCard();
    return;
  }
  var changed = _dk.rsel !== id;
  _dk.rsel = id;
  document.querySelectorAll('#rosterArea .dk-qrow').forEach(function (tr) {
    var on = tr.dataset.id === id;
    tr.classList.toggle('is-sel', on);
    tr.setAttribute('aria-selected', String(on));
    tr.tabIndex = on ? 0 : -1;
    if (on) { tr.scrollIntoView({ block: 'nearest' }); if (opts.key && !_dkTyping(document.activeElement)) tr.focus({ preventScroll: true }); }
  });
  if (changed) dkPaintRosterCentre(!opts.key);
  dkSyncCtx();
  dkPaintCard();
}
function dkRClose() {
  _dk.rsel = null;
  if (dkRMode() === 'board') dkPaintRosterBody();
  dkSyncCtx();
}
function dkRMove(step) {
  if (!_dk.rorder.length) return;
  var i = _dk.rorder.indexOf(_dk.rsel);
  var n = i < 0 ? 0 : Math.max(0, Math.min(_dk.rorder.length - 1, i + step));
  dkRSelect(_dk.rorder[n], { key: true });
}
function dkRPick() {
  if (!_dk.rsel || dkRMode() !== 'board') return;
  _dk.picked[_dk.rsel] = !_dk.picked[_dk.rsel];
  var tr = document.querySelector('#rosterArea .dk-bd-row[data-id="' + CSS.escape(_dk.rsel) + '"]');
  if (tr) { tr.classList.toggle('is-picked', !!_dk.picked[_dk.rsel]); tr.setAttribute('aria-selected', String(!!_dk.picked[_dk.rsel])); var cb = tr.querySelector('.dk-cb'); if (cb) cb.checked = !!_dk.picked[_dk.rsel]; }
  dkPaintBulk(); dkSyncAllBox();
}
function dkSyncAllBox() {
  var all = document.querySelector('#rosterArea .dk-bd-row.is-head .dk-cb');
  if (!all) return;
  var n = _dk.rorder.filter(function (id) { return _dk.picked[id]; }).length;
  all.checked = n > 0 && n === _dk.rorder.length;
  all.indeterminate = n > 0 && n < _dk.rorder.length;
}
function dkPicked() { return Object.keys(_dk.picked).filter(function (k) { return _dk.picked[k] && dkRow(k); }); }

// ---------- the live board: one row per lifter, their week as it lands ----------
// Each session this week is one mark, coloured by how it went against what was written (the
// detail in the tooltip, never in the cell); then readiness from Apple Health, RPE drift, the
// e1RM trend, bodyweight against the class, the next meet in weeks, pain. A row opens the lifter.
var DK_OUTCOMES = [['on', 'On target'], ['over', 'Over'], ['hard', '1+ over'], ['under', 'Under'], ['miss', 'Missed'], ['todo', 'To come']];
function dkBoardLegend() {
  var lg = el('div', { class: 'dk-legend', 'aria-label': 'Session marks' });
  DK_OUTCOMES.forEach(function (x) {
    lg.appendChild(el('span', { class: 'dk-lg' }, el('i', { class: 'dk-om-mark t-' + x[0], 'aria-hidden': 'true' }), x[1]));
  });
  return lg;
}
// One athlete's current week, day by day: what was written for the day's first main lift, what
// they lifted on it, the RPE against target, and whether it's done, live, missed or still to come.
function dkWeekCells(r) {
  var prog = r.status.program, wk = r.status.week;
  if (!prog || !wk) return [];
  var W = prog.weeks[wk.idx];
  if (!W) return [];
  var days = (W.days || []).filter(function (d) { return (d.exercises || []).some(function (e) { return (e.sets || []).length; }); });
  var now = Date.now();
  var cells = days.map(function (d) {
    var exs = (d.exercises || []).filter(function (e) { return (e.sets || []).length; });
    var ex = exs.find(function (e) { return MAIN_LIFTS.indexOf(e.lift) >= 0; }) || exs[0];
    var all = exs.reduce(function (a, e) { return a.concat(e.sets); }, []);
    var done = all.filter(function (s) { return s.completed; });
    var g = groupSets(_deskPlanSets(ex))[0];
    var top = ex.sets.filter(function (s) { return s.completed; }).sort(function (a, b) { return (Number(b.weight) || 0) - (Number(a.weight) || 0); })[0] || null;
    var tgt = top && top.rpe != null && top.rpe !== '' ? (top.rpeHi != null && Number(top.rpeHi) > Number(top.rpe) ? Number(top.rpeHi) : Number(top.rpe)) : null;
    var felt = top && top.actualRpe != null && top.actualRpe !== '' ? Number(top.actualRpe) : null;
    var gap = felt != null && tgt != null ? Math.round((felt - tgt) * 10) / 10 : null;
    var live = done.some(function (s) { var t = Date.parse(s.completedAt); return String(s.completedAt).indexOf('T') > 0 && isFinite(t) && now - t <= 30 * 60000; });
    var state = done.length === all.length ? 'done' : live ? 'live' : done.length ? 'part' : all.some(function (s) { return s.skipped; }) ? 'miss' : 'todo';
    return { day: d, ex: ex, more: exs.length - 1, plan: g, top: top, gap: gap, state: state, done: done.length, of: all.length };
  });
  // A day still empty while a later one is logged was skipped.
  var lastDone = -1;
  cells.forEach(function (c, i) { if (c.done) lastDone = i; });
  cells.forEach(function (c, i) { if (c.state === 'todo' && i < lastDone) c.state = 'miss'; });
  return cells;
}
function dkGapTone(gap) { return gap == null ? '' : gap >= 1 ? 'over' : gap >= 0.5 ? 'half' : gap <= -0.5 ? 'under' : 'on'; }
function dkGapText(gap) { return gap == null ? '' : Math.abs(gap) < 0.25 ? 'on' : (gap > 0 ? '+' : '−') + _num(Math.abs(gap)); }
// A session's outcome, one word: on | over | under | miss | todo | live | done (logged, no RPE to read).
function dkOutcome(c) {
  if (c.state === 'miss' || c.state === 'todo' || c.state === 'live') return c.state;
  var t = dkGapTone(c.gap);
  return t === 'half' ? 'over' : t === 'over' ? 'hard' : t || 'done';
}
// The marks: one per session this week, the detail on hover.
function dkBoardMarks(r, cells) {
  var box = el('div', { class: 'dk-om' });
  if (!cells.length) { box.appendChild(el('span', { class: 'dk-dim' }, r.status.program ? 'Nothing this week' : 'No program')); return box; }
  var words = [];
  cells.forEach(function (c, i) {
    var o = dkOutcome(c);
    var name = (c.day.name || 'Day ' + (i + 1));
    var what = c.state === 'miss' ? 'missed' : c.state === 'todo' ? 'to come' : c.state === 'live' ? 'lifting now, ' + c.done + ' of ' + c.of + ' sets'
      : (c.top ? _exShortTitle(c.ex) + ' ' + (Number(c.top.weight) > 0 ? _num(kgToDisplay(c.top.weight)) + '×' : '') + Number(c.top.reps) + (c.top.actualRpe != null && c.top.actualRpe !== '' ? ' @' + _num(c.top.actualRpe) : '') : c.done + ' of ' + c.of + ' sets') +
        (c.gap != null && Math.abs(c.gap) >= 0.25 ? ', ' + dkGapText(c.gap) + ' RPE' : c.gap != null ? ', on target' : '');
    var m = el('i', { class: 'dk-om-mark t-' + o });
    dkTip(m, name + ': ' + what + (c.plan ? ' · wrote ' + dkGroupLabel(c.plan) : ''));
    box.appendChild(m);
    words.push(name + ' ' + what);
  });
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', words.join('; '));
  return box;
}
// RPE drift as a small diverging bar from zero, the number beside it (coloured only when off).
function dkBoardDrift(r) {
  var c = el('div', { class: 'dk-bd-drift' });
  if (!r.drift) { c.appendChild(dkNil('Nothing logged this week')); return c; }
  var v = r.drift.avg, tone = v >= 1 ? 'alert' : v >= 0.5 ? 'warn' : v <= -0.5 ? 'cool' : '';
  // On target draws one faint tick and no number: drift is a signal only when it's off.
  if (Math.abs(v) < 0.25) {
    c.appendChild(el('span', { class: 'dk-dv is-on', 'aria-hidden': 'true' }));
    c.appendChild(dkNil('On target'));
    dkTip(c, 'RPE on what you wrote, across ' + r.drift.n + (r.drift.n === 1 ? ' set' : ' sets') + ' this week');
    return c;
  }
  var w = Math.min(1, Math.abs(v) / 1.5) * 50;
  var bar = el('span', { class: 'dk-dv' + (tone ? ' t-' + tone : ''), 'aria-hidden': 'true' });
  bar.appendChild(el('i', { style: (v >= 0 ? 'left:50%;' : 'right:50%;') + 'width:' + w.toFixed(1) + '%' }));
  c.appendChild(bar);
  c.appendChild(el('span', { class: 'dk-num' }, (v > 0 ? '+' : '−') + Math.abs(v).toFixed(1)));
  dkTip(c, 'RPE ' + (v > 0 ? 'over' : 'under') + ' what you wrote, across ' + r.drift.n + (r.drift.n === 1 ? ' set' : ' sets') + ' this week');
  return c;
}
function dkBoardTrend(r) {
  var c = el('div', { class: 'dk-trend' });
  var t = r.total, dl = t.delta;
  if (!t.values.length) { c.appendChild(dkNil('No e1RM yet')); return c; }
  c.insertAdjacentHTML('beforeend', dkSpark(t.values, dl > 0.5 ? 'is-up' : ''));
  var nb = el('span', { class: 'dk-num' + (dl > 0.5 ? '' : ' is-calm') }, dl == null || Math.abs(dl) < 0.5 ? '±0' : (dl > 0 ? '+' : '−') + Math.abs(Math.round(kgToDisplay(dl))));
  nb.appendChild(el('span', { class: 'dk-unit' }, ' ' + unitLabel()));
  c.appendChild(nb);
  dkTip(c, 'e1RM total ' + exactW(t.values[t.values.length - 1]) + ' ' + unitLabel() + (dl != null ? ', ' + (dl >= 0 ? '+' : '−') + Math.abs(Math.round(kgToDisplay(dl))) + ' in 4 weeks' : ''));
  return c;
}
// Readiness from shared Apple Health: a dot and a word; the numbers in the tooltip.
function dkBoardReady(r) {
  var c = el('div', { class: 'dk-bd-st' });
  var rd = r.status.readiness;
  if (!rd) { c.appendChild(dkNil('No Apple Health shared')); return c; }
  var low = rd.state === 'low';
  c.appendChild(el('i', { class: 'dk-dot t-' + (low ? 'warn' : 'ok'), 'aria-hidden': 'true' }));
  c.appendChild(el('span', { class: low ? '' : 'dk-bd-calm' }, low ? 'Low' : 'Ready'));
  dkTip(c, low ? (rd.text || 'Readiness low') : 'Resting HR and HRV at their usual · Apple Health');
  return c;
}
// Bodyweight against the class: the class line, their dot on it, how far over or under.
function dkBoardBw(r) {
  var c = el('div', { class: 'dk-bd-bw' });
  var bw = r.bw;
  if (!bw) {
    var last = dkLatestBw(r.athlete.id);
    if (!last) { c.appendChild(dkNil('No bodyweight logged')); return c; }
    // No class to weigh against: the track stays empty so the number sits where every other row's does.
    c.appendChild(el('span', { class: 'dk-bwt is-none', 'aria-hidden': 'true' }));
    c.appendChild(el('span', { class: 'dk-num is-calm' }, _num(kgToDisplay(last.weight, 1))));
    dkTip(c, 'Bodyweight ' + _num(kgToDisplay(last.weight, 1)) + ' ' + unitLabel() + ' · no meet class yet');
    return c;
  }
  var over = bw.over, pos = Math.max(0, Math.min(100, 72 + over / 3 * 28));
  var track = el('span', { class: 'dk-bwt' + (over > 0 ? ' is-over' : ''), 'aria-hidden': 'true' });
  track.appendChild(el('i', { class: 'dk-bwt-cls' }));
  track.appendChild(el('b', { style: 'left:' + pos.toFixed(1) + '%' }));
  c.appendChild(track);
  c.appendChild(el('span', { class: 'dk-num' + (over > 0 ? '' : ' is-calm') }, (over > 0 ? '+' : over < 0 ? '−' : '±') + _num(kgToDisplay(Math.abs(over), 1))));
  dkTip(c, _num(kgToDisplay(bw.bw, 1)) + ' ' + unitLabel() + ' for the ' + dkClassText(r.meet && r.meet.meet.weightClass) + (over > 0 ? ', ' + _num(kgToDisplay(over, 1)) + ' over' : ', ' + _num(kgToDisplay(-over, 1)) + ' under'));
  return c;
}
function dkBoardMeet(r) {
  var c = el('div', { class: 'dk-bd-meet' });
  if (!r.meet) { c.appendChild(dkNil('No meet planned')); return c; }
  var d = r.meet.days, txt = d === 0 ? 'Today' : d <= 13 ? d + 'd' : 'W-' + Math.ceil(d / 7);
  c.appendChild(el('span', { class: 'dk-num' + (d <= 56 ? ' is-meet' : ' is-calm') }, txt));
  dkTip(c, (r.meet.meet.name || 'Meet') + ' · ' + fmtDate(r.meet.meet.date) + (d ? ' · in ' + d + ' days' : ' · today'));
  return c;
}
function dkBoardPain(r) {
  var c = el('div', { class: 'dk-bd-st' });
  var p = r.status.pain;
  if (!p || !p.open || !p.report) { c.appendChild(dkNil('No pain')); return c; }
  var rep = p.report;
  c.appendChild(el('i', { class: 'dk-dot t-' + (p.severity >= 3 ? 'alert' : 'warn'), 'aria-hidden': 'true' }));
  c.appendChild(el('span', { class: 'dk-bd-pain' }, painPartLabel(rep.bodyPart, rep.side) + ' ' + (Number(rep.severity) || 0) + '/10'));
  dkTip(c, p.text + ' · ' + fmtDateShort(rep.day));
  return c;
}
function dkBoardBare(r) {
  if (r.live || r.status.readiness || r.drift || r.meet || (r.total && r.total.values.length)) return false;
  if (r.status.pain && r.status.pain.open) return false;
  if (dkWeekCells(r).some(function (c) { return c.done > 0; })) return false;
  return !dkLatestBw(r.athlete.id);
}
// "3 lifters with nothing logged yet: Nina, Jonah, Hannah · Write a block"
function dkBoardBareLine(rows) {
  var line = el('div', { class: 'dk-bd-bare', role: 'row' });
  var cell = el('div', { role: 'gridcell' });
  cell.appendChild(el('span', { class: 'dk-bd-bare-lead' }, rows.length === 1 ? '1 lifter with nothing logged yet' : rows.length + ' lifters with nothing logged yet'));
  var names = el('span', { class: 'dk-bd-bare-names' });
  rows.forEach(function (r, i) {
    if (i) names.appendChild(document.createTextNode(', '));
    var b = el('button', { type: 'button', class: 'dk-link' }, r.athlete.name);
    b.addEventListener('click', function () { openAthletePage(r.athlete.id); });
    names.appendChild(b);
  });
  cell.appendChild(names);
  var noProg = rows.find(function (r) { return !r.status.program; });
  if (noProg) {
    var wb = dkBtn(rows.length > 1 ? 'Write ' + _dkFirst(noProg.athlete.name) + '\u2019s first block' : 'Write their first block', { cls: 'is-quiet dk-btn-sm', onClick: function () { openAthleteProgram(noProg.athlete.id); } });
    cell.appendChild(wb);
  }
  line.appendChild(cell);
  return line;
}
// Sortable columns: [key, label, cell, sort value, descending first]
var DK_BOARD_COLS = [
  ['name', 'Lifter'], ['week', 'This week'], ['ready', 'Readiness'], ['drift', 'RPE drift'], ['e1rm', 'e1RM'], ['bw', 'Bodyweight'], ['meet', 'Meet'], ['pain', 'Pain']
];
function dkPaintBoard(body, rows) {
  var before = _dkFlipBefore(body);
  body.innerHTML = '';
  var groups = dkRosterGroups(rows, true);
  // Lifters with nothing to show yet (no week, no lifts, no Health, no meet) are one quiet line
  // under the board, not rows of empty slots.
  var bare = [];
  if (!_dk.search) groups.forEach(function (g) { g.rows = g.rows.filter(function (r) { if (dkBoardBare(r)) { bare.push(r); return false; } return true; }); });
  groups = groups.filter(function (g) { return g.rows.length; });
  _dk.rorder = [];
  groups.forEach(function (g) { g.rows.forEach(function (r) { _dk.rorder.push(r.athlete.id); }); });
  if (_dk.rsel && _dk.rorder.indexOf(_dk.rsel) < 0) _dk.rsel = null;
  if (!rows.length) {
    var v = _dk.view ? DESK_VIEWS.find(function (x) { return x.key === _dk.view; }) : null;
    body.appendChild(el('div', { class: 'dk-noresults' }, el('b', {}, _dk.search ? 'Nobody matches “' + _dk.search + '”' : 'Nobody in ' + (v ? v.label : 'this view')), el('span', {}, _dk.view && !_dk.search ? 'That is good news.' : 'Try another name.')));
    dkPaintBulk();
    return;
  }
  var s = dkSortOf();
  var board = el('div', { class: 'dk-board', role: 'grid', 'aria-label': 'Roster, live', 'aria-rowcount': String(rows.length + 1) });
  var hr = el('div', { class: 'dk-bd-row is-head', role: 'row' });
  var pc = el('div', { class: 'c-pick', role: 'columnheader' });
  var all = el('input', { type: 'checkbox', class: 'dk-cb', 'aria-label': 'Select all ' + rows.length });
  var pickedN = rows.filter(function (r) { return _dk.picked[r.athlete.id]; }).length;
  all.checked = pickedN && pickedN === rows.length;
  all.indeterminate = pickedN > 0 && pickedN < rows.length;
  all.addEventListener('change', function () { rows.forEach(function (r) { _dk.picked[r.athlete.id] = all.checked; }); dkPaintRosterBody(); });
  pc.appendChild(all);
  hr.appendChild(pc);
  DK_BOARD_COLS.forEach(function (col) {
    var key = col[0];
    var th = el('div', { class: 'c-' + key, role: 'columnheader' });
    var on = s.key === key;
    var b = el('button', { type: 'button', class: 'dk-sort' + (on ? ' on' : '') }, col[1]);
    if (on) { th.setAttribute('aria-sort', s.dir > 0 ? 'ascending' : 'descending'); b.appendChild(el('span', { class: 'dk-sort-ar', 'aria-hidden': 'true' }, s.dir > 0 ? '↑' : '↓')); }
    b.addEventListener('click', function () { dkSetSort(key); });
    th.appendChild(b);
    hr.appendChild(th);
  });
  board.appendChild(hr);
  var landed = dkLanded();
  var unread = _dkUnread();
  groups.forEach(function (g) {
    var grp = el('div', { class: 'dk-bd-group', role: 'rowgroup' });
    if (g.label) grp.appendChild(el('div', { class: 'dk-bd-gh', role: 'row' }, el('span', { role: 'rowheader' }, el('b', {}, g.label), el('span', {}, String(g.rows.length)))));
    g.rows.forEach(function (r) {
      var a = r.athlete, st = r.status, sel = _dk.rsel === a.id;
      var row = el('div', { class: 'dk-bd-row' + (sel ? ' is-sel' : '') + (_dk.picked[a.id] ? ' is-picked' : '') + (landed[a.id] ? ' is-landed' : '') + (r.live ? ' is-live' : ''), role: 'row', 'data-id': a.id, tabindex: sel ? '0' : '-1', 'aria-selected': String(!!_dk.picked[a.id]) });
      var pk = el('div', { class: 'c-pick', role: 'gridcell' });
      var cb = el('input', { type: 'checkbox', class: 'dk-cb', 'aria-label': 'Select ' + a.name, tabindex: '-1' });
      cb.checked = !!_dk.picked[a.id];
      cb.addEventListener('click', function (e) { e.stopPropagation(); _dk.picked[a.id] = cb.checked; row.classList.toggle('is-picked', cb.checked); row.setAttribute('aria-selected', String(cb.checked)); dkPaintBulk(); dkSyncAllBox(); });
      pk.appendChild(cb);
      row.appendChild(pk);
      var nm = el('div', { class: 'c-name', role: 'rowheader' });
      nm.appendChild(dkRingAv(r, 'sm'));
      var idw = el('div', { class: 'dk-bd-id' });
      var n1 = el('span', { class: 'dk-bd-name' }, a.name);
      if (unread[a.id]) n1.appendChild(el('span', { class: 'dk-unread', 'aria-label': unread[a.id] + ' unread' }, String(unread[a.id])));
      idw.appendChild(n1);
      idw.appendChild(el('span', { class: 'dk-bd-sub' + (r.live ? ' is-live' : '') }, r.live ? 'Training now · ' + r.live.sets + (r.live.sets === 1 ? ' set' : ' sets') : dkBlockText(st)));
      nm.appendChild(idw);
      row.appendChild(nm);
      var cells = dkWeekCells(r);
      var wk = el('div', { class: 'c-week', role: 'gridcell' });
      wk.appendChild(dkBoardMarks(r, cells));
      row.appendChild(wk);
      [['ready', dkBoardReady], ['drift', dkBoardDrift], ['e1rm', dkBoardTrend], ['bw', dkBoardBw], ['meet', dkBoardMeet], ['pain', dkBoardPain]].forEach(function (x) {
        var cell = el('div', { class: 'c-' + x[0], role: 'gridcell' });
        cell.appendChild(x[1](r));
        row.appendChild(cell);
      });
      row.insertAdjacentHTML('beforeend', '<span class="dk-bd-go" aria-hidden="true">' + DK_IC.chevR + '</span>');
      row.addEventListener('click', function (e) { if (e.target.closest('.dk-cb')) return; _dk.rsel = a.id; openAthletePage(a.id); });
      row.addEventListener('focus', function () { if (_dk.rsel !== a.id) { _dk.rsel = a.id; document.querySelectorAll('#rosterArea .dk-bd-row.is-sel').forEach(function (x) { if (x !== row) { x.classList.remove('is-sel'); x.tabIndex = -1; } }); row.classList.add('is-sel'); row.tabIndex = 0; } });
      grp.appendChild(row);
    });
    board.appendChild(grp);
  });
  if (bare.length) board.appendChild(dkBoardBareLine(bare));
  body.appendChild(board);
  _dkFlipAfter(body, before);
  // The column names stick under the roster's head, whatever its height.
  var ra = document.getElementById('rosterArea'), rh = ra && ra.querySelector(':scope > .dk-rhead');
  if (rh) ra.style.setProperty('--bd-top', rh.offsetHeight + 'px');
  dkPaintBulk();
  dkSyncCtx();
  dkPaintCard();
}
// The bulk bar: Message, Assign a template, Export CSV. Shown only while rows are ticked.
function dkPaintBulk() {
  var area = document.getElementById('rosterArea');
  if (!area) return;
  var old = area.querySelector('.dk-bulk');
  if (old) old.remove();
  var ids = dkPicked();
  area.classList.toggle('has-bulk', !!ids.length);
  if (!ids.length || dkRMode() !== 'board') return;
  var bar = el('div', { class: 'dk-bulk', role: 'toolbar', 'aria-label': ids.length + ' selected' });
  bar.appendChild(el('span', { class: 'dk-bulk-n' }, ids.length + ' selected'));
  bar.appendChild(dkBtn('Message', { icon: DK_IC.messages, cls: 'is-quiet', onClick: function () { dkCompose(ids, { title: ids.length === 1 ? 'Message ' + _dkFirst(dkRow(ids[0]).athlete.name) : 'Message ' + ids.length + ' athletes', onSent: function () { _dk.picked = {}; dkPaintRosterBody(); } }); } }));
  bar.appendChild(dkBtn('Assign template', { icon: ICONS.copy, cls: 'is-quiet', onClick: function (e) { dkAssignTemplate(ids, e.currentTarget); } }));
  if (typeof dsNewTeam === 'function') bar.appendChild(dkBtn('Make a team', { icon: DK_IC.roster, cls: 'is-quiet', title: 'One program for the lifters you ticked, each on their own loads', onClick: function () { dsNewTeam(null, ids); } }));
  bar.appendChild(dkBtn('Export CSV', { icon: DK_IC.download, cls: 'is-quiet', onClick: function () { exportRosterCsv(ids); } }));
  bar.appendChild(dkIconBtn(DK_IC.x, 'Clear selection', function () { _dk.picked = {}; dkPaintRosterBody(); }, 'Esc'));
  area.appendChild(bar);
}

function dkAssignTemplate(ids, anchor) {
  var u = _dkUser();
  var tpls = (Store.get().programTemplates || []).filter(function (t) { return t.coachId === u.id; });
  if (!tpls.length) { toast('Save a program as a template first (Programs → Templates)'); return; }
  var open = function (tpl) {
    openApplyTemplate(tpl);
    document.querySelectorAll('#applyTplList .cohort-cb').forEach(function (cb) {
      if (ids.indexOf(cb.value) >= 0 && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
    });
  };
  if (tpls.length === 1) { open(tpls[0]); return; }
  dkPopMenu(anchor, tpls.map(function (t) { return { label: t.name || 'Template', run: function () { open(t); } }; }), { above: true });
}
// No athletes yet: two actions side by side and a ghost table of the payoff.
function dkRosterEmpty() {
  var box = el('div', { class: 'dk-empty' });
  var head = el('div', { class: 'dk-rhead' });
  head.appendChild(el('h1', { class: 'dk-h1' }, 'Roster'));
  head.appendChild(el('span', { class: 'dk-sp' }));
  box.appendChild(head);
  var msg = el('div', { class: 'dk-empty-msg' });
  msg.appendChild(el('h2', { class: 'dk-h2' }, 'No athletes yet'));
  msg.appendChild(el('p', {}, 'Send each lifter a link. They land here the moment they sign up, with every set they log.'));
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn('Invite', { primary: true, icon: ICONS.plus, onClick: function () { openInviteModal(); } }));
  acts.appendChild(dkBtn('Bring a program in', { onClick: function () { openSheetImport(null); } }));
  msg.appendChild(acts);
  box.appendChild(msg);
  // A glimpse of the live board it becomes: their week as marks, readiness, RPE, the meet.
  var ghost = el('div', { class: 'dk-board dk-ghost', 'aria-hidden': 'true' });
  ghost.inert = true;
  var g = [['Maya Chen', 'Strength · wk 2/4', ['on', 'on', 'todo'], 'Ready', '+0.2', 'W-6', ''],
    ['Leo Grant', 'Peak · wk 3/3', ['on', 'over', 'live'], 'Ready', '+0.4', '9d', ''],
    ['Priya Shah', 'Volume · wk 1/4', ['hard', 'miss', 'todo'], 'Low', '+1.2', '', 'L knee 4/10'],
    ['Jonah Reed', 'Strength · wk 2/4', ['miss', 'miss', 'todo'], '–', '–', '', ''],
    ['Sam Ortiz', 'Hypertrophy · wk 4/6', ['on', 'under', 'on'], 'Ready', '−0.2', '', '']];
  var hr = el('div', { class: 'dk-bd-row is-head' }, el('span'));
  ['Lifter', 'This week', 'Readiness', 'RPE drift', 'e1RM', 'Bodyweight', 'Meet', 'Pain'].forEach(function (x) { hr.appendChild(el('span', { class: 'c-' + x.toLowerCase().replace(/\W.*/, '') }, x)); });
  ghost.appendChild(hr);
  g.forEach(function (x) {
    var row = el('div', { class: 'dk-bd-row' }, el('span'));
    row.appendChild(el('div', { class: 'c-name' }, dkAv({ name: x[0] }, 'is-sm'), el('div', { class: 'dk-bd-id' }, el('span', { class: 'dk-bd-name' }, x[0]), el('span', { class: 'dk-bd-sub' }, x[1]))));
    var om = el('div', { class: 'dk-om' });
    x[2].forEach(function (t) { om.appendChild(el('i', { class: 'dk-om-mark t-' + t })); });
    row.appendChild(el('div', { class: 'c-week' }, om));
    row.appendChild(el('div', { class: 'c-ready' }, el('div', { class: 'dk-bd-st' }, x[3] === '–' ? el('span', { class: 'dk-dim' }, '–') : el('i', { class: 'dk-dot t-' + (x[3] === 'Low' ? 'warn' : 'ok') }), x[3] === '–' ? '' : el('span', { class: x[3] === 'Low' ? '' : 'dk-bd-calm' }, x[3]))));
    row.appendChild(el('div', { class: 'c-drift' }, el('span', { class: 'dk-num' + (parseFloat(x[4].replace('−', '-')) >= 1 ? ' t-alert' : ' is-calm') }, x[4])));
    row.appendChild(el('div', { class: 'c-e1rm' }, el('span', { class: 'dk-dim' }, '–')));
    row.appendChild(el('div', { class: 'c-bw' }, el('span', { class: 'dk-dim' }, '–')));
    row.appendChild(el('div', { class: 'c-meet' }, el('span', { class: x[5] ? 'dk-num is-meet' : 'dk-dim' }, x[5] || '–')));
    row.appendChild(el('div', { class: 'c-pain' }, x[6] ? el('div', { class: 'dk-bd-st' }, el('i', { class: 'dk-dot t-warn' }), el('span', {}, x[6])) : el('span', { class: 'dk-dim' }, '–')));
    row.appendChild(el('span'));
    ghost.appendChild(row);
  });
  box.appendChild(ghost);
  return box;
}
// =====================================================================
// ⌘K PALETTE and the ? SHEET (no open/close animation: used all day)
// =====================================================================
function dkCommands() {
  var cmds = [];
  var rows = _dk.rows || dkRowsFresh();
  // Empty query: who needs the coach first, worst first, each with the top reason.
  ((_dk.queue && _dk.queue.queue) || []).slice(0, 5).forEach(function (r) {
    cmds.push({ group: 'Needs you', label: r.athlete.name, hint: r.reasons[0] ? r.reasons[0].text : '', av: r.athlete, emptyOnly: true,
      run: function () { openAthletePage(r.athlete.id); } });
  });
  rows.slice().sort(function (a, b) { return String(a.athlete.name).localeCompare(String(b.athlete.name)); }).forEach(function (r) {
    var flags = r.reasons.map(function (x) { return x.text; }).concat(r.wins.map(function (w) { return w.text; }));
    cmds.push({ group: 'Athletes', label: r.athlete.name, hint: flags[0] || dkBlockText(r.status), av: r.athlete,
      keys: flags.join(' ').toLowerCase() + ' ' + String(r.athlete.email || '').toLowerCase() + ' ' + dkBlockText(r.status).toLowerCase(),
      run: function () { openAthletePage(r.athlete.id); } });
  });
  var onPage = !!document.querySelector('[data-pane="athlete"]:not(.hidden)');
  [['today', 'Today'], ['roster', 'Roster'], ['programs', 'Programs'], ['meets', 'Meets'], ['messages', 'Messages'], ['clients', 'Clients'], ['club', 'Club'], ['settings', 'Settings']].forEach(function (x) {
    if (x[0] === 'meets' && !dkPlannedMeets().length) return;
    if (x[0] === 'clients' && !window.ClientsUI) return;
    if (x[0] === _dk.screen && !onPage) return;   // already here
    cmds.push({ group: 'Go to', label: x[1], run: function () { deskGo(x[0]); } });
  });
  DESK_VIEWS.forEach(function (v) {
    cmds.push({ group: 'Views', label: v.label, hint: String(deskViewCount(rows, v.key)), keys: 'roster view filter', run: function () { deskGo('roster', { view: v.key }); } });
  });
  var u = _dkUser();
  cmds.push({ group: 'Go to', label: 'Templates', keys: 'programs saved blocks', run: function () { _dk.pbMode = 'templates'; deskGo('programs'); } });
  cmds.push({ group: 'Actions', label: 'Invite an athlete', keys: 'add new', run: function () { openInviteModal(); } });
  (Store.get().programTemplates || []).filter(function (t) { return t.coachId === u.id; }).forEach(function (t) {
    cmds.push({ group: 'Actions', label: 'Assign “' + (t.name || 'Template') + '” to…', keys: 'template program apply', run: function () { openApplyTemplate(t); } });
  });
  if (_dk.queue && _dk.queue.wins.length) cmds.push({ group: 'Actions', label: 'Send kudos to this week’s wins', hint: _dkMac() ? '⌘⇧K' : 'Ctrl Shift K', keys: 'praise congrats pr', run: function () { deskGo('today'); dkKudos(); } });
  cmds.push({ group: 'Actions', label: 'Export roster as CSV', keys: 'download csv file export', run: function () { exportRosterCsv(); } });
  if (window.SwitchKit) cmds = cmds.concat(SwitchKit.deskCommands());   // SWITCH KIT hook: Import history… / Export everything
  var compact = document.documentElement.getAttribute('data-density') === 'compact';
  var light = document.documentElement.getAttribute('data-theme') === 'light';
  cmds.push({ group: 'Actions', label: compact ? 'Comfortable rows' : 'Compact rows', keys: 'density', run: dkToggleDensity });
  cmds.push({ group: 'Actions', label: light ? 'Dark theme' : 'Light theme', keys: 'appearance mode', run: function () { toggleTheme(); } });
  cmds.push({ group: 'Actions', label: 'Show weights in ' + (getUnit() === 'kg' ? 'lb' : 'kg'), keys: 'units pounds kilos', run: function () { toggleUnit(); } });
  cmds.push({ group: 'Actions', label: document.documentElement.classList.contains('rail-min') ? 'Expand the sidebar' : 'Collapse the sidebar', hint: '[', run: dkToggleRail });
  cmds.push({ group: 'Actions', label: dkRMode() === 'board' ? 'Roster as a list' : 'Roster as the live board', hint: 'V', keys: 'view switch board live list', run: function () { if (_dk.screen !== 'roster') deskGo('roster'); dkSetRMode(dkRMode() === 'board' ? 'list' : 'board'); } });
  cmds.push({ group: 'Actions', label: 'Open or close the side card', hint: ']', keys: 'thread notes pane', run: dkToggleCtx });
  cmds.push({ group: 'Actions', label: 'Keyboard shortcuts', hint: '?', run: openDeskKeys });
  cmds.push({ group: 'Actions', label: 'Ask AI', keys: 'assistant help', run: function () { if (typeof openAIAssistant === 'function') openAIAssistant(); } });
  return cmds;
}
function dkMatch(cmds, q) {
  q = q.trim().toLowerCase();
  if (!q) {
    var needs = cmds.filter(function (c) { return c.group === 'Needs you'; });
    var rest = cmds.filter(function (c) { return !c.emptyOnly && c.group !== 'Athletes'; });
    return needs.length ? needs.concat(rest) : rest.concat(cmds.filter(function (c) { return c.group === 'Athletes'; }).slice(0, 5));
  }
  var toks = q.split(/\s+/);
  return cmds.filter(function (c) { return !c.emptyOnly; }).map(function (c) {
    var lab = c.label.toLowerCase(), hay = lab + ' ' + c.group.toLowerCase() + ' ' + (c.keys || '');
    if (!toks.every(function (t) { return hay.indexOf(t) >= 0; })) return null;
    var score = lab.indexOf(q) === 0 ? 0 : lab.split(/\s+/).some(function (w) { return w.indexOf(toks[0]) === 0; }) ? 1 : 2;
    return { c: c, s: score };
  }).filter(Boolean).sort(function (a, b) { return a.s - b.s; }).map(function (x) { return x.c; }).slice(0, 40);
}
function dkModalOpen() { return !!document.querySelector('.dk-veil'); }
function openDeskPalette() {
  if (document.querySelector('.dk-pal')) return;
  closeDkMenus();
  var prevFocus = document.activeElement;
  var all = dkCommands(), shown = [], idx = 0;
  var veil = el('div', { class: 'dk-veil is-top' });
  var box = el('div', { class: 'dk-modal dk-pal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Command palette' });
  var inw = el('div', { class: 'dk-pal-in' });
  inw.insertAdjacentHTML('beforeend', DK_IC.search);
  var input = el('input', { type: 'text', placeholder: 'Jump to an athlete, a screen or an action', 'aria-label': 'Search commands', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'dkPalList', autocomplete: 'off', spellcheck: 'false' });
  inw.appendChild(input);
  inw.appendChild(dkKbd('esc'));
  box.appendChild(inw);
  var list = el('div', { class: 'dk-pal-list', id: 'dkPalList', role: 'listbox' });
  box.appendChild(list);
  veil.appendChild(box);
  document.body.appendChild(veil);
  input.focus();
  function paint() {
    shown = dkMatch(all, input.value);
    if (idx >= shown.length) idx = Math.max(0, shown.length - 1);
    list.innerHTML = '';
    if (!shown.length) { list.appendChild(el('div', { class: 'dk-pal-none' }, 'Nothing matches.')); return; }
    var g = null;
    shown.forEach(function (c, i) {
      if (c.group !== g) { g = c.group; list.appendChild(el('div', { class: 'dk-pal-group', role: 'presentation' }, g)); }
      var it = el('div', { class: 'dk-pal-item' + (i === idx ? ' on' : ''), role: 'option', id: 'dkPal' + i, 'aria-selected': String(i === idx) });
      if (c.av) it.appendChild(dkAv(c.av, 'is-xs'));
      it.appendChild(el('span', { class: 'dk-pal-label' }, c.label));
      if (c.hint) it.appendChild(el('span', { class: 'dk-pal-hint' }, c.hint));
      it.addEventListener('mousemove', function () { if (idx !== i) { idx = i; mark(); } });
      it.addEventListener('click', function () { run(i); });
      list.appendChild(it);
    });
    input.setAttribute('aria-activedescendant', 'dkPal' + idx);
  }
  function mark() {
    list.querySelectorAll('.dk-pal-item').forEach(function (n, i) { n.classList.toggle('on', i === idx); n.setAttribute('aria-selected', String(i === idx)); });
    var on = list.querySelector('.dk-pal-item.on');
    if (on) on.scrollIntoView({ block: 'nearest' });
    input.setAttribute('aria-activedescendant', 'dkPal' + idx);
  }
  function run(i) { var c = shown[i]; close(true); if (c) c.run(); }
  function close(ran) {
    document.removeEventListener('keydown', onKey, true);
    veil.remove();
    if (!ran && prevFocus && prevFocus.focus) try { prevFocus.focus({ preventScroll: true }); } catch (e) {}
  }
  veil._close = function () { close(); };
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); return; }
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) { e.preventDefault(); idx = Math.min(shown.length - 1, idx + 1); mark(); return; }
    if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) { e.preventDefault(); idx = Math.max(0, idx - 1); mark(); return; }
    if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); run(idx); return; }
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopImmediatePropagation(); close(); }
  }
  input.addEventListener('input', function () { idx = 0; paint(); });
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
  document.addEventListener('keydown', onKey, true);
  paint();
}
function openDeskKeys() {
  if (document.querySelector('.dk-keys')) return;
  closeDkMenus();
  var groups = dkKeyGroups();
  var veil = el('div', { class: 'dk-veil' });
  var box = el('div', { class: 'dk-modal dk-keys', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Keyboard shortcuts' });
  var hd = el('div', { class: 'dk-keys-head' });
  hd.appendChild(el('h2', { class: 'dk-modal-title' }, 'Keyboard shortcuts'));
  var x = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Close', html: ICONS.x });
  x.addEventListener('click', close);
  hd.appendChild(x);
  box.appendChild(hd);
  var cols = el('div', { class: 'dk-keys-cols' });
  groups.forEach(function (g) {
    var col = el('div', { class: 'dk-keys-col' });
    col.appendChild(el('h3', { class: 'dk-sec-title' }, g[0]));
    g[1].forEach(function (k) {
      var row = el('div', { class: 'dk-keys-row' });
      row.appendChild(el('span', {}, k[1]));
      var kk = el('span', { class: 'dk-keys-k' });
      k[0].split('  ').forEach(function (p) { kk.appendChild(dkKbd(p)); });
      row.appendChild(kk);
      col.appendChild(row);
    });
    cols.appendChild(col);
  });
  box.appendChild(cols);
  box.tabIndex = -1;
  veil.appendChild(box);
  document.body.appendChild(veil);
  box.focus();
  function onKey(e) { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }
  function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
  veil._close = close;
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
  document.addEventListener('keydown', onKey, true);
}

// ---------- the keys (accelerators: every one of them is also a button) ----------
function _dkTyping(t) {
  if (!t || t === document.body) return false;
  var tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || t.isContentEditable;
}
function _dkBlocked() {
  return !!document.querySelector('.modal-backdrop.open, .ui-sheet-veil, .ai-panel.is-open, .dk-veil, .tour-overlay, .tour-pop');
}
function dkOnKey(e) {
  if (!isDesk() || e.defaultPrevented || e.isComposing) return;
  var k = e.key, mod = e.metaKey || e.ctrlKey;
  if (mod && !e.altKey && (k === 'k' || k === 'K')) {
    // Never over another dialog (a drafted broadcast would sit under it); the palette closes itself.
    if (_dkBlocked()) return;
    if (e.shiftKey) { if (_dk.screen === 'today' && !_dkTyping(e.target)) { e.preventDefault(); dkKudos(); } return; }
    e.preventDefault();
    openDeskPalette();
    return;
  }
  // The builder: ⌘Z undoes the last change to the block (in a field, the field's own undo comes first).
  if (mod && !e.shiftKey && !e.altKey && (k === 'z' || k === 'Z') && _dk.screen === 'programs' && !_dkOnPage() && !_dkTyping(e.target) && !_dkBlocked() && _dkVis('#programArea .dk-bxv:not(.is-ro)')) { e.preventDefault(); dkPbUndo(); return; }
  if (mod || e.altKey) return;
  if (k === 'Escape' && e.target.closest && e.target.closest('#dkMsgCentre') && _dkTyping(e.target)) {
    e.preventDefault(); e.target.blur();
    var mr = document.querySelector('#messagesArea .dk-msg-row.is-sel'); if (mr) mr.focus({ preventScroll: true });
    return;
  }
  if (k === 'Escape' && e.target.closest && e.target.closest('#deskCtx') && _dkTyping(e.target)) {
    e.preventDefault();
    e.target.blur();
    var back = _dk.screen === 'today' ? document.querySelector('#deskToday .dk-qrow.is-sel') : document.querySelector('#rosterArea .dk-qrow.is-sel, #rosterArea .dk-bd-row.is-sel');
    if (back && !_dkOnPage()) back.focus({ preventScroll: true });
    return;
  }
  if (_dkTyping(e.target)) return;
  if (_dkBlocked()) return;
  if (document.querySelector('.dk-menu')) return;
  var onPage = _dkOnPage();
  if (k === 'Escape' && _dk.card && (onPage || _dk.screen === 'today' || _dk.screen === 'roster')) { e.preventDefault(); dkCloseCard(); return; }
  if (k === '?') { e.preventDefault(); openDeskKeys(); return; }
  if (k === '[') { e.preventDefault(); dkToggleRail(); return; }
  if (k === ']') { e.preventDefault(); dkToggleCtx(); return; }
  if (k === '/') {
    e.preventDefault();
    var own = !onPage && (_dk.screen === 'messages' ? '#messagesArea .dk-search input' : _dk.screen === 'programs' ? '#dkPbList .dk-search input' : null);
    if (own && document.querySelector(own)) { var s0 = document.querySelector(own); s0.focus(); s0.select(); return; }
    if (_dk.screen !== 'roster' || onPage) deskGo('roster', { view: _dk.view });
    var si = document.querySelector('#rosterArea .dk-search input');
    if (si) { si.focus(); si.select(); }
    return;
  }
  var low = k.length === 1 ? k.toLowerCase() : k;
  if (onPage) {
    // The athlete's page: J/K through the list the coach came from.
    if (low === 'j' || k === 'ArrowRight') { e.preventDefault(); dkWsStep(1); }
    else if (low === 'k' || k === 'ArrowLeft') { e.preventDefault(); dkWsStep(-1); }
    else if (low === 'r' || low === 'm') { e.preventDefault(); dkOpenCard('thread'); }
    else if (low === 'n') { e.preventDefault(); dkNoteCompose(); }
    else if (low === 'p') { e.preventDefault(); openAthleteProgram(window._apAthlete); }
    else if (low === 'a' && e.shiftKey) { e.preventDefault(); dkWsAcceptAll(); }
    else if (k === 'Escape') { e.preventDefault(); dkWsBack(); }
    return;
  }
  if (_dk.screen === 'today') {
    if (low === 'j' || k === 'ArrowDown') { e.preventDefault(); dkMove(1); }
    else if (low === 'k' || k === 'ArrowUp') { e.preventDefault(); dkMove(-1); }
    else if (low === 'e' && _dk.sel) { e.preventDefault(); dkMark('done'); }
    else if (low === 's' && _dk.sel && _dk.sel.lane === 'q') { e.preventDefault(); dkMark('snooze'); }
    else if (low === 'u') { e.preventDefault(); dkUndo(); }
    else if ((low === 'r' || low === 'm') && _dk.sel) { e.preventDefault(); dkOpenCard('thread'); }
    else if ((low === 'o' || low === 'p') && _dk.sel) { e.preventDefault(); openAthleteProgram(_dk.sel.id); }
    else if (k === 'Enter' && _dk.sel && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); openAthletePage(_dk.sel.id); }
    else if (low === 'x' && _dk.sel && _dk.sel.lane === 'w') { e.preventDefault(); _dk.wpick[_dk.sel.id] = !_dk.wpick[_dk.sel.id]; renderDeskToday({ keepCentre: true }); }
    else if (low === 'n' && _dk.sel) { e.preventDefault(); dkNoteCompose(); }
    else if (low === 'a' && e.shiftKey && _dk.sel) { e.preventDefault(); dkWsAcceptAll(); }
  } else if (_dk.screen === 'messages') {
    if (low === 'j' || k === 'ArrowDown') { e.preventDefault(); dkMsgMove(1); }
    else if (low === 'k' || k === 'ArrowUp') { e.preventDefault(); dkMsgMove(-1); }
    else if (low === 'e' && _dk.msgSel) { e.preventDefault(); dkMsgDone(); }
    else if (low === 'r' && _dk.msgSel) { e.preventDefault(); var ta = document.querySelector('#dkMsgCentre .msg-input'); if (ta) ta.focus(); }
    else if (low === 'n' && _dk.msgSel) { e.preventDefault(); var pn = document.querySelector('#deskCtx .dk-pn'); if (pn && pn._compose) pn._compose(); }
    else if (k === 'Enter' && _dk.msgSel && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); openAthletePage(_dk.msgSel); }
  } else if (_dk.screen === 'roster') {
    if (low === 'j' || k === 'ArrowDown') { e.preventDefault(); dkRMove(1); }
    else if (low === 'k' || k === 'ArrowUp') { e.preventDefault(); dkRMove(-1); }
    else if (low === 'x') { e.preventDefault(); dkRPick(); }
    else if ((low === 'm' || low === 'r') && _dk.rsel) { e.preventDefault(); dkOpenCard('thread'); }
    else if (low === 'n' && _dk.rsel) { e.preventDefault(); dkNoteCompose(); }
    else if (low === 'p' && _dk.rsel) { e.preventDefault(); openAthleteProgram(_dk.rsel); }
    else if (low === 'a' && e.shiftKey && _dk.rsel) { e.preventDefault(); dkWsAcceptAll(); }
    else if (low === 'v') { e.preventDefault(); var mds = ['board', 'list'].concat(typeof dsPaintCalendar === 'function' ? ['calendar'] : []); dkSetRMode(mds[(mds.indexOf(dkRMode()) + 1) % mds.length]); }
    else if (k === 'Enter' && _dk.rsel && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); openAthletePage(_dk.rsel); }
    else if (k === 'Escape') {
      if (dkPicked().length) { e.preventDefault(); _dk.picked = {}; dkPaintRosterBody(); }
      else if (_dk.view || _dk.search) { e.preventDefault(); _dk.search = ''; deskGo('roster', { view: null }); }
      else if (_dk.rsel && dkRMode() === 'board') { e.preventDefault(); dkRClose(); }
    }
  } else if (_dk.screen === 'programs' && _dk.pbMode !== 'templates' && _dkVis('#programArea .dk-bxv:not(.is-ro)')) {
    // The builder: ← → or 1–9 for the week, V for Sessions or Progression, E (or ↵) to write.
    if ((k === 'ArrowRight' || k === 'ArrowLeft') && !(e.target.closest && e.target.closest('.dk-tl, .dk-seg'))) { e.preventDefault(); dkBxStep(k === 'ArrowRight' ? 1 : -1); }
    else if (/^[1-9]$/.test(k)) { e.preventDefault(); var bx = _dkVis('#programArea .dk-bxv:not(.is-ro)'); if (bx) dkBxPick(bx, Number(k) - 1); }
    else if (low === 'v') { e.preventDefault(); deskSetPbView(deskPbView() === 'progress' ? 'sessions' : 'progress'); loadProgram(); }
    else if (low === 'e' || (k === 'Enter' && !/^(BUTTON|A|INPUT)$/.test(e.target.tagName) && !(e.target.closest && e.target.closest('[role="button"]')))) {
      var fi = _dkVis('#programArea .dk-bx-wk input.dk-bx-in:not([readonly])') || _dkVis('#programArea .dk-bx-wk input.dk-bx-addin');
      if (fi) { e.preventDefault(); fi.focus(); fi.select && fi.select(); }
    }
  }
}

// =====================================================================
// MEETS: every meet on the calendar, who's lifting in it, and how far
// out each lifter is (block, class, bodyweight). Shown only when there
// is one. Reads the existing meets (planned or dated ahead).
// =====================================================================
function dkPlannedMeets() {
  var u = _dkUser();
  if (!u) return [];
  var mine = {};
  (Store.get().athletes || []).forEach(function (a) { if (a.coachId === u.id) mine[a.id] = a; });
  var t = todayISO(), groups = {};
  (Store.get().meets || []).forEach(function (m) {
    if (!mine[m.athleteId] || !m.date || String(m.date).slice(0, 10) < t) return;
    var k = String(m.name || 'Meet').trim().toLowerCase() + '|' + String(m.date).slice(0, 10);
    (groups[k] = groups[k] || { name: m.name || 'Meet', date: String(m.date).slice(0, 10), federation: m.federation || '', entries: [] }).entries.push({ meet: m, athlete: mine[m.athleteId] });
  });
  return Object.keys(groups).map(function (k) { return groups[k]; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
}
function dkBuildMeetsPane() {
  if (document.querySelector('[data-pane="meets"]')) return;
  var main = document.querySelector('.dash-main');
  if (!main) return;
  var sec = el('section', { 'data-pane': 'meets', class: 'hidden' });
  sec.appendChild(el('div', { id: 'deskMeets', class: 'dk-meets' }));
  var today = main.querySelector('[data-pane="today"]');
  if (today && today.nextSibling) main.insertBefore(sec, today.nextSibling); else main.appendChild(sec);
}
function dkRenderMeets() {
  var host = document.getElementById('deskMeets');
  if (!host) return;
  if (typeof window.renderMeetsScreen === 'function') { window.renderMeetsScreen(host); return; }   // MEET DAY: planner + board (meetday.js)
  if (typeof dsRenderMeetsList === 'function') { dsRenderMeetsList(host); return; }   // desk-season.js: planned and done, by date
  if (!_dk.rows) dkRowsFresh();
  host.innerHTML = '';
  var meets = dkPlannedMeets();
  var head = el('div', { class: 'dk-page-head' });
  head.appendChild(el('h1', { class: 'dk-h1' }, 'Meets'));
  var lifters = meets.reduce(function (n, m) { return n + m.entries.length; }, 0);
  head.appendChild(el('span', { class: 'dk-rmeta' }, meets.length + (meets.length === 1 ? ' meet' : ' meets') + ' · ' + lifters + (lifters === 1 ? ' lifter' : ' lifters')));
  host.appendChild(head);
  if (!meets.length) { host.appendChild(el('div', { class: 'dk-noresults' }, el('b', {}, 'No meets on the calendar'), el('span', {}, 'They add one under Progress, or you plan one from their page.'))); return; }
  var list = el('div', { class: 'dk-mtl' });
  meets.forEach(function (g) {
    var days = Math.round((Date.parse(g.date + 'T12:00:00Z') - Date.parse(todayISO() + 'T12:00:00Z')) / 86400000);
    var card = el('div', { class: 'dk-mtc' + (days <= 14 ? ' is-soon' : ''), role: 'group', 'aria-label': g.name });
    var dt = new Date(g.date + 'T12:00:00');
    var cal = el('div', { class: 'dk-mtc-cal', 'aria-hidden': 'true' }, el('span', {}, dt.toLocaleDateString(undefined, { month: 'short' })), el('b', {}, String(dt.getDate())));
    var hd = el('div', { class: 'dk-mtc-head' });
    hd.appendChild(cal);
    var ti = el('div', { class: 'dk-mtc-id' });
    ti.appendChild(el('h2', { class: 'dk-mtc-name' }, g.name));
    ti.appendChild(el('span', {}, [fmtDate(g.date), g.federation].filter(Boolean).join(' · ')));
    hd.appendChild(ti);
    hd.appendChild(el('span', { class: 'dk-mtc-days' }, days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : days <= 21 ? days + ' days' : Math.round(days / 7) + ' weeks'));
    card.appendChild(hd);
    var rows = el('div', { class: 'dk-mtc-rows' });
    g.entries.forEach(function (x) {
      var r = dkRow(x.athlete.id);
      var row = el('button', { type: 'button', class: 'dk-mtc-row' });
      row.appendChild(r ? dkRingAv(r, 'sm') : dkAv(x.athlete, 'is-sm'));
      var main = el('span', { class: 'dk-mtc-main' });
      main.appendChild(el('b', {}, x.athlete.name));
      main.appendChild(el('span', {}, r ? dkBlockText(r.status) : ''));
      row.appendChild(main);
      var bw = deskBodyweightVsClass(x.athlete.id, x.meet);
      var cls = el('span', { class: 'dk-mtc-cls' + (bw && bw.over > 0 ? ' is-over' : '') });
      if (x.meet.weightClass) cls.appendChild(el('span', {}, dkClassText(x.meet.weightClass)));
      if (bw) cls.appendChild(el('b', {}, 'BW ' + _num(kgToDisplay(bw.bw, 1)) + (bw.over > 0 ? ' · ' + _num(kgToDisplay(bw.over, 1)) + ' over' : '')));
      row.appendChild(cls);
      row.insertAdjacentHTML('beforeend', DK_IC.chevR);
      row.addEventListener('click', function () { openAthletePage(x.athlete.id); });
      rows.appendChild(row);
    });
    card.appendChild(rows);
    list.appendChild(card);
  });
  host.appendChild(list);
}

// ---------- Settings › Invite athletes: the links still out, copy or revoke ----------
function dkSetAthletes(p, redraw) {
  var u = _dkUser() || {};
  var inv = (Store.get().invites || []).filter(function (i) { return i.coachId === u.id && !i.used; });
  p.appendChild(el('p', { class: 'dk-set-lead' }, 'One link per athlete. They get the app and land on your roster with every set they log. An unused link holds a seat.'));
  p.appendChild(dkSetGroup([
    dkSetRow('Invite links', inv.length ? inv.length + ' waiting to be used' : 'None out', dkBtn('Invite', { cls: 'dk-btn-sm', icon: DK_IC.plus, onClick: function () { openInviteModal(); } })),
    dkSetRow('Bring a program in', 'From a photo, a screenshot, a PDF, a pasted block or a .csv file', dkBtn('Bring in', { cls: 'dk-btn-sm is-quiet', onClick: function () { openSheetImport(null); } })),
    dkSetRow('Export your roster', 'Every lifter, their block and last session, as a CSV file', dkBtn('Export CSV', { cls: 'dk-btn-sm is-quiet', onClick: function () { exportRosterCsv(); } }))
  ]));
  if (!inv.length) return;
  p.appendChild(el('h3', { class: 'dk-sec-title' }, 'Waiting to be used'));
  p.appendChild(dkSetGroup(inv.map(function (i) {
    var url = typeof _inviteUrl === 'function' ? _inviteUrl(i.code) : 'powalifta.com/j/' + i.code;
    var acts = el('span', { class: 'dk-set-acts' });
    acts.appendChild(dkBtn('Copy link', { cls: 'dk-btn-sm is-quiet', onClick: function () {
      var txt = (typeof _inviteMessage === 'function' ? _inviteMessage() + ' ' : '') + url;
      var done = function () { toast('Invite link copied'); };
      if (typeof _copyText === 'function') _copyText(txt).then(done).catch(function () { toast(url); });
      else if (navigator.clipboard) navigator.clipboard.writeText(txt).then(done).catch(function () { toast(url); });
    } }));
    var rv = dkBtn('Revoke', { cls: 'dk-btn-sm is-quiet' });
    rv.addEventListener('click', async function () {
      if (!rv.dataset.armed) { rv.dataset.armed = '1'; rv.querySelector('.dk-btn-l').textContent = 'Revoke?'; setTimeout(function () { if (rv.isConnected) { delete rv.dataset.armed; rv.querySelector('.dk-btn-l').textContent = 'Revoke'; } }, 2600); return; }
      Store.update(function (s) { s.invites = s.invites.filter(function (x) { return x.code !== i.code; }); });
      if (typeof persistDeleteInvite === 'function') { try { await persistDeleteInvite(i.code); } catch (e) {} }
      if (redraw) redraw();
    });
    acts.appendChild(rv);
    return dkSetRow(i.code, i.email || 'Any athlete · ' + String(url).replace(/^https?:\/\//, ''), acts);
  })));
}


// =====================================================================
// THE ATHLETE'S WEEK (the workspace): one head, what needs the coach in
// plain sentences, the lifts as one strip, then the big table: Written |
// Logged | RPE gap | Next week, next week editable in place with
// suggestion chips from the RPE they logged (app.js deskWeekReview), and
// the one red Publish. Below: check-ins, recovery, meets, pain, their
// notes, past blocks. Today's and the roster's centre draw it for the
// selected athlete, the week sheet draws its table inline, and the
// athlete's page (#athlete=ID) draws it full width with ‹ ›.
// =====================================================================
function _dkCoachMeId() { var u = _dkUser(); return u ? u.id : null; }
function dkLatestBw(id) {
  return (Store.get().bodyweight || []).filter(function (b) { return b.athleteId === id && Number(b.weight) > 0; })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0] || null;
}
function dkClassText(wc) { var s = String(wc || '').trim(); return s ? (/kg|lb|\+/i.test(s) ? s : s + ' kg') + ' class' : ''; }
function dkJoinedText(a) {
  var d = a && a.createdAt ? Math.max(0, Math.floor((Date.now() - Number(a.createdAt)) / 86400000)) : null;
  return d == null ? 'New on your roster' : d === 0 ? 'Joined today' : d === 1 ? 'Joined yesterday' : 'Joined ' + d + ' days ago';
}
// The subline's facts, each kept whole ("57 kg class" never splits): it wraps between facts only.
function dkSubFacts(host, bits, lead) {
  bits.forEach(function (b, i) { var f = el('span', { class: 'dk-fact' }, (i || lead ? ' · ' : '')); f.appendChild(dkRich(b)); host.appendChild(f); });
  return host;
}
// [block, meet, class, bodyweight, cut, readiness]. What a reason already says isn't said twice.
function dkWsSubBits(r) {
  var a = r.athlete, said = function (t) { return r.reasons.some(function (x) { return x.type === t; }); };
  if (!r.status.program && r.status.ago == null) return [dkJoinedText(a)];
  var st = r.status, bits = [st.program ? deskBlockLabel(st.program, null) + (st.week ? ' · ' + (st.week.finished ? 'done' : 'week ' + st.week.number + ' of ' + st.week.total) : '') : 'No program'];
  if (r.meet && !said('meet')) bits.push(r.meet.meet.name + (r.meet.days === 0 ? ' today' : ' in ' + r.meet.days + ' days'));
  if (r.meet && r.meet.meet.weightClass && r.meet.days <= 120 && !said('weight')) bits.push(dkClassText(r.meet.meet.weightClass));
  var bw = dkLatestBw(a.id);
  if (bw && !said('weight')) bits.push('BW ' + _num(kgToDisplay(bw.weight, 1)));
  if (st.cut && st.cut.line && !said('offpace') && !said('weight')) bits.push(st.cut.line);
  if (r.live) bits.push('training now');
  return bits;
}
// The list ‹ › walks: Today's queue, the roster as drawn, Messages, or everyone by name.
function dkWsList(id) {
  var rows = _dk.rows || dkRowsFresh();
  var out = null;
  if (_dk.screen === 'today' && _dk.queue && _dk.queue.queue.length) out = { ids: _dk.queue.queue.map(function (r) { return r.athlete.id; }), label: 'to review' };
  else if (_dk.screen === 'messages' && _dk.msgOrder.length) out = { ids: _dk.msgOrder.slice(), label: 'in Messages' };
  else if (_dk.screen === 'roster' && _dk.rorder.length) {
    var v = _dk.view ? DESK_VIEWS.find(function (x) { return x.key === _dk.view; }) : null;
    out = { ids: _dk.rorder.slice(), label: 'in ' + (v ? v.label : 'Roster') };
  }
  if (!out || out.ids.indexOf(id) < 0) out = { ids: rows.slice().sort(function (a, b) { return String(a.athlete.name).localeCompare(String(b.athlete.name)); }).map(function (r) { return r.athlete.id; }), label: 'in Roster' };
  return out;
}
// coach.html's renderAthletePage hands the desk its host: the workspace, full width.
function deskRenderWorkspace(host, athleteId) {
  if (!host) return;
  dkRowsFresh();
  var r = dkRow(athleteId);
  host.innerHTML = '';
  if (!r) return;
  if (!_dk.ws || _dk.ws.ids.indexOf(athleteId) < 0) _dk.ws = dkWsList(athleteId);
  var i = _dk.ws.ids.indexOf(athleteId), n = _dk.ws.ids.length;
  var back = el('button', { class: 'dk-back', type: 'button', html: DK_IC.chevL + '<span>' + escHtml(deskBackLabel()) + '</span>' });
  dkTip(back, '', 'Esc');
  back.addEventListener('click', dkWsBack);
  host.appendChild(back);
  host.appendChild(dkWorkspace(r, { mode: 'page', pos: n > 1 ? (i + 1) + ' of ' + n + ' ' + _dk.ws.label : null }));
}
// Esc / ‹: back to the list the coach came from (Today, the roster in its view, Messages…).
function dkWsBack() {
  _dk.ws = null;
  var scr = _dk.screen || 'today';
  deskGo(scr, scr === 'roster' ? { view: _dk.view } : {});
}
// J / K on the athlete page: the next athlete in the same list, in place (one history entry).
function dkWsStep(step) {
  var cur = window._apAthlete;
  if (!_dk.ws) _dk.ws = dkWsList(cur);
  var ids = _dk.ws.ids, i = ids.indexOf(cur);
  if (!ids.length) return;
  var nx = ids[(i + step + ids.length) % ids.length];
  if (!nx || nx === cur) return;
  window._apAthlete = nx;
  try { history.replaceState({ athlete: nx }, '', '#athlete=' + nx); } catch (e) {}
  if (typeof renderAthletePage === 'function') renderAthletePage(nx);
  dkPaintCard();
  var main = document.querySelector('[data-pane="athlete"]');
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
}
function dkWorkspace(r, opts) {
  opts = opts || {};
  var mode = opts.mode;
  var ws = el('div', { class: 'dk-ws is-' + mode, 'data-aid': r.athlete.id });
  ws.appendChild(dkWsHead(r, opts));
  var needs = dkWsNeeds(r, opts.lane);
  if (needs) ws.appendChild(needs);
  // The week first (their sessions as lifted, next week written beside them); the lifts under it.
  var wk = dkWsWeek(r);
  ws.appendChild(wk);
  ws.appendChild(dkWsLifts(r));
  // Two columns: how they are (check-in, recovery, pain) | what's coming and what they said.
  var ci = dkWsCheckins(r), rc = dkWsRecovery(r), pn = dkWsPain(r, wk._used), nt = dkWsNotes(r, wk._noteDates);
  var L = [pn, rc && dkSection('Apple Health', rc, el('span', { class: 'dk-sec-meta' }, 'Last 30 days')), ci && dkSection('Check-in', ci, el('span', { class: 'dk-sec-meta' }, 'Last 4 weeks'))].filter(Boolean);
  var R = [dkSection('Meets', dkWsMeets(r)), nt && dkSection('Their notes', nt)].filter(Boolean);
  if (!L.length) L.push(R.shift());
  var cols = el('div', { class: 'dk-ws-cols' });
  [L, R].forEach(function (part) { if (!part.length) return; var col = el('div', { class: 'dk-ws-col' }); part.forEach(function (x) { col.appendChild(x); }); cols.appendChild(col); });
  ws.appendChild(cols);
  if (mode === 'page') { var bl = dkWsBlocks(r); if (bl) ws.appendChild(bl); }
  return ws;
}
// The head: ring, name, the facts; ‹ › through the list; then one row of buttons ending in the
// one red action.
function dkWsHead(r, opts) {
  var a = r.athlete, mode = opts.mode;
  var wrap = el('div', { class: 'dk-ws-top' });
  var head = el('div', { class: 'dk-ws-head' });
  head.appendChild(dkRingAv(r, 'lg'));
  var id = el('div', { class: 'dk-ws-id' });
  var h = el(mode === 'page' ? 'h1' : 'h2', { class: 'dk-ws-name' });
  if (mode === 'today' || mode === 'roster') {
    var nb = el('button', { type: 'button', class: 'dk-link' }, a.name);
    nb.insertAdjacentHTML('beforeend', DK_IC.open);
    dkTip(nb, 'Open their page', '↵');
    nb.addEventListener('click', function () { openAthletePage(a.id); });
    h.appendChild(nb);
  } else h.textContent = a.name;
  id.appendChild(h);
  var subEl = dkSubFacts(el('div', { class: 'dk-ws-sub' }), dkWsSubBits(r));
  // Readiness from Apple Health: a dot and one word in the facts line, as on the board.
  var rdy = r.status.readiness;
  if (rdy && !r.reasons.some(function (x) { return x.type === 'readiness'; })) {
    var rf = el('span', { class: 'dk-fact' }, ' · ');
    var rfs = rf.appendChild(el('span', { class: 'dk-fact-st' }, el('i', { class: 'dk-dot t-' + (rdy.state === 'low' ? 'warn' : 'ok'), 'aria-hidden': 'true' }), rdy.state === 'low' ? 'Readiness low' : 'Ready'));
    dkTip(rfs, rdy.state === 'low' ? (rdy.text || 'Readiness low') : 'Resting HR and HRV at their usual · Apple Health');
    subEl.appendChild(rf);
  }
  id.appendChild(subEl);
  head.appendChild(id);
  if (opts.pos) {
    var nav = el('div', { class: 'dk-ws-pos', role: 'group', 'aria-label': opts.pos });
    var step = mode === 'page' ? dkWsStep : mode === 'roster' ? dkRMove : dkMove;
    nav.appendChild(dkIconBtn(DK_IC.chevL, 'Previous', function () { step(-1); }, 'K'));
    nav.appendChild(el('span', { class: 'dk-ws-pos-text' }, opts.pos));
    nav.appendChild(dkIconBtn(DK_IC.chevR, 'Next', function () { step(1); }, 'J'));
    head.appendChild(nav);
  }
  wrap.appendChild(head);

  var bar = el('div', { class: 'dk-ws-bar' });
  if (mode === 'today' && opts.lane === 'q') {
    bar.appendChild(dkBtn('Done', { icon: DK_IC.check, kbd: 'E', title: 'Done for this week. They come back if something new comes up.', onClick: function () { dkMark('done'); } }));
    bar.appendChild(dkBtn('Snooze', { icon: DK_IC.snooze, kbd: 'S', cls: 'is-quiet', title: 'Snooze till tomorrow', onClick: function () { dkMark('snooze'); } }));
  } else if (mode === 'today' && opts.lane === 'w') {
    bar.appendChild(dkBtn('Seen', { icon: DK_IC.check, kbd: 'E', onClick: function () { dkMark('done'); } }));
    bar.appendChild(dkBtn('Send kudos', { icon: DK_IC.spark, cls: 'is-quiet', onClick: function () { _dk.wpick = {}; _dk.wpick[a.id] = true; dkKudos(); } }));
  }
  var un = _dkUnread()[a.id] || 0;
  var msg = dkBtn('Message', { icon: DK_IC.messages, kbd: 'R', count: un || null, cls: 'is-quiet', onClick: function () { if (_dk.card === 'thread' && dkCardAid() === a.id) dkCloseCard(); else dkOpenCard('thread'); } });
  msg.dataset.card = 'thread';
  bar.appendChild(msg);
  var nts = dkBtn('Notes', { icon: DK_IC.note, kbd: 'N', cls: 'is-quiet', title: 'Private notes: only you see them', count: dkNotesFor(a.id).length || null, onClick: function () { if (_dk.card === 'notes' && dkCardAid() === a.id) dkCloseCard(); else dkOpenCard('notes'); } });
  nts.dataset.card = 'notes';
  bar.appendChild(nts);
  if (mode === 'roster') bar.appendChild(dkBtn('Open page', { icon: DK_IC.open, cls: 'is-quiet', kbd: '↵', onClick: function () { openAthletePage(a.id); } }));
  var more = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'More for ' + a.name, 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: DK_IC.more });
  dkTip(more, 'More');
  more.addEventListener('click', function (e) {
    e.stopPropagation();
    var items = [
      { label: dkProgOf(a.id) ? 'Open their program' : 'Write a program', hint: 'P', run: function () { openAthleteProgram(a.id); } },
      { label: 'Progress charts', run: function () { openAthleteNotes(a.id); } },
      { label: 'Export their program', run: function () { if (typeof exportProgramCsv === 'function') exportProgramCsv(a.id, a.name); } }
    ];
    if (window.SwitchKit) items.push({ label: 'Import their history', run: function () { SwitchKit.openHistoryImport(a.id); } });   // SWITCH KIT hook
    items.push('-', { label: 'Remove from roster', danger: true, run: function () { removeAthleteFromRoster(a.id, a.name); } });
    dkPopMenu(more, items, { alignRight: true });
  });
  bar.appendChild(more);
  bar.appendChild(el('span', { class: 'dk-sp' }));
  bar.appendChild(el('span', { class: 'dk-pub', 'data-aid': a.id }, dkPublishBtn(a.id)));
  wrap.appendChild(bar);
  setTimeout(dkPaintCardButtons, 0);
  return wrap;
}
// The one red action: Publish next week (the edits waiting in the table, with their count), or
// Notify (edits made in the builder since the last heads-up), or what to write next.
function dkPublishBtn(aid) {
  var prog = dkProgOf(aid);
  if (!prog || !(prog.weeks || []).length) return dkBtn('Write a program', { primary: true, onClick: function () { openAthleteProgram(aid); } });
  var rev = deskWeekReview(prog);
  if (rev.lastIdx >= 0 && rev.nextIdx < 0) {
    // The week's side card holds the next step (desk-season.js dsBlockEnd): the head just says where they are.
    if (typeof dsBlockEnd === 'function') { var le = el('span', { class: 'dk-state is-end', role: 'status' }, 'Last week of ' + (prog.name || 'the block')); dkTip(le, 'Write the next block beside their week'); return le; }
    return dkBtn('Write the next block', { primary: true, onClick: function () { if (typeof openNextBlockSheet === 'function') openNextBlockSheet(prog.id, aid); else openAthleteProgram(aid); } });
  }
  var N = prog.weeks[rev.nextIdx];
  var wkn = N ? (N.number || rev.nextIdx + 1) : null;
  var n = dkPendCount(aid);
  if (n) return dkBtn('Publish week ' + wkn, { primary: true, icon: DK_IC.send, count: n, title: 'Write the ' + n + (n === 1 ? ' change' : ' changes') + ' into week ' + wkn + ' and tell them', onClick: function () { dkWsApply(aid); } });
  var ch = dkPbChanges(prog).length;
  if (ch) return dkBtn('Notify', { primary: true, icon: DK_IC.send, count: ch, title: 'Builder edits are already live. Send a heads-up about the ' + ch + (ch === 1 ? ' edit' : ' edits') + ' since the last one.', onClick: function () { dkPublish(aid); dkPaintPub(aid); } });
  // Nothing waiting: the state as a few quiet words, not a disabled button.
  var st = el('span', { class: 'dk-state', role: 'status' }, wkn ? 'Week ' + wkn + ' up to date' : 'Up to date');
  dkTip(st, 'Nothing waiting: what they see is what you wrote.');
  return st;
}
function dkPaintPub(aid) {
  document.querySelectorAll('.dk-pub[data-aid="' + CSS.escape(aid) + '"]').forEach(function (s) { s.innerHTML = ''; s.appendChild(dkPublishBtn(aid)); });
}
// What needs the coach, in sentences, each with the one thing to do about it.
function dkWsNeeds(r, lane) {
  var items = lane === 'w' ? r.wins.map(function (w) { return { type: 'win', text: w.text, tone: 'win', detail: dkWinDetail(r, w) }; }) : r.reasons;
  if (!items.length) return null;
  var box = el('div', { class: 'dk-asks' });
  var replied = false;   // one Reply per box: every thread-type reason opens the same thread
  var CAP = 2;
  items.forEach(function (x, i) {
    var row = el('div', { class: 'dk-ask t-' + (x.tone || 'info') + (i >= CAP ? ' is-more' : '') });
    row.appendChild(el('i', { class: 'dk-ask-dot', 'aria-hidden': 'true' }));
    var t = el('div', { class: 'dk-ask-t' });
    t.appendChild(el('b', {}, x.text));
    var detail = x.type === 'message' && x.body ? '“' + x.body + '”' : x.detail;
    if (detail) t.appendChild(el('span', {}, detail));
    row.appendChild(t);
    var go = null;
    if (x.type === 'formcheck' && x.formCheckId && typeof openFormCheckReview === 'function') go = dkBtn('Review video', { cls: 'dk-btn-sm', onClick: function () { openFormCheckReview(x.formCheckId); } });
    else if (x.type === 'note') go = dkBtn('Answer', { cls: 'dk-btn-sm', onClick: function () { var ta = _dkVis('.dk-ws[data-aid="' + CSS.escape(r.athlete.id) + '"] .dk-tn-item.is-waiting .dk-btn'); if (ta) { ta.scrollIntoView({ block: 'center' }); ta.click(); } else openAthleteNotes(r.athlete.id); } });
    else if (/^(message|checkin|quiet|never|readiness)$/.test(x.type)) { if (!replied) go = dkBtn('Reply', { cls: 'dk-btn-sm', kbd: 'R', onClick: function () { dkOpenCard('thread'); } }); replied = true; }
    else if (x.type === 'pain' && x.painReport && typeof openPainResolveSheet === 'function') go = dkBtn('Resolve', { cls: 'dk-btn-sm', onClick: function () { openPainResolveSheet(x.painReport, dkWsRepaint); } });
    else if (x.type === 'pain') go = dkBtn('Ask', { cls: 'dk-btn-sm', onClick: function () { dkOpenCard('thread'); } });
    else if (/^(noprogram|blockdone|blockend|stalling)$/.test(x.type)) go = dkBtn('Program', { cls: 'dk-btn-sm', onClick: function () { openAthleteProgram(r.athlete.id); } });
    else if (/^(overshoot|drift)$/.test(x.type)) go = dkBtn('See the week', { cls: 'dk-btn-sm', onClick: function () { var w = _dkVis('.dk-ws[data-aid="' + CSS.escape(r.athlete.id) + '"] .dk-wk'); if (w) w.scrollIntoView({ block: 'start', behavior: _dkReduced() ? 'auto' : 'smooth' }); } });
    if (go) row.appendChild(go);
    box.appendChild(row);
  });
  // Two rows, then "+n more": the week table stays near the top.
  if (items.length > CAP) {
    var more = el('button', { type: 'button', class: 'dk-ask-more', 'aria-expanded': 'false' }, '+' + (items.length - CAP) + ' more');
    more.addEventListener('click', function () {
      var open = box.classList.toggle('is-open');
      more.setAttribute('aria-expanded', String(open));
      more.textContent = open ? 'Show less' : '+' + (items.length - CAP) + ' more';
    });
    box.appendChild(more);
  }
  return box;
}
// The centre keeps its place (and any draft) on a background repaint; only "what needs you" is
// re-read, so a reason the coach just dealt with (a reply sent) leaves the box at once.
function dkWsAsksRefresh(aid) {
  var ws = document.querySelector('.dk-ws[data-aid="' + CSS.escape(aid) + '"]');
  if (!ws) return;
  var r = dkRow(aid) || (dkRowsFresh(), dkRow(aid));
  if (!r) return;
  var lane = _dk.screen === 'today' && _dk.sel && _dk.sel.id === aid ? _dk.sel.lane : 'q';
  var old = ws.querySelector(':scope > .dk-asks');
  var nb = dkWsNeeds(r, lane);
  if (old) { if (nb) old.replaceWith(nb); else old.remove(); }
  else if (nb) { var top = ws.querySelector(':scope > .dk-ws-top'); if (top) top.after(nb); }
}
function dkWinDetail(r, w) {
  if (w.type !== 'pr') return '';
  var pr = getLifetimePRs(r.athlete.id);
  return (w.lifts || []).filter(function (L) { return pr[L]; }).map(function (L) { return LIFT_LABELS[L] + ' ' + dkWt(pr[L].weight) + ' × ' + pr[L].reps + ' @' + _num(pr[L].rpe); }).join(' · ');
}

// ---------- last week → next week ----------
// "1×3 @8", "3×5 155 @7", "3×4 70%": a block of sets as it reads. dkGroupInput is the typed form.
function dkGroupLabel(g) {
  if (!g) return '';
  var t = g.count + '×' + g.reps;
  if (g.pct != null) t += ' ' + _num(g.pct) + (Number(g.pctHi) > Number(g.pct) ? '–' + _num(g.pctHi) : '') + '%';
  else if (Number(g.weight) > 0) t += ' ' + _num(kgToDisplay(g.weight)) + (Number(g.weightHi) > Number(g.weight) ? '–' + _num(kgToDisplay(g.weightHi)) : '');
  if (g.rpe != null && g.rpe !== '') t += g.rir ? ' ' + effortInputText(g, true) + ' RIR' : ' @' + effortInputText(g, false);
  var fx = typeof setFieldsShort === 'function' ? setFieldsShort(g) : '';   // tempo, pause, bands / chains, own columns
  return fx ? t + ' · ' + fx : t;
}
// The same, set like C: count×reps quiet, the load in ink, the effort after it.
function dkGroupRich(g) {
  var span = el('span', { class: 'dk-pres' });
  if (!g) return span;
  span.appendChild(el('span', { class: 'dk-pres-sr' }, g.count + '×' + g.reps));
  if (g.pct != null) {
    span.appendChild(el('b', {}, _num(g.pct) + (Number(g.pctHi) > Number(g.pct) ? '–' + _num(g.pctHi) : '') + '%'));
    // The load the % works out to from their max, as the builder shows it.
    if (Number(g.weight) > 0) span.appendChild(el('span', { class: 'dk-pres-kg' }, _num(kgToDisplay(g.weight)) + (Number(g.weightHi) > Number(g.weight) ? '–' + _num(kgToDisplay(g.weightHi)) : '')));
  }
  else if (Number(g.weight) > 0) span.appendChild(el('b', {}, _num(kgToDisplay(g.weight)) + (Number(g.weightHi) > Number(g.weight) ? '–' + _num(kgToDisplay(g.weightHi)) : '')));
  if (g.rpe != null && g.rpe !== '') span.appendChild(el('span', { class: 'dk-pres-rp' }, g.rir ? effortInputText(g, true) + ' RIR' : '@' + effortInputText(g, false)));
  var fx = typeof setFieldsShort === 'function' ? setFieldsShort(g) : '';
  if (fx) span.appendChild(el('span', { class: 'dk-pres-fx' }, fx));
  return span;
}
function dkGroupInput(g) {
  if (!g) return '';
  var t = g.count + '×' + g.reps;   // the notation every screen writes; typing x still parses
  if (g.pct != null) t += ' ' + _num(g.pct) + (Number(g.pctHi) > Number(g.pct) ? '-' + _num(g.pctHi) : '') + '%';
  // A bare load reads in the coach's unit; under 20 the parser wants the unit said.
  else if (Number(g.weight) > 0) t += ' ' + _num(kgToDisplay(g.weight)) + (Number(g.weightHi) > Number(g.weight) ? '-' + _num(kgToDisplay(g.weightHi)) : '') + (kgToDisplay(g.weight) < 20 ? (getUnit() === 'lbs' ? 'lb' : 'kg') : '');
  if (g.rpe != null && g.rpe !== '') t += g.rir ? ' ' + effortInputText(g, true) + 'RIR' : ' @' + effortInputText(g, false);
  // Its set fields too, so an edit typed here (read back by _gridParse) keeps them.
  var fx = typeof setFieldsCellText === 'function' ? setFieldsCellText(g) : '';
  return fx ? t + ' ' + fx : t;
}
function dkLoggedRich(l) {
  var span = el('span', { class: 'dk-pres is-logged' });
  if (!l) return span;
  if (l.skipped) { span.appendChild(el('span', { class: 'dk-pres-miss' }, 'Skipped')); return span; }
  if (l.weight > 0) span.appendChild(el('b', {}, _num(kgToDisplay(l.weight))));
  span.appendChild(el('span', { class: 'dk-pres-sr' }, (l.weight > 0 ? '×' : '') + l.reps));
  if (l.rpe != null) span.appendChild(el('span', { class: 'dk-pres-rp' }, '@' + _num(l.rpe)));
  if (l.n < l.of) span.appendChild(el('small', {}, l.n + '/' + l.of + ' sets'));
  return span;
}
// The edits waiting on Publish, per athlete, for one program and one next week.
function dkWsPend(aid, prog, nextIdx) {
  dkLoadPend();
  var sig = prog.id + ':' + nextIdx;
  var p = _dk.wsPend[aid];
  if (!p || p.sig !== sig) p = _dk.wsPend[aid] = { sig: sig, rows: {} };
  return p;
}
// Drafts survive a reload (real accounts only; the demo writes nothing). Keyed by program and
// week, so a draft for a week that has since moved on is simply dropped.
function _dkPendKey() { var u = _dkUser(); return 'powa-desk-pend-' + (u ? u.id : 'x'); }
function dkLoadPend() {
  if (_dk.pendLoaded) return;
  _dk.pendLoaded = true;
  if (window._demoMode) return;
  var o = null;
  try { o = JSON.parse(_dkLS(_dkPendKey()) || 'null'); } catch (e) { o = null; }
  if (o && typeof o === 'object') Object.keys(o).forEach(function (k) { var x = o[k]; if (!_dk.wsPend[k] && x && x.sig && x.rows) _dk.wsPend[k] = x; });
}
function dkSavePend() {
  if (window._demoMode) return;
  var o = {}, any = false;
  Object.keys(_dk.wsPend).forEach(function (k) { var x = _dk.wsPend[k]; if (x && x.rows && Object.keys(x.rows).length) { o[k] = x; any = true; } });
  _dkLS(_dkPendKey(), any ? JSON.stringify(o) : null);
}
// How many next-week edits wait on Publish for this athlete (0 when the draft is for another week).
function dkPendCount(aid) {
  dkLoadPend();
  var p = _dk.wsPend[aid];
  if (!p || !p.rows) return 0;
  var prog = dkProgOf(aid);
  if (!prog || !(prog.weeks || []).length) return 0;
  var rev = deskWeekReview(prog);
  return rev.nextIdx >= 0 && p.sig === prog.id + ':' + rev.nextIdx ? Object.keys(p.rows).length : 0;
}
function dkPendDrop(aid) { delete _dk.wsPend[aid]; dkSavePend(); }
function dkProgOf(aid) { return (Store.get().programs || []).find(function (p) { return p.athleteId === aid; }) || null; }
function dkDayState(prog, wi, di) {
  var d = prog.weeks[wi] && prog.weeks[wi].days[di];
  var sets = d ? (d.exercises || []).reduce(function (a, e) { return a.concat(e.sets || []); }, []) : [];
  var done = sets.filter(function (s) { return s.completed; }).length;
  if (!sets.length) return null;
  if (done === sets.length) return { text: 'Done', tone: 'done' };
  if (sets.some(function (s) { return s.skipped; }) && !done) return { text: 'Missed', tone: 'miss' };
  return done ? { text: done + ' of ' + sets.length + ' sets', tone: 'part' } : { text: 'Not yet', tone: 'todo' };
}
// ---------- the week as lifted: session cards; next week written in place ----------
// One card per training day of the week they last logged into. Each exercise shows what was
// written (POWALIFTA notation), every set they lifted as a bar against the written RPE (the line),
// coloured only when it went off, the top set in ink, and then next week's block for it, written
// in place, with a suggestion from how it was lifted (hold, up, drop; swap when it hurt) that one
// click takes. Videos, pain and their note sit on the session they came from.
function dkSessDate(day) {
  var d = '';
  (day.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { if (s.completed && s.completedAt) { var x = String(s.completedAt).slice(0, 10); if (!d || x > d) d = x; } }); });
  return d;
}
function dkDayLabel(iso) { return iso ? new Date(iso + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) : ''; }
// A logged set against its written RPE: + over the top of the target, − under its bottom, 0 inside.
function _dkSetGap(s, g) {
  if (!s || !s.completed || s.actualRpe == null || s.actualRpe === '' || g.rir || g.rpe == null || g.rpe === '') return null;
  var lo = Number(g.rpe), hi = Number(g.rpeHi) > lo ? Number(g.rpeHi) : lo, f = Number(s.actualRpe);
  return f > hi ? Math.round((f - hi) * 10) / 10 : f < lo ? Math.round((f - lo) * 10) / 10 : 0;
}
function _dkGapCls(gap) { return gap == null ? '' : gap >= 1 ? 'alert' : gap >= 0.5 ? 'warn' : gap <= -0.5 ? 'cool' : 'on'; }
// The sets as bars on an RPE 5–10 scale, the written RPE as a line across them.
function dkSetBars(sets, g) {
  var lo = 5.5, hi = 10, pos = function (v) { return (Math.max(lo, Math.min(hi, Number(v))) - lo) / (hi - lo) * 100; };
  var tgt = g.rpe == null || g.rpe === '' || g.rir ? null : Number(g.rpe);
  var tHi = tgt != null && Number(g.rpeHi) > tgt ? Number(g.rpeHi) : null;
  var box = el('span', { class: 'dk-sb' });
  if (tgt != null) {
    var line = el('i', { class: 'dk-sb-t' + (tHi ? ' is-range' : ''), 'aria-hidden': 'true' });
    line.style.bottom = pos(tgt).toFixed(1) + '%';
    if (tHi) line.style.height = (pos(tHi) - pos(tgt)).toFixed(1) + '%';
    box.appendChild(line);
  }
  var words = [], now = Date.now();
  sets.forEach(function (s, i) {
    var col = el('span', { class: 'dk-sb-c' });
    var plan = _num(kgToDisplay(planWeight(s))) + '×' + (s.plannedReps || s.reps) + (tgt != null ? ' @' + _num(tgt) + (tHi ? '–' + _num(tHi) : '') : '');
    var what;
    if (s.completed) {
      var felt = s.actualRpe != null && s.actualRpe !== '' ? Number(s.actualRpe) : null;
      var gap = _dkSetGap(s, g), tone = _dkGapCls(gap);
      col.classList.add('t-' + (tone || 'done'));
      var fill = el('b', {});
      fill.style.height = Math.max(8, felt != null ? pos(felt) : tgt != null ? pos(tgt) : 60).toFixed(1) + '%';
      col.appendChild(fill);
      var t = Date.parse(s.completedAt);
      if (String(s.completedAt).indexOf('T') > 0 && isFinite(t) && now - t < 120000) col.classList.add('is-new');
      what = (Number(s.weight) > 0 ? _num(kgToDisplay(s.weight)) + '×' : '') + (Number(s.reps) || 0) + (felt != null ? ' @' + _num(felt) : '');
    } else if (s.skipped) { col.classList.add('is-miss'); what = 'skipped'; }
    else { col.classList.add('is-todo'); what = 'not yet'; }
    dkTip(col, 'Set ' + (i + 1) + ': ' + what + ' · wrote ' + plan);
    words.push('set ' + (i + 1) + ' ' + what);
    box.appendChild(col);
  });
  box.setAttribute('role', 'img');
  box.setAttribute('aria-label', (tgt != null ? 'Written @' + _num(tgt) + '. ' : '') + words.join(', '));
  return box;
}
// Open pain on a lift (the last two weeks): the swap shows on next week's block for that lift.
function _dkPainOn(aid, lift) {
  var since = _addDaysISO(todayISO(), -13);
  return (Store.get().painReports || []).filter(function (p) { return p.athleteId === aid && !p.resolvedAt && String(p.day) >= since && p.lift === lift; })
    .sort(function (a, b) { return (Number(b.severity) || 0) - (Number(a.severity) || 0); })[0] || null;
}
// What's attached to one exercise of one session: pain they reported on it, a video of it. On the
// lift's last session of the week, anything about that lift since then (up to ten days) lands too.
function dkSessAttach(r, row, date, used, isLast) {
  var out = [], a = r.athlete, since = _addDaysISO(todayISO(), -10);
  var on = function (d) { d = String(d || '').slice(0, 10); return (!!date && d === date) || (isLast && d >= since && (!date || d > date)); };
  (Store.get().painReports || []).filter(function (p) { return p.athleteId === a.id && on(p.day) && p.lift === row.lift && !used['p' + p.id]; }).forEach(function (p) {
    used['p' + p.id] = 1;
    var at = el('span', { class: 'dk-att' + (p.resolvedAt ? '' : ' is-open') });
    at.appendChild(el('i', { class: 'dk-dot t-' + (p.resolvedAt ? 'none' : Number(p.severity) >= 5 ? 'alert' : 'warn'), 'aria-hidden': 'true' }));
    at.appendChild(el('span', {}, 'Pain · ' + painPartLabel(p.bodyPart, p.side) + ' ' + (Number(p.severity) || 0) + '/10'));
    at.appendChild(el('span', { class: 'dk-att-sub' }, _relDayShort(p.day)));
    if (!p.resolvedAt && typeof openPainResolveSheet === 'function') at.appendChild(dkBtn('Resolve', { cls: 'dk-btn-xs is-quiet', onClick: function () { openPainResolveSheet(p, dkWsRepaint); } }));
    else if (p.resolvedAt) at.appendChild(el('span', { class: 'dk-att-sub' }, 'Resolved'));
    out.push(at);
  });
  _dkFormChecks().filter(function (f) { return f.athleteId === a.id && f.lift === row.lift && !used['v' + f.id] && on(f.createdAt); }).forEach(function (f) {
    used['v' + f.id] = 1;
    var b = el('button', { type: 'button', class: 'dk-att is-btn' + (f.coachReply ? '' : ' is-open') });
    b.insertAdjacentHTML('beforeend', DK_IC.video);
    b.appendChild(el('span', {}, f.coachReply ? 'Video · reviewed' : 'Video · waiting on you'));
    if (f.note) b.appendChild(el('span', { class: 'dk-att-sub' }, '“' + String(f.note).slice(0, 60) + (String(f.note).length > 60 ? '…' : '') + '”'));
    dkTip(b, 'Open the video review');
    b.addEventListener('click', function () { if (typeof openFormCheckReview === 'function') openFormCheckReview(f.id); });
    out.push(b);
  });
  return out;
}
function dkWsWeek(r) {
  var a = r.athlete, prog = dkProgOf(a.id);
  var sec = el('div', { class: 'dk-sec dk-wk', 'data-aid': a.id });
  sec._noteDates = {};
  var head = el('div', { class: 'dk-wk-head' });
  var ht = el('div', { class: 'dk-wk-ht' });
  var title = el('h3', { class: 'dk-wk-title' });
  ht.appendChild(title);
  head.appendChild(ht);
  sec.appendChild(head);
  if (!prog || !(prog.weeks || []).length) {
    title.textContent = 'This week';
    var em = el('div', { class: 'dk-wk-empty' });
    em.appendChild(el('p', {}, r.status.ago == null ? 'Nothing assigned yet. Write their first week and every set they lift lands here, live.' : 'No program at the moment. Write the next block and their sessions fill in here as they lift.'));
    em.appendChild(dkBtn('Write a program', { onClick: function () { openAthleteProgram(a.id); } }));
    sec.appendChild(em);
    return sec;
  }
  var rev = deskWeekReview(prog);
  if (rev.lastIdx < 0) {
    title.textContent = 'Week ' + (prog.weeks[0].number || 1);
    var em2 = el('div', { class: 'dk-wk-empty' });
    em2.appendChild(el('p', {}, 'Waiting for their first set. Each set lands here the moment they log it, against what you wrote.'));
    em2.appendChild(dkBtn('Open program', { icon: DK_IC.prog, cls: 'is-quiet', kbd: 'P', onClick: function () { openAthleteProgram(a.id); } }));
    sec.appendChild(em2);
    return sec;
  }
  var W = prog.weeks[rev.lastIdx], N = rev.nextIdx >= 0 ? prog.weeks[rev.nextIdx] : null;
  var wn = W.number || rev.lastIdx + 1, nn = N ? (N.number || rev.nextIdx + 1) : null;
  if (!N) sec.classList.add('no-next');
  title.textContent = 'Week ' + wn + ', as they lifted it';
  ht.appendChild(el('p', { class: 'dk-wk-sub' }, N ? 'Every set against what you wrote, with week ' + nn + ' beside it to adjust.' : 'Week ' + wn + ' is the last of ' + (prog.name || 'the block') + '.'));
  var pend = N ? dkWsPend(a.id, prog, rev.nextIdx) : { rows: {} };
  // Drop anything that no longer fits (the athlete logged into that block, or the coach changed it elsewhere).
  Object.keys(pend.rows).forEach(function (k) { var row = rev.rows.find(function (x) { return x.key === k; }); if (!row || !row.next || row.next.locked) delete pend.rows[k]; else pend.rows[k].row = row; });
  var takeAll = null;
  var nSug = rev.rows.filter(function (x) { return x.suggest && x.suggest.dir !== 'hold' && x.next && !x.next.locked; }).length;
  var tools = el('div', { class: 'dk-wk-tools' });
  if (N && nSug) {
    takeAll = dkBtn('Take suggestions', { icon: DK_IC.spark, cls: 'dk-btn-sm', kbd: '⇧A', onClick: function () { sec._acceptAll(); } });
    tools.appendChild(takeAll);
  }
  tools.appendChild(dkBtn('Open program', { icon: DK_IC.prog, cls: 'dk-btn-sm is-quiet', kbd: 'P', onClick: function () { openAthleteProgram(a.id); } }));
  head.appendChild(tools);
  // The key, once: the line is what you wrote, a bar is a set, colour only where it went off.
  var key = el('div', { class: 'dk-wk-key', 'aria-hidden': 'true' });
  key.appendChild(el('span', {}, el('i', { class: 'dk-key-line' }), 'Written RPE'));
  [['on', 'Each set'], ['warn', 'Over'], ['alert', '1+ over'], ['cool', 'Under']].forEach(function (x) { key.appendChild(el('span', {}, el('i', { class: 'dk-key-bar t-' + x[0] }), x[1])); });
  sec.appendChild(key);

  var inputs = [];
  var draftTag = el('span', { class: 'dk-state is-draft dk-wk-draft', hidden: '' });
  tools.insertBefore(draftTag, tools.firstChild);
  var paintCount = function () {
    var n = Object.keys(pend.rows).length;
    draftTag.hidden = !n;
    draftTag.textContent = n ? 'Week ' + nn + ' draft · ' + n : '';
    if (takeAll) {
      var left = inputs.filter(function (i) { return i._canTake && i._canTake(); }).length;
      takeAll.querySelector('.dk-btn-l').textContent = left ? 'Take ' + left + (left === 1 ? ' suggestion' : ' suggestions') : 'Suggestions taken';
      takeAll.disabled = !left;
    }
    dkSavePend();
    dkPaintPub(a.id);
    dkPaintRowTags(a.id);
  };
  var notes = (Store.get().sessionNotes || []).filter(function (n) { return n.athleteId === a.id && n.note && String(n.note).trim(); });
  var used = {};
  sec._used = used;
  var list = el('div', { class: 'dk-sessions' });
  var days = [];
  rev.rows.forEach(function (row) { if (!days.length || days[days.length - 1].di !== row.di) days.push({ di: row.di, name: row.day, rows: [] }); days[days.length - 1].rows.push(row); });
  // Each lift's last logged session this week: later videos and pain on that lift attach to it.
  // A lift not lifted yet this week: its first block takes them.
  var lastOf = {};
  days.forEach(function (dd) { var dt = dkSessDate(W.days[dd.di] || {}); dd.rows.forEach(function (row) { if (row.gi) return; var L = lastOf[row.lift]; if (!L || (dt && (!L.date || dt > L.date))) lastOf[row.lift] = { date: dt, key: row.key }; }); });
  days.forEach(function (dd) {
    var D = W.days[dd.di] || { exercises: [] };
    var date = dkSessDate(D);
    var ds = dkDayState(prog, rev.lastIdx, dd.di);
    var live = r.live && (D.exercises || []).some(function (e) { return (e.sets || []).some(function (s) { var t = Date.parse(s.completedAt); return s.completed && String(s.completedAt).indexOf('T') > 0 && Date.now() - t <= 30 * 60000; }); });
    var card = el('article', { class: 'dk-sess' + (live ? ' is-live' : '') + (ds && ds.tone === 'todo' ? ' is-todo' : ''), 'aria-label': dd.name });
    var ch = el('header', { class: 'dk-sess-head' });
    var tone = live ? 'live' : ds ? ds.tone : 'todo';
    var who = el('div', { class: 'dk-sess-who' });
    who.appendChild(el('i', { class: 'dk-dot t-' + ({ done: 'ok', live: 'live', miss: 'alert', part: 'warn' }[tone] || 'none'), 'aria-hidden': 'true' }));
    who.appendChild(el('h4', { class: 'dk-sess-name' }, dd.name));
    who.appendChild(el('span', { class: 'dk-sess-meta' }, [live ? 'Lifting now' : ds ? ds.text : '', date ? dkDayLabel(date) : ''].filter(Boolean).join(' · ')));
    ch.appendChild(who);
    if (N) ch.appendChild(el('span', { class: 'dk-sess-nx' }, 'Week ' + nn));
    card.appendChild(ch);
    dd.rows.forEach(function (row) {
      var lift = MAIN_LIFTS.indexOf(row.lift) >= 0 ? row.lift : 'acc';
      var line = el('div', { class: 'dk-sx' + (row.gi ? ' is-cont' : '') });
      var id = el('div', { class: 'dk-sx-id' });
      if (!row.gi) id.appendChild(el('span', { class: 'dk-wk-ex lift-' + lift }, el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }), el('span', { class: 'dk-wk-exn' }, row.title)));
      // The set fields (tempo, pause, bands) ride in the tooltip here: next week's field spells them out.
      var rx = dkGroupRich(row.target);
      var fx = rx.querySelector('.dk-pres-fx');
      if (fx) fx.remove();
      dkTip(rx, 'Wrote ' + dkGroupLabel(row.target));
      id.appendChild(rx);
      line.appendChild(id);
      var ex = D.exercises[row.ei];
      var sets = ex ? (ex.sets || []).slice(row.target.startIdx, row.target.startIdx + row.target.count) : [];
      // A day not trained yet shows what was written and nothing else: the card head already says so.
      var untouched = !row.logged && !sets.some(function (s) { return s.completed || s.skipped; }) && (!ds || ds.tone === 'todo');
      var viz = el('div', { class: 'dk-sx-viz' });
      if (!untouched) viz.appendChild(dkSetBars(sets, row.target));
      line.appendChild(viz);
      var got = el('div', { class: 'dk-sx-got' });
      if (row.logged) {
        var pw = Number(row.target.weight) || 0;
        // Lifted as written (load, reps, every set, RPE on target): a check, the sets in the tooltip.
        var asWritten = !row.logged.skipped && pw > 0 && Math.abs((row.logged.weight || 0) - pw) < 0.5 && String(row.logged.reps) === String(row.target.reps) &&
          row.logged.n >= row.logged.of && (row.delta == null || _dkGapCls(row.delta) === 'on');
        if (asWritten) {
          var aw0 = el('span', { class: 'dk-sx-ok', html: DK_IC.check }, el('span', {}, 'As written'));
          dkTip(aw0, 'Lifted ' + _num(kgToDisplay(row.logged.weight)) + '×' + row.logged.reps + (row.logged.rpe != null ? ' @' + _num(row.logged.rpe) : ''));
          got.appendChild(aw0);
        } else got.appendChild(dkLoggedRich(row.logged));
        if (!row.logged.skipped && pw > 0 && row.logged.weight > 0 && Math.abs(row.logged.weight - pw) >= 0.5) {
          var dl = row.logged.weight - pw;
          got.appendChild(el('span', { class: 'dk-sx-ld' }, (dl > 0 ? '+' : '−') + _num(kgToDisplay(Math.abs(dl)))));
        }
        var tn = _dkGapCls(row.delta);
        if (row.delta != null && tn !== 'on') {
          var gp = el('span', { class: 'dk-gap t-' + tn }, dkGapText(row.delta));
          dkTip(gp, 'RPE ' + (row.delta > 0 ? 'over' : 'under') + ' what you wrote');
          got.appendChild(gp);
        }
      } else if (!untouched) got.appendChild(el('span', { class: 'dk-dim' }, ds && ds.tone === 'miss' ? 'Missed' : 'Not yet'));
      line.appendChild(got);
      if (N) line.appendChild(dkSxNext(r, prog, rev, row, nn, pend, inputs, paintCount, line));
      var att = row.gi ? [] : dkSessAttach(r, row, date, used, !!(lastOf[row.lift] && lastOf[row.lift].key === row.key));
      if (att.length) { var aw = el('div', { class: 'dk-sx-att' }); att.forEach(function (x) { aw.appendChild(x); }); line.appendChild(aw); }
      card.appendChild(line);
    });
    // Their note on the session, where it was written.
    var nt = date ? notes.find(function (n) { return String(n.date).slice(0, 10) === date; }) : null;
    if (nt) { sec._noteDates[String(nt.date).slice(0, 10)] = 1; card.appendChild(dkSessNote(a, nt)); }
    list.appendChild(card);
  });
  if (!N && typeof dsBlockEnd === 'function') {
    // The last week of the block: what it did and the next block, where next week would be.
    var split = el('div', { class: 'ds-end-split' });
    split.appendChild(list);
    split.appendChild(dsBlockEnd(r, prog));
    sec.appendChild(split);
  } else sec.appendChild(list);
  sec._acceptAll = function () {
    var n = 0;
    inputs.forEach(function (inp) { if (inp._canTake && inp._canTake() && inp._accept()) n++; });
    toast(n ? 'Took ' + n + (n === 1 ? ' suggestion' : ' suggestions') + '. Publish when it reads right' : 'No suggestions left to take');
  };
  if (!N && typeof dsBlockEnd !== 'function') {
    var end = el('div', { class: 'dk-wk-end' });
    end.appendChild(el('span', {}, 'Nothing is written after week ' + wn + '. Write the next block and its first week lands here.'));
    sec.appendChild(end);
  }
  setTimeout(paintCount, 0);
  return sec;
}
// Their note on a session, answered in place.
function dkSessNote(a, n) {
  var box = el('div', { class: 'dk-sess-note' + (n.coachComment ? '' : ' is-waiting') });
  box.insertAdjacentHTML('beforeend', DK_IC.messages);
  var t = el('div', { class: 'dk-sess-note-t' });
  t.appendChild(el('p', {}, '“' + n.note + '”'));
  if (n.coachComment) t.appendChild(el('p', { class: 'dk-sess-reply' }, n.coachComment));
  box.appendChild(t);
  if (!n.coachComment) {
    var ans = dkBtn('Answer', { cls: 'dk-btn-sm', onClick: function () {
      ans.remove();
      var ta = el('textarea', { class: 'dk-ta dk-tn-ta', rows: '2', maxlength: '2000', 'aria-label': 'Your answer to their note' });
      var send = dkBtn('Send', { cls: 'dk-btn-sm' });
      var go = function () {
        var body = ta.value.trim();
        if (!body || send.disabled) { ta.focus(); return; }
        send.disabled = true;
        dkAnswerNote(a.id, n.date, body).then(function (ok) { if (ok) dkWsRepaint(); else send.disabled = false; });
      };
      send.addEventListener('click', go);
      ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } if (e.key === 'Escape') { e.stopPropagation(); dkWsRepaint(); } });
      var row = el('div', { class: 'dk-tn-answer' });
      row.appendChild(ta); row.appendChild(send);
      t.appendChild(row);
      ta.focus();
    } });
    box.appendChild(ans);
  }
  return box;
}
// Next week's block for one exercise: the field, and the one suggestion from how it was lifted.
function dkSxNext(r, prog, rev, row, nn, pend, inputs, paintCount, line) {
  var a = r.athlete;
  var nx = el('div', { class: 'dk-sx-nx' });
  if (!row.next) { nx.appendChild(el('span', { class: 'dk-dim' }, 'Not in week ' + nn)); return nx; }
  if (row.next.locked) { nx.appendChild(el('span', { class: 'dk-wk-locked' }, dkGroupLabel(row.next.group))); nx.appendChild(el('span', { class: 'dk-wk-note' }, 'Already lifting it')); return nx; }
  var cur = dkGroupInput(row.next.group);
  var p = pend.rows[row.key];
  var cell = el('div', { class: 'dk-wk-cell' });
  var inp = el('input', { type: 'text', class: 'dk-wk-in' + (p ? ' is-pend' : ''), spellcheck: 'false', autocomplete: 'off', 'aria-label': row.title + ', week ' + nn });
  inp.value = p ? p.text : cur;
  cell.appendChild(inp);
  var chip = el('button', { type: 'button', class: 'dk-sgc' });
  var can = !!(row.suggest && row.suggest.dir !== 'hold');
  var pain = MAIN_LIFTS.indexOf(row.lift) >= 0 && row.gi === 0 ? _dkPainOn(a.id, row.lift) : null;
  var swap = null;
  var nsetsOf = function () { return (dkProgOf(a.id).weeks[rev.nextIdx].days[row.next.di].exercises[row.next.ei].sets || []).slice(row.next.startIdx, row.next.startIdx + row.next.count); };
  var why = function () {
    var l = row.logged, tgt = row.target;
    if (!l || l.skipped) return '';
    return 'They lifted ' + (l.weight > 0 ? _num(kgToDisplay(l.weight)) + '×' : '') + l.reps + (l.rpe != null ? ' @' + _num(l.rpe) : '') + (tgt.rpe != null && tgt.rpe !== '' ? ' against @' + effortInputText(tgt, false) : '');
  };
  var paintChip = function () {
    var s = row.suggest, pp = pend.rows[row.key];
    chip.innerHTML = '';
    chip.className = 'dk-sgc';
    chip.removeAttribute('aria-disabled');
    chip.tabIndex = 0;
    chip.hidden = false;
    if (pp && pp.kind === 'swap') {
      chip.classList.add('is-took');
      chip.insertAdjacentHTML('beforeend', DK_IC.check);
      chip.appendChild(el('span', {}, pp.label));
      dkTip(chip, 'Undo: back to what was written');
      return;
    }
    // No suggestion: the slot stays, empty, so every input on the card ends on one line.
    if (!s) { chip.className = 'dk-sgc is-empty'; chip.tabIndex = -1; chip.setAttribute('aria-hidden', 'true'); return; }
    chip.removeAttribute('aria-hidden');
    var kg = _num(kgToDisplay(s.kg)), dl = s.dir === 'set' ? '' : (s.delta > 0 ? '+' : '−') + _num(kgToDisplay(Math.abs(s.delta)));
    if (s.dir === 'hold') {
      // On target: hold what's written. A word, not a button: there's nothing to take.
      chip.className = 'dk-sgc is-hold';
      chip.tabIndex = -1;
      chip.setAttribute('aria-disabled', 'true');
      chip.insertAdjacentHTML('beforeend', DK_IC.check);
      chip.appendChild(el('span', {}, 'Hold'));
      dkTip(chip, (why() ? why() + ': ' : '') + 'on target, so it holds');
      return;
    }
    if (pp && pp.kind === 'accept') {
      chip.classList.add('is-took');
      chip.insertAdjacentHTML('beforeend', DK_IC.check);
      chip.appendChild(el('span', {}, 'Took ' + kg));
      dkTip(chip, 'Undo: back to what was written');
    } else {
      chip.insertAdjacentHTML('beforeend', DK_IC.spark);
      chip.appendChild(el('span', {}, (s.dir === 'down' ? 'Drop to ' : s.dir === 'up' ? 'Up to ' : 'Load ') + kg));
      if (dl) chip.appendChild(el('small', {}, dl));
      dkTip(chip, (why() ? why() + '. ' : '') + 'One click writes it in', 'Tab');
    }
  };
  var paintRow = function () {
    inp.classList.toggle('is-pend', !!pend.rows[row.key]);
    paintChip();
    if (swap) swap.hidden = !!(pend.rows[row.key] && pend.rows[row.key].kind === 'swap');
    paintCount();
  };
  var took = function () {
    if (!_dkReduced() && inp.animate) inp.animate([{ boxShadow: 'inset 0 0 0 1.5px var(--dk-ok)' }, { boxShadow: 'inset 0 0 0 1.5px var(--text)' }], { duration: 600, easing: 'ease-out' });
  };
  var accept = function () {
    if (!can) return false;
    var sets = deskSuggestedSets(nsetsOf(), row.suggest.kg);
    var g = Object.assign({}, row.next.group, { weight: row.suggest.kg, weightHi: Number(row.next.group.weightHi) > row.suggest.kg ? row.next.group.weightHi : null });
    pend.rows[row.key] = { kind: 'accept', text: dkGroupInput(g), sets: sets, row: row };
    inp.value = pend.rows[row.key].text;
    paintRow();
    took();
    return true;
  };
  var revert = function () { delete pend.rows[row.key]; inp.value = cur; inp.classList.remove('is-bad'); paintRow(); };
  var commit = function () {
    var v = inp.value.trim();
    var pp = pend.rows[row.key];
    if (pp && v === pp.text) return true;
    if (v === cur || !v) { revert(); return true; }
    var sets = typeof _gridParse === 'function' ? _gridParse(v.replace(/×/g, 'x'), a.id, row.lift, dkProgOf(a.id)) : null;
    if (!sets || !sets.length) { inp.classList.add('is-bad'); dkTip(inp, 'Type it like 3x5 150 @8'); return false; }
    inp.classList.remove('is-bad'); delete inp.dataset.tip;
    pend.rows[row.key] = { kind: 'edit', text: v, sets: sets, row: row, variant: pp && pp.variant };
    paintRow();
    return true;
  };
  chip.addEventListener('mousedown', function (e) { e.preventDefault(); });
  chip.addEventListener('click', function () { if (chip.classList.contains('is-hold')) return; if (pend.rows[row.key]) revert(); else accept(); });
  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', function (e) {
    var i = inputs.indexOf(inp);
    var go = function (j) { var t2 = inputs[j]; if (t2) { t2.focus(); t2.select(); } };
    if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
      // Untouched with a suggestion: Tab takes it, then moves on.
      if (inp.value.trim() === cur && !pend.rows[row.key] && can) { e.preventDefault(); accept(); go(i + 1); }
    } else if (e.key === 'Enter') { e.preventDefault(); if (commit()) go(i + (e.shiftKey ? -1 : 1)); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); revert(); inp.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (commit()) go(i + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (commit()) go(i - 1); }
  });
  inp.addEventListener('focus', function () { line.classList.add('is-focus'); });
  inp.addEventListener('blur', function () { line.classList.remove('is-focus'); });
  inp._accept = accept;
  inp._canTake = function () { return can && !pend.rows[row.key]; };
  inputs.push(inp);
  cell.appendChild(chip);
  // It hurt on this lift: a swap for next week (a variant that loads it differently, or lighter).
  if (pain) {
    swap = dkBtn('Swap', { cls: 'dk-btn-sm is-quiet dk-swap' });
    dkTip(swap, 'Pain · ' + painReportText(pain) + '. Swap the lift or take it lighter next week');
    swap.addEventListener('mousedown', function (e) { e.preventDefault(); });
    swap.addEventListener('click', function () {
      var ex = dkProgOf(a.id).weeks[rev.nextIdx].days[row.next.di].exercises[row.next.ei];
      var curV = (ex && ex.variant) || 'Competition';
      var items = variantsFor(row.lift).filter(function (v) { return v !== curV; }).map(function (v) {
        var label = (v === 'Competition' ? '' : v + ' ') + LIFT_LABELS[row.lift];
        return { label: label, run: function () {
          pend.rows[row.key] = { kind: 'swap', variant: v, label: label, text: cur, sets: nsetsOf().map(function (s) { return Object.assign({}, s); }), row: row };
          paintRow(); took();
        } };
      });
      var step = loadStepKg(getUnit());
      var lighter = Math.round((Number(row.next.group.weight) || 0) * 0.9 / step) * step;
      if (lighter > 0) items.push('-', { label: 'Same lift, 10% lighter (' + _num(kgToDisplay(lighter)) + ')', run: function () {
        var g = Object.assign({}, row.next.group, { weight: lighter, weightHi: null });
        pend.rows[row.key] = { kind: 'swap', label: 'Lighter · ' + _num(kgToDisplay(lighter)), text: dkGroupInput(g), sets: deskSuggestedSets(nsetsOf(), lighter), row: row };
        inp.value = pend.rows[row.key].text;
        paintRow(); took();
      } });
      items.unshift({ node: el('div', { class: 'dk-menu-title', role: 'presentation' }, 'Pain · ' + painReportText(pain)) });
      dkPopMenu(swap, items, { alignRight: true });
    });
    cell.appendChild(swap);
  }
  nx.appendChild(cell);
  paintChip();
  if (swap) swap.hidden = !!(p && p.kind === 'swap');
  return nx;
}
// ⇧A: take every suggestion in the table.
function dkWsAcceptAll() {
  var sec = _dkVis('.dk-ws .dk-wk');
  if (sec && sec._acceptAll) sec._acceptAll();
}
// Publish next week: write the edited blocks into the program, save, and send the heads-up.
function dkWsApply(aid) {
  dkLoadPend();
  var prog = dkProgOf(aid);
  var p = _dk.wsPend[aid];
  if (!prog || !p) return;
  // A cell still being typed in counts: commit it first.
  if (document.activeElement && document.activeElement.classList && document.activeElement.classList.contains('dk-wk-in')) document.activeElement.blur();
  var rev = deskWeekReview(prog);
  if (rev.nextIdx < 0 || p.sig !== prog.id + ':' + rev.nextIdx) return;
  var edits = Object.keys(p.rows).map(function (k) { var x = p.rows[k]; return { di: x.row.next.di, ei: x.row.next.ei, startIdx: x.row.next.startIdx, count: x.row.next.count, sets: x.sets, variant: x.variant }; });
  if (!edits.length) return;
  // What changed, in words the week's note can say (weekly-note.js): "bench comes down to 112.5 × 3".
  var said = Object.keys(p.rows).map(function (k) { var x = p.rows[k], g = (x.row.next && x.row.next.group) || {}, s0 = (x.sets || [])[0] || {};
    return { lift: x.row.lift, title: x.row.title, fromKg: Number(g.weight) || 0, toKg: Number(s0.weight) || 0, reps: Number(s0.plannedReps || s0.reps) || 0, variant: x.variant || null }; });
  var n = 0;
  Store.update(function (s) {
    var pr = (s.programs || []).find(function (x) { return x.id === prog.id; });
    if (!pr) return;
    n = deskApplyNextWeek(pr.weeks, rev.nextIdx, edits);
    // A swap (pain on the lift) changes the exercise itself, not only its sets.
    edits.forEach(function (e) { var ex = e.variant && pr.weeks[rev.nextIdx].days[e.di] && pr.weeks[rev.nextIdx].days[e.di].exercises[e.ei]; if (ex && !(ex.sets || []).some(function (x) { return x.completed; })) { ex.variant = e.variant; n = Math.max(n, 1); } });
  });
  dkPendDrop(aid);
  if (!n) { toast('Nothing changed: those sets were logged meanwhile'); dkWsRepaint(); return; }
  persistProgram(prog.id);
  if (window.WeeklyNote) { try { WeeklyNote.noteApplied(aid, said, { week: prog.weeks[rev.nextIdx].number || rev.nextIdx + 1 }); } catch (e) {} }
  var r = dkRow(aid);
  dkNoteHandled(aid, 'apply');
  dkPublish(aid, { quietDemo: true });
  var wk = prog.weeks[rev.nextIdx].number || rev.nextIdx + 1;
  toast(window._demoMode ? 'Week ' + wk + ' published in the demo. Nothing leaves this page.' : 'Week ' + wk + ' published. ' + (r ? _dkFirst(r.athlete.name) : 'They') + ' gets a heads-up.');
  dkWsRepaint();
}
// Redraw whichever workspace is showing, keeping the scroll.
function dkWsRepaint() {
  if (_dkOnPage() && window._apAthlete) { dkRowsFresh(); var sc = window.scrollY; renderAthletePage(window._apAthlete); window.scrollTo(0, sc); return; }
  if (_dk.screen === 'today') { var c = document.getElementById('deskTodayCentre'), top = c ? c.scrollTop : 0; renderDeskToday({ keepCentre: true }); dkPaintTodayCentre(); c = document.getElementById('deskTodayCentre'); if (c) c.scrollTop = top; return; }
  if (_dk.screen === 'roster') {
    var rc = document.getElementById('deskRosterCentre'), rt = rc ? rc.scrollTop : 0;
    dkRowsFresh(); dkPaintRosterBody(); if (dkRMode() === 'list') { dkPaintRosterCentre(); rc = document.getElementById('deskRosterCentre'); if (rc) rc.scrollTop = rt; }
  }
}

// ---------- lifts: one strip, the three and the total ----------
function dkWsLifts(r) {
  var a = r.athlete, prog = r.status.program, u = unitLabel();
  var logs = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === a.id; });
  var t = todayISO();
  var meets = (Store.get().meets || []).filter(function (m) { return m.athleteId === a.id && !m.planned && m.date && String(m.date).slice(0, 10) <= t; });
  var box = el('div', { class: 'dk-ls' });
  var cell = function (cls, name, big, unit, delta, line, vals) {
    var c = el('div', { class: 'dk-ls-cell ' + cls });
    var top = el('div', { class: 'dk-ls-top' });
    top.appendChild(el('span', { class: 'dk-ls-name' }, el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }), name));
    c.appendChild(top);
    if (big == null) { c.appendChild(el('div', { class: 'dk-ls-big is-empty' }, line || 'Waiting for a set')); return c; }
    c.appendChild(el('div', { class: 'dk-ls-big' }, el('b', {}, big), el('small', {}, unit)));
    var dl = el('div', { class: 'dk-ls-d' + (delta > 0 ? ' is-up' : '') }, delta ? (delta > 0 ? '+' : '−') + Math.abs(delta) + ' ' + u + ' in 4 weeks' : 'Level in 4 weeks');
    c.appendChild(dl);
    if (line) c.appendChild(el('div', { class: 'dk-ls-line' }, line));
    if (vals && vals.length >= 2) c.appendChild(el('div', { class: 'dk-ls-spark', html: uiSparkline(vals) }));
    return c;
  };
  MAIN_LIFTS.forEach(function (L) {
    var now = bestE1RM(a.id, L) || 0;
    var vals = strengthSeries(logs, L, { weeks: 16 }).map(function (p) { return p.value; });
    var d = vals.length >= 2 ? Math.round(kgToDisplay(vals[vals.length - 1] - vals[Math.max(0, vals.length - 5)])) : 0;
    if (!now) { box.appendChild(cell('lift-' + L, LIFT_LABELS[L], null, '', 0, 'Waiting for a set')); return; }
    var bits = [];
    var best = meets.reduce(function (m, x) { return Math.max(m, Number(x[L]) || 0); }, 0);
    if (best > 0) { var gap = Math.round(kgToDisplay(now - best)); bits.push('Meet best ' + exactW(best) + ' (' + (gap >= 0 ? '+' : '−') + Math.abs(gap) + ')'); }
    else { var one = bestSingle(a.id, L); if (one) bits.push('1RM ' + exactW(one.kg)); }
    var pm = prog && prog.maxes && Number(prog.maxes[L]) > 0 ? Number(prog.maxes[L]) : 0;
    if (pm) bits.push('% from ' + exactW(pm));
    box.appendChild(cell('lift-' + L, LIFT_LABELS[L], String(Math.round(kgToDisplay(now))), u + ' e1RM', d, bits.join(' · '), vals));
  });
  var total = currentTotal(a.id);
  if (!total) box.appendChild(cell('is-total', 'Total', null, '', 0, 'All three lifts first'));
  else {
    var bw = latestBodyweight(a.id), singles = bestSinglesTotal(a.id), tb = [];
    if (bw) tb.push(dotsScore(singles ? singles.kg : total, bw, a.sex || 'male').toFixed(1) + ' DOTS');
    if (singles) tb.push('1RM ' + exactW(singles.kg));
    var td = r.total && r.total.delta != null ? Math.round(kgToDisplay(r.total.delta)) : 0;
    box.appendChild(cell('is-total', 'Total', String(Math.round(kgToDisplay(total))), u, td, tb.join(' · '), r.total && r.total.values));
  }
  return box;
}
// Pain they reported (open first, last two weeks): resolve with a note, right here.
function dkWsPain(r, shown) {
  if (typeof buildPainSection !== 'function') return null;
  // Every report of the last two weeks already sits on its session above: not twice.
  var since = _addDaysISO(todayISO(), -13);
  var recent = (Store.get().painReports || []).filter(function (p) { return p.athleteId === r.athlete.id && String(p.day) >= since; });
  if (shown && recent.length && recent.every(function (p) { return shown['p' + p.id]; })) return null;
  var parts = buildPainSection(r.athlete.id, dkWsRepaint);
  if (!parts || !parts.length) return null;
  var box = el('div', { class: 'dk-sec dk-pain' });
  box.appendChild(el('h3', { class: 'dk-sec-title' }, 'Pain'));
  box.appendChild(parts[1]);
  return box;
}

// ---------- check-ins, recovery ----------
function dkQShort(q) {
  var p = String(q.prompt || '');
  if (/sleep/i.test(p)) return q.kind === 'number' ? 'Sleep (h)' : 'Sleep';
  if (/sore/i.test(p)) return 'Soreness';
  if (/pain|niggle|injur|hurt/i.test(p)) return 'Pain';
  if (/stress/i.test(p)) return 'Stress';
  if (/nutrition|food|diet|eat/i.test(p)) return 'Nutrition';
  if (/mood/i.test(p)) return 'Mood';
  if (/energy|tired|fatigue/i.test(p)) return 'Energy';
  p = p.replace(/\?$/, '');
  return p.length > 26 ? p.slice(0, 25) + '…' : p;
}
// How they are, as strips, never a table: one line per signal, its last weeks as marks (hollow
// when not reported) and the latest value in ink. A signal nobody answered isn't drawn.
function dkWsCheckins(r) {
  var me = _dkCoachMeId();
  var s = Store.get();
  var qs = (s.checkinQuestions || []).filter(function (q) { return q.coachId === me; });
  var g = deskCheckinGrid(qs, s.checkinAnswers || [], r.athlete.id);
  var rows = g.rows.filter(function (row) { return row.cells.some(Boolean); });
  if (!rows.length) {
    // The older weekly form, when that's what they use.
    var wci = (s.checkins || []).filter(function (c) { return c.athleteId === r.athlete.id; }).sort(function (x, y) { return String(y.weekStart).localeCompare(String(x.weekStart)); })[0];
    if (!wci) return g.rows.length ? el('p', { class: 'dk-quiet-p' }, 'No answers in the last four weeks.') : null;
    return el('p', { class: 'dk-quiet-p' }, 'Week of ' + fmtDateShort(wci.weekStart) + ': sleep ' + wci.sleep + '/10 · fresh ' + wci.soreness + '/10 · calm ' + wci.stress + '/10 · feel ' + wci.feel + '/10' + (wci.note ? ' · ' + wci.note : ''));
  }
  var box = el('div', { class: 'dk-rd' });
  var first = g.weeks.length;
  rows.forEach(function (row) { row.cells.forEach(function (c, i) { if (c && i < first) first = i; }); });
  rows.forEach(function (row) {
    var line = el('div', { class: 'dk-rd-row' });
    line.appendChild(el('span', { class: 'dk-rd-k', title: row.q.prompt }, dkQShort(row.q).replace(/ \(h\)$/, '')));
    var marks = el('span', { class: 'dk-rd-marks', role: 'img' });
    var said = [];
    var nums = row.cells.map(function (c) { return c && c.num != null && row.q.kind !== 'yesno' ? Number(c.num) : null; });
    var hi = Math.max.apply(null, nums.filter(function (n) { return n != null; }).concat([0])) || 1;
    row.cells.forEach(function (c, i) {
      var wk = i === g.weeks.length - 1 ? 'this week' : 'week of ' + fmtDateShort(g.weeks[i]);
      var m;
      if (!c) m = el('i', { class: 'dk-rd-m is-none' });
      else if (nums[i] != null) { m = el('i', { class: 'dk-rd-m is-bar' + (c.tone ? ' t-' + c.tone : '') }); m.style.setProperty('--h', Math.max(0.2, nums[i] / hi).toFixed(2)); }
      else m = el('i', { class: 'dk-rd-m' + (c.tone ? ' t-' + c.tone : '') });
      if (i < first) m.classList.add('is-before');
      said.push(wk + ': ' + (c ? c.text : 'not reported'));
      m.title = wk.charAt(0).toUpperCase() + wk.slice(1) + ': ' + (c ? c.text : 'not reported');
      marks.appendChild(m);
    });
    marks.setAttribute('aria-label', said.join('; '));
    line.appendChild(marks);
    var last = null;
    for (var i = row.cells.length - 1; i >= 0; i--) if (row.cells[i]) { last = row.cells[i]; break; }
    var v = el('span', { class: 'dk-rd-v' });
    if (last && last.tone) v.appendChild(el('i', { class: 'dk-dot t-' + last.tone, 'aria-hidden': 'true' }));
    v.appendChild(document.createTextNode(last ? String(last.text).replace(/^Yes (\d+)×$/, 'Yes · $1×') : ''));
    if (last && last.tone === 'warn' && row.base != null) v.title = 'Their 4-week norm is ' + _num(row.base);
    if (last && row.cells[row.cells.length - 1] !== last) v.appendChild(el('span', { class: 'dk-rd-when' }, ' last wk'));
    line.appendChild(v);
    box.appendChild(line);
  });
  if (first > 0 && first < g.weeks.length) box.appendChild(el('p', { class: 'dk-rd-note' }, 'No check-ins before ' + fmtDateShort(g.weeks[first]) + '.'));
  return box;
}
// A 30-day line with the lifter's own normal band behind it; only a value outside the band (in
// the direction that matters) is coloured.
function dkBandChart(vals, lo, hi) {
  var v = vals.filter(function (n) { return isFinite(n); });
  if (v.length < 2) return '';
  var W = 120, H = 28, min = Math.min.apply(null, v.concat([lo])), max = Math.max.apply(null, v.concat([hi])), span = (max - min) || 1;
  var y = function (n) { return (H - 2 - (n - min) / span * (H - 4)).toFixed(1); };
  var d = v.map(function (n, i) { return (i ? 'L' : 'M') + (i / (v.length - 1) * (W - 4) + 2).toFixed(1) + ' ' + y(n); }).join(' ');
  return '<svg class="dk-band" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><rect x="0" y="' + y(hi) + '" width="' + W + '" height="' + Math.max(1, y(lo) - y(hi)).toFixed(1) + '" rx="2"/><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
}
function dkWsRecovery(r) {
  var rows = (Store.get().healthDaily || []).filter(function (h) { return h.athleteId === r.athlete.id; })
    .sort(function (a, b) { return String(a.day).localeCompare(String(b.day)); }).slice(-30);
  if (rows.length < 3) return null;
  var box = el('div', { class: 'dk-rd' });
  var metric = function (label, key, fmt, badLow) {
    var vals = rows.map(function (h) { return Number(h[key]); }).filter(function (n) { return n > 0; });
    if (vals.length < 3) return;
    var hist = vals.slice(0, -1), mean = hist.reduce(function (s, x) { return s + x; }, 0) / hist.length;
    var sd = Math.sqrt(hist.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / hist.length) || mean * 0.03;
    var lo = mean - sd, hi = mean + sd, last = vals[vals.length - 1];
    var off = badLow ? last < lo : last > hi;
    var row = el('div', { class: 'dk-rd-row' + (off ? ' is-off' : '') });
    row.appendChild(el('span', { class: 'dk-rd-k' }, label));
    var ch = el('span', { class: 'dk-rd-marks is-band', title: 'Their normal ' + fmt(lo) + '–' + fmt(hi) + ' · last 30 days' });
    ch.insertAdjacentHTML('beforeend', dkBandChart(vals, lo, hi));
    row.appendChild(ch);
    var v = el('span', { class: 'dk-rd-v', title: 'Their normal ' + fmt(lo) + '–' + fmt(hi) });
    if (off) v.appendChild(el('i', { class: 'dk-dot t-warn', 'aria-hidden': 'true' }));
    v.appendChild(document.createTextNode(fmt(last)));
    row.appendChild(v);
    box.appendChild(row);
  };
  metric('Sleep', 'sleepMin', function (m) { return sleepHm(m); }, true);
  metric('Resting HR', 'rhr', function (n) { return String(Math.round(n)); }, false);
  metric('HRV', 'hrv', function (n) { return Math.round(n) + ' ms'; }, true);
  return box.childNodes.length ? box : null;
}

// ---------- meets and bodyweight ----------
function dkWsMeets(r) {
  var a = r.athlete, u = unitLabel(), t = todayISO();
  var box = el('div', { class: 'dk-mt' });
  if (r.meet) {
    var m = r.meet.meet;
    var up = el('div', { class: 'dk-mt-next' });
    var hd = el('div', { class: 'dk-mt-head' });
    hd.appendChild(el('b', {}, m.name || 'Meet'));
    hd.appendChild(el('span', { class: 'dk-mt-days' + (r.meet.days <= 14 ? ' is-soon' : '') }, r.meet.days === 0 ? 'Today' : r.meet.days + (r.meet.days === 1 ? ' day' : ' days')));
    up.appendChild(hd);
    up.appendChild(el('div', { class: 'dk-mt-sub' }, [fmtDate(m.date), m.federation, m.weightClass ? dkClassText(m.weightClass) : ''].filter(Boolean).join(' · ')));
    var bw = deskBodyweightVsClass(a.id, m);
    if (bw) {
      var weeks = Math.max(1, r.meet.days / 7);
      // The class gap: a dot carries the tone; the words stay ink, only the gap is weighted.
      var bwl = el('div', { class: 'dk-mt-bw' });
      if (bw.over > 0) bwl.appendChild(el('i', { class: 'dk-dot t-warn', 'aria-hidden': 'true' }));
      var bwt = el('span', {}, 'BW ' + _num(kgToDisplay(bw.bw, 1)) + ' ' + u + ' · ');
      bwt.appendChild(el('b', {}, _num(kgToDisplay(Math.abs(bw.over), 1)) + (bw.over > 0 ? ' over' : ' under')));
      if (bw.over > 0) bwt.appendChild(document.createTextNode(' · ' + _num(kgToDisplay(bw.over / weeks, 1)) + ' ' + u + ' a week to make it'));
      bwl.appendChild(bwt);
      up.appendChild(bwl);
      var series = (Store.get().bodyweight || []).filter(function (b) { return b.athleteId === a.id && Number(b.weight) > 0; })
        .sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); }).slice(-10).map(function (b) { return Number(b.weight); });
      if (series.length >= 2) up.insertAdjacentHTML('beforeend', dkClassLine(series, bw.cls));
    }
    var mdHook = window.MeetDay && MeetDay.plannerLink ? MeetDay.plannerLink(m) : null;   // MEET DAY hook: Plan attempts / Meet day
    if (mdHook) up.appendChild(mdHook);
    box.appendChild(up);
  }
  var past = (Store.get().meets || []).filter(function (m) { return m.athleteId === a.id && !m.planned && m.date && String(m.date).slice(0, 10) <= t; })
    .sort(function (x, y) { return String(y.date).localeCompare(String(x.date)); });
  if (past.length) {
    var list = el('div', { class: 'dk-mt-past' });
    past.slice(0, 3).forEach(function (m) {
      var tot = (Number(m.squat) || 0) + (Number(m.bench) || 0) + (Number(m.deadlift) || 0);
      var row = el('div', { class: 'dk-mt-row' });
      row.appendChild(el('span', { class: 'dk-mt-name' }, m.name || 'Meet'));
      row.appendChild(el('span', { class: 'dk-mt-date' }, fmtDateShort(m.date) + (m.weightClass ? ' · ' + m.weightClass : '')));
      var v = el('span', { class: 'dk-mt-tot' });
      if (tot) { v.appendChild(el('b', {}, exactW(tot))); v.appendChild(document.createTextNode(' ' + u)); }
      row.appendChild(v);
      row.title = [m.squat ? 'S ' + exactW(m.squat) : '', m.bench ? 'B ' + exactW(m.bench) : '', m.deadlift ? 'D ' + exactW(m.deadlift) : ''].filter(Boolean).join(' · ');
      list.appendChild(row);
    });
    box.appendChild(list);
  }
  if (!box.childNodes.length) {
    box.appendChild(el('p', { class: 'dk-quiet-p' }, 'No meet on ' + _dkFirst(a.name) + '\u2019s calendar. Plan one and the block, attempts and class line up to it.'));
    if (window.MeetDay && MeetDay.planFor) box.appendChild(dkBtn('Plan a meet', { cls: 'is-quiet dk-btn-sm dk-btn-flush', icon: DK_IC.plus, onClick: function () { MeetDay.planFor(a.id); } }));
  }
  return box;
}
// Bodyweight against the class limit: the line under the dashed class.
function dkClassLine(series, cls) {
  var W = 220, H = 34, min = Math.min.apply(null, series.concat([cls])) - 0.3, max = Math.max.apply(null, series.concat([cls])) + 0.3, span = (max - min) || 1;
  var y = function (n) { return (H - 3 - (n - min) / span * (H - 6)).toFixed(1); };
  var d = series.map(function (n, i) { return (i ? 'L' : 'M') + (i / (series.length - 1) * (W - 6) + 3).toFixed(1) + ' ' + y(n); }).join(' ');
  return '<svg class="dk-bwline" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Bodyweight against the class limit"><path class="dk-bwline-cls" d="M0 ' + y(cls) + ' H' + W + '" vector-effect="non-scaling-stroke"/><path d="' + d + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/></svg>';
}

// ---------- their notes (waiting ones first, answered in place) ----------
function dkWsNotes(r, shown) {
  var a = r.athlete;
  // A note already on its session card above isn't said twice.
  var notes = (Store.get().sessionNotes || []).filter(function (n) { return n.athleteId === a.id && n.note && String(n.note).trim() && !(shown && shown[String(n.date).slice(0, 10)]); })
    .sort(function (x, y) { return (x.coachComment ? 1 : 0) - (y.coachComment ? 1 : 0) || String(y.date).localeCompare(String(x.date)); }).slice(0, 4);
  if (!notes.length) return null;
  var list = el('div', { class: 'dk-tn' });
  notes.forEach(function (n) {
    var item = el('div', { class: 'dk-tn-item' + (n.coachComment ? '' : ' is-waiting') });
    var meta = el('div', { class: 'dk-tn-meta' });
    meta.appendChild(el('span', {}, fmtDateShort(n.date)));
    meta.appendChild(el('span', { class: n.coachComment ? '' : 'is-wait' }, n.coachComment ? 'Answered' : 'Waiting on you'));
    item.appendChild(meta);
    item.appendChild(el('p', { class: 'dk-tn-body' }, n.note));
    if (n.coachComment) item.appendChild(el('p', { class: 'dk-tn-reply' }, n.coachComment));
    else {
      var ans = dkBtn('Answer', { cls: 'is-quiet dk-btn-sm', onClick: function () {
        ans.remove();
        var ta = el('textarea', { class: 'dk-ta dk-tn-ta', rows: '2', maxlength: '2000', 'aria-label': 'Your answer to their note' });
        var send = dkBtn('Send', { cls: 'is-ink dk-btn-sm' });
        var go = function () {
          var body = ta.value.trim();
          if (!body || send.disabled) { ta.focus(); return; }
          send.disabled = true;
          dkAnswerNote(a.id, n.date, body).then(function (ok) { if (ok) dkWsRepaint(); else send.disabled = false; });
        };
        send.addEventListener('click', go);
        ta.addEventListener('keydown', function (e) { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); } if (e.key === 'Escape') { e.stopPropagation(); dkWsRepaint(); } });
        var row = el('div', { class: 'dk-tn-answer' });
        row.appendChild(ta); row.appendChild(send);
        item.appendChild(row);
        ta.focus();
      } });
      item.appendChild(ans);
    }
    list.appendChild(item);
  });
  return list;
}
async function dkAnswerNote(athleteId, date, comment) {
  var me = _dkCoachMeId();
  try {
    if (!window._demoMode) await DB.upsertCoachComment({ athleteId: athleteId, date: date, coachId: me, comment: comment });
    Store.update(function (st) {
      var t = (st.sessionNotes || []).find(function (nn) { return nn.athleteId === athleteId && nn.date === date; });
      if (t) { t.coachComment = comment; t.coachCommentAt = new Date().toISOString(); t.coachId = me; }
    });
    toast(window._demoMode ? 'Answered in the demo. Nothing leaves this page.' : 'Answer sent');
    return true;
  } catch (e) { console.warn('dkAnswerNote', e); toast('Could not send that. Check your connection.'); return false; }
}

// ---------- past blocks (the one now, then every one before it) ----------
function dkWsBlocks(r) {
  var a = r.athlete, u = unitLabel(), prog = r.status.program, st = r.status;
  var blocks = (Store.get().programBlocks || []).filter(function (b) { return b.athleteId === a.id; })
    .sort(function (x, y) { return String(y.endedOn || y.createdAt || '').localeCompare(String(x.endedOn || x.createdAt || '')); });
  if (!prog && !blocks.length) return null;
  var view = el('div', { class: 'dk-bl-view' });
  var list = el('div', { class: 'dk-bl' });
  var openId = null;
  if (prog) {
    var all = prog.weeks.flatMap(function (w) { return w.days; }).flatMap(function (d) { return d.exercises; }).flatMap(function (e) { return e.sets; });
    var pct = all.length ? Math.round(all.filter(function (s) { return s.completed; }).length / all.length * 100) : 0;
    var now = el('button', { type: 'button', class: 'dk-bl-row' });
    now.appendChild(el('span', { class: 'dk-bl-name' }, prog.name || 'Program'));
    now.appendChild(el('span', { class: 'dk-bl-sub' }, 'Now · ' + (st.week ? (st.week.finished ? 'finished' : 'week ' + st.week.number + ' of ' + st.week.total) : '') + ' · ' + pct + '% logged'));
    now.insertAdjacentHTML('beforeend', DK_IC.chevR);
    now.addEventListener('click', function () { openAthleteProgram(a.id); });
    list.appendChild(now);
  }
  blocks.forEach(function (b) {
    var sm = blockSummary(b, a.id);
    var ch = MAIN_LIFTS.filter(function (L) { return sm.change[L] != null; }).map(function (L) { return LIFT_LABELS[L].charAt(0) + ' ' + (sm.change[L] >= 0 ? '+' : '−') + Math.abs(Math.round(kgToDisplay(sm.change[L]))); }).join(' · ');
    var dates = b.startedOn ? fmtDateShort(b.startedOn) + (b.endedOn && b.endedOn !== b.startedOn ? ' – ' + fmtDateShort(b.endedOn) : '') : '';
    var row = el('button', { type: 'button', class: 'dk-bl-row', 'aria-expanded': 'false' });
    row.appendChild(el('span', { class: 'dk-bl-name' }, b.name || 'Block'));
    row.appendChild(el('span', { class: 'dk-bl-sub' }, [dates, sm.pct + '% logged', ch ? 'e1RM ' + ch + ' ' + u : null].filter(Boolean).join(' · ')));
    row.insertAdjacentHTML('beforeend', DK_IC.chevR);
    row.addEventListener('click', async function () {
      view.innerHTML = '';
      list.querySelectorAll('.dk-bl-row').forEach(function (x) { x.setAttribute('aria-expanded', 'false'); });
      if (openId === b.id) { openId = null; return; }
      openId = b.id;
      row.setAttribute('aria-expanded', 'true');
      var weeks = b.weeks;
      if (!weeks && window.DB && DB.getProgramBlockWeeks) {
        var wait = el('p', { class: 'dk-quiet-p' }, 'Opening the block…');
        view.appendChild(wait);
        weeks = await DB.getProgramBlockWeeks(b.id).catch(function () { return null; });
        if (openId !== b.id) return;
        wait.remove();
        if (weeks) Store.update(function (s) { var x = (s.programBlocks || []).find(function (y) { return y.id === b.id; }); if (x) x.weeks = weeks; });
      }
      if (!weeks) { view.appendChild(el('p', { class: 'dk-quiet-p' }, 'This block didn\'t open. Check the connection and try again.')); return; }
      view.appendChild(dkBlockView({ id: b.id, name: b.name, weeks: weeks, maxes: b.maxes }, a.id));
    });
    list.appendChild(row);
  });
  var sec = dkSection('Blocks', list);
  sec.appendChild(view);
  return sec;
}

// ---------- private notes (the card, and Messages' side pane): only the coach who wrote them sees them ----------
function dkNotesFor(aid) {
  var me = _dkCoachMeId();
  return (Store.get().coachNotes || []).filter(function (n) { return n.athleteId === aid && n.coachId === me; })
    .sort(function (a, b) { return String(b.createdAt).localeCompare(String(a.createdAt)); });
}
async function dkNoteSave(aid, body, note) {
  var me = _dkCoachMeId();
  body = String(body || '').trim().slice(0, 4000);
  if (!body) return false;
  if (window._demoMode) {
    Store.update(function (s) {
      s.coachNotes = s.coachNotes || [];
      if (note) { var x = s.coachNotes.find(function (y) { return y.id === note.id; }); if (x) { x.body = body; x.updatedAt = new Date().toISOString(); } }
      else s.coachNotes.unshift({ id: 'demo-cnote-' + Date.now(), coachId: me, athleteId: aid, body: body, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    });
    return true;
  }
  var res = note ? await DB.updateCoachNote(note, body) : await DB.addCoachNote({ coachId: me, athleteId: aid, body: body });
  if (!res || !res.ok) { toast('Could not save the note. Check your connection.'); return false; }
  Store.update(function (s) {
    s.coachNotes = (s.coachNotes || []).filter(function (x) { return !note || x.id !== note.id; });
    s.coachNotes.unshift(res.note);
  });
  if (res.local) toast('Saved on this device until the next database update runs');
  return true;
}
async function dkNoteDelete(note) {
  if (!window._demoMode) {
    var res = await DB.deleteCoachNote(note);
    if (!res || !res.ok) { toast('Could not delete the note. Check your connection.'); return; }
  }
  Store.update(function (s) { s.coachNotes = (s.coachNotes || []).filter(function (x) { return x.id !== note.id; }); });
}
// The private notes block: pinned over the thread, only the coach who wrote them sees them.
function dkNotesBox(aid) {
  var box = el('div', { class: 'dk-pn', 'data-aid': aid });
  var paint = function (composeFor) {
    box.innerHTML = '';
    var notes = dkNotesFor(aid);
    var hd = el('div', { class: 'dk-pn-head' });
    hd.appendChild(el('span', { class: 'dk-pn-title' }, 'Private notes'));
    hd.appendChild(el('span', { class: 'dk-pn-who' }, 'Only you'));
    var add = el('button', { type: 'button', class: 'dk-icon-btn', title: 'Add a private note  N', 'aria-label': 'Add a private note', html: ICONS.plus });
    add.addEventListener('click', function () { paint('new'); });
    hd.appendChild(add);
    box.appendChild(hd);
    var list = el('div', { class: 'dk-pn-list' });
    if (composeFor === 'new') list.appendChild(composer(null));
    notes.forEach(function (n) {
      if (composeFor === n.id) { list.appendChild(composer(n)); return; }
      var it = el('div', { class: 'dk-pn-item' });
      it.appendChild(el('p', {}, n.body));
      var meta = el('div', { class: 'dk-pn-meta' });
      meta.appendChild(el('span', {}, fmtDateShort(String(n.updatedAt || n.createdAt).slice(0, 10)) + (n.local ? ' · on this device' : '')));
      var ed = el('button', { type: 'button', class: 'dk-pn-act' }, 'Edit');
      ed.addEventListener('click', function () { paint(n.id); });
      var del = el('button', { type: 'button', class: 'dk-pn-act' }, 'Delete');
      del.addEventListener('click', function () {
        if (del.dataset.armed) { dkNoteDelete(n).then(function () { paint(); }); return; }
        del.dataset.armed = '1'; del.textContent = 'Delete?';
        setTimeout(function () { if (del.isConnected) { delete del.dataset.armed; del.textContent = 'Delete'; } }, 2600);
      });
      meta.appendChild(ed); meta.appendChild(del);
      it.appendChild(meta);
      list.appendChild(it);
    });
    if (!notes.length && composeFor !== 'new') {
      var empty = el('button', { type: 'button', class: 'dk-pn-empty' }, 'Injuries, life, what works for them. The athlete never sees these.');
      empty.addEventListener('click', function () { paint('new'); });
      list.appendChild(empty);
    }
    box.appendChild(list);
    var ta = box.querySelector('textarea');
    if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
  };
  var composer = function (note) {
    var w = el('div', { class: 'dk-pn-compose' });
    var ta = el('textarea', { class: 'dk-ta', rows: '3', maxlength: '4000', 'aria-label': note ? 'Edit private note' : 'New private note', placeholder: 'Only you see this' });
    ta.value = note ? note.body : '';
    var row = el('div', { class: 'dk-pn-btns' });
    var cancel = dkBtn('Cancel', { cls: 'is-quiet dk-btn-sm', onClick: function () { paint(); } });
    var save = dkBtn('Save', { cls: 'is-ink dk-btn-sm', kbd: _dkMac() ? '⌘↵' : 'Ctrl ↵' });
    var go = function () {
      if (save.disabled) return;
      save.disabled = true;
      dkNoteSave(aid, ta.value, note).then(function (ok) { if (ok) paint(); else save.disabled = false; });
    };
    save.addEventListener('click', go);
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); go(); }
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); paint(); }
    });
    row.appendChild(cancel); row.appendChild(save);
    w.appendChild(ta); w.appendChild(row);
    return w;
  };
  box._compose = function () { paint('new'); };
  paint();
  return box;
}
// =====================================================================
// PROGRAMS: the block builder (desk v2, 2026-10-22). A live coaching
// platform's builder, never a grid of cells:
// - the list pane: athletes and templates;
// - the block as a strip of weeks (dates, a volume and intensity read per
//   week, the week they're in, the meet's W-n);
// - one quiet bar of tools: progress the block, copy a week, templates,
//   the team push, undo, the save state (or Notify, the one red);
// - Sessions: the selected week's days as cards, each exercise one line in
//   POWALIFTA notation, written in place (gridParseCell, the parser every
//   builder shares), loads worked out from the lifter's maxes, set fields
//   small; a logged week shows the sets they lifted as bars against what
//   was written, on the same line;
// - Progression: each lift's planned top set across the block as a line,
//   the lifted top sets as dots on it; a week's point opens that week.
// Edits save as typed (persistProgram → DB.upsertProgram, CAS); Notify is
// the heads-up with the count of edits since the last one. Phones keep the
// builder they have. The phone's set-by-set editor stays one click away.
// =====================================================================
DK_IC.up = _dkSvg('<path d="M4 17l6-6 4 4 6-7"/><path d="M14 8h6v6"/>');
DK_IC.copy = _dkSvg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V5.5A1.5 1.5 0 0 0 14.5 4h-9A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16H8"/>');
DK_IC.undo = _dkSvg('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>');
DK_IC.layers = _dkSvg('<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>');
DK_IC.lines = _dkSvg('<path d="M4 19l5-6 4 3 7-9"/><circle cx="9" cy="13" r="1.2"/><circle cx="13" cy="16" r="1.2"/>');
DK_IC.cards = _dkSvg('<rect x="3.5" y="4" width="17" height="7" rx="2"/><rect x="3.5" y="13" width="17" height="7" rx="2"/>');

// The view: Sessions (default) or Progression, remembered; the set-by-set editor only for this visit.
// An older saved 'weeks' (the Weeks view) opens Sessions.
function deskPbView() {
  if (_dk.pbSetsView) return 'sets';
  return _dkLS('powa-pb-view-desk') === 'progress' ? 'progress' : 'sessions';
}
function deskSetPbView(v) {
  _dk.pbSetsView = v === 'sets';
  if (v === 'sets') { try { activeWeekIdx = dkPbWeekIdx(); } catch (e) {} return; }
  _dkLS('powa-pb-view-desk', v === 'progress' ? 'progress' : null);
}
// coach.html's loadProgram calls this first on the desk: the list pane, and the template view.
// Returns true when the centre belongs to a template (loadProgram stops).
function deskBuilderFrame() {
  var sec = document.querySelector('[data-pane="program"]');
  if (!sec) return false;
  if (!sec.querySelector('#dkPbList')) {
    var list = el('aside', { class: 'dk-list dk-pb-list', id: 'dkPbList', 'aria-label': 'Programs' });
    sec.insertBefore(list, sec.firstChild);
  }
  dkPaintPbList();
  if (_dk.pbMode === 'templates') { _dk.pbInfo = null; dkPaintTemplate(); return true; }
  var aid = dkPbAthleteId(), prog = aid ? dkProgOf(aid) : null;
  // The picked exercise survives a repaint of the same block (the inspector stays on it).
  if (!_dk.pbInfo || _dk.pbInfo.athleteId !== aid || !prog || !dkPbEx(prog, _dk.pbInfo.wi, _dk.pbInfo.di, _dk.pbInfo.ei)) _dk.pbInfo = null;
  return false;
}
// loadProgram is done drawing: the side pane, the edit marks, the count.
function deskBuilderDone() {
  // The set-by-set editor writes effort the way every desk screen does: @8, not "RPE 8".
  document.querySelectorAll('#programArea .pb-chip em').forEach(function (e) { var t = e.textContent; if (/^RPE\s/.test(t)) e.textContent = t.replace(/^RPE\s*/, '@'); });
  dkSyncCtx(); dkPbMarkEdited(); dkPaintPbHead(); if (dkCtxReady()) dkPaintInspector();
}
function deskSyncCtx() { dkSyncCtx(); }
function dkPbAthleteId() { var sel = document.getElementById('progAthlete'); return sel ? sel.value : ''; }
function dkPbEx(prog, wi, di, ei) { var w = prog && prog.weeks[wi], d = w && w.days[di]; return (d && d.exercises[ei]) || null; }
function dkPaintPbList() {
  var list = document.getElementById('dkPbList');
  if (!list) return;
  var me = _dkCoachMeId();
  var s = Store.get();
  list.innerHTML = '';
  var head = el('div', { class: 'dk-list-head' });
  var tr = el('div', { class: 'dk-title-row' });
  tr.appendChild(el('h1', { class: 'dk-h1' }, 'Programs'));
  head.appendChild(tr);
  var tabs = el('div', { class: 'dk-tabs', role: 'tablist', 'aria-label': 'Programs' });
  var tpls = (s.programTemplates || []).filter(function (t) { return t.coachId === me; });
  var aths = (s.athletes || []).filter(function (a) { return a.coachId === me; });
  [['athletes', 'Athletes', aths.length], ['templates', 'Templates', tpls.length]].forEach(function (x) {
    var on = (_dk.pbMode || 'athletes') === x[0];
    var b = el('button', { type: 'button', class: 'dk-tab dk-pb-tab' + (on ? ' on' : ''), role: 'tab', 'aria-selected': String(on) }, x[1], el('span', { class: 'dk-tab-n' }, x[2] ? String(x[2]) : ''));
    b.addEventListener('click', function () { if (on) return; _dk.pbMode = x[0]; loadProgram(); });
    tabs.appendChild(b);
  });
  head.appendChild(tabs);
  var sw = el('label', { class: 'dk-search dk-search-wide' });
  sw.insertAdjacentHTML('beforeend', DK_IC.search);
  var si = el('input', { type: 'search', placeholder: _dk.pbMode === 'templates' ? 'Search templates' : 'Search athletes', 'aria-label': 'Search', autocomplete: 'off', spellcheck: 'false' });
  si.value = _dk.pbSearch || '';
  si.addEventListener('input', function () { _dk.pbSearch = si.value; dkPaintPbRows(list); });
  si.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.preventDefault(); if (si.value) { si.value = ''; _dk.pbSearch = ''; dkPaintPbRows(list); } else si.blur(); } });
  sw.appendChild(si);
  head.appendChild(sw);
  list.appendChild(head);
  list.appendChild(el('div', { class: 'dk-lane dk-pb-rows' }));
  dkPaintPbRows(list);
}
function dkPaintPbRows(list) {
  var box = list.querySelector('.dk-pb-rows');
  if (!box) return;
  box.innerHTML = '';
  var me = _dkCoachMeId(), s = Store.get();
  var q = String(_dk.pbSearch || '').trim().toLowerCase();
  if (_dk.pbMode === 'templates') {
    var tpls = (s.programTemplates || []).filter(function (t) { return t.coachId === me && (!q || String(t.name || '').toLowerCase().indexOf(q) >= 0); });
    if (!_dk.pbTpl && tpls.length) _dk.pbTpl = tpls[0].id;
    tpls.forEach(function (t) {
      var on = _dk.pbTpl === t.id;
      var weeks = (t.payload && t.payload.weeks) || [];
      var sets = weeks.flatMap(function (w) { return w.days || []; }).flatMap(function (d) { return d.exercises || []; }).flatMap(function (e) { return e.sets || []; }).length;
      var row = el('button', { type: 'button', class: 'dk-qrow dk-pb-row' + (on ? ' is-sel' : ''), 'aria-current': on ? 'true' : 'false' });
      row.appendChild(el('span', { class: 'dk-pb-ic', html: DK_IC.layers }));
      var main = el('span', { class: 'dk-qmain' });
      main.appendChild(el('span', { class: 'dk-qname' }, t.name || 'Template'));
      main.appendChild(el('span', { class: 'dk-pb-sub' }, weeks.length + (weeks.length === 1 ? ' week · ' : ' weeks · ') + sets + ' sets'));
      row.appendChild(main);
      row.addEventListener('click', function () { _dk.pbTpl = t.id; loadProgram(); });
      box.appendChild(row);
    });
    var nb = el('button', { type: 'button', class: 'dk-pb-new' });
    nb.insertAdjacentHTML('beforeend', DK_IC.plus);
    nb.appendChild(el('span', {}, 'Bring a template in'));
    nb.addEventListener('click', function () { openSheetImport(null); });
    box.appendChild(nb);
    return;
  }
  var cur = dkPbAthleteId();
  (_dk.rows || dkRowsFresh()).slice().sort(function (a, b) { return String(a.athlete.name).localeCompare(String(b.athlete.name)); }).forEach(function (r) {
    var a = r.athlete;
    if (q && String(a.name || '').toLowerCase().indexOf(q) < 0) return;
    var on = a.id === cur;
    var prog = dkProgOf(a.id);
    var ch = prog ? dkPbChanges(prog).length : 0;
    var row = el('button', { type: 'button', class: 'dk-qrow dk-pb-row' + (on ? ' is-sel' : ''), 'aria-current': on ? 'true' : 'false' });
    row.appendChild(dkAv(a, 'is-sm'));
    var main = el('span', { class: 'dk-qmain' });
    main.appendChild(el('span', { class: 'dk-qname' }, a.name));
    main.appendChild(el('span', { class: 'dk-pb-sub' + (prog ? '' : ' dk-dim') }, r.live ? 'Training now' : dkBlockText(r.status)));
    row.appendChild(main);
    if (ch) row.appendChild(el('span', { class: 'dk-pb-dot', title: ch + (ch === 1 ? ' edit' : ' edits') + ' since the last heads-up' }, String(ch)));
    row.addEventListener('click', function () {
      if (on) return;
      var sel = document.getElementById('progAthlete');
      if (sel) sel.value = a.id;
      try { activeWeekIdx = 0; } catch (e) {}
      _dk.pbWk = null; _dk.pbInfo = null; _dk.pbSetsView = false;
      loadProgram();
    });
    box.appendChild(row);
  });
}
// ---------- edits since the last heads-up: the block against what the athlete was last told about ----------
function dkPbCells(prog) {
  var out = {};
  (prog.weeks || []).forEach(function (w, wi) { (w.days || []).forEach(function (d, di) { (d.exercises || []).forEach(function (ex, ei) {
    // As written: a set the lifter added on the day (extra) isn't the coach's change.
    out[wi + '.' + di + '.' + ei] = exTitle(ex) + '|' + _gridCellText(Object.assign({}, ex, { sets: (ex.sets || []).filter(function (x) { return !x.extra; }) }));
  }); }); });
  return out;
}
function _dkPbKey(progId) { var u = _dkUser(); return 'powa-pb-pub-' + (u ? u.id : 'x') + '-' + progId; }
function dkPbSnap(prog) {
  _dk.pbSnap = _dk.pbSnap || {};
  if (_dk.pbSnap[prog.id]) return _dk.pbSnap[prog.id];
  var s = null;
  if (!window._demoMode) { try { s = JSON.parse(_dkLS(_dkPbKey(prog.id)) || 'null'); } catch (e) { s = null; } }
  if (!s) { s = dkPbCells(prog); if (!window._demoMode) _dkLS(_dkPbKey(prog.id), JSON.stringify(s)); }
  _dk.pbSnap[prog.id] = s;
  return s;
}
function dkPbChanges(prog) {
  if (!prog) return [];
  var snap = dkPbSnap(prog), cur = dkPbCells(prog), out = [];
  Object.keys(cur).forEach(function (k) { if (snap[k] !== cur[k]) out.push(k); });
  Object.keys(snap).forEach(function (k) { if (!(k in cur)) out.push(k); });
  return out;
}
// Notify: the athlete hears (push + email, coach.html notifyAthleteAssigned) and the count resets.
// Edits are live as typed; this is a heads-up, not a gate.
function dkPublish(aid, opts) {
  var prog = dkProgOf(aid);
  if (!prog) return;
  _dk.pbSnap = _dk.pbSnap || {};
  _dk.pbSnap[prog.id] = dkPbCells(prog);
  if (window._demoMode) { if (!(opts && opts.quietDemo)) toast('Heads-up sent in the demo. Nothing leaves this page.'); }
  else { _dkLS(_dkPbKey(prog.id), JSON.stringify(_dk.pbSnap[prog.id])); if (typeof notifyAthleteAssigned === 'function') notifyAthleteAssigned(aid); }
  dkPbMarkEdited();
  dkPaintPbHead();
  var list = document.getElementById('dkPbList');
  if (list) dkPaintPbRows(list);
}
// The phone's program actions, named for the desk (no spreadsheets here).
function _dkPbActLabel(l) {
  return ({ 'Replace from a spreadsheet': 'Replace with a pasted block', 'Export spreadsheet': 'Export as a CSV file', 'Maxes for % work': 'Maxes for % sets', 'Save as template': 'Save as a template', 'Add week': 'Add a week' })[l] || l;
}
// The block's header: the name, one quiet meta line (size, logged, the maxes as a line, the set
// fields; the last two open their sheets); on the right Sessions | Progression and one overflow
// menu. The tools, the save state and Notify sit in the bar under the weeks.
function deskBuilderHead(prog, athleteId, actions, view) {
  var a = (Store.get().athletes || []).find(function (x) { return x.id === athleteId; }) || { name: 'athlete' };
  var head = el('div', { class: 'dk-pbhead' });
  var id = el('div', { class: 'dk-pbid' });
  var name = el('input', { type: 'text', class: 'dk-pbname', 'aria-label': 'Program name', spellcheck: 'false' });
  name.value = prog.name || '';
  name.addEventListener('input', function () {
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) p.name = name.value; });
    persistProgram(prog.id);
  });
  name.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); name.blur(); } });
  id.appendChild(name);
  var sets = prog.weeks.flatMap(function (w) { return w.days; }).flatMap(function (d) { return d.exercises; }).flatMap(function (e) { return e.sets; });
  var done = sets.filter(function (s) { return s.completed; }).length;
  var meta = el('div', { class: 'dk-pbmeta' });
  meta.appendChild(el('span', {}, prog.weeks.length + (prog.weeks.length === 1 ? ' week' : ' weeks')));
  if (sets.length) meta.appendChild(el('span', { class: 'dk-pblog' }, Math.round(done / sets.length * 100) + '% logged'));
  // The maxes % sets and the estimated loads work from: a quiet line, a lift dot beside each.
  var mx = el('button', { type: 'button', class: 'dk-pbmeta-btn dk-pbmax' });
  mx.appendChild(el('span', { class: 'dk-pbmax-k' }, 'Maxes'));
  var est = false, any = false;
  MAIN_LIFTS.forEach(function (L) {
    var v = programMaxKg(prog, athleteId, L);
    if (!(v > 0)) return;
    any = true;
    if (!(prog.maxes && Number(prog.maxes[L]) > 0)) est = true;
    mx.appendChild(el('span', { class: 'dk-pbmax-v lift-' + L }, el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }), String(Math.round(kgToDisplay(v)))));
  });
  if (any) mx.appendChild(el('span', { class: 'dk-pbmax-u' }, unitLabel() + (est ? ' · from their e1RM' : '')));
  else mx.appendChild(el('span', { class: 'dk-pbmax-v' }, 'not set'));
  mx.setAttribute('aria-label', 'Maxes for this block');
  dkTip(mx, est ? 'The maxes % sets and the estimated loads work from. A lift with no max set uses their best e1RM' : 'The maxes % sets and the estimated loads work from');
  mx.addEventListener('click', function () { openMaxesSheet(prog.id, athleteId); });
  meta.appendChild(mx);
  // Set fields: which ones this block carries (tempo, pause, bands and chains, the coach's own).
  var sfDef = programSetFields(prog);
  var sfNames = sfDef.on.map(function (k) { return k === 'acc' ? 'Bands' : (SET_FIELD_KINDS.find(function (x) { return x[0] === k; }) || [k, k])[1]; }).concat(sfDef.cols);
  var sfb = el('button', { type: 'button', class: 'dk-pbmeta-btn dk-pbsf' }, sfNames.length ? 'Fields ' : 'Add set fields', sfNames.length ? el('b', {}, sfNames.join(', ')) : null);
  dkTip(sfb, 'Set fields: tempo, pauses, bands and chains, your own like Bar or Belt');
  sfb.addEventListener('click', function () { openSetFieldsSheet(prog.id, function () { loadProgram(); }); });
  meta.appendChild(sfb);
  id.appendChild(meta);
  head.appendChild(id);
  var seg = el('div', { class: 'dk-seg', role: 'radiogroup', 'aria-label': 'Builder view' });
  [['sessions', 'Sessions', DK_IC.cards], ['progress', 'Progression', DK_IC.lines]].forEach(function (x) {
    var on = view === x[0];
    var b = el('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on), 'aria-label': x[1], html: x[2] }, el('span', { class: 'dk-seg-l' }, x[1]));
    dkTip(b, x[0] === 'sessions' ? 'The week as session cards' : 'Each lift across the block', 'V');
    b.addEventListener('click', function () { if (on) return; deskSetPbView(x[0]); loadProgram(); });
    seg.appendChild(b);
  });
  head.appendChild(seg);
  // The set-by-set editor has no tools bar: its save state and Notify sit here.
  if (view === 'sets') head.appendChild(el('span', { class: 'dk-pbpub', 'data-aid': athleteId, 'data-first': _dkFirst(a.name) }));
  var more = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Program options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: DK_IC.more });
  dkTip(more, 'More');
  more.addEventListener('click', function (e) {
    e.stopPropagation();
    var wi = dkPbWeekIdx(), wk = prog.weeks[wi], wn = wk ? (wk.number || wi + 1) : 1;
    var items = [];
    if (wk) {
      items.push({ node: el('div', { class: 'dk-menu-title', role: 'presentation' }, 'Week ' + wn) });
      items.push({ label: 'Add a training day', run: function () { dkPbRemember(dkProgOf(athleteId), 'Add a day'); addDay(wi); } });
      items.push({ label: 'Add a rest day', run: function () { dkPbRemember(dkProgOf(athleteId), 'Add a rest day'); addRestDay(wi); } });
      items.push({ label: 'Change it set by set', run: function () { deskSetPbView('sets'); loadProgram(); } });
      if (prog.weeks.length > 1) items.push({ label: 'Remove week ' + wn, danger: true, run: function () { dkPbRemember(dkProgOf(athleteId), 'Remove week ' + wn); deleteWeek(wi); } });
      items.push('-');
    }
    var acts = (actions || []).filter(Boolean).filter(function (x) { return !/^Notify /.test(x.label); });
    acts.forEach(function (x) {
      if (x.danger) return;
      items.push({ label: _dkPbActLabel(x.label), run: x.onClick });
    });
    // The phone's hero carries "Build from goal" for an empty block; here it waits in ⋯.
    if (!sets.length && typeof openGoalModal === 'function') items.unshift({ label: 'Build from a goal…', run: function () { openGoalModal(athleteId); } });
    var del = acts.filter(function (x) { return x.danger; });
    if (del.length) { items.push('-'); del.forEach(function (x) { items.push({ label: x.label, danger: true, run: x.onClick }); }); }
    dkPopMenu(more, items, { alignRight: true });
  });
  head.appendChild(more);
  _dk.pbHead = { prog: prog.id, aid: athleteId };
  setTimeout(dkPaintPbHead, 0);
  return head;
}
// The save state, said quietly; or Notify (the one red) with the count of edits since the last heads-up.
function dkPaintPbHead() {
  var slot = document.querySelector('#programArea .dk-pbpub');
  if (!slot) return;
  var aid = slot.dataset.aid, prog = dkProgOf(aid);
  if (!prog) return;
  var n = dkPbChanges(prog).length;
  slot.innerHTML = '';
  var first = slot.dataset.first;
  if (!n) {
    var st = el('span', { class: 'dk-state', role: 'status' }, 'Saved · ' + first + ' sees it');
    dkTip(st, 'Saved as you type. ' + first + ' already sees every edit; nothing new since the last heads-up.');
    slot.appendChild(st);
    return;
  }
  var b = dkBtn('Notify', { primary: true, onClick: function () { dkPublish(aid); } });
  var lab = b.querySelector('span');
  lab.textContent = '';
  lab.appendChild(document.createTextNode('Notify'));
  lab.appendChild(el('span', { class: 'dk-pub-to' }, ' ' + first));
  lab.appendChild(document.createTextNode(' · ' + n + (n === 1 ? ' edit' : ' edits')));
  b.setAttribute('aria-label', 'Notify ' + first + ' about ' + n + (n === 1 ? ' edit' : ' edits'));
  dkTip(b, 'Saved as you type: ' + first + ' already sees ' + (n === 1 ? 'it' : 'them') + '. Notify sends a heads-up about the ' + n + (n === 1 ? ' edit' : ' edits') + ' since the last one.');
  slot.appendChild(b);
}
// Exercises edited since the last heads-up carry a small ink mark until it goes out.
function dkPbMarkEdited() {
  var aid = dkPbAthleteId(), prog = dkProgOf(aid);
  var lines = document.querySelectorAll('#programArea .dk-bxv:not(.is-ro) .dk-bx[data-cell], #programArea .pg-grid-wrap td[data-cell]');
  if (!prog || !lines.length) return;
  var ch = {};
  dkPbChanges(prog).forEach(function (k) { ch[k] = 1; });
  lines.forEach(function (n) { n.classList.toggle('is-edited', !!ch[n.dataset.cell]); });
}
// buildProgramGrid's desk hooks (the grid is only drawn on a laptop as a past block now; kept so
// nothing that calls them breaks).
function deskGridEdited() { dkPbEdited(); }
function deskGridFit(table) {
  table = table || document.querySelector('#programArea .pg-grid');
  if (!table) return;
  table.querySelectorAll('td[data-cell]').forEach(function (td) { if (td.style.minWidth) td.style.minWidth = ''; });
}
function deskGridFocus(info) { dkBxFocus(info); }
// The empty program: bring a block in (the one action), or two quiet starts.
function deskBuilderEmpty(area, athleteId) {
  var a = (Store.get().athletes || []).find(function (x) { return x.id === athleteId; }) || { name: '' };
  var box = el('div', { class: 'dk-pbempty' });
  box.appendChild(el('h2', { class: 'dk-h2' }, 'No program for ' + _dkFirst(a.name) + ' yet'));
  box.appendChild(el('p', {}, 'Write the first block, or paste one you already have. It reads the way you write: 3x5 @8, 4x6 75%, 1x3 180. Every set ' + _dkFirst(a.name) + ' logs lands on it, live.'));
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn('Write a 4-week block', { primary: true, onClick: function () { dkBlankBlock(athleteId); } }));
  var me = _dkCoachMeId();
  var tpls = (Store.get().programTemplates || []).filter(function (t) { return t.coachId === me; });
  if (tpls.length) {
    var tb = dkBtn('Start from a template', { onClick: function () { dkAssignTemplate([athleteId], tb); } });
    acts.appendChild(tb);
  }
  acts.appendChild(dkBtn('Bring a block in', { cls: 'is-quiet', onClick: function () { openSheetImport(athleteId); } }));
  if (typeof openGoalModal === 'function') acts.appendChild(dkBtn('Build from a goal', { cls: 'is-quiet', onClick: function () { openGoalModal(athleteId); } }));
  box.appendChild(acts);
  area.appendChild(box);
}
function dkBlankBlock(athleteId) {
  var me = _dkCoachMeId();
  var prog = { id: uid('prog'), athleteId: athleteId, coachId: me, name: 'New block', startsOn: _monISO(todayISO()), weeks: [1, 2, 3, 4].map(function (n) { return newWeek(n, 3); }) };
  Store.update(function (s) { s.programs = s.programs.filter(function (p) { return p.athleteId !== athleteId; }).concat([prog]); });
  if (!window._demoMode) DB.upsertProgram(prog).catch(function (e) { console.error(e); toast('Could not save the program'); });
  try { activeWeekIdx = 0; } catch (e) {}
  _dk.pbWk = { prog: prog.id, wi: 0 };
  loadProgram();
  setTimeout(function () { var i = document.querySelector('#programArea .dk-bx-addin'); if (i) i.focus(); }, 0);
}

// ---------- the block's weeks: dates, now, the meet, a read of each ----------
// Week starts: one rule for the whole desk (app.js programStartsOn, the calendar's): the block's
// own start, else from its logs and the week the lifter is on, else back from its meet.
function dkPbStarts(prog) {
  var start = programStartsOn(prog, todayISO());
  return (prog.weeks || []).map(function (w, i) { return start ? _addDaysISO(start, 7 * i) : null; });
}
// The season against a meet, one line for the Meets screen: does the block take them there?
// The same sentence the roster calendar warns with (app.js calendarWarnings).
function deskMeetSeason(aid, dateIso) {
  var prog = dkProgOf(aid);
  if (!prog || !(prog.weeks || []).length) return 'No block written yet';
  var d = _isoDay(dateIso), starts = dkPbStarts(prog), last = starts[starts.length - 1];
  if (!last || !d) return '';
  var m = (Store.get().meets || []).find(function (x) { return x.athleteId === aid && _isoDay(x.date) === d; });
  var meet = (m && m.name) || 'the meet', name = prog.name || 'The block';
  var gap = Math.round((Date.parse(_monISO(d)) - Date.parse(last)) / 6048e5);
  var wk = function (n) { return n + (n === 1 ? ' week' : ' weeks'); };
  if (gap < 0) return name + ' runs ' + wk(-gap) + ' past ' + meet;
  if (gap === 0) return name + ' ends on ' + meet + ' week';
  return name + ' ends ' + wk(gap) + ' before ' + meet;
}
window.deskMeetSeason = deskMeetSeason;
// { now: the week they're in (-1 outside the block), sel: the week to open on }.
function dkPbNow(prog, starts) {
  var n = (prog.weeks || []).length;
  if (!n) return { now: -1, sel: 0 };
  var t = todayISO();
  if (starts[0]) {
    if (t < starts[0]) return { now: -1, sel: 0 };
    for (var i = 0; i < n; i++) if (t < _addDaysISO(starts[i], 7)) return { now: i, sel: i };
    return { now: -1, sel: n - 1 };
  }
  var rev = deskWeekReview(prog);
  if (rev.lastIdx < 0) return { now: 0, sel: 0 };
  var st = dkPbWeekStats(prog.weeks[rev.lastIdx]);
  var i2 = st.n && st.done >= st.n && rev.nextIdx >= 0 ? rev.nextIdx : rev.lastIdx;
  return { now: i2, sel: i2 };
}
function dkPbMeet(prog, aid) {
  var d = _isoDay(prog.meetDate), name = '';
  var r = aid ? dkRow(aid) : null;
  if (r && r.meet && r.meet.meet) {
    var md = _isoDay(r.meet.meet.date);
    if (!d || md === d) { d = d || md; name = r.meet.meet.name || ''; }
  }
  return d && d >= todayISO() ? { date: d, name: name || 'Meet' } : null;
}
function dkPbWeekStats(w) {
  var n = 0, done = 0, reps = 0, ton = 0, rpes = [], pcts = [], sessions = 0;
  ((w && w.days) || []).forEach(function (d) {
    if ((d.exercises || []).length) sessions++;
    (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) {
      if (s.extra) return;
      n++;
      if (s.completed) done++;
      var r = Number(s.plannedReps || s.reps) || 0;
      reps += r; ton += (Number(planWeight(s)) || 0) * r;
      if (s.rpe != null && s.rpe !== '') rpes.push(Number(s.rpeHi) > Number(s.rpe) ? (Number(s.rpe) + Number(s.rpeHi)) / 2 : Number(s.rpe));
      if (s.pct != null && s.pct !== '') pcts.push(Number(s.pct));
    }); });
  });
  var avg = function (a) { return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
  return { n: n, done: done, reps: reps, ton: ton, rpe: avg(rpes), pct: avg(pcts), sessions: sessions };
}
// The selected week of the open block (kept per block while the coach moves around).
function dkPbWeekIdx(prog) {
  prog = prog || dkProgOf(dkPbAthleteId());
  if (!prog || !(prog.weeks || []).length) return 0;
  var n = prog.weeks.length;
  if (!_dk.pbWk || _dk.pbWk.prog !== prog.id || _dk.pbWk.wi == null) _dk.pbWk = { prog: prog.id, wi: dkPbNow(prog, dkPbStarts(prog)).sel };
  _dk.pbWk.wi = Math.max(0, Math.min(n - 1, _dk.pbWk.wi));
  return _dk.pbWk.wi;
}

// ---------- the body: weeks, tools, the view ----------
// o: { aid, view, ro, prog (read-only blocks and templates), wi (their own selection) }.
function deskBuilderBody(prog, aid, view) {
  var box = el('div', { class: 'dk-bxv' });
  box._o = { aid: aid, view: view === 'progress' ? 'progress' : 'sessions', ro: false };
  dkBxFill(box);
  return box;
}
// A block nobody edits here (a template, a past block): the same weeks and cards, read-only.
function dkBlockView(prog, aid) {
  var box = el('div', { class: 'dk-bxv is-ro' });
  box._o = { aid: aid || null, view: 'sessions', ro: true, prog: prog, wi: 0 };
  dkBxFill(box);
  return box;
}
function dkBxProg(o) { return o.ro ? o.prog : dkProgOf(o.aid); }
function dkBxFill(box) {
  var o = box._o, prog = dkBxProg(o);
  box.innerHTML = '';
  if (!prog || !(prog.weeks || []).length) {
    box.appendChild(el('p', { class: 'dk-quiet-p' }, o.ro ? 'Nothing written in this block.' : 'No weeks yet.'));
    if (!o.ro) box.appendChild(dkBtn('Add a week', { icon: DK_IC.plus, onClick: function () { addWeek(); } }));
    return;
  }
  var starts = dkPbStarts(prog), now = o.ro ? { now: -1, sel: 0 } : dkPbNow(prog, starts);
  var wi = o.ro ? Math.min(o.wi || 0, prog.weeks.length - 1) : dkPbWeekIdx(prog);
  var meet = o.ro ? null : dkPbMeet(prog, o.aid);
  box.appendChild(dkBxTimeline(box, prog, starts, wi, now.now, meet));
  if (!o.ro) box.appendChild(dkBxTools(box, prog, wi));
  box.appendChild(o.view === 'progress' ? dkPgView(box, prog, starts, wi, now.now, meet) : dkBxWeek(box, prog, wi));
  if (!o.ro) setTimeout(function () { dkPaintPbHead(); dkPbMarkEdited(); }, 0);
}
function dkBxPick(box, wi, opts) {
  var o = box._o, prog = dkBxProg(o);
  if (!prog) return;
  wi = Math.max(0, Math.min(prog.weeks.length - 1, wi));
  if (o.ro) o.wi = wi; else { _dk.pbWk = { prog: prog.id, wi: wi }; try { activeWeekIdx = wi; } catch (e) {} }
  var hadTab = document.activeElement && document.activeElement.closest && document.activeElement.closest('.dk-tl');
  var sc = box.closest('#programArea'), top = sc ? sc.scrollTop : 0;
  dkBxFill(box);
  if (sc) sc.scrollTop = Math.min(top, sc.scrollHeight);
  if (hadTab || (opts && opts.focusTab)) { var t = box.querySelector('.dk-tl-wk.is-sel'); if (t) t.focus({ preventScroll: true }); }
  if (!o.ro && _dk.pbInfo && _dk.pbInfo.wi !== wi) { _dk.pbInfo = null; dkSyncCtx(); }
}
function dkBxStep(step) {
  var box = _dkVis('#programArea .dk-bxv:not(.is-ro)');
  if (!box) return;
  dkBxPick(box, dkPbWeekIdx() + step);
}
// The block as weeks: a strip of tabs, each with its dates, the meet's W-n, a volume bar (the
// logged part in ink) and the week's average RPE. Arrow keys move along it.
function dkBxTimeline(box, prog, starts, wi, now, meet) {
  var o = box._o;
  var strip = el('div', { class: 'dk-tl', role: 'tablist', 'aria-label': 'Weeks of ' + (prog.name || 'the block') });
  var stats = prog.weeks.map(dkPbWeekStats);
  // Volume per week (tonnage, or sets when nothing is loaded), drawn from 40% at the block's lightest
  // week to full at its biggest, so the bars show how the block moves; the logged part in ink inside.
  var volOf = function (s) { return s.ton > 0 ? s.ton : s.n; };
  var vols = stats.map(volOf), vMax = Math.max.apply(null, vols.concat([1])), vMin = Math.min.apply(null, vols.filter(function (v) { return v > 0; }).concat([vMax]));
  var volPct = function (v) { return v <= 0 ? 0 : vMax === vMin ? 100 : 40 + (v - vMin) / (vMax - vMin) * 60; };
  var meetMon = meet ? _monISO(meet.date) : null;
  var unit = unitLabel();
  prog.weeks.forEach(function (w, i) {
    var st = stats[i], on = i === wi, wn = w.number || i + 1;
    var b = el('button', { type: 'button', class: 'dk-tl-wk' + (on ? ' is-sel' : '') + (i === now ? ' is-now' : ''), role: 'tab', 'aria-selected': String(on), tabindex: on ? '0' : '-1' });
    var top = el('span', { class: 'dk-tl-top' });
    top.appendChild(el('b', {}, 'Week ' + wn));
    if (i === now) top.appendChild(el('span', { class: 'dk-tl-now' }, 'Now'));
    else if (st.n && st.done >= st.n) top.appendChild(el('i', { class: 'dk-dot t-ok', 'aria-hidden': 'true' }));
    b.appendChild(top);
    var sub = el('span', { class: 'dk-tl-sub' });
    sub.appendChild(el('span', {}, starts[i] ? fmtDateShort(starts[i]) : st.sessions + (st.sessions === 1 ? ' session' : ' sessions')));
    var wout = meetMon && starts[i] ? Math.round((Date.parse(meetMon) - Date.parse(starts[i])) / 6048e5) : null;
    if (wout != null && wout >= 0 && wout <= 24) sub.appendChild(el('span', { class: 'dk-tl-meet' }, wout === 0 ? 'Meet' : 'W-' + wout));
    b.appendChild(sub);
    var rd = el('span', { class: 'dk-tl-read', 'aria-hidden': 'true' });
    var bar = el('span', { class: 'dk-tl-vol' });
    var vp = volPct(vols[i]);
    var v = el('i', { class: 'dk-tl-v' }); v.style.width = vp.toFixed(1) + '%'; bar.appendChild(v);
    if (st.done) { var dn = el('i', { class: 'dk-tl-d' }); dn.style.width = (vp * Math.min(1, st.done / (st.n || 1))).toFixed(1) + '%'; bar.appendChild(dn); }
    rd.appendChild(bar);
    var intTxt = st.rpe != null ? '@' + _num(Math.round(st.rpe * 10) / 10) : st.pct != null ? Math.round(st.pct) + '%' : '';
    rd.appendChild(el('span', { class: 'dk-tl-int' }, intTxt));
    b.appendChild(rd);
    var ton = kgToDisplay(st.ton), tonTxt = ton >= 1000 ? _num(Math.round(ton / 100) / 10) + (unit === 'lb' ? 'k lb' : ' t') : Math.round(ton) + ' ' + unit;
    var said = 'Week ' + wn + (starts[i] ? ', from ' + fmtDateShort(starts[i]) : '') + (i === now ? ', this week' : '') + ': ' + st.n + (st.n === 1 ? ' set' : ' sets') + (st.reps ? ', ' + st.reps + ' reps' : '') + (st.ton > 0 ? ', ' + tonTxt : '') +
      (st.rpe != null ? ', average @' + _num(Math.round(st.rpe * 10) / 10) : '') + (st.done ? ', ' + st.done + ' logged' : '') + (wout != null && wout >= 0 && wout <= 24 ? (wout ? ', ' + wout + (wout === 1 ? ' week' : ' weeks') + ' out from ' + meet.name : ', ' + meet.name + ' week') : '');
    b.setAttribute('aria-label', said);
    dkTip(b, said.replace(/^Week \d+(, from [^,:]+)?(, this week)?: /, ''));
    b.addEventListener('click', function () { if (!on) dkBxPick(box, i, { focusTab: true }); });
    strip.appendChild(b);
  });
  strip.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k !== 'ArrowLeft' && k !== 'ArrowRight' && k !== 'Home' && k !== 'End') return;
    e.preventDefault();
    var n = prog.weeks.length;
    dkBxPick(box, k === 'Home' ? 0 : k === 'End' ? n - 1 : wi + (k === 'ArrowRight' ? 1 : -1), { focusTab: true });
  });
  var lastEnd = starts[starts.length - 1] ? _addDaysISO(starts[starts.length - 1], 7) : null;
  if (meet && lastEnd && meet.date >= lastEnd) {
    var mOut = Math.round((Date.parse(meetMon) - Date.parse(starts[starts.length - 1])) / 6048e5);
    // The weeks between the block's end and the meet, said plainly: nothing is written there yet.
    var gap = mOut - 1, lastN = prog.weeks[prog.weeks.length - 1].number || prog.weeks.length;
    if (gap >= 1) {
      var un = el('div', { class: 'dk-tl-gap' });
      un.appendChild(el('b', {}, gap === 1 ? 'Week ' + (lastN + 1) : 'Weeks ' + (lastN + 1) + '–' + (lastN + gap)));
      un.appendChild(el('span', {}, gap + (gap === 1 ? ' week' : ' weeks') + ' not written'));
      if (!o.ro && typeof openNextBlockSheet === 'function') {
        var wb = el('button', { type: 'button', class: 'dk-link dk-tl-gap-go' }, gap === 1 ? 'Write it' : 'Write them');
        wb.addEventListener('click', function () { openNextBlockSheet(prog.id, o.aid); });
        un.appendChild(wb);
      }
      strip.appendChild(un);
    }
    var end = el('div', { class: 'dk-tl-end' });
    end.insertAdjacentHTML('beforeend', DK_IC.club);
    end.appendChild(el('b', {}, meet.name));
    end.appendChild(el('span', {}, fmtDateShort(meet.date)));
    dkTip(end, meet.name + ' is ' + mOut + (mOut === 1 ? ' week' : ' weeks') + ' after week ' + (prog.weeks[prog.weeks.length - 1].number || prog.weeks.length) + '. Add the weeks that take them there');
    strip.appendChild(end);
  }
  if (!o.ro) {
    var add = el('button', { type: 'button', class: 'dk-tl-add', 'aria-label': 'Add a week', html: DK_IC.plus });
    dkTip(add, 'Add a week');
    add.addEventListener('click', function () { dkPbAddWeek(o.aid); });
    strip.appendChild(add);
  }
  return strip;
}
function dkPbAddWeek(aid) {
  var prog = dkProgOf(aid);
  if (!prog) return;
  dkPbRemember(prog, 'Add a week');
  Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) { var num = (p.weeks.length ? p.weeks[p.weeks.length - 1].number || p.weeks.length : 0) + 1; p.weeks.push(newWeek(num, 3)); } });
  persistProgram(prog.id);
  _dk.pbWk = { prog: prog.id, wi: dkProgOf(aid).weeks.length - 1 };
  loadProgram();
}

// ---------- the tools: one quiet bar ----------
function dkBxTools(box, prog, wi) {
  var o = box._o, aid = o.aid, wn = prog.weeks[wi].number || wi + 1;
  var a = (Store.get().athletes || []).find(function (x) { return x.id === aid; }) || { name: '' };
  var bar = el('div', { class: 'dk-pbtools', role: 'toolbar', 'aria-label': 'Block tools' });
  var menuBtn = function (label, icon, tip, kbd, items) {
    var b = dkBtn(label, { icon: icon, cls: 'is-quiet dk-btn-menu', title: tip, kbd: kbd });
    b.insertAdjacentHTML('beforeend', '<span class="dk-btn-caret">' + DK_IC.chevD + '</span>');
    b.setAttribute('aria-haspopup', 'menu');
    b.setAttribute('aria-expanded', 'false');
    b.addEventListener('click', function (e) { e.stopPropagation(); dkPopMenu(b, items()); });
    return b;
  };
  var last = prog.weeks.length - 1;
  bar.appendChild(menuBtn('Progress the block', DK_IC.up, 'Week ' + wn + ' moved on a step each week after it', null, function () {
    if (wi >= last) return [{ node: el('div', { class: 'dk-menu-title', role: 'presentation' }, 'Week ' + wn + ' is the last week. Add a week to progress into') }];
    return [{ node: el('div', { class: 'dk-menu-title', role: 'presentation' }, 'From week ' + wn + ', each week after it') }].concat(dkPbKinds().map(function (k) {
      return { label: k[1], hint: k[2], run: function () { dkPbProgress(aid, wi, null, k[0]); } };
    }));
  }));
  bar.appendChild(menuBtn('Copy week', DK_IC.copy, 'Copy week ' + wn + ' into another week', null, function () {
    var p = dkProgOf(aid), items = [{ node: el('div', { class: 'dk-menu-title', role: 'presentation' }, 'Copy week ' + wn + ' to') }];
    p.weeks.forEach(function (w, j) {
      if (j === wi) return;
      var lg = dkPbWeekStats(w).done > 0;
      items.push({ label: 'Week ' + (w.number || j + 1), hint: lg ? 'Logged' : '', run: function () { if (lg) { toast('Week ' + (w.number || j + 1) + ' has logged sets: what they lifted stays'); return; } dkPbCopyWeek(aid, wi, [j]); } });
    });
    var after = p.weeks.map(function (w, j) { return j; }).filter(function (j) { return j > wi && !dkPbWeekStats(p.weeks[j]).done; });
    if (after.length > 1) items.push('-', { label: 'Every week after it', hint: after.length + ' weeks', run: function () { dkPbCopyWeek(aid, wi, after); } });
    items.push('-', { label: 'A new week at the end', run: function () { dkPbRemember(p, 'Copy week ' + wn); _dk.pbWk = { prog: p.id, wi: p.weeks.length }; duplicateWeekAction(p.id, wi); } });
    return items;
  }));
  var tplBtn = menuBtn('Templates', DK_IC.layers, 'Save this block as a template, or start from one', null, function () {
    var p = dkProgOf(aid), items = [{ label: 'Save as a template…', run: function () { openSaveTemplate(p); } }];
    var me = _dkCoachMeId();
    if ((Store.get().programTemplates || []).some(function (t) { return t.coachId === me; })) items.push({ label: 'Start from a template…', run: function () { dkAssignTemplate([aid], tplBtn); } });
    items.push({ label: 'Replace with an imported block…', run: function () { openSheetImport(aid); } });
    return items;
  });
  bar.appendChild(tplBtn);
  // TEAM PROGRAMS (M4): their team's page, or a team made from this block (desk-season.js).
  if (typeof window.deskBuilderTeam === 'function') {
    var onTeam = typeof dsTeamOf === 'function' && dsTeamOf(aid);
    var team = dkBtn(onTeam ? onTeam.name || 'Team' : 'Make a team', { icon: DK_IC.roster, cls: 'is-quiet', title: onTeam ? 'Open the team: every lifter’s loads, and push' : 'Make this block a team program: every lifter on their own loads' });
    team.addEventListener('click', function () { window.deskBuilderTeam(aid); });
    bar.appendChild(team);
  }
  var undo = dkIconBtn(DK_IC.undo, 'Undo', function () { dkPbUndo(); }, _dkMac() ? '⌘Z' : 'Ctrl Z');
  undo.classList.add('dk-pb-undo');
  bar.appendChild(undo);
  bar.appendChild(el('span', { class: 'dk-pbtools-gap' }));
  bar.appendChild(el('span', { class: 'dk-pbpub', 'data-aid': aid, 'data-first': _dkFirst(a.name) }));
  setTimeout(dkPbPaintUndo, 0);
  return bar;
}
// The steps a block can move on by, each week after the one it starts from.
function dkPbKinds() {
  var lbs = getUnit() === 'lbs';
  return [['kg1', '+' + (lbs ? '5 lb' : '2.5 kg') + ' a week', 'Loads'], ['kg2', '+' + (lbs ? '10 lb' : '5 kg') + ' a week', 'Loads'], ['rpe', '+0.5 RPE a week', 'RPE'], ['pct', '+2.5% a week', '% sets'], ['same', 'The same each week', 'All']];
}
// Base sets moved on k weeks (the fill the grid had, now behind "Progress the block").
function dkPbStep(base, kind, k, maxKg) {
  var stepKg = getUnit() === 'lbs' ? 5 * KG_PER_LB : 2.5;
  return base.map(function (b) {
    var n = Object.assign({}, b, { id: uid('set'), completed: false, actualRpe: null, completedAt: null });
    if ((kind === 'kg1' || kind === 'kg2') && n.pct == null && n.weight > 0) {
      var add = k * stepKg * (kind === 'kg2' ? 2 : 1);
      n.weight = Math.round((n.weight + add) * 100) / 100;
      if (n.weightHi > 0) n.weightHi = Math.round((n.weightHi + add) * 100) / 100;
    }
    if (kind === 'pct' && n.pct != null) {
      n.pct = Math.round((n.pct + 2.5 * k) * 10) / 10; n.weight = maxKg ? pctLoadKg(n.pct, maxKg) : 0;
      if (n.pctHi != null) { n.pctHi = Math.round((n.pctHi + 2.5 * k) * 10) / 10; n.weightHi = maxKg ? pctLoadKg(n.pctHi, maxKg) : 0; }
    }
    if (kind === 'rpe' && n.rpe != null) {
      n.rpe = Math.min(10, n.rpe + 0.5 * k);
      if (n.rpeHi != null) { n.rpeHi = Math.min(10, n.rpeHi + 0.5 * k); if (n.rpeHi <= n.rpe) delete n.rpeHi; }
    }
    return n;
  });
}
function _dkPbFits(base, kind) {
  if (kind === 'same') return true;
  if (kind === 'pct') return base.some(function (x) { return x.pct != null; });
  if (kind === 'rpe') return base.some(function (x) { return x.rpe != null; });
  return base.some(function (x) { return x.pct == null && x.weight > 0; });
}
// The same exercise in another week: at its place, else the same lift and variant in that day.
function _dkPbMatch(day, src, ei) {
  var same = function (e) { return !!e && e.lift === src.lift && (e.variant || '') === (src.variant || '') && String(e.exerciseName || '') === String(src.exerciseName || ''); };
  var ex = (day.exercises || [])[ei];
  if (same(ex)) return ei;
  return (day.exercises || []).findIndex(same);
}
// Progress the block: week wi moved on a step into each week after it, for every exercise (only)
// where the step applies, or for one exercise ({ di, ei }). A logged exercise is never rewritten.
function dkPbProgress(aid, wi, only, kind) {
  var prog = dkProgOf(aid);
  if (!prog || wi >= prog.weeks.length - 1) { toast('No weeks after this one to progress into'); return; }
  var src = prog.weeks[wi], pos = [];
  src.days.forEach(function (d, di) { d.exercises.forEach(function (e, ei) { if (!only || (only.di === di && only.ei === ei)) pos.push([di, ei]); }); });
  var plan = pos.map(function (p) {
    var ex = src.days[p[0]].exercises[p[1]];
    var base = gridParseCell(gridCellText(ex), aid, ex.lift, prog) || [];
    return { di: p[0], ei: p[1], ex: ex, base: base };
  }).filter(function (x) { return x.base.length && _dkPbFits(x.base, kind); });
  if (!plan.length) { toast(kind === 'pct' ? 'Nothing written as a % here. Try a load step' : kind === 'rpe' ? 'Nothing written with an RPE here' : 'Nothing with a load here. Try +0.5 RPE or +2.5%'); return; }
  dkPbRemember(prog, 'Progress the block');
  var wrote = 0, kept = 0, weeks = {};
  Store.update(function (s) {
    var p = s.programs.find(function (x) { return x.id === prog.id; });
    if (!p) return;
    plan.forEach(function (x) {
      var maxKg = MAIN_LIFTS.indexOf(x.ex.lift) >= 0 ? programMaxKg(p, aid, x.ex.lift) : 0;
      for (var w = wi + 1; w < p.weeks.length; w++) {
        var tw = p.weeks[w];
        while (tw.days.length <= x.di) tw.days.push({ id: uid('day'), name: (src.days[tw.days.length] || {}).name || 'Day ' + (tw.days.length + 1), exercises: [] });
        var day = tw.days[x.di], at = _dkPbMatch(day, x.ex, x.ei), tgt = at >= 0 ? day.exercises[at] : null;
        if (tgt && (tgt.sets || []).some(function (st) { return st.completed; })) { kept++; continue; }
        if (!tgt) { tgt = newExercise(x.ex.lift, x.ex.variant, x.ex.exerciseName); tgt.note = x.ex.note || ''; day.exercises.splice(Math.min(x.ei, day.exercises.length), 0, tgt); }
        tgt.sets = dkPbStep(x.base, kind, w - wi, maxKg).map(function (st) { delete st.srcId; return st; });
        // A team program's exercise progressed for this lifter is theirs: the next team push asks.
        if (tgt.srcId != null) tgt.ovr = true;
        wrote++; weeks[w] = 1;
      }
    });
  });
  persistProgram(prog.id);
  var nw = Object.keys(weeks).length;
  dkPbAfterBulk(Object.keys(weeks).map(Number));
  toast(wrote ? (plan.length === 1 ? exTitle(plan[0].ex) : plan.length + ' exercises') + ' through ' + nw + (nw === 1 ? ' week' : ' weeks') + (kept ? ' (' + kept + ' logged, kept)' : '') + '. ' + (_dkMac() ? '⌘Z' : 'Ctrl Z') + ' undoes it' : 'Every week after it is logged: nothing changed');
}
// Copy a week's sessions into other weeks (fresh ids, nothing logged, the plan's loads).
function dkPbCopyWeek(aid, from, to) {
  var prog = dkProgOf(aid);
  if (!prog) return;
  var wn = prog.weeks[from].number || from + 1;
  dkPbRemember(prog, 'Copy week ' + wn);
  Store.update(function (s) {
    var p = s.programs.find(function (x) { return x.id === prog.id; });
    if (!p) return;
    var srcW = p.weeks[from];
    to.forEach(function (j) {
      var tw = p.weeks[j];
      if (!tw || tw.days.some(function (d) { return d.exercises.some(function (e) { return e.sets.some(function (st) { return st.completed; }); }); })) return;
      tw.days = deskCopyWeekDays(srcW.days, tw.days);
    });
  });
  persistProgram(prog.id);
  dkPbAfterBulk(to);
  toast('Week ' + wn + ' copied to ' + (to.length === 1 ? 'week ' + (prog.weeks[to[0]].number || to[0] + 1) : to.length + ' weeks') + '. ' + (_dkMac() ? '⌘Z' : 'Ctrl Z') + ' undoes it');
}
// After a change to several weeks: repaint, and the weeks that changed light up once in the strip.
function dkPbAfterBulk(wis) {
  var box = _dkVis('#programArea .dk-bxv:not(.is-ro)');
  if (box) { var sc = document.getElementById('programArea'), top = sc ? sc.scrollTop : 0; dkBxFill(box); if (sc) sc.scrollTop = top; }
  dkPbEdited({ keepBody: true });
  if (!box || _dkReduced()) return;
  var tabs = box.querySelectorAll('.dk-tl-wk');
  (wis || []).forEach(function (j) { var t = tabs[j]; if (t && t.animate) t.animate([{ boxShadow: 'inset 0 0 0 1.5px var(--text)' }, { boxShadow: 'inset 0 0 0 1.5px transparent' }], { duration: 900, easing: 'ease-out' }); });
}

// ---------- undo: the block as it was before each change ----------
// A snapshot per change; it only goes back if nothing was logged in between (what the athlete
// lifted is never undone by the coach's ⌘Z).
function _dkPbLoggedSig(weeks) {
  var out = [];
  (weeks || []).forEach(function (w) { (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (s) { if (s.completed || s.skipped || s.missed) out.push(s.id + ':' + s.weight + 'x' + s.reps + '@' + s.actualRpe + (s.skipped ? 's' : '') + (s.missed ? 'm' : '')); }); }); }); });
  return out.sort().join('|');
}
function dkPbRemember(prog, label) {
  if (!prog) return;
  _dk.pbUndo = _dk.pbUndo || [];
  _dk.pbUndo.push({ id: prog.id, weeks: JSON.stringify(prog.weeks), name: prog.name, label: label || 'Edit' });
  if (_dk.pbUndo.length > 60) _dk.pbUndo.shift();
  dkPbPaintUndo();
}
function dkPbPaintUndo() {
  var b = document.querySelector('#programArea .dk-pb-undo');
  if (!b) return;
  var prog = dkProgOf(dkPbAthleteId());
  var top = (_dk.pbUndo || []).filter(function (u) { return prog && u.id === prog.id; }).pop();
  b.disabled = !top;
  dkTip(b, top ? 'Undo: ' + top.label : 'Nothing to undo', _dkMac() ? '⌘Z' : 'Ctrl Z');
}
function dkPbUndo() {
  var prog = dkProgOf(dkPbAthleteId());
  var stack = _dk.pbUndo || [], i = -1;
  for (var j = stack.length - 1; j >= 0; j--) if (prog && stack[j].id === prog.id) { i = j; break; }
  if (i < 0) { toast('Nothing to undo'); return; }
  var u = stack.splice(i, 1)[0];
  var old = JSON.parse(u.weeks);
  if (_dkPbLoggedSig(old) !== _dkPbLoggedSig(prog.weeks)) { toast('Sets were logged since then, so that stays as it is'); dkPbPaintUndo(); return; }
  Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) p.weeks = old; });
  persistProgram(prog.id);
  var n = dkProgOf(dkPbAthleteId()).weeks.length;
  if (_dk.pbWk && _dk.pbWk.prog === prog.id && _dk.pbWk.wi >= n) _dk.pbWk.wi = n - 1;
  loadProgram();
  toast('Undone: ' + u.label);
}

// ---------- the week: one card per session ----------
function dkBxWeek(box, prog, wi) {
  var o = box._o, W = prog.weeks[wi];
  var logged = W.days.some(function (d) { return d.exercises.some(function (e) { return e.sets.some(function (s) { return s.completed || s.skipped || s.missed; }); }); });
  var wrap = el('div', { class: 'dk-bx-wk' + (logged ? ' has-lifted' : '') });
  if (logged) {
    // The key, once: the line is what was written, a bar is a set, colour only where it went off.
    var key = el('div', { class: 'dk-wk-key dk-bx-key', 'aria-hidden': 'true' });
    key.appendChild(el('span', {}, el('i', { class: 'dk-key-line' }), 'Written RPE'));
    [['on', 'Each set lifted'], ['warn', 'Over'], ['alert', '1+ over'], ['cool', 'Under']].forEach(function (x) { key.appendChild(el('span', {}, el('i', { class: 'dk-key-bar t-' + x[0] }), x[1])); });
    wrap.appendChild(key);
  }
  var days = el('div', { class: 'dk-bx-days' });
  W.days.forEach(function (d, di) { days.appendChild(dkBxDay(box, prog, wi, di, logged)); });
  wrap.appendChild(days);
  if (!W.days.length) wrap.appendChild(el('p', { class: 'dk-quiet-p' }, 'Week ' + (W.number || wi + 1) + ' has no sessions yet.'));
  if (!o.ro) {
    var add = el('div', { class: 'dk-bx-adddays' });
    add.appendChild(dkBtn('Training day', { icon: DK_IC.plus, cls: 'is-quiet', onClick: function () { dkPbRemember(dkProgOf(o.aid), 'Add a day'); addDay(wi); } }));
    add.appendChild(dkBtn('Rest day', { icon: DK_IC.plus, cls: 'is-quiet', onClick: function () { dkPbRemember(dkProgOf(o.aid), 'Add a rest day'); addRestDay(wi); } }));
    wrap.appendChild(add);
  }
  return wrap;
}
function _dkLiveSet(s) { var t = Date.parse(s.completedAt); return s.completed && String(s.completedAt).indexOf('T') > 0 && Date.now() - t <= 30 * 60000; }
function dkBxDay(box, prog, wi, di, logged) {
  var o = box._o, D = prog.weeks[wi].days[di], exs = D.exercises || [];
  var rest = !exs.length && /\b(rest|off|recovery)\b/i.test(D.name || '');
  var ds = dkDayState(prog, wi, di), date = dkSessDate(D);
  var live = !o.ro && exs.some(function (e) { return (e.sets || []).some(_dkLiveSet); });
  var card = el('article', { class: 'dk-bxd' + (rest ? ' is-rest' : '') + (live ? ' is-live' : ''), 'data-di': String(di), 'aria-label': D.name || 'Day ' + (di + 1) });
  var head = el('header', { class: 'dk-bxd-head' });
  var tone = live ? 'live' : ds ? ds.tone : 'todo';
  // The state dot's slot is always there (hollow for a day still to come), so every title starts on one line.
  head.appendChild(el('i', { class: 'dk-dot t-' + (ds && tone !== 'todo' ? ({ done: 'ok', live: 'live', miss: 'alert', part: 'warn' }[tone] || 'none') : rest ? 'blank' : 'none'), 'aria-hidden': 'true' }));
  if (o.ro) head.appendChild(el('h3', { class: 'dk-bxd-title' }, D.name || 'Day ' + (di + 1)));
  else {
    var nm = el('input', { type: 'text', class: 'dk-bxd-name', 'aria-label': 'Session name', spellcheck: 'false', maxlength: '60' });
    nm.value = D.name || '';
    nm.placeholder = 'Day ' + (di + 1);
    nm.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); if (e.key === 'Escape') nm.value = D.name || ''; nm.blur(); } });
    nm.addEventListener('change', function () { dkPbRemember(dkProgOf(o.aid), 'Rename ' + (D.name || 'the day')); updateDayName(wi, di, nm.value.trim()); dkPbEdited({ keepBody: true }); });
    head.appendChild(nm);
  }
  var sets = exs.reduce(function (n, e) { return n + (e.sets || []).filter(function (s) { return !s.extra; }).length; }, 0);
  var bits = [];
  if (rest) bits.push('No training');
  else if (!exs.length) bits.push('Nothing written yet');
  else bits.push(exs.length + (exs.length === 1 ? ' exercise' : ' exercises') + ' · ' + sets + (sets === 1 ? ' set' : ' sets'));
  if (live) bits.push('Lifting now');
  else if (ds && ds.tone !== 'todo') bits.push(ds.text);
  if (date) bits.push(dkDayLabel(date));
  head.appendChild(el('span', { class: 'dk-bxd-meta' }, bits.join(' · ')));
  if (!o.ro) {
    var more = el('button', { type: 'button', class: 'dk-icon-btn dk-bxd-more', 'aria-label': (D.name || 'Day') + ' options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: DK_IC.more });
    more.addEventListener('click', function (e) { e.stopPropagation(); dkPopMenu(more, dkBxDayMenu(o.aid, wi, di), { alignRight: true }); });
    head.appendChild(more);
  }
  card.appendChild(head);
  exs.forEach(function (ex, ei) { card.appendChild(dkBxLine(box, prog, wi, di, ei, logged)); });
  if (!o.ro && !rest) card.appendChild(dkBxAddRow(box, wi, di));
  return card;
}
function dkBxDayMenu(aid, wi, di) {
  var prog = dkProgOf(aid), W = prog.weeks[wi], D = W.days[di];
  var lg = D.exercises.some(function (e) { return e.sets.some(function (s) { return s.completed; }); });
  var items = [];
  if (di > 0) items.push({ label: 'Move up', run: function () { dkPbRemember(dkProgOf(aid), 'Move ' + (D.name || 'the day')); reorderDay(prog.id, wi, di, -1); persistProgram(prog.id); dkPbAfterBulk([]); } });
  if (di < W.days.length - 1) items.push({ label: 'Move down', run: function () { dkPbRemember(dkProgOf(aid), 'Move ' + (D.name || 'the day')); reorderDay(prog.id, wi, di, 1); persistProgram(prog.id); dkPbAfterBulk([]); } });
  items.push({ label: 'Duplicate', run: function () { dkPbRemember(dkProgOf(aid), 'Duplicate ' + (D.name || 'the day')); duplicateDay(prog.id, wi, di); persistProgram(prog.id); dkPbAfterBulk([]); } });
  items.push({ label: 'Add an exercise…', hint: 'Full form', run: function () { dkPbRemember(dkProgOf(aid), 'Add an exercise'); openAddExercise(wi, di); } });
  items.push('-', { label: 'Remove this day', danger: true, run: function () {
    if (lg && !confirm('This day has logged sets. Remove it anyway? Undo brings it back.')) return;
    dkPbRemember(dkProgOf(aid), 'Remove ' + (D.name || 'the day'));
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) p.weeks[wi].days.splice(di, 1); });
    persistProgram(prog.id); dkPbAfterBulk([]);
    toast((D.name || 'Day') + ' removed. ' + (_dkMac() ? '⌘Z' : 'Ctrl Z') + ' brings it back');
  } });
  return items;
}
// A load from the lifter's max for an RPE-only block ("1x3 @8" → about 180): the same rule a new
// exercise's starting load uses (suggestNewLoad).
function _dkBxEstKg(prog, aid, ex, g) {
  if (!aid || MAIN_LIFTS.indexOf(ex.lift) < 0 || g.rpe == null || g.rpe === '' || !(Number(g.reps) > 0)) return 0;
  var mx = programMaxKg(prog, aid, ex.lift);
  if (!(mx > 0)) return 0;
  var step = loadStepKg(getUnit() === 'lbs' ? 'lbs' : 'kg');
  var top = Number(g.rpeHi) > Number(g.rpe) ? Number(g.rpeHi) : Number(g.rpe);
  return Math.round(mx / multiplierFor(ex.lift, ex.variant || 'Competition') * rpeLoadPct(g.reps, top) / step) * step;
}
// What's written, drawn: count×reps quiet, the load in ink (a % with its worked-out load beside it,
// an RPE-only block with the load its max points to), the effort, then the set fields small.
function dkBxRich(ex, prog, aid) {
  var d = el('div', { class: 'dk-bx-disp', 'aria-hidden': 'true' });
  var groups = groupSets(_deskPlanSets(ex));
  if (!groups.length) { d.appendChild(el('span', { class: 'dk-bx-none' }, 'Write the sets, like 3x5 @8')); return d; }
  groups.forEach(function (g) {
    var gs = el('span', { class: 'dk-bx-g' });
    gs.appendChild(el('span', { class: 'dk-bx-sr' }, g.count + '×' + g.reps));
    if (g.pct != null) {
      gs.appendChild(el('b', {}, _num(g.pct) + (Number(g.pctHi) > Number(g.pct) ? '–' + _num(g.pctHi) : '') + '%'));
      if (Number(g.weight) > 0) {
        var wk = el('span', { class: 'dk-bx-kg' }, _num(kgToDisplay(g.weight)) + (Number(g.weightHi) > Number(g.weight) ? '–' + _num(kgToDisplay(g.weightHi)) : ''));
        dkTip(wk, 'Worked out from their max: ' + _num(kgToDisplay(g.weight)) + ' ' + unitLabel());
        gs.appendChild(wk);
      }
    } else if (Number(g.weight) > 0) gs.appendChild(el('b', {}, _num(kgToDisplay(g.weight)) + (Number(g.weightHi) > Number(g.weight) ? '–' + _num(kgToDisplay(g.weightHi)) : '')));
    else {
      var e = _dkBxEstKg(prog, aid, ex, g);
      if (e > 0) { var es = el('span', { class: 'dk-bx-kg is-est' }, '≈' + _num(kgToDisplay(e))); dkTip(es, 'About ' + _num(kgToDisplay(e)) + ' ' + unitLabel() + ' from their max, for ' + g.reps + (g.rpe != null ? ' @' + effortInputText(g, false) : '')); gs.appendChild(es); }
    }
    if (g.rpe != null && g.rpe !== '') gs.appendChild(el('span', { class: 'dk-bx-rp' }, g.rir ? effortInputText(g, true) + ' RIR' : '@' + effortInputText(g, false)));
    var fx = typeof setFieldsShort === 'function' ? setFieldsShort(g) : '';
    if (fx) gs.appendChild(el('span', { class: 'dk-bx-fx' }, fx));
    d.appendChild(gs);
  });
  return d;
}
// What they lifted, on the same line: every set as a bar against the written RPE (per block), the
// top set in ink, the gap word only when off.
function dkBxLifted(ex) {
  var got = el('div', { class: 'dk-bx-got' });
  var sets = ex.sets || [];
  if (!sets.some(function (s) { return s.completed || s.skipped || s.missed; })) return got;
  var groups = groupSets(_deskPlanSets(ex));
  var bars = el('span', { class: 'dk-bx-bars' });
  var top = null, topG = null;
  groups.forEach(function (g) {
    var gsets = sets.slice(g.startIdx, g.startIdx + g.count);
    bars.appendChild(dkSetBars(gsets, g));
    gsets.forEach(function (s) { if (s.completed && (!top || (Number(s.weight) || 0) > (Number(top.weight) || 0) || ((Number(s.weight) || 0) === (Number(top.weight) || 0) && (Number(s.actualRpe) || 0) > (Number(top.actualRpe) || 0)))) { top = s; topG = g; } });
  });
  got.appendChild(bars);
  if (top) {
    var done = sets.filter(function (s) { return s.completed; }).length;
    got.appendChild(dkLoggedRich({ weight: Number(top.weight) || 0, reps: Number(top.reps) || 0, rpe: top.actualRpe != null && top.actualRpe !== '' ? Number(top.actualRpe) : null, n: done, of: sets.length }));
    var gap = _dkSetGap(top, topG), tn = _dkGapCls(gap);
    if (gap != null && tn !== 'on') { var gp = el('span', { class: 'dk-gap t-' + tn }, dkGapText(gap)); dkTip(gp, 'Top set RPE ' + (gap > 0 ? 'over' : 'under') + ' what was written'); got.appendChild(gp); }
  } else got.appendChild(el('span', { class: 'dk-dim' }, sets.some(function (s) { return s.skipped; }) ? 'Skipped' : 'Missed'));
  return got;
}
function dkBxLine(box, prog, wi, di, ei, wkLogged) {
  var o = box._o, ex = prog.weeks[wi].days[di].exercises[ei];
  var title = _exShortTitle(ex) || exTitle(ex);
  var lockd = (ex.sets || []).some(function (s) { return s.completed; });
  var line = el('div', { class: 'dk-bx' + (lockd ? ' is-logged' : ''), 'data-cell': wi + '.' + di + '.' + ei });
  var id = el('div', { class: 'dk-bx-id lift-' + (MAIN_LIFTS.indexOf(ex.lift) >= 0 ? ex.lift : 'acc') });
  id.appendChild(el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }));
  var nm = el('span', { class: 'dk-bx-name' }, title);
  if (title !== exTitle(ex)) dkTip(nm, exTitle(ex));
  id.appendChild(nm);
  line.appendChild(id);
  line.appendChild(dkBxRx(box, prog, ex, wi, di, ei, line, lockd, title));
  if (wkLogged) line.appendChild(dkBxLifted(ex));
  if (!o.ro) {
    var more = el('button', { type: 'button', class: 'dk-icon-btn dk-bx-more', 'aria-label': title + ' options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: DK_IC.more });
    more.addEventListener('click', function (e) { e.stopPropagation(); dkPopMenu(more, dkBxExMenu(box, o.aid, wi, di, ei, more), { alignRight: true }); });
    line.appendChild(more);
  }
  var note = dkBxNote(box, ex, wi, di, ei);
  if (note) line.appendChild(note);
  return line;
}
// The coach's note on the exercise, and the lifter's note from the day; small, under the line.
function dkBxNote(box, ex, wi, di, ei, editing) {
  var o = box._o;
  if (!ex.note && !ex.athleteNote && !editing) return null;
  var row = el('div', { class: 'dk-bx-note' });
  if (editing) {
    var inp = el('input', { type: 'text', class: 'dk-bx-notein', maxlength: '300', spellcheck: 'true', placeholder: 'A cue for this exercise, like “Brace before you unrack”', 'aria-label': 'Note for ' + exTitle(ex) });
    inp.value = ex.note || '';
    var save = function () {
      var v = inp.value.trim();
      var cur = dkPbEx(dkProgOf(o.aid), wi, di, ei);
      if (cur && v !== (cur.note || '')) {
        dkPbRemember(dkProgOf(o.aid), 'Note on ' + exTitle(cur));
        Store.update(function (s) { var p = s.programs.find(function (x) { return x.athleteId === o.aid; }); var e = p && dkPbEx(p, wi, di, ei); if (e) e.note = v; });
        persistProgram(dkProgOf(o.aid).id);
      }
      dkBxRefreshLine(wi, di, ei);
    };
    inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); inp.blur(); } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = ex.note || ''; inp.blur(); } });
    inp.addEventListener('blur', save);
    row.appendChild(inp);
    return row;
  }
  if (ex.note) {
    var n = el(o.ro ? 'span' : 'button', { class: 'dk-bx-cn' + (o.ro ? '' : ' is-btn') }, ex.note);
    if (!o.ro) { n.type = 'button'; dkTip(n, 'Edit the note'); n.addEventListener('click', function () { dkBxEditNote(box, wi, di, ei); }); }
    row.appendChild(n);
  }
  if (ex.athleteNote) { var an = el('span', { class: 'dk-bx-an' }, '“' + ex.athleteNote + '”'); dkTip(an, 'Their note from the day'); row.appendChild(an); }
  return row;
}
function dkBxEditNote(box, wi, di, ei) {
  var line = box.querySelector('.dk-bx[data-cell="' + wi + '.' + di + '.' + ei + '"]');
  var ex = dkPbEx(dkProgOf(box._o.aid), wi, di, ei);
  if (!line || !ex) return;
  var old = line.querySelector('.dk-bx-note');
  var row = dkBxNote(box, ex, wi, di, ei, true);
  if (old) old.replaceWith(row); else line.appendChild(row);
  row.querySelector('input').focus();
}
// The prescription, edited in place: the drawing, with a field over it that shows when typed in.
function dkBxRx(box, prog, ex, wi, di, ei, line, lockd, title) {
  var o = box._o;
  var wrap = el('div', { class: 'dk-bx-rx' });
  var disp = dkBxRich(ex, prog, o.aid);
  if (o.ro) { disp.removeAttribute('aria-hidden'); wrap.appendChild(disp); return wrap; }
  var wn = prog.weeks[wi].number || wi + 1;
  var inp = el('input', { type: 'text', class: 'dk-bx-in', spellcheck: 'false', autocomplete: 'off', 'aria-label': title + ', week ' + wn + (lockd ? ', logged' : ''), placeholder: '3x5 @8' });
  inp.value = gridCellText(ex);
  inp.dataset.orig = inp.value;
  inp.dataset.wi = wi; inp.dataset.di = di; inp.dataset.ei = ei;
  if (lockd) { inp.readOnly = true; dkTip(wrap, 'Logged: what they lifted stays as it was. ⋯ › Change it set by set'); }
  wrap.appendChild(inp);
  wrap.appendChild(disp);
  inp.addEventListener('focus', function () {
    line.classList.add('is-focus');
    dkBxFocus({ athleteId: o.aid, wi: wi, di: di, ei: ei, label: exTitle(dkPbEx(dkProgOf(o.aid), wi, di, ei) || ex) });
  });
  inp.addEventListener('blur', function () { line.classList.remove('is-focus'); if (!inp.readOnly) dkBxCommit(box, inp); });
  inp.addEventListener('keydown', function (e) {
    var mod = e.metaKey || e.ctrlKey;
    var go = function (d) {
      var all = Array.prototype.slice.call(box.querySelectorAll('input.dk-bx-in'));
      var t = all[all.indexOf(inp) + d];
      if (t) { t.focus(); t.select(); }
    };
    if (e.key === 'Enter') { e.preventDefault(); if (inp.readOnly || dkBxCommit(box, inp)) go(e.shiftKey ? -1 : 1); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); if (inp.readOnly || dkBxCommit(box, inp)) go(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (inp.readOnly || dkBxCommit(box, inp)) go(-1); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = inp.dataset.orig; inp.classList.remove('is-bad'); inp.blur(); }
    else if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z') && inp.value === inp.dataset.orig) { e.preventDefault(); inp.blur(); dkPbUndo(); }
    else if (mod && !e.shiftKey && (e.key === 'd' || e.key === 'D') && !inp.readOnly) { e.preventDefault(); dkBxSameAsBefore(box, inp); }
    else if (mod && e.shiftKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      if (!inp.readOnly && !dkBxCommit(box, inp)) return;
      dkPopMenu(inp, dkBxProgressItems(o.aid, wi, di, ei));
    }
  });
  return wrap;
}
// Save one exercise's writing. Unchanged sets keep their ids and what they carry; the text is the
// whole truth for its set fields. Returns false when a part doesn't read (it needs sets x reps).
function dkBxCommit(box, inp, noHistory) {
  var o = box._o, W = Number(inp.dataset.wi), D = Number(inp.dataset.di), E = Number(inp.dataset.ei);
  var text = inp.value.trim();
  if (text === inp.dataset.orig) { inp.classList.remove('is-bad'); return true; }
  var prog = dkProgOf(o.aid), ex = dkPbEx(prog, W, D, E);
  if (!ex) return true;
  var parsed = text ? gridParseCell(text, o.aid, ex.lift, prog) : [];
  if (parsed == null) { inp.classList.add('is-bad'); dkTip(inp.parentNode, 'Each part needs sets x reps, like 3x5 @8 or 1x3 180, 3x5 75%'); return false; }
  inp.classList.remove('is-bad');
  if (!noHistory) dkPbRemember(prog, exTitle(ex) + ', week ' + (prog.weeks[W].number || W + 1));
  Store.update(function (s) {
    var p = s.programs.find(function (x) { return x.id === prog.id; });
    var e = p && dkPbEx(p, W, D, E);
    if (!e) return;
    // A team program's exercise edited for this lifter is theirs from now on: the next team push asks.
    if (e.srcId != null) e.ovr = true;
    e.sets = parsed.map(function (ns, i) {
      var old = e.sets[i];
      if (old && !old.completed && Math.abs(planWeight(old) - ns.weight) < 0.06 && old.reps === ns.reps && old.rpe === ns.rpe && (old.rpeHi == null) === (ns.rpeHi == null) && !!old.rir === !!ns.rir && old.pct == ns.pct) return assignSetFields(old, ns);
      return ns;
    });
  });
  persistProgram(prog.id);
  dkBxRefreshLine(W, D, E, { keepInput: inp });
  dkPbEdited({ keepBody: true });
  return true;
}
// One line drawn again from the store (after a commit, a note, the inspector's set fields).
function dkBxRefreshLine(wi, di, ei, opts) {
  var box = _dkVis('#programArea .dk-bxv:not(.is-ro)');
  if (!box) return;
  var line = box.querySelector('.dk-bx[data-cell="' + wi + '.' + di + '.' + ei + '"]');
  var prog = dkProgOf(box._o.aid), ex = dkPbEx(prog, wi, di, ei);
  if (!line || !ex) return;
  var inp = line.querySelector('input.dk-bx-in');
  if (inp) { inp.value = gridCellText(ex); inp.dataset.orig = inp.value; }
  var old = line.querySelector('.dk-bx-disp');
  if (old) old.replaceWith(dkBxRich(ex, prog, box._o.aid));
  var n = line.querySelector('.dk-bx-note'), nn = dkBxNote(box, ex, wi, di, ei);
  if (n && nn) n.replaceWith(nn); else if (n) n.remove(); else if (nn) line.appendChild(nn);
  var head = line.closest('.dk-bxd');
  if (head) {
    var D = prog.weeks[wi].days[di], meta = head.querySelector('.dk-bxd-meta');
    var cnt = D.exercises.reduce(function (a, e) { return a + e.sets.filter(function (s) { return !s.extra; }).length; }, 0);
    if (meta) meta.textContent = meta.textContent.replace(/^\d+ exercises? · \d+ sets?/, D.exercises.length + (D.exercises.length === 1 ? ' exercise' : ' exercises') + ' · ' + cnt + (cnt === 1 ? ' set' : ' sets'));
  }
}
// After any edit: the edit marks, Notify's count, the list's counts, the weeks' read, the inspector.
function dkPbEdited(opts) {
  dkPbMarkEdited();
  dkPaintPbHead();
  dkPbPaintUndo();
  var l = document.getElementById('dkPbList'); if (l) dkPaintPbRows(l);
  var box = _dkVis('#programArea .dk-bxv:not(.is-ro)');
  if (box && opts && opts.keepBody) {
    var prog = dkProgOf(box._o.aid), tl = box.querySelector('.dk-tl');
    if (prog && tl) { var starts = dkPbStarts(prog); tl.replaceWith(dkBxTimeline(box, prog, starts, dkPbWeekIdx(prog), dkPbNow(prog, starts).now, dkPbMeet(prog, box._o.aid))); }
  }
  if (_dk.pbInfo && dkCtxReady()) dkPaintInspector();
}
// ⌘D: what this exercise had the week before.
function dkBxSameAsBefore(box, inp) {
  var W = Number(inp.dataset.wi), D = Number(inp.dataset.di), E = Number(inp.dataset.ei);
  var prog = dkProgOf(box._o.aid), ex = dkPbEx(prog, W, D, E);
  if (!ex) return;
  if (W === 0) { toast('Week ' + (prog.weeks[0].number || 1) + ' is the first week'); return; }
  var pd = prog.weeks[W - 1].days[D], at = pd ? _dkPbMatch(pd, ex, E) : -1;
  if (at < 0) { toast('Not in week ' + (prog.weeks[W - 1].number || W)); return; }
  var prev = pd.exercises[at];
  inp.value = gridCellText({ sets: prev.sets.filter(function (s) { return !s.extra; }).map(function (s) { return Object.assign({}, s, { weight: planWeight(s), reps: s.plannedReps || s.reps }); }) });
  dkBxCommit(box, inp);
  inp.select();
}
function dkBxProgressItems(aid, wi, di, ei) {
  var prog = dkProgOf(aid), ex = dkPbEx(prog, wi, di, ei);
  if (!ex) return [];
  if (wi >= prog.weeks.length - 1) return [{ node: el('div', { class: 'dk-menu-title', role: 'presentation' }, 'This is the last week. Add a week to progress into') }];
  return [{ node: el('div', { class: 'dk-menu-title', role: 'presentation' }, _exShortTitle(ex) + ', each week after this one') }].concat(dkPbKinds().map(function (k) {
    return { label: k[1], run: function () { dkPbProgress(aid, wi, { di: di, ei: ei }, k[0]); } };
  }));
}
function dkBxExMenu(box, aid, wi, di, ei, anchor) {
  var prog = dkProgOf(aid), D = prog.weeks[wi].days[di], ex = D.exercises[ei];
  var lg = ex.sets.some(function (s) { return s.completed; });
  var mod = _dkMac() ? '⌘' : 'Ctrl ';
  var items = [];
  items.push({ label: 'Details', hint: ']', run: function () { _dk.pbInsp = true; document.documentElement.classList.remove('ctx-off'); dkBxFocus({ athleteId: aid, wi: wi, di: di, ei: ei, label: exTitle(ex) }); } });
  if (!lg) {
    if (wi > 0) items.push({ label: 'Same as week ' + (prog.weeks[wi - 1].number || wi), hint: mod + 'D', run: function () { var i = box.querySelector('.dk-bx[data-cell="' + wi + '.' + di + '.' + ei + '"] input.dk-bx-in'); if (i) dkBxSameAsBefore(box, i); } });
    if (wi < prog.weeks.length - 1) items.push({ label: 'Progress it through the block…', hint: mod + '⇧R', run: function () { setTimeout(function () { dkPopMenu(anchor, dkBxProgressItems(aid, wi, di, ei), { alignRight: true }); }, 0); } });
  }
  if (MAIN_LIFTS.indexOf(ex.lift) >= 0 && !lg) items.push({ label: 'Change the variant…', run: function () {
    setTimeout(function () {
      var cur = ex.variant || 'Competition';
      dkPopMenu(anchor, variantsFor(ex.lift).map(function (v) {
        return { label: (v === 'Competition' ? 'Competition ' : v + ' ') + LIFT_LABELS[ex.lift], check: v === cur, run: function () {
          if (v === cur) return;
          dkPbRemember(dkProgOf(aid), 'Variant of ' + exTitle(ex));
          Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); var e = p && dkPbEx(p, wi, di, ei); if (e) e.variant = v; });
          persistProgram(prog.id); dkPbAfterBulk([]);
        } };
      }), { alignRight: true });
    }, 0);
  } });
  items.push({ label: ex.note ? 'Edit the note' : 'Add a note', run: function () { dkBxEditNote(box, wi, di, ei); } });
  items.push('-');
  var mv = function (dir) { return function () {
    var before = _dkBxFlipBefore(box);
    dkPbRemember(dkProgOf(aid), 'Move ' + exTitle(ex));
    reorderExercise(prog.id, wi, di, ei, dir); persistProgram(prog.id);
    var sc = document.getElementById('programArea'), top = sc ? sc.scrollTop : 0;
    dkBxFill(box); if (sc) sc.scrollTop = top;
    dkPbEdited();
    _dkBxFlipAfter(box, before);
    var m = box.querySelector('.dk-bx[data-cell="' + wi + '.' + di + '.' + (ei + dir) + '"] .dk-bx-more'); if (m) m.focus({ preventScroll: true });
  }; };
  if (ei > 0) items.push({ label: 'Move up', run: mv(-1) });
  if (ei < D.exercises.length - 1) items.push({ label: 'Move down', run: mv(1) });
  items.push({ label: 'Duplicate', run: function () { dkPbRemember(dkProgOf(aid), 'Duplicate ' + exTitle(ex)); copyExercise(prog.id, wi, di, ei); persistProgram(prog.id); dkPbAfterBulk([]); } });
  items.push({ label: 'Change it set by set', run: function () { _dk.pbWk = { prog: prog.id, wi: wi }; deskSetPbView('sets'); loadProgram(); } });
  items.push('-', { label: 'Remove', danger: true, run: function () {
    if (lg && !confirm(exTitle(ex) + ' has logged sets. Remove it anyway? Undo brings it back.')) return;
    dkPbRemember(dkProgOf(aid), 'Remove ' + exTitle(ex));
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) p.weeks[wi].days[di].exercises.splice(ei, 1); });
    persistProgram(prog.id); dkPbAfterBulk([]);
    toast(exTitle(ex) + ' removed. ' + (_dkMac() ? '⌘Z' : 'Ctrl Z') + ' brings it back');
  } });
  return items;
}
// Reordered exercises glide to their new place (FLIP), keyed by exercise id.
function _dkBxFlipBefore(box) {
  var m = {}, prog = dkBxProg(box._o);
  box.querySelectorAll('.dk-bx[data-cell]').forEach(function (n) { var c = n.dataset.cell.split('.'); var e = dkPbEx(prog, +c[0], +c[1], +c[2]); if (e) m[e.id] = n.getBoundingClientRect().top; });
  return m;
}
function _dkBxFlipAfter(box, before) {
  if (_dkReduced()) return;
  var prog = dkBxProg(box._o);
  box.querySelectorAll('.dk-bx[data-cell]').forEach(function (n) {
    var c = n.dataset.cell.split('.'), e = dkPbEx(prog, +c[0], +c[1], +c[2]);
    var was = e ? before[e.id] : null;
    if (was == null) return;
    var dy = was - n.getBoundingClientRect().top;
    if (Math.abs(dy) < 2) return;
    n.animate([{ transform: 'translateY(' + dy + 'px)' }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
  });
}
// Add an exercise the way it's written: "Pause squat 3x4 @7", "RDL 3x8 100". The name finds the
// lift (matchExercise, the import's reader); the rest is the sets. Enter adds it and stays here.
function dkBxAddRow(box, wi, di) {
  var o = box._o;
  var row = el('div', { class: 'dk-bx-add' });
  row.insertAdjacentHTML('beforeend', DK_IC.plus);
  var inp = el('input', { type: 'text', class: 'dk-bx-addin', spellcheck: 'false', autocomplete: 'off', placeholder: 'Add an exercise', 'aria-label': 'Add an exercise to this session, written like Pause squat 3x4 @7' });
  // The example shows once the coach is in the field; at rest it's two quiet words.
  inp.addEventListener('focus', function () { inp.placeholder = 'Pause squat 3x4 @7, then ↵'; });
  inp.addEventListener('blur', function () { inp.placeholder = 'Add an exercise'; });
  row.appendChild(inp);
  var full = el('button', { type: 'button', class: 'dk-bx-full' }, 'Form');
  dkTip(full, 'Add it with the full form: pick the lift and variant, set by set');
  full.addEventListener('click', function () { dkPbRemember(dkProgOf(o.aid), 'Add an exercise'); openAddExercise(wi, di); });
  row.appendChild(full);
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = ''; inp.classList.remove('is-bad'); inp.blur(); return; }
    if (e.key === 'ArrowUp' && !inp.value) { e.preventDefault(); var all = Array.prototype.slice.call(box.querySelectorAll('input.dk-bx-in, input.dk-bx-addin')); var t = all[all.indexOf(inp) - 1]; if (t) t.focus(); return; }
    if (e.key === 'ArrowDown' && !inp.value) { e.preventDefault(); var all2 = Array.prototype.slice.call(box.querySelectorAll('input.dk-bx-in, input.dk-bx-addin')); var t2 = all2[all2.indexOf(inp) + 1]; if (t2) t2.focus(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var v = inp.value.trim();
    if (!v) return;
    var m = v.match(/^(.*?)[\s:–-]*(\d+\s*(?:x|×|\*|sets?\b).*)$/i);
    var name = (m ? m[1] : v).replace(/[\s:–-]+$/, '').trim(), rx = m ? m[2].trim() : '';
    if (!name) { inp.classList.add('is-bad'); dkTip(row, 'Start with the exercise: Squat 3x5 @8'); return; }
    // How coaches say it: "pause squat", "CG bench", "pin squat" find the variant.
    var said = name.replace(/\bpause\b/i, 'Paused').replace(/\bcg\b/i, 'Close Grip').replace(/\bclose-grip\b/i, 'Close Grip');
    var prog = dkProgOf(o.aid), me = matchExercise(said);
    var sets = rx ? gridParseCell(rx, o.aid, me.lift, prog) : [];
    if (sets == null) { inp.classList.add('is-bad'); dkTip(row, 'The sets need sets x reps, like 3x5 @8'); return; }
    inp.classList.remove('is-bad');
    dkPbRemember(prog, 'Add ' + name);
    var ex = newExercise(me.lift, me.variant, me.exerciseName);
    ex.sets = sets;
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p && p.weeks[wi] && p.weeks[wi].days[di]) p.weeks[wi].days[di].exercises.push(ex); });
    persistProgram(prog.id);
    var sc = document.getElementById('programArea'), top = sc ? sc.scrollTop : 0;
    dkBxFill(box); if (sc) sc.scrollTop = top;
    dkPbEdited();
    var card = box.querySelectorAll('.dk-bxd')[di];
    var nl = card && card.querySelector('.dk-bx:last-of-type');
    if (nl && !_dkReduced() && nl.animate) nl.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    var next = card && (rx ? card.querySelector('.dk-bx-addin') : nl && nl.querySelector('input.dk-bx-in'));
    if (next) next.focus();
  });
  return row;
}
// An exercise line took focus: it's the inspector's (when the inspector is open).
function dkBxFocus(info) {
  _dk.pbInfo = info;
  dkSyncCtx();
  if (dkCtxReady()) dkPaintInspector();
}
// A set landed (realtime) while the builder is open: the body repaints, unless the coach is typing.
function dkPbLive() {
  var box = _dkVis('#programArea .dk-bxv:not(.is-ro)');
  if (!box) return;
  var a = document.activeElement;
  if (a && box.contains(a) && _dkTyping(a)) return;
  if (document.querySelector('.dk-menu')) return;
  var sc = document.getElementById('programArea'), top = sc ? sc.scrollTop : 0;
  var hadTab = a && a.closest && a.closest('.dk-tl');
  dkBxFill(box);
  if (sc) sc.scrollTop = top;
  if (hadTab) { var t = box.querySelector('.dk-tl-wk.is-sel'); if (t) t.focus({ preventScroll: true }); }
  var l = document.getElementById('dkPbList'); if (l) dkPaintPbRows(l);
}

// ---------- Progression: each lift across the block ----------
// Per week, the lift's top planned set (the competition variant when the week has it) and the top
// set lifted against it. A block written in RPE only draws the RPE instead of the load.
function dkPgSeries(prog, L, aid) {
  var pts = prog.weeks.map(function (w) {
    var exs = [];
    w.days.forEach(function (d, di) { d.exercises.forEach(function (e, ei) { if (e.lift === L && (e.sets || []).length) exs.push({ e: e, di: di, ei: ei }); }); });
    var comp = exs.filter(function (x) { return !x.e.variant || x.e.variant === 'Competition'; });
    if (comp.length) exs = comp;
    var p = { kg: 0, rpe: null, txt: '', at: exs[0] || null, lifted: null };
    exs.forEach(function (x) {
      groupSets(_deskPlanSets(x.e)).forEach(function (g) {
        // An RPE-only top set ("1x3 @8") plots at the load its max points to, like the card shows it.
        var est = !(Number(g.weight) > 0) && g.pct == null ? _dkBxEstKg(prog, aid, x.e, g) : 0;
        var hi = Math.max(Number(g.weight) || 0, Number(g.weightHi) || 0, est);
        if (hi > p.kg) { p.kg = hi; p.txt = dkGroupLabel(g) + (est ? ' (≈' + _num(kgToDisplay(est)) + ')' : ''); p.at = x; }
        var r = g.rpe == null || g.rpe === '' ? null : Math.max(Number(g.rpe), Number(g.rpeHi) || 0);
        if (r != null && (p.rpe == null || r > p.rpe)) { p.rpe = r; if (!p.kg) { p.txt = dkGroupLabel(g); p.at = x; } }
        (x.e.sets || []).slice(g.startIdx, g.startIdx + g.count).forEach(function (s) {
          if (!s.completed) return;
          var kg = Number(s.weight) || 0, felt = s.actualRpe != null && s.actualRpe !== '' ? Number(s.actualRpe) : null;
          var lf = p.lifted;
          if (!lf || kg > lf.kg || (kg === lf.kg && (felt || 0) > (lf.rpe || 0))) p.lifted = { kg: kg, reps: Number(s.reps) || 0, rpe: felt, gap: _dkSetGap(s, g), planned: Number(planWeight(s)) > 0 };
        });
      });
    });
    return p;
  });
  var byKg = pts.some(function (p) { return p.kg > 0; });
  return { pts: pts, byKg: byKg };
}
function dkPgView(box, prog, starts, wi, now, meet) {
  var o = box._o;
  var v = el('div', { class: 'dk-pg' });
  var lifts = MAIN_LIFTS.filter(function (L) { return prog.weeks.some(function (w) { return w.days.some(function (d) { return d.exercises.some(function (e) { return e.lift === L && (e.sets || []).length; }); }); }); });
  if (!lifts.length) {
    v.appendChild(el('p', { class: 'dk-quiet-p' }, 'Progression draws the squat, bench and deadlift across the block. Write one into a session and its line starts here.'));
    return v;
  }
  var key = el('div', { class: 'dk-wk-key dk-pg-key', 'aria-hidden': 'true' });
  key.appendChild(el('span', {}, el('i', { class: 'dk-pg-k-line' }), 'Planned top set'));
  key.appendChild(el('span', {}, el('i', { class: 'dk-pg-k-dot t-on' }), 'Lifted'));
  [['warn', 'Over'], ['alert', '1+ over'], ['cool', 'Under']].forEach(function (x) { key.appendChild(el('span', {}, el('i', { class: 'dk-pg-k-dot t-' + x[0] }), x[1])); });
  key.appendChild(el('span', { class: 'dk-pg-k-hint' }, 'Click a week to write it'));
  v.appendChild(key);
  lifts.forEach(function (L) {
    var ser = dkPgSeries(prog, L, o.aid);
    var card = el('div', { class: 'dk-pg-lift lift-' + L, role: 'group', 'aria-label': LIFT_LABELS[L] + ' across the block' });
    var hd = el('header', { class: 'dk-pg-head' });
    hd.appendChild(el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }));
    hd.appendChild(el('h3', { class: 'dk-pg-name' }, LIFT_LABELS[L]));
    var vals = ser.pts.map(function (p) { return ser.byKg ? p.kg : p.rpe; }).filter(function (x) { return x > 0; });
    if (vals.length >= 2) {
      var a0 = vals[0], a1 = vals[vals.length - 1];
      var sum = ser.byKg ? _num(kgToDisplay(a0)) + ' → ' + _num(kgToDisplay(a1)) + ' ' + unitLabel() + (a0 ? ' · ' + (a1 >= a0 ? '+' : '−') + _num(Math.abs(Math.round((a1 - a0) / a0 * 1000) / 10)) + '%' : '') : '@' + _num(a0) + ' → @' + _num(a1);
      hd.appendChild(el('span', { class: 'dk-pg-sum' }, sum));
    }
    var lf = ser.pts.filter(function (p) { return p.lifted && p.lifted.gap != null; });
    if (lf.length) {
      var off = lf.filter(function (p) { return Math.abs(p.lifted.gap) >= 0.5; }).length;
      hd.appendChild(el('span', { class: 'dk-pg-sum' }, lf.length + (lf.length === 1 ? ' week lifted' : ' weeks lifted') + (off ? ' · ' + off + ' off the RPE' : ' · on target')));
    }
    card.appendChild(hd);
    var chart = el('div', { class: 'dk-pg-chart' });
    card.appendChild(chart);
    var draw = function () { dkPgDraw(chart, box, prog, L, ser, starts, wi, now, meet); };
    requestAnimationFrame(draw);
    if (window.ResizeObserver) { var lastW = 0; new ResizeObserver(function () { var w = chart.clientWidth; if (Math.abs(w - lastW) > 4) { lastW = w; draw(); } }).observe(chart); }
    v.appendChild(card);
  });
  return v;
}
function _dkPgNice(lo, hi) {
  var span = Math.max(hi - lo, 1), steps = [1, 2, 2.5, 5, 10, 20, 25, 50, 100];
  var st = steps.find(function (s) { return span / s <= 4; }) || 100;
  var a = Math.floor(lo / st) * st, b = Math.ceil(hi / st) * st;
  if (a === b) { a -= st; b += st; }
  return { lo: a, hi: b, step: st };
}
function dkPgDraw(chart, box, prog, L, ser, starts, wi, now, meet) {
  if (!chart.isConnected) return;
  var o = box._o;
  var W = Math.max(280, chart.clientWidth || 640), H = 150, padL = 44, padR = 16, padT = 14, padB = 34;
  var n = prog.weeks.length, cw = (W - padL - padR) / n;
  var x = function (i) { return padL + cw * (i + 0.5); };
  var conv = function (v) { return ser.byKg ? kgToDisplay(v) : v; };
  var vals = [];
  ser.pts.forEach(function (p) { var pv = ser.byKg ? p.kg : p.rpe; if (pv > 0) vals.push(conv(pv)); if (p.lifted) { var lv = ser.byKg ? p.lifted.kg : p.lifted.rpe; if (lv > 0) vals.push(conv(lv)); } });
  if (!vals.length) { chart.innerHTML = '<p class="dk-quiet-p">Nothing with a load or an RPE yet.</p>'; return; }
  var sc = ser.byKg ? _dkPgNice(Math.min.apply(null, vals) - 2, Math.max.apply(null, vals) + 2) : _dkPgNice(Math.max(5, Math.min.apply(null, vals) - 0.5), Math.min(10, Math.max.apply(null, vals) + 0.5));
  if (!ser.byKg) sc.step = sc.step < 0.5 ? 0.5 : sc.step;
  var y = function (v) { return padT + (1 - (v - sc.lo) / (sc.hi - sc.lo)) * (H - padT - padB); };
  var unit = unitLabel(), E = function (s) { return escHtml(String(s)); };
  var h = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="group" aria-label="' + E(LIFT_LABELS[L] + ', planned top set per week') + '">';
  // Gridlines and their values.
  for (var gv = sc.lo; gv <= sc.hi + 1e-9; gv += sc.step) {
    var gy = y(gv).toFixed(1);
    h += '<line class="dk-pg-grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + gy + '" y2="' + gy + '"/>';
    h += '<text class="dk-pg-ax" x="' + (padL - 8) + '" y="' + gy + '" dy="0.32em" text-anchor="end">' + E(ser.byKg ? _num(gv) : '@' + _num(gv)) + '</text>';
  }
  // The selected week and the week they're in.
  h += '<rect class="dk-pg-sel" x="' + (padL + cw * wi + 2).toFixed(1) + '" y="' + (padT - 6) + '" width="' + (cw - 4).toFixed(1) + '" height="' + (H - padT - padB + 12) + '" rx="6"/>';
  prog.weeks.forEach(function (w, i) {
    h += '<text class="dk-pg-ax' + (i === wi ? ' is-sel' : '') + '" x="' + x(i).toFixed(1) + '" y="' + (H - padB + 18) + '" text-anchor="middle">' + E('W' + (w.number || i + 1) + (i === now ? ' · now' : '')) + '</text>';
  });
  // The meet, when it falls inside the block.
  if (meet && starts[0]) {
    var mi = Math.floor((Date.parse(meet.date) - Date.parse(starts[0])) / 6048e5);
    if (mi >= 0 && mi < n) h += '<line class="dk-pg-meet" x1="' + x(mi).toFixed(1) + '" x2="' + x(mi).toFixed(1) + '" y1="' + padT + '" y2="' + (H - padB) + '"/>';
  }
  // The planned line, then its points, then what was lifted.
  var pl = [];
  ser.pts.forEach(function (p, i) { var pv = ser.byKg ? p.kg : p.rpe; if (pv > 0) pl.push([x(i), y(conv(pv))]); });
  if (pl.length > 1) h += '<path class="dk-pg-line" d="' + pl.map(function (q, k) { return (k ? 'L' : 'M') + q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' ') + '"/>';
  ser.pts.forEach(function (p, i) {
    var pv = ser.byKg ? p.kg : p.rpe;
    if (pv > 0) h += '<circle class="dk-pg-plan" cx="' + x(i).toFixed(1) + '" cy="' + y(conv(pv)).toFixed(1) + '" r="4"/>';
    if (p.lifted) {
      var lv = ser.byKg ? p.lifted.kg : p.lifted.rpe;
      if (lv > 0) {
        var tn = p.lifted.gap == null ? 'on' : _dkGapCls(p.lifted.gap);
        h += '<circle class="dk-pg-got t-' + tn + '" cx="' + x(i).toFixed(1) + '" cy="' + y(conv(lv)).toFixed(1) + '" r="5"/>';
      }
    }
  });
  // A column per week to point at and click: what was planned, what was lifted.
  ser.pts.forEach(function (p, i) {
    var w = prog.weeks[i], wn = w.number || i + 1;
    var planTxt = p.txt ? 'planned ' + p.txt + (ser.byKg && p.kg ? ' ' + unit : '') : 'nothing written';
    var l = p.lifted, liftTxt = l ? '; lifted ' + (l.kg > 0 ? _num(kgToDisplay(l.kg)) + '×' : '') + l.reps + (l.rpe != null ? ' @' + _num(l.rpe) : '') + (l.gap != null && Math.abs(l.gap) >= 0.5 ? ' (' + dkGapText(l.gap) + ')' : '') : '';
    var lab = 'Week ' + wn + ': ' + planTxt + liftTxt;
    h += '<rect class="dk-pg-hit" x="' + (padL + cw * i).toFixed(1) + '" y="0" width="' + cw.toFixed(1) + '" height="' + H + '" data-wi="' + i + '" tabindex="0" role="button" aria-label="' + E(lab + (o.ro ? '' : '. Open week ' + wn)) + '" data-tip="' + E(lab) + '"/>';
  });
  h += '</svg>';
  chart.innerHTML = h;
  chart.querySelectorAll('.dk-pg-hit').forEach(function (r) {
    var open = function () {
      var i = Number(r.getAttribute('data-wi')), p = ser.pts[i];
      if (o.ro) { dkBxPick(box, i); return; }
      _dk.pbWk = { prog: prog.id, wi: i };
      deskSetPbView('sessions');
      loadProgram();
      if (p && p.at) {
        var inp = document.querySelector('#programArea .dk-bx[data-cell="' + i + '.' + p.at.di + '.' + p.at.ei + '"] input.dk-bx-in');
        if (inp) { inp.closest('.dk-bx').scrollIntoView({ block: 'center' }); inp.focus(); }
      }
    };
    r.addEventListener('click', open);
    r.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
  });
}

// ---------- the inspector: what was written, what was lifted, the % maths, set fields, the step ----------
// Opens on demand (⋯ › Details, or ]) for the exercise in focus.
function dkPaintInspector() {
  var host = dkCtxHost();
  if (!host || _dk.screen !== 'programs') return;
  dkCtxClear();
  if (!dkCtxReady()) return;
  host.dataset.aid = 'pb';
  var info = _dk.pbInfo;
  var box = el('div', { class: 'dk-insp' });
  var close = dkIconBtn(DK_IC.x, 'Close', function () { _dk.pbInsp = false; dkSyncCtx(); }, ']');
  if (!info) {
    box.appendChild(el('div', { class: 'dk-ctx-empty' }, 'Pick an exercise to see what was written, what was lifted, and to move it on through the block.'));
    host.appendChild(box);
    return;
  }
  var prog = dkProgOf(info.athleteId);
  var wk = prog && prog.weeks[info.wi];
  var ex = wk && dkPbEx(prog, info.wi, info.di, info.ei);
  var hd = el('div', { class: 'dk-ctx-head' });
  hd.appendChild(el('div', { class: 'dk-ctx-title' }, el('b', {}, ex ? exTitle(ex) : info.label), el('span', {}, 'Week ' + (wk ? wk.number : info.wi + 1) + (wk && wk.days[info.di] ? ' · ' + (wk.days[info.di].name || 'Day ' + (info.di + 1)) : ''))));
  hd.appendChild(close);
  box.appendChild(hd);
  var body = el('div', { class: 'dk-insp-body' });
  var line = function (k, v, cls) { var r = el('div', { class: 'dk-insp-row' + (cls ? ' ' + cls : '') }); r.appendChild(el('span', { class: 'dk-insp-k' }, k)); r.appendChild(el('span', { class: 'dk-insp-v' }, v)); body.appendChild(r); };
  var plan = ex ? groupSets(_deskPlanSets(ex)) : [];
  line('Written', plan.length ? plan.map(dkGroupLabel).join(', ') : 'Nothing yet');
  var done = ex ? ex.sets.filter(function (s) { return s.completed; }) : [];
  if (done.length) {
    var lifted = el('div', { class: 'dk-insp-sets' });
    done.forEach(function (s) {
      var tgt = s.rpeHi != null && Number(s.rpeHi) > Number(s.rpe) ? Number(s.rpeHi) : (s.rpe != null && s.rpe !== '' ? Number(s.rpe) : null);
      var gap = tgt != null && s.actualRpe != null && s.actualRpe !== '' ? Number(s.actualRpe) - tgt : null;
      var tn = gap == null ? '' : _dkGapCls(gap);
      var rp = el('span', {}, s.actualRpe != null && s.actualRpe !== '' ? '@' + _num(s.actualRpe) : '');
      if (tn && tn !== 'on') rp.appendChild(el('span', { class: 'dk-gap t-' + tn }, ' ' + dkGapText(gap)));
      lifted.appendChild(el('div', { class: 'dk-insp-set' },
        el('span', {}, 'Set ' + (ex.sets.indexOf(s) + 1)),
        el('span', {}, (Number(s.weight) > 0 ? _num(kgToDisplay(s.weight)) + '×' : '') + Number(s.reps)), rp));
    });
    var lr = el('div', { class: 'dk-insp-row is-block' });
    lr.appendChild(el('span', { class: 'dk-insp-k' }, 'Lifted'));
    lr.appendChild(lifted);
    body.appendChild(lr);
    var best = 0;
    done.forEach(function (s) { if (Number(s.weight) > 0 && s.actualRpe) best = Math.max(best, calcCompE1RM(Number(s.weight), Number(s.reps), Number(s.actualRpe), ex.lift, ex.variant)); });
    if (best) line('e1RM', Math.round(kgToDisplay(best)) + ' ' + unitLabel());
  } else if (ex) line('Lifted', 'Not logged yet', 'is-dim');
  var pctSet = ex && ex.sets.find(function (s) { return s.pct != null && s.pct !== ''; });
  if (pctSet && MAIN_LIFTS.indexOf(ex.lift) >= 0) {
    var mx = programMaxKg(prog, info.athleteId, ex.lift);
    var own = prog.maxes && Number(prog.maxes[ex.lift]) > 0;
    line('% of', mx ? _num(pctSet.pct) + '% of ' + Math.round(kgToDisplay(mx)) + ' = ' + _num(kgToDisplay(pctLoadKg(pctSet.pct, mx))) + ' ' + unitLabel() + (own ? ' (block max)' : ' (best e1RM)') : 'No max yet: set one under Maxes');
  }
  box.appendChild(body);
  if (ex) box.appendChild(dkInspectorFields(prog, info, ex));
  // Move this exercise on through the block: each week after this one, a step further.
  if (ex && info.wi < prog.weeks.length - 1 && !done.length) {
    var fill = el('div', { class: 'dk-insp-fill' });
    fill.appendChild(el('h3', { class: 'dk-sec-title' }, 'Each week after this one'));
    var g = el('div', { class: 'dk-insp-btns' });
    dkPbKinds().forEach(function (k) {
      var b = dkBtn(k[1], { cls: 'dk-btn-sm' });
      b.addEventListener('mousedown', function (e) { e.preventDefault(); });
      b.addEventListener('click', function () { dkPbProgress(info.athleteId, info.wi, { di: info.di, ei: info.ei }, k[0]); });
      g.appendChild(b);
    });
    fill.appendChild(g);
    box.appendChild(fill);
  }
  var keys = el('div', { class: 'dk-insp-keys' });
  var mod = _dkMac() ? '⌘' : 'Ctrl ';
  [[mod + '⇧R', 'Progress it through the block'], [mod + 'D', 'Same as the week before'], [mod + 'Z', 'Undo']].forEach(function (k) { keys.appendChild(el('div', { class: 'dk-keys-row' }, el('span', {}, k[1]), dkKbd(k[0]))); });
  box.appendChild(keys);
  host.appendChild(box);
}
function dkInspectorFields(prog, info, ex) {
  var sec = el('div', { class: 'dk-insp-sf' });
  var def = programSetFields(prog);
  var todo = ex.sets.filter(function (s) { return !s.completed && !s.extra; });
  var head = el('div', { class: 'dk-insp-sf-head' });
  head.appendChild(el('h3', { class: 'dk-sec-title' }, 'Set fields'));
  var edit = dkBtn(def.on.length || def.cols.length ? 'Choose' : 'Add', { cls: 'dk-btn-sm is-quiet dk-insp-sf-btn' });
  edit.addEventListener('click', function () { openSetFieldsSheet(prog.id, function () { loadProgram(); }); });
  head.appendChild(edit);
  sec.appendChild(head);
  if (!def.on.length && !def.cols.length) {
    sec.appendChild(el('p', { class: 'dk-insp-sf-empty' }, 'Tempo, pauses, bands and chains, or your own like Bar: SSB.'));
    return sec;
  }
  if (!todo.length) {
    var fx = setFieldsText(ex.sets[0] || {});
    sec.appendChild(el('p', { class: 'dk-insp-sf-empty' }, fx || 'Logged. Nothing to change here.'));
    return sec;
  }
  sec.appendChild(setFieldsEditor(def, todo, function (patch) {
    dkPbRemember(dkProgOf(info.athleteId), 'Set fields on ' + exTitle(ex));
    Store.update(function (s) {
      var p = s.programs.find(function (x) { return x.id === prog.id; });
      var e = p && dkPbEx(p, info.wi, info.di, info.ei);
      if (e) e.sets.forEach(function (st) { if (!st.completed && !st.extra) applySetFieldPatch(st, patch); });
    });
    persistProgram(prog.id);
    dkBxRefreshLine(info.wi, info.di, info.ei);
    // dkPbEdited without repainting this pane, so Tab goes on to the next box.
    dkPbMarkEdited(); dkPaintPbHead(); dkPbPaintUndo();
    var l = document.getElementById('dkPbList'); if (l) dkPaintPbRows(l);
  }, { cls: 'dk-sf' }));
  return sec;
}
function dkGridApi() { var w = document.querySelector('#programArea .pg-grid-wrap'); return w && w._api ? w._api : null; }
function deskGridFillMenu(inp) {
  var api = dkGridApi();
  if (!api) return;
  dkPopMenu(inp, dkPbKinds().map(function (o) { return { label: o[1], run: function () { api.fill(o[0]); inp.focus(); } }; }));
}
// ---------- templates (moved here from You) ----------
function deskShowTemplates() {
  if (!isDesk()) return false;
  _dk.pbMode = 'templates';
  var t = document.getElementById('tab-program');
  if (t) t.click();
  return true;
}
function dkPaintTemplate() {
  var area = document.getElementById('programArea');
  if (!area) return;
  area.innerHTML = '';
  _dk.pbInfo = null;
  dkSyncCtx();
  var me = _dkCoachMeId();
  var tpls = (Store.get().programTemplates || []).filter(function (t) { return t.coachId === me; });
  var tpl = tpls.find(function (t) { return t.id === _dk.pbTpl; }) || tpls[0];
  if (!tpl) {
    var em = el('div', { class: 'dk-pbempty' });
    em.appendChild(el('h2', { class: 'dk-h2' }, 'No templates yet'));
    em.appendChild(el('p', {}, 'Save any athlete’s block as a template (Templates in its tools), or bring one in from a photo or a paste. Then hand it to anyone, or a whole team, with their own loads.'));
    var acts = el('div', { class: 'dk-actions' });
    acts.appendChild(dkBtn('Bring a block in', { primary: true, onClick: function () { openSheetImport(null); } }));
    em.appendChild(acts);
    area.appendChild(em);
    return;
  }
  _dk.pbTpl = tpl.id;
  var weeks = (tpl.payload && tpl.payload.weeks) || [];
  var head = el('div', { class: 'dk-pbhead' });
  var tid = el('div', { class: 'dk-pbid' });
  tid.appendChild(el('h2', { class: 'dk-pbtitle' }, tpl.name || 'Template'));
  var sets = weeks.flatMap(function (w) { return w.days || []; }).flatMap(function (d) { return d.exercises || []; }).flatMap(function (e) { return e.sets || []; }).length;
  var tmeta = el('div', { class: 'dk-pbmeta' });
  tmeta.appendChild(el('span', {}, weeks.length + (weeks.length === 1 ? ' week' : ' weeks')));
  tmeta.appendChild(el('span', {}, sets + ' sets'));
  if (tpl.createdAt) tmeta.appendChild(el('span', {}, 'saved ' + fmtDateShort(isoLocal(new Date(tpl.createdAt)))));
  tid.appendChild(tmeta);
  head.appendChild(tid);
  if (!document.documentElement.classList.contains('native') && typeof openPublishModal === 'function') head.appendChild(dkBtn('Sell it', { cls: 'is-quiet', onClick: function () { openPublishModal(tpl); } }));
  var del = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Delete template', html: ICONS.trash });
  dkTip(del, 'Delete template');
  del.addEventListener('click', async function () {
    if (!confirm('Delete template "' + (tpl.name || 'Template') + '"?')) return;
    Store.update(function (s) { s.programTemplates = s.programTemplates.filter(function (x) { return x.id !== tpl.id; }); });
    await persistDeleteTemplate(tpl.id);
    _dk.pbTpl = null;
    loadProgram();
  });
  head.appendChild(del);
  head.appendChild(dkBtn('Assign to…', { primary: true, onClick: function () { openApplyTemplate(tpl); } }));
  area.appendChild(head);
  area.appendChild(dkBlockView({ id: tpl.id, name: tpl.name, weeks: weeks }, null));
}

// =====================================================================
// MESSAGES (W1b): threads in the list pane (All · Needs reply · Unread,
// search, E for done), the thread in the centre, the athlete beside it:
// block and week, their last three sessions, flags, meet and bodyweight,
// the latest form check and the coach's private notes.
// =====================================================================
function dkMsgDigest() {
  var me = _dkCoachMeId(), out = {};
  if (_dk.threads) Object.keys(_dk.threads).forEach(function (k) { out[k] = Object.assign({}, _dk.threads[k]); });
  else {
    var d = deskThreadDigest(me);
    Object.keys(d).forEach(function (k) { out[k] = d[k]; });
  }
  var un = {};
  if (window._demoMode) (Store.get().messages || []).forEach(function (m) { if (m.senderId !== me && !m.readAt) un[m.athleteId] = (un[m.athleteId] || 0) + 1; });
  else { var u0 = _dkUnread(); Object.keys(u0).forEach(function (k) { un[k] = u0[k] || 0; }); }
  Object.keys(out).forEach(function (k) { out[k].unread = un[k] || 0; });
  return out;
}
function dkMsgRows() {
  var me = _dkCoachMeId(), dg = dkMsgDigest(), st = dkState();
  st.msgDone = st.msgDone || {};
  var rows = (_dk.rows || dkRowsFresh()).map(function (r) {
    var d = dg[r.athlete.id] || null;
    var needs = !!(d && d.lastSenderId && d.lastSenderId !== me && !(st.msgDone[r.athlete.id] && String(st.msgDone[r.athlete.id]) >= String(d.lastAt)));
    return { r: r, d: d, needs: needs, unread: d ? d.unread : 0 };
  });
  rows.sort(function (a, b) {
    if (a.d && b.d) return String(b.d.lastAt).localeCompare(String(a.d.lastAt));
    if (a.d) return -1; if (b.d) return 1;
    return String(a.r.athlete.name).localeCompare(String(b.r.athlete.name));
  });
  return rows;
}
function dkMsgVisible() {
  var f = _dk.msgFilter || 'all', q = String(_dk.msgSearch || '').trim().toLowerCase();
  return dkMsgRows().filter(function (x) {
    if (f === 'needs' && !x.needs) return false;
    if (f === 'unread' && !x.unread) return false;
    if (q && (String(x.r.athlete.name) + ' ' + (x.d ? x.d.lastBody : '')).toLowerCase().indexOf(q) < 0) return false;
    return true;
  });
}
// coach.html's renderMessages hands the desk its area.
function deskRenderMessages(area) {
  if (!area) return;
  dkRowsFresh();
  area.innerHTML = '';
  area.classList.add('dk-msgs');
  if (!_dk.rows.length) { area.classList.remove('dk-msgs'); return false; }
  var list = el('div', { class: 'dk-list dk-msg-list', role: 'listbox', 'aria-label': 'Conversations', tabindex: '-1' });
  var centre = el('div', { class: 'dk-msg-centre', id: 'dkMsgCentre' });
  area.appendChild(list);
  area.appendChild(centre);
  dkPaintMsgList();
  var vis = dkMsgVisible();
  if (!_dk.msgSel || !dkRow(_dk.msgSel)) _dk.msgSel = vis.length ? vis[0].r.athlete.id : null;
  dkOpenThread(_dk.msgSel, { keepList: true });
  return true;
}
function dkPaintMsgList() {
  var list = document.querySelector('#messagesArea .dk-msg-list');
  if (!list) return;
  var hadFocus = list.contains(document.activeElement) && document.activeElement.tagName !== 'INPUT';
  var all = dkMsgRows();
  var counts = { all: all.length, needs: all.filter(function (x) { return x.needs; }).length, unread: all.filter(function (x) { return x.unread; }).length };
  var head = list.querySelector('.dk-list-head');
  if (!head) {
    head = el('div', { class: 'dk-list-head' });
    var tr = el('div', { class: 'dk-title-row' });
    tr.appendChild(el('h1', { class: 'dk-h1' }, 'Messages'));
    tr.appendChild(dkBtn('Message everyone', { cls: 'is-quiet dk-btn-sm', onClick: function () { dkCompose((_dk.rows || []).map(function (r) { return r.athlete.id; }), { title: 'Message your roster' }); } }));
    head.appendChild(tr);
    head.appendChild(el('div', { class: 'dk-tabs dk-msg-tabs', role: 'tablist', 'aria-label': 'Filter' }));
    var sw = el('label', { class: 'dk-search dk-search-wide' });
    sw.insertAdjacentHTML('beforeend', DK_IC.search);
    var si = el('input', { type: 'search', placeholder: 'Search messages', 'aria-label': 'Search messages', autocomplete: 'off', spellcheck: 'false' });
    si.value = _dk.msgSearch || '';
    si.addEventListener('input', function () { _dk.msgSearch = si.value; dkPaintMsgList(); });
    si.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); if (si.value) { si.value = ''; _dk.msgSearch = ''; dkPaintMsgList(); } else si.blur(); }
      if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); si.blur(); var v = dkMsgVisible(); if (v.length) dkOpenThread(v[0].r.athlete.id); }
    });
    sw.appendChild(si);
    head.appendChild(sw);
    list.appendChild(head);
  }
  var tabs = head.querySelector('.dk-msg-tabs');
  tabs.innerHTML = '';
  [['all', 'All'], ['needs', 'Needs reply'], ['unread', 'Unread']].forEach(function (x) {
    var on = (_dk.msgFilter || 'all') === x[0];
    var b = el('button', { type: 'button', class: 'dk-tab' + (on ? ' on' : ''), role: 'tab', 'aria-selected': String(on) }, x[1], el('span', { class: 'dk-tab-n' }, x[0] !== 'all' && counts[x[0]] ? String(counts[x[0]]) : ''));
    b.addEventListener('click', function () { _dk.msgFilter = x[0]; dkPaintMsgList(); });
    tabs.appendChild(b);
  });
  var lane = list.querySelector('.dk-lane');
  if (lane) lane.remove();
  var foot = list.querySelector('.dk-list-foot');
  if (foot) foot.remove();
  lane = el('div', { class: 'dk-lane' });
  var vis = dkMsgVisible();
  _dk.msgOrder = vis.map(function (x) { return x.r.athlete.id; });
  var me = _dkCoachMeId();
  vis.forEach(function (x) {
    var a = x.r.athlete, on = _dk.msgSel === a.id;
    var row = el('div', { class: 'dk-qrow dk-msg-row' + (on ? ' is-sel' : '') + (x.unread ? ' is-unread' : ''), role: 'option', 'aria-selected': String(on), tabindex: on ? '0' : '-1', 'data-id': a.id });
    var avw = el('span', { class: 'dk-avw' });
    avw.appendChild(dkAv(a));
    if (x.unread) avw.appendChild(el('span', { class: 'dk-unread-dot', title: x.unread + ' unread' }));
    row.appendChild(avw);
    var main = el('div', { class: 'dk-qmain' });
    var top = el('div', { class: 'dk-qtop' });
    top.appendChild(el('span', { class: 'dk-qname' }, a.name));
    if (x.d && x.d.lastAt) top.appendChild(el('span', { class: 'dk-qago' }, _dkAgoShortIso(x.d.lastAt)));
    main.appendChild(top);
    main.appendChild(el('div', { class: 'dk-msg-prev' + (x.d ? '' : ' dk-dim') }, x.d ? (x.d.lastSenderId === me ? 'You: ' : '') + String(x.d.lastBody || 'Sent a set') : 'No messages yet'));
    row.appendChild(main);
    // One mark per row: unread wins (red dot on the avatar); the quiet dot is "read, still unanswered".
    if (x.needs && !x.unread) row.appendChild(el('span', { class: 'dk-needs', title: 'Read, waiting on your reply' }));
    row.addEventListener('click', function () { dkOpenThread(a.id); });
    row.addEventListener('dblclick', function () { openAthletePage(a.id); });
    lane.appendChild(row);
  });
  list.appendChild(lane);
  if (!vis.length) list.appendChild(el('div', { class: 'dk-list-foot' }, (_dk.msgFilter === 'needs' ? 'Nobody is waiting on a reply.' : _dk.msgFilter === 'unread' ? 'Nothing unread.' : 'Nobody matches.')));
  if (hadFocus) { var sel = list.querySelector('.dk-msg-row.is-sel'); if (sel) sel.focus({ preventScroll: true }); }
}
function _dkAgoShortIso(iso) {
  var h = Math.floor((Date.now() - Date.parse(iso)) / 3600000);
  if (!isFinite(h)) return '';
  return h < 1 ? 'now' : h < 24 ? h + 'h' : h < 24 * 7 ? Math.floor(h / 24) + 'd' : fmtDateShort(String(iso).slice(0, 10));
}
function dkOpenThread(id, opts) {
  var centre = document.getElementById('dkMsgCentre');
  if (!centre) return;
  if (centre._msgCleanup) { try { centre._msgCleanup(); } catch (e) {} }
  var box0 = centre.querySelector('.dk-thread');
  if (box0 && box0._msgCleanup) { try { box0._msgCleanup(); } catch (e) {} }
  _dk.msgSel = id;
  centre.innerHTML = '';
  document.querySelectorAll('#messagesArea .dk-msg-row').forEach(function (r) {
    var on = r.dataset.id === id;
    r.classList.toggle('is-sel', on); r.setAttribute('aria-selected', String(on)); r.tabIndex = on ? 0 : -1;
    if (on) { r.scrollIntoView({ block: 'nearest' }); if (opts && opts.key) r.focus({ preventScroll: true }); }
  });
  var r = id ? dkRow(id) : null;
  if (!r) { centre.appendChild(el('div', { class: 'dk-ctx-empty' }, 'Pick a conversation.')); dkSyncCtx(); return; }
  var a = r.athlete;
  var head = el('div', { class: 'dk-msg-head' });
  head.appendChild(dkAv(a));
  var idw = el('div', { class: 'dk-ctx-title' });
  var nb = el('button', { type: 'button', class: 'dk-link', title: 'Open their workspace  ↵' }, a.name);
  nb.insertAdjacentHTML('beforeend', DK_IC.open);
  nb.addEventListener('click', function () { openAthletePage(a.id); });
  idw.appendChild(el('b', {}, nb));
  idw.appendChild(el('span', {}, dkBlockText(r.status)));
  head.appendChild(idw);
  head.appendChild(el('span', { class: 'dk-sp' }));
  var row = dkMsgRows().find(function (x) { return x.r.athlete.id === id; });
  if (row && row.needs) head.appendChild(dkBtn('Done', { kbd: 'E', icon: ICONS.check, cls: 'dk-btn-sm', onClick: dkMsgDone, title: 'Nothing to answer. It comes back if they write again.' }));
  centre.appendChild(head);
  var u = _dkUser();
  var box = el('div', { class: 'dk-thread' });
  centre.appendChild(box);
  renderMessageThread(box, { coachId: u.id, athleteId: a.id, viewerId: u.id, otherName: _dkFirst(a.name), markRead: true,
    onRead: function () { var un = _dkUnread(); if (un[a.id]) { un[a.id] = 0; if (typeof refreshUnreadBadges === 'function') { try { refreshUnreadBadges(); } catch (e) {} } } dkPaintRail(); setTimeout(dkPaintMsgList, 0); },
    onSent: function (m) {
      dkNoteHandled(a.id, 'reply');
      dkNoteSent(a.id, m && m.body);
      var done = centre.querySelector('.dk-msg-head .dk-btn');   // answered: nothing left to mark done
      if (done) done.remove();
      setTimeout(function () { dkPaintMsgList(); dkPaintRail(); }, 0);
    },
    emptyText: dkReplyPrompt(r) });
  centre._msgCleanup = function () { if (box._msgCleanup) { try { box._msgCleanup(); } catch (e) {} } };
  dkSyncCtx();
  dkPaintMsgCtx();
}
function dkMsgMove(step) {
  var o = _dk.msgOrder || [];
  if (!o.length) return;
  var i = o.indexOf(_dk.msgSel);
  var n = i < 0 ? 0 : Math.max(0, Math.min(o.length - 1, i + step));
  if (o[n] !== _dk.msgSel) dkOpenThread(o[n], { key: true });
}
// E: nothing to answer here. The thread leaves Needs reply until they write again.
function dkMsgDone() {
  var id = _dk.msgSel;
  var x = dkMsgRows().find(function (y) { return y.r.athlete.id === id; });
  if (!x || !x.d) return;
  var st = dkState();
  st.msgDone = st.msgDone || {};
  st.msgDone[id] = x.d.lastAt;
  dkSaveState();
  var o = _dk.msgOrder || [], i = o.indexOf(id);
  dkPaintMsgList();
  if (_dk.msgFilter === 'needs') { var o2 = _dk.msgOrder || []; dkOpenThread(o2[Math.min(i, o2.length - 1)] || null, { key: true }); }
  else dkOpenThread(id, { key: true });
  toast(_dkFirst(x.r.athlete.name) + ' marked done');
}
// The side pane next to a thread: who this is, this week, the last three sessions.
function dkPaintMsgCtx() {
  var host = dkCtxHost();
  if (!host || _dk.screen !== 'messages') return;
  dkCtxClear();
  if (!dkCtxReady()) return;
  var r = _dk.msgSel ? dkRow(_dk.msgSel) : null;
  if (!r) return;
  var a = r.athlete;
  host.dataset.aid = 'msg:' + a.id;
  var pv = el('div', { class: 'dk-pv dk-msgctx' });
  var flags = r.reasons.map(function (x) { return { text: x.text, tone: x.tone }; }).concat(r.wins.map(function (w) { return { text: w.text, tone: 'win' }; }));
  var blk = el('div', { class: 'dk-msgctx-block' });
  blk.appendChild(el('b', {}, dkBlockText(r.status)));
  blk.appendChild(el('span', {}, r.live ? 'Training now' : r.status.ago == null ? 'Not started' : 'Last trained ' + agoText(r.status.ago).toLowerCase() + (r.status.sessions.planned ? ' · ' + r.status.sessions.done + ' of ' + r.status.sessions.planned + ' this week' : '')));
  pv.appendChild(blk);
  // What's going on with them, one status per line: the dot in its colour, the words in ink.
  if (flags.length) {
    var ch = el('ul', { class: 'dk-flags' });
    flags.forEach(function (x) { ch.appendChild(el('li', {}, el('i', { class: 'dk-dot t-' + ({ alert: 'alert', warn: 'warn', meet: 'gold', win: 'gold' }[x.tone] || 'none'), 'aria-hidden': 'true' }), dkRich(x.text))); });
    pv.appendChild(ch);
  }
  var ses = dkLastSessions(a.id, 3);
  if (ses.length) {
    var sl = el('div', { class: 'dk-ses' });
    ses.forEach(function (s) {
      var row = el('div', { class: 'dk-ses-row' });
      row.appendChild(el('span', { class: 'dk-ses-date' }, fmtDateShort(s.date)));
      var tops = el('div', { class: 'dk-ses-tops' });
      s.tops.forEach(function (t) { tops.appendChild(el('span', { class: 'dk-ses-top lift-' + (MAIN_LIFTS.indexOf(t.lift) >= 0 ? t.lift : 'acc') }, el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }), t.text)); });
      row.appendChild(tops);
      sl.appendChild(row);
    });
    pv.appendChild(dkSection('Last sessions', sl));
  }
  if (r.meet) {
    var mt = el('div', { class: 'dk-meetline' });
    mt.appendChild(el('b', {}, r.meet.meet.name));
    mt.appendChild(el('span', {}, fmtDateShort(r.meet.meet.date) + ' · ' + (r.meet.days <= 0 ? 'today' : r.meet.days === 1 ? 'tomorrow' : r.meet.days + ' days') + (r.meet.meet.weightClass ? ' · ' + r.meet.meet.weightClass : '') + (r.bw ? ' · BW ' + _num(kgToDisplay(r.bw.bw, 1)) + ' ' + unitLabel() : '')));
    pv.appendChild(dkSection('Next meet', mt));
  }
  var fc = _dkFormChecks().filter(function (f) { return f.athleteId === a.id; }).sort(function (x, y) { return String(y.createdAt).localeCompare(String(x.createdAt)); })[0];
  if (fc) {
    var fr = el('div', { class: 'dk-reason' });
    fr.appendChild(el('span', { class: 'dk-reason-detail' }, el('span', {}, (fc.lift && fc.lift !== 'other' ? LIFT_LABELS[fc.lift] || fc.lift : 'Video') + ' · ' + (fc.coachReply ? 'reviewed' : 'waiting on you'))));
    fr.appendChild(dkBtn('Review', { cls: 'dk-btn-sm is-quiet', onClick: function () { openFormCheckReview(fc.id); } }));
    pv.appendChild(dkSection('Latest form check', el('div', { class: 'dk-reasons' }, fr)));
  }
  host.appendChild(pv);
  host.appendChild(dkNotesBox(a.id));
}
// Their last n training days: the heaviest set of each lift, with its RPE.
function dkLastSessions(aid, n) {
  var by = {};
  (Store.get().workoutLogs || []).forEach(function (l) { if (l.athleteId === aid) (by[l.date] = by[l.date] || []).push(l); });
  return Object.keys(by).sort().reverse().slice(0, n).map(function (d) {
    var top = {};
    by[d].forEach(function (l) { var k = l.lift + '|' + (l.variant || '') + '|' + (l.exerciseName || ''); if (!top[k] || Number(l.weight) > Number(top[k].weight)) top[k] = l; });
    return { date: d, tops: Object.keys(top).map(function (k) { var l = top[k];
      var name = MAIN_LIFTS.indexOf(l.lift) >= 0 ? ((l.variant && l.variant !== 'Competition' ? l.variant + ' ' : '') + LIFT_LABELS[l.lift]) : (l.exerciseName || 'Set');
      return { lift: l.lift, text: name + ' ' + (Number(l.weight) > 0 ? _num(kgToDisplay(l.weight)) + '×' : '') + Number(l.reps) + (l.rpe ? ' @' + _num(l.rpe) : '') }; }).slice(0, 3) };
  });
}

// =====================================================================
// SETTINGS (W1b): a two-column page in place of the stretched You list.
// A left sub-nav (monochrome icons), the section on the right, built
// from the same sheets the phone uses.
// =====================================================================
var DK_SET_IC = {
  profile: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/></svg>',
  checkins: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="5" width="16" height="15" rx="3"/><path d="M8 3v4M16 3v4M4 10h16M9 14.5l2 2 4-4"/></svg>',
  brand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1-.1-2.2 1.1-2.2H17a4 4 0 0 0 4-4c0-4.4-4-8-9-8z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10.5" cy="7.5" r="1"/><circle cx="15" cy="8" r="1"/></svg>',
  market: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9l1.5-5h13L20 9"/><path d="M4 9h16v11H4z"/><path d="M9 13h6"/></svg>',
  athletes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0 1 12 0"/><path d="M17 8v6M14 11h6"/></svg>',
  prefs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/></svg>',
  keys: DK_IC.key,
  help: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3"/><path d="M12 17h.01"/></svg>'
};
function dkSettingsSections() {
  var native = document.documentElement.classList.contains('native');
  return [['profile', 'Profile'], ['plan', 'Plan & seats'], ['checkins', 'Check-ins'], ['brand', 'Branding'], native ? null : ['market', 'Marketplace'],
    ['athletes', 'Invite athletes'], ['prefs', 'Preferences'], ['keys', 'Keyboard'], ['help', 'Help & account']].filter(Boolean);
}
// coach.html's renderCoachYou hands the desk its area.
function deskRenderSettings(area) {
  if (!area) return;
  area.innerHTML = '';
  area.classList.add('dk-set');
  var secs = dkSettingsSections();
  if (!_dk.setSec) _dk.setSec = _dkLS('powa-desk-set') || 'profile';
  if (!secs.some(function (s) { return s[0] === _dk.setSec; })) _dk.setSec = 'profile';
  var nav = el('nav', { class: 'dk-set-nav', 'aria-label': 'Settings' });
  nav.appendChild(el('h1', { class: 'dk-h1' }, 'Settings'));
  secs.forEach(function (s) {
    var on = _dk.setSec === s[0];
    var b = el('button', { type: 'button', class: 'dk-item' + (on ? ' on' : ''), 'aria-current': on ? 'page' : 'false', html: DK_SET_IC[s[0]] });
    b.appendChild(el('span', { class: 'dk-item-label' }, s[1]));
    b.addEventListener('click', function () { _dk.setSec = s[0]; _dkLS('powa-desk-set', s[0]); deskRenderSettings(area); });
    nav.appendChild(b);
  });
  area.appendChild(nav);
  var panel = el('div', { class: 'dk-set-panel' });
  var title = secs.find(function (s) { return s[0] === _dk.setSec; })[1];
  panel.appendChild(el('h2', { class: 'dk-set-title' }, title));
  var redraw = function () { deskRenderSettings(area); try { dkPaintRail(); } catch (e) {} };
  ({ profile: dkSetProfile, plan: dkSetPlan, checkins: dkSetCheckins, brand: dkSetBrand, market: dkSetMarket, athletes: dkSetAthletes, prefs: dkSetPrefs, keys: dkSetKeys, help: dkSetHelp })[_dk.setSec](panel, redraw);
  area.appendChild(panel);
}
// One settings row: label + value on the left, the action on the right.
function dkSetRow(label, value, action) {
  var r = el('div', { class: 'dk-set-row' });
  var t = el('div', { class: 'dk-set-txt' });
  t.appendChild(el('span', { class: 'dk-set-label' }, label));
  if (value) t.appendChild(el('span', { class: 'dk-set-val' }, value));
  r.appendChild(t);
  if (action) r.appendChild(action);
  return r;
}
function dkSetGroup(rows) { var g = el('div', { class: 'dk-set-group' }); rows.filter(Boolean).forEach(function (r) { g.appendChild(r); }); return g; }
function dkSetProfile(p, redraw) {
  var u = _dkUser() || {};
  var card = el('div', { class: 'dk-set-me' });
  var av = dkAv(u, 'is-xl');
  card.appendChild(av);
  var who = el('div', { class: 'dk-set-who' });
  var nm = el('div', { class: 'dk-set-name' });
  nm.appendChild(el('b', {}, u.name || 'You'));
  nm.appendChild(dkBtn('Edit', { cls: 'dk-btn-sm', onClick: function () { openProfileSheet(redraw); } }));
  who.appendChild(nm);
  who.appendChild(el('span', { class: 'dk-set-val' }, u.email || ''));
  if (u.bio) who.appendChild(el('p', { class: 'dk-set-bio' }, u.bio));
  card.appendChild(who);
  p.appendChild(card);
  p.appendChild(dkSetGroup([
    dkSetRow('Photo', u.avatarUrl ? 'Shown to your athletes' : 'None yet', dkBtn(u.avatarUrl ? 'Change' : 'Add a photo', { cls: 'dk-btn-sm is-quiet', onClick: function () { pickAvatar(redraw); } })),
    dkSetRow('Instagram', u.instagram ? '@' + u.instagram : 'Not linked', dkBtn('Edit', { cls: 'dk-btn-sm is-quiet', onClick: function () { openProfileSheet(redraw); } })),
    dkSetRow('Public profile', 'What lifters see before they join', el('a', { class: 'dk-btn dk-btn-sm is-quiet', href: 'coach-profile.html?id=' + encodeURIComponent(u.id || ''), target: '_blank', rel: 'noopener' }, 'Open'))
  ]));
}
function dkSetPlan(p) {
  var t = getCurrentTier(), lim = getCurrentTierLimit(), u = _dkUser() || {};
  var n = u.id ? getAthleteCount(u.id) : 0;
  var seats = el('div', { class: 'dk-set-seats' });
  seats.appendChild(el('div', { class: 'dk-set-seats-top' }, el('b', {}, TIER_LABELS[t] || t), el('span', {}, lim >= 9999 ? n + ' athletes · no limit' : n + ' of ' + lim + ' seats used')));
  if (lim < 9999) {
    var bar = el('div', { class: 'dk-meter', role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': String(lim), 'aria-valuenow': String(n), 'aria-label': 'Seats used' });
    bar.appendChild(el('i', { style: 'transform:scaleX(' + Math.min(1, n / Math.max(1, lim)).toFixed(3) + ')' }));
    seats.appendChild(bar);
  }
  p.appendChild(seats);
  var end = u.subscriptionPeriodEnd ? new Date(u.subscriptionPeriodEnd) : null;
  p.appendChild(dkSetGroup([
    dkSetRow('Plan', (TIER_LABELS[t] || t) + (end && t !== 'free' ? ' · renews ' + end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : ''), dkBtn(t === 'free' ? 'See plans' : 'Change plan', { cls: 'dk-btn-sm', onClick: function () { openPlanSheet(); } })),
    dkSetRow('Pending invites', String((Store.get().invites || []).filter(function (i) { return i.coachId === u.id && !i.used; }).length) + ' (an unused invite holds a seat)', null),
    dkSetRow('Refer a coach', 'A month free for each one who subscribes', dkBtn('Get your link', { cls: 'dk-btn-sm is-quiet', onClick: function () { openReferralSheet(); } }))
  ]));
}
function dkSetCheckins(p, redraw) {
  var me = _dkCoachMeId();
  var qs = (Store.get().checkinQuestions || []).filter(function (q) { return q.coachId === me; }).sort(function (a, b) { return (a.position || 0) - (b.position || 0); });
  p.appendChild(el('p', { class: 'dk-set-lead' }, 'What your athletes answer on their phone. Daily ones once a day, weekly ones once a week. Pain said yes puts them at the top of Today.'));
  var kind = { scale: '1 to 10', number: 'A number', yesno: 'Yes or no', choice: 'A choice', text: 'Free text' };
  var g = el('div', { class: 'dk-set-group' });
  qs.forEach(function (q) {
    var who = q.athleteIds && q.athleteIds.length ? q.athleteIds.length + (q.athleteIds.length === 1 ? ' athlete' : ' athletes') : 'Everyone';
    g.appendChild(dkSetRow(q.prompt, [kind[q.kind] || q.kind, q.cadence === 'weekly' ? 'weekly' : 'daily', who, q.active === false ? 'off' : null].filter(Boolean).join(' · '),
      dkBtn('Edit', { cls: 'dk-btn-sm is-quiet', onClick: function () { openCheckinQuestionEditor(q, redraw); } })));
  });
  if (!qs.length) g.appendChild(dkSetRow('No questions yet', 'Start from the usual four (sleep, soreness, pain, nutrition) or write your own.', null));
  p.appendChild(g);
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn('Add a question', { cls: 'is-ink', icon: ICONS.plus, onClick: function () { openCheckinQuestionEditor(null, redraw); } }));
  acts.appendChild(dkBtn('All questions', { cls: 'is-quiet', onClick: function () { openCheckinQuestionsSheet(); } }));
  p.appendChild(acts);
}
function dkSetBrand(p) {
  var u = _dkUser() || {};
  var pro = (TIER_RANK[getCurrentTier()] || 0) >= TIER_RANK.pro;
  p.appendChild(el('p', { class: 'dk-set-lead' }, 'Your team name, logo and colour on your athletes’ app. Pro and Premium.'));
  var has = !!(u.brandName || u.brandLogoUrl || u.brandColor);
  var sw = u.brandColor ? el('span', { class: 'dk-swatch', style: 'background:' + (/^#[0-9a-f]{6}$/i.test(u.brandColor) ? u.brandColor : 'transparent') }) : null;
  p.appendChild(dkSetGroup([
    dkSetRow('Team name', u.brandName || (has ? 'Not set' : 'Off'), null),
    dkSetRow('Colour', u.brandColor ? u.brandColor : 'POWALIFTA red', sw),
    dkSetRow('Logo', u.brandLogoUrl ? 'Uploaded' : 'None', null)
  ]));
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn(pro ? 'Edit branding' : 'See what Pro adds', { cls: 'is-ink', onClick: function () { openBrandSheet(); } }));
  p.appendChild(acts);
}
function dkSetMarket(p) {
  var s = Store.get(), me = _dkCoachMeId();
  var mine = (s.marketplacePrograms || []).filter(function (x) { return x.coachId === me; });
  var live = mine.filter(function (x) { return x.status === 'published'; }).length;
  var sales = (s.mySales || []).filter(function (x) { return x.payoutStatus !== 'cancelled'; });
  var earned = sales.reduce(function (a, x) { return a + (Number(x.coachPayoutCents) || 0); }, 0);
  p.appendChild(el('p', { class: 'dk-set-lead' }, 'Sell your templates to lifters training on their own. You keep 80%, paid out monthly.'));
  p.appendChild(dkSetGroup([
    dkSetRow('Listings', mine.length ? mine.length + ' · ' + live + ' live' : 'None yet', null),
    dkSetRow('Sales', sales.length ? sales.length + ' · $' + (earned / 100).toFixed(2) + ' earned' : 'None yet', null)
  ]));
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn('Open your listings', { cls: 'is-ink', onClick: function () { var t = document.getElementById('tab-marketplace'); if (t) t.click(); } }));
  acts.appendChild(dkBtn('List a template', { cls: 'is-quiet', onClick: function () { _dk.pbMode = 'templates'; deskGo('programs'); } }));
  p.appendChild(acts);
}
function dkSetPrefs(p, redraw) {
  var light = document.documentElement.getAttribute('data-theme') === 'light';
  var compact = document.documentElement.getAttribute('data-density') === 'compact';
  var seg = function (label, opts, cur, pick) {
    var s = el('div', { class: 'dk-seg', role: 'radiogroup', 'aria-label': label });
    opts.forEach(function (o) {
      var on = o[0] === cur;
      var b = el('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) }, o[1]);
      b.addEventListener('click', function () { if (!on) pick(o[0]); });
      s.appendChild(b);
    });
    return s;
  };
  p.appendChild(dkSetGroup([
    dkSetRow('Theme', null, seg('Theme', [['dark', 'Dark'], ['light', 'Light']], light ? 'light' : 'dark', function () { toggleTheme(); redraw(); })),
    dkSetRow('Weights', null, seg('Units', [['kg', 'kg'], ['lbs', 'lb']], getUnit(), function () { toggleUnit(); })),
    dkSetRow('Rows', null, seg('Row density', [['comfy', 'Comfortable'], ['compact', 'Compact']], compact ? 'compact' : 'comfy', function () { dkToggleDensity(); redraw(); })),
    dkSetRow('Notifications', 'Pushes and emails you get', dkBtn('Edit', { cls: 'dk-btn-sm is-quiet', onClick: function () { openNotificationsSheet(); } })),
    dkSetRow('Security', 'Password and sign-in', dkBtn('Edit', { cls: 'dk-btn-sm is-quiet', onClick: function () { openSecuritySheet(); } })),
    dkSetRow('Your data', 'Download everything, or delete your account', dkBtn('Open', { cls: 'dk-btn-sm is-quiet', onClick: function () { openDataSheet(); } }))
  ]));
}
function dkKeyGroups() {
  var mod = _dkMac() ? '⌘' : 'Ctrl ';
  return [
    ['Everywhere', [[mod + 'K', 'Command palette'], ['?', 'Shortcuts'], ['[', 'Fold the sidebar'], [']', 'Open or close the side card'], ['/', 'Search'], ['Esc', 'Close the card']]],
    ['Today', [['J  K', 'Next and previous athlete'], ['E', 'Done for this week'], ['S', 'Snooze till tomorrow'], ['U', 'Undo'], ['R', 'Message'], ['N', 'Private note'], ['P', 'Open their program'], ['↵', 'Open their page'], ['X', 'Pick a win'], [mod + '⇧K', 'Send kudos']]],
    ['Their week', [['J  K', 'Next and previous'], ['Tab', 'Take a suggested load'], ['⇧A', 'Take every suggestion'], ['↵', 'Save, go down'], ['R', 'Message'], ['N', 'Private note'], ['P', 'Program'], ['Esc', 'Back to the list']]],
    ['Roster', [['V', 'Board or list'], ['J  K', 'Move down and up'], ['X', 'Select the row (board)'], ['R', 'Message'], ['P', 'Open their program'], ['↵', 'Open their page'], ['Esc', 'Clear the search or selection']]],
    ['Program builder', [['←  →', 'Previous and next week'], ['1–9', 'Go to a week'], ['V', 'Sessions or Progression'], ['E', 'Write the first exercise'], ['↵  ↑ ↓', 'Save, next exercise'], [mod + '⇧R', 'Progress it through the block'], [mod + 'D', 'Same as the week before'], [']', 'Exercise details'], [mod + 'Z', 'Undo']]],
    ['Messages', [['J  K', 'Next and previous thread'], ['E', 'Done, nothing to answer'], ['R', 'Reply'], ['↵', 'Open their page'], ['/', 'Search messages']]]
  ];
}
function dkSetKeys(p) {
  var cols = el('div', { class: 'dk-keys-cols dk-set-keys' });
  dkKeyGroups().forEach(function (g) {
    var col = el('div', { class: 'dk-keys-col' });
    col.appendChild(el('h3', { class: 'dk-sec-title' }, g[0]));
    g[1].forEach(function (k) {
      var row = el('div', { class: 'dk-keys-row' });
      row.appendChild(el('span', {}, k[1]));
      var kk = el('span', { class: 'dk-keys-k' });
      k[0].split('  ').forEach(function (x) { kk.appendChild(dkKbd(x)); });
      row.appendChild(kk);
      col.appendChild(row);
    });
    cols.appendChild(col);
  });
  p.appendChild(cols);
}
function dkSetHelp(p) {
  p.appendChild(dkSetGroup([
    dkSetRow('Ask AI', 'Questions about a lifter, a block, or the app', dkBtn('Ask', { cls: 'dk-btn-sm is-quiet', onClick: function () { openAIAssistant(); } })),
    dkSetRow('Help and support', 'How things work, and a person when you need one', dkBtn('Open', { cls: 'dk-btn-sm is-quiet', onClick: function () { openAIAssistant('support'); } })),
    dkSetRow('Log out', null, dkBtn('Log out', { cls: 'dk-btn-sm is-quiet', onClick: function () { logout(); } }))
  ]));
}

// =====================================================================
// FIRST RUN (W1b): Today for a coach with nobody yet. How do you coach,
// three steps, and a sample roster of what it becomes, dense and specific.
// =====================================================================
function _dkStyleKey() { var u = _dkUser(); return 'powa-coach-style-' + (u ? u.id : 'x'); }
function dkCoachStyle() { return _dk.coachStyle || (window._demoMode ? null : _dkLS(_dkStyleKey())); }
function dkFirstRun() {
  var u = _dkUser() || {};
  var raw = typeof coachSetupSteps === 'function' ? coachSetupSteps() : [];
  // Lead with what only a live platform does: lifters first (their sets land here as they lift),
  // then the block written here for them. Pasting an old block is the quiet second way in.
  var aths = (_dk.rows || []).map(function (r) { return r.athlete; });
  var steps = raw.length === 3 ? [
    Object.assign({}, raw[1], { title: 'Invite your lifters', label: 'Invite', sub: raw[1].done ? raw[1].sub : 'One link each. Every set they log lands on your desk, live, with their Apple Health readiness.' }),
    Object.assign({}, raw[0], { title: 'Write their first block', label: aths.length ? 'Write a block' : null,
      sub: raw[0].done ? raw[0].sub : 'Sets, reps and RPE the way you write them; each lifter gets loads from their own maxes.',
      write: aths.length ? function () { openAthleteProgram(aths[0].id); } : null, paste: raw[0].done ? null : raw[0].onClick }),
    Object.assign({}, raw[2], { label: 'Add a photo' })
  ] : raw;
  var done = steps.filter(function (x) { return x.done; }).length;
  var wrap = el('div', { class: 'dk-fr' });
  var left = el('div', { class: 'dk-fr-main' });
  left.appendChild(el('h1', { class: 'dk-h1' }, 'Welcome' + (u.name ? ', ' + _dkFirst(u.name) : '')));
  left.appendChild(el('p', { class: 'dk-fr-lead' }, done === steps.length && steps.length ? 'You’re set. Your athletes land here the moment they sign up with your link.' : 'Three steps and Today starts telling you who needs you.'));
  var style = dkCoachStyle() || 'solo';   // nothing chosen yet reads as Individuals, and says so
  var q = el('div', { class: 'dk-fr-q' });
  q.appendChild(el('h2', { class: 'dk-sec-title' }, 'How do you coach?'));
  var seg = el('div', { class: 'dk-fr-opts', role: 'radiogroup', 'aria-label': 'How do you coach?' });
  [['solo', 'Individuals', 'A program per lifter'], ['team', 'A team on one plan', 'One block, many lifters']].forEach(function (o) {
    var on = style === o[0];
    var b = el('button', { type: 'button', class: 'dk-fr-opt' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) });
    b.appendChild(el('i', { class: 'dk-fr-check', 'aria-hidden': 'true', html: on ? ICONS.check : '' }));
    b.appendChild(el('b', {}, o[1]));
    b.appendChild(el('span', {}, o[2]));
    b.addEventListener('click', function () {
      _dk.coachStyle = o[0];
      if (!window._demoMode) _dkLS(_dkStyleKey(), o[0]);
      // The answer sets where the builder starts: a team plan begins as a template everyone gets.
      _dk.pbMode = o[0] === 'team' ? 'templates' : 'athletes';
      renderDeskToday();
    });
    seg.appendChild(b);
  });
  q.appendChild(seg);
  left.appendChild(q);
  var list = el('ol', { class: 'dk-fr-steps' });
  var next = steps.findIndex(function (x) { return !x.done; });
  steps.forEach(function (x, i) {
    var li = el('li', { class: 'dk-fr-step' + (x.done ? ' is-done' : i === next ? ' is-next' : '') });
    var num = el('span', { class: 'dk-fr-num', 'aria-hidden': 'true', html: x.done ? ICONS.check : String(i + 1) });
    li.appendChild(num);
    var main = el('div', { class: 'dk-fr-step-main' });
    var title = x.write !== undefined && style === 'team' && !x.done ? 'Write the team’s first block' : x.title;
    main.appendChild(el('b', {}, title));
    main.appendChild(el('span', {}, x.sub));
    // The second way in, said quietly under the step: a block already written elsewhere.
    if (x.paste) { var pl = el('button', { type: 'button', class: 'dk-link dk-fr-alt' }, 'Or paste a block you already wrote'); pl.addEventListener('click', x.paste); main.appendChild(pl); }
    li.appendChild(main);
    var label = x.done ? 'Open' : x.label || (x.write !== undefined ? null : 'Open');
    if (label) li.appendChild(dkBtn(label, { primary: i === next, cls: i === next ? '' : 'is-quiet', onClick: x.write || x.onClick }));
    if (x.done) li.setAttribute('aria-label', x.title + ', done');
    list.appendChild(li);
  });
  left.appendChild(list);
  left.appendChild(el('p', { class: 'dk-fr-foot' }, done + ' of ' + steps.length + ' done'));
  wrap.appendChild(left);
  wrap.appendChild(dkFrSample());
  return wrap;
}
// What the desk looks like with a roster: eight specific rows, a meet column, real flags.
function dkFrSample() {
  var box = el('div', { class: 'dk-fr-sample', 'aria-hidden': 'true' });
  box.inert = true;
  var hd = el('div', { class: 'dk-fr-sample-head' });
  hd.appendChild(el('b', {}, 'Your roster, once they join'));
  hd.appendChild(el('span', { class: 'dk-chip' }, 'Sample'));
  box.appendChild(hd);
  // The rows exactly as Today draws them: the week's ring, the name, one sentence, one tag.
  var rows = [
    ['Priya Shah', 2, 4, 'Pain today · L knee, squat 4/10', 'Meet 9d', 'meet', 'alert'],
    ['Marcus Doyle', 3, 4, 'Bench @9.5 against @8 written · cut 1.1 kg over 83', '2d', '', 'alert'],
    ['Kofi Mensah', 1, 3, 'Message 31h · “Can we move Thursday to Friday?”', '1d', '', 'info'],
    ['Jonah Reed', 0, 4, 'Quiet 9d · missed 2 sessions', '9d', '', 'warn'],
    ['Leo Grant', 3, 3, 'Squat PR · 4-week streak', 'Today', '', 'win']
  ];
  var lane = el('div', { class: 'dk-lane dk-fr-lane' });
  rows.forEach(function (x) {
    var r = { athlete: { id: 'sample-' + x[0], name: x[0] }, status: { sessions: { done: x[1], planned: x[2] } }, live: null };
    var row = el('div', { class: 'dk-qrow is-sample' });
    row.appendChild(dkRingAv(r));
    var main = el('div', { class: 'dk-qmain' });
    main.appendChild(el('div', { class: 'dk-qtop' }, el('span', { class: 'dk-qname' }, x[0]), el('span', { class: 'dk-qago' + (x[5] ? ' is-' + x[5] : '') }, x[4])));
    var lead = x[3].split(' · ')[0];
    main.appendChild(dkQLine(x[6] === 'win' ? { reasons: [], wins: [{ text: lead }] } : { reasons: [{ text: lead, tone: x[6] }], wins: [] }, x[6] === 'win' ? 'w' : 'q', x[3]));
    row.appendChild(main);
    lane.appendChild(row);
  });
  box.appendChild(lane);
  return box;
}

// =====================================================================
// THE DESK DEMO: sixteen more lifters (coach.html?demo=1 on a laptop)
// ---------------------------------------------------------------------
// Called by app.js _buildCoachDemoData only under html.desk. Every flag
// the queue knows shows up at least once: pain, a set over target, RPE
// drift, quiet, notes and messages waiting, meets close (one over the
// class), a finished block, a block ending, no program yet, someone
// training right now, PRs and a 4-week streak.
// =====================================================================
// Tested triples from before the block: the e1RM total starts from all three lifts.
function dkSeedBaseline(S, id, b, date, n, mult) {
  MAIN_LIFTS.forEach(function (lift, i) {
    var w = Math.round(b[i] * (mult || 1.1) / 2.5) * 2.5;   // a heavy triple: about where the block's first top sets land
    S.workoutLogs.push({ id: 'demo-dbase-' + n + '-' + i, athleteId: id, lift: lift, variant: 'Competition', exerciseName: '', weight: w, reps: 3, rpe: 8.5,
      e1rm: calcE1RM(w, 3, 8.5), e1rmComp: calcCompE1RM(w, 3, 8.5, lift, 'Competition'), date: date, note: '' });
  });
}
function deskSeedDemo(store, h) {
  var DC = h.coachId, daysAgo = h.daysAgo, now = Date.now(), DAY = 86400000;
  var today = daysAgo(0);
  var seq = 0;
  // Top-set shape per week, oldest → newest (kg added to the base): a wave whose last week stays
  // under its best, or a wave that ends on a PR.
  var SHAPE = { flat: [5, 2.5, 5, 7.5, 2.5, 5], pr: [0, 2.5, 5, 7.5, 2.5, 12.5], up: [0, 2.5, 5, 5, 7.5, 7.5] };
  var people = [
    { n: 'Leo Grant', b: [182.5, 125, 225], last: 1, shape: 'pr', prog: ['Strength Block', 4, 1, 2], bw: 91.2 },
    // Priya and Callum lift today's meet day (meetday.js): their blocks end this week, dated to it.
    { n: 'Priya Shah', b: [115, 67.5, 147.5], last: 1, shape: 'flat', prog: ['Peak', 3, 2, 1], pain: 0, meetToday: 'md-l1', sex: 'female', bw: 62.4 },
    { n: 'Marcus Doyle', b: [210, 150, 250], last: 2, shape: 'flat', prog: ['Strength Block', 4, 1, 2], over: [1, 1.5] },
    { n: 'Elena Rossi', b: [105, 60, 135], last: 1, shape: 'up', prog: ['Peak', 3, 1, 2], meet: ['State Championships', 12, '57 kg', 58.4] },
    { n: 'Jonah Reed', b: [160, 105, 200], last: 12, shape: 'flat', prog: ['Volume Block', 4, 1, 0] },
    { n: 'Mei Tanaka', b: [125, 72.5, 160], last: 2, shape: 'flat', prog: ['Hypertrophy Wave', 6, 3, 1], note: [2, 'Left knee felt tight on the last squat set. Nothing sharp. Keep going as written?'] },
    { n: 'Callum Ward', b: [195, 135, 240], last: 3, shape: 'up', prog: ['Meet Prep', 3, 2, 3], finished: true, meetToday: 'md-l4', sex: 'male', bw: 92.4 },
    { n: 'Ines Duarte', b: [120, 75, 155], last: 1, shape: 'flat', prog: ['Strength Block', 3, 0, 2], drift: true },
    { n: 'Kofi Mensah', b: [220, 160, 265], last: 2, shape: 'up', prog: ['Volume Block', 4, 2, 1], msg: [31, 'Can we move Friday to Saturday this week? Work trip.'] },
    { n: 'Hannah Berg', b: [85, 47.5, 110], last: null, joined: 6, prog: null },
    { n: 'Dev Patel', b: [170, 115, 215], last: 0, streak: 4, shape: 'flat', prog: ['Foundation', 4, 3, 1] },
    { n: 'Sofia Alvarez', b: [140, 82.5, 180], last: 1, shape: 'pr', prog: ['Strength Block', 4, 2, 2], meet: ['Autumn Classic', 34, '76 kg', 75.1] },
    { n: 'Ryan O\'Neill', b: [200, 140, 235], last: 0, shape: 'flat', prog: ['Strength Block', 4, 1, 1], live: true },
    { n: 'Amara Okafor', b: [130, 80, 170], last: 1, shape: 'flat', prog: ['Volume Block', 4, 1, 2], meet: ['Nationals Qualifier', 45, '84 kg', 81.6], rhr: [62, 56, 55, 57, 56, 55, 56] },
    { n: 'Tomas Novak', b: [175, 120, 220], last: 6, shape: 'flat', prog: ['Strength Block', 4, 1, 1], sleep: 5 },
    { n: 'Grace Liu', b: [110, 62.5, 140], last: 1, joined: 20, shape: 'flat', weeks: 3, prog: ['Foundation', 4, 0, 2] }
  ];
  var S = store;
  // The four from the phone demo join the scale: Nina is new this month.
  (S.athletes || []).forEach(function (a) { a.createdAt = now - (a.id === 'demo-a4' ? 9 : 160) * DAY; });
  dkSeedBaseline(S, 'demo-a2', [115, 65, 145], daysAgo(64), 900);
  dkSeedBaseline(S, 'demo-a3', [195, 135, 245], daysAgo(66), 950);
  people.forEach(function (p, pi) {
    var id = 'demo-d' + (pi + 1);
    S.athletes.push({ id: id, name: p.n, email: p.n.toLowerCase().replace(/[^a-z]+/g, '.') + '@demo.com', coachId: DC, avatarUrl: null, countryCode: null, instagram: null, createdAt: now - (p.joined || 90 + pi * 23) * DAY });
    // Training log: squat, bench, deadlift every week, the deadlift on the last day trained.
    if (p.last != null) {
      var weeks = p.weeks || 6, shape = SHAPE[p.shape || 'flat'];
      var dates = [];
      if (!p.joined) dkSeedBaseline(S, id, p.b, daysAgo(70 + pi), ++seq, 0.92);
      if (p.streak) {
        // Exactly p.streak training weeks (Mon/Wed/Fri), ending today: the streak lands on a milestone.
        for (var k = p.streak - 1; k >= 0; k--) {
          var mon = _addDaysISO(_monISO(today), -7 * k);
          [4, 2, 0].forEach(function (o, di) { var d = _addDaysISO(mon, o); if (d <= today) dates.push([d, 2 - di, p.streak - 1 - k]); });
        }
        if (!dates.some(function (x) { return x[0] === today; })) dates.push([today, 2, p.streak - 1]);
      } else {
        for (var w = weeks - 1; w >= 0; w--) [4, 2, 0].forEach(function (o, di) { dates.push([daysAgo(w * 7 + o + p.last), di, weeks - 1 - w]); });
      }
      dates.forEach(function (x) {
        var lift = MAIN_LIFTS[x[1]], base = p.b[x[1]];
        // Sets of five at about 82% of the base: an e1RM near the base, not 25% over it.
        // Each lifter moves at their own rate (and bench slower), so no two trends read the same.
        var rate = [1, 0.7, 1.3, 0.5, 1.6, 0.9, 1.2][pi % 7] * [1, 0.6, 1.15][x[1]];
        var top = base * 0.82 + (shape[Math.max(0, shape.length - (p.streak || weeks) + x[2])] || 0) * rate;
        [[5, 7.5], [5, 8], [3, 8.5]].forEach(function (rr, si) {
          var wgt = Math.round((top - si * 2.5) / 2.5) * 2.5;
          S.workoutLogs.push({ id: 'demo-dlog-' + (++seq), athleteId: id, lift: lift, variant: 'Competition', exerciseName: '', weight: wgt, reps: rr[0], rpe: rr[1],
            e1rm: calcE1RM(wgt, rr[0], rr[1]), e1rmComp: calcCompE1RM(wgt, rr[0], rr[1], lift, 'Competition'), date: x[0], note: '' });
        });
      });
    }
    // The block: past weeks logged, this week partly logged.
    if (p.prog) {
      var pr = p.prog, total = pr[1], cw = pr[2], doneDays = pr[3];
      var wks = [];
      for (var wi = 0; wi < total; wi++) {
        var days = ['Squat Day', 'Bench Day', 'Deadlift Day'].map(function (dn, di) {
          var L = MAIN_LIFTS[di], base = p.b[di] + wi * 2.5;
          var sets = [[3, base, 8], [5, base - 15, 7], [5, base - 15, 7]].map(function (s) {
            return { id: uid('set'), weight: Math.round(s[1] / 2.5) * 2.5, reps: s[0], rpe: s[2], completed: false, actualRpe: null, completedAt: null };
          });
          var logged = p.finished || wi < cw || (wi === cw && di < doneDays);
          if (logged && p.last != null) {
            var when = wi < cw && !p.finished ? daysAgo(p.last + 7 * (cw - wi) + (2 - di) * 2) : daysAgo(p.last + Math.max(0, (Math.min(doneDays, 3) - 1 - di)) * 2);
            sets.forEach(function (s, si) {
              s.completed = true; s.completedAt = when; s.actualRpe = s.rpe;
              if (wi === cw && p.drift) s.actualRpe = s.rpe + 0.5;
              if (wi === cw && p.over && di === p.over[0] && si === 0) s.actualRpe = s.rpe + p.over[1];
            });
            if (p.live && wi === cw && di === 0) {
              // Two sets in, minutes ago: the pulsing "Training now".
              sets.forEach(function (s, si) { if (si < 2) s.completedAt = new Date(now - (14 - si * 7) * 60000).toISOString(); else { s.completed = false; s.actualRpe = null; s.completedAt = null; } });
            }
          }
          return { id: uid('day'), name: dn, exercises: [{ id: uid('ex'), lift: L, variant: 'Competition', exerciseName: '', note: '', sets: sets }] };
        });
        days.push({ id: uid('day'), name: 'Rest', exercises: [] });
        wks.push({ id: uid('wk'), number: wi + 1, days: days });
      }
      var dp = { id: 'demo-dprog-' + (pi + 1), athleteId: id, coachId: DC, name: pr[0], weeks: wks };
      // A block that peaks into today's meet: its last week is this week, and it counts down to today.
      if (p.meetToday) {
        dp.startsOn = _addDaysISO(_monISO(today), -7 * (total - 1)); dp.meetDate = today;
        // Today's meet, planned (meetday.js's board uses the same id and adds the attempts).
        S.meets.push({ id: 'demo-md-meet-' + p.meetToday, athleteId: id, name: 'Autumn Open', date: today, status: 'planned', planned: true, federation: 'USAPL', division: 'Raw Open',
          weightClass: weightClassFor(p.bw, p.sex) || '', weighIn: '2h', weighInAt: today + 'T07:00:00', bodyweight: null, squat: null, bench: null, deadlift: null, notes: '', createdAt: daysAgo(40) + 'T12:00:00Z' });
      }
      S.programs.push(dp);
    }
    // Check-ins, notes, messages, meets, health.
    var ans = function (qi, d, num) { S.checkinAnswers.push({ id: 'demo-dcia-' + (++seq), questionId: 'demo-ciq-' + qi, athleteId: id, coachId: DC, period: daysAgo(d), num: num, text: null }); };
    if (p.last != null && p.last <= 3) for (var d = 0; d < 4; d++) { ans(0, d, [7.5, 8, 7, 7.5][d]); ans(1, d, [4, 3, 5, 4][d]); ans(2, d, 0); }
    if (p.pain != null) { S.checkinAnswers = S.checkinAnswers.filter(function (x) { return !(x.athleteId === id && x.questionId === 'demo-ciq-2' && x.period === daysAgo(p.pain)); }); ans(2, p.pain, 1); }
    if (p.sleep) ans(0, 0, p.sleep);
    if (p.note) S.sessionNotes.push({ id: 'demo-dcn-' + (pi + 1), athleteId: id, weekId: null, dayId: null, date: daysAgo(p.note[0]), note: p.note[1], coachComment: null, coachCommentAt: null, coachId: null });
    if (p.msg) {
      S.messages.push({ id: 'demo-dmsg-' + (pi + 1) + 'a', coachId: DC, athleteId: id, senderId: DC, body: 'Good week. Hold the loads on Friday.', createdAt: new Date(now - (p.msg[0] + 20) * 3600000).toISOString(), readAt: new Date(now - (p.msg[0] + 18) * 3600000).toISOString() });
      S.messages.push({ id: 'demo-dmsg-' + (pi + 1) + 'b', coachId: DC, athleteId: id, senderId: id, body: p.msg[1], createdAt: new Date(now - p.msg[0] * 3600000).toISOString(), readAt: null });
    }
    if (p.meet) {
      S.meets.push({ id: 'demo-dmeet-' + (pi + 1), athleteId: id, name: p.meet[0], date: daysAgo(-p.meet[1]), federation: 'USAPL', weightClass: p.meet[2], bodyweight: null, squat: null, bench: null, deadlift: null, notes: 'Planned', createdAt: daysAgo(30) + 'T12:00:00Z', planned: true });
      [10, 4, 1].forEach(function (dd, i) { S.bodyweight.push({ id: 'demo-dbw-' + id + '-' + dd, athleteId: id, date: daysAgo(dd), weight: Math.round((p.meet[3] + (2 - i) * 0.3) * 10) / 10, unit: 'kg' }); });
    }
    if (p.rhr) p.rhr.forEach(function (v, i) { (S.healthDaily || (S.healthDaily = [])).push({ athleteId: id, day: daysAgo(i), sleepMin: 420 - i * 5, rhr: v }); });
    // Most lifters share Apple Health (a month of resting HR, HRV and sleep); two are run down.
    if (p.last != null && !p.rhr && pi % 5 !== 3) dkSeedHealth(S, id, daysAgo, pi, p.sleep ? 'low' : pi === 2 ? 'low' : 'ok');
    // Weigh-ins for lifters with no meet yet.
    if (p.meetToday) [10, 4, 1].forEach(function (dd, i) { S.bodyweight.push({ id: 'demo-dbw-' + id + '-' + dd, athleteId: id, date: daysAgo(dd), weight: Math.round((p.bw + (2 - i) * 0.3) * 10) / 10, unit: 'kg' }); });
    else if (p.last != null && !p.meet && pi % 4 !== 1) [9, 3].forEach(function (dd, i) { S.bodyweight.push({ id: 'demo-dbw-' + id + '-' + dd, athleteId: id, date: daysAgo(dd), weight: Math.round(((p.bw || p.b[2] / 2.7 + 22) + i * 0.3) * 10) / 10, unit: 'kg' }); });
  });
  dkSeedHealth(S, 'demo-a2', daysAgo, 3, 'ok');
  // Clients + payments (the coach's own ledger, never the lifters'): with the four above, two overdue
  // (Tom 5 days, Tomas 12), two due this week (Sarah in 2 days, Elena in 6), Jonah paused while he's
  // away, Hannah (new, her intake in two days ago, no block yet) with no package set up.
  if (typeof demoClientsSeed === 'function') demoClientsSeed(S, [
    ['demo-d1', 'Hybrid', 260, 'monthly', 9, { startedAgo: 240, method: 'card', note: 'In person on Saturdays, programming online the rest of the week.' }],
    ['demo-d2', 'Meet prep', 220, 'monthly', 24, { startedAgo: 200, method: 'paypal' }],
    ['demo-d3', 'Online coaching', 150, 'monthly', 15, { startedAgo: 320, method: 'bank', period: true, timezone: 'America/Chicago' }],
    ['demo-d4', 'Meet prep', 220, 'monthly', 6, { startedAgo: 130, method: 'card' }],
    ['demo-d5', 'Online coaching', 150, 'monthly', null, { status: 'paused', pausedAgo: 25, startedAgo: 260, method: 'bank', note: 'Paused while he’s away with work. Restart when he’s back.' }],
    ['demo-d6', 'Online coaching', 150, 'monthly', 12, { startedAgo: 180, method: 'paypal' }],
    ['demo-d7', 'Meet prep', 220, 'monthly', 27, { startedAgo: 170, method: 'bank' }],
    ['demo-d8', 'Programming only', 90, '4-weekly', 19, { startedAgo: 150, method: 'card', note: 'Programming only: no check-ins or video review.' }],
    ['demo-d9', 'Online coaching', 150, 'monthly', 22, { startedAgo: 300, method: 'bank', phone: '+1 555 0119' }],
    ['demo-d11', 'Online coaching', 150, 'monthly', 10, { startedAgo: 210, method: 'card' }],
    ['demo-d12', 'Meet prep', 220, 'monthly', 16, { startedAgo: 140, method: 'paypal' }],
    ['demo-d13', 'Online coaching', 150, 'monthly', 25, { startedAgo: 280, method: 'cash' }],
    ['demo-d14', 'Online coaching', 150, 'monthly', 13, { startedAgo: 190, method: 'card' }],
    ['demo-d15', 'Online coaching', 150, 'monthly', -12, { startedAgo: 230, method: 'bank', note: 'Usually pays a few days late. Nudge if it runs past two weeks.' }],
    ['demo-d16', 'Online coaching', 150, 'monthly', 'start', { startedAgo: 20, method: 'card' }]
  ], h);
  // Hannah joined six days ago and sent her intake two days ago; no block yet (the team's next push makes hers).
  (S.intakes || (S.intakes = [])).push({ athleteId: 'demo-d10', coachId: DC, submittedAt: daysAgo(2) + 'T21:08:00Z', updatedAt: daysAgo(2) + 'T21:08:00Z', answers: {
    v: 1, best: { squat: { kg: 85, reps: 3, when: daysAgo(40) }, bench: { kg: 47.5, reps: 5, when: daysAgo(40) }, deadlift: { kg: 110, reps: 2, when: daysAgo(33) } },
    bodyweightKg: 61.8, weightClass: '63', federation: 'USAPL', yearsLifting: '1-2', daysPerWeek: 4, days: ['Mon', 'Tue', 'Thu', 'Sat'], sessionMinutes: 75,
    equipment: ['Belt', 'Knee sleeves', 'Wrist wraps'], injuries: { parts: ['Left knee'], note: 'Patellar tendon gets cranky if I squat more than twice a week.' },
    goals: 'First meet in the spring. Squat 100 kg and pull 130.', meet: { name: 'Spring Novice Open', date: daysAgo(-150), federation: 'USAPL' },
    phone: '+1 555 0198', timezone: 'America/Chicago', instagram: 'hannah.lifts', notes: 'Early shifts at the hospital, so I train after 4 pm.' } });
  // Sarah's three lifts move differently: bench stalls, the deadlift jumps.
  S.workoutLogs.forEach(function (l) {
    if (l.athleteId !== 'demo-a2' || !l.date || l.date < daysAgo(12)) return;
    var dw = l.lift === 'bench' ? -2.5 : l.lift === 'deadlift' && l.date >= daysAgo(7) ? 5 : 0;
    if (!dw) return;
    l.weight += dw;
    l.e1rm = calcE1RM(l.weight, l.reps, l.rpe);
    l.e1rmComp = calcCompE1RM(l.weight, l.reps, l.rpe, l.lift, l.variant || 'Competition');
  });
}
function dkNoise(n) { var x = Math.sin(n * 12.9898 + 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; }
// A month of Apple Health for one demo lifter: resting HR, HRV and sleep around their own norm.
// 'low' lifts the last three days' resting HR and drops HRV, the way a run-down week reads.
function dkSeedHealth(S, id, daysAgo, k, state) {
  var hd = S.healthDaily || (S.healthDaily = []);
  if (hd.some(function (h) { return h.athleteId === id; })) return;
  var rhr0 = 50 + (k * 7) % 12, hrv0 = 58 + (k * 11) % 30;
  var w1 = 0, w2 = 0, w3 = 0;
  for (var i = 29; i >= 0; i--) {
    // A seeded drift (each day leans on the one before), the way real nights and mornings move.
    w1 = w1 * 0.7 + dkNoise(k * 97 + i) * 0.45; w2 = w2 * 0.7 + dkNoise(k * 31 + i * 7) * 0.45; w3 = w3 * 0.6 + dkNoise(k * 13 + i * 3) * 0.5;
    var n1 = w1, n2 = w2, n3 = w3, low = state === 'low' && i <= 2;
    hd.push({ athleteId: id, day: daysAgo(i), rhr: Math.round(rhr0 + n1 * 2.2 + (low ? 9 : 0)), hrv: Math.round(hrv0 + n2 * 6 - n1 * 2 - (low ? 18 : 0)), sleepMin: Math.round(435 + n3 * 38 + (i % 7 === 5 ? 35 : 0) - (low ? 70 : 0)) });
  }
}
