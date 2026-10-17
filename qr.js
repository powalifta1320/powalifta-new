// =========================================================
// QR CODES (2026-10-17): club invite links and gym-wall posters.
// A small, dependency-free encoder (byte mode, error correction M, versions
// 1–15, best of the 8 masks by the standard penalty rules), following
// ISO/IEC 18004 the way Project Nayuki's reference implementation does.
// Exposes qrMatrix(text) → { size, dark(x, y) } and qrSvg(text, opts).
// Verified by decoding its output with macOS CoreImage (see CLAUDE.md).
// =========================================================
(function (root) {
  'use strict';
  // Error-correction codewords per block and number of blocks, level M, v0–15.
  var ECC_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24];
  var BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10];

  function rawModules(ver) {
    var r = (16 * ver + 128) * ver + 64;
    if (ver >= 2) {
      var n = Math.floor(ver / 7) + 2;
      r -= (25 * n - 10) * n - 55;
      if (ver >= 7) r -= 36;
    }
    return r;
  }
  function dataCodewords(ver) { return Math.floor(rawModules(ver) / 8) - ECC_M[ver] * BLOCKS_M[ver]; }

  // Reed–Solomon over GF(2^8), polynomial 0x11D.
  function rsMul(x, y) {
    var z = 0;
    for (var i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11D); z ^= ((y >>> i) & 1) * x; }
    return z;
  }
  function rsDivisor(degree) {
    var r = []; for (var i = 0; i < degree - 1; i++) r.push(0); r.push(1);
    var root = 1;
    for (i = 0; i < degree; i++) {
      for (var j = 0; j < r.length; j++) { r[j] = rsMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
      root = rsMul(root, 0x02);
    }
    return r;
  }
  function rsRemainder(data, div) {
    var r = div.map(function () { return 0; });
    data.forEach(function (b) {
      var f = b ^ r.shift(); r.push(0);
      div.forEach(function (c, i) { r[i] ^= rsMul(c, f); });
    });
    return r;
  }
  function utf8(text) {
    if (typeof TextEncoder !== 'undefined') return Array.from(new TextEncoder().encode(text));
    return unescape(encodeURIComponent(text)).split('').map(function (c) { return c.charCodeAt(0); });
  }
  function bit(v, i) { return ((v >>> i) & 1) !== 0; }

  function qrMatrix(text) {
    var bytes = utf8(String(text));
    var ver = 1;
    for (; ver <= 15; ver++) { if (4 + (ver <= 9 ? 8 : 16) + bytes.length * 8 <= dataCodewords(ver) * 8) break; }
    if (ver > 15) throw new Error('qr_too_long');
    var ccBits = ver <= 9 ? 8 : 16, cap = dataCodewords(ver) * 8, bits = [];
    var put = function (v, n) { for (var i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
    put(4, 4); put(bytes.length, ccBits); bytes.forEach(function (b) { put(b, 8); });
    put(0, Math.min(4, cap - bits.length));
    put(0, (8 - bits.length % 8) % 8);
    for (var pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    var data = [];
    for (var i = 0; i < bits.length; i += 8) { var v = 0; for (var j = 0; j < 8; j++) v = (v << 1) | bits[i + j]; data.push(v); }

    // Error correction, split into blocks, interleaved.
    var nb = BLOCKS_M[ver], el = ECC_M[ver], raw = Math.floor(rawModules(ver) / 8);
    var nShort = nb - raw % nb, shortLen = Math.floor(raw / nb), div = rsDivisor(el), blocks = [];
    for (var bI = 0, k = 0; bI < nb; bI++) {
      var dat = data.slice(k, k + shortLen - el + (bI < nShort ? 0 : 1));
      k += dat.length;
      var ecc = rsRemainder(dat, div);
      if (bI < nShort) dat.push(0);
      blocks.push(dat.concat(ecc));
    }
    var cw = [];
    for (i = 0; i < blocks[0].length; i++) blocks.forEach(function (b, jj) { if (i !== shortLen - el || jj >= nShort) cw.push(b[i]); });

    var size = ver * 4 + 17, mod = [], fn = [];
    for (i = 0; i < size; i++) { mod.push(new Array(size).fill(false)); fn.push(new Array(size).fill(false)); }
    var setFn = function (x, y, d) { mod[y][x] = d; fn[y][x] = true; };
    for (i = 0; i < size; i++) { setFn(6, i, i % 2 === 0); setFn(i, 6, i % 2 === 0); }
    var finder = function (cx, cy) {
      for (var dy = -4; dy <= 4; dy++) for (var dx = -4; dx <= 4; dx++) {
        var d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
        if (x >= 0 && x < size && y >= 0 && y < size) setFn(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    var align = [];
    if (ver > 1) {
      var na = Math.floor(ver / 7) + 2, step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
      align = [6];
      for (var pos = size - 7; align.length < na; pos -= step) align.splice(1, 0, pos);
    }
    for (i = 0; i < align.length; i++) for (j = 0; j < align.length; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === align.length - 1) || (i === align.length - 1 && j === 0)) continue;
      for (var ay = -2; ay <= 2; ay++) for (var ax = -2; ax <= 2; ax++) setFn(align[i] + ax, align[j] + ay, Math.max(Math.abs(ax), Math.abs(ay)) !== 1);
    }
    var drawFormat = function (mask) {
      var d = (0 << 3) | mask, rem = d;   // level M = 0b00
      for (var q = 0; q < 10; q++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      var b = ((d << 10) | rem) ^ 0x5412;
      for (q = 0; q <= 5; q++) setFn(8, q, bit(b, q));
      setFn(8, 7, bit(b, 6)); setFn(8, 8, bit(b, 7)); setFn(7, 8, bit(b, 8));
      for (q = 9; q < 15; q++) setFn(14 - q, 8, bit(b, q));
      for (q = 0; q < 8; q++) setFn(size - 1 - q, 8, bit(b, q));
      for (q = 8; q < 15; q++) setFn(8, size - 15 + q, bit(b, q));
      setFn(8, size - 8, true);
    };
    drawFormat(0);
    if (ver >= 7) {
      var rv = ver;
      for (i = 0; i < 12; i++) rv = (rv << 1) ^ ((rv >>> 11) * 0x1F25);
      var vb = (ver << 12) | rv;
      for (i = 0; i < 18; i++) { var c = bit(vb, i), a = size - 11 + i % 3, bb = Math.floor(i / 3); setFn(a, bb, c); setFn(bb, a, c); }
    }
    // Codewords, zig-zag from the bottom right.
    var n = 0;
    for (var right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (var vert = 0; vert < size; vert++) for (j = 0; j < 2; j++) {
        var x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - vert : vert;
        if (!fn[y][x] && n < cw.length * 8) { mod[y][x] = bit(cw[n >>> 3], 7 - (n & 7)); n++; }
      }
    }
    var maskFns = [
      function (x, y) { return (x + y) % 2 === 0; }, function (x, y) { return y % 2 === 0; },
      function (x) { return x % 3 === 0; }, function (x, y) { return (x + y) % 3 === 0; },
      function (x, y) { return (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0; },
      function (x, y) { return x * y % 2 + x * y % 3 === 0; },
      function (x, y) { return (x * y % 2 + x * y % 3) % 2 === 0; },
      function (x, y) { return ((x + y) % 2 + x * y % 3) % 2 === 0; }
    ];
    var applyMask = function (m) { for (var yy = 0; yy < size; yy++) for (var xx = 0; xx < size; xx++) if (!fn[yy][xx] && maskFns[m](xx, yy)) mod[yy][xx] = !mod[yy][xx]; };
    var penalty = function () {
      var p = 0, dark = 0, yy, xx;
      var line = function (get) {
        var s = 0, run = 1, seq = [];
        for (var t = 0; t < size; t++) {
          var cur = get(t);
          seq.push(cur ? 1 : 0);
          if (t > 0 && cur === get(t - 1)) { run++; if (run === 5) s += 3; else if (run > 5) s++; }
          else run = 1;
        }
        var str = seq.join('');
        ['10111010000', '00001011101'].forEach(function (pat) { var at = str.indexOf(pat); while (at >= 0) { s += 40; at = str.indexOf(pat, at + 1); } });
        return s;
      };
      for (yy = 0; yy < size; yy++) p += line(function (t) { return mod[yy][t]; });
      for (xx = 0; xx < size; xx++) p += line(function (t) { return mod[t][xx]; });
      for (yy = 0; yy < size - 1; yy++) for (xx = 0; xx < size - 1; xx++) {
        var c0 = mod[yy][xx];
        if (c0 === mod[yy][xx + 1] && c0 === mod[yy + 1][xx] && c0 === mod[yy + 1][xx + 1]) p += 3;
      }
      for (yy = 0; yy < size; yy++) for (xx = 0; xx < size; xx++) if (mod[yy][xx]) dark++;
      var total = size * size;
      p += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
      return p;
    };
    var best = 0, bestP = Infinity;
    for (var m = 0; m < 8; m++) {
      applyMask(m); drawFormat(m);
      var pp = penalty();
      if (pp < bestP) { bestP = pp; best = m; }
      applyMask(m);
    }
    applyMask(best); drawFormat(best);
    return { size: size, version: ver, mask: best, dark: function (x, y) { return mod[y][x]; } };
  }

  // An SVG of the code: one path, quiet zone included. opts: { dark, light, quiet }
  function qrSvg(text, opts) {
    opts = opts || {};
    var q = qrMatrix(text), quiet = opts.quiet == null ? 4 : opts.quiet, n = q.size + quiet * 2, d = '';
    for (var y = 0; y < q.size; y++) for (var x = 0; x < q.size; x++) if (q.dark(x, y)) d += 'M' + (x + quiet) + ' ' + (y + quiet) + 'h1v1h-1z';
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + n + ' ' + n + '" shape-rendering="crispEdges" role="img" aria-label="QR code">' +
      '<rect width="' + n + '" height="' + n + '" fill="' + (opts.light || '#fff') + '"/>' +
      '<path d="' + d + '" fill="' + (opts.dark || '#000') + '"/></svg>';
  }
  // Draw onto a canvas at (x, y), size px square (quiet zone included).
  function qrDraw(ctx, text, x, y, px, opts) {
    opts = opts || {};
    var q = qrMatrix(text), quiet = opts.quiet == null ? 4 : opts.quiet, n = q.size + quiet * 2, s = px / n;
    ctx.fillStyle = opts.light || '#fff'; ctx.fillRect(x, y, px, px);
    ctx.fillStyle = opts.dark || '#000';
    for (var yy = 0; yy < q.size; yy++) for (var xx = 0; xx < q.size; xx++) {
      if (q.dark(xx, yy)) ctx.fillRect(Math.floor(x + (xx + quiet) * s), Math.floor(y + (yy + quiet) * s), Math.ceil(s), Math.ceil(s));
    }
  }
  root.qrMatrix = qrMatrix; root.qrSvg = qrSvg; root.qrDraw = qrDraw;
  if (typeof module !== 'undefined' && module.exports) module.exports = { qrMatrix: qrMatrix, qrSvg: qrSvg };
})(typeof window !== 'undefined' ? window : globalThis);
