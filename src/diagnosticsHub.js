/**
 * diagnosticsHub.js (E1b)
 *
 * The one DiagnosticCollection every iSDA diagnostic goes through (the "shared hub" of the E1
 * roadmap). It runs ddsDiagnostics.js (E1a) over open DDS documents and publishes the result to
 * the Problems panel; later sources (compile messages E2d, message-file checks E4d) publish
 * through `setSource` into the same collection, so a file's problems from every source sit
 * together and each source can be cleared on its own.
 *
 * The VS Code API is passed in (`vscodeApi`), the way messageFile.js takes its connection, so the
 * whole thing runs under Node with a fake in the tests; extension.ts passes the real `vscode`
 * together with the two things only it knows: which documents are DDS sources (`shouldAnalyze`)
 * and where the settings live (`getSettings`).
 *
 * Behaviour:
 *   - a document is analysed when it opens, and again 300 ms after the last change to it;
 *   - closing it clears its diagnostics from the `rules` source;
 *   - `isda.diagnostics.enable` off clears every `rules` diagnostic and stops analysing;
 *   - `isda.diagnostics.severity` maps a rule code to error / warning / information / hint / off.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./ddsDiagnostics.js'));
  } else {
    root.DiagnosticsHub = factory(root.DdsDiagnostics);
  }
})(typeof self !== 'undefined' ? self : this, function (DdsDiagnostics) {
  'use strict';

  var RULES_SOURCE = 'rules';
  var DEFAULT_DEBOUNCE_MS = 300;
  var SEVERITIES = ['error', 'warning', 'information', 'hint'];

  /** The severity map from the settings, cleaned: only known rule codes, only known values
   *  (a severity or 'off'); anything else is ignored rather than breaking the run. */
  function sanitizeSeverityMap(value) {
    var out = {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) return out;
    var known = DdsDiagnostics.allCodes();
    Object.keys(value).forEach(function (code) {
      var v = typeof value[code] === 'string' ? value[code].toLowerCase() : '';
      if (known.indexOf(code) >= 0 && (v === 'off' || SEVERITIES.indexOf(v) >= 0)) out[code] = v;
    });
    return out;
  }

  /**
   * createHub(vscodeApi, options) -> hub
   *
   * options:
   *   shouldAnalyze(document) -> boolean   which documents are DDS sources (required)
   *   getSettings() -> { enable, severity }   read fresh on every use
   *   analyze                              default DdsDiagnostics.analyze
   *   debounceMs                           default 300
   *   schedule(fn, ms) -> handle, cancel(handle)   default setTimeout / clearTimeout (a test seam)
   *   onInternalErrors(uri, list)          called when a guard threw (analysis went on without it)
   *
   * hub: start(), dispose(), refresh(document), refreshAll(), setSource(uri, source, diagnostics),
   *      clearSource(uri, source), collection.
   */
  function createHub(vscodeApi, options) {
    options = options || {};
    var shouldAnalyze = options.shouldAnalyze || function () { return false; };
    var getSettings = options.getSettings || function () { return { enable: true, severity: {} }; };
    var analyze = options.analyze || DdsDiagnostics.analyze;
    var debounceMs = options.debounceMs == null ? DEFAULT_DEBOUNCE_MS : options.debounceMs;
    var schedule = options.schedule || function (fn, ms) { return setTimeout(fn, ms); };
    var cancel = options.cancel || function (h) { clearTimeout(h); };

    var collection = vscodeApi.languages.createDiagnosticCollection('iSDA');
    var sources = new Map(); // uri string -> Map(source name -> vscode.Diagnostic[])
    var pending = new Map(); // uri string -> timer handle
    var subscriptions = [];
    var disposed = false;

    function key(uri) { return uri.toString(); }

    function publish(uri) {
      var bySource = sources.get(key(uri));
      var all = [];
      if (bySource) bySource.forEach(function (list) { all = all.concat(list); });
      if (all.length) collection.set(uri, all); else collection.delete(uri);
    }

    function setSource(uri, source, diagnostics) {
      var k = key(uri);
      var bySource = sources.get(k);
      if (!bySource) { bySource = new Map(); sources.set(k, bySource); }
      if (diagnostics && diagnostics.length) bySource.set(source, diagnostics); else bySource.delete(source);
      if (!bySource.size) sources.delete(k);
      publish(uri);
    }

    function clearSource(uri, source) { setSource(uri, source, []); }

    function settings() {
      var s = getSettings() || {};
      return { enable: s.enable !== false, severity: sanitizeSeverityMap(s.severity) };
    }

    function toVsCode(d) {
      var sev = vscodeApi.DiagnosticSeverity;
      var level = { error: sev.Error, warning: sev.Warning, information: sev.Information, hint: sev.Hint }[d.severity] ;
      var range = new vscodeApi.Range(d.line - 1, d.column - 1, d.line - 1, d.endColumn - 1);
      var out = new vscodeApi.Diagnostic(range, d.message, level == null ? sev.Error : level);
      out.code = d.code;
      out.source = d.source;
      return out;
    }

    function cancelPending(k) {
      if (pending.has(k)) { cancel(pending.get(k)); pending.delete(k); }
    }

    /** Analyse one document now and publish the result (or clear it when the feature is off, or
     *  the document is not a DDS source). */
    function refresh(document) {
      if (disposed) return;
      var k = key(document.uri);
      cancelPending(k);
      var s = settings();
      if (!s.enable || document.isClosed || !shouldAnalyze(document)) {
        clearSource(document.uri, RULES_SOURCE);
        return;
      }
      var result = analyze(document.getText(), { severity: s.severity });
      if (result.internalErrors && result.internalErrors.length && options.onInternalErrors) {
        options.onInternalErrors(document.uri, result.internalErrors);
      }
      setSource(document.uri, RULES_SOURCE, result.diagnostics.map(toVsCode));
    }

    function refreshAll() {
      (vscodeApi.workspace.textDocuments || []).forEach(refresh);
    }

    function onChange(event) {
      var document = event.document;
      var s = settings();
      if (!s.enable || !shouldAnalyze(document)) return;
      var k = key(document.uri);
      cancelPending(k);
      pending.set(k, schedule(function () {
        pending.delete(k);
        refresh(document);
      }, debounceMs));
    }

    function onClose(document) {
      cancelPending(key(document.uri));
      clearSource(document.uri, RULES_SOURCE);
    }

    function onConfig(event) {
      if (event && typeof event.affectsConfiguration === 'function' && !event.affectsConfiguration('isda.diagnostics')) return;
      refreshAll();
    }

    function start() {
      var ws = vscodeApi.workspace;
      subscriptions.push(ws.onDidOpenTextDocument(refresh));
      subscriptions.push(ws.onDidChangeTextDocument(onChange));
      subscriptions.push(ws.onDidCloseTextDocument(onClose));
      subscriptions.push(ws.onDidChangeConfiguration(onConfig));
      refreshAll();
    }

    function dispose() {
      disposed = true;
      pending.forEach(function (h) { cancel(h); });
      pending.clear();
      subscriptions.forEach(function (s) { if (s && typeof s.dispose === 'function') s.dispose(); });
      subscriptions = [];
      sources.clear();
      collection.dispose();
    }

    return {
      collection: collection,
      start: start,
      dispose: dispose,
      refresh: refresh,
      refreshAll: refreshAll,
      setSource: setSource,
      clearSource: clearSource,
    };
  }

  return {
    createHub: createHub,
    sanitizeSeverityMap: sanitizeSeverityMap,
    RULES_SOURCE: RULES_SOURCE,
    DEFAULT_DEBOUNCE_MS: DEFAULT_DEBOUNCE_MS,
  };
});
