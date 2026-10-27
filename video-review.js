/* =====================================================================
   video-review.js — form-check video review (M6, 2026-10-22)

   The coach opens a lifter's clip, steps it frame by frame, draws on the
   frame that matters (line, arrow, circle, angle with the degrees, freehand),
   tags what they judged (depth, lockout, pause, bar path, set-up), and sends
   it. The lifter sees the same drawings replayed on their own video at the
   moments they were drawn, read-only. Compare puts two clips side by side,
   each with an "align here" mark (e.g. the bottom of the squat), and plays
   them locked together.

   One entry point for the coach, on the phone and the laptop desk alike:
     openVideoReview(formCheckId, { formChecks, onSaved }) → true when it opened
   (exported on window, so the desk's Today lane can call it directly).
   The lifter's side: VideoReview.mountReplay(host, formCheck).
   The iPhone app: VideoReview.attachNativePicker(fileInput) swaps the web file
   input for the native picker, which exports HEVC clips to H.264 MP4 first
   (native/ios-native/App/VideoExportPlugin.swift, JS name PowaVideo).

   Geometry is pure and unit-tested (tests.html "video review"): drawings are
   vectors normalised 0–1 to the video frame, so they land on the same spot at
   any size; angles are measured in pixels (aspect-aware); a review is capped
   at 8 KB the same way Postgres measures it.

   Data: sql/migration-form-check-annotations-2026-10-22.sql, through the db.js
   "VIDEO REVIEW hook" (getFormCheckAnnotations / saveFormCheckAnnotations, with
   an on-device fallback until the migration runs). ?demo=1 never writes: two
   sample clips (demo-media/) and an in-memory store.

   Hooks in shared files (each marked "VIDEO REVIEW hook"): coach.html (script
   tag, openFormCheckReview, refreshFormChecks demo seed), athlete.html (script
   tag, the demo's checks (demoAthleteFormChecks: the seeded one + clips sent on
   the page, played from object URLs), buildFormCheckCard's Watch button, the upload form),
   db.js (the DB methods at the end), tests.html + test/run-unit-tests.js.
   ===================================================================== */
var VideoReview = (function () {
  'use strict';
  var root = typeof window !== 'undefined' ? window : globalThis;
  var hasDom = typeof document !== 'undefined' && !!document.createElement;

  // ------------------------------------------------------------ constants
  var TAGS = [
    { id: 'depth', label: 'Depth' }, { id: 'lockout', label: 'Lockout' }, { id: 'pause', label: 'Pause' },
    { id: 'bar_path', label: 'Bar path' }, { id: 'setup', label: 'Set-up' }, { id: 'other', label: 'Other' }
  ];
  var TAG_IDS = TAGS.map(function (t) { return t.id; });
  var KINDS = ['line', 'arrow', 'circle', 'angle', 'free'];
  var KIND_LABEL = { line: 'Line', arrow: 'Arrow', circle: 'Circle', angle: 'Angle', free: 'Freehand' };
  var CAP_BYTES = 8192;          // the server's cap per review row (drawings + note)
  var NOTE_MAX = 280;
  var MAX_DRAWINGS = 200;
  var MAX_FREE_NUMS = 240;       // a freehand stroke keeps at most 120 points
  var HOLD_S = 1.2;              // how long a drawing stays up while the clip plays
  var STOP_S = 1.6;              // the lifter's replay rests this long on each drawn frame
  var RATES = [0.25, 0.5, 1];
  var URL_TTL = 3600;            // signed URL lifetime asked for (seconds)
  var config = { demoTtl: 3600 };

  // ------------------------------------------------------------ pure helpers
  function q3(v) { return Math.round(v * 1000) / 1000; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function num(v) { return typeof v === 'number' && isFinite(v); }

  // Where the picture sits inside a box with object-fit: contain (letterbox bars excluded).
  function contentBox(elW, elH, vidW, vidH) {
    if (!(elW > 0) || !(elH > 0)) return { x: 0, y: 0, w: 0, h: 0 };
    if (!(vidW > 0) || !(vidH > 0)) return { x: 0, y: 0, w: elW, h: elH };
    var s = Math.min(elW / vidW, elH / vidH), w = vidW * s, h = vidH * s;
    return { x: (elW - w) / 2, y: (elH - h) / 2, w: w, h: h };
  }
  // A point on screen → 0–1 frame coordinates (clamped to the frame, 3 decimals).
  function toNorm(px, py, box) {
    if (!box || !(box.w > 0) || !(box.h > 0)) return [0, 0];
    return [q3(clamp((px - box.x) / box.w, 0, 1)), q3(clamp((py - box.y) / box.h, 0, 1))];
  }
  function toPx(nx, ny, box) { return [box.x + nx * box.w, box.y + ny * box.h]; }

  // The angle at the middle point of p = [ax, ay, vx, vy, bx, by] (normalised), measured in
  // the video's pixels (w × h) so a portrait clip doesn't skew it. 0–180, one decimal; null if a
  // leg has no length.
  function angleDeg(p, w, h) {
    if (!p || p.length < 6) return null;
    w = w > 0 ? w : 1; h = h > 0 ? h : 1;
    var ax = (p[0] - p[2]) * w, ay = (p[1] - p[3]) * h, bx = (p[4] - p[2]) * w, by = (p[5] - p[3]) * h;
    var la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) return null;
    var c = clamp((ax * bx + ay * by) / (la * lb), -1, 1);
    return Math.round(Math.acos(c) * 1800 / Math.PI) / 10;
  }

  function distToSeg(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    var t = l2 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }
  function pxPoints(d, box) {
    var out = [];
    for (var i = 0; i + 1 < d.p.length; i += 2) out.push(toPx(d.p[i], d.p[i + 1], box));
    return out;
  }
  // The topmost drawing within tol pixels of (px, py), or -1. `only` limits it to some indexes.
  function hitTest(drawings, px, py, box, tol, only) {
    tol = tol || 10;
    for (var i = drawings.length - 1; i >= 0; i--) {
      if (only && only.indexOf(i) < 0) continue;
      var d = drawings[i], P = pxPoints(d, box), hit = false;
      if (d.k === 'circle' && P.length >= 2) {
        var r = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
        var dc = Math.hypot(px - P[0][0], py - P[0][1]);
        hit = Math.abs(dc - r) <= tol || (r < tol * 2 && dc <= r + tol);
      } else {
        for (var j = 0; j + 1 < P.length && !hit; j++) hit = distToSeg(px, py, P[j][0], P[j][1], P[j + 1][0], P[j + 1][1]) <= tol;
        if (!hit && P.length === 1) hit = Math.hypot(px - P[0][0], py - P[0][1]) <= tol;
      }
      if (hit) return i;
    }
    return -1;
  }

  // Ramer–Douglas–Peucker on [[x, y], …] (pixels): drops points closer than eps to the line.
  function rdp(pts, eps) {
    if (pts.length < 3) return pts.slice();
    var keep = new Array(pts.length); keep[0] = keep[pts.length - 1] = true;
    var stack = [[0, pts.length - 1]];
    while (stack.length) {
      var s = stack.pop(), a = s[0], b = s[1], best = -1, far = 0;
      for (var i = a + 1; i < b; i++) {
        var dd = distToSeg(pts[i][0], pts[i][1], pts[a][0], pts[a][1], pts[b][0], pts[b][1]);
        if (dd > far) { far = dd; best = i; }
      }
      if (best > 0 && far > eps) { keep[best] = true; stack.push([a, best], [best, b]); }
    }
    return pts.filter(function (_, i) { return keep[i]; });
  }
  // A freehand stroke in screen pixels → a flat normalised array, simplified until it fits.
  function simplifyFree(pts, box, eps) {
    eps = eps || 1.5;
    var s = rdp(pts, eps);
    while (s.length * 2 > MAX_FREE_NUMS && eps < 64) { eps *= 1.6; s = rdp(pts, eps); }
    var out = [];
    s.forEach(function (p) { var n = toNorm(p[0], p[1], box); out.push(n[0], n[1]); });
    // two identical neighbours after rounding add nothing
    var flat = [];
    for (var i = 0; i < out.length; i += 2) {
      if (flat.length >= 2 && flat[flat.length - 2] === out[i] && flat[flat.length - 1] === out[i + 1]) continue;
      flat.push(out[i], out[i + 1]);
    }
    if (flat.length > MAX_FREE_NUMS) {
      // still too long: keep evenly spaced points, always the last one
      var n = MAX_FREE_NUMS / 2, step = (flat.length / 2 - 1) / (n - 1), thin = [];
      for (var k = 0; k < n; k++) { var j = Math.round(k * step) * 2; thin.push(flat[j], flat[j + 1]); }
      flat = thin;
    }
    return flat;
  }

  // Which drawings show at time t. Paused: the ones pinned to this frame (within half a frame).
  // Playing: each one from its frame for HOLD_S, fading over the last quarter second.
  function visibleAt(drawings, t, playing, fps, hold) {
    fps = fps > 0 ? fps : 30; hold = hold > 0 ? hold : HOLD_S;
    var tol = 0.5 / fps + 0.004, out = [];
    for (var i = 0; i < drawings.length; i++) {
      var d = drawings[i];
      if (!playing) { if (Math.abs(d.t - t) <= tol) out.push({ i: i, a: 1 }); continue; }
      var age = t - d.t;
      if (age >= -tol && age < hold) out.push({ i: i, a: age > hold - 0.25 ? clamp((hold - age) / 0.25, 0, 1) : 1 });
    }
    return out;
  }
  function frameIndex(t, fps) { return Math.floor(t * fps + 1e-4); }
  // One frame back (dir -1) or forward (+1): lands on the middle of that frame, inside the clip.
  function frameStep(t, dir, fps, duration) {
    fps = fps > 0 ? fps : 30;
    var maxIdx = duration > 0 ? Math.max(0, Math.ceil(duration * fps - 1e-4) - 1) : Infinity;
    var idx = clamp(frameIndex(t, fps) + (dir || 0), 0, maxIdx);
    return Math.round((idx + 0.5) / fps * 1e6) / 1e6;
  }
  // Frame duration samples (seconds) → the clip's frame rate, snapped to a camera rate when close.
  function estimateFps(deltas) {
    var d = (deltas || []).filter(function (x) { return x > 0.002 && x < 0.2; }).sort(function (a, b) { return a - b; });
    if (d.length < 3) return null;
    var med = d[Math.floor(d.length / 2)], f = 1 / med;
    var COMMON = [23.976, 24, 25, 29.97, 30, 48, 50, 59.94, 60, 90, 120, 240];
    var best = null;
    for (var i = 0; i < COMMON.length; i++) if (Math.abs(COMMON[i] - f) / COMMON[i] < 0.03 && (best == null || Math.abs(COMMON[i] - f) < Math.abs(best - f))) best = COMMON[i];
    return best != null ? best : Math.round(f);
  }

  // Bytes as Postgres stores the row: jsonb's text form puts a space after every , and : outside
  // strings. The server's check is octet_length(drawings::text) + octet_length(note) <= 8192.
  function utf8Len(s) {
    s = String(s || ''); var n = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charCodeAt(i);
      if (c < 0x80) n += 1; else if (c < 0x800) n += 2;
      else if (c >= 0xd800 && c <= 0xdbff) { n += 4; i++; } else n += 3;
    }
    return n;
  }
  function jsonbTextBytes(v) {
    var s = JSON.stringify(v === undefined ? null : v), n = utf8Len(s), inStr = false;
    for (var i = 0; i < s.length; i++) {
      var c = s[i];
      if (inStr) { if (c === '\\') i++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true; else if (c === ',' || c === ':') n++;
    }
    return n;
  }
  function docBytes(doc) { return jsonbTextBytes((doc && doc.drawings) || []) + utf8Len((doc && doc.note) || ''); }
  function fitsCap(doc) { return docBytes(doc) <= CAP_BYTES && ((doc && doc.drawings) || []).length <= MAX_DRAWINGS; }

  // Drawings come back from the server (written by the coach, read on the lifter's phone): keep
  // only well-formed ones, clamped to the frame.
  function sanitizeDrawing(d) {
    if (!d || typeof d !== 'object' || KINDS.indexOf(d.k) < 0 || !num(d.t) || d.t < 0 || d.t > 3600 || !Array.isArray(d.p)) return null;
    var n = d.p.length;
    if (d.k === 'angle' ? n !== 6 : d.k === 'free' ? (n < 4 || n > MAX_FREE_NUMS || n % 2) : n !== 4) return null;
    var p = [];
    for (var i = 0; i < n; i++) { if (!num(d.p[i])) return null; p.push(q3(clamp(d.p[i], 0, 1))); }
    return { k: d.k, t: q3(d.t), p: p };
  }
  function sanitizeDoc(raw) {
    raw = raw || {};
    var drawings = (Array.isArray(raw.drawings) ? raw.drawings : []).map(sanitizeDrawing).filter(Boolean).slice(0, MAX_DRAWINGS);
    var seen = {}, tags = (Array.isArray(raw.tags) ? raw.tags : []).filter(function (t) { if (TAG_IDS.indexOf(t) < 0 || seen[t]) return false; seen[t] = 1; return true; });
    var note = typeof raw.note === 'string' ? raw.note.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX) : '';
    var at = raw.alignT == null ? null : Number(raw.alignT);
    return { drawings: drawings, tags: tags, note: note, alignT: num(at) && at >= 0 && at <= 3600 ? q3(at) : null };
  }
  function docKey(doc) { var s = sanitizeDoc(doc); return JSON.stringify([s.drawings, s.tags, s.note, s.alignT]); }

  // Compare: clip B's time for clip A's time once both are aligned on their marks.
  function compareOffset(markA, markB) { return num(markA) && num(markB) ? q3(markB - markA) : 0; }
  // Where each clip starts so both reach their marks at the same moment, lead seconds before.
  function compareLeadIn(markA, markB, lead) {
    if (!num(markA) || !num(markB)) return { a: 0, b: 0 };
    var L = Math.min(lead == null ? 1.2 : lead, markA, markB);
    return { a: q3(markA - L), b: q3(markB - L) };
  }
  function pairTime(tA, offset, durB) { var t = tA + (offset || 0); return durB > 0 ? clamp(t, 0, durB) : Math.max(0, t); }
  // The clip to compare against: the same lifter and lift, recorded before this one, as near to
  // six weeks earlier as there is; else their newest other clip.
  function defaultCompareFor(fc, list) {
    if (!fc) return null;
    var others = (list || []).filter(function (x) { return x && x.id !== fc.id && x.athleteId === fc.athleteId; });
    if (!others.length) return null;
    var ts = function (x) { var v = Date.parse(x.createdAt || ''); return isNaN(v) ? 0 : v; };
    var mine = ts(fc), want = mine - 42 * 864e5;
    var same = others.filter(function (x) { return (x.lift || '') === (fc.lift || '') && ts(x) < mine; });
    if (same.length) return same.slice().sort(function (a, b) { return Math.abs(ts(a) - want) - Math.abs(ts(b) - want); })[0];
    return others.slice().sort(function (a, b) { return ts(b) - ts(a); })[0];
  }
  function urlNeedsRefresh(issuedAt, ttlS, now, marginS) {
    if (!num(issuedAt) || !num(ttlS)) return true;
    var m = marginS == null ? Math.min(90, ttlS / 4) : marginS;
    return now >= issuedAt + (ttlS - m) * 1000;
  }
  // The moments a replay rests on: drawing times, merged within half a frame, in order.
  function stopTimes(drawings, fps) {
    var tol = 0.5 / (fps > 0 ? fps : 30) + 0.004, ts = (drawings || []).map(function (d) { return d.t; }).sort(function (a, b) { return a - b; }), out = [];
    ts.forEach(function (t) { if (!out.length || t - out[out.length - 1] > tol) out.push(t); });
    return out;
  }
  function fmtClock(t) {
    t = Math.max(0, t || 0);
    var m = Math.floor(t / 60), s = t - m * 60;
    return m + ':' + (s < 10 ? '0' : '') + s.toFixed(2);
  }
  // Caption placement: on top when the drawings sit mostly in the lower half of the frame.
  function captionOnTop(drawings) {
    var sum = 0, n = 0;
    (drawings || []).forEach(function (d) { for (var i = 1; i < d.p.length; i += 2) { sum += d.p[i]; n++; } });
    return n > 0 && sum / n > 0.55;
  }
  function drawingLabel(d, w, h) {
    if (d.k === 'angle') { var a = angleDeg(d.p, w, h); return 'Angle' + (a == null ? '' : ' ' + Math.round(a) + '°'); }
    return KIND_LABEL[d.k] || 'Drawing';
  }

  var geo = {
    q3: q3, contentBox: contentBox, toNorm: toNorm, toPx: toPx, angleDeg: angleDeg, distToSeg: distToSeg,
    hitTest: hitTest, rdp: rdp, simplifyFree: simplifyFree, visibleAt: visibleAt, frameIndex: frameIndex,
    frameStep: frameStep, estimateFps: estimateFps, utf8Len: utf8Len, jsonbTextBytes: jsonbTextBytes,
    docBytes: docBytes, fitsCap: fitsCap, sanitizeDrawing: sanitizeDrawing, sanitizeDoc: sanitizeDoc, docKey: docKey,
    compareOffset: compareOffset, compareLeadIn: compareLeadIn, pairTime: pairTime, defaultCompareFor: defaultCompareFor,
    urlNeedsRefresh: urlNeedsRefresh, stopTimes: stopTimes, captionOnTop: captionOnTop, fmtClock: fmtClock, drawingLabel: drawingLabel,
    CAP_BYTES: CAP_BYTES, NOTE_MAX: NOTE_MAX, TAGS: TAGS, KINDS: KINDS
  };

  // ------------------------------------------------------------ demo (?demo=1: nothing leaves the page)
  var DEMO_AGO = function (days, h) { var d = new Date(Date.now() - days * 864e5); if (h != null) d.setHours(h, 10, 0, 0); return d.toISOString(); };
  var demoStore = {};
  function demoFormChecks() {
    return [
      { id: 'demo-fc-1', athleteId: 'demo-a1', coachId: 'demo-coach', storagePath: 'demo/squat-now.mp4', demoSrc: 'demo-media/squat-now.mp4',
        lift: 'squat', note: 'Top triple, last rep. Was that deep enough?', coachReply: null, coachReplyAt: null, createdAt: DEMO_AGO(0, 9) },
      { id: 'demo-fc-0', athleteId: 'demo-a1', coachId: 'demo-coach', storagePath: 'demo/squat-before.mp4', demoSrc: 'demo-media/squat-before.mp4',
        lift: 'squat', note: 'First heavy triple of the block', createdAt: DEMO_AGO(43, 18), coachReplyAt: DEMO_AGO(42, 8),
        coachReply: 'The bar drifts forward out of the hole and the hips lead. Brace before you unrack and push your back into the bar on the way up.' }
    ];
  }
  var DEMO_DOCS = {
    'demo-fc-0': { drawings: [
      { k: 'line', t: 2.85, p: [0.382, 0.26, 0.382, 0.64] },
      { k: 'arrow', t: 2.85, p: [0.382, 0.466, 0.425, 0.466] },
      { k: 'angle', t: 2.85, p: [0.578, 0.685, 0.321, 0.607, 0.558, 0.461] }
    ], tags: ['bar_path'], note: 'Bar drifts forward here', alignT: 2.25 },
    // the lifter's own demo (athlete.html?demo=1): the clip their coach marked up
    'demo-fc-ath': { drawings: [
      { k: 'line', t: 1.783, p: [0.25, 0.71, 0.74, 0.71] },
      { k: 'circle', t: 1.783, p: [0.386, 0.777, 0.426, 0.777] },
      { k: 'angle', t: 1.783, p: [0.386, 0.777, 0.652, 0.71, 0.477, 0.828] },
      { k: 'arrow', t: 2.35, p: [0.62, 0.36, 0.545, 0.43] }
    ], tags: ['depth'], note: 'Hip crease below the knee. That is depth.', alignT: 1.783 }
  };
  // Last week's depth check, reviewed (the lifter's thread this week asks for a new clip).
  function demoAthleteCheck() {
    return { id: 'demo-fc-ath', athleteId: 'demo-athlete', coachId: 'demo-coach', storagePath: 'demo/squat-now.mp4', demoSrc: 'demo-media/squat-now.mp4',
      lift: 'squat', note: 'Depth check on my top single. Felt high?', createdAt: DEMO_AGO(9, 18), coachReplyAt: DEMO_AGO(8, 8),
      coachReply: 'Depth was good: hips broke parallel. You\'re losing the upper back on the way up; cue chest tall and drive through mid-foot. Clean rep.' };
  }
  function isDemo(fc) { return !!(fc && fc.demoSrc) || !!root._demoMode; }

  // ------------------------------------------------------------ data
  // The demo clips play from an in-memory copy (a blob: URL), so stepping and seeking work on any
  // static server, range requests or not. Each "signature" is a new fragment on it, so the
  // refresh path runs exactly as it does against Supabase Storage.
  var demoSig = 0, demoBlobs = {};
  function demoBlobUrl(src) {
    if (!demoBlobs[src]) {
      demoBlobs[src] = fetch(src).then(function (r) { if (!r.ok) throw new Error(r.status); return r.blob(); })
        .then(function (bl) { return URL.createObjectURL(bl); }, function () { delete demoBlobs[src]; return src; });
    }
    return demoBlobs[src];
  }
  function signUrl(fc) {
    if (fc && fc.demoSrc) return demoBlobUrl(fc.demoSrc).then(function (u) { demoSig++; return { url: u + '#sig=' + demoSig, ttl: config.demoTtl }; });
    if (!root.DB || typeof root.DB.formCheckSignedUrl !== 'function') return Promise.resolve({ url: null, ttl: URL_TTL });
    return root.DB.formCheckSignedUrl(fc.storagePath, URL_TTL).then(function (u) { return { url: u, ttl: URL_TTL }; }, function () { return { url: null, ttl: URL_TTL }; });
  }
  function loadDoc(fc) {
    if (fc && (fc.demoSrc || root._demoMode)) return Promise.resolve(sanitizeDoc(demoStore[fc.id] || DEMO_DOCS[fc.id] || {}));
    if (!root.DB || typeof root.DB.getFormCheckAnnotations !== 'function') return Promise.resolve(sanitizeDoc({}));
    return root.DB.getFormCheckAnnotations(fc.id).then(function (r) { return sanitizeDoc((r && r.doc) || {}); }, function () { return sanitizeDoc({}); });
  }
  function currentUser() {
    try { if (typeof user !== 'undefined' && user) return user; } catch (e) {}
    return root._user || null;
  }
  function coachFormChecks() {
    try { if (typeof _coachFormChecks !== 'undefined' && Array.isArray(_coachFormChecks)) return _coachFormChecks; } catch (e) {}
    return [];
  }
  function athleteName(id) {
    try { var a = (root.Store && root.Store.get().athletes || []).find(function (x) { return x.id === id; }); if (a && a.name) return a.name; } catch (e) {}
    return 'Athlete';
  }
  var LIFT_LABEL = { squat: 'Squat', bench: 'Bench', deadlift: 'Deadlift', other: 'Other' };
  function liftLabel(l) { return LIFT_LABEL[l] || 'Form check'; }
  function shortDate(iso) {
    try { if (typeof fmtDateShort === 'function') return fmtDateShort(iso); } catch (e) {}
    var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  }
  function relAge(iso) {
    var days = Math.round((Date.now() - Date.parse(iso || '')) / 864e5);
    if (!isFinite(days)) return '';
    if (days <= 0) return 'Today'; if (days === 1) return 'Yesterday';
    if (days < 14) return days + ' days ago';
    return Math.round(days / 7) + ' weeks ago';
  }

  // ------------------------------------------------------------ DOM helpers
  function h(tag, attrs) {
    var e = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      var v = attrs[k];
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k === 'html') e.innerHTML = v;   // only ever our own static icon markup
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c == null || c === false) continue;
      e.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
    }
    return e;
  }
  function say(msg) { try { if (typeof toast === 'function') toast(msg); } catch (e) {} }
  function svg(paths) { return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths + '</svg>'; }
  var IC = {
    play: svg('<path d="M8 5.6v12.8a.6.6 0 0 0 .9.5l10.2-6.4a.6.6 0 0 0 0-1L8.9 5.1a.6.6 0 0 0-.9.5z" fill="currentColor" stroke="none"/>'),
    pause: svg('<rect x="6.5" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13.9" y="5" width="3.6" height="14" rx="1" fill="currentColor" stroke="none"/>'),
    back: svg('<path d="M16 6l-6 6 6 6"/><path d="M7.5 6v12"/>'),
    fwd: svg('<path d="M8 6l6 6-6 6"/><path d="M16.5 6v12"/>'),
    line: svg('<path d="M5.5 18.5l13-13"/><circle cx="5.5" cy="18.5" r="1.6" fill="currentColor"/><circle cx="18.5" cy="5.5" r="1.6" fill="currentColor"/>'),
    arrow: svg('<path d="M5 19L18.5 5.5"/><path d="M10 5.5h8.5V14"/>'),
    circle: svg('<circle cx="12" cy="12" r="7"/>'),
    angle: svg('<path d="M4.5 18.5h15"/><path d="M4.5 18.5L15 6"/><path d="M10.5 18.5a6 6 0 0 0-2.1-4.6"/>'),
    free: svg('<path d="M4 15.5c2.2-5 4.4-6.6 6.2-3.4s3.6 4.4 6.4-.6S19.5 8 20 8"/>'),
    undo: svg('<path d="M9 6.5L4.5 11 9 15.5"/><path d="M4.5 11H14a5 5 0 0 1 0 10h-2.5"/>'),
    trash: svg('<path d="M5 7h14"/><path d="M10 11v6M14 11v6"/><path d="M6.5 7l1 12a1.5 1.5 0 0 0 1.5 1.4h6a1.5 1.5 0 0 0 1.5-1.4l1-12"/><path d="M9.5 7V5.2c0-.6.4-1 1-1h3c.6 0 1 .4 1 1V7"/>'),
    compare: svg('<rect x="3.5" y="5" width="7" height="14" rx="1.6"/><rect x="13.5" y="5" width="7" height="14" rx="1.6"/>'),
    close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
    flag: svg('<path d="M6 21V4"/><path d="M6 4.5h10.5l-2.2 4 2.2 4H6"/>')
  };
  function iconBtn(icon, label, cls, onClick) {
    var b = h('button', { type: 'button', class: 'vr-ib' + (cls ? ' ' + cls : ''), 'aria-label': label, title: label, html: IC[icon] });
    if (onClick) b.addEventListener('click', onClick);
    return b;
  }
  function inkColor() {
    try { var c = getComputedStyle(document.body).getPropertyValue('--acc').trim(); if (c) return c; } catch (e) {}
    return '#ff3b4a';
  }
  function ensureCss() {
    if (!hasDom || document.getElementById('vrCss')) return;
    var l = document.createElement('link');
    l.id = 'vrCss'; l.rel = 'stylesheet'; l.href = 'video-review.css';
    (document.head || document.documentElement).appendChild(l);
  }
  function reducedMotion() { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

  // ------------------------------------------------------------ painting
  // Draws the visible drawings onto a canvas laid over the video. The ink is the screen's accent
  // with a dark halo under every stroke, so it reads on bright and dark footage alike.
  function paintDrawings(ctx, list, box, opts) {
    opts = opts || {};
    var ink = opts.ink || '#ff3b4a', lw = Math.max(2.5, Math.min(4, box.w / 160));
    list.forEach(function (it) {
      var d = it.d, P = pxPoints(d, box);
      ctx.save();
      ctx.globalAlpha = it.a == null ? 1 : it.a;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      var stroke = function (path, fill) {
        ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = lw + 3; path(); ctx.stroke();
        ctx.strokeStyle = ink; ctx.lineWidth = lw; path(); ctx.stroke();
        if (fill) { ctx.fillStyle = ink; fill(); }
      };
      if (d.k === 'line' || d.k === 'arrow') {
        stroke(function () { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); });
        if (d.k === 'arrow') {
          var ang = Math.atan2(P[1][1] - P[0][1], P[1][0] - P[0][0]), L = lw * 4.2;
          var head = function () {
            ctx.beginPath(); ctx.moveTo(P[1][0], P[1][1]);
            ctx.lineTo(P[1][0] - L * Math.cos(ang - 0.45), P[1][1] - L * Math.sin(ang - 0.45));
            ctx.lineTo(P[1][0] - L * Math.cos(ang + 0.45), P[1][1] - L * Math.sin(ang + 0.45)); ctx.closePath();
          };
          ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 3; head(); ctx.stroke();
          ctx.fillStyle = ink; head(); ctx.fill();
        }
      } else if (d.k === 'circle') {
        var r = Math.hypot(P[1][0] - P[0][0], P[1][1] - P[0][1]);
        stroke(function () { ctx.beginPath(); ctx.arc(P[0][0], P[0][1], r, 0, Math.PI * 2); });
      } else if (d.k === 'angle') {
        stroke(function () { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); if (P[2]) ctx.lineTo(P[2][0], P[2][1]); });
        if (P[2]) {
          var a0 = Math.atan2(P[0][1] - P[1][1], P[0][0] - P[1][0]), a1 = Math.atan2(P[2][1] - P[1][1], P[2][0] - P[1][0]);
          var diff = a1 - a0; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
          var rr = Math.max(14, Math.min(30, Math.min(Math.hypot(P[0][0] - P[1][0], P[0][1] - P[1][1]), Math.hypot(P[2][0] - P[1][0], P[2][1] - P[1][1])) * 0.4));
          ctx.globalAlpha *= 0.9;
          ctx.strokeStyle = ink; ctx.lineWidth = Math.max(1.5, lw - 1);
          ctx.beginPath(); ctx.arc(P[1][0], P[1][1], rr, a0, a0 + diff, diff < 0); ctx.stroke();
          var deg = angleDeg(d.p, opts.vw || box.w, opts.vh || box.h);
          if (deg != null) {
            var mid = a0 + diff / 2, lx = P[1][0] + Math.cos(mid) * (rr + 22), ly = P[1][1] + Math.sin(mid) * (rr + 22);
            var txt = Math.round(deg) + '°';
            ctx.font = '700 13px Archivo, system-ui, sans-serif';
            var tw = ctx.measureText(txt).width + 14;
            lx = clamp(lx, box.x + tw / 2 + 2, box.x + box.w - tw / 2 - 2); ly = clamp(ly, box.y + 13, box.y + box.h - 13);
            ctx.globalAlpha = it.a == null ? 1 : it.a;
            ctx.fillStyle = 'rgba(8,8,10,0.82)';
            roundRect(ctx, lx - tw / 2, ly - 12, tw, 24, 12); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(txt, lx, ly + 0.5);
          }
        }
      } else if (d.k === 'free') {
        stroke(function () {
          ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]);
          for (var j = 1; j < P.length - 1; j++) { var mx = (P[j][0] + P[j + 1][0]) / 2, my = (P[j][1] + P[j + 1][1]) / 2; ctx.quadraticCurveTo(P[j][0], P[j][1], mx, my); }
          var last = P[P.length - 1]; ctx.lineTo(last[0], last[1]);
        });
      }
      if (it.sel) {
        P.forEach(function (pt) {
          ctx.globalAlpha = 1; ctx.fillStyle = '#fff'; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.arc(pt[0], pt[1], 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        });
      }
      ctx.restore();
    });
  }
  function roundRect(ctx, x, y, w, hh, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + hh - r); ctx.arcTo(x + w, y + hh, x + w - r, y + hh, r); ctx.lineTo(x + r, y + hh);
    ctx.arcTo(x, y + hh, x, y + hh - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath();
  }

  // ------------------------------------------------------------ a player (one video + its ink layer)
  // Used by the review, each side of compare, and the lifter's replay. Owns the signed URL (and
  // swaps in a fresh one when it's about to run out or the clip errors mid-review), the frame
  // clock (requestVideoFrameCallback where the browser has it, else rAF), and the ink canvas.
  function Player(fc, opts) {
    var self = this;
    opts = opts || {};
    this.fc = fc; this.doc = opts.doc || sanitizeDoc({}); this.opts = opts;
    this.fps = 30; this.fpsKnown = false; this._deltas = []; this._lastMT = null; this._lastPF = null;
    this.sel = -1; this.draft = null; this.alive = true; this.url = null; this.issuedAt = 0; this.ttl = URL_TTL; this._retries = 0;
    this.el = h('div', { class: 'vr-stage' + (opts.cls ? ' ' + opts.cls : '') });
    this.video = h('video', { class: 'vr-video', playsinline: true, 'webkit-playsinline': true, preload: 'auto', muted: opts.muted ? true : null });
    if (opts.muted) this.video.muted = true;
    this.canvas = h('canvas', { class: 'vr-ink', 'aria-hidden': 'true' });
    this.caption = h('div', { class: 'vr-caption', 'aria-live': 'polite' });
    this.status = h('div', { class: 'vr-status' }, 'Loading clip…');
    this.el.appendChild(this.video); this.el.appendChild(this.canvas); this.el.appendChild(this.caption); this.el.appendChild(this.status);
    this.ctx = this.canvas.getContext('2d');
    var v = this.video;
    v.addEventListener('loadedmetadata', function () {
      // sound but no picture: the browser can't decode the video track (HEVC in Chrome on Windows)
      if (!v.videoWidth && !v.videoHeight && !self._metaOk) { self._unsupported(); return; }
      self._metaOk = true; self.status.classList.remove('is-format');
      self.status.hidden = true; self.status.textContent = ''; self.paint(); if (self.onMeta) self.onMeta();
    });
    // the last place the clip really was (a failed load resets currentTime to 0)
    var keep = function () { if (v.readyState >= 1 && !self._refreshing) self._lastT = v.currentTime; };
    v.addEventListener('seeked', function () { keep(); self.paint(); if (self.onTime) self.onTime(); });
    v.addEventListener('timeupdate', function () { keep(); if (v.paused && self.onTime) self.onTime(); });
    v.addEventListener('pause', keep);
    v.addEventListener('play', function () { self._loop(); if (self.onState) self.onState(); });
    v.addEventListener('pause', function () { self.paint(); if (self.onState) self.onState(); if (self.onTime) self.onTime(); });
    v.addEventListener('ended', function () { if (self.onState) self.onState(); });
    v.addEventListener('error', function () { self._onError(); });
    if (root.ResizeObserver) { this._ro = new ResizeObserver(function () { self.paint(); }); this._ro.observe(this.el); }
    this._timer = setInterval(function () { self.ensureFresh(); }, 20000);
  }
  Player.prototype.load = function () {
    var self = this;
    return signUrl(this.fc).then(function (r) {
      if (!self.alive) return;
      if (!r.url) { self._fail(); return; }
      self.url = r.url; self.ttl = r.ttl || URL_TTL; self.issuedAt = Date.now();
      self.video.src = r.url;
    });
  };
  Player.prototype._fail = function () {
    var self = this;
    this.status.hidden = false; this.status.textContent = '';
    this.status.appendChild(h('span', { text: 'Couldn’t load the clip.' }));
    this.status.appendChild(h('button', { type: 'button', class: 'vr-retry', onclick: function () { self.status.textContent = 'Loading clip…'; self._retries = 0; self.refresh(); } }, 'Try again'));
  };
  // The browser can't decode this clip (an iPhone HEVC .mov sent from the website, opened in
  // Chrome on Windows or Firefox). A fresh link can't fix that, so say why and what to do.
  Player.prototype._unsupported = function () {
    var who = this.opts.who;
    this.status.hidden = false; this.status.textContent = '';
    this.status.classList.add('is-format');
    this.status.appendChild(h('span', { text: 'This clip’s format doesn’t play in this browser. ' +
      (who ? 'Ask ' + who + ' to send it from the POWALIFTA app, or open it in Safari.'
           : 'Send it again from the POWALIFTA app, or open it in Safari.') }));
  };
  // A fresh signed URL, keeping the place, the speed and whether it was playing.
  Player.prototype.refresh = function () {
    var self = this, v = this.video, t = (v.readyState >= 1 ? v.currentTime : this._lastT) || 0, wasPlaying = !v.paused && !v.ended, rate = v.playbackRate || 1;
    this._refreshing = true;
    return signUrl(this.fc).then(function (r) {
      if (!self.alive) return;
      self._refreshing = false;
      if (!r.url) { self._fail(); return; }
      self.url = r.url; self.ttl = r.ttl || URL_TTL; self.issuedAt = Date.now();
      var restore = function () {
        v.removeEventListener('loadedmetadata', restore);
        try { v.currentTime = Math.min(t, (v.duration || t) - 0.001); } catch (e) {}
        v.playbackRate = rate;
        if (wasPlaying) { var p = v.play(); if (p && p.catch) p.catch(function () {}); }
      };
      v.addEventListener('loadedmetadata', restore);
      v.src = r.url;
      if (self.onRefresh) self.onRefresh();
    });
  };
  Player.prototype.ensureFresh = function () {
    if (!this.alive || !this.url || this._refreshing) return;
    if (urlNeedsRefresh(this.issuedAt, this.ttl, Date.now())) this.refresh();
  };
  Player.prototype._onError = function () {
    if (!this.alive || !this.url) return;
    var err = this.video.error;
    // MEDIA_ERR_SRC_NOT_SUPPORTED before this clip ever showed a picture, on a link signed moments
    // ago, is the format, not an expired link (an old link gets one fresh try first, since Chrome
    // reports a refused request the same way). Once the clip has played, it's always the link.
    if (err && err.code === 4 && !this._metaOk) {
      if (Date.now() - this.issuedAt < 60000 || this._fmtTried) { this._unsupported(); return; }
      this._fmtTried = true; this.refresh(); return;
    }
    // An expired signed URL fails the next range request: sign again (twice at most in a row).
    if (this._retries < 2) { this._retries++; this.refresh(); var self = this; setTimeout(function () { self._retries = 0; }, 15000); }
    else this._fail();
  };
  Player.prototype.t = function () { return this.video.currentTime || 0; };
  Player.prototype.duration = function () { var d = this.video.duration; return isFinite(d) && d > 0 ? d : 0; };
  Player.prototype.playing = function () { return !this.video.paused && !this.video.ended; };
  Player.prototype.play = function () {
    this.ensureFresh();
    if (this.video.ended || (this.duration() && this.t() >= this.duration() - 0.02)) this.video.currentTime = 0;
    var p = this.video.play(); if (p && p.catch) p.catch(function () {});
  };
  Player.prototype.pause = function () { this.video.pause(); };
  Player.prototype.seek = function (t) {
    var d = this.duration();
    this.video.currentTime = d ? clamp(t, 0, Math.max(0, d - 0.001)) : Math.max(0, t);
    this.paint();
  };
  Player.prototype.step = function (dir) { this.pause(); this.seek(frameStep(this.t(), dir, this.fps, this.duration())); };
  Player.prototype.box = function () {
    var r = this.el.getBoundingClientRect();
    return contentBox(r.width, r.height, this.video.videoWidth, this.video.videoHeight);
  };
  Player.prototype._loop = function () {
    var self = this, v = this.video;
    if (this._looping) return;
    this._looping = true;
    var tick = function (now, meta) {
      if (!self.alive) { self._looping = false; return; }
      if (meta && meta.presentedFrames != null) {
        if (self._lastMT != null && meta.presentedFrames > self._lastPF) {
          var dt = (meta.mediaTime - self._lastMT) / (meta.presentedFrames - self._lastPF);
          if (dt > 0) { self._deltas.push(dt); if (self._deltas.length > 40) self._deltas.shift(); }
          var f = estimateFps(self._deltas);
          if (f && self._deltas.length >= 8) { self.fps = f; self.fpsKnown = true; }
        }
        self._lastMT = meta.mediaTime; self._lastPF = meta.presentedFrames;
      }
      self.paint();
      if (self.onFrame) self.onFrame();
      if (self.onTime) self.onTime();
      if (v.paused || v.ended) { self._looping = false; self._lastMT = null; return; }
      if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(function (n) { tick(n, null); });
    };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback(tick); else requestAnimationFrame(function (n) { tick(n, null); });
  };
  Player.prototype.visible = function () {
    var list = visibleAt(this.doc.drawings, this.t(), this.playing(), this.fps, HOLD_S);
    var self = this;
    return list.map(function (x) { return { d: self.doc.drawings[x.i], a: x.a, i: x.i, sel: x.i === self.sel }; });
  };
  Player.prototype.paint = function () {
    if (!this.alive) return;
    var r = this.el.getBoundingClientRect(), dpr = Math.min(3, root.devicePixelRatio || 1);
    var W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
    var ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, r.width, r.height);
    var box = contentBox(r.width, r.height, this.video.videoWidth, this.video.videoHeight);
    if (!(box.w > 0)) return;
    var vis = this.visible(), list = vis.slice();
    if (this.draft && this.draft.p.length >= 4) list.push({ d: this.draft, a: 0.9 });
    paintDrawings(ctx, list, box, { ink: this.ink || (this.ink = inkColor()), vw: this.video.videoWidth || box.w, vh: this.video.videoHeight || box.h });
    // the caption shows while drawings are up
    var cap = this.doc.note && vis.length ? this.doc.note : '';
    if (this.caption.textContent !== cap) this.caption.textContent = cap;
    this.caption.classList.toggle('is-on', !!cap);
    if (cap) {
      // the caption sits on the side of the picture the drawings aren't on (depth marks are low, bar path high)
      var top = captionOnTop(vis.map(function (x) { return x.d; }));
      this.caption.style.left = box.x + box.w / 2 + 'px';
      this.caption.style.top = top ? (box.y + 12) + 'px' : 'auto';
      this.caption.style.bottom = top ? 'auto' : (r.height - (box.y + box.h) + 12) + 'px';
      this.caption.style.maxWidth = Math.max(120, box.w - 24) + 'px';
    }
  };
  Player.prototype.destroy = function () {
    this.alive = false;
    clearInterval(this._timer);
    if (this._ro) this._ro.disconnect();
    try { this.video.pause(); this.video.removeAttribute('src'); this.video.load(); } catch (e) {}
  };

  // A timeline: a range input plus a tick for every drawn moment (tap one to go there) and the
  // align flag in compare.
  function Timeline(player, opts) {
    opts = opts || {};
    var wrap = h('div', { class: 'vr-tl' });
    var range = h('input', { type: 'range', class: 'vr-range', min: '0', max: '1000', step: '1', value: '0', 'aria-label': 'Position in the clip' });
    var ticks = h('div', { class: 'vr-ticks' });
    wrap.appendChild(ticks); wrap.appendChild(range);
    var scrubbing = false;
    range.addEventListener('input', function () {
      scrubbing = true;
      if (player.playing()) player.pause();
      var d = player.duration(); if (d) { player.seek(Number(range.value) / 1000 * d); if (opts.onScrub) opts.onScrub(); }
    });
    range.addEventListener('change', function () { scrubbing = false; });
    function sync() {
      var d = player.duration();
      if (!scrubbing && d) range.value = String(Math.round(player.t() / d * 1000));
      wrap.style.setProperty('--vr-pos', (d ? player.t() / d * 100 : 0) + '%');
    }
    function marks() {
      ticks.textContent = '';
      var d = player.duration(); if (!d) return;
      stopTimes(player.doc.drawings, player.fps).forEach(function (t) {
        var b = h('button', { type: 'button', class: 'vr-tick', style: 'left:' + (t / d * 100) + '%', 'aria-label': 'Drawing at ' + fmtClock(t), title: fmtClock(t) });
        b.addEventListener('click', function () { player.pause(); player.seek(t); if (opts.onScrub) opts.onScrub(); });
        ticks.appendChild(b);
      });
      if (opts.flag && num(opts.flag())) {
        var f = opts.flag();
        ticks.appendChild(h('span', { class: 'vr-flag', style: 'left:' + (f / d * 100) + '%', title: 'Aligned at ' + fmtClock(f), html: IC.flag }));
      }
    }
    return { el: wrap, sync: sync, marks: marks };
  }

  // ------------------------------------------------------------ the coach's review
  var S = null;   // the open review session (one at a time)

  function openVideoReview(formCheckId, opts) {
    if (!hasDom) return false;
    opts = opts || {};
    var list = opts.formChecks || coachFormChecks();
    var fc = list.find(function (x) { return x && x.id === formCheckId; });
    if (!fc) return false;
    if (S) closeReview(true);
    ensureCss();
    var name = opts.athleteName || athleteName(fc.athleteId), first = String(name).split(' ')[0];
    S = { fc: fc, list: list, opts: opts, name: name, first: first, tool: null, undo: [], player: null, compare: null, saved: null, busy: false, lastFocus: document.activeElement };

    var veil = h('div', { class: 'vr', tabindex: '-1', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Review ' + first + '’s ' + liftLabel(fc.lift).toLowerCase() });
    S.veil = veil;
    // header: close · who and what · Compare · Send
    var head = h('div', { class: 'vr-head' });
    var closeB = iconBtn('close', 'Close', 'vr-close', function () { closeReview(); });
    var titles = h('div', { class: 'vr-titles' },
      h('div', { class: 'vr-title' }, name + ' · ' + liftLabel(fc.lift)),
      h('div', { class: 'vr-sub' }, shortDate(fc.createdAt) + (fc.coachReply ? ' · Replied' : ' · Waiting on you')));
    S.cmpBtn = h('button', { type: 'button', class: 'vr-btn vr-cmp-btn', 'aria-pressed': 'false', title: 'Compare two clips (C)', html: IC.compare + '<span>Compare</span>' });
    S.cmpBtn.addEventListener('click', function () { toggleCompare(); });
    S.sendBtn = h('button', { type: 'button', class: 'btn btn-primary vr-send', title: 'Send (⌘↩)' }, 'Send');
    S.sendBtn.addEventListener('click', send);
    head.appendChild(closeB); head.appendChild(titles); head.appendChild(S.cmpBtn); head.appendChild(S.sendBtn);
    veil.appendChild(head);

    var body = h('div', { class: 'vr-body' });
    var main = h('div', { class: 'vr-main' });
    var side = h('div', { class: 'vr-side' });
    body.appendChild(main); body.appendChild(side);
    veil.appendChild(body);
    S.main = main; S.side = side;

    document.documentElement.classList.add('vr-open');
    document.body.appendChild(veil);
    if (!reducedMotion()) veil.classList.add('is-entering');
    requestAnimationFrame(function () { requestAnimationFrame(function () { veil.classList.remove('is-entering'); }); });
    veil.focus({ preventScroll: true });
    window.addEventListener('keydown', onKey, true);
    veil.addEventListener('keydown', veilKeyStop);
    document.addEventListener('focusin', onFocusIn, true);

    loadDoc(fc).then(function (doc) {
      if (!S || S.fc !== fc) return;
      S.doc = doc; S.saved = docKey(doc);
      buildSingle();
      buildSide();
      var other = defaultCompareFor(fc, list);
      S.cmpBtn.disabled = !other;
      if (!other) S.cmpBtn.title = 'Compare needs an earlier clip from ' + first;
    });
    return true;
  }

  // the single-clip stage: player, transport, timeline, tools
  function buildSingle() {
    var main = S.main; main.textContent = '';
    var p = new Player(S.fc, { doc: S.doc, who: S.first });
    S.player = p;
    var stageWrap = h('div', { class: 'vr-stage-wrap' });
    stageWrap.appendChild(p.el);
    main.appendChild(stageWrap);
    wireDrawing(p);

    var tl = Timeline(p, { onScrub: function () { p.sel = -1; refreshTools(); } });
    S.tl = tl;
    var transport = buildTransport([p], tl);
    main.appendChild(transport.el);
    main.appendChild(tl.el);
    main.appendChild(buildTools(p));
    p.onMeta = function () { tl.marks(); tl.sync(); transport.sync(); };
    p.onTime = function () { tl.sync(); transport.sync(); };
    p.onState = function () { transport.sync(); };
    p.load();
  }

  // play / step / time / speed, for one player or a locked pair
  function buildTransport(players, tl, extra) {
    var a = players[0];
    var row = h('div', { class: 'vr-transport' });
    var playB = h('button', { type: 'button', class: 'vr-play', 'aria-label': 'Play', title: 'Play (Space)', html: IC.play });
    playB.addEventListener('click', function () { togglePlay(); });
    var backB = iconBtn('back', 'Back one frame', 'vr-step', function () { stepAll(-1); });
    var fwdB = iconBtn('fwd', 'Forward one frame', 'vr-step', function () { stepAll(1); });
    backB.title = 'Back one frame (,)'; fwdB.title = 'Forward one frame (.)';
    var time = h('div', { class: 'vr-time' }, h('b', { class: 'vr-clock' }, '0:00.00'), h('span', { class: 'vr-frame' }, ''));
    var speed = h('div', { class: 'vr-speed', role: 'radiogroup', 'aria-label': 'Playback speed' });
    RATES.forEach(function (r) {
      var b = h('button', { type: 'button', role: 'radio', 'data-r': String(r), 'aria-checked': r === 1 ? 'true' : 'false', class: r === 1 ? 'on' : '' }, (r === 0.25 ? '¼' : r === 0.5 ? '½' : '1') + '×');
      b.addEventListener('click', function () { setRate(r); });
      speed.appendChild(b);
    });
    row.appendChild(playB); row.appendChild(backB); row.appendChild(fwdB); row.appendChild(time);
    if (extra) row.appendChild(extra);
    row.appendChild(speed);
    function sync() {
      var playing = players.some(function (p) { return p.playing(); });
      playB.innerHTML = playing ? IC.pause : IC.play;
      playB.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      time.firstChild.textContent = fmtClock(a.t());
      time.lastChild.textContent = (a.fpsKnown ? 'Frame ' : '≈ frame ') + (frameIndex(a.t(), a.fps) + 1);
      var rate = a.video.playbackRate || 1;
      speed.querySelectorAll('button').forEach(function (b) { var on = Number(b.dataset.r) === rate; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    }
    S.transport = { sync: sync };
    return { el: row, sync: sync };
  }

  function buildTools(p) {
    var row = h('div', { class: 'vr-tools' });
    var group = h('div', { class: 'vr-toolset', role: 'toolbar', 'aria-label': 'Drawing tools' });
    S.toolBtns = {};
    KINDS.forEach(function (k, i) {
      var b = h('button', { type: 'button', class: 'vr-tool', 'aria-pressed': 'false', 'aria-label': KIND_LABEL[k], title: KIND_LABEL[k] + ' (' + (i + 1) + ')', html: IC[k] });
      b.addEventListener('click', function () { setTool(S.tool === k ? null : k); });
      S.toolBtns[k] = b; group.appendChild(b);
    });
    row.appendChild(group);
    S.undoBtn = iconBtn('undo', 'Undo (⌘Z)', 'vr-undo', function () { undo(); });
    S.delBtn = iconBtn('trash', 'Delete drawing', 'vr-del', function () { deleteSelected(); });
    S.hint = h('div', { class: 'vr-hint' });
    row.appendChild(S.hint);
    row.appendChild(S.delBtn); row.appendChild(S.undoBtn);
    refreshTools();
    return row;
  }
  function refreshTools() {
    if (!S || !S.toolBtns) return;
    Object.keys(S.toolBtns).forEach(function (k) { var on = S.tool === k; S.toolBtns[k].classList.toggle('on', on); S.toolBtns[k].setAttribute('aria-pressed', on ? 'true' : 'false'); });
    var p = S.player;
    if (S.undoBtn) S.undoBtn.disabled = !S.undo.length;
    if (S.delBtn) S.delBtn.hidden = !(p && p.sel >= 0);
    if (p) p.canvas.classList.toggle('is-drawing', !!S.tool);
    if (S.hint) {
      var txt = '';
      if (p && p.draft && p.draft.k === 'angle' && p.draft._stage === 2) txt = 'Now the second leg';
      else if (S.tool === 'angle') txt = 'Drag along one leg to the joint';
      else if (S.tool) txt = 'Draws on this frame';
      S.hint.textContent = txt;
    }
  }
  function setTool(k) {
    if (!S) return;
    S.tool = k;
    if (S.player) { S.player.draft = null; S.player.sel = -1; S.player.paint(); }
    refreshTools();
  }
  function setRate(r) {
    if (!S) return;
    allPlayers().forEach(function (p) { p.video.playbackRate = r; });
    if (S.transport) S.transport.sync();
  }
  function allPlayers() { return S ? (S.compare ? [S.compare.a, S.compare.b] : (S.player ? [S.player] : [])) : []; }
  function togglePlay() {
    if (!S) return;
    if (S.compare) { if (S.compare.a.playing() || S.compare.b.playing()) pauseCompare(); else playCompare(); return; }
    var p = S.player; if (!p) return;
    if (p.playing()) p.pause(); else { p.sel = -1; p.draft = null; p.play(); }
    refreshTools();
  }
  function stepAll(dir) {
    if (!S) return;
    if (S.compare) { stepCompare(dir); return; }
    var p = S.player; if (!p) return;
    p.draft = null; p.sel = -1; p.step(dir); refreshTools();
  }

  // pointer drawing on the ink canvas
  function wireDrawing(p) {
    var c = p.canvas, down = null;
    var local = function (e) { var r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    c.addEventListener('pointerdown', function (e) {
      if (!S || S.compare || e.button > 0) return;
      var pt = local(e), box = p.box();
      if (!S.tool) {
        // No tool: tap a drawing to select it, tap the picture to play or pause.
        var vis = p.visible().map(function (x) { return x.i; });
        var hit = hitTest(p.doc.drawings, pt[0], pt[1], box, e.pointerType === 'touch' ? 16 : 9, vis);
        down = { mode: 'tap', x: pt[0], y: pt[1], hit: hit };
        return;
      }
      e.preventDefault();
      if (p.playing()) p.pause();
      try { c.setPointerCapture(e.pointerId); } catch (er) {}
      var n = toNorm(pt[0], pt[1], box), t = q3(p.t());
      if (p.draft && p.draft.k === 'angle' && p.draft._stage === 2) {
        p.draft.p[4] = n[0]; p.draft.p[5] = n[1]; down = { mode: 'angle2' };
      } else if (S.tool === 'free') {
        p.draft = { k: 'free', t: t, p: [n[0], n[1], n[0], n[1]], _px: [pt] }; down = { mode: 'free' };
      } else {
        p.draft = { k: S.tool, t: t, p: [n[0], n[1], n[0], n[1]], _stage: 1 }; down = { mode: 'drag', x: pt[0], y: pt[1] };
      }
      p.sel = -1; p.paint(); refreshTools();
    });
    c.addEventListener('pointermove', function (e) {
      if (!S || S.compare) return;
      var pt = local(e), box = p.box(), n = toNorm(pt[0], pt[1], box), d = p.draft;
      if (d && d.k === 'angle' && d._stage === 2 && (!down || down.mode === 'angle2')) {
        // the second leg follows the pointer (hover on a laptop, the finger on a phone)
        d.p[4] = n[0]; d.p[5] = n[1]; p.paint(); return;
      }
      if (!down || !d) return;
      if (down.mode === 'free') {
        var last = d._px[d._px.length - 1];
        if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) >= 2) { d._px.push(pt); d.p = simplifyFree(d._px, box, 0.75); if (d.p.length < 4) d.p = d.p.concat(d.p); }
      } else if (down.mode === 'drag') { d.p[2] = n[0]; d.p[3] = n[1]; }
      p.paint();
    });
    var finish = function (e) {
      if (!S || !down) return;
      var mode = down.mode, pt = local(e), box = p.box(), d = p.draft;
      var tapped = down; down = null;
      if (mode === 'tap') {
        if (Math.hypot(pt[0] - tapped.x, pt[1] - tapped.y) > 8) return;
        if (tapped.hit >= 0) { p.sel = tapped.hit; p.paint(); }
        else if (p.sel >= 0) { p.sel = -1; p.paint(); }
        else togglePlay();
        refreshTools();
        return;
      }
      if (!d) return;
      var lenPx = function (i) { var a = toPx(d.p[i], d.p[i + 1], box), b = toPx(d.p[i + 2], d.p[i + 3], box); return Math.hypot(a[0] - b[0], a[1] - b[1]); };
      if (mode === 'free') {
        var flat = simplifyFree(d._px, box, 1.5);
        p.draft = null;
        var total = 0; for (var i = 1; i < d._px.length; i++) total += Math.hypot(d._px[i][0] - d._px[i - 1][0], d._px[i][1] - d._px[i - 1][1]);
        if (flat.length >= 4 && total >= 8) commit({ k: 'free', t: d.t, p: flat });
      } else if (mode === 'drag') {
        if (lenPx(0) < 8) { p.draft = null; }
        else if (d.k === 'angle') { d._stage = 2; d.p = [d.p[0], d.p[1], d.p[2], d.p[3], d.p[2], d.p[3]]; }
        else { p.draft = null; commit({ k: d.k, t: d.t, p: d.p.slice(0, 4) }); }
      } else if (mode === 'angle2') {
        var n = toNorm(pt[0], pt[1], box); d.p[4] = n[0]; d.p[5] = n[1];
        if (lenPx(2) >= 8) { p.draft = null; commit({ k: 'angle', t: d.t, p: d.p.slice(0, 6) }); }
      }
      p.paint(); refreshTools();
    };
    c.addEventListener('pointerup', finish);
    c.addEventListener('pointercancel', function () { down = null; if (p.draft && p.draft._stage !== 2) p.draft = null; p.paint(); });
  }
  function commit(d) {
    var p = S.player, clean = sanitizeDrawing(d);
    if (!clean) return;
    var next = { drawings: p.doc.drawings.concat([clean]), note: p.doc.note };
    if (!fitsCap(next)) { say('That’s the most one review can hold. Delete a freehand stroke or two first'); return; }
    p.doc.drawings.push(clean);
    S.undo.push({ type: 'add', d: clean });
    afterEdit();
  }
  function deleteSelected() {
    var p = S && S.player; if (!p || p.sel < 0) return;
    var d = p.doc.drawings.splice(p.sel, 1)[0];
    S.undo.push({ type: 'del', d: d, i: p.sel });
    p.sel = -1; afterEdit();
  }
  function deleteAt(i) {
    var p = S && S.player; if (!p) return;
    var d = p.doc.drawings.splice(i, 1)[0];
    if (!d) return;
    S.undo.push({ type: 'del', d: d, i: i });
    p.sel = -1; afterEdit();
  }
  function undo() {
    var p = S && S.player; if (!p) return;
    if (p.draft) { p.draft = null; p.paint(); refreshTools(); return; }
    var u = S.undo.pop(); if (!u) return;
    if (u.type === 'add') { var i = p.doc.drawings.lastIndexOf(u.d); if (i >= 0) p.doc.drawings.splice(i, 1); }
    else if (u.type === 'del') p.doc.drawings.splice(Math.min(u.i, p.doc.drawings.length), 0, u.d);
    p.sel = -1;
    if (num(u.t)) p.seek(u.t); else if (u.d) p.seek(u.d.t);
    afterEdit();
  }
  function afterEdit() {
    var p = S.player;
    p.paint(); if (S.tl) S.tl.marks();
    refreshTools(); paintDrawingList(); paintBudget();
  }

  // the side panel: the lifter's ask, judging tags, drawings, caption, reply
  function buildSide() {
    var side = S.side, fc = S.fc, doc = S.doc;
    side.textContent = '';
    if (fc.note) side.appendChild(h('div', { class: 'vr-ask' }, h('div', { class: 'vr-ask-who' }, S.first + ' asked'), h('p', { class: 'vr-ask-q' }, fc.note)));

    var tagsSec = h('div', { class: 'vr-sec' }, h('div', { class: 'vr-sec-h' }, 'Judging'));
    var chips = h('div', { class: 'vr-tags' });
    TAGS.forEach(function (t) {
      var on = doc.tags.indexOf(t.id) >= 0;
      var b = h('button', { type: 'button', class: 'vr-tag' + (on ? ' on' : ''), 'aria-pressed': on ? 'true' : 'false' }, t.label);
      b.addEventListener('click', function () {
        var i = doc.tags.indexOf(t.id);
        if (i >= 0) doc.tags.splice(i, 1); else doc.tags.push(t.id);
        var now = i < 0; b.classList.toggle('on', now); b.setAttribute('aria-pressed', now ? 'true' : 'false');
      });
      chips.appendChild(b);
    });
    tagsSec.appendChild(chips);
    side.appendChild(tagsSec);

    var drawSec = h('div', { class: 'vr-sec vr-draw-sec' }, h('div', { class: 'vr-sec-h' }, 'Drawings', h('span', { class: 'vr-budget' })));
    S.drawList = h('div', { class: 'vr-dlist' });
    drawSec.appendChild(S.drawList);
    var cap = h('input', { type: 'text', class: 'vr-input', maxlength: String(NOTE_MAX), placeholder: 'Caption on the video, e.g. “Knees out here”', 'aria-label': 'Caption shown with the drawings' });
    cap.value = doc.note || '';
    cap.addEventListener('input', function () { doc.note = cap.value.slice(0, NOTE_MAX); if (S.player) S.player.paint(); paintBudget(); });
    drawSec.appendChild(cap);
    side.appendChild(drawSec);
    S.cmpSec = h('div', { class: 'vr-sec vr-cmp-sec', hidden: true });
    side.appendChild(S.cmpSec);

    var replySec = h('div', { class: 'vr-sec' }, h('label', { class: 'vr-sec-h', for: 'vrReply' }, 'Reply'));
    S.reply = h('textarea', { id: 'vrReply', class: 'vr-input vr-reply', rows: '4', maxlength: '1000', placeholder: 'What should ' + S.first + ' do next set?' });
    S.reply.value = fc.coachReply || '';
    replySec.appendChild(S.reply);
    side.appendChild(replySec);
    paintDrawingList(); paintBudget();
  }
  function paintDrawingList() {
    if (!S || !S.drawList) return;
    var p = S.player, host = S.drawList; host.textContent = '';
    var ds = p ? p.doc.drawings : S.doc.drawings;
    if (!ds.length) {
      var empty = h('p', { class: 'vr-empty' }, 'Pause on the frame that matters and draw on it.');
      if (document.documentElement.classList.contains('desk')) empty.appendChild(h('span', { class: 'vr-keys' }, h('kbd', null, '1'), '–', h('kbd', null, '5'), ' tools  ', h('kbd', null, ','), ' ', h('kbd', null, '.'), ' frame  ', h('kbd', null, 'C'), ' compare'));
      host.appendChild(empty);
      return;
    }
    var vw = p && p.video.videoWidth, vh = p && p.video.videoHeight;
    ds.map(function (d, i) { return { d: d, i: i }; }).sort(function (a, b) { return a.d.t - b.d.t; }).forEach(function (x) {
      var row = h('div', { class: 'vr-drow' });
      var go = h('button', { type: 'button', class: 'vr-drow-go' }, h('span', { class: 'vr-drow-ic', html: IC[x.d.k] }), h('span', { class: 'vr-drow-t' }, drawingLabel(x.d, vw, vh)), h('span', { class: 'vr-drow-at' }, fmtClock(x.d.t)));
      go.addEventListener('click', function () { if (!p) return; p.pause(); p.seek(x.d.t); p.sel = x.i; p.paint(); refreshTools(); });
      var del = h('button', { type: 'button', class: 'vr-drow-x', 'aria-label': 'Delete ' + drawingLabel(x.d, vw, vh).toLowerCase() + ' at ' + fmtClock(x.d.t), html: IC.close });
      del.addEventListener('click', function () { deleteAt(x.i); });
      row.appendChild(go); row.appendChild(del);
      host.appendChild(row);
    });
  }
  function paintBudget() {
    if (!S || !S.side) return;
    var b = S.side.querySelector('.vr-budget'); if (!b) return;
    var used = docBytes(S.player ? S.player.doc : S.doc);
    b.textContent = used > CAP_BYTES * 0.5 ? (used / 1024).toFixed(1) + ' of 8 KB' : '';
    b.classList.toggle('is-full', used > CAP_BYTES * 0.9);
  }

  // ------------------------------------------------------------ compare
  function toggleCompare() {
    if (!S) return;
    if (S.compare) { closeCompare(); return; }
    var other = defaultCompareFor(S.fc, S.list);
    if (!other) { say('Compare needs an earlier clip from ' + S.first); return; }
    openCompare(other);
  }
  function compareChoices() {
    return S.list.filter(function (x) { return x.id !== S.fc.id && x.athleteId === S.fc.athleteId; })
      .sort(function (a, b) { return Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0); });
  }
  function openCompare(other) {
    var keepT = S.player ? S.player.t() : 0;
    if (S.player) { S.doc = S.player.doc; S.player.destroy(); S.player = null; }
    S.tool = null;
    S.veil.classList.add('is-compare');
    S.cmpBtn.setAttribute('aria-pressed', 'true'); S.cmpBtn.classList.add('on');
    loadDoc(other).then(function (otherDoc) {
      if (!S) return;
      var main = S.main; main.textContent = '';
      var grid = h('div', { class: 'vr-cmp' });
      var a = new Player(S.fc, { doc: S.doc, cls: 'is-cmp', who: S.first }), b = new Player(other, { doc: otherDoc, cls: 'is-cmp', muted: true, who: S.first });
      var C = S.compare = { a: a, b: b, other: other, otherDoc: otherDoc, savedB: docKey(otherDoc), offset: 0 };
      var col = function (pl, fcX, isA) {
        var c = h('div', { class: 'vr-cmp-col' });
        var head = h('div', { class: 'vr-cmp-head' });
        if (isA) head.appendChild(h('span', { class: 'vr-cmp-name' }, 'This clip', h('span', { class: 'vr-cmp-date' }, shortDate(fcX.createdAt))));
        else {
          var sel = h('select', { class: 'vr-cmp-pick', 'aria-label': 'Clip to compare with' });
          compareChoices().forEach(function (x) {
            var o = h('option', { value: x.id }, relAge(x.createdAt) + ' · ' + liftLabel(x.lift));
            if (x.id === fcX.id) o.selected = true;
            sel.appendChild(o);
          });
          sel.addEventListener('change', function () { var nx = S.list.find(function (x) { return x.id === sel.value; }); if (nx) { saveOtherMarkLater(); closeCompare(true); openCompare(nx); } });
          head.appendChild(sel);
        }
        var markB = h('button', { type: 'button', class: 'vr-mark', html: IC.flag + '<span>Align here</span>', title: 'Align here (M on the left clip, Shift-M on the right)' });
        markB.addEventListener('click', function () { setMark(isA, pl.t()); });
        head.appendChild(markB);
        c.appendChild(head);
        c.appendChild(pl.el);
        var tl = Timeline(pl, { flag: function () { return pl.doc.alignT; }, onScrub: function () { if (isA && locked()) b.seek(pairTime(a.t(), C.offset, b.duration())); } });
        pl.onMeta = function () { tl.marks(); tl.sync(); if (S && S.transport) S.transport.sync(); paintMarks(); };
        pl.onTime = function () { tl.sync(); if (isA && S && S.transport) S.transport.sync(); };
        pl.onState = function () { if (S && S.transport) S.transport.sync(); };
        c.appendChild(tl.el);
        pl._tl = tl; pl._markBtn = markB;
        return c;
      };
      grid.appendChild(col(a, S.fc, true)); grid.appendChild(col(b, other, false));
      main.appendChild(grid);
      var tr = buildTransport([a, b]);
      main.appendChild(tr.el);
      a.onFrame = function () { syncB(); };
      a.video.addEventListener('ended', function () { pauseCompare(); });
      // open each clip on its mark (or where the review was)
      a.video.addEventListener('loadedmetadata', function once() { a.video.removeEventListener('loadedmetadata', once); a.seek(num(a.doc.alignT) ? a.doc.alignT : keepT); });
      b.video.addEventListener('loadedmetadata', function once() { b.video.removeEventListener('loadedmetadata', once); if (num(b.doc.alignT)) b.seek(b.doc.alignT); });
      a.load(); b.load();
      paintMarks();
      S.cmpSec.hidden = false;
      var dsec = S.side.querySelector('.vr-draw-sec'); if (dsec) dsec.hidden = true;
    });
  }
  function locked() { var C = S && S.compare; return !!(C && num(C.a.doc.alignT) && num(C.b.doc.alignT)); }
  function setMark(isA, t) {
    var C = S.compare; if (!C) return;
    var pl = isA ? C.a : C.b;
    pl.doc.alignT = q3(t);
    if (isA) S.doc.alignT = pl.doc.alignT;
    pl._tl.marks();
    paintMarks();
  }
  function paintMarks() {
    var C = S && S.compare; if (!C) return;
    C.offset = compareOffset(C.a.doc.alignT, C.b.doc.alignT);
    [C.a, C.b].forEach(function (pl) {
      if (!pl._markBtn) return;
      var on = num(pl.doc.alignT);
      pl._markBtn.classList.toggle('on', on);
      pl._markBtn.lastChild.textContent = on ? 'Aligned at ' + fmtClock(pl.doc.alignT) : 'Align here';
    });
    var sec = S.cmpSec; sec.textContent = '';
    sec.appendChild(h('div', { class: 'vr-sec-h' }, 'Compare'));
    sec.appendChild(h('p', { class: 'vr-cmp-help' }, locked()
      ? 'Locked on the marks. Play runs both from just before them.'
      : 'Find the same moment in each clip, like the bottom of the squat, and tap Align here on both.'));
    var done = h('button', { type: 'button', class: 'vr-btn' }, 'Back to drawing');
    done.addEventListener('click', function () { closeCompare(); });
    sec.appendChild(done);
  }
  function syncB() {
    var C = S && S.compare; if (!C || !C.a.playing()) return;
    var want = C.a.t() + (locked() ? C.offset : C.free || 0), d = C.b.duration();
    if (d && want >= d - 0.03) { if (C.b.playing()) C.b.pause(); return; }
    if (want < 0) { if (C.b.playing()) C.b.pause(); C.b.seek(0); return; }
    if (!C.b.playing()) { C.b.seek(want); C.b.play(); return; }
    if (Math.abs(C.b.t() - want) > 0.08) C.b.video.currentTime = want;
  }
  function playCompare() {
    var C = S.compare; if (!C) return;
    var rate = C.a.video.playbackRate || 1;
    C.b.video.playbackRate = rate;
    if (locked()) {
      var st = compareLeadIn(C.a.doc.alignT, C.b.doc.alignT, 1.2);
      // sitting on the marks (just aligned), before the lead-in, or at the end: run in to the marks
      // together; anywhere else, play on from here, still locked
      var onMark = Math.abs(C.a.t() - C.a.doc.alignT) < 1 / C.a.fps;
      if (onMark || C.a.t() < st.a || C.a.t() >= C.a.duration() - 0.05) { C.a.seek(st.a); C.b.seek(st.b); }
      else C.b.seek(pairTime(C.a.t(), C.offset, C.b.duration()));
    } else C.free = C.b.t() - C.a.t();
    C.a.play(); C.b.play();
  }
  function pauseCompare() { var C = S && S.compare; if (!C) return; C.a.pause(); C.b.pause(); }
  function stepCompare(dir) {
    var C = S.compare; if (!C) return;
    pauseCompare();
    C.a.step(dir);
    if (locked()) C.b.seek(pairTime(C.a.t(), C.offset, C.b.duration())); else C.b.step(dir);
  }
  var pendingMarks = [];
  function saveOtherMarkLater() {
    var C = S && S.compare; if (!C) return;
    if (docKey(C.b.doc) !== C.savedB) pendingMarks.push({ fc: C.other, alignT: C.b.doc.alignT });
  }
  function closeCompare(silent) {
    var C = S && S.compare; if (!C) return;
    if (!silent) saveOtherMarkLater();
    S.doc = C.a.doc;
    var t = C.a.t();
    C.a.destroy(); C.b.destroy();
    S.compare = null;
    S.veil.classList.remove('is-compare');
    S.cmpBtn.setAttribute('aria-pressed', 'false'); S.cmpBtn.classList.remove('on');
    if (silent) return;
    S.cmpSec.hidden = true;
    var dsec = S.side.querySelector('.vr-draw-sec'); if (dsec) dsec.hidden = false;
    buildSingle();
    S.player.video.addEventListener('loadedmetadata', function once() { S.player.video.removeEventListener('loadedmetadata', once); S.player.seek(t); });
    paintDrawingList(); paintBudget();
  }

  // ------------------------------------------------------------ send
  function dirty() {
    if (!S || !S.doc) return false;
    var doc = S.player ? S.player.doc : (S.compare ? S.compare.a.doc : S.doc);
    var reply = S.reply ? S.reply.value.trim() : '';
    return docKey(doc) !== S.saved || reply !== (S.fc.coachReply || '').trim() || pendingMarks.length > 0 || !!(S.compare && docKey(S.compare.b.doc) !== S.compare.savedB);
  }
  function send() {
    if (!S || S.busy || !S.doc) return;
    var fc = S.fc, doc = S.player ? S.player.doc : (S.compare ? S.compare.a.doc : S.doc);
    if (S.compare) saveOtherMarkLater();
    var reply = S.reply.value.trim(), replyChanged = reply !== (fc.coachReply || '').trim();
    var docChanged = docKey(doc) !== S.saved;
    if (!docChanged && !replyChanged && !pendingMarks.length) { say('Draw on a frame or write a reply first'); return; }
    if (!fitsCap(doc)) { say('Too much to save in one review. Delete a freehand stroke or two'); return; }
    var u = currentUser(), first = S.first;
    S.busy = true; S.sendBtn.disabled = true; S.sendBtn.textContent = 'Sending…';
    var clean = sanitizeDoc(doc);
    var marks = pendingMarks.splice(0);
    var done = function (updated, local) {
      if (!S) return;
      S.busy = false;
      S.saved = docKey(clean);
      if (updated) { fc.coachReply = updated.coachReply; fc.coachReplyAt = updated.coachReplyAt; }
      var cleared = replyChanged && !reply && !docChanged && !marks.length;
      say(local ? 'Reply sent. The drawings stay on this device until the review update is installed'
        : cleared ? 'Reply removed' : 'Sent to ' + first);
      var cb = S.opts.onSaved;
      closeReview(true);
      if (typeof cb === 'function') { try { cb(updated || fc, clean); } catch (e) {} }
    };
    var fail = function (e) {
      try { console.error('video review send', e); } catch (er) {}
      if (!S) return;
      marks.forEach(function (m) { pendingMarks.push(m); });
      S.busy = false; S.sendBtn.disabled = false; S.sendBtn.textContent = 'Send';
      say('Couldn’t send. Check the connection and try again');
    };
    if (isDemo(fc)) {
      demoStore[fc.id] = clean;
      marks.forEach(function (m) { var d = sanitizeDoc(demoStore[m.fc.id] || DEMO_DOCS[m.fc.id] || {}); d.alignT = m.alignT; demoStore[m.fc.id] = d; });
      var upd = replyChanged ? Object.assign({}, fc, { coachReply: reply || null, coachReplyAt: new Date().toISOString() }) : null;
      setTimeout(function () { done(upd, false); }, 250);
      return;
    }
    var DB = root.DB, coachId = (u && u.id) || fc.coachId, local = false;
    var chain = Promise.resolve();
    if (docChanged) chain = chain.then(function () {
      return DB.saveFormCheckAnnotations(Object.assign({ formCheckId: fc.id, coachId: coachId }, clean)).then(function (r) {
        if (!r || (!r.ok && !r.local)) throw (r && r.error) || new Error('save failed');
        if (r.local) local = true;
      });
    });
    marks.forEach(function (m) { chain = chain.then(function () { return DB.saveFormCheckAlign && DB.saveFormCheckAlign(m.fc.id, coachId, m.alignT); }); });
    var updated = null;
    // an emptied reply is saved too (replyToFormCheck stores '' as no reply)
    if (replyChanged) chain = chain.then(function () { return DB.replyToFormCheck(fc.id, reply).then(function (x) { updated = x; }); });
    chain.then(function () {
      // one push for the whole review, never blocking it
      if ((docChanged || (replyChanged && reply)) && fc.athleteId && typeof DB.sendPush === 'function') {
        var coachFirst = ((u && u.name) || '').split(' ')[0];
        var n = clean.drawings.length;
        var bodyTxt = (replyChanged && reply) ? reply.slice(0, 140)
          : (n ? n + (n === 1 ? ' drawing' : ' drawings') + ' on your clip' : '') + (clean.tags.length ? ' · ' + clean.tags.map(function (t) { return (TAGS.find(function (x) { return x.id === t; }) || {}).label; }).join(', ') : '');
        DB.sendPush({ toUserId: fc.athleteId, title: coachFirst ? coachFirst + ' reviewed your ' + liftLabel(fc.lift).toLowerCase() : 'Form-check review',
          body: bodyTxt || 'Your coach reviewed your clip', url: '/athlete.html', tag: 'powa-fc-' + fc.id, category: 'form_checks' }).catch(function () {});
      }
      done(updated, local && docChanged);
    }, fail);
  }

  // ------------------------------------------------------------ keys + close
  function typing(t) { var tag = t && t.tagName; return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (t && t.isContentEditable); }
  var CONTROL_SEL = 'button, a[href], select, summary, [role="button"], [role="radio"], [role="checkbox"], [role="switch"], [role="tab"], [role="option"], [role="menuitem"]';
  // a focused button, chip, link … inside the review: Enter and Space belong to it
  function onControl(t) { return !!(t && t.closest && S && S.veil && S.veil.contains(t) && t.closest(CONTROL_SEL)); }
  var FOCUS_SEL = 'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  function focusables() {
    if (!S || !S.veil) return [];
    return Array.prototype.filter.call(S.veil.querySelectorAll(FOCUS_SEL), function (el) {
      return !el.hidden && el.getClientRects().length > 0 && !el.closest('[hidden], [inert]');
    });
  }
  // aria-modal means it: Tab and Shift+Tab go round the review, never to the page behind it
  function trapTab(e) {
    var f = focusables(); if (!f.length) { e.preventDefault(); return; }
    var first = f[0], last = f[f.length - 1], t = e.target, inside = S.veil.contains(t) && t !== S.veil;
    if (!inside) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (!e.shiftKey && t === last) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && t === first) { e.preventDefault(); last.focus(); }
  }
  function onFocusIn(e) {
    if (!S || !S.veil || S.veil.contains(e.target)) return;
    var f = focusables(); (f[0] || S.veil).focus({ preventScroll: true });
  }
  // keys that reach a control inside the review stop at the review (the desk's J/K never hear them)
  function veilKeyStop(e) { e.stopPropagation(); }
  function onKey(e) {
    if (!S) return;
    var k = e.key, mod = e.metaKey || e.ctrlKey;
    if (mod && k === 'Enter') { e.preventDefault(); e.stopPropagation(); send(); return; }
    if (k === 'Escape') {
      e.preventDefault(); e.stopPropagation();
      if (typing(e.target)) { e.target.blur(); return; }
      var p = S.player;
      if (p && p.draft) { p.draft = null; p.paint(); refreshTools(); return; }
      if (S.tool) { setTool(null); return; }
      if (p && p.sel >= 0) { p.sel = -1; p.paint(); refreshTools(); return; }
      if (S.compare) { closeCompare(); return; }
      closeReview();
      return;
    }
    if (k === 'Tab') { e.stopPropagation(); trapTab(e); return; }
    var inVeil = S.veil && S.veil.contains(e.target);
    if (typing(e.target)) return;
    if (mod && (k === 'z' || k === 'Z')) { e.preventDefault(); e.stopPropagation(); undo(); return; }
    if (mod || e.altKey) { if (mod && (k === 'k' || k === 'K')) { e.preventDefault(); e.stopPropagation(); } return; }
    // Enter / Space on a focused button, judging chip, speed, tool, drawing row, Close …: let the
    // control have it (the veil's own listener stops it there). Space plays only from the stage.
    if ((k === 'Enter' || k === ' ' || k === 'Spacebar') && onControl(e.target)) return;
    var handled = true;
    if (k === ' ') togglePlay();
    else if (k === 'k' || k === 'K') allPlayers().forEach(function (p) { p.pause(); });
    else if (k === 'l' || k === 'L') { if (!allPlayers().some(function (p) { return p.playing(); })) togglePlay(); }
    else if (k === 'j' || k === 'J') { allPlayers().forEach(function (p) { p.pause(); }); var a = allPlayers()[0]; if (a) { a.seek(a.t() - 1); if (S.compare && locked()) S.compare.b.seek(pairTime(a.t(), S.compare.offset, S.compare.b.duration())); } }
    else if (k === ',' || k === '<' || k === 'ArrowLeft') stepAll(-1);
    else if (k === '.' || k === '>' || k === 'ArrowRight') stepAll(1);
    else if (k === '[' || k === ']') {
      var a2 = allPlayers()[0]; var cur = a2 ? a2.video.playbackRate : 1, i = RATES.indexOf(cur); if (i < 0) i = 2;
      setRate(RATES[clamp(i + (k === ']' ? 1 : -1), 0, RATES.length - 1)]);
    }
    else if (/^[1-5]$/.test(k) && !S.compare) setTool(S.tool === KINDS[+k - 1] ? null : KINDS[+k - 1]);
    else if ((k === 'Backspace' || k === 'Delete') && !S.compare) deleteSelected();
    else if ((k === 'c' || k === 'C') && !S.cmpBtn.disabled) toggleCompare();
    else if ((k === 'm' || k === 'M') && S.compare) setMark(!e.shiftKey, (e.shiftKey ? S.compare.b : S.compare.a).t());
    else handled = false;
    if (handled) {
      e.preventDefault(); e.stopPropagation();
      if (S && S.transport) S.transport.sync();
    } else if (!inVeil) {
      // While the review is open, no other screen hears the keyboard (the desk's J/K, ⌘K …).
      // Keys aimed inside the review go on to their control, and stop at the veil (veilKeyStop).
      e.stopPropagation();
    }
  }
  function closeReview(force) {
    if (!S) return;
    if (!force && dirty() && !confirm('Close without sending? Your drawings and reply on this clip will be lost.')) return;
    var s = S; S = null;
    pendingMarks = [];
    window.removeEventListener('keydown', onKey, true);
    document.removeEventListener('focusin', onFocusIn, true);
    if (s.player) s.player.destroy();
    if (s.compare) { s.compare.a.destroy(); s.compare.b.destroy(); }
    document.documentElement.classList.remove('vr-open');
    var v = s.veil;
    if (reducedMotion()) v.remove();
    else { v.classList.add('is-leaving'); setTimeout(function () { v.remove(); }, 180); }
    try { if (s.lastFocus && s.lastFocus.focus) s.lastFocus.focus({ preventScroll: true }); } catch (e) {}
  }

  // ------------------------------------------------------------ the lifter's replay (read-only)
  // Plays their clip with the coach's drawings at the moments they were drawn: the clip rests on
  // each drawn frame for a moment, then carries on. Ticks on the timeline jump straight there.
  function mountReplay(host, fc, opts) {
    if (!hasDom || !host || !fc) return null;
    opts = opts || {};
    ensureCss();
    host.textContent = '';
    var wrap = h('div', { class: 'vr-replay' });
    host.appendChild(wrap);
    var p = new Player(fc, { cls: 'is-replay' });
    p.canvas.classList.add('is-readonly');
    wrap.appendChild(p.el);
    var tl = Timeline(p, {});
    var ctl = h('div', { class: 'vr-rp-ctl' });
    var playB = h('button', { type: 'button', class: 'vr-play', 'aria-label': 'Play', html: IC.play });
    var clock = h('span', { class: 'vr-rp-clock' }, '0:00.00');
    var nextB = h('button', { type: 'button', class: 'vr-btn vr-rp-next', hidden: true }, 'Next drawing');
    ctl.appendChild(playB); ctl.appendChild(tl.el); ctl.appendChild(clock);
    wrap.appendChild(ctl);
    var meta = h('div', { class: 'vr-rp-meta' });
    wrap.appendChild(meta);
    var stops = [], passed = {}, resting = null, prevT = 0;
    var sync = function () {
      var playing = p.playing() || !!resting;
      playB.innerHTML = playing ? IC.pause : IC.play;
      playB.setAttribute('aria-label', playing ? 'Pause' : 'Play');
      clock.textContent = fmtClock(p.t());
      tl.sync();
    };
    var stopRest = function () { if (resting) { clearTimeout(resting); resting = null; } };
    playB.addEventListener('click', function () {
      if (resting) { stopRest(); sync(); return; }
      if (p.playing()) { p.pause(); return; }
      if (p.t() >= p.duration() - 0.05) passed = {};
      p.play();
    });
    nextB.addEventListener('click', function () {
      stopRest();
      var t = p.t(), nx = stops.find(function (s) { return s > t + 0.02; });
      if (nx == null) nx = stops[0];
      if (nx != null) { p.pause(); p.seek(nx); passed[nx] = true; }
    });
    p.onFrame = function () {
      var t = p.t();
      // crossing a drawn moment: rest on that exact frame so the drawing can be read
      for (var i = 0; i < stops.length; i++) {
        var s = stops[i];
        if (!passed[s] && prevT <= s && t >= s - 0.001) {
          passed[s] = true; p.pause(); p.seek(s);
          resting = setTimeout(function () { resting = null; if (p.alive) p.play(); sync(); }, STOP_S * 1000);
          break;
        }
      }
      prevT = t;
    };
    p.onTime = function () { if (!p.playing()) prevT = p.t(); sync(); };
    p.onState = sync;
    p.onMeta = function () { tl.marks(); sync(); };
    p.video.addEventListener('ended', function () { passed = {}; prevT = 0; sync(); });
    var docP = (opts.doc ? Promise.resolve(sanitizeDoc(opts.doc)) : loadDoc(fc));
    docP.then(function (doc) {
      if (!p.alive) return;
      p.doc = doc;
      stops = stopTimes(doc.drawings, p.fps);
      nextB.hidden = !stops.length;
      meta.textContent = '';
      if (doc.drawings.length || doc.tags.length) {
        var line = h('div', { class: 'vr-rp-line' });
        if (doc.drawings.length) line.appendChild(h('span', { class: 'vr-rp-count' }, doc.drawings.length + (doc.drawings.length === 1 ? ' drawing' : ' drawings') + ' from your coach'));
        doc.tags.forEach(function (t) { var tg = TAGS.find(function (x) { return x.id === t; }); if (tg) line.appendChild(h('span', { class: 'vr-tag is-static' }, tg.label)); });
        meta.appendChild(line);
        meta.appendChild(nextB);
      }
      tl.marks(); p.paint();
    });
    p.load();
    // the card can be rebuilt (or the tab left): stop the clip when it leaves the page
    var gone = setInterval(function () { if (!wrap.isConnected) { clearInterval(gone); stopRest(); p.destroy(); } }, 2000);
    return { player: p, destroy: function () { clearInterval(gone); stopRest(); p.destroy(); } };
  }

  // ------------------------------------------------------------ iPhone app: export to H.264 first
  // iPhones film HEVC; Chrome on Windows (and Firefox) shows it black. In the app, the clip comes
  // from the native picker (PowaVideo.pickVideo), which hands back an H.264 MP4 the web upload
  // then sends unchanged. On the web the file input stays as it is.
  function nativePlugin() {
    var C = root.Capacitor;
    try { if (C && C.isNativePlatform && C.isNativePlatform() && C.Plugins && C.Plugins.PowaVideo) return C.Plugins.PowaVideo; } catch (e) {}
    return null;
  }
  function attachNativePicker(fileInput, opts) {
    var P = nativePlugin();
    if (!hasDom || !P || !fileInput || !fileInput.parentNode) return null;
    opts = opts || {};
    ensureCss();
    var picked = null, busy = false;
    fileInput.hidden = true;
    var box = h('div', { class: 'vr-pick' });
    var rec = h('button', { type: 'button', class: 'vr-btn' }, 'Film a set');
    var lib = h('button', { type: 'button', class: 'vr-btn' }, 'Choose a clip');
    var label = h('div', { class: 'vr-pick-label', 'aria-live': 'polite' });
    box.appendChild(rec); box.appendChild(lib); box.appendChild(label);
    fileInput.parentNode.insertBefore(box, fileInput.nextSibling);
    var listener = null;
    function setBusy(on, txt) { busy = on; rec.disabled = lib.disabled = on; if (txt != null) label.textContent = txt; }
    function pick(source) {
      if (busy) return;
      setBusy(true, 'Opening…');
      Promise.resolve(P.addListener ? P.addListener('exportProgress', function (ev) { var pc = Math.round(((ev && ev.progress) || 0) * 100); label.textContent = 'Preparing the clip… ' + pc + '%'; }) : null)
        .then(function (l) { listener = l; return P.pickVideo({ source: source, quality: opts.quality || 'standard' }); })
        .then(function (res) {
          if (!res || res.cancelled) { setBusy(false, picked ? label.textContent : ''); return; }
          label.textContent = 'Preparing the clip…';
          var src = (root.Capacitor && root.Capacitor.convertFileSrc) ? root.Capacitor.convertFileSrc(res.path) : res.webPath;
          return fetch(src).then(function (r) { return r.blob(); }).then(function (blob) {
            if (picked && picked.path && picked.path !== res.path) { try { P.discard({ path: picked.path }); } catch (e) {} }
            var file = new File([blob], res.name || 'form-check.mp4', { type: 'video/mp4' });
            picked = { file: file, path: res.path };
            var mb = file.size / 1048576;
            label.textContent = (res.name || 'Clip') + ' · ' + fmtClock(res.duration || 0).replace(/\.\d+$/, '') + ' · ' + (mb >= 10 ? Math.round(mb) : mb.toFixed(1)) + ' MB';
            setBusy(false);
          });
        })
        .catch(function (e) { setBusy(false, ''); say('Couldn’t use that clip' + (e && e.message ? ': ' + e.message : '')); })
        .then(function () { if (listener && listener.remove) { try { listener.remove(); } catch (e) {} } listener = null; });
    }
    rec.addEventListener('click', function () { pick('camera'); });
    lib.addEventListener('click', function () { pick('library'); });
    return {
      file: function () { return picked ? picked.file : null; },
      done: function () { if (picked && picked.path) { try { P.discard({ path: picked.path }); } catch (e) {} } picked = null; label.textContent = ''; }
    };
  }

  if (hasDom) {
    root.openVideoReview = openVideoReview;
    // load the stylesheet early so the lifter's form-check cards are styled on first paint
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureCss); else ensureCss();
  }

  return {
    geo: geo, config: config, TAGS: TAGS,
    open: openVideoReview, close: function () { closeReview(true); }, mountReplay: mountReplay,
    attachNativePicker: attachNativePicker, demoFormChecks: demoFormChecks, demoAthleteCheck: demoAthleteCheck,
    paintDrawings: paintDrawings,
    _debug: { session: function () { return S; }, demoStore: demoStore, expireUrls: function () { (S && (S.compare ? [S.compare.a, S.compare.b] : [S.player]) || []).forEach(function (p) { if (p) p.issuedAt = 0; }); } }
  };
})();
if (typeof window !== 'undefined') window.VideoReview = VideoReview;
