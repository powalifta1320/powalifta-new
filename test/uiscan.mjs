#!/usr/bin/env node
/*
 * Small-stuff scanner: the details a person notices and a unit test doesn't.
 *
 * Opens 100 screens (athlete / solo / coach / brand-new-coach demos in the iPhone layout, their
 * sheets, the onboarding, every public page at desktop and phone width, dark and light) and
 * reports: sideways scroll, text overlapping text, controls overlapping controls, text cut off
 * by its box, things poking out of the screen or out of their card, side-by-side buttons that
 * don't match, tiny tap targets (app only) and unreadable text (contrast under 2.6:1).
 * Known and fine: the inline name inputs in the program builder and profile (26px tall inside
 * taller rows), the eye button inside a password field, the 32x26 message reaction chip.
 *
 * Needs playwright-core and a Chromium (not repo dependencies, like check-mobile-overflow):
 *     npm i -g playwright-core && npx playwright install chromium
 * Serve the repo root, then run:
 *     python3 -m http.server 4191 --bind 127.0.0.1
 *     node test/uiscan.mjs [outDir]          # BASE=http://host:port/ to point elsewhere
 * Screens with findings are screenshotted into outDir (default /tmp/powa-uiscan) with issues.json.
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
const screens = [];
for (const [theme, suf] of [['dark', ''], ['light', '-l']]) {
  for (const t of ['today', 'progress', 'club', 'coach', 'you', 'bodyweight', 'library']) screens.push({ name: 'a-' + t + suf, page: A, theme, eval: t === 'today' ? null : tab(t) });
  if (theme === 'dark') for (const t of ['today', 'program', 'progress', 'coach', 'library', 'you']) screens.push({ name: 's-' + t, page: SO, eval: t === 'today' ? null : tab(t) });
  for (const t of ['athletes', 'program', 'messages', 'club', 'you', 'templates', 'progress']) screens.push({ name: 'c-' + t + suf, page: C, theme, eval: t === 'athletes' ? null : tab(t) });
  for (const t of ['athletes', 'program', 'messages', 'you', 'templates']) screens.push({ name: 'f-' + t + suf, page: F, theme, eval: t === 'athletes' ? null : tab(t) });
  screens.push(
    { name: 'sh-invite' + suf, page: C, theme, eval: 'openInviteModal()' },
    { name: 'sh-athlete' + suf, page: C, theme, eval: "openAthleteSheet('demo-a1')" },
    { name: 'sh-security' + suf, page: C, theme, eval: 'openSecuritySheet()' },
    { name: 'sh-profile' + suf, page: A, theme, eval: 'openProfileSheet()' },
    { name: 'sh-notif' + suf, page: A, theme, eval: 'openNotificationsSheet()' },
    { name: 'sh-plates' + suf, page: A, theme, eval: 'openGymPlatesSheet()' },
    { name: 'sh-import' + suf, page: C, theme, eval: "openSheetImport('demo-a1')" },
    { name: 'sh-thread' + suf, page: C, theme, eval: "openAthleteMessages('demo-a1', 'Arjun Mehta')" },
    { name: 'ob-welcome' + suf, page: 'index.html', theme },
    { name: 'ob-signup' + suf, page: 'index.html', theme, eval: "obOpen('signup', { role: 'coach' })" },
    { name: 'ob-login' + suf, page: 'index.html', theme, eval: "obOpen('login')" });
}
for (const [w, h, suf] of [[1440, 900, ''], [390, 844, '-m']]) {
  for (const p of ['index.html', 'about.html', 'faq.html', 'guides.html', 'guide-rpe.html', 'marketplace.html', 'leaderboard.html', 'exercises.html', 'join.html?code=ABC234', 'reset-password.html', 'privacy.html', 'terms.html', A, SO, C, F]) {
    screens.push({ name: 'w-' + p.replace(/\.html.*/, '') + (p.includes('fresh') ? '-fresh' : p.includes('solo') ? '-solo' : '') + suf, page: p, mode: 'web', w, h });
  }
}
screens.push({ name: 'w-index-l', page: 'index.html', mode: 'web', theme: 'light' }, { name: 'w-index-m-l', page: 'index.html', mode: 'web', w: 390, h: 844, theme: 'light' });

const EXE = process.env.CHROME_PATH || undefined;
const browser = await chromium.launch(EXE ? { executablePath: EXE } : {});

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
let total = 0;
for (const s of screens) {
  const app = (s.mode || 'app') === 'app';
  const ctx = await browser.newContext(app
    ? { viewport: { width: 393, height: 852 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148' }
    : { viewport: { width: s.w || 1440, height: s.h || 900 }, deviceScaleFactor: 1, isMobile: (s.w || 1440) < 600, hasTouch: (s.w || 1440) < 600 });
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
  } catch (e) { console.log('FAILED', s.name, String(e).slice(0, 200)); }
  await ctx.close();
}
fs.writeFileSync(outDir + '/issues.json', JSON.stringify(all, null, 1));
console.log('\n' + screens.length + ' screens, ' + total + ' findings. Details: ' + outDir + '/issues.json');
await browser.close();
