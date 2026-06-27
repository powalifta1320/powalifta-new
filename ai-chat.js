/* ============================================================
   POWALIFTA — AI training assistant  (LOCALHOST-ONLY DEV TOOL)

   Lives on the `ai-chat` branch only. Never merged to main, never
   deployed. Two independent guards keep it off production:
     1. It refuses to initialise unless the page is on localhost.
     2. The <script> tags only exist on this branch.

   Three roles, picked from the page it's on:
     • athlete.html → "Training assistant"  (e1RM/RPE Q&A, reads logs)
     • coach.html   → "Coaching assistant"  (week summaries, program drafts)
     • both         → app concierge (how-to / navigation), as a fallback.

   Modes:
     • MOCK  (no API key) — answers from real in-app data, computed locally.
     • LIVE  (key in ai-config.local.js) — calls the Anthropic Messages API
       with a role system prompt + a compact snapshot of the user's data.

   Depends on globals from app.js: Store, getCurrentUser, bestE1RM,
   currentTotal, latestBodyweight, getProgramForAthlete, calcE1RM,
   multiplierFor, VARIANTS, LIFT_LABELS.
   ============================================================ */
(function () {
  'use strict';

  // ---- Guard 1: localhost only ----------------------------------------
  var host = location.hostname;
  var isLocal =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '' ||                    // file://
    host.endsWith('.local') ||
    /^192\.168\./.test(host) ||
    /^10\./.test(host);
  if (!isLocal) return;

  var CFG = window.POWA_AI || {};
  if (CFG.enabled === false) return;

  var ROLE = /coach\.html/i.test(location.pathname) ? 'coach' : 'athlete';
  var hasKey = typeof CFG.apiKey === 'string' && CFG.apiKey.trim().length > 8;

  // ---- tiny DOM helper (local; app.js's `el` may not be in scope) ------
  function h(tag, attrs, html) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'html') n.innerHTML = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    if (html != null) n.innerHTML = html;
    return n;
  }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  // minimal markdown: **bold**, `code`, [[n]] number highlight, newlines
  function fmt(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code>$1</code>')
      .replace(/\[\[(.+?)\]\]/g, '<span class="ai-num">$1</span>')
      .replace(/\n/g, '<br>');
  }

  var ICON = {
    spark: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.9 5.5L19.5 9l-4.4 3.2L16.6 18 12 14.7 7.4 18l1.5-5.8L4.5 9l5.6-1.5z"/></svg>',
    bot: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="12" rx="3"/><path d="M12 8V4M8 2h8"/><circle cx="9" cy="14" r="1" fill="currentColor"/><circle cx="15" cy="14" r="1" fill="currentColor"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
    send: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>'
  };

  // =====================================================================
  //  CONTEXT — read the real app data for the signed-in user
  // =====================================================================
  function S() { return (window.Store && window.Store.get && window.Store.get()) || {}; }
  function me() { return (window.getCurrentUser && window.getCurrentUser()) || window._user || null; }
  function unit() { try { return localStorage.getItem('powa-units') === 'lb' ? 'lb' : 'kg'; } catch (e) { return 'kg'; } }
  function isoDaysAgo(n) {
    var d = new Date(); d.setDate(d.getDate() - n);
    return d.toISOString().slice(0, 10);
  }
  function round(n) { return Math.round(n * 10) / 10; }
  var LABEL = (typeof LIFT_LABELS !== 'undefined') ? LIFT_LABELS : { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift' };

  // Per-athlete training snapshot used by both the mock engine and the
  // live system prompt.
  function snapshotFor(athleteId) {
    var st = S();
    var logs = (st.workoutLogs || []).filter(function (l) { return l.athleteId === athleteId; });
    var snap = { mains: {}, totalLogs: logs.length, lastDate: null, last7: { sets: 0, sessions: 0, tonnage: 0 } };
    ['squat', 'bench', 'deadlift'].forEach(function (lift) {
      var best = (typeof bestE1RM === 'function') ? bestE1RM(athleteId, lift) : 0;
      var recent = logs.filter(function (l) { return l.lift === lift; })
        .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });
      snap.mains[lift] = { best: best ? round(best) : 0, lastSet: recent[0] || null, count: recent.length };
    });
    if (logs.length) {
      snap.lastDate = logs.map(function (l) { return l.date; }).sort().slice(-1)[0];
    }
    var since = isoDaysAgo(7);
    var wk = logs.filter(function (l) { return (l.date || '') >= since; });
    var days = {};
    wk.forEach(function (l) {
      days[l.date] = 1;
      snap.last7.sets += 1;
      snap.last7.tonnage += (Number(l.weight) || 0) * (Number(l.reps) || 0);
    });
    snap.last7.sessions = Object.keys(days).length;
    snap.last7.tonnage = Math.round(snap.last7.tonnage);
    snap.total = (typeof currentTotal === 'function') ? round(currentTotal(athleteId)) : 0;
    snap.bw = (typeof latestBodyweight === 'function') ? latestBodyweight(athleteId) : null;
    var prog = (typeof getProgramForAthlete === 'function') ? getProgramForAthlete(athleteId) : null;
    snap.program = prog ? { name: prog.name, weeks: (prog.weeks || []).length } : null;
    return snap;
  }

  function rosterSummary() {
    var st = S();
    var coach = me();
    var roster = (st.athletes || []).filter(function (a) {
      return a.coachId === (coach && coach.id) || a.coach_id === (coach && coach.id);
    });
    return roster.map(function (a) {
      var snap = snapshotFor(a.id);
      var stale = !snap.lastDate || snap.lastDate < isoDaysAgo(7);
      return { id: a.id, name: a.name, snap: snap, stale: stale };
    });
  }

  // =====================================================================
  //  MOCK ENGINE — genuinely useful answers from local data
  // =====================================================================
  function fU(n) { // format weight in active unit
    if (n == null || !n) return '—';
    if (unit() === 'lb') return round(n * 2.2046) + ' lb';
    return round(n) + ' kg';
  }

  function athleteAnswer(q) {
    var u = me();
    if (!u) return "I can't see a signed-in athlete yet. Once the dashboard finishes loading I'll be able to read your logs.";
    var snap = snapshotFor(u.id);
    var t = q.toLowerCase();

    // RPE education
    if (/\brpe\b/.test(t) && /(what|explain|mean|scale|how)/.test(t)) {
      return "**RPE** is Rate of Perceived Exertion — how hard a set felt, 1–10.\n\n" +
        "• **RPE 10** = no reps left in the tank\n• **RPE 9** = ~1 rep left\n• **RPE 8** = ~2 reps left\n• **RPE 7** = ~3 reps left\n\n" +
        "POWALIFTA turns weight × reps × RPE into an estimated 1RM, so a hard triple and an easy single can be compared on one line.";
    }
    // e1RM education
    if (/(how).*(e1rm|1rm|estimat)/.test(t) || /(formula|calculat).*(1rm|e1rm)/.test(t)) {
      return "Your **e1RM** (estimated 1-rep max) comes from the RPE-percentage model:\n\n" +
        "`e1RM = weight / (1 − ((reps−1) + (10−RPE)) × 0.0333)`\n\n" +
        "So 5 reps @ RPE 8 sits at ~80% of your max. Harder variants (tempo, pin, deficit) are scaled up to a competition-equivalent number so the Progress chart compares like for like.";
    }
    // total
    if (/\btotal\b/.test(t)) {
      var m = snap.mains;
      if (!snap.total) return "I don't have enough logged sets to build a total yet. Log a squat, bench and deadlift and it'll appear on your Progress tab.";
      return "Your current **e1RM total** is [[" + fU(snap.total) + "]].\n\n" +
        "• Squat [[" + fU(m.squat.best) + "]]\n• Bench [[" + fU(m.bench.best) + "]]\n• Deadlift [[" + fU(m.deadlift.best) + "]]\n\n" +
        "These are competition-equivalent bests pulled from every set you've logged.";
    }
    // bodyweight
    if (/(body ?weight|bw|weigh)/.test(t)) {
      if (snap.bw == null) return "No bodyweight logged yet — add a weigh-in on the **Bodyweight** tab and I'll track the trend.";
      return "Your latest weigh-in is [[" + fU(snap.bw) + "]]. Log daily on the Bodyweight tab for a clean trend line and an auto wilks-style comparison against your total.";
    }
    // a specific lift's e1rm / trend
    var lift = /squat/.test(t) ? 'squat' : /bench/.test(t) ? 'bench' : /(dead|dl)/.test(t) ? 'deadlift' : null;
    if (lift) {
      var info = snap.mains[lift];
      if (!info.best) return "No " + LABEL[lift] + " sets logged yet. Once you log a few I can show your e1RM and how it's trending.";
      var out = "Your **" + LABEL[lift] + "** e1RM is [[" + fU(info.best) + "]] across " + info.count + " logged set" + (info.count === 1 ? '' : 's') + ".";
      if (info.lastSet) {
        var ls = info.lastSet;
        out += "\n\nLast entry: `" + ls.weight + (unit() === 'lb' ? '' : 'kg') + " × " + ls.reps + " @ RPE " + (ls.rpe != null ? ls.rpe : '—') + "` on " + ls.date + ".";
      }
      if (/(trend|progress|improv|going|moving)/.test(t)) {
        out += "\n\nOpen the **Progress** tab to see the full e1RM curve — it plots every session and flags PRs.";
      }
      return out;
    }
    // today / what should I do
    if (/(today|next session|workout|train|what.*do)/.test(t)) {
      if (!snap.program) return "You don't have an active program yet. If you're self-coaching, build one on the **Program** tab, or grab a proven block from the **Marketplace**.";
      return "Your program **" + esc(snap.program.name) + "** has " + snap.program.weeks + " week" + (snap.program.weeks === 1 ? '' : 's') +
        " loaded. Head to the **Today** tab — it surfaces the day pinned to today's date with every set, target RPE and a plate breakdown on tap.";
    }
    // e1rm catch-all
    if (/(e1rm|1rm|max|strong|pr)/.test(t)) {
      var mm = snap.mains;
      return "Here's where your e1RMs sit:\n\n• Squat [[" + fU(mm.squat.best) + "]]\n• Bench [[" + fU(mm.bench.best) + "]]\n• Deadlift [[" + fU(mm.deadlift.best) +
        "]]\n\nTotal [[" + fU(snap.total) + "]]. Ask me about any one lift for the detail.";
    }
    return concierge(q, 'athlete');
  }

  function coachAnswer(q) {
    var t = q.toLowerCase();
    var roster = rosterSummary();

    // draft a program
    if (/(draft|build|write|make|create).*(program|block|mesocycle|cycle)/.test(t) || /program.*(draft|template)/.test(t)) {
      return draftProgram(t);
    }
    // who needs attention / stale
    if (/(who|which).*(attention|behind|stale|inactive|missing|hasn|not logg|quiet)/.test(t) || /needs? a check/.test(t)) {
      if (!roster.length) return "No athletes connected yet. Generate an invite code on the **Roster** tab to get your first lifter in.";
      var stale = roster.filter(function (r) { return r.stale; });
      if (!stale.length) return "Everyone's logged within the last 7 days — roster's healthy. Nice.";
      return "These athletes haven't logged in the last week:\n\n" + stale.map(function (r) {
        return "• **" + esc(r.name) + "** — last logged " + (r.snap.lastDate || "never");
      }).join("\n") + "\n\nA quick check-in message from the Roster card usually does it.";
    }
    // summarise a named athlete's week
    if (/(summar|recap|review|how.*(doing|week)|week.*of)/.test(t)) {
      var match = matchAthlete(t, roster);
      if (!match && roster.length) {
        return "Which athlete? I can summarise any of: " + roster.map(function (r) { return "**" + esc(r.name) + "**"; }).join(", ") + ".";
      }
      if (!match) return "No athletes connected yet — invite a lifter from the Roster tab first.";
      return weekRecap(match);
    }
    // roster overview
    if (/(roster|overview|everyone|all.*athlete|how.*team)/.test(t)) {
      if (!roster.length) return "No athletes connected yet. Generate an invite code on the Roster tab.";
      return "You're coaching **" + roster.length + "** athlete" + (roster.length === 1 ? '' : 's') + ":\n\n" +
        roster.map(function (r) {
          return "• **" + esc(r.name) + "** — total [[" + fU(r.snap.total) + "]], " + r.snap.last7.sessions + " session" +
            (r.snap.last7.sessions === 1 ? '' : 's') + " this week" + (r.stale ? " ⚠ quiet" : "");
        }).join("\n");
    }
    // named athlete with no verb → recap
    var anyMatch = matchAthlete(t, roster);
    if (anyMatch) return weekRecap(anyMatch);

    return concierge(q, 'coach');
  }

  function matchAthlete(t, roster) {
    var found = null;
    roster.forEach(function (r) {
      var first = (r.name || '').toLowerCase().split(/\s+/)[0];
      if (first && first.length > 1 && t.indexOf(first) !== -1) found = r;
      else if (r.name && t.indexOf(r.name.toLowerCase()) !== -1) found = r;
    });
    return found;
  }

  function weekRecap(r) {
    var s = r.snap;
    if (!s.last7.sets) {
      return "**" + esc(r.name) + "** hasn't logged anything in the last 7 days (last entry " + (s.lastDate || "never") +
        "). Might be worth a nudge.";
    }
    var lines = [
      "**" + esc(r.name) + " — last 7 days**",
      "",
      "• " + s.last7.sessions + " session" + (s.last7.sessions === 1 ? '' : 's') + ", " + s.last7.sets + " sets logged",
      "• Tonnage [[" + (unit() === 'lb' ? Math.round(s.last7.tonnage * 2.2046) + ' lb' : s.last7.tonnage + ' kg') + "]]",
      "• Current total [[" + fU(s.total) + "]]  (S " + fU(s.mains.squat.best) + " · B " + fU(s.mains.bench.best) + " · D " + fU(s.mains.deadlift.best) + ")"
    ];
    if (s.program) lines.push("• On program **" + esc(s.program.name) + "** (" + s.program.weeks + " wk)");
    lines.push("", "Open their card on the Roster tab to log a note or send feedback.");
    return lines.join("\n");
  }

  function draftProgram(t) {
    var lift = /squat/.test(t) ? 'Squat' : /bench/.test(t) ? 'Bench' : /(dead|dl)/.test(t) ? 'Deadlift' : null;
    var focus = lift ? lift + "-focused" : "full SBD";
    return "Here's a 4-week RPE wave you can drop into the **Program builder** (" + focus + "):\n\n" +
      "**Week 1 — introduce**\n• Main: 4×4 @ RPE 7\n• Back-off: 3×6 @ RPE 7\n\n" +
      "**Week 2 — build**\n• Main: 4×3 @ RPE 8\n• Back-off: 3×5 @ RPE 7.5\n\n" +
      "**Week 3 — overreach**\n• Main: 3×2 @ RPE 8.5\n• Back-off: 3×4 @ RPE 8\n\n" +
      "**Week 4 — deload**\n• Main: 3×3 @ RPE 6\n• Back-off: skip\n\n" +
      "Set RPE targets per set in the builder and the athlete's e1RM chart will track competition-equivalent progress automatically. Want me to tailor the rep scheme to a specific lift or athlete?";
  }

  function concierge(q, role) {
    var t = q.toLowerCase();
    if (/(log|record|enter|add).*(set|lift|workout|session)/.test(t)) {
      return role === 'athlete'
        ? "On the **Today** tab, tap into a set, enter weight / reps / RPE and hit the check. Your e1RM updates instantly and PRs pop a toast."
        : "Athletes log their own sets on the Today tab. As a coach you set the prescription (weight + target RPE) per set in the **Program builder**.";
    }
    if (/(plate|bar|load|how much)/.test(t)) {
      return "Tap any prescribed weight to open the **plate calculator** — it shows the exact plates per side for a 20kg bar (or 45lb in pound mode).";
    }
    if (/(marketplace|buy|sell|program.*sale|listing)/.test(t)) {
      return role === 'coach'
        ? "List a program for sale from the **Marketplace** tab — set a price and POWALIFTA handles checkout (Lemon Squeezy) and pays out your share."
        : "The **Marketplace** tab has coach-built programs you can buy. Filter by tier, sort by rating or price, and it loads straight into your dashboard.";
    }
    if (/(invite|connect|coach|athlete|link)/.test(t)) {
      return role === 'coach'
        ? "Generate a 6-character invite code on the **Roster** tab and send it to your athlete. The moment they enter it, their training shows up in your roster."
        : "Your coach gives you a 6-character invite code. Enter it on the **Coach** tab to connect — they'll then build and manage your program.";
    }
    if (/(export|download|csv|backup|data)/.test(t)) {
      return "Settings → **Export** gives you everything as JSON, plus per-program CSV spreadsheets. Your data is always yours to take.";
    }
    if (/(help|what can you|who are you|hello|hi\b|hey)/.test(t)) {
      return role === 'coach'
        ? "I'm your coaching assistant. Ask me to **summarise an athlete's week**, flag **who needs attention**, **draft a program**, or explain any part of the app."
        : "I'm your training assistant. Ask me your **e1RM** or **total**, what to do **today**, how **RPE** works, or anything about using POWALIFTA.";
    }
    return role === 'coach'
      ? "I can summarise an athlete's week, flag who's gone quiet, draft an RPE program, or walk you through any feature. What do you need?"
      : "I can pull your e1RMs and total, explain RPE or e1RM, point you to today's session, or help you navigate the app. What's up?";
  }

  function mockReply(q) {
    try {
      return ROLE === 'coach' ? coachAnswer(q) : athleteAnswer(q);
    } catch (e) {
      return "I hit a snag reading your data (" + esc(e.message) + "). Try reloading the dashboard.";
    }
  }

  // =====================================================================
  //  LIVE — Anthropic Messages API (localhost dev only)
  // =====================================================================
  function systemPrompt() {
    var u = me();
    var ctx;
    if (ROLE === 'coach') {
      var roster = rosterSummary();
      ctx = "You are the POWALIFTA coaching assistant for coach " + (u ? u.name : '') + ".\n" +
        "Roster snapshot (JSON): " + JSON.stringify(roster.map(function (r) {
          return { name: r.name, total: r.snap.total, last7: r.snap.last7, mains: r.snap.mains, stale: r.stale, program: r.snap.program };
        }));
    } else {
      var snap = u ? snapshotFor(u.id) : {};
      ctx = "You are the POWALIFTA training assistant for athlete " + (u ? u.name : '') + ".\n" +
        "Their snapshot (JSON): " + JSON.stringify(snap);
    }
    return ctx + "\n\nPOWALIFTA is an RPE-native powerlifting app. e1RM = weight/(1-((reps-1)+(10-RPE))*0.0333). " +
      "Units: " + unit() + ". Be concise, concrete and barbell-literate. Use the snapshot data for any numbers — never invent them. " +
      "Use short markdown (**bold**, bullets). Keep replies under ~120 words unless asked for a full program.";
  }

  function liveReply(history, onText, onError) {
    var msgs = history.filter(function (m) { return m.role === 'user' || m.role === 'assistant'; })
      .map(function (m) { return { role: m.role, content: m.content }; });
    // Anthropic requires the conversation to open on a user turn; drop the
    // assistant greeting (and any leading assistant messages).
    while (msgs.length && msgs[0].role === 'assistant') msgs.shift();
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': CFG.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      },
      body: JSON.stringify({
        model: CFG.model || 'claude-sonnet-4-5',
        max_tokens: CFG.maxTokens || 700,
        system: systemPrompt(),
        messages: msgs
      })
    }).then(function (r) { return r.json(); }).then(function (d) {
      if (d && d.content && d.content[0] && d.content[0].text) onText(d.content[0].text);
      else onError(d && d.error ? d.error.message : 'Empty response from the model.');
    }).catch(function (e) { onError(e.message); });
  }

  // =====================================================================
  //  UI
  // =====================================================================
  var roleMeta = {
    athlete: { title: 'Training assistant', sub: 'e1RM, RPE & your program', chips: ["What's my total?", "Squat e1RM", "Explain RPE", "What should I do today?"] },
    coach: { title: 'Coaching assistant', sub: 'Roster, recaps & program drafts', chips: ["Who needs attention?", "Summarise this week", "Draft a 4-week program", "Roster overview"] }
  };
  var meta = roleMeta[ROLE];
  var history = [];
  var busy = false;

  function init() {
    if (document.querySelector('.ai-launcher')) return;

    var launcher = h('button', { class: 'ai-launcher', 'aria-label': 'Open the AI assistant', type: 'button' });
    launcher.innerHTML = ICON.spark + '<span class="ai-launcher-label">Ask AI</span>';

    var panel = h('div', { class: 'ai-panel', role: 'dialog', 'aria-label': meta.title });
    panel.innerHTML =
      '<div class="ai-head">' +
        '<div class="ai-head-mark">' + ICON.bot + '</div>' +
        '<div class="ai-head-text">' +
          '<div class="ai-head-title">' + esc(meta.title) + '</div>' +
          '<div class="ai-head-sub">' + esc(meta.sub) + '</div>' +
        '</div>' +
        '<span class="ai-mode-pill ' + (hasKey ? 'live' : 'mock') + '">' + (hasKey ? 'Live' : 'Mock') + '</span>' +
        '<button class="ai-close" aria-label="Close assistant" type="button">' + ICON.close + '</button>' +
      '</div>' +
      '<div class="ai-body"></div>' +
      '<div class="ai-chips"></div>' +
      '<div class="ai-foot">' +
        '<div class="ai-input-row">' +
          '<textarea class="ai-input" rows="1" placeholder="Ask anything…" aria-label="Message the assistant"></textarea>' +
          '<button class="ai-send" aria-label="Send" type="button">' + ICON.send + '</button>' +
        '</div>' +
        '<div class="ai-foot-note">' + (hasKey ? 'Live · Claude' : 'Local mock · answers from your real data') + ' · localhost only</div>' +
      '</div>';

    document.body.appendChild(launcher);
    document.body.appendChild(panel);

    var body = panel.querySelector('.ai-body');
    var chips = panel.querySelector('.ai-chips');
    var input = panel.querySelector('.ai-input');
    var sendBtn = panel.querySelector('.ai-send');

    function open() {
      panel.classList.add('is-open');
      launcher.classList.add('is-open');
      if (!history.length) greet();
      setTimeout(function () { input.focus(); }, 260);
    }
    function close() {
      panel.classList.remove('is-open');
      launcher.classList.remove('is-open');
    }
    launcher.addEventListener('click', open);
    panel.querySelector('.ai-close').addEventListener('click', close);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && panel.classList.contains('is-open')) close();
    });

    function greet() {
      var u = me();
      var name = u && u.name ? u.name.split(/\s+/)[0] : (ROLE === 'coach' ? 'coach' : 'lifter');
      var text = ROLE === 'coach'
        ? "Hey " + name + ". I can recap an athlete's week, flag who's gone quiet, or draft a program. Pick a chip or ask away."
        : "Hey " + name + ". Ask me your e1RM or total, how RPE works, or what's on for today. Try a chip below.";
      pushMsg('assistant', text);
    }

    function renderChips() {
      chips.innerHTML = '';
      meta.chips.forEach(function (c) {
        var chip = h('button', { class: 'ai-chip', type: 'button' }, esc(c));
        chip.addEventListener('click', function () { if (!busy) { input.value = c; submit(); } });
        chips.appendChild(chip);
      });
    }
    renderChips();

    function pushMsg(role, text) {
      history.push({ role: role, content: text });
      var msg = h('div', { class: 'ai-msg ' + role });
      var av = h('div', { class: 'ai-msg-av' }, role === 'assistant' ? ICON.bot : 'You');
      var bubble = h('div', { class: 'ai-bubble' });
      bubble.innerHTML = role === 'assistant' ? fmt(text) : esc(text);
      msg.appendChild(av);
      msg.appendChild(bubble);
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
      return bubble;
    }

    function typing() {
      var msg = h('div', { class: 'ai-msg assistant ai-typing-row' });
      msg.innerHTML = '<div class="ai-msg-av">' + ICON.bot + '</div>' +
        '<div class="ai-bubble"><div class="ai-typing"><span></span><span></span><span></span></div></div>';
      body.appendChild(msg);
      body.scrollTop = body.scrollHeight;
      return msg;
    }

    function submit() {
      var q = input.value.trim();
      if (!q || busy) return;
      input.value = '';
      input.style.height = 'auto';
      pushMsg('user', q);
      busy = true;
      sendBtn.disabled = true;
      var typer = typing();

      function answer(text) {
        typer.remove();
        pushMsg('assistant', text);
        busy = false;
        sendBtn.disabled = false;
        input.focus();
      }

      if (hasKey) {
        liveReply(history.slice(), answer, function (err) {
          typer.remove();
          pushMsg('assistant', "Live request failed: `" + esc(err) + "`.\n\nFalling back to the local answer:\n\n" + mockReply(q));
          busy = false; sendBtn.disabled = false;
        });
      } else {
        var reply = mockReply(q);
        setTimeout(function () { answer(reply); }, 360 + Math.min(700, reply.length * 4));
      }
    }

    sendBtn.addEventListener('click', submit);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); }
    });
    input.addEventListener('input', function () {
      input.style.height = 'auto';
      input.style.height = Math.min(110, input.scrollHeight) + 'px';
    });
  }

  // ---- Review deep-linking --------------------------------------------
  // review.html links to e.g. athlete.html?demo=1#tab=progress so the
  // reviewer lands on the exact tab a change touched. Tabs are rendered
  // asynchronously by bootstrap(), so poll briefly for the button.
  // Localhost-only by virtue of living in this guarded module.
  function deepLinkTab() {
    var m = (location.hash || '').match(/tab=([\w-]+)/);
    if (!m) return;
    var id = 'tab-' + m[1];
    var tries = 0;
    var iv = setInterval(function () {
      var btn = document.getElementById(id);
      if (btn) { clearInterval(iv); btn.click(); window.scrollTo(0, 0); }
      else if (++tries > 40) clearInterval(iv);
    }, 100);
  }

  function boot() { init(); deepLinkTab(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
