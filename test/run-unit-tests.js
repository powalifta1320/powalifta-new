#!/usr/bin/env node
/*
 * Headless runner for tests.html — no browser, no dependencies.
 *
 * Loads app.js + the tests.html assertion block in ONE vm context (so their
 * top-level const/function declarations share scope, exactly like two <script>
 * tags in a browser), against a Proxy-stubbed DOM + a real Map-backed
 * localStorage, plus a minimal real DOM (createElement) so the buildPager
 * element tests run too.
 *
 * Run:  node test/run-unit-tests.js
 * Exit: 0 = all executed tests pass, 1 = a failure, 2/3 = load error.
 *
 * NOTE: the "importer (athlete.html)" group fetch()es athlete.html at runtime,
 * which only works in a browser — those cases are reported as "not run
 * headless", not failures. Open tests.html in a browser for the full 171.
 */
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const ROOT = path.join(__dirname, '..');

// ---- recursive no-op DOM stub (absorbs document.getElementById(...).foo chains) ----
function makeStub() {
  const f = function () { return P; };
  const P = new Proxy(f, {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => '';
      if (p === Symbol.iterator) return function* () {};
      if (p === 'length') return 0;
      if (p === 'nodeType') return 1;
      if (p === 'style' || p === 'classList') return P;
      if (p === 'dataset') return {};
      return P;
    },
    set() { return true; }, apply() { return P; }, has() { return true; },
  });
  return P;
}
const domStub = makeStub();

// ---- minimal REAL DOM (only what el()/buildPager + the pagination tests need) ----
class TextNode {
  constructor(t) { this.nodeType = 3; this._text = String(t); this.parentNode = null; }
  get textContent() { return this._text; }
}
function parseSel(sel) {
  const out = { tag: null, classes: [], attr: null, notClasses: [] };
  let s = sel.trim();
  const notM = s.match(/:not\(([^)]*)\)/);
  if (notM) { notM[1].split('.').filter(Boolean).forEach(c => out.notClasses.push(c.trim())); s = s.replace(notM[0], ''); }
  const attrM = s.match(/\[([\w-]+)(?:=["']?([^"'\]]*)["']?)?\]/);
  if (attrM) { out.attr = { name: attrM[1], val: attrM[2] == null ? null : attrM[2] }; s = s.replace(attrM[0], ''); }
  const parts = s.split('.');
  if (parts[0]) out.tag = parts[0].toUpperCase();
  parts.slice(1).filter(Boolean).forEach(c => out.classes.push(c));
  return out;
}
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.attributes = {}; this.className = ''; this.id = '';
    this.children = []; this.childNodes = []; this.parentNode = null;
    this.style = {}; this.dataset = {}; this._listeners = {};
    this.disabled = false; this._html = null;
  }
  appendChild(c) { c.parentNode = this; this.childNodes.push(c); if (c instanceof El) this.children.push(c); return c; }
  removeChild(c) { this.childNodes = this.childNodes.filter(x => x !== c); this.children = this.children.filter(x => x !== c); return c; }
  remove() { if (this.parentNode) this.parentNode.removeChild(this); }
  setAttribute(k, v) { this.attributes[k] = String(v); if (k === 'class') this.className = String(v); if (k === 'id') this.id = String(v); }
  getAttribute(k) { if (k === 'class') return this.className || null; return k in this.attributes ? this.attributes[k] : null; }
  hasAttribute(k) { return k === 'class' ? !!this.className : (k in this.attributes); }
  removeAttribute(k) { delete this.attributes[k]; }
  addEventListener(t, fn) { (this._listeners[t] = this._listeners[t] || []).push(fn); }
  removeEventListener(t, fn) { if (this._listeners[t]) this._listeners[t] = this._listeners[t].filter(f => f !== fn); }
  dispatchEvent(ev) { (this._listeners[(ev && ev.type) || ''] || []).forEach(f => f.call(this, ev || { type: '', target: this })); return true; }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click', target: this }); }
  focus() {} blur() {} scrollIntoView() {}
  getBoundingClientRect() { return { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }; }
  cloneNode() { const c = new El(this.tagName); c.className = this.className; c.attributes = { ...this.attributes }; return c; }
  get classList() {
    const self = this;
    return {
      add: (...cs) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); cs.forEach(c => s.add(c)); self.className = [...s].join(' '); },
      remove: (...cs) => { const s = new Set(self.className.split(/\s+/).filter(Boolean)); cs.forEach(c => s.delete(c)); self.className = [...s].join(' '); },
      contains: c => self.className.split(/\s+/).includes(c),
      toggle: c => { if (self.classList.contains(c)) { self.classList.remove(c); return false; } self.classList.add(c); return true; },
    };
  }
  set textContent(v) { this.childNodes = []; this.children = []; this._html = null; this.appendChild(new TextNode(v)); }
  get textContent() {
    if (this._html != null) return String(this._html).replace(/<[^>]*>/g, '');
    return this.childNodes.map(n => n instanceof El ? n.textContent : n._text).join('');
  }
  set innerHTML(v) { this._html = v; this.childNodes = []; this.children = []; }
  get innerHTML() { return this._html == null ? '' : this._html; }
  _matches(p) {
    if (p.tag && this.tagName !== p.tag) return false;
    if (p.classes.some(c => !this.classList.contains(c))) return false;
    if (p.notClasses.some(c => this.classList.contains(c))) return false;
    if (p.attr) { const v = this.getAttribute(p.attr.name); if (v == null) return false; if (p.attr.val != null && v !== p.attr.val) return false; }
    return true;
  }
  _walk(acc) { for (const c of this.children) { acc.push(c); c._walk(acc); } return acc; }
  querySelectorAll(sel) { const p = parseSel(sel); return this._walk([]).filter(n => n._matches(p)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  closest(sel) { const p = parseSel(sel); let n = this; while (n) { if (n._matches && n._matches(p)) return n; n = n.parentNode; } return null; }
  contains(n) { return this._walk([]).includes(n); }
}

// ---- real localStorage --------------------------------------------------------
const store = new Map();
const localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(String(k), String(v)),
  removeItem: k => store.delete(k), clear: () => store.clear(),
  key: i => [...store.keys()][i] ?? null, get length() { return store.size; },
};

// ---- sandbox globals ----------------------------------------------------------
const sandbox = {};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
sandbox.addEventListener = () => {}; sandbox.removeEventListener = () => {}; sandbox.dispatchEvent = () => true;
sandbox.scrollTo = () => {}; sandbox.scrollY = 0; sandbox.innerWidth = 375; sandbox.innerHeight = 812;
sandbox.localStorage = localStorage;
sandbox.sessionStorage = { getItem: () => null, setItem() {}, removeItem() {}, clear() {} };
sandbox.console = console;
sandbox.document = new Proxy({}, {
  get(t, p) {
    if (p === 'documentElement' || p === 'body' || p === 'head') return domStub;
    if (p === 'cookie') return '';
    if (p === 'readyState') return 'complete';
    if (p === 'createElement') return tag => new El(tag);
    if (p === 'createTextNode') return txt => new TextNode(txt);
    if (p === 'createDocumentFragment') return () => new El('#fragment');
    return () => domStub;
  },
});
sandbox.navigator = { userAgent: 'node', language: 'en-US', onLine: true, vibrate: () => {}, serviceWorker: undefined };
sandbox.location = { href: 'http://localhost/tests.html', search: '', hash: '', pathname: '/tests.html', origin: 'http://localhost', reload() {} };
sandbox.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
sandbox.requestAnimationFrame = cb => setTimeout(() => cb(Date.now()), 0);
sandbox.cancelAnimationFrame = id => clearTimeout(id);
sandbox.setTimeout = setTimeout; sandbox.clearTimeout = clearTimeout;
sandbox.setInterval = () => 0; sandbox.clearInterval = () => {};
sandbox.fetch = () => Promise.reject(new Error('no network in test harness'));
sandbox.CustomEvent = function () { return {}; };
sandbox.Event = function () { return {}; };
sandbox.IntersectionObserver = function () { return { observe() {}, disconnect() {}, unobserve() {} }; };
sandbox.MutationObserver = function () { return { observe() {}, disconnect() {} }; };
sandbox.getComputedStyle = () => domStub;
sandbox.alert = () => {}; sandbox.confirm = () => true; sandbox.prompt = () => null;
sandbox.URL = URL; sandbox.URLSearchParams = URLSearchParams;
sandbox.Intl = Intl; sandbox.crypto = require('crypto').webcrypto;
sandbox.btoa = s => Buffer.from(s, 'binary').toString('base64');
sandbox.atob = s => Buffer.from(s, 'base64').toString('binary');
vm.createContext(sandbox);

// ---- assemble app.js + the tests.html assertion block -------------------------
const appSrc = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'tests.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]);
let testSrc = scripts[scripts.length - 1];
const declared = (testSrc.match(/\btest\(['"]/g) || []).length; // test() calls in the file
// Alias the results object to a real global so counts survive a DOM-render-tail throw.
testSrc = testSrc.replace(/const T = \{[^}]*\};/, m => m + '\nglobalThis.__T = T;');

const combined =
  appSrc + '\n;\n' +
  'try {\n' + testSrc + '\n} catch (e) { globalThis.__LOAD_ERR = String(e && e.stack || e); }\n' +
  ';globalThis.__TESTOUT = (globalThis.__T) ? {pass:__T.pass, fail:__T.fail, skip:__T.skip, ' +
  'fails: __T.groups.flatMap(g=>g.cases.filter(c=>c.status==="fail").map(c=>g.name+" :: "+c.name+" — "+c.err))} : null;';

try {
  vm.runInContext(combined, sandbox, { filename: 'app+tests.js', timeout: 20000 });
} catch (e) {
  console.error('FATAL load error:', e && e.stack || e);
  process.exit(2);
}

const out = sandbox.__TESTOUT;
if (sandbox.__LOAD_ERR) console.error('Test-script error (post-parse):', sandbox.__LOAD_ERR);
if (!out) { console.error('No test output — T undefined (app.js threw at load).'); process.exit(3); }

const executed = out.pass + out.fail + out.skip;
const notRun = declared - executed;
console.log(`\nRESULT: ${out.pass} passed, ${out.fail} failed, ${out.skip} skipped  (of ${declared} declared)`);
if (notRun > 0) {
  console.log(`NOTE:   ${notRun} tests not run headless (browser-only, e.g. the fetch-based "importer (athlete.html)" group). Run tests.html in a browser for the full ${declared}.`);
}
if (out.fails.length) { console.log('\nFAILURES:'); out.fails.forEach(f => console.log('  ✗ ' + f)); }
process.exit(out.fail > 0 ? 1 : 0);
