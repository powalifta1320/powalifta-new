// The homepage's pictures are the real app, captured from this repo's own demos (test/site-capture/*.mjs), then cut
// and compressed into site-img/home/ (mkimg.py). Shared helpers: the headless browser, the iPhone app layout
// (html.native through a Capacitor shim, safe areas), the laptop desk, the fixed day and the one aligned demo story.
//   BASE        the repo served over http (default http://127.0.0.1:4191/, as test/uiscan.mjs)
//   CAP         where the raw captures go (default <repo>/scratchpad-shots/site-capture/, gitignored)
//   CHROME_PATH a Chromium for playwright-core (optional)
// Nothing reaches the live services: Supabase and Plausible are refused in every context.
import fs from 'node:fs';
import path from 'node:path';
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch (e) { console.log('site-capture: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(0); }
export { chromium };
export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
export const BASE = (process.env.BASE || 'http://127.0.0.1:4191/').replace(/\/?$/, '/');
export const CAP = (process.env.CAP || path.join(ROOT, 'scratchpad-shots/site-capture')).replace(/\/?$/, '/');
fs.mkdirSync(CAP, { recursive: true });
export const HERE = path.dirname(new URL(import.meta.url).pathname) + '/';
export const COACH = 'Sam Ellis';
const LIVE = /^(https?|wss?):\/\/([^/?#]*\.)?(supabase\.co|plausible\.io)([:/?#]|$)/i;
export async function launch(args = []) { return chromium.launch(Object.assign(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}, { args })); }
async function guard(ctx) { await ctx.route(LIVE, (r) => r.abort('blockedbyclient')); }
// The lifter app in the iPhone app layout (dark by default), 393 x 852 at 3x, the day fixed (Wed 28 Oct 2026, 10:30 UTC).
export async function phoneCtx(browser, { theme = 'dark', dpr = 3, w = 393, h = 852 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, isMobile: true, hasTouch: true, colorScheme: theme, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1' });
  await guard(ctx);
  await ctx.addInitScript((t) => { try {
    localStorage.setItem('powa-consent', 'essential'); localStorage.setItem('powa-tour-athlete-done', '1'); localStorage.setItem('powa-tour-coach-done', '1');
    localStorage.setItem('powa-install-dismissed', String(Date.now())); localStorage.setItem('powa-intake-snooze', String(Date.now()));
    localStorage.setItem('powa-theme', t); localStorage.setItem('powa-push-off', '1'); localStorage.setItem('powa-notify-snooze', String(Date.now())); localStorage.setItem('powa-notify-snoozes', '2');
  } catch (e) {} }, theme);
  await ctx.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true, getPlatform: () => 'ios', Plugins: {}, isPluginAvailable: () => false }; });
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.demo-banner,.pn-host{display:none!important}'; document.head.appendChild(s); }); });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:30:00Z'));
  return ctx;
}
export async function safeAreas(ctx, page) {
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: 59, topMax: 59, bottom: 34, bottomMax: 34, left: 0, leftMax: 0, right: 0, rightMax: 0 } }).catch(() => {});
  return cdp;
}
// The coach's desk on a laptop (light by default), 1440 x 900 at 2x, the same fixed day.
export async function deskCtx(browser, { theme = 'light', dpr = 2, w = 1440, h = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dpr, colorScheme: theme, serviceWorkers: 'block' });
  await guard(ctx);
  await ctx.addInitScript((t) => { try {
    localStorage.setItem('powa-consent', 'essential'); localStorage.setItem('powa-tour-coach-done', '1');
    localStorage.setItem('powa-theme', t); localStorage.setItem('powa-desk-theme', t);
    localStorage.setItem('powa-push-off', '1'); localStorage.setItem('powa-notify-snooze', String(Date.now())); localStorage.setItem('powa-notify-snoozes', '2');
  } catch (e) {} }, theme);
  await ctx.addInitScript(() => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = '.demo-banner,.dk-demo,.dk-livedemo,[class*="dk-demo"],.pn-host,.pn-slot{display:none!important} ::-webkit-scrollbar{display:none} *{scrollbar-width:none}'; document.head.appendChild(s); }); });
  await ctx.clock.setFixedTime(new Date('2026-10-28T10:30:00Z'));
  return ctx;
}
// One story on one page: the demo coach gets a believable name (the app's own demo calls him "Demo Coach"); Tom made
// weight for the 105 class (his last check-in reads 104.3, the meet board's weigh-in 103.8); no live sets land
// mid-capture; optionally the desk's twenty lifters on the phone too (the app seats them only on the laptop).
// Every patch is checked: a demo that changed under it stops the capture instead of quietly drawing something else.
export async function patchDemo(ctx, { twenty = false } = {}) {
  await ctx.route(/\/app\.js(\?.*)?$/, async (route) => {
    const r = await route.fetch(); let body = await r.text();
    const swap = (a, b) => { if (body.indexOf(a) < 0) throw new Error('site-capture: the demo changed, not found in app.js: ' + a); body = body.split(a).join(b); };
    swap("'Demo Coach'", "'" + COACH + "'");
    swap("{ a: 'demo-a3', kg: 105.3 }", "{ a: 'demo-a3', kg: 104.3 }");
    swap('function liveDemoStart() {', 'function liveDemoStart() { return;');
    if (twenty) swap("if (document.documentElement.classList.contains('desk') && typeof deskSeedDemo === 'function') {", "if (typeof deskSeedDemo === 'function') {");
    await route.fulfill({ response: r, body, headers: { ...r.headers(), 'content-type': 'text/javascript' } });
  });
}
// Arjun's top set today: 182.5 kg x 5 at RPE 8, as his coach wrote it (the desk's demo lifter, demo-clog-46).
export async function arjunTopSet(page) {
  await page.evaluate(() => { Store.update((s) => { const l = s.workoutLogs.find((x) => x.id === 'demo-clog-46'); l.weight = 182.5; l.reps = 5; l.rpe = 8; l.e1rm = calcE1RM(182.5, 5, 8); l.e1rmComp = calcCompE1RM(182.5, 5, 8, 'squat', 'Competition'); }); });
}
// The page keeps one crimson action per screen: a desk's own red button is drawn as its quiet neighbour is.
export function mute(page, redRe, quietRe) {
  return page.evaluate(({ r, q }) => {
    const red = [...document.querySelectorAll('button, a')].find((x) => x.offsetParent && new RegExp(r).test(x.textContent));
    const quiet = [...document.querySelectorAll('button, a')].find((x) => x.offsetParent && new RegExp(q).test(x.textContent.trim()));
    if (red && quiet) { const c = getComputedStyle(quiet); ['background', 'background-color', 'background-image', 'color', 'box-shadow', 'border', 'font-weight'].forEach((k) => red.style.setProperty(k, c.getPropertyValue(k), 'important')); return true; }
    return false;
  }, { r: redRe, q: quietRe });
}
// The coach's note on Arjun's Train screen, the one the thread and the desk quote.
export const NOTE = 'Top set today is 182.5 for 5 at 8. Film it and send it over, I want eyes on your brace out of the hole.';
