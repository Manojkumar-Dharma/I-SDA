/**
 * ddsOutline.js (E1e)
 *
 * Outline and navigation for DDS sources opened in the text editor. Pure module (no `vscode` import): the source
 * in, a tree of symbols or a definition target out. `createProvider` is the VS Code side and takes the API as an
 * argument, like the hover, the completion and the diagnostics hub.
 *
 * Outline (`symbolsOf`). One node per record format, with its fields, constants and help specifications as
 * children. A record's `detail` says what it is: a subfile (and the control record that drives it), a subfile
 * control (and its subfile), a window, a pull-down, a menu bar, a user-defined record; the subfile pair is found
 * from SFLCTL(record). Ranges run from the entry's first line to the line before the next entry, without the
 * blank and comment lines that trail it; the selection range is the name in columns 19-28.
 *
 * Go to definition (`definitionAt`). On the record-format name inside SFLCTL(...), WINDOW(...) or
 * MNUBARCHC(...) - the keywords keywordSpec.js's RECORD_REFERENCES table lists, read through
 * `recordReferenceKeywords` / `recordReferenceLocator` / `recordReferenceName` so the table stays the one place
 * that says where the name sits - the target is the name of that record format in its R line. A WINDOW given
 * inline geometry (WINDOW(5 5 10 40)) or *DFT has no record name and no definition.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var parser;
    try { parser = require('./dspfParser.js'); } catch (e) { parser = require('../dist/dspfParser.js'); }
    module.exports = factory(require('./ddsHover.js'), require('./keywordSpec.js'), parser);
  } else {
    root.DdsOutline = factory(root.DdsHover, root.KeywordSpec, root.DspfParser);
  }
})(typeof self !== 'undefined' ? self : this, function (DdsHover, KeywordSpec, DspfParser) {
  'use strict';

  var NAME_START = 18; // zero-based index of column 19 (name)
  var NAME_LENGTH = 10;

  function isBlankLine(raw) { return /^\s*$/.test(raw) || /^\s*A?\s*$/.test(raw); }
  function isCommentLine(raw) { return raw.charAt(6) === '*'; }

  // ---- the outline -------------------------------------------------------------------------------------------------

  /** Where the name sits in an entry's first line: { line, startCharacter, endCharacter } (zero-based), or a
   *  fallback over the keyword area when the entry has no name (a constant). */
  function selectionOf(lines, line0, hasName) {
    var raw = lines[line0] || '';
    if (hasName) {
      var field = raw.substr(NAME_START, NAME_LENGTH);
      var m = /\S+/.exec(field);
      if (m) return { line: line0, startCharacter: NAME_START + m.index, endCharacter: NAME_START + m.index + m[0].length };
    }
    var start = Math.min(DdsHover.KEYWORD_AREA_START, raw.length);
    return { line: line0, startCharacter: start, endCharacter: Math.max(start, raw.replace(/\s+$/, '').length) };
  }

  /** The last line at or before `limit` that is neither blank nor a comment, but not before `first`. */
  function lastContentLine(lines, first, limit) {
    var i = Math.min(limit, lines.length - 1);
    while (i > first && (isBlankLine(lines[i]) || isCommentLine(lines[i]))) i--;
    return i;
  }

  function keywordNames(record) {
    var names = {};
    (record.keywords || []).forEach(function (k) { names[String(k.name).toUpperCase()] = k; });
    return names;
  }

  /** { subfileToControls, controlToSubfile }: the SFLCTL(record) pairs, by upper-case record name. */
  function subfilePairs(records) {
    var toControls = {};
    var toSubfile = {};
    records.forEach(function (r) {
      (r.keywords || []).forEach(function (k) {
        if (String(k.name).toUpperCase() !== 'SFLCTL') return;
        var target = KeywordSpec.recordReferenceName('SFLCTL', k.parameters);
        if (!target) return;
        var key = target.toUpperCase();
        (toControls[key] = toControls[key] || []).push(r.name);
        toSubfile[String(r.name).toUpperCase()] = target;
      });
    });
    return { subfileToControls: toControls, controlToSubfile: toSubfile };
  }

  function recordDetail(record, pairs) {
    var kw = keywordNames(record);
    var key = String(record.name).toUpperCase();
    var parts = [];
    if (kw.SFLCTL) parts.push(pairs.controlToSubfile[key] ? 'subfile control for ' + pairs.controlToSubfile[key] : 'subfile control');
    if (kw.SFL) parts.push(pairs.subfileToControls[key] ? 'subfile, control ' + pairs.subfileToControls[key].join(', ') : 'subfile');
    if (kw.MNUBAR) parts.push('menu bar');
    if (kw.PULLDOWN) parts.push('pull-down');
    if (kw.WINDOW) parts.push('window');
    if (kw.USRDFN) parts.push('user-defined');
    return parts.join(', ');
  }

  function constantLabel(entry) {
    var text = entry.constantValue == null ? '' : String(entry.constantValue).replace(/^'|'$/g, '').replace(/''/g, "'").trim();
    if (!text) text = '(constant)';
    return text.length > 40 ? text.substring(0, 37) + '...' : text;
  }

  /**
   * The outline of `source`: an array of record nodes
   * { name, detail, kind: 'record', range: { startLine, endLine }, selection: { line, startCharacter, endCharacter }, children }.
   * A child has kind 'field', 'constant' or 'help'. Lines are zero-based. A source the parser cannot read gives [].
   */
  function symbolsOf(source, options) {
    options = options || {};
    var parser = options.parser || DspfParser;
    var text = String(source);
    var lines = text.split(/\r\n|\r|\n/);
    var model;
    try { model = parser.parseDspf(text); } catch (e) { return []; }
    var records = (model && model.records) || [];
    var pairs = subfilePairs(records);
    var out = [];
    records.forEach(function (record, index) {
      var startLine = record.sourceLine - 1;
      if (startLine < 0 || startLine >= lines.length) return;
      var nextStart = index + 1 < records.length ? records[index + 1].sourceLine - 1 : lines.length;
      var endLine = lastContentLine(lines, startLine, nextStart - 1);
      var entries = [];
      (record.fields || []).forEach(function (f) { entries.push({ entry: f, kind: f.name ? 'field' : 'constant' }); });
      (record.helpEntries || []).forEach(function (h) { entries.push({ entry: h, kind: 'help' }); });
      entries.sort(function (a, b) { return a.entry.sourceLine - b.entry.sourceLine; });
      var children = entries.map(function (item, i) {
        var line0 = item.entry.sourceLine - 1;
        var limit = i + 1 < entries.length ? entries[i + 1].entry.sourceLine - 2 : endLine;
        var last = lastContentLine(lines, line0, Math.max(limit, line0));
        var named = item.kind !== 'constant' && !!item.entry.name;
        return {
          name: item.kind === 'constant' ? constantLabel(item.entry) : (item.entry.name || (item.kind === 'help' ? 'Help specification' : '(unnamed)')),
          detail: item.kind === 'help' ? 'help specification' : '',
          kind: item.kind,
          range: { startLine: line0, endLine: Math.max(last, line0) },
          selection: selectionOf(lines, line0, named),
          children: []
        };
      });
      out.push({
        name: record.name || '(unnamed)',
        detail: recordDetail(record, pairs),
        kind: 'record',
        range: { startLine: startLine, endLine: Math.max(endLine, startLine) },
        selection: selectionOf(lines, startLine, true),
        children: children
      });
    });
    return out;
  }

  // ---- go to definition --------------------------------------------------------------------------------------------

  /**
   * The definition of the record-format name at (`line`, `character`), or null: { name, keyword, origin, target }.
   * `origin` is the name's range where the cursor is; `target` is the name in the R line of that record format plus the
   * record's range. Null when the cursor is not on such a name, or no record format of that name exists.
   */
  function definitionAt(source, line, character, options) {
    options = options || {};
    var parser = options.parser || DspfParser;
    var text = String(source);
    var lines = text.split(/\r\n|\r|\n/);
    if (line < 0 || line >= lines.length || character < DdsHover.KEYWORD_AREA_START) return null;
    var info = DdsHover.scan(lines, lines.length - 1);
    var here = info[line];
    if (here.comment || here.blank) return null;
    var chain = DdsHover.chainText(lines, here.chainStart);
    var tokens = DdsHover.tokenize(chain.chars);
    var referenceKeywords = KeywordSpec.recordReferenceKeywords();
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t];
      var kw = tok.text.toUpperCase();
      if (tok.depth !== 0 || referenceKeywords.indexOf(kw) < 0 || tok.close === undefined) continue;
      var invocation = chain.chars.slice(tok.first, tok.close + 1).join('');
      var m = KeywordSpec.recordReferenceLocator(kw).exec(invocation);
      if (!m) continue;
      var params = invocation.substring(invocation.indexOf('(') + 1, invocation.lastIndexOf(')'));
      var name = KeywordSpec.recordReferenceName(kw, params);
      if (!name || name !== m[2]) continue;
      var start = tok.first + m[1].length;
      var end = start + m[2].length; // exclusive
      var first = -1;
      var lastChar = -1;
      for (var i = start; i < end; i++) {
        if (chain.pos[i].line !== line) continue;
        if (first < 0) first = chain.pos[i].character;
        lastChar = chain.pos[i].character;
      }
      if (first < 0 || character < first || character > lastChar + 1) continue;
      var model;
      try { model = parser.parseDspf(text); } catch (e) { return null; }
      var wanted = name.toUpperCase();
      var found = null;
      ((model && model.records) || []).forEach(function (r, index, all) {
        if (found || String(r.name).toUpperCase() !== wanted) return;
        var startLine = r.sourceLine - 1;
        var nextStart = index + 1 < all.length ? all[index + 1].sourceLine - 1 : lines.length;
        found = { startLine: startLine, endLine: lastContentLine(lines, startLine, nextStart - 1) };
      });
      if (!found) return null;
      var sel = selectionOf(lines, found.startLine, true);
      return {
        name: name,
        keyword: kw,
        origin: { line: line, startCharacter: first, endCharacter: lastChar + 1 },
        target: { line: sel.line, startCharacter: sel.startCharacter, endCharacter: sel.endCharacter, rangeStartLine: found.startLine, rangeEndLine: found.endLine }
      };
    }
    return null;
  }

  // ---- the VS Code side --------------------------------------------------------------------------------------------

  /**
   * One provider object with provideDocumentSymbols and provideDefinition for the DDS documents `shouldProvide`
   * accepts. `getSettings()` answers { outline, definition } (both booleans).
   */
  function createProvider(vscodeApi, options) {
    var kinds = {
      record: vscodeApi.SymbolKind.Struct,
      field: vscodeApi.SymbolKind.Field,
      constant: vscodeApi.SymbolKind.String,
      help: vscodeApi.SymbolKind.Interface
    };
    function toRange(r) { return new vscodeApi.Range(r.startLine, 0, r.endLine, 10000); }
    function toSelection(s) { return new vscodeApi.Range(s.line, s.startCharacter, s.line, s.endCharacter); }
    function toSymbol(node) {
      var symbol = new vscodeApi.DocumentSymbol(node.name, node.detail, kinds[node.kind], toRange(node.range), toSelection(node.selection));
      symbol.children = node.children.map(toSymbol);
      return symbol;
    }
    return {
      provideDocumentSymbols: function (textDocument) {
        var settings = options.getSettings();
        if (!settings || settings.outline === false) return undefined;
        if (!options.shouldProvide(textDocument)) return undefined;
        return symbolsOf(textDocument.getText()).map(toSymbol);
      },
      provideDefinition: function (textDocument, position) {
        var settings = options.getSettings();
        if (!settings || settings.definition === false) return undefined;
        if (!options.shouldProvide(textDocument)) return undefined;
        var d = definitionAt(textDocument.getText(), position.line, position.character);
        if (!d) return undefined;
        return [{
          originSelectionRange: new vscodeApi.Range(d.origin.line, d.origin.startCharacter, d.origin.line, d.origin.endCharacter),
          targetUri: textDocument.uri,
          targetRange: new vscodeApi.Range(d.target.rangeStartLine, 0, d.target.rangeEndLine, 10000),
          targetSelectionRange: new vscodeApi.Range(d.target.line, d.target.startCharacter, d.target.line, d.target.endCharacter)
        }];
      }
    };
  }

  return {
    symbolsOf: symbolsOf,
    definitionAt: definitionAt,
    createProvider: createProvider
  };
});
