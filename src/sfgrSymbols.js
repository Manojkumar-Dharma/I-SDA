/**
 * sfgrSymbols.js (E11j3)
 *
 * Outline and go to definition for System/36 SFGR source (the text of a DSPF36 member or a .dspf36 file). Pure module
 * (no `vscode` import); `createProvider` is the VS Code side and takes the API as an argument, like sfgrHover.js and
 * ddsOutline.js, whose shapes it follows.
 *
 * Outline (`symbolsOf`). One node per display format (S specification) with its fields, constants and help areas
 * (H specifications) as children, in source order. A constant that continues over several D lines is one child. The
 * range runs from the S line to the last line of the format that is not blank or a comment; the selection range is the
 * name in columns 7 - 14 (a field or format without a name: the constant text or the start of the line).
 *
 * Go to definition (`definitionAt`). On the display format name of an H specification (columns 7 - 14) whose help
 * file is blank (the file in use) and which is not an online document: the S specification of the format of that name.
 * A name with a help file or library, an online document, or a name no format has gives nothing.
 *
 * Positions are 0-based lines and UTF-16 characters, like VS Code; columns count characters.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sfgrParser.js'));
  } else {
    root.SfgrSymbols = factory(root.SfgrParser);
  }
})(typeof self !== 'undefined' ? self : this, function (Parser) {
  'use strict';

  var HAS_SURROGATE = /[\ud800-\udfff]/;
  var NAME_FROM = 7;
  var NAME_TO = 14;
  var MAX_LABEL = 40;

  function charToUnit(line, index) {
    if (!HAS_SURROGATE.test(line)) return index;
    return Array.from(line).slice(0, index).join('').length;
  }
  function unitToChar(line, unit) {
    if (!HAS_SURROGATE.test(line)) return unit;
    var chars = Array.from(line), u = 0;
    for (var i = 0; i < chars.length; i++) { if (u >= unit) return i; u += chars[i].length; }
    return chars.length;
  }
  function charLength(line) { return HAS_SURROGATE.test(line) ? Array.from(line).length : line.length; }

  /** Columns from..to of a line as a selection on `line0` (0-based), cut at the end of the line text. */
  function selectionOfColumns(raw, line0, from, to) {
    var end = Math.min(to, charLength(raw.replace(/\s+$/, '')));
    var start = Math.min(from, end + 1);
    return { line: line0, startCharacter: charToUnit(raw, start - 1), endCharacter: charToUnit(raw, Math.max(end, start - 1)) };
  }

  /** The non-blank part of columns from..to as a selection, or null when they are blank. */
  function selectionOfText(raw, line0, from, to, whole) {
    var text = Parser.columnText(raw, from, to);
    var m = whole ? /\S(?:[\s\S]*\S)?/.exec(text) : /\S+/.exec(text);
    if (!m) return null;
    var first = from + m.index;
    return { line: line0, startCharacter: charToUnit(raw, first - 1), endCharacter: charToUnit(raw, first - 1 + charLength(m[0])) };
  }

  function lineStart(raw, line0) {
    var u = Math.min(5, raw.length);
    return { line: line0, startCharacter: u, endCharacter: Math.max(u, raw.replace(/\s+$/, '').length) };
  }

  function label(text) {
    var t = String(text).replace(/\s+/g, ' ').trim();
    return t.length > MAX_LABEL ? t.slice(0, MAX_LABEL - 1) + '\u2026' : t;
  }

  // ---- the outline -------------------------------------------------------------------------------------------------

  function symbolsOf(text) {
    try {
      var parsed = Parser.parse(text);
      var lines = parsed.lines;
      var rawOf = function (n) { return lines[n - 1] ? lines[n - 1].text : ''; };
      return parsed.formats.map(function (format) {
        var children = [];
        var constants = 0, fields = 0;
        format.fields.forEach(function (entry) {
          var raw = rawOf(entry.line);
          var isConstant = entry.role === 'constant';
          var name = Parser.columnText(raw, NAME_FROM, NAME_TO).trim();
          var node;
          if (isConstant) {
            constants++;
            var shown = entry.constantText && entry.constantText.trim() !== '' ? label(entry.constantText) : (name || '(blank constant)');
            node = { name: shown, detail: (name ? name + ' ' : '') + 'constant', kind: 'constant' };
            node.selection = selectionOfText(raw, entry.line - 1, 57, 79, true) || selectionOfText(raw, entry.line - 1, NAME_FROM, NAME_TO) || lineStart(raw, entry.line - 1);
          } else {
            fields++;
            node = { name: name || '(no name)', detail: detailOfField(entry), kind: 'field' };
            node.selection = selectionOfText(raw, entry.line - 1, NAME_FROM, NAME_TO) || lineStart(raw, entry.line - 1);
          }
          node.range = { startLine: entry.line - 1, endLine: entry.endLine - 1 };
          node.children = [];
          children.push({ line: entry.line, node: node });
        });
        format.help.forEach(function (entry) {
          var raw = rawOf(entry.line);
          var name = Parser.columnText(raw, NAME_FROM, NAME_TO).trim();
          var node = { name: name || '(no name)', detail: 'help area' + (entry.values && entry.values.onlineDocument === 'Y' ? ' (online document)' : ''), kind: 'help', children: [],
            range: { startLine: entry.line - 1, endLine: entry.endLine - 1 },
            selection: selectionOfText(raw, entry.line - 1, NAME_FROM, NAME_TO) || lineStart(raw, entry.line - 1) };
          children.push({ line: entry.line, node: node });
        });
        children.sort(function (a, b) { return a.line - b.line; });

        // the format ends at its last line that is not blank or a comment
        var last = format.startLine;
        format.entries.forEach(function (entry) {
          if (entry.kind !== 'blank' && entry.kind !== 'comment' && entry.endLine > last) last = entry.endLine;
        });
        var sRaw = rawOf(format.startLine);
        var sName = (format.name || '').trim();
        var detail = [];
        if (format.s && format.s.values && format.s.values.columns132 === 'Y') detail.push('132 columns');
        detail.push(fields + (fields === 1 ? ' field' : ' fields'));
        if (constants) detail.push(constants + (constants === 1 ? ' constant' : ' constants'));
        if (format.help.length) detail.push(format.help.length + (format.help.length === 1 ? ' help area' : ' help areas'));
        return {
          name: sName || '(no name)',
          detail: detail.join(', '),
          kind: 'record',
          range: { startLine: format.startLine - 1, endLine: last - 1 },
          selection: selectionOfText(sRaw, format.startLine - 1, NAME_FROM, NAME_TO) || lineStart(sRaw, format.startLine - 1),
          children: children.map(function (c) { return c.node; })
        };
      });
    } catch (e) {
      return [];
    }
  }

  function detailOfField(entry) {
    var v = entry.values || {};
    var parts = [];
    if (entry.numbers && entry.numbers.line !== null && entry.numbers.line !== undefined) {
      parts.push('line ' + entry.numbers.line + (v.column ? ', column ' + (Parser.decodeColumn(v.column) || v.column) : ''));
    }
    if (v.length) parts.push('length ' + v.length);
    var usage = v.output === 'Y' || /^\d/.test(v.output || '') ? (v.inputAllowed === 'Y' ? 'both' : 'output') : (v.inputAllowed === 'Y' ? 'input' : '');
    if (usage) parts.push(usage);
    return parts.join(', ');
  }

  // ---- go to definition --------------------------------------------------------------------------------------------

  function definitionAt(text, line, character) {
    try {
      if (typeof text !== 'string' || !(line >= 0) || !(character >= 0)) return null;
      var parsed = Parser.parse(text);
      var n = line + 1;
      var entry = null;
      for (var i = 0; i < parsed.entries.length; i++) {
        if (parsed.entries[i].kind === 'H' && parsed.entries[i].line === n) { entry = parsed.entries[i]; break; }
      }
      if (!entry || !entry.values) return null;
      var raw = parsed.lines[line] ? parsed.lines[line].text : '';
      var col = unitToChar(raw, character) + 1;
      if (col < NAME_FROM || col > NAME_TO) return null;
      var v = entry.values;
      if (v.onlineDocument === 'Y') return null;
      if ((v.helpFile || '').trim() !== '' || (v.helpLibrary || '').trim() !== '') return null;
      var name = (v.name || '').trim().toUpperCase();
      if (name === '') return null;
      var target = null;
      for (var f = 0; f < parsed.formats.length; f++) {
        if ((parsed.formats[f].name || '').trim().toUpperCase() === name) { target = parsed.formats[f]; break; }
      }
      if (!target) return null;
      var tRaw = parsed.lines[target.startLine - 1].text;
      var origin = selectionOfText(raw, line, NAME_FROM, NAME_TO);
      var tSel = selectionOfText(tRaw, target.startLine - 1, NAME_FROM, NAME_TO);
      if (!origin || !tSel) return null;
      return {
        origin: origin,
        target: { line: tSel.line, startCharacter: tSel.startCharacter, endCharacter: tSel.endCharacter, rangeStartLine: target.startLine - 1, rangeEndLine: target.startLine - 1 }
      };
    } catch (e) {
      return null;
    }
  }

  // ---- the provider ------------------------------------------------------------------------------------------------

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

  return { symbolsOf: symbolsOf, definitionAt: definitionAt, createProvider: createProvider };
});
