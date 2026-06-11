/* POWALIFTA — shared utilities, e1RM, variants
 * Storage is now Supabase via db.js. The Store object below is an
 * in-memory cache populated by DB.hydrateAll() on bootstrap.
 */

// =========================================================
// IN-MEMORY STORE
// =========================================================
const defaultStore = () => ({
  coaches: [],
  athletes: [],
  invites: [],
  programs: [],
  programTemplates: [],
  workoutLogs: [],
  bodyweight: [],
  sessionNotes: [],
  goals: [],
  restDays: []
});

const Store = {
  _data: defaultStore(),
  get() { return this._data; },
  set(s) { this._data = s; },
  update(fn) { fn(this._data); return this._data; },
  reset() { this._data = defaultStore(); }
};
window.Store = Store;

// =========================================================
// AUTH
// =========================================================
// IDs for top-level rows (prog/tpl/log/bw/note/rest) hit Postgres uuid columns,
// so we generate real UUID v4. Nested JSONB IDs (week/day/ex/set) live inside
// the weeks blob and don't need to be UUIDs but we use the same generator
// for consistency.
function _randomUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}
function uid(prefix = 'id') {
  // Always return a valid UUID (Postgres uuid columns require it).
  // The prefix arg is ignored — kept for callsite compatibility.
  return _randomUUID();
}

// Auth lives in Supabase. Current user is hydrated on bootstrap.
function getCurrentUser() {
  return window._user || null;
}
function requireAuth(expectedType) {
  const user = getCurrentUser();
  if (!user) { location.href = 'index.html'; return null; }
  if (expectedType && user.userType !== expectedType) {
    location.href = user.userType === 'coach' ? 'coach.html' : 'athlete.html';
    return null;
  }
  return user;
}
async function logout() {
  try { await DB.signOut(); } catch (e) { console.warn(e); }
  window._user = null;
  Store.reset();
  location.href = 'index.html';
}

// =========================================================
// LIVE DEMO MODE — the full athlete dashboard with a generated
// 16-week training history. No account, no writes, no risk.
// Activated by ?demo=1 on athlete.html. All persistence no-ops.
// =========================================================
window._demoMode = /[?&]demo=1/.test(location.search);

function _buildDemoData() {
  const DA = 'demo-athlete', DC = 'demo-coach';
  const iso = d => d.toISOString().slice(0, 10);
  const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return iso(d); };
  // Deterministic jitter so the demo looks organic but identical every load
  const j = (seed, range) => Math.round((Math.sin(seed * 12.9898) * 0.5 + 0.5) * range * 2) / 2;

  const user = {
    id: DA, name: 'Demo Lifter', email: 'demo@powalifta.com', bio: '',
    coachId: DC, userType: 'athlete', isAdmin: false,
    subscriptionTier: 'free', subscriptionStatus: 'inactive', avatarUrl: null, countryCode: null
  };
  const coaches = [{ id: DC, name: 'Demo Coach', email: 'coach@powalifta.com', bio: 'This is what your coach sees and writes.', avatarUrl: null, countryCode: null, createdAt: Date.now() }];

  // --- 16 weeks of logged history: Mon=squat, Wed=bench, Fri=deadlift ---
  const workoutLogs = [];
  const cfg = [
    { lift: 'squat', base: 142.5, perWk: 1.25, variant: 'Paused', varPct: 0.82, acc: ['legs', 'Leg Press'] },
    { lift: 'bench', base: 92.5, perWk: 0.75, variant: 'Close Grip', varPct: 0.88, acc: ['push', 'DB Incline Press'] },
    { lift: 'deadlift', base: 175, perWk: 1.5, variant: 'Deficit', varPct: 0.85, acc: ['pull', 'Barbell Row'] }
  ];
  let logSeq = 1;
  for (let w = 15; w >= 0; w--) {
    cfg.forEach((c2, di) => {
      const date = daysAgo(w * 7 + (5 - di * 2)); // Fri/Wed/Mon spread
      const top = c2.base + (15 - w) * c2.perWk + j(w * 3 + di, 2.5) - 1.25;
      // Top sets
      [[5, 7.5], [5, 8], [3, 8.5]].forEach(([reps, rpe], si) => {
        const wgt = Math.round((top - si * 2.5) / 2.5) * 2.5;
        workoutLogs.push({
          id: 'demo-log-' + (logSeq++), athleteId: DA, lift: c2.lift, variant: 'Competition', exerciseName: '',
          weight: wgt, reps: reps, rpe: rpe,
          e1rm: calcE1RM(wgt, reps, rpe), e1rmComp: calcCompE1RM(wgt, reps, rpe, c2.lift, 'Competition'),
          date: date, note: ''
        });
      });
      // Variant work
      const vw = Math.round(top * c2.varPct / 2.5) * 2.5;
      workoutLogs.push({
        id: 'demo-log-' + (logSeq++), athleteId: DA, lift: c2.lift, variant: c2.variant, exerciseName: '',
        weight: vw, reps: 4, rpe: 8,
        e1rm: calcE1RM(vw, 4, 8), e1rmComp: calcCompE1RM(vw, 4, 8, c2.lift, c2.variant),
        date: date, note: ''
      });
      // Accessory
      const aw = 40 + (15 - w) * 0.5;
      workoutLogs.push({
        id: 'demo-log-' + (logSeq++), athleteId: DA, lift: c2.acc[0], variant: '', exerciseName: c2.acc[1],
        weight: aw, reps: 10, rpe: 8,
        e1rm: calcE1RM(aw, 10, 8), e1rmComp: calcE1RM(aw, 10, 8),
        date: date, note: ''
      });
    });
  }

  // --- Bodyweight: gentle recomp over 16 weeks ---
  const bodyweight = [];
  for (let d = 110; d >= 0; d -= 2) {
    bodyweight.push({ id: 'demo-bw-' + d, athleteId: DA, date: daysAgo(d), weight: Math.round((84.2 - (110 - d) * 0.012 + j(d, 0.6) - 0.3) * 10) / 10 });
  }

  const goals = [{ id: DA, athleteId: DA, squat: 200, bench: 130, deadlift: 240, total: 570, bodyweight: 83, bwDirection: 'maintain' }];
  const restDays = [2, 9, 16, 23].map(d => ({ id: 'demo-rest-' + d, athleteId: DA, date: daysAgo(d), note: '' }));

  // --- Current program: 4 weeks, today's session pinned and ready to tick ---
  const mkSet = (weight, reps, rpe, done, dt) => ({
    id: uid('set'), weight, reps, rpe,
    completed: !!done, actualRpe: done ? rpe + 0.5 : null, completedAt: done ? dt : null
  });
  const mkDay = (name, exs, done, dt, pin) => {
    const day = { id: uid('day'), name, exercises: exs.map(e2 => ({ id: uid('ex'), lift: e2[0], variant: e2[1], exerciseName: e2[2] || '', note: e2[4] || '', sets: e2[3].map(s2 => mkSet(s2[0], s2[1], s2[2], done, dt)) })) };
    if (pin) day.scheduledDate = pin;
    return day;
  };
  const weeks = [];
  for (let wn = 1; wn <= 4; wn++) {
    const bump = (wn - 1) * 2.5;
    const wkDone = wn <= 2;            // weeks 1–2 fully logged
    const dt = daysAgo((4 - wn) * 7 + 3);
    const pinToday = (wn === 3);       // week 3, day 1 = today's live session
    weeks.push({
      id: uid('wk'), number: wn, days: [
        mkDay('Squat Day', [
          ['squat', 'Competition', '', [[160 + bump, 5, 7.5], [160 + bump, 5, 8], [157.5 + bump, 3, 8.5]], 'Stay tight at the bottom. Drive up hard.'],
          ['squat', 'Paused', '', [[132.5 + bump, 4, 8], [132.5 + bump, 4, 8]], '2-count pause.'],
          ['legs', '', 'Leg Press', [[120, 10, 8], [120, 10, 8]]]
        ], wkDone, dt, pinToday ? iso(new Date()) : null),
        mkDay('Bench Day', [
          ['bench', 'Competition', '', [[105 + bump, 5, 7.5], [105 + bump, 5, 8], [102.5 + bump, 3, 8.5]], 'Leg drive. Touch and go.'],
          ['bench', 'Close Grip', '', [[92.5 + bump, 4, 8], [92.5 + bump, 4, 8]]],
          ['push', '', 'DB Incline Press', [[32.5, 10, 8], [32.5, 10, 8]]]
        ], wkDone, dt),
        mkDay('Deadlift Day', [
          ['deadlift', 'Competition', '', [[197.5 + bump, 4, 7.5], [197.5 + bump, 4, 8], [195 + bump, 2, 8.5]], 'Slack out of the bar before you pull.'],
          ['deadlift', 'Deficit', '', [[167.5 + bump, 3, 8], [167.5 + bump, 3, 8]]],
          ['pull', '', 'Barbell Row', [[80, 10, 8], [80, 10, 8]]]
        ], wkDone, dt),
        mkDay('Rest', [], false, null)
      ]
    });
  }
  const programs = [{ id: 'demo-prog', athleteId: DA, coachId: DC, name: 'Strength Block — Wave 2', weeks }];

  const sessionNotes = [
    { id: 'demo-note-1', athleteId: DA, weekId: null, dayId: null, date: daysAgo(2), note: 'Pulls felt heavy off the floor today but lockout was easy.', coachComment: 'Bar speed on video looked fine — that\'s just deficit fatigue. We deload in two weeks. Keep the openers honest.', coachCommentAt: daysAgo(1) + 'T10:00:00Z', coachId: DC },
    { id: 'demo-note-2', athleteId: DA, weekId: null, dayId: null, date: daysAgo(7), note: 'Bench PR! Moved fast.', coachComment: 'Saw it. Adding 2.5kg to your top sets.', coachCommentAt: daysAgo(6) + 'T10:00:00Z', coachId: DC }
  ];
  const checkins = [{ id: 'demo-ci-1', athleteId: DA, weekStart: daysAgo(9), sleep: 7, soreness: 6, stress: 4, feel: 8, note: 'Good week.', createdAt: daysAgo(9) + 'T08:00:00Z' }];

  return {
    user: user,
    store: {
      coaches, athletes: [], invites: [], programs, programTemplates: [],
      workoutLogs, bodyweight, sessionNotes, goals, restDays, checkins,
      marketplacePrograms: [], mySales: [], myPurchases: []
    }
  };
}

function _injectDemoBanner() {
  const bar = document.createElement('div');
  bar.className = 'demo-banner';
  bar.innerHTML =
    '<span class="demo-banner-dot"></span>' +
    '<span class="demo-banner-text"><strong>Live demo</strong> — fake lifter, real product. Tick sets, hit PRs, make share cards. Nothing saves.</span>' +
    '<a class="btn btn-primary btn-sm" href="index.html">Start yours free</a>';
  document.body.appendChild(bar);
}

// =========================================================
// BOOTSTRAP — runs at the top of every page
//
// usage:
//   bootstrap('coach', () => { /* render coach page */ });
//   bootstrap('athlete', () => { /* render athlete page */ });
//   bootstrap(null,    () => { /* homepage — public OK */ });
//
// Redirects if auth doesn't match expected type. Hydrates Store.
// =========================================================
async function bootstrap(expectedType, onReady, opts) {
  opts = opts || {};

  // Live demo: skip auth + hydration entirely, run on generated data.
  if (window._demoMode && expectedType === 'athlete') {
    const demo = _buildDemoData();
    window._user = demo.user;
    Store._data = demo.store;
    _injectDemoBanner();
    onReady && onReady();
    return;
  }

  let session = null;
  try { session = await DB.getSession(); }
  catch (e) {
    console.error('getSession failed', e);
    // If we can't even talk to Supabase, still let public pages render
    if (!expectedType) { onReady && onReady(); return; }
    toast('Could not reach the server — check your connection.');
    return;
  }
  if (!session) {
    if (expectedType) { location.href = 'index.html'; return; }
    try { Store._data.coaches = await DB.listCoaches(); } catch (e) { console.warn('coach list', e); }
    onReady && onReady();
    return;
  }
  let profile;
  try { profile = await DB.getProfile(session.user.id); }
  catch (e) {
    console.error('profile fetch failed', e);
    try { await DB.signOut(); } catch {}
    if (!expectedType) { onReady && onReady(); return; }
    location.href = 'index.html';
    return;
  }

  window._user = {
    id: profile.id, name: profile.name, email: profile.email, bio: profile.bio || '',
    coachId: profile.coach_id || null,
    userType: profile.user_type,
    isAdmin: !!profile.is_admin,
    subscriptionTier: profile.subscription_tier || 'free',
    subscriptionStatus: profile.subscription_status || 'inactive',
    avatarUrl: profile.avatar_url || null,
    countryCode: profile.country_code || null
  };

  if (!expectedType) {
    if (opts.staticPublic) {
      // Legal/info page — just populate user + coach list, don't redirect
      try { Store._data.coaches = await DB.listCoaches(); } catch (e) {}
      onReady && onReady();
      return;
    }
    // Homepage: bounce logged-in users to dashboard
    location.href = profile.user_type === 'coach' ? 'coach.html' : 'athlete.html';
    return;
  }

  if (expectedType !== profile.user_type) {
    location.href = profile.user_type === 'coach' ? 'coach.html' : 'athlete.html';
    return;
  }

  try {
    Store._data = await DB.hydrateAll(profile);
  } catch (e) {
    console.error('hydrate failed', e);
    toast('Could not load your data — try refreshing.');
    return;
  }

  onReady && onReady();
}
window.bootstrap = bootstrap;

// =========================================================
// THEME (light / dark)
// Stored in localStorage as 'powa-theme'. Applied via a
// data-theme attribute on <html>. Default: dark.
// =========================================================
const THEME_KEY = 'powa-theme';
function getTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  // Fall back to system preference for first-time visitors. We default to dark
  // because the brand is dark-first; only honor explicit "light" pref.
  try {
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
      return 'light';
    }
  } catch {}
  return 'dark';
}
function applyTheme(theme) {
  const t = (theme === 'light') ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem(THEME_KEY, t); } catch {}
  // Update theme-color meta so mobile chrome/safari status bar matches.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'light' ? '#ffffff' : '#0b0b0c');
  // Notify listeners (charts, custom widgets) so they can re-render
  // with theme-aware colors. Wrap in try in case CustomEvent is unavailable.
  try { window.dispatchEvent(new CustomEvent('themechange', { detail: { theme: t } })); } catch {}
}
function toggleTheme() {
  applyTheme(getTheme() === 'light' ? 'dark' : 'light');
}
window.toggleTheme = toggleTheme;
// Apply ASAP, before paint, so we don't get a dark flash in light mode.
applyTheme(getTheme());

// =========================================================
// PWA — service worker registration + install prompt banner
// We register sw.js so the site qualifies as installable. On Android/desktop
// Chrome we capture the beforeinstallprompt event and show our own button.
// On iOS we show a banner with the "Share → Add to Home Screen" instructions
// since iOS doesn't expose a programmatic install path.
// =========================================================
const PWA_DISMISSED_KEY = 'powa-pwa-dismissed';
let _deferredInstallPrompt = null;

function _isStandalone() {
  // PWA is already installed if the page is in standalone display mode
  return window.matchMedia('(display-mode: standalone)').matches ||
         window.navigator.standalone === true;
}
function _isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function _isAndroid() {
  return /android/i.test(navigator.userAgent);
}
function _pwaDismissedRecently() {
  try {
    const t = Number(localStorage.getItem(PWA_DISMISSED_KEY) || 0);
    if (!t) return false;
    // Hide banner for 14 days after dismissal
    return (Date.now() - t) < 14 * 24 * 60 * 60 * 1000;
  } catch { return false; }
}
function _markPwaDismissed() {
  try { localStorage.setItem(PWA_DISMISSED_KEY, String(Date.now())); } catch {}
}

// Register the service worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW register failed:', err));
  });
}

// Capture the install prompt on Android/desktop Chrome
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _deferredInstallPrompt = e;
  // Show our banner if not dismissed
  if (!_pwaDismissedRecently() && !_isStandalone()) showInstallBanner();
});

window.addEventListener('appinstalled', () => {
  _deferredInstallPrompt = null;
  hideInstallBanner();
});

function showInstallBanner() {
  if (document.getElementById('pwaInstallBanner')) return;
  if (_isStandalone()) return;
  if (_pwaDismissedRecently()) return;

  // Only show on mobile or where we have a deferred prompt
  const showableOnIOS = _isIOS();
  const showableViaPrompt = !!_deferredInstallPrompt;
  if (!showableOnIOS && !showableViaPrompt) return;

  const banner = document.createElement('div');
  banner.id = 'pwaInstallBanner';
  banner.className = 'pwa-banner';
  let body, action;
  if (_deferredInstallPrompt) {
    body = '<strong>Install POWALIFTA</strong><span>Quicker access from your home screen.</span>';
    action = '<button class="pwa-banner-cta" onclick="triggerInstall()">Install</button>';
  } else {
    // iOS instructions — no programmatic install
    body = '<strong>Install POWALIFTA</strong><span>Tap <span class="pwa-share-icon">⬆︎</span> Share, then "Add to Home Screen".</span>';
    action = '';
  }
  banner.innerHTML =
    '<div class="pwa-banner-body">' + body + '</div>' +
    action +
    '<button class="pwa-banner-close" onclick="dismissInstallBanner()" aria-label="Dismiss">×</button>';
  document.body.appendChild(banner);
}

function hideInstallBanner() {
  const b = document.getElementById('pwaInstallBanner');
  if (b) b.remove();
}
function dismissInstallBanner() {
  _markPwaDismissed();
  hideInstallBanner();
}
async function triggerInstall() {
  if (!_deferredInstallPrompt) { hideInstallBanner(); return; }
  _deferredInstallPrompt.prompt();
  const { outcome } = await _deferredInstallPrompt.userChoice;
  _deferredInstallPrompt = null;
  hideInstallBanner();
  if (outcome === 'dismissed') _markPwaDismissed();
}
window.dismissInstallBanner = dismissInstallBanner;
window.triggerInstall = triggerInstall;

// On iOS, show the banner ~3 seconds after first paint (since there's no event)
if (_isIOS() && !_isStandalone() && !_pwaDismissedRecently()) {
  window.addEventListener('load', () => setTimeout(showInstallBanner, 3000));
}

// =========================================================
// ONBOARDING TOUR
// Lightweight tour engine. Each step points at a DOM element via a CSS selector,
// shows a spotlight cutout + floating tooltip, advances with Next / closes with Skip.
// Completion is persisted per tour name in localStorage so it only auto-runs once.
//
// Usage:
//   startTour('coach', [
//     { selector: '#tab-roster', title: 'Your roster', body: 'All athletes live here.' },
//     ...
//   ]);
//
//   // To replay later:
//   resetTour('coach'); startTour('coach', [...]);
// =========================================================
const _TOUR_KEY = name => 'powa-tour-' + name + '-done';

function isTourDone(name) {
  try { return localStorage.getItem(_TOUR_KEY(name)) === '1'; }
  catch { return false; }
}
function markTourDone(name) {
  try { localStorage.setItem(_TOUR_KEY(name), '1'); } catch {}
}
function resetTour(name) {
  try { localStorage.removeItem(_TOUR_KEY(name)); } catch {}
}
window.isTourDone = isTourDone;
window.resetTour = resetTour;

let _tourState = { name: null, steps: [], idx: 0 };

function startTour(name, steps) {
  if (!steps || !steps.length) return;
  _tourState = { name, steps, idx: 0 };
  // Wait one frame so layout has settled
  requestAnimationFrame(() => requestAnimationFrame(renderTourStep));
}
window.startTour = startTour;

function renderTourStep() {
  _closeTourOverlay();
  const step = _tourState.steps[_tourState.idx];
  if (!step) return;

  // If the step has a "before" hook (e.g. open a tab to expose the target), run it first
  if (typeof step.before === 'function') {
    try { step.before(); } catch (e) { console.warn('tour before hook failed', e); }
  }

  // Allow the DOM a moment to update if before() switched panes
  setTimeout(() => {
    const target = step.selector ? document.querySelector(step.selector) : null;
    const overlay = document.createElement('div');
    overlay.id = 'tourOverlay';
    overlay.className = 'tour-overlay';

    if (target) {
      const rect = target.getBoundingClientRect();
      const pad = 6;
      overlay.style.setProperty('--tx', (rect.left - pad) + 'px');
      overlay.style.setProperty('--ty', (rect.top - pad) + 'px');
      overlay.style.setProperty('--tw', (rect.width + pad * 2) + 'px');
      overlay.style.setProperty('--th', (rect.height + pad * 2) + 'px');
      // Scroll target into view if it's off-screen
      if (rect.top < 80 || rect.bottom > window.innerHeight - 120) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    } else {
      // No target — full screen dim, centered tip
      overlay.style.setProperty('--tx', '50%');
      overlay.style.setProperty('--ty', '50%');
      overlay.style.setProperty('--tw', '0px');
      overlay.style.setProperty('--th', '0px');
    }

    const tip = document.createElement('div');
    tip.className = 'tour-tip';
    const isLast = _tourState.idx === _tourState.steps.length - 1;
    tip.innerHTML =
      '<div class="tour-tip-step">' + (_tourState.idx + 1) + ' / ' + _tourState.steps.length + '</div>' +
      '<h3 class="tour-tip-title">' + (step.title || '') + '</h3>' +
      '<p class="tour-tip-body">' + (step.body || '') + '</p>' +
      '<div class="tour-tip-actions">' +
        '<button class="btn btn-sm btn-ghost" onclick="endTour(true)">' + (isLast ? 'Close' : 'Skip') + '</button>' +
        (_tourState.idx > 0 ? '<button class="btn btn-sm" onclick="prevTourStep()">Back</button>' : '') +
        '<button class="btn btn-sm btn-primary" onclick="nextTourStep()">' + (isLast ? 'Done' : 'Next') + '</button>' +
      '</div>';
    overlay.appendChild(tip);
    document.body.appendChild(overlay);

    // Position the tip relative to the target (below by default, fallback above)
    if (target) {
      const rect = target.getBoundingClientRect();
      const tipRect = tip.getBoundingClientRect();
      const margin = 16;
      let top = rect.bottom + margin;
      if (top + tipRect.height > window.innerHeight - margin) {
        top = Math.max(margin, rect.top - tipRect.height - margin);
      }
      let left = rect.left + rect.width / 2 - tipRect.width / 2;
      left = Math.max(margin, Math.min(window.innerWidth - tipRect.width - margin, left));
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
    } else {
      // Centered when no target
      tip.style.top = '50%';
      tip.style.left = '50%';
      tip.style.transform = 'translate(-50%, -50%)';
    }
  }, step.before ? 200 : 0);
}

function nextTourStep() {
  if (_tourState.idx < _tourState.steps.length - 1) {
    _tourState.idx++;
    renderTourStep();
  } else {
    endTour(true);
  }
}
function prevTourStep() {
  if (_tourState.idx > 0) {
    _tourState.idx--;
    renderTourStep();
  }
}
function endTour(complete) {
  _closeTourOverlay();
  if (complete && _tourState.name) markTourDone(_tourState.name);
  _tourState = { name: null, steps: [], idx: 0 };
}
function _closeTourOverlay() {
  const o = document.getElementById('tourOverlay');
  if (o) o.remove();
}
window.nextTourStep = nextTourStep;
window.prevTourStep = prevTourStep;
window.endTour = endTour;

// =========================================================
// WEIGHT UNITS (kg / lbs)
// All data stored in kg. Display layer converts. User input from a "weight"
// field is interpreted in the current display unit and converted back to kg.
// Stored per-device in localStorage; toggle reloads the page to avoid
// re-rendering every dependent component manually.
// =========================================================
const UNIT_KEY = 'powa-unit';
const KG_PER_LB = 0.45359237;
function getUnit() {
  try { return localStorage.getItem(UNIT_KEY) === 'lbs' ? 'lbs' : 'kg'; }
  catch { return 'kg'; }
}
function setUnit(u) {
  const v = u === 'lbs' ? 'lbs' : 'kg';
  try { localStorage.setItem(UNIT_KEY, v); } catch {}
}
function toggleUnit() {
  setUnit(getUnit() === 'kg' ? 'lbs' : 'kg');
  // Hard reload — easiest way to guarantee every view re-renders with the new unit.
  location.reload();
}
window.toggleUnit = toggleUnit;

// Display: kg internal value → number in the user's chosen unit.
// `decimals` defaults to 1 for lbs (220.5) and 0 for kg (100), or pass to override.
function kgToDisplay(kg, decimals) {
  if (kg == null || kg === '') return null;
  const n = Number(kg);
  if (!isFinite(n)) return null;
  const u = getUnit();
  if (u === 'kg') return decimals != null ? Number(n.toFixed(decimals)) : n;
  const lbs = n / KG_PER_LB;
  return Number(lbs.toFixed(decimals != null ? decimals : 1));
}
// Inverse: a number the user entered in the display unit → kg for storage.
function displayToKg(val) {
  if (val == null || val === '') return val;
  const n = Number(val);
  if (!isFinite(n)) return n;
  return getUnit() === 'kg' ? n : (n * KG_PER_LB);
}
function unitLabel() { return getUnit(); }
// "145 kg" or "319.7 lbs"
function formatWeight(kg, decimals) {
  const v = kgToDisplay(kg, decimals);
  if (v == null) return '—';
  return v + ' ' + unitLabel();
}
window.getUnit = getUnit;
window.kgToDisplay = kgToDisplay;
window.displayToKg = displayToKg;
window.unitLabel = unitLabel;
window.formatWeight = formatWeight;

// =========================================================
// SUBSCRIPTION TIERS + LEMON SQUEEZY CHECKOUT
// =========================================================
const TIER_LIMITS = {
  free: 3,
  basic: 10,
  pro: 25,
  premium: 9999
};
const TIER_LABELS = {
  free: 'Free',
  basic: 'Basic',
  pro: 'Pro',
  premium: 'Premium'
};
const TIER_PRICES = {
  basic: 25,
  pro: 50,
  premium: 100
};
const LS_CHECKOUT_URLS = {
  basic:   'https://powalifta.lemonsqueezy.com/checkout/buy/d9320c9a-e603-402c-b2c0-f88189ccde14',
  pro:     'https://powalifta.lemonsqueezy.com/checkout/buy/20e2ec1f-744c-46c9-8a86-62fa13bcb899',
  premium: 'https://powalifta.lemonsqueezy.com/checkout/buy/a5dbff0b-9950-4831-ab91-99e10d20c3a0'
};

// Build checkout URL with prefilled email + the coach's user id as custom data
// so the (future) webhook can match the subscription back to the right coach.
function buildCheckoutUrl(tier, user) {
  const base = LS_CHECKOUT_URLS[tier];
  if (!base) return '#';
  const params = new URLSearchParams();
  if (user?.email) params.set('checkout[email]', user.email);
  if (user?.id)    params.set('checkout[custom][user_id]', user.id);
  if (user?.name)  params.set('checkout[name]', user.name);
  return base + '?' + params.toString();
}

function getCurrentTier() {
  const u = getCurrentUser();
  return u?.subscriptionTier || 'free';
}
function getCurrentTierLimit() {
  return TIER_LIMITS[getCurrentTier()] || 3;
}
function getAthleteCount(coachId) {
  return Store.get().athletes.filter(a => a.coachId === coachId).length;
}
function getPendingInviteCount(coachId) {
  return Store.get().invites.filter(i => i.coachId === coachId && !i.used).length;
}
// "Occupied slots" = athletes already signed up + pending invites that could turn into athletes.
// We cap on this so a coach can't generate more codes than their plan allows.
function getOccupiedSlots(coachId) {
  return getAthleteCount(coachId) + getPendingInviteCount(coachId);
}
function canAddAthlete(coachId) {
  return getOccupiedSlots(coachId) < getCurrentTierLimit();
}

// =========================================================
// UPGRADE MODAL — shown when coach hits cap or clicks Upgrade
// =========================================================
function ensureUpgradeModal() {
  if (document.getElementById('upgradeModal')) return;
  const wrap = document.createElement('div');
  wrap.innerHTML =
    '<div class="modal-backdrop" id="upgradeModal">' +
      '<div class="modal modal-lg">' +
        '<button class="modal-close" onclick="closeModal(\'upgradeModal\')">&times;</button>' +
        '<h3 id="upgradeTitle">Choose your plan</h3>' +
        '<p class="dim text-sm mb-16" id="upgradeSubtitle">Scale your coaching as your roster grows. Cancel anytime from Lemon Squeezy.</p>' +
        '<div class="upgrade-grid" id="upgradeTiers"></div>' +
        '<p class="faded text-xs center mt-16">Payment handled securely by Lemon Squeezy. After purchase, your plan updates within minutes.</p>' +
      '</div>' +
    '</div>';
  document.body.appendChild(wrap.firstChild);
}

function openUpgradeModal(reason) {
  const u = getCurrentUser();
  if (!u) return;
  ensureUpgradeModal();
  if (reason === 'cap') {
    document.getElementById('upgradeTitle').textContent = 'You\'ve hit your plan limit';
    const aCount = getAthleteCount(u.id);
    const pCount = getPendingInviteCount(u.id);
    let breakdown = aCount + ' athlete' + (aCount === 1 ? '' : 's');
    if (pCount > 0) breakdown += ' + ' + pCount + ' pending invite' + (pCount === 1 ? '' : 's');
    document.getElementById('upgradeSubtitle').innerHTML =
      'Your <strong>' + TIER_LABELS[getCurrentTier()] + '</strong> plan supports up to ' +
      getCurrentTierLimit() + ' athletes. You\'re at ' + breakdown + '. Upgrade to add more.';
  } else {
    document.getElementById('upgradeTitle').textContent = 'Choose your plan';
    document.getElementById('upgradeSubtitle').textContent = 'Scale your coaching as your roster grows. Cancel anytime from Lemon Squeezy.';
  }
  const tiers = [
    { key: 'basic',   limit: 10,   price: 25,  blurb: 'Solo coach, growing roster.' },
    { key: 'pro',     limit: 25,   price: 50,  blurb: 'Full-time independent coach.', featured: true },
    { key: 'premium', limit: 9999, price: 100, blurb: 'Studios, teams, federations.' }
  ];
  const grid = document.getElementById('upgradeTiers');
  grid.innerHTML = '';
  const current = getCurrentTier();
  tiers.forEach(t => {
    const isCurrent = t.key === current;
    const card = el('div', { class: 'upgrade-tier' + (t.featured ? ' featured' : '') + (isCurrent ? ' current' : '') });
    if (t.featured) card.appendChild(el('div', { class: 'upgrade-badge' }, 'POPULAR'));
    card.appendChild(el('h4', {}, TIER_LABELS[t.key]));
    card.appendChild(el('div', { class: 'upgrade-price' }, '$' + t.price, el('span', { class: 'unit' }, '/mo')));
    card.appendChild(el('div', { class: 'upgrade-limit' }, t.limit >= 9999 ? 'Unlimited athletes' : 'Up to ' + t.limit + ' athletes'));
    card.appendChild(el('p', { class: 'upgrade-blurb' }, t.blurb));
    if (isCurrent) {
      card.appendChild(el('button', { class: 'btn btn-block', disabled: 'true', style: 'opacity:0.6; cursor: default;' }, 'Current plan'));
    } else {
      const cta = el('a', {
        class: 'btn btn-primary btn-block',
        href: buildCheckoutUrl(t.key, u),
        target: '_blank',
        rel: 'noopener'
      }, current === 'free' ? 'Subscribe' : (TIER_PRICES[t.key] > (TIER_PRICES[current] || 0) ? 'Upgrade' : 'Switch'));
      card.appendChild(cta);
    }
    grid.appendChild(card);
  });
  document.getElementById('upgradeModal').classList.add('open');
}
window.openUpgradeModal = openUpgradeModal;

// =========================================================
// PERSISTENCE WRAPPERS
// Each helper updates Supabase. Local Store mutation is the
// caller's responsibility (so reads stay sync). Failures toast.
// =========================================================
const _persistTimers = {};

function persistProgram(programId) { if (window._demoMode) return;
  if (!programId) return;
  clearTimeout(_persistTimers['prog_' + programId]);
  _persistTimers['prog_' + programId] = setTimeout(async () => {
    const prog = Store.get().programs.find(p => p.id === programId);
    if (!prog) return;
    try { await DB.upsertProgram(prog); }
    catch (e) { console.error('persistProgram', e); toast('Save failed — ' + (e.message || 'try again')); }
  }, 350);
}

// =========================================================
// OFFLINE-SAFE LOGGING
// If a set fails to save (gym wifi died), it's queued in
// localStorage and retried on reconnect / next page load.
// Sets are never silently lost.
// =========================================================
const _PENDING_LOGS_KEY = 'powa-pending-logs';
function _readPendingLogs() {
  try { return JSON.parse(localStorage.getItem(_PENDING_LOGS_KEY) || '[]'); } catch (e) { return []; }
}
function _writePendingLogs(q) {
  try { localStorage.setItem(_PENDING_LOGS_KEY, JSON.stringify(q)); } catch (e) { /* storage full — nothing we can do */ }
}
function _queuePendingLog(log) {
  const q = _readPendingLogs();
  if (!q.some(l => l.id === log.id)) q.push(log);
  _writePendingLogs(q);
}
let _flushingLogs = false;
async function flushPendingLogs() {
  if (window._demoMode) return;
  if (_flushingLogs) return;
  const q = _readPendingLogs();
  if (!q.length) return;
  _flushingLogs = true;
  const failed = [];
  let synced = 0;
  for (const log of q) {
    try { await DB.addLog(log); synced++; }
    catch (e) {
      const msg = String((e && e.message) || '');
      // Duplicate key = it actually saved on a previous attempt → safe to drop.
      if (/duplicate|unique|23505/i.test(msg)) { synced++; }
      else failed.push(log);
    }
  }
  _writePendingLogs(failed);
  _flushingLogs = false;
  if (synced > 0 && !failed.length) toast(synced + (synced === 1 ? ' set' : ' sets') + ' synced');
}
window.addEventListener('online', () => { setTimeout(flushPendingLogs, 800); });
window.addEventListener('load', () => { setTimeout(flushPendingLogs, 3500); });

async function persistAddLog(log) {
  if (window._demoMode) return;
  try { await DB.addLog(log); }
  catch (e) {
    console.error('addLog', e);
    _queuePendingLog(log);
    toast('No connection — set saved on this device, will sync automatically');
  }
}
async function persistDeleteLog(id) {
  if (window._demoMode) return;
  // If the set is still waiting in the offline queue, deleting it just means
  // removing it from the queue (it never reached the server).
  const q = _readPendingLogs();
  if (q.some(l => l.id === id)) { _writePendingLogs(q.filter(l => l.id !== id)); return; }
  try { await DB.deleteLog(id); } catch (e) { console.error('deleteLog', e); }
}
async function persistAddInvite(inv)      { if (window._demoMode) return; try { await DB.addInvite(inv); } catch (e) { console.error('addInvite', e); toast('Could not save invite'); } }
async function persistDeleteInvite(code)  { if (window._demoMode) return; try { await DB.deleteInvite(code); } catch (e) { console.error('deleteInvite', e); } }
async function persistAddNote(n)          { if (window._demoMode) return; try { await DB.addNote(n); } catch (e) { console.error('addNote', e); } }
async function persistGoals(g)            { if (window._demoMode) return; try { await DB.upsertGoals(g); } catch (e) { console.error('goals', e); toast('Could not save goals'); } }
async function persistBw(b)               { if (window._demoMode) return; try { await DB.upsertBw(b); } catch (e) { console.error('bw', e); toast('Could not save bodyweight'); } }
async function persistRest(r)             { if (window._demoMode) return; try { await DB.upsertRest(r); } catch (e) { console.error('rest', e); } }
async function persistDeleteRest(aid, d)  { if (window._demoMode) return; try { await DB.deleteRest(aid, d); } catch (e) { console.error('rest del', e); } }
async function persistAddTemplate(t)      { if (window._demoMode) return; try { await DB.addTemplate(t); } catch (e) { console.error('template', e); toast('Could not save template'); } }
async function persistDeleteTemplate(id)  { if (window._demoMode) return; try { await DB.deleteTemplate(id); } catch (e) { console.error('template del', e); } }

// =========================================================
// SHARE CARDS — branded 1080×1350 canvas images for IG/stories.
// One engine, many cards: PR cards, meet-day plans, weekly recaps.
// =========================================================
async function generateShareCard(opts) {
  // opts: { tag, big, bigUnit, sub, lines: [{l, r}], footer }
  try {
    await Promise.all([
      document.fonts.load('400 100px Anton'),
      document.fonts.load('700 40px "Plus Jakarta Sans"'),
      document.fonts.load('400 40px "Plus Jakarta Sans"')
    ]);
  } catch (e) { /* fonts may already be loaded — canvas falls back gracefully */ }

  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const x = c.getContext('2d');

  // Background
  x.fillStyle = '#0b0b0c';
  x.fillRect(0, 0, W, H);
  // Faint grid
  x.strokeStyle = 'rgba(255,255,255,0.035)';
  x.lineWidth = 1;
  for (let i = 0; i <= W; i += 90) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
  for (let i = 0; i <= H; i += 90) { x.beginPath(); x.moveTo(0, i); x.lineTo(W, i); x.stroke(); }
  // Red glow top + bottom
  let g = x.createRadialGradient(W / 2, -100, 0, W / 2, -100, 1000);
  g.addColorStop(0, 'rgba(255,45,63,0.30)'); g.addColorStop(1, 'rgba(255,45,63,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  g = x.createRadialGradient(W / 2, H + 150, 0, W / 2, H + 150, 800);
  g.addColorStop(0, 'rgba(255,45,63,0.18)'); g.addColorStop(1, 'rgba(255,45,63,0)');
  x.fillStyle = g; x.fillRect(0, 0, W, H);

  // Wordmark — POWA white, LIFTA red
  x.textBaseline = 'alphabetic';
  x.font = '400 72px Anton, Impact, sans-serif';
  const wPowa = x.measureText('POWA').width;
  const wLifta = x.measureText('LIFTA').width;
  let sx = (W - wPowa - wLifta) / 2;
  x.textAlign = 'left';
  x.fillStyle = '#f4f4f6'; x.fillText('POWA', sx, 150);
  x.fillStyle = '#ff2d3f'; x.fillText('LIFTA', sx + wPowa, 150);

  // Tag pill
  x.textAlign = 'center';
  x.font = '700 34px "Plus Jakarta Sans", sans-serif';
  const tagW = x.measureText(opts.tag).width + 80;
  x.fillStyle = 'rgba(255,45,63,0.12)';
  x.strokeStyle = 'rgba(255,45,63,0.45)';
  x.lineWidth = 2;
  if (x.roundRect) {
    x.beginPath(); x.roundRect((W - tagW) / 2, 250, tagW, 72, 36); x.fill(); x.stroke();
  } else {
    x.fillRect((W - tagW) / 2, 250, tagW, 72); x.strokeRect((W - tagW) / 2, 250, tagW, 72);
  }
  x.fillStyle = '#ff2d3f';
  x.fillText(opts.tag, W / 2, 298);

  // Big number with gradient
  const bigGrad = x.createLinearGradient(0, 480, 0, 760);
  bigGrad.addColorStop(0, '#ff2d3f'); bigGrad.addColorStop(1, '#b71629');
  x.fillStyle = bigGrad;
  x.font = '400 260px Anton, Impact, sans-serif';
  const bigW = x.measureText(opts.big).width;
  x.fillText(opts.big, W / 2 - (opts.bigUnit ? 50 : 0), 700);
  if (opts.bigUnit) {
    x.fillStyle = '#82828c';
    x.font = '400 80px Anton, Impact, sans-serif';
    x.textAlign = 'left';
    x.fillText(opts.bigUnit, W / 2 - (opts.bigUnit ? 50 : 0) + bigW / 2 + 24, 700);
    x.textAlign = 'center';
  }

  // Sub line
  x.fillStyle = '#f4f4f6';
  x.font = '400 52px Anton, Impact, sans-serif';
  x.fillText(opts.sub.toUpperCase(), W / 2, 810);

  // Detail lines (left/right pairs)
  let y = 930;
  (opts.lines || []).forEach(ln => {
    x.strokeStyle = 'rgba(255,255,255,0.10)';
    x.beginPath(); x.moveTo(140, y - 44); x.lineTo(W - 140, y - 44); x.stroke();
    x.textAlign = 'left';
    x.font = '700 34px "Plus Jakarta Sans", sans-serif';
    x.fillStyle = '#82828c';
    x.fillText(ln.l.toUpperCase(), 140, y);
    x.textAlign = 'right';
    x.font = '700 38px "Plus Jakarta Sans", sans-serif';
    x.fillStyle = '#f4f4f6';
    x.fillText(ln.r, W - 140, y);
    x.textAlign = 'center';
    y += 92;
  });

  // Footer
  x.font = '700 36px "Plus Jakarta Sans", sans-serif';
  x.fillStyle = '#56565e';
  x.fillText(opts.footer || 'powalifta.com', W / 2, H - 70);

  return c;
}

async function shareCardFromCanvas(canvas, filename, shareText) {
  return new Promise(resolve => {
    canvas.toBlob(async blob => {
      if (!blob) { toast('Could not create image'); return resolve(false); }
      const file = new File([blob], filename, { type: 'image/png' });
      // Native share sheet where supported (iOS/Android) — download elsewhere
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], text: shareText || '' }); return resolve(true); }
        catch (e) { /* user cancelled — fall through to download */ }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Card saved — post it');
      resolve(true);
    }, 'image/png');
  });
}

// =========================================================
// SETTINGS MODAL
// Injected on demand into the body. Updates name, password, deletes account.
// =========================================================
function ensureSettingsModal() {
  if (document.getElementById('settingsModal')) return;
  const wrap = document.createElement('div');
  // Country <option> list, prepended with a "no country" option.
  const countryOpts = '<option value="">— None —</option>' +
    COUNTRIES.map(c => '<option value="' + c.code + '">' + flagEmoji(c.code) + ' ' + escHtml(c.name) + '</option>').join('');
  wrap.innerHTML = '<div class="modal-backdrop" id="settingsModal">' +
    '<div class="modal">' +
      '<button class="modal-close" onclick="closeSettingsModal()">&times;</button>' +
      '<h3>Settings</h3>' +

      // Avatar + country row
      '<div class="flex gap-12 mt-8" style="align-items:center">' +
        '<div id="setAvatarPreview" class="av" style="width:72px;height:72px;font-size:1.25rem;flex:0 0 auto"></div>' +
        '<div style="flex:1; min-width:0">' +
          '<label class="block dim text-xs mb-4">Profile picture (square works best, &lt; 3 MB)</label>' +
          '<input type="file" id="setAvatarFile" accept="image/png,image/jpeg,image/webp" style="font-size: 0.85rem">' +
          '<div id="setAvatarStatus" class="dim text-xs mt-4"></div>' +
        '</div>' +
      '</div>' +

      '<div class="form-group mt-12"><label>Country (shown as flag on your profile)</label>' +
        '<select id="setCountry" style="width:100%">' + countryOpts + '</select>' +
      '</div>' +

      '<div class="form-group"><label>Display name</label><input type="text" id="setName"></div>' +
      '<div class="form-group"><label>Email</label><input type="email" id="setEmail" disabled style="opacity:0.5"></div>' +
      '<div id="setBioGroup" class="form-group" style="display:none"><label>Coach bio</label><textarea id="setBio"></textarea></div>' +
      '<div class="form-group"><label>New password (leave blank to keep current)</label><input type="password" id="setPwd" placeholder="At least 6 chars"></div>' +
      '<div class="flex gap-8 mt-16"><button class="btn btn-block" onclick="closeSettingsModal()">Cancel</button><button class="btn btn-primary btn-block" onclick="saveSettings()">Save</button></div>' +
      '<div style="margin-top: 24px; padding-top: 18px; border-top: 1px solid var(--line);">' +
        '<button class="btn btn-block btn-ghost" onclick="replaySettingsTour()">↺ Replay onboarding tour</button>' +
      '</div>' +
      '<div style="margin-top: 16px; padding-top: 18px; border-top: 1px solid var(--line);">' +
        '<p class="dim text-sm mb-8">Danger zone</p>' +
        '<button class="btn btn-danger btn-block" onclick="deleteMyAccount()">Delete my account</button>' +
      '</div>' +
    '</div>' +
  '</div>';
  document.body.appendChild(wrap.firstChild);

  // Wire up the file input — upload immediately on choose.
  const fileInput = document.getElementById('setAvatarFile');
  if (fileInput) fileInput.addEventListener('change', handleAvatarUpload);
}

async function handleAvatarUpload(ev) {
  const u = getCurrentUser();
  if (!u) return;
  const file = ev.target.files && ev.target.files[0];
  if (!file) return;
  const status = document.getElementById('setAvatarStatus');
  const preview = document.getElementById('setAvatarPreview');
  if (status) status.textContent = 'Uploading…';
  try {
    const url = await DB.uploadAvatar(file, u.id);
    window._user.avatarUrl = url;
    if (status) status.textContent = 'Uploaded ✓';
    if (preview) {
      preview.style.padding = '0';
      preview.style.overflow = 'hidden';
      preview.style.background = 'transparent';
      preview.innerHTML = '<img src="' + escHtml(url) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    }
    renderNav('#nav');
  } catch (e) {
    console.error('avatar upload', e);
    if (status) status.textContent = 'Error: ' + (e.message || 'upload failed');
    toast(e.message || 'Could not upload avatar');
  }
}
window.handleAvatarUpload = handleAvatarUpload;

function openSettingsModal() {
  const u = getCurrentUser();
  if (!u) return;
  ensureSettingsModal();
  document.getElementById('setName').value = u.name || '';
  document.getElementById('setEmail').value = u.email || '';
  document.getElementById('setPwd').value = '';
  const bioGroup = document.getElementById('setBioGroup');
  if (u.userType === 'coach') {
    bioGroup.style.display = 'block';
    document.getElementById('setBio').value = u.bio || '';
  } else {
    bioGroup.style.display = 'none';
  }

  // Avatar preview
  const preview = document.getElementById('setAvatarPreview');
  if (preview) {
    if (u.avatarUrl) {
      preview.style.padding = '0';
      preview.style.overflow = 'hidden';
      preview.style.background = 'transparent';
      preview.innerHTML = '<img src="' + escHtml(u.avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>';
    } else {
      preview.style.padding = '';
      preview.style.overflow = '';
      preview.style.background = '';
      preview.innerHTML = escHtml(initials(u.name));
    }
  }

  // Country select
  const country = document.getElementById('setCountry');
  if (country) country.value = u.countryCode || '';
  const status = document.getElementById('setAvatarStatus');
  if (status) status.textContent = '';
  const fileInput = document.getElementById('setAvatarFile');
  if (fileInput) fileInput.value = '';

  document.getElementById('settingsModal').classList.add('open');
  attachPwdToggles();
}
function closeSettingsModal() { const m = document.getElementById('settingsModal'); if (m) m.classList.remove('open'); }
// Dispatches to whichever page-specific replay hook is loaded (coach.html or athlete.html)
function replaySettingsTour() {
  closeSettingsModal();
  setTimeout(() => {
    if (typeof window.replayCoachTour === 'function') window.replayCoachTour();
    else if (typeof window.replayAthleteTour === 'function') window.replayAthleteTour();
    else toast('Tour not available on this page.');
  }, 200);
}
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.replaySettingsTour = replaySettingsTour;

async function saveSettings() {
  const u = getCurrentUser();
  if (!u) return;
  const name = document.getElementById('setName').value.trim();
  const pwd = document.getElementById('setPwd').value;
  const bio = u.userType === 'coach' ? document.getElementById('setBio').value.trim() : null;
  const countrySel = document.getElementById('setCountry');
  const country = countrySel ? (countrySel.value || null) : null;
  if (!name) return toast('Name required');
  if (pwd && pwd.length < 6) return toast('Password must be at least 6 chars');

  try {
    const patch = { name, country_code: country };
    if (bio != null) patch.bio = bio;
    await DB.updateProfile(u.id, patch);
    window._user.name = name;
    window._user.countryCode = country;
    if (bio != null) window._user.bio = bio;
    if (pwd) {
      const { error } = await sb.auth.updateUser({ password: pwd });
      if (error) throw error;
    }
    toast('Settings saved');
    closeSettingsModal();
    renderNav('#nav');
  } catch (e) {
    toast(e.message || 'Could not save');
  }
}
window.saveSettings = saveSettings;

async function deleteMyAccount() {
  if (!confirm('Permanently delete your account and ALL your data? This cannot be undone.')) return;
  if (!confirm('Last chance — really delete?')) return;
  const u = getCurrentUser();
  try {
    // Delete the profile row — RLS allows updating own profile, and the auth user removal cascade will handle the rest of the data via FK on delete cascade.
    // Fully removing the auth user requires a server-side admin call. As a workaround, sign out and let an admin clean up if needed.
    await sb.from('profiles').delete().eq('id', u.id);
    await DB.signOut();
    location.href = 'index.html';
  } catch (e) {
    toast(e.message || 'Could not delete account');
  }
}
window.deleteMyAccount = deleteMyAccount;

// =========================================================
// CALENDAR HEATMAP — GitHub-style training history
// renderCalendarHeatmap(container, { athleteId, weeks: 16 })
// =========================================================
function renderCalendarHeatmap(container, opts) {
  opts = opts || {};
  const weeks = opts.weeks || 16;
  const athleteId = opts.athleteId;
  if (!athleteId) return;

  container.innerHTML = '';

  const trainSet = new Set(Store.get().workoutLogs.filter(l => l.athleteId === athleteId).map(l => l.date));
  const restSet = new Set(Store.get().restDays.filter(r => r.athleteId === athleteId).map(r => r.date));

  // Volume per day (count of sets logged)
  const volume = {};
  Store.get().workoutLogs.filter(l => l.athleteId === athleteId).forEach(l => {
    volume[l.date] = (volume[l.date] || 0) + 1;
  });
  const maxV = Math.max(1, ...Object.values(volume));

  const today = new Date(); today.setHours(0,0,0,0);
  // Find the most recent Sunday (so columns align)
  const dayOfWeek = today.getDay(); // 0=Sun
  const lastSun = new Date(today); lastSun.setDate(today.getDate() - dayOfWeek);
  const start = new Date(lastSun); start.setDate(lastSun.getDate() - (weeks - 1) * 7);

  const grid = document.createElement('div');
  grid.className = 'cal-heatmap';
  // Day labels column
  const labels = document.createElement('div');
  labels.className = 'cal-labels';
  ['Mon', 'Wed', 'Fri'].forEach(d => labels.appendChild(el('div', { class: 'cal-lbl' }, d)));
  grid.appendChild(labels);

  for (let w = 0; w < weeks; w++) {
    const col = document.createElement('div');
    col.className = 'cal-col';
    for (let d = 0; d < 7; d++) {
      const date = new Date(start);
      date.setDate(start.getDate() + w * 7 + d);
      const iso = date.toISOString().slice(0, 10);
      const isFuture = date > today;
      let cls = 'cal-cell';
      let title = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
      if (isFuture) {
        cls += ' future';
      } else if (trainSet.has(iso)) {
        const v = volume[iso] || 1;
        const level = Math.min(4, Math.ceil((v / maxV) * 4));
        cls += ' lvl-' + level;
        title += ' · ' + v + ' set' + (v === 1 ? '' : 's');
      } else if (restSet.has(iso)) {
        cls += ' rest';
        title += ' · rest day';
      }
      const cell = el('div', { class: cls, title });
      col.appendChild(cell);
    }
    grid.appendChild(col);
  }

  container.appendChild(grid);

  // Legend
  const legend = el('div', { class: 'cal-legend' });
  legend.appendChild(el('span', { class: 'cal-legend-label' }, 'Less'));
  [0, 1, 2, 3, 4].forEach(l => legend.appendChild(el('div', { class: 'cal-cell lvl-' + l })));
  legend.appendChild(el('span', { class: 'cal-legend-label' }, 'More'));
  legend.appendChild(el('span', { class: 'cal-legend-label', style: 'margin-left: 16px;' }, '🛌 Rest day'));
  container.appendChild(legend);
}
window.renderCalendarHeatmap = renderCalendarHeatmap;

// =========================================================
// GLOBAL MODAL HELPERS
// Always close any open modal before opening a new one.
// Click outside the modal (on the backdrop) closes it.
// =========================================================
window.closeAllModals = function() {
  document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
};
document.addEventListener('click', function(e) {
  // If user clicked the backdrop element itself (not a child), close it
  if (e.target.classList && e.target.classList.contains('modal-backdrop') && e.target.classList.contains('open')) {
    e.target.classList.remove('open');
  }
});
// Press Esc to close any open modal
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') window.closeAllModals();
});

// =========================================================
// GLOBAL HASH → MODAL HANDLER
// Opens login/signup modal whenever the URL hash changes to #login / #signup,
// AND on initial page load. Works on whatever page has the modals (homepage).
// =========================================================
function checkHashForModal() {
  if (location.hash === '#login' && typeof window.openLoginModal === 'function') {
    window.closeAllModals();
    window.openLoginModal();
  } else if (location.hash === '#signup' && typeof window.openSignupModal === 'function') {
    window.closeAllModals();
    window.openSignupModal('athlete');
  }
}
window.addEventListener('hashchange', checkHashForModal);
// On load, the inline script defining openLoginModal hasn't run yet when app.js executes.
// Defer the initial check until after everything's loaded.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(checkHashForModal, 50));
} else {
  setTimeout(checkHashForModal, 50);
}

// =========================================================
// VARIANTS & EXERCISES
// =========================================================
const VARIANTS = {
  squat:    { 'Competition': 1.0, 'Paused': 1.07, 'Tempo': 1.12, 'Pin': 1.08 },
  bench:    { 'Competition': 1.0, 'Paused': 1.06, 'Close Grip': 1.09, 'Pin Press': 1.08, 'Incline': 1.12 },
  deadlift: { 'Competition': 1.0, 'Paused': 1.07, 'Deficit': 1.06, 'RDL': 1.10 }
};

const ACCESSORY_EXERCISES = {
  push: ['Overhead Press', 'Dumbbell Bench Press', 'Push-ups', 'Tricep Pushdown', 'Tricep Extensions', 'Lateral Raises', 'Dips', 'Front Raises'],
  pull: ['Pull-ups', 'Chin-ups', 'Barbell Row', 'Pendlay Row', 'Lat Pulldown', 'Cable Row', 'Face Pulls', 'Bicep Curls', 'Hammer Curls', 'Shrugs'],
  legs: ['Front Squat', 'Hack Squat', 'Leg Press', 'Romanian Deadlift', 'Lunges', 'Bulgarian Split Squats', 'Leg Curls', 'Leg Extensions', 'Calf Raises', 'Hip Thrust']
};

const LIFT_LABELS = {
  squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift',
  push: 'Push', pull: 'Pull', legs: 'Legs', cardio: 'Cardio', other: 'Other'
};

const MAIN_LIFTS = ['squat', 'bench', 'deadlift'];
const ACCESSORY_LIFTS = ['push', 'pull', 'legs'];
const CARDIO_TYPES = ['Running', 'Cycling', 'Rowing', 'Stair Master', 'Walking', 'Swimming', 'Elliptical', 'Sled Push'];

function variantsFor(lift) { return VARIANTS[lift] ? Object.keys(VARIANTS[lift]) : []; }
function multiplierFor(lift, variant) {
  if (VARIANTS[lift] && VARIANTS[lift][variant] != null) return VARIANTS[lift][variant];
  return 1.0;
}
function exercisesFor(lift) { return ACCESSORY_EXERCISES[lift] || []; }

// =========================================================
// E1RM (RPE-percentage / Tuchscherer-style)
// =========================================================
function calcE1RM(weight, reps, rpe) {
  if (!weight || !reps || !rpe) return 0;
  const adj = (reps - 1) + (10 - rpe);
  if (adj <= 0) return weight;
  const pct = 1 - adj * 0.0333;
  if (pct < 0.4) return weight / 0.4;
  return weight / pct;
}

function calcCompE1RM(weight, reps, rpe, lift, variant) {
  return calcE1RM(weight, reps, rpe) * multiplierFor(lift, variant);
}

// =========================================================
// PLATE CALCULATOR
// (assumes 20kg bar, common kg plates)
// =========================================================
const PLATE_SIZES = [25, 20, 15, 10, 5, 2.5, 1.25];
const BAR_KG = 20;
// Pound-mode plate set — standard US powerlifting plates
const PLATE_SIZES_LB = [45, 35, 25, 10, 5, 2.5];
const BAR_LB = 45;

// Plate breakdown — calculates in the user's selected unit (kg or lbs).
// `targetWeight` is the kg-internal weight; the function converts to lbs internally
// when the user is in lb mode, so the plate sizes match what the gym actually has.
function plateBreakdown(targetWeight) {
  const isLbs = getUnit() === 'lbs';
  const sizes = isLbs ? PLATE_SIZES_LB : PLATE_SIZES;
  const bar   = isLbs ? BAR_LB : BAR_KG;
  const u     = isLbs ? 'lbs' : 'kg';

  // Convert target from internal kg to display unit
  const target = isLbs ? (targetWeight / KG_PER_LB) : targetWeight;

  if (!target || target < bar) {
    return { plates: [], perSide: 0, unit: u, error: 'Below bar weight (' + bar + ' ' + u + ')' };
  }
  let perSide = (target - bar) / 2;
  const plates = [];
  sizes.forEach(p => {
    while (perSide >= p - 0.001) {
      plates.push(p);
      perSide -= p;
    }
  });
  if (perSide > 0.05) {
    return { plates, perSide: (target - bar) / 2, unit: u, error: 'Cannot reach exactly. ' + (perSide * 2).toFixed(2) + ' ' + u + ' short.' };
  }
  return { plates, perSide: (target - bar) / 2, unit: u, error: null };
}

// =========================================================
// INVITE
// =========================================================
function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// =========================================================
// PROGRAM HELPERS
// =========================================================
function newDay(name) { return { id: uid('day'), name, exercises: [] }; }
function newWeek(num, dayCount = 4) {
  const days = [];
  for (let i = 1; i <= dayCount; i++) days.push(newDay('Day ' + i));
  return { id: uid('wk'), number: num, days };
}
function newExercise(lift, variant, exerciseName) {
  return { id: uid('ex'), lift, variant: variant || '', exerciseName: exerciseName || '', note: '', sets: [] };
}
function newSet(weight, reps, rpe, tempo) {
  // RPE is optional — null means no prescribed RPE (typical of back-down sets in PL).
  // Tempo is an optional cue string like "0-2-0" (eccentric-pause-concentric).
  const rpeVal = (rpe === null || rpe === undefined || rpe === '') ? null : Number(rpe);
  return {
    id: uid('set'),
    weight: Number(weight) || 0,
    reps: Number(reps) || 0,
    rpe: (rpeVal != null && !isNaN(rpeVal)) ? rpeVal : null,
    tempo: tempo || '',
    completed: false, actualRpe: null, completedAt: null, note: ''
  };
}
function getProgramForAthlete(athleteId) {
  return Store.get().programs.find(p => p.athleteId === athleteId);
}

// Migrate older exercises/sets that may not have `note`
function ensureExerciseShape(ex) {
  if (typeof ex.note !== 'string') ex.note = '';
  if (Array.isArray(ex.sets)) ex.sets.forEach(s => {
    if (typeof s.note !== 'string') s.note = '';
    if (typeof s.tempo !== 'string') s.tempo = '';
    // Old data stored rpe=0 to mean "no rpe" — normalize to null
    if (s.rpe === 0 || s.rpe === '0') s.rpe = null;
  });
  return ex;
}

// =========================================================
// SET GROUPING — collapse consecutive identical sets into "blocks".
// A typical PL exercise looks like:
//   Top set:    1 set × 4 @ 92.5kg @ RPE 5.5
//   Back-downs: 4 sets × 5 @ 90kg (no RPE — fatigue-driven)
// We render this as 2 blocks, not 5 separate rows.
// =========================================================
function groupSets(sets) {
  if (!sets || !sets.length) return [];
  const groups = [];
  let cur = null;
  sets.forEach((s, idx) => {
    const sig = [s.weight, s.reps, (s.rpe == null ? '_' : s.rpe), s.tempo || ''].join('|');
    if (cur && cur.sig === sig) {
      cur.count++;
    } else {
      cur = { startIdx: idx, count: 1, weight: s.weight, reps: s.reps, rpe: s.rpe, tempo: s.tempo || '', sig };
      groups.push(cur);
    }
  });
  return groups;
}

// =========================================================
// REORDER / DUPLICATE / COPY
// =========================================================
function moveItem(arr, from, dir) {
  const to = from + dir;
  if (to < 0 || to >= arr.length) return false;
  const [item] = arr.splice(from, 1);
  arr.splice(to, 0, item);
  return true;
}

function reorderExercise(programId, weekIdx, dayIdx, exIdx, dir) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (p && p.weeks[weekIdx]?.days[dayIdx]?.exercises) {
      moveItem(p.weeks[weekIdx].days[dayIdx].exercises, exIdx, dir);
    }
  });
}

function reorderDay(programId, weekIdx, dayIdx, dir) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (p && p.weeks[weekIdx]?.days) moveItem(p.weeks[weekIdx].days, dayIdx, dir);
  });
}

function copyExercise(programId, weekIdx, dayIdx, exIdx) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (!p) return;
    const ex = p.weeks[weekIdx].days[dayIdx].exercises[exIdx];
    const cloned = {
      id: uid('ex'),
      lift: ex.lift, variant: ex.variant, exerciseName: ex.exerciseName, note: ex.note,
      sets: ex.sets.map(set => ({
        id: uid('set'),
        weight: set.weight, reps: set.reps, rpe: set.rpe,
        completed: false, actualRpe: null, completedAt: null, note: ''
      }))
    };
    p.weeks[weekIdx].days[dayIdx].exercises.splice(exIdx + 1, 0, cloned);
  });
}

function duplicateWeek(programId, weekIdx) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (!p || !p.weeks[weekIdx]) return;
    const src = p.weeks[weekIdx];
    const newNum = (p.weeks.at(-1)?.number || 0) + 1;
    const cloned = {
      id: uid('wk'), number: newNum,
      days: src.days.map(d => ({
        id: uid('day'), name: d.name,
        exercises: d.exercises.map(ex => ({
          id: uid('ex'),
          lift: ex.lift, variant: ex.variant, exerciseName: ex.exerciseName, note: ex.note,
          sets: ex.sets.map(set => ({
            id: uid('set'),
            weight: set.weight, reps: set.reps, rpe: set.rpe,
            completed: false, actualRpe: null, completedAt: null, note: ''
          }))
        }))
      }))
    };
    p.weeks.push(cloned);
  });
}

// =========================================================
// PROGRAM TEMPLATES
// =========================================================
function saveProgramAsTemplate(programId, name) {
  Store.update(s => {
    const p = s.programs.find(p => p.id === programId);
    if (!p) return;
    s.programTemplates = s.programTemplates || [];
    s.programTemplates.push({
      id: uid('tpl'), coachId: p.coachId, name: name || p.name,
      createdAt: Date.now(),
      payload: {
        weeks: p.weeks.map(wk => ({
          number: wk.number,
          days: wk.days.map(d => ({
            name: d.name,
            exercises: d.exercises.map(ex => ({
              lift: ex.lift, variant: ex.variant, exerciseName: ex.exerciseName, note: ex.note,
              sets: ex.sets.map(set => ({ weight: set.weight, reps: set.reps, rpe: set.rpe }))
            }))
          }))
        }))
      }
    });
  });
}

function applyTemplate(templateId, athleteId, coachId) {
  Store.update(s => {
    const tpl = (s.programTemplates || []).find(t => t.id === templateId);
    if (!tpl) return;
    const newProg = {
      id: uid('prog'), athleteId, coachId, name: tpl.name,
      weeks: tpl.payload.weeks.map(wk => ({
        id: uid('wk'), number: wk.number,
        days: wk.days.map(d => ({
          id: uid('day'), name: d.name,
          exercises: d.exercises.map(ex => ({
            id: uid('ex'),
            lift: ex.lift, variant: ex.variant, exerciseName: ex.exerciseName, note: ex.note,
            sets: ex.sets.map(set => ({
              id: uid('set'), weight: set.weight, reps: set.reps, rpe: set.rpe,
              completed: false, actualRpe: null, completedAt: null, note: ''
            }))
          }))
        }))
      }))
    };
    // Replace existing program for this athlete
    s.programs = s.programs.filter(p => p.athleteId !== athleteId);
    s.programs.push(newProg);
  });
}

function deleteTemplate(templateId) {
  Store.update(s => { s.programTemplates = (s.programTemplates || []).filter(t => t.id !== templateId); });
}

// =========================================================
// LAST SET FOR EXERCISE (for "see last RPE" while programming)
// =========================================================
function getLastSetForExercise(athleteId, lift, variant, exerciseName) {
  const logs = Store.get().workoutLogs.filter(l => {
    if (l.athleteId !== athleteId) return false;
    if (l.lift !== lift) return false;
    if (MAIN_LIFTS.includes(lift)) return l.variant === variant;
    return l.exerciseName === exerciseName;
  });
  if (!logs.length) return null;
  return logs.sort((a, b) => b.date.localeCompare(a.date))[0];
}

function getProgressionHint(athleteId, lift, variant, exerciseName, prescribedWeight, prescribedRpe) {
  const logs = Store.get().workoutLogs.filter(l => {
    if (l.athleteId !== athleteId) return false;
    if (l.lift !== lift) return false;
    if (MAIN_LIFTS.includes(lift)) return l.variant === variant;
    return l.exerciseName === exerciseName;
  }).sort((a, b) => b.date.localeCompare(a.date));
  if (logs.length < 2) return null;
  const recent = logs.slice(0, 3);
  const allEasier = recent.every(l => l.weight >= prescribedWeight && l.rpe <= prescribedRpe - 1);
  if (allEasier) return { text: 'Last ' + recent.length + ' sessions felt at or below RPE ' + (prescribedRpe - 1) + ' — try +2.5kg?', kind: 'easy' };
  const allHard = recent.every(l => l.weight <= prescribedWeight && l.rpe >= prescribedRpe + 1);
  if (allHard) return { text: 'Last ' + recent.length + ' sessions felt above RPE ' + (prescribedRpe + 1) + ' — back off 2.5kg?', kind: 'hard' };
  return null;
}

// =========================================================
// PRs
// =========================================================
// Was this log a new comp-equivalent PR for the lift (any variant)?
function isPRForLog(athleteId, log) {
  const earlier = Store.get().workoutLogs.filter(l =>
    l.athleteId === athleteId &&
    l.lift === log.lift &&
    l.id !== log.id &&
    (l.date < log.date || (l.date === log.date && l.id < log.id))
  );
  if (!earlier.length) return true;
  const prevMax = Math.max(...earlier.map(l => l.e1rmComp));
  return log.e1rmComp > prevMax + 0.05;
}

function getLifetimePRs(athleteId) {
  const logs = Store.get().workoutLogs.filter(l => l.athleteId === athleteId);
  const result = {};
  ['squat', 'bench', 'deadlift'].forEach(lift => {
    const liftLogs = logs.filter(l => l.lift === lift);
    if (!liftLogs.length) return;
    const best = liftLogs.reduce((max, l) => l.e1rmComp > max.e1rmComp ? l : max);
    result[lift] = best;
  });
  return result;
}

function getWeeklyDelta(athleteId) {
  const logs = Store.get().workoutLogs.filter(l => l.athleteId === athleteId);
  const today = new Date(); today.setHours(0,0,0,0);
  const range = (offset) => {
    const end = new Date(today); end.setDate(end.getDate() - 7 * offset);
    const start = new Date(end); start.setDate(start.getDate() - 6);
    return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
  };
  const cur = range(0), prev = range(1);
  const result = {};
  ['squat', 'bench', 'deadlift'].forEach(lift => {
    const inRange = (rg) => logs.filter(l => l.lift === lift && l.date >= rg.start && l.date <= rg.end);
    const curBest = inRange(cur).reduce((max, l) => Math.max(max, l.e1rmComp), 0);
    const prevBest = inRange(prev).reduce((max, l) => Math.max(max, l.e1rmComp), 0);
    if (curBest && prevBest) result[lift] = { current: curBest, previous: prevBest, delta: curBest - prevBest };
    else if (curBest) result[lift] = { current: curBest, previous: 0, delta: null };
  });
  return result;
}

// =========================================================
// ROSTER OVERVIEW (coach)
// =========================================================
function getRosterOverview(coachId) {
  const s = Store.get();
  return s.athletes.filter(a => a.coachId === coachId).map(a => {
    const prog = s.programs.find(p => p.athleteId === a.id);
    const logs = s.workoutLogs.filter(l => l.athleteId === a.id);
    const lastLog = logs.sort((x, y) => y.date.localeCompare(x.date))[0];
    const today = new Date(); today.setHours(0,0,0,0);
    const ago = lastLog ? Math.round((today - new Date(lastLog.date)) / 86400000) : null;
    const flag = ago == null ? 'never' : ago === 0 ? 'today' : ago <= 3 ? 'recent' : ago <= 7 ? 'week' : 'stale';
    const allSets = prog ? prog.weeks.flatMap(w => w.days).flatMap(d => d.exercises).flatMap(e => e.sets) : [];
    const completed = allSets.filter(s => s.completed).length;
    const total = allSets.length;
    const lastNote = (s.sessionNotes.filter(n => n.athleteId === a.id).sort((x, y) => y.date.localeCompare(x.date))[0]) || null;
    const lastRpe = lastLog ? lastLog.rpe : null;
    return { athlete: a, program: prog, lastLog, ago, flag, completedSets: completed, totalSets: total, lastNote, lastRpe };
  });
}

// =========================================================
// STREAK (athlete)
// Counts consecutive days where the athlete either logged sets OR
// marked the day as a rest day. Rest days bridge — they neither
// break nor grow training streak, but they preserve adherence.
// =========================================================
function getStreak(athleteId) {
  const s = Store.get();
  const trainSet = new Set(s.workoutLogs.filter(l => l.athleteId === athleteId).map(l => l.date));
  const restSet = new Set(s.restDays.filter(r => r.athleteId === athleteId).map(r => r.date));
  if (!trainSet.size) return 0;

  let trainingStreak = 0;
  let cursor = new Date(); cursor.setHours(0,0,0,0);
  // walk back day-by-day from today (or yesterday if today has nothing)
  let started = false;
  for (let i = 0; i < 365; i++) {
    const dStr = cursor.toISOString().slice(0, 10);
    if (trainSet.has(dStr)) { trainingStreak++; started = true; }
    else if (restSet.has(dStr)) { /* bridge — don't increment, don't break */ }
    else if (started) { break; }
    else if (i > 1) { break; } // give 1 grace day before any logging
    cursor.setDate(cursor.getDate() - 1);
  }
  return trainingStreak;
}

// =========================================================
// REST DAYS
// =========================================================
function isRestDay(athleteId, date) {
  return Store.get().restDays.some(r => r.athleteId === athleteId && r.date === date);
}
function getRestDay(athleteId, date) {
  return Store.get().restDays.find(r => r.athleteId === athleteId && r.date === date);
}
function markRestDay(athleteId, date, note) {
  Store.update(s => {
    const existing = s.restDays.find(r => r.athleteId === athleteId && r.date === date);
    if (existing) { existing.note = note || ''; }
    else s.restDays.push({ id: uid('rest'), athleteId, date, note: note || '' });
  });
}
function removeRestDay(athleteId, date) {
  Store.update(s => { s.restDays = s.restDays.filter(r => !(r.athleteId === athleteId && r.date === date)); });
}
function hasAnyLogOnDate(athleteId, date) {
  return Store.get().workoutLogs.some(l => l.athleteId === athleteId && l.date === date);
}

// =========================================================
// DATE HELPERS
// =========================================================
function todayISO() { return new Date().toISOString().slice(0, 10); }
function fmtDate(iso) { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function fmtDateShort(iso) { return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); }

// =========================================================
// UI HELPERS
// =========================================================
function el(tag, attrs = {}, ...children) {
  const e = document.createElement(tag);
  for (const k in attrs) {
    if (k === 'class') e.className = attrs[k];
    else if (k === 'html') e.innerHTML = attrs[k];
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
    else e.setAttribute(k, attrs[k]);
  }
  for (const child of children) {
    if (child == null) continue;
    if (typeof child === 'string' || typeof child === 'number') e.appendChild(document.createTextNode(String(child)));
    else e.appendChild(child);
  }
  return e;
}

function toast(msg, ms = 2400) {
  // remove any existing
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = el('div', { class: 'toast' }, msg);
  document.body.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

function escHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function initials(name) {
  if (!name) return '?';
  const parts = String(name).trim().split(/\s+/);
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

// =========================================================
// FLAGS — convert ISO-3166-1 alpha-2 country code → 🇺🇸 emoji
// =========================================================
function flagEmoji(code) {
  if (!code || typeof code !== 'string' || code.length !== 2) return '';
  const cc = code.toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return '';
  const offset = 127397; // 'A' (65) + offset = 0x1F1E6 (regional indicator A)
  return String.fromCodePoint(cc.charCodeAt(0) + offset, cc.charCodeAt(1) + offset);
}
window.flagEmoji = flagEmoji;

// Common country list used in settings dropdown. Code + display name.
// Curated — extend as needed. Sorted alphabetically by name.
const COUNTRIES = [
  { code: 'AR', name: 'Argentina' }, { code: 'AU', name: 'Australia' }, { code: 'AT', name: 'Austria' },
  { code: 'BE', name: 'Belgium' }, { code: 'BR', name: 'Brazil' }, { code: 'BG', name: 'Bulgaria' },
  { code: 'CA', name: 'Canada' }, { code: 'CL', name: 'Chile' }, { code: 'CN', name: 'China' },
  { code: 'CO', name: 'Colombia' }, { code: 'HR', name: 'Croatia' }, { code: 'CZ', name: 'Czechia' },
  { code: 'DK', name: 'Denmark' }, { code: 'EG', name: 'Egypt' }, { code: 'EE', name: 'Estonia' },
  { code: 'FI', name: 'Finland' }, { code: 'FR', name: 'France' }, { code: 'DE', name: 'Germany' },
  { code: 'GR', name: 'Greece' }, { code: 'HK', name: 'Hong Kong' }, { code: 'HU', name: 'Hungary' },
  { code: 'IS', name: 'Iceland' }, { code: 'IN', name: 'India' }, { code: 'ID', name: 'Indonesia' },
  { code: 'IE', name: 'Ireland' }, { code: 'IL', name: 'Israel' }, { code: 'IT', name: 'Italy' },
  { code: 'JP', name: 'Japan' }, { code: 'KZ', name: 'Kazakhstan' }, { code: 'KE', name: 'Kenya' },
  { code: 'KR', name: 'Korea' }, { code: 'LV', name: 'Latvia' }, { code: 'LT', name: 'Lithuania' },
  { code: 'MY', name: 'Malaysia' }, { code: 'MX', name: 'Mexico' }, { code: 'MA', name: 'Morocco' },
  { code: 'NL', name: 'Netherlands' }, { code: 'NZ', name: 'New Zealand' }, { code: 'NG', name: 'Nigeria' },
  { code: 'NO', name: 'Norway' }, { code: 'PK', name: 'Pakistan' }, { code: 'PE', name: 'Peru' },
  { code: 'PH', name: 'Philippines' }, { code: 'PL', name: 'Poland' }, { code: 'PT', name: 'Portugal' },
  { code: 'RO', name: 'Romania' }, { code: 'RU', name: 'Russia' }, { code: 'SA', name: 'Saudi Arabia' },
  { code: 'RS', name: 'Serbia' }, { code: 'SG', name: 'Singapore' }, { code: 'SK', name: 'Slovakia' },
  { code: 'SI', name: 'Slovenia' }, { code: 'ZA', name: 'South Africa' }, { code: 'ES', name: 'Spain' },
  { code: 'SE', name: 'Sweden' }, { code: 'CH', name: 'Switzerland' }, { code: 'TW', name: 'Taiwan' },
  { code: 'TH', name: 'Thailand' }, { code: 'TR', name: 'Turkey' }, { code: 'UA', name: 'Ukraine' },
  { code: 'AE', name: 'United Arab Emirates' }, { code: 'GB', name: 'United Kingdom' },
  { code: 'US', name: 'United States' }, { code: 'UY', name: 'Uruguay' }, { code: 'VE', name: 'Venezuela' },
  { code: 'VN', name: 'Vietnam' }
];
window.COUNTRIES = COUNTRIES;

// Build an avatar element: real photo if avatarUrl set, otherwise initials.
// opts: { size: 'sm'|'md'|'lg', user: { name, avatarUrl, countryCode } }
function avatarHtml(user, opts) {
  opts = opts || {};
  const cls = opts.cls || '';
  const sz = opts.size || 'md';
  const sizeStyle = sz === 'sm' ? 'width:32px;height:32px;font-size:0.75rem'
                   : sz === 'lg' ? 'width:80px;height:80px;font-size:1.5rem'
                   : 'width:48px;height:48px;font-size:1rem';
  if (user && user.avatarUrl) {
    return '<div class="av ' + cls + '" style="' + sizeStyle + ';padding:0;overflow:hidden;background:transparent">' +
      '<img src="' + escHtml(user.avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/>' +
    '</div>';
  }
  return '<div class="av ' + cls + '" style="' + sizeStyle + '">' + escHtml(initials(user ? user.name : '?')) + '</div>';
}
window.avatarHtml = avatarHtml;

// =========================================================
// ICONS (inline SVG strings)
// =========================================================
const ICONS = {
  bar: '<svg viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="11" width="3" height="6" rx="1" fill="currentColor"/><rect x="6" y="9" width="2" height="10" rx="0.5" fill="currentColor"/><rect x="9" y="13" width="10" height="2" fill="currentColor"/><rect x="20" y="9" width="2" height="10" rx="0.5" fill="currentColor"/><rect x="23" y="11" width="3" height="6" rx="1" fill="currentColor"/></svg>',
  athletes: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  program: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>',
  today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 7h20l-2 13H4z"/><path d="M8 7V4a4 4 0 0 1 8 0v3"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>',
  user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>',
  copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
  eyeOff: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
  weight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14" r="6"/><path d="M9.5 9V7a2.5 2.5 0 0 1 5 0v2"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',
  arrowUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>',
  arrowDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
  trophy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9H4a2 2 0 0 1-2-2V5h4M18 9h2a2 2 0 0 0 2-2V5h-4M6 5h12v6a6 6 0 0 1-12 0V5zM12 17v4M9 21h6"/></svg>',
  note: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>'
};

// Brand mark — barbell SVG
const BRAND_MARK = '<svg class="brand-mark" viewBox="0 0 28 28" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><defs><linearGradient id="bg-r" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#ff2d3f"/><stop offset="100%" stop-color="#b71629"/></linearGradient></defs><rect x="2" y="11" width="3.5" height="6" rx="1" fill="url(#bg-r)"/><rect x="6.5" y="9" width="2.2" height="10" rx="0.5" fill="url(#bg-r)"/><rect x="9.5" y="13" width="9" height="2" fill="url(#bg-r)"/><rect x="19.3" y="9" width="2.2" height="10" rx="0.5" fill="url(#bg-r)"/><rect x="22.5" y="11" width="3.5" height="6" rx="1" fill="url(#bg-r)"/></svg>';

// =========================================================
// NAV
// =========================================================
function renderNav(target) {
  const user = getCurrentUser();
  const navInner = el('div', { class: 'nav-inner' });
  const brand = el('a', { href: 'index.html', class: 'brand' });
  brand.innerHTML = BRAND_MARK + '<span>POWA<span class="accent">LIFTA</span></span>';
  navInner.appendChild(brand);

  const actions = el('div', { class: 'nav-actions' });

  // Theme toggle — always shown, anywhere in the nav
  const themeBtn = el('button', { class: 'theme-toggle', title: 'Toggle light / dark', 'aria-label': 'Toggle theme' });
  themeBtn.innerHTML =
    '<svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
    '<svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/></svg>';
  themeBtn.setAttribute('onclick', 'toggleTheme()');
  actions.appendChild(themeBtn);

  // Unit toggle (kg / lbs) — always visible, swaps and reloads
  const unitBtn = el('button', { class: 'unit-toggle', title: 'Toggle weight units (' + getUnit() + ')', 'aria-label': 'Toggle weight units' });
  unitBtn.textContent = getUnit().toUpperCase();
  unitBtn.setAttribute('onclick', 'toggleUnit()');
  actions.appendChild(unitBtn);

  if (user) {
    // Clickable user pill → opens settings modal
    const userPill = el('button', { class: 'nav-user', title: 'Settings' });
    const avInner = user.avatarUrl
      ? '<div class="av" style="padding:0;overflow:hidden;background:transparent"><img src="' + escHtml(user.avatarUrl) + '" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:50%"/></div>'
      : '<div class="av">' + escHtml(initials(user.name)) + '</div>';
    const flagPart = user.countryCode ? '<span style="margin-left:4px">' + flagEmoji(user.countryCode) + '</span>' : '';
    userPill.innerHTML = avInner + '<span>' + escHtml(user.name) + '</span>' + flagPart;
    userPill.setAttribute('onclick', 'if(window.openSettingsModal){openSettingsModal()}');
    actions.appendChild(userPill);
    if (user.userType === 'coach') {
      actions.appendChild(el('a', { href: 'coach.html', class: 'btn btn-sm btn-ghost' }, 'Dashboard'));
    } else {
      actions.appendChild(el('a', { href: 'athlete.html', class: 'btn btn-sm btn-ghost' }, 'Dashboard'));
    }
    if (user.isAdmin) {
      const adminA = el('a', { href: 'admin.html', class: 'btn btn-sm', style: 'border-color: var(--gold); color: var(--gold);' }, '★ Admin');
      actions.appendChild(adminA);
    }
    const logoutBtn = el('button', { class: 'btn btn-sm btn-ghost' }, 'Log out');
    logoutBtn.setAttribute('onclick', 'logout()');
    actions.appendChild(logoutBtn);
  } else {
    // BULLETPROOF: inline string onclick — browser evaluates in global scope at click time.
    // This is the same mechanism as the hero CTAs which always work.
    const loginA = el('a', { href: 'javascript:void(0)', class: 'btn btn-sm btn-ghost' }, 'Log in');
    loginA.setAttribute('onclick', "if(window.openLoginModal){openLoginModal()}else{location.href='/index.html#login'}");
    actions.appendChild(loginA);
    const cta = el('a', { href: 'javascript:void(0)', class: 'btn btn-sm btn-primary' }, 'Get started');
    cta.setAttribute('onclick', "if(window.openSignupModal){openSignupModal('solo')}else{location.href='/index.html#signup'}");
    actions.appendChild(cta);
  }
  navInner.appendChild(actions);

  const wrap = document.querySelector(target);
  if (wrap) { wrap.innerHTML = ''; wrap.appendChild(navInner); }
}

// =========================================================
// PASSWORD INPUT WITH TOGGLE
// =========================================================
// Call after DOM is ready. Wraps any input with [data-pwd] inside a wrapper
// and adds an eye toggle.
function attachPwdToggles() {
  document.querySelectorAll('input[type="password"]:not([data-pwd-bound])').forEach(inp => {
    inp.setAttribute('data-pwd-bound', '1');
    const wrap = el('div', { class: 'input-wrap' });
    inp.parentNode.insertBefore(wrap, inp);
    wrap.appendChild(inp);
    const btn = el('button', { type: 'button', class: 'input-toggle', 'aria-label': 'Show password' });
    btn.innerHTML = ICONS.eye;
    btn.addEventListener('click', () => {
      if (inp.type === 'password') { inp.type = 'text'; btn.innerHTML = ICONS.eyeOff; btn.setAttribute('aria-label', 'Hide password'); }
      else { inp.type = 'password'; btn.innerHTML = ICONS.eye; btn.setAttribute('aria-label', 'Show password'); }
    });
    wrap.appendChild(btn);
  });
}

// =========================================================
// CUSTOM SVG LINE CHART
//
// drawLineChart(container, {
//   series:  [{ name, color, data: [{x: 'YYYY-MM-DD', y: number}] }],
//   unit:    'kg',
//   height:  320,
//   area:    true | false,
//   goal:    { value: 250, label: 'Goal · 250kg' }
// })
// Replaces the Chart.js dependency. Container should have position: relative
// (chart-wrap class already provides this).
// =========================================================
const SVG_NS = 'http://www.w3.org/2000/svg';

// Read a CSS custom property from :root (or [data-theme])
function _cv(name, fallback) {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  } catch { return fallback; }
}

// Registry of active charts so we can re-render on theme change.
const _activeCharts = new WeakMap();
window.addEventListener('themechange', () => {
  // Walk the DOM for chart containers we know about. We re-render in a microtask
  // so the new CSS variables are guaranteed flushed.
  setTimeout(() => {
    document.querySelectorAll('[data-chart-bound="1"]').forEach(c => {
      const cfg = _activeCharts.get(c);
      if (cfg) drawLineChart(c, cfg);
    });
  }, 0);
});

function drawLineChart(container, config) {
  const { series = [], unit = '', height = 320, area = false, goal = null } = config;
  container.innerHTML = '';
  // Track for re-render on theme change
  container.setAttribute('data-chart-bound', '1');
  _activeCharts.set(container, config);

  // Resolve theme colors at draw time so the chart re-renders correctly when the user toggles theme.
  const C_GRID  = _cv('--chart-grid', '#1d1d22');
  const C_AXIS  = _cv('--chart-axis', '#82828c');
  const C_GOAL  = _cv('--gold', '#ffb547');
  const C_DOT   = _cv('--dot-stroke', '#0b0b0c');
  const C_CROSS = _cv('--chart-cross', '#56565e');
  const C_TIP_BG    = _cv('--chart-tip-bg', '#16161a');
  const C_TIP_LINE  = _cv('--chart-tip-line', '#34343d');
  const C_TIP_TITLE = _cv('--chart-tip-title', '#82828c');
  const C_TIP_NAME  = _cv('--chart-tip-name', '#b8b8c0');
  const C_TIP_VAL   = _cv('--chart-tip-val', '#f4f4f6');

  const hasData = series.some(s => s.data && s.data.length);
  if (!hasData) {
    const e = el('div', { class: 'chart-empty' });
    e.innerHTML = ICONS.chart + '<p>No data yet — log some sets and your trend will appear here.</p>';
    container.appendChild(e);
    return;
  }

  // Layout
  const w = Math.max(320, container.clientWidth || 600);
  const h = height;
  const PAD = { top: 20, right: 24, bottom: 38, left: 52 };
  const innerW = w - PAD.left - PAD.right;
  const innerH = h - PAD.top - PAD.bottom;

  // Compute domain
  const allDates = [...new Set(series.flatMap(s => s.data.map(d => d.x)))].sort();
  let allYs = series.flatMap(s => s.data.map(d => d.y).filter(y => y != null));
  if (goal && goal.value != null) allYs.push(goal.value);
  const yMin = Math.min(...allYs);
  const yMax = Math.max(...allYs);
  const yRange = (yMax - yMin) || Math.max(1, yMax * 0.05);
  const yLow = Math.max(0, yMin - yRange * 0.12);
  const yHigh = yMax + yRange * 0.12;

  const xScale = i => allDates.length === 1 ? PAD.left + innerW / 2 : (i / (allDates.length - 1)) * innerW + PAD.left;
  const yScale = y => PAD.top + innerH - ((y - yLow) / (yHigh - yLow)) * innerH;

  // SVG
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('width', w);
  svg.setAttribute('height', h);
  svg.style.display = 'block';
  svg.style.overflow = 'visible';

  // <defs> with gradients
  const defs = document.createElementNS(SVG_NS, 'defs');
  series.forEach((s, i) => {
    const grad = document.createElementNS(SVG_NS, 'linearGradient');
    grad.setAttribute('id', 'plg-' + i + '-' + Math.random().toString(36).slice(2,7));
    s._gradId = grad.getAttribute('id');
    grad.setAttribute('x1', '0'); grad.setAttribute('y1', '0');
    grad.setAttribute('x2', '0'); grad.setAttribute('y2', '1');
    [['0%', '0.45'], ['100%', '0']].forEach(([off, op]) => {
      const stop = document.createElementNS(SVG_NS, 'stop');
      stop.setAttribute('offset', off);
      stop.setAttribute('stop-color', s.color);
      stop.setAttribute('stop-opacity', op);
      grad.appendChild(stop);
    });
    defs.appendChild(grad);
  });
  svg.appendChild(defs);

  // Y gridlines + labels
  const tickCount = 5;
  const niceStep = niceTickStep((yHigh - yLow) / tickCount);
  const tickStart = Math.ceil(yLow / niceStep) * niceStep;
  for (let v = tickStart; v <= yHigh; v += niceStep) {
    const yv = yScale(v);
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', PAD.left); line.setAttribute('x2', w - PAD.right);
    line.setAttribute('y1', yv); line.setAttribute('y2', yv);
    line.setAttribute('stroke', C_GRID); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', PAD.left - 10); t.setAttribute('y', yv + 4);
    t.setAttribute('text-anchor', 'end');
    t.setAttribute('fill', C_AXIS); t.setAttribute('font-size', '11');
    t.setAttribute('font-family', "'Space Grotesk', monospace");
    t.textContent = Math.round(v);
    svg.appendChild(t);
  }

  // Goal line
  if (goal && goal.value != null) {
    const yv = yScale(goal.value);
    if (yv >= PAD.top - 5 && yv <= h - PAD.bottom + 5) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', PAD.left); line.setAttribute('x2', w - PAD.right);
      line.setAttribute('y1', yv); line.setAttribute('y2', yv);
      line.setAttribute('stroke', C_GOAL); line.setAttribute('stroke-width', '1.5');
      line.setAttribute('stroke-dasharray', '6 4');
      svg.appendChild(line);
      const lbl = document.createElementNS(SVG_NS, 'text');
      lbl.setAttribute('x', w - PAD.right - 4); lbl.setAttribute('y', yv - 6);
      lbl.setAttribute('text-anchor', 'end');
      lbl.setAttribute('fill', C_GOAL); lbl.setAttribute('font-size', '11');
      lbl.setAttribute('font-weight', '700');
      lbl.setAttribute('font-family', "'Plus Jakarta Sans', sans-serif");
      lbl.textContent = goal.label || ('Goal · ' + goal.value + unit);
      svg.appendChild(lbl);
    }
  }

  // X labels
  const labelStep = Math.max(1, Math.ceil(allDates.length / 7));
  for (let i = 0; i < allDates.length; i += labelStep) {
    const x = xScale(i);
    const t = document.createElementNS(SVG_NS, 'text');
    t.setAttribute('x', x); t.setAttribute('y', h - PAD.bottom + 18);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', C_AXIS); t.setAttribute('font-size', '11');
    t.setAttribute('font-family', "'Plus Jakarta Sans', sans-serif");
    const d = new Date(allDates[i]);
    t.textContent = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    svg.appendChild(t);
  }

  // Series
  series.forEach((s, sIdx) => {
    if (!s.data || !s.data.length) return;
    const byDate = {};
    s.data.forEach(d => { if (d.y != null) byDate[d.x] = d.y; });
    const points = [];
    allDates.forEach((dt, i) => {
      if (byDate[dt] != null) points.push({ x: xScale(i), y: yScale(byDate[dt]), value: byDate[dt], date: dt });
    });
    if (!points.length) return;

    const pathStr = smoothPath(points);

    if (area) {
      const baseY = h - PAD.bottom;
      const areaPath = document.createElementNS(SVG_NS, 'path');
      const areaStr = pathStr + ' L ' + points[points.length - 1].x + ' ' + baseY +
                                ' L ' + points[0].x + ' ' + baseY + ' Z';
      areaPath.setAttribute('d', areaStr);
      areaPath.setAttribute('fill', 'url(#' + s._gradId + ')');
      svg.appendChild(areaPath);
    }

    const line = document.createElementNS(SVG_NS, 'path');
    line.setAttribute('d', pathStr);
    line.setAttribute('fill', 'none');
    line.setAttribute('stroke', s.color);
    line.setAttribute('stroke-width', '2.5');
    line.setAttribute('stroke-linejoin', 'round');
    line.setAttribute('stroke-linecap', 'round');
    // animate
    const len = approxPathLength(points);
    line.setAttribute('stroke-dasharray', len);
    line.setAttribute('stroke-dashoffset', len);
    line.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(0.22, 0.8, 0.36, 1)';
    requestAnimationFrame(() => requestAnimationFrame(() => { line.style.strokeDashoffset = '0'; }));
    svg.appendChild(line);

    // Dots
    points.forEach((p, pi) => {
      const c = document.createElementNS(SVG_NS, 'circle');
      c.setAttribute('cx', p.x); c.setAttribute('cy', p.y);
      c.setAttribute('r', pi === points.length - 1 ? 4.5 : 3.2);
      c.setAttribute('fill', s.color);
      c.setAttribute('stroke', C_DOT); c.setAttribute('stroke-width', '2');
      c.style.opacity = '0';
      c.style.transition = 'opacity 0.3s';
      const delay = 600 + (pi * 50);
      setTimeout(() => { c.style.opacity = '1'; }, delay);
      svg.appendChild(c);
    });
  });

  // Hover crosshair + tooltip
  const cross = document.createElementNS(SVG_NS, 'line');
  cross.setAttribute('y1', PAD.top); cross.setAttribute('y2', h - PAD.bottom);
  cross.setAttribute('stroke', C_CROSS); cross.setAttribute('stroke-width', '1');
  cross.setAttribute('stroke-dasharray', '3 3'); cross.setAttribute('opacity', '0');
  cross.style.pointerEvents = 'none';
  svg.appendChild(cross);

  const tooltip = document.createElement('div');
  tooltip.style.cssText = 'position:absolute; pointer-events:none; opacity:0; background:' + C_TIP_BG + '; border:1px solid ' + C_TIP_LINE + '; border-radius:8px; padding:10px 14px; box-shadow:0 12px 30px rgba(0,0,0,0.18); transition:opacity 0.12s; z-index:10; min-width:140px;';

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:relative; width:100%;';
  wrap.appendChild(svg);
  wrap.appendChild(tooltip);
  container.appendChild(wrap);

  svg.addEventListener('mousemove', e => {
    const rect = svg.getBoundingClientRect();
    const px = (e.clientX - rect.left) * (w / rect.width);
    if (px < PAD.left - 5 || px > w - PAD.right + 5) {
      cross.setAttribute('opacity', '0');
      tooltip.style.opacity = '0';
      return;
    }
    const ratio = (px - PAD.left) / innerW;
    const idx = Math.max(0, Math.min(allDates.length - 1, Math.round(ratio * (allDates.length - 1))));
    const date = allDates[idx];
    const xPos = xScale(idx);
    cross.setAttribute('x1', xPos); cross.setAttribute('x2', xPos);
    cross.setAttribute('opacity', '1');

    let html = '<div style="font-size:0.7rem; color:' + C_TIP_TITLE + '; text-transform:uppercase; letter-spacing:0.1em; font-weight:700; margin-bottom:8px;">' +
               new Date(date).toLocaleDateString(undefined, { month:'short', day:'numeric', year:'numeric' }) + '</div>';
    let any = false;
    series.forEach(s => {
      const d = s.data.find(x => x.x === date);
      if (d != null && d.y != null) {
        any = true;
        html += '<div style="display:flex; justify-content:space-between; gap:18px; align-items:center; padding:3px 0;">' +
                  '<span style="display:flex; align-items:center; gap:8px; font-size:0.85rem;"><span style="width:8px; height:8px; border-radius:50%; background:' + s.color + ';"></span><span style="color:' + C_TIP_NAME + ';">' + s.name + '</span></span>' +
                  '<span style="font-family:\'Space Grotesk\',monospace; color:' + C_TIP_VAL + '; font-weight:700; font-variant-numeric: tabular-nums;">' + (Math.round(d.y * 10) / 10) + ' ' + unit + '</span>' +
                '</div>';
      }
    });
    if (!any) {
      cross.setAttribute('opacity', '0');
      tooltip.style.opacity = '0';
      return;
    }
    tooltip.innerHTML = html;
    // Position relative to wrap container (svg's parent)
    const svgRect = svg.getBoundingClientRect();
    const wrapRect = wrap.getBoundingClientRect();
    const xInWrap = (xPos / w) * svgRect.width;
    const ttW = tooltip.offsetWidth || 180;
    let left = xInWrap + 14;
    if (left + ttW > svgRect.width) left = xInWrap - ttW - 14;
    tooltip.style.left = left + 'px';
    tooltip.style.top = '12px';
    tooltip.style.opacity = '1';
  });
  svg.addEventListener('mouseleave', () => {
    cross.setAttribute('opacity', '0');
    tooltip.style.opacity = '0';
  });
}

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return 'M ' + points[0].x + ' ' + points[0].y;
  if (points.length === 2) return 'M ' + points[0].x + ' ' + points[0].y + ' L ' + points[1].x + ' ' + points[1].y;
  let path = 'M ' + points[0].x + ' ' + points[0].y;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const cp1x = p1.x + (p2.x - p0.x) / 6;
    const cp1y = p1.y + (p2.y - p0.y) / 6;
    const cp2x = p2.x - (p3.x - p1.x) / 6;
    const cp2y = p2.y - (p3.y - p1.y) / 6;
    path += ' C ' + cp1x + ' ' + cp1y + ', ' + cp2x + ' ' + cp2y + ', ' + p2.x + ' ' + p2.y;
  }
  return path;
}

function approxPathLength(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i-1].x;
    const dy = points[i].y - points[i-1].y;
    total += Math.sqrt(dx*dx + dy*dy);
  }
  return Math.ceil(total * 1.15);
}

function niceTickStep(rawStep) {
  if (!isFinite(rawStep) || rawStep <= 0) return 1;
  const exp = Math.floor(Math.log10(rawStep));
  const f = rawStep / Math.pow(10, exp);
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nice * Math.pow(10, exp);
}

// =========================================================
// GOALS
// =========================================================
function getGoals(athleteId) {
  const s = Store.get();
  return s.goals.find(g => g.athleteId === athleteId) || null;
}

function setGoals(athleteId, patch) {
  Store.update(s => {
    let g = s.goals.find(g => g.athleteId === athleteId);
    if (!g) { g = { id: uid('goal'), athleteId, ...patch, updatedAt: Date.now() }; s.goals.push(g); }
    else { Object.assign(g, patch, { updatedAt: Date.now() }); }
  });
}

function bestE1RM(athleteId, lift) {
  const logs = Store.get().workoutLogs.filter(l => l.athleteId === athleteId && l.lift === lift);
  return logs.length ? Math.max(...logs.map(l => l.e1rmComp)) : 0;
}

function currentTotal(athleteId) {
  return ['squat', 'bench', 'deadlift'].reduce((sum, lift) => sum + bestE1RM(athleteId, lift), 0);
}

function latestBodyweight(athleteId) {
  const bw = Store.get().bodyweight.filter(b => b.athleteId === athleteId).sort((a, b) => b.date.localeCompare(a.date));
  return bw[0]?.weight || null;
}

// Returns 0..100. Direction-aware for bw.
function goalProgressPct(current, goal, direction) {
  if (!goal || goal <= 0) return 0;
  if (direction === 'cut') {
    // goal < starting weight; closer to (or below) goal = better
    // We don't track starting weight, so simple approximation:
    // if current <= goal, 100%. Otherwise, 100 * goal/current (gets closer as current drops)
    if (current <= goal) return 100;
    return Math.max(0, Math.round((goal / current) * 100));
  }
  if (direction === 'gain') {
    if (current >= goal) return 100;
    return Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
  }
  // strength goals (always increasing)
  return Math.max(0, Math.min(100, Math.round((current / goal) * 100)));
}

// =========================================================
// SEED DEMO DATA — DEPRECATED (data now lives in Supabase)
// =========================================================
function seedDemoIfEmpty() { /* no-op — Supabase is the source of truth */ }

/* Removed legacy seed function. Kept structure for reference:
function _legacy_seedDemo() {
  const s = {};
  return;

  const coach = {
    id: uid('coach'),
    name: 'Demo Coach',
    email: 'demo@coach.com',
    pwd: hashPwd('demo'),
    bio: 'IPF certified powerlifting coach. 10+ years experience. Specializes in raw classic powerlifting and RPE-based programming.',
    createdAt: Date.now()
  };
  s.coaches.push(coach);

  const athlete = {
    id: uid('athlete'),
    name: 'Demo Lifter',
    email: 'demo@lifter.com',
    pwd: hashPwd('demo'),
    coachId: coach.id,
    createdAt: Date.now()
  };
  s.athletes.push(athlete);

  const program = {
    id: uid('prog'),
    athleteId: athlete.id,
    coachId: coach.id,
    name: 'Hypertrophy Block',
    weeks: [
      {
        id: uid('wk'), number: 1, days: [
          {
            id: uid('day'), name: 'Squat Day', exercises: [
              { id: uid('ex'), lift: 'squat', variant: 'Competition', exerciseName: '', note: 'Slow controlled descent. Stay tight at the bottom.', sets: [
                  { id: uid('set'), weight: 140, reps: 5, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 140, reps: 5, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 140, reps: 5, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'squat', variant: 'Paused', exerciseName: '', note: '2-second pause at the bottom.', sets: [
                  { id: uid('set'), weight: 110, reps: 4, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 110, reps: 4, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'legs', variant: '', exerciseName: 'Leg Curls', note: '', sets: [
                  { id: uid('set'), weight: 30, reps: 12, rpe: 8, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 30, reps: 12, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]}
            ]
          },
          {
            id: uid('day'), name: 'Bench Day', exercises: [
              { id: uid('ex'), lift: 'bench', variant: 'Competition', exerciseName: '', note: 'Touch and pause for 1s.', sets: [
                  { id: uid('set'), weight: 95, reps: 5, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 95, reps: 5, rpe: 8, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 95, reps: 5, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'bench', variant: 'Close Grip', exerciseName: '', note: '', sets: [
                  { id: uid('set'), weight: 80, reps: 6, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'push', variant: '', exerciseName: 'Tricep Pushdown', note: '', sets: [
                  { id: uid('set'), weight: 25, reps: 15, rpe: 9, completed: false, actualRpe: null, completedAt: null }
              ]}
            ]
          },
          {
            id: uid('day'), name: 'Deadlift Day', exercises: [
              { id: uid('ex'), lift: 'deadlift', variant: 'Competition', exerciseName: '', note: 'Reset between reps. No bouncing.', sets: [
                  { id: uid('set'), weight: 180, reps: 3, rpe: 7, completed: false, actualRpe: null, completedAt: null },
                  { id: uid('set'), weight: 180, reps: 3, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]},
              { id: uid('ex'), lift: 'deadlift', variant: 'Deficit', exerciseName: '', note: 'Stand on a 2.5kg plate.', sets: [
                  { id: uid('set'), weight: 150, reps: 5, rpe: 8, completed: false, actualRpe: null, completedAt: null }
              ]}
            ]
          }
        ]
      }
    ]
  };
  s.programs.push(program);

  // Historical logs for chart drama
  const today = new Date();
  const histDates = [];
  for (let i = 28; i >= 0; i -= 4) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    histDates.push(d.toISOString().slice(0, 10));
  }
  let baseSquat = 130, baseBench = 85, baseDead = 165;
  histDates.forEach((d, i) => {
    s.workoutLogs.push({ id: uid('log'), athleteId: athlete.id, lift: 'squat', variant: 'Competition', exerciseName: '', weight: baseSquat + i * 3.5, reps: 5, rpe: 8,
      e1rm: calcE1RM(baseSquat + i * 3.5, 5, 8), e1rmComp: calcCompE1RM(baseSquat + i * 3.5, 5, 8, 'squat', 'Competition'), date: d });
    s.workoutLogs.push({ id: uid('log'), athleteId: athlete.id, lift: 'bench', variant: 'Competition', exerciseName: '', weight: baseBench + i * 1.5, reps: 5, rpe: 8,
      e1rm: calcE1RM(baseBench + i * 1.5, 5, 8), e1rmComp: calcCompE1RM(baseBench + i * 1.5, 5, 8, 'bench', 'Competition'), date: d });
    s.workoutLogs.push({ id: uid('log'), athleteId: athlete.id, lift: 'deadlift', variant: 'Competition', exerciseName: '', weight: baseDead + i * 4, reps: 3, rpe: 8,
      e1rm: calcE1RM(baseDead + i * 4, 3, 8), e1rmComp: calcCompE1RM(baseDead + i * 4, 3, 8, 'deadlift', 'Competition'), date: d });
    s.bodyweight.push({ id: uid('bw'), athleteId: athlete.id, date: d, weight: 82 + Math.sin(i / 3) * 0.6, unit: 'kg' });
  });

}
*/
