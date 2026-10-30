// -> import.png: site-img/home/import-* (mkimg.py import). The sample is nina-history.csv, beside this file.
// The history import's preview on the desk (1440x900, light, 2x): Nina's old log pasted in, before anything is saved.
import { readFileSync, writeFileSync } from 'node:fs';
import { launch, deskCtx, patchDemo, BASE, CAP as OUT, HERE } from './lib.mjs';
const csv = readFileSync(HERE + 'nina-history.csv', 'utf8');
const b = await launch();
const ctx = await deskCtx(b, { theme: 'light', dpr: 2 }); await patchDemo(ctx);
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message.slice(0, 160)));
await p.goto(BASE + 'coach.html?demo=1', { waitUntil: 'load' }); await p.evaluate(() => document.fonts.ready); await p.waitForTimeout(2000);
// The paste-and-preview sheet itself (SwitchKit.historySheet; openHistoryImport may open the import intake first).
await p.evaluate(() => { const a = Store.get().athletes.find((x) => x.name === 'Nina Petrova'); if (window.SwitchKit && SwitchKit.historySheet) SwitchKit.historySheet(a.id); else openHistoryImport(a.id); });
await p.waitForTimeout(1200);
await p.evaluate((csv) => { const ta = document.querySelector('textarea.imp-text'); ta.value = csv; ta.dispatchEvent(new Event('input', { bubbles: true })); }, csv);
await p.waitForTimeout(1600); await p.mouse.move(5, 890);
await p.screenshot({ path: OUT + 'import.png' });
const info = await p.evaluate(() => {
  const r = (e) => { if (!e) return null; const b = e.getBoundingClientRect(); return [b.x, b.y, b.width, b.height].map((v) => Math.round(v * 10) / 10); };
  const sh = document.querySelector('.ui-sheet, [role=dialog]');
  const sum = document.querySelector('.imp-sum, [class*="imp-sum"], .sk-sum, [class*="preview"]');
  return { sheet: r(sh), sum: sum && { cls: sum.className, rect: r(sum) }, text: sh ? sh.innerText.slice(0, 1600) : document.body.innerText.slice(0, 800),
    parts: [...(sh ? sh.querySelectorAll('*') : [])].filter((e) => e.children.length && e.innerText && /read|skipped|PR|sets|Import/i.test(e.innerText) && e.innerText.length < 300).slice(0, 30).map((e) => ({ cls: e.className, rect: r(e), t: e.innerText.replace(/\s+/g, ' ').slice(0, 90) })) };
});
writeFileSync(OUT + 'import.json', JSON.stringify({ info, errs }, null, 1));
console.log('sheet', info.sheet, 'sum', JSON.stringify(info.sum)); console.log(info.text);
info.parts.forEach((x) => console.log('  ', x.cls.slice(0, 30), x.rect.join(','), x.t));
console.log(errs.join(' | ') || 'clean');
await b.close(); process.exit(0);
