#!/usr/bin/env node
/*
 * Small-stuff scanner: the details a person notices and a unit test doesn't.
 *
 * Opens 239 screens (athlete / solo / coach / brand-new-coach demos in the iPhone layout, their
 * sheets (New challenge and a challenge's board among them, the import intake's steps, the two-factor code prompt, the coach's
 * Ask sheet, bell list, first-run tour and form-check review), the planner, the onboarding, every public page at desktop and phone width, dark and light) and
 * reports: sideways scroll, text overlapping text, controls overlapping controls, text cut off
 * by its box, things poking out of the screen or out of their card, side-by-side buttons that
 * don't match, tiny tap targets (app only) and unreadable text (contrast under 2.6:1).
 * The baseline is 0 findings (27 Oct 2026): anything it reports is new. Inline fields fill their
 * rows (padding, not a taller look), so the tap target is the row; the eye button sits inside its field.
 *
 * Needs playwright-core and a Chromium (not repo dependencies, like check-mobile-overflow):
 *     npm i -g playwright-core && npx playwright install chromium
 * Serve the repo root, then run:
 *     python3 -m http.server 4191 --bind 127.0.0.1
 *     node test/uiscan.mjs [outDir]          # BASE=http://host:port/ to point elsewhere
 *     UISCAN_ONLY='^w-index' node test/uiscan.mjs   # only the screens whose name matches
 * Screens with findings are screenshotted into outDir (default /tmp/powa-uiscan) with issues.json.
 * A screen that throws (FAILED) counts as a finding. Nothing reaches Supabase or Plausible: both are refused
 * on this machine (the public pages then show their offline states).
 */
import fs from 'node:fs';
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch (e) { console.log('uiscan: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(0); }
const BASE = process.env.BASE || 'http://127.0.0.1:4191/';
const outDir = process.argv[2] || '/tmp/powa-uiscan';
fs.mkdirSync(outDir, { recursive: true });

const tab = (t) => "document.querySelector('[data-tab=\"" + t + "\"]').click()";
const A = 'athlete.html?demo=1', SO = 'athlete.html?demo=1&solo=1', C = 'coach.html?demo=1', F = 'coach.html?demo=1&fresh=1';
// Night B helpers. SWAP_INJ: Arjun's latest logged main lift saved as a swap (squat to pin squat, bench to close grip,
// deadlift to RDL), as his phone would have, on his last session's date (the demo's logs and program dates differ).
// MEET_BEHIND: the demo lifter's meet 14 days out at 83 kg and today's weigh-in 87.2 kg. PULL_HOLD: a pull of 220 px
// on the screen's pane with the finger still down (touch events, so the app's own gesture code draws it).
const SWAP_INJ = "(() => { const s = Store.get(), p = s.programs.find(x => x.athleteId === 'demo-a1'); const last = s.workoutLogs.filter(l => l.athleteId === 'demo-a1').map(l => l.date).sort().pop(); let hit = null; p.weeks.forEach(w => w.days.forEach(d => d.exercises.forEach(e => { if (['squat', 'bench', 'deadlift'].includes(e.lift) && (e.variant || 'Competition') === 'Competition' && e.sets.some(x => x.completed)) hit = e; }))); const to = { squat: 'Pin', bench: 'Close Grip', deadlift: 'RDL' }[hit.lift]; hit.swap = { from: 'Competition', on: last, sets: hit.sets.map((x, i) => ({ at: i, f: { weight: x.weight } })) }; hit.sets.forEach(x => { x.weight = swapLoadKg(x.weight, hit.lift, 'Competition', to, 2.5); if (x.completed) x.completedAt = last; }); hit.variant = to; Store.bump(); })()";
const MEET_BEHIND = "Store.update(s => { s.meets.push({ id: 'uiscan-meet', athleteId: 'demo-athlete', name: 'Winter Classic', date: _addDaysISO(todayISO(), 14), weightClass: '83 kg', status: 'planned' }); const b = s.bodyweight.find(x => x.athleteId === 'demo-athlete' && x.date === todayISO()); if (b) b.weight = 87.2; })";
const PULL_HOLD = "(async () => { await new Promise(r => setTimeout(r, 900)); const p = [...document.querySelectorAll('section[data-pane]')].find(x => !x.classList.contains('hidden') && x.offsetParent); const T = (y) => new Touch({ identifier: 7, target: p, clientX: 196, clientY: y }); p.dispatchEvent(new TouchEvent('touchstart', { touches: [T(420)], changedTouches: [T(420)], bubbles: true, cancelable: true })); for (let i = 1; i <= 12; i++) { p.dispatchEvent(new TouchEvent('touchmove', { touches: [T(420 + i * 18)], changedTouches: [T(420 + i * 18)], bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, 20)); } return true; })()";
const screens = [];
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) {
  for (const t of ['today', 'progress', 'club', 'coach', 'you', 'bodyweight', 'library', 'career']) screens.push({ name: 'a-' + t + suf, page: A, theme, eval: t === 'today' ? null : tab(t) });
  // You › Career with every fold open (the years' blocks, every PR), and the coach's read-only sheet.
  screens.push({ name: 'a-career-open' + suf, page: A, theme, eval: tab('career') + ";document.querySelectorAll('.cv-more').forEach(b => b.click())" },
    { name: 'sh-career' + suf, page: C, theme, eval: "Career.openSheet('demo-a1')" });
  if (theme === 'dark') for (const t of ['today', 'program', 'progress', 'coach', 'library', 'you', 'career']) screens.push({ name: 's-' + t, page: SO, eval: t === 'today' ? null : tab(t) });
  // The coach app lands on Home (coach-app.js, 28 Oct); Lifters, Programs and the rest are a tab away.
  for (const t of ['home', 'athletes', 'program', 'messages', 'club', 'challenges', 'you', 'templates', 'progress']) screens.push({ name: 'c-' + t + suf, page: C, theme, eval: t === 'home' ? null : tab(t) });
  for (const t of ['home', 'athletes', 'program', 'messages', 'you', 'templates']) screens.push({ name: 'f-' + t + suf, page: F, theme, eval: t === 'home' ? null : tab(t) });
  // A lifter's card and the views its rows push in; Programs' editor sheet and lifter picker; Home's sheets.
  screens.push(
    { name: 'c-lifter' + suf, page: C, theme, eval: "CoachLifters.open('demo-a1')" },
    { name: 'c-lifter-progress' + suf, page: C, theme, eval: "CoachLifters.open('demo-a1');setTimeout(() => document.querySelector('[data-act=progress]').click(), 300)" },
    { name: 'c-lifter-notes' + suf, page: C, theme, eval: "CoachLifters.open('demo-a1');setTimeout(() => document.querySelector('[data-row=notes]').click(), 300)" },
    { name: 'c-lifter-client' + suf, page: C, theme, eval: "CoachLifters.open('demo-a1');setTimeout(() => document.querySelector('[data-act=client]').click(), 300)" },
    { name: 'sh-program-editor' + suf, page: C, theme, eval: tab('program') + ";setTimeout(() => document.querySelector('.cp-page[data-day=\"2\"] .cp-exrow').click(), 400)" },
    { name: 'sh-program-editor-w2' + suf, page: C, theme, eval: tab('program') + ";setTimeout(() => { document.querySelectorAll('.cp-wk')[1].click(); setTimeout(() => document.querySelector('.cp-page[data-day=\"0\"] .cp-exrow').click(), 400); }, 400)" },
    { name: 'sh-program-pick' + suf, page: C, theme, eval: tab('program') + ";setTimeout(() => document.querySelector('.cp-title').click(), 400)" },
    // The editor with a block's More open (its load and effort switches, the set fields, Remove these sets),
    // the picker past six lifters (its search and groups), Home before the roster is in and when it couldn't load.
    { name: 'sh-program-editor-more' + suf, page: C, theme, eval: tab('program') + ";setTimeout(() => { document.querySelectorAll('.cp-wk')[1].click(); setTimeout(() => { document.querySelector('.cp-page[data-day=\"0\"] .cp-exrow').click(); setTimeout(() => { const m = document.querySelectorAll('.cp-sheet .cp-blkmore')[1]; m.click(); m.scrollIntoView({ block: 'center' }); }, 500); }, 400); }, 400)" },
    { name: 'sh-program-pick-many' + suf, page: C, theme, eval: "Store.update(st => { ['Leo Grant', 'Priya Shah', 'Marcus Doyle', 'Elena Rossi'].forEach((n, i) => st.athletes.push(Object.assign({}, st.athletes.find(a => a.id === 'demo-a2'), { id: 'demo-x' + i, name: n, email: 'x' + i + '@demo.com', avatarUrl: null }))); });" + tab('program') + ";setTimeout(() => document.querySelector('.cp-title').click(), 400)" },
    { name: 'c-home-loading' + suf, page: C, theme, eval: "window._coachBoot = 'loading'; CoachApp.renderHome()" },
    { name: 'c-home-failed' + suf, page: C, theme, eval: "window._coachBoot = 'failed'; CoachApp.renderHome()" },
    { name: 'sh-home-search' + suf, page: C, theme, eval: 'CoachApp.openSearch()' },
    { name: 'sh-home-checkins' + suf, page: C, theme, eval: 'CoachApp.openCheckins()' },
    { name: 'sh-home-wins' + suf, page: C, theme, eval: 'CoachApp.openWins()' });
  // Capacity (You › Capacity) for the demo coach and a brand-new one; a lifter's busy-week sheet.
  screens.push({ name: 'c-capacity' + suf, page: C, theme, eval: tab('capacity') }, { name: 'f-capacity' + suf, page: F, theme, eval: tab('capacity') },
    { name: 'sh-busy' + suf, page: A, theme, eval: 'BusyWeekUI.open()' });
  if (theme === 'dark') screens.push({ name: 'sh-busy-solo', page: SO, eval: 'BusyWeekUI.open()' }, { name: 'c-lifter-busy', page: C, eval: "CoachLifters.open('demo-a4')" });
  screens.push(
    { name: 'sh-invite' + suf, page: C, theme, eval: 'openInviteModal()' },
    // Clients on the phone (You › Clients) and its sheets, a brand-new coach's, and Remove from roster's own ask.
    { name: 'c-clients' + suf, page: C, theme, eval: tab('clients') },
    { name: 'f-clients' + suf, page: F, theme, eval: tab('clients') },
    { name: 'sh-client' + suf, page: C, theme, eval: tab('clients') + ";ClientsUI.openClient('demo-a3')" },
    { name: 'sh-client-paid' + suf, page: C, theme, eval: "ClientsUI.markPaid('demo-a3')" },
    { name: 'sh-client-package' + suf, page: C, theme, eval: "ClientsUI.editPackage('demo-a2')" },
    { name: 'sh-remove' + suf, page: C, theme, eval: "openRemoveLifterSheet('demo-a2', 'Sarah Kim')" },
    // Lifters past six (24, searched), with two join requests, a pending invite's menu; a paid-up client's sheet.
    { name: 'c-athletes-many' + suf, page: C, theme, eval: "Store.update(st => { for (let i = 0; i < 20; i++) st.athletes.push(Object.assign({}, st.athletes.find(a => a.id === 'demo-a2'), { id: 'demo-x' + i, name: ['Leo', 'Priya', 'Marcus', 'Elena', 'Mei', 'Dev', 'Sofia', 'Jonah', 'Aisha', 'Tom\u00e1s'][i % 10] + ' ' + ['Grant', 'Shah', 'Doyle', 'Rossi', 'Tanaka', 'Patel', 'Alvarez', 'Reed', 'Okafor', 'Silva'][(i * 3) % 10] + (i >= 10 ? ' Jr' : ''), email: 'x' + i + '@demo.com', avatarUrl: null })); });" + tab('athletes') + ";setTimeout(() => { const q = document.querySelector('.ca-search .ca-q'); q.value = 'pri'; q.dispatchEvent(new Event('input')); }, 400)" },
    { name: 'c-athletes-join' + suf, page: C, theme, eval: tab('athletes') + ";setTimeout(() => { const h = document.createElement('div'); document.getElementById('rosterArea').prepend(h); h.appendChild(_joinRequestsPhone([{ id: 'r1', athleteName: 'Leo Grant', note: 'Meet in March, want a coach for the peak' }, { id: 'r2', athleteName: 'Priya Shah', note: '' }])); }, 400)" },
    { name: 'sh-invite-menu' + suf, page: C, theme, eval: tab('athletes') + ";setTimeout(() => document.querySelector('#invitesList .inv-row-p .ui-icon-btn').click(), 500)" },
    { name: 'sh-client-ok' + suf, page: C, theme, eval: tab('clients') + ";ClientsUI.openClient('demo-a4')" },
    { name: 'sh-athlete' + suf, page: C, theme, eval: "openAthleteSheet('demo-a1')" },
    { name: 'sh-security' + suf, page: C, theme, eval: 'openSecuritySheet()' },
    { name: 'sh-profile' + suf, page: A, theme, eval: 'openProfileSheet()' },
    { name: 'sh-notif' + suf, page: A, theme, eval: 'openNotificationsSheet()' },
    { name: 'sh-plates' + suf, page: A, theme, eval: 'openGymPlatesSheet()' },
    { name: 'sh-import' + suf, page: C, theme, eval: "openSheetImport('demo-a1')" },
    { name: 'sh-thread' + suf, page: C, theme, eval: "openAthleteMessages('demo-a1', 'Arjun Mehta')" },
    // Coach alerts (2026-10-28): last week's report, the sample a new coach gets, the coach's Notifications.
    { name: 'sh-report' + suf, page: C, theme, eval: 'CoachReportUI.open()' },
    { name: 'sh-report-sample' + suf, page: F, theme, eval: 'CoachReportUI.open({ example: true })' },
    { name: 'sh-notif-coach' + suf, page: C, theme, eval: 'openNotificationsSheet()' },
    { name: 'ob-welcome' + suf, page: 'index.html', theme },
    { name: 'ob-signup' + suf, page: 'index.html', theme, eval: "obOpen('signup', { role: 'coach' })" },
    { name: 'ob-login' + suf, page: 'index.html', theme, eval: "obOpen('login')" },
    // Coach challenges (challenges.js): New challenge, and the board from the lifter's side (you marked);
    // Aim for a total (meetday.js): the attempt planner with its row under the plans.
    { name: 'sh-chl-new' + suf, page: C, theme, eval: tab('club') + ';Challenges.openNew()' },
    { name: 'sh-chl-board' + suf, page: A, theme, eval: tab('club') + ";setTimeout(() => { const b = document.querySelector('.chl-mine'); if (b) b.click(); }, 200)" },
    { name: 'sh-planner-aim' + suf, page: C, theme, eval: "openAttemptPlanner('demo-cmeet-p1')" },
    // Imports (import-ui.js, loaded on first use): the intake, a client list against the plan's seats (a full
    // roster and a brand-new coach's 3), a lifter's history with its preview, a workbook's tabs, a guide, the
    // lifter's own import, a program grid in the check.
    { name: 'sh-im-intake' + suf, page: C, theme, eval: "SwitchKit.openIntake({ mode: 'hub' })" },
    { name: 'sh-im-roster' + suf, page: C, theme, eval: "SwitchKit.openIntake({ mode: 'roster', sample: 'roster' })" },
    { name: 'sh-im-roster-fresh' + suf, page: F, theme, eval: "SwitchKit.openIntake({ mode: 'roster', sample: 'roster' })" },
    { name: 'sh-im-history' + suf, page: C, theme, eval: "SwitchKit.openIntake({ mode: 'history', athleteId: 'demo-a1', sample: 'history' })" },
    { name: 'sh-im-tabs' + suf, page: C, theme, eval: "SwitchKit.openIntake({ mode: 'hub', sample: 'workbook' }).then(() => new Promise(r => setTimeout(r, 900)))" },
    { name: 'sh-im-guide' + suf, page: C, theme, eval: "SwitchKit.loadIntake().then(() => ImportGuides.open('truecoach'))" },
    { name: 'sh-im-self' + suf, page: A, theme, eval: "SwitchKit.openIntake({ mode: 'history', self: true, sample: 'history' })" },
    { name: 'sh-im-program' + suf, page: C, theme, eval: "SwitchKit.openIntake({ mode: 'program', athleteId: 'demo-a2', sample: 'grid' }).then(() => new Promise(r => setTimeout(r, 700)))" },
    // Two-factor (2026-10-28): the code prompt a dashboard shows when a session still owes its code, and the
    // one after the password in the app's log-in sheet. Only drawn here: nothing is sent until Verify.
    { name: 'sh-2fa' + suf, page: C, theme, eval: "promptMfaChallenge({ cancelLabel: 'Sign out' }); true" },
    // The same prompt on an open dashboard whose writes are refused: two-factor turned on from another device (29 Oct).
    { name: 'sh-2fa-inplace' + suf, page: A, theme, eval: "promptMfaChallenge({ cancelLabel: 'Sign out', lead: _MFA_IN_PLACE_LEAD }); true" },
    { name: 'ob-2fa' + suf, page: 'index.html', theme, eval: "obOpen('login'); setTimeout(() => promptMfaChallenge(), 400); true" },
    // The overlays the coach roll-out's final review measured (29 Oct): the Ask sheet (Coaching and Support), the
    // bell's list, the first-run tour, Progression rules and the form-check review.
    { name: 'sh-ask' + suf, page: C, theme, eval: 'openAIAssistant(); true' },
    { name: 'sh-ask-support' + suf, page: C, theme, eval: "openAIAssistant(); document.querySelector('.ai-seg-btn[data-mode=support]').click(); true" },
    { name: 'sh-bell' + suf, page: C, theme, eval: "document.querySelector('.sig-bell').click(); true" },
    { name: 'c-rules' + suf, page: C, theme, eval: tab('rules') },
    { name: 'sh-formcheck' + suf, page: C, theme, eval: "CoachLifters.open('demo-a1'); new Promise(r => setTimeout(r, 500)).then(() => { document.querySelector('#lifterPage [data-row=videos]').click(); return new Promise(r => setTimeout(r, 700)); }).then(() => { document.querySelector('[data-fc]').click(); return new Promise(r => setTimeout(r, 900)); })" },
    { name: 'f-tour' + suf, page: F, theme, eval: "localStorage.removeItem('powa-tour-coach-done'); window.replayCoachTour(); true" });
  // Night B (30 Oct). Swap an exercise: the Swap sheet over Train, Train with today's squat swapped (the card's line
  // and Undo), the coach's sheet, Programs and the laptop's lifter page (below) with a swapped session. The meet on the
  // weigh-in: Train's tile and Bodyweight with a meet 14 days out, behind (the triangle). Pull to refresh: Club and
  // Lifters held mid-pull (a touch still down: the screen down, the ring filled).
  screens.push(
    { name: 'sh-swap' + suf, page: A, theme, eval: "openSwapSheet(getCurrentDay().day.exercises[0].id)" },
    { name: 'a-today-swapped' + suf, page: A, theme, eval: "doSwap(getCurrentDay().day.exercises[0].id, 'Pin'); document.querySelectorAll('.toast').forEach(t => t.remove()); true" },
    { name: 'a-today-meet' + suf, page: A, theme, eval: MEET_BEHIND + "; renderToday(); const t = document.querySelector('.tx-weigh').closest('.ts-tile'); t.parentNode.scrollLeft = t.offsetLeft - 16; true" },
    { name: 'a-bodyweight-meet' + suf, page: A, theme, eval: MEET_BEHIND + ';' + tab('bodyweight') },
    { name: 'sh-athlete-swap' + suf, page: C, theme, eval: SWAP_INJ + "; openAthleteSheet('demo-a1')" },
    { name: 'c-program-swap' + suf, page: C, theme, eval: SWAP_INJ + ';' + tab('program') },
    { name: 'a-club-pull' + suf, page: A, theme, eval: tab('club') + ';' + PULL_HOLD },
    { name: 'c-athletes-pull' + suf, page: C, theme, eval: tab('athletes') + ';' + PULL_HOLD });
}
for (const [w, h, suf] of [[1440, 900, ''], [390, 844, '-m']]) {
  for (const p of ['index.html', 'about.html', 'faq.html', 'guides.html', 'guide-rpe.html', 'marketplace.html', 'leaderboard.html', 'exercises.html', 'join.html?code=ABC234', 'reset-password.html', 'privacy.html', 'terms.html', A, SO, C, F]) {
    screens.push({ name: 'w-' + p.replace(/\.html.*/, '') + (p.includes('fresh') ? '-fresh' : p.includes('solo') ? '-solo' : '') + suf, page: p, mode: 'web', w, h });
  }
}
screens.push({ name: 'w-index-l', page: 'index.html', mode: 'web', theme: 'light' }, { name: 'w-index-m-l', page: 'index.html', mode: 'web', w: 390, h: 844, theme: 'light' });
// Every other public page (29 Oct: pages.css carries the homepage's look to them), and every public page in the light
// theme too (they follow it; the homepage's floors don't). Offline, the shop is empty, a coach's profile says the coach
// isn't found, email preferences say the link isn't valid; the leaderboard's demo board is local.
const MORE_PUBLIC = ['data.html', 'switch.html', 'guide-e1rm.html', 'guide-dots.html', 'guide-peaking.html', 'coach-profile.html?id=none', 'unsubscribe.html', 'leaderboard.html?demo=1', '404.html'];
const ALL_PUBLIC = ['about.html', 'faq.html', 'guides.html', 'guide-rpe.html', 'marketplace.html', 'leaderboard.html', 'exercises.html', 'join.html?code=ABC234', 'reset-password.html', 'privacy.html', 'terms.html'].concat(MORE_PUBLIC);
const pubName = (p) => 'w-' + p.replace(/\.html.*/, '') + (p.includes('demo=1') ? '-demo' : '');
for (const [w, h, suf] of [[1440, 900, ''], [390, 844, '-m']]) {
  for (const p of MORE_PUBLIC) screens.push({ name: pubName(p) + suf, page: p, mode: 'web', w, h });
  for (const p of ALL_PUBLIC) screens.push({ name: pubName(p) + suf + '-l', page: p, mode: 'web', w, h, theme: 'light' });
}
// The desk's Settings › Plan & seats with Capacity, dark and light.
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) screens.push({ name: 'w-capacity' + suf, page: C, mode: 'web', theme, eval: "localStorage.setItem('powa-desk-set', 'plan'); deskGo('settings')" });
// The desk's Career panel (coach.html at laptop width), dark and light.
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) screens.push({ name: 'w-career-panel' + suf, page: C, mode: 'web', theme, eval: "Career.openPanel('demo-a1');document.querySelectorAll('.cv-modal .cv-more').forEach(b => b.click())" });
// The desk's Club with the coach's challenge, its whole board, and the planner's Aim for a total, dark and light.
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) screens.push(
  { name: 'w-coach-club' + suf, page: C, mode: 'web', theme, eval: "deskGo('club')" },
  { name: 'w-chl-board' + suf, page: C, mode: 'web', theme, eval: "deskGo('club');setTimeout(() => { const b = document.querySelector('.chl-all'); if (b) b.click(); }, 200)" },
  { name: 'w-planner-aim' + suf, page: C, mode: 'web', theme, eval: "openAttemptPlanner('demo-cmeet-p1')" });
// The desk's lifter page with a session where the rack was taken (Swapped for … on the session), dark and light.
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) screens.push({ name: 'w-ws-swap' + suf, page: C, mode: 'web', theme, eval: SWAP_INJ + "; openAthletePage('demo-a1')" });
// The desk's Last week report (coach.html at laptop width), dark and light.
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) screens.push({ name: 'w-report' + suf, page: C, mode: 'web', theme, eval: 'CoachReportUI.open()' });
// Imports on the desk (coach.html at laptop width): the intake, a client list, a lifter's history, a guide, dark and light.
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) screens.push(
  { name: 'w-im-intake' + suf, page: C, mode: 'web', theme, eval: "SwitchKit.openIntake({ mode: 'hub' })" },
  { name: 'w-im-roster' + suf, page: C, mode: 'web', theme, eval: "SwitchKit.openIntake({ mode: 'roster', sample: 'roster' })" },
  { name: 'w-im-history' + suf, page: C, mode: 'web', theme, eval: "SwitchKit.openIntake({ mode: 'history', athleteId: 'demo-a1', sample: 'history' })" },
  { name: 'w-im-guide' + suf, page: C, mode: 'web', theme, eval: "SwitchKit.loadIntake().then(() => ImportGuides.open('coachrx'))" });
// The two-factor code prompt on the website (after the password, over the log-in modal) and on the desk, dark and light.
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) screens.push(
  // The homepage loads the app on intent (2026-10-29): the modal and the prompt wait for it.
  { name: 'w-2fa-login' + suf, page: 'index.html', mode: 'web', theme, eval: 'PowaApp.load().then(() => { openLoginModal(); promptMfaChallenge(); return true; })' },
  { name: 'w-2fa-login-m' + suf, page: 'index.html', mode: 'web', w: 390, h: 844, theme, eval: 'PowaApp.load().then(() => { openLoginModal(); promptMfaChallenge(); return true; })' },
  { name: 'w-2fa-desk' + suf, page: C, mode: 'web', theme, eval: "promptMfaChallenge({ cancelLabel: 'Sign out' }); true" });

// Never the live services: the screens are demos and public pages, but a public page still calls Supabase (the
// coach list, the leaderboard, join.html's invite_preview, which counts toward a rate limit) and Plausible (a
// pageview per screen). Both are refused before they leave this machine: by name in the browser (nothing resolves)
// and by route in every context (HTTP and WebSockets). The pages then draw their offline states, as with no network.
const LIVE_HOSTS = ['supabase.co', 'plausible.io'];
const LIVE_URL = new RegExp('^(https?|wss?)://([^/?#]*\\.)?(' + LIVE_HOSTS.map((h) => h.replace(/\./g, '\\.')).join('|') + ')(:\\d+)?([/?#]|$)', 'i');
let liveRefused = 0;
// A run of some screens only: UISCAN_ONLY=<regex on the screen name>, e.g. UISCAN_ONLY='^w-(index|join)'.
const ONLY = process.env.UISCAN_ONLY ? new RegExp(process.env.UISCAN_ONLY) : null;
const run = ONLY ? screens.filter((s) => ONLY.test(s.name)) : screens;

const EXE = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch(Object.assign(EXE ? { executablePath: EXE } : {},
  { args: ['--host-resolver-rules=' + LIVE_HOSTS.map((h) => `MAP ${h} ~NOTFOUND, MAP *.${h} ~NOTFOUND`).join(', ')] }));

function scan(isApp) {
  const vw = innerWidth;
  const out = [];
  const lab = (e) => {
    if (!e) return '?';
    const cls = (typeof e.className === 'string' && e.className.trim()) ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const t = (e.innerText || e.value || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 36);
    return e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + cls + (t ? ' "' + t + '"' : '');
  };
  const styleCache = new Map();
  const cs = (e) => { let s = styleCache.get(e); if (!s) { s = getComputedStyle(e); styleCache.set(e, s); } return s; };
  const shown = (e) => {
    for (let n = e; n && n.nodeType === 1; n = n.parentElement) {
      const s = cs(n);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return false;
      if (n.hasAttribute('hidden')) return false;
    }
    return true;
  };
  // The part of an element's box that can actually be seen: clipped by every overflow ancestor.
  const clipCache = new Map();
  const clipOf = (e) => {
    if (clipCache.has(e)) return clipCache.get(e);
    let r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    const p = e.parentElement;
    if (p && p !== document.body && p !== document.documentElement) {
      const pr = clipOf(p);
      r = { l: pr.l, t: pr.t, r: pr.r, b: pr.b };
      const s = cs(p);
      if (s.overflowX !== 'visible' || s.overflowY !== 'visible') {
        const b = p.getBoundingClientRect();
        if (s.overflowX !== 'visible') { r.l = Math.max(r.l, b.left); r.r = Math.min(r.r, b.right); }
        if (s.overflowY !== 'visible') { r.t = Math.max(r.t, b.top); r.b = Math.min(r.b, b.bottom); }
      }
      if (s.position === 'fixed') { /* a fixed parent resets nothing for its children's clip */ }
    }
    clipCache.set(e, r);
    return r;
  };
  const visRect = (e, rect) => {
    const b = rect || e.getBoundingClientRect();
    const c = clipOf(e);
    const r = { l: Math.max(b.left, c.l), t: Math.max(b.top, c.t), r: Math.min(b.right, c.r), b: Math.min(b.bottom, c.b) };
    return (r.r - r.l > 1 && r.b - r.t > 1) ? r : null;
  };
  const layerOf = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const p = cs(n).position; if (p === 'fixed' || p === 'sticky') return n; } return null; };
  const inter = (a, b) => ({ w: Math.min(a.r, b.r) - Math.max(a.l, b.l), h: Math.min(a.b, b.b) - Math.max(a.t, b.t) });
  const skip = (e) => !!e.closest('.toast, #toast, .demo-banner, .s-marquee, [data-scan-skip]');

  // 1. sideways scroll
  const sw = document.scrollingElement.scrollWidth;
  if (sw > vw + 1) out.push({ type: 'page-overflow-x', detail: sw + 'px wide on a ' + vw + 'px screen' });
  document.querySelectorAll('.dash-main, main').forEach(m => { if (m.scrollWidth > m.clientWidth + 1 && cs(m).overflowX !== 'visible') out.push({ type: 'main-overflow-x', el: lab(m), detail: m.scrollWidth + ' > ' + m.clientWidth }); });

  // 2. text rects
  const texts = [];
  const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, { acceptNode: n => n.textContent.trim() ? 1 : 2 });
  while (tw.nextNode()) {
    const n = tw.currentNode, p = n.parentElement;
    if (!p || skip(p) || !shown(p) || ['SCRIPT', 'STYLE', 'NOSCRIPT', 'OPTION', 'TEXTAREA'].includes(p.tagName)) continue;
    // Visually hidden on purpose (a screen-reader label in a 1px clipped box).
    if (p.clientWidth <= 1 && p.clientHeight <= 1 && cs(p).position === 'absolute') continue;
    const rg = document.createRange(); rg.selectNodeContents(n);
    [...rg.getClientRects()].forEach(r0 => { const r = visRect(p, r0); if (r && r.r - r.l > 2 && r.b - r.t > 4) texts.push({ n, p, r, layer: layerOf(p), s: n.textContent.trim().slice(0, 30) }); });
  }
  const seen = new Set();
  for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) {
    const a = texts[i], b = texts[j];
    if (a.n === b.n || a.layer !== b.layer) continue;
    const x = inter(a.r, b.r);
    if (x.w > 2 && x.h > 4) {
      const k = lab(a.p) + '|' + lab(b.p);
      if (seen.has(k)) continue; seen.add(k);
      out.push({ type: 'text-overlap', el: lab(a.p), other: lab(b.p), detail: '"' + a.s + '" × "' + b.s + '" (' + Math.round(x.w) + '×' + Math.round(x.h) + ')' });
    }
  }

  // 3. controls overlapping controls
  const ctrls = [...document.querySelectorAll('button, a[href], input:not([type=hidden]), select, textarea, [role=button], [role=tab], label.switch')]
    .filter(e => !skip(e) && shown(e)).map(e => {
      // Inline links that wrap have one box per line: test those, not the bounding box.
      const inline = cs(e).display === 'inline';
      const rs = (inline ? [...e.getClientRects()] : [e.getBoundingClientRect()]).map(r0 => visRect(e, r0)).filter(Boolean);
      return { e, r: rs[0], rs, layer: layerOf(e) };
    }).filter(o => o.r);
  const isField = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.tagName);
  const inside = (a, b) => a.l >= b.l - 1 && a.r <= b.r + 1 && a.t >= b.t - 1 && a.b <= b.b + 1;
  for (let i = 0; i < ctrls.length; i++) for (let j = i + 1; j < ctrls.length; j++) {
    const a = ctrls[i], b = ctrls[j];
    if (a.layer !== b.layer || a.e.contains(b.e) || b.e.contains(a.e)) continue;
    // A button that sits inside a field on purpose (show password, paste, clear).
    if ((isField(a.e) && inside(b.r, a.r)) || (isField(b.e) && inside(a.r, b.r))) continue;
    let worst = null;
    a.rs.forEach(ra => b.rs.forEach(rb => { const x = inter(ra, rb); if (x.w > 3 && x.h > 3 && (!worst || x.w * x.h > worst.w * worst.h)) worst = x; }));
    if (worst) out.push({ type: 'control-overlap', el: lab(a.e), other: lab(b.e), detail: Math.round(worst.w) + '×' + Math.round(worst.h) });
  }

  // 4. text cut off by its own box (no ellipsis, no line clamp on purpose)
  document.querySelectorAll('body *').forEach(e => {
    if (skip(e) || !shown(e)) return;
    if (![...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) return;
    if (e.clientWidth <= 2 || e.clientHeight <= 2) return;   // screen-reader-only text, hidden on purpose
    const s = cs(e);
    const clipX = s.overflowX === 'hidden' || s.overflowX === 'clip';
    const clipY = s.overflowY === 'hidden' || s.overflowY === 'clip';
    const clamp = s.webkitLineClamp && s.webkitLineClamp !== 'none';
    if (clipX && s.textOverflow !== 'ellipsis' && e.scrollWidth > e.clientWidth + 2) out.push({ type: 'text-clipped-x', el: lab(e), detail: e.scrollWidth + ' > ' + e.clientWidth });
    if (clipY && !clamp && e.scrollHeight > e.clientHeight + 3 && e.clientHeight > 0) out.push({ type: 'text-clipped-y', el: lab(e), detail: e.scrollHeight + ' > ' + e.clientHeight });
  });

  // 5. things poking out of the screen sideways (not inside a sideways scroller)
  document.querySelectorAll('body *').forEach(e => {
    if (skip(e) || !shown(e)) return;
    const b = e.getBoundingClientRect();
    if (b.width < 2 || b.height < 2) return;
    if (b.right <= vw + 1 && b.left >= -1) return;
    const c = clipOf(e);
    if (c.r <= vw + 1 && c.l >= -1) return;   // clipped by a scroller or an overflow box
    if (e.parentElement && (e.parentElement.getBoundingClientRect().right > vw + 1 || e.parentElement.getBoundingClientRect().left < -1)) return;  // report the outermost only
    out.push({ type: 'escapes-screen', el: lab(e), detail: 'left ' + Math.round(b.left) + ', right ' + Math.round(b.right) + ' on ' + vw });
  });

  // 6. tiny tap targets in the app
  if (isApp) ctrls.forEach(o => {
    const b = o.e.getBoundingClientRect();
    if (o.e.closest('p, li > span, .ui-row-sub')) return;   // inline text links
    if ((b.width < 28 || b.height < 28) && b.width > 0) out.push({ type: 'small-target', el: lab(o.e), detail: Math.round(b.width) + '×' + Math.round(b.height) });
  });

  // 8. buttons side by side that don't match: different heights or tops in one row
  const parents = new Set(ctrls.filter(o => /^(BUTTON|A)$/.test(o.e.tagName) && o.e.classList.contains('btn')).map(o => o.e.parentElement));
  parents.forEach(p => {
    if (!p || skip(p)) return;
    const kids = [...p.children].filter(k => /^(BUTTON|A)$/.test(k.tagName) && k.classList.contains('btn') && shown(k)).map(k => ({ k, r: k.getBoundingClientRect() })).filter(o => o.r.width > 0);
    for (let i = 0; i < kids.length; i++) for (let j = i + 1; j < kids.length; j++) {
      const a = kids[i].r, b = kids[j].r;
      const sameRow = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 4;
      if (!sameRow) continue;
      if (Math.abs(a.height - b.height) > 2 || Math.abs(a.top - b.top) > 2) out.push({ type: 'row-mismatch', el: lab(kids[i].k), other: lab(kids[j].k), detail: 'h ' + Math.round(a.height) + ' vs ' + Math.round(b.height) + ', top ' + Math.round(a.top) + ' vs ' + Math.round(b.top) });
    }
  });

  // 9. controls poking out of the card they sit in
  ctrls.forEach(o => {
    const box = o.e.parentElement && o.e.parentElement.closest('.card, .ui-hero, .ui-list, .ui-card, .template-card, .ui-sheet, .s-plan, .jn-card');
    if (!box || !shown(box)) return;
    const b = o.e.getBoundingClientRect(), c = box.getBoundingClientRect();
    if (b.width < 2) return;
    if (b.right > c.right + 1 || b.left < c.left - 1) {
      const sc = clipOf(o.e);
      if (sc.r <= c.right + 1 && sc.l >= c.left - 1) return;   // inside a scroller in the card
      out.push({ type: 'escapes-card', el: lab(o.e), other: lab(box), detail: 'control ' + Math.round(b.left) + '-' + Math.round(b.right) + ', card ' + Math.round(c.left) + '-' + Math.round(c.right) });
    }
  });

  // 7. text that can't be read: contrast against the first solid background behind it
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = (c) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
  const bgOf = (e) => { for (let n = e; n && n.nodeType === 1; n = n.parentElement) { const s = cs(n); if (s.backgroundImage && s.backgroundImage !== 'none') return null; const c = parse(s.backgroundColor); if (c && c.a > 0.9) return c; } return parse(getComputedStyle(document.body).backgroundColor); };
  const lowSeen = new Set();
  texts.forEach(t => {
    if (lowSeen.has(t.p)) return; lowSeen.add(t.p);
    const s = cs(t.p); const fg = parse(s.color); const bg = bgOf(t.p);
    if (!fg || !bg) return;
    const mix = { r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a) };
    const L1 = lum(mix), L2 = lum(bg); const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < 2.6 && !t.p.closest('[disabled], .is-disabled, [aria-disabled=true]') && !t.p.closest('input::placeholder')) out.push({ type: 'low-contrast', el: lab(t.p), detail: ratio.toFixed(2) + ':1' });
  });
  return out;
}

const all = {};
let total = 0, failed = 0;
for (const s of run) {
  const app = (s.mode || 'app') === 'app';
  const ctx = await browser.newContext(app
    ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
    : { viewport: { width: s.w || 1440, height: s.h || 900 }, deviceScaleFactor: 1, isMobile: (s.w || 1440) < 600, hasTouch: (s.w || 1440) < 600 });
  await ctx.route(LIVE_URL, (route) => { liveRefused++; return route.abort('blockedbyclient'); });
  await ctx.routeWebSocket(LIVE_URL, (ws) => { liveRefused++; ws.close(); });
  await ctx.addInitScript(([theme, native]) => {
    if (native) {
      const add = () => { if (!document.documentElement) return false; document.documentElement.classList.add('native', 'native-ios'); return true; };
      if (!add()) { const mo = new MutationObserver(() => { if (add()) mo.disconnect(); }); mo.observe(document, { childList: true }); }
    }
    try {
      localStorage.setItem('powa-consent', 'essential'); localStorage.setItem('powa-theme', theme);
      ['athlete', 'coach'].forEach((k) => localStorage.setItem('powa-tour-' + k + '-done', '1'));
    } catch (e) {}
    document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = '.demo-banner,.demo-pill,[class*="demo-banner"]{display:none!important}*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}';
      document.head.appendChild(st);
    });
  }, [s.theme || 'dark', app]);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  if (app) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, topMax: 59, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } }).catch(() => {});
  }
  try {
    await page.goto(BASE + s.page, { timeout: 60000 });
    await page.waitForTimeout(2400);
    if (s.eval) { await page.evaluate(s.eval); await page.waitForTimeout(1200); }
    await page.evaluate(async () => { const m = document.querySelector('.dash-main'); const sc = document.scrollingElement; for (let y = 0; y < 9000; y += 500) { sc.scrollTo(0, y); if (m) m.scrollTo(0, y); await new Promise(r => setTimeout(r, 40)); } sc.scrollTo(0, 0); if (m) m.scrollTo(0, 0); });
    await page.waitForTimeout(500);
    const issues = await page.evaluate(scan, app);
    if (errs.length) issues.push({ type: 'page-error', detail: errs.join(' | ').slice(0, 300) });
    all[s.name] = issues;
    total += issues.length;
    const counts = {};
    issues.forEach(i => { counts[i.type] = (counts[i.type] || 0) + 1; });
    console.log(s.name.padEnd(28), issues.length ? JSON.stringify(counts) : 'clean');
    if (issues.length) await page.screenshot({ path: `${outDir}/${s.name}.png` });
  } catch (e) {
    // A screen that throws was never scanned: it counts as a finding, so "0 findings" means every screen was looked at.
    console.log('FAILED', s.name, String(e).slice(0, 200));
    all[s.name] = [{ type: 'failed', detail: String(e).slice(0, 300) }];
    total++; failed++;
  }
  await ctx.close();
}
fs.writeFileSync(outDir + '/issues.json', JSON.stringify(all, null, 1));
console.log('\n' + run.length + ' screens, ' + total + ' findings' + (failed ? ' (' + failed + ' of them screens that failed to load)' : '') + '. '
  + liveRefused + ' calls to Supabase / Plausible refused on this machine. Details: ' + outDir + '/issues.json');
await browser.close();
