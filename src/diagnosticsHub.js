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
 *   - each analysed document has its own analyzer (E1h), which remembers the last text and so asks the
 *     guards again only about the records that changed; closing the document, switching the feature
 *     off or no longer treating it as DDS drops it;
 *   - closing it clears its diagnostics from the `rules` source;
 *   - `isda.diagnostics.enable` off clears every `rules` diagnostic and stops analysing;
 *   - `isda.diagnostics.severity` maps a rule code to error / warning / information / hint / off.
 *   - tracked sources (E2d, compile messages): `setTrackedSource(uri, source, plainDiagnostics)` keeps the plain
 *     diagnostics so they follow edits: a line that is edited loses its diagnostics, lines below move with an
 *     inserted or removed line, a `fileLevel` diagnostic stays where it is; closing the document clears them.
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
   *   analyze(text, options)               one-shot analysis for every document, no memory between
   *                                        edits (a test seam; by default each document gets an analyzer)
   *   createAnalyzer()                     default DdsDiagnostics.createAnalyzer (a test seam)
   *   debounceMs                           default 300
   *   schedule(fn, ms) -> handle, cancel(handle)   default setTimeout / clearTimeout (a test seam)
   *   onInternalErrors(uri, list)          called when a guard threw (analysis went on without it)
   *
   * hub: start(), dispose(), refresh(document), refreshAll(), setSource(uri, source, diagnostics),
   *      clearSource(uri, source), setTrackedSource(uri, source, plain), clearTrackedSource(uri, source), collection.
   */
  function createHub(vscodeApi, options) {
    options = options || {};
    var shouldAnalyze = options.shouldAnalyze || function () { return false; };
    var getSettings = options.getSettings || function () { return { enable: true, severity: {} }; };
    var analyze = options.analyze || null;
    var createAnalyzer = options.createAnalyzer || DdsDiagnostics.createAnalyzer;
    var debounceMs = options.debounceMs == null ? DEFAULT_DEBOUNCE_MS : options.debounceMs;
    var schedule = options.schedule || function (fn, ms) { return setTimeout(fn, ms); };
    var cancel = options.cancel || function (h) { clearTimeout(h); };

    var collection = vscodeApi.languages.createDiagnosticCollection('iSDA');
    var sources = new Map(); // uri string -> Map(source name -> vscode.Diagnostic[])
    var pending = new Map(); // uri string -> timer handle
    var analyzers = new Map(); // uri string -> the document's analyzer (E1h)
    var tracked = new Map(); // uri string -> Map(source name -> plain diagnostics) that follow edits (E2d)
    var trackedListeners = []; // E2e: the designer's panels
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

    /** E2d: a source whose diagnostics follow the text. `plain` is what ddsDiagnostics.js produces (1-based line and
     *  column), plus `fileLevel: true` for one that belongs to the file and not to a line. An empty list clears it. */
    function setTrackedSource(uri, source, plain) { applyTracked(uri, source, plain, 'set'); }

    /** reason: 'set' (a compile put them there), 'edit' (an edit moved or dropped some), 'close' (the document closed). */
    function applyTracked(uri, source, plain, reason) {
      var k = key(uri);
      var list = Array.isArray(plain) ? plain.slice() : [];
      var bySource = tracked.get(k);
      if (list.length) {
        if (!bySource) { bySource = new Map(); tracked.set(k, bySource); }
        bySource.set(source, list);
      } else if (bySource) {
        bySource.delete(source);
        if (!bySource.size) tracked.delete(k);
      }
      setSource(uri, source, list.map(toVsCode));
      var merged = getTracked(uri);
      trackedListeners.slice().forEach(function (l) { try { l(uri, merged, reason); } catch (e) { /* a listener must not break the hub */ } });
    }

    /** Every tracked diagnostic of the document (all sources), by line, as plain objects. */
    function getTracked(uri) {
      var bySource = tracked.get(key(uri));
      var all = [];
      if (bySource) bySource.forEach(function (list) { all = all.concat(list); });
      return all.sort(function (a, b) { return (a.fileLevel ? 0 : 1) - (b.fileLevel ? 0 : 1) || a.line - b.line; });
    }

    /** E2e: told when the tracked diagnostics of any document change: listener(uri, mergedPlainList, reason). */
    function onDidChangeTracked(listener) {
      trackedListeners.push(listener);
      return { dispose: function () { var i = trackedListeners.indexOf(listener); if (i >= 0) trackedListeners.splice(i, 1); } };
    }

    function clearTrackedSource(uri, source) { applyTracked(uri, source, [], 'set'); }

    function countNewlines(text) {
      var m = String(text == null ? '' : text).match(/\r\n|\r|\n/g);
      return m ? m.length : 0;
    }

    /** Where the diagnostics of one tracked source are after one edit (a pure function of the list and the change). */
    function applyChange(list, change) {
      var range = change && change.range;
      if (!range || !range.start || !range.end) return list;
      var startLine = range.start.line;
      var endLine = range.end.line;
      var added = countNewlines(change.text);
      var text = String(change.text == null ? '' : change.text);
      var empty = startLine === endLine && range.start.character === range.end.character;
      // A whole new line typed in front of a line (an insertion at column 0 that ends in a line break) moves that line
      // down without touching its text.
      var pushesDown = empty && range.start.character === 0 && added > 0 && /(\r\n|\r|\n)$/.test(text);
      var delta = added - (endLine - startLine);
      var out = [];
      for (var i = 0; i < list.length; i++) {
        var d = list[i];
        if (d.fileLevel) { out.push(d); continue; }
        var l = d.line - 1;
        if (pushesDown) {
          out.push(l >= startLine ? Object.assign({}, d, { line: d.line + added }) : d);
        } else if (l < startLine) {
          out.push(d);
        } else if (l > endLine) {
          out.push(delta ? Object.assign({}, d, { line: d.line + delta }) : d);
        }
        // else: the edit touched this line, so the message about it is no longer known to be true
      }
      return out;
    }

    function followEdits(event) {
      var bySource = tracked.get(key(event.document.uri));
      var changes = event.contentChanges;
      if (!bySource || !changes || !changes.length) return;
      // later text first, so the lines of the earlier changes are still the ones the diagnostics were made for
      var ordered = changes.slice().sort(function (a, b) { return b.range.start.line - a.range.start.line || b.range.start.character - a.range.start.character; });
      Array.from(bySource.keys()).forEach(function (source) {
        var before = bySource.get(source);
        var after = ordered.reduce(applyChange, before);
        var same = after.length === before.length && after.every(function (d, i) { return d === before[i]; });
        if (!same) applyTracked(event.document.uri, source, after, 'edit');
      });
    }

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

    function analyzerFor(k) {
      var a = analyzers.get(k);
      if (!a) { a = createAnalyzer(); analyzers.set(k, a); }
      return a;
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
        analyzers.delete(k);
        clearSource(document.uri, RULES_SOURCE);
        return;
      }
      var result = analyze
        ? analyze(document.getText(), { severity: s.severity })
        : analyzerFor(k).analyze(document.getText(), { severity: s.severity });
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
      followEdits(event);
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
      analyzers.delete(key(document.uri));
      clearSource(document.uri, RULES_SOURCE);
      var bySource = tracked.get(key(document.uri));
      if (bySource) Array.from(bySource.keys()).forEach(function (source) { applyTracked(document.uri, source, [], 'close'); });
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
      analyzers.clear();
      subscriptions.forEach(function (s) { if (s && typeof s.dispose === 'function') s.dispose(); });
      subscriptions = [];
      tracked.clear();
      trackedListeners.length = 0;
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
      setTrackedSource: setTrackedSource,
      clearTrackedSource: clearTrackedSource,
      getTracked: getTracked,
      onDidChangeTracked: onDidChangeTracked,
    };
  }

  return {
    createHub: createHub,
    sanitizeSeverityMap: sanitizeSeverityMap,
    RULES_SOURCE: RULES_SOURCE,
    DEFAULT_DEBOUNCE_MS: DEFAULT_DEBOUNCE_MS,
  };
});
