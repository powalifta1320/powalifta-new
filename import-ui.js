/* =====================================================================
   import-ui.js — the import intake's screens (2026-10-28)
   One sheet a coach brings their coaching in through: any file (paste, CSV, TSV, TXT, .xlsx, .ods,
   .zip, .json; PDFs and photos go to Program from a photo), then the step it needs:
     a workbook or a zip       → Which tab?
     a client list             → seats left on the plan, pick who to invite → invites (and emails)
     a lifter's history        → whose (a coach's import) → the columns it couldn't place, with a
                                 preview of every set (counts, PRs, rows left out and why) → import
     a program                 → program-photo.js's "Check the program" grid, every cell checked
   A lifter imports their own history the same way (self: no roster, weigh-ins kept).
   Reading is import-core.js; sets, keys and the write are switch-kit.js (planHistoryRows, writeLogs);
   the guides are import-guides.js. Loaded by SwitchKit.openIntake on first use, never at page boot.
   ?demo=1: built-in sample files run the whole flow, preview included; nothing is written anywhere
   (the Store only, like every demo write).
   ===================================================================== */
var ImportUI = (function () {
  'use strict';
  var IC = function () { return window.ImportCore; };
  var SK = function () { return window.SwitchKit; };
  var MB = 1024 * 1024, MAX_TEXT = 8 * MB, MAX_BOOK = 30 * MB, MAX_ZIP = 40 * MB, MAX_JSON = 20 * MB;
  var BIG = 3000;          // rows: past this a plan runs a chunk at a time, with a progress line
  var PHOTO_MAX = 8;       // files read in a row by Program from a photo

  var IC_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>';
  var IC_X = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
  var IC_FILE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6M9.5 14.5L12 17l2.5-2.5"/></svg>';
  var IC_TAB = { log: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 18h16M4 6v12"/><path d="M7 15l4-4 3 2 5-6"/></svg>',
    roster: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="8.5" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0 1 11 0"/><path d="M16 5.6a3 3 0 0 1 0 5.8M17.5 14.2A5.5 5.5 0 0 1 20.5 19"/></svg>',
    program: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M3.5 9.5h17M9.5 4v16"/></svg>',
    unknown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="2.5"/><path d="M9.8 9.6a2.3 2.3 0 0 1 4.4.9c0 1.6-2.2 1.9-2.2 3.3M12 16.6h.01"/></svg>' };
  var IC_CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';

  // ---------------------------------------------------------------- small helpers
  function me() { return (typeof getCurrentUser === 'function' && getCurrentUser()) || window._user || null; }
  function isDemo() { return !!window._demoMode; }
  function isDeskNow() { return typeof isDesk === 'function' ? isDesk() : document.documentElement.classList.contains('desk'); }
  function nf(n) { try { return Number(n).toLocaleString(); } catch (e) { return String(n); } }
  function plural(n, one, many) { return nf(n) + ' ' + (n === 1 ? one : (many || one + 's')); }
  function firstOf(name) { return String(name || '').trim().split(/\s+/)[0] || ''; }
  function today() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function dshort(iso) { try { return typeof fmtDate === 'function' ? fmtDate(iso) : iso; } catch (e) { return iso; } }
  function dnum(iso) { try { return typeof fmtDateShort === 'function' ? fmtDateShort(iso) : iso; } catch (e) { return iso; } }
  function unitNow() { return typeof getUnit === 'function' && getUnit() === 'lbs' ? 'lb' : 'kg'; }
  function wtxt(kg) {
    var u = typeof unitLabel === 'function' ? unitLabel() : 'kg';
    var v = typeof kgToDisplay === 'function' ? kgToDisplay(kg) : kg;
    return (Math.round(v * 10) / 10) + ' ' + (u === 'lbs' ? 'lb' : u);
  }
  function rosterList() {
    var u = me();
    return ((Store.get().athletes) || []).filter(function (a) { return u && a.coachId === u.id; })
      .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || '')); });
  }
  function athleteById(id) { return ((Store.get().athletes) || []).find(function (a) { return a.id === id; }) || null; }
  function liftLabel(l) { return { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' }[l] || ''; }
  function setLabel(l) {
    var nm = liftLabel(l.lift) ? ((l.variant && l.variant !== 'Competition' ? l.variant + ' ' : '') + liftLabel(l.lift).toLowerCase()) : (l.exerciseName || 'Exercise');
    return nm.charAt(0).toUpperCase() + nm.slice(1);
  }
  function errorOf(e) { return Object.assign(new Error(e), { user: true }); }
  function canSeePlans() {
    var native = document.documentElement.classList.contains('native');
    return typeof openUpgradeModal === 'function' && (!native || !!window._iapReady);
  }
  function copyText(t) {
    if (window.ImportGuides && ImportGuides.copy) return ImportGuides.copy(t);
    try { return navigator.clipboard.writeText(t); } catch (e) { return Promise.reject(e); }
  }
  function inviteUrl(code) { return typeof _inviteUrl === 'function' ? _inviteUrl(code) : 'https://www.powalifta.com/j/' + code; }
  function newCode(taken) {
    for (var i = 0; i < 20; i++) {
      var c = typeof generateInviteCode === 'function' ? generateInviteCode() : Math.random().toString(36).slice(2, 8).toUpperCase();
      if (!taken[c]) { taken[c] = 1; return c; }
    }
    return null;
  }
  // The coach's own column choices, per file shape: CoachSettings (coach_settings, this device until the
  // migration runs); a lifter's on this device.
  function rememberedMaps() {
    var u = me();
    if (u && u.userType === 'coach' && window.CoachSettings) return CoachSettings.get('importMaps') || {};
    try { return JSON.parse(localStorage.getItem('powa-import-maps-' + (u ? u.id : '')) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveMaps(maps) {
    var u = me();
    if (u && u.userType === 'coach' && window.CoachSettings) { try { CoachSettings.set('importMaps', maps); } catch (e) { /* the next file asks again */ } return; }
    try { localStorage.setItem('powa-import-maps-' + (u ? u.id : ''), JSON.stringify(maps)); } catch (e) { /* private mode: the next file asks again */ }
  }

  // ---------------------------------------------------------------- the words for fields
  var LOG_OPTS = [['date', 'Date'], ['ex', 'Exercise'], ['weight', 'Weight'], ['reps', 'Reps'], ['rpe', 'RPE'], ['rir', 'Reps in reserve (RIR)'], ['sets', 'Sets'],
    ['text', 'Set written out (140x5 @8)'], ['note', 'Notes'], ['athlete', 'Lifter'], ['variant', 'Variation'], ['order', 'Set number'], ['type', 'Set type (warm-up…)'],
    ['unitCol', 'Unit (kg or lb)'], ['pct', '% of max'], ['tWeight', 'Planned weight'], ['tReps', 'Planned reps'], ['tRpe', 'Planned RPE'], ['tSets', 'Planned sets'],
    ['tText', 'Plan written out (3x5 @8)'], ['bw', 'Bodyweight'], ['tempo', 'Tempo'], ['pause', 'Pause'], ['acc', 'Bands or chains'], ['session', 'Session name'],
    ['dist', 'Distance'], ['secs', 'Time'], ['e1rm', 'Estimated max']];
  var ROSTER_OPTS = [['fullName', 'Name'], ['first', 'First name'], ['last', 'Last name'], ['email', 'Email'], ['group', 'Group or team'], ['status', 'Status']];
  var KNOWN_ROSTER = { phone: 'Phone', sex: 'Sex', birthday: 'Birthday', bodyweight: 'Bodyweight', height: 'Height', unitPref: 'Units', startDate: 'Start date', coach: 'Coach', archiveDate: 'Archived on' };
  function fieldWord(f, roster) {
    var list = roster ? ROSTER_OPTS : LOG_OPTS;
    for (var i = 0; i < list.length; i++) if (list[i][0] === f) return list[i][1];
    if (roster && KNOWN_ROSTER[f]) return KNOWN_ROSTER[f];
    return f === 'wide' ? 'Sets across' : '';
  }
  function recognisedLine(rec, roster) {
    if (!rec) return '';
    if (rec.id === 'hevy-api') return 'Read as Hevy workouts';
    if (rec.sure === 'fields') return 'Looks like a ' + rec.label + (rec.id === 'trainheroic' ? ' athlete list' : ' client list');
    return roster ? 'Read as a ' + rec.label + ' client list' : 'Read as a ' + rec.label + ' export';
  }

  // ---------------------------------------------------------------- CSS
  var CSS = [
    /* the sheet: a head, a scrolling body, a foot that stays */
    '.ui-sheet.ui-sheet-form.im-sheet{display:flex;flex-direction:column;padding:0;overflow:hidden;max-height:calc(100dvh - 16px)}',
    '.ui-sheet.ui-sheet-form.im-sheet.is-tall{height:calc(100dvh - 16px)}',
    '.im-sheet{--im-fill-1:rgba(255,255,255,.035);--im-fill-2:rgba(255,255,255,.06);--im-fill-3:rgba(255,255,255,.09);--im-fill-4:rgba(255,255,255,.14);--im-ok:#34d982;--im-warn:#ffb35c;--im-alert:#ff8f80;--im-ease:cubic-bezier(.23,1,.32,1)}',
    '[data-theme="light"] .im-sheet{--im-fill-1:rgba(11,11,13,.035);--im-fill-2:rgba(11,11,13,.055);--im-fill-3:rgba(11,11,13,.08);--im-fill-4:rgba(11,11,13,.13);--im-ok:#12804a;--im-warn:#a85a00;--im-alert:#c43a2f}',
    '.im-sheet .ui-sheet-grip{flex:none}',
    '.im-sheet [hidden]{display:none!important}',
    '.im-sheet label,.im-sheet label span,.im-sheet label b{text-transform:none;letter-spacing:normal}',
    '.im-sheet label.im-person{margin:0;font-size:inherit;font-weight:inherit;color:inherit}',
    '.im-head{flex:none;display:flex;align-items:flex-start;gap:10px;padding:4px 16px 12px}',
    '.im-titles{flex:1;min-width:0}',
    '.ui-sheet-form .im-h{margin:6px 0 0;text-wrap:balance}',
    '.im-h:focus{outline:none}',
    '.ui-sheet-form .im-sub{margin:6px 0 0;font-size:15px;line-height:1.4;color:var(--text-3);text-wrap:pretty}',
    '.im-sub[hidden]{display:none}',
    '.im-icon{display:grid;place-items:center;width:36px;height:36px;flex:none;margin-top:2px;padding:0;border:0;border-radius:50%;background:var(--im-fill-3);color:var(--text-2);cursor:pointer;transition:background-color 150ms ease-out,transform 150ms ease-out}',
    '.im-icon svg{width:16px;height:16px}',
    '.im-icon:active{transform:scale(.94)}',
    '.im-icon[hidden]{display:none}',
    '.im-icon:focus-visible{outline:2px solid var(--text);outline-offset:2px}',
    '@media (hover:hover) and (pointer:fine){.im-icon:hover{background:var(--im-fill-4);color:var(--text)}}',
    '.im-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:2px 16px 20px}',
    '.im-foot{flex:none;display:flex;flex-direction:column;gap:10px;padding:12px 16px calc(14px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--bg-1)}',
    '.im-foot[hidden]{display:none}',
    '.im-foot .btn{width:100%;min-height:52px;margin:0;justify-content:center}',
    '.im-foot .im-foot-row{display:flex;gap:10px}.im-foot .im-foot-row .btn{flex:1}',
    '.im-step{animation:imIn 220ms var(--im-ease) both}',
    '.im-step.is-back{animation-name:imBack}',
    '@keyframes imIn{from{opacity:.45;transform:translateX(14px)}to{opacity:1;transform:none}}',
    '@keyframes imBack{from{opacity:.45;transform:translateX(-14px)}to{opacity:1;transform:none}}',
    '@media (prefers-reduced-motion:reduce){.im-step,.im-step.is-back{animation:imFade 160ms ease-out both}@keyframes imFade{from{opacity:.45}to{opacity:1}}}',
    '.im-sec{margin-top:22px}',
    '.im-sec:first-child{margin-top:4px}',
    '.im-label{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin:0 2px 10px;font-size:17px;font-weight:700;color:var(--text);letter-spacing:-.01em}',
    '.im-label button{padding:0;border:0;background:none;color:var(--text-2);font:inherit;font-size:15px;font-weight:600;cursor:pointer;min-height:32px}',
    '.im-quiet{display:inline-flex;align-items:center;min-height:44px;padding:0 2px;border:0;background:none;color:var(--text-2);font:inherit;font-size:15px;font-weight:600;cursor:pointer;text-decoration:underline;text-decoration-thickness:1px;text-underline-offset:3px}',
    '@media (hover:hover) and (pointer:fine){.im-quiet:hover,.im-label button:hover{color:var(--text)}}',
    '.im-note{margin:10px 2px 0;font-size:14px;line-height:1.5;color:var(--text-3);text-wrap:pretty}',
    '.im-note b{color:var(--text-2);font-weight:600}',
    '.im-alert{margin:10px 0 0;padding:12px 14px;border-radius:14px;background:color-mix(in srgb,var(--im-warn) 13%,transparent);color:var(--text);font-size:15px;line-height:1.45}',
    '.im-alert.is-bad{background:color-mix(in srgb,var(--im-alert) 14%,transparent)}',
    '.im-alert p{margin:0}.im-alert p+p{margin-top:6px}',
    /* the drop zone */
    '.im-drop{display:flex;flex-direction:column;align-items:center;gap:6px;padding:26px 18px 20px;border-radius:var(--u-r,20px);background:var(--im-fill-2);box-shadow:inset 0 0 0 1px var(--line);text-align:center;transition:background-color 160ms ease-out,box-shadow 160ms ease-out}',
    '.im-drop.is-over{background:var(--im-fill-3);box-shadow:inset 0 0 0 2px var(--text-2)}',
    '.im-drop-ic{display:grid;place-items:center;width:52px;height:52px;margin-bottom:6px;border-radius:16px;background:var(--im-fill-3);color:var(--text)}',
    '.im-drop-ic svg{width:26px;height:26px}',
    '.im-drop b{font-size:18px;font-weight:700;color:var(--text);letter-spacing:-.01em}',
    '.im-drop span{max-width:34ch;font-size:14px;line-height:1.45;color:var(--text-3);text-wrap:pretty}',
    '.im-drop .btn{margin-top:12px;min-height:48px;padding:0 26px}',
    '.im-paste{display:flex;flex-direction:column;gap:10px;margin-top:12px}',
    '.im-sheet textarea.im-paste-box{width:100%;min-height:120px;margin:0;padding:12px 14px;border:1px solid var(--line);border-radius:14px;background:var(--im-fill-1);color:var(--text);font:500 15px/1.4 var(--font-num,inherit);font-variant-numeric:tabular-nums;white-space:pre;overflow:auto;resize:vertical}',
    '.im-sheet textarea.im-paste-box:focus{outline:2px solid var(--text-2);outline-offset:1px}',
    '.im-chips{display:flex;flex-wrap:wrap;gap:8px}',
    '.im-chip{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border:0;border-radius:999px;background:var(--im-fill-3);color:var(--text);font:inherit;font-size:14px;font-weight:600;cursor:pointer;transition:background-color 150ms ease-out,transform 150ms ease-out}',
    '.im-chip:active{transform:scale(.97)}',
    '.im-chip.on{background:var(--text);color:var(--bg,#0b0b0c)}',
    '.im-chip small{font-size:13px;font-weight:600;opacity:.7;font-variant-numeric:tabular-nums}',
    '.im-chip:focus-visible{outline:2px solid var(--text);outline-offset:2px}',
    '@media (hover:hover) and (pointer:fine){.im-chip:not(.on):hover{background:var(--im-fill-4)}}',
    /* reading */
    '.im-reading{display:flex;flex-direction:column;gap:14px;padding:22px 2px 8px}',
    '.im-reading b{font-size:17px;font-weight:650;color:var(--text);overflow-wrap:anywhere}',
    '.im-reading p{margin:0;font-size:15px;color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.im-bar{height:4px;border-radius:2px;overflow:hidden;background:var(--im-fill-3)}',
    '.im-bar i{display:block;height:100%;border-radius:inherit;background:var(--text);width:38%;animation:imSlide 1.15s var(--im-ease) infinite}',
    '.im-bar.is-det i{animation:none;transition:width 200ms ease-out}',
    '@keyframes imSlide{from{transform:translateX(-105%)}to{transform:translateX(270%)}}',
    '@media (prefers-reduced-motion:reduce){.im-bar i{animation:none;width:100%;opacity:.5}}',
    /* rows: tabs, lifters, columns, people */
    '.im-sheet .ui-list{margin:0}',
    '.im-lead{display:grid;place-items:center;width:36px;height:36px;flex:none;border-radius:11px;background:var(--im-fill-3);color:var(--text)}',
    '.im-lead svg{width:19px;height:19px}',
    '.im-cols{border-radius:var(--u-r,20px);background:var(--bg-1);border:1px solid var(--line);overflow:hidden}',
    '.im-col{display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 14px 10px 16px;border-top:1px solid var(--line)}',
    '.im-col:first-child{border-top:0}',
    '.im-col-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.im-col-main b{font-size:16px;font-weight:650;color:var(--text);overflow-wrap:anywhere;line-height:1.3}',
    '.im-col-main span{font-size:13px;color:var(--text-3);line-height:1.4;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.im-col-main .im-guess{color:var(--im-warn);white-space:normal}',
    '.im-col.is-missing .im-col-main b{color:var(--text)}',
    '.im-sheet select.im-select{flex:0 0 auto;width:min(48%,210px);min-height:44px;margin:0;padding:0 34px 0 12px;border:0;border-radius:12px;background-color:var(--im-fill-3);color:var(--text);font:600 16px/1.2 var(--font-body,inherit);-webkit-appearance:none;appearance:none;cursor:pointer;background-image:url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 24 24%27 fill=%27none%27 stroke=%27%23999%27 stroke-width=%272.4%27 stroke-linecap=%27round%27 stroke-linejoin=%27round%27%3E%3Cpath d=%27M7 10l5 5 5-5%27/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 10px center;background-size:16px}',
    '.im-sheet select.im-select.is-off{color:var(--text-3);font-weight:500}',
    '.im-sheet select.im-select:focus-visible{outline:2px solid var(--text);outline-offset:1px}',
    '.im-matched{display:flex;align-items:center;gap:12px;min-height:60px;padding:10px 16px}',
    '.im-matched .im-tick{display:grid;place-items:center;width:28px;height:28px;flex:none;border-radius:50%;background:color-mix(in srgb,var(--im-ok) 18%,transparent);color:var(--im-ok)}',
    '.im-matched .im-tick svg{width:15px;height:15px}',
    '.im-rec{display:flex;align-items:center;gap:8px;margin:0 2px 12px;font-size:14px;font-weight:600;color:var(--text-2)}',
    '.im-rec i{width:7px;height:7px;border-radius:50%;background:var(--im-ok);flex:none}',
    '.im-opts{display:grid;gap:10px}',
    '.im-opt{display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:15px;color:var(--text-2)}',
    '.im-opt > span{flex:1;min-width:0}',
    '.im-opt .ui-seg{flex:0 0 auto;min-width:190px}',
    '.im-opt .ui-seg button{min-height:36px;font-size:14px;padding:0 10px}',
    '.im-opt-hint{margin:-4px 2px 0;font-size:13px;color:var(--text-3)}',
    /* the preview */
    '.im-big{display:flex;align-items:baseline;flex-wrap:wrap;gap:4px 12px}',
    '.im-big b{font-family:var(--font-num,inherit);font-stretch:var(--num-stretch,100%);font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:var(--text);font-variant-numeric:tabular-nums}',
    '.im-big span{font-size:16px;font-weight:600;color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.im-range{margin-top:6px;font-size:15px;color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.im-meta{margin-top:4px;font-size:14px;color:var(--text-3);line-height:1.45}',
    '.im-sets{margin-top:14px;border-radius:var(--u-r,20px);background:var(--bg-1);border:1px solid var(--line);overflow:hidden}',
    '.im-set{display:flex;align-items:center;gap:12px;min-height:48px;padding:8px 16px;border-top:1px solid var(--line);font-size:15px}',
    '.im-set:first-child{border-top:0}',
    '.im-set .d{flex:0 0 64px;color:var(--text-3);font-size:14px;font-variant-numeric:tabular-nums}',
    '.im-set .n{flex:1;min-width:0;color:var(--text);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.im-set .w{flex:none;color:var(--text);font-variant-numeric:tabular-nums;font-weight:600}',
    '.im-set .w small{color:var(--text-3);font-weight:500}',
    '.im-set .dot{width:8px;height:8px;border-radius:50%;flex:none;background:var(--lc,var(--text-4,#808089))}',
    '.im-set .dot.l-squat{--lc:#38c6ff}.im-set .dot.l-bench{--lc:#a98bff}.im-set .dot.l-deadlift{--lc:#ffbf3c}',
    '.im-pr{font-size:13px;font-weight:650;color:var(--pr,#f2c25b);white-space:nowrap}',
    '.im-skip{margin-top:14px;border-radius:14px;background:var(--im-fill-1)}',
    '.im-skip summary{display:flex;align-items:center;justify-content:space-between;gap:10px;min-height:48px;padding:0 14px;font-size:15px;font-weight:600;color:var(--text-2);cursor:pointer;list-style:none}',
    '.im-skip summary::-webkit-details-marker{display:none}',
    '.im-skip summary::after{content:"";width:8px;height:8px;border-right:2px solid var(--text-3);border-bottom:2px solid var(--text-3);transform:rotate(45deg) translateY(-2px);transition:transform 160ms ease-out}',
    '.im-skip[open] summary::after{transform:rotate(225deg) translateY(-2px)}',
    '.im-skip-list{display:grid;gap:10px;padding:0 14px 14px}',
    '.im-skip-row{display:flex;justify-content:space-between;gap:10px;font-size:14px;color:var(--text-2)}',
    '.im-skip-row b{font-weight:600;color:var(--text)}',
    '.im-skip-eg{display:block;margin-top:2px;font-size:13px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    /* the client list */
    '.im-seats{display:flex;align-items:center;gap:16px;padding:16px 18px;border-radius:var(--u-r,20px);background:var(--bg-1);border:1px solid var(--line)}',
    '.im-seats-n{display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:64px}',
    '.im-seats-n b{font-family:var(--font-num,inherit);font-stretch:var(--num-stretch,100%);font-size:40px;line-height:1;font-weight:800;color:var(--text);font-variant-numeric:tabular-nums;letter-spacing:-.02em}',
    '.im-seats-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}',
    '.im-seats-main b{font-size:17px;font-weight:700;color:var(--text)}',
    '.im-seats-main span{font-size:14px;line-height:1.4;color:var(--text-3)}',
    '.im-seatbar{display:flex;gap:3px;height:6px;margin-top:2px}',
    '.im-seatbar i{flex:1;border-radius:3px;background:var(--im-fill-4)}',
    '.im-seatbar i.is-used{background:var(--text-3)}',
    '.im-seatbar i.is-pick{background:var(--im-ok)}',
    '.im-seats.is-full .im-seats-n b{color:var(--im-alert)}',
    '.im-pickline{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 2px 10px;font-size:15px;color:var(--text-2);font-variant-numeric:tabular-nums}',
    '.im-pickline b{color:var(--text);font-weight:700}',
    '.im-people{border-radius:var(--u-r,20px);background:var(--bg-1);border:1px solid var(--line);overflow:hidden}',
    '.im-person{position:relative;display:flex;align-items:center;gap:12px;min-height:62px;padding:9px 14px;border-top:1px solid var(--line);cursor:pointer;-webkit-tap-highlight-color:transparent}',
    '.im-person:first-child{border-top:0}',
    '.im-person.is-off{cursor:default}',
    '.im-person input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}',
    '.im-box{display:grid;place-items:center;width:24px;height:24px;flex:none;border-radius:8px;box-shadow:inset 0 0 0 2px var(--line-2,#34343d);color:transparent;transition:background-color 140ms ease-out,box-shadow 140ms ease-out,color 140ms ease-out}',
    '.im-box svg{width:15px;height:15px}',
    '.im-person input:checked + .im-box{background:var(--im-ok);box-shadow:none;color:#06150d}',
    '.im-person input:focus-visible + .im-box{outline:2px solid var(--text);outline-offset:2px}',
    '.im-person.is-off .im-box{opacity:.35}',
    '.im-person .ui-av{width:36px;height:36px;flex:none;font-size:13px}',
    '.im-person-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}',
    '.im-person-main b{font-size:16px;font-weight:650;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.im-person-main span{font-size:13px;color:var(--text-3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.im-person.is-off .im-person-main b{color:var(--text-2)}',
    '.im-state{flex:none;font-size:13px;font-weight:600;color:var(--text-3);white-space:nowrap}',
    '.im-state.is-warn{color:var(--im-warn)}',
    '.im-switchrow{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:var(--u-r,20px);background:var(--bg-1);border:1px solid var(--line)}',
    '.im-switchrow .im-col-main span{white-space:normal}',
    '.im-wall{display:flex;align-items:center;justify-content:space-between;gap:12px}',
    '.im-wall .btn{flex:none;min-height:40px;padding:0 16px}',
    /* done */
    '.im-done{display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px 4px 6px;text-align:center}',
    '.im-done-ic{display:grid;place-items:center;width:56px;height:56px;border-radius:50%;background:color-mix(in srgb,var(--im-ok) 18%,transparent);color:var(--im-ok);margin-bottom:6px;animation:imPop 320ms var(--im-ease) both}',
    '.im-done-ic svg{width:28px;height:28px}',
    '@keyframes imPop{from{transform:scale(.7);opacity:.45}to{transform:none;opacity:1}}',
    '@media (prefers-reduced-motion:reduce){.im-done-ic{animation:none}}',
    '.im-done b{font-family:var(--font-num,inherit);font-stretch:var(--num-stretch,100%);font-size:34px;line-height:1.05;font-weight:800;letter-spacing:-.02em;color:var(--text);font-variant-numeric:tabular-nums}',
    '.im-done p{margin:0;max-width:40ch;font-size:15px;line-height:1.45;color:var(--text-2);text-wrap:pretty}',
    '.im-links .im-person{cursor:default}',
    '.im-links .btn{flex:none;min-height:36px;padding:0 14px;font-size:14px}',
    '.im-empty{padding:16px 4px 4px;text-align:center}',
    '.im-empty p{margin:0 auto 14px;max-width:38ch;font-size:15px;line-height:1.45;color:var(--text-2)}',
    '.im-empty .btn{min-height:46px}',
    '.im-msg{padding:14px 16px;border-radius:16px;background:var(--im-fill-2);font-size:15px;line-height:1.5;color:var(--text);white-space:pre-wrap;user-select:text;-webkit-user-select:text}',
    '.im-sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}',
    /* the laptop: a centred dialog, wider for the columns and the client list */
    'html.desk body.powa-app .ui-sheet.ui-sheet-form.im-sheet{width:min(560px,calc(100vw - 48px));max-height:min(860px,calc(100vh - 48px));padding:0}',
    'html.desk body.powa-app .ui-sheet.ui-sheet-form.im-sheet.is-wide{width:min(780px,calc(100vw - 48px))}',
    'html.desk body.powa-app .ui-sheet.ui-sheet-form.im-sheet.is-tall{height:min(860px,calc(100vh - 48px))}',
    'html.desk body.powa-app .im-sheet .ui-sheet-grip{display:none}',
    'html.desk body.powa-app .im-head{padding:var(--s-5,24px) var(--s-5,24px) var(--s-3,12px)}',
    'html.desk body.powa-app .im-sheet .im-h{margin:0;font-size:var(--fs-5,20px)}',
    'html.desk body.powa-app .im-sheet .im-sub{font-size:var(--fs-3,15px)}',
    'html.desk body.powa-app .im-icon{width:32px;height:32px;border-radius:var(--r-1,6px);background:var(--dk-fill,var(--im-fill-3))}',
    'html.desk body.powa-app .im-body{padding:0 var(--s-5,24px) var(--s-5,24px)}',
    'html.desk body.powa-app .im-foot{flex-direction:row;justify-content:flex-end;padding:var(--s-3,12px) var(--s-5,24px);background:transparent}',
    'html.desk body.powa-app .im-foot .btn{width:auto;min-height:40px;padding:0 20px}',
    'html.desk body.powa-app .im-foot .im-foot-row{flex-direction:row-reverse}',
    'html.desk body.powa-app .im-drop{padding:34px 24px 26px}',
    'html.desk body.powa-app .im-drop .btn{min-height:40px}',
    'html.desk body.powa-app .im-sheet select.im-select{min-height:36px;font-size:15px}',
    'html.desk body.powa-app .im-col{min-height:54px}',
    'html.desk body.powa-app .im-person{min-height:54px}',
    '@media (max-width:380px){.im-opt{flex-direction:column;align-items:stretch}.im-opt .ui-seg{min-width:0}.im-sheet select.im-select{width:46%}}'
  ].join('\n');
  function ensureCss() {
    if (document.getElementById('im-style')) return;
    var st = document.createElement('style'); st.id = 'im-style'; st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  // ---------------------------------------------------------------- the sheet
  // One sheet, a step at a time: the head (back, title, close), a body that scrolls, a foot whose one
  // red action stays put. On the phone a bottom sheet (drag it down to close), on the laptop a dialog.
  function shell(onClosed) {
    ensureCss();
    var veil = el('div', { class: 'ui-sheet-veil im-veil', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'im-title' });
    var sheet = el('div', { class: 'ui-sheet ui-sheet-form im-sheet' });
    var head = el('div', { class: 'im-head' });
    var back = el('button', { class: 'im-icon im-back', type: 'button', 'aria-label': 'Back', html: IC_BACK });
    back.hidden = true;
    var tt = el('div', { class: 'im-titles' });
    var h = el('h3', { class: 'ui-sheet-h im-h', id: 'im-title', tabindex: '-1' });
    var sub = el('p', { class: 'ui-sheet-sub im-sub' });
    tt.appendChild(h); tt.appendChild(sub);
    var x = el('button', { class: 'im-icon im-x', type: 'button', 'aria-label': 'Close', html: IC_X });
    head.appendChild(back); head.appendChild(tt); head.appendChild(x);
    var body = el('div', { class: 'im-body' });
    var foot = el('div', { class: 'im-foot' });
    foot.hidden = true;
    sheet.appendChild(el('div', { class: 'ui-sheet-grip', 'aria-hidden': 'true' }));
    sheet.appendChild(head); sheet.appendChild(body); sheet.appendChild(foot);
    veil.appendChild(sheet);
    var closed = false, guard = null, backFn = null, steps = 0;
    // → true when it closed. A guard can hold it open (an import still writing) or ask first.
    var close = function (force) {
      if (closed) return true;
      if (!force && guard) {
        var g = guard();
        if (g && g.block) { toast(g.block); return false; }
        if (g && g.ask) { uiActionSheet(g.ask, [{ label: g.yes || 'Close it', danger: true, onClick: function () { close(true); } }]); return false; }
      }
      closed = true;
      document.removeEventListener('keydown', onKey);
      veil.classList.add('leaving');
      setTimeout(function () { veil.remove(); if (onClosed) onClosed(); }, 200);
      return true;
    };
    var onKey = function (e) {
      if (e.key !== 'Escape' || !document.body.contains(veil)) return;
      if (document.querySelector('.ui-sheet-veil:not(.im-veil)')) return;   // a sheet on top handles its own Escape
      close();
    };
    back.addEventListener('click', function () { if (backFn) backFn(); });
    x.addEventListener('click', function () { close(); });
    veil.addEventListener('click', function (e) { if (e.target === veil) close(); });
    document.addEventListener('keydown', onKey);
    if (typeof _sheetSwallowEarlyClicks === 'function') _sheetSwallowEarlyClicks(veil);
    if (typeof _sheetDrag === 'function' && !isDeskNow()) {
      _sheetDrag(veil, sheet, function () {
        if (close()) return;
        sheet.style.transition = 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)'; sheet.style.transform = '';
        setTimeout(function () { sheet.style.transition = ''; }, 340);
      });
    }
    document.body.appendChild(veil);
    return {
      veil: veil, sheet: sheet, body: body, foot: foot,
      isClosed: function () { return closed; },
      close: close,
      guard: function (fn) { guard = fn || null; },
      // A step: { title, sub, back: fn | null, wide, tall, dir: 'fwd' | 'back' } → the step's container.
      step: function (o) {
        h.textContent = o.title || ''; sub.textContent = o.sub || ''; sub.hidden = !o.sub;
        veil.setAttribute('aria-label', o.title || 'Import');
        backFn = o.back || null; back.hidden = !backFn;
        sheet.classList.toggle('is-wide', !!o.wide);
        sheet.classList.toggle('is-tall', !!o.tall);
        body.innerHTML = ''; foot.innerHTML = ''; foot.hidden = true;
        body.scrollTop = 0;
        var inner = el('div', { class: 'im-step' + (steps++ && o.dir === 'back' ? ' is-back' : '') });
        body.appendChild(inner);
        if (steps > 1) { try { h.focus({ preventScroll: true }); } catch (e) { /* old WebKit */ } }
        return inner;
      },
      setFoot: function (nodes) { foot.innerHTML = ''; (nodes || []).filter(Boolean).forEach(function (n) { foot.appendChild(n); }); foot.hidden = !foot.children.length; }
    };
  }
  function btn(label, cls, onClick) { var b = el('button', { class: 'btn ' + (cls || 'ui-btn-soft'), type: 'button' }, label); if (onClick) b.addEventListener('click', onClick); return b; }
  function section(inner, label, action) {
    var s = el('div', { class: 'im-sec' });
    if (label) {
      var l = el('div', { class: 'im-label' }, el('span', {}, label));
      if (action) { var b = el('button', { type: 'button' }, action.label); b.addEventListener('click', action.onClick); l.appendChild(b); }
      s.appendChild(l);
    }
    inner.appendChild(s);
    return s;
  }

  // ================================================================= the intake
  // opts: { mode: 'hub' | 'history' | 'roster' | 'program', athleteId, self, files, sample }
  function open(opts) {
    opts = opts || {};
    var u = me();
    if (!u) return null;
    var coach = u.userType === 'coach';
    var st = {
      self: !!opts.self || !coach,
      mode: (!!opts.self || !coach) ? 'history' : (opts.mode || 'hub'),
      athleteId: (!!opts.self || !coach) ? u.id : (opts.athleteId || null),
      fromProgram: opts.mode === 'program', file: null, res: null, table: null, a: null, fields: null,
      fileName: null, opts: { unit: unitNow(), dateOrder: null, noRpe: 8 }, ext: null, extKey: null, plan: null,
      existing: null, existingBw: null, planning: 0
    };
    var ui = shell();
    var athlete = function () { return st.athleteId ? (st.self ? u : athleteById(st.athleteId)) : null; };
    var first = function () { var a = athlete(); return a ? firstOf(a.name) : ''; };

    // ---------------------------------------------------------------- 1. the intake
    var PDF_OK = function () { return !st.self && st.mode !== 'history' && st.mode !== 'roster' && !!window.PhotoImport; };
    function intake(dir) {
      var t = st.self ? ['Import your training history', 'From Strong, Hevy, FitNotes or your own spreadsheet. You see every set before it\'s saved.']
        : st.mode === 'history' && st.athleteId ? ['Import ' + first() + '\'s history', 'A training log, an app\'s export or a past block. You see every set before it\'s saved, and the same file twice adds nothing.']
        : st.mode === 'history' ? ['Import a lifter\'s history', 'A training log, an app\'s export or a past block. You see every set before it\'s saved.']
        : st.mode === 'roster' ? ['Import a client list', 'A CSV or spreadsheet of names and emails. You pick who gets an invite.']
        : st.mode === 'program' ? ['Bring a program in', 'A spreadsheet with weeks across, or a table of weeks, days and exercises.']
        : ['Bring your coaching in', 'Client lists, training history and programs, from a spreadsheet or another app.'];
      st.file = null; st.res = null; st.table = null; st.a = null; st.plan = null; st.ext = null; st.extKey = null; st.editing = false; st.backToTabs = null;
      var inner = ui.step({ title: t[0], sub: t[1], back: null, dir: dir });
      var input = el('input', { type: 'file', hidden: '', 'aria-label': 'Choose a file to import',
        accept: '.csv,.tsv,.txt,.xlsx,.xlsm,.ods,.zip,.json,.xls,.numbers,text/csv,text/tab-separated-values,text/plain,application/json,application/zip,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.oasis.opendocument.spreadsheet' + (PDF_OK() ? ',application/pdf,.pdf,image/*,.heic,.heif' : '') });
      if (PDF_OK()) input.setAttribute('multiple', '');
      input.addEventListener('change', function () { var fs = [].slice.call(input.files || []); input.value = ''; readFiles(fs); });
      var drop = el('div', { class: 'im-drop' });
      drop.appendChild(el('span', { class: 'im-drop-ic', html: IC_FILE }));
      drop.appendChild(el('b', {}, isDeskNow() ? 'Drop a file here' : st.mode === 'roster' ? 'A client list from anywhere' : 'A spreadsheet or an app\'s export'));
      drop.appendChild(el('span', {}, 'Excel or Google Sheets files, CSV' + (st.mode === 'roster' ? ' or OpenDocument' : ', OpenDocument, .zip or .json') + '.' + (PDF_OK() ? ' PDFs and photos of a program too.' : '')));
      var choose = btn('Choose a file', 'btn-primary', function () { input.click(); });
      drop.appendChild(choose);
      drop.appendChild(input);
      inner.appendChild(drop);
      // Paste: what Sheets and Excel copy (tab-separated), or a journal.
      var pasteBtn = el('button', { type: 'button', class: 'im-quiet' }, 'Paste cells instead');
      var paste = el('div', { class: 'im-paste', hidden: '' });
      var ta = el('textarea', { class: 'im-paste-box', rows: '6', spellcheck: 'false', wrap: 'off', 'aria-label': 'Paste cells from Google Sheets or Excel',
        placeholder: st.mode === 'roster' ? 'Name\tEmail\nMaya Chen\tmaya@example.com' : 'Date\tExercise\tWeight\tReps\tRPE\n2026-03-02\tSquat\t180\t5\t8\n\nor a journal:\n2 Mar 2026\nSquat 180x5 @8, 185x3 @9' });
      var readPaste = btn('Read the pasted cells', 'ui-btn-soft', function () { if (ta.value.trim()) fromText(ta.value, 'Pasted cells'); });
      ta.addEventListener('paste', function () { setTimeout(function () { if (ta.value.trim()) fromText(ta.value, 'Pasted cells'); }, 30); });
      paste.appendChild(ta); paste.appendChild(readPaste);
      pasteBtn.addEventListener('click', function () { paste.hidden = !paste.hidden; pasteBtn.hidden = !paste.hidden; if (!paste.hidden) { try { ta.focus(); } catch (e) { /* fine */ } } });
      var ps = el('div', { style: 'text-align:center;margin-top:6px' });
      ps.appendChild(pasteBtn);
      inner.appendChild(ps);
      inner.appendChild(paste);
      // The demo: the whole flow on built-in files.
      if (isDemo()) {
        var ids = st.self ? ['history'] : st.mode === 'roster' ? ['roster'] : st.mode === 'history' ? ['history', 'wide', 'workbook'] : st.mode === 'program' ? ['grid', 'workbook'] : ['roster', 'history', 'workbook', 'grid'];
        var words = { roster: 'A client list', history: 'A Strong export', wide: 'A log with sets across', workbook: 'A workbook with tabs', grid: 'A program grid' };
        var sec = section(inner, 'Try it with a sample');
        var chips = el('div', { class: 'im-chips' });
        ids.forEach(function (id) { chips.appendChild(el('button', { type: 'button', class: 'im-chip', onclick: function () { loadSample(id); } }, words[id])); });
        sec.appendChild(chips);
      }
      // Coming from another app: what to export there, and what happens here.
      if (!st.self && window.ImportGuides) {
        var gs = section(inner, 'Coming from another app?');
        var gc = el('div', { class: 'im-chips' });
        ImportGuides.LIST.forEach(function (g) { gc.appendChild(el('button', { type: 'button', class: 'im-chip', onclick: function () { ImportGuides.open(g.id, { onPick: function () { input.click(); } }); } }, g.name)); });
        gs.appendChild(gc);
      }
      // Drop anywhere on the sheet.
      var over = function (e) { if (e.dataTransfer && [].slice.call(e.dataTransfer.types || []).indexOf('Files') >= 0) { e.preventDefault(); drop.classList.add('is-over'); } };
      ui.sheet.ondragenter = over; ui.sheet.ondragover = over;
      ui.sheet.ondragleave = function (e) { if (!ui.sheet.contains(e.relatedTarget)) drop.classList.remove('is-over'); };
      ui.sheet.ondrop = function (e) { drop.classList.remove('is-over'); var fs = e.dataTransfer && e.dataTransfer.files; if (fs && fs.length) { e.preventDefault(); readFiles([].slice.call(fs)); } };
    }

    // ---------------------------------------------------------------- 2. reading
    function reading(name, line) {
      var inner = ui.step({ title: 'Reading your file', sub: '', back: null });
      var r = el('div', { class: 'im-reading', role: 'status', 'aria-live': 'polite' });
      r.appendChild(el('b', {}, name || 'Your file'));
      var bar = el('div', { class: 'im-bar', 'aria-hidden': 'true' }, el('i'));
      var p = el('p', {}, line || 'Nothing is saved until you say so.');
      r.appendChild(bar); r.appendChild(p);
      inner.appendChild(r);
      return { line: function (t) { p.textContent = t; }, part: function (done, total) { bar.classList.add('is-det'); bar.firstChild.style.width = Math.max(4, Math.round(done / Math.max(1, total) * 100)) + '%'; } };
    }
    function failed(msg, acts, title) {
      var inner = ui.step({ title: title || 'Couldn\'t bring that in', sub: '', back: function () { intake('back'); }, dir: 'fwd' });
      var box = el('div', { class: 'im-alert is-bad', role: 'alert' });
      (Array.isArray(msg) ? msg : [msg]).forEach(function (m) { box.appendChild(el('p', {}, m)); });
      inner.appendChild(box);
      ui.setFoot((acts || []).concat([btn('Choose another file', (acts && acts.length) ? 'ui-btn-soft' : 'btn-primary', function () { intake('back'); })]));
    }
    var isMedia = function (f) { return /^image\//.test(f.type || '') || f.type === 'application/pdf' || /\.(pdf|png|jpe?g|heic|heif|webp|gif)$/i.test(f.name || ''); };
    function readFiles(files) {
      files = (files || []).filter(Boolean);
      if (!files.length) return;
      var data = files.filter(function (f) { return !isMedia(f); }), media = files.filter(isMedia);
      if (!data.length) return mediaFiles(media);
      if (data.length > 1) toast('One file at a time here. Reading ' + data[0].name + '.', 3200);
      readOne(data[0]);
    }
    // PDFs and photos are programs: Program from a photo reads them, a few in a row.
    function mediaFiles(media) {
      if (!PDF_OK()) {
        var acts = [];
        if (!st.self && window.PhotoImport && st.mode === 'history') acts.push(btn('Bring it in as a program', 'btn-primary', function () { handOffPhotos(media); }));
        return failed(['PDFs and photos come in as programs: what was written, not what was lifted.', st.self ? 'For your history, use the CSV your app exports, or a spreadsheet.' : 'For a lifter\'s history, use a CSV or spreadsheet export.'], acts, 'That\'s a program file');
      }
      handOffPhotos(media);
    }
    function handOffPhotos(media) {
      if (media.length > PHOTO_MAX) toast('Reading the first ' + PHOTO_MAX + ' files. Bring the rest in after these.', 3600);
      ui.close(true);
      setTimeout(function () { PhotoImport.openReview({ athleteId: st.athleteId, files: media.slice(0, PHOTO_MAX) }); }, 220);
    }
    function readBytes(f) {
      return new Promise(function (res, rej) {
        var r = new FileReader();
        r.onload = function () { res(new Uint8Array(r.result)); };
        r.onerror = function () { rej(errorOf('That file didn\'t open. Choose it again.')); };
        r.readAsArrayBuffer(f);
      });
    }
    var TOO_BIG = function (kind) {
      return kind === 'text' ? 'That file is over 8 MB. Split it by year and bring each part in.'
        : kind === 'zip' ? 'That zip is too big to open here. Unzip it and choose the CSV files inside.'
        : 'That file is too big to open here. Save the tabs you need into a smaller copy.';
    };
    function readOne(f) {
      var rd = reading(f.name);
      readBytes(f).then(function (u8) {
        var kind = IC().sniff(f.name, u8);
        st.file = { name: f.name, kind: kind };
        return fromBytes(kind, u8, f.name, rd, f);
      }).then(function (res) { if (res) gotTables(res); }).catch(readError);
    }
    function fromBytes(kind, u8, name, rd, f) {
      var size = u8.length;
      if (kind === 'pdf' || kind === 'image') { mediaFiles([f]); return Promise.resolve(null); }
      if (kind === 'xls') throw errorOf('That\'s an old Excel file (.xls). Open it in Excel, save it as an Excel Workbook (.xlsx), and choose that.');
      if (kind === 'xlsb') throw errorOf('That\'s an Excel binary workbook (.xlsb). Save it as an Excel Workbook (.xlsx) and choose that.');
      if (kind === 'numbers') throw errorOf('That\'s a Numbers file. In Numbers, export it to Excel (.xlsx), then choose that.');
      if (kind === 'office') throw errorOf('That\'s a document, not a spreadsheet. Copy its table into a spreadsheet, or take a screenshot and bring it in as a program.');
      if (kind === 'xlsx' || kind === 'ods') {
        if (size > MAX_BOOK) throw errorOf(TOO_BIG('book'));
        return IC().loadXlsx().then(function () {
          rd && rd.line('Opening the tabs…');
          return new Promise(function (res) { setTimeout(res, 16); });
        }).then(function () {
          var tabs = IC().readWorkbook(u8, { sheetRows: 41, name: name });
          return { name: name, book: u8, tables: tabs };
        });
      }
      if (kind === 'zip') {
        if (size > MAX_ZIP) throw errorOf(TOO_BIG('zip'));
        return IC().loadUnzip().then(function () {
          var z = IC().tablesFromZip(IC().unzip(u8));
          if (!z.tables.length) throw errorOf('There\'s no CSV, text or .json file in that zip' + (z.skipped.length ? ' (it holds ' + z.skipped.slice(0, 3).join(', ') + (z.skipped.length > 3 ? '…' : '') + ')' : '') + '.');
          return { name: name, tables: z.tables, skipped: z.skipped };
        });
      }
      if (kind === 'json') {
        if (size > MAX_JSON) throw errorOf(TOO_BIG('json'));
        var tj = IC().tablesFromJson(IC().decodeBytes(u8).text, name);
        if (!tj.length) throw errorOf('That .json isn\'t one POWALIFTA reads yet. If it\'s a list of sets, save it as a CSV and choose that.');
        return Promise.resolve({ name: name, tables: tj });
      }
      if (size > MAX_TEXT) throw errorOf(TOO_BIG('text'));
      return Promise.resolve({ name: name, tables: IC().tablesFromText(IC().decodeBytes(u8).text, name) });
    }
    function fromText(text, name) {
      st.file = { name: name, kind: 'text' };
      gotTables({ name: name, tables: IC().tablesFromText(text, name) });
    }
    function readError(e) {
      if (ui.isClosed()) return;
      console.warn('import read', e);
      failed(e && e.user ? e.message : (e && e.code === 'too_big' ? e.message : 'Nothing in that file could be read. Check it\'s the export itself, then choose it again.'));
    }
    function gotTables(res) {
      if (ui.isClosed()) return;
      st.res = res;
      var tables = (res.tables || []).filter(function (t) { return t.rows && t.rows.length; });
      if (!tables.length) return failed('There\'s nothing in ' + (res.name || 'that file') + ' to read. If it\'s a spreadsheet, check the tab has data in it.');
      if (tables.length === 1) return openTable(tables[0]);
      pickTab(res, tables);
    }

    // ---------------------------------------------------------------- 3. which tab
    function kindWords(a, t) {
      var rows = t.fullRows ? Math.max(0, t.fullRows - 1 - a.headerIndex) : a.rowsCount;
      if (a.kind === 'roster') return { ic: 'roster', text: 'Client list · ' + plural(rows, 'person', 'people') };
      if (a.layout === 'wide') return { ic: 'log', text: 'Training log, sets across · ' + plural(rows, 'row') };
      if (a.kind === 'history') return { ic: 'log', text: 'Training log · ' + plural(rows, 'row') };
      if (a.kind === 'program') {
        var w = a.grid ? (a.grid.groups ? a.grid.groups.length : a.grid.weeks.length) : 0;
        return { ic: 'program', text: 'Program' + (w ? ' · ' + plural(w, 'week') : '') };
      }
      return { ic: 'unknown', text: 'Not sure yet: you\'ll match its columns · ' + plural(rows, 'row') };
    }
    function pickTab(res, tables, dir) {
      var isZip = !res.book;
      var inner = ui.step({ title: isZip ? 'Which file?' : 'Which tab?', sub: (res.name || 'This file') + ' has ' + tables.length + (isZip ? ' files' : ' tabs') + '. Pick the one to bring in.', back: function () { intake('back'); }, dir: dir });
      var rows = tables.map(function (t) {
        var a = IC().analyse(t, { remembered: rememberedMaps() });
        var k = kindWords(a, t);
        return uiRow({ lead: el('span', { class: 'im-lead', html: IC_TAB[k.ic] }), title: t.name + (t.hidden ? ' (hidden)' : ''), sub: k.text, chevron: true,
          onClick: function () { openTable(t, function () { pickTab(res, tables, 'back'); }); } });
      });
      inner.appendChild(uiList(rows));
      if (res.skipped && res.skipped.length) inner.appendChild(el('p', { class: 'im-note' }, 'Not read: ' + res.skipped.slice(0, 6).join(', ') + (res.skipped.length > 6 ? ' and ' + (res.skipped.length - 6) + ' more' : '') + '. Photos and PDFs come in through Bring a program in.'));
    }
    // A quick look read the tab's first rows: the whole tab is read once it's picked.
    function openTable(t, backTo) {
      st.backToTabs = backTo || null;
      if (st.res && st.res.book && t.fullRows > t.rows.length) {
        var rd = reading(t.name, 'Reading ' + plural(Math.max(0, t.fullRows - 1), 'row') + '…');
        setTimeout(function () {
          try {
            var full = IC().readWorkbook(st.res.book, { sheets: [t.name], name: st.res.name }).filter(function (x) { return x.name === t.name; })[0] || t;
            route(full);
          } catch (e) { readError(e); }
          void rd;
        }, 30);
        return;
      }
      route(t);
    }

    // ---------------------------------------------------------------- 4. what it is → where it goes
    function backFromStep() { return st.backToTabs || function () { intake('back'); }; }
    function route(t, kind) {
      if (ui.isClosed()) return;
      st.table = t;
      var a = IC().analyse(t, { remembered: rememberedMaps(), kind: kind || null });
      // The coach said what it holds: its step, where the columns it couldn't place are asked.
      if (kind === 'history' && a.kind !== 'history') { a.kind = 'history'; a.layout = a.wide ? 'wide' : 'log'; }
      st.a = a; st.fields = a.fields.slice();
      if (a.kind === 'roster') {
        if (st.self) return failed('That\'s a client list, not a training log. Choose the export of your sets instead.', [], 'That\'s a client list');
        if (st.mode === 'history' || st.mode === 'program') return mismatch('roster');
        return rosterStep();
      }
      if (a.kind === 'history') {
        if (st.mode === 'roster' || st.fromProgram) return mismatch('history');
        return st.athleteId ? historyStep() : pickLifter();
      }
      if (a.kind === 'program') {
        if (st.self) return failed('That reads as a program, not a log of sets. Programs come in on your coach\'s side.', [], 'That\'s a program');
        if (st.mode === 'roster') return mismatch('program');
        if (st.mode === 'history' && st.athleteId) return blockStep();
        return toProgram();
      }
      return unknownStep();
    }
    // The file isn't what this sheet was opened for: say so, and offer the right way in.
    function mismatch(found) {
      var words = { roster: 'a client list', history: 'training history', program: 'a program' };
      var inner = ui.step({ title: 'That\'s ' + words[found], sub: '', back: backFromStep(), dir: 'fwd' });
      inner.appendChild(el('p', { class: 'im-note', style: 'font-size:15px;color:var(--text-2)' }, (st.file && st.file.name ? st.file.name : 'This file') + ' reads as ' + words[found] + '.'));
      var go = found === 'roster' ? btn('Invite the people in it', 'btn-primary', function () { st.mode = 'roster'; rosterStep(); })
        : found === 'history' ? btn(st.athleteId ? 'Import it as ' + first() + '\'s history' : 'Import it as a lifter\'s history', 'btn-primary', function () { st.mode = 'history'; st.fromProgram = false; if (st.athleteId) historyStep(); else pickLifter(); })
        : btn('Check it as a program', 'btn-primary', function () { st.mode = 'program'; toProgram(); });
      ui.setFoot([go, btn('Choose another file', 'ui-btn-soft', function () { intake('back'); })]);
    }
    // Columns it couldn't place at all: what's in this file, then the columns.
    function unknownStep() {
      var inner = ui.step({ title: 'What\'s in this file?', sub: (st.file && st.file.name ? st.file.name + ': ' : '') + 'its columns didn\'t match anything POWALIFTA knows. Say what it holds, then match the columns.', back: backFromStep(), dir: 'fwd' });
      var choices = st.self ? [['history', 'Training history', 'Dated sets: what was lifted']]
        : [['history', 'Training history', 'Dated sets: what a lifter lifted'], ['roster', 'A client list', 'Names and emails to invite'], ['program', 'A program', 'Weeks, days and sets to do']];
      inner.appendChild(uiList(choices.map(function (c) {
        return uiRow({ lead: el('span', { class: 'im-lead', html: IC_TAB[c[0] === 'history' ? 'log' : c[0]] }), title: c[1], sub: c[2], chevron: true, onClick: function () {
          if (c[0] === 'program') { var read = programRead(st.a); if (read) return toProgram(read); return failed('No weeks and sets could be found in it. A program needs exercises with sets x reps, like "Squat 3x5 @8", by week.'); }
          route(st.table, c[0]);
        } });
      })));
    }

    // ---------------------------------------------------------------- 5. whose history
    function pickLifter(dir) {
      var a = st.a, list = rosterList();
      var inner = ui.step({ title: 'Whose history is this?', sub: 'Pick the lifter these sets belong to.', back: backFromStep(), dir: dir || 'fwd' });
      // The file names its lifters (POWALIFTA's own coach export, a team log): match them to the roster.
      var col = a.fields.indexOf('athlete'), names = {};
      if (col >= 0) IC().bodyRows(a).forEach(function (r) { var n = String(r.cells[col] || '').trim(); if (n) names[n] = (names[n] || 0) + 1; });
      var inFile = Object.keys(names).sort(function (x, y) { return names[y] - names[x]; });
      var norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim(); };
      var matchOf = function (ath) { var n = norm(ath.name); return inFile.find(function (f) { return norm(f) === n; }) || inFile.find(function (f) { return n && (norm(f) === n.split(' ')[0] || n.indexOf(norm(f)) === 0); }) || null; };
      if (!list.length) {
        var e = el('div', { class: 'im-empty' });
        e.appendChild(el('p', {}, 'Their history comes in once they\'re on your roster. Invite them first, or send them the steps to bring it in themselves.'));
        inner.appendChild(e);
        ui.setFoot([typeof openInviteModal === 'function' ? btn('Invite a lifter', 'btn-primary', function () { ui.close(true); setTimeout(openInviteModal, 220); }) : null,
          btn('Send them the steps', 'ui-btn-soft', function () { lifterGuide(''); })]);
        return;
      }
      var logs = Store.get().workoutLogs || [];
      var rows = list.map(function (ath) { return { ath: ath, m: matchOf(ath) }; }).sort(function (x, y) { return (y.m ? 1 : 0) - (x.m ? 1 : 0); }).map(function (o) {
        var n = logs.filter(function (l) { return l.athleteId === o.ath.id; }).length;
        return uiRow({ av: o.ath.name || '?', title: o.ath.name || 'Lifter', sub: o.m ? 'Matches "' + o.m + '" in the file' : (n ? plural(n, 'set') + ' logged' : 'Nothing logged yet'), chevron: true,
          onClick: function () { st.athleteId = o.ath.id; st.fileName = o.m || (inFile.length === 1 ? inFile[0] : null); st.existing = null; st.ext = null; st.extKey = null; historyStep('fwd', true); } });
      });
      rows.push(uiRow({ title: 'Not on POWALIFTA yet', sub: 'Send them the steps to bring it in themselves', chevron: true, onClick: function () { lifterGuide(''); } }));
      inner.appendChild(uiList(rows));
    }
    function lifterGuide(name) {
      var g = st.a && st.a.recognised ? ({ hevy: 'hevycoach', 'hevy-api': 'hevycoach' }[st.a.recognised.id] || '') : '';
      var msg = window.ImportGuides ? ImportGuides.lifterMessage(firstOf(name), g) : '';
      uiSheet('Send the steps', function (sheet, close) {
        sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'A lifter can bring their own history in from the app: You → Your data → Import your training history. Send them this.'));
        sheet.appendChild(el('div', { class: 'im-msg' }, msg));
        var row = el('div', { class: 'im-foot-row', style: 'display:flex;flex-direction:column;gap:10px;margin-top:16px' });
        var cp = btn('Copy the message', 'btn-primary btn-lg btn-block', function () {
          copyText(msg).then(function () { toast('Copied. Paste it in a message'); close(); }, function () { toast('Couldn\'t copy. Press and hold the text to select it'); });
        });
        row.appendChild(cp);
        if (navigator.share) row.appendChild(btn('Share', 'ui-btn-soft btn-lg btn-block', function () { navigator.share({ text: msg }).then(close, function () { /* cancelled */ }); }));
        sheet.appendChild(row);
      }, { cls: 'im-guide-sheet' });
    }

    // ---------------------------------------------------------------- 6. columns + preview (history)
    function historyStep(dir, fromPicker) {
      var a = st.a;
      var ath = athlete();
      var inner = ui.step({ title: st.self ? 'Check your sets' : 'Check ' + (ath ? firstOf(ath.name) + '\'s' : 'the') + ' sets', sub: '',
        back: fromPicker ? function () { pickLifter('back'); } : backFromStep(), dir: dir || 'fwd', wide: true, tall: true });
      st.editing = st.editing || false;
      // Whose: the lifter, how much they have already.
      var forBox = el('div', { class: 'im-sec' });
      var colsBox = el('div', { class: 'im-sec' });
      var optsBox = el('div', { class: 'im-sec', hidden: '' });
      var prevBox = el('div', { class: 'im-sec', 'aria-live': 'polite' });
      inner.appendChild(forBox); inner.appendChild(colsBox); inner.appendChild(optsBox); inner.appendChild(prevBox);
      var go = btn('Import', 'btn-primary btn-lg');
      go.disabled = true;
      ui.setFoot([go]);
      if (!st.self && ath) {
        var fr = uiRow({ av: ath.name || '?', title: ath.name || 'Lifter', sub: 'Reading their log…' });
        forBox.appendChild(uiList([fr]));
        st.forSub = fr.querySelector('.ui-row-sub');
      }
      // The sets already there: duplicates and PRs are judged against all of them (the Store can
      // hold only a slice of a big roster's logs).
      var loadExisting = function () {
        if (st.existing) return Promise.resolve();
        var base = (Store.get().workoutLogs || []).filter(function (l) { return l.athleteId === st.athleteId; });
        st.existing = base;
        st.existingBw = (Store.get().bodyweight || []).filter(function (b) { return b.athleteId === st.athleteId; });
        if (isDemo() || !(window.DB && DB.skListAll)) return Promise.resolve();
        return DB.skListAll('workout_logs', 'athlete_id', [st.athleteId], 'date').then(function (r) {
          if (r && r.rows) st.existing = r.rows.map(function (x) { var l = typeof mapDbLog === 'function' ? mapDbLog(x) : x; l.importKey = x.import_key || null; l.source = x.source || null; return l; });
        }).catch(function () { /* the Store's copy */ });
      };
      var paintFor = function () { if (st.forSub) st.forSub.textContent = st.existing && st.existing.length ? plural(st.existing.length, 'set') + ' in POWALIFTA so far' : 'Nothing logged yet'; };
      loadExisting().then(function () { if (ui.isClosed()) return; paintFor(); st.ext = null; st.extKey = null; replan(); });
      paintColumns();
      // ---- the columns: what was matched, and a dropdown for each column it couldn't place ----
      function paintColumns() {
        colsBox.innerHTML = '';
        var a2 = IC().setFields(st.a, st.fields);
        if (a2.layout === 'journal') { colsBox.appendChild(el('div', { class: 'im-rec' }, el('i'), 'Read as a training journal')); return; }
        var rec = recognisedLine(st.a.recognised, false);
        if (rec) colsBox.appendChild(el('div', { class: 'im-rec' }, el('i'), rec));
        else if (st.a.fromMemory) colsBox.appendChild(el('div', { class: 'im-rec' }, el('i'), 'Matched the way you did last time'));
        var keys = st.a.keys, heads = st.a.headers;
        var placed = [], ask = [];
        heads.forEach(function (h, i) {
          if (!keys[i]) return;
          var f = st.fields[i];
          if (st.editing || f == null || st.a.guessed[i]) ask.push(i); else if (f !== 'ignore' && f !== 'session') placed.push(i);
        });
        var missing = missingFor(st.fields, a2);
        var label = el('div', { class: 'im-label' }, el('span', {}, 'Columns'));
        if (!st.editing) { var ch = el('button', { type: 'button' }, 'Change'); ch.addEventListener('click', function () { st.editing = true; paintColumns(); }); label.appendChild(ch); }
        else { var dn = el('button', { type: 'button' }, 'Done'); dn.addEventListener('click', function () { st.editing = false; paintColumns(); }); label.appendChild(dn); }
        colsBox.appendChild(label);
        var box = el('div', { class: 'im-cols' });
        if (placed.length && !st.editing) {
          var m = el('div', { class: 'im-matched' });
          m.appendChild(el('span', { class: 'im-tick', html: IC_CHECK }));
          var mm = el('div', { class: 'im-col-main' });
          mm.appendChild(el('b', {}, placed.length === heads.filter(Boolean).length ? 'All ' + placed.length + ' columns matched' : plural(placed.length, 'column') + ' matched'));
          mm.appendChild(el('span', {}, placed.map(function (i) { return heads[i]; }).join(' · ')));
          m.appendChild(mm);
          box.appendChild(m);
        }
        ask.forEach(function (i) { box.appendChild(colRow(i, false, function () { st.ext = null; st.extKey = null; paintColumns(); replan(); })); });
        if (box.children.length) colsBox.appendChild(box);
        if (missing.length) {
          var al = el('div', { class: 'im-alert' });
          missing.forEach(function (t) { al.appendChild(el('p', {}, t)); });
          colsBox.appendChild(al);
        }
        if (st.a.dropped && st.a.dropped.length) colsBox.appendChild(el('p', { class: 'im-note' }, 'Left out as it was read: ' + plural(st.a.dropped.length, 'payment column') + '. POWALIFTA never keeps them.'));
        if (st.table && st.table.noValue) colsBox.appendChild(el('p', { class: 'im-note' }, plural(st.table.noValue, 'cell') + ' hold a formula with no saved value, so they read as empty. Open the file in Excel or Sheets, save it, and choose it again to bring them in.'));
      }
      // ---- the plan, a chunk at a time for a big sheet ----
      var timer = null;
      function replan() { clearTimeout(timer); timer = setTimeout(plan, 60); }
      function plan() {
        if (ui.isClosed() || !st.existing) return;
        var a2 = IC().setFields(st.a, st.fields);
        var missing = missingFor(st.fields, a2);
        go.disabled = true;
        if (missing.length && a2.layout !== 'journal') { st.plan = null; paintPreview(null); return; }
        var o = { athleteId: st.athleteId, athleteName: st.fileName || (ath ? ath.name : ''), unit: st.opts.unit, dateOrder: st.opts.dateOrder, noRpe: st.opts.noRpe,
          existing: st.existing, existingBw: st.existingBw, weighIns: st.self, today: today(), format: st.a.recognised ? st.a.recognised.label : 'Spreadsheet' };
        if (a2.layout === 'journal') { st.plan = SK().planHistoryImport(st.table.text, o); paintOptions(); paintPreview(st.plan); return; }
        var src = a2.layout === 'wide' ? IC().unpivotWide(a2) : { body: IC().bodyRows(a2), map: IC().historyMap(a2) };
        var key = JSON.stringify([st.fields, st.opts.dateOrder, st.fileName]);
        var token = ++st.planning;
        var big = src.body.length > BIG;
        var busy = function (done, total) { if (token !== st.planning) return; prevBox.innerHTML = ''; var r = el('div', { class: 'im-reading' }); r.appendChild(el('p', {}, 'Reading ' + nf(Math.round(done)) + ' of ' + plural(total, 'row') + '…')); var b = el('div', { class: 'im-bar is-det' }, el('i', { style: 'width:' + Math.max(4, Math.round(done / Math.max(1, total) * 100)) + '%' })); r.appendChild(b); prevBox.appendChild(r); };
        var extP = st.extKey === key && st.ext ? Promise.resolve(st.ext)
          : big ? SK().extractHistoryAsync(src.body, src.map, o, function (d, t) { busy(d / 2, t); }) : Promise.resolve(SK().extractHistory(src.body, src.map, o));
        extP.then(function (ext) {
          if (token !== st.planning || ui.isClosed()) return null;
          st.ext = ext; st.extKey = key;
          return big ? SK().finishHistoryPlanAsync(ext, o, function (d, t) { busy(src.body.length / 2 + d / 2, src.body.length); }) : SK().finishHistoryPlan(ext, o);
        }).then(function (p) {
          if (!p || token !== st.planning || ui.isClosed()) return;
          st.plan = p;
          paintOptions(); paintPreview(p);
        });
      }
      // ---- only the questions the file leaves open ----
      function paintOptions() {
        var p = st.plan;
        optsBox.innerHTML = '';
        if (!p) { optsBox.hidden = true; return; }
        var box = el('div', { class: 'im-opts' });
        var seg = function (label, choices, cur, onPick) {
          var row = el('div', { class: 'im-opt' });
          row.appendChild(el('span', {}, label));
          var s = el('div', { class: 'ui-seg', role: 'radiogroup', 'aria-label': label });
          choices.forEach(function (c) {
            var b = el('button', { type: 'button', role: 'radio', 'aria-checked': c[0] === cur ? 'true' : 'false', class: c[0] === cur ? 'on' : '' }, c[1]);
            b.addEventListener('click', function () { onPick(c[0]); });
            s.appendChild(b);
          });
          row.appendChild(s);
          return row;
        };
        var hasUnitCol = st.fields.indexOf('unitCol') >= 0;
        if (!p.unitFromFile && !hasUnitCol) box.appendChild(seg('Weights are in', [['kg', 'kg'], ['lb', 'lb']], st.opts.unit, function (v) { st.opts.unit = v; plan(); }));
        if (p.dateAmbiguous) {
          box.appendChild(seg('Dates are written', [['dmy', 'Day first'], ['mdy', 'Month first']], p.dateOrder, function (v) { st.opts.dateOrder = v; st.ext = null; st.extKey = null; plan(); }));
          var ex = (st.ext && st.ext.cand && st.ext.cand[0]) || null;
          if (ex && ex.rawDate) box.appendChild(el('p', { class: 'im-opt-hint' }, '"' + ex.rawDate + '" reads as ' + dshort(ex.date) + '.'));
        }
        if (p.noRpeCount) {
          var row = el('div', { class: 'im-opt' });
          row.appendChild(el('span', {}, plural(p.noRpeCount, 'set') + ' without an RPE count as'));
          var sel = el('select', { class: 'im-select', 'aria-label': 'RPE for sets without one' });
          [10, 9.5, 9, 8.5, 8, 7.5, 7].forEach(function (v) { var op = el('option', { value: String(v) }, 'RPE ' + v); if (v === st.opts.noRpe) op.selected = true; sel.appendChild(op); });
          sel.addEventListener('change', function () { st.opts.noRpe = Number(sel.value); plan(); });
          row.appendChild(sel);
          box.appendChild(row);
        }
        optsBox.hidden = !box.children.length;
        if (box.children.length) { optsBox.appendChild(el('div', { class: 'im-label' }, el('span', {}, 'A few questions'))); optsBox.appendChild(box); }
      }
      // ---- what will come in ----
      function paintPreview(p) {
        prevBox.innerHTML = '';
        go.disabled = true; go.textContent = 'Import';
        if (!p) {
          prevBox.appendChild(el('p', { class: 'im-note' }, 'Match the columns above and the sets show up here before anything is saved.'));
          return;
        }
        var n = p.logs.length, bw = (p.weighIns || []).length;
        prevBox.appendChild(el('div', { class: 'im-label' }, el('span', {}, 'What comes in')));
        if (n) {
          var big = el('div', { class: 'im-big' });
          big.appendChild(el('b', {}, plural(n, 'set')));
          big.appendChild(el('span', {}, plural(p.sessions, 'session') + (bw ? ' · ' + plural(bw, 'weigh-in') : '')));
          prevBox.appendChild(big);
          prevBox.appendChild(el('div', { class: 'im-range' }, p.range.from === p.range.to ? dshort(p.range.from) : dshort(p.range.from) + ' – ' + dshort(p.range.to)));
          var meta = [];
          if (p.carried) meta.push(plural(p.carried, 'row') + ' took the date or exercise from the row above');
          if (p.rpeFromTarget) meta.push(plural(p.rpeFromTarget, 'set') + ' without an RPE took their planned RPE');
          if (meta.length) prevBox.appendChild(el('div', { class: 'im-meta' }, meta.join(' · ') + '.'));
          // PRs it makes
          var prRows = ['squat', 'bench', 'deadlift'].filter(function (L) { return p.prs && p.prs[L]; }).map(function (L) {
            var pr = p.prs[L], b = pr.best;
            var end = pr.newBest ? 'New best' : pr.prs ? plural(pr.prs, 'PR') : '';
            return uiRow({ lead: el('span', { class: 'lift-dot lift-' + L, 'aria-hidden': 'true' }), title: liftLabel(L),
              sub: 'Best ' + wtxt(b.kg) + ' e1RM · ' + wtxt(b.weight) + ' × ' + b.reps + ' @ ' + b.rpe + ' · ' + dshort(b.date),
              endNode: end ? el('span', { class: 'im-pr' }, end) : null });
          });
          if (prRows.length) { var l = uiList(prRows); l.style.marginTop = '14px'; prevBox.appendChild(l); }
          // The first sets, as they'll be saved
          var sets = el('div', { class: 'im-sets', role: 'list', 'aria-label': 'The first sets' });
          p.logs.slice(0, 5).forEach(function (s) {
            var r = el('div', { class: 'im-set', role: 'listitem' });
            r.appendChild(el('span', { class: 'd' }, dnum(s.date)));
            r.appendChild(el('i', { class: 'dot l-' + s.lift, 'aria-hidden': 'true' }));
            r.appendChild(el('span', { class: 'n' }, setLabel(s)));
            var w = el('span', { class: 'w' }, wtxt(s.weight) + ' × ' + s.reps);
            w.appendChild(el('small', {}, ' @ ' + s.rpe));
            r.appendChild(w);
            sets.appendChild(r);
          });
          prevBox.appendChild(sets);
          if (n > 5) prevBox.appendChild(el('p', { class: 'im-note' }, 'And ' + plural(n - 5, 'more set') + '.'));
          var acc = p.logs.filter(function (s) { return !liftLabel(s.lift); }).length;
          if (acc) prevBox.appendChild(el('p', { class: 'im-note' }, plural(acc, 'accessory set') + (acc === 1 ? ' comes' : ' come') + ' in under ' + (acc === 1 ? 'its' : 'their') + ' own name' + (acc === 1 ? '.' : 's.')));
        } else if (p.dupes) {
          prevBox.appendChild(el('div', { class: 'im-big' }, el('b', {}, 'Already here')));
        } else if (bw) {
          prevBox.appendChild(el('div', { class: 'im-big' }, el('b', {}, plural(bw, 'weigh-in'))));
        } else {
          var al = el('div', { class: 'im-alert' });
          al.appendChild(el('p', {}, 'No sets could be read yet. Each set needs a date, an exercise, a weight and reps.'));
          al.appendChild(el('p', {}, p.skipped.length ? 'The rows left out below say why. A column matched wrong? Tap Change above.' : 'Check the columns above.'));
          prevBox.appendChild(al);
        }
        if (p.dupes) prevBox.appendChild(el('p', { class: 'im-note' }, plural(p.dupes, 'set') + (p.dupes === 1 ? ' is' : ' are') + ' already in POWALIFTA and won\'t be added again.'));
        if (p.bwDupes) prevBox.appendChild(el('p', { class: 'im-note' }, plural(p.bwDupes, 'day') + ' already had a weigh-in, so ' + (p.bwDupes === 1 ? 'it stays' : 'they stay') + ' as ' + (p.bwDupes === 1 ? 'it was' : 'they were') + '.'));
        paintSkipped(p);
        if (n || bw) {
          go.disabled = false;
          go.textContent = 'Import ' + (n ? plural(n, 'set') : '') + (n && bw ? ' and ' : '') + (bw ? plural(bw, 'weigh-in') : '') + (!st.self && ath ? ' for ' + firstOf(ath.name) : '');
          go.onclick = commit;
        } else if (p.dupes && p.allKeys && p.allKeys.length) {
          // The same file again: offer to take that import back out (a wrong unit, say).
          var mine = (st.existing || []).filter(function (l) { return l.importKey && p.allKeys.indexOf(l.importKey) >= 0; });
          if (mine.length) {
            var rm = el('button', { type: 'button', class: 'im-quiet' }, 'Remove the ' + plural(mine.length, 'set') + ' this file imported');
            rm.addEventListener('click', function () {
              uiActionSheet('Remove ' + plural(mine.length, 'imported set') + '?', [{ label: 'Remove them', danger: true, onClick: function () {
                SK().removeImported(st.athleteId, mine).then(function (ok) { if (ok) { st.existing = st.existing.filter(function (l) { return mine.indexOf(l) < 0; }); st.ext = null; st.extKey = null; plan(); } });
              } }]);
            });
            prevBox.appendChild(el('div', { style: 'text-align:center' }, rm));
          }
        }
      }
      function paintSkipped(p) {
        if (!p.skipped.length) return;
        var det = el('details', { class: 'im-skip' });
        det.appendChild(el('summary', {}, plural(p.skipped.length, 'row') + ' left out'));
        var list = el('div', { class: 'im-skip-list' });
        Object.keys(p.skippedBy).sort(function (x, y) { return p.skippedBy[y] - p.skippedBy[x]; }).forEach(function (reason) {
          var eg = p.skipped.filter(function (s) { return s.reason === reason; });
          var item = el('div', {});
          var r = el('div', { class: 'im-skip-row' });
          r.appendChild(el('b', {}, reason));
          r.appendChild(el('span', {}, nf(eg.length) + (eg[0].line ? ' · row' + (eg.length === 1 ? ' ' : 's ') + eg.slice(0, 4).map(function (s) { return s.line; }).join(', ') + (eg.length > 4 ? '…' : '') : '')));
          item.appendChild(r);
          item.appendChild(el('span', { class: 'im-skip-eg' }, eg[0].text));
          list.appendChild(item);
        });
        det.appendChild(list);
        prevBox.appendChild(det);
      }
      // ---- the import ----
      function commit() {
        var p = st.plan;
        if (!p || go.disabled) return;
        go.disabled = true;
        var total = p.logs.length;
        ui.guard(function () { return { block: 'Importing. It finishes in a moment.' }; });
        if (!isDemo()) go.textContent = 'Importing… 0 of ' + nf(total);
        var writes = total ? SK().writeLogs(st.athleteId, p.logs, function (d) { go.textContent = 'Importing… ' + nf(d) + ' of ' + nf(total); }) : Promise.resolve({ ok: true, added: [] });
        writes.then(function (r) {
          if (!(st.self && p.weighIns && p.weighIns.length) || (!r.ok && !r.added.length)) return r;
          return saveWeighIns(p.weighIns).then(function (n) { r.bw = n; return r; });
        }).then(function (r) {
          ui.guard(null);
          if (ui.isClosed()) return;
          if (!r.ok && !r.added.length) {
            go.disabled = false; go.textContent = 'Try again';
            var code = r.error ? String(r.error.code || '') + ' ' + String(r.error.message || '') : '';
            if (/42501|row-level security|permission/i.test(code) && !st.self) {
              failed([firstOf(ath && ath.name) + ' isn\'t on your roster any more, so their history can\'t be added from here.', 'They can bring it in themselves from the app.'],
                [btn('Send them the steps', 'btn-primary', function () { lifterGuide(ath && ath.name); })]);
              return;
            }
            toast(r.notReady ? 'Importing history switches on with the next server update. Nothing was lost: try again after it.' : 'Couldn\'t import: check the connection and try again.', 5000);
            return;
          }
          var maps = IC().rememberMapping(rememberedMaps(), st.a.headers, st.fields, today());
          saveMaps(maps);
          historyDone(r, p);
        });
      }
    }
    function saveWeighIns(list) {
      var rows = list.map(function (b) { return { id: typeof uid === 'function' ? uid('bw') : String(Math.random()), athleteId: st.athleteId, date: b.date, weight: b.weight }; });
      var keep = function () {
        Store.update(function (s) {
          s.bodyweight = s.bodyweight || [];
          rows.forEach(function (b) { var ex = s.bodyweight.find(function (x) { return x.athleteId === b.athleteId && x.date === b.date; }); if (ex) ex.weight = b.weight; else s.bodyweight.push(b); });
        });
        return rows.length;
      };
      if (isDemo() || !(window.DB && DB.imUpsertBodyweights)) return Promise.resolve(keep());
      return DB.imUpsertBodyweights(rows).then(function (r) { return r.ok ? keep() : 0; }, function () { return 0; });
    }
    function missingFor(fields, a2) {
      if (a2 && a2.layout === 'journal') return [];
      var has = function (k) { return fields.indexOf(k) >= 0; };
      var out = [];
      if (!has('date')) out.push('Which column has the date? Pick it next to that column.');
      if (!has('ex')) out.push('Which column has the exercise?');
      if (!((has('weight') && has('reps')) || has('text') || (has('tWeight') && has('tReps')) || has('tText') || (a2 && a2.wide))) out.push('Which columns have the weight and the reps? Or one with sets written out, like 140x5 @8.');
      return out;
    }
    // One column's dropdown: its header, three of its values, what it holds.
    function colRow(i, roster, onChange) {
      var a = st.a, f = st.fields[i];
      var row = el('div', { class: 'im-col' });
      var main = el('div', { class: 'im-col-main' });
      main.appendChild(el('b', {}, a.headers[i]));
      var vals = [];
      for (var r = a.headerIndex + 1; r < a.table.rows.length && vals.length < 3; r++) { var v = String(a.table.rows[r].cells[i] == null ? '' : a.table.rows[r].cells[i]).trim(); if (v && vals.indexOf(v) < 0) vals.push(v.slice(0, 24)); }
      main.appendChild(el('span', {}, vals.length ? vals.join(' · ') : 'Empty'));
      if (a.guessed[i] && f === a.fields[i]) main.appendChild(el('span', { class: 'im-guess' }, 'Guessed from what\'s in it'));
      row.appendChild(main);
      var sel = el('select', { class: 'im-select' + (f == null || f === 'ignore' ? ' is-off' : ''), 'aria-label': 'What\'s in ' + a.headers[i] + '?' });
      sel.appendChild(el('option', { value: '' }, 'Leave out'));
      (roster ? ROSTER_OPTS : LOG_OPTS).forEach(function (o) { var op = el('option', { value: o[0] }, o[1]); if (o[0] === f) op.selected = true; sel.appendChild(op); });
      if (f && f !== 'ignore' && !sel.querySelector('option[value="' + f + '"]')) { var known = el('option', { value: f }, fieldWord(f, roster) || f); known.selected = true; sel.appendChild(known); }
      sel.addEventListener('change', function () {
        var v = sel.value || 'ignore';
        // One column per field: the column that had it lets go.
        if (v !== 'ignore') st.fields = st.fields.map(function (x, k) { return k !== i && x === v ? 'ignore' : x; });
        st.fields[i] = v;
        onChange();
      });
      row.appendChild(sel);
      return row;
    }

    // ---------------------------------------------------------------- 7. history done
    function historyDone(r, p) {
      var ath = athlete();
      var n = r.added.length, bw = r.bw || 0;
      var inner = ui.step({ title: 'Imported', sub: '', back: null, dir: 'fwd' });
      var d = el('div', { class: 'im-done' });
      d.appendChild(el('span', { class: 'im-done-ic', html: IC_CHECK }));
      d.appendChild(el('b', {}, n ? plural(n, 'set') : plural(bw, 'weigh-in')));
      var where = st.self ? 'in your history' : 'in ' + (ath ? firstOf(ath.name) + '\'s' : 'their') + ' history';
      d.appendChild(el('p', {}, n ? 'Now ' + where + ': ' + plural(p.sessions, 'session') + ', ' + (p.range.from === p.range.to ? dshort(p.range.from) : dshort(p.range.from) + ' – ' + dshort(p.range.to)) + '.' + (bw ? ' And ' + plural(bw, 'weigh-in') + '.' : '') : 'Now ' + where + '.'));
      var best = ['squat', 'bench', 'deadlift'].filter(function (L) { return p.prs && p.prs[L] && p.prs[L].newBest; });
      if (best.length) d.appendChild(el('p', {}, 'New best e1RM on ' + best.map(liftLabel).join(', ').toLowerCase() + '.'));
      if (!r.ok) d.appendChild(el('p', {}, 'The connection dropped part way. Choose the same file again: it picks up where it stopped.'));
      if (isDemo()) d.appendChild(el('p', {}, 'Demo: nothing is saved.'));
      inner.appendChild(d);
      var again = el('div', { style: 'text-align:center;margin-top:8px' }, el('button', { type: 'button', class: 'im-quiet', onclick: function () { st.existing = null; intake('fwd'); } }, 'Import another file'));
      inner.appendChild(again);
      var undo = n && !isDemo() ? btn('Undo', 'ui-btn-soft', function () {
        undo.disabled = true;
        SK().removeImported(st.athleteId, r.added).then(function (ok) { if (ok) { st.existing = null; intake('back'); } else undo.disabled = false; });
      }) : null;
      var done = btn('Done', 'btn-primary', function () { ui.close(true); });
      var row = el('div', { class: 'im-foot-row' });
      if (undo) row.appendChild(undo);
      row.appendChild(done);
      ui.setFoot([row]);
    }

    // ---------------------------------------------------------------- 8. a past block (a program file, for a lifter's history)
    function programRead(a) {
      var name = (st.file && st.file.name ? st.file.name.replace(/\.[a-z0-9]+$/i, '') : 'Imported program') + (st.table && st.res && st.res.tables && st.res.tables.length > 1 ? ' · ' + st.table.name : '');
      if (a.layout === 'grid') return IC().gridToRead(a, { unit: unitNow(), name: name });
      return IC().programToRead(a, { unit: unitNow(), name: name });
    }
    function blockStep() {
      var ath = athlete(), fn = ath ? firstOf(ath.name) : '';
      var read = programRead(st.a);
      if (!read || !window.PhotoImport) return failed('No weeks and sets could be found in it. A program needs exercises with sets x reps, like "Squat 3x5 @8", by week.');
      var res = PhotoImport.draftToWeeks(PhotoImport.draftFromRead(read));
      var prog = { name: read.name, weeks: res.weeks, stats: { weeks: res.stats.weeks, days: res.stats.days, sets: res.stats.sets } };
      var src = JSON.stringify(read.days);
      var b = { blockName: (fn ? fn + '\'s ' : '') + 'imported block', blockStart: '', blockEnd: '' };
      var make = function () { return SK().planBlock(prog, src, { blockName: b.blockName, blockStart: b.blockStart || null, blockEnd: b.blockEnd || null, today: today() }); };
      var block = make();
      var inner = ui.step({ title: 'A past block for ' + (fn || 'them'), sub: 'It reads as a program, not dated sets. It\'s kept with ' + (fn ? fn + '\'s' : 'their') + ' past blocks, every set marked done.', back: backFromStep(), dir: 'fwd' });
      var big = el('div', { class: 'im-big' });
      big.appendChild(el('b', {}, plural(res.stats.weeks, 'week')));
      big.appendChild(el('span', {}, plural(res.stats.days, 'day') + ' · ' + plural(res.stats.sets, 'set')));
      inner.appendChild(big);
      if (res.stats.left) inner.appendChild(el('p', { class: 'im-note' }, plural(res.stats.left, 'cell') + ' didn\'t read as sets x reps and ' + (res.stats.left === 1 ? 'is' : 'are') + ' left out.'));
      var form = section(inner, 'Name and dates');
      var nm = el('input', { type: 'text', class: 'imp-name', value: block.name, 'aria-label': 'Block name', maxlength: '120' });
      nm.addEventListener('input', function () { b.blockName = nm.value.trim() || block.name; });
      form.appendChild(el('label', { class: 'imp-name-row' }, el('span', {}, 'Name'), nm));
      var dates = el('div', { class: 'sk-dates' });
      var mk = function (label, val, key) { var inp = el('input', { type: 'date', value: val }); inp.addEventListener('change', function () { b[key] = inp.value; block = make(); }); return el('label', {}, label, inp); };
      dates.appendChild(mk('Started', block.startedOn, 'blockStart'));
      dates.appendChild(mk('Ended', block.endedOn, 'blockEnd'));
      form.appendChild(dates);
      var keep = btn('Keep as a past block', 'btn-primary', function () {
        keep.disabled = true;
        block = make(); block.name = (b.blockName || block.name).slice(0, 120);
        SK().commitBlock(st.athleteId, block, keep).then(function (ok) { if (ok) ui.close(true); else keep.disabled = false; });
      });
      var asProgram = btn('Use it as a program instead', 'ui-btn-soft', function () { toProgram(read); });
      ui.setFoot([keep, asProgram]);
    }
    // A program grid or table → the check every program gets (program-photo.js).
    function toProgram(read) {
      read = read || programRead(st.a);
      if (!read) return failed('No weeks and sets could be found in it. A program needs exercises with sets x reps, like "Squat 3x5 @8", by week.');
      if (!window.PhotoImport) return failed('Programs come in on the coach\'s side.');
      var name = st.file && st.file.name ? st.file.name + (st.table && st.res && st.res.tables && st.res.tables.length > 1 ? ' · ' + st.table.name : '') : 'Your spreadsheet';
      ui.close(true);
      setTimeout(function () { PhotoImport.openReview({ athleteId: st.athleteId, read: read, source: { name: name } }); }, 220);
    }

    // ---------------------------------------------------------------- 9. a client list → invites
    function seatsNow() {
      var limit = typeof getCurrentTierLimit === 'function' ? getCurrentTierLimit() : 3;
      var athletes = typeof getAthleteCount === 'function' ? getAthleteCount(u.id) : rosterList().length;
      var pending = typeof getPendingInviteCount === 'function' ? getPendingInviteCount(u.id) : 0;
      var s = IC().seats({ limit: limit, athletes: athletes, pending: pending });
      s.athletes = athletes; s.pending = pending;
      var tier = typeof getCurrentTier === 'function' ? getCurrentTier() : 'free';
      s.plan = (typeof TIER_LABELS !== 'undefined' && TIER_LABELS[tier]) || 'Free';
      return s;
    }
    function rosterStep(dir) {
      var a2 = IC().setFields(st.a, st.fields);
      var ctx = { athletes: rosterList(), invites: (Store.get().invites || []).filter(function (i) { return i.coachId === u.id; }) };
      var plan = IC().planRoster(a2, ctx);
      var seats = seatsNow();
      IC().pickWithin(plan.people, seats.left);
      st.roster = plan;
      var filter = 'all', emailOn = plan.people.some(function (p) { return p.email; });
      var inner = ui.step({ title: 'Pick who to invite', sub: '', back: backFromStep(), dir: dir || 'fwd', wide: true, tall: plan.people.length > 4 });
      var seatBox = el('div', {});
      var recBox = el('div', {});
      var colBox = el('div', {});
      var listSec = el('div', { class: 'im-sec' });
      var pickLine = el('div', { class: 'im-pickline', 'aria-live': 'polite' });
      var wallBox = el('div', {});
      var people = el('div', { class: 'im-people', role: 'group', 'aria-label': 'People in the file' });
      inner.appendChild(seatBox); inner.appendChild(recBox); inner.appendChild(colBox);
      var chips = el('div', { class: 'im-chips', style: 'margin:22px 0 12px' });
      inner.appendChild(chips);
      listSec.style.marginTop = '0';
      listSec.appendChild(pickLine); listSec.appendChild(wallBox); listSec.appendChild(people);
      inner.appendChild(listSec);
      var go = btn('Create invites', 'btn-primary btn-lg');
      ui.setFoot([go]);
      var rec = recognisedLine(st.a.recognised, true);
      if (rec) recBox.appendChild(el('div', { class: 'im-rec', style: 'margin-top:16px' }, el('i'), rec));
      var picked = function () { return plan.people.filter(function (p) { return p.picked; }); };
      var nameMissing = function () { var f = st.fields; return f.indexOf('fullName') < 0 && f.indexOf('first') < 0 && f.indexOf('email') < 0; };
      function paintSeats() {
        seatBox.innerHTML = '';
        var n = picked().length;
        var box = el('div', { class: 'im-seats' + (!seats.unlimited && seats.left === 0 ? ' is-full' : '') });
        var big = el('div', { class: 'im-seats-n' });
        big.appendChild(el('b', {}, seats.unlimited ? '∞' : String(Math.max(0, seats.left - n))));
        box.appendChild(big);
        var main = el('div', { class: 'im-seats-main' });
        main.appendChild(el('b', {}, seats.unlimited ? 'Unlimited seats' : (seats.left - n === 1 ? 'seat' : 'seats') + ' left after these'));
        main.appendChild(el('span', {}, seats.plan + ' plan · ' + plural(seats.athletes, 'lifter') + (seats.pending ? ' and ' + plural(seats.pending, 'unused invite') : '') + (seats.unlimited ? '' : ' of ' + seats.limit + ' seats')));
        if (!seats.unlimited && seats.limit <= 30) {
          var bar = el('div', { class: 'im-seatbar', 'aria-hidden': 'true' });
          for (var k = 0; k < seats.limit; k++) bar.appendChild(el('i', { class: k < seats.used ? 'is-used' : k < seats.used + n ? 'is-pick' : '' }));
          main.appendChild(bar);
        }
        box.appendChild(main);
        seatBox.appendChild(box);
      }
      function paintCols() {
        colBox.innerHTML = '';
        var unplaced = st.a.unplaced.filter(function (i) { return st.fields[i] == null; });
        var must = nameMissing();
        if (!unplaced.length && !must) return;
        var det = el('details', { class: 'im-skip', style: 'margin-top:16px' });
        if (must) det.setAttribute('open', '');
        det.appendChild(el('summary', {}, must ? 'Which column has the names?' : plural(unplaced.length, 'other column') + ' left out'));
        var box = el('div', { class: 'im-cols', style: 'margin:0 10px 12px' });
        (must ? st.a.headers.map(function (h, i) { return i; }).filter(function (i) { return st.a.keys[i]; }) : unplaced).forEach(function (i) {
          box.appendChild(colRow(i, true, function () { rosterStep('fwd'); }));
        });
        det.appendChild(box);
        colBox.appendChild(det);
      }
      function paintChips() {
        chips.innerHTML = '';
        var opts = [['all', 'Everyone', plan.people.length]];
        Object.keys(plan.statuses).forEach(function (s) { opts.push(['s:' + s, s.charAt(0).toUpperCase() + s.slice(1), plan.statuses[s]]); });
        Object.keys(plan.groups).forEach(function (g) { opts.push(['g:' + g, g, plan.groups[g]]); });
        if (opts.length < 3) { chips.hidden = true; return; }
        chips.hidden = false;
        opts.forEach(function (o) {
          var c = el('button', { type: 'button', class: 'im-chip' + (filter === o[0] ? ' on' : ''), 'aria-pressed': filter === o[0] ? 'true' : 'false' }, o[1] + ' ', el('small', {}, String(o[2])));
          c.addEventListener('click', function () { filter = o[0]; paintChips(); paintPeople(); });
          chips.appendChild(c);
        });
      }
      var visible = function (p) { return filter === 'all' || (filter.indexOf('s:') === 0 ? p.status === filter.slice(2) : p.groups.indexOf(filter.slice(2)) >= 0); };
      var pickable = function (p) { return p.state === 'new' || p.state === 'noEmail' || p.state === 'badEmail'; };
      var STATE = { onRoster: 'On your roster', invited: 'Invited already', duplicate: 'Twice in the file' };
      function paintPeople() {
        people.innerHTML = '';
        plan.people.filter(visible).forEach(function (p) {
          var off = !pickable(p);
          var row = el('label', { class: 'im-person' + (off ? ' is-off' : '') });
          var cb = el('input', { type: 'checkbox', 'aria-label': p.name });
          cb.checked = !!p.picked; cb.disabled = off;
          cb.addEventListener('change', function () {
            if (cb.checked && !seats.unlimited && picked().length >= seats.left) { cb.checked = false; wall(true); return; }
            p.picked = cb.checked; p.overLimit = false;
            paintLine(); paintSeats(); wall(false);
          });
          row.appendChild(cb);
          row.appendChild(el('span', { class: 'im-box', html: IC_CHECK, 'aria-hidden': 'true' }));
          var av = el('span', { class: 'ui-av av-h' + (typeof avatarHue === 'function' ? avatarHue(p.name) : 0), 'data-name': p.name, 'aria-hidden': 'true' }, typeof initials === 'function' ? initials(p.name) : p.name.charAt(0));
          row.appendChild(av);
          var main = el('span', { class: 'im-person-main' });
          main.appendChild(el('b', {}, p.name));
          main.appendChild(el('span', {}, off ? (p.email || '') : p.email ? p.email + (p.archived ? ' · ' + (p.status || 'Archived') : '') : p.state === 'badEmail' ? 'Email "' + p.emailRaw + '" doesn\'t look right: you\'ll get a link' : 'No email: you\'ll get a link to send'));
          row.appendChild(main);
          if (off) row.appendChild(el('span', { class: 'im-state' }, STATE[p.state]));
          else if (p.archived) row.appendChild(el('span', { class: 'im-state is-warn' }, p.status || 'Archived'));
          people.appendChild(row);
        });
        paintLine();
      }
      function paintLine() {
        pickLine.innerHTML = '';
        var n = picked().length, can = plan.people.filter(function (p) { return pickable(p); }).length;
        var l = el('span', {});
        l.appendChild(el('b', {}, nf(n))); l.appendChild(document.createTextNode(' of ' + plural(plan.people.length, 'person', 'people') + ' picked'));
        pickLine.appendChild(l);
        var all = el('button', { type: 'button', class: 'im-quiet', style: 'min-height:36px' }, n && n >= Math.min(can, seats.unlimited ? can : seats.left) ? 'Clear' : 'Pick all that fit');
        all.addEventListener('click', function () {
          if (all.textContent === 'Clear') plan.people.forEach(function (p) { p.picked = false; });
          else {
            var room = seats.unlimited ? Infinity : seats.left - picked().length;
            plan.people.filter(visible).forEach(function (p) { if (!p.picked && pickable(p) && room > 0) { p.picked = true; room--; } });
          }
          paintPeople(); paintSeats(); wall(false);
        });
        if (can) pickLine.appendChild(all);
        go.disabled = !n;
        go.textContent = n ? 'Create ' + plural(n, 'invite') : 'Pick who to invite';
      }
      // At the plan's seats: say so where the tap was, and the way to more.
      function wall(on) {
        wallBox.innerHTML = '';
        if (seats.unlimited) return;
        var waiting = plan.people.filter(function (p) { return !p.picked && pickable(p) && !p.archived; }).length;
        var full = picked().length >= seats.left;
        if (!on && !(seats.left === 0) && !(full && waiting)) return;
        var al = el('div', { class: 'im-alert im-wall', role: 'status', style: 'margin:0 0 12px' });
        al.appendChild(el('p', {}, seats.left === 0 ? 'Your plan has no seats left. Each lifter and each unused invite holds one.'
          : 'Your plan has room for ' + plural(seats.left, 'more lifter') + (waiting ? ': ' + plural(waiting, 'other person', 'other people') + ' stay' + (waiting === 1 ? 's' : '') + ' unticked.' : '.') + (on ? ' Untick someone first.' : '')));
        if (canSeePlans()) al.appendChild(btn('See plans', 'ui-btn-soft', function () { openUpgradeModal('cap'); }));
        wallBox.appendChild(al);
      }
      // Email each invite, or just make the links.
      var mailSec = section(inner, '');
      if (plan.people.some(function (p) { return p.email; })) {
        var srow = el('div', { class: 'im-switchrow' });
        var sm = el('div', { class: 'im-col-main' });
        sm.appendChild(el('b', {}, 'Email their invites'));
        sm.appendChild(el('span', {}, isDemo() ? 'Demo: no emails go out.' : 'From POWALIFTA, with your name on it. People without an email get a link you can send.'));
        srow.appendChild(sm);
        srow.appendChild(uiSwitch(emailOn, function (on) { emailOn = on; }, 'Email their invites'));
        mailSec.appendChild(srow);
      }
      var kept = 'Kept: names, emails' + (Object.keys(plan.groups).length ? ' and groups' : '') + '.';
      var left = plan.leftOut.length ? ' Left in the file: ' + plan.leftOut.slice(0, 3).join(', ') + (plan.leftOut.length > 3 ? ' and ' + (plan.leftOut.length - 3) + ' more' : '') + '.' : '';
      mailSec.appendChild(el('p', { class: 'im-note' }, kept + left + (plan.dropped.length ? ' Card and payment columns are never read.' : '')));
      go.addEventListener('click', function () { createInvites(picked(), emailOn); });
      paintSeats(); paintCols(); paintChips(); paintPeople(); wall(false);
      if (!plan.people.length) {
        people.hidden = true;
        listSec.appendChild(el('div', { class: 'im-alert' }, el('p', {}, nameMissing() ? 'Pick the column with the names or emails above.' : 'No one could be read from it: no names or emails.')));
      }
    }
    function createInvites(list, email) {
      var seats = seatsNow();
      if (!list.length) return;
      if (!seats.unlimited && list.length > seats.left) { toast('Your plan has room for ' + plural(seats.left, 'more lifter') + '.'); return; }
      var taken = {};
      (Store.get().invites || []).forEach(function (i) { taken[i.code] = 1; });
      var invs = [];
      list.forEach(function (p) { var code = newCode(taken); if (code) invs.push({ code: code, coachId: u.id, email: p.email || '', used: false, createdAt: Date.now(), _p: p }); });
      var rows = invs.map(function (i) { return { code: i.code, coachId: i.coachId, email: i.email, used: false, createdAt: i.createdAt }; });
      ui.guard(function () { return { block: 'Saving the invites. One moment.' }; });
      ui.foot.querySelectorAll('button').forEach(function (b) { b.disabled = true; });
      var save = isDemo() || !(window.DB && DB.imAddInvites) ? Promise.resolve({ ok: true, saved: rows.map(function (r) { return r.code; }) }) : DB.imAddInvites(rows);
      save.then(function (r) { return r; }, function (e) { return { ok: false, saved: [], error: e }; }).then(function (r) {
        var ok = {}; (r.saved || []).forEach(function (c) { ok[c] = 1; });
        var made = invs.filter(function (i) { return ok[i.code]; });
        if (made.length) Store.update(function (s) { s.invites = (s.invites || []).concat(made.map(function (i) { return { code: i.code, coachId: i.coachId, email: i.email, used: false, createdAt: i.createdAt }; })); });
        try { if (typeof renderRoster === 'function') renderRoster(); } catch (e) { /* the roster repaints on its own next time */ }
        ui.guard(null);
        if (!made.length) {
          ui.foot.querySelectorAll('button').forEach(function (b) { b.disabled = false; });
          toast('Couldn\'t save the invites. Check the connection and try again.', 4000);
          return;
        }
        var maps = IC().rememberMapping(rememberedMaps(), st.a.headers, st.fields, today());
        saveMaps(maps);
        rosterDone(made, email, made.length < invs.length);
      });
    }
    function rosterDone(made, email, partial) {
      var inner = ui.step({ title: 'Invites ready', sub: '', back: null, dir: 'fwd', wide: true, tall: made.length > 4 });
      var d = el('div', { class: 'im-done' });
      d.appendChild(el('span', { class: 'im-done-ic', html: IC_CHECK }));
      d.appendChild(el('b', {}, plural(made.length, 'invite')));
      d.appendChild(el('p', {}, 'Each link works for one lifter, and holds a seat until it\'s used.' + (partial ? ' Some didn\'t save: pick them again from the file.' : '')));
      if (isDemo()) d.appendChild(el('p', {}, 'Demo: no emails go out and nothing is saved.'));
      inner.appendChild(d);
      var status = el('p', { class: 'im-note', role: 'status', 'aria-live': 'polite', style: 'text-align:center' });
      inner.appendChild(status);
      var list = el('div', { class: 'im-people im-links', style: 'margin-top:12px' });
      var ends = {};
      made.forEach(function (i) {
        var row = el('div', { class: 'im-person' });
        row.appendChild(el('span', { class: 'ui-av av-h' + (typeof avatarHue === 'function' ? avatarHue(i._p.name) : 0), 'data-name': i._p.name, 'aria-hidden': 'true' }, typeof initials === 'function' ? initials(i._p.name) : ''));
        var main = el('span', { class: 'im-person-main' });
        main.appendChild(el('b', {}, i._p.name));
        var sub = el('span', {}, i.email || 'No email: send the link');
        main.appendChild(sub);
        row.appendChild(main);
        var cp = btn('Copy link', 'ui-btn-soft', function () { copyText(inviteUrl(i.code)).then(function () { cp.textContent = 'Copied'; setTimeout(function () { cp.textContent = 'Copy link'; }, 1600); }, function () { toast(inviteUrl(i.code)); }); });
        cp.setAttribute('aria-label', 'Copy ' + i._p.name + '\'s invite link');
        row.appendChild(cp);
        ends[i.code] = sub;
        list.appendChild(row);
      });
      inner.appendChild(list);
      var copyAll = btn('Copy all links', 'ui-btn-soft', function () {
        var text = made.map(function (i) { return i._p.name + ': ' + inviteUrl(i.code); }).join('\n');
        copyText(text).then(function () { toast('All ' + made.length + ' links copied'); }, function () { toast('Couldn\'t copy. Try one at a time'); });
      });
      var done = btn('Done', 'btn-primary', function () { ui.close(true); });
      var row = el('div', { class: 'im-foot-row' });
      row.appendChild(copyAll); row.appendChild(done);
      ui.setFoot([row]);
      // Emails one at a time (send-invite allows 40 an hour per coach).
      var mails = email ? made.filter(function (i) { return i.email; }) : [];
      if (!mails.length) return;
      if (isDemo()) return;
      var k = 0, sent = 0;
      var nextMail = function () {
        if (ui.isClosed() && k > 0) { /* keeps sending with the sheet closed */ }
        if (k >= mails.length) { status.textContent = 'Emailed ' + plural(sent, 'invite') + (sent < mails.length ? '. Copy the other links below.' : '.'); return; }
        var i = mails[k];
        status.textContent = 'Emailing ' + (k + 1) + ' of ' + mails.length + '…';
        DB.sendInvite(i.email).then(function (r) {
          if (r && r.ok) { sent++; ends[i.code].textContent = i.email + ' · emailed'; }
          else if (r && r.status === 429) { status.textContent = 'Emailed ' + plural(sent, 'invite') + '. Emails pause at 40 an hour: copy the rest of the links below, or email them later.'; k = mails.length + 1; return; }
          else ends[i.code].textContent = i.email + ' · not emailed: copy the link';
          k++; nextMail();
        }, function () { ends[i.code].textContent = i.email + ' · not emailed: copy the link'; k++; nextMail(); });
      };
      nextMail();
    }

    // ---------------------------------------------------------------- samples (the demo)
    function loadSample(id) {
      var S = IC().SAMPLES;
      if (id === 'workbook') {
        var rd = reading('Training 2026.xlsx');
        IC().loadXlsx().then(function () {
          var bytes = IC().sampleWorkbookBytes();
          st.file = { name: 'Training 2026.xlsx', kind: 'xlsx', sample: true };
          return fromBytes('xlsx', bytes, 'Training 2026.xlsx', rd);
        }).then(function (res) { if (res) gotTables(res); }).catch(readError);
        return;
      }
      var s = S[id];
      if (!s) return;
      st.file = { name: s.name, kind: 'text', sample: true };
      gotTables({ name: s.name, tables: IC().tablesFromText(s.text, s.name) });
    }

    intake();
    if (opts.files && opts.files.length) readFiles([].slice.call(opts.files));
    else if (opts.sample) loadSample(opts.sample);
    return ui;
  }

  return { open: open };
})();
if (typeof window !== 'undefined') window.ImportUI = ImportUI;
