/* =====================================================================
   desk-season.js: the coach's season on the laptop desk (desk v2, 2026-10-22)
   ---------------------------------------------------------------------
   html.desk only, loaded after desk.js. Draws, in desk v2's system
   (DESIGN.md "Desk"), what the data layer of team programs and planned
   meets already knows:
   - TEAMS (rail: Programs › Teams): one team at a time, its lifters with
     their maxes, the week's loads (each lifter's kg from their own max),
     the team's program, and Push with a preview first (who gets what,
     logged sets kept, who you adjusted: keep or overwrite, who's skipped).
   - THE ROSTER CALENDAR (Roster: Board | List | Calendar): 16 weeks of
     blocks as bars with their W-n, meets as markers, a today line,
     warnings in plain words; drag a bar (or ← →) to move its start.
   - PLAN A MEET: one dialog (name, date, weigh-in, federation, division,
     class), from the calendar's head, each row, Meets and the lifter.
   - MEETS, when meetday.js isn't there: planned and done meets by date.
   - THE LAST WEEK OF A BLOCK: what it did, and the next block.
   The logic is pure and unit-tested in app.js (teamWeekLoads,
   teamPushPreview, calendarRows/calendarBarMeet/calendarWarnings,
   calendarDragWeeks/moveBlockStart, blockAchieved, pushTeamProgram).
   Every user string reaches the page as text (el() children) or through
   escHtml. ?demo=1 writes nothing: the Store only.
   ===================================================================== */

var _ds = { team: null, wk: null, cal: 0, focusBar: null, last: {}, moving: {}, okMove: {}, names: {}, saving: null,
  calGroup: (function () { try { return localStorage.getItem('powa-ds-calgroup') === 'team' ? 'team' : 'status'; } catch (e) { return 'status'; } })() };
try { _ds.names = JSON.parse(localStorage.getItem('powa-ds-names') || '{}') || {}; } catch (e) { _ds.names = {}; }
var DS_IC = {
  cal: _dkSvg('<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7 14.5h6" stroke-width="2.6"/>'),
  team: _dkSvg('<circle cx="8" cy="8.5" r="2.6"/><circle cx="16" cy="8.5" r="2.6"/><path d="M3.5 19a4.5 4.5 0 0 1 9 0M11.5 19a4.5 4.5 0 0 1 9 0"/>'),
  push: _dkSvg('<path d="M12 19V6"/><path d="M6.5 11.5 12 6l5.5 5.5"/><path d="M5 4h14"/>'),
  meetPlus: _dkSvg('<path d="M5 21V4M5 4h10l-2 4 2 4H5"/><path d="M18 15v6M15 18h6"/>')
};
function _dsMe() { var u = _dkUser(); return u ? u.id : null; }
function _dsDemo() { return !!window._demoMode; }
function dsTeams() { var me = _dsMe(); return (Store.get().teams || []).filter(function (t) { return !t.coachId || t.coachId === me; }); }
function dsTeamOf(aid) { return dsTeams().find(function (t) { return (t.members || []).some(function (m) { return m.athleteId === aid; }); }) || null; }
function dsAthlete(id) { return (Store.get().athletes || []).find(function (a) { return a.id === id; }) || null; }
// The last name a team member had: a lifter who leaves the roster is still named in the push preview.
function _dsKnownName(aid) {
  var a = dsAthlete(aid);
  if (a && a.name && _ds.names[aid] !== a.name) { _ds.names[aid] = a.name; try { localStorage.setItem('powa-ds-names', JSON.stringify(_ds.names)); } catch (e) {} }
  return (a && a.name) || _ds.names[aid] || null;
}
// A team save or push refused because the team changed elsewhere (another tab, another device):
// the latest team into the Store (the save's own answer, else a fresh list), and say so.
async function dsTeamLatest(team, latest) {
  var fresh = latest || null;
  if (!fresh && !_dsDemo() && window.DB && DB.listTeams) {
    var all = await DB.listTeams(_dsMe()).catch(function () { return null; });
    fresh = (all || []).find(function (t) { return t.id === team.id; }) || null;
  }
  if (fresh) Store.update(function (s) {
    var t = (s.teams || []).find(function (x) { return x.id === team.id; });
    if (!t) return;
    var keep = t.members;
    Object.assign(t, fresh);
    if (!(fresh.members || []).length) t.members = keep;
  });
  dsRenderTeams();
  toast(fresh ? 'The team was changed in another tab. You’re on the latest now: check it and push again' : 'The team was changed in another tab. Reload to get the latest, then push again');
}
// The team's program, edited once for everyone: fn(weeks) changes a copy (false cancels), saved with
// its compare-and-swap. One save at a time, each from the latest team in the Store.
function dsEditMaster(teamId, fn, done) {
  var run = async function () {
    var team = (Store.get().teams || []).find(function (t) { return t.id === teamId; });
    if (!team) return false;
    var weeks = _tmClone(team.weeks || []);
    var res = fn(weeks);
    if (res === false) return false;
    var r = await _dsSaveTeam(Object.assign({}, team, { weeks: weeks }));
    if (!r.ok) { if (r.conflict) await dsTeamLatest(team, r.latest); else toast('Could not save the team’s program. Try again'); return false; }
    Store.update(function (s) { var t = (s.teams || []).find(function (x) { return x.id === teamId; }); if (t) { t.weeks = weeks; t.rev = r.team && typeof r.team.rev === 'number' && !_dsDemo() ? r.team.rev : (Number(t.rev) || 0) + 1; } });
    if (done) done(res);
    return true;
  };
  _ds.saving = (_ds.saving || Promise.resolve()).then(run, run);
  return _ds.saving;
}
function _dsWeeks(n) { return n + (n === 1 ? ' week' : ' weeks'); }
// "squat, bench or deadlift"
function _dsList(l) { return l.length <= 1 ? (l[0] || '') : l.slice(0, -1).join(', ') + ' or ' + l[l.length - 1]; }
function _dsLifters(n) { return n + (n === 1 ? ' lifter' : ' lifters'); }
// A load in the lifter's own unit, as a number and its unit (the cell draws them apart).
function _dsLoad(kg, unit) { var t = teamLoadText(kg, unit); var m = /^(\S+)\s(\S+)$/.exec(t); return m ? { n: m[1], u: m[2] } : null; }

// ---------- the rail: Teams under Programs (desk.js's slot) ----------
window.deskProgramsSubnav = function (slot) {
  var n = dsTeams().length;
  var b = dkRailItem('teams', 'Teams', DS_IC.team, function () { deskGo('teams'); }, { go: true, cls: 'dk-item-sub' });
  if (n) b.appendChild(el('span', { class: 'dk-count' }, String(n)));
  slot.appendChild(b);
};
function dsBuildPanes() {
  if (document.querySelector('[data-pane="teams"]')) return;
  var main = document.querySelector('.dash-main');
  if (!main) return;
  var sec = el('section', { 'data-pane': 'teams', class: 'hidden' });
  sec.appendChild(el('div', { id: 'deskTeams', class: 'dk-meets ds-teams' }));
  main.appendChild(sec);
}

// =====================================================================
// TEAMS
// =====================================================================
function dsDeparted(team) {
  var s = Store.get();
  return (team.members || []).filter(function (m) {
    var a = (s.athletes || []).find(function (x) { return x.id === m.athleteId; });
    return !a || (team.coachId && a.coachId && a.coachId !== team.coachId);
  }).map(function (m) { return { athleteId: m.athleteId, name: _dsKnownName(m.athleteId) || 'A lifter who left' }; });
}
// The week the team is in now (its start date), else the first.
function dsTeamNowIdx(team) {
  var n = (team.weeks || []).length;
  if (!n) return 0;
  var st = _isoDay(team.startsOn);
  if (!st) return 0;
  var i = Math.round((Date.parse(_monISO(todayISO())) - Date.parse(_monISO(st))) / 6048e5);
  return Math.max(0, Math.min(n - 1, i));
}
function dsRenderTeams() {
  var host = document.getElementById('deskTeams');
  if (!host) return;
  if (!_dk.rows) dkRowsFresh();
  var teams = dsTeams();
  var keepScroll = host.parentNode ? host.parentNode.scrollTop : 0;
  host.innerHTML = '';
  if (!teams.length) { host.appendChild(dsTeamsEmpty()); return; }
  var team = teams.find(function (t) { return t.id === _ds.team; }) || teams[0];
  if (_ds.team !== team.id) { _ds.team = team.id; _ds.wk = null; }
  var weeks = team.weeks || [];
  if (_ds.wk == null || _ds.wk >= weeks.length) _ds.wk = dsTeamNowIdx(team);
  var members = teamMembersFor(team);
  (team.members || []).forEach(function (m) { _dsKnownName(m.athleteId); });
  var preview = teamPushPreview(team, members, { departed: dsDeparted(team) });

  // The head: the name, one quiet line of facts, the tools, the one red Push.
  var head = el('div', { class: 'ds-head' });
  var id = el('div', { class: 'ds-head-id' });
  var tr = el('div', { class: 'dk-title-row' });
  tr.appendChild(el('h1', { class: 'dk-h1' }, team.name || 'Team'));
  if (teams.length > 1) {
    var pick = dkBtn('Switch team', { cls: 'is-quiet dk-btn-sm dk-btn-menu' });
    pick.insertAdjacentHTML('beforeend', '<span class="dk-btn-caret">' + DK_IC.chevD + '</span>');
    pick.setAttribute('aria-haspopup', 'menu');
    pick.addEventListener('click', function (e) { e.stopPropagation(); dkPopMenu(pick, teams.map(function (t) { return { label: t.name || 'Team', hint: _dsLifters((t.members || []).length), check: t.id === team.id, run: function () { _ds.team = t.id; _ds.wk = null; dsRenderTeams(); } }; })); });
    tr.appendChild(pick);
  }
  id.appendChild(tr);
  var facts = el('p', { class: 'ds-facts' });
  [ _dsLifters(members.length), team.programName || '', weeks.length ? _dsWeeks(weeks.length) : '', _isoDay(team.startsOn) ? 'from ' + fmtDateShort(team.startsOn) : '',
    _isoDay(team.meetDate) ? 'meet ' + fmtDateShort(team.meetDate) : '' ].filter(Boolean).forEach(function (t, i) {
    if (i) facts.appendChild(el('span', { class: 'ds-sep', 'aria-hidden': 'true' }, '·'));
    facts.appendChild(el('span', {}, t));
  });
  id.appendChild(facts);
  head.appendChild(id);
  var tools = el('div', { class: 'ds-head-tools' });
  tools.appendChild(dkBtn('Add lifters', { icon: DK_IC.plus, cls: 'is-quiet', onClick: function () { dsAddMembers(team); } }));
  tools.appendChild(dkBtn('Plan a meet', { icon: DS_IC.meetPlus, cls: 'is-quiet', title: 'One meet for everyone on ' + (team.name || 'the team') + ', or the lifters you pick', onClick: function () { dsPlanMeet(null, { team: team }); } }));
  var more = dkIconBtn(DK_IC.more, 'More', function (e) {
    e.stopPropagation();
    dkPopMenu(more, [
      { label: 'Rename team…', run: function () { dsRenameTeam(team); } },
      { label: 'New team…', run: function () { dsNewTeam(null); } },
      '-',
      { label: 'Delete team', danger: true, run: function () { dsDeleteTeam(team); } }
    ], { alignRight: true });
  });
  more.setAttribute('aria-haspopup', 'menu');
  tools.appendChild(more);
  var pushSlot = el('span', { class: 'ds-push-slot' });
  var nAdj = preview.rows.filter(function (r) { return r.adjusted.length; }).length;
  if (preview.pushing) {
    pushSlot.appendChild(dkBtn('Push to team', { primary: true, icon: DS_IC.push, count: preview.pushing,
      title: 'See who gets what first: nothing is written until you push', onClick: function () { dsPushPreview(team); } }));
  } else {
    var st = el('span', { class: 'dk-state', role: 'status' }, 'Everyone has the latest');
    dkTip(st, 'Every lifter on the team has the team’s program, with their own loads');
    pushSlot.appendChild(st);
    // Their own adjustments can still go back to the team's version: one quiet way in.
    if (nAdj) pushSlot.appendChild(dkBtn(nAdj + ' adjusted by you', { cls: 'is-quiet dk-btn-sm', title: 'Keep them, or give a lifter the team’s version again', onClick: function () { dsPushPreview(team); } }));
  }
  tools.appendChild(pushSlot);
  head.appendChild(tools);
  host.appendChild(head);

  // The last push, said once under the head.
  var last = _ds.last[team.id];
  if (last && last.lines.length) {
    var lp = el('div', { class: 'ds-last', role: 'status' });
    lp.appendChild(el('i', { class: 'dk-dot t-ok', 'aria-hidden': 'true' }));
    lp.appendChild(el('span', {}, 'Pushed ' + _dkAgoTime(last.at) + ' · ' + last.lines.join(' · ')));
    host.appendChild(lp);
  }

  if (!weeks.length) { host.appendChild(el('div', { class: 'dk-noresults' }, el('b', {}, 'Nothing written for the team yet'), el('span', {}, 'Make a lifter’s block the team’s program to start.'))); return; }

  // Weeks: one strip, it drives the loads and the program below it.
  var nowIdx = dsTeamNowIdx(team);
  var strip = el('div', { class: 'ds-weeks', role: 'tablist', 'aria-label': 'Weeks of the team’s program' });
  weeks.forEach(function (w, i) {
    var on = i === _ds.wk;
    var b = el('button', { type: 'button', class: 'ds-wk' + (on ? ' is-sel' : ''), role: 'tab', 'aria-selected': String(on), tabindex: on ? '0' : '-1' });
    b.appendChild(el('b', {}, 'Week ' + (w.number || i + 1)));
    var start = _isoDay(team.startsOn) ? _addDaysISO(_monISO(team.startsOn), 7 * i) : null;
    b.appendChild(el('span', {}, i === nowIdx && start ? 'Now' : start ? fmtDateShort(start) : ''));
    b.addEventListener('click', function () { _ds.wk = i; dsRenderTeams(); var x = document.querySelector('#deskTeams .ds-wk.is-sel'); if (x) x.focus({ preventScroll: true }); });
    strip.appendChild(b);
  });
  strip.addEventListener('keydown', function (e) {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    _ds.wk = Math.max(0, Math.min(weeks.length - 1, _ds.wk + (e.key === 'ArrowRight' ? 1 : -1)));
    dsRenderTeams();
    var x = document.querySelector('#deskTeams .ds-wk.is-sel'); if (x) x.focus({ preventScroll: true });
  });
  host.appendChild(strip);

  var W = weeks[_ds.wk];
  host.appendChild(dsLoads(team, members, W, _ds.wk));
  // The team's program, the selected week: the builder's session cards, written once for everyone.
  host.appendChild(dsTeamProgram(team, W, _ds.wk));
  if (host.parentNode) host.parentNode.scrollTop = keepScroll;
}
// The loads: lifters down, the week's main sets across, each cell their own kg as a bar in the
// lift's colour (how heavy against the heaviest on the team), the number in ink.
function dsLoads(team, members, W, wi) {
  var mx = teamWeekLoads(team.weeks, _tmKey(W, wi), members);
  var sec = el('div', { class: 'ds-sec' });
  var hd = el('div', { class: 'ds-sec-head' });
  hd.appendChild(el('h2', { class: 'ds-sec-title' }, 'Loads, week ' + (W.number || wi + 1)));
  var anyKg = mx.cols.some(function (c) { return c.kind === 'kg'; });
  hd.appendChild(el('span', { class: 'ds-sec-sub' }, 'Each lifter’s load from their own max, rounded to their plates' + (anyKg ? ' (a set written in kg is the same kg for everyone)' : '') + '. Click a load to adjust it for one lifter.'));
  sec.appendChild(hd);
  if (!members.length) { sec.appendChild(el('div', { class: 'dk-noresults' }, el('b', {}, 'Nobody on the team yet'), el('span', {}, 'Add lifters and each one gets the program with their own loads.'))); return sec; }
  if (!mx.cols.length) { sec.appendChild(el('p', { class: 'dk-quiet-p' }, 'Week ' + (W.number || wi + 1) + ' has no squat, bench or deadlift written.')); }
  var grid = el('div', { class: 'ds-lx', role: 'table', 'aria-label': 'Loads for week ' + (W.number || wi + 1) });
  grid.style.setProperty('--ds-cols', String(mx.cols.length));
  var hr = el('div', { class: 'ds-lx-row is-head', role: 'row' });
  hr.appendChild(el('div', { class: 'ds-lx-who', role: 'columnheader' }, 'Lifter'));
  var colMax = mx.cols.map(function (c, ci) { return Math.max.apply(null, mx.rows.map(function (r) { return r.cells[ci].kg || 0; }).concat([1])); });
  var lastDay = null;
  mx.cols.forEach(function (c) {
    var th = el('div', { class: 'ds-lx-col lift-' + c.lift, role: 'columnheader' });
    th.appendChild(el('span', { class: 'ds-lx-day' + (c.dayId === lastDay ? ' is-same' : '') }, c.day));
    lastDay = c.dayId;
    var nm = el('span', { class: 'ds-lx-ex' });
    nm.appendChild(el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }));
    nm.appendChild(el('b', {}, c.label));
    th.appendChild(nm);
    th.appendChild(el('span', { class: 'ds-lx-rx' }, c.rx + (c.kind === 'kg' ? ' · same kg for all' : '')));
    hr.appendChild(th);
  });
  hr.appendChild(el('div', { class: 'ds-lx-act', role: 'columnheader' }, el('span', { class: 'dk-nil' }, 'Actions')));
  grid.appendChild(hr);
  var noMaxLines = [];
  mx.rows.forEach(function (row, ri) {
    var mb = members.find(function (m) { return m.athleteId === row.athleteId; }) || {};
    var r = dkRow(row.athleteId);
    var tr = el('div', { class: 'ds-lx-row', role: 'row', 'data-id': row.athleteId });
    tr.style.setProperty('--i', String(ri));
    var who = el('div', { class: 'ds-lx-who', role: 'rowheader' });
    who.appendChild(r ? dkRingAv(r, 'sm') : dkAv({ name: row.name }, 'is-sm'));
    var idw = el('div', { class: 'ds-lx-id' });
    var nb = el('button', { type: 'button', class: 'ds-lx-name' }, row.name);
    nb.addEventListener('click', function () { openAthletePage(row.athleteId); });
    dkTip(nb, 'Open ' + _dkFirst(row.name) + '’s page');
    idw.appendChild(nb);
    var sub = el('span', { class: 'ds-lx-sub' });
    if (r && r.live) { sub.appendChild(el('i', { class: 'dk-dot t-live', 'aria-hidden': 'true' })); sub.appendChild(el('span', { class: 'ds-live' }, 'Training now')); }
    var maxes = el('span', { class: 'ds-maxes' });
    MAIN_LIFTS.forEach(function (L) {
      var kg = teamMaxKg(mb.maxes, L);
      if (!(kg > 0)) return;
      var m = el('span', { class: 'ds-max lift-' + L });
      m.appendChild(el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }));
      m.appendChild(document.createTextNode(String(Math.round(kgToDisplay(kg)))));
      var src = teamMaxSource(mb.maxes, L);
      dkTip(m, (LIFT_LABELS[L] || L) + ' max ' + Math.round(kgToDisplay(kg)) + ' ' + unitLabel() + (src === 'program' ? ', the max you set for their block' : src === 'e1rm' ? ', their best e1RM' : src === 'meet' ? ', their best meet single' : ''));
      maxes.appendChild(m);
    });
    if (maxes.childNodes.length) { maxes.appendChild(el('span', { class: 'ds-unit' }, unitLabel())); sub.appendChild(maxes); }
    else sub.appendChild(el('span', { class: 'ds-nomax' }, 'No maxes yet'));
    idw.appendChild(sub);
    who.appendChild(idw);
    tr.appendChild(who);
    var miss = [];
    row.cells.forEach(function (c, ci) {
      var col = mx.cols[ci];
      var td = el('div', { class: 'ds-lx-col lift-' + col.lift + (c.ovr ? ' is-own' : ''), role: 'cell' });
      if (c.noMax) { miss.push((LIFT_LABELS[col.lift] || col.lift).toLowerCase()); td.appendChild(dkNil(c.note)); tr.appendChild(td); return; }
      var ld = _dsLoad(c.kg, row.unit);
      var b = el('button', { type: 'button', class: 'ds-cell' });
      var num = el('span', { class: 'ds-cell-n' });
      if (c.approx) num.appendChild(el('span', { class: 'ds-approx' }, '≈'));
      num.appendChild(document.createTextNode(ld ? ld.n : ''));
      if (ld) num.appendChild(el('small', {}, ' ' + ld.u));
      if (c.ovr) num.appendChild(el('i', { class: 'ds-own', 'aria-hidden': 'true' }));
      if (c.over) { td.classList.add('is-over'); num.appendChild(el('i', { class: 'dk-dot t-warn', 'aria-hidden': 'true' })); }
      b.appendChild(num);
      var bar = el('span', { class: 'ds-cell-bar', 'aria-hidden': 'true' });
      bar.appendChild(el('i', { style: 'width:' + Math.max(6, Math.min(100, (c.kg / colMax[ci]) * 100)).toFixed(1) + '%' }));
      b.appendChild(bar);
      var why = c.over ? 'The same ' + teamLoadText(c.kg, row.unit) + ' for everyone: above ' + _dkFirst(row.name) + '’s ' + (LIFT_LABELS[col.lift] || '').toLowerCase() + ' max of ' + _num(kgToDisplay(c.max)) + '. Click to adjust it for them, or write the team’s set as a %'
        : c.ovr ? 'Adjusted by you for ' + _dkFirst(row.name) + '. A push asks before changing it'
        : c.approx ? col.rx + ' from their ' + (LIFT_LABELS[col.lift] || '').toLowerCase() + ' max of ' + _num(kgToDisplay(c.max)) + ' (RPE chart)'
        : col.pct != null ? col.pct + '% of ' + _num(kgToDisplay(c.max)) : 'As written';
      b.setAttribute('aria-label', row.name + ', ' + col.label + ': ' + teamLoadText(c.kg, row.unit) + '. ' + why);
      dkTip(b, why + (c.logged ? ' · lifted' : ' · click to adjust'));
      b.addEventListener('click', function () { dsEditCell(team, mb, W, wi, col, c, td, b); });
      td.appendChild(b);
      tr.appendChild(td);
    });
    if (miss.length) noMaxLines.push(_dkFirst(row.name) + ' has no ' + _dsList(miss) + ' max yet: ' + (miss.length === 1 ? 'that load stays' : 'those loads stay') + ' blank');
    var act = el('div', { class: 'ds-lx-act', role: 'cell' });
    var mb2 = dkIconBtn(DK_IC.more, 'More for ' + row.name, function (e) {
      e.stopPropagation();
      var prog = mb.program && isTeamLinked(mb.program) ? mb.program : null;
      var own = 0;
      if (prog) _tmWalkEx(prog.weeks, function (x) { if (_tmExClaimed(x)) own++; });
      dkPopMenu(mb2, [
        { label: 'Open ' + _dkFirst(row.name) + '’s page', run: function () { openAthletePage(row.athleteId); } },
        { label: 'Open their program', run: function () { openAthleteProgram(row.athleteId); } },
        own ? { label: 'Reset to the team', hint: own + (own === 1 ? ' adjustment' : ' adjustments'), run: function () { dsResetMember(team, mb); } } : null,
        '-',
        { label: 'Remove from ' + (team.name || 'the team'), hint: 'Detaches them: their program stays theirs', danger: true, run: function () { dsRemoveMember(team, row.athleteId, row.name); } }
      ].filter(Boolean), { alignRight: true });
    });
    act.appendChild(mb2);
    tr.appendChild(act);
    grid.appendChild(tr);
  });
  sec.appendChild(grid);
  if (!_dkReduced()) grid.classList.add('is-in');
  if (noMaxLines.length) sec.appendChild(el('p', { class: 'ds-note' }, noMaxLines.join(' · ')));
  return sec;
}
// The team's program, one week: the builder's session cards and line editor, writing the team's
// program itself. Every edit is saved once (compare-and-swap on the team's rev); Push then says who
// it reaches. % stays %, so every lifter gets their own load; a lifter you adjusted keeps theirs.
function dsTeamProgram(team, W, wi) {
  var wnum = W.number || wi + 1;
  var ps = el('div', { class: 'ds-sec' });
  var ph = el('div', { class: 'ds-sec-head' });
  ph.appendChild(el('h2', { class: 'ds-sec-title' }, 'Week ' + wnum + ', the team’s program'));
  ph.appendChild(el('span', { class: 'ds-sec-sub' }, 'Write it once for everyone. Each lifter gets it at the next push on their own loads; what you adjusted for one stays theirs.'));
  var wk = dkBtn('Week ' + wnum, { cls: 'is-quiet dk-btn-sm dk-btn-menu ds-sec-tool', title: 'Move week ' + wnum + ' on a step, or add a week' });
  wk.insertAdjacentHTML('beforeend', '<span class="dk-btn-caret">' + DK_IC.chevD + '</span>');
  wk.setAttribute('aria-haspopup', 'menu');
  wk.addEventListener('click', function (e) {
    e.stopPropagation();
    var n = (team.weeks || []).length;
    dkPopMenu(wk, [
      { node: el('div', { class: 'dk-menu-title', role: 'presentation' }, 'Week ' + wnum + ', every lifter (their own edits stay theirs)') },
      { label: '+2.5% on % sets', hint: 'Squat, bench, deadlift', run: function () { dsProgressMaster(team, wi, 'pct'); } },
      { label: '+0.5 RPE on RPE sets', hint: 'Up to @10', run: function () { dsProgressMaster(team, wi, 'rpe'); } },
      '-',
      { label: 'Add week ' + (n + 1), hint: 'A copy of week ' + wnum, run: function () { dsAddMasterWeek(team, wi); } },
      n > 1 ? { label: 'Remove week ' + wnum, danger: true, run: function () { dsRemoveMasterWeek(team, wi); } } : null
    ].filter(Boolean), { alignRight: true });
  });
  ph.appendChild(wk);
  ps.appendChild(ph);
  var box = el('div', { class: 'dk-bxv ds-prog' });
  var days = el('div', { class: 'dk-bx-days' });
  (W.days || []).forEach(function (D, di) { days.appendChild(dsTeamDay(team, W, wi, D, di)); });
  box.appendChild(days);
  if (!(W.days || []).length) box.appendChild(el('p', { class: 'dk-quiet-p' }, 'Week ' + wnum + ' has no sessions yet.'));
  ps.appendChild(box);
  return ps;
}
// Repaint the team page after a save without taking the coach out of the line they're writing in.
function dsRepaintKeep() {
  var host = document.getElementById('deskTeams'), a = document.activeElement, key = null, val = null, sel = null;
  if (host && a && host.contains(a) && a.tagName === 'INPUT') {
    var line = a.closest('[data-cell]'), card = a.closest('.dk-bxd');
    key = line ? '[data-cell="' + line.dataset.cell + '"] input.dk-bx-in' : card ? '.dk-bxd[data-di="' + card.dataset.di + '"] input.dk-bx-addin' : null;
    val = a.value; sel = [a.selectionStart, a.selectionEnd];
  }
  dsRenderTeams();
  var t = key && host ? host.querySelector(key) : null;
  if (!t) return;
  t.value = val;
  t.focus({ preventScroll: true });
  try { t.setSelectionRange(sel[0], sel[1]); } catch (e) {}
}
function dsTeamDay(team, W, wi, D, di) {
  var exs = D.exercises || [];
  var card = el('article', { class: 'dk-bxd', 'data-di': String(di), 'aria-label': D.name || 'Day ' + (di + 1) });
  var head = el('header', { class: 'dk-bxd-head' });
  head.appendChild(el('i', { class: 'dk-dot t-none', 'aria-hidden': 'true' }));
  head.appendChild(el('h3', { class: 'dk-bxd-title' }, D.name || 'Day ' + (di + 1)));
  var sets = exs.reduce(function (n, e) { return n + (e.sets || []).filter(function (x) { return !x.extra; }).length; }, 0);
  head.appendChild(el('span', { class: 'dk-bxd-meta' }, exs.length ? exs.length + (exs.length === 1 ? ' exercise' : ' exercises') + ' · ' + sets + (sets === 1 ? ' set' : ' sets') : 'Nothing written yet'));
  card.appendChild(head);
  exs.forEach(function (ex, ei) { card.appendChild(dsTeamLine(team, W, wi, D, di, ex, ei)); });
  card.appendChild(dsTeamAddRow(team, wi, di, W.number || wi + 1));
  return card;
}
// A master prescription from what the coach wrote: % sets carry no kg (each lifter's comes from their max).
function dsParseMaster(text, lift) {
  var sets = gridParseCell(text, null, lift, null);
  if (!sets) return null;
  sets.forEach(function (st) { if (st.pct != null && st.pct !== '' && MAIN_LIFTS.indexOf(lift) >= 0) { st.weight = 0; delete st.weightHi; } });
  return sets;
}
function dsTeamLine(team, W, wi, D, di, ex, ei) {
  var title = _exShortTitle(ex) || exTitle(ex);
  var line = el('div', { class: 'dk-bx', 'data-cell': wi + '.' + di + '.' + ei });
  var id = el('div', { class: 'dk-bx-id lift-' + (MAIN_LIFTS.indexOf(ex.lift) >= 0 ? ex.lift : 'acc') });
  id.appendChild(el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }));
  id.appendChild(el('span', { class: 'dk-bx-name' }, title));
  line.appendChild(id);
  var wrap = el('div', { class: 'dk-bx-rx' });
  var inp = el('input', { type: 'text', class: 'dk-bx-in', spellcheck: 'false', autocomplete: 'off', placeholder: '3x5 75% @8', 'aria-label': title + ', week ' + (W.number || wi + 1) + ', the team’s' });
  inp.value = gridCellText(ex);
  var orig = inp.value;
  wrap.appendChild(inp);
  wrap.appendChild(dkBxRich(ex, { weeks: [] }, null));
  dkTip(wrap, 'Written once for the team: % of each lifter’s own max, or RPE. ↵ saves');
  line.appendChild(wrap);
  var done = false;
  var commit = function () {
    var text = inp.value.trim();
    if (text === orig) { inp.classList.remove('is-bad'); return true; }
    var parsed = text ? dsParseMaster(text, ex.lift) : [];
    if (parsed == null) { inp.classList.add('is-bad'); dkTip(wrap, 'Each part needs sets x reps, like 3x5 75% @8 or 1x3 @8'); return false; }
    inp.classList.remove('is-bad');
    orig = text;
    dsEditMaster(team.id, function (weeks) {
      var e = weeks[wi] && weeks[wi].days[di] && weeks[wi].days[di].exercises[ei];
      if (!e || e.id !== ex.id) return false;
      // Unchanged places keep their ids, so every lifter's linked set follows its own.
      e.sets = parsed.map(function (ns, i) { var old = e.sets[i]; if (old) ns.id = old.id; return ns; });
    }, function () { toast(title + ', week ' + (W.number || wi + 1) + ': saved for the team. Push when it reads right'); dsRepaintKeep(); });
    return true;
  };
  inp.addEventListener('focus', function () { line.classList.add('is-focus'); done = false; });
  inp.addEventListener('blur', function () { line.classList.remove('is-focus'); if (!done) commit(); });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); if (commit()) { done = true; var all = Array.prototype.slice.call(document.querySelectorAll('#deskTeams input.dk-bx-in, #deskTeams input.dk-bx-addin')); var t = all[all.indexOf(inp) + (e.shiftKey ? -1 : 1)]; if (t) t.focus(); else inp.blur(); } }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = orig; inp.classList.remove('is-bad'); done = true; inp.blur(); }
  });
  var more = el('button', { type: 'button', class: 'dk-icon-btn dk-bx-more', 'aria-label': title + ' options', 'aria-haspopup': 'menu', 'aria-expanded': 'false', html: DK_IC.more });
  more.addEventListener('click', function (e) {
    e.stopPropagation();
    dkPopMenu(more, [{ label: 'Remove from week ' + (W.number || wi + 1), danger: true, run: function () {
      dsEditMaster(team.id, function (weeks) {
        var d = weeks[wi] && weeks[wi].days[di];
        if (!d || !d.exercises[ei] || d.exercises[ei].id !== ex.id) return false;
        d.exercises.splice(ei, 1);
      }, function () { toast(title + ' removed from the team’s week ' + (W.number || wi + 1) + '. What a lifter logged stays'); dsRenderTeams(); });
    } }], { alignRight: true });
  });
  line.appendChild(more);
  return line;
}
function dsTeamAddRow(team, wi, di, wnum) {
  var row = el('div', { class: 'dk-bx-add' });
  row.insertAdjacentHTML('beforeend', DK_IC.plus);
  var inp = el('input', { type: 'text', class: 'dk-bx-addin', spellcheck: 'false', autocomplete: 'off', placeholder: 'Add an exercise', 'aria-label': 'Add an exercise to the team’s session, written like Pause squat 3x4 70%' });
  inp.addEventListener('focus', function () { inp.placeholder = 'Pause squat 3x4 70%, then ↵'; });
  inp.addEventListener('blur', function () { inp.placeholder = 'Add an exercise'; });
  row.appendChild(inp);
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); inp.value = ''; inp.classList.remove('is-bad'); inp.blur(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    var v = inp.value.trim();
    if (!v) return;
    var m = v.match(/^(.*?)[\s:–-]*(\d+\s*(?:x|×|\*|sets?\b).*)$/i);
    var name = (m ? m[1] : v).replace(/[\s:–-]+$/, '').trim(), rx = m ? m[2].trim() : '';
    if (!name) { inp.classList.add('is-bad'); dkTip(row, 'Start with the exercise: Squat 3x5 75%'); return; }
    var said = name.replace(/\bpause\b/i, 'Paused').replace(/\bcg\b/i, 'Close Grip').replace(/\bclose-grip\b/i, 'Close Grip');
    var me = matchExercise(said);
    var sets = rx ? dsParseMaster(rx, me.lift) : [];
    if (sets == null) { inp.classList.add('is-bad'); dkTip(row, 'The sets need sets x reps, like 3x5 75%'); return; }
    inp.classList.remove('is-bad');
    var ex = newExercise(me.lift, me.variant, me.exerciseName);
    ex.sets = sets;
    inp.value = '';
    dsEditMaster(team.id, function (weeks) {
      var d = weeks[wi] && weeks[wi].days[di];
      if (!d) return false;
      (d.exercises = d.exercises || []).push(ex);
    }, function () { toast(name + ' added to the team’s week ' + wnum + '. Push to give it to everyone'); dsRepaintKeep(); });
  });
  return row;
}
// Week N+1: a copy of a week (fresh ids, so every lifter gets it as a new week at the push).
function dsAddMasterWeek(team, wi) {
  dsEditMaster(team.id, function (weeks) {
    var src = weeks[wi];
    if (!src) return false;
    var num = Math.max.apply(null, weeks.map(function (w, i) { return Number(w.number) || i + 1; })) + 1;
    weeks.push({ id: uid('wk'), number: num, days: (src.days || []).map(function (d) {
      return { id: uid('day'), name: d.name, exercises: (d.exercises || []).map(function (e) {
        var ne = _tmClone(e); ne.id = uid('ex');
        ne.sets = (e.sets || []).map(function (x) { var c = _tmClone(x); c.id = uid('set'); return c; });
        return ne;
      }) };
    }) });
    return num;
  }, function (num) { _ds.wk = (((Store.get().teams || []).find(function (t) { return t.id === team.id; }) || {}).weeks || []).length - 1; toast('Week ' + num + ' added for the team. Push to give it to everyone'); dsRenderTeams(); });
}
function dsRemoveMasterWeek(team, wi) {
  var W = (team.weeks || [])[wi];
  if (!W) return;
  dsConfirm('Remove week ' + (W.number || wi + 1) + ' from the team?', 'At the next push it leaves every lifter’s program, except what they already logged in it.', 'Remove week', function () {
    dsEditMaster(team.id, function (weeks) { if (!weeks[wi] || weeks[wi].id !== W.id) return false; weeks.splice(wi, 1); },
      function () { _ds.wk = Math.max(0, wi - 1); toast('Week ' + (W.number || wi + 1) + ' removed. Push when it reads right'); dsRenderTeams(); });
  });
}
// The team's program, a step on for everyone (a master edit: saved with its compare-and-swap, then
// Push says who it reaches).
function dsProgressMaster(team, wi, kind) {
  var W = (team.weeks || [])[wi];
  if (!W) return;
  dsEditMaster(team.id, function (weeks) {
    var n = 0, w = weeks[wi];
    if (!w) return false;
    (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) {
      if (MAIN_LIFTS.indexOf(e.lift) < 0) return;
      (e.sets || []).forEach(function (st) {
        if (kind === 'pct' && st.pct != null && st.pct !== '' && Number(st.pct) > 0) { st.pct = Math.round((Number(st.pct) + 2.5) * 10) / 10; if (Number(st.pctHi) > 0) st.pctHi = Math.round((Number(st.pctHi) + 2.5) * 10) / 10; n++; }
        else if (kind === 'rpe' && (st.pct == null || st.pct === '') && Number(st.rpe) > 0 && Number(st.rpe) < 10) { st.rpe = Math.min(10, Number(st.rpe) + 0.5); if (Number(st.rpeHi) > 0) st.rpeHi = Math.min(10, Number(st.rpeHi) + 0.5); n++; }
      });
    }); });
    if (!n) { toast('Week ' + (W.number || wi + 1) + ' has no ' + (kind === 'pct' ? '% sets' : 'RPE-only sets') + ' on the main lifts'); return false; }
    return n;
  }, function (n) { toast('Week ' + (W.number || wi + 1) + ': ' + n + (n === 1 ? ' set' : ' sets') + ' a step on. Push when it reads right'); dsRenderTeams(); });
}
// One lifter's load, adjusted by hand: their copy of that exercise is theirs from now on (the next
// push asks: keep or overwrite). Sets they lifted are never rewritten.
function dsEditCell(team, mb, W, wi, col, c, td, btn) {
  var prog = mb.program && isTeamLinked(mb.program) ? mb.program : null;
  var first = _dkFirst(mb.name);
  if (!prog) { toast('Push first: ' + first + ' gets their own copy, then adjust it'); return; }
  var ex = null;
  _tmWalkEx(prog.weeks, function (e, d, w) { if (!ex && String(w.srcId) === _tmKey(W, wi) && String(d.srcId) === col.dayId && String(e.srcId) === col.exId) ex = e; });
  if (!ex) { toast(first + ' has no ' + col.label.toLowerCase() + ' this week'); return; }
  if ((ex.sets || []).every(isLoggedSet)) { toast(first + ' lifted it: what happened stays'); return; }
  var unitLb = mb.unit === 'lbs' || mb.unit === 'lb';
  var inp = el('input', { type: 'text', inputmode: 'decimal', class: 'ds-cell-in', 'aria-label': first + '’s ' + col.label + ' load in ' + (unitLb ? 'lb' : 'kg') });
  var cur = Number(c.kg) || 0;
  inp.value = cur > 0 ? String(unitLb ? Math.round(cur / KG_PER_LB * 10) / 10 : _num(cur)) : '';
  td.replaceChild(inp, btn);
  inp.focus(); inp.select();
  var done = false;
  var finish = function (save) {
    if (done) return;
    done = true;
    var v = parseFloat(String(inp.value).replace(',', '.'));
    if (!save || !(v > 0) || Math.abs((unitLb ? v * KG_PER_LB : v) - cur) < 0.01) { dsRenderTeams(); return; }
    var kg = unitLb ? v * KG_PER_LB : v;
    var ratio = cur > 0 ? kg / cur : 1;
    Store.update(function (s) {
      var p = (s.programs || []).find(function (x) { return x.id === prog.id; });
      if (!p) return;
      _tmWalkEx(p.weeks, function (e) {
        if (String(e.id) !== String(ex.id)) return;
        e.ovr = true;
        (e.sets || []).forEach(function (st) {
          if (isLoggedSet(st)) return;
          var w0 = Number(planWeight(st)) || cur;
          var nk = Math.round((w0 * ratio) / 2.5) * 2.5;
          if (Math.abs(w0 - cur) < 0.01) nk = Math.round(kg * 100) / 100;
          st.weight = nk; delete st.pct; delete st.pctHi; delete st.weightHi;
        });
      });
    });
    persistProgram(prog.id);
    toast(first + '’s ' + col.label.toLowerCase() + ' is ' + teamLoadText(kg, mb.unit) + ', theirs from now on');
    dsRenderTeams();
  };
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); finish(true); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(false); }
  });
  inp.addEventListener('blur', function () { finish(true); });
}
function dsResetMember(team, mb) {
  var prog = mb.program;
  if (!prog) return;
  var ids = [];
  _tmWalkEx(prog.weeks, function (e) { if (_tmExClaimed(e)) ids.push(e.id); });
  Store.update(function (s) {
    var p = (s.programs || []).find(function (x) { return x.id === prog.id; });
    if (!p) return;
    var w = p.weeks;
    ids.forEach(function (id) { w = teamResetExercise(w, id, team.weeks, { maxes: mb.maxes, unit: mb.unit }); });
    p.weeks = w;
  });
  persistProgram(prog.id);
  toast(_dkFirst(mb.name) + ' is on the team’s program again. Sets they lifted stay');
  dsRenderTeams();
}

// ---------- Push: a preview first, then the server's compare-and-swap ----------
function dsPushPreview(team) {
  var members = teamMembersFor(team);
  var departed = dsDeparted(team);
  var choice = {};   // athleteId → true: overwrite their adjustments
  var veil = el('div', { class: 'dk-veil' });
  var box = el('div', { class: 'dk-modal ds-pv', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Push ' + (team.name || 'the team') });
  var title = el('h2', { class: 'dk-modal-title' }, 'Push ' + (team.programName || team.name || 'the team’s program'));
  box.appendChild(title);
  var sub = el('p', { class: 'ds-pv-sub' });
  box.appendChild(sub);
  var list = el('div', { class: 'ds-pv-list' });
  box.appendChild(list);
  var row = el('div', { class: 'dk-modal-actions' });
  var cancel = dkBtn('Cancel', { onClick: close });
  var go = dkBtn('Push', { primary: true, icon: DS_IC.push, title: 'Push to the team', kbd: _dkMac() ? '⌘↵' : 'Ctrl ↵', onClick: run });
  row.appendChild(cancel); row.appendChild(go);
  box.appendChild(row);
  veil.appendChild(box);
  var pv = null;
  function paint() {
    pv = teamPushPreview(team, members, { departed: departed, overwrite: choice });
    sub.textContent = (pv.pushing ? 'Each lifter gets their own loads. Sets they logged stay as lifted. Nothing is written until you push.' : 'Nothing new to push. Choose Overwrite to give a lifter the team’s version again.');
    list.innerHTML = '';
    var shown = pv.rows.filter(function (r) { return r.push || r.adjusted.length; });
    shown.forEach(function (r) {
      var it = el('div', { class: 'ds-pv-row' });
      var rr = dkRow(r.athleteId);
      it.appendChild(rr ? dkRingAv(rr, 'sm') : dkAv({ name: r.name }, 'is-sm'));
      var txt = el('div', { class: 'ds-pv-t' });
      txt.appendChild(el('b', {}, r.name));
      var bits = [r.action === 'create' && r.noMax.length === MAIN_LIFTS.length ? 'Gets the block' : r.what];
      if (r.kept) bits.push(r.kept + (r.kept === 1 ? ' logged set kept' : ' logged sets kept'));
      if (r.noMax.length) bits.push('no ' + _dsList(r.noMax.map(function (L) { return (LIFT_LABELS[L] || L).toLowerCase(); })) + ' max yet: ' + (r.noMax.length === 1 ? 'that load stays' : 'those loads stay') + ' blank');
      if (r.over && r.over.length) bits.push('the team’s ' + _dsList(r.over.map(function (L) { return (LIFT_LABELS[L] || L).toLowerCase(); })) + ' in kg is above their max');
      txt.appendChild(el('span', {}, bits.join(' · ')));
      if (r.adjusted.length) {
        var adj = el('div', { class: 'ds-pv-adj' });
        adj.appendChild(el('i', { class: 'dk-dot t-warn', 'aria-hidden': 'true' }));
        adj.appendChild(el('span', {}, _dkFirst(r.name) + ': adjusted by you · ' + r.adjusted.map(function (a) { return (a.week ? 'week ' + a.week + ' ' : '') + String(a.title || '').toLowerCase(); }).join(', ')));
        var seg = el('div', { class: 'dk-seg ds-pv-seg', role: 'radiogroup', 'aria-label': 'Their adjustment' });
        [['keep', 'Keep'], ['overwrite', 'Overwrite']].forEach(function (x) {
          var on = r.choice === x[0];
          var sb = el('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) }, el('span', {}, x[1]));
          dkTip(sb, x[0] === 'keep' ? 'Their adjustment stays theirs; everything else follows the team' : 'They get the team’s version again, with their own loads');
          sb.addEventListener('click', function () { if (x[0] === 'overwrite') choice[r.athleteId] = true; else delete choice[r.athleteId]; paint(); });
          seg.appendChild(sb);
        });
        adj.appendChild(seg);
        txt.appendChild(adj);
      }
      it.appendChild(txt);
      list.appendChild(it);
    });
    if (pv.skipped.length) {
      var sk = el('div', { class: 'ds-pv-skip' });
      sk.appendChild(el('span', { class: 'ds-pv-skh' }, 'Skipped'));
      sk.appendChild(el('span', {}, pv.skipped.map(function (x) { var gone = /^No longer/.test(x.why); return (gone ? x.name : _dkFirst(x.name)) + ' (' + x.why.charAt(0).toLowerCase() + x.why.slice(1) + ')'; }).join(' · ')));
      list.appendChild(sk);
    }
    go.querySelector('.dk-btn-l').textContent = pv.pushing ? 'Push to ' + _dsLifters(pv.pushing) : 'Nothing to push';
    go.setAttribute('aria-label', go.querySelector('.dk-btn-l').textContent);
    go.disabled = !pv.pushing;
  }
  function onKey(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); e.stopImmediatePropagation(); run(); }
  }
  function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
  veil._close = close;
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
  document.addEventListener('keydown', onKey, true);
  paint();
  document.body.appendChild(veil);
  go.focus();
  async function run() {
    if (go.disabled || !pv || !pv.pushing) return;
    go.disabled = true; cancel.disabled = true;
    go.querySelector('.dk-btn-l').textContent = 'Pushing…';
    try {
      var u = _dkUser();
      var res = await pushTeamProgram(team, { overwrite: Object.keys(choice).length ? choice : null, coachName: (u && u.name) || '' });
      var ok = res.results.filter(function (x) { return x.status === 'updated' || x.status === 'created'; }).length;
      _ds.last[team.id] = { at: new Date().toISOString(), lines: res.report.filter(function (l) { return l.status !== 'same'; }).map(function (l) { return l.text; }) };
      close();
      toast(_dsLifters(ok) + ' updated' + (_dsDemo() ? '. The demo saves nothing' : ''));
      dkRowsFresh();
      dsRenderTeams();
      dkPaintRail();
    } catch (e) {
      if (e && e.conflict) { close(); dsTeamLatest(team, null); return; }
      cancel.disabled = false; go.disabled = false;
      go.querySelector('.dk-btn-l').textContent = 'Try again';
      toast((e && e.message) || 'Could not push. Nothing changed');
    }
  }
}

// ---------- members, new team, rename, delete ----------
function dsPickDialog(opts) {
  var veil = el('div', { class: 'dk-veil' });
  var box = el('div', { class: 'dk-modal ds-pick', role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title });
  box.appendChild(el('h2', { class: 'dk-modal-title' }, opts.title));
  if (opts.lead) box.appendChild(el('p', { class: 'ds-pv-sub' }, opts.lead));
  if (opts.top) box.appendChild(opts.top);
  var list = el('div', { class: 'ds-pick-list', role: 'group', 'aria-label': 'Lifters' });
  var picked = {};
  (opts.people || []).forEach(function (p) {
    var lab = el('label', { class: 'ds-pick-row' + (p.off ? ' is-off' : ''), 'data-id': p.id });
    var cb = el('input', { type: 'checkbox', class: 'dk-cb' });
    cb.disabled = !!p.off; cb.checked = !!p.on; if (p.on) picked[p.id] = true;
    cb.addEventListener('change', function () { picked[p.id] = cb.checked; paintGo(); });
    lab.appendChild(cb);
    lab.appendChild(dkAv(p, 'is-sm'));
    lab.appendChild(el('span', { class: 'ds-pick-n' }, p.name));
    if (p.note) lab.appendChild(el('span', { class: 'ds-pick-note' }, p.note));
    list.appendChild(lab);
  });
  if (!(opts.people || []).length) list.appendChild(el('p', { class: 'dk-quiet-p' }, opts.none || 'Nobody to add.'));
  box.appendChild(list);
  var row = el('div', { class: 'dk-modal-actions' });
  var cancel = dkBtn('Cancel', { onClick: close });
  var go = dkBtn(opts.go, { primary: true, onClick: function () { var ids = Object.keys(picked).filter(function (k) { return picked[k]; }); if (!ids.length && !opts.allowNone) return; close(); opts.run(ids); } });
  row.appendChild(cancel); row.appendChild(go);
  box.appendChild(row);
  veil.appendChild(box);
  function paintGo() { var n = Object.keys(picked).filter(function (k) { return picked[k]; }).length; go.disabled = !n && !opts.allowNone; }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }
  function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
  veil._close = close;
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
  document.addEventListener('keydown', onKey, true);
  paintGo();
  document.body.appendChild(veil);
  var f = box.querySelector('input:not([disabled])');
  if (f) f.focus();
  return box;
}
function dsAddMembers(team) {
  var me = _dsMe();
  var on = {};
  dsTeams().forEach(function (t) { (t.members || []).forEach(function (m) { on[m.athleteId] = t; }); });
  var people = (Store.get().athletes || []).filter(function (a) { return a.coachId === me && !(on[a.id] && on[a.id].id === team.id); })
    .sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
    .map(function (a) { var t = on[a.id]; return { id: a.id, name: a.name || 'Athlete', avatarUrl: a.avatarUrl, off: !!t, note: t ? 'On ' + (t.name || 'another team') : (dkProgOf(a.id) ? 'Their program is kept as a past block at the push' : 'No program yet') }; });
  dsPickDialog({ title: 'Add lifters to ' + (team.name || 'the team'), lead: 'They get the team’s program with their own loads at the next push.', people: people, go: 'Add', none: 'Everyone on your roster is on a team.',
    run: async function (ids) {
      var r = window.DB && DB.addTeamMembers && !_dsDemo() ? await DB.addTeamMembers(team, ids).catch(function () { return null; }) : { added: ids, refused: [] };
      var added = (r && r.added) || [];
      Store.update(function (s) { var t = (s.teams || []).find(function (x) { return x.id === team.id; }); if (t) added.forEach(function (a) { if (!(t.members || []).some(function (m) { return m.athleteId === a; })) (t.members = t.members || []).push({ athleteId: a, programId: null, pushedRev: null, pushedAt: null }); }); });
      toast(added.length ? _dsLifters(added.length) + ' added. Push to give them the program' : 'Nobody was added');
      dsRenderTeams(); dkPaintSubnav(true);
    } });
}
async function dsRemoveMember(team, aid, name) {
  if (window.DB && DB.removeTeamMember && !_dsDemo()) {
    var r = await DB.removeTeamMember(team, aid).catch(function (e) { return { ok: false, error: e }; });
    if (!r || !r.ok) { toast('Could not remove ' + _dkFirst(name) + '. Try again'); return; }
  }
  // Detached: their program, unlinked from the team (nothing else in it changes).
  var mine = (teamMembersFor(team).find(function (m) { return m.athleteId === aid; }) || {}).program;
  var linked = mine && isTeamLinked(mine);
  Store.update(function (s) {
    var t = (s.teams || []).find(function (x) { return x.id === team.id; }); if (t) t.members = (t.members || []).filter(function (m) { return m.athleteId !== aid; });
    var p = linked && (s.programs || []).find(function (x) { return x.id === mine.id; }); if (p) p.weeks = teamDetachProgram(p.weeks);
  });
  if (linked) persistProgram(mine.id);
  toast(_dkFirst(name) + ' left ' + (team.name || 'the team') + '. Their program stays theirs');
  dsRenderTeams();
}
function _dsTextDialog(title, label, value, goLabel, run) {
  var veil = el('div', { class: 'dk-veil' });
  var box = el('div', { class: 'dk-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title });
  box.appendChild(el('h2', { class: 'dk-modal-title' }, title));
  var inp = el('input', { type: 'text', class: 'ds-in', maxlength: '80', 'aria-label': label, placeholder: label });
  inp.value = value || '';
  var f = el('label', { class: 'ds-field' }, el('span', {}, label), inp);
  box.appendChild(f);
  var row = el('div', { class: 'dk-modal-actions' });
  row.appendChild(dkBtn('Cancel', { onClick: close }));
  row.appendChild(dkBtn(goLabel, { primary: true, onClick: go }));
  box.appendChild(row);
  veil.appendChild(box);
  function go() { var v = inp.value.trim(); if (!v) { inp.focus(); return; } close(); run(v); }
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } if (e.key === 'Enter' && e.target === inp) { e.preventDefault(); go(); } }
  function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
  veil._close = close;
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(veil);
  inp.focus(); inp.select();
}
async function _dsSaveTeam(team) {
  if (_dsDemo() || !(window.DB && DB.saveTeam)) return { ok: true, team: team };
  var r = await DB.saveTeam(team).catch(function (e) { return { ok: false, error: e }; });
  return r || { ok: false };
}
function dsRenameTeam(team) {
  _dsTextDialog('Rename team', 'Team name', team.name, 'Save', async function (v) {
    var next = Object.assign({}, team, { name: v.slice(0, 80) });
    var r = await _dsSaveTeam(next);
    if (!r.ok) { if (r.conflict) dsTeamLatest(team, r.latest); else toast('Could not rename. Try again'); return; }
    Store.update(function (s) { var t = (s.teams || []).find(function (x) { return x.id === team.id; }); if (t) { t.name = next.name; if (r.team && typeof r.team.rev === 'number') t.rev = r.team.rev; } });
    dsRenderTeams(); dkPaintSubnav(true);
  });
}
function dsConfirm(title, text, goLabel, run) {
  var veil = el('div', { class: 'dk-veil' });
  var box = el('div', { class: 'dk-modal', role: 'alertdialog', 'aria-modal': 'true', 'aria-label': title });
  box.appendChild(el('h2', { class: 'dk-modal-title' }, title));
  box.appendChild(el('p', { class: 'ds-pv-sub' }, text));
  var row = el('div', { class: 'dk-modal-actions' });
  var no = dkBtn('Cancel', { onClick: close });
  row.appendChild(no);
  row.appendChild(dkBtn(goLabel, { primary: true, onClick: function () { close(); run(); } }));
  box.appendChild(row);
  veil.appendChild(box);
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } }
  function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
  veil._close = close;
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(veil);
  no.focus();
}
function dsDeleteTeam(team) {
  dsConfirm('Delete ' + (team.name || 'this team') + '?', 'Every lifter keeps their own program as it is, with everything they logged.', 'Delete team', function () { (async function () {
    if (!_dsDemo() && window.DB && DB.deleteTeam) { var r = await DB.deleteTeam(team).catch(function () { return null; }); if (!r || !r.ok) { toast('Could not delete. Try again'); return; } }
    Store.update(function (s) { s.teams = (s.teams || []).filter(function (t) { return t.id !== team.id; }); });
    _ds.team = null;
    toast((team.name || 'The team') + ' deleted. Programs stay with their lifters');
    dsRenderTeams(); dkPaintSubnav(true);
  })(); });
}
// A team from one lifter's block: the block becomes the team's program (% sets stay %, and a main
// lift written in kg becomes a % of that lifter's max, so every lifter gets loads from their own max)
// and that lifter's copy links to it. pick: lifters ticked already (the roster's bulk bar).
function dsNewTeam(fromAid, pick) {
  var me = _dsMe();
  var progs = (Store.get().programs || []).filter(function (p) { var a = dsAthlete(p.athleteId); return a && a.coachId === me && (p.weeks || []).length; });
  if (!progs.length) { toast('Write one lifter’s block first, then make it the team’s'); return; }
  var picked = Array.isArray(pick) ? pick : null;
  var src = progs.find(function (p) { return p.athleteId === fromAid; }) || (picked && progs.find(function (p) { return picked.indexOf(p.athleteId) >= 0; })) || progs[0];
  var top = el('div', { class: 'ds-form' });
  var nm = el('input', { type: 'text', class: 'ds-in', maxlength: '80', placeholder: 'Meet team', 'aria-label': 'Team name' });
  top.appendChild(el('label', { class: 'ds-field' }, el('span', {}, 'Team name'), nm));
  var sel = el('select', { class: 'ds-in', 'aria-label': 'The program it starts from' });
  progs.forEach(function (p) { var a = dsAthlete(p.athleteId); sel.appendChild(el('option', { value: p.id }, (a ? a.name : 'Lifter') + ' · ' + (p.name || 'Program'))); });
  sel.value = src.id;
  top.appendChild(el('label', { class: 'ds-field' }, el('span', {}, 'Its program, from'), sel));
  // The lifter whose block it is goes on the team too (ticked for them; the coach can untick).
  var auto = picked ? null : src.athleteId;
  sel.addEventListener('change', function () {
    var p = progs.find(function (x) { return x.id === sel.value; });
    var tick = function (aid, on) { var cb = document.querySelector('.ds-pick .ds-pick-row[data-id="' + CSS.escape(aid) + '"] input'); if (cb && !cb.disabled && cb.checked !== on) cb.click(); };
    if (auto && (!p || auto !== p.athleteId)) tick(auto, false);
    if (p) { tick(p.athleteId, true); auto = p.athleteId; }
  });
  var on = {};
  dsTeams().forEach(function (t) { (t.members || []).forEach(function (m) { on[m.athleteId] = t; }); });
  var people = (Store.get().athletes || []).filter(function (a) { return a.coachId === me; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); })
    .map(function (a) { var t = on[a.id]; return { id: a.id, name: a.name || 'Athlete', avatarUrl: a.avatarUrl, off: !!t, on: !t && (picked ? picked.indexOf(a.id) >= 0 : a.id === src.athleteId), note: t ? 'On ' + (t.name || 'another team') : '' }; });
  dsPickDialog({ title: 'New team', lead: 'One program, every lifter on their own loads. Their edits stay theirs; logged sets are never rewritten.', top: top, people: people, go: 'Make the team',
    run: async function (ids) {
      var p = (Store.get().programs || []).find(function (x) { return x.id === sel.value; }) || src;
      var made = teamMasterFromProgram(p, teamMemberMaxes(p.athleteId, p));
      var team = { id: _dsDemo() ? uid('team') : undefined, coachId: me, name: (nm.value.trim() || 'Team').slice(0, 80), programName: p.name || '',
        weeks: made.weeks, startsOn: programStartsOn(p, todayISO()), meetDate: _isoDay(p.meetDate) && p.meetDate >= todayISO() ? _isoDay(p.meetDate) : null, members: [] };
      var r = await _dsSaveTeam(team);
      if (!r.ok) { toast('Could not make the team. Try again'); return; }
      team = Object.assign(team, r.team || {}, { members: [] });
      if (!_dsDemo() && window.DB && DB.addTeamMembers) { var ar = await DB.addTeamMembers(team, ids).catch(function () { return null; }); ids = (ar && ar.added) || []; }
      team.members = ids.map(function (a) { return { athleteId: a, programId: a === p.athleteId ? p.id : null, pushedRev: null, pushedAt: null }; });
      Store.update(function (s) {
        s.teams = (s.teams || []).concat([team]);
        if (ids.indexOf(p.athleteId) >= 0) { var q = (s.programs || []).find(function (x) { return x.id === p.id; }); if (q) q.weeks = made.linked; }
      });
      if (ids.indexOf(p.athleteId) >= 0) persistProgram(p.id);
      _ds.team = team.id; _ds.wk = null;
      deskGo('teams');
      dkPaintSubnav(true);
      toast(team.name + ' is ready. Push to give everyone their loads');
    } });
}
function dsTeamsEmpty() {
  var box = el('div', { class: 'ds-empty' });
  box.appendChild(el('h1', { class: 'dk-h1' }, 'Teams'));
  box.appendChild(el('p', {}, 'One program, many lifters. Every lifter trains it on their own loads from their own maxes; what you adjust for one stays theirs, and sets they logged are never rewritten.'));
  box.appendChild(dkBtn('Make a team', { primary: true, icon: DK_IC.plus, onClick: function () { dsNewTeam(null); } }));
  return box;
}
// The builder's Team button: their team's page, or a new team from this block.
window.deskBuilderTeam = function (aid) {
  var t = dsTeamOf(aid);
  if (t) { _ds.team = t.id; _ds.wk = null; deskGo('teams'); }
  else dsNewTeam(aid);
};

// =====================================================================
// THE ROSTER CALENDAR
// =====================================================================
var DS_CAL_WEEKS = 16, DS_CAL_BACK = 26;
function dsCalFrom() { return _addDaysISO(_monISO(todayISO()), 7 * _ds.cal); }
// One wide pass (26 weeks back, a year and more ahead) so warnings and W-n see past the window.
function dsCalRows(rows) {
  var s = Store.get();
  var from = _addDaysISO(_monISO(todayISO()), -7 * DS_CAL_BACK);
  return calendarRows({ athletes: rows.map(function (r) { return r.athlete; }), programs: s.programs || [], meets: s.meets || [], blocks: s.programBlocks || [],
    today: todayISO(), from: from, weeks: DS_CAL_BACK + 80 });
}
// Rows by team (each team, then everyone else), when the coach groups the calendar that way.
function dsCalGroups(rows) {
  if (_ds.calGroup !== 'team' || !dsTeams().length) return dkRosterGroups(rows, true);
  var byName = function (a, b) { return String(a.athlete.name).localeCompare(String(b.athlete.name)); };
  var left = rows.slice(), out = [];
  dsTeams().forEach(function (t) {
    var ids = (t.members || []).map(function (m) { return m.athleteId; });
    var mine = left.filter(function (r) { return ids.indexOf(r.athlete.id) >= 0; }).sort(byName);
    if (!mine.length) return;
    left = left.filter(function (r) { return mine.indexOf(r) < 0; });
    out.push({ key: 'team-' + t.id, label: t.name || 'Team', rows: mine });
  });
  if (left.length) out.push({ key: 'none', label: 'Not on a team', rows: left.sort(byName) });
  return out;
}
function dsPaintCalendar(body, rows) {
  var groups = dsCalGroups(rows);
  var flat = [];
  groups.forEach(function (g) { g.rows.forEach(function (r) { flat.push(r); }); });
  _dk.rorder = flat.map(function (r) { return r.athlete.id; });
  body.innerHTML = '';
  if (!rows.length) { body.appendChild(el('div', { class: 'dk-noresults' }, el('b', {}, _dk.search ? 'Nobody matches “' + _dk.search + '”' : 'Nobody in this view'), el('span', {}, 'Try another name.'))); return; }
  var wide = dsCalRows(flat);
  var base = DS_CAL_BACK + _ds.cal;   // the window's first week on the wide axis
  var todayW = DS_CAL_BACK;
  var from = dsCalFrom();
  var weeks = Array.from({ length: DS_CAL_WEEKS }, function (_, i) { return _addDaysISO(from, 7 * i); });

  // The bar of tools: back, this week, forward, the dates; the key.
  var nav = el('div', { class: 'ds-cal-nav' });
  nav.appendChild(dkIconBtn(DK_IC.chevL, 'Four weeks earlier', function () { _ds.cal -= 4; dkPaintRosterBody(); }));
  var tw = dkBtn('This week', { cls: 'is-quiet dk-btn-sm', onClick: function () { _ds.cal = 0; dkPaintRosterBody(); } });
  if (_ds.cal === 0) tw.setAttribute('aria-pressed', 'true');
  nav.appendChild(tw);
  nav.appendChild(dkIconBtn(DK_IC.chevR, 'Four weeks later', function () { _ds.cal += 4; dkPaintRosterBody(); }));
  nav.appendChild(el('span', { class: 'ds-cal-range' }, fmtDateShort(weeks[0]) + ' – ' + fmtDateShort(_addDaysISO(weeks[DS_CAL_WEEKS - 1], 6))));
  if (dsTeams().length) {
    var gseg = el('div', { class: 'dk-seg ds-cal-group', role: 'radiogroup', 'aria-label': 'Group the lifters' });
    [['status', 'By status'], ['team', 'By team']].forEach(function (x) {
      var on = _ds.calGroup === x[0];
      var gb = el('button', { type: 'button', class: 'dk-seg-btn' + (on ? ' on' : ''), role: 'radio', 'aria-checked': String(on) }, el('span', {}, x[1]));
      gb.addEventListener('click', function () { _ds.calGroup = x[0]; try { localStorage.setItem('powa-ds-calgroup', x[0]); } catch (e) {} dkPaintRosterBody(); });
      gseg.appendChild(gb);
    });
    nav.appendChild(gseg);
  }
  var key = el('span', { class: 'ds-cal-key', 'aria-hidden': 'true' });
  key.appendChild(el('span', {}, el('i', { class: 'ds-k-bar' }), 'Block'));
  key.appendChild(el('span', {}, el('i', { class: 'ds-mk is-planned' }), 'Planned meet'));
  key.appendChild(el('span', {}, el('i', { class: 'ds-mk' }), 'Meet done'));
  key.appendChild(el('span', {}, el('i', { class: 'ds-k-today' }), 'Today'));
  nav.appendChild(key);
  body.appendChild(nav);

  var cal = el('div', { class: 'ds-cal', role: 'grid', 'aria-label': 'Season calendar, ' + DS_CAL_WEEKS + ' weeks from ' + fmtDateShort(weeks[0]) });
  cal.style.setProperty('--ds-weeks', String(DS_CAL_WEEKS));
  // Week heads: the month where it changes, the Monday's date, this week marked.
  var hr = el('div', { class: 'ds-cal-row is-head', role: 'row' });
  hr.appendChild(el('div', { class: 'ds-cal-who', role: 'columnheader' }, 'Lifter'));
  var wh = el('div', { class: 'ds-cal-weeks', role: 'presentation' });
  var lastMon = null;
  weeks.forEach(function (w, i) {
    var mon = Number(w.slice(5, 7));
    var c = el('div', { class: 'ds-cal-wk' + (i + base === todayW ? ' is-now' : '') + (mon !== lastMon ? ' is-month' : ''), role: 'columnheader', 'aria-label': 'Week of ' + fmtDateShort(w) });
    c.appendChild(el('span', { class: 'ds-cal-mon' }, mon !== lastMon ? new Date(w + 'T12:00:00').toLocaleDateString(undefined, { month: 'short' }) : ''));
    c.appendChild(el('b', {}, String(Number(w.slice(8, 10)))));
    lastMon = mon;
    wh.appendChild(c);
  });
  hr.appendChild(wh);
  hr.appendChild(el('div', { class: 'ds-cal-act', role: 'columnheader' }, el('span', { class: 'dk-nil' }, 'Plan a meet')));
  cal.appendChild(hr);

  var pct = function (w) { return (w / DS_CAL_WEEKS * 100).toFixed(4) + '%'; };
  var monthAt = [];
  weeks.forEach(function (w, i) { if (i && w.slice(5, 7) !== weeks[i - 1].slice(5, 7)) monthAt.push(i); });
  var dayFrac = function (iso) { return ((new Date(iso + 'T12:00:00').getDay() + 6) % 7 + 0.5) / 7; };
  var todayX = todayW - base + dayFrac(todayISO());
  groups.forEach(function (g) {
    if (g.label && groups.length > 1) cal.appendChild(el('div', { class: 'ds-cal-gh', role: 'row' }, el('span', { role: 'rowheader' }, el('b', {}, g.label), el('span', {}, String(g.rows.length)))));
    g.rows.forEach(function (r) {
      var a = r.athlete;
      var w = wide.find(function (x) { return x.athleteId === a.id; }) || { bars: [], meets: [] };
      var warns = calendarWarnings(w, todayW);
      var row = el('div', { class: 'ds-cal-row' + (warns.length ? ' has-warn' : ''), role: 'row', 'data-id': a.id });
      var who = el('div', { class: 'ds-cal-who', role: 'rowheader' });
      var whoB = el('button', { type: 'button', class: 'ds-cal-whob' });
      whoB.appendChild(dkRingAv(r, 'sm'));
      var idw = el('span', { class: 'dk-bd-id' });
      idw.appendChild(el('span', { class: 'dk-bd-name' }, a.name));
      idw.appendChild(el('span', { class: 'dk-bd-sub' }, dkBlockText(r.status) || 'No program'));
      whoB.appendChild(idw);
      whoB.addEventListener('click', function () { openAthletePage(a.id); });
      who.appendChild(whoB);
      row.appendChild(who);
      var track = el('div', { class: 'ds-cal-track', role: 'gridcell' });
      // The scale: a faint rule where a month starts, and the today line. No rule per week.
      monthAt.forEach(function (i) { track.appendChild(el('i', { class: 'ds-mrule', style: 'left:' + pct(i), 'aria-hidden': 'true' })); });
      if (todayX >= 0 && todayX <= DS_CAL_WEEKS) track.appendChild(el('i', { class: 'ds-today', style: 'left:' + pct(todayX), 'aria-hidden': 'true' }));
      dsTrackPlan(track, a, weeks);
      w.bars.forEach(function (b) {
        var f = b.from - base, end = f + b.weeks;
        if (end <= 0 || f >= DS_CAL_WEEKS) return;
        var cf = Math.max(0, f), ce = Math.min(DS_CAL_WEEKS, end);
        var isProg = b.kind === 'program';
        var bm = isProg ? calendarBarMeet(b, w.meets, todayW) : null;
        var bar = el('div', { class: 'ds-bar ph-' + b.phase + (isProg ? '' : ' is-past') + (f < 0 ? ' is-cut-l' : '') + (end > DS_CAL_WEEKS ? ' is-cut-r' : ''),
          style: 'left:' + pct(cf) + ';width:' + pct(ce - cf) });
        if (b.current != null && b.current + f >= 0 && b.current + f < DS_CAL_WEEKS) bar.appendChild(el('i', { class: 'ds-bar-now', style: 'left:' + ((b.current + f - cf) / (ce - cf) * 100).toFixed(3) + '%;width:' + (100 / (ce - cf)).toFixed(3) + '%', 'aria-hidden': 'true' }));
        var lab = el('span', { class: 'ds-bar-l' });
        lab.appendChild(el('b', {}, b.name));
        if (bm && bm.n >= 0 && bm.n <= 24) lab.appendChild(el('span', { class: 'ds-bar-wn' }, bm.label));
        // A bar under three weeks wide (or cut by the window) says its name beside it, not in it.
        var narrow = ce - cf < 3 && ce < DS_CAL_WEEKS - 3;
        if (narrow) {
          // Past a meet marker that sits just after the bar, so the two never touch.
          var after = w.meets.map(function (m) { return m.week - base + dayFrac(m.date); }).filter(function (x) { return x >= ce - 0.6 && x <= ce + 1.5; });
          var at = after.length ? Math.max.apply(null, after) : ce;
          bar.classList.add('is-narrow'); lab.classList.add('is-out'); lab.style.left = 'calc(' + pct(Math.max(ce, at)) + ' + ' + (at > ce - 0.01 && after.length ? 14 : 12) + 'px)'; track.appendChild(lab);
        }
        else bar.appendChild(lab);
        var said = b.name + ', ' + fmtDateShort(b.start) + ' to ' + fmtDateShort(b.end || _addDaysISO(b.start, 7 * b.weeks - 1)) + ' (' + _dsWeeks(b.weeks) + ')' + (bm ? ', ' + (bm.n === 0 ? bm.name + ' week' : bm.label + ' to ' + bm.name) : '');
        if (isProg) {
          bar.dataset.pid = b.programId;
          bar.tabIndex = 0;
          bar.setAttribute('role', 'button');
          b.cut = cf - f;
          bar.setAttribute('aria-label', said + '. Click or Enter opens it; drag or the arrow keys move its start a week');
          dkTip(bar, said + ' · click to open that week, drag or ← → to move it', '↵');
          dsBarDrag(bar, b, a, track);
        } else { bar.setAttribute('aria-label', said + ', a past block'); dkTip(bar, said + ' · past block'); }
        track.appendChild(bar);
      });
      w.meets.forEach(function (m) {
        var x = m.week - base;
        if (x < 0 || x >= DS_CAL_WEEKS) return;
        var mk = el('span', { class: 'ds-mk' + (m.planned ? ' is-planned' : ''), style: 'left:' + pct(x + dayFrac(m.date)) });
        var wn = m.planned ? meetWeekLabel(_monISO(todayISO()), m.date) : '';
        var tip = m.name + ' · ' + fmtDateShort(m.date) + (m.planned ? ' · ' + (wn === 'Meet week' ? 'this week' : wn) : m.total ? ' · total ' + _num(kgToDisplay(m.total)) + ' ' + unitLabel() : '');
        mk.setAttribute('role', 'img'); mk.setAttribute('aria-label', tip);
        dkTip(mk, tip);
        track.appendChild(mk);
        if (!m.planned && m.total) track.appendChild(el('span', { class: 'ds-mk-t', style: 'left:' + pct(x + dayFrac(m.date)) }, String(_num(kgToDisplay(m.total)))));
      });
      if (warns.length) {
        var wl = el('div', { class: 'ds-warn' });
        wl.appendChild(el('i', { class: 'dk-dot t-warn', 'aria-hidden': 'true' }));
        wl.appendChild(el('span', {}, warns.map(function (x) { return x.text; }).join(' · ')));
        track.appendChild(wl);
      }
      row.appendChild(track);
      var act = el('div', { class: 'ds-cal-act', role: 'gridcell' });
      act.appendChild(dkIconBtn(DS_IC.meetPlus, 'Plan a meet for ' + _dkFirst(a.name), function () { dsPlanMeet(a.id); }));
      row.appendChild(act);
      cal.appendChild(row);
    });
  });
  body.appendChild(cal);
  if (_ds.focusBar) {
    var fb = cal.querySelector('.ds-bar[data-pid="' + CSS.escape(_ds.focusBar) + '"]');
    _ds.focusBar = null;
    if (fb) fb.focus({ preventScroll: true });
  }
}
// Drag a bar to move its block's start (whole weeks), or select it and use ← →. The bar follows the
// pointer, then settles on the week it lands in.
function dsBarDrag(bar, b, a, track) {
  var x0 = null, dx = 0, moved = false, col = 0;
  bar.addEventListener('pointerdown', function (e) {
    if (e.button !== 0 || _ds.moving[b.programId]) return;
    x0 = e.clientX; dx = 0; moved = false;
    col = track.getBoundingClientRect().width / DS_CAL_WEEKS;
    bar.setPointerCapture(e.pointerId);
  });
  bar.addEventListener('pointermove', function (e) {
    if (x0 == null) return;
    dx = e.clientX - x0;
    if (!moved && Math.abs(dx) < 4) return;
    moved = true;
    bar.classList.add('is-drag');
    bar.style.transform = 'translateX(' + dx + 'px)';
  });
  var end = function (e) {
    if (x0 == null) return;
    x0 = null;
    try { bar.releasePointerCapture(e.pointerId); } catch (er) {}
    bar.classList.remove('is-drag');
    if (!moved) { bar.style.transform = ''; return; }
    var n = calendarDragWeeks(dx, col);
    bar.classList.add('is-settle');
    bar.style.transform = 'translateX(' + (n * col) + 'px)';
    setTimeout(function () { dsMoveBlock(b.programId, n, a); }, _dkReduced() ? 0 : 180);
  };
  bar.addEventListener('pointerup', end);
  bar.addEventListener('pointercancel', end);
  // A click opens the block at the week clicked (the week they're in, from the keyboard).
  var open = function (wi) { _dk.pbWk = { prog: b.programId, wi: Math.max(0, Math.min(b.weeks - 1, wi)) }; openAthleteProgram(a.id); };
  bar.addEventListener('click', function (e) {
    e.stopPropagation();
    if (moved) { e.preventDefault(); moved = false; return; }
    var r = bar.getBoundingClientRect(), c = track.getBoundingClientRect().width / DS_CAL_WEEKS;
    open(Math.floor((e.clientX - r.left) / c) + (b.cut || 0));
  });
  bar.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); if (_ds.moving[b.programId]) return; _ds.focusBar = b.programId; dsMoveBlock(b.programId, e.key === 'ArrowRight' ? 1 : -1, a); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); open(b.current != null ? b.current : 0); }
  });
}
// A block with logged weeks: how far it's been lifted, and the latest Monday it can start on (no
// logged session may end up before its week begins). → { weeks, latest } | null
function dsTrained(prog) {
  var weeks = 0, latest = null;
  (prog.weeks || []).forEach(function (w, wi) { (w.days || []).forEach(function (d) { (d.exercises || []).forEach(function (e) { (e.sets || []).forEach(function (st) {
    if (!isLoggedSet(st)) return;
    weeks = Math.max(weeks, wi + 1);
    var c = _isoDay(st.completedAt);
    if (c) { var m = _addDaysISO(_monISO(c), -7 * wi); if (!latest || m < latest) latest = m; }
  }); }); }); });
  return weeks ? { weeks: weeks, latest: latest } : null;
}
// One move at a time per block: keys and drags wait while a save is out, and a refused save goes
// back to what the server last had (no start at all, if it had none).
async function dsMoveBlock(pid, n, a, opts) {
  opts = opts || {};
  var prog = (Store.get().programs || []).find(function (p) { return p.id === pid; });
  if (!prog || !n || _ds.moving[pid]) { dkPaintRosterBody(); return; }
  var raw = prog.startsOn;
  var was = programStartsOn(prog, todayISO());
  var to = moveBlockStart(was, n);
  if (!to) { dkPaintRosterBody(); return; }
  // Lifted already: never past the week they lifted, and once asked, it moves with what they logged.
  var tr = dsTrained(prog), first = _dkFirst(a.name), wk = tr && (tr.weeks === 1 ? 'week 1' : 'weeks 1–' + tr.weeks);
  if (tr && tr.latest && to > tr.latest) { dkPaintRosterBody(); toast(first + ' lifted ' + wk + ' from ' + fmtDateShort(tr.latest) + ': the block can’t start later than that'); return; }
  if (tr && !opts.ok && !_ds.okMove[pid]) {
    dkPaintRosterBody();
    dsConfirm('Move ' + (prog.name || 'the block') + '?', first + ' has trained ' + wk + ' of it. The weeks they lifted move with it, so their logged sessions sit later than the dates on the calendar.', 'Move it', function () { _ds.okMove[pid] = true; _ds.focusBar = pid; dsMoveBlock(pid, n, a, { ok: true }); });
    return;
  }
  var set = function (iso) { Store.update(function (s) { var p = (s.programs || []).find(function (x) { return x.id === pid; }); if (!p) return; if (iso) p.startsOn = iso; else delete p.startsOn; }); };
  set(to);
  dkRowsFresh();
  dkPaintRosterBody();
  if (!_dsDemo() && window.DB && DB.setProgramDates) {
    _ds.moving[pid] = true;
    var live = (Store.get().programs || []).find(function (p) { return p.id === pid; });
    var r = await DB.setProgramDates(live, { startsOn: to }).catch(function (e) { return { ok: false, error: e }; });
    delete _ds.moving[pid];
    if (!r || !r.ok) { set(_isoDay(raw)); dkRowsFresh(); dkPaintRosterBody(); toast(r && r.notReady ? 'Block dates save once the meet-calendar update runs' : 'Could not move it. Nothing changed'); return; }
  }
  toastAction((prog.name || 'The block') + ' now starts ' + fmtDateShort(to), 'Undo', function () { _ds.focusBar = pid; dsMoveBlock(pid, -n, a); });
}

// =====================================================================
// PLAN A MEET (a date, never a result: totals and DOTS never move)
// =====================================================================
// A click on an empty week of a lifter's track: Plan a meet there, that week's Saturday filled in.
function dsTrackPlan(track, a, weeks) {
  var ghost = el('span', { class: 'ds-cal-ghost', 'aria-hidden': 'true' });
  ghost.insertAdjacentHTML('beforeend', DK_IC.plus);
  ghost.appendChild(el('span', {}, 'Meet'));
  ghost.hidden = true;
  track.appendChild(ghost);
  var at = function (e) { var r = track.getBoundingClientRect(); return Math.max(0, Math.min(DS_CAL_WEEKS - 1, Math.floor((e.clientX - r.left) / (r.width / DS_CAL_WEEKS)))); };
  var dayOf = function (i) { var sat = _addDaysISO(weeks[i], 5), t = todayISO(); return _addDaysISO(weeks[i], 6) < t ? null : sat < t ? t : sat; };
  var hide = function () { ghost.hidden = true; track.classList.remove('is-pick'); };
  track.addEventListener('mousemove', function (e) {
    if (e.target !== track) { hide(); return; }
    var i = at(e), d = dayOf(i);
    if (!d) { hide(); return; }
    ghost.style.left = (i / DS_CAL_WEEKS * 100).toFixed(4) + '%';
    ghost.hidden = false; track.classList.add('is-pick');
    track.title = 'Plan a meet for ' + _dkFirst(a.name) + ' the week of ' + fmtDateShort(weeks[i]);
  });
  track.addEventListener('mouseleave', hide);
  track.addEventListener('click', function (e) {
    if (e.target !== track) return;
    var d = dayOf(at(e));
    if (d) dsPlanMeet(a.id, { date: d });
  });
}
// opts: { team } (everyone on it, ticked; the team's own meet date follows), { ids } (ticked), { date }.
function dsPlanMeet(aid, opts) {
  opts = opts || {};
  var me = _dsMe();
  var ath = (Store.get().athletes || []).filter(function (a) { return a.coachId === me; }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  var a0 = aid ? dsAthlete(aid) : null;
  var team = opts.team ? ((Store.get().teams || []).find(function (t) { return t.id === opts.team.id; }) || opts.team) : null;
  var veil = el('div', { class: 'dk-veil' });
  var box = el('div', { class: 'dk-modal ds-plan', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Plan a meet' });
  box.appendChild(el('h2', { class: 'dk-modal-title' }, a0 ? 'Plan a meet for ' + _dkFirst(a0.name) : team ? 'Plan a meet for ' + (team.name || 'the team') : 'Plan a meet'));
  box.appendChild(el('p', { class: 'ds-pv-sub' }, 'A date on their season, never a result: it doesn’t touch their totals or DOTS.'));
  var form = el('div', { class: 'ds-form ds-form-2' });
  var name = el('input', { type: 'text', class: 'ds-in', maxlength: '80', placeholder: 'City Classic', 'aria-label': 'Meet name' });
  form.appendChild(el('label', { class: 'ds-field is-wide' }, el('span', {}, 'Meet'), name));
  var date = el('input', { type: 'date', class: 'ds-in', min: todayISO(), 'aria-label': 'Date' });
  if (_isoDay(opts.date)) date.value = opts.date;
  else if (team && _isoDay(team.meetDate) && team.meetDate >= todayISO()) date.value = team.meetDate;
  form.appendChild(el('label', { class: 'ds-field' }, el('span', {}, 'Date'), date));
  var wiSeg = el('div', { class: 'dk-seg', role: 'radiogroup', 'aria-label': 'Weigh-in' });
  var weighIn = '2h';
  [['2h', '2-hour'], ['24h', '24-hour']].forEach(function (x) {
    var b = el('button', { type: 'button', class: 'dk-seg-btn' + (x[0] === weighIn ? ' on' : ''), role: 'radio', 'aria-checked': String(x[0] === weighIn) }, el('span', {}, x[1]));
    b.addEventListener('click', function () { weighIn = x[0]; wiSeg.querySelectorAll('.dk-seg-btn').forEach(function (y) { var on = y === b; y.classList.toggle('on', on); y.setAttribute('aria-checked', String(on)); }); });
    wiSeg.appendChild(b);
  });
  var wiTime = el('input', { type: 'time', class: 'ds-in ds-in-time', value: '07:00', 'aria-label': 'Weigh-in time' });
  var wiRow = el('div', { class: 'ds-wi' }, wiSeg, wiTime);
  form.appendChild(el('div', { class: 'ds-field' }, el('span', {}, 'Weigh-in'), wiRow));
  var dl = function (id, vals) { var d = el('datalist', { id: id }); vals.forEach(function (v) { d.appendChild(el('option', { value: v })); }); return d; };
  var fed = el('input', { type: 'text', class: 'ds-in', maxlength: '40', placeholder: 'USAPL', list: 'dsFeds', 'aria-label': 'Federation' });
  form.appendChild(el('label', { class: 'ds-field' }, el('span', {}, 'Federation'), fed, dl('dsFeds', ['USAPL', 'Powerlifting America', 'USPA', 'IPF', 'British Powerlifting', 'CPU', 'Powerlifting Australia', 'WRPF', 'RPS'])));
  var div = el('input', { type: 'text', class: 'ds-in', maxlength: '80', placeholder: 'Open', list: 'dsDivs', 'aria-label': 'Division' });
  form.appendChild(el('label', { class: 'ds-field' }, el('span', {}, 'Division'), div, dl('dsDivs', ['Open', 'Junior', 'Sub-junior', 'Master 1', 'Master 2', 'Raw Open', 'Equipped Open'])));
  var many = !a0;
  var cls = el('input', { type: 'text', class: 'ds-in', maxlength: '12', placeholder: '74 kg', list: 'dsClasses', 'aria-label': 'Weight class' });
  var classes = [];
  try { ['male', 'female'].forEach(function (sx) { var l = IPF_CLASSES[sx] || []; l.forEach(function (c) { var t = c + ' kg'; if (classes.indexOf(t) < 0) classes.push(t); }); if (l.length) { var sh = l[l.length - 1] + '+ kg'; if (classes.indexOf(sh) < 0) classes.push(sh); } }); } catch (e) {}
  // One class only makes sense for one lifter: with several, each keeps the class on their profile.
  if (!many) form.appendChild(el('label', { class: 'ds-field' }, el('span', {}, 'Weight class'), cls, dl('dsClasses', classes)));
  box.appendChild(form);
  // Who: one lifter, or everyone ticked (a team ticks its lifters in one go).
  var picked = {};
  var whoList = null;
  if (many) {
    var who = el('div', { class: 'ds-field ds-who' });
    var wh = el('div', { class: 'ds-who-head' }, el('span', {}, 'Lifters'));
    dsTeams().forEach(function (t) {
      if (!(t.members || []).length) return;
      wh.appendChild(dkBtn('Everyone on ' + (t.name || 'the team'), { cls: 'is-quiet dk-btn-sm', onClick: function () {
        (t.members || []).forEach(function (m) { picked[m.athleteId] = true; }); paintWho();
      } }));
    });
    who.appendChild(wh);
    whoList = el('div', { class: 'ds-pick-list ds-who-list', role: 'group', 'aria-label': 'Lifters' });
    who.appendChild(whoList);
    box.appendChild(who);
    if (team) (team.members || []).forEach(function (m) { picked[m.athleteId] = true; });
    (opts.ids || []).forEach(function (id) { picked[id] = true; });
  }
  function ids() { return a0 ? [a0.id] : ath.filter(function (a) { return picked[a.id]; }).map(function (a) { return a.id; }); }
  function paintWho() {
    if (!whoList) return;
    whoList.innerHTML = '';
    ath.forEach(function (a) {
      var lab = el('label', { class: 'ds-pick-row' });
      var cb = el('input', { type: 'checkbox', class: 'dk-cb' });
      cb.checked = !!picked[a.id];
      cb.addEventListener('change', function () { picked[a.id] = cb.checked; paintCount(); });
      lab.appendChild(cb);
      lab.appendChild(dkAv(a, 'is-sm'));
      lab.appendChild(el('span', { class: 'ds-pick-n' }, a.name || 'Athlete'));
      var p = dkProgOf(a.id);
      lab.appendChild(el('span', { class: 'ds-pick-note' }, p ? (p.name || 'Program') + (_isoDay(p.meetDate) && p.meetDate >= todayISO() ? ' · counts to ' + fmtDateShort(p.meetDate) : '') : 'No program'));
      whoList.appendChild(lab);
    });
    paintCount();
  }
  var count = el('label', { class: 'ds-check' });
  var cc = el('input', { type: 'checkbox', class: 'dk-cb' });
  count.appendChild(cc);
  var ccTxt = el('span', {}, '');
  count.appendChild(ccTxt);
  box.appendChild(count);
  var row = el('div', { class: 'dk-modal-actions' });
  var cancel = dkBtn('Cancel', { onClick: close });
  var go = dkBtn('Plan the meet', { primary: true, title: 'Plan the meet', kbd: _dkMac() ? '⌘↵' : 'Ctrl ↵', onClick: save });
  row.appendChild(cancel); row.appendChild(go);
  box.appendChild(row);
  function paintCount() {
    var list = ids(), withProg = list.filter(function (id) { return dkProgOf(id); });
    count.hidden = !withProg.length;
    if (!a0) {
      cc.checked = cc.dataset.touched ? cc.checked : true;
      ccTxt.textContent = 'Count each lifter’s block down to it (a block already counting to a later meet keeps it)';
      go.querySelector('.dk-btn-l').textContent = list.length > 1 ? 'Plan it for ' + _dsLifters(list.length) : 'Plan the meet';
      go.disabled = !list.length;
      return;
    }
    var p = dkProgOf(a0.id);
    cc.checked = !!p && !(_isoDay(p.meetDate) && p.meetDate >= todayISO());
    ccTxt.textContent = p ? 'Count ' + (p.name || 'their block') + ' down to it' + (_isoDay(p.meetDate) && p.meetDate >= todayISO() ? ' (it counts to ' + fmtDateShort(p.meetDate) + ' now)' : '') : '';
  }
  cc.addEventListener('change', function () { cc.dataset.touched = '1'; });
  paintWho();
  if (a0) paintCount();
  veil.appendChild(box);
  function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); } if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); save(); } }
  function close() { document.removeEventListener('keydown', onKey, true); veil.remove(); }
  veil._close = close;
  veil.addEventListener('mousedown', function (e) { if (e.target === veil) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(veil);
  name.focus();
  async function save() {
    if (go.disabled) return;
    var list = ids();
    var base = { name: name.value.trim().slice(0, 80), date: date.value, federation: fed.value.trim().slice(0, 40), division: div.value.trim().slice(0, 80),
      weightClass: many ? '' : cls.value.trim().slice(0, 12), weighIn: weighIn, weighInAt: null, status: 'planned', planned: true, bodyweight: null, squat: null, bench: null, deadlift: null, notes: '' };
    if (!list.length) { toast('Tick the lifters going'); return; }
    if (!base.name) { name.focus(); toast('Give the meet a name'); return; }
    if (!_isoDay(base.date) || base.date < todayISO()) { date.focus(); toast('Pick the meet’s date (today or later)'); return; }
    if (wiTime.value && /^\d{2}:\d{2}$/.test(wiTime.value)) base.weighInAt = (weighIn === '24h' ? _addDaysISO(base.date, -1) : base.date) + 'T' + wiTime.value + ':00';
    go.disabled = true; cancel.disabled = true;
    var done = [], failed = [], notReady = false, countFailed = [];
    for (var i = 0; i < list.length; i++) {
      var m = Object.assign({ athleteId: list[i] }, base);
      var saved = Object.assign({ id: 'demo-pm-' + Date.now() + '-' + i }, m);
      if (!_dsDemo() && window.DB && DB.savePlannedMeet) {
        var r = await DB.savePlannedMeet(m).catch(function (e) { return { ok: false, error: e }; });
        if (!r || !r.ok) { failed.push(list[i]); if (r && r.notReady) notReady = true; continue; }
        saved = r.meet;
      }
      Store.update(function (s) { (s.meets = s.meets || []).push(saved); });
      done.push(list[i]);
      // Their block counts down to it (one lifter: as ticked; several: unless it counts to a later meet).
      var prog = dkProgOf(list[i]);
      var already = prog && _isoDay(prog.meetDate) && prog.meetDate >= todayISO();
      if (prog && cc.checked && !count.hidden && (a0 || !already || prog.meetDate === base.date)) {
        var start = programStartsOn(prog, todayISO());
        var dates = { meetDate: base.date };
        if (start && !_isoDay(prog.startsOn)) dates.startsOn = start;   // the block stays where it is
        var before = { meetDate: prog.meetDate, startsOn: prog.startsOn };
        var setD = function (pid, d) { Store.update(function (s) { var p = (s.programs || []).find(function (x) { return x.id === pid; }); if (!p) return; ['meetDate', 'startsOn'].forEach(function (k) { if (k in d) { if (d[k]) p[k] = d[k]; else delete p[k]; } }); }); };
        setD(prog.id, dates);
        if (!_dsDemo() && window.DB && DB.setProgramDates) {
          var pr = await DB.setProgramDates((Store.get().programs || []).find(function (p) { return p.id === prog.id; }), dates).catch(function (e) { return { ok: false, error: e }; });
          if (!pr || !pr.ok) { var back = { meetDate: before.meetDate || null }; if ('startsOn' in dates) back.startsOn = before.startsOn || null; setD(prog.id, back); countFailed.push(list[i]); }
        }
      }
    }
    // A team's own meet: the date its program counts to.
    if (team && done.length && (!_isoDay(team.meetDate) || team.meetDate < todayISO() || team.meetDate !== base.date)) {
      var cur = (Store.get().teams || []).find(function (t) { return t.id === team.id; }) || team;
      var tr = await _dsSaveTeam(Object.assign({}, cur, { meetDate: base.date }));
      if (tr.ok) Store.update(function (s) { var t = (s.teams || []).find(function (x) { return x.id === team.id; }); if (t) { t.meetDate = base.date; t.rev = tr.team && typeof tr.team.rev === 'number' && !_dsDemo() ? tr.team.rev : (Number(t.rev) || 0) + 1; } });
      else if (tr.conflict) dsTeamLatest(cur, tr.latest);
    }
    if (!done.length) { go.disabled = false; cancel.disabled = false; toast(notReady ? 'Planned meets save once the meet-calendar update runs' : 'Could not save. Try again'); return; }
    close();
    var names = function (l) { return l.map(function (id) { return _dkFirst((dsAthlete(id) || {}).name); }).join(', '); };
    var msg = base.name + ' planned for ' + (done.length === 1 ? _dkFirst((dsAthlete(done[0]) || {}).name) : _dsLifters(done.length)) + ' · ' + meetWeekLabel(todayISO(), base.date).replace('Meet week', 'this week');
    if (failed.length) msg += '. Not saved for ' + names(failed) + ': try again';
    if (countFailed.length) msg += '. ' + names(countFailed) + '’s block couldn’t be set to count down to it: set it in the builder';
    toast(msg);
    dkRowsFresh();
    deskRefresh();
    if (opts.then) opts.then(done);
  }
}
window.deskPlanMeet = dsPlanMeet;

// =====================================================================
// MEETS (when meetday.js's screen isn't there): planned and done, by date
// =====================================================================
function dsRenderMeetsList(host) {
  if (!_dk.rows) dkRowsFresh();
  host.innerHTML = '';
  var me = _dsMe();
  var mine = {};
  (Store.get().athletes || []).forEach(function (a) { if (a.coachId === me) mine[a.id] = a; });
  var t = todayISO(), groups = {};
  (Store.get().meets || []).forEach(function (m) {
    var d = _isoDay(m.date);
    if (!mine[m.athleteId] || !d) return;
    var planned = isPlannedMeet(m, t);
    if (!planned && d < _addDaysISO(t, -120)) return;
    var k = (planned ? 'p' : 'd') + '|' + String(m.name || 'Meet').trim().toLowerCase() + '|' + d;
    (groups[k] = groups[k] || { name: m.name || 'Meet', date: d, planned: planned, federation: m.federation || '', division: m.division || '', entries: [] }).entries.push({ meet: m, athlete: mine[m.athleteId] });
  });
  var all = Object.keys(groups).map(function (k) { return groups[k]; });
  var ahead = all.filter(function (g) { return g.planned; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  var done = all.filter(function (g) { return !g.planned; }).sort(function (a, b) { return b.date.localeCompare(a.date); });
  var head = el('div', { class: 'ds-head' });
  var id = el('div', { class: 'ds-head-id' });
  id.appendChild(el('h1', { class: 'dk-h1' }, 'Meets'));
  id.appendChild(el('p', { class: 'ds-facts' }, el('span', {}, [ahead.length ? ahead.length + ' ahead' : '', done.length ? done.length + ' done lately' : ''].filter(Boolean).join(' · ') || 'Nothing planned')));
  head.appendChild(id);
  var tools = el('div', { class: 'ds-head-tools' });
  tools.appendChild(dkBtn('Plan a meet', { primary: true, icon: DS_IC.meetPlus, onClick: function () { dsPlanMeet(null); } }));
  head.appendChild(tools);
  host.appendChild(head);
  if (!all.length) { host.appendChild(el('div', { class: 'dk-noresults' }, el('b', {}, 'No meets planned'), el('span', {}, 'Plan one and every lifter’s block counts down to it.'))); return; }
  var sec = function (title, list) {
    if (!list.length) return;
    host.appendChild(el('h2', { class: 'ds-sec-title ds-mt-h' }, title));
    var wrap = el('div', { class: 'dk-mtl' });
    list.forEach(function (g) {
      var card = el('div', { class: 'dk-mtc' + (g.planned ? '' : ' is-done'), role: 'group', 'aria-label': g.name });
      var dt = new Date(g.date + 'T12:00:00');
      var hd = el('div', { class: 'dk-mtc-head' });
      hd.appendChild(el('div', { class: 'dk-mtc-cal', 'aria-hidden': 'true' }, el('span', {}, dt.toLocaleDateString(undefined, { month: 'short' })), el('b', {}, String(dt.getDate()))));
      var ti = el('div', { class: 'dk-mtc-id' });
      ti.appendChild(el('h2', { class: 'dk-mtc-name' }, g.name));
      ti.appendChild(el('span', {}, [fmtDate(g.date), g.federation, g.division].filter(Boolean).join(' · ')));
      hd.appendChild(ti);
      var days = Math.round((Date.parse(g.date + 'T12:00:00Z') - Date.parse(t + 'T12:00:00Z')) / 86400000);
      hd.appendChild(el('span', { class: 'dk-mtc-days' + (g.planned && days <= 14 ? ' is-wn' : '') }, !g.planned ? 'Done' : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : 'In ' + days + ' days'));
      card.appendChild(hd);
      var rows = el('div', { class: 'dk-mtc-rows' });
      g.entries.forEach(function (x) {
        var r = dkRow(x.athlete.id);
        var row = el('button', { type: 'button', class: 'dk-mtc-row' });
        row.appendChild(r ? dkRingAv(r, 'sm') : dkAv(x.athlete, 'is-sm'));
        var main = el('span', { class: 'dk-mtc-main' });
        main.appendChild(el('b', {}, x.athlete.name));
        main.appendChild(el('span', {}, g.planned ? [r ? dkBlockText(r.status) : '', x.meet.weightClass ? dkClassText(x.meet.weightClass) : ''].filter(Boolean).join(' · ') : [x.meet.weightClass ? dkClassText(x.meet.weightClass) : '', x.meet.bodyweight ? 'BW ' + _num(kgToDisplay(x.meet.bodyweight, 1)) : ''].filter(Boolean).join(' · ')));
        row.appendChild(main);
        var end = el('span', { class: 'dk-mtc-cls' });
        // Their W-n: the week they're in now, counted to this meet.
        if (g.planned) { var wn = meetWeekLabel(_monISO(t), g.date); end.appendChild(el('b', { class: 'ds-wn' }, wn === 'Meet week' ? 'Meet week' : wn)); }
        else { var tot = meetTotal(x.meet); if (tot) end.appendChild(el('b', {}, _num(kgToDisplay(tot)) + ' ' + unitLabel() + ' total')); }
        row.appendChild(end);
        row.insertAdjacentHTML('beforeend', DK_IC.chevR);
        row.addEventListener('click', function () { openAthletePage(x.athlete.id); });
        rows.appendChild(row);
      });
      card.appendChild(rows);
      wrap.appendChild(card);
    });
    host.appendChild(wrap);
  };
  sec('Coming up', ahead);
  sec('Done', done);
}

// =====================================================================
// THE LAST WEEK OF A BLOCK: what it did, and the next block
// =====================================================================
function dsBlockEnd(r, prog) {
  var a = r.athlete;
  var aside = el('aside', { class: 'ds-end', 'aria-label': 'What ' + (prog.name || 'the block') + ' did, and the next block' });
  aside.appendChild(el('h4', { class: 'ds-end-t' }, 'What ' + (prog.name || 'this block') + ' did'));
  var ach = blockAchieved(prog, Store.get().workoutLogs || [], a.id, todayISO());
  var st = typeof blockStats === 'function' ? blockStats(prog.weeks || []) : null;
  var facts = [];
  if (ach && ach.start) facts.push(_dsWeeks((prog.weeks || []).length) + ' from ' + fmtDateShort(ach.start));
  if (st && st.sets) facts.push(Math.round(st.done / st.sets * 100) + '% of sets logged');
  if (facts.length) aside.appendChild(el('p', { class: 'ds-end-sub' }, facts.join(' · ')));
  var list = el('div', { class: 'ds-end-lifts' });
  var any = false, u = unitLabel();
  // Every number as shown (rounded first), so the rows and the total add up on screen.
  var shown = (ach ? ach.lifts : []).map(function (x) { return { lift: x.lift, before: x.before > 0 ? Math.round(kgToDisplay(x.before)) : 0, now: x.now > 0 ? Math.round(kgToDisplay(x.now)) : 0 }; });
  var dText = function (d) { return d === 0 ? '±0' : (d > 0 ? '+' : '−') + Math.abs(d) + ' ' + u; };
  shown.forEach(function (x) {
    if (!(x.now > 0)) return;
    any = true;
    var li = el('div', { class: 'ds-end-lift lift-' + x.lift });
    li.appendChild(el('span', { class: 'dk-wk-ex' }, el('i', { class: 'dk-lift-dot', 'aria-hidden': 'true' }), el('span', {}, LIFT_LABELS[x.lift] || x.lift)));
    var nums = el('span', { class: 'ds-end-n' });
    if (x.before > 0) { nums.appendChild(el('span', { class: 'ds-end-was' }, String(x.before))); nums.appendChild(el('span', { class: 'ds-end-ar', 'aria-hidden': 'true' }, '→')); }
    nums.appendChild(el('b', {}, String(x.now)));
    li.appendChild(nums);
    var d = x.before > 0 ? x.now - x.before : null;
    li.appendChild(el('span', { class: 'ds-end-d' + (d > 0 ? ' is-up' : '') }, d == null ? '' : dText(d)));
    dkTip(li, (LIFT_LABELS[x.lift] || '') + ' e1RM ' + (x.before > 0 ? x.before + ' before the block, ' : '') + x.now + ' best in it');
    list.appendChild(li);
  });
  var all = shown.length && shown.every(function (x) { return x.before > 0 && x.now > 0; });
  if (all) {
    var tb = shown.reduce(function (t, x) { return t + x.before; }, 0), tn = shown.reduce(function (t, x) { return t + x.now; }, 0);
    var tl = el('div', { class: 'ds-end-lift is-total' });
    tl.appendChild(el('span', {}, 'Total'));
    tl.appendChild(el('span', { class: 'ds-end-n' }, el('span', { class: 'ds-end-was' }, String(tb)), el('span', { class: 'ds-end-ar', 'aria-hidden': 'true' }, '→'), el('b', {}, String(tn))));
    tl.appendChild(el('span', { class: 'ds-end-d' + (tn > tb ? ' is-up' : '') }, dText(tn - tb)));
    list.appendChild(tl);
  }
  if (any) aside.appendChild(list);
  else aside.appendChild(el('p', { class: 'dk-quiet-p' }, 'No e1RM from this block yet: it reads here as they log their top sets.'));
  if (any) aside.appendChild(el('p', { class: 'ds-end-key' }, 'e1RM in ' + unitLabel() + ', the best in the block against the 8 weeks before it.'));
  // The next step: the one red action, with the quick path beside it. In meet week the meet leads:
  // the next block starts the Monday after it.
  var t = todayISO(), mon = _monISO(t), sun = _addDaysISO(mon, 6);
  var mw = (Store.get().meets || []).filter(function (m) { return m.athleteId === a.id && isPlannedMeet(m, _addDaysISO(t, -1)) && _isoDay(m.date) >= t && _isoDay(m.date) <= sun; })
    .sort(function (x, y) { return String(x.date).localeCompare(String(y.date)); })[0] || null;
  var nextMon = _addDaysISO(mon, 7);
  var nx = el('div', { class: 'ds-end-next' });
  var acts = el('div', { class: 'ds-end-acts' });
  if (mw) {
    var md = _isoDay(mw.date);
    nx.appendChild(el('h4', { class: 'ds-end-t' }, (mw.name || 'The meet') + (md === t ? ', today' : ', ' + new Date(md + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long' }))));
    nx.appendChild(el('p', { class: 'ds-end-sub' }, (prog.name || 'This block') + ' leads into it. The next block waits for the meet: it starts ' + fmtDateShort(nextMon) + '.'));
    if (window.MeetDay && typeof window.renderMeetsScreen === 'function') acts.appendChild(dkBtn(md === t ? 'Open meet day' : 'Plan the attempts', { primary: true, onClick: function () { deskGo('meets'); } }));
  } else {
    nx.appendChild(el('h4', { class: 'ds-end-t' }, 'Next'));
    var nm = r.meet && r.meet.days > 7 ? r.meet.meet.name + ' is ' + Math.ceil(r.meet.days / 7) + ' weeks out.' : '';
    nx.appendChild(el('p', { class: 'ds-end-sub' }, (nm ? nm + ' ' : '') + 'Nothing is written after week ' + ((prog.weeks[prog.weeks.length - 1] || {}).number || prog.weeks.length) + '.'));
  }
  acts.appendChild(dkBtn('Write the next block', { primary: !mw, cls: mw ? 'is-quiet' : '', onClick: function () { if (typeof openNextBlockSheet === 'function') openNextBlockSheet(prog.id, a.id); else openAthleteProgram(a.id); } }));
  var heavier = dkBtn('The same block, heavier', { icon: DK_IC.spark, cls: mw ? 'is-quiet' : '', title: 'Every week again from ' + fmtDateShort(nextMon) + ', main lifts +' + (getUnit() === 'lbs' ? '5 lb' : '2.5 kg') + ' (or +2.5% on % sets). This block is kept as a past block' });
  heavier.addEventListener('click', async function () {
    if (heavier.disabled || typeof startSameBlockHeavier !== 'function') return;
    heavier.disabled = true;
    try { var name = await startSameBlockHeavier(prog.id, a.id); toast('“' + name + '” is ready. ' + _dkFirst(a.name) + ' starts week 1 on ' + fmtDateShort(nextMon)); dkRowsFresh(); dkWsRepaint(); }
    catch (e) { heavier.disabled = false; toast('Could not start it. Try again'); }
  });
  acts.appendChild(heavier);
  nx.appendChild(acts);
  aside.appendChild(nx);
  return aside;
}
