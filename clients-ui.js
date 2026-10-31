// clients-ui.js: Clients + payments, the screens (2026-10-27).
// The coach's own record of the money they take elsewhere (bank, card, PayPal, cash). Nothing is paid
// in the app and the lifter's app shows none of it (coach-only: Apple 3.1.1). The maths is clients.js
// (window.Clients), the data db.js (client_billing / client_payments / intake); this file draws:
//   ClientsUI.render(host)                 the Clients screen: the laptop's rail destination, You › Clients on the phone
//   ClientsUI.sectionHtml(aid, o)          a lifter's Client + About blocks (coach-lifters.js summaryHtml)
//   ClientsUI.openClient(aid)              one client: what's due, payments, the package, contact
//   ClientsUI.markPaid / editPackage / remind (aid)
//   ClientsUI.todayBit() / dueLineHtml()   "2 payments overdue" on Today and the phone's Lifters tab
// Clicks go through one listener on [data-cs] inside a .cs-zone, so the hosts' own handlers never fire.
(function () {
  'use strict';

  var IC = {
    wallet: '<path d="M19 7V5.5A1.5 1.5 0 0 0 17.5 4h-12A2.5 2.5 0 0 0 3 6.5v11A2.5 2.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/><path d="M3 6.5A2.5 2.5 0 0 0 5.5 9h13A1.5 1.5 0 0 1 20 10.5V15h-4a2 2 0 0 1 0-4h4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 20c1.5-3.5 4.5-5 8-5s6.5 1.5 8 5"/>',
    alert: '<path d="M12 8v5"/><path d="M12 16.5h.01"/><circle cx="12" cy="12" r="9"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    cash: '<rect x="3" y="6" width="18" height="12" rx="2.5"/><circle cx="12" cy="12" r="2.5"/><path d="M7 9.5v.01M17 14.5v.01"/>',
    repeat: '<path d="M17 2l3 3-3 3"/><path d="M4 11V9a4 4 0 0 1 4-4h12"/><path d="M7 22l-3-3 3-3"/><path d="M20 13v2a4 4 0 0 1-4 4H4"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    down: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>'
  };
  function ic(k, w) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (IC[k] || IC.chev) + '</svg>'; }
  function esc(s) { return typeof escHtml === 'function' ? escHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function first(n) { return String(n || '').trim().split(' ')[0] || 'them'; }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function isDeskNow() { return typeof isDesk === 'function' && isDesk(); }
  function C() { return window.Clients; }
  function me() { try { if (typeof user !== 'undefined' && user && user.id) return user.id; } catch (e) {} return (window._user && window._user.id) || null; }
  function today() { return typeof todayISO === 'function' ? todayISO() : new Date().toISOString().slice(0, 10); }
  function st() { return (window.Store && Store.get()) || {}; }
  function roster() { return (st().athletes || []).filter(function (a) { return a && a.id; }); }
  function athleteOf(aid) { return roster().find(function (a) { return a.id === aid; }) || { id: aid, name: 'Lifter' }; }
  function billingOf(aid) { var m = me(); return (st().clientBilling || []).find(function (b) { return b.athleteId === aid && (!m || !b.coachId || b.coachId === m); }) || null; }
  function paymentsOf(aid) { return (st().clientPayments || []).filter(function (p) { return p.athleteId === aid; }).sort(function (a, b) { return String(b.paidOn).localeCompare(String(a.paidOn)) || String(b.createdAt || '').localeCompare(String(a.createdAt || '')); }); }
  function intakeOf(aid) { return (st().intakes || []).find(function (i) { return i.athleteId === aid; }) || null; }
  function statusOf(aid) { return C().clientStatus(billingOf(aid), today()); }
  function money(c, cur) { return C().formatMoney(c, cur); }
  function summary() { return C().clientsSummary(st().clientBilling || [], st().clientPayments || [], today(), roster().map(function (a) { return a.id; })); }
  function dateShort(iso) {
    if (!iso) return '';
    var d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) return '';
    var o = { day: 'numeric', month: 'short' };
    if (String(iso).slice(0, 4) !== today().slice(0, 4)) o.year = 'numeric';
    return d.toLocaleDateString(undefined, o);   // the device's format, like the rest of the app (fmtDateShort)
  }
  function monthYear(iso) { var d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d) ? '' : d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' }); }
  // The calendar day of a moment on this device (a timestamp's UTC date read "yesterday" for a coach east of UTC on a
  // morning application: night C review m9); a date-only string is already a day.
  function localDay(iso) {
    var s = String(iso || '');
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    var t = new Date(s);
    if (isNaN(t)) return s.slice(0, 10);
    return t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
  }
  function daysSince(iso) { return Math.round((Date.parse(today() + 'T12:00:00') - Date.parse(localDay(iso) + 'T12:00:00')) / 86400000); }
  function ago(iso) {
    var d = daysSince(iso);
    return isNaN(d) ? '' : d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? d + ' days ago' : dateShort(localDay(iso));
  }
  // How long someone has waited, in a word ("today", "yesterday", "3 days", "12 Oct").
  function waited(iso) {
    var d = daysSince(iso);
    return isNaN(d) ? '' : d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? d + ' days' : dateShort(localDay(iso));
  }
  function av(a, cls) {
    var name = a.name || '?';
    if (a.avatarUrl) return '<span class="ui-av ' + (cls || '') + '"><img src="' + esc(a.avatarUrl) + '" alt=""></span>';
    var hue = typeof avatarHue === 'function' ? avatarHue(name) : 0, ini = typeof initials === 'function' ? initials(name) : name.slice(0, 2).toUpperCase();
    return '<span class="ui-av av-h' + hue + ' ' + (cls || '') + '" data-name="' + esc(name) + '">' + esc(ini) + '</span>';
  }
  var METHOD = { bank: 'Bank', card: 'Card', paypal: 'PayPal', cash: 'Cash', other: 'Other' };
  var TONE = { overdue: 'pain', due: 'warn', soon: 'warn' };

  // ===================================================================== saving
  // Demo: the Store only (write-safe). Real accounts: the Store first, then the database; db.js keeps
  // rows on the device until the tables exist and says so.
  function afterChange() {
    var area = document.getElementById('clientsArea');
    if (area && area.offsetParent !== null) render(area);
    document.querySelectorAll('.cs-zone[data-cs-aid]').forEach(function (z) {
      var aid = z.getAttribute('data-cs-aid'), o = { phone: z.classList.contains('is-phone') };
      var tmp = document.createElement('div');
      tmp.innerHTML = sectionHtml(aid, o);
      if (tmp.firstElementChild) z.replaceWith(tmp.firstElementChild);
    });
    paintBits();
    if (typeof dkPaintRail === 'function') { try { dkPaintRail(); } catch (e) {} }
  }
  function saveBilling(aid, changes) {
    var m = me(), prev = billingOf(aid);
    var row = Object.assign({}, prev || { package: 'Online coaching', amountCents: 0, currency: defaultCurrency(), cadence: 'monthly', status: 'active' }, changes, { coachId: m, athleteId: aid });
    Store.update(function (s) {
      s.clientBilling = (s.clientBilling || []).filter(function (b) { return b.athleteId !== aid; });
      s.clientBilling.push(Object.assign({ id: (prev && prev.id) || 'local-cb-' + Date.now(), createdAt: new Date().toISOString() }, row));
    });
    afterChange();
    if (window._demoMode || !window.DB || !DB.upsertClientBilling) return Promise.resolve(true);
    var send = Object.assign({ coachId: m, athleteId: aid }, prev ? changes : row);
    return DB.upsertClientBilling(send).then(function (res) {
      if (!res || !res.ok) { toast('Couldn’t save that. Check your connection.'); return false; }
      if (res.billing) Store.update(function (s) { s.clientBilling = (s.clientBilling || []).filter(function (b) { return b.athleteId !== aid; }).concat([res.billing]); });
      if (res.local) toast('Saved on this device until a quick database update runs');
      afterChange();
      return true;
    }).catch(function () { toast('Couldn’t save that. Check your connection.'); return false; });
  }
  function addPayment(aid, p) {
    var b = billingOf(aid), tmp = 'tmp-' + Date.now();
    var pay = Object.assign({ id: tmp, coachId: me(), athleteId: aid, createdAt: new Date().toISOString() }, p);
    Store.update(function (s) { s.clientPayments = [pay].concat(s.clientPayments || []); });
    var nb = b ? C().recordPayment(b, pay) : null;
    var moved = nb ? { nextDue: nb.nextDue, dueDay: nb.dueDay } : null;
    if (moved) saveBilling(aid, moved);
    else afterChange();
    if (window._demoMode || !window.DB || !DB.addClientPayment) return Promise.resolve(nb);
    return DB.addClientPayment(pay).then(function (res) {
      if (!res || !res.ok) {
        Store.update(function (s) { s.clientPayments = (s.clientPayments || []).filter(function (x) { return x.id !== tmp; }); });
        toast((res && res.error && res.error.message) || 'Couldn’t save the payment. Check your connection.');
        afterChange();
        return null;
      }
      Store.update(function (s) { s.clientPayments = (s.clientPayments || []).map(function (x) { return x.id === tmp ? res.payment : x; }); });
      afterChange();
      return nb;
    });
  }
  function deletePayment(pay, then) {
    uiActionSheet('Delete this payment?', [{ label: 'Delete ' + money(pay.amountCents, pay.currency) + ' · ' + dateShort(pay.paidOn), danger: true, onClick: function () {
      Store.update(function (s) { s.clientPayments = (s.clientPayments || []).filter(function (x) { return x.id !== pay.id; }); });
      afterChange();
      if (then) then();
      if (!window._demoMode && window.DB && DB.deleteClientPayment && !/^tmp-/.test(String(pay.id))) {
        DB.deleteClientPayment(pay).then(function (res) { if (!res || !res.ok) toast('Couldn’t delete it on the server. Check your connection.'); });
      }
    } }]);
  }
  // A coach's money is in their own currency: what they used last, else their locale's.
  function defaultCurrency() {
    var used = (st().clientBilling || []).map(function (b) { return b.currency; }).filter(Boolean);
    if (used.length) return used[used.length - 1];
    var loc = String((navigator.languages && navigator.languages[0]) || navigator.language || 'en-US');
    var reg = (loc.split('-')[1] || '').toUpperCase();
    var map = { GB: 'GBP', US: 'USD', AU: 'AUD', CA: 'CAD', NZ: 'NZD', IN: 'INR', IE: 'EUR', DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', BE: 'EUR', AT: 'EUR', PT: 'EUR', FI: 'EUR', SE: 'SEK', NO: 'NOK', DK: 'DKK', CH: 'CHF', ZA: 'ZAR', SG: 'SGD', AE: 'AED', JP: 'JPY', BR: 'BRL', MX: 'MXN', PL: 'PLN' };
    return map[reg] || 'USD';
  }
  var CURRENCIES = ['USD', 'GBP', 'EUR', 'AUD', 'CAD', 'NZD', 'INR', 'SGD', 'AED', 'ZAR', 'SEK', 'NOK', 'DKK', 'CHF', 'PLN', 'BRL', 'MXN', 'JPY'];

  // ===================================================================== actions
  function remindText(aid) {
    var a = athleteOf(aid), b = billingOf(aid), s = C().clientStatus(b, today());
    var amt = b ? money(b.amountCents, b.currency) : '';
    var hi = 'Hi ' + first(a.name) + ', ';
    if (s.state === 'overdue') return hi + 'a quick reminder that your coaching payment' + (amt ? ' (' + amt + ')' : '') + ' was due on ' + dateShort(s.due) + '. Thanks!';
    if (s.state === 'due') return hi + 'a quick reminder that your coaching payment' + (amt ? ' (' + amt + ')' : '') + ' is due today. Thanks!';
    return hi + 'a heads-up that your next coaching payment' + (amt ? ' (' + amt + ')' : '') + (s.due ? ' is due on ' + dateShort(s.due) : ' is coming up') + '. Thanks!';
  }
  // The coach's own message, in their words to edit: the desk's composer, or the phone's thread.
  function remind(aid) {
    var a = athleteOf(aid), text = remindText(aid);
    if (isDeskNow() && typeof dkCompose === 'function') { dkCompose([aid], { title: 'Remind ' + first(a.name), text: text }); return; }
    if (typeof openAthleteMessages !== 'function') return;
    openAthleteMessages(aid, a.name);
    var tries = 0, t = setInterval(function () {
      var ta = document.querySelector('#messageThreadHost textarea');
      if (ta || ++tries > 30) {
        clearInterval(t);
        if (ta && !ta.value) { ta.value = text; ta.dispatchEvent(new Event('input', { bubbles: true })); }
      }
    }, 100);
  }
  function openLifter(aid) {
    if (!window.CoachLifters) return;
    if (isDeskNow()) { if (typeof deskGo === 'function') deskGo('roster'); setTimeout(function () { try { CoachLifters.select(aid); } catch (e) {} }, 60); return; }
    try { CoachLifters.open(aid); } catch (e) {}
  }
  function goClients() {
    if (isDeskNow() && typeof deskGo === 'function') { deskGo('clients'); return; }
    var t = document.getElementById('tab-clients');
    if (t) t.click();
  }
  // A row of chip buttons (one choice). opts: [[value, label]], on(value)
  function chips(opts, val, on, cls) {
    var row = el('div', { class: 'cs-chips' + (cls ? ' ' + cls : ''), role: 'radiogroup' });
    var paint = function (v) { [].forEach.call(row.children, function (b) { var o = b.dataset.v === v; b.classList.toggle('on', o); b.setAttribute('aria-checked', o ? 'true' : 'false'); }); };
    opts.forEach(function (o) {
      var b = el('button', { type: 'button', role: 'radio', 'data-v': o[0] }, o[1]);
      b.addEventListener('click', function () { paint(o[0]); on(o[0]); });
      row.appendChild(b);
    });
    paint(val);
    row._set = paint;
    return row;
  }
  function field(label, input, hint) {
    var w = el('label', { class: 'cs-field' });
    w.appendChild(el('span', { class: 'cs-fl' }, label));
    w.appendChild(input);
    if (hint) w.appendChild(el('span', { class: 'cs-fh' }, hint));
    return w;
  }
  function centsFrom(v) { var n = parseFloat(String(v || '').replace(/[^\d.,]/g, '').replace(',', '.')); return isFinite(n) && n > 0 ? Math.round(n * 100) : 0; }
  function amountText(c) { var n = (Number(c) || 0) / 100; return n ? (n % 1 ? n.toFixed(2) : String(n)) : ''; }

  // Set up or change a package.
  function editPackage(aid, done) {
    var a = athleteOf(aid), b = billingOf(aid);
    var v = Object.assign({ package: 'Online coaching', amountCents: 0, currency: defaultCurrency(), cadence: 'monthly', nextDue: today(), startedOn: (a.joinedAt || a.createdAt || today()).slice(0, 10), status: 'active', phone: '' }, b || {});
    uiSheet(b ? 'Package for ' + first(a.name) : 'Add a package for ' + first(a.name), function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'What ' + first(a.name) + ' pays you and when. POWALIFTA keeps the dates and nudges you; ' + first(a.name) + ' never sees any of it.'));
      var PRESETS = ['Online coaching', 'Meet prep', 'Hybrid', 'In person'];
      var custom = el('input', { type: 'text', class: 'cs-in', maxlength: '80', placeholder: 'Package name', 'aria-label': 'Package name', value: PRESETS.indexOf(v.package) < 0 ? v.package : '' });
      custom.hidden = PRESETS.indexOf(v.package) >= 0;
      var pk = chips(PRESETS.map(function (p) { return [p, p]; }).concat([['custom', 'Other']]), PRESETS.indexOf(v.package) >= 0 ? v.package : 'custom', function (x) {
        if (x === 'custom') { custom.hidden = false; custom.focus(); v.package = custom.value.trim() || 'Coaching'; }
        else { custom.hidden = true; v.package = x; }
      });
      custom.addEventListener('input', function () { v.package = custom.value.trim() || 'Coaching'; });
      sheet.appendChild(field('Package', el('div', {}, pk, custom)));
      var amt = el('input', { type: 'text', inputmode: 'decimal', class: 'cs-in cs-amt', placeholder: '150', 'aria-label': 'Price', value: amountText(v.amountCents) });
      var cur = el('select', { class: 'cs-in cs-cur', 'aria-label': 'Currency' });
      (CURRENCIES.indexOf(v.currency) < 0 ? [v.currency].concat(CURRENCIES) : CURRENCIES).forEach(function (c) { var o = el('option', { value: c }, c); if (c === v.currency) o.selected = true; cur.appendChild(o); });
      sheet.appendChild(field('Price', el('div', { class: 'cs-amtrow' }, amt, cur)));
      var EVERY = [['monthly', 'Month'], ['4-weekly', '4 weeks'], ['fortnightly', '2 weeks'], ['weekly', 'Week'], ['quarterly', 'Quarter'], ['yearly', 'Year'], ['one-off', 'Once']];
      sheet.appendChild(field('Every', chips(EVERY, v.cadence, function (x) { v.cadence = x; })));
      var due = el('input', { type: 'date', class: 'cs-in', 'aria-label': 'Next payment', value: v.nextDue || '' });
      var started = el('input', { type: 'date', class: 'cs-in', 'aria-label': 'Coaching since', value: v.startedOn || '' });
      sheet.appendChild(el('div', { class: 'cs-two' }, field('Next payment', due), field('Coaching since', started)));
      var phone = el('input', { type: 'tel', class: 'cs-in', maxlength: '40', placeholder: 'Optional', 'aria-label': 'Phone', value: v.phone || '' });
      sheet.appendChild(field('Phone', phone, 'Only you see it.'));
      var stat = null;
      if (b) { stat = chips([['active', 'Active'], ['paused', 'Paused'], ['ended', 'Ended']], v.status, function (x) { v.status = x; }, 'is-seg'); sheet.appendChild(field('Status', stat)); }
      var save = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, b ? 'Save' : 'Add package');
      save.addEventListener('click', function () {
        var cents = centsFrom(amt.value);
        if (!cents && v.cadence !== 'one-off') { amt.focus(); toast('Add the price first'); return; }
        var dd = due.value || null;
        var dueDay = dd && ['monthly', 'quarterly', 'yearly'].indexOf(v.cadence) >= 0 ? Number(dd.slice(8, 10)) : null;
        saveBilling(aid, { package: v.package || 'Online coaching', amountCents: cents, currency: cur.value, cadence: v.cadence, nextDue: dd, dueDay: dueDay, startedOn: started.value || null, status: v.status || 'active', phone: phone.value.trim() || null });
        close();
        toast(b ? 'Package saved' : 'Package added · next payment ' + (dd ? dateShort(dd) : 'not set'));
        if (done) done();
      });
      sheet.appendChild(save);
      if (!b) setTimeout(function () { try { amt.focus(); } catch (e) {} }, 350);
    }, { cls: 'cs-sheet' });
  }

  // Record a payment taken elsewhere: the amount, the day, how. The next due date moves one period on.
  function markPaid(aid, done) {
    var a = athleteOf(aid), b = billingOf(aid);
    if (!b) { editPackage(aid, done); return; }
    var s = C().clientStatus(b, today());
    var period = s.due ? new Date(s.due + 'T12:00:00').toLocaleDateString(undefined, { month: 'long' }) : '';
    uiSheet('Mark ' + first(a.name) + ' paid', function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, b.package + ' · ' + (isDeskNow() ? C().priceText(b) : perText(b)) + (s.due ? ' · ' + (s.state === 'overdue' ? 'was due ' : 'due ') + dateShort(s.due) : '')));
      var amt = el('input', { type: 'text', inputmode: 'decimal', class: 'cs-in cs-amt', 'aria-label': 'Amount', value: amountText(b.amountCents) });
      sheet.appendChild(field('Amount', el('div', { class: 'cs-amtrow' }, amt, el('span', { class: 'cs-cur-tag' }, b.currency || 'USD'))));
      var on = el('input', { type: 'date', class: 'cs-in', 'aria-label': 'Paid on', value: today() });
      var forIn = el('input', { type: 'text', class: 'cs-in', maxlength: '40', 'aria-label': 'For', placeholder: 'Optional', value: period });
      sheet.appendChild(el('div', { class: 'cs-two' }, field('Paid on', on), field('For', forIn)));
      var method = null;
      sheet.appendChild(field('How', chips([['bank', 'Bank'], ['card', 'Card'], ['paypal', 'PayPal'], ['cash', 'Cash'], ['other', 'Other']], lastMethod(aid), function (x) { method = x; })));
      method = lastMethod(aid);
      var note = el('input', { type: 'text', class: 'cs-in', maxlength: '200', 'aria-label': 'Note', placeholder: 'Optional' });
      sheet.appendChild(field('Note', note));
      var save = el('button', { class: 'btn btn-primary btn-lg btn-block', type: 'button' }, 'Save payment');
      save.addEventListener('click', function () {
        var cents = centsFrom(amt.value);
        if (!cents) { amt.focus(); toast('Add the amount'); return; }
        close();
        addPayment(aid, { amountCents: cents, currency: b.currency || 'USD', paidOn: on.value || today(), method: method || null, period: forIn.value.trim() || null, note: note.value.trim() || null }).then(function (nb) {
          var next = nb && nb.nextDue ? ' · next ' + dateShort(nb.nextDue) : '';
          toast(first(a.name) + ' paid ' + money(cents, b.currency) + next);
        });
        if (done) done();
      });
      sheet.appendChild(save);
    }, { cls: 'cs-sheet' });
  }
  function lastMethod(aid) { var p = paymentsOf(aid)[0]; return (p && p.method) || 'bank'; }

  // Off the roster, from the phone's own ask (coach.html openRemoveLifterSheet: the same server path and words as
  // the laptop's confirm). then(): once they're gone.
  function openRemove(aid, then) {
    var a = athleteOf(aid);
    if (typeof openRemoveLifterSheet === 'function') openRemoveLifterSheet(aid, a.name, { onDone: then });
    else if (typeof removeAthleteFromRoster === 'function') removeAthleteFromRoster(aid, a.name);
  }
  // The phone's client sheet: who, where their money stands (lit when it's owed) with the one red and the quiet
  // way out, then the payments, the package, how to reach them, their page, and leaving the roster last.
  function paintClientPhone(sheet, aid, close, paint) {
    var a = athleteOf(aid), b = billingOf(aid), s = C().clientStatus(b, today()), pays = paymentsOf(aid), ik = intakeOf(aid), f = first(a.name), w = stateWords(s);
    while (sheet.children.length > 1) sheet.removeChild(sheet.lastChild);   // keep the grip
    var head = el('div', { class: 'cs-shead' });
    head.innerHTML = av(a, 'cs-sface');
    var tx = el('div', { class: 'cs-shead-tx' });
    tx.appendChild(el('h3', { class: 'ui-sheet-h' }, a.name));
    // Who and since when. The package and its price are under Package and the money now is the card: each fact once.
    if (b && b.startedOn) tx.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Coaching since ' + monthYear(b.startedOn)));
    head.appendChild(tx);
    sheet.appendChild(head);
    var owed = s.state === 'overdue' || s.state === 'due' || s.state === 'soon';
    var card = el('div', { class: 'cs-scard' + (w.warn ? ' is-late' : '') });
    if (b) {
      // The second line: when it was due (late), when it's due (this week; today says it already), or else when
      // they last paid (paid up, paused, ended: a paused client's next date isn't a date anyone owes).
      var sub = s.state === 'overdue' ? 'Was due ' + dateShort(s.due) : s.state === 'soon' ? 'Due ' + dateShort(s.due) :
        s.state === 'due' ? '' : (pays[0] ? 'Last paid ' + dateShort(pays[0].paidOn) : '');
      card.innerHTML = '<span class="cs-sc-k">Payment</span><b class="cs-sc-v">' + (w.warn ? triHtml() : '') + '<span>' + esc(w.text) + '</span></b>' +
        (sub || owed ? '<span class="cs-sc-s">' + esc([sub, owed ? money(b.amountCents, b.currency) : ''].filter(Boolean).join(' \u00b7 ')) + '</span>' : '');
      // The red only while money is owed (that's the job); paid up, paused or ended, recording one is graphite.
      var mp = el('button', { class: 'ca-btn ' + (owed ? 'is-red' : 'is-soft'), type: 'button' }, 'Mark ' + f + ' paid');
      mp.addEventListener('click', function () { close(); markPaid(aid); });
      card.appendChild(mp);
      if (owed) {
        var rm = el('button', { class: 'cs-alt', type: 'button' }, 'Remind ' + f);
        rm.addEventListener('click', function () { close(); remind(aid); });
        card.appendChild(rm);
      }
    } else {
      card.innerHTML = '<b class="cs-sc-v"><span>No package yet</span></b><span class="cs-sc-s">Record what ' + esc(f) + ' pays you and when. You get the reminders; ' + esc(f) + ' never sees any of it.</span>';
      var ad = el('button', { class: 'ca-btn is-red', type: 'button' }, 'Add a package');
      ad.addEventListener('click', function () { close(); editPackage(aid); });
      card.appendChild(ad);
    }
    sheet.appendChild(card);
    if (pays.length) {
      sheet.appendChild(uiLabel('Payments', { count: pays.length }));
      sheet.appendChild(uiList(pays.slice(0, 12).map(function (p) {
        var del = el('button', { class: 'cs-del', type: 'button', 'aria-label': 'Delete the payment of ' + money(p.amountCents, p.currency) + ' on ' + dateShort(p.paidOn), html: ic('x', 2.2) });
        del.addEventListener('click', function (e) { e.stopPropagation(); deletePayment(p, paint); });
        return uiRow({ title: money(p.amountCents, p.currency), sub: [dateShort(p.paidOn), METHOD[p.method], p.period].filter(Boolean).join(' \u00b7 '), endNode: del });
      })));
    }
    if (b) {
      sheet.appendChild(uiLabel('Package', { action: { label: 'Edit', onClick: function () { close(); editPackage(aid); } } }));
      // What they pay, once: the next date is the card's, since when the header's, paused or ended the card's.
      sheet.appendChild(uiList([
        uiRow({ title: 'Package', end: b.package }),
        uiRow({ title: 'Price', end: perText(b) })
      ]));
    }
    var phone = (b && b.phone) || (ik && ik.answers && ik.answers.phone) || '';
    var ig = a.instagram || (ik && ik.answers && ik.answers.instagram) || '';
    var contact = [a.email ? uiRow({ title: 'Email', end: a.email }) : null, phone ? uiRow({ title: 'Phone', end: phone }) : null, ig ? uiRow({ title: 'Instagram', end: '@' + String(ig).replace(/^@/, '') }) : null].filter(Boolean);
    if (contact.length) { sheet.appendChild(uiLabel('Contact')); sheet.appendChild(uiList(contact)); }
    var ends = el('div', { class: 'cs-sends' });
    if (window.CoachLifters) {
      var go = el('button', { class: 'cs-golifter', type: 'button' }, 'Open ' + f + '\u2019s page');
      go.insertAdjacentHTML('beforeend', ic('chev', 2.2));
      go.addEventListener('click', function () { close(); openLifter(aid); });
      ends.appendChild(go);
    }
    var out = el('button', { class: 'cs-remove', type: 'button' }, 'Remove from roster');
    out.addEventListener('click', function () { openRemove(aid, close); });
    ends.appendChild(out);
    sheet.appendChild(ends);
  }
  // One client: what's due, the payments, the package, how to reach them.
  function openClient(aid) {
    var a = athleteOf(aid);
    if (!isDeskNow()) {
      uiSheet(a.name, function (sheet, close) {
        var paint = function () { paintClientPhone(sheet, aid, close, paint); };
        paint();
      }, { cls: 'cs-sheet cs-client is-phone' });
      return;
    }
    uiSheet(a.name, function (sheet, close) {
      var paint = function () {
        while (sheet.children.length > 2) sheet.removeChild(sheet.lastChild);   // keep the grip and the title
        var b = billingOf(aid), s = C().clientStatus(b, today()), pays = paymentsOf(aid), ik = intakeOf(aid);
        sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, b ? b.package + ' · ' + C().priceText(b) : 'No package yet'));
        var head = el('div', { class: 'cs-sbanner' + (TONE[s.state] ? ' tone-' + TONE[s.state] : '') });
        head.innerHTML = '<span class="cl-tic">' + ic(s.state === 'overdue' ? 'alert' : s.state === 'due' || s.state === 'soon' ? 'clock' : 'wallet') + '</span><span class="cs-sb-t"><b>' + esc(stateLabel(s)) + '</b>' +
          (s.due && s.state !== 'ok' ? '<span>' + (s.state === 'overdue' ? 'Was due ' : 'Due ') + esc(dateShort(s.due)) + '</span>' : (pays[0] ? '<span>Last paid ' + esc(dateShort(pays[0].paidOn)) + '</span>' : '')) + '</span>';
        sheet.appendChild(head);
        var acts = el('div', { class: 'cs-sacts' });
        if (b) {
          var mp = el('button', { class: 'btn btn-primary', type: 'button' }, 'Mark paid');
          mp.addEventListener('click', function () { close(); markPaid(aid); });
          acts.appendChild(mp);
          if (s.state === 'overdue' || s.state === 'due' || s.state === 'soon') {
            var rm = el('button', { class: 'btn ui-btn-soft', type: 'button' }, 'Remind ' + first(a.name));
            rm.addEventListener('click', function () { close(); remind(aid); });
            acts.appendChild(rm);
          }
        } else {
          var ad = el('button', { class: 'btn btn-primary', type: 'button' }, 'Add a package');
          ad.addEventListener('click', function () { close(); editPackage(aid); });
          acts.appendChild(ad);
        }
        sheet.appendChild(acts);
        if (pays.length) {
          sheet.appendChild(uiLabel('Payments', { count: pays.length }));
          sheet.appendChild(uiList(pays.slice(0, 12).map(function (p) {
            var del = el('button', { class: 'cs-del', type: 'button', 'aria-label': 'Delete this payment', html: ic('x', 2.2) });
            del.addEventListener('click', function (e) { e.stopPropagation(); deletePayment(p, paint); });
            return uiRow({ title: money(p.amountCents, p.currency), sub: [dateShort(p.paidOn), METHOD[p.method], p.period].filter(Boolean).join(' · '), endNode: del });
          })));
        }
        if (b) {
          sheet.appendChild(uiLabel('Package', { action: { label: 'Edit', onClick: function () { close(); editPackage(aid); } } }));
          sheet.appendChild(uiList([
            uiRow({ title: 'Package', end: b.package }),
            uiRow({ title: 'Price', end: C().priceText(b) }),
            uiRow({ title: b.nextDue && b.nextDue < today() ? 'Was due' : 'Next payment', end: b.nextDue ? dateShort(b.nextDue) : '–' }),
            b.startedOn ? uiRow({ title: 'Coaching since', end: monthYear(b.startedOn) }) : null,
            b.status !== 'active' ? uiRow({ title: 'Status', end: b.status === 'paused' ? 'Paused' : 'Ended' }) : null
          ]));
        }
        var phone = (b && b.phone) || (ik && ik.answers && ik.answers.phone) || '';
        var ig = a.instagram || (ik && ik.answers && ik.answers.instagram) || '';
        var contact = [a.email ? uiRow({ title: 'Email', end: a.email }) : null, phone ? uiRow({ title: 'Phone', end: phone }) : null, ig ? uiRow({ title: 'Instagram', end: '@' + String(ig).replace(/^@/, '') }) : null].filter(Boolean);
        if (contact.length) { sheet.appendChild(uiLabel('Contact')); sheet.appendChild(uiList(contact)); }
        if (window.CoachLifters) {
          var go = el('button', { class: 'cs-golifter', type: 'button' }, 'Open ' + first(a.name) + '’s page');
          go.insertAdjacentHTML('beforeend', ic('chev', 2.2));
          go.addEventListener('click', function () { close(); openLifter(aid); });
          sheet.appendChild(go);
        }
      };
      paint();
    }, { cls: 'cs-sheet cs-client' });
  }

  // ===================================================================== the lifter's page: Client + About
  function sectionHtml(aid, o) {
    o = o || {};
    if (!C()) return '';
    var a = athleteOf(aid), b = billingOf(aid), s = C().clientStatus(b, today()), pays = paymentsOf(aid), ik = intakeOf(aid);
    var rz = o.rise != null ? ' rise" style="--i:' + o.rise : '';
    var html = '<div class="cs-zone cs-pair' + (o.phone ? ' is-phone' : '') + rz + '" data-cs-aid="' + esc(aid) + '">';
    // Client
    var tone = TONE[s.state] ? ' tone-' + TONE[s.state] : '';
    html += '<div class="cl-tile cs-card' + tone + '"><div class="cl-th"><span class="cl-tic">' + ic('wallet') + '</span><span class="cl-tl">Client</span>' +
      '<span class="cs-st st-' + s.state + '">' + esc(o.phone && !isDeskNow() ? stateWords(s).text : stateLabel(s)) + '</span></div>';
    if (!b) {
      html += '<p class="cs-none">Record what ' + esc(first(a.name)) + ' pays you and when it’s due. You get the reminders; ' + esc(first(a.name)) + ' never sees any of it.</p>' +
        '<div class="cs-acts"><button type="button" class="cl-btn" data-cs="package" data-aid="' + esc(aid) + '">Add a package</button></div>';
    } else {
      var since = b.startedOn ? 'since ' + monthYear(b.startedOn) : '';
      html += '<div class="cs-pk"><b>' + esc(b.package) + '</b><span>' + esc([o.phone && !isDeskNow() ? perText(b) : C().priceText(b), since].filter(Boolean).join(' · ')) + '</span></div>';
      html += '<div class="cs-pays">' + (pays.length ? pays.slice(0, o.phone ? 2 : 3).map(function (p) {
        return '<span class="cs-pay"><b>' + esc(money(p.amountCents, p.currency)) + '</b> ' + esc(dateShort(p.paidOn)) + (p.method ? ' · ' + esc(METHOD[p.method] || '') : '') + '</span>';
      }).join('') : '<span class="cs-pay is-none">No payments recorded yet</span>') + '</div>';
      html += '<div class="cs-acts"><button type="button" class="cl-btn" data-cs="paid" data-aid="' + esc(aid) + '">Mark paid</button>' +
        ((s.state === 'overdue' || s.state === 'due' || s.state === 'soon') ? '<button type="button" class="cl-quiet" data-cs="remind" data-aid="' + esc(aid) + '">Remind</button>' : '') +
        '<button type="button" class="cl-quiet cs-more" data-cs="open" data-aid="' + esc(aid) + '">Details' + ic('chev', 2.2) + '</button></div>';
    }
    html += '</div>';
    // About: the intake, when they've sent it.
    if (ik && ik.answers && C().intakeLines) {
      var lines = C().intakeLines(ik.answers, { unit: typeof getUnit === 'function' && getUnit() === 'lbs' ? 'lb' : 'kg', today: today() }) || [];
      if (lines.length) {
        html += '<div class="cl-tile cs-card cs-about"><div class="cl-th"><span class="cl-tic">' + ic('user') + '</span><span class="cl-tl">About</span><span class="cl-ts">Intake · ' + esc(ago(ik.submittedAt || ik.updatedAt || today())) + '</span></div>' +
          '<dl class="cs-dl">' + lines.slice(0, o.phone ? 8 : 9).map(function (l) { return '<div><dt>' + esc(l.k) + '</dt><dd>' + esc(l.v) + '</dd></div>'; }).join('') + '</dl></div>';
      }
    }
    // The phone's way off the roster: last, quiet, with its own ask (openRemove).
    if (o.phone && !isDeskNow()) html += '<button type="button" class="cs-remove" data-cs="remove" data-aid="' + esc(aid) + '">Remove from roster</button>';
    return html + '</div>';
  }

  // ===================================================================== applications (night C, 30 Oct; fixed after its review)
  // Applications from the coach's public profile (coach-profile.html → the apply-to-coach edge function; the coach reads
  // only those the applicant confirmed by email). They wait on Lifters under New lifters with the join requests
  // (coach.html _newLiftersSection: one place, review M5), the soonest meet first, then the longest waiting. A lead opens its sheet: what they
  // sent (their email a mailto link, review M6), then the sheet's one crimson, Send <name> an invite (the app's own invite
  // flow: an invite tied to their email, emailed by send-invite once the decision is saved, review m7), a quiet Decline
  // with Undo, and Delete (spam). The demo changes its Store only, nothing is sent.
  function leads() { return C().leadsWaiting(st().coachApplications, today()); }
  function leadOf(id) { return (st().coachApplications || []).find(function (l) { return l && l.id === id; }) || null; }
  function unitNow() { return typeof unitLabel === 'function' ? unitLabel() : 'kg'; }
  function liftNum(kg) { var d = typeof kgToDisplay === 'function' ? kgToDisplay(kg) : kg; return String(unitNow() === 'kg' ? Math.round(d * 2) / 2 : Math.round(d)); }
  function bwNum(kg) { var d = typeof kgToDisplay === 'function' ? kgToDisplay(kg) : kg; return String(Math.round(d * 10) / 10); }
  function yearsText(y) { return C().leadYears(y); }
  function liftsText(l) { return C().leadLifts(l, liftNum, unitNow()); }
  function leadLine(l) { return C().leadLine(l, liftNum, unitNow(), { bw: bwNum, date: function (iso) { return dateShort(iso); }, today: today() }); }
  // Lifters' New lifters, Home's row, the tab's count: they all follow a change here.
  function leadsChanged() {
    try { if (typeof renderRoster === 'function') renderRoster(); } catch (e) {}
    try { if (window.CoachApp) CoachApp.paintHomeIfShown(); } catch (e) {}
    afterChange();
  }
  function setLead(id, patch) {
    Store.update(function (s) { s.coachApplications = (s.coachApplications || []).map(function (x) { return x.id === id ? Object.assign({}, x, patch) : x; }); });
    leadsChanged();
  }
  function decide(l, status, code) {
    var patch = { status: status, inviteCode: status === 'accepted' ? (code || null) : l.inviteCode, decidedAt: status === 'new' ? null : new Date().toISOString() };
    setLead(l.id, patch);
    if (window._demoMode || !window.DB || !DB.decideCoachApplication) return Promise.resolve(true);
    return DB.decideCoachApplication(l.id, status, code).then(function (r) {
      if (r && r.ok) { if (r.application) setLead(l.id, r.application); return true; }
      setLead(l.id, { status: l.status, inviteCode: l.inviteCode, decidedAt: l.decidedAt });   // put back as it was
      toast('Couldn’t save that. Check your connection.');
      return false;
    });
  }
  function acceptLead(l, close) {
    var f = first(l.name);
    if (typeof canAddAthlete === 'function' && !canAddAthlete(me())) { if (close) close(); if (typeof openUpgradeModal === 'function') openUpgradeModal('cap'); return; }
    if (typeof _newInvite !== 'function') return;
    var inv = _newInvite(l.email);   // coach.html: an invite tied to their email (a seat until it's used)
    Promise.resolve(inv.saved).then(function () {
      if (inv.failed) return;
      if (close) close();
      // The decision first; the email only once it's saved, so a failed save can't leave a sent invite on a lead that
      // comes back as waiting (a second Accept would send a second one: review m7).
      return decide(l, 'accepted', inv.code).then(function (saved) {
        // Not saved: the lead waits again and the invite made for it goes back, as a cancelled share's does (an unused
        // invite holds a seat on the plan; the next Accept makes a new one).
        if (!saved) { if (typeof _dropInvite === 'function') _dropInvite(inv.code); return; }
        if (window._demoMode) { toast('Demo: no email sent. ' + f + '’s code is ' + inv.code); return; }
        return DB.sendInvite(l.email).then(function (r) {
          toast(r && r.ok ? 'Invite sent to ' + l.email : 'Couldn’t email it (' + ((r && r.reason) || 'unknown error') + '). ' + f + '’s code is ' + inv.code + ': share the link from Invite a lifter.', 6000);
        });
      });
    }).catch(function () {});
  }
  function declineLead(l, close) {
    if (close) close();
    decide(l, 'declined').then(function (ok) {
      if (!ok) return;
      var undo = function () { decide(Object.assign({}, l, { status: 'declined' }), 'new'); };
      if (typeof toastAction === 'function') toastAction('Declined ' + first(l.name), 'Undo', undo); else toast('Declined ' + first(l.name));
    });
  }
  // Spam, or someone they'll never answer: gone for good (the server keeps nothing).
  function deleteLead(l, close) {
    var f = first(l.name);
    var go = function () {
      if (close) close();
      var put = (st().coachApplications || []).slice();
      Store.update(function (s) { s.coachApplications = (s.coachApplications || []).filter(function (x) { return x.id !== l.id; }); });
      leadsChanged();
      if (window._demoMode || !window.DB || !DB.deleteCoachApplication) { toast('Deleted ' + f + '’s application'); return; }
      DB.deleteCoachApplication(l.id).then(function (r) {
        if (r && r.ok) { toast('Deleted ' + f + '’s application'); return; }
        Store.update(function (s) { s.coachApplications = put; }); leadsChanged();
        toast('Couldn’t delete that. Check your connection.');
      });
    };
    if (typeof uiActionSheet === 'function') uiActionSheet('Delete ' + f + '’s application? It’s gone for good, and ' + f + ' isn’t told.', [{ label: 'Delete application', danger: true, onClick: go }]);
    else go();
  }
  function openLead(id) {
    var l = leadOf(id);
    if (!l || typeof uiSheet !== 'function') return;
    var f = first(l.name);
    uiSheet(l.name, function (sheet, close) {
      sheet.appendChild(el('p', { class: 'ui-sheet-sub' }, 'Applied ' + ago(l.createdAt) + ' from your profile. They confirmed their email.'));
      // Their email opens a reply in the coach's mail app (Decline sends nothing: a word from the coach is theirs to send).
      var mail = el('a', { class: 'ui-row cs-lead-mail', href: 'mailto:' + String(l.email || '').replace(/[^A-Za-z0-9.!#$%&'*+\/=?^_`{|}~@-]/g, '') },
        el('span', { class: 'ui-row-main' }, el('span', { class: 'ui-row-title' }, 'Email'), el('span', { class: 'ui-row-sub' }, l.email)));
      mail.insertAdjacentHTML('beforeend', '<span class="ui-row-end">' + (typeof UI_CHEV !== 'undefined' ? UI_CHEV : ic('chev', 2.2)) + '</span>');
      var rows = [mail,
        l.trainingYears != null ? uiRow({ title: 'Training age', sub: yearsText(l.trainingYears).replace(/ training$/, '') }) : null,
        liftsText(l) ? uiRow({ title: 'Best lifts', sub: 'Squat / bench / deadlift: ' + liftsText(l) }) : null,
        l.bodyweight > 0 ? uiRow({ title: 'Bodyweight', sub: bwNum(l.bodyweight) + ' ' + unitNow() }) : null,
        l.nextMeet ? uiRow({ title: 'Next meet', sub: dateShort(l.nextMeet) }) : null,
        l.goals ? uiRow({ title: 'Goals', sub: l.goals }) : null
      ].filter(Boolean);
      sheet.appendChild(uiList(rows));
      if (l.note) { sheet.appendChild(uiLabel('Their note')); sheet.appendChild(el('p', { class: 'cs-lead-note' }, l.note)); }
      var acts = el('div', { class: 'cs-lead-acts' });
      var no = el('button', { type: 'button', class: 'ui-text-btn cs-lead-no' }, 'Decline');
      no.addEventListener('click', function () { declineLead(l, close); });
      var go = el('button', { type: 'button', class: 'btn btn-primary btn-lg btn-block cs-lead-go' }, 'Send ' + f + ' an invite');
      go.addEventListener('click', function () { go.disabled = true; acceptLead(l, close); setTimeout(function () { go.disabled = false; }, 1500); });
      // The phone: the crimson full width, Decline quiet under it; the laptop: one footer row, quiet first, crimson last.
      if (isDeskNow()) { acts.classList.add('is-desk'); acts.appendChild(no); acts.appendChild(go); } else { acts.appendChild(go); acts.appendChild(no); }
      sheet.appendChild(acts);
      sheet.appendChild(el('p', { class: 'cs-lead-fine' }, 'Send an invite emails ' + f + ' your invite link (their code is tied to this email). Decline sends nothing.'));
      var del = el('button', { type: 'button', class: 'ui-text-btn cs-lead-del' }, 'Delete as spam');
      del.addEventListener('click', function () { deleteLead(l, close); });
      sheet.appendChild(el('div', { class: 'cs-lead-delrow' }, del));   // not a sheet's direct button: those are rows
    }, { cls: 'cs-lead-sheet' });
  }

  // ===================================================================== the Clients screen
  var view = { filter: 'all' };
  var ORDER = { overdue: 0, due: 1, soon: 2, ok: 3, paused: 4, ended: 5, none: 6 };
  function rows() {
    var t = today();
    return roster().map(function (a) { var b = billingOf(a.id); return { a: a, b: b, s: C().clientStatus(b, t), last: paymentsOf(a.id)[0] || null }; })
      .sort(function (x, y) { return (ORDER[x.s.state] - ORDER[y.s.state]) || ((x.s.days == null ? 9999 : x.s.days) - (y.s.days == null ? 9999 : y.s.days)) || String(x.a.name).localeCompare(String(y.a.name)); });
  }
  var FILTERS = [['all', 'Everyone'], ['overdue', 'Overdue'], ['soon', 'Due soon'], ['paused', 'Paused'], ['none', 'No package']];
  function inFilter(r, f) {
    if (f === 'all') return true;
    if (f === 'overdue') return r.s.state === 'overdue';
    if (f === 'soon') return r.s.state === 'due' || r.s.state === 'soon';
    if (f === 'paused') return r.s.state === 'paused' || r.s.state === 'ended';
    return r.s.state === 'none';
  }
  function tile(key, icon, label, sub, value, extra, foot) {
    return '<div class="cl-tile cs-t t-' + key + '"><div class="cl-th"><span class="cl-tic">' + ic(icon) + '</span><span class="cl-tl">' + esc(label) + '</span>' + (sub ? '<span class="cl-ts">' + esc(sub) + '</span>' : '') + '</div>' +
      '<div class="cl-tv">' + value + '</div>' + (extra || '') + (foot ? '<div class="cl-tf">' + foot + '</div>' : '') + '</div>';
  }
  function namesFoot(ids, fmt) {
    var list = ids.slice(0, 3).map(function (id) { var a = athleteOf(id); return '<button type="button" class="cl-nm" data-cs="open" data-aid="' + esc(id) + '">' + esc(fmt(a, id)) + '</button>'; });
    return list.join('<span class="cl-sep">, </span>') + (ids.length > 3 ? ' <span class="cl-more-n">+' + (ids.length - 3) + '</span>' : '');
  }
  function tilesHtml(sm, compact) {
    var cur = sm.currency, t = today();
    var pct = sm.month.expected ? Math.min(100, Math.round(sm.month.received / sm.month.expected * 100)) : 0;
    var dueLabel = function (a, id) { var s = statusOf(id); return first(a.name) + ' ' + (s.state === 'overdue' ? -s.days + 'd' : s.days === 0 ? 'today' : s.days + 'd'); };
    var soonIds = sm.dueToday.who.concat(sm.soon.who);
    var tiles = [
      tile('received', 'cash', 'This month', compact ? '' : new Date(t + 'T12:00:00').toLocaleDateString(undefined, { month: 'long' }),
        '<b class="cl-big2">' + esc(money(sm.month.received, cur)) + '</b><span class="cl-u">of ' + esc(money(sm.month.expected, cur)) + '</span>',
        '<span class="cs-meter" role="img" aria-label="' + pct + '% received"><i style="width:' + pct + '%"></i></span>',
        sm.month.expected ? pct + '% in' + (sm.month.expected > sm.month.received ? ' · ' + esc(money(sm.month.expected - sm.month.received, cur)) + ' to come' : '') : 'Nothing due this month'),
      tile('overdue', 'alert', 'Overdue', '',
        '<b class="cl-big2">' + sm.overdue.n + '</b>' + (sm.overdue.n ? '<span class="cl-u">' + esc(money(sm.overdue.cents, cur)) + '</span>' : '<span class="cl-u">all paid up</span>'),
        '', sm.overdue.n ? namesFoot(sm.overdue.who, dueLabel) : 'Nobody owes you'),
      tile('soon', 'clock', 'Due this week', '',
        '<b class="cl-big2">' + soonIds.length + '</b>' + (soonIds.length ? '<span class="cl-u">' + esc(money(sm.dueToday.cents + sm.soon.cents, cur)) + '</span>' : ''),
        '', soonIds.length ? namesFoot(soonIds, dueLabel) : 'Nothing in the next 7 days'),
      // Recurring: every active package as a month's worth (weekly ×52/12…), so it reads apart from
      // This month's "of $X" (what falls due this calendar month, overdue included).
      tile('mrr', 'repeat', 'Recurring', '',
        '<b class="cl-big2">' + esc(money(Math.round(sm.mrr / 100) * 100, cur)) + '</b><span class="cl-u">a month</span>',
        '', plural(sm.active, 'active client') + (sm.paused ? ' · ' + sm.paused + ' paused' : ''))
    ];
    return '<div class="cl-tiles cs-tiles' + (compact ? ' is-compact' : '') + '">' + tiles.join('') + '</div>';
  }
  function rowHtml(r, phone) {
    var a = r.a, b = r.b, s = r.s;
    var sub = b ? (phone ? C().priceText(b) + ' · ' + b.package : b.package + ' · ' + C().priceText(b)) : 'No package yet';
    var last = r.last ? 'Paid ' + dateShort(r.last.paidOn) : (b ? 'No payments yet' : '');
    // A calm list: buttons only where money needs the coach (owed or due this week), or a package is missing.
    var owed = s.state === 'overdue' || s.state === 'due' || s.state === 'soon';
    var act = !b ? '<button type="button" class="cl-quiet" data-cs="package" data-aid="' + esc(a.id) + '">Add package</button>'
      : owed ? '<button type="button" class="cl-btn" data-cs="paid" data-aid="' + esc(a.id) + '">Mark paid</button>' + ((s.state === 'overdue' || s.state === 'due') ? '<button type="button" class="cl-quiet" data-cs="remind" data-aid="' + esc(a.id) + '">Remind</button>' : '')
      : '';
    if (phone) {
      return '<button type="button" class="cs-r is-phone st-' + s.state + '" data-cs="open" data-aid="' + esc(a.id) + '">' + av(a) +
        '<span class="cs-rn"><b>' + esc(a.name) + '</b><span>' + esc(sub) + '</span></span><span class="cs-rs"><span class="cs-st st-' + s.state + '">' + esc(shortState(s)) + '</span>' + (last ? '<span class="cs-rl">' + esc(last) + '</span>' : '') + '</span>' + ic('chev', 2.2) + '</button>';
    }
    return '<div class="cs-r st-' + s.state + '"><button type="button" class="cs-rmain" data-cs="open" data-aid="' + esc(a.id) + '">' + av(a) + '<span class="cs-rn"><b>' + esc(a.name) + '</b><span>' + esc(sub) + '</span></span></button>' +
      '<span class="cs-st st-' + s.state + '">' + esc(stateLabel(s)) + '</span><span class="cs-rl">' + esc(last) + '</span><span class="cs-ra">' + act + '</span></div>';
  }
  // The status in words, its date in the device's format like every other date here (clients.js keeps a fixed "5 Nov").
  function stateLabel(s) { return s.state === 'ok' && s.due && /^Next payment /.test(s.label) ? 'Next payment ' + dateShort(s.due) : s.label; }
  function shortState(s) {
    if (s.state === 'overdue') return 'Overdue ' + -s.days + 'd';
    if (s.state === 'soon') return s.days === 1 ? 'Tomorrow' : 'In ' + s.days + ' days';
    if (s.state === 'ok' && s.due) return dateShort(s.due);
    return s.label;
  }
  // ===================================================================== the Clients screen on the phone
  // The approved look (29 Oct): one answer (this month's money and its meter, lit by the green of money in), the
  // one job (the payment most overdue, with the screen's one red and one quiet way out), then everyone as calm
  // rows: face, name, one line in the coach's words, the next payment's date. Status is never red: late is the
  // orange triangle beside ink words. Nothing here moves money; the foot says so.
  // The words live in clients.js (pure, tested): '$220 a month'; '5 days late' (warn) / 'Due in 2 days' / ...
  function perText(b) { return C().perText(b); }
  function late(s) { return C().paceWords(s).text; }
  function stateWords(s) { return C().paceWords(s, dateShort); }
  function triHtml() { return '<i class="cs-tri" aria-hidden="true"></i>'; }
  function phoneHeroHtml(sm, month) {
    var cur = sm.currency, got = sm.month.received, exp = sm.month.expected, any = (st().clientBilling || []).some(function (b) { return roster().some(function (a) { return a.id === b.athleteId; }); });
    var head = '<span class="cs-hh"><span class="cs-hl">This month</span><span class="cs-hm">' + esc(month) + '</span></span>';
    if (!any) {
      return '<div class="cs-hero is-empty ca-rise">' + head + '<b class="cs-hnone">No packages yet</b>' +
        '<p class="cs-hs">Add what each lifter pays you and when it\u2019s due. You get the reminders; they never see any of it.</p></div>';
    }
    var pct = exp ? Math.max(0, Math.min(100, Math.round(got / exp * 100))) : 0;
    var num = '<span class="cs-hn"><b>' + esc(money(got, cur)) + '</b>' + (exp ? '<span>of ' + esc(money(exp, cur)) + '</span>' : '') + '</span>';
    var meter = exp ? '<span class="cs-meter is-hero" role="img" aria-label="' + pct + '% of ' + esc(money(exp, cur)) + ' in"><i style="--p:' + (pct / 100).toFixed(3) + '"></i></span>' : '';
    var line = exp ? pct + '% in' + (exp > got ? ' \u00b7 ' + esc(money(exp - got, cur)) + ' to come' : '') : 'Nothing due in ' + esc(month);
    // The month's clients and, when it isn't the same number, what the packages bring in a month.
    var mrr = Math.round(sm.mrr / 100) * 100, foot = [plural(sm.active, 'active client')];
    if (mrr && mrr !== exp) foot.push(esc(money(mrr, cur)) + ' a month');
    if (sm.paused) foot.push(sm.paused + ' paused');
    var mixed = sm.mixed ? '<p class="cs-hx">Payments in other currencies aren\u2019t in this total.</p>' : '';
    return '<div class="cs-hero ca-rise">' + head + num + meter + '<p class="cs-hs">' + line + '</p><p class="cs-hf">' + foot.join(' \u00b7 ') + '</p>' + mixed + '</div>';
  }
  // Who owes you: the payment most overdue as the one job (late first; due today when nothing is late), the next
  // two as rows with their own Mark paid. Nothing owed today: no section (due this week reads in the list).
  function phoneOweHtml(all) {
    var owed = all.filter(function (r) { return r.b && (r.s.state === 'overdue' || r.s.state === 'due'); });
    if (!owed.length) return '';
    var r0 = owed[0], a0 = r0.a, f0 = first(a0.name), s0 = r0.s, w0 = stateWords(s0);
    var title = s0.state === 'overdue' ? esc(f0) + '\u2019s payment is ' + esc(late(s0)) : esc(f0) + '\u2019s payment is due today';
    var detail = [money(r0.b.amountCents, r0.b.currency), r0.b.package, s0.state === 'overdue' ? 'was due ' + dateShort(s0.due) : ''].filter(Boolean).join(' \u00b7 ');
    var head = '<div class="ca-h cs-oh"><h2><b class="cs-on">' + owed.length + '</b> ' + (owed.length === 1 ? 'owes' : 'owe') + ' you</h2></div>';
    var lead = '<div class="cs-lead ca-rise' + (w0.warn ? ' is-late' : '') + '" data-aid="' + esc(a0.id) + '">' +
      '<button type="button" class="cs-lead-who" data-cs="open" data-aid="' + esc(a0.id) + '">' + av(a0, 'cs-face') +
        '<span class="cs-lead-tx"><b>' + (w0.warn ? triHtml() : '') + '<span>' + title + '</span></b><span>' + esc(detail) + '</span></span></button>' +
      '<button type="button" class="ca-btn is-red" data-cs="paid" data-aid="' + esc(a0.id) + '">Mark ' + esc(f0) + ' paid</button>' +
      '<button type="button" class="cs-alt" data-cs="remind" data-aid="' + esc(a0.id) + '">Remind ' + esc(f0) + '</button></div>';
    var more = owed.slice(1, 3).map(function (r) {
      var w = stateWords(r.s);
      return '<div class="cs-orow"><button type="button" class="cs-orow-who" data-cs="open" data-aid="' + esc(r.a.id) + '">' + av(r.a, 'cs-face') +
        '<span class="cs-rn"><b>' + esc(r.a.name) + '</b><span class="cs-line' + (w.warn ? ' is-warn' : '') + '">' + (w.warn ? triHtml() : '') + '<span>' + esc(w.text + ' \u00b7 ' + money(r.b.amountCents, r.b.currency)) + '</span></span></span></button>' +
        '<button type="button" class="ca-pill" data-cs="paid" data-aid="' + esc(r.a.id) + '">Mark paid</button></div>';
    }).join('');
    return '<div class="ca-sec cs-owe">' + head + lead + (more ? '<div class="cs-orows">' + more + '</div>' : '') + '</div>';
  }
  function phoneRowHtml(r) {
    var a = r.a, b = r.b, s = r.s, w = stateWords(s);
    var line = !b ? w.text : (s.state === 'ok' || s.state === 'paused' || s.state === 'ended')
      ? (s.state === 'ok' ? perText(b) + ' \u00b7 ' + b.package : w.text + ' \u00b7 ' + b.package)
      : w.text + ' \u00b7 ' + perText(b);
    var end = b && s.due && s.state !== 'paused' && s.state !== 'ended' ? '<span class="cs-rd">' + esc(dateShort(s.due)) + '</span>' : '';
    return '<button type="button" class="cs-r is-phone st-' + s.state + '" data-cs="open" data-aid="' + esc(a.id) + '">' + av(a, 'cs-face') +
      '<span class="cs-rn"><b>' + esc(a.name) + '</b><span class="cs-line' + (w.warn ? ' is-warn' : '') + '">' + (w.warn ? triHtml() : '') + '<span>' + esc(line) + '</span></span></span>' + end + '</button>';
  }
  var filled = false;   // the meter fills on the first visit of an app open, never again (coach-ui.css csMeterIn)
  var meterWas = null;  // where the meter stood when Clients last drew (a payment moves it)
  function renderPhone(host) {
    var sm = summary(), all = rows(), t = today(), firstVisit = !filled;
    var month = new Date(t + 'T12:00:00').toLocaleDateString(undefined, { month: 'long' });
    var html = '<div class="cl-root cs-zone cs-page is-phone' + (firstVisit ? ' is-first' : '') + '">';
    filled = true;
    html += '<header class="cs-ph"><h1 class="cl-h1">Clients</h1></header>';
    if (!roster().length) {
      host.innerHTML = html + '<div class="cs-hero is-empty ca-rise"><b class="cs-hnone">No clients yet</b><p class="cs-hs">Invite a lifter, then record their package here: what they pay you and when. You get the reminders; they never see it.</p>' +
        '<button type="button" class="ca-btn is-red cs-hgo" data-cs="invite">Invite a lifter</button></div></div>';
      return;
    }
    var counts = {}; FILTERS.forEach(function (f) { counts[f[0]] = all.filter(function (r) { return inFilter(r, f[0]); }).length; });
    // Filters past six clients (a short list reads whole); the one chosen holds while it has anyone.
    var filters = all.length > 6;
    if (!filters || (view.filter !== 'all' && !counts[view.filter])) view.filter = 'all';
    var list = all.filter(function (r) { return inFilter(r, view.filter); });
    html += phoneHeroHtml(sm, month);
    html += phoneOweHtml(all);
    // The list's title, or (past six clients) its filters in its place: the chips say Everyone and the count once.
    html += '<div class="ca-sec cs-every' + (filters ? ' has-filters' : '') + '">' + (filters ? '' : '<div class="ca-h"><h2>Everyone</h2><span class="ca-h-meta">' + all.length + '</span></div>');
    if (filters) {
      html += '<div class="cs-bar"><div class="cs-filters" role="tablist" aria-label="Show">' + FILTERS.filter(function (f) { return f[0] === 'all' || counts[f[0]]; }).map(function (f) {
        return '<button type="button" role="tab" class="' + (view.filter === f[0] ? 'on' : '') + '" aria-selected="' + (view.filter === f[0] ? 'true' : 'false') + '" data-cs="filter" data-f="' + f[0] + '">' + esc(f[1]) + ' <span>' + counts[f[0]] + '</span></button>';
      }).join('') + '</div></div>';
    }
    html += '<div class="cs-list is-phone">' + list.map(phoneRowHtml).join('') + '</div></div>';
    html += '<p class="cs-foot">Only you see this. POWALIFTA doesn\u2019t take payments; it keeps your record and the dates.</p></div>';
    host.innerHTML = html;
    // A payment just recorded: the meter grows from where it was to where it is now.
    var mi = host.querySelector('.cs-meter.is-hero i'), now = mi ? parseFloat(mi.style.getPropertyValue('--p')) || 0 : null;
    if (mi && meterWas != null && now !== meterWas && !firstVisit && typeof mi.animate === 'function' && !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches)) {
      var cs = getComputedStyle(document.body), ease = (cs.getPropertyValue('--pl-spring') || '').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)', ms = parseFloat(cs.getPropertyValue('--pl-d-state')) || 560;
      try { mi.animate([{ transform: 'scaleX(' + meterWas + ')' }, { transform: 'scaleX(' + now + ')' }], { duration: ms, easing: ease }); } catch (e) {}
    }
    meterWas = now;
  }
  function render(host) {
    if (!host || !C()) return;
    if (!isDeskNow()) { renderPhone(host); return; }
    var phone = !isDeskNow(), sm = summary(), all = rows();
    var counts = {}; FILTERS.forEach(function (f) { counts[f[0]] = all.filter(function (r) { return inFilter(r, f[0]); }).length; });
    if (view.filter !== 'all' && !counts[view.filter]) view.filter = 'all';
    var list = all.filter(function (r) { return inFilter(r, view.filter); });
    var t = today(), month = new Date(t + 'T12:00:00').toLocaleDateString(undefined, { month: 'long' });
    var subBits = ['<b>' + sm.active + '</b> active'];
    if (sm.paused) subBits.push(sm.paused + ' paused');
    if (sm.noPackage.length) subBits.push(plural(sm.noPackage.length, 'lifter') + ' without a package');
    var html = '<div class="cl-root cs-zone cs-page' + (phone ? ' is-phone' : '') + '">';
    html += phone
      ? '<header class="cs-ph"><h1 class="cl-h1">Clients</h1><p class="cl-sub">' + esc(month) + ' · ' + subBits.join(' · ') + '</p></header>'
      : '<header class="cl-thead"><div><h1 class="cl-h1x">Clients</h1><p class="cl-sub">' + esc(month) + ' · ' + subBits.join(' · ') + '</p></div>' +
        '<div class="cs-hacts"><button type="button" class="cl-quiet" data-cs="csv">' + ic('down') + 'Download payments</button></div></header>';
    if (!roster().length) {
      html += '<div class="cl-empty"><span class="cl-tic">' + ic('wallet') + '</span><div><b>No clients yet</b><p>Invite a lifter, then record their package here: what they pay and when. You get the reminders; they never see it.</p></div></div></div>';
      host.innerHTML = html;
      return;
    }
    html += tilesHtml(sm, phone);
    html += '<div class="cs-bar"><div class="cs-filters" role="tablist" aria-label="Show">' + FILTERS.filter(function (f) { return f[0] === 'all' || counts[f[0]]; }).map(function (f) {
      return '<button type="button" role="tab" class="' + (view.filter === f[0] ? 'on' : '') + '" aria-selected="' + (view.filter === f[0] ? 'true' : 'false') + '" data-cs="filter" data-f="' + f[0] + '">' + esc(f[1]) + ' <span>' + counts[f[0]] + '</span></button>';
    }).join('') + '</div></div>';
    html += '<div class="cs-list' + (phone ? ' is-phone' : '') + '">' + (phone ? '' : '<div class="cs-lh"><span>Lifter</span><span>Payment</span><span>Last paid</span><span></span></div>') +
      list.map(function (r) { return rowHtml(r, phone); }).join('') + '</div>';
    html += '<p class="cs-foot">Only you see this. POWALIFTA doesn’t take payments; it keeps your record and the dates.</p></div>';
    host.innerHTML = html;
  }

  // Today (laptop) and the phone's Lifters tab: one quiet line when money is overdue.
  function todayBit() {
    if (!C()) return '';
    var sm = summary();
    if (!sm.overdue.n) return '';
    return ' · <button type="button" class="cs-due cs-zone" data-cs="clients" data-cs-today>' + plural(sm.overdue.n, 'payment') + ' overdue</button>';
  }
  function dueLineHtml() {
    if (!C()) return '';
    var sm = summary();
    if (!sm.overdue.n) return '';
    return '<button type="button" class="cs-dueline cs-zone" data-cs="clients" data-cs-today><span class="cl-tic">' + ic('alert') + '</span><span><b>' + plural(sm.overdue.n, 'payment') + ' overdue</b> · ' + esc(money(sm.overdue.cents, sm.currency)) + '</span>' + ic('chev', 2.2) + '</button>';
  }
  function paintBits() {
    if (!C()) return;
    var sm = summary();
    document.querySelectorAll('[data-cs-today]').forEach(function (b) {
      if (!sm.overdue.n) { b.hidden = true; return; }
      b.hidden = false;
      if (b.classList.contains('cs-due')) b.textContent = plural(sm.overdue.n, 'payment') + ' overdue';
    });
  }
  function overdueCount() { return C() ? summary().overdue.n : 0; }

  // Every payment of the last 400 days as a spreadsheet file (for the books).
  function downloadCsv() {
    var pays = (st().clientPayments || []).slice().sort(function (a, b) { return String(b.paidOn).localeCompare(String(a.paidOn)); });
    if (!pays.length) { toast('No payments recorded yet'); return; }
    // app.js _csvEscape, like every other export: a lifter names themselves, and a name like =HYPERLINK(…)
    // must stay text when the coach opens the file in Excel or Sheets (sweep 2026-10-28 #7).
    var q = function (v) { return _csvEscape(v); };
    var lines = [['Date', 'Lifter', 'Amount', 'Currency', 'Method', 'For', 'Note'].join(',')];
    pays.forEach(function (p) { lines.push([p.paidOn, athleteOf(p.athleteId).name, ((Number(p.amountCents) || 0) / 100).toFixed(2), p.currency, METHOD[p.method] || '', p.period || '', p.note || ''].map(q).join(',')); });
    var blob = new Blob([lines.join('\n') + '\n'], { type: 'text/csv' });
    var url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = 'powalifta-payments-' + today() + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest && e.target.closest('[data-cs]');
    if (!b || !b.closest('.cs-zone')) return;
    var k = b.getAttribute('data-cs'), aid = b.getAttribute('data-aid');
    e.stopPropagation();
    if (k === 'paid') markPaid(aid);
    else if (k === 'remind') remind(aid);
    else if (k === 'open') openClient(aid);
    else if (k === 'package') editPackage(aid);
    else if (k === 'clients') goClients();
    else if (k === 'csv') downloadCsv();
    else if (k === 'invite') { if (typeof openInviteModal === 'function') openInviteModal(); }
    else if (k === 'remove') openRemove(aid);
    else if (k === 'filter') { view.filter = b.getAttribute('data-f') || 'all'; var area = document.getElementById('clientsArea'); if (area) render(area); }
  });

  window.ClientsUI = { render: render, sectionHtml: sectionHtml, openClient: openClient, markPaid: markPaid, editPackage: editPackage, remind: remind, remindText: remindText,
    leads: leads, openLead: openLead, leadLine: leadLine, waited: waited, ago: ago,
    todayBit: todayBit, dueLineHtml: dueLineHtml, overdueCount: overdueCount, refresh: afterChange, ICON: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + IC.wallet + '</svg>' };
})();
