/* voice.js — voice notes in the coach <-> athlete thread (brief 3.8 / 4.4, milestone M5).
   No transcripts yet (open question 6). One component for every surface:

     PowaVoice.player(meta, opts)            a voice bubble's insides: play, 32-bar waveform,
                                             time, 1x / 1.5x / 2x. Returns an element.
     PowaVoice.attachComposer(composer, o)   hold-to-record on a thread's composer, then a preview
                                             strip (listen back, delete, send). Returns
                                             { start, finish, cancel, busy } so a laptop pane can
                                             bind "hold V" to it.
     PowaVoice.send(o)                       upload + insert, or queue when offline (IndexedDB),
                                             or keep it in memory on ?demo=1 (never a write)
     PowaVoice.pending(coachId, athleteId)   queued notes for a thread ("Will send when online")
     PowaVoice.flush()                       retry the queue (on 'online' and when a thread opens)

   Files live in the private `voice-notes` bucket at <coach>/<athlete>/<sender>/<message id>.<ext>
   (sql/migration-voice-notes-2026-10-22.sql). The message row carries
   meta = { type: 'voice', path, dur, peaks, mime } and a plain body ("Voice note · 0:23"). */
(function () {
  'use strict';
  const BARS = 32, MAX_SEC = 120, MIN_SEC = 0.7;
  const RATES = [1, 1.5, 2];
  const RATE_KEY = 'powa-voice-rate';

  // ------------------------------------------------------------------ pure helpers (tested)
  function fmtDur(sec) {
    const s = Math.max(0, Math.round(Number(sec) || 0));
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  }
  function voiceBody(dur) { return 'Voice note · ' + fmtDur(dur); }
  function baseMime(m) { return String(m || '').split(';')[0].trim().toLowerCase(); }
  function extFor(m) {
    const b = baseMime(m);
    return b === 'audio/webm' ? 'webm' : b === 'audio/ogg' ? 'ogg' : b === 'audio/aac' ? 'aac' : 'm4a';
  }
  // The recording's loudness over time -> BARS whole numbers 0-100, the loudest bar at 100 and
  // every bar at least 6 so silence still draws a dot.
  function peaksFrom(levels, n) {
    n = n || BARS;
    const xs = (levels || []).map(Number).filter(v => isFinite(v) && v >= 0);
    if (!xs.length) return Array(n).fill(6);
    const out = [];
    for (let i = 0; i < n; i++) {
      const a = Math.floor(i * xs.length / n), b = Math.max(a + 1, Math.floor((i + 1) * xs.length / n));
      let m = 0;
      for (let j = a; j < b && j < xs.length; j++) m = Math.max(m, xs[j]);
      out.push(m);
    }
    const top = Math.max.apply(null, out);
    return out.map(v => top > 0 ? Math.max(6, Math.round(v / top * 100)) : 6);
  }
  // A voice meta as it may come off the wire (another app version, a hand-made row): only the
  // fields we use, in range. null when it isn't a voice note.
  function cleanMeta(meta) {
    if (!meta || typeof meta !== 'object' || meta.type !== 'voice') return null;
    const dur = Number(meta.dur);
    if (!(dur > 0)) return null;
    let peaks = Array.isArray(meta.peaks) ? meta.peaks.slice(0, 64).map(v => Math.max(0, Math.min(100, Math.round(Number(v) || 0)))) : [];
    if (peaks.length !== BARS) peaks = peaksFrom(peaks.length ? peaks : null, BARS);
    const path = typeof meta.path === 'string' && meta.path.length <= 200 && meta.path.indexOf('..') < 0 ? meta.path : null;
    return { type: 'voice', path, dur: Math.min(MAX_SEC + 5, dur), peaks, mime: baseMime(meta.mime) || 'audio/mp4', demo: !!meta.demo };
  }
  function nextRate(r) { const i = RATES.indexOf(Number(r)); return RATES[(i + 1) % RATES.length]; }
  function rateLabel(r) { return (Number(r) === 1.5 ? '1.5' : String(Number(r) || 1)) + '×'; }
  // Which recording format this browser can make: mp4 (plays everywhere, the iPhone's own)
  // first, webm/ogg only where mp4 isn't on offer. '' lets the browser choose.
  function pickMime(isSupported) {
    const ok = isSupported || ((t) => { try { return !!(window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)); } catch (e) { return false; } });
    const order = ['audio/mp4', 'audio/mp4;codecs=mp4a.40.2', 'audio/aac', 'audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'];
    for (const t of order) if (ok(t)) return t;
    return '';
  }
  function supported() {
    try { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder); } catch (e) { return false; }
  }
  const newId = () => {
    try { if (crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    const h = () => Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0');
    return h() + h() + '-' + h() + '-4' + h().slice(1) + '-a' + h().slice(1) + '-' + h() + h() + h();
  };
  const rateGet = () => { try { const r = Number(localStorage.getItem(RATE_KEY)); return RATES.indexOf(r) >= 0 ? r : 1; } catch (e) { return 1; } };
  const rateSet = (r) => { try { localStorage.setItem(RATE_KEY, String(r)); } catch (e) {} };
  // Notes this viewer has played (Train shows the coach's newest one until it's been heard).
  const heardList = () => { try { const v = JSON.parse(localStorage.getItem('powa-vn-heard') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  function heard(id) { return !!id && heardList().indexOf(id) >= 0; }
  function markHeard(id) { if (!id || heard(id)) return; try { localStorage.setItem('powa-vn-heard', JSON.stringify(heardList().concat([id]).slice(-60))); } catch (e) {} }
  const say = (m) => { try { if (typeof toast === 'function') toast(m); } catch (e) {} };
  const mk = (tag, cls, attrs) => { const n = document.createElement(tag); if (cls) n.className = cls; Object.keys(attrs || {}).forEach(k => n.setAttribute(k, attrs[k])); return n; };

  // ------------------------------------------------------------------ local audio (demo, preview, queue)
  const localUrls = new Map();   // message id -> blob: URL (this page only)
  function rememberLocal(id, blob) {
    if (!id || !blob) return null;
    if (localUrls.has(id)) return localUrls.get(id);
    try { const u = URL.createObjectURL(blob); localUrls.set(id, u); return u; } catch (e) { return null; }
  }
  // The demo's seeded notes: a soft murmur shaped by the waveform, so play, seek and speed all
  // work without a file. 8 kHz mono WAV, made once per note.
  function demoUrl(id, meta) {
    if (localUrls.has('demo:' + id)) return localUrls.get('demo:' + id);
    const rate = 8000, n = Math.max(1, Math.round(rate * Math.min(30, meta.dur)));
    const buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
    const w = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true);
    v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true);
    v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
    const peaks = meta.peaks || [];
    for (let i = 0; i < n; i++) {
      const t = i / rate, env = (peaks[Math.min(peaks.length - 1, Math.floor(i / n * peaks.length))] || 20) / 100;
      const syl = 0.5 + 0.5 * Math.sin(2 * Math.PI * 3.7 * t) * Math.sin(2 * Math.PI * 0.9 * t + 1);
      const s = (Math.sin(2 * Math.PI * 150 * t) * 0.6 + Math.sin(2 * Math.PI * 300 * t) * 0.25 + (Math.random() - 0.5) * 0.15) * env * syl;
      v.setInt16(44 + i * 2, Math.max(-1, Math.min(1, s * 0.5)) * 32767, true);
    }
    const u = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
    localUrls.set('demo:' + id, u);
    return u;
  }

  // ------------------------------------------------------------------ the player
  let _playing = null;   // one note at a time
  function player(rawMeta, opts) {
    opts = opts || {};
    const meta = cleanMeta(rawMeta) || { type: 'voice', dur: 1, peaks: peaksFrom(null), path: null };
    const root = mk('div', 'vn-player' + (opts.compact ? ' is-compact' : ''), { role: 'group', 'aria-label': 'Voice note, ' + fmtDur(meta.dur) });
    const play = mk('button', 'vn-play', { type: 'button', 'aria-label': 'Play voice note' });
    play.innerHTML = '<svg class="vn-i-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.4-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" fill="currentColor"/></svg>' +
      '<svg class="vn-i-pause" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="13.5" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
    const wave = mk('div', 'vn-wave', { 'aria-hidden': 'true' });
    const bars = meta.peaks.map(p => { const b = mk('span', 'vn-bar'); b.style.height = Math.max(8, p) + '%'; wave.appendChild(b); return b; });
    const time = mk('span', 'vn-time'); time.textContent = fmtDur(meta.dur);
    const speed = mk('button', 'vn-speed', { type: 'button', 'aria-label': 'Playback speed' });
    speed.textContent = rateLabel(rateGet());
    root.appendChild(play); root.appendChild(wave); root.appendChild(time); root.appendChild(speed);

    let audio = null, loading = false, raf = 0;
    const paintAt = (t) => {
      const f = Math.max(0, Math.min(1, t / meta.dur));
      const k = Math.round(f * bars.length);
      bars.forEach((b, i) => b.classList.toggle('is-played', i < k));
      time.textContent = t > 0.05 ? fmtDur(t) : fmtDur(meta.dur);
    };
    const stopLoop = () => { if (raf) cancelAnimationFrame(raf); raf = 0; };
    const loop = () => { if (!audio) return; paintAt(audio.currentTime); raf = requestAnimationFrame(loop); };
    const setState = (s) => { root.classList.toggle('is-playing', s === 'playing'); root.classList.toggle('is-loading', s === 'loading'); root.classList.toggle('is-error', s === 'error'); play.setAttribute('aria-label', s === 'playing' ? 'Pause voice note' : 'Play voice note'); };
    async function source() {
      if (opts.src) return opts.src;
      if (opts.messageId && localUrls.has(opts.messageId)) return localUrls.get(opts.messageId);
      if (meta.demo || window._demoMode) return demoUrl(opts.messageId || 'x', meta);
      if (meta.path && window.DB && DB.voiceNoteUrl) return await DB.voiceNoteUrl(meta.path);
      return null;
    }
    async function ensure() {
      if (audio) return audio;
      loading = true; setState('loading');
      try {
        const url = await source();
        if (!url) throw new Error('no source');
        audio = new Audio();
        audio.preload = 'auto';
        audio.src = url;
        audio.playbackRate = rateGet();
        audio.addEventListener('ended', () => { stopLoop(); setState('idle'); paintAt(0); if (_playing === api) _playing = null; });
        audio.addEventListener('pause', () => { stopLoop(); if (!loading) setState('idle'); });
        audio.addEventListener('play', () => { setState('playing'); stopLoop(); loop(); });
        audio.addEventListener('error', () => { stopLoop(); setState('error'); time.textContent = "Can't play"; audio = null; });
        return audio;
      } finally { loading = false; }
    }
    async function toggle() {
      if (audio && !audio.paused) { audio.pause(); return; }
      if (_playing && _playing !== api) _playing.pause();
      _playing = api;
      try {
        const a = await ensure();
        a.playbackRate = rateGet();
        await a.play();
        markHeard(opts.messageId);
        if (typeof opts.onPlay === 'function') opts.onPlay();
      } catch (e) { setState('error'); time.textContent = "Can't play"; }
    }
    const api = { pause: () => { if (audio) audio.pause(); }, el: root };
    play.addEventListener('click', (e) => { e.stopPropagation(); toggle(); });
    speed.addEventListener('click', (e) => {
      e.stopPropagation();
      const r = nextRate(rateGet()); rateSet(r);
      speed.textContent = rateLabel(r);
      document.querySelectorAll('.vn-speed').forEach(x => { x.textContent = rateLabel(r); });
      if (audio) audio.playbackRate = r;
    });
    // Tap the waveform to jump there.
    wave.addEventListener('click', async (e) => {
      e.stopPropagation();
      const r = wave.getBoundingClientRect();
      const f = r.width ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0;
      try { const a = await ensure(); a.currentTime = f * meta.dur; paintAt(a.currentTime); if (a.paused) toggle(); } catch (err) {}
    });
    root._voice = api;
    return root;
  }

  // ------------------------------------------------------------------ recording
  async function record(o) {
    o = o || {};
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    const mime = pickMime();
    let rec;
    try { rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
    catch (e) { rec = new MediaRecorder(stream); }
    const chunks = [], levels = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    // Loudness for the live meter and the waveform: an analyser on the same stream.
    let ctx = null, timer = 0;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      const an = ctx.createAnalyser(); an.fftSize = 1024;
      ctx.createMediaStreamSource(stream).connect(an);
      const buf = new Float32Array(an.fftSize);
      timer = setInterval(() => {
        an.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        const rms = Math.sqrt(s / buf.length);
        levels.push(rms);
        if (o.onLevel) o.onLevel(Math.min(1, rms * 4));
      }, 60);
    } catch (e) { ctx = null; }
    const t0 = Date.now();
    const tick = setInterval(() => {
      const s = (Date.now() - t0) / 1000;
      if (o.onTick) o.onTick(s);
      if (s >= MAX_SEC && o.onMax) o.onMax();
    }, 200);
    rec.start(250);
    const release = () => {
      clearInterval(tick); clearInterval(timer);
      try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      try { if (ctx) ctx.close(); } catch (e) {}
    };
    let done = false;
    return {
      stop() {
        if (done) return Promise.resolve(null);
        done = true;
        return new Promise((resolve) => {
          rec.onstop = () => {
            release();
            const dur = Math.min(MAX_SEC, (Date.now() - t0) / 1000);
            const type = baseMime(rec.mimeType || mime || (chunks[0] && chunks[0].type)) || 'audio/mp4';
            const blob = new Blob(chunks, { type });
            resolve({ blob, mime: type, dur: Math.round(dur * 10) / 10, peaks: peaksFrom(levels.length ? levels : null) });
          };
          try { rec.stop(); } catch (e) { release(); resolve(null); }
        });
      },
      cancel() { if (done) return; done = true; try { rec.onstop = null; rec.stop(); } catch (e) {} release(); }
    };
  }

  // ------------------------------------------------------------------ the composer: hold to record
  // composer: the thread's .msg-composer. o = { onSend(rec) -> Promise, disabledReason?() }
  function attachComposer(composer, o) {
    o = o || {};
    if (!composer || !supported()) return null;
    composer.classList.add('has-mic');
    const mic = mk('button', 'vn-mic', { type: 'button', 'aria-label': 'Hold to record a voice note' });
    mic.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>';
    composer.appendChild(mic);
    const panel = mk('div', 'vn-rec', { role: 'status', 'aria-live': 'polite' });
    panel.hidden = true;
    composer.appendChild(panel);

    let session = null, starting = false, released = false, cancelArmed = false, startX = 0, preview = null;
    // On a phone the long hint gets cut off: say only the part you can't guess.
    const narrow = () => (window.innerWidth || 1000) <= 400;
    const recHint = () => narrow() ? '\u2039 Slide to cancel' : 'Release to finish \u00b7 slide left to cancel';
    const showRec = () => {
      panel.hidden = false; composer.classList.add('is-recording');
      panel.innerHTML = '';
      const dot = mk('span', 'vn-rec-dot'); const t = mk('span', 'vn-rec-time'); t.textContent = '0:00';
      const meter = mk('span', 'vn-rec-meter', { 'aria-hidden': 'true' });
      for (let i = 0; i < (narrow() ? 6 : 12); i++) meter.appendChild(mk('i'));
      const hint = mk('span', 'vn-rec-hint'); hint.textContent = recHint();
      panel.appendChild(dot); panel.appendChild(t); panel.appendChild(meter); panel.appendChild(hint);
      return { t, meter, hint };
    };
    const hideRec = () => { panel.hidden = true; composer.classList.remove('is-recording', 'is-cancel'); panel.innerHTML = ''; };

    async function start() {
      if (session || starting || preview) return;
      const why = o.disabledReason && o.disabledReason();
      if (why) { say(why); return; }
      starting = true; released = false; cancelArmed = false;
      const ui = showRec();
      const bars = Array.from(ui.meter.children);
      let k = 0;
      try {
        session = await record({
          onTick: (s) => { ui.t.textContent = fmtDur(s); if (s >= MAX_SEC - 10) ui.hint.textContent = fmtDur(MAX_SEC - s) + ' left'; },
          onLevel: (l) => { const b = bars[k++ % bars.length]; if (b) b.style.height = Math.max(12, Math.round(l * 100)) + '%'; },
          onMax: () => { finish(); }
        });
      } catch (e) {
        hideRec(); starting = false; session = null;
        const denied = e && (e.name === 'NotAllowedError' || e.name === 'SecurityError');
        say(denied ? 'Allow the microphone to record a voice note' : 'Could not start the microphone');
        return;
      }
      starting = false;
      if (released) finish();   // let go while the permission prompt was up
    }
    async function finish() {
      if (starting) { released = true; return; }
      const s = session; session = null;
      if (!s) return;
      if (cancelArmed) { s.cancel(); hideRec(); return; }
      const rec = await s.stop();
      hideRec();
      if (!rec || !rec.blob.size || rec.dur < MIN_SEC) { say('Hold the mic to record'); return; }
      if (rec.blob.size > 5 * 1024 * 1024) { say('That one is too long to send'); return; }
      showPreview(rec);
    }
    function cancel() {
      if (starting) { released = true; cancelArmed = true; return; }
      if (session) { session.cancel(); session = null; }
      hideRec();
      closePreview();
    }
    function showPreview(rec) {
      closePreview();
      composer.classList.add('is-preview');
      const url = URL.createObjectURL(rec.blob);
      const strip = mk('div', 'vn-preview');
      const del = mk('button', 'vn-del', { type: 'button', 'aria-label': 'Delete recording' });
      del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/></svg>';
      const pl = player({ type: 'voice', dur: rec.dur, peaks: rec.peaks, mime: rec.mime }, { src: url });
      const send = mk('button', 'btn btn-primary vn-send', { type: 'button', 'aria-label': 'Send voice note' });
      send.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5.5 11.5 12 5l6.5 6.5"/></svg>';
      strip.appendChild(del); strip.appendChild(pl); strip.appendChild(send);
      composer.appendChild(strip);
      preview = { strip, url, pl };
      del.addEventListener('click', () => closePreview());
      send.addEventListener('click', async () => {
        send.disabled = true;
        try { if (pl._voice) pl._voice.pause(); await o.onSend(rec); closePreview(true); }
        catch (e) { send.disabled = false; }
      });
      try { send.focus({ preventScroll: true }); } catch (e) {}
    }
    function closePreview(keepUrl) {
      if (!preview) return;
      try { if (preview.pl._voice) preview.pl._voice.pause(); } catch (e) {}
      if (!keepUrl) { try { URL.revokeObjectURL(preview.url); } catch (e) {} }
      preview.strip.remove(); preview = null;
      composer.classList.remove('is-preview');
    }

    // Hold: press starts, release finishes, sliding ~80px left arms cancel.
    mic.addEventListener('pointerdown', (e) => {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      try { mic.setPointerCapture(e.pointerId); } catch (err) {}
      startX = e.clientX; mic.classList.add('is-held');
      start();
    });
    mic.addEventListener('pointermove', (e) => {
      if (!session && !starting) return;
      const armed = e.clientX - startX < -80;
      if (armed !== cancelArmed) {
        cancelArmed = armed;
        composer.classList.toggle('is-cancel', armed);
        const h = panel.querySelector('.vn-rec-hint'); if (h) h.textContent = armed ? 'Release to cancel' : recHint();
      }
    });
    const up = () => { mic.classList.remove('is-held'); finish(); };
    mic.addEventListener('pointerup', up);
    mic.addEventListener('pointercancel', () => { mic.classList.remove('is-held'); cancelArmed = true; finish(); });
    mic.addEventListener('contextmenu', (e) => e.preventDefault());
    // Keyboard and switch access: Enter / Space starts, again finishes.
    mic.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      if (session || starting) finish(); else start();
    });
    return { start, finish, cancel, busy: () => !!(session || starting || preview), mic };
  }

  // ------------------------------------------------------------------ the offline queue (IndexedDB)
  const DBN = 'powa-voice', ST = 'outbox';
  let _mem = [];   // when IndexedDB is unavailable (private mode): this page only
  function idb() {
    return new Promise((resolve) => {
      try {
        if (!window.indexedDB) return resolve(null);
        const r = indexedDB.open(DBN, 1);
        r.onupgradeneeded = () => { try { r.result.createObjectStore(ST, { keyPath: 'id' }); } catch (e) {} };
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => resolve(null);
        r.onblocked = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }
  async function qAll() {
    const db = await idb();
    if (!db) return _mem.slice();
    return new Promise((resolve) => {
      try { const r = db.transaction(ST, 'readonly').objectStore(ST).getAll(); r.onsuccess = () => resolve(r.result || []); r.onerror = () => resolve([]); }
      catch (e) { resolve([]); }
    });
  }
  async function qPut(item) {
    const db = await idb();
    if (!db) { _mem = _mem.filter(x => x.id !== item.id).concat([item]); return; }
    await new Promise((resolve) => { try { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).put(item); tx.oncomplete = resolve; tx.onerror = resolve; } catch (e) { resolve(); } });
  }
  async function qDel(id) {
    const db = await idb();
    if (!db) { _mem = _mem.filter(x => x.id !== id); return; }
    await new Promise((resolve) => { try { const tx = db.transaction(ST, 'readwrite'); tx.objectStore(ST).delete(id); tx.oncomplete = resolve; tx.onerror = resolve; } catch (e) { resolve(); } });
  }
  async function pending(coachId, athleteId) {
    const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || {};
    return (await qAll()).filter(x => x.coachId === coachId && x.athleteId === athleteId && x.senderId === me.id)
      .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  }

  // ------------------------------------------------------------------ sending
  const listeners = new Set();
  function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  const emit = (ev) => listeners.forEach(fn => { try { fn(ev); } catch (e) {} });

  function pushFor(item) {
    if (!(window.DB && DB.sendPush)) return;
    const toUserId = item.senderId === item.coachId ? item.athleteId : item.coachId;
    const toAthlete = toUserId === item.athleteId;
    let from = '';
    try { const me = getCurrentUser(); from = (me && me.name || '').split(' ')[0]; } catch (e) {}
    DB.sendPush({ toUserId, title: from ? ('Voice note from ' + from) : 'New voice note', body: voiceBody(item.dur),
      url: toAthlete ? '/athlete.html' : '/coach.html', tag: 'powa-msg-' + (toAthlete ? item.athleteId : item.coachId), category: 'messages' }).catch(() => {});
  }
  // o = { coachId, athleteId, senderId, rec: { blob, mime, dur, peaks } }
  // -> { msg } sent, { queued: item } kept for later, or throws (a toast has been shown).
  async function send(o) {
    const rec = o.rec || {};
    const id = newId();
    const meta = { type: 'voice', dur: rec.dur, peaks: rec.peaks, mime: baseMime(rec.mime) };
    if (window._demoMode) {
      rememberLocal(id, rec.blob);
      const msg = { id: 'demo-vn-' + id, coachId: o.coachId, athleteId: o.athleteId, senderId: o.senderId, body: voiceBody(rec.dur),
        meta: Object.assign({ demo: true }, meta), createdAt: new Date().toISOString(), readAt: null };
      localUrls.set(msg.id, localUrls.get(id));
      const s = Store.get(); (s.messages || (s.messages = [])).push(msg);
      return { msg };
    }
    const item = { id, coachId: o.coachId, athleteId: o.athleteId, senderId: o.senderId, blob: rec.blob, mime: meta.mime, dur: rec.dur, peaks: rec.peaks, createdAt: new Date().toISOString() };
    if (!navigator.onLine) { await qPut(item); rememberLocal(id, rec.blob); emit({ queued: item }); return { queued: item }; }
    try {
      const msg = await DB.sendVoiceNote(item);
      rememberLocal(msg.id, rec.blob);
      pushFor(item);
      return { msg };
    } catch (e) {
      if (e && e.offline) { await qPut(item); rememberLocal(id, rec.blob); emit({ queued: item }); return { queued: item }; }
      say(e && e.notReady ? 'Voice notes switch on with the next update' : 'Could not send: are you still connected to them?');
      throw e;
    }
  }
  // What to do with a queued note whose send failed: 'offline' (stop, keep all), 'retry' (keep it)
  // or 'drop'. Only a definite refusal drops it straight away; a note that keeps failing goes
  // after 8 tries or 7 days, so a gym recording isn't lost to one bad moment on reconnect.
  const RETRY_MAX = 8, RETRY_AGE_MS = 7 * 86400000;
  function afterSendError(item, e, now) {
    if (e && e.offline) return 'offline';
    if (e && (e.refused || e.notReady)) return 'drop';
    const age = now - (Date.parse(item && item.createdAt) || now);
    if (((item && item.tries) || 0) + 1 >= RETRY_MAX || age > RETRY_AGE_MS) return 'drop';
    return 'retry';
  }
  // Sign-out / account deletion: this person's queued recordings leave the phone with them.
  async function clearFor(userId) {
    if (!userId) return 0;
    let n = 0;
    for (const item of await qAll()) {
      if (item.senderId === userId) { await qDel(item.id); n++; }
    }
    return n;
  }
  let _flushing = false;
  async function flush() {
    if (_flushing || window._demoMode || !navigator.onLine || !(window.DB && DB.sendVoiceNote)) return 0;
    _flushing = true;
    let sent = 0;
    try {
      const me = (typeof getCurrentUser === 'function' && getCurrentUser()) || {};
      for (const item of await qAll()) {
        if (item.senderId !== me.id) {          // another account on this phone: theirs to send,
          // unless it has sat here two weeks (signed out without the wipe): then it's stale audio
          if (Date.now() - (Date.parse(item.createdAt) || Date.now()) > 14 * 86400000) await qDel(item.id);
          continue;
        }
        try {
          const msg = await DB.sendVoiceNote(item);
          await qDel(item.id); sent++;
          rememberLocal(msg.id, item.blob);
          pushFor(item);
          emit({ sent: msg, id: item.id });
        } catch (e) {
          const next = afterSendError(item, e, Date.now());
          if (next === 'offline') break;      // still offline: keep everything, try later
          if (next === 'retry') {             // a hiccup (5xx, 429, token refresh): keep it, count the try
            await qPut(Object.assign({}, item, { tries: (item.tries || 0) + 1 }));
            continue;
          }
          await qDel(item.id);                // refused for good (policy, link gone, not ready) or too old
          emit({ dropped: item, error: e });
          say(e && e.notReady ? 'Voice notes switch on with the next update' : 'A voice note could not be sent');
        }
      }
    } finally { _flushing = false; }
    return sent;
  }
  async function discard(id) { await qDel(id); emit({ dropped: { id } }); }
  window.addEventListener('online', () => { flush(); });
  window.addEventListener('load', () => { setTimeout(() => { if (navigator.onLine) flush(); }, 4000); });

  window.PowaVoice = {
    supported, player, attachComposer, send, pending, flush, discard, clearFor, onChange, record, afterSendError,
    localUrl: (id) => localUrls.get(id) || null, rememberLocal, heard, markHeard,
    // pure, for tests
    fmtDur, voiceBody, peaksFrom, cleanMeta, nextRate, rateLabel, pickMime, baseMime, extFor, BARS, MAX_SEC
  };
})();
