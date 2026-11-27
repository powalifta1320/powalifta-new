// The solo lifter's templates, when the save to their account fails (lifter-program.js tplWrite / tplRetry), in a real
// browser on the solo demo. The demo sends nothing, so the test turns the demo flag off around each call and puts
// stand-ins in place of DB.addTemplate / updateTemplate / deleteTemplate that fail or pass on demand; Supabase is refused
// as well. It checks what the lifter is told (toast), what is kept to try again, and what is sent when it goes again.
// Needs a server on the repo root and playwright-core with a Chromium, like test/preview-import.browser.mjs:
//   python3 -m http.server 4320 --bind 127.0.0.1 &
//   CHROME_PATH=… node test/lifter-templates.browser.mjs
let chromium;
try { ({ chromium } = await import('playwright-core')); }
catch (e) { console.log('lifter-templates: playwright-core not installed. npm i -g playwright-core && npx playwright install chromium'); process.exit(0); }
const BASE = (process.env.BASE || 'http://127.0.0.1:4320').replace(/\/$/, '');
const b = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {});
const ctx = await b.newContext({ viewport: { width: 1440, height: 775 }, serviceWorkers: 'block', colorScheme: 'dark' });
await ctx.route(/supabase\.co|plausible\.io/, (r) => r.abort('blockedbyclient'));
await ctx.addInitScript(() => { try { localStorage.setItem('powa-demo-tour-seen-solo', '1'); localStorage.setItem('powa-demo-tour-seen-lifter', '1'); } catch (e) { /* none */ } });
const p = await ctx.newPage(); const errs = [];
p.on('pageerror', (e) => errs.push(e.message.slice(0, 300)));
let pass = 0, fail = 0;
const ok = (name, cond, extra) => { if (cond) pass++; else fail++; console.log((cond ? 'ok   ' : 'FAIL ') + name + (extra != null && extra !== '' ? '  (' + extra + ')' : '')); };

await p.goto(BASE + '/athlete.html?demo=1&solo=1', { waitUntil: 'load' });
await p.waitForSelector('#tab-program', { state: 'attached' });
await p.waitForTimeout(1200);
// (the folded sidebar shows only the left of each row: the tab is pressed through the page, not at the row's centre)
await p.evaluate(() => document.getElementById('tab-program').click());
await p.waitForFunction(() => window.LifterProgram && LifterProgram._state && LifterProgram._state.frame, null, { timeout: 15000 });
await p.waitForTimeout(3500);

const R = await p.evaluate(async () => {
  const LP = window.LifterProgram, S = LP._state, out = {};
  const calls = [], says = [];
  const realToast = window.toast; window.toast = (m) => { says.push(String(m)); };
  const real = { add: DB.addTemplate, upd: DB.updateTemplate, del: DB.deleteTemplate };
  let failing = true;
  const answer = () => (failing ? Promise.reject(new Error('offline (the test)')) : Promise.resolve());
  DB.addTemplate = (t) => { calls.push('add:' + t.name); return answer(); };
  DB.updateTemplate = (id, patch) => { calls.push('update:' + patch.name); return answer(); };
  DB.deleteTemplate = () => { calls.push('delete'); return answer(); };
  const settle = async () => { for (let i = 0; i < 6; i++) { await Promise.all(Object.values(S.tplQ || {})); await new Promise((r) => setTimeout(r, 10)); } };
  const mine = () => (Store.get().programTemplates || []).filter((t) => t.payload && t.payload.solo).map((t) => t.name);
  const snap = () => ({ calls: calls.splice(0), says: says.splice(0), pend: Object.values(S.tplPend || {}), fresh: Object.keys(S.tplNew || {}).length, mine: mine() });
  const B = { weeks: [{ n: 1 }] }, list = (...names) => JSON.stringify(names.map((n) => ({ kitId: n[0], name: n[1], block: B })));
  const before = mine().length;
  // the demo sends nothing at all
  LP.templates(list(['d1', 'Demo only'])); await settle(); out.demo = snap(); LP.templates('[]'); await settle(); snap();
  window._demoMode = false;
  try {
    failing = true; LP.templates(list(['k1', 'My block'])); await settle(); out.addFails = snap();
    failing = false; window.dispatchEvent(new Event('online')); await settle(); out.online = snap();
    LP.templates(list(['k1', 'My block 2'])); await settle(); out.rename = snap();
    failing = true; S.tplToldAt = 0; LP.templates(list(['k1', 'My block 3'])); await settle(); out.renameFails = snap();
    failing = false; LP.templates(list(['k1', 'My block 4'])); await settle(); out.nextChange = snap();
    failing = true; S.tplToldAt = 0; LP.templates('[]'); await settle(); out.deleteFails = snap();
    failing = false; LP.mount(); await settle(); out.reopen = snap();
    failing = true; S.tplToldAt = 0; LP.templates(list(['k2', 'Gone again'])); await settle(); out.offAdd = snap();
    LP.templates('[]'); await settle(); out.offRemove = snap();
    failing = false; window.dispatchEvent(new Event('online')); await settle(); out.onlineAfter = snap();
    LP.templates(list(['k3', 'A'])); LP.templates(list(['k3', 'B'])); LP.templates(list(['k3', 'C'])); await settle(); out.quick = snap();
    // two fail together: said once
    failing = true; S.tplToldAt = 0; LP.templates(list(['k3', 'C2'], ['k4', 'D'])); await settle(); out.burst = snap();
    failing = false; LP.templates('[]'); await settle(); out.end = snap();
  } finally {
    window._demoMode = true; DB.addTemplate = real.add; DB.updateTemplate = real.upd; DB.deleteTemplate = real.del; window.toast = realToast;
  }
  out.leftOver = mine().length - before;
  return out;
});

const j = (x) => JSON.stringify(x);
ok('the demo sends nothing and says nothing', R.demo.calls.length === 0 && R.demo.says.length === 0, j(R.demo));
ok('a save that fails: the lifter is told, the template stays, the write is kept', R.addFails.calls.join() === 'add:My block' && /Could not save the template to your account/.test(R.addFails.says[0] || '') && R.addFails.pend.join() === 'save' && R.addFails.mine.join() === 'My block', j(R.addFails));
ok('back online: it is sent again, as an insert, and the lifter is told it landed', R.online.calls.join() === 'add:My block' && R.online.says.join() === 'Template saved to your account.' && R.online.pend.length === 0 && R.online.fresh === 0, j(R.online));
ok('a rename after that is an update, with no word', R.rename.calls.join() === 'update:My block 2' && R.rename.says.length === 0, j(R.rename));
ok('a rename that fails is told and kept', R.renameFails.pend.join() === 'save' && R.renameFails.says.length === 1, j(R.renameFails));
ok('the next change sends the latest once, and says it landed', R.nextChange.calls.join() === 'update:My block 4' && R.nextChange.says.join() === 'Template saved to your account.' && R.nextChange.pend.length === 0, j(R.nextChange));
ok('a removal that fails: told, kept', R.deleteFails.calls.join() === 'delete' && /Could not remove the template from your account/.test(R.deleteFails.says[0] || '') && R.deleteFails.pend.join() === 'delete', j(R.deleteFails));
ok('opening the builder again sends the removal', R.reopen.calls.join() === 'delete' && R.reopen.says.join() === 'Template removed from your account.' && R.reopen.pend.length === 0, j(R.reopen));
ok('made and removed while offline: nothing is sent for the removal, nothing stays waiting, no false "saved"', R.offAdd.pend.join() === 'save' && R.offRemove.calls.length === 0 && R.offRemove.says.length === 0 && R.offRemove.pend.length === 0 && R.offRemove.fresh === 0 && R.onlineAfter.calls.length === 0, j([R.offAdd, R.offRemove, R.onlineAfter]));
ok('three quick changes to a new template: one insert, of the last one', R.quick.calls.join() === 'add:C', j(R.quick));
ok('two failing together are said once', R.burst.says.length === 1 && R.burst.pend.length === 2, j(R.burst));
ok('all of it clears once the writes pass', R.end.pend.length === 0 && R.end.fresh === 0 && R.leftOver === 0, j([R.end, R.leftOver]));

console.log('\n' + pass + ' passed, ' + fail + ' failed');
console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no script errors');
await b.close();
process.exit(fail || errs.length ? 1 : 0);
