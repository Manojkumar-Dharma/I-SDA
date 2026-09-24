/**
 * helpers/common.js - test helpers that used to be copy-pasted per file (I-120).
 *
 *   kwd(name, parameters, conditions)   a parsed-keyword object for the panel builders
 *   withAlertCapture(fn)                run fn with window.alert captured; returns the alert text or null
 *   newWebviewDom(html, options)        JSDOM with the options every full-page test used
 *   webviewHtml(...args)                getWebviewHtml(...args) minus the CSP <meta>, cached per process
 *   menuWebviewHtml(...args)            same for getMenuWebviewHtml
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

module.exports = { kwd, withAlertCapture, newWebviewDom, webviewHtml, menuWebviewHtml };
