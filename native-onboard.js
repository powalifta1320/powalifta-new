/* =====================================================================
   NATIVE ONBOARDING (app only) — native-onboard.css holds the styles.
   ---------------------------------------------------------------------
   1. The welcome story: a scroll-snap deck (native momentum + snap, so it
      is interruptible and velocity-aware for free), captions that follow
      the slide, page dots, a gentle auto-advance that stops the moment you
      touch it, and a count-up on the "total" card.
   2. Full-screen sheets that replace the website modals inside the app:
        sign up  →  who are you · name (+ coach code) · email + password
        log in   →  email + password · forgot password
      They call the SAME backend as the website (DB.signUpAthlete /
      DB.signUpCoach / DB.signIn / DB.requestPasswordReset / 2FA step-up),
      so nothing about accounts changes — only how it looks and feels.
   Inert on the web: it returns before doing anything unless html.native.
   ===================================================================== */
(function () {
  'use strict';
  var root = document.documentElement;
  if (!root.classList.contains('native')) return;

  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function haptic(kind) {
    try {
      if (!window.PowaNative) return;
      if (kind === 'success' || kind === 'error') PowaNative.notify(kind === 'success' ? 'SUCCESS' : 'ERROR');
      else PowaNative.haptic(kind === 'medium' ? 'MEDIUM' : 'LIGHT');
    } catch (e) {}
  }
  function h(tag, attrs, kids) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  var SVG = function (d, sw) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (sw || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>'; };
  var I = {
    back: SVG('<path d="M15 18l-6-6 6-6"/>', 2.4),
    check: SVG('<polyline points="20 6 9 17 4 12"/>', 3),
    eye: SVG('<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: SVG('<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><path d="M1 1l22 22"/>'),
    solo: SVG('<path d="M6.5 6.5h11M6.5 17.5h11"/><rect x="2" y="8" width="3" height="8" rx="1"/><rect x="19" y="8" width="3" height="8" rx="1"/><path d="M5 12h14"/>'),
    coached: SVG('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
    coach: SVG('<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>'),
    mail: SVG('<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M22 7l-10 6L2 7"/>')
  };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  // ---------------------------------------------------------------
  // 1. WELCOME STORY
  // ---------------------------------------------------------------
  var CAPTIONS = [
    ['Every set, one tap.', 'Your program says what\'s next. Log it with RPE and move on.'],
    ['Watch your total climb.', 'e1RM, PRs and DOTS update from every set you log.'],
    ['Lift with your crew.', 'Train with a coach or a club. Free for athletes, always.']
  ];
  function initWelcome() {
    var deck = document.getElementById('nwDeck');
    if (!deck) return;
    var slides = Array.prototype.slice.call(deck.querySelectorAll('.nw2-slide'));
    var dots = Array.prototype.slice.call(document.querySelectorAll('#nwDots i'));
    var copy = document.querySelector('.nw2-copy');
    var title = document.getElementById('nwTitle');
    var sub = document.getElementById('nwSub');
    var cur = 0, auto = null, touched = false, raf = 0;

    function countUp(el) {
      var from = Number(el.getAttribute('data-from')) || 0, to = Number(el.getAttribute('data-to')) || 0;
      if (reduce || !to) { el.textContent = String(to); return; }
      var t0 = null;
      function frame(ts) {
        if (t0 == null) t0 = ts;
        var p = Math.min(1, (ts - t0) / 1100), e = 1 - Math.pow(1 - p, 4);
        el.textContent = String(Math.round(from + (to - from) * e));
        if (p < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }
    function activate(i) {
      if (i === cur) return;
      cur = i;
      slides.forEach(function (s, k) {
        s.classList.remove('on');
        if (k === i) { void s.offsetWidth; s.classList.add('on'); }
      });
      dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
      var c = slides[i].querySelector('.vg-count'); if (c) countUp(c);
      // Captions cross-fade with the slide.
      copy.classList.add('swap');
      setTimeout(function () {
        title.textContent = CAPTIONS[i][0];
        sub.textContent = CAPTIONS[i][1];
        copy.classList.remove('swap');
      }, reduce ? 0 : 170);
    }
    deck.addEventListener('scroll', function () {
      if (raf) return;
      raf = requestAnimationFrame(function () {
        raf = 0;
        var w = deck.clientWidth || 1;
        var i = Math.max(0, Math.min(slides.length - 1, Math.round(deck.scrollLeft / w)));
        activate(i);
      });
    }, { passive: true });
    function stopAuto() { touched = true; if (auto) { clearInterval(auto); auto = null; } }
    // Any touch anywhere on the welcome hands control to the person: the deck
    // never animates under a finger that's about to tap Get started.
    document.addEventListener('touchstart', stopAuto, { passive: true, capture: true });
    document.addEventListener('pointerdown', stopAuto, true);
    window.addEventListener('pagehide', stopAuto);
    // A slow tour of the three cards until the first touch — never with reduced motion.
    if (!reduce) {
      auto = setInterval(function () {
        if (touched || root.classList.contains('ob-open') || document.hidden) return;
        var next = (cur + 1) % slides.length;
        deck.scrollTo({ left: next * deck.clientWidth, behavior: 'smooth' });
      }, 4800);
    }
  }

  // ---------------------------------------------------------------
  // 2. SHEETS
  // ---------------------------------------------------------------
  var sheet = null;
  function closeSheet() {
    if (!sheet) return;
    var s = sheet; sheet = null;
    s.classList.remove('open');
    root.classList.remove('ob-open');
    setTimeout(function () { s.remove(); }, reduce ? 200 : 480);
  }
  // A sheet with a back button, an optional progress bar and a horizontal
  // track of steps. Returns { el, go(i), step(i), setProgress(n, of) }.
  function makeSheet(label, nSteps, onBackAtStart) {
    var el = h('div', { class: 'ob-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label });
    var back = h('button', { class: 'ob-back', type: 'button', 'aria-label': 'Back', html: I.back });
    var prog = h('div', { class: 'ob-progress', 'aria-hidden': 'true' });
    for (var p = 0; p < nSteps; p++) prog.appendChild(h('i'));
    el.appendChild(h('div', { class: 'ob-bar' }, [back, nSteps > 1 ? prog : h('span'), h('span')]));
    var track = h('div', { class: 'ob-track' });
    el.appendChild(h('div', { class: 'ob-viewport' }, [track]));
    var api = {
      el: el, track: track, at: 0,
      step: function (i) { return track.children[i]; },
      add: function (node) { track.appendChild(node); return node; },
      go: function (i) {
        api.at = i;
        track.style.transform = 'translateX(' + (-100 * i) + '%)';
        Array.prototype.forEach.call(prog.children, function (b, k) { b.classList.toggle('on', k <= i); });
        Array.prototype.forEach.call(track.children, function (s, k) { s.setAttribute('aria-hidden', k === i ? 'false' : 'true'); s.inert = k !== i; });
        var f = track.children[i] && track.children[i].querySelector('[data-autofocus]');
        if (f) setTimeout(function () { try { f.focus({ preventScroll: true }); } catch (e) {} }, reduce ? 0 : 430);
      }
    };
    back.addEventListener('click', function () {
      haptic('light');
      if (api.at > 0) api.go(api.at - 1); else if (onBackAtStart) onBackAtStart(); else closeSheet();
    });
    return api;
  }
  function present(api) {
    if (sheet) sheet.remove();
    sheet = api.el;
    document.body.appendChild(api.el);
    api.go(0);
    void api.el.offsetWidth;
    api.el.classList.add('open');
    root.classList.add('ob-open');
  }
  function field(label, input, extra) {
    return h('label', { class: 'ob-field' }, [h('span', { text: label }), extra ? h('div', { class: 'ob-input-wrap' }, [input, extra]) : input]);
  }
  function eyeToggle(input) {
    // The sheet owns this field's show/hide button; tell app.js attachPwdToggles()
    // to leave it alone (it was adding a second, overlapping eye).
    input.setAttribute('data-pwd-bound', '1');
    var b = h('button', { class: 'ob-eye', type: 'button', 'aria-label': 'Show password', html: I.eye });
    b.addEventListener('click', function () {
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.innerHTML = show ? I.eyeOff : I.eye;
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
    return b;
  }
  function busy(btn, on, label) {
    if (!btn) return;
    if (on) { btn._label = btn.textContent; btn.disabled = true; btn.textContent = label || 'One moment…'; }
    else { btn.disabled = false; if (btn._label) btn.textContent = btn._label; }
  }
  function onEnter(input, fn) { input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); fn(); } }); }

  // ---------- Sign up ----------
  var ROLES = [
    { key: 'solo', tint: 't-fire', icon: I.solo, title: 'I train on my own', sub: 'Follow a program, log every set, watch your total climb.' },
    { key: 'athlete', tint: 't-green', icon: I.coached, title: 'I have a coach', sub: 'Join with their code. Your program shows up ready to lift.' },
    { key: 'coach', tint: 't-violet', icon: I.coach, title: 'I coach lifters', sub: 'Build programs, run your roster, free for your first 3.' }
  ];
  function openSignup(opts) {
    opts = opts || {};
    var st = { role: opts.role && /^(solo|athlete|coach)$/.test(opts.role) ? opts.role : null, code: (opts.code || '').toUpperCase().slice(0, 6) };
    var api = makeSheet('Create your account', 3);

    // Step 1 — who are you
    var s1 = api.add(h('div', { class: 'ob-step' }));
    s1.appendChild(h('h2', { text: 'How will you use POWALIFTA?' }));
    s1.appendChild(h('p', { class: 'ob-lead', text: 'Pick one. You can change it later.' }));
    var choices = h('div', { class: 'ob-choices', role: 'radiogroup', 'aria-label': 'How you will use POWALIFTA' });
    ROLES.forEach(function (r) {
      var card = h('button', { class: 'ob-card ' + r.tint + (st.role === r.key ? ' on' : ''), type: 'button', role: 'radio', 'aria-checked': st.role === r.key ? 'true' : 'false' }, [
        h('span', { class: 'ob-card-ic', html: r.icon }),
        h('span', { class: 'ob-card-txt' }, [h('b', { text: r.title }), h('span', { class: 'ob-card-sub', text: r.sub })]),
        h('span', { class: 'ob-tick', html: I.check })
      ]);
      card.addEventListener('click', function () {
        st.role = r.key;
        Array.prototype.forEach.call(choices.children, function (c) { var on = c === card; c.classList.toggle('on', on); c.setAttribute('aria-checked', on ? 'true' : 'false'); });
        haptic('light');
        codeWrap.style.display = st.role === 'athlete' ? '' : 'none';
        setTimeout(function () { api.go(1); }, reduce ? 0 : 230);
      });
      choices.appendChild(card);
    });
    s1.appendChild(choices);
    s1.appendChild(h('p', { class: 'ob-fine', html: 'Already have an account? <a href="#" data-login>Log in</a>' }));

    // Step 2 — name (+ coach code for coached lifters)
    var s2 = api.add(h('div', { class: 'ob-step' }));
    s2.appendChild(h('h2', { text: 'What should we call you?' }));
    s2.appendChild(h('p', { class: 'ob-lead', text: 'Your coach and your club see this name.' }));
    var name = h('input', { class: 'ob-input', type: 'text', autocomplete: 'name', autocapitalize: 'words', enterkeyhint: 'next', placeholder: 'Full name', 'data-autofocus': '1', 'aria-label': 'Full name' });
    s2.appendChild(field('Name', name));
    var code = h('input', { class: 'ob-input ob-code', type: 'text', maxlength: '6', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: 'CODE', 'aria-label': 'Coach code' });
    code.value = st.code;
    code.addEventListener('input', function () { code.value = code.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
    var codeWrap = h('div', {}, [field('Coach code (optional)', code), h('p', { class: 'ob-fine', style: 'text-align:left;margin:-6px 4px 16px', text: 'No code yet? Skip it and connect from the Coach tab later.' })]);
    codeWrap.style.display = st.role === 'athlete' ? '' : 'none';
    s2.appendChild(codeWrap);
    var err2 = h('div', { class: 'ob-err', role: 'alert' });
    s2.appendChild(err2);
    var next2 = h('button', { class: 'nw-btn nw-btn-primary', type: 'button', text: 'Continue' });
    function go2() {
      if (name.value.trim().length < 2) { err2.textContent = 'Add your name to keep going.'; haptic('error'); name.focus(); return; }
      if (typeof filterUserText === 'function' && !filterUserText(name.value).ok) { err2.textContent = 'Please choose a different name.'; haptic('error'); name.focus(); return; }
      err2.textContent = '';
      haptic('light');
      api.go(2);
    }
    next2.addEventListener('click', go2);
    onEnter(name, go2);
    s2.appendChild(next2);

    // Step 3 — account
    var s3 = api.add(h('div', { class: 'ob-step' }));
    s3.appendChild(h('h2', { text: 'Create your account' }));
    s3.appendChild(h('p', { class: 'ob-lead', text: 'Your training syncs to every device you sign in on.' }));
    var email = h('input', { class: 'ob-input', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'next', placeholder: 'you@email.com', 'data-autofocus': '1', 'aria-label': 'Email' });
    var pwd = h('input', { class: 'ob-input has-eye', type: 'password', autocomplete: 'new-password', enterkeyhint: 'go', placeholder: 'At least 6 characters', 'aria-label': 'Password' });
    s3.appendChild(field('Email', email));
    s3.appendChild(field('Password', pwd, eyeToggle(pwd)));
    var meterFill = h('div', { class: 'ob-meter-fill' });
    var meterLabel = h('span', { class: 'ob-meter-label' });
    var meter = h('div', { class: 'ob-meter' }, [h('div', { class: 'ob-meter-track' }, [meterFill]), meterLabel]);
    meter.style.visibility = 'hidden';
    s3.appendChild(meter);
    pwd.addEventListener('input', function () {
      if (!pwd.value || typeof pwdStrength !== 'function') { meter.style.visibility = 'hidden'; return; }
      var s = pwdStrength(pwd.value);
      meter.style.visibility = 'visible';
      meterFill.style.transform = 'scaleX(' + Math.max(0.06, Math.min(1, (s.pct || 0) / 100)) + ')';
      meterFill.className = 'ob-meter-fill s' + s.score;
      meterLabel.textContent = s.label;
    });
    onEnter(email, function () { pwd.focus(); });
    // Minimum age 16 (privacy.html "Children"): a confirmation they tick, not a date of birth we'd have to keep.
    var ageBox = h('input', { class: 'ob-check-input', type: 'checkbox' });
    s3.appendChild(h('label', { class: 'ob-check' }, [ageBox, h('span', { class: 'ob-check-box', 'aria-hidden': 'true' }),
      h('span', { class: 'ob-check-text', html: 'I\'m 16 or older and I agree to the <a href="terms.html">Terms</a> and <a href="privacy.html">Privacy Policy</a>.' })]));
    ageBox.addEventListener('change', function () { if (ageBox.checked) { err3.textContent = ''; haptic('light'); } });
    var err3 = h('div', { class: 'ob-err', role: 'alert' });
    s3.appendChild(err3);
    var create = h('button', { class: 'nw-btn nw-btn-primary', type: 'button', text: 'Create account' });
    s3.appendChild(create);

    async function submit() {
      var nm = name.value.trim(), em = email.value.trim().toLowerCase(), pw = pwd.value, cd = code.value.trim().toUpperCase();
      if (!st.role) { api.go(0); return; }
      if (!nm) { api.go(1); return; }
      if (!EMAIL_RE.test(em)) { err3.textContent = 'That email doesn\'t look right.'; haptic('error'); email.focus(); return; }
      if (pw.length < 6) { err3.textContent = 'Use at least 6 characters.'; haptic('error'); pwd.focus(); return; }
      if (!ageBox.checked) { err3.textContent = 'Please confirm you\'re 16 or older.'; haptic('error'); return; }
      var consent = { age_16_plus: true, terms_accepted_at: new Date().toISOString() };
      err3.textContent = '';
      busy(create, true, 'Creating account…');
      try {
        if (st.role === 'coach') await DB.signUpCoach(nm, em, pw, '', consent);
        else await DB.signUpAthlete(nm, em, pw, st.role === 'athlete' ? cd : '', consent);
        try { if (typeof sendWelcomeEmail === 'function') sendWelcomeEmail(em, nm, st.role === 'coach' ? 'coach' : 'athlete'); } catch (e) {}
        var session = await DB.getSession();
        haptic('success');
        if (!session) { showConfirm(api, em); busy(create, false); return; }
        try { localStorage.setItem('powa-last-role', st.role === 'coach' ? 'coach' : 'athlete'); } catch (e) {}
        location.href = st.role === 'coach' ? 'coach.html'
          : (st.role === 'athlete' && !cd) ? 'athlete.html?tab=coach'
          : 'athlete.html';
      } catch (e) {
        haptic('error');
        err3.textContent = (e && e.message) || 'Could not create your account. Try again.';
        busy(create, false);
      }
    }
    create.addEventListener('click', submit);
    onEnter(pwd, submit);

    present(api);
    s1.querySelector('[data-login]').addEventListener('click', function (e) { e.preventDefault(); openLogin({ email: email.value }); });
    if (st.role) { codeWrap.style.display = st.role === 'athlete' ? '' : 'none'; api.go(1); }
  }
  function showConfirm(api, em) {
    var s = api.add(h('div', { class: 'ob-step' }));
    s.appendChild(h('div', { class: 'ob-done-ic', html: I.mail }));
    s.appendChild(h('h2', { text: 'Check your email' }));
    s.appendChild(h('p', { class: 'ob-lead', text: 'We sent a confirmation link to ' + em + '. Tap it, then log in here.' }));
    var b = h('button', { class: 'nw-btn nw-btn-primary', type: 'button', text: 'Log in' });
    b.addEventListener('click', function () { openLogin({ email: em }); });
    s.appendChild(b);
    api.go(api.track.children.length - 1);
  }

  // ---------- Log in ----------
  function openLogin(opts) {
    opts = opts || {};
    var api = makeSheet('Log in', 1);
    var s1 = api.add(h('div', { class: 'ob-step' }));
    s1.appendChild(h('h2', { text: 'Welcome back' }));
    s1.appendChild(h('p', { class: 'ob-lead', text: 'Log in to pick up where you left off.' }));
    var email = h('input', { class: 'ob-input', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'next', placeholder: 'you@email.com', 'data-autofocus': '1', 'aria-label': 'Email' });
    email.value = opts.email || '';
    var pwd = h('input', { class: 'ob-input has-eye', type: 'password', autocomplete: 'current-password', enterkeyhint: 'go', placeholder: 'Password', 'aria-label': 'Password' });
    s1.appendChild(field('Email', email));
    s1.appendChild(field('Password', pwd, eyeToggle(pwd)));
    var err = h('div', { class: 'ob-err', role: 'alert' });
    s1.appendChild(err);
    var go = h('button', { class: 'nw-btn nw-btn-primary', type: 'button', text: 'Log in' });
    s1.appendChild(go);
    var forgot = h('button', { class: 'ob-link', type: 'button', text: 'Forgot password?' });
    s1.appendChild(forgot);
    s1.appendChild(h('p', { class: 'ob-fine', html: 'New here? <a href="#" data-signup>Create an account</a>' }));

    // Forgot password, inside the same sheet.
    var s2 = api.add(h('div', { class: 'ob-step' }));
    s2.appendChild(h('h2', { text: 'Reset your password' }));
    s2.appendChild(h('p', { class: 'ob-lead', text: 'We\'ll email you a link to set a new one.' }));
    var femail = h('input', { class: 'ob-input', type: 'email', inputmode: 'email', autocomplete: 'email', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'send', placeholder: 'you@email.com', 'data-autofocus': '1', 'aria-label': 'Email' });
    s2.appendChild(field('Email', femail));
    var ferr = h('div', { class: 'ob-err', role: 'alert' });
    s2.appendChild(ferr);
    var send = h('button', { class: 'nw-btn nw-btn-primary', type: 'button', text: 'Send reset link' });
    s2.appendChild(send);
    forgot.addEventListener('click', function () { femail.value = email.value; api.go(1); });

    async function doIt() {
      var em = email.value.trim().toLowerCase(), pw = pwd.value;
      if (!EMAIL_RE.test(em)) { err.textContent = 'Enter the email you signed up with.'; haptic('error'); email.focus(); return; }
      if (!pw) { err.textContent = 'Enter your password.'; haptic('error'); pwd.focus(); return; }
      err.textContent = '';
      busy(go, true, 'Logging in…');
      try {
        await DB.signIn(em, pw);
        // 2FA step-up, same as the website login.
        var aal = await DB.mfaAssurance();
        if (aal && aal.ok && aal.nextLevel === 'aal2' && aal.currentLevel !== 'aal2') {
          var passed = typeof promptMfaChallenge === 'function' ? await promptMfaChallenge() : false;
          if (!passed) { await DB.signOut(); throw new Error('Two-factor verification is required.'); }
        }
        var session = await DB.getSession();
        var profile = await DB.getProfile(session.user.id);
        try { localStorage.setItem('powa-last-role', profile.user_type); } catch (e) {}
        haptic('success');
        location.href = profile.user_type === 'coach' ? 'coach.html' : (profile.user_type === 'admin' ? 'admin.html' : 'athlete.html');
      } catch (e) {
        haptic('error');
        var m = (e && e.message) || '';
        err.textContent = /invalid login|invalid credentials/i.test(m) ? 'That email and password don\'t match.' : (m || 'Could not log in. Try again.');
        busy(go, false);
      }
    }
    async function doReset() {
      var em = femail.value.trim().toLowerCase();
      if (!EMAIL_RE.test(em)) { ferr.textContent = 'Enter the email you signed up with.'; haptic('error'); return; }
      ferr.textContent = '';
      busy(send, true, 'Sending…');
      try {
        await DB.requestPasswordReset(em);
        haptic('success');
        send.textContent = 'Link sent. Check your inbox';
        setTimeout(function () { busy(send, false); api.go(0); }, 1800);
      } catch (e) {
        haptic('error');
        ferr.textContent = (e && e.message) || 'Could not send the reset email.';
        busy(send, false);
      }
    }
    go.addEventListener('click', doIt);
    onEnter(email, function () { pwd.focus(); });
    onEnter(pwd, doIt);
    send.addEventListener('click', doReset);
    onEnter(femail, doReset);
    present(api);
    s1.querySelector('[data-signup]').addEventListener('click', function (e) { e.preventDefault(); openSignup(); });
  }

  // ---------------------------------------------------------------
  // 3. WIRING
  // ---------------------------------------------------------------
  window.obOpen = function (kind, opts) {
    haptic('light');
    if (kind === 'login') openLogin(opts); else openSignup(opts);
  };
  // Anything in the page that still asks for the website modals gets the app flow.
  window.openSignupModal = function (type) { window.obOpen('signup', { role: type === 'solo' ? null : type }); };
  window.openLoginModal = function () { window.obOpen('login'); };

  function boot() {
    initWelcome();
    // Coach invite deep link (index.html?code=ABC123) → straight to the coached sign-up.
    try {
      var code = new URLSearchParams(location.search).get('code');
      if (code && !root.classList.contains('has-session')) window.obOpen('signup', { role: 'athlete', code: code });
    } catch (e) {}
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
