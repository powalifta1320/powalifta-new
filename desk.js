/* =====================================================================
   desk.js: the coach's laptop desk (W1a, 2026-10-22)
   ---------------------------------------------------------------------
   html.desk only (at least 1000px wide and not the iPhone app; set by
   the head script in coach.html). Phones and the app never run any of it.

   The desk is a queue, not a dashboard: a rail (work nav + saved views
   with live counts), Today (who needs the coach, worst first, worked
   with J/K/E until "All caught up", then the Wins lane), the practical
   roster (one-line head, search, density, bulk bar, a preview in the
   context pane), the ⌘K palette and the ? shortcut sheet.

   W1b adds the athlete workspace (Today's centre and #athlete=ID: last
   week against next week with RPE suggestions, lifts, check-ins, notes,
   meets; private notes + thread in the context pane), Programs (grid
   first, a list pane of athletes and templates, an inspector, Notify
   with a count of edits since the last heads-up), Messages as a desk screen, Settings in two columns and
   the first run.

   The logic (reasons, queue, views) is pure and lives in app.js
   (deskReasons / deskQueue / deskViewMatch, unit-tested). This file
   draws it. Loaded after app.js and before coach.html's own script:
   everything here is a function declaration or a var, and anything of
   coach.html's (user, renderRoster, openAthletePage…) is only touched
   at call time, never while this file loads.
   ===================================================================== */

var _dk = {
  booted: false,
  screen: 'today',          // today | roster | programs | messages | club | settings
  view: null,               // the roster's saved view (DESK_VIEWS key) or null
  search: '',
  sel: null,                // Today: the selected athlete
  rsel: null,               // Roster: the previewed athlete
  picked: {},               // Roster: rows ticked for the bulk bar
  wpick: {},                // Today: wins ticked for kudos
  ctxMode: 'preview',       // Roster's context pane: preview | thread
  rows: null,               // last deskRows() result
  queue: null,              // last deskQueue() result
  order: [],                // Today's J/K order: [{ id, lane: 'q' | 'w' }]
  rorder: [],               // Roster's J/K order (ids, as drawn)
  threads: null,            // real accounts: DB.listThreadsForCoach digest
  state: null,              // { week, reviewed, snoozed, winsSeen, times }
  last: null,               // the last E / S, for U (undo)
  wasCaughtUp: null,
  mq: null,
  // W1b
  ws: null,                 // the athlete page's ‹ › list: { ids, label }
  wsPend: {},               // next-week edits waiting on Apply, per athlete
  pbMode: 'athletes',       // Programs' list pane: athletes | templates
  pbTpl: null, pbSearch: '', pbSnap: null, pbInfo: null, pbHead: null,
  msgSel: null, msgFilter: 'all', msgSearch: '', msgOrder: [],
  setSec: null, coachStyle: null
};
var DK_SORT_KEY = 'powa-desk-sort', DK_COLS_KEY = 'powa-desk-cols';

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

// ---------- icons (house style: 24px stroke, currentColor) ----------
var DK_IC = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
  spark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>',
  search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  rail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9 4v16"/></svg>',
  cols: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h10M4 18h6"/></svg>',
  roomy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  dense: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 5h16M4 9.7h16M4 14.3h16M4 19h16"/></svg>',
  chevL: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  chevR: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/></svg>',
  open: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6"/><path d="M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  snooze: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5"/><path d="M5 3L2 6M19 3l3 3"/></svg>',
  more: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  key: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6.5 10h.01M10 10h.01M13.5 10h.01M17 10h.01M7.5 14h9"/></svg>'
};

// ---------- small builders ----------
function dkAv(a, cls) {
  var name = (a && a.name) || '?';
  var av = el('span', { class: 'ui-av dk-av av-h' + avatarHue(name) + (cls ? ' ' + cls : ''), 'data-name': name, 'aria-hidden': 'true' }, initials(name));
  if (a && a.avatarUrl) av.innerHTML = '<img src="' + escHtml(a.avatarUrl) + '" alt="">';
  return av;
}
function dkChip(text, tone) { return el('span', { class: 'dk-chip t-' + (tone || 'info') }, text); }
function dkKbd(k) { return el('kbd', { class: 'dk-kbd' }, k); }
function dkBtn(label, opts) {
  opts = opts || {};
  var b = el('button', { type: 'button', class: 'dk-btn' + (opts.primary ? ' is-primary' : '') + (opts.cls ? ' ' + opts.cls : '') });
  if (opts.icon) b.insertAdjacentHTML('beforeend', opts.icon);
  b.appendChild(el('span', {}, label));
  if (opts.kbd) b.appendChild(dkKbd(opts.kbd));
  if (opts.title) b.title = opts.title;
  if (opts.onClick) b.addEventListener('click', opts.onClick);
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
function dkRowsFresh() {
  var u = _dkUser();
  _dk.rows = u ? deskRows(u.id, { threads: _dk.threads || undefined, formChecks: _dkFormChecks() }) : [];
  var st = dkState();
  _dk.queue = deskQueue(_dk.rows, { reviewed: st.reviewed, snoozed: st.snoozed, winsSeen: st.winsSeen, handled: st.handled });
  return _dk.rows;
}
// The coach acted on them (applied next week, sent a reply): Today's bar counts them as handled
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

// =====================================================================
// BOOT, ROUTING, SHELL
// =====================================================================
// coach.html calls this once at boot on every device: a window that grows past 1000px becomes the
// desk, one that shrinks goes back to the phone layout. The iPhone app never matches.
function deskWatch() {
  if (document.documentElement.classList.contains('native')) return;
  isDesk();
  if (_dk.mq && _dk.mq.addEventListener && !_dk.watching) { _dk.watching = true; _dk.mq.addEventListener('change', dkOnResize); }
  if (isDesk()) deskBoot();
}
function deskBoot() {
  if (!isDesk()) return;
  document.documentElement.classList.add('desk');
  if (!_dk.booted) {
    _dk.booted = true;
    dkBuildRail();
    dkBuildCtx();
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
// The address bar → the screen. #today · #roster · #roster?view=pain · #programs · #messages ·
// #club · #settings. (#athlete=ID is coach.html's athlete page.)
function deskRoute(first) {
  var h = (location.hash || '').replace(/^#/, '');
  if (/^athlete=/.test(h)) return;   // coach.html opens the athlete page itself
  var m = /^(today|roster|programs|messages|club|settings)(?:\?view=(\w+))?$/.exec(h);
  var screen = m ? m[1] : 'today';
  var view = m && m[2] && DESK_VIEWS.some(function (v) { return v.key === m[2]; }) ? m[2] : null;
  if (first && screen !== 'today' && screen !== 'roster') {
    // A legacy screen at boot: the demo boots while coach.html's script is still running, and the
    // builder reads lets declared further down it. A microtask runs once that script is done,
    // before the first paint.
    queueMicrotask(function () { deskGo(screen, { view: view, noPush: true }); });
    return;
  }
  deskGo(screen, { view: view, noPush: true, replace: first && !m });
}
var DK_TAB_FOR = { roster: 'athletes', programs: 'program', messages: 'messages', club: 'club', settings: 'you' };
var DK_SCREEN_FOR = { athletes: 'roster', program: 'programs', templates: 'programs', messages: 'messages', club: 'club', you: 'settings', progress: 'settings', marketplace: 'settings' };
function deskGo(screen, opts) {
  opts = opts || {};
  if (!isDesk()) return;
  closeDkMenus();
  // The roster opens at full width: the preview pane waits for a row to be picked.
  if (screen === 'roster' && _dk.screen !== 'roster') _dk.rsel = null;
  _dk.screen = screen;
  _dk.ws = null;
  if (screen === 'roster') { _dk.view = opts.view || null; _dk.ctxMode = 'preview'; }
  dkSetHash(screen, opts);
  if (screen === 'today') {
    document.querySelectorAll('.sidebar-tab').forEach(function (b) { b.classList.remove('active'); });
    document.querySelectorAll('[data-pane]').forEach(function (p) { p.classList.toggle('hidden', p.dataset.pane !== 'today'); });
    document.body.dataset.accent = 'fire';
    document.body.dataset.screen = 'today';
    renderDeskToday();
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
      : screen === 'roster' ? document.querySelector('#rosterArea .dk-tr.is-sel')
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
    _dk.screen = screen;
    if (screen === 'roster') _dk.view = null;
    dkSetHash(screen, {});
  }
  dkSyncCtx();
  dkPaintRail();
}
// coach.html calls this when the athlete page opens: the rail keeps the screen it came from.
// The athlete page is the workspace: its side pane holds the private notes and the thread.
function deskOnAthletePage() { if (!isDesk()) return; closeDkMenus(); dkSyncCtx(); dkPaintPageCtx(); dkPaintRail(); }
function deskBackLabel() { return ({ today: 'Today', roster: 'Roster', messages: 'Messages', programs: 'Programs', club: 'Club', settings: 'Settings' })[_dk.screen] || 'Roster'; }
function dkOnResize() {
  var on = isDesk();
  document.documentElement.classList.toggle('desk', on);
  if (on) { deskBoot(); return; }
  closeDkMenus();
  document.querySelectorAll('.dk-veil').forEach(function (v) { if (v._close) v._close(); else v.remove(); });
  document.documentElement.classList.remove('ctx-show');
  dkCtxClear();
  // Back to the phone layout: Today and the athlete page have no place there, so land on the
  // roster; a roster already showing redraws as the phone's.
  var t = document.querySelector('[data-pane="today"]'), ap = document.querySelector('[data-pane="athlete"]');
  var tab = document.getElementById('tab-athletes');
  var act = document.querySelector('.sidebar-tab.active');
  _dk.pbInfo = null;
  if ((t && !t.classList.contains('hidden')) || (ap && !ap.classList.contains('hidden'))) { if (tab) tab.click(); }
  // Programs, Messages and Settings were drawn as desk screens: draw them again as the phone's.
  else if (act && /^(program|messages|you)$/.test(act.dataset.tab)) act.click();
  else {
    var ra = document.querySelector('[data-pane="athletes"]');
    if (ra && !ra.classList.contains('hidden') && typeof renderRoster === 'function') { try { renderRoster(); } catch (e) {} }
  }
}
// Today and the roster have a context pane; ] hides it (remembered).
function dkSyncCtx(off) {
  var root = document.documentElement;
  var onPage = !!document.querySelector('[data-pane="athlete"]:not(.hidden)');
  var scr = _dk.screen, has = false;
  if (off) has = false;
  else if (onPage) has = !!window._apAthlete;
  else if (scr === 'today') has = !!_dk.sel;
  else if (scr === 'roster') has = !!(_dk.rows && _dk.rows.length && _dk.rsel);
  else if (scr === 'messages') has = !!(_dk.msgSel && document.querySelector('#messagesArea .dk-msg-list') && !document.querySelector('[data-pane="messages"].hidden'));
  else if (scr === 'programs') has = !!_dk.pbInfo && _dk.pbMode !== 'templates' && deskPbView() === 'grid' && !!document.querySelector('#programArea .pg-grid-wrap') && !document.querySelector('[data-pane="program"].hidden');
  var was = root.classList.contains('ctx-show');
  root.classList.toggle('ctx-show', has && !root.classList.contains('ctx-off'));
  // The grid's cell font and padding change with the inspector: re-measure the columns.
  if (scr === 'programs' && was !== root.classList.contains('ctx-show')) deskGridFit();
  var ctx = document.getElementById('deskCtx');
  if (ctx) ctx.hidden = !has;
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
// A realtime event (a message, a form check): repaint in place, then re-read who wrote last.
function deskRefresh() {
  if (!isDesk() || !_dk.booted) return;
  dkRepaint();
  dkFetchThreads(1200);
}
function dkRepaint() {
  if (!isDesk() || !_dk.booted) return;
  var onPage = !!document.querySelector('[data-pane="athlete"]:not(.hidden)');
  if (_dk.screen === 'today' && !onPage && !document.querySelector('[data-pane="today"].hidden')) {
    var listHadFocus = !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('#deskToday .dk-list'));
    renderDeskToday();
    if (listHadFocus) { var sel = document.querySelector('#deskToday .dk-qrow.is-sel, #deskToday .dk-list'); if (sel) sel.focus({ preventScroll: true }); }
    return;
  }
  dkRowsFresh();
  // The roster's head (and its search box) stays; only the rows and the counts repaint.
  if (_dk.screen === 'roster' && !onPage && document.querySelector('#rosterArea .dk-tablewrap')) { dkPaintTable(); dkPaintRmeta(); }
  // Messages: the list repaints (who wrote last, unread); the open thread updates itself.
  if (_dk.screen === 'messages' && !onPage && document.querySelector('#messagesArea .dk-msg-list')) dkPaintMsgList();
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

// ---------- the rail ----------
function dkBuildRail() {
  if (document.getElementById('deskRail')) return;
  var rail = el('aside', { class: 'dk-rail', id: 'deskRail', 'aria-label': 'Coach desk' });
  var u = _dkUser();
  var top = el('div', { class: 'dk-rail-top' });
  var brand = el('a', { class: 'dk-brand', href: 'coach.html' + (window._demoMode ? location.search : ''), 'aria-label': 'POWALIFTA, Today' });
  brand.innerHTML = BRAND_MARK + '<span class="brand-word">POWALIFTA</span>';
  brand.addEventListener('click', function (e) { e.preventDefault(); deskGo('today'); });
  top.appendChild(brand);
  var fold = el('button', { class: 'dk-icon-btn dk-fold', type: 'button', title: 'Collapse sidebar  [', 'aria-label': 'Collapse sidebar', html: DK_IC.rail });
  fold.addEventListener('click', dkToggleRail);
  top.appendChild(fold);
  rail.appendChild(top);

  var nav = el('nav', { class: 'dk-nav', 'aria-label': 'Work' });
  [['today', 'Today', ICONS.today], ['roster', 'Roster', ICONS.athletes], ['programs', 'Programs', ICONS.program], ['messages', 'Messages', ICONS.chat]].forEach(function (x) {
    var b = el('button', { class: 'dk-item', type: 'button', 'data-go': x[0], title: x[1] });
    b.innerHTML = x[2];
    b.appendChild(el('span', { class: 'dk-item-label' }, x[1]));
    b.appendChild(el('span', { class: 'dk-count', 'data-count': x[0] }));
    b.addEventListener('click', function () { deskGo(x[0]); });
    nav.appendChild(b);
  });
  rail.appendChild(nav);

  var views = el('div', { class: 'dk-views', role: 'group', 'aria-label': 'Saved views' });
  views.appendChild(el('div', { class: 'dk-sub' }, 'Views'));
  // "Needs me" lives in Today's count and the roster's "7 need you" chip: not a third time here.
  DESK_VIEWS.filter(function (v) { return v.key !== 'needs'; }).forEach(function (v) {
    var b = el('button', { class: 'dk-item dk-view', type: 'button', 'data-view': v.key });
    b.appendChild(el('span', { class: 'dk-item-label' }, v.label));
    b.appendChild(el('span', { class: 'dk-count', 'data-vcount': v.key }));
    b.addEventListener('click', function () { deskGo('roster', { view: _dk.screen === 'roster' && _dk.view === v.key ? null : v.key }); });
    views.appendChild(b);
  });
  rail.appendChild(views);

  var foot = el('div', { class: 'dk-rail-foot' });
  [['club', 'Club', ICONS.club, function () { deskGo('club'); }],
   ['settings', 'Settings', DK_IC.gear, function () { deskGo('settings'); }],
   ['ai', 'Ask AI', DK_IC.spark, function () { if (typeof openAIAssistant === 'function') openAIAssistant(); }]].forEach(function (x) {
    var b = el('button', { class: 'dk-item dk-item-quiet', type: 'button', 'data-go': x[0], title: x[1] });
    b.innerHTML = x[2];
    b.appendChild(el('span', { class: 'dk-item-label' }, x[1]));
    b.addEventListener('click', x[3]);
    foot.appendChild(b);
  });
  if (window._demoMode) {
    // The demo's banner, docked: one quiet row instead of a pill over the table.
    var demo = el('div', { class: 'dk-demo' });
    demo.appendChild(el('span', { class: 'dk-demo-text' }, el('b', {}, 'Live demo'), el('span', {}, 'Nothing saves')));
    demo.appendChild(el('a', { class: 'dk-demo-link', href: 'index.html' }, 'Start yours'));
    foot.appendChild(demo);
  }
  var me = el('button', { class: 'dk-me', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', title: (u && u.name) || 'You' });
  me.appendChild(dkAv(u || { name: 'You' }, 'dk-me-av'));
  var who = el('span', { class: 'dk-me-who' });
  who.appendChild(el('span', { class: 'dk-me-name' }, (u && u.name) || 'You'));
  who.appendChild(el('span', { class: 'dk-plan', 'data-plan': '' }));
  me.appendChild(who);
  me.insertAdjacentHTML('beforeend', '<span class="dk-me-more">' + DK_IC.more + '</span>');
  me.addEventListener('click', function (e) { e.stopPropagation(); dkMeMenu(me); });
  foot.appendChild(me);
  rail.appendChild(foot);
  document.body.appendChild(rail);
}
function dkPaintRail() {
  var rail = document.getElementById('deskRail');
  if (!rail) return;
  if (!_dk.rows) dkRowsFresh();
  var rows = _dk.rows || [], q = _dk.queue;
  var athletePage = !!document.querySelector('[data-pane="athlete"]:not(.hidden)');
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
  var counts = { today: q ? q.queue.length : 0, roster: rows.length, messages: unread };
  rail.querySelectorAll('[data-count]').forEach(function (c) {
    var n = counts[c.dataset.count];
    c.textContent = n ? String(n) : '';
    // Today's queue and unread messages need the coach; the roster's total is just a count.
    c.classList.toggle('is-hot', (c.dataset.count === 'today' || c.dataset.count === 'messages') && n > 0);
  });
  var now = Date.now();
  var views = rail.querySelector('.dk-views');
  if (views) views.hidden = !rows.length;   // nobody yet: no empty views to count
  rail.querySelectorAll('[data-vcount]').forEach(function (c) {
    var n = deskViewCount(rows, c.dataset.vcount, now);
    c.textContent = String(n);
    c.closest('.dk-view').classList.toggle('is-zero', !n);
    c.classList.toggle('t-alert', c.dataset.vcount === 'pain' && n > 0);
  });
  var plan = rail.querySelector('[data-plan]');
  if (plan) {
    var t = getCurrentTier(), lim = getCurrentTierLimit(), u = _dkUser();
    var n = u ? getAthleteCount(u.id) : rows.length;
    plan.textContent = (TIER_LABELS[t] || t) + (lim >= 9999 ? ' · ' + n + ' athletes' : ' · ' + n + '/' + lim);
  }
}
function dkToggleRail() {
  var on = document.documentElement.classList.toggle('rail-min');
  _dkLS('powa-desk-rail', on ? 'min' : null);
}
function dkToggleCtx() {
  var root = document.documentElement;
  var off = root.classList.toggle('ctx-off');
  _dkLS('powa-desk-ctx', off ? 'off' : 'on');
  dkSyncCtx();
  if (off) return;
  if (document.querySelector('[data-pane="athlete"]:not(.hidden)')) { dkPaintPageCtx(true); return; }
  if (_dk.screen === 'today') dkPaintTodayCtx();
  if (_dk.screen === 'roster') dkPaintRosterCtx();
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
    var b = el('button', { type: 'button', class: 'dk-menu-item', role: it.check != null ? 'menuitemcheckbox' : 'menuitem' });
    if (it.check != null) { b.setAttribute('aria-checked', String(!!it.check)); b.insertAdjacentHTML('beforeend', '<span class="dk-check">' + (it.check ? ICONS.check : '') + '</span>'); }
    b.appendChild(el('span', { class: 'dk-menu-label' }, it.label));
    if (it.hint) b.appendChild(el('span', { class: 'dk-menu-hint' }, it.hint));
    b.addEventListener('click', function (e) { e.stopPropagation(); if (!it.keep) close(); it.run && it.run(b); });
    m.appendChild(b);
  });
  document.body.appendChild(m);
  var r = anchor.getBoundingClientRect(), mw = m.offsetWidth, mh = m.offsetHeight;
  var left = opts.alignRight ? r.right - mw : r.left;
  var top = opts.above ? r.top - mh - 6 : r.bottom + 6;
  m.style.left = Math.max(8, Math.min(window.innerWidth - mw - 8, left)) + 'px';
  m.style.top = Math.max(8, Math.min(window.innerHeight - mh - 8, top)) + 'px';
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
  var light = document.documentElement.getAttribute('data-theme') === 'light';
  var compact = document.documentElement.getAttribute('data-density') === 'compact';
  dkPopMenu(anchor, [
    { label: light ? 'Dark theme' : 'Light theme', run: function () { toggleTheme(); } },
    { label: 'Show weights in ' + (getUnit() === 'kg' ? 'lb' : 'kg'), run: function () { toggleUnit(); } },
    { label: compact ? 'Comfortable rows' : 'Compact rows', run: dkToggleDensity },
    '-',
    { label: 'Command palette', hint: _dkMac() ? '⌘K' : 'Ctrl K', run: openDeskPalette },
    { label: 'Keyboard shortcuts', hint: '?', run: openDeskKeys },
    '-',
    { label: 'Log out', run: function () { logout(); } }
  ], { above: true });
}

// ---------- the context pane (Today: the thread · Roster: a preview) ----------
function dkBuildCtx() {
  if (document.getElementById('deskCtx')) return;
  var ctx = el('aside', { class: 'dk-ctx', id: 'deskCtx', 'aria-label': 'Details', hidden: '' });
  document.body.appendChild(ctx);
}
function dkCtxHost() { return document.getElementById('deskCtx'); }
function dkCtxReady() { return document.documentElement.classList.contains('ctx-show'); }
// opts.peek: the thread only previews (Today's pane follows J/K): nothing is marked read, and no
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
    onSent: function (m) { dkNoteHandled(a.id, 'reply'); dkNoteSent(a.id, m && m.body); setTimeout(dkRepaint, 0); } });
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

// =====================================================================
// TODAY: who needs me
// =====================================================================
function renderDeskToday() {
  var host = document.getElementById('deskToday');
  if (!host) return;
  dkRowsFresh();
  var rows = _dk.rows, q = _dk.queue, st = dkState();
  host.innerHTML = '';
  host.classList.toggle('is-setup', !rows.length);
  if (!rows.length) {
    // Nobody yet: Today is the first run (how do you coach, three steps, a sample roster).
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
  if (!_dk.sel || ids.indexOf(_dk.sel.id + _dk.sel.lane) < 0) _dk.sel = q.queue.length ? { id: q.queue[0].athlete.id, lane: 'q' } : null;

  var list = el('div', { class: 'dk-list', role: 'listbox', 'aria-label': 'Who needs you', tabindex: '-1' });
  var head = el('div', { class: 'dk-list-head' });
  var h = el('div', { class: 'dk-title-row' });
  h.appendChild(el('h1', { class: 'dk-h1' }, 'Today'));
  h.appendChild(el('span', { class: 'dk-date' }, new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })));
  head.appendChild(h);
  if (q.total) head.appendChild(dkProgressBar(q));
  list.appendChild(head);

  if (q.queue.length) {
    var ql = el('div', { class: 'dk-lane' });
    q.queue.forEach(function (r) { ql.appendChild(dkQueueRow(r, 'q')); });
    list.appendChild(ql);
  } else if (q.snoozed.length) {
    list.appendChild(el('div', { class: 'dk-list-foot' }, q.snoozed.length + ' snoozed till tomorrow'));
  }
  if (q.wins.length) {
    var wl = el('div', { class: 'dk-lane dk-wins', role: 'group', 'aria-label': 'Wins' });
    var wh = el('div', { class: 'dk-lane-head' });
    wh.appendChild(el('span', { class: 'dk-lane-title' }, 'Wins'));
    wh.appendChild(el('span', { class: 'dk-lane-count' }, String(q.wins.length)));
    var picked = Object.keys(_dk.wpick).filter(function (k) { return _dk.wpick[k]; }).length;
    var kb = dkBtn(picked ? 'Kudos to ' + picked : 'Send kudos', { cls: 'dk-btn-sm', onClick: dkKudos, title: 'Send kudos  ' + (_dkMac() ? '⌘⇧K' : 'Ctrl Shift K') });
    wh.appendChild(kb);
    wl.appendChild(wh);
    q.wins.forEach(function (r) { wl.appendChild(dkQueueRow(r, 'w')); });
    list.appendChild(wl);
  }
  if (q.snoozed.length && q.queue.length) {
    list.appendChild(el('div', { class: 'dk-list-foot' }, q.snoozed.length + ' snoozed till tomorrow'));
  }

  var centre = el('div', { class: 'dk-centre', id: 'deskTodayCentre' });
  host.appendChild(list);
  host.appendChild(centre);
  dkPaintTodayCentre();
  dkSyncCtx(!_dk.sel);
  dkPaintTodayCtx();
  dkPaintRail();
  var selEl = list.querySelector('.dk-qrow.is-sel');
  if (selEl) selEl.scrollIntoView({ block: 'nearest' });
}
// Today's bar counts real work, one athlete each: done (E), acted on (applied next week or
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
function dkQueueRow(r, lane) {
  var a = r.athlete;
  var on = _dk.sel && _dk.sel.id === a.id && _dk.sel.lane === lane;
  var row = el('div', { class: 'dk-qrow' + (on ? ' is-sel' : '') + (lane === 'w' && _dk.wpick[a.id] ? ' is-picked' : ''), role: 'option', 'aria-selected': String(!!on), 'data-id': a.id, 'data-lane': lane, tabindex: on ? '0' : '-1' });
  if (lane === 'w') {
    var cb = el('input', { type: 'checkbox', class: 'dk-cb', 'aria-label': 'Select ' + a.name + ' for kudos', tabindex: '-1' });
    cb.checked = !!_dk.wpick[a.id];
    cb.addEventListener('click', function (e) { e.stopPropagation(); _dk.wpick[a.id] = cb.checked; renderDeskToday(); });
    row.appendChild(cb);
  }
  var avw = el('span', { class: 'dk-avw' });
  avw.appendChild(dkAv(a));
  if (r.live) avw.appendChild(el('span', { class: 'dk-live', title: 'Training now' }));
  row.appendChild(avw);
  var main = el('div', { class: 'dk-qmain' });
  var top = el('div', { class: 'dk-qtop' });
  top.appendChild(el('span', { class: 'dk-qname' }, a.name));
  var hd = lane === 'q' && _dk.queue && _dk.queue.handled.indexOf(r) >= 0 ? (dkState().handled[a.id] || {}).via : null;
  if (hd) {
    row.classList.add('is-handled');
    top.appendChild(el('span', { class: 'dk-qago is-handled', html: ICONS.check }, el('span', {}, hd === 'apply' ? 'Week set' : 'Replied')));
  } else top.appendChild(el('span', { class: 'dk-qago' + (r.live ? ' is-live' : '') }, r.live ? 'Training now' : dkAgoShort(r.status.ago)));
  main.appendChild(top);
  var chips = el('div', { class: 'dk-chips' });
  var src = lane === 'w' ? r.wins.map(function (w) { return { text: w.text, tone: 'win' }; }) : r.reasons;
  src.slice(0, 3).forEach(function (x) { chips.appendChild(dkChip(x.text, x.tone)); });
  if (src.length > 3) chips.appendChild(el('span', { class: 'dk-chip-more' }, '+' + (src.length - 3)));
  main.appendChild(chips);
  row.appendChild(main);
  row.addEventListener('click', function () { dkSelect(a.id, lane); });
  row.addEventListener('dblclick', function () { openAthletePage(a.id); });
  return row;
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
  dkPaintTodayCentre();
  dkSyncCtx(false);
  dkPaintTodayCtx();
}
function dkMove(step) {
  if (!_dk.order.length) return;
  var i = _dk.sel ? _dk.order.findIndex(function (o) { return o.id === _dk.sel.id && o.lane === _dk.sel.lane; }) : -1;
  var n = Math.max(0, Math.min(_dk.order.length - 1, i + step));
  if (i < 0) n = step > 0 ? 0 : _dk.order.length - 1;
  dkSelect(_dk.order[n].id, _dk.order[n].lane, true);
}
// E: done for this week. S: snooze till tomorrow. The athlete drops out and the next opens.
function dkMark(kind) {
  if (!_dk.sel) return;
  var r = dkRow(_dk.sel.id);
  if (!r) return;
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
// The centre: the selected athlete's workspace, opened at what needs the coach (↵ opens their page).
function dkPaintTodayCentre() {
  var c = document.getElementById('deskTodayCentre');
  if (!c) return;
  c.innerHTML = '';
  var q = _dk.queue;
  if (!_dk.sel) { c.appendChild(dkCaughtUp()); return; }
  var r = dkRow(_dk.sel.id);
  if (!r) return;
  var lane = _dk.sel.lane;
  var lanePos = (lane === 'q' ? q.queue : q.wins).findIndex(function (x) { return x.athlete.id === r.athlete.id; });
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn('Reply', { primary: true, kbd: 'R', onClick: dkReply }));
  if (lane === 'q') {
    acts.appendChild(dkBtn('Done', { kbd: 'E', icon: ICONS.check, onClick: function () { dkMark('done'); }, title: 'Done for this week. They come back if something new comes up.' }));
    acts.appendChild(dkBtn('Snooze', { kbd: 'S', icon: DK_IC.snooze, onClick: function () { dkMark('snooze'); }, title: 'Till tomorrow' }));
  } else {
    acts.appendChild(dkBtn('Seen', { kbd: 'E', icon: ICONS.check, onClick: function () { dkMark('done'); } }));
  }
  // The centre is the athlete's workspace, opened on what needs the coach.
  c.appendChild(dkWorkspace(r, { mode: 'today', lane: lane, actions: acts,
    pos: lane === 'q' ? (lanePos + 1) + ' of ' + q.queue.length + ' to review' : 'Win ' + (lanePos + 1) + ' of ' + q.wins.length }));
}
function dkReviewHead(r, pos, links) {
  var a = r.athlete, st = r.status;
  var head = el('div', { class: 'dk-rv-head' });
  var avw = el('span', { class: 'dk-avw' });
  avw.appendChild(dkAv(a, 'is-lg'));
  if (r.live) avw.appendChild(el('span', { class: 'dk-live', title: 'Training now' }));
  head.appendChild(avw);
  var id = el('div', { class: 'dk-rv-id' });
  var h2 = el('h2', { class: 'dk-h2' });
  if (links) {
    // The name opens their page (↵), the block opens their program (O).
    var nb = el('button', { type: 'button', class: 'dk-link', title: 'Open their page  ↵' }, a.name);
    nb.insertAdjacentHTML('beforeend', DK_IC.open);
    nb.addEventListener('click', function () { openAthletePage(a.id); });
    h2.appendChild(nb);
  } else h2.textContent = a.name;
  id.appendChild(h2);
  var sub = el('div', { class: 'dk-rv-sub' });
  if (links) {
    var pb = el('button', { type: 'button', class: 'dk-link dk-link-sub', title: 'Open their program  O' }, dkBlockText(st));
    pb.addEventListener('click', function () { openAthleteProgram(a.id); });
    sub.appendChild(pb);
  } else sub.appendChild(document.createTextNode(dkBlockText(st)));
  // Every fact once: a meet or a weight the reasons already say isn't said here too.
  if (st.program || st.ago != null) dkSubFacts(sub, dkWsSubBits(r, true).slice(1), true);
  id.appendChild(sub);
  head.appendChild(id);
  if (pos) {
    var nav = el('div', { class: 'dk-rv-pos' });
    var pv = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Previous  K', title: 'Previous  K', html: DK_IC.chevL });
    pv.addEventListener('click', function () { dkMove(-1); });
    var nx = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Next  J', title: 'Next  J', html: DK_IC.chevR });
    nx.addEventListener('click', function () { dkMove(1); });
    nav.setAttribute('aria-label', pos);
    nav.setAttribute('role', 'group');
    nav.appendChild(pv); nav.appendChild(nx);
    head.appendChild(nav);
  }
  return head;
}
function dkSection(title, body) {
  var s = el('div', { class: 'dk-sec' });
  s.appendChild(el('h3', { class: 'dk-sec-title' }, title));
  s.appendChild(body);
  return s;
}
function dkReasonList(r) {
  var list = el('div', { class: 'dk-reasons' });
  r.reasons.forEach(function (x) {
    var row = el('div', { class: 'dk-reason' });
    row.appendChild(dkChip(x.text, x.tone));
    row.appendChild(el('span', { class: 'dk-reason-detail', title: x.detail || '' }, el('span', {}, x.detail || '')));
    var go = null;
    if (x.type === 'formcheck' && x.formCheckId && typeof openFormCheckReview === 'function') go = dkBtn('Review', { cls: 'dk-btn-sm is-quiet', onClick: function () { openFormCheckReview(x.formCheckId); } });
    else if (x.type === 'note') go = dkBtn('Answer', { cls: 'dk-btn-sm is-quiet', onClick: function () { openAthleteNotes(r.athlete.id); } });
    else if (/^(noprogram|blockdone|blockend|overshoot|drift)$/.test(x.type)) go = dkBtn('Program', { cls: 'dk-btn-sm is-quiet', onClick: function () { openAthleteProgram(r.athlete.id); } });
    if (go) row.appendChild(go);
    list.appendChild(row);
  });
  return list;
}
function dkWinList(r) {
  var list = el('div', { class: 'dk-reasons' });
  r.wins.forEach(function (w) {
    var row = el('div', { class: 'dk-reason' });
    row.appendChild(dkChip(w.text, 'win'));
    var detail = '';
    if (w.type === 'pr') {
      var pr = getLifetimePRs(r.athlete.id);
      detail = (w.lifts || []).filter(function (L) { return pr[L]; }).map(function (L) { return LIFT_LABELS[L] + ' ' + dkWt(pr[L].weight) + ' × ' + pr[L].reps + ' @' + _num(pr[L].rpe); }).join(' · ');
    }
    row.appendChild(el('span', { class: 'dk-reason-detail' }, el('span', {}, detail)));
    list.appendChild(row);
  });
  return list;
}
function dkLifts(r) {
  var logs = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === r.athlete.id; });
  var box = el('div', { class: 'dk-lifts' });
  MAIN_LIFTS.forEach(function (L) {
    var pts = strengthSeries(logs, L, { weeks: 8 });
    var row = el('div', { class: 'dk-lift lift-' + L });
    row.appendChild(el('span', { class: 'dk-lift-name' }, el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }), LIFT_LABELS[L]));
    if (!pts.length) { row.appendChild(el('span', { class: 'dk-lift-val is-empty' }, 'No sets yet')); box.appendChild(row); return; }
    var vals = pts.map(function (p) { return p.value; });
    var now = vals[vals.length - 1], before = vals[Math.max(0, vals.length - 5)];
    var d = Math.round(kgToDisplay(now - before));
    row.appendChild(el('span', { class: 'dk-lift-val' }, el('b', {}, dkWt(now)), el('small', {}, unitLabel())));
    row.appendChild(el('span', { class: 'dk-delta' + (d > 0 ? ' is-up' : d < 0 ? ' is-down' : '') }, d ? (d > 0 ? '+' : '−') + Math.abs(d) : '±0'));
    row.insertAdjacentHTML('beforeend', dkSpark(vals));
    box.appendChild(row);
  });
  box.appendChild(el('div', { class: 'dk-foot-note' }, 'e1RM, change over 4 weeks'));
  return box;
}
function dkWeek(r) {
  var t = todayISO();
  var logs = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === r.athlete.id; });
  var on = {};
  logs.forEach(function (l) { on[l.date] = (on[l.date] || 0) + 1; });
  var strip = el('div', { class: 'dk-week' });
  for (var i = 6; i >= 0; i--) {
    var d = _addDaysISO(t, -i);
    var day = new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'narrow' });
    var cell = el('div', { class: 'dk-day' + (on[d] ? ' is-on' : '') + (i === 0 ? ' is-today' : ''), title: fmtDateShort(d) + (on[d] ? ': trained' : '') });
    cell.appendChild(el('span', { class: 'dk-day-l' }, day));
    cell.appendChild(el('i', { 'aria-hidden': 'true' }));
    strip.appendChild(cell);
  }
  var n = Object.keys(on).filter(function (d) { return d > _addDaysISO(t, -7); }).length;
  var box = el('div', {});
  box.appendChild(strip);
  box.appendChild(el('div', { class: 'dk-foot-note' }, n === 0 ? 'No sessions in 7 days' : n === 1 ? '1 session' : n + ' sessions'));
  return box;
}
function dkLatestNote(r) {
  var n = (Store.get().sessionNotes || []).filter(function (x) { return x.athleteId === r.athlete.id && x.note && String(x.note).trim(); })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); })[0];
  if (!n) return null;
  var box = el('div', { class: 'dk-note' });
  box.appendChild(el('p', {}, n.note));
  box.appendChild(el('span', { class: 'dk-note-meta' }, fmtDateShort(n.date) + (n.coachComment ? ' · answered' : ' · waiting on you')));
  return box;
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
  if (q.wins.length) {
    // The lane head already counts them: the button just goes there.
    box.appendChild(dkBtn('Celebrate wins', { icon: DK_IC.spark, onClick: function () { dkSelect(q.wins[0].athlete.id, 'w', true); } }));
  }
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
// Today's pane: the selected athlete's thread, as a peek (see dkThreadInto). J/K held down
// mounts one thread when the keys settle, not one per row.
function dkPaintTodayCtx(now) {
  var host = dkCtxHost();
  if (!host || _dk.screen !== 'today') return;
  // The same thread already open (a background refresh): keep it, and whatever is being typed.
  if (_dk.sel && dkCtxReady() && host.dataset.aid === 'today:' + _dk.sel.id && host.querySelector('.msg-thread')) return;
  dkCtxClear();
  if (!_dk.sel || !dkCtxReady()) return;
  var r = dkRow(_dk.sel.id);
  if (!r) return;
  // Their private notes first (pinned), then the thread.
  host.appendChild(dkNotesBox(r.athlete.id));
  var head = el('div', { class: 'dk-ctx-head is-sub' });
  var th = _dkThreadLast(r.athlete.id);
  // The name is already in the list and the centre: the pane says what it is and how fresh.
  head.appendChild(el('div', { class: 'dk-ctx-title' }, el('b', {}, 'Thread'), el('span', {}, th ? 'Last message ' + _dkAgoTime(th.lastAt) : 'No messages yet')));
  host.appendChild(head);
  host.dataset.aid = 'today:' + r.athlete.id;
  var mount = function () {
    if (!_dk.sel || _dk.sel.id !== r.athlete.id || host.dataset.aid !== 'today:' + r.athlete.id || !dkCtxReady()) return;
    host._msgCleanupBox = dkThreadInto(host, r.athlete, { peek: true, emptyText: dkReplyPrompt(r) });
  };
  if (now) mount(); else _dk.ctxT = setTimeout(mount, 220);
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
    weight: 'Check in on the cut.', note: 'Answer their note.', checkin: 'Ask about their check-in.',
    blockdone: 'Tell them what comes next.', blockend: 'Tell them what comes next.', noprogram: 'Tell them their program is coming.',
    win: 'Say well done.' })[t] || 'Start the thread.';
}
function dkReply() {
  var root = document.documentElement;
  if (root.classList.contains('ctx-off')) { root.classList.remove('ctx-off'); _dkLS('powa-desk-ctx', 'on'); dkSyncCtx(); }
  if (_dk.screen === 'today') { if (!document.querySelector('#deskCtx .msg-input')) dkPaintTodayCtx(true); dkFocusComposer(); }
  else if (_dk.screen === 'roster' && _dk.rsel) { _dk.ctxMode = 'thread'; dkPaintRosterCtx(true); }
}

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
  var cancel = dkBtn('Cancel', { onClick: close });
  var send = dkBtn(who.length === 1 ? 'Send' : 'Send to ' + who.length, { primary: true, onClick: go });
  row.appendChild(cancel); row.appendChild(send);
  box.appendChild(row);
  veil.appendChild(box);
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
  function onKey(e) {
    if (document.querySelector('.dk-pal')) return;   // a palette on top handles its own keys
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
async function dkSendMessage(athleteId, body) {
  var u = _dkUser();
  try {
    if (window._demoMode) {
      var s = Store.get();
      (s.messages || (s.messages = [])).push({ id: 'demo-msg-' + Date.now() + '-' + athleteId, coachId: u.id, athleteId: athleteId, senderId: u.id, body: body, createdAt: new Date().toISOString(), readAt: null });
      return true;
    }
    var m = await DB.sendMessage({ coachId: u.id, athleteId: athleteId, senderId: u.id, body: body });
    if (m) dkNoteSent(athleteId, body);
    if (m && typeof DB.sendPush === 'function') {
      DB.sendPush({ toUserId: athleteId, title: 'New message from ' + _dkFirst(u.name), body: body.slice(0, 140), url: '/athlete.html', tag: 'powa-msg-' + athleteId, category: 'messages' }).catch(function () {});
    }
    return !!m;
  } catch (e) { console.warn('desk send', e); return false; }
}

// =====================================================================
// ROSTER: the practical table
// =====================================================================
// Status sits next to the name: with the preview pane open, the flags are what must stay in view.
var DK_COLS = [
  { key: 'status', label: 'Status', sort: function (r) { return r.reasons.length ? -(10 - r.reasons[0].group) * 10 - r.reasons.length : (r.wins.length ? 50 : 100); } },
  { key: 'week', label: 'This week' },
  { key: 'last', label: 'Last session', sort: function (r) { return r.status.ago == null ? 9999 : r.status.ago; } },
  { key: 'drift', label: 'RPE drift', sort: function (r) { return r.drift ? r.drift.avg : -99; }, desc: true },
  { key: 'e1rm', label: 'e1RM total', sort: function (r) { return r.total.delta == null ? -9999 : r.total.delta; }, desc: true },
  { key: 'meet', label: 'Next meet', sort: function (r) { return r.meet ? r.meet.days : 9999; } },
  { key: 'bw', label: 'BW / class', auto: function (rows) { return rows.some(function (r) { return r.bw; }); }, sort: function (r) { return r.bw ? r.bw.over : -99; }, desc: true },
  { key: 'ready', label: 'Readiness', auto: function (rows) { return rows.some(function (r) { return r.readiness; }); } },
  { key: 'block', label: 'Block' }
];
var DK_DEFAULT_SORT = { needs: 'status', meet: 'meet', pain: 'status', quiet: 'last', new: 'name', wins: 'status' };
function dkColsOn(rows) {
  var saved = null;
  try { saved = JSON.parse(_dkLS(DK_COLS_KEY) || 'null'); } catch (e) {}
  return DK_COLS.filter(function (c) {
    if (saved && saved[c.key] === false) return false;
    if (c.auto && !(saved && saved[c.key] === true) && !c.auto(rows)) return false;
    return true;
  });
}
function dkSorts() {
  if (!_dk.sort) { try { _dk.sort = JSON.parse(_dkLS(DK_SORT_KEY) || 'null') || {}; } catch (e) { _dk.sort = {}; } }
  return _dk.sort;
}
function dkSortOf() {
  dkSorts();
  var k = _dk.view || 'all';
  var s = _dk.sort[k];
  if (s) return s;
  return { key: DK_DEFAULT_SORT[_dk.view] || 'status', dir: (DK_COLS.find(function (c) { return c.key === (DK_DEFAULT_SORT[_dk.view] || 'status'); }) || {}).desc ? -1 : 1 };
}
function dkSetSort(key) {
  var cur = dkSortOf(), col = DK_COLS.find(function (c) { return c.key === key; }) || {};
  var dir = cur.key === key ? -cur.dir : (col.desc ? -1 : 1);
  _dk.sort[_dk.view || 'all'] = { key: key, dir: dir };
  _dkLS(DK_SORT_KEY, JSON.stringify(_dk.sort));
  deskRenderRoster(document.getElementById('rosterArea'));
}
function dkVisibleRows() {
  var rows = (_dk.rows || []).slice(), now = Date.now();
  if (_dk.view) rows = rows.filter(function (r) { return deskViewMatch(_dk.view, r, now); });
  var q = _dk.search.trim().toLowerCase();
  if (q) rows = rows.filter(function (r) {
    var a = r.athlete;
    return (String(a.name || '') + ' ' + String(a.email || '') + ' ' + (r.status.program ? r.status.program.name || '' : '')).toLowerCase().indexOf(q) >= 0;
  });
  var s = dkSortOf();
  var col = DK_COLS.find(function (c) { return c.key === s.key; });
  var keyFn = s.key === 'name' || !col || !col.sort ? null : col.sort;
  rows.sort(function (a, b) {
    var d = keyFn ? (keyFn(a) - keyFn(b)) * s.dir : String(a.athlete.name).localeCompare(String(b.athlete.name)) * (s.key === 'name' ? s.dir : 1);
    return d || String(a.athlete.name).localeCompare(String(b.athlete.name));
  });
  return rows;
}
// coach.html's renderRoster hands the desk its area; join requests are already pinned in it.
function deskRenderRoster(area) {
  if (!area) return;
  dkRowsFresh();
  area.querySelectorAll('.dk-rhead, .dk-tablewrap, .dk-empty, .dk-bulk, .dk-noresults').forEach(function (n) { n.remove(); });
  var rows = _dk.rows;
  var u = _dkUser();
  if (!rows.length) { area.appendChild(dkRosterEmpty()); dkPaintRail(); dkSyncCtx(true); return; }

  // One line: Roster · 20 of 25 · 14 trained this week · [7 need you] · search · density · columns · Invite
  var head = el('div', { class: 'dk-rhead' });
  head.appendChild(el('h1', { class: 'dk-h1' }, 'Roster'));
  area.insertBefore(head, area.firstChild);   // above the join requests coach.html pins in the area
  head.appendChild(el('span', { class: 'dk-rmeta' }));
  dkPaintRmeta(head);
  var needs = deskViewCount(rows, 'needs');
  if (needs) {
    var nb = el('button', { type: 'button', class: 'dk-vchip' + (_dk.view === 'needs' ? ' on' : ''), 'aria-pressed': String(_dk.view === 'needs') }, needs + ' need you');
    nb.addEventListener('click', function () { deskGo('roster', { view: _dk.view === 'needs' ? null : 'needs' }); });
    head.appendChild(nb);
  }
  if (_dk.view && _dk.view !== 'needs') {
    var v = DESK_VIEWS.find(function (x) { return x.key === _dk.view; });
    var vb = el('button', { type: 'button', class: 'dk-vchip on', 'aria-label': 'Clear the ' + v.label + ' view' }, v.label, el('span', { class: 'dk-x', 'aria-hidden': 'true', html: ICONS.x }));
    vb.addEventListener('click', function () { deskGo('roster', { view: null }); });
    head.appendChild(vb);
  }
  head.appendChild(el('span', { class: 'dk-sp' }));
  var sw = el('label', { class: 'dk-search' });
  sw.insertAdjacentHTML('beforeend', DK_IC.search);
  var si = el('input', { type: 'search', placeholder: 'Search', 'aria-label': 'Search athletes', autocomplete: 'off', spellcheck: 'false' });
  si.value = _dk.search;
  si.addEventListener('input', function () { _dk.search = si.value; dkPaintTable(); });
  si.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); if (si.value) { si.value = ''; _dk.search = ''; dkPaintTable(); } else si.blur(); }
    if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); si.blur(); if (_dk.rorder.length) dkRSelect(_dk.rorder[0]); }
  });
  sw.appendChild(si);
  sw.appendChild(dkKbd('/'));
  head.appendChild(sw);
  // One toggle, in words: compact rows on or off.
  var compact = document.documentElement.getAttribute('data-density') === 'compact';
  var dens = el('button', { type: 'button', class: 'dk-icon-btn dk-dens', 'aria-pressed': String(compact), title: 'Compact rows', 'aria-label': 'Compact rows', html: DK_IC.dense });
  dens.addEventListener('click', dkToggleDensity);
  head.appendChild(dens);
  var colsBtn = el('button', { type: 'button', class: 'dk-btn dk-btn-sm dk-cols', 'aria-haspopup': 'menu', 'aria-expanded': 'false' }, 'Columns');
  colsBtn.addEventListener('click', function (e) { e.stopPropagation(); dkColsMenu(colsBtn); });
  head.appendChild(colsBtn);
  var inv = dkBtn('Invite', { primary: true, icon: ICONS.plus, onClick: function () { openInviteModal(); } });
  inv.id = 'deskInvite';
  head.appendChild(inv);

  var wrap = el('div', { class: 'dk-tablewrap' });
  area.appendChild(wrap);
  dkPaintTable();
  dkPaintRail();
  dkSyncCtx();
  dkPaintRosterCtx();
}
function dkPaintRmeta(head) {
  var m = (head || document).querySelector('#rosterArea .dk-rmeta, .dk-rhead .dk-rmeta');
  if (!m) return;
  var rows = _dk.rows || [], lim = getCurrentTierLimit();
  var trained = rows.filter(function (r) { return r.status.sessions.done > 0; }).length;
  m.textContent = (lim >= 9999 ? rows.length + ' athletes' : rows.length + ' of ' + lim) + ' · ' + trained + ' trained this week';
}
function dkPaintTable() {
  var area = document.getElementById('rosterArea');
  var wrap = area && area.querySelector('.dk-tablewrap');
  if (!wrap) return;
  wrap.innerHTML = '';
  var rows = dkVisibleRows();
  var was = _dk.rsel;
  _dk.rorder = rows.map(function (r) { return r.athlete.id; });
  if (_dk.rsel && _dk.rorder.indexOf(_dk.rsel) < 0) _dk.rsel = null;
  if (was && _dk.rsel !== was) { _dk.ctxMode = 'preview'; setTimeout(function () { dkSyncCtx(); dkPaintRosterCtx(); }, 0); }
  var cols = dkColsOn(_dk.rows);
  var s = dkSortOf();
  if (!rows.length) {
    var v = _dk.view ? DESK_VIEWS.find(function (x) { return x.key === _dk.view; }) : null;
    wrap.appendChild(el('div', { class: 'dk-noresults' }, el('b', {}, _dk.search ? 'Nobody matches “' + _dk.search + '”' : 'Nobody in ' + (v ? v.label : 'this view')), el('span', {}, _dk.view ? 'That is good news.' : 'Try another name.')));
    dkPaintBulk();
    return;
  }
  var t = el('table', { class: 'dk-table' });
  var hr = el('tr');
  var thc = el('th', { class: 'c-pick', scope: 'col' });
  var all = el('input', { type: 'checkbox', class: 'dk-cb', 'aria-label': 'Select all ' + rows.length });
  var pickedN = rows.filter(function (r) { return _dk.picked[r.athlete.id]; }).length;
  all.checked = pickedN && pickedN === rows.length;
  all.indeterminate = pickedN > 0 && pickedN < rows.length;
  all.addEventListener('change', function () { rows.forEach(function (r) { _dk.picked[r.athlete.id] = all.checked; }); dkPaintTable(); });
  thc.appendChild(all);
  hr.appendChild(thc);
  [{ key: 'name', label: 'Athlete', cls: 'c-ath' }].concat(cols).forEach(function (c) {
    var th = el('th', { scope: 'col', class: c.cls || 'c-' + c.key });
    if (c.key === 'name' || c.sort) {
      var on = s.key === c.key;
      var b = el('button', { type: 'button', class: 'dk-sort' + (on ? ' on' : '') }, c.label);
      if (on) { th.setAttribute('aria-sort', s.dir > 0 ? 'ascending' : 'descending'); b.appendChild(el('span', { class: 'dk-sort-ar', 'aria-hidden': 'true' }, s.dir > 0 ? '↑' : '↓')); }
      b.addEventListener('click', function () { dkSetSort(c.key); });
      th.appendChild(b);
    } else th.textContent = c.label;
    hr.appendChild(th);
  });
  hr.appendChild(el('th', { class: 'c-fill', 'aria-hidden': 'true' }));   // takes the spare width
  t.appendChild(el('thead', {}, hr));
  var tb = el('tbody');
  var unread = _dkUnread();
  var u = unitLabel();
  rows.forEach(function (r) {
    var a = r.athlete, st = r.status;
    var tr = el('tr', { class: 'dk-tr' + (_dk.rsel === a.id ? ' is-sel' : '') + (_dk.picked[a.id] ? ' is-picked' : ''), 'data-id': a.id, tabindex: _dk.rsel === a.id ? '0' : '-1', 'aria-selected': String(_dk.rsel === a.id) });
    var pc = el('td', { class: 'c-pick' });
    var cb = el('input', { type: 'checkbox', class: 'dk-cb', 'aria-label': 'Select ' + a.name, tabindex: '-1' });
    cb.checked = !!_dk.picked[a.id];
    cb.addEventListener('click', function (e) { e.stopPropagation(); _dk.picked[a.id] = cb.checked; tr.classList.toggle('is-picked', cb.checked); dkPaintBulk(); dkSyncAllBox(); });
    pc.appendChild(cb);
    tr.appendChild(pc);
    var nm = el('td', { class: 'c-ath' });
    var nmw = el('div', { class: 'dk-ath' });
    var avw = el('span', { class: 'dk-avw' });
    avw.appendChild(dkAv(a, 'is-sm'));
    if (r.live) avw.appendChild(el('span', { class: 'dk-live', title: 'Training now' }));
    nmw.appendChild(avw);
    nmw.appendChild(el('span', { class: 'dk-ath-name' }, a.name));
    if (unread[a.id]) nmw.appendChild(el('span', { class: 'dk-unread', title: unread[a.id] + ' new messages' }, String(unread[a.id])));
    var hov = el('span', { class: 'dk-rowacts' });
    var mb = el('button', { type: 'button', class: 'dk-icon-btn', title: 'Message  M', 'aria-label': 'Message ' + a.name, html: ICONS.chat, tabindex: '-1' });
    mb.addEventListener('click', function (e) { e.stopPropagation(); dkRSelect(a.id); dkReply(); });
    var pb = el('button', { type: 'button', class: 'dk-icon-btn', title: 'Open program  P', 'aria-label': 'Open ' + a.name + '’s program', html: ICONS.program, tabindex: '-1' });
    pb.addEventListener('click', function (e) { e.stopPropagation(); openAthleteProgram(a.id); });
    hov.appendChild(mb); hov.appendChild(pb);
    nmw.appendChild(hov);
    nm.appendChild(nmw);
    tr.appendChild(nm);
    cols.forEach(function (c) {
      var td = el('td', { class: 'c-' + c.key });
      if (c.key === 'block') {
        td.textContent = dkBlockText(st).replace(/\s+block(?= ·|$)/i, '');
        td.title = dkBlockText(st);
        if (!st.program) td.classList.add('dk-dim');
      } else if (c.key === 'week') {
        var dots = el('span', { class: 'dk-dots', title: st.sessions.done + ' of ' + (st.sessions.planned || '–') + ' sessions' });
        var n = Math.max(st.sessions.planned || 0, st.sessions.done);
        if (!n) td.appendChild(el('span', { class: 'dk-dim' }, '–'));
        else { for (var i = 0; i < Math.min(n, 7); i++) dots.appendChild(el('i', { class: i < st.sessions.done ? 'on' : '' })); td.appendChild(dots); }
      } else if (c.key === 'drift') {
        if (!r.drift) td.appendChild(el('span', { class: 'dk-dim' }, '–'));
        else td.appendChild(el('span', { class: 'dk-num' + (r.drift.avg > 1 ? ' t-alert' : r.drift.avg >= 0.5 ? ' t-warn' : Math.abs(r.drift.avg) < 0.3 ? ' is-calm' : '') }, (r.drift.avg > 0 ? '+' : r.drift.avg < 0 ? '−' : '±') + Math.abs(r.drift.avg).toFixed(1)));
      } else if (c.key === 'e1rm') {
        var tr2 = r.total, dl = tr2.delta;
        var box = el('div', { class: 'dk-trend', title: tr2.values.length ? 'Total e1RM ' + dkWt(tr2.values[tr2.values.length - 1]) + ' ' + u + (dl != null ? ', ' + (dl >= 0 ? '+' : '−') + Math.abs(Math.round(kgToDisplay(dl))) + ' over 4 weeks' : '') : '' });
        box.insertAdjacentHTML('beforeend', dkSpark(tr2.values, dl > 0.5 ? 'is-up' : ''));
        if (!tr2.values.length) box.appendChild(el('span', { class: 'dk-dim' }, '–'));
        else box.appendChild(el('span', { class: 'dk-num' + (dl > 0.5 ? ' is-up' : '') }, dl == null || Math.abs(dl) < 0.5 ? '±0' : (dl > 0 ? '+' : '−') + Math.abs(Math.round(kgToDisplay(dl)))));
        td.appendChild(box);
      } else if (c.key === 'meet') {
        if (!r.meet) td.appendChild(el('span', { class: 'dk-dim' }, '–'));
        else {
          var wk = Math.ceil(r.meet.days / 7);
          td.appendChild(el('span', { class: 'dk-meet' + (r.meet.days <= 14 ? ' is-soon' : ''), title: r.meet.meet.name + ' · ' + fmtDateShort(r.meet.meet.date) }, el('b', {}, r.meet.days <= 14 ? r.meet.days + 'd' : 'W-' + wk), el('span', {}, r.meet.meet.name)));
        }
      } else if (c.key === 'bw') {
        if (!r.bw) td.appendChild(el('span', { class: 'dk-dim' }, '–'));
        else td.appendChild(el('span', { class: 'dk-num' + (r.bw.over > 0 ? ' t-warn' : '') }, dkWt(r.bw.bw) + ' / ' + dkWt(r.bw.cls) + (r.bw.over > 0 ? ' · +' + _num(kgToDisplay(r.bw.over, 1)) : '')));
      } else if (c.key === 'ready') {
        if (!r.readiness) td.appendChild(el('span', { class: 'dk-dim' }, '–'));
        else td.appendChild(el('span', { class: 'dk-ready t-' + r.readiness.tone, title: r.readiness.text, 'aria-label': r.readiness.text }));
      } else if (c.key === 'last') {
        if (st.ago == null && !r.live) td.appendChild(el('span', { class: 'dk-dim' }, '–'));
        else td.appendChild(el('span', { class: 'dk-num' + (st.ago >= 7 ? ' t-warn' : '') + (r.live ? ' is-live' : '') }, r.live ? 'Now' : dkAgoShort(st.ago)));
      } else if (c.key === 'status') {
        var chips = el('div', { class: 'dk-chips' });
        var all2 = r.reasons.map(function (x) { return { text: x.text, tone: x.tone }; }).concat(r.wins.map(function (w) { return { text: w.text, tone: 'win' }; }));
        if (!all2.length) chips.appendChild(el('span', { class: 'dk-ok' }, 'On track'));
        all2.slice(0, 2).forEach(function (x) { chips.appendChild(dkChip(x.text, x.tone)); });
        if (all2.length > 2) chips.appendChild(el('span', { class: 'dk-chip-more', title: all2.slice(2).map(function (x) { return x.text; }).join(' · ') }, '+' + (all2.length - 2)));
        td.appendChild(chips);
      }
      tr.appendChild(td);
    });
    tr.appendChild(el('td', { class: 'c-fill', 'aria-hidden': 'true' }));
    tr.addEventListener('click', function () { dkRSelect(a.id); });
    tr.addEventListener('dblclick', function () { openAthletePage(a.id); });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  wrap.appendChild(t);
  dkPaintBulk();
  dkWatchScrollX();
}
// More columns off to the right: a soft fade at the pane's edge says the table scrolls.
function dkWatchScrollX() {
  var sc = document.querySelector('[data-pane="athletes"]'), area = document.getElementById('rosterArea');
  if (!sc || !area) return;
  var upd = function () { area.classList.toggle('is-more-x', isDesk() && sc.scrollLeft + sc.clientWidth < sc.scrollWidth - 2); };
  if (!_dk.scrollX) {
    _dk.scrollX = true;
    sc.addEventListener('scroll', upd, { passive: true });
    window.addEventListener('resize', upd);
  }
  upd();
  requestAnimationFrame(upd);
}
function dkSyncAllBox() {
  var all = document.querySelector('#rosterArea .dk-table thead .dk-cb');
  if (!all) return;
  var n = _dk.rorder.filter(function (id) { return _dk.picked[id]; }).length;
  all.checked = n > 0 && n === _dk.rorder.length;
  all.indeterminate = n > 0 && n < _dk.rorder.length;
}
function dkRSelect(id, opts) {
  _dk.rsel = id;
  if (!opts || !opts.keepMode) _dk.ctxMode = 'preview';
  document.querySelectorAll('#rosterArea .dk-tr').forEach(function (tr) {
    var on = tr.dataset.id === id;
    tr.classList.toggle('is-sel', on);
    tr.setAttribute('aria-selected', String(on));
    tr.tabIndex = on ? 0 : -1;
    if (on) {
      // Keep the row clear of the sticky head and the bulk bar.
      var sc = tr.closest('[data-pane="athletes"]'), r = tr.getBoundingClientRect();
      var head = document.querySelector('#rosterArea .dk-table thead'), hb = head ? head.getBoundingClientRect().bottom : 0;
      if (sc) { if (r.top < hb) sc.scrollTop -= hb - r.top; else if (r.bottom > window.innerHeight - 72) sc.scrollTop += r.bottom - window.innerHeight + 72; }
      if (opts && opts.key && !_dkTyping(document.activeElement)) tr.focus({ preventScroll: true });
    }
  });
  dkSyncCtx();
  dkPaintRosterCtx();
  dkWatchScrollX();
}
// Esc with nothing else to clear: the row lets go and the table takes the full width again.
function dkRClose() {
  _dk.rsel = null; _dk.ctxMode = 'preview';
  document.querySelectorAll('#rosterArea .dk-tr.is-sel').forEach(function (tr) { tr.classList.remove('is-sel'); tr.setAttribute('aria-selected', 'false'); tr.tabIndex = -1; });
  dkSyncCtx();
  dkWatchScrollX();
}
function dkRMove(step) {
  if (!_dk.rorder.length) return;
  var i = _dk.rorder.indexOf(_dk.rsel);
  var n = i < 0 ? 0 : Math.max(0, Math.min(_dk.rorder.length - 1, i + step));
  dkRSelect(_dk.rorder[n], { key: true });
}
function dkRPick() {
  if (!_dk.rsel) return;
  _dk.picked[_dk.rsel] = !_dk.picked[_dk.rsel];
  var tr = document.querySelector('#rosterArea .dk-tr[data-id="' + CSS.escape(_dk.rsel) + '"]');
  if (tr) { tr.classList.toggle('is-picked', !!_dk.picked[_dk.rsel]); var cb = tr.querySelector('.dk-cb'); if (cb) cb.checked = !!_dk.picked[_dk.rsel]; }
  dkPaintBulk(); dkSyncAllBox();
}
function dkPicked() { return Object.keys(_dk.picked).filter(function (k) { return _dk.picked[k] && dkRow(k); }); }
// The bulk bar: Message, Assign a template, Export CSV. Shown only while rows are ticked.
function dkPaintBulk() {
  var area = document.getElementById('rosterArea');
  if (!area) return;
  var old = area.querySelector('.dk-bulk');
  if (old) old.remove();
  var ids = dkPicked();
  area.classList.toggle('has-bulk', !!ids.length);
  if (!ids.length) return;
  var bar = el('div', { class: 'dk-bulk', role: 'toolbar', 'aria-label': ids.length + ' selected' });
  bar.appendChild(el('span', { class: 'dk-bulk-n' }, ids.length + ' selected'));
  bar.appendChild(dkBtn('Message', { icon: ICONS.chat, onClick: function () { dkCompose(ids, { title: ids.length === 1 ? 'Message ' + _dkFirst(dkRow(ids[0]).athlete.name) : 'Message ' + ids.length + ' athletes', onSent: function () { _dk.picked = {}; dkPaintTable(); } }); } }));
  bar.appendChild(dkBtn('Assign template', { icon: ICONS.copy, onClick: function (e) { dkAssignTemplate(ids, e.currentTarget); } }));
  bar.appendChild(dkBtn('Export CSV', { icon: DK_IC.download, onClick: function () { exportRosterCsv(ids); } }));
  var clr = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Clear selection', title: 'Clear selection  Esc', html: ICONS.x });
  clr.addEventListener('click', function () { _dk.picked = {}; dkPaintTable(); });
  bar.appendChild(clr);
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
function dkColsMenu(anchor) {
  var on = dkColsOn(_dk.rows).map(function (c) { return c.key; });
  dkPopMenu(anchor, DK_COLS.map(function (c) {
    return { label: c.label, check: on.indexOf(c.key) >= 0, keep: true, run: function (b) {
      var saved = {};
      try { saved = JSON.parse(_dkLS(DK_COLS_KEY) || '{}') || {}; } catch (e) {}
      var now = b.getAttribute('aria-checked') !== 'true';
      saved[c.key] = now;
      _dkLS(DK_COLS_KEY, JSON.stringify(saved));
      b.setAttribute('aria-checked', String(now));
      b.querySelector('.dk-check').innerHTML = now ? ICONS.check : '';
      dkPaintTable();
    } };
  }), { alignRight: true });
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
  var ghost = el('table', { class: 'dk-table dk-ghost', 'aria-hidden': 'true' });
  ghost.inert = true;
  var g = [['Maya Chen', 'Strength · 2/4', 2, 3, '+0.2', 'Today', [['3 lift PRs', 'win']]],
    ['Leo Grant', 'Peak · 3/3', 3, 3, '+0.1', '1d', [['Meet in 9 d', 'meet']]],
    ['Priya Shah', 'Volume · 1/4', 1, 3, '+1.2', '2d', [['Pain yesterday', 'alert'], ['Bench @9.5 vs @8', 'warn']]],
    ['Jonah Reed', 'Strength · 2/4', 0, 3, '–', '9d', [['Quiet 9d', 'warn']]],
    ['Sam Ortiz', 'Hypertrophy · 4/6', 2, 4, '−0.2', '1d', []],
    ['Ines Duarte', 'Strength · 1/3', 1, 3, '+0.6', '3d', [['RPE +0.6 this week', 'warn']]]];
  var hr = el('tr');
  ['Athlete', 'Block', 'This week', 'RPE drift', 'Last session', 'Status'].forEach(function (x) { hr.appendChild(el('th', {}, x)); });
  ghost.appendChild(el('thead', {}, hr));
  var tb = el('tbody');
  g.forEach(function (x) {
    var tr = el('tr', { class: 'dk-tr' });
    var nm = el('td', {}, el('div', { class: 'dk-ath' }, dkAv({ name: x[0] }, 'is-sm'), el('span', { class: 'dk-ath-name' }, x[0])));
    tr.appendChild(nm);
    tr.appendChild(el('td', {}, x[1]));
    var dots = el('span', { class: 'dk-dots' });
    for (var i = 0; i < x[3]; i++) dots.appendChild(el('i', { class: i < x[2] ? 'on' : '' }));
    tr.appendChild(el('td', {}, dots));
    tr.appendChild(el('td', {}, el('span', { class: 'dk-num' }, x[4])));
    tr.appendChild(el('td', {}, el('span', { class: 'dk-num' }, x[5])));
    var ch = el('div', { class: 'dk-chips' });
    if (!x[6].length) ch.appendChild(el('span', { class: 'dk-ok' }, 'On track'));
    x[6].forEach(function (c) { ch.appendChild(dkChip(c[0], c[1])); });
    tr.appendChild(el('td', {}, ch));
    tb.appendChild(tr);
  });
  ghost.appendChild(tb);
  box.appendChild(ghost);
  return box;
}
// The roster's context pane: a preview of the selected row, or its thread (M / Reply).
function dkPaintRosterCtx(focus) {
  var host = dkCtxHost();
  if (!host || _dk.screen !== 'roster') return;
  if (_dk.ctxMode === 'thread' && focus === undefined && dkCtxReady() && host.dataset.aid === 'thread:' + _dk.rsel && host.querySelector('.msg-thread')) return;
  host.dataset.aid = '';
  if (host._msgCleanupBox && host._msgCleanupBox._msgCleanup) { try { host._msgCleanupBox._msgCleanup(); } catch (e) {} host._msgCleanupBox = null; }
  host.innerHTML = '';
  if (!dkCtxReady()) return;
  var r = _dk.rsel ? dkRow(_dk.rsel) : null;
  if (!r) { host.appendChild(el('div', { class: 'dk-ctx-empty' }, 'Pick an athlete to preview them here.')); return; }
  var a = r.athlete;
  if (_dk.ctxMode === 'thread') {
    var th = el('div', { class: 'dk-ctx-head' });
    var back = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Back to the preview', title: 'Back to the preview  Esc', html: DK_IC.chevL });
    back.addEventListener('click', function () { _dk.ctxMode = 'preview'; dkPaintRosterCtx(); });
    th.appendChild(back);
    th.appendChild(dkAv(a, 'is-sm'));
    th.appendChild(el('div', { class: 'dk-ctx-title' }, el('b', {}, a.name), el('span', {}, 'Messages')));
    host.appendChild(th);
    host._msgCleanupBox = dkThreadInto(host, a, { focus: focus !== false });
    host.dataset.aid = 'thread:' + a.id;
    return;
  }
  var pv = el('div', { class: 'dk-pv' });
  var head = el('div', { class: 'dk-pv-head' });
  var avw = el('span', { class: 'dk-avw' });
  avw.appendChild(dkAv(a, 'is-lg'));
  if (r.live) avw.appendChild(el('span', { class: 'dk-live', title: 'Training now' }));
  head.appendChild(avw);
  var id = el('div', { class: 'dk-rv-id' });
  id.appendChild(el('h2', { class: 'dk-h2' }, a.name));
  id.appendChild(el('div', { class: 'dk-rv-sub' }, dkBlockText(r.status) + ' · ' + (r.live ? 'training now' : r.status.ago == null ? 'not started' : 'trained ' + agoText(r.status.ago).toLowerCase())));
  head.appendChild(id);
  pv.appendChild(head);
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn('Reply', { kbd: 'M', icon: ICONS.chat, onClick: dkReply }));
  acts.appendChild(dkBtn('Open', { kbd: '↵', onClick: function () { openAthletePage(a.id); } }));
  acts.appendChild(dkBtn('Program', { kbd: 'P', cls: 'is-quiet', onClick: function () { openAthleteProgram(a.id); } }));
  if (window.SwitchKit) acts.appendChild(dkBtn('Import history', { cls: 'is-quiet', onClick: function () { SwitchKit.openHistoryImport(a.id); } }));   // SWITCH KIT hook
  pv.appendChild(acts);
  var flags = r.reasons.map(function (x) { return { text: x.text, tone: x.tone }; }).concat(r.wins.map(function (w) { return { text: w.text, tone: 'win' }; }));
  if (flags.length) {
    var ch = el('div', { class: 'dk-chips is-wrap' });
    flags.forEach(function (x) { ch.appendChild(dkChip(x.text, x.tone)); });
    pv.appendChild(ch);
  }
  pv.appendChild(dkSection('Lifts', dkLifts(r)));
  pv.appendChild(dkSection('Last 7 days', dkWeek(r)));
  if (r.meet) {
    var mt = el('div', { class: 'dk-meetline' });
    mt.appendChild(el('b', {}, r.meet.meet.name));
    mt.appendChild(el('span', {}, fmtDateShort(r.meet.meet.date) + ' · ' + r.meet.days + ' days' + (r.meet.meet.weightClass ? ' · ' + r.meet.meet.weightClass : '') + (r.bw ? ' · BW ' + dkWt(r.bw.bw) + ' ' + unitLabel() : '')));
    pv.appendChild(dkSection('Next meet', mt));
  }
  var note = dkLatestNote(r);
  if (note) pv.appendChild(dkSection('Their latest note', note));
  host.appendChild(pv);
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
  [['today', 'Today'], ['roster', 'Roster'], ['programs', 'Programs'], ['messages', 'Messages'], ['club', 'Club'], ['settings', 'Settings']].forEach(function (x) {
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
  cmds.push({ group: 'Actions', label: 'Export roster as CSV', keys: 'download spreadsheet', run: function () { exportRosterCsv(); } });
  if (window.SwitchKit) cmds = cmds.concat(SwitchKit.deskCommands());   // SWITCH KIT hook: Import history… / Export everything
  var compact = document.documentElement.getAttribute('data-density') === 'compact';
  var light = document.documentElement.getAttribute('data-theme') === 'light';
  cmds.push({ group: 'Actions', label: compact ? 'Comfortable rows' : 'Compact rows', keys: 'density', run: dkToggleDensity });
  cmds.push({ group: 'Actions', label: light ? 'Dark theme' : 'Light theme', keys: 'appearance mode', run: function () { toggleTheme(); } });
  cmds.push({ group: 'Actions', label: 'Show weights in ' + (getUnit() === 'kg' ? 'lb' : 'kg'), keys: 'units pounds kilos', run: function () { toggleUnit(); } });
  cmds.push({ group: 'Actions', label: document.documentElement.classList.contains('rail-min') ? 'Expand the sidebar' : 'Collapse the sidebar', hint: '[', run: dkToggleRail });
  cmds.push({ group: 'Actions', label: document.documentElement.classList.contains('ctx-off') ? 'Show the side pane' : 'Hide the side pane', hint: ']', run: dkToggleCtx });
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

// ---------- the keys ----------
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
  if (mod || e.altKey) return;
  if (k === 'Escape' && e.target.closest && e.target.closest('#dkMsgCentre') && _dkTyping(e.target)) {
    e.preventDefault(); e.target.blur();
    var mr = document.querySelector('#messagesArea .dk-msg-row.is-sel'); if (mr) mr.focus({ preventScroll: true });
    return;
  }
  if (k === 'Escape' && e.target.closest && e.target.closest('#deskCtx') && _dkTyping(e.target)) {
    e.preventDefault();
    e.target.blur();
    if (_dk.screen === 'roster' && _dk.ctxMode === 'thread') { _dk.ctxMode = 'preview'; dkPaintRosterCtx(); }
    var back = _dk.screen === 'today' ? document.querySelector('#deskToday .dk-qrow.is-sel') : document.querySelector('#rosterArea .dk-tr.is-sel');
    if (back) back.focus({ preventScroll: true });
    return;
  }
  if (_dkTyping(e.target)) return;
  if (_dkBlocked()) return;
  if (document.querySelector('.dk-menu')) return;
  var onPage = !!document.querySelector('[data-pane="athlete"]:not(.hidden)');
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
    // The athlete's workspace: J/K through the list the coach came from.
    if (low === 'j' || k === 'ArrowRight') { e.preventDefault(); dkWsStep(1); }
    else if (low === 'k' || k === 'ArrowLeft') { e.preventDefault(); dkWsStep(-1); }
    else if (low === 'r' || low === 'm') { e.preventDefault(); dkWsMessage(); }
    else if (low === 'n') { e.preventDefault(); dkNoteCompose(window._apAthlete); }
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
    else if (low === 'r' && _dk.sel) { e.preventDefault(); dkReply(); }
    else if (low === 'o' && _dk.sel) { e.preventDefault(); openAthleteProgram(_dk.sel.id); }
    else if (k === 'Enter' && _dk.sel && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); openAthletePage(_dk.sel.id); }
    else if (low === 'x' && _dk.sel && _dk.sel.lane === 'w') { e.preventDefault(); _dk.wpick[_dk.sel.id] = !_dk.wpick[_dk.sel.id]; renderDeskToday(); }
    else if (low === 'n' && _dk.sel) { e.preventDefault(); dkNoteCompose(_dk.sel.id); }
    else if (low === 'a' && e.shiftKey && _dk.sel) { e.preventDefault(); dkWsAcceptAll(); }
  } else if (_dk.screen === 'messages') {
    if (low === 'j' || k === 'ArrowDown') { e.preventDefault(); dkMsgMove(1); }
    else if (low === 'k' || k === 'ArrowUp') { e.preventDefault(); dkMsgMove(-1); }
    else if (low === 'e' && _dk.msgSel) { e.preventDefault(); dkMsgDone(); }
    else if (low === 'r' && _dk.msgSel) { e.preventDefault(); var ta = document.querySelector('#dkMsgCentre .msg-input'); if (ta) ta.focus(); }
    else if (low === 'n' && _dk.msgSel) { e.preventDefault(); dkNoteCompose(_dk.msgSel); }
    else if (k === 'Enter' && _dk.msgSel && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); openAthletePage(_dk.msgSel); }
  } else if (_dk.screen === 'roster') {
    if (low === 'j' || k === 'ArrowDown') { e.preventDefault(); dkRMove(1); }
    else if (low === 'k' || k === 'ArrowUp') { e.preventDefault(); dkRMove(-1); }
    else if (low === 'x') { e.preventDefault(); dkRPick(); }
    else if (low === 'm' && _dk.rsel) { e.preventDefault(); dkReply(); }
    else if (low === 'p' && _dk.rsel) { e.preventDefault(); openAthleteProgram(_dk.rsel); }
    else if (k === 'Enter' && _dk.rsel && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); openAthletePage(_dk.rsel); }
    else if (k === 'Escape') {
      if (_dk.ctxMode === 'thread') { e.preventDefault(); _dk.ctxMode = 'preview'; dkPaintRosterCtx(); }
      else if (dkPicked().length) { e.preventDefault(); _dk.picked = {}; dkPaintTable(); }
      else if (_dk.view || _dk.search) { e.preventDefault(); _dk.search = ''; deskGo('roster', { view: null }); }
      else if (_dk.rsel) { e.preventDefault(); dkRClose(); }
    }
  }
}

// =====================================================================
// THE ATHLETE WORKSPACE (W1b): the weekly loop for one athlete. Last
// week against what was written and next week editable in place, with
// suggestions from the RPE they logged (app.js deskWeekReview); the
// lifts; check-ins as four weeks; recovery; the meet and bodyweight;
// their notes; past blocks. The context pane holds the coach's private
// notes and the thread. Today's centre draws it for the selected
// athlete; the athlete's page (#athlete=ID) draws it full width with
// ‹ › through the list the coach came from.
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
// Line 2 of the head: block · meet · class · bodyweight. In Today a fact the reasons already say
// (the meet, the weight) isn't said again.
// The subline's facts, each kept whole ("57 kg class" never splits): it wraps between facts only.
function dkSubFacts(host, bits, lead) {
  bits.forEach(function (b, i) { host.appendChild(el('span', { class: 'dk-fact' }, (i || lead ? ' · ' : '') + b)); });
  return host;
}
// [block, meet, class, bodyweight]: the block first, so Today can draw it as a link.
function dkWsSubBits(r, inToday) {
  var a = r.athlete, said = function (t) { return inToday && r.reasons.some(function (x) { return x.type === t; }); };
  if (!r.status.program && r.status.ago == null) return [dkJoinedText(a)];
  var bits = [dkBlockText(r.status)];
  if (r.meet && !said('meet')) bits.push(r.meet.meet.name + (r.meet.days === 0 ? ' today' : ' in ' + r.meet.days + 'd'));
  if (r.meet && r.meet.meet.weightClass && r.meet.days <= 120 && !said('weight')) bits.push(dkClassText(r.meet.meet.weightClass));
  var bw = dkLatestBw(a.id);
  if (bw && !said('weight')) bits.push('BW ' + _num(kgToDisplay(bw.weight, 1)) + (r.bw && r.bw.over > 0 && r.meet && r.meet.days <= 120 ? ' (+' + _num(kgToDisplay(r.bw.over, 1)) + ')' : ''));
  return bits;
}
// The list ‹ › walks: Today's queue, the roster as filtered and sorted, or everyone by name.
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
  dkPaintPageCtx();
  var main = document.querySelector('[data-pane="athlete"]');
  if (main) main.scrollTop = 0;
  window.scrollTo(0, 0);
}
function dkWorkspace(r, opts) {
  opts = opts || {};
  var today = opts.mode === 'today';
  var ws = el('div', { class: 'dk-ws' + (today ? ' is-today' : ''), 'data-aid': r.athlete.id });
  ws.appendChild(today ? dkReviewHead(r, opts.pos, true) : dkWsHead(r, opts));
  if (opts.actions) ws.appendChild(opts.actions);
  if (today) {
    if (opts.lane === 'w') ws.appendChild(dkSection('Wins', dkWinList(r)));
    if (r.reasons.length) ws.appendChild(dkSection(opts.lane === 'q' ? 'What needs you' : 'Also flagged', dkReasonList(r)));
  } else {
    var flags = r.reasons.map(function (x) { return { text: x.text, tone: x.tone, detail: x.detail }; }).concat(r.wins.map(function (w) { return { text: w.text, tone: 'win' }; }));
    if (flags.length) {
      var strip = el('div', { class: 'dk-chips is-wrap dk-ws-flags' });
      flags.forEach(function (x) { var c = dkChip(x.text, x.tone); if (x.detail) c.title = x.detail; strip.appendChild(c); });
      ws.appendChild(strip);
    }
  }
  ws.appendChild(dkWsWeek(r));
  ws.appendChild(dkSection('Lifts', dkWsLifts(r)));
  // Two columns: how they are (check-in, recovery) | what's coming and what they said.
  var ci = dkWsCheckins(r), rc = dkWsRecovery(r), nt = dkWsNotes(r);
  var L = [ci && dkSection('Check-in', ci), rc && dkSection('Recovery', rc)].filter(Boolean);
  var R = [dkSection('Meets', dkWsMeets(r)), nt && dkSection('Their notes', nt)].filter(Boolean);
  if (!L.length) L.push(R.shift());
  var cols = el('div', { class: 'dk-ws-cols' });
  [L, R].forEach(function (part) { var col = el('div', { class: 'dk-ws-col' }); part.forEach(function (x) { col.appendChild(x); }); cols.appendChild(col); });
  ws.appendChild(cols);
  if (!today) { var bl = dkWsBlocks(r); if (bl) ws.appendChild(bl); }
  return ws;
}
function dkWsHead(r, opts) {
  var a = r.athlete;
  var head = el('div', { class: 'dk-rv-head dk-ws-head' });
  var avw = el('span', { class: 'dk-avw' });
  avw.appendChild(dkAv(a, 'is-lg'));
  if (r.live) avw.appendChild(el('span', { class: 'dk-live', title: 'Training now' }));
  head.appendChild(avw);
  var id = el('div', { class: 'dk-rv-id' });
  id.appendChild(el('h1', { class: 'dk-h2' }, a.name));
  id.appendChild(dkSubFacts(el('div', { class: 'dk-rv-sub' }), dkWsSubBits(r, false)));
  head.appendChild(id);
  if (opts.pos) {
    var nav = el('div', { class: 'dk-ws-pos', role: 'group', 'aria-label': opts.pos });
    nav.appendChild(el('span', { class: 'dk-ws-pos-text' }, opts.pos));
    var pv = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Previous athlete  K', title: 'Previous  K', html: DK_IC.chevL });
    pv.addEventListener('click', function () { dkWsStep(-1); });
    var nx = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Next athlete  J', title: 'Next  J', html: DK_IC.chevR });
    nx.addEventListener('click', function () { dkWsStep(1); });
    nav.appendChild(pv); nav.appendChild(nx);
    head.appendChild(nav);
  }
  var acts = el('div', { class: 'dk-ws-acts' });
  var un = _dkUnread()[a.id] || 0;
  acts.appendChild(dkBtn(un ? 'Message · ' + un : 'Message', { primary: true, kbd: 'R', onClick: dkWsMessage }));
  acts.appendChild(dkBtn(r.status.program ? 'Program' : 'Write a program', { kbd: 'P', onClick: function () { openAthleteProgram(a.id); } }));
  var more = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'More for ' + a.name, 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: DK_IC.more });
  more.addEventListener('click', function (e) {
    e.stopPropagation();
    dkPopMenu(more, [
      { label: 'Add a private note', hint: 'N', run: function () { dkNoteCompose(a.id); } },
      { label: 'Progress charts', run: function () { openAthleteNotes(a.id); } },
      { label: 'Export their program', run: function () { if (typeof exportProgramCsv === 'function') exportProgramCsv(a.id, a.name); } },
      '-',
      { label: 'Remove from roster', run: function () { removeAthleteFromRoster(a.id, a.name); } }
    ], { alignRight: true });
  });
  acts.appendChild(more);
  head.appendChild(acts);
  return head;
}
// R / Message: the thread in the side pane takes the cursor (the pane opens if it was hidden).
function dkWsMessage() {
  var root = document.documentElement;
  if (root.classList.contains('ctx-off')) { root.classList.remove('ctx-off'); _dkLS('powa-desk-ctx', 'on'); dkSyncCtx(); dkPaintPageCtx(true); }
  if (!document.querySelector('#deskCtx .msg-input')) dkPaintPageCtx(true);
  dkFocusComposer();
}

// ---------- last week → next week ----------
// "1×3 @8", "3×5 155 @7", "3×4 70%": a block of sets as it reads. dkGroupInput is the typed form.
function dkGroupLabel(g) {
  if (!g) return '';
  var t = g.count + '×' + g.reps;
  if (g.pct != null) t += ' ' + _num(g.pct) + (Number(g.pctHi) > Number(g.pct) ? '–' + _num(g.pctHi) : '') + '%';
  else if (Number(g.weight) > 0) t += ' ' + _num(kgToDisplay(g.weight)) + (Number(g.weightHi) > Number(g.weight) ? '–' + _num(kgToDisplay(g.weightHi)) : '');
  if (g.rpe != null && g.rpe !== '') t += g.rir ? ' ' + effortInputText(g, true) + ' RIR' : ' @' + effortInputText(g, false);
  return t;
}
function dkGroupInput(g) {
  if (!g) return '';
  var t = g.count + 'x' + g.reps;
  if (g.pct != null) t += ' ' + _num(g.pct) + (Number(g.pctHi) > Number(g.pct) ? '-' + _num(g.pctHi) : '') + '%';
  // A bare load reads in the coach's unit; under 20 the parser wants the unit said.
  else if (Number(g.weight) > 0) t += ' ' + _num(kgToDisplay(g.weight)) + (Number(g.weightHi) > Number(g.weight) ? '-' + _num(kgToDisplay(g.weightHi)) : '') + (kgToDisplay(g.weight) < 20 ? (getUnit() === 'lbs' ? 'lb' : 'kg') : '');
  if (g.rpe != null && g.rpe !== '') t += g.rir ? ' ' + effortInputText(g, true) + 'RIR' : ' @' + effortInputText(g, false);
  return t;
}
function dkLoggedLabel(l) {
  if (!l) return '';
  if (l.skipped) return 'Skipped';
  return (l.weight > 0 ? _num(kgToDisplay(l.weight)) + '×' : '') + l.reps + (l.rpe != null ? ' @' + _num(l.rpe) : '');
}
// The edits waiting on Apply, per athlete, for one program and one next week.
function dkWsPend(aid, prog, nextIdx) {
  var sig = prog.id + ':' + nextIdx;
  var p = _dk.wsPend[aid];
  if (!p || p.sig !== sig) p = _dk.wsPend[aid] = { sig: sig, rows: {} };
  return p;
}
function dkProgOf(aid) { return (Store.get().programs || []).find(function (p) { return p.athleteId === aid; }) || null; }
function dkWsWeek(r) {
  var a = r.athlete, prog = dkProgOf(a.id);
  var sec = el('div', { class: 'dk-sec dk-wk', id: 'dkWsWeek' });
  var head = el('div', { class: 'dk-sec-head' });
  var title = el('h3', { class: 'dk-sec-title' });
  head.appendChild(title);
  sec.appendChild(head);
  if (!prog || !(prog.weeks || []).length) {
    title.textContent = 'Next week';
    var em = el('div', { class: 'dk-wk-empty' });
    em.appendChild(el('p', {}, r.status.ago == null ? 'Nothing assigned yet. Their first week shows up here, and what they lift lands next to it.' : 'No program at the moment. Write the next block and this fills in as they log.'));
    em.appendChild(dkBtn('Assign a program', { cls: 'is-ink', onClick: function () { openAthleteProgram(a.id); } }));
    sec.appendChild(em);
    return sec;
  }
  var rev = deskWeekReview(prog);
  if (rev.lastIdx < 0) {
    title.textContent = 'Week ' + (prog.weeks[0].number || 1);
    var em2 = el('div', { class: 'dk-wk-empty' });
    em2.appendChild(el('p', {}, 'Waiting for their first set. Each set they log lands here against what you wrote.'));
    em2.appendChild(dkBtn('Open in Grid', { cls: 'is-quiet', onClick: function () { openAthleteProgram(a.id); } }));
    sec.appendChild(em2);
    return sec;
  }
  var W = prog.weeks[rev.lastIdx], N = rev.nextIdx >= 0 ? prog.weeks[rev.nextIdx] : null;
  title.textContent = 'Week ' + (W.number || rev.lastIdx + 1) + (N ? ' → week ' + (N.number || rev.nextIdx + 1) : '');
  head.appendChild(el('span', { class: 'dk-sec-sub' }, N ? 'Lifted against written · next week from how it felt' : 'Lifted against written'));
  head.appendChild(el('span', { class: 'dk-sp' }));
  var grid = dkBtn('Open in Grid', { cls: 'is-quiet dk-btn-sm', onClick: function () { openAthleteProgram(a.id); } });
  head.appendChild(grid);
  var pend = N ? dkWsPend(a.id, prog, rev.nextIdx) : { rows: {} };
  // Drop anything that no longer fits (the athlete logged into that block, or the coach changed it elsewhere).
  Object.keys(pend.rows).forEach(function (k) { var row = rev.rows.find(function (x) { return x.key === k; }); if (!row || !row.next || row.next.locked) delete pend.rows[k]; });
  var apply = null;
  if (N) {
    apply = dkBtn('Apply next week', { cls: 'is-ink dk-btn-sm dk-wk-apply', onClick: function () { dkWsApply(a.id); } });
    head.appendChild(apply);
  }
  var t = el('table', { class: 'dk-wktab' });
  var hr = el('tr');
  // No week after this one: no next-week column (the end of the block is said under the table).
  ['Exercise', 'Written', 'Logged'].concat(N ? ['Week ' + (N.number || rev.nextIdx + 1), ''] : []).forEach(function (h, i) {
    hr.appendChild(el('th', { scope: 'col', class: ['c-ex', 'c-tg', 'c-lg', 'c-nx', 'c-ok'][i] }, h));
  });
  t.appendChild(el('thead', {}, hr));
  var tb = el('tbody');
  var lastDi = -1;
  var inputs = [];
  var paintApply = function () {
    if (!apply) return;
    var n = Object.keys(pend.rows).length;
    apply.querySelector('span').textContent = n ? 'Apply next week · ' + n : 'Apply next week';
    apply.disabled = !n;
  };
  rev.rows.forEach(function (row) {
    if (row.di !== lastDi) {
      lastDi = row.di;
      tb.appendChild(el('tr', { class: 'dk-wk-day' }, el('th', { colspan: N ? '5' : '3', scope: 'rowgroup' }, row.day)));
    }
    var tr = el('tr', { class: 'dk-wk-row' + (row.gi ? ' is-cont' : '') });
    var ex = el('td', { class: 'c-ex' });
    if (!row.gi) ex.appendChild(el('span', { class: 'dk-wk-ex lift-' + (MAIN_LIFTS.indexOf(row.lift) >= 0 ? row.lift : 'acc') }, el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }), el('span', { class: 'dk-wk-exn' }, row.title)));
    // A narrow pane folds "written" under the name (CSS shows one or the other).
    ex.appendChild(el('span', { class: 'dk-wk-tg2' }, dkGroupLabel(row.target)));
    if (row.gi) ex.setAttribute('aria-label', row.title + ', ' + dkGroupLabel(row.target));
    tr.appendChild(ex);
    tr.appendChild(el('td', { class: 'c-tg' }, dkGroupLabel(row.target)));
    var lg = el('td', { class: 'c-lg' + (row.logged ? '' : ' dk-dim') }, row.logged ? dkLoggedLabel(row.logged) : '–');
    if (row.logged && !row.logged.skipped && row.logged.n < row.logged.of) lg.appendChild(el('small', {}, ' ' + row.logged.n + '/' + row.logged.of));
    // The RPE against what was written, on the same line: red a point over, amber half a point.
    var d = row.delta;
    if (d != null && d !== 0) lg.appendChild(el('span', { class: 'dk-wk-d' + (d >= 1 ? ' t-alert' : d >= 0.5 ? ' t-warn' : ''), title: 'RPE ' + (d > 0 ? 'over' : 'under') + ' what you wrote' }, (d > 0 ? '+' : '−') + Math.abs(d).toFixed(1)));
    tr.appendChild(lg);
    var nx = el('td', { class: 'c-nx' });
    var okc = el('td', { class: 'c-ok' });
    if (!N) { tb.appendChild(tr); return; }
    if (!row.next) nx.appendChild(el('span', { class: 'dk-dim' }, 'Not in week ' + (N.number || rev.nextIdx + 1)));
    else if (row.next.locked) nx.appendChild(el('span', { class: 'dk-wk-locked', title: 'Logged already' }, dkGroupLabel(row.next.group)));
    else {
      var cur = dkGroupInput(row.next.group);
      var p = pend.rows[row.key];
      var inp = el('input', { type: 'text', class: 'dk-wk-in' + (p ? ' is-pend' : ''), spellcheck: 'false', autocomplete: 'off', 'aria-label': row.title + ' next week' });
      inp.value = p ? p.text : cur;
      var sg = el('div', { class: 'dk-wk-sg' });
      var paintSg = function () {
        sg.innerHTML = '';
        var s = row.suggest, pp = pend.rows[row.key];
        if (!s) return;
        if (s.dir === 'hold') { sg.appendChild(el('span', { class: 'is-hold', title: 'Logged on target: keep the load' }, 'Hold')); return; }
        var kgTxt = _num(kgToDisplay(s.kg));
        if (pp && pp.kind === 'accept') { sg.appendChild(el('span', { class: 'is-took' }, 'Suggested load in')); return; }
        sg.appendChild(el('span', {}, 'Suggest ' + kgTxt + (s.dir === 'set' ? '' : ' (' + (s.delta > 0 ? '+' : '−') + _num(kgToDisplay(Math.abs(s.delta))) + ')')));
        sg.appendChild(dkKbd('Tab'));
      };
      paintSg();
      var okb = el('button', { type: 'button', class: 'dk-icon-btn dk-wk-okb', tabindex: '-1', html: ICONS.check });
      var paintOk = function () {
        var pp = pend.rows[row.key];
        var can = !!(row.suggest && row.suggest.dir !== 'hold');
        okb.setAttribute('aria-pressed', String(!!pp));
        okb.disabled = !pp && !can;
        okb.title = pp ? 'Undo this change' : can ? 'Take the suggested load  Tab' : 'Nothing to suggest';
        okb.setAttribute('aria-label', okb.title);
        inp.classList.toggle('is-pend', !!pp);
        paintSg();
        paintApply();
      };
      var accept = function () {
        if (!row.suggest || row.suggest.dir === 'hold') return false;
        var nsets = (dkProgOf(a.id).weeks[rev.nextIdx].days[row.next.di].exercises[row.next.ei].sets || []).slice(row.next.startIdx, row.next.startIdx + row.next.count);
        var sets = deskSuggestedSets(nsets, row.suggest.kg);
        var g = Object.assign({}, row.next.group, { weight: row.suggest.kg, weightHi: Number(row.next.group.weightHi) > row.suggest.kg ? row.next.group.weightHi : null });
        pend.rows[row.key] = { kind: 'accept', text: dkGroupInput(g), sets: sets, row: row };
        inp.value = pend.rows[row.key].text;
        paintOk();
        return true;
      };
      var revert = function () { delete pend.rows[row.key]; inp.value = cur; inp.classList.remove('is-bad'); paintOk(); };
      var commit = function () {
        var v = inp.value.trim();
        var pp = pend.rows[row.key];
        if (pp && v === pp.text) return true;
        if (v === cur || !v) { revert(); return true; }
        var sets = typeof _gridParse === 'function' ? _gridParse(v, a.id, row.lift, dkProgOf(a.id)) : null;
        if (!sets || !sets.length) { inp.classList.add('is-bad'); inp.title = 'Type it like 3x5 150 @8'; return false; }
        inp.classList.remove('is-bad'); inp.removeAttribute('title');
        pend.rows[row.key] = { kind: 'edit', text: v, sets: sets, row: row };
        paintOk();
        return true;
      };
      okb.addEventListener('click', function () { if (pend.rows[row.key]) revert(); else accept(); });
      inp.addEventListener('blur', commit);
      inp.addEventListener('keydown', function (e) {
        var i = inputs.indexOf(inp);
        var go = function (j) { var t2 = inputs[j]; if (t2) { t2.focus(); t2.select(); } };
        if (e.key === 'Tab' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) {
          // Untouched with a suggestion: Tab takes it, then moves on.
          if (inp.value.trim() === cur && !pend.rows[row.key] && row.suggest && row.suggest.dir !== 'hold') { e.preventDefault(); accept(); go(i + 1); }
        } else if (e.key === 'Enter') { e.preventDefault(); if (commit()) go(i + (e.shiftKey ? -1 : 1)); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); revert(); inp.blur(); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); if (commit()) go(i + 1); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (commit()) go(i - 1); }
      });
      inp.addEventListener('focus', function () { tr.classList.add('is-focus'); });
      inp.addEventListener('blur', function () { tr.classList.remove('is-focus'); });
      inp._accept = accept;
      inputs.push(inp);
      nx.appendChild(inp);
      nx.appendChild(sg);
      okc.appendChild(okb);
      paintOk();
    }
    tr.appendChild(nx);
    tr.appendChild(okc);
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  var wrap = el('div', { class: 'dk-wk-wrap' });
  wrap.appendChild(t);
  sec.appendChild(wrap);
  // Next week's column is as wide as its longest prescription: a load is never cut off mid-number.
  var fit = function () {
    if (!t.isConnected) return;
    var px = 0;
    inputs.forEach(function (i) { px = Math.max(px, _dkInputW(i)); });
    t.querySelectorAll('td.c-nx').forEach(function (td) { td.style.minWidth = px ? (px + 20) + 'px' : ''; });
  };
  requestAnimationFrame(fit);
  inputs.forEach(function (i) { i.addEventListener('input', fit); i.addEventListener('blur', fit); i.addEventListener('keyup', fit); });
  sec._acceptAll = function () {
    var n = 0;
    inputs.forEach(function (inp) { if (inp._accept && !inp.classList.contains('is-pend') && inp._accept()) n++; });
    fit();
    toast(n ? 'Took ' + n + (n === 1 ? ' suggestion' : ' suggestions') + '. Apply next week when it reads right' : 'No suggestions left to take');
  };
  if (!N) {
    var end = el('div', { class: 'dk-wk-end' });
    end.appendChild(el('span', {}, 'Week ' + (W.number || rev.lastIdx + 1) + ' is the last of ' + (prog.name || 'the block') + '.'));
    if (typeof openNextBlockSheet === 'function') end.appendChild(dkBtn('Start the next block', { cls: 'is-ink dk-btn-sm', onClick: function () { openNextBlockSheet(prog.id, a.id); } }));
    sec.appendChild(end);
  }
  paintApply();
  return sec;
}
// ⇧A: take every suggestion in the table.
function dkWsAcceptAll() {
  var sec = document.querySelector('#dkWsWeek');
  if (sec && sec._acceptAll) sec._acceptAll();
}
// Apply next week: write the edited blocks into the program, save, and send the heads-up (the athlete hears).
function dkWsApply(aid) {
  var prog = dkProgOf(aid);
  var p = _dk.wsPend[aid];
  if (!prog || !p) return;
  var rev = deskWeekReview(prog);
  if (rev.nextIdx < 0 || p.sig !== prog.id + ':' + rev.nextIdx) return;
  var edits = Object.keys(p.rows).map(function (k) { var x = p.rows[k]; return { di: x.row.next.di, ei: x.row.next.ei, startIdx: x.row.next.startIdx, count: x.row.next.count, sets: x.sets }; });
  if (!edits.length) return;
  var n = 0;
  Store.update(function (s) { var pr = (s.programs || []).find(function (x) { return x.id === prog.id; }); if (pr) n = deskApplyNextWeek(pr.weeks, rev.nextIdx, edits); });
  delete _dk.wsPend[aid];
  if (!n) { toast('Nothing changed: those sets were logged meanwhile'); dkWsRepaint(); return; }
  persistProgram(prog.id);
  var r = dkRow(aid);
  dkNoteHandled(aid, 'apply');
  dkPublish(aid, { quietDemo: true });
  toast(window._demoMode ? 'Week ' + (prog.weeks[rev.nextIdx].number || rev.nextIdx + 1) + ' updated in the demo. Nothing leaves this page.' : 'Week ' + (prog.weeks[rev.nextIdx].number || rev.nextIdx + 1) + ' updated. ' + (r ? _dkFirst(r.athlete.name) : 'They') + ' gets a heads-up.');
  dkWsRepaint();
}
// Redraw whichever workspace is showing (Today's centre or the page), keeping the scroll.
function dkWsRepaint() {
  var onPage = !!document.querySelector('[data-pane="athlete"]:not(.hidden)');
  if (onPage && window._apAthlete) { dkRowsFresh(); var sc = window.scrollY; renderAthletePage(window._apAthlete); window.scrollTo(0, sc); return; }
  if (_dk.screen === 'today') { var c = document.getElementById('deskTodayCentre'), top = c ? c.scrollTop : 0; dkRowsFresh(); dkPaintTodayCentre(); dkPaintTodayList(); if (c) c.scrollTop = top; }
}
// After an action that doesn't move the selection (Apply next week): refresh the bar and the rows
// in place, so the list keeps its scroll and the centre isn't rebuilt.
function dkPaintTodayList() {
  var q = _dk.queue, bar = document.querySelector('#deskToday .dk-progress');
  if (bar && q && q.total) bar.replaceWith(dkProgressBar(q));
  if (!q) return;
  q.queue.forEach(function (r) {
    var old = document.querySelector('#deskToday .dk-qrow[data-lane="q"][data-id="' + CSS.escape(r.athlete.id) + '"]');
    if (old) old.replaceWith(dkQueueRow(r, 'q'));
  });
}

// ---------- lifts ----------
function dkWsLifts(r) {
  var a = r.athlete, prog = r.status.program, u = unitLabel();
  var logs = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === a.id; });
  var t = todayISO();
  var meets = (Store.get().meets || []).filter(function (m) { return m.athleteId === a.id && !m.planned && m.date && String(m.date).slice(0, 10) <= t; });
  var box = el('div', { class: 'dk-wl' });
  MAIN_LIFTS.forEach(function (L) {
    var now = bestE1RM(a.id, L) || 0;
    var vals = strengthSeries(logs, L, { weeks: 16 }).map(function (p) { return p.value; });
    var d = vals.length >= 2 ? vals[vals.length - 1] - vals[Math.max(0, vals.length - 5)] : null;
    var card = el('div', { class: 'dk-wl-card lift-' + L });
    var top = el('div', { class: 'dk-wl-top' });
    top.appendChild(el('span', { class: 'dk-wl-name' }, el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }), LIFT_LABELS[L]));
    var dd = d == null ? null : Math.round(kgToDisplay(d));
    if (dd) top.appendChild(el('span', { class: 'dk-delta' + (dd > 0 ? ' is-up' : ' is-down'), title: 'e1RM, last 4 weeks' }, (dd > 0 ? '+' : '−') + Math.abs(dd)));
    card.appendChild(top);
    if (!now) { card.appendChild(el('div', { class: 'dk-wl-big is-empty' }, 'Waiting for first set')); box.appendChild(card); return; }
    card.appendChild(el('div', { class: 'dk-wl-big' }, el('b', {}, String(Math.round(kgToDisplay(now)))), el('small', {}, u + ' e1RM')));
    var best = meets.reduce(function (m, x) { return Math.max(m, Number(x[L]) || 0); }, 0);
    var bits = [];
    if (best > 0) { var gap = Math.round(kgToDisplay(now - best)); bits.push('Meet best ' + exactW(best) + ' · ' + (gap >= 0 ? '+' : '−') + Math.abs(gap)); }
    else { var one = bestSingle(a.id, L); if (one) bits.push('1RM ' + exactW(one.kg)); }
    var pm = prog && prog.maxes && Number(prog.maxes[L]) > 0 ? Number(prog.maxes[L]) : 0;
    card.appendChild(el('div', { class: 'dk-wl-line' }, bits.join(' · ') || 'No single yet'));
    // Where the block's % comes from, when the coach set it.
    if (pm) card.appendChild(el('div', { class: 'dk-wl-line is-sub' }, '% from program max ' + exactW(pm)));
    if (vals.length >= 2) card.appendChild(el('div', { class: 'dk-wl-spark', html: uiSparkline(vals) }));
    box.appendChild(card);
  });
  var total = currentTotal(a.id);
  var tc = el('div', { class: 'dk-wl-card is-total' });
  var tt = el('div', { class: 'dk-wl-top' });
  tt.appendChild(el('span', { class: 'dk-wl-name' }, 'Total'));
  var td = r.total && r.total.delta != null ? Math.round(kgToDisplay(r.total.delta)) : 0;
  if (td) tt.appendChild(el('span', { class: 'dk-delta' + (td > 0 ? ' is-up' : ' is-down'), title: 'e1RM total, last 4 weeks' }, (td > 0 ? '+' : '−') + Math.abs(td)));
  tc.appendChild(tt);
  if (!total) tc.appendChild(el('div', { class: 'dk-wl-big is-empty' }, 'All three lifts first'));
  else {
    tc.appendChild(el('div', { class: 'dk-wl-big' }, el('b', {}, String(Math.round(kgToDisplay(total)))), el('small', {}, u + ' e1RM')));
    var bw = latestBodyweight(a.id);
    var singles = bestSinglesTotal(a.id);
    var tb = [];
    if (singles) tb.push('1RM ' + exactW(singles.kg));
    if (bw) tb.push(dotsScore(singles ? singles.kg : total, bw, a.sex || 'male').toFixed(1) + ' DOTS');
    tc.appendChild(el('div', { class: 'dk-wl-line' }, tb.join(' · ') || ' '));
    if (r.total && r.total.values.length >= 2) tc.appendChild(el('div', { class: 'dk-wl-spark', html: uiSparkline(r.total.values) }));
  }
  box.appendChild(tc);
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
function dkWsCheckins(r) {
  var me = _dkCoachMeId();
  var s = Store.get();
  var qs = (s.checkinQuestions || []).filter(function (q) { return q.coachId === me; });
  var g = deskCheckinGrid(qs, s.checkinAnswers || [], r.athlete.id);
  var any = g.rows.some(function (row) { return row.cells.some(Boolean); });
  if (!g.rows.length || !any) {
    // The older weekly form, when that's what they use.
    var wci = (s.checkins || []).filter(function (c) { return c.athleteId === r.athlete.id; }).sort(function (x, y) { return String(y.weekStart).localeCompare(String(x.weekStart)); })[0];
    if (!wci) return g.rows.length ? el('p', { class: 'dk-quiet-p' }, 'No answers in the last four weeks.') : null;
    return el('p', { class: 'dk-quiet-p' }, 'Week of ' + fmtDateShort(wci.weekStart) + ': sleep ' + wci.sleep + ' · soreness ' + wci.soreness + ' · stress ' + wci.stress + ' · feel ' + wci.feel + (wci.note ? ' · ' + wci.note : ''));
  }
  var t = el('table', { class: 'dk-ci' });
  var hr = el('tr');
  hr.appendChild(el('th', { scope: 'col' }, ''));
  g.weeks.forEach(function (m, i) { hr.appendChild(el('th', { scope: 'col', class: i === g.weeks.length - 1 ? 'is-now' : '' }, i === g.weeks.length - 1 ? 'This wk' : fmtDateShort(m))); });
  t.appendChild(el('thead', {}, hr));
  var tb = el('tbody');
  g.rows.forEach(function (row) {
    var tr = el('tr');
    tr.appendChild(el('th', { scope: 'row', title: row.q.prompt }, dkQShort(row.q)));
    row.cells.forEach(function (c) {
      var td = el('td', { class: c && c.tone ? 't-' + c.tone : '' }, c ? c.text : '–');
      if (!c) td.classList.add('dk-dim');
      if (c && c.tone === 'warn' && row.base != null) td.title = 'Their 4-week norm is ' + _num(row.base);
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  return t;
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
  var box = el('div', { class: 'dk-rec' });
  var metric = function (label, key, fmt, badLow) {
    var vals = rows.map(function (h) { return Number(h[key]); }).filter(function (n) { return n > 0; });
    if (vals.length < 3) return;
    var hist = vals.slice(0, -1), mean = hist.reduce(function (s, x) { return s + x; }, 0) / hist.length;
    var sd = Math.sqrt(hist.reduce(function (s, x) { return s + (x - mean) * (x - mean); }, 0) / hist.length) || mean * 0.03;
    var lo = mean - sd, hi = mean + sd, last = vals[vals.length - 1];
    var off = badLow ? last < lo : last > hi;
    var row = el('div', { class: 'dk-rec-row' + (off ? ' is-off' : '') });
    var txt = el('div', { class: 'dk-rec-txt' });
    txt.appendChild(el('b', {}, label + ' ' + fmt(last)));
    txt.appendChild(el('span', {}, 'Normal ' + fmt(lo) + '–' + fmt(hi)));
    row.appendChild(txt);
    row.insertAdjacentHTML('beforeend', dkBandChart(vals, lo, hi));
    box.appendChild(row);
  };
  metric('Sleep', 'sleepMin', function (m) { return sleepHm(m); }, true);
  metric('Resting HR', 'rhr', function (n) { return String(Math.round(n)); }, false);
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
      up.appendChild(el('div', { class: 'dk-mt-bw' + (bw.over > 0 ? ' is-over' : '') }, 'BW ' + _num(kgToDisplay(bw.bw, 1)) + ' ' + u +
        (bw.over > 0 ? ' · ' + _num(kgToDisplay(bw.over, 1)) + ' over · ' + _num(kgToDisplay(bw.over / weeks, 1)) + ' ' + u + ' a week to make it' : ' · ' + _num(kgToDisplay(-bw.over, 1)) + ' under')));
      var series = (Store.get().bodyweight || []).filter(function (b) { return b.athleteId === a.id && Number(b.weight) > 0; })
        .sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); }).slice(-10).map(function (b) { return Number(b.weight); });
      if (series.length >= 2) up.insertAdjacentHTML('beforeend', dkClassLine(series, bw.cls));
    }
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
  if (!box.childNodes.length) box.appendChild(el('p', { class: 'dk-quiet-p' }, 'No meets yet. They add one under Progress, or link their OpenPowerlifting profile.'));
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
function dkWsNotes(r) {
  var a = r.athlete;
  var notes = (Store.get().sessionNotes || []).filter(function (n) { return n.athleteId === a.id && n.note && String(n.note).trim(); })
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
      view.appendChild(buildProgramGrid({ id: b.id, weeks: weeks, maxes: b.maxes }, a.id, { readOnly: true }));
    });
    list.appendChild(row);
  });
  var sec = dkSection('Blocks', list);
  sec.appendChild(view);
  return sec;
}

// ---------- the context pane: private notes, then the thread ----------
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
// N: a new private note for whoever is in front of the coach.
function dkNoteCompose(aid) {
  var root = document.documentElement;
  if (root.classList.contains('ctx-off')) { root.classList.remove('ctx-off'); _dkLS('powa-desk-ctx', 'on'); dkSyncCtx(); }
  var box = document.querySelector('#deskCtx .dk-pn[data-aid="' + CSS.escape(aid) + '"]');
  if (!box) { if (_dk.screen === 'today' && !document.querySelector('[data-pane="athlete"]:not(.hidden)')) dkPaintTodayCtx(true); else dkPaintPageCtx(true); box = document.querySelector('#deskCtx .dk-pn'); }
  if (box && box._compose) box._compose();
}
// The athlete page's side pane: private notes, then the thread (a peek until the coach touches it).
function dkPaintPageCtx(now) {
  var host = dkCtxHost();
  var aid = window._apAthlete;
  if (!host || !aid || !document.querySelector('[data-pane="athlete"]:not(.hidden)')) return;
  dkSyncCtx();
  if (!dkCtxReady()) return;
  if (!now && host.dataset.aid === 'page:' + aid && host.querySelector('.msg-thread')) return;
  dkCtxClear();
  var r = dkRow(aid) || (dkRowsFresh(), dkRow(aid));
  if (!r) return;
  host.dataset.aid = 'page:' + aid;
  host.appendChild(dkNotesBox(aid));
  var th = _dkThreadLast(aid);
  host.appendChild(el('div', { class: 'dk-ctx-head is-sub' }, el('div', { class: 'dk-ctx-title' }, el('b', {}, 'Thread'), el('span', {}, th ? 'Last message ' + _dkAgoTime(th.lastAt) : 'No messages yet'))));
  host._msgCleanupBox = dkThreadInto(host, r.athlete, { peek: true, emptyText: dkReplyPrompt(r) });
}

// =====================================================================
// PROGRAMS (W1b): the builder, grid-first on the desk. A list pane to
// pick an athlete or a template (templates moved here from You), a
// one-row block header, the Grid by default (Weeks one click away, a
// whole week's days side by side), an inspector for the picked cell
// with the progression fill, and Notify with the count of edits since the last heads-up.
// Phones keep the Weeks builder as it was.
// =====================================================================
function deskPbView() { return _dkLS('powa-pb-view-desk') === 'weeks' ? 'weeks' : 'grid'; }
function deskSetPbView(v) { _dkLS('powa-pb-view-desk', v === 'weeks' ? 'weeks' : null); }
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
  if (_dk.pbMode === 'templates') { dkPaintTemplate(); return true; }
  _dk.pbInfo = null;
  return false;
}
// loadProgram is done drawing: the side pane, the outlines, the count.
function deskBuilderDone() { dkSyncCtx(); dkPbMarkEdited(); dkPaintPbHead(); if (dkCtxReady()) dkPaintInspector(); }
function deskSyncCtx() { dkSyncCtx(); }
function dkPbAthleteId() { var sel = document.getElementById('progAthlete'); return sel ? sel.value : ''; }
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
      row.appendChild(el('span', { class: 'dk-pb-ic', html: ICONS.copy }));
      var main = el('span', { class: 'dk-qmain' });
      main.appendChild(el('span', { class: 'dk-qname' }, t.name || 'Template'));
      main.appendChild(el('span', { class: 'dk-pb-sub' }, weeks.length + (weeks.length === 1 ? ' week · ' : ' weeks · ') + sets + ' sets'));
      row.appendChild(main);
      row.addEventListener('click', function () { _dk.pbTpl = t.id; loadProgram(); });
      box.appendChild(row);
    });
    var nb = el('button', { type: 'button', class: 'dk-pb-new' });
    nb.insertAdjacentHTML('beforeend', ICONS.plus);
    nb.appendChild(el('span', {}, 'New template from a sheet'));
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
    main.appendChild(el('span', { class: 'dk-pb-sub' + (prog ? '' : ' dk-dim') }, dkBlockText(r.status)));
    row.appendChild(main);
    if (ch) row.appendChild(el('span', { class: 'dk-pb-dot', title: ch + (ch === 1 ? ' edit' : ' edits') + ' since the last heads-up' }, String(ch)));
    row.addEventListener('click', function () {
      if (on) return;
      var sel = document.getElementById('progAthlete');
      if (sel) sel.value = a.id;
      try { activeWeekIdx = 0; } catch (e) {}
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
// Notify (was "Publish"): the athlete hears (push + email, coach.html notifyAthleteAssigned) and the
// count resets. Edits are live as typed; this is a heads-up, not a gate.
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
// The one-row block header: name · size · logged · maxes · Weeks|Grid · ⋯ · Notify.
function deskBuilderHead(prog, athleteId, actions, view) {
  var a = (Store.get().athletes || []).find(function (x) { return x.id === athleteId; }) || { name: 'athlete' };
  var head = el('div', { class: 'dk-pbhead' });
  var name = el('input', { type: 'text', class: 'dk-pbname', 'aria-label': 'Program name', spellcheck: 'false' });
  name.value = prog.name || '';
  name.addEventListener('input', function () {
    Store.update(function (s) { var p = s.programs.find(function (x) { return x.id === prog.id; }); if (p) p.name = name.value; });
    persistProgram(prog.id);
  });
  name.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === 'Escape') { e.preventDefault(); name.blur(); } });
  head.appendChild(name);
  var sets = prog.weeks.flatMap(function (w) { return w.days; }).flatMap(function (d) { return d.exercises; }).flatMap(function (e) { return e.sets; });
  var done = sets.filter(function (s) { return s.completed; }).length;
  head.appendChild(el('span', { class: 'dk-pbmeta' }, prog.weeks.length + ' wk' + (sets.length ? ' · ' + Math.round(done / sets.length * 100) + '% logged' : '')));
  var bits = MAIN_LIFTS.map(function (L) { var v = programMaxKg(prog, athleteId, L); var own = prog.maxes && Number(prog.maxes[L]) > 0; return v > 0 ? LIFT_LABELS[L].charAt(0) + Math.round(kgToDisplay(v)) + (own ? '' : '*') : null; }).filter(Boolean);
  var mx = el('button', { type: 'button', class: 'dk-pbmax', title: bits.some(function (b) { return /\*$/.test(b); }) ? 'The maxes % sets work from. * = their best e1RM (no max set for this block)' : 'The maxes % sets work from' },
    el('span', {}, 'Maxes'), el('b', {}, bits.length ? bits.join(' ') : 'not set'));
  mx.addEventListener('click', function () { openMaxesSheet(prog.id, athleteId); });
  head.appendChild(mx);
  head.appendChild(el('span', { class: 'dk-sp' }));
  var seg = el('div', { class: 'dk-seg', role: 'radiogroup', 'aria-label': 'Builder view' });
  [['grid', 'Grid'], ['weeks', 'Weeks']].forEach(function (x) {
    var on = view === x[0];
    var b = el('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) }, x[1]);
    b.addEventListener('click', function () { if (on) return; deskSetPbView(x[0]); loadProgram(); });
    seg.appendChild(b);
  });
  head.appendChild(seg);
  // TEAM PROGRAMS (M4) TEMPORARY proof-of-data button: opens app.js openTeamSheet. The desk v2
  // Team view replaces it; remove this line with it.
  if (typeof openTeamSheet === 'function') { var tb = dkBtn('Team', { cls: 'is-quiet', onClick: function () { openTeamSheet(); } }); tb.id = 'dkTeamBtn'; tb.title = 'Team programs (preview)'; head.appendChild(tb); }
  var more = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Program options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: DK_IC.more });
  more.addEventListener('click', function (e) {
    e.stopPropagation();
    var items = (actions || []).filter(Boolean).filter(function (x) { return !/^Notify /.test(x.label); }).map(function (x) { return { label: x.label, run: x.onClick }; });
    // The phone's hero carries "Build from goal" for an empty block; here it waits in ⋯.
    if (!sets.length && typeof openGoalModal === 'function') items.unshift({ label: 'Build from goal…', run: function () { openGoalModal(athleteId); } });
    // The Grid / Weeks toggle steps in here when the inspector leaves no room for it.
    items.push('-', { label: view === 'grid' ? 'Weeks view' : 'Grid view', run: function () { deskSetPbView(view === 'grid' ? 'weeks' : 'grid'); loadProgram(); } });
    dkPopMenu(more, items, { alignRight: true });
  });
  head.appendChild(more);
  var pub = el('span', { class: 'dk-pbpub', 'data-aid': athleteId, 'data-first': _dkFirst(a.name) });
  head.appendChild(pub);
  _dk.pbHead = { prog: prog.id, aid: athleteId };
  setTimeout(dkPaintPbHead, 0);
  return head;
}
function dkPaintPbHead() {
  var slot = document.querySelector('#programArea .dk-pbpub');
  if (!slot) return;
  var aid = slot.dataset.aid, prog = dkProgOf(aid);
  if (!prog) return;
  var n = dkPbChanges(prog).length;
  slot.innerHTML = '';
  // Edits save as they're typed and the athlete sees them straight away, so this isn't a gate:
  // it's the heads-up (push + email), with the count of edits since the last one.
  var first = slot.dataset.first;
  var b = n ? dkBtn('Notify', { primary: true, onClick: function () { dkPublish(aid); } }) : dkBtn('Up to date', { cls: 'is-quiet', icon: ICONS.check });
  if (n) {
    var lab = b.querySelector('span');
    lab.textContent = '';
    lab.appendChild(document.createTextNode('Notify'));
    lab.appendChild(el('span', { class: 'dk-pub-to' }, ' ' + first));
    lab.appendChild(document.createTextNode(' · ' + n + (n === 1 ? ' edit' : ' edits')));
    b.setAttribute('aria-label', 'Notify ' + first + ' about ' + n + (n === 1 ? ' edit' : ' edits'));
  }
  if (!n) { b.disabled = true; b.title = 'Saved as you type. ' + first + ' already sees every edit; no edits since the last heads-up.'; }
  else b.title = 'Saved as you type: ' + first + ' already sees ' + (n === 1 ? 'it' : 'them') + '. Notify sends a heads-up about the ' + n + (n === 1 ? ' edit' : ' edits') + ' since the last one.';
  slot.appendChild(b);
}
// Cells edited since the last heads-up carry a thin ink outline until it goes out.
function dkPbMarkEdited() {
  var wrap = document.querySelector('#programArea .pg-grid-wrap');
  var aid = dkPbAthleteId(), prog = dkProgOf(aid);
  if (!wrap || !prog) return;
  var ch = {};
  dkPbChanges(prog).forEach(function (k) { ch[k] = 1; });
  wrap.querySelectorAll('td[data-cell]').forEach(function (td) { td.classList.toggle('is-edited', !!ch[td.dataset.cell]); });
}
// buildProgramGrid's desk hooks: a cell changed (count, outline) / a cell picked (the inspector).
function deskGridEdited() { deskGridFit(); dkPbMarkEdited(); dkPaintPbHead(); var l = document.getElementById('dkPbList'); if (l) dkPaintPbRows(l); if (_dk.pbInfo) dkPaintInspector(); }
// A prescription is an <input>, so it can't wrap: each week column gets a min-width from its
// longest prescription instead, and the grid scrolls sideways inside its own box. Nothing is cut
// mid-load, with or without the inspector beside it. Re-run as cells are typed into.
// The width an input needs to show its whole value (its own font, padding and border).
function _dkInputW(inp) {
  var cs = getComputedStyle(inp);
  var ctx = (_dk.fitCtx || (_dk.fitCtx = document.createElement('canvas').getContext('2d')));
  ctx.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  var pad = (parseFloat(cs.paddingLeft) || 0) + (parseFloat(cs.paddingRight) || 0) + (parseFloat(cs.borderLeftWidth) || 0) + (parseFloat(cs.borderRightWidth) || 0) + 6;
  return Math.min(420, Math.ceil(ctx.measureText(inp.value || inp.placeholder || '').width + pad));
}
function deskGridFit(table) {
  table = table || document.querySelector('#programArea .pg-grid');
  if (!table) return;
  // Built before it's on the page: measure once it is (the font and padding come from CSS).
  if (!table.isConnected) { requestAnimationFrame(function () { if (table.isConnected) deskGridFit(table); }); return; }
  var wid = {};
  table.querySelectorAll('input.pg-cell').forEach(function (i) {
    var w = i.dataset.wi;
    wid[w] = Math.max(wid[w] || 0, _dkInputW(i));
  });
  table.querySelectorAll('td[data-cell]').forEach(function (td) {
    var px = wid[td.dataset.cell.split('.')[0]] || 0;
    td.style.minWidth = px ? px + 'px' : '';
  });
}
function deskGridFocus(info) { _dk.pbInfo = info; dkSyncCtx(); dkPaintInspector(); }
// The empty program: paste the block from the sheet (the one action), or two quiet starts.
function deskBuilderEmpty(area, athleteId) {
  var a = (Store.get().athletes || []).find(function (x) { return x.id === athleteId; }) || { name: '' };
  var box = el('div', { class: 'dk-pbempty' });
  box.appendChild(el('h2', { class: 'dk-h2' }, 'No program for ' + _dkFirst(a.name) + ' yet'));
  box.appendChild(el('p', {}, 'Paste the block straight from your sheet. It reads like you write it: 3x5 @8, 4x6 75%, 1x3 180.'));
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn('Paste a block from your sheet', { primary: true, onClick: function () { openSheetImport(athleteId); } }));
  var me = _dkCoachMeId();
  var tpls = (Store.get().programTemplates || []).filter(function (t) { return t.coachId === me; });
  if (tpls.length) {
    var tb = dkBtn('Start from a template', { cls: 'is-quiet', onClick: function () { dkAssignTemplate([athleteId], tb); } });
    acts.appendChild(tb);
  }
  acts.appendChild(dkBtn('Blank 4-week block', { cls: 'is-quiet', onClick: function () { dkBlankBlock(athleteId); } }));
  box.appendChild(acts);
  area.appendChild(box);
}
function dkBlankBlock(athleteId) {
  var me = _dkCoachMeId();
  var prog = { id: uid('prog'), athleteId: athleteId, coachId: me, name: 'New block', weeks: [1, 2, 3, 4].map(function (n) { return newWeek(n, 3); }) };
  Store.update(function (s) { s.programs = s.programs.filter(function (p) { return p.athleteId !== athleteId; }).concat([prog]); });
  if (!window._demoMode) DB.upsertProgram(prog).catch(function (e) { console.error(e); toast('Could not save the program'); });
  try { activeWeekIdx = 0; } catch (e) {}
  loadProgram();
}
// The inspector: what was written, what was lifted, what % comes to, and the fill.
function dkPaintInspector() {
  var host = dkCtxHost();
  if (!host || _dk.screen !== 'programs') return;
  dkCtxClear();
  if (!dkCtxReady()) return;
  host.dataset.aid = 'pb';
  var info = _dk.pbInfo;
  var box = el('div', { class: 'dk-insp' });
  if (!info) {
    box.appendChild(el('div', { class: 'dk-ctx-empty' }, 'Pick a cell to see what was written, what was lifted, and to fill the weeks after it.'));
    host.appendChild(box);
    return;
  }
  var prog = dkProgOf(info.athleteId);
  var wk = prog && prog.weeks[info.wi];
  var ex = wk && wk.days[info.di] && wk.days[info.di].exercises[info.ei];
  var hd = el('div', { class: 'dk-ctx-head' });
  hd.appendChild(el('div', { class: 'dk-ctx-title' }, el('b', {}, info.label), el('span', {}, 'Week ' + (wk ? wk.number : info.wi + 1) + (wk && wk.days[info.di] ? ' · ' + (wk.days[info.di].name || 'Day ' + (info.di + 1)) : ''))));
  box.appendChild(hd);
  var body = el('div', { class: 'dk-insp-body' });
  var line = function (k, v, cls) { var r = el('div', { class: 'dk-insp-row' + (cls ? ' ' + cls : '') }); r.appendChild(el('span', { class: 'dk-insp-k' }, k)); r.appendChild(el('span', { class: 'dk-insp-v' }, v)); body.appendChild(r); };
  var plan = ex ? groupSets(_deskPlanSets(ex)) : [];
  line('Written', plan.length ? plan.map(dkGroupLabel).join(', ') : 'Nothing yet');
  var done = ex ? ex.sets.filter(function (s) { return s.completed; }) : [];
  if (done.length) {
    var lifted = el('div', { class: 'dk-insp-sets' });
    done.forEach(function (s, i) {
      var tgt = s.rpeHi != null && Number(s.rpeHi) > Number(s.rpe) ? Number(s.rpeHi) : (s.rpe != null && s.rpe !== '' ? Number(s.rpe) : null);
      var over = setOvershoot(s) > 0;
      lifted.appendChild(el('div', { class: 'dk-insp-set' + (over ? ' is-over' : '') },
        el('span', {}, 'Set ' + (ex.sets.indexOf(s) + 1)),
        el('span', {}, (Number(s.weight) > 0 ? _num(kgToDisplay(s.weight)) + '×' : '') + Number(s.reps)),
        el('span', {}, s.actualRpe != null && s.actualRpe !== '' ? 'RPE ' + _num(s.actualRpe) + (tgt != null ? ' (wrote ' + _num(tgt) + ')' : '') : '')));
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
    line('% of', mx ? _num(pctSet.pct) + '% of ' + Math.round(kgToDisplay(mx)) + ' = ' + _num(kgToDisplay(pctLoadKg(pctSet.pct, mx))) + ' ' + unitLabel() + (own ? ' (program max)' : ' (best e1RM)') : 'No max yet: set one under Maxes');
  }
  box.appendChild(body);
  // Progression fill: this cell, moved on a step each week after it.
  var fill = el('div', { class: 'dk-insp-fill' });
  fill.appendChild(el('h3', { class: 'dk-sec-title' }, 'Fill the weeks after'));
  var lbs = getUnit() === 'lbs';
  var opts = [['kg1', '+' + (lbs ? '5 lb' : '2.5 kg') + ' a week'], ['kg2', '+' + (lbs ? '10 lb' : '5 kg') + ' a week'], ['rpe', 'RPE +0.5 a week'], ['pct', '+2.5% a week'], ['same', 'The same each week']];
  var g = el('div', { class: 'dk-insp-btns' });
  opts.forEach(function (o) {
    var b = dkBtn(o[1], { cls: 'dk-btn-sm' });
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () { var api = dkGridApi(); if (api) api.fill(o[0]); });
    g.appendChild(b);
  });
  fill.appendChild(g);
  var keys = el('div', { class: 'dk-insp-keys' });
  var mod = _dkMac() ? '⌘' : 'Ctrl ';
  [[mod + '⇧R', 'Fill after this week'], [mod + 'D', 'Copy the cell above'], [mod + 'Z', 'Undo']].forEach(function (k) { keys.appendChild(el('div', { class: 'dk-keys-row' }, el('span', {}, k[1]), dkKbd(k[0]))); });
  fill.appendChild(keys);
  box.appendChild(fill);
  host.appendChild(box);
}
function dkGridApi() { var w = document.querySelector('#programArea .pg-grid-wrap'); return w && w._api ? w._api : null; }
// ⌘⇧R in a cell: pick the progression from a menu at the cell.
function deskGridFillMenu(inp) {
  var api = dkGridApi();
  if (!api) return;
  var lbs = getUnit() === 'lbs';
  dkPopMenu(inp, [['kg1', '+' + (lbs ? '5 lb' : '2.5 kg') + ' a week'], ['kg2', '+' + (lbs ? '10 lb' : '5 kg') + ' a week'], ['rpe', 'RPE +0.5 a week'], ['pct', '+2.5% a week'], ['same', 'The same each week']]
    .map(function (o) { return { label: o[1], run: function () { api.fill(o[0]); inp.focus(); } }; }));
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
    em.appendChild(el('p', {}, 'Paste a block from your sheet, or save any athlete’s program as one (⋯ in its header). Then hand it to anyone in one click.'));
    var acts = el('div', { class: 'dk-actions' });
    acts.appendChild(dkBtn('Paste a block from your sheet', { primary: true, onClick: function () { openSheetImport(null); } }));
    em.appendChild(acts);
    area.appendChild(em);
    return;
  }
  _dk.pbTpl = tpl.id;
  var weeks = (tpl.payload && tpl.payload.weeks) || [];
  var head = el('div', { class: 'dk-pbhead' });
  head.appendChild(el('h2', { class: 'dk-pbtitle' }, tpl.name || 'Template'));
  var sets = weeks.flatMap(function (w) { return w.days || []; }).flatMap(function (d) { return d.exercises || []; }).flatMap(function (e) { return e.sets || []; }).length;
  head.appendChild(el('span', { class: 'dk-pbmeta' }, weeks.length + ' wk · ' + sets + ' sets' + (tpl.createdAt ? ' · saved ' + fmtDateShort(isoLocal(new Date(tpl.createdAt))) : '')));
  head.appendChild(el('span', { class: 'dk-sp' }));
  if (!document.documentElement.classList.contains('native') && typeof openPublishModal === 'function') head.appendChild(dkBtn('Sell it', { cls: 'is-quiet', onClick: function () { openPublishModal(tpl); } }));
  var del = el('button', { type: 'button', class: 'dk-icon-btn', 'aria-label': 'Delete template', title: 'Delete template', html: ICONS.trash });
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
  area.appendChild(buildProgramGrid({ id: tpl.id, weeks: weeks }, null, { readOnly: true }));
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
  if (flags.length) { var ch = el('div', { class: 'dk-chips is-wrap' }); flags.forEach(function (x) { ch.appendChild(dkChip(x.text, x.tone)); }); pv.appendChild(ch); }
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
    mt.appendChild(el('span', {}, fmtDateShort(r.meet.meet.date) + ' · ' + r.meet.days + ' days' + (r.meet.meet.weightClass ? ' · ' + r.meet.meet.weightClass : '') + (r.bw ? ' · BW ' + _num(kgToDisplay(r.bw.bw, 1)) + ' ' + unitLabel() : '')));
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
function dkSetAthletes(p) {
  var u = _dkUser() || {};
  var pend = (Store.get().invites || []).filter(function (i) { return i.coachId === u.id && !i.used; }).length;
  p.appendChild(el('p', { class: 'dk-set-lead' }, 'One link per athlete. They get the app and land on your roster with every set they log.'));
  p.appendChild(dkSetGroup([
    dkSetRow('Invite links', pend ? pend + (pend === 1 ? ' waiting to be used' : ' waiting to be used') : 'None out', dkBtn('Invite', { cls: 'dk-btn-sm is-ink', icon: ICONS.plus, onClick: function () { openInviteModal(); } })),
    dkSetRow('Bring a program in', 'Paste a block from Google Sheets or Excel', dkBtn('Paste', { cls: 'dk-btn-sm is-quiet', onClick: function () { openSheetImport(null); } })),
    dkSetRow('Export your roster', 'Every athlete, their block and last session, as a spreadsheet', dkBtn('Export CSV', { cls: 'dk-btn-sm is-quiet', onClick: function () { exportRosterCsv(); } }))
  ]));
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
    ['Everywhere', [[mod + 'K', 'Command palette'], ['?', 'Shortcuts'], ['[', 'Collapse the sidebar'], [']', 'Hide the side pane'], ['/', 'Search']]],
    ['Today', [['J  K', 'Next and previous athlete'], ['E', 'Done for this week'], ['S', 'Snooze till tomorrow'], ['U', 'Undo'], ['R', 'Reply'], ['N', 'Private note'], ['O', 'Open their program'], ['↵', 'Open their page'], ['X', 'Pick a win'], [mod + '⇧K', 'Send kudos']]],
    ['An athlete', [['J  K', 'Next and previous'], ['Tab', 'Take a suggested load'], ['⇧A', 'Take every suggestion'], ['R', 'Message'], ['N', 'Private note'], ['P', 'Program'], ['Esc', 'Back to the list']]],
    ['Roster', [['J  K', 'Move down and up'], ['X', 'Select the row'], ['M', 'Message'], ['P', 'Open their program'], ['↵', 'Open their page'], ['Esc', 'Clear the search or selection']]],
    ['Grid', [['↑ ↓  Tab', 'Move'], ['↵', 'Save and go down'], [mod + '⇧R', 'Fill the weeks after'], [mod + 'D', 'Copy the cell above'], [mod + 'Z', 'Undo']]],
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
  var steps = typeof coachSetupSteps === 'function' ? coachSetupSteps() : [];
  var done = steps.filter(function (x) { return x.done; }).length;
  var wrap = el('div', { class: 'dk-fr' });
  var left = el('div', { class: 'dk-fr-main' });
  left.appendChild(el('h1', { class: 'dk-h1' }, 'Welcome' + (u.name ? ', ' + _dkFirst(u.name) : '')));
  left.appendChild(el('p', { class: 'dk-fr-lead' }, done === steps.length && steps.length ? 'You’re set. Your athletes land here the moment they sign up with your link.' : 'Three steps and Today starts telling you who needs you.'));
  var style = dkCoachStyle();
  var q = el('div', { class: 'dk-fr-q' });
  q.appendChild(el('h2', { class: 'dk-sec-title' }, 'How do you coach?'));
  var seg = el('div', { class: 'dk-fr-opts', role: 'radiogroup', 'aria-label': 'How do you coach?' });
  [['solo', 'Individuals', 'A program per lifter'], ['team', 'A team on one plan', 'One block, many lifters']].forEach(function (o) {
    var on = style === o[0];
    var b = el('button', { type: 'button', class: 'dk-fr-opt' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) });
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
    var title = i === 0 && style === 'team' && !x.done ? 'Bring the team’s program in' : x.title;
    main.appendChild(el('b', {}, title));
    main.appendChild(el('span', {}, i === 0 && !x.done ? 'Paste it from Google Sheets or Excel, or open a .csv. Nothing to retype.' : x.sub));
    li.appendChild(main);
    var label = x.done ? 'Open' : i === 0 ? 'Paste or open a .csv' : i === 1 ? 'Invite' : 'Add a photo';
    li.appendChild(dkBtn(label, { primary: i === next, cls: i === next ? '' : 'is-quiet', onClick: x.onClick }));
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
  var rows = [
    ['Maya Chen', 'Peak · wk 3/3', 'Meet 9d', [['Meet in 9d', 'meet']]],
    ['Leo Grant', 'Strength · wk 2/4', '–', [['Squat PR', 'win']]],
    ['Priya Shah', 'Volume · wk 1/4', '–', [['Pain · L knee · squat 4/10', 'alert']]],
    ['Marcus Doyle', 'Peak · wk 2/3', 'Meet 13d', [['1.1 kg over 83 · 2 wk', 'warn']]],
    ['Jonah Reed', 'Strength · wk 2/4', '–', [['Quiet 9d', 'warn']]],
    ['Ines Duarte', 'Strength · wk 1/3', '–', [['Bench @9.5 vs @8', 'warn']]],
    ['Sam Ortiz', 'Hypertrophy · wk 4/6', '–', []],
    ['Kofi Mensah', 'Volume · wk 2/4', '–', [['Message 31h', 'info']]]
  ];
  var t = el('table', { class: 'dk-table dk-fr-table' });
  var hr = el('tr');
  ['Athlete', 'Block', 'Next meet', 'Status'].forEach(function (x) { hr.appendChild(el('th', {}, x)); });
  t.appendChild(el('thead', {}, hr));
  var tb = el('tbody');
  rows.forEach(function (x) {
    var tr = el('tr', { class: 'dk-tr' });
    tr.appendChild(el('td', {}, el('div', { class: 'dk-ath' }, dkAv({ name: x[0] }, 'is-sm'), el('span', { class: 'dk-ath-name' }, x[0]))));
    tr.appendChild(el('td', {}, x[1]));
    tr.appendChild(el('td', {}, x[2] === '–' ? el('span', { class: 'dk-dim' }, '–') : el('span', { class: 'dk-meet' + (/^Meet/.test(x[2]) ? ' is-soon' : '') }, el('b', {}, x[2].replace(/^Meet /, '')))));
    var ch = el('div', { class: 'dk-chips' });
    if (!x[3].length) ch.appendChild(el('span', { class: 'dk-ok' }, 'On track'));
    x[3].forEach(function (c) { ch.appendChild(dkChip(c[0], c[1])); });
    tr.appendChild(el('td', {}, ch));
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  box.appendChild(t);
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
    { n: 'Leo Grant', b: [182.5, 125, 225], last: 1, shape: 'pr', prog: ['Strength Block', 4, 1, 2] },
    { n: 'Priya Shah', b: [115, 67.5, 147.5], last: 1, shape: 'flat', prog: ['Peak', 3, 2, 1], pain: 0, meet: ['Regional Open', 9, '63 kg', 62.4] },
    { n: 'Marcus Doyle', b: [210, 150, 250], last: 2, shape: 'flat', prog: ['Strength Block', 4, 1, 2], over: [1, 1.5] },
    { n: 'Elena Rossi', b: [105, 60, 135], last: 1, shape: 'up', prog: ['Peak', 3, 1, 2], meet: ['State Championships', 12, '57 kg', 58.4] },
    { n: 'Jonah Reed', b: [160, 105, 200], last: 12, shape: 'flat', prog: ['Volume Block', 4, 1, 0] },
    { n: 'Mei Tanaka', b: [125, 72.5, 160], last: 2, shape: 'flat', prog: ['Hypertrophy Wave', 6, 3, 1], note: [2, 'Left knee felt tight on the last squat set. Nothing sharp. Keep going as written?'] },
    { n: 'Callum Ward', b: [195, 135, 240], last: 3, shape: 'up', prog: ['Strength Block', 3, 2, 3], finished: true },
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
        var top = base * 0.82 + (shape[Math.max(0, shape.length - (p.streak || weeks) + x[2])] || 0) * (x[1] === 1 ? 0.6 : 1);
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
      S.programs.push({ id: 'demo-dprog-' + (pi + 1), athleteId: id, coachId: DC, name: pr[0], weeks: wks });
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
  });
}
