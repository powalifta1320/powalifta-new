/* POWALIFTA coach desk demos: the shared kit. Reads window.DEMO (data.js: the app's own demo roster, exported).
   K.shell() draws the rail and returns the page's <main>; K.bar() the demo's own strip; the rest is small helpers:
   dates and numbers as a coach says them, faces, icons, the lifting maths, little charts, a toast with Undo. */
(function () {
  'use strict';
  var D = window.DEMO, K = window.K = { D: D };
  K.$ = function (s, r) { return (r || document).querySelector(s); };
  K.$$ = function (s, r) { return [].slice.call((r || document).querySelectorAll(s)); };
  K.esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  K.byId = {}; D.lifters.forEach(function (l) { K.byId[l.id] = l; });
  K.L = function (id) { return K.byId[id] || null; };
  K.who = function (name) { return D.lifters.filter(function (l) { return l.name.indexOf(name) === 0; })[0] || null; };
  K.lifters = D.lifters;

  /* ---- dates, said plainly ---- */
  var DAY = 864e5, WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  K.today = D.today; K.now = new Date(D.made);
  K.d = function (iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00'); };
  K.iso = function (date) { return date.toISOString().slice(0, 10); };
  K.add = function (iso, n) { var x = K.d(iso); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  K.daysTo = function (iso) { return Math.round((K.d(iso) - K.d(K.today)) / DAY); };            // + in the future
  K.wd = function (iso) { return WD[K.d(iso).getDay()]; }; K.wd3 = function (iso) { return K.wd(iso).slice(0, 3); };
  K.dm = function (iso) { var x = K.d(iso); return x.getDate() + ' ' + MO[x.getMonth()]; };
  /* "today", "yesterday", "on Sunday", "on 29 Oct" */
  K.when = function (iso, o) { var n = -K.daysTo(iso), p = o && o.bare ? '' : 'on '; return n === 0 ? 'today' : n === 1 ? 'yesterday' : n === -1 ? 'tomorrow' : n > 1 && n < 7 ? p + K.wd(iso) : n < 0 && n > -7 ? p + K.wd(iso) : p + K.dm(iso); };
  K.When = function (iso) { var s = K.when(iso, { bare: true }); return s.charAt(0).toUpperCase() + s.slice(1); };
  K.ago = function (isoTime) { var m = Math.max(1, Math.round((K.now - new Date(isoTime)) / 6e4)); return m < 60 ? m + ' min ago' : m < 1440 ? Math.round(m / 60) + (Math.round(m / 60) === 1 ? ' hour ago' : ' hours ago') : Math.round(m / 1440) + (Math.round(m / 1440) === 1 ? ' day ago' : ' days ago'); };
  K.monday = function (iso) { var x = K.d(iso || K.today), k = (x.getDay() + 6) % 7; return K.add(iso || K.today, -k); };

  /* ---- numbers ---- */
  K.n = function (v) { if (v == null || v === '') return ''; var x = Math.round(Number(v) * 10) / 10; return String(x % 1 ? x.toFixed(1) : x); };
  K.sign = function (v) { var x = Number(v) || 0; return (x > 0 ? '+' : x < 0 ? '−' : '') + K.n(Math.abs(x)); };
  K.kg = function (v) { return K.n(v) + ' ' + (D.unit || 'kg'); };
  K.plural = function (n, w, ws) { return n + ' ' + (n === 1 ? w : (ws || w + 's')); };
  K.list = function (names, max) { names = (names || []).filter(Boolean); max = max || 4; if (names.length > max) return names.slice(0, max - 1).join(', ') + ' and ' + (names.length - (max - 1)) + ' more'; return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : (names[0] || ''); };
  K.money = function (v) { return '$' + Math.round(v).toLocaleString('en-US'); };

  /* ---- the lifting maths (the app's: RPE to a share of the max, e1RM, a load for reps at an RPE) ---- */
  K.pct = function (reps, rpe) { return Math.max(0.4, 1 - ((Number(reps) - 1) + (10 - Number(rpe))) * 0.0333); };
  K.e1 = function (w, reps, rpe) { return Number(w) / K.pct(reps, rpe == null ? 10 : rpe); };
  K.round = function (kg, step) { step = step || 2.5; return Math.round(kg / step) * step; };
  K.load = function (e1, reps, rpe) { return K.round(e1 * K.pct(reps, rpe)); };
  K.LIFT = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };
  K.liftChip = function (lift) { return lift && K.LIFT[lift] ? '<span class="lift l-' + lift + '" aria-hidden="true">' + K.LIFT[lift].charAt(0) + '</span>' : ''; };
  /* a set as a coach writes it: "180 × 3 @8" */
  K.set = function (s, o) { o = o || {}; var w = o.w != null ? o.w : s.w, rpe = o.felt ? s.felt : s.rpe; return (w ? '<span class="w">' + K.n(w) + '</span><span class="x">×</span>' : '') + s.r + (rpe != null ? ' <span class="faint">@</span>' + K.n(rpe) : ''); };
  /* how a set felt against what was written: '' as written, hard (half a point over), over (a point or more), easy */
  K.feltOf = function (s) { if (!s.done) return null; if (s.felt == null || s.rpe == null) return 'none'; var top = s.rpeHi || s.rpe, d = s.felt - top; return d >= 1 ? 'over' : d >= 0.5 ? 'hard' : (s.rpe - s.felt) >= 1 ? 'easy' : ''; };
  K.feltHtml = function (s) { var f = K.feltOf(s); if (f == null) return '<span class="felt none"><i></i>To come</span>'; if (f === 'none') return '<span class="felt none"><i></i>Done</span>'; return '<span class="felt ' + f + '"><i></i>Felt ' + K.n(s.felt) + '</span>'; };

  /* ---- icons (24 px, stroke) and faces ---- */
  var IC = {
    today: '<path d="M3 12h4l2.5-6 4 12 2.5-6h5"/>', lifters: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8"/>',
    programs: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9.5h17M9 9.5V20"/>', teams: '<circle cx="12" cy="7" r="3"/><circle cx="5" cy="9.5" r="2.2"/><circle cx="19" cy="9.5" r="2.2"/><path d="M6.5 20a5.5 5.5 0 0 1 11 0M1.8 18a3.4 3.4 0 0 1 4.6-3M22.2 18a3.4 3.4 0 0 0-4.6-3"/>',
    meets: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.8 2.8 0 0 0 2.8 3.6M16 6h2.5a2.8 2.8 0 0 1-2.8 3.6M12 13v3.5M8.5 20h7"/>', messages: '<path d="M20 11.5a7.8 7.8 0 0 1-11.4 6.9L4 20l1.5-4.3A7.8 7.8 0 1 1 20 11.5z"/>',
    clients: '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M3 6.5A2.5 2.5 0 0 0 5.5 9h13A1.5 1.5 0 0 1 20 10.5V15h-4a2 2 0 0 1 0-4h4"/>',
    club: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>', settings: '<circle cx="12" cy="12" r="3"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/>',
    ask: '<path d="M12 3.5 13.8 9l5.7 1.8-5.7 1.8L12 18l-1.8-5.4L4.5 10.8 10.2 9z"/>', find: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4 4"/>', chev: '<path d="m9 6 6 6-6 6"/>', back: '<path d="m15 6-6 6 6 6"/>', down: '<path d="m6 9 6 6 6-6"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>', x: '<path d="M6 6l12 12M18 6 6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>', play: '<path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none"/>', video: '<rect x="3" y="6" width="13" height="12" rx="2.5"/><path d="m16 10.5 5-3v9l-5-3"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>', send: '<path d="M4 12 20 4l-6 16-2.5-6.5z"/>', trophy: '<path d="M8 4h8v5a4 4 0 0 1-8 0z"/><path d="M8 6H5.5a2.8 2.8 0 0 0 2.8 3.6M16 6h2.5a2.8 2.8 0 0 1-2.8 3.6M12 13v3.5M8.5 20h7"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.2v.3"/>', cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>', pen: '<path d="M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19z"/>', scale: '<path d="M5 7h14l-1.5 12h-11zM9 7a3 3 0 0 1 6 0M12 12l2-2.5"/>',
    heart: '<path d="M12 20s-7-4.4-7-9.6A3.9 3.9 0 0 1 12 8a3.9 3.9 0 0 1 7 2.4C19 15.6 12 20 12 20z"/>', clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>', undo: '<path d="M8 8H15a5 5 0 0 1 0 10H9M8 8l3.5-3.5M8 8l3.5 3.5"/>', dollar: '<path d="M12 3v18M16.5 7.5c-.8-1.3-2.4-2-4.5-2-2.6 0-4.3 1.2-4.3 3.1 0 4.4 9 2.2 9 6.6 0 2-1.9 3.3-4.7 3.3-2.3 0-4-.8-4.9-2.3"/>',
    bolt: '<path d="M13 3 5 13.5h6L10 21l8-10.5h-6z"/>', eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>', swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>', flag: '<path d="M5 21V4M5 4h12l-2.5 4L17 12H5"/>', more: '<circle cx="5" cy="12" r="1.3" fill="currentColor"/><circle cx="12" cy="12" r="1.3" fill="currentColor"/><circle cx="19" cy="12" r="1.3" fill="currentColor"/>'
  };
  K.ic = function (k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.9) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || '') + '</svg>'; };
  K.MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><rect x="1.5" y="14.6" width="29" height="2.8" rx="1.4" fill="currentColor"/><rect x="8" y="3" width="7.5" height="26" rx="2.2" fill="#dc2637"/><rect x="17" y="7.5" width="4" height="17" rx="1.6" fill="currentColor"/><rect x="22.5" y="12" width="2.6" height="8" rx="1.1" fill="currentColor"/></svg>';
  /* a face: K.face(lifter, 40, { ring: 't-pain' | true, live: true, thin: true }) */
  K.face = function (l, size, o) { o = o || {}; if (!l) return ''; return '<span class="face h' + l.hue + (o.ring ? ' ring' + (o.thin ? ' thin' : '') + (typeof o.ring === 'string' ? ' ' + o.ring : '') : '') + '" style="--s:' + (size || 40) + 'px" title="' + K.esc(l.name) + '">' + K.esc(l.ini) + (o.live || (o.live !== false && l.live && o.showLive) ? '<i class="live"></i>' : '') + '</span>'; };
  K.faces = function (ls, size, max) { max = max || 4; var shown = ls.slice(0, max); return '<span class="faces">' + shown.map(function (l) { return K.face(l, size || 28); }).join('') + '</span>' + (ls.length > max ? '<span class="small dim" style="margin-left:6px">+' + (ls.length - max) + '</span>' : ''); };

  /* ---- the shell: the rail of places, then the page. K.shell({ active: 'today' }) → <main> ---- */
  var NAV = [['today', 'Today'], ['lifters', 'Lifters'], ['programs', 'Programs'], ['teams', 'Teams'], ['meets', 'Meets'], ['messages', 'Messages'], ['clients', 'Clients']], NAV2 = [['club', 'Club'], ['settings', 'Settings'], ['ask', 'Ask AI']];
  /* the page behind each place of the rail (the versions the coach lands on when he clicks around) */
  K.PAGES = { today: 'today-drafts.html', lifters: 'lifters-roster.html', programs: 'programs-home.html', teams: 'team-sheet.html', meets: 'meet-day.html', messages: 'messages.html', clients: 'clients.html' };
  /* v2 (10 Nov pm): Today and Lifters become one place, Roster; the lifter page opens from it. K.shell({ active: 'roster', v2: true }) */
  var NAV_V2 = [['roster', 'Roster'], ['programs', 'Programs'], ['teams', 'Teams'], ['meets', 'Meets'], ['messages', 'Messages'], ['clients', 'Clients']];
  K.PAGES_V2 = { roster: 'roster.html', programs: 'prog-builder.html', teams: 'team-sheet.html', meets: 'meet-day.html', messages: 'messages.html', clients: 'clients.html' };
  IC.roster = IC.lifters;
  /* round 4 (10 Nov, night): the professional shell. The owner: "It no more looks like a professional website like it
     used to". The real desk's structure comes back: a full sidebar with words and counts, saved views, the coach at the
     bottom; light first (its own remembered choice), dark one click away. K.shell({ pro: true, active: 'roster' }) */
  var NAV_PRO = [['roster', 'Roster'], ['programs', 'Programs'], ['teams', 'Teams'], ['meets', 'Meets'], ['messages', 'Messages'], ['clients', 'Clients']];
  K.PAGES_PRO = { roster: 'roster.html', programs: 'programs.html', teams: 'teams.html', meets: 'meet-day.html', messages: 'messages.html', clients: 'clients.html' };
  function proShell(o) {
    K.pro = true; K.v2 = true; K.PAGES = K.PAGES_PRO;
    var root = document.documentElement, saved = null; try { saved = localStorage.getItem('powa-pro-theme'); } catch (e) {}
    var q = /[?&]theme=(light|dark)/.exec(location.search);
    K.theme = (q && q[1]) || saved || 'light';
    root.classList.add('pro'); root.setAttribute('data-theme', K.theme);
    /* the Apple pass (11 Nov): a layer of depth, materials and springs on top of pro.css; remove these two lines to drop it */
    if (!document.querySelector('link[href$="apple.css"]')) { var apl = document.createElement('link'); apl.rel = 'stylesheet'; apl.href = '../kit/apple.css'; document.head.appendChild(apl); var aps = document.createElement('script'); aps.src = '../kit/apple.js'; aps.defer = true; document.body.appendChild(aps); }
    var tierOf = {}; (D.order || []).forEach(function (x) { x.ids.forEach(function (id) { if (tierOf[id] == null || x.tier < tierOf[id]) tierOf[id] = x.tier; }); });
    var need = Object.keys(tierOf).filter(function (id) { return tierOf[id] <= 1; }).length;
    var unread = D.lifters.reduce(function (n, l) { return n + (l.unread || 0); }, 0), unreadLifters = D.lifters.filter(function (l) { return l.unread; }).length;
    var overdue = D.lifters.filter(function (l) { return l.billing && l.billing.status && l.billing.status.state === 'overdue'; }).length;
    var meetSoon = D.lifters.filter(function (l) { return l.meet && l.meet.days <= 56; }).length;
    var pain = D.lifters.filter(function (l) { return (l.pain || []).some(function (p) { return !p.resolved; }) || (D.order || []).some(function (x) { return x.type === 'pain' && x.ids.indexOf(l.id) >= 0; }); }).length;
    var counts = { roster: D.lifters.length, teams: D.teams ? D.teams.length : D.team ? 1 : null, meets: (D.week && D.week.meets ? D.week.meets.length : null), messages: unread, clients: overdue || null };
    var keep = location.search.replace(/[?&](id|f|theme)=[^&]*/g, '').replace(/^&/, '?');
    var it = function (x) { var on = o.active === x[0], c = counts[x[0]], hot = x[0] === 'messages' && unread; return '<a class="it' + (on ? ' on' : '') + '" href="' + K.PAGES_PRO[x[0]] + (keep === '?' ? '' : keep) + '"' + (on ? ' aria-current="page"' : '') + '>' + K.ic(x[0], 1.9) + '<span class="l">' + x[1] + '</span>' + (c ? '<span class="n' + (hot ? ' hot' : '') + '">' + c + '</span>' : '') + '</a>'; };
    var view = function (f, label, tone, c) { return '<a class="it" href="roster.html?f=' + f + '"><i class="dot ' + tone + '"></i><span class="l">' + label + '</span><span class="n">' + c + '</span></a>'; };
    var app = document.createElement('div'); app.className = 'app';
    app.innerHTML = '<aside class="side" aria-label="Coach desk"><a class="brand" href="roster.html">' + K.MARK + '<b>POWALIFTA</b></a>' +
      '<button class="find" type="button" data-find>' + K.ic('find', 2) + '<span>Find</span><span class="kbd">⌘K</span></button>' +
      '<nav aria-label="Places">' + NAV_PRO.map(it).join('') + '</nav>' +
      '<div class="lab">Views</div><nav aria-label="Saved views">' + view('need', 'Needs you', 't-ink', need) + view('meet', 'Meet in 8 weeks', 't-meet', meetSoon) + view('health', 'Pain', 't-pain', pain) + view('msg', 'Unread messages', 't-msg', unreadLifters) + '</nav>' +
      '<span class="sp"></span><nav aria-label="More">' +
      '<button class="it" type="button" data-soon="Club">' + K.ic('club', 1.9) + '<span class="l">Club</span></button>' +
      '<button class="it" type="button" data-soon="Settings">' + K.ic('settings', 1.9) + '<span class="l">Settings</span></button>' +
      '<button class="it" type="button" data-soon="Ask AI">' + K.ic('ask', 1.9) + '<span class="l">Ask AI</span></button>' +
      '<button class="it" type="button" data-pro-theme>' + K.ic(K.theme === 'light' ? 'moon' : 'sun', 1.9) + '<span class="l">' + (K.theme === 'light' ? 'Dark mode' : 'Light mode') + '</span></button>' +
      '<a class="it" href="../v3.html">' + K.ic('back', 1.9) + '<span class="l">All screens</span></a></nav>' +
      '<div class="me"><span class="face h3" style="--s:32px">SE</span><span class="grow"><b>' + K.esc(D.coach ? D.coach.name : 'Sam Ellis') + '</b><small>' + K.esc(D.coach ? D.coach.plan + ' · ' + D.coach.seats + ' of ' + D.coach.limit + ' lifters' : '') + '</small></span></div></aside><main class="main" id="main"></main>';
    document.body.appendChild(app);
    app.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pro-theme]');
      if (b) { K.theme = K.theme === 'light' ? 'dark' : 'light'; root.setAttribute('data-theme', K.theme); try { localStorage.setItem('powa-pro-theme', K.theme); } catch (x) {} b.innerHTML = K.ic(K.theme === 'light' ? 'moon' : 'sun', 1.9) + '<span class="l">' + (K.theme === 'light' ? 'Dark mode' : 'Light mode') + '</span>'; if (K.onTheme) K.onTheme(); return; }
      var s = e.target.closest('[data-soon]'); if (s) { K.toast(s.dataset.soon + ' opens in the full app. This demo is the coach desk.'); return; }
      if (e.target.closest('[data-find]')) { var f = document.getElementById('q'); if (f) { f.focus(); f.select && f.select(); } else K.toast('Find a lifter, a program or a meet: ⌘K'); }
    });
    return app.querySelector('main');
  }
  IC.moon = '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>'; IC.sun = '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>';
  K.shell = function (o) {
    o = o || {};
    if (o.pro) return proShell(o);
    /* round 4: the round-2 pages (meets, messages, clients, a lifter) wear the professional shell too until each is
       rebuilt, so the website never drops back to the black rail mid-click. ?rail=old shows them as they were. */
    if (o.v2 && !/[?&]rail=old/.test(location.search)) {
      if (!document.querySelector('link[href$="pro.css"]')) { var lk = document.createElement('link'); lk.rel = 'stylesheet'; lk.href = '../kit/pro.css'; document.head.appendChild(lk); }
      return proShell(o);
    }
    if (o.v2) { K.v2 = true; NAV = NAV_V2; K.PAGES = K.PAGES_V2; }
    var unread = D.lifters.reduce(function (n, l) { return n + (l.unread || 0); }, 0), overdue = D.lifters.filter(function (l) { return l.billing && l.billing.status && l.billing.status.state === 'overdue'; }).length;
    var a = function (x) { var href = o.active === x[0] ? null : K.PAGES[x[0]]; var badge = x[0] === 'messages' && unread ? '<u>' + unread + '</u>' : x[0] === 'clients' && overdue ? '<u class="ink">' + overdue + '</u>' : ''; return '<a class="' + (o.active === x[0] ? 'on' : '') + '" data-nav="' + x[0] + '"' + (href ? ' href="' + href + location.search.replace(/[?&]id=[^&]*/, '').replace(/^&/, '?') + '"' : '') + '>' + K.ic(x[0], 2) + x[1] + badge + '</a>'; };
    var app = document.createElement('div'); app.className = 'app';
    app.innerHTML = '<aside class="rail" aria-label="Coach desk"><span class="mk">' + K.MARK + '</span><button class="find" type="button" aria-label="Find a lifter or an action" title="Find  ⌘K">' + K.ic('find', 2) + '</button>' + NAV.map(a).join('') + '<span class="sp"></span>' + NAV2.map(a).join('') + '<span class="face h3 me" style="--s:36px" title="Sam Ellis · Pro · 21 of 25 lifters">SE</span></aside><main class="main" id="main"></main>';
    document.body.appendChild(app);
    return app.querySelector('main');
  };
  /* the demo's own strip: which version this is, the theme, the way back to all versions */
  K.bar = function (name, bo) {
    bo = bo || {};
    var saved = null; try { saved = localStorage.getItem('powa-demo-theme'); } catch (e) {}
    var q = /[?&]theme=(light|dark)/.exec(location.search);
    K.theme = (q && q[1]) || saved || 'dark';
    document.documentElement.setAttribute('data-theme', K.theme);
    if (/[?&]bare=1/.test(location.search)) return;   // screenshots: no strip
    var bar = document.createElement('div'); bar.className = 'demo-bar';
    bar.innerHTML = '<b>' + K.esc(name) + '</b><button type="button" data-theme-flip>' + (K.theme === 'light' ? 'Dark' : 'Light') + '</button><a href="' + (bo.index || '../index.html') + '">' + (bo.indexLabel || 'All versions') + '</a>';
    bar.querySelector('[data-theme-flip]').addEventListener('click', function () { K.theme = K.theme === 'light' ? 'dark' : 'light'; document.documentElement.setAttribute('data-theme', K.theme); try { localStorage.setItem('powa-demo-theme', K.theme); } catch (e) {} this.textContent = K.theme === 'light' ? 'Dark' : 'Light'; if (K.onTheme) K.onTheme(); });
    document.body.appendChild(bar);
  };

  /* ---- a toast that says what just happened, with Undo ---- */
  var tEl = null, tT = null;
  K.toast = function (text, undo) {
    if (!tEl) { tEl = document.createElement('div'); tEl.className = 'toast'; tEl.setAttribute('role', 'status'); document.body.appendChild(tEl); }
    tEl.innerHTML = '<span>' + K.esc(text) + '</span>' + (undo ? '<button type="button">Undo</button>' : '');
    if (undo) tEl.querySelector('button').addEventListener('click', function () { tEl.classList.remove('on'); undo(); });
    clearTimeout(tT); requestAnimationFrame(function () { tEl.classList.add('on'); });
    tT = setTimeout(function () { tEl.classList.remove('on'); }, undo ? 6500 : 3800);
  };

  /* ---- little charts (inline SVG; colours come from the page's tokens through currentColor / CSS vars) ---- */
  /* a line of values (nulls skipped). K.spark([..], { w, h, color, fill, dot }) */
  K.spark = function (vals, o) {
    o = o || {}; var w = o.w || 120, h = o.h || 36, pad = o.pad == null ? 4 : o.pad, pts = [];
    vals.forEach(function (v, i) { if (v != null) pts.push([i, Number(v)]); });
    if (pts.length < 2) return '<svg width="' + w + '" height="' + h + '"></svg>';
    var lo = Math.min.apply(null, pts.map(function (p) { return p[1]; })), hi = Math.max.apply(null, pts.map(function (p) { return p[1]; })), span = Math.max(hi - lo, hi * 0.004), n = vals.length - 1;
    var X = function (i) { return pad + i / n * (w - pad * 2); }, Y = function (v) { return h - pad - (v - lo) / span * (h - pad * 2); };
    var xy = pts.map(function (p) { return [X(p[0]), Y(p[1])]; }), d = 'M' + xy[0][0].toFixed(1) + ' ' + xy[0][1].toFixed(1);
    for (var i = 1; i < xy.length; i++) { var a = xy[i - 1], b = xy[i], cx = (a[0] + b[0]) / 2; d += ' C' + cx.toFixed(1) + ' ' + a[1].toFixed(1) + ' ' + cx.toFixed(1) + ' ' + b[1].toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1); }
    var L = xy[xy.length - 1], c = o.color || 'currentColor', id = 'sp' + Math.random().toString(36).slice(2, 8);
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" style="overflow:visible" aria-hidden="true">' +
      (o.fill ? '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity=".22"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></linearGradient></defs><path d="' + d + ' L' + L[0].toFixed(1) + ' ' + h + ' L' + xy[0][0].toFixed(1) + ' ' + h + ' Z" fill="url(#' + id + ')"/>' : '') +
      '<path d="' + d + '" fill="none" stroke="' + c + '" stroke-width="' + (o.stroke || 2.25) + '" stroke-linecap="round" stroke-linejoin="round"/>' + (o.dot === false ? '' : '<circle cx="' + L[0].toFixed(1) + '" cy="' + L[1].toFixed(1) + '" r="' + (o.r || 3.5) + '" fill="' + c + '" stroke="var(--bg)" stroke-width="2"/>') + '</svg>';
  };
  /* a ring: K.ring(0.42, { size, stroke, color }) */
  K.ring = function (f, o) { o = o || {}; var s = o.size || 44, sw = o.stroke || 5, r = (s - sw) / 2, c = 2 * Math.PI * r; f = Math.max(0, Math.min(1, f)); return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 ' + s + ' ' + s + '" aria-hidden="true"><circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" fill="none" stroke="var(--track)" stroke-width="' + sw + '"/>' + (f > 0 ? '<circle cx="' + s / 2 + '" cy="' + s / 2 + '" r="' + r + '" fill="none" stroke="' + (o.color || 'var(--ok)') + '" stroke-width="' + sw + '" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 ' + s / 2 + ' ' + s / 2 + ')"/>' : '') + '</svg>'; };
  /* this week's sessions as pips: done filled, the rest quiet */
  K.weekPips = function (l) { var w = l.week; if (!w || !w.planned) return ''; var o = ''; for (var i = 0; i < w.planned; i++) o += '<i class="' + (i < w.done ? 'on' : '') + '"></i>'; return '<span class="pips t-ok" title="' + w.done + ' of ' + w.planned + ' sessions this week">' + o + '</span>'; };

  /* ---- the program, read ---- */
  K.week = function (l, off) { var p = l.program; return p ? p.weeks[p.weekIdx + (off || 0)] || null : null; };
  /* a session's top set: the heaviest set of its first main-lift exercise */
  K.topSet = function (day) { var ex = (day.exercises || []).filter(function (e) { return e.lift; })[0] || (day.exercises || [])[0]; if (!ex) return null; var s = ex.sets.slice().sort(function (a, b) { return (b.w || 0) - (a.w || 0); })[0]; return s ? { ex: ex, set: s } : null; };
  /* sessions lifted on or after a day: [{ l, day, date }] newest first */
  K.sessionsSince = function (iso) { var out = []; D.lifters.forEach(function (l) { var p = l.program; if (!p) return; p.weeks.forEach(function (w, wi) { w.days.forEach(function (d) { if (d.done && d.date && String(d.date).slice(0, 10) >= iso) out.push({ l: l, day: d, date: String(d.date).slice(0, 10), wi: wi }); }); }); }); return out.sort(function (a, b) { return b.date.localeCompare(a.date) || a.l.name.localeCompare(b.l.name); }); };
  /* how a session went against what was written: { verdict: 'as written' | 'harder' | 'much harder' | 'easier' | 'part done', worst (set), n, done } */
  K.verdict = function (day) {
    var worst = null, hard = 0, over = 0, easy = 0, done = 0, all = 0;
    day.exercises.forEach(function (e) { e.sets.forEach(function (s) { if (s.extra) return; all++; if (!s.done) return; done++; var f = K.feltOf(s); if (f === 'over') { over++; if (!worst || (s.felt - s.rpe) > (worst.set.felt - worst.set.rpe)) worst = { ex: e, set: s }; } else if (f === 'hard') { hard++; if (!worst) worst = { ex: e, set: s }; } else if (f === 'easy') easy++; }); });
    return { verdict: done < all ? 'part done' : over ? 'much harder' : hard >= 2 ? 'harder' : easy >= 2 ? 'easier' : 'as written', worst: worst, n: all, done: done, hard: hard, over: over, easy: easy };
  };
  /* a session as a table: what was written against what was lifted. K.setsTable(day, { max }) */
  K.setsTable = function (day, o) {
    o = o || {}; var rows = '';
    day.exercises.slice(0, o.max || 99).forEach(function (e) {
      var groups = [];   // sets of the same prescription fold into one line: "3 × 5 @7"
      e.sets.forEach(function (s) { var g = groups[groups.length - 1]; if (g && g.w === s.w && g.r === s.r && g.rpe === s.rpe && !!g.done === !!s.done && g.felt === s.felt) g.n++; else groups.push(Object.assign({ n: 1 }, s)); });
      groups.forEach(function (g, gi) {
        rows += '<tr><td class="ex">' + (gi ? '' : K.liftChip(e.lift) + ' ' + K.esc(e.title)) + '</td><td>' + (g.n > 1 ? g.n + '<span class="x">×</span>' : '') + g.r + (g.rpe != null ? ' <span class="faint">@</span>' + K.n(g.rpe) : '') + '</td><td class="w">' + (g.w ? K.n(g.w) + ' <span class="faint" style="font-weight:450">' + (D.unit || 'kg') + '</span>' : '<span class="faint" style="font-weight:450">by feel</span>') + '</td><td class="r">' + K.feltHtml(g) + '</td></tr>';
      });
    });
    return '<table class="sets"><thead><tr><th>Exercise</th><th>Written</th><th>Load</th><th class="r">How it went</th></tr></thead><tbody>' + rows + '</tbody></table>';
  };

  /* ---- keys: K.keys({ j: fn, k: fn, e: fn }) (ignored while typing) ---- */
  K.keys = function (map) { document.addEventListener('keydown', function (e) { if (e.metaKey || e.ctrlKey || e.altKey) return; var t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return; var f = map[e.key] || map[e.key.toLowerCase()]; if (f) { e.preventDefault(); f(e); } }); };
})();
