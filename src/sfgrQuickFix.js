/**
 * sfgrQuickFix.js (E11j4)
 *
 * Quick-fixes for the most common E11j1 problems on System/36 SFGR source (the text of a DSPF36 member or a .dspf36
 * file). Pure module (no `vscode` import); `createProvider` is the VS Code side and takes the API as an argument, like
 * sfgrHover.js and sfgrSymbols.js.
 *
 *   fixesFor(text, diagnostic) -> [{ title, preferred, edit }]
 *     diagnostic = { code, line, column } (1-based line and column, as the E11j1 rules give them)
 *     edit       = { startLine, startCharacter, endLine, endCharacter, newText } (0-based, UTF-16): the smallest
 *                  replacement that turns the source into the fixed one, so every other line stays byte-identical
 *
 * The three fixes (the codes of sfgrDiagnostics.js):
 *   isda.sfgrValue          a value out of range set to the nearest valid one: a letter to its capital or to blank, a
 *                           number to the end of its range, a name made of valid characters, a key mask without the keys
 *                           that are not keys
 *   isda.sfgrContinuation   an X in column 80 with no D line after it: add the (blank) continuation line, or take the X away
 *   isda.sfgrDuplicateName  a display format name used twice: rename the second to a free name (the name, up to 6
 *                           characters, and two digits)
 *
 * Every edit is made by SfgrWriter, which parses the result and refuses an edit that would leave a source with an
 * error it did not have; a fix the writer refuses is not offered. Nothing here throws: text it cannot read gives [].
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sfgrParser.js'), require('./sfgrWriter.js'), require('./sfgrDiagnostics.js'));
  } else {
    root.SfgrQuickFix = factory(root.SfgrParser, root.SfgrWriter, root.SfgrDiagnostics);
  }
})(typeof self !== 'undefined' ? self : this, function (Parser, Writer, Diagnostics) {
  'use strict';

  var CODES = Diagnostics.CODES;
  var SOURCE = Diagnostics.SOURCE || 'iSDA';
  var HAS_SURROGATE = /[\ud800-\udfff]/;
  var NAME_FIRST = /^[A-Za-z#$@]/;
  var TABLES = { S: Parser.S_COLUMNS, H: Parser.H_COLUMNS, D: Parser.D_COLUMNS };

  function columnAt(type, from) {
    var table = TABLES[type] || [];
    for (var i = 0; i < table.length; i++) if (table[i].from === from) return table[i];
    return null;
  }

  function formatOf(parsed, entry) {
    for (var i = 0; i < parsed.formats.length; i++) {
      var f = parsed.formats[i];
      if (entry.line >= f.startLine && entry.line <= (f.endLine || Infinity)) return f;
    }
    return null;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // ---- the smallest edit between two texts ---------------------------------------------------------------------------

  function positionOf(text, offset) {
    var line = 0, last = 0;
    for (var i = 0; i < offset; i++) {
      var c = text.charAt(i);
      if (c === '\n' || (c === '\r' && text.charAt(i + 1) !== '\n')) { line++; last = i + 1; }
    }
    return { line: line, character: offset - last };
  }

  function editBetween(before, after) {
    var max = Math.min(before.length, after.length);
    var p = 0;
    while (p < max && before.charAt(p) === after.charAt(p)) p++;
    var q = 0;
    while (q < max - p && before.charAt(before.length - 1 - q) === after.charAt(after.length - 1 - q)) q++;
    // never cut between the halves of an astral character, nor between the CR and LF of a line end
    var bad = function (s, at) { return at > 0 && at < s.length && ((/[\ud800-\udbff]/.test(s.charAt(at - 1)) && /[\udc00-\udfff]/.test(s.charAt(at))) || (s.charAt(at - 1) === '\r' && s.charAt(at) === '\n')); };
    while (p > 0 && (bad(before, p) || bad(after, p))) p--;
    while (q > 0 && (bad(before, before.length - q) || bad(after, after.length - q))) q--;
    // whole lines: the edit starts at the start of its first changed line and ends at the end of its last
    while (p > 0 && before.charAt(p - 1) !== '\n' && before.charAt(p - 1) !== '\r') p--;
    var atBreak = function (at) { return at >= before.length || before.charAt(at) === '\n' || before.charAt(at) === '\r'; };
    while (q > 0 && !atBreak(before.length - q)) q--;
    var start = positionOf(before, p);
    var end = positionOf(before, before.length - q);
    return { startLine: start.line, startCharacter: start.character, endLine: end.line, endCharacter: end.character, newText: after.slice(p, after.length - q) };
  }

  // ---- the fixes ---------------------------------------------------------------------------------------------------------

  function valueFixes(parsed, entry, column) {
    var type = entry.kind;
    var key = column.key;
    var v = (entry.values || {})[key];
    if (v === undefined) return [];
    var ref = { line: entry.line };
    var rules = Diagnostics.ENTRY && Diagnostics.ENTRY[type] ? Diagnostics.ENTRY[type][key] : null;
    var options = [];   // [title, value]
    var format = formatOf(parsed, entry);
    var wide = !!(format && format.s && format.s.values && format.s.values.columns132 === 'Y');
    var lines = wide ? 27 : 24;

    if (rules) {
      var allowed = (v.length === 1 && rules.letters.indexOf(v) >= 0) || (rules.indicator && /^(0[1-9]|[1-9]\d)$/.test(v));
      if (allowed || v === '') return [];
      if (v.length === 1 && rules.letters.indexOf(v.toUpperCase()) >= 0) options.push(['Change "' + v + '" to "' + v.toUpperCase() + '"', v.toUpperCase()]);
      else options.push(['Clear ' + rules.label.toLowerCase() + ' (blank is the default)', '']);
    } else if (key === 'name') {
      if (v === '' || (NAME_FIRST.test(v) && !/[\s,']/.test(v))) return [];
      var chars = Array.from(v).map(function (ch) { return /[\s,']/.test(ch) ? '#' : ch; });
      if (!NAME_FIRST.test(chars[0])) chars[0] = '#';
      var name = chars.join('');
      options.push(['Change the name to "' + name + '"', name]);
    } else if (type === 'S' && key === 'startLine') {
      var n = entry.numbers && entry.numbers.startLine;
      if (typeof n === 'number' && (n < 1 || n > lines)) { var c = clamp(n, 1, lines); options.push(['Set the start line to ' + c, c]); }
      else if (v !== '' && v !== 'V' && /^[A-Za-z]/.test(v)) {
        if (v.toUpperCase() === 'V') options.push(['Change "' + v + '" to "V"', 'V']);
        else options.push(['Clear the start line (blank is line 1)', '']);
      }
    } else if (type === 'S' && key === 'linesToClear') {
      var l = entry.numbers && entry.numbers.linesToClear;
      if (typeof l === 'number' && l > lines) options.push(['Set the lines to clear to ' + lines, lines]);
    } else if (type === 'S' && key === 'keyMask') {
      var mask = entry.keyMask;
      if (mask && mask.invalid && mask.invalid.length) {
        var kept = Array.from(v).filter(function (ch) { return mask.invalid.indexOf(ch) < 0; }).join('');
        options.push([kept === '' ? 'Clear the key mask' : 'Keep only the keys: ' + kept, kept]);
      }
    } else if (type === 'H' && (key === 'upperLeft' || key === 'lowerRight')) {
      var corner = entry[key];
      if (corner && corner.row !== null && corner.column !== null && (corner.row < 0 || corner.row > 99 || corner.column < 1 || corner.column > 132)) {
        var fixed = { row: clamp(corner.row, 0, 99), column: clamp(corner.column, 1, 132) };
        options.push(['Set the corner to row ' + fixed.row + ', column ' + fixed.column, fixed]);
      }
    } else if (type === 'D' && key === 'length') {
      var len = entry.numbers && entry.numbers.length;
      var max = wide ? 3563 : 1919;
      if (typeof len === 'number' && (len < 1 || len > max)) { var cl = clamp(len, 1, max); options.push(['Set the field length to ' + cl, cl]); }
    } else if (type === 'D' && key === 'line') {
      var ln = entry.numbers && entry.numbers.line;
      if (typeof ln === 'number' && ln < 1) options.push(['Set the line to 1', 1]);
    } else if (type === 'D' && key === 'column') {
      var co = entry.numbers && entry.numbers.column;
      if (typeof co === 'number' && (co < 1 || co > 132)) { var cc = clamp(co, 1, 132); options.push(['Set the column to ' + cc, cc]); }
    }
    return options.map(function (o) { return { title: o[0], build: function (text) { return Writer.setValue(text, ref, key, o[1]); } }; });
  }

  function continuationFixes(parsed, line) {
    var entry = null;
    for (var i = 0; i < parsed.entries.length; i++) {
      var e = parsed.entries[i];
      if (e.kind === 'D' && e.endLine === line) { entry = e; break; }
    }
    if (!entry) return [];
    var ref = { line: entry.line };
    return [
      { title: 'Add the continuation line', preferred: true, build: function (text) { return Writer.setContinuation(text, ref, 'add'); } },
      { title: 'Remove the X (the constant ends here)', build: function (text) { return Writer.setContinuation(text, ref, 'remove'); } }
    ];
  }

  function duplicateFixes(parsed, line) {
    var format = null;
    for (var i = 0; i < parsed.formats.length; i++) if (parsed.formats[i].s && parsed.formats[i].s.line === line) { format = parsed.formats[i]; break; }
    if (!format) return [];
    var used = {};
    parsed.formats.forEach(function (f) { used[(f.name || '').toUpperCase()] = true; });
    var base = Array.from(format.name || '').slice(0, 6).join('');
    var fresh = null;
    for (var n = 1; n <= 99 && fresh === null; n++) {
      var candidate = base + (n < 10 ? '0' : '') + n;
      if (!used[candidate.toUpperCase()]) fresh = candidate;
    }
    if (fresh === null) return [];
    var ref = { line: line };
    return [{ title: 'Rename the format to ' + fresh, preferred: true, build: function (text) { return Writer.setValue(text, ref, 'name', fresh); } }];
  }

  function fixesFor(text, diagnostic) {
    try {
      if (typeof text !== 'string' || !diagnostic) return [];
      var parsed = Parser.parse(text);
      var line = diagnostic.line, code = diagnostic.code;
      var candidates = [];
      if (code === CODES.value) {
        var entry = null;
        for (var i = 0; i < parsed.entries.length; i++) if (parsed.entries[i].line === line) { entry = parsed.entries[i]; break; }
        if (!entry || (entry.kind !== 'S' && entry.kind !== 'H' && entry.kind !== 'D')) return [];
        var column = columnAt(entry.kind, diagnostic.column);
        if (column) candidates = valueFixes(parsed, entry, column);
      } else if (code === CODES.continuation) {
        candidates = continuationFixes(parsed, line);
      } else if (code === CODES.duplicate) {
        candidates = duplicateFixes(parsed, line);
      }
      var out = [];
      candidates.forEach(function (c) {
        var result = c.build(text);
        if (!result || result.ok === false || result.changed === false) return;
        out.push({ title: c.title, preferred: !!c.preferred, edit: editBetween(text, result.text) });
      });
      return out;
    } catch (e) {
      return [];
    }
  }

  // ---- the provider ------------------------------------------------------------------------------------------------

  function unitToColumn(lineText, unit) {
    if (!HAS_SURROGATE.test(lineText)) return unit + 1;
    var chars = Array.from(lineText), u = 0;
    for (var i = 0; i < chars.length; i++) { if (u >= unit) return i + 1; u += chars[i].length; }
    return chars.length + 1;
  }

  function createProvider(vscodeApi, options) {
    var mine = [CODES.value, CODES.continuation, CODES.duplicate];
    return {
      provideCodeActions: function (document, range, context) {
        var settings = options.getSettings();
        if (!settings || settings.enable === false || !options.shouldProvide(document)) return [];
        var diagnostics = ((context && context.diagnostics) || []).filter(function (d) {
          return d.source === SOURCE && mine.indexOf(d.code) >= 0 && d.range && d.range.start;
        });
        if (!diagnostics.length) return [];
        var text = document.getText();
        var rows = text.split(/\r\n|\n|\r/);
        var actions = [];
        diagnostics.forEach(function (d) {
          var rowText = rows[d.range.start.line] || '';
          var fixes = fixesFor(text, { code: d.code, line: d.range.start.line + 1, column: unitToColumn(rowText, d.range.start.character) });
          fixes.forEach(function (fix) {
            var action = new vscodeApi.CodeAction(fix.title, vscodeApi.CodeActionKind.QuickFix);
            action.diagnostics = [d];
            action.isPreferred = fix.preferred;
            action.edit = new vscodeApi.WorkspaceEdit();
            action.edit.replace(document.uri, new vscodeApi.Range(fix.edit.startLine, fix.edit.startCharacter, fix.edit.endLine, fix.edit.endCharacter), fix.edit.newText);
            actions.push(action);
          });
        });
        return actions;
      }
    };
  }

  return { fixesFor: fixesFor, editBetween: editBetween, createProvider: createProvider };
});
