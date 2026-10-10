/**
 * helpers/common.js - test helpers that used to be copy-pasted per file (I-120).
 *
 *   kwd(name, parameters, conditions)   a parsed-keyword object for the panel builders
 *   withAlertCapture(fn)                run fn with window.alert captured; returns the alert text or null
 *   newWebviewDom(html, options)        JSDOM with the options every full-page test used
 *   webviewHtml(...args)                getWebviewHtml(...args) minus the CSP <meta>, cached per process
 *   menuWebviewHtml(...args)            same for getMenuWebviewHtml
 *   leaseDspfPage(source, file, opts)   a reused, reset DSPF designer page (E7h)
 *
 * Nothing here touches globals at require time, so requiring this module has no effect
 * until a helper is called (files that set `global.window` / `global.document` still do so
 * themselves, as before).
 */
'use strict';

const path = require('path');

const CSP_META = /<meta http-equiv="Content-Security-Policy"[^>]*>/;

/** A keyword object as the DDS parser produces it (raw / sourceLines left empty). */
function kwd(name, parameters, conditions) {
  return { name: name, parameters: parameters || '', conditions: conditions || [], raw: '', sourceLines: [] };
}

/**
 * Run `fn` with `global.window.alert` replaced; return the last alert message (null if
 * none). The original alert is restored even if `fn` throws.
 */
function withAlertCapture(fn) {
  let msg = null;
  const original = global.window.alert;
  global.window.alert = function (m) { msg = m; };
  try { fn(); } finally { global.window.alert = original; }
  return msg;
}

/**
 * `new JSDOM(html, options)` with the settings every full-page test used:
 * scripts run, resources load, the window pretends to be visual. `options`
 * (typically `{ beforeParse(window) {...} }`) is merged over those defaults.
 */
function newWebviewDom(html, options) {
  const { JSDOM } = require('jsdom');
  return new JSDOM(html, Object.assign({ runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true }, options || {}));
}

const htmlCache = new Map();
function cachedHtml(kind, generate, args) {
  const key = kind + '\u0000' + JSON.stringify(args);
  let html = htmlCache.get(key);
  if (html === undefined) {
    html = generate.apply(null, args).replace(CSP_META, '');
    htmlCache.set(key, html);
  }
  return html;
}

/** getWebviewHtml(...args) with the Content-Security-Policy <meta> removed; identical calls are generated once. */
function webviewHtml(...args) {
  const { getWebviewHtml } = require(path.join(__dirname, '../../../dist/webviewTemplate.js'));
  return cachedHtml('dspf', getWebviewHtml, args);
}

/** getMenuWebviewHtml(...args) with the Content-Security-Policy <meta> removed; identical calls are generated once. */
function menuWebviewHtml(...args) {
  const { getMenuWebviewHtml } = require(path.join(__dirname, '../../../dist/menuWebviewTemplate.js'));
  return cachedHtml('menu', getMenuWebviewHtml, args);
}

/**
 * leaseDspfPage(source, fileName, { posted, rect }) - E7h. A DSPF designer page for ONE scenario,
 * built once per process and reused: the first lease builds the page from `source` exactly like
 * newWebviewDom(webviewHtml(...)) did; every later lease sends the page a 'resetViewState' message
 * (view state back to a fresh page's, then `source` loaded), twice - the first pass with the message
 * sink closed so nothing the reset itself provokes (a toggle undone, say) reaches the scenario, the
 * second with the sink open so the scenario sees what a fresh page's first render posts - and then
 * the 'ready' message a fresh page posts last. `posted` receives the page's postMessage calls;
 * `rect` gives every element an 800x480 getBoundingClientRect (10px/col x 20px/row for 80x24), as
 * the click-to-place and drag scenarios need.
 *
 * A lease taken while the previous lessee has not started yet (two scenarios launched back to back) gets
 * an unpooled page of its own. Nested pages inside a scenario that is still using its own page stay on
 * newWebviewDom. A scenario that needs other window stubs (alert, scrollIntoView...) stays on it too.
 * `--isolate`-style opt-out: set ISDA_NO_PAGE_REUSE=1 to build a fresh page for every lease.
 */
const dspfPagePool = new Map();
function leaseDspfPage(source, fileName, options) {
  const o = options || {};
  const rect = !!o.rect;
  const sink = o.posted ? (m) => o.posted.push(m) : null;
  const build = () => {
    const html = webviewHtml('vscode-webview://fake', 'pooledpage', source, fileName);
    return newWebviewDom(html, {
      beforeParse(window) {
        window.__isdaSink = sink;
        window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => { if (window.__isdaSink) window.__isdaSink(m); } });
        if (rect) {
          window.Element.prototype.getBoundingClientRect = function () {
            return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} };
          };
        }
      },
    });
  };
  if (process.env.ISDA_NO_PAGE_REUSE) return build();
  // 'started' is false from the moment a page is leased until the timer queued here fires. A scenario
  // queues its own setTimeout(0) right after leasing, so ours fires first; if the page is leased again
  // before that, two scenarios were started in the same synchronous stretch and are live at once, so
  // the second gets a page of its own (not pooled) instead of resetting the first one's under it.
  const entry = dspfPagePool.get(rect);
  if (!entry) {
    const fresh = build();
    const created = { dom: fresh, started: false };
    dspfPagePool.set(rect, created);
    setTimeout(() => { created.started = true; }, 0);
    return fresh;
  }
  if (!entry.started) return build();
  entry.started = false;
  setTimeout(() => { entry.started = true; }, 0);
  const dom = entry.dom;
  const w = dom.window;
  const reset = () => w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'resetViewState', text: source } }));
  w.__isdaSink = null;
  reset();
  w.__isdaSink = sink;
  reset();
  if (sink) sink({ type: 'ready' });
  return dom;
}

module.exports = { kwd, withAlertCapture, newWebviewDom, webviewHtml, menuWebviewHtml, leaseDspfPage };
