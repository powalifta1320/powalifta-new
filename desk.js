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
  mq: null
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
    s = { week: mon, reviewed: {}, snoozed: keep, winsSeen: {}, times: [] };
  }
  s.reviewed = s.reviewed || {}; s.snoozed = s.snoozed || {}; s.winsSeen = s.winsSeen || {}; s.times = s.times || [];
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
  _dk.queue = deskQueue(_dk.rows, { reviewed: st.reviewed, snoozed: st.snoozed, winsSeen: st.winsSeen });
  return _dk.rows;
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
  dkPaintRail();
  // Keys work straight away: focus leaves the rail button for the screen's list.
  if (!opts.noPush && document.activeElement && document.activeElement.closest && document.activeElement.closest('.dk-rail')) {
    var to = screen === 'today' ? document.querySelector('#deskToday .dk-qrow.is-sel, #deskToday .dk-list')
      : screen === 'roster' ? document.querySelector('#rosterArea .dk-tr.is-sel') : null;
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
  if (!_dk.fromGo) {
    _dk.screen = screen;
    if (screen === 'roster') _dk.view = null;
    dkSetHash(screen, {});
  }
  dkSyncCtx();
  dkPaintRail();
}
// coach.html calls this when the athlete page opens: the rail keeps the screen it came from.
function deskOnAthletePage() { if (!isDesk()) return; closeDkMenus(); dkSyncCtx(true); dkPaintRail(); }
function deskBackLabel() { return _dk.screen === 'today' ? 'Today' : 'Roster'; }
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
  if ((t && !t.classList.contains('hidden')) || (ap && !ap.classList.contains('hidden'))) { if (tab) tab.click(); }
  else {
    var ra = document.querySelector('[data-pane="athletes"]');
    if (ra && !ra.classList.contains('hidden') && typeof renderRoster === 'function') { try { renderRoster(); } catch (e) {} }
  }
}
// Today and the roster have a context pane; ] hides it (remembered).
function dkSyncCtx(off) {
  var root = document.documentElement;
  var nothing = _dk.screen === 'today' ? !_dk.sel : !(_dk.rows && _dk.rows.length && _dk.rsel);
  var has = !off && !nothing && (_dk.screen === 'today' || _dk.screen === 'roster') && !document.querySelector('[data-pane="athlete"]:not(.hidden)');
  root.classList.toggle('ctx-show', has && !root.classList.contains('ctx-off'));
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
  if (!off && _dk.screen === 'today') dkPaintTodayCtx();
  if (!off && _dk.screen === 'roster') dkPaintRosterCtx();
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
    onSent: function (m) { dkNoteSent(a.id, m && m.body); setTimeout(dkRepaint, 0); } });
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
    // Nobody yet: Today is the setup checklist.
    var c = el('div', { class: 'dk-setup' });
    c.appendChild(el('h1', { class: 'dk-h1' }, 'Today'));
    try { c.appendChild(buildCoachSetup()); } catch (e) {}
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
  if (q.total) {
    var prog = el('div', { class: 'dk-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(q.total), 'aria-valuenow': String(q.done.length) });
    prog.appendChild(el('div', { class: 'dk-progress-line' }, el('i', { style: 'transform:scaleX(' + (q.done.length / q.total).toFixed(3) + ')' })));
    // Caught up, the centre says so: the bar alone stays full here.
    if (q.queue.length) prog.appendChild(el('span', { class: 'dk-progress-text' }, 'Reviewed ' + q.done.length + ' of ' + q.total));
    head.appendChild(prog);
  }
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
  top.appendChild(el('span', { class: 'dk-qago' + (r.live ? ' is-live' : '') }, r.live ? 'Training now' : dkAgoShort(r.status.ago)));
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
// The centre: the selected athlete, opened at what needs the coach. (The full workspace is W1b;
// ↵ opens today's athlete page.)
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
  c.appendChild(dkReviewHead(r, lane === 'q' ? (lanePos + 1) + ' of ' + q.queue.length + ' to review' : 'Win ' + (lanePos + 1) + ' of ' + q.wins.length, true));
  var acts = el('div', { class: 'dk-actions' });
  acts.appendChild(dkBtn('Reply', { primary: true, kbd: 'R', onClick: dkReply }));
  if (lane === 'q') {
    acts.appendChild(dkBtn('Done', { kbd: 'E', icon: ICONS.check, onClick: function () { dkMark('done'); }, title: 'Done for this week. They come back if something new comes up.' }));
    acts.appendChild(dkBtn('Snooze', { kbd: 'S', icon: DK_IC.snooze, onClick: function () { dkMark('snooze'); }, title: 'Till tomorrow' }));
  } else {
    acts.appendChild(dkBtn('Seen', { kbd: 'E', icon: ICONS.check, onClick: function () { dkMark('done'); } }));
  }
  c.appendChild(acts);
  if (lane === 'w') c.appendChild(dkSection('Wins', dkWinList(r)));
  if (r.reasons.length) c.appendChild(dkSection(lane === 'q' ? 'What needs you' : 'Also flagged', dkReasonList(r)));
  var grid = el('div', { class: 'dk-cgrid' });
  grid.appendChild(dkSection('Lifts', dkLifts(r)));
  grid.appendChild(dkSection('Last 7 days', dkWeek(r)));
  c.appendChild(grid);
  var note = dkLatestNote(r);
  if (note) c.appendChild(dkSection('Their latest note', note));
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
  var bits = [];
  if (st.sessions.planned) bits.push(st.sessions.done + ' of ' + st.sessions.planned + ' sessions this week');
  // Every fact once: a meet close enough to be a flag is said there, not here too.
  if (r.meet && !r.reasons.some(function (x) { return x.type === 'meet'; })) bits.push(r.meet.meet.name + ' in ' + r.meet.days + 'd');
  if (bits.length) sub.appendChild(document.createTextNode(' · ' + bits.join(' · ')));
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
    ? q.done.length + (q.done.length === 1 ? ' athlete' : ' athletes') + ' reviewed' + (mins ? ' in ' + mins + ' min' : '') + (q.snoozed.length ? ' · ' + q.snoozed.length + ' snoozed' : '')
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
  var head = el('div', { class: 'dk-ctx-head' });
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
  cmds.push({ group: 'Actions', label: 'Invite an athlete', keys: 'add new', run: function () { openInviteModal(); } });
  (Store.get().programTemplates || []).filter(function (t) { return t.coachId === u.id; }).forEach(function (t) {
    cmds.push({ group: 'Actions', label: 'Assign “' + (t.name || 'Template') + '” to…', keys: 'template program apply', run: function () { openApplyTemplate(t); } });
  });
  if (_dk.queue && _dk.queue.wins.length) cmds.push({ group: 'Actions', label: 'Send kudos to this week’s wins', hint: _dkMac() ? '⌘⇧K' : 'Ctrl Shift K', keys: 'praise congrats pr', run: function () { deskGo('today'); dkKudos(); } });
  cmds.push({ group: 'Actions', label: 'Export roster as CSV', keys: 'download spreadsheet', run: function () { exportRosterCsv(); } });
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
  var mod = _dkMac() ? '⌘' : 'Ctrl ';
  var groups = [
    ['Everywhere', [[mod + 'K', 'Command palette'], ['?', 'This sheet'], ['[', 'Collapse the sidebar'], [']', 'Hide the side pane'], ['/', 'Search the roster']]],
    ['Today', [['J  K', 'Next and previous athlete'], ['E', 'Done for this week'], ['S', 'Snooze till tomorrow'], ['U', 'Undo'], ['R', 'Reply'], ['O', 'Open their program'], ['↵', 'Open their page'], ['X', 'Pick a win'], [mod + '⇧K', 'Send kudos']]],
    ['Roster', [['J  K', 'Move down and up'], ['X', 'Select the row'], ['M', 'Message'], ['P', 'Open their program'], ['↵', 'Open their page'], ['Esc', 'Clear the search or selection']]]
  ];
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
    if (_dk.screen !== 'roster' || onPage) deskGo('roster', { view: _dk.view });
    var si = document.querySelector('#rosterArea .dk-search input');
    if (si) { si.focus(); si.select(); }
    return;
  }
  if (onPage) return;
  var low = k.length === 1 ? k.toLowerCase() : k;
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
