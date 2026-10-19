/**
 * compileDiagnostics.js - E2d: turn a failed CRTDSPF / CRTS36DSPF into diagnostics for the editor.
 *
 * It joins the three earlier pieces and has no `vscode` import, so it runs in Node and in the tests:
 *   E2i  CompileListing.fetchCompileListing   the compile listing text from the IBM i (or a reason it is not there)
 *   E2b  CompileMessages.parseListing         listing text -> messages  (fallback: parseCommandText on the command's error text)
 *   E2c  CompileLineMap.mapMessages           messages -> lines of the text the editor holds
 * and hands the diagnostics hub (diagnosticsHub.js `setTrackedSource`) plain `{ line, column, endColumn, severity, message,
 * code, source, fileLevel }` objects, the same shape ddsDiagnostics.js produces (1-based line and column).
 *
 *   var mark = await CompileListing.beginCompile(connection);                  // before the command
 *   ... run the command; it failed with `commandText` ...
 *   var fb = await CompileDiagnostics.collectCompileFeedback(connection, {
 *     fileName: 'TESTDSP', source: 'CRTDSPF', sourceText: editorText, mark: mark, commandText: text }, hooks);
 *   hub.setTrackedSource(uri, fb.source, fb.diagnostics);
 *
 * Rules.
 *   - A message that maps to a line becomes a diagnostic on that line (whole line, the E2c rule).
 *   - A message with no line (the escape message, a line edited since the compile, an unknown layout, the command text)
 *     becomes a FILE-LEVEL diagnostic on line 1, marked `fileLevel: true`: the hub keeps it where it is whatever is
 *     edited. A note in the text says why it is not on a line when that is not obvious.
 *   - Severity follows the listing's bands (info -> information, warning -> warning, error and severe -> error, unknown ->
 *     warning). Command text has no severity, so the message ID decides: CPC and CPI information, CPD warning, the rest error.
 *   - `noise` messages (SQL...) are left out. Never throws: any failure inside returns `ok: false` with an `error`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./compileMessages.js'), require('./compileListing.js'), require('./compileLineMap.js'));
  } else {
    root.CompileDiagnostics = factory(root.CompileMessages, root.CompileListing, root.CompileLineMap);
  }
})(typeof self !== 'undefined' ? self : this, function (CompileMessages, CompileListing, CompileLineMap) {
  'use strict';

  var REASON_NOTES = {
    'line-changed': 'the line was edited after the compile, so this could not be placed on a line',
    'out-of-range': 'the listing is longer than the source now is, so this could not be placed on a line',
    'ambiguous-sequence': 'two lines have this sequence number, so this could not be placed on a line',
    'sequence-not-found': 'no line has this sequence number any more, so this could not be placed on a line',
    'no-sequence-numbers': 'the source has no sequence numbers to find the line by, so this could not be placed on a line'
  };

  function severityName(message, via) {
    if (via === 'command') {
      // The command's error text carries no severity; the message type in the ID says enough: CPC (completion) and CPI
      // (information) are information, CPD (diagnostic) a warning, everything else (CPF escape and the rest) an error.
      var prefix = String(message.msgId || '').slice(0, 3).toUpperCase();
      if (prefix === 'CPC' || prefix === 'CPI') return 'information';
      if (prefix === 'CPD') return 'warning';
      return 'error';
    }
    var cls = CompileMessages.severityClass(message.severity);
    if (cls === 'info') return 'information';
    if (cls === 'warning') return 'warning';
    if (cls === 'error' || cls === 'severe') return 'error';
    return 'warning';
  }

  function firstLineLength(sourceText) {
    var text = Array.isArray(sourceText) ? String(sourceText[0] || '') : String(sourceText == null ? '' : sourceText).split(/\r\n|\r|\n/)[0];
    return text.length;
  }

  /**
   * toDiagnostics(parsed, sourceText, options) -> { diagnostics, mapped, fileLevel, alignment }
   * options: { via: 'listing' | 'command', source: 'CRTDSPF' }
   */
  function toDiagnostics(parsed, sourceText, options) {
    options = options || {};
    var via = options.via || 'listing';
    var source = options.source || 'CRTDSPF';
    var map = CompileLineMap.mapMessages(parsed, sourceText);
    var out = { diagnostics: [], mapped: 0, fileLevel: 0, alignment: map.alignment || null };
    var width = Math.max(2, firstLineLength(sourceText) + 1);
    var list = map.ok ? map.messages : (parsed && parsed.messages) || [];
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (!m || m.noise) continue;
      var text = String(m.text || '').trim() || (m.msgId ? String(m.msgId) : 'Compile message');
      var placed = typeof m.line === 'number' && m.line >= 1;
      if (!placed && via === 'listing' && REASON_NOTES[m.reason]) text += ' (' + REASON_NOTES[m.reason] + ')';
      out.diagnostics.push({
        line: placed ? m.line : 1,
        column: placed ? m.column || 1 : 1,
        endColumn: placed ? Math.max((m.column || 1) + 1, m.endColumn || 2) : width,
        severity: severityName(m, via),
        message: text,
        code: m.msgId || undefined,
        source: source,
        fileLevel: !placed
      });
      if (placed) out.mapped++; else out.fileLevel++;
    }
    return out;
  }

  /**
   * collectCompileFeedback(connection, opts, hooks) -> Promise<{ ok, via, source, raw, diagnostics, mapped, fileLevel,
   *   alignment, listing }>   (never rejects)
   * opts: { fileName, source ('CRTDSPF' | 'CRTS36DSPF'), sourceText, mark: { since, user }, commandText }
   * hooks: passed to CompileListing.fetchCompileListing (ensureLibrary).
   * `via` is 'listing' when the listing was fetched and understood, otherwise 'command' (the command's error text).
   * `raw` is the text for the Output channel; `listing` is the fetch result (ok, or the reason it failed).
   */
  async function collectCompileFeedback(connection, opts, hooks) {
    opts = opts || {};
    var source = opts.source || 'CRTDSPF';
    var result = { ok: false, via: 'command', source: source, raw: '', diagnostics: [], mapped: 0, fileLevel: 0, alignment: null, listing: null };
    try {
      var parsed = null;
      var fetched = null;
      var mark = opts.mark || {};
      if (connection && typeof connection.runSQL === 'function' && opts.fileName) {
        fetched = await CompileListing.fetchCompileListing(connection, { fileName: opts.fileName, user: mark.user, since: mark.since }, hooks);
        if (fetched && fetched.ok) {
          var candidate = CompileMessages.parseListing(fetched.text);
          var real = (candidate.messages || []).filter(function (m) { return !m.noise; });
          if (candidate.recognized && real.length) { parsed = candidate; result.raw = fetched.text; result.via = 'listing'; }
        }
      }
      result.listing = fetched ? { ok: !!fetched.ok, reason: fetched.reason || null, error: fetched.error || null, job: fetched.job || null, cleanupError: fetched.cleanupError || null } : null;
      if (!parsed) {
        parsed = CompileMessages.parseCommandText(String(opts.commandText || ''));
        result.raw = String(opts.commandText || '');
        result.via = 'command';
      }
      var d = toDiagnostics(parsed, opts.sourceText, { via: result.via, source: source });
      result.diagnostics = d.diagnostics;
      result.mapped = d.mapped;
      result.fileLevel = d.fileLevel;
      result.alignment = d.alignment;
      result.ok = true;
    } catch (err) {
      result.error = String(err && err.message ? err.message : err);
    }
    return result;
  }

  return {
    collectCompileFeedback: collectCompileFeedback,
    toDiagnostics: toDiagnostics,
    severityName: severityName,
    REASON_NOTES: REASON_NOTES
  };
});
