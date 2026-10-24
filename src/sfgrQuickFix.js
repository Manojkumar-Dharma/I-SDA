/**
 * sfgrQuickFix.js (E11j4)
 *
 * Quick-fixes for the most common E11j1 problems on System/36 SFGR source (the text of a DSPF36 member or a .dspf36
 * file). Pure module (no `vscode` import); `createProvider` is the VS Code side and takes the API as an argument, like
 * sfgrHover.js and sfgrSymbols.js.
 *
 *   fixesFor(text, diagnostic) -> [{ title, preferred, safe, edit }]
 *     diagnostic = { code, line, column } (1-based line and column, as the E11j1 rules give them)
 *     edit       = { startLine, startCharacter, endLine, endCharacter, newText } (0-based, UTF-16): the smallest
 *                  replacement that turns the source into the fixed one, so every other line stays byte-identical
 *     safe       = the fix may be applied by fixAll without asking (see below)
 *   fixAll(text) -> { text, changed, applied: [{ code, line, title }], edit }
 *                  applies the safe fixes over the whole source, re-reading it after a fix that moves lines (E12c)
 *
 * The three fixes (the codes of sfgrDiagnostics.js):
 *   isda.sfgrValue          a value out of range set to the nearest valid one: a letter to its capital or to blank, a
 *                           number to the end of its range, a name made of valid characters, a key mask without the keys
 *                           that are not keys
 *   isda.sfgrContinuation   an X in column 80 with no D line after it: add the (blank) continuation line, or take the X away
 *   isda.sfgrDuplicateName  a display format name used twice: rename the second to a free name (the name, up to 6
 *                           characters, and two digits)
 *
 * E12c adds three more kinds and the fix-all:
 *   isda.sfgrOrder          an H after a D: move it up to just after the S (or the last H before the first D)
 *   isda.sfgrKeyMask        keys in the mask that a blank or R enable column ignores: take them out of the mask (the
 *                           compiled behaviour does not change; the other choice, setting the column to Y, would)
 *   isda.sfgrOutsideScreen  a field whose row (start line + line - 1) is below the last row, and only that case: two
 *                           choices, neither preferred, 'move the field to the last row that fits' and, when every
 *                           field of the format then fits, 'move the format up' (a lower start line)
 *
 * What fixAll applies, decided with Manojkumar: a letter to its capital, v to V, a number clamped to the end of its
 * range, the characters that are not keys taken out of a key mask, an H moved up, the missing continuation line added.
 * Never a rename (programs may refer to a format name), never a column cleared to blank, never a choice between two
 * fixes, never the ignored keys of a key mask (that drops what the author wrote, although the behaviour stays).
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
    var options = [];   // [title, value, safe for fixAll]
    var format = formatOf(parsed, entry);
    var wide = !!(format && format.s && format.s.values && format.s.values.columns132 === 'Y');
    var lines = wide ? 27 : 24;

    if (rules) {
      var allowed = (v.length === 1 && rules.letters.indexOf(v) >= 0) || (rules.indicator && /^(0[1-9]|[1-9]\d)$/.test(v));
      if (allowed || v === '') return [];
      if (v.length === 1 && rules.letters.indexOf(v.toUpperCase()) >= 0) options.push(['Change "' + v + '" to "' + v.toUpperCase() + '"', v.toUpperCase(), true]);
      else options.push(['Clear ' + rules.label.toLowerCase() + ' (blank is the default)', '', false]);
    } else if (key === 'name') {
      if (v === '' || (NAME_FIRST.test(v) && !/[\s,']/.test(v))) return [];
      var chars = Array.from(v).map(function (ch) { return /[\s,']/.test(ch) ? '#' : ch; });
      if (!NAME_FIRST.test(chars[0])) chars[0] = '#';
      var name = chars.join('');
      options.push(['Change the name to "' + name + '"', name, false]);
    } else if (type === 'S' && key === 'startLine') {
      var n = entry.numbers && entry.numbers.startLine;
      if (typeof n === 'number' && (n < 1 || n > lines)) { var c = clamp(n, 1, lines); options.push(['Set the start line to ' + c, c, true]); }
      else if (v !== '' && v !== 'V' && /^[A-Za-z]/.test(v)) {
        if (v.toUpperCase() === 'V') options.push(['Change "' + v + '" to "V"', 'V', true]);
        else options.push(['Clear the start line (blank is line 1)', '', false]);
      }
    } else if (type === 'S' && key === 'linesToClear') {
      var l = entry.numbers && entry.numbers.linesToClear;
      if (typeof l === 'number' && l > lines) options.push(['Set the lines to clear to ' + lines, lines, true]);
    } else if (type === 'S' && key === 'keyMask') {
      var mask = entry.keyMask;
      if (mask && mask.invalid && mask.invalid.length) {
        var kept = Array.from(v).filter(function (ch) { return mask.invalid.indexOf(ch) < 0; }).join('');
        options.push([kept === '' ? 'Clear the key mask' : 'Keep only the keys: ' + kept, kept, true]);
      }
    } else if (type === 'H' && (key === 'upperLeft' || key === 'lowerRight')) {
      var corner = entry[key];
      if (corner && corner.row !== null && corner.column !== null && (corner.row < 0 || corner.row > 99 || corner.column < 1 || corner.column > 132)) {
        var fixed = { row: clamp(corner.row, 0, 99), column: clamp(corner.column, 1, 132) };
        options.push(['Set the corner to row ' + fixed.row + ', column ' + fixed.column, fixed, true]);
      }
    } else if (type === 'D' && key === 'length') {
      var len = entry.numbers && entry.numbers.length;
      var max = wide ? 3563 : 1919;
      if (typeof len === 'number' && (len < 1 || len > max)) { var cl = clamp(len, 1, max); options.push(['Set the field length to ' + cl, cl, true]); }
    } else if (type === 'D' && key === 'line') {
      var ln = entry.numbers && entry.numbers.line;
      if (typeof ln === 'number' && ln < 1) options.push(['Set the line to 1', 1, true]);
    } else if (type === 'D' && key === 'column') {
      var co = entry.numbers && entry.numbers.column;
      if (typeof co === 'number' && (co < 1 || co > 132)) { var cc = clamp(co, 1, 132); options.push(['Set the column to ' + cc, cc, true]); }
    }
    return options.map(function (o) { return { title: o[0], safe: o[2] === true, build: function (text) { return Writer.setValue(text, ref, key, o[1]); } }; });
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
      { title: 'Add the continuation line', preferred: true, safe: true, shifts: true, build: function (text) { return Writer.setContinuation(text, ref, 'add'); } },
      { title: 'Remove the X (the constant ends here)', safe: false, build: function (text) { return Writer.setContinuation(text, ref, 'remove'); } }
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
    return [{ title: 'Rename the format to ' + fresh, preferred: true, safe: false, build: function (text) { return Writer.setValue(text, ref, 'name', fresh); } }];
  }

  // ---- E12c: order, key mask, past the screen --------------------------------------------------------------------------------

  function orderFixes(parsed, line) {
    var format = null, entry = null;
    for (var i = 0; i < parsed.formats.length && !entry; i++) {
      for (var j = 0; j < parsed.formats[i].help.length; j++) {
        if (parsed.formats[i].help[j].line === line) { format = parsed.formats[i]; entry = parsed.formats[i].help[j]; break; }
      }
    }
    if (!entry || !format.fields.length) return [];
    var firstD = format.fields[0].line;
    // the entry it goes after: the S, or the last H that is already before the first D
    var target = format.s;
    format.help.forEach(function (h) { if (h.line < firstD && h.line > target.line) target = h; });
    var ref = { line: entry.line };
    var after = { after: { line: target.line } };
    return [{ title: 'Move the H specification up, before the first D specification', preferred: true, safe: true, shifts: true,
      build: function (text) { return Writer.moveEntry(text, ref, after); } }];
  }

  /** Which kinds of key a key mask lists that its enable column does not apply to. */
  function ignoredKeys(entry) {
    var mask = entry && entry.keyMask;
    var values = (entry && entry.values) || {};
    if (!mask) return null;
    var fn = mask.functionKeys.length > 0 && /^(|R)$/.test(values.enableFunctionKeys || '');
    var cmd = mask.commandKeys.length > 0 && /^(|R)$/.test(values.enableCommandKeys || '');
    if (!fn && !cmd) return null;
    var chars = [];
    if (fn) mask.functionKeys.forEach(function (k) { chars.push(k.char); });
    if (cmd) mask.commandKeys.forEach(function (k) { chars.push(k.char); });
    return { chars: chars, functionKeys: fn, commandKeys: cmd };
  }

  function keyMaskFixes(parsed, entry) {
    if (!entry || entry.kind !== 'S') return [];
    var ignored = ignoredKeys(entry);
    if (!ignored) return [];
    var kept = Array.from((entry.values || {}).keyMask || '').filter(function (ch) { return ignored.chars.indexOf(ch) < 0; }).join('');
    var what = ignored.functionKeys && ignored.commandKeys ? 'the function and command keys' : ignored.functionKeys ? 'the function keys' : 'the command keys';
    var ref = { line: entry.line };
    return [{ title: 'Take ' + what + ' out of the key mask (' + ignored.chars.join('') + '; the column ignores them)', safe: false,
      build: function (text) { return Writer.setValue(text, ref, 'keyMask', kept); } }];
  }

  function screenOf(format) {
    var s = format.s || {};
    var wide = !!(s.values && s.values.columns132 === 'Y');
    var explicit = s.numbers && typeof s.numbers.startLine === 'number';
    return { columns: wide ? 132 : 80, lines: wide ? 27 : 24, wide: wide, explicitStart: explicit, startLine: explicit ? s.numbers.startLine : 1 };
  }

  /** The rows a field covers, counted from the start line, or null when its numbers are not usable (the value rules say so). */
  function rowsOf(d, screen) {
    var n = d.numbers || {};
    if (typeof n.length !== 'number' || typeof n.line !== 'number' || typeof n.column !== 'number') return null;
    if (n.length < 1 || n.length > (screen.wide ? 3563 : 1919) || n.line < 1 || n.column < 1 || n.column > screen.columns) return null;
    var first = screen.columns - n.column + 1;
    var extra = n.length > first ? Math.ceil((n.length - first) / screen.columns) : 0;
    return { first: screen.startLine + n.line - 1, extra: extra, last: screen.startLine + n.line - 1 + extra, line: n.line };
  }

  function outsideFixes(parsed, entry, column) {
    if (!entry || entry.kind !== 'D' || !column || column.key !== 'line') return [];
    var format = formatOf(parsed, entry);
    if (!format) return [];
    var screen = screenOf(format);
    if (screen.startLine < 1 || screen.startLine > screen.lines) return [];
    var rows = rowsOf(entry, screen);
    if (!rows || rows.first <= screen.lines) return [];   // only the 'row is below the last row' case
    var out = [];
    var newLine = screen.lines - screen.startLine + 1 - rows.extra;
    if (newLine >= 1 && newLine < rows.line) {
      var ref = { line: entry.line };
      out.push({ title: 'Move the field to line ' + newLine + ' (the last row it fits on)', safe: false,
        build: function (text) { return Writer.setValue(text, ref, 'line', newLine); } });
    }
    if (screen.explicitStart) {
      var shift = 0;
      format.fields.forEach(function (d) {
        var r = rowsOf(d, screen);
        if (r && r.last - screen.lines > shift) shift = r.last - screen.lines;
      });
      var newStart = screen.startLine - shift;
      if (shift > 0 && newStart >= 1) {
        var sRef = { line: format.s.line };
        out.push({ title: 'Move the format up: start line ' + newStart + ' (every field then fits)', safe: false,
          build: function (text) { return Writer.setValue(text, sRef, 'startLine', newStart); } });
      }
    }
    return out;
  }

  // ---- the fixes of one diagnostic, and all the safe ones --------------------------------------------------------------------

  /** [{ title, preferred, safe, shifts, text }]: each fix as the whole fixed source. Nothing throws. `parsedText` is an
   *  optional parse of `text` (fixAll reads the source once per pass, not once per diagnostic). */
  function buildFixes(text, diagnostic, parsedText) {
    try {
      if (typeof text !== 'string' || !diagnostic) return [];
      var parsed = parsedText || Parser.parse(text);
      var line = diagnostic.line, code = diagnostic.code;
      var candidates = [];
      var entryAt = function () {
        for (var i = 0; i < parsed.entries.length; i++) if (parsed.entries[i].line === line) return parsed.entries[i];
        return null;
      };
      if (code === CODES.value) {
        var entry = entryAt();
        if (!entry || (entry.kind !== 'S' && entry.kind !== 'H' && entry.kind !== 'D')) return [];
        var column = columnAt(entry.kind, diagnostic.column);
        if (column) candidates = valueFixes(parsed, entry, column);
      } else if (code === CODES.continuation) {
        candidates = continuationFixes(parsed, line);
      } else if (code === CODES.duplicate) {
        candidates = duplicateFixes(parsed, line);
      } else if (code === CODES.order) {
        candidates = orderFixes(parsed, line);
      } else if (code === CODES.keyMask) {
        candidates = keyMaskFixes(parsed, entryAt());
      } else if (code === CODES.outside) {
        var d = entryAt();
        candidates = outsideFixes(parsed, d, d ? columnAt('D', diagnostic.column) : null);
      }
      var out = [];
      candidates.forEach(function (c) {
        var result = c.build(text);
        if (!result || result.ok === false || result.changed === false) return;
        out.push({ title: c.title, preferred: !!c.preferred, safe: !!c.safe, shifts: !!c.shifts, text: result.text });
      });
      return out;
    } catch (e) {
      return [];
    }
  }

  function fixesFor(text, diagnostic) {
    return buildFixes(text, diagnostic).map(function (f) {
      return { title: f.title, preferred: f.preferred, safe: f.safe, edit: editBetween(text, f.text) };
    });
  }

  var MAX_PASSES = 60;
  var MAX_APPLIED = 2000;
  var DEFAULT_BUDGET_MS = 5000;
  /** The rules that have a safe fix; the others (overlap, parse, the key mask, a field past the screen, a duplicate name) are not looked at. */
  var SAFE_CODES = [CODES.value, CODES.continuation, CODES.order];

  /** Applies the safe fix of every diagnostic, top to bottom. A fix that changes a value leaves the line numbers as they
   *  were, so the rest of the pass goes on with the same reading of the source (read again after a fix on an S line, whose
   *  values the others depend on); a fix that moves lines (the order fix, the added continuation line) ends the pass and
   *  the source is read again. Stops when a pass applies nothing, at 60 passes, or when `options.budgetMs` (default 5000)
   *  has passed: a fix-all on save must not hold the editor, so a big source may come back partly done (`truncated`),
   *  and running it again does the rest. Every step is one checked writer call, so a partial result is a valid source. */
  function fixAll(text, options) {
    var original = typeof text === 'string' ? text : '';
    var current = original;
    var applied = [];
    var truncated = false;
    var budget = options && typeof options.budgetMs === 'number' ? options.budgetMs : DEFAULT_BUDGET_MS;
    var started = Date.now();
    try {
      for (var pass = 0; pass < MAX_PASSES && applied.length < MAX_APPLIED && !truncated; pass++) {
        var diagnostics = Diagnostics.analyze(current, {}).diagnostics.filter(function (d) { return SAFE_CODES.indexOf(d.code) >= 0; });
        var parsed = null;
        var progress = false, shifted = false;
        for (var i = 0; i < diagnostics.length && !shifted && applied.length < MAX_APPLIED; i++) {
          if (Date.now() - started > budget) { truncated = true; break; }
          var d = diagnostics[i];
          if (parsed === null) parsed = Parser.parse(current);
          var fixes = buildFixes(current, { code: d.code, line: d.line, column: d.column }, parsed);
          var pick = null;
          for (var j = 0; j < fixes.length; j++) if (fixes[j].safe && (pick === null || fixes[j].preferred)) pick = fixes[j];
          if (!pick) continue;
          // after a change of one value on a D or H line the entries and their lines are the same and a fix reads only the value it is for
          var onS = parsed.entries.some(function (e) { return e.line === d.line && e.kind === 'S'; });
          current = pick.text;
          applied.push({ code: d.code, line: d.line, title: pick.title });
          progress = true;
          if (pick.shifts) shifted = true;
          else if (onS) parsed = null;
        }
        if (!progress) break;
      }
    } catch (e) {
      // keep what was done; every step was one checked writer call
    }
    var changed = current !== original;
    return { text: current, changed: changed, truncated: truncated, applied: applied, edit: changed ? editBetween(original, current) : null };
  }

  // ---- the provider ------------------------------------------------------------------------------------------------

  function unitToColumn(lineText, unit) {
    if (!HAS_SURROGATE.test(lineText)) return unit + 1;
    var chars = Array.from(lineText), u = 0;
    for (var i = 0; i < chars.length; i++) { if (u >= unit) return i + 1; u += chars[i].length; }
    return chars.length + 1;
  }

  // `context.only` is the kind the editor asks for (a code action kind in VS Code, a plain string in the test mock).
  function kindValue(kind) { return kind && typeof kind === 'object' && typeof kind.value === 'string' ? kind.value : String(kind); }

  function wants(only, kind) {
    if (!only || !kind) return false;
    if (typeof only.contains === 'function') {
      try { return !!only.contains(kind); } catch (e) { /* fall through to the text compare */ }
    }
    var o = kindValue(only), k = kindValue(kind);
    return k === o || k.indexOf(o + '.') === 0;
  }

  /** source.fixAll.isda: the kind of the fix-all action (the editor's own `source.fixAll` asks for it too). */
  function fixAllKind(vscodeApi) {
    var base = vscodeApi && vscodeApi.CodeActionKind && vscodeApi.CodeActionKind.SourceFixAll;
    if (!base) return null;
    return typeof base.append === 'function' ? base.append('isda') : base;
  }

  function createProvider(vscodeApi, options) {
    var mine = [CODES.value, CODES.continuation, CODES.duplicate, CODES.order, CODES.keyMask, CODES.outside];
    var allKind = fixAllKind(vscodeApi);
    return {
      provideCodeActions: function (document, range, context) {
        var settings = options.getSettings();
        if (!settings || settings.enable === false || !options.shouldProvide(document)) return [];
        var only = context && context.only;
        var text = document.getText();
        var actions = [];

        // the fix-all over the whole source, only when the editor asks for a source action
        if (allKind && wants(only, allKind)) {
          var all = fixAll(text);
          if (all.edit) {
            var fixAction = new vscodeApi.CodeAction('iSDA: fix all safe problems in this System/36 source (' + all.applied.length + (all.truncated ? ', partly: run it again for the rest' : '') + ')', allKind);
            fixAction.edit = new vscodeApi.WorkspaceEdit();
            fixAction.edit.replace(document.uri, new vscodeApi.Range(all.edit.startLine, all.edit.startCharacter, all.edit.endLine, all.edit.endCharacter), all.edit.newText);
            actions.push(fixAction);
          }
        }

        // the fixes of the problems under the cursor; not when the editor asked for a source action only
        if (only && !wants(only, vscodeApi.CodeActionKind.QuickFix)) return actions;
        var diagnostics = ((context && context.diagnostics) || []).filter(function (d) {
          return d.source === SOURCE && mine.indexOf(d.code) >= 0 && d.range && d.range.start;
        });
        if (!diagnostics.length) return actions;
        var rows = text.split(/\r\n|\n|\r/);
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

  return { fixesFor: fixesFor, fixAll: fixAll, editBetween: editBetween, createProvider: createProvider, fixAllKind: fixAllKind };
});
