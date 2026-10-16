/**
 * E1f - quick-fixes for the diagnostics E1a/E1b put in the Problems panel.
 *
 * `fixesFor(source, diagnostic, options)` is pure (no `vscode` import): it maps one diagnostic to the
 * edits that would clear it, each built through the same writer the designers use (`apply*Update`,
 * then the modification-tracking and keep-removed-lines settings), so source fidelity (I-202 - I-207)
 * holds: lines the edit does not touch stay verbatim, sequence numbers are re-stamped the way the
 * designers re-stamp them, and a removed line is kept as a comment when `isda.keepRemovedLines` says so.
 *
 * Three fixes:
 *   - `removeKeyword`  the keyword the diagnostic points at is taken off its field, record, help
 *                      specification or the file.
 *   - `addCompanion`   a keyword the rule says is missing is added, when it can be written bare and
 *                      the spec names it (OVERLAY for PUTRETAIN, INDARA for RETKEY / RETCMDKEY). A
 *                      companion that needs a value (WINDOW geometry, an SFLCTL record name) is not
 *                      guessed; the designer is the place for it.
 *   - `openInDesigner` not an edit: the provider turns it into a command.
 *
 * An edit is offered only when it is verified: the fixed source is analysed again and must clear the
 * diagnostic without introducing another one. So a fix never trades one problem for another, and a
 * table entry that is wrong for some source simply does not show.
 *
 * `provideCodeActions` wiring (settings, command, WorkspaceEdit) is in `createProvider`, which takes the
 * vscode API as an argument so it can be tested with a fake.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./dspfWriter.js'), require('./ddsDiagnostics.js'), require('./keywordSpec.js'));
  } else {
    root.DdsQuickFix = factory(root.DspfWriter, root.DdsDiagnostics, root.KeywordSpec);
  }
})(typeof self !== 'undefined' ? self : this, function (DspfWriter, DdsDiagnostics, KeywordSpec) {
  'use strict';

  var CODE_PREFIX = 'isda.';
  var SOURCE = 'iSDA';

  /** Keywords that may be added without a parameter list even when the spec has no `noParameters` flag. */
  var BARE_ALLOWED = { OVERLAY: true, INDARA: true };

  function splitLines(text) {
    return String(text == null ? '' : text).split(/\r\n|\r|\n/);
  }

  // ---------------------------------------------------------------------
  // Locating what a diagnostic points at.
  // ---------------------------------------------------------------------

  function sameKeyword(kw, diagnostic) {
    return String(kw.name || '').toUpperCase() === String(diagnostic.keyword || '').toUpperCase() &&
      !!kw.sourceLines && kw.sourceLines[0] === diagnostic.line;
  }

  /**
   * Finds the keyword a diagnostic is on in the parsed model: { level, record, entry, ki } or null.
   * `level` is 'file' | 'record' | 'field' | 'help'; `entry` is the field or help specification for the
   * last two.
   */
  function locate(model, diagnostic) {
    if (!model || !diagnostic || !diagnostic.keyword) return null;
    var i, j, k;
    var fileKeywords = model.fileKeywords || [];
    for (k = 0; k < fileKeywords.length; k++) {
      if (sameKeyword(fileKeywords[k], diagnostic)) return { level: 'file', record: null, entry: null, ki: k };
    }
    var records = model.records || [];
    for (i = 0; i < records.length; i++) {
      var rec = records[i];
      var rk = rec.keywords || [];
      for (k = 0; k < rk.length; k++) {
        if (sameKeyword(rk[k], diagnostic)) return { level: 'record', record: rec, entry: null, ki: k };
      }
      var lists = [['field', rec.fields || []], ['help', rec.helpEntries || []]];
      for (j = 0; j < lists.length; j++) {
        for (var f = 0; f < lists[j][1].length; f++) {
          var entry = lists[j][1][f];
          var ek = entry.keywords || [];
          for (k = 0; k < ek.length; k++) {
            if (sameKeyword(ek[k], diagnostic)) return { level: lists[j][0], record: rec, entry: entry, ki: k };
          }
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // Building the new source lines through the writer.
  // ---------------------------------------------------------------------

  /** Replaces the keyword list of `where` with `keywords`, through the writer. */
  function applyKeywords(model, lines, where, keywords) {
    if (where.level === 'file') return DspfWriter.applyFileKeywordsUpdate(model, lines, keywords);
    if (where.level === 'record') return DspfWriter.applyRecordUpdate(where.record, lines, { keywords: keywords });
    return DspfWriter.applyFieldUpdate(where.entry, lines, { keywords: keywords });
  }

  function keywordsOf(model, where) {
    if (where.level === 'file') return model.fileKeywords || [];
    if (where.level === 'record') return where.record.keywords || [];
    return where.entry.keywords || [];
  }

  function bareKeyword(name) {
    return { name: name, parameters: '', conditions: [], raw: name, sourceLines: [] };
  }

  function hasKeyword(list, name) {
    var up = String(name).toUpperCase();
    return (list || []).some(function (k) { return String(k.name || '').toUpperCase() === up; });
  }

  /** Applies the designers' post-processing: keep-removed-lines (a writer setting) and modification tracking. */
  function withEditSettings(options, build) {
    options = options || {};
    var tracking = options.tracking || { enabled: false };
    var tagged = !!(tracking.enabled && tracking.tag);
    var previous = DspfWriter.getKeepRemovedLines();
    // The designers switch keep-removed off while tracking is on: tracking already comments out what it replaces.
    DspfWriter.setKeepRemovedLines(options.keepRemoved !== false && !tagged);
    try {
      return build();
    } finally {
      DspfWriter.setKeepRemovedLines(previous);
    }
  }

  function track(oldLines, newLines, options) {
    var tracking = (options && options.tracking) || { enabled: false };
    if (!tracking.enabled) return newLines;
    return DspfWriter.applyModificationTracking(oldLines, newLines, tracking);
  }

  // ---------------------------------------------------------------------
  // Which companions a keyword needs: read from the spec, not from the message.
  // ---------------------------------------------------------------------

  function recordTypeEntry(name) {
    var types = KeywordSpec && KeywordSpec.RECORD_TYPES;
    return types ? types[String(name).toUpperCase()] || null : null;
  }

  function canBeBare(name) {
    var up = String(name).toUpperCase();
    if (BARE_ALLOWED[up]) return true;
    var entry = recordTypeEntry(up);
    return !!(entry && entry.noParameters === true);
  }

  /** [{ name, level: 'file' | 'record' }] the keyword's own spec says must be present, bare-writable ones only. */
  function companionsOf(keywordName) {
    var entry = recordTypeEntry(keywordName);
    var out = [];
    if (!entry) return out;
    (entry.requiresInFile || []).forEach(function (n) {
      if (canBeBare(n)) out.push({ name: String(n).toUpperCase(), level: 'file' });
    });
    if (entry.requiresRecordKeyword && canBeBare(entry.requiresRecordKeyword)) {
      out.push({ name: String(entry.requiresRecordKeyword).toUpperCase(), level: 'record' });
    }
    return out;
  }

  // ---------------------------------------------------------------------
  // Verifying a fix.
  // ---------------------------------------------------------------------

  function key(d) {
    return [d.code, d.keyword || '', d.record || ''].join('|');
  }

  function counts(diagnostics) {
    var map = {};
    diagnostics.forEach(function (d) { map[key(d)] = (map[key(d)] || 0) + 1; });
    return map;
  }

  /** True when `after` has fewer of the diagnostic's own kind than `before` and nothing `before` did not have. */
  function clears(before, after, diagnostic) {
    var b = counts(before);
    var a = counts(after);
    var own = key(diagnostic);
    if ((a[own] || 0) >= (b[own] || 0)) return false;
    return Object.keys(a).every(function (k) { return a[k] <= (b[k] || 0); });
  }

  // ---------------------------------------------------------------------
  // The fixes.
  // ---------------------------------------------------------------------

  /**
   * The quick-fixes for one diagnostic. `options`:
   *   analysis   an `analyze(source)` result for this exact source (the provider shares one per request)
   *   keepRemoved, tracking   the isda.keepRemovedLines and modification-tracking settings
   *   verify     false skips the re-analysis (tests only)
   * Returns [{ id, title, preferred, newLines }], newLines being the whole fixed source.
   */
  function fixesFor(source, diagnostic, options) {
    options = options || {};
    var out = [];
    if (!diagnostic || String(diagnostic.code || '').indexOf(CODE_PREFIX) !== 0) return out;
    var lines = splitLines(source);
    var analysis = options.analysis || DdsDiagnostics.analyze(source);
    var model = analysis.model;
    var where = locate(model, diagnostic);
    if (!where) return out;
    var before = analysis.diagnostics;

    function candidate(id, title, preferred, build) {
      var newLines;
      try {
        newLines = withEditSettings(options, function () { return build(); });
        newLines = track(lines, newLines, options);
      } catch (e) {
        return;
      }
      if (!newLines || newLines.join('\n') === lines.join('\n')) return;
      if (options.verify !== false) {
        var after = DdsDiagnostics.analyze(newLines.join('\n'), { severity: options.severity, disabled: options.disabled });
        var shown = options.diagnosticsBefore || before;
        if (!clears(shown, after.diagnostics, diagnostic)) return;
      }
      out.push({ id: id, title: title, preferred: preferred, newLines: newLines });
    }

    var name = String(diagnostic.keyword).toUpperCase();

    // Add a missing companion first: it keeps what the author wrote.
    companionsOf(name).forEach(function (c) {
      var target = c.level === 'file' ? { level: 'file', record: null, entry: null } : { level: 'record', record: where.record, entry: null };
      if (c.level === 'record' && where.level !== 'record') return;
      if (hasKeyword(keywordsOf(model, target), c.name)) return;
      candidate(
        'addCompanion:' + c.name,
        'Add ' + c.name + (c.level === 'file' ? ' to the file' : ' to record format ' + (where.record.name || '')).replace(/ $/, ''),
        true,
        function () { return applyKeywords(model, lines, target, keywordsOf(model, target).concat([bareKeyword(c.name)])); }
      );
    });

    candidate('removeKeyword', 'Remove ' + name, false, function () {
      var list = keywordsOf(model, where).filter(function (k, idx) { return idx !== where.ki; });
      return applyKeywords(model, lines, where, list);
    });

    return out;
  }

  // ---------------------------------------------------------------------
  // Turning a whole-source result into one text edit.
  // ---------------------------------------------------------------------

  /**
   * The smallest whole-line edit from `oldLines` to `newLines`:
   * { start: {line, character}, end: {line, character}, newText } in zero-based positions, `eol` being the
   * document's line ending. Untouched lines at both ends are left alone.
   */
  function toTextEdit(oldLines, newLines, eol) {
    eol = eol || '\n';
    var max = Math.min(oldLines.length, newLines.length);
    var prefix = 0;
    while (prefix < max && oldLines[prefix] === newLines[prefix]) prefix++;
    var suffix = 0;
    while (suffix < max - prefix && oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]) suffix++;
    var oldEnd = oldLines.length - suffix; // exclusive
    var added = newLines.slice(prefix, newLines.length - suffix);

    // The edit runs to the end of the document: no line follows, so there is no line ending to carry.
    if (oldEnd >= oldLines.length) {
      var lastLine = oldLines.length - 1;
      var lastEnd = { line: lastLine, character: oldLines[lastLine].length };
      if (prefix >= oldLines.length) {
        // Lines only appended: an empty range at the end of the last line, the line ending going in front of them.
        return { start: lastEnd, end: lastEnd, newText: added.length ? eol + added.join(eol) : '' };
      }
      if (!added.length && prefix > 0) {
        // The tail is removed: take the line ending before it as well.
        return { start: { line: prefix - 1, character: oldLines[prefix - 1].length }, end: lastEnd, newText: '' };
      }
      return { start: { line: prefix, character: 0 }, end: lastEnd, newText: added.join(eol) };
    }
    return {
      start: { line: prefix, character: 0 },
      end: { line: oldEnd, character: 0 },
      newText: added.length ? added.join(eol) + eol : '',
    };
  }

  // ---------------------------------------------------------------------
  // The VS Code provider.
  // ---------------------------------------------------------------------

  /**
   * `deps`:
   *   getSettings()           -> { enable, openInDesigner }
   *   getEditSettings()       -> { keepRemoved, tracking: { enabled, tag, position } }
   *   shouldProvide(document) -> boolean
   *   designerViewType(document) -> the custom editor view type to open the document in, or null
   */
  function createProvider(vscode, deps) {
    var cache = { key: null, analysis: null };

    function analysisFor(document) {
      var k = document.uri.toString() + '@' + document.version;
      if (cache.key !== k) cache = { key: k, analysis: DdsDiagnostics.analyze(document.getText()) };
      return cache.analysis;
    }

    function actionFor(document, diagnostic, fix, source) {
      var action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
      action.diagnostics = [diagnostic];
      action.isPreferred = !!fix.preferred;
      var edit = toTextEdit(source.lines, fix.newLines, document.eol === 2 ? '\r\n' : '\n');
      var range = new vscode.Range(edit.start.line, edit.start.character, edit.end.line, edit.end.character);
      action.edit = new vscode.WorkspaceEdit();
      action.edit.replace(document.uri, range, edit.newText);
      return action;
    }

    return {
      provideCodeActions: function (document, range, context) {
        var settings = deps.getSettings();
        if (!settings.enable || !deps.shouldProvide(document)) return [];
        var mine = (context.diagnostics || []).filter(function (d) {
          return d.source === SOURCE && typeof d.code === 'string' && d.code.indexOf(CODE_PREFIX) === 0;
        });
        if (!mine.length) return [];
        var actions = [];
        var source = { text: document.getText() };
        source.lines = splitLines(source.text);
        var analysis = analysisFor(document);
        var editSettings = deps.getEditSettings();
        mine.forEach(function (vd) {
          var diagnostic = matchDiagnostic(analysis, vd);
          if (diagnostic) {
            fixesFor(source.text, diagnostic, {
              analysis: analysis,
              keepRemoved: editSettings.keepRemoved,
              tracking: editSettings.tracking,
            }).forEach(function (fix) { actions.push(actionFor(document, vd, fix, source)); });
          }
          var viewType = settings.openInDesigner !== false ? deps.designerViewType(document) : null;
          if (viewType) {
            var open = new vscode.CodeAction('Open in designer', vscode.CodeActionKind.QuickFix);
            open.diagnostics = [vd];
            open.command = { title: 'Open in designer', command: 'vscode.openWith', arguments: [document.uri, viewType] };
            actions.push(open);
          }
        });
        return actions;
      },
    };
  }

  /** E1a's own diagnostic behind a Problems-panel entry (the hub keeps code and position; E1a knows the keyword). */
  function matchDiagnostic(analysis, vd) {
    var line = vd.range.start.line + 1;
    var column = vd.range.start.character + 1;
    return (analysis.diagnostics || []).filter(function (d) {
      return d.code === vd.code && d.line === line && d.column === column;
    })[0] || null;
  }

  return {
    fixesFor: fixesFor,
    toTextEdit: toTextEdit,
    locate: locate,
    companionsOf: companionsOf,
    createProvider: createProvider,
  };
});
