// -> cl-before.png: site-img/home/clients-*, clients-ph-* (mkimg.py clients).
// Clients on the desk (1440x900, light, 2x): before and after Sam marks Tomas's payment as paid.
import { writeFileSync } from 'node:fs';
import { launch, deskCtx, patchDemo, BASE, CAP as OUT } from './lib.mjs';
const b = await launch();
const ctx = await deskCtx(b, { theme: 'light', dpr: 2 }); await patchDemo(ctx);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'coach.html?demo=1', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2000);
await p.evaluate(() => { const it = [...document.querySelectorAll('.dk-item')]; const b = it.find((x) => /^Clients/.test(x.innerText)); if (b) b.click(); });
await p.waitForTimeout(1600); await p.mouse.move(1430, 890); await p.waitForTimeout(300);
const txt = () => p.evaluate(() => (document.querySelector('main, .dk-main') || document.body).innerText.slice(0, 700).replace(/\n+/g, ' | '));
await p.screenshot({ path: OUT + 'cl-before.png' });
const t0 = await txt();
const markRect = await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /^Mark paid$/.test(x.innerText.trim())); const r = x.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /^Mark paid$/.test(x.innerText.trim())); x.click(); });
await p.waitForTimeout(1000);
const sheet = await p.evaluate(() => [...document.querySelectorAll('button')].filter((x) => x.offsetParent).map((x) => x.innerText.trim()).filter((t) => /paid|Save|Record|Confirm|Done/i.test(t)));
console.log('after click buttons', JSON.stringify(sheet));
await p.screenshot({ path: OUT + 'cl-sheet.png' });
await p.evaluate(() => { const x = [...document.querySelectorAll('button')].find((x) => x.offsetParent && /^Save payment$/.test(x.innerText.trim())); if (x) x.click(); });
await p.waitForTimeout(4600); await p.mouse.move(1430, 890); await p.waitForTimeout(300);
await p.screenshot({ path: OUT + 'cl-after.png' });
const t1 = await txt();
console.log('markRect', markRect); console.log('BEFORE', t0); console.log('AFTER', t1);
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
