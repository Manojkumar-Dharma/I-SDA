/**
 * sfgrWriter.js (E11d)
 *
 * Edits System/36 screen format generator ($SFGR) source: the text of a DSPF36 member or a .dspf36 file. Pure
 * module (no `vscode` import); the reader is sfgrParser.js (E11c) and the layout is docs/sda-reference/SFGR-SPEC.md.
 * Every operation takes the source text and returns a result, never an exception:
 *
 *   { ok: true,  text, changed, touched: { from, to } | null }   `text` is the new source; `changed` is false when
 *                                                                the edit would not change anything (text is then
 *                                                                the input, byte for byte); `touched` is the range
 *                                                                of lines of the NEW text that were written
 *   { ok: false, code, reason }                                  nothing was changed
 *
 * The rule the whole module keeps: a line the edit does not name is returned byte for byte, line end included. An
 * edited line changes only the columns named (so text past column 80, sequence numbers and a tab or odd character
 * elsewhere survive), and a line that was right-trimmed stays right-trimmed. Line ends of new lines follow the line
 * they are placed next to; a source with no final line end keeps having none; a byte order mark is kept.
 *
 *   setValue(text, ref, key, value)            one column entry of an S, H, D (or comment text) line
 *   setConstant(text, ref, constantText, opts) a D line's constant, rebuilding its continuation lines (see below)
 *   insertSpec(text, position, spec)           one S, H, D, comment or *DDS entry
 *   insertFormat(text, position, format)       a whole format: { s, help: [...], fields: [...] } of flat objects
 *                                              ({ name, length, line, column, ..., constant }), S, then H, then D
 *   deleteEntry(text, ref)                     an H, D, comment, *DDS or blank entry, continuation lines included
 *   deleteFormat(text, formatIndex)            a format, its header comment included
 *   duplicateEntry(text, ref)                  a copy of an H, D, comment or *DDS entry right after it
 *   moveEntry(text, ref, position)             an H, D, comment or *DDS entry to another place or format
 *   moveFormat(text, formatIndex, toIndex)     a format, its header comment included, to a new place in the order
 *
 * `ref` is `{ line }` (the first line of the entry, 1-based) or `{ entry }` (index in the parser's `entries`).
 * `position` is `{ before: ref }`, `{ after: ref }`, `{ format: i, at: 'end' }` (after the last D of format i, or
 * after its last H / S when it has none; an H goes after the last H), `{ beforeFormat: i }` or `{ atEnd: true }`
 * (a format at the end of the source).
 *
 * Constants. The first line holds 23 characters (columns 57 - 79), each continuation line 73 (columns 7 - 79), and an X
 * in column 80 says another line follows. The end of a constant is trimmed (the parser's `constantText` is), but the
 * source may carry blanks past it on a continuation line (the sample does: a constant of blanks is a blank first line
 * with an X and a blank line after it). setConstant leaves a constant whose trimmed text is unchanged alone, so those
 * lines survive; a changed constant is written without trailing blanks. `opts.keepBlanks` writes the text as given,
 * trailing blanks included (a caller that read the raw lines passes them back to restore a source exactly).
 *
 * Header comments. A run of comment lines directly above an S specification (no blank line between) is that
 * format's header: it moves and is deleted with the format. Other comments and blank lines belong to the entry
 * above them, as the parser groups them.
 *
 * Safety net. After every structural edit the result is read again: it is refused (code `wouldBreakSource`) when it
 * has more parse errors than the source had, or puts an H specification after a D specification of its format.
 * Rule checks of values (ranges, overlap, duplicates) are E11j's; the writer refuses only what it cannot write:
 * a value wider than its columns, a control character, a column it does not know.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    var parser;
    try { parser = require('./sfgrParser.js'); } catch (e) { parser = require('../dist/sfgrParser.js'); }
    module.exports = factory(parser);
  } else {
    root.SfgrWriter = factory(root.SfgrParser);
  }
})(typeof self !== 'undefined' ? self : this, function (Parser) {
  'use strict';

  var HAS_SURROGATE = /[\ud800-\udfff]/;
  var CONTROL = /[\u0000-\u001f\u007f]/;
  var CONSTANT_FIRST = 57, CONSTANT_LAST = 79, CONTINUATION_FIRST = 7, CONTINUATION_LAST = 79, CONTINUATION_COLUMN = 80;
  var FIRST_WIDTH = CONSTANT_LAST - CONSTANT_FIRST + 1;        // 23 characters on the line that starts the constant
  var NEXT_WIDTH = CONTINUATION_LAST - CONTINUATION_FIRST + 1; // 73 on each continuation line

  // Columns that take a number, right-justified; and those that take an indicator (a number 1 - 99 is written as two digits).
  var NUMERIC = { S: { startLine: 1, linesToClear: 1 }, D: { length: 1, line: 1, column: 1 }, H: {} };
  var INDICATOR = {
    S: { alarm: 1, blinkCursor: 1, eraseInput: 1, overrideFields: 1, suppressInput: 1, nullFill: 1 },
    D: { output: 1, positionCursor: 1, protect: 1, highIntensity: 1, blink: 1, nondisplay: 1, reverseImage: 1, underline: 1 },
    H: { suppressSelection: 1, restoreFormat: 1, boundary: 1 }
  };
  var CORNER = { upperLeft: 1, lowerRight: 1 };
  var TABLES = { S: Parser.S_COLUMNS, H: Parser.H_COLUMNS, D: Parser.D_COLUMNS };

  // ---- small helpers ------------------------------------------------------------------------------------------------

  function fail(code, reason) { return { ok: false, code: code, reason: reason }; }
  function charsOf(s) { return HAS_SURROGATE.test(s) ? Array.from(s) : s.split(''); }
  function sizeOf(s) { return charsOf(s).length; }
  function blanks(n) { return new Array(n + 1).join(' '); }
  function rtrim(s) { return s.replace(/ +$/, ''); }

  function columnOf(table, key) {
    for (var i = 0; i < table.length; i++) if (table[i].key === key) return table[i];
    return null;
  }

  /** Writes `text` (already the width of the range) into columns from..to of a line, padding a short line with
   *  blanks first. Nothing else on the line moves. */
  function put(line, from, to, text) {
    var chars = charsOf(line);
    while (chars.length < to) chars.push(' ');
    var add = charsOf(text);
    for (var i = 0; i < add.length; i++) chars[from - 1 + i] = add[i];
    return chars.join('');
  }

  /** The columns from..to of a line as text, padded with blanks. */
  function get(line, from, to) { return Parser.columnText(line, from, to); }

  /** A column 1 - 132 as the forms write it: a number up to 99, then A0 (100) .. D2 (132). */
  function encodeColumn(n) {
    if (n >= 1 && n <= 99) return String(n);
    if (n >= 100 && n <= 132) return String.fromCharCode(65 + Math.floor((n - 100) / 10)) + String((n - 100) % 10);
    return null;
  }

  function justify(text, width, right) {
    var n = sizeOf(text);
    if (n > width) return null;
    return right ? blanks(width - n) + text : text + blanks(width - n);
  }

  /** The text to write for one column entry, or an error result. */
  function columnText(type, column, value) {
    var width = column.to - column.from + 1;
    var key = column.key;
    if (value === null || value === undefined) value = '';
    if (typeof value !== 'string' && typeof value !== 'number' && !(CORNER[key] && type === 'H' && typeof value === 'object')) {
      return fail('badValue', key + ' takes text or a number, not ' + typeof value + '.');
    }
    var text;
    var right = false;
    if (CORNER[key] && type === 'H') {
      if (value && typeof value === 'object') {
        var col = encodeColumn(value.column);
        if (!(value.row >= 0 && value.row <= 99) || col === null) return fail('badValue', key + ' needs a row 0 - 99 and a column 1 - 132.');
        text = justify(String(value.row), 2, true) + justify(col, 2, true);
      } else text = String(value);
    } else if (typeof value === 'number') {
      if (!isFinite(value) || value < 0 || Math.floor(value) !== value) return fail('badValue', key + ' is not a whole number: ' + value + '.');
      if (INDICATOR[type] && INDICATOR[type][key]) {
        if (value < 1 || value > 99) return fail('badValue', 'An indicator is 01 - 99, not ' + value + '.');
        text = (value < 10 ? '0' : '') + value;
      } else if (type === 'D' && key === 'column') {
        text = encodeColumn(value);
        if (text === null) return fail('badValue', 'A column is 1 - 132, not ' + value + '.');
        right = true;
      } else if (NUMERIC[type] && NUMERIC[type][key]) {
        text = String(value);
        right = true;
      } else {
        text = String(value);
      }
    } else {
      text = String(value);
      if (NUMERIC[type] && NUMERIC[type][key] && /^\d+$/.test(text)) right = true;
      if (type === 'D' && key === 'column' && /^[A-D]\d$/.test(text)) right = true;
    }
    if (CONTROL.test(text)) return fail('badValue', key + ' holds a control character.');
    var out = justify(text, width, right);
    if (out === null) return fail('tooWide', key + ' is ' + sizeOf(text) + ' characters; columns ' + column.from + ' - ' + column.to + ' hold ' + width + '.');
    return { text: out };
  }

  // ---- reading the source into lines --------------------------------------------------------------------------------

  function load(text) {
    var parsed = Parser.parse(text);
    return parsed;
  }

  function linesOf(parsed) { return parsed.lines.map(function (l) { return { text: l.text, eol: l.eol }; }); }

  function defaultEol(parsed) {
    if (parsed.eol && parsed.eol !== 'mixed') return parsed.eol;
    for (var i = 0; i < parsed.lines.length; i++) if (parsed.lines[i].eol) return parsed.lines[i].eol;
    return '\n';
  }

  /** Puts the line ends right after lines were added or removed: a middle line never has none, and a source that had
   *  no final line end still has none. */
  function settle(lines, hadFinalEol, eol) {
    for (var i = 0; i < lines.length; i++) {
      if (i < lines.length - 1) { if (lines[i].eol === '') lines[i].eol = eol; }
      else lines[i].eol = hadFinalEol ? (lines[i].eol || eol) : '';
    }
    return lines;
  }

  function hadFinalEol(parsed) { return parsed.lines.length === 0 || parsed.lines[parsed.lines.length - 1].eol !== ''; }

  function join(parsed, lines) {
    return (parsed.bom ? '\ufeff' : '') + lines.map(function (l) { return l.text + l.eol; }).join('');
  }

  function locate(parsed, ref) {
    if (ref && typeof ref.entry === 'number') return parsed.entries[ref.entry] || null;
    if (ref && typeof ref.line === 'number') {
      for (var i = 0; i < parsed.entries.length; i++) if (parsed.entries[i].line === ref.line) return parsed.entries[i];
    }
    return null;
  }

  // ---- the safety net -----------------------------------------------------------------------------------------------

  function errorCounts(parsed) {
    var counts = {};
    parsed.problems.forEach(function (p) { if (p.severity === 'error') counts[p.code] = (counts[p.code] || 0) + 1; });
    return counts;
  }

  function helpOrderViolations(parsed) {
    var n = 0;
    parsed.formats.forEach(function (f) {
      if (!f.help.length || !f.fields.length) return;
      var firstField = f.fields[0].line;
      if (f.help.some(function (h) { return h.line > firstField; })) n++;
    });
    return n;
  }

  /** Reads the result again; refuses it when it is worse than the source was. */
  function verify(before, afterText) {
    var after = Parser.parse(afterText);
    var b = errorCounts(before);
    var a = errorCounts(after);
    var codes = Object.keys(a);
    for (var i = 0; i < codes.length; i++) {
      if (a[codes[i]] > (b[codes[i]] || 0)) return fail('wouldBreakSource', 'The edit would leave the source with a "' + codes[i] + '" error it did not have.');
    }
    if (helpOrderViolations(after) > helpOrderViolations(before)) {
      return fail('helpOrder', 'An H specification has to come before the first D specification of its format.');
    }
    return null;
  }

  function done(parsed, lines, touchedFrom, touchedTo) {
    var out = join(parsed, settle(lines, hadFinalEol(parsed), defaultEol(parsed)));
    return { out: out, touched: touchedTo >= touchedFrom ? { from: touchedFrom, to: touchedTo } : null };
  }

  function finish(parsed, original, built) {
    var bad = verify(parsed, built.out);
    if (bad) return bad;
    return { ok: true, text: built.out, changed: built.out !== original, touched: built.touched };
  }

  function unchanged(text) { return { ok: true, text: text, changed: false, touched: null }; }

  // ---- one column entry ---------------------------------------------------------------------------------------------

  function setValue(text, ref, key, value) {
    var parsed = load(text);
    var entry = locate(parsed, ref);
    if (!entry) return fail('noSuchEntry', 'No entry at that place.');
    var lines = linesOf(parsed);
    var at = entry.line - 1;
    if (entry.kind === 'comment') {
      if (key !== 'text') return fail('unknownColumn', 'A comment line has only "text".');
      var t = String(value == null ? '' : value);
      if (CONTROL.test(t)) return fail('badValue', 'text holds a control character.');
      if (sizeOf(t) > 73) return fail('tooWide', 'A comment is up to 73 characters (columns 8 - 80).');
      var orig = lines[at].text;
      var next = put(orig, 8, 80, t + blanks(73 - sizeOf(t)));
      if (!/ $/.test(orig)) next = rtrim(next);
      if (next === orig) return unchanged(text);
      lines[at].text = next;
      return finish(parsed, text, done(parsed, lines, entry.line, entry.line));
    }
    if (entry.kind !== 'S' && entry.kind !== 'H' && entry.kind !== 'D') {
      return fail('notASpec', 'That entry is not an S, H or D specification.');
    }
    if (entry.kind === 'D' && (key === 'constantData' || key === 'continuation')) {
      return fail('useSetConstant', 'The constant and its continuation column are set with setConstant.');
    }
    var column = columnOf(TABLES[entry.kind], key);
    if (!column) return fail('unknownColumn', 'No column entry "' + key + '" on a ' + entry.kind + ' specification.');
    var made = columnText(entry.kind, column, value);
    if (made.ok === false) return made;
    var original = lines[at].text;
    var edited = put(original, column.from, column.to, made.text);
    if (!/ $/.test(original)) edited = rtrim(edited);
    if (edited === original) return unchanged(text);
    lines[at].text = edited;
    return finish(parsed, text, done(parsed, lines, entry.line, entry.line));
  }

  // ---- a constant and its continuation lines ------------------------------------------------------------------------

  /** The text of a constant as the lines carry it: the first 23 characters, then 73 on each continuation line. The
   *  end of the last piece is trimmed (trailing blanks of a constant are not kept). */
  function constantPieces(constantText, keepBlanks) {
    var chars = charsOf(String(constantText == null ? '' : constantText));
    var pieces = [chars.slice(0, FIRST_WIDTH).join('')];
    for (var i = FIRST_WIDTH; i < chars.length; i += NEXT_WIDTH) pieces.push(chars.slice(i, i + NEXT_WIDTH).join(''));
    if (!keepBlanks) pieces[pieces.length - 1] = rtrim(pieces[pieces.length - 1]);
    return pieces;
  }

  /** One piece of a constant written into a line (columns from..to), with the X of column 80 when more follows.
   *  `keepPadding`: the line was padded with blanks to its full width before (not right-trimmed), so it stays so. */
  function withPiece(line, from, to, piece, more, keepPadding) {
    var width = to - from + 1;
    var body = more ? piece : rtrim(piece); // the line is right-trimmed, so blanks after the last piece are not kept anyway
    var next = put(line, from, to, body + blanks(width - sizeOf(body)));
    next = put(next, CONTINUATION_COLUMN, CONTINUATION_COLUMN, more ? 'X' : ' ');
    return more || keepPadding ? next : rtrim(next);
  }

  function setConstant(text, ref, constantText, opts) {
    var keepBlanks = !!(opts && opts.keepBlanks);
    var parsed = load(text);
    var entry = locate(parsed, ref);
    if (!entry) return fail('noSuchEntry', 'No entry at that place.');
    if (entry.kind !== 'D') return fail('notAD', 'A constant belongs to a D specification.');
    var wanted = String(constantText == null ? '' : constantText);
    if (CONTROL.test(wanted)) return fail('badValue', 'A constant holds a control character.');
    var pieces = constantPieces(wanted, keepBlanks);
    if (!keepBlanks && rtrim(wanted) === entry.constantText) return unchanged(text);

    var lines = linesOf(parsed);
    var firstAt = entry.line - 1;
    var oldCount = entry.lines.length;
    var eol = lines[entry.endLine - 1].eol;
    var between = lines[firstAt].eol || defaultEol(parsed);
    var rebuilt = [];
    for (var k = 0; k < pieces.length; k++) {
      var more = k < pieces.length - 1;
      if (k < oldCount) {
        var old = lines[firstAt + k].text;
        var from = k === 0 ? CONSTANT_FIRST : CONTINUATION_FIRST;
        var to = k === 0 ? CONSTANT_LAST : CONTINUATION_LAST;
        // an X in column 80 is the only reason a line is padded to full width; without it a trimmed line stays trimmed
        var keep = / $/.test(old) && get(old, CONTINUATION_COLUMN, CONTINUATION_COLUMN) !== 'X';
        rebuilt.push({ text: withPiece(old, from, to, pieces[k], more, keep), eol: lines[firstAt + k].eol });
      } else {
        rebuilt.push({ text: withPiece('     D', CONTINUATION_FIRST, CONTINUATION_LAST, pieces[k], more, false), eol: between });
      }
    }
    rebuilt[rebuilt.length - 1].eol = eol;
    // a field line (no constant type yet) that now holds a constant becomes a constant
    if (rtrim(wanted) !== '' && get(rebuilt[0].text, 56, 56) === ' ') rebuilt[0].text = put(rebuilt[0].text, 56, 56, 'C');
    Array.prototype.splice.apply(lines, [firstAt, oldCount].concat(rebuilt));
    return finish(parsed, text, done(parsed, lines, entry.line, entry.line + rebuilt.length - 1));
  }

  /** The X of column 80 on the last line of a D specification that says its constant continues. mode 'add': a blank
   *  D line after it for the constant to continue on (when the next line is not a D line). mode 'remove': take the X
   *  away, the constant ends where it is. Both leave every other line byte-identical. (E11j4) */
  function setContinuation(text, ref, mode) {
    var parsed = load(text);
    var entry = locate(parsed, ref);
    if (!entry) return fail('noSuchEntry', 'No entry at that place.');
    if (entry.kind !== 'D') return fail('notAD', 'A continuation belongs to a D specification.');
    if (mode !== 'add' && mode !== 'remove') return fail('badMode', 'The mode is add or remove.');
    var lines = linesOf(parsed);
    var lastAt = entry.endLine - 1;
    var lastText = lines[lastAt].text;
    if (get(lastText, CONTINUATION_COLUMN, CONTINUATION_COLUMN) !== 'X') return unchanged(text);
    if (mode === 'remove') {
      lines[lastAt].text = rtrim(put(lastText, CONTINUATION_COLUMN, CONTINUATION_COLUMN, ' '));
      return finish(parsed, text, done(parsed, lines, entry.endLine, entry.endLine));
    }
    var next = parsed.lines[lastAt + 1];
    if (next && get(next.text, 6, 6) === 'D') return unchanged(text);
    var eol = lines[lastAt].eol;
    lines[lastAt].eol = eol || defaultEol(parsed);
    lines.splice(lastAt + 1, 0, { text: '     D', eol: eol });
    return finish(parsed, text, done(parsed, lines, entry.endLine, entry.endLine + 1));
  }

  // ---- building new lines -------------------------------------------------------------------------------------------

  /** The lines of one new entry (no line ends), or an error result. `spec`: { type: 'S' | 'H' | 'D' | 'comment' |
   *  'dds', values: { key: value }, constant: 'text' (D), text: 'text' (comment, dds), sequence: 'nnnnn' }. */
  function buildLines(spec) {
    if (!spec || typeof spec !== 'object') return fail('badSpec', 'A spec is an object with a type.');
    var type = spec.type;
    var sequence = spec.sequence == null ? '     ' : String(spec.sequence);
    if (sizeOf(sequence) !== 5 || CONTROL.test(sequence)) return fail('badSpec', 'The sequence number is five characters.');
    if (type === 'comment' || type === 'dds') {
      var t = String(spec.text == null ? '' : spec.text);
      if (CONTROL.test(t) || sizeOf(t) > 73) return fail('badSpec', 'A comment is up to 73 characters without control characters.');
      var lead = type === 'dds' ? '*DDS ' : sequence;
      return { lines: [rtrim(lead + (spec.specType || 'S') + '*' + t)] };
    }
    if (!TABLES[type]) return fail('badSpec', 'Type is S, H, D, comment or dds.');
    var line = sequence + type;
    var values = spec.values || {};
    var keys = Object.keys(values);
    for (var i = 0; i < keys.length; i++) {
      if (type === 'D' && (keys[i] === 'constantData' || keys[i] === 'continuation')) return fail('useConstant', 'Give a D specification\'s constant as `constant`.');
      var column = columnOf(TABLES[type], keys[i]);
      if (!column) return fail('unknownColumn', 'No column entry "' + keys[i] + '" on a ' + type + ' specification.');
      var made = columnText(type, column, values[keys[i]]);
      if (made.ok === false) return made;
      line = put(line, column.from, column.to, made.text);
    }
    var out = [rtrim(line)];
    if (type === 'D' && spec.constant != null && String(spec.constant) !== '') {
      var c = String(spec.constant);
      if (CONTROL.test(c)) return fail('badSpec', 'A constant holds a control character.');
      var pieces = constantPieces(c);
      if (!values.constantType) line = put(line, 56, 56, 'C');
      out = [];
      for (var k = 0; k < pieces.length; k++) {
        var more = k < pieces.length - 1;
        out.push(withPiece(k === 0 ? line : '     D', k === 0 ? CONSTANT_FIRST : CONTINUATION_FIRST, k === 0 ? CONSTANT_LAST : CONTINUATION_LAST, pieces[k], more, false));
      }
    }
    return { lines: out };
  }

  // ---- places -------------------------------------------------------------------------------------------------------

  /** The first and last line of format i, header comments included. The last line leaves out a comment run that is
   *  the header of the next format. */
  function formatSpan(parsed, i) {
    var f = parsed.formats[i];
    if (!f) return null;
    var sIndex = parsed.entries.indexOf(f.s);
    var first = f.startLine;
    for (var j = sIndex - 1; j >= 0 && parsed.entries[j].kind === 'comment'; j--) first = parsed.entries[j].line;
    var last = f.endLine;
    if (parsed.formats[i + 1]) {
      var nextS = parsed.entries.indexOf(parsed.formats[i + 1].s);
      for (var k = nextS - 1; k >= 0 && parsed.entries[k].kind === 'comment' && parsed.entries[k].line > f.startLine; k--) last = parsed.entries[k].line - 1;
    }
    return { first: first, last: last };
  }

  /** The line (1-based) a new entry goes before, or an error result. */
  function placeOf(parsed, position, kind) {
    var lines = parsed.lines.length;
    if (!position || typeof position !== 'object') return fail('badPosition', 'No position.');
    if (position.before) {
      var b = locate(parsed, position.before);
      return b ? { at: b.line } : fail('noSuchEntry', 'No entry at the "before" place.');
    }
    if (position.after) {
      var a = locate(parsed, position.after);
      return a ? { at: a.endLine + 1 } : fail('noSuchEntry', 'No entry at the "after" place.');
    }
    if (position.beforeFormat !== undefined) {
      var span = formatSpan(parsed, position.beforeFormat);
      return span ? { at: span.first } : fail('noSuchFormat', 'No such format.');
    }
    if (position.atEnd) return { at: lines + 1 };
    if (position.format !== undefined && position.at === 'end') {
      var f = parsed.formats[position.format];
      if (!f) return fail('noSuchFormat', 'No such format.');
      var pool = kind === 'H' ? [f.s].concat(f.help) : [f.s].concat(f.help, f.fields);
      var last = pool.reduce(function (m, e) { return e.endLine > m ? e.endLine : m; }, 0);
      return { at: last + 1 };
    }
    return fail('badPosition', 'A position is { before }, { after }, { format, at: "end" }, { beforeFormat } or { atEnd }.');
  }

  function insertAt(parsed, original, at, built, eolHint) {
    var lines = linesOf(parsed);
    var eol = eolHint || (at - 2 >= 0 && lines[at - 2] && lines[at - 2].eol) || defaultEol(parsed);
    var added = built.map(function (t) { return { text: t, eol: eol }; });
    Array.prototype.splice.apply(lines, [at - 1, 0].concat(added));
    return finish(parsed, original, done(parsed, lines, at, at + added.length - 1));
  }

  function insertSpec(text, position, spec) {
    var parsed = load(text);
    var built = buildLines(spec);
    if (built.ok === false) return built;
    var place = placeOf(parsed, position, spec && spec.type);
    if (place.ok === false) return place;
    return insertAt(parsed, text, place.at, built.lines);
  }

  function insertFormat(text, position, format) {
    var parsed = load(text);
    if (!format || typeof format !== 'object') return fail('badSpec', 'A format is { s, help, fields }.');
    // flat objects as a designer holds them: { name, length, line, column, ..., constant, sequence } -> a spec
    function specOf(type, flat) {
      var values = {};
      Object.keys(flat || {}).forEach(function (k) { if (k !== 'constant' && k !== 'sequence') values[k] = flat[k]; });
      return { type: type, values: values, constant: flat ? flat.constant : undefined, sequence: flat ? flat.sequence : undefined };
    }
    var all = [specOf('S', format.s)]
      .concat((format.help || []).map(function (h) { return specOf('H', h); }))
      .concat((format.fields || []).map(function (d) { return specOf('D', d); }));
    var built = [];
    for (var i = 0; i < all.length; i++) {
      var b = buildLines(all[i]);
      if (b.ok === false) return b;
      built = built.concat(b.lines);
    }
    var place = placeOf(parsed, position && position.format !== undefined ? { atEnd: true } : position, 'S');
    if (place.ok === false) return place;
    return insertAt(parsed, text, place.at, built);
  }

  // ---- removing, copying, moving ------------------------------------------------------------------------------------

  function removeLines(parsed, original, first, last) {
    var lines = linesOf(parsed);
    lines.splice(first - 1, last - first + 1);
    return finish(parsed, original, done(parsed, lines, first, first - 1));
  }

  function deleteEntry(text, ref) {
    var parsed = load(text);
    var entry = locate(parsed, ref);
    if (!entry) return fail('noSuchEntry', 'No entry at that place.');
    if (entry.kind === 'S') return fail('useDeleteFormat', 'An S specification is deleted with its format (deleteFormat).');
    return removeLines(parsed, text, entry.line, entry.endLine);
  }

  function deleteFormat(text, formatIndex) {
    var parsed = load(text);
    var span = formatSpan(parsed, formatIndex);
    if (!span) return fail('noSuchFormat', 'No such format.');
    return removeLines(parsed, text, span.first, span.last);
  }

  /** Copies a whole format (its S, H, D and *DDS lines) to just after it. The copy has the same S name; the caller renames it. */
  function duplicateFormat(text, formatIndex) {
    var parsed = load(text);
    var span = formatSpan(parsed, formatIndex);
    if (!span) return fail('noSuchFormat', 'No such format.');
    var lines = linesOf(parsed);
    var eol = defaultEol(parsed);
    var copy = lines.slice(span.first - 1, span.last).map(function (l) { return { text: l.text, eol: l.eol || eol }; });
    var lastEol = lines[span.last - 1].eol;
    copy[copy.length - 1].eol = lastEol;
    lines[span.last - 1].eol = lines[span.last - 1].eol || eol;
    Array.prototype.splice.apply(lines, [span.last, 0].concat(copy));
    return finish(parsed, text, done(parsed, lines, span.last + 1, span.last + copy.length));
  }

  function duplicateEntry(text, ref) {
    var parsed = load(text);
    var entry = locate(parsed, ref);
    if (!entry) return fail('noSuchEntry', 'No entry at that place.');
    if (entry.kind === 'S' || entry.kind === 'blank' || entry.kind === 'unreadable') return fail('notCopyable', 'Only an H, D, comment or *DDS entry can be copied.');
    var eol = parsed.lines[entry.endLine - 1].eol;
    var lines = linesOf(parsed);
    // the copy goes after the last line, so the last line gets a line end and the copy takes over the old (maybe empty) one
    var copy = entry.raw.map(function (t) { return { text: t, eol: parsed.lines[entry.line - 1].eol || defaultEol(parsed) }; });
    copy[copy.length - 1].eol = eol;
    lines[entry.endLine - 1].eol = parsed.lines[entry.line - 1].eol || defaultEol(parsed);
    Array.prototype.splice.apply(lines, [entry.endLine, 0].concat(copy));
    return finish(parsed, text, done(parsed, lines, entry.endLine + 1, entry.endLine + copy.length));
  }

  /** Moves lines first..last to just before original line `at`. */
  function relocate(parsed, original, first, last, at) {
    if (at >= first && at <= last + 1) return unchanged(original);
    var lines = linesOf(parsed);
    var count = last - first + 1;
    var moved = lines.splice(first - 1, count);
    var index = at > last ? at - 1 - count : at - 1;
    Array.prototype.splice.apply(lines, [index, 0].concat(moved));
    return finish(parsed, original, done(parsed, lines, index + 1, index + count));
  }

  // ---- the raw lines of one entry -----------------------------------------------------------------------------------

  /** Replaces all the source lines of one entry (an S, H or D specification with its continuation lines, or a comment)
   *  by the lines in `rawText`. The person typed the columns, so nothing is padded or checked per column; what is
   *  refused is a control character, a line wider than 80, no line at all, and a result with a read error the source
   *  did not have. The line ends of the old lines are kept (the last new line takes the last old line's end). The
   *  result may hold more or fewer entries than the old lines did; `touched` covers the new lines. */
  function setRawLines(text, ref, rawText) {
    var parsed = load(text);
    var entry = locate(parsed, ref);
    if (!entry) return fail('noSuchEntry', 'No entry at that place.');
    var wanted = String(rawText == null ? '' : rawText).split(/\r\n|\r|\n/);
    while (wanted.length && wanted[wanted.length - 1] === '') wanted.pop();
    if (!wanted.length) return fail('empty', 'An entry has at least one line; remove it with deleteEntry.');
    for (var i = 0; i < wanted.length; i++) {
      if (CONTROL.test(wanted[i])) return fail('badValue', 'Line ' + (i + 1) + ' holds a control character (a tab, for one).');
      if (sizeOf(wanted[i]) > Parser.LINE_WIDTH) return fail('tooWide', 'Line ' + (i + 1) + ' is wider than ' + Parser.LINE_WIDTH + ' characters.');
    }
    var lines = linesOf(parsed);
    var oldCount = entry.endLine - entry.line + 1;
    var same = wanted.length === oldCount && wanted.every(function (t, k) { return t === lines[entry.line - 1 + k].text; });
    if (same) return unchanged(text);
    var fallback = lines[entry.endLine - 1].eol || defaultEol(parsed);
    var replaced = wanted.map(function (t, k) {
      var old = k < oldCount ? lines[entry.line - 1 + k].eol : '';
      return { text: t, eol: k === wanted.length - 1 ? lines[entry.endLine - 1].eol : (old || fallback) };
    });
    Array.prototype.splice.apply(lines, [entry.line - 1, oldCount].concat(replaced));
    return finish(parsed, text, done(parsed, lines, entry.line, entry.line + wanted.length - 1));
  }

  // ---- paste ----------------------------------------------------------------------------------------------------------

  /** Inserts copies of entries (kept as raw source lines, so what they hold is kept as found) into a format: the H ones
   *  after the format's S and its last help area, the D ones after its last entry. `entries` is
   *  [{ kind: 'H' | 'D', lines: [text, ...] }], their order kept inside each kind. One edit; `placed` lists where each
   *  copy now starts, [{ index, kind, line }] with `index` the position in `entries`, so the caller can then set a name,
   *  a line and a column on the copies (setValue). A line over 80 characters, a control character or a kind other than H
   *  or D is refused. */
  function pasteEntries(text, formatIndex, entries) {
    var parsed = load(text);
    var f = parsed.formats[formatIndex];
    if (!f) return fail('noSuchFormat', 'No such format.');
    if (!Array.isArray(entries) || !entries.length) return fail('empty', 'Nothing to paste.');
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (!e || (e.kind !== 'H' && e.kind !== 'D') || !Array.isArray(e.lines) || !e.lines.length) return fail('badSpec', 'An entry to paste is { kind: "H" | "D", lines: [..] }.');
      for (var k = 0; k < e.lines.length; k++) {
        if (CONTROL.test(e.lines[k])) return fail('badValue', 'A pasted line holds a control character.');
        if (sizeOf(e.lines[k]) > Parser.LINE_WIDTH) return fail('tooWide', 'A pasted line is wider than ' + Parser.LINE_WIDTH + ' characters.');
      }
    }
    function lastLineOf(pool) { return pool.reduce(function (m, x) { return x.endLine > m ? x.endLine : m; }, 0); }
    var helpAt = lastLineOf([f.s].concat(f.help)) + 1;
    var fieldAt = lastLineOf([f.s].concat(f.help, f.fields)) + 1;
    var helps = [], fields = [];
    entries.forEach(function (x, index) { (x.kind === 'H' ? helps : fields).push({ index: index, kind: x.kind, lines: x.lines }); });
    var lines = linesOf(parsed);
    var eol = (fieldAt - 2 >= 0 && lines[fieldAt - 2] && lines[fieldAt - 2].eol) || defaultEol(parsed);
    function asLines(group) {
      var out = [];
      group.forEach(function (x) { x.lines.forEach(function (t) { out.push({ text: t, eol: eol }); }); });
      return out;
    }
    // the later block first, so the earlier insertion point is still right
    Array.prototype.splice.apply(lines, [fieldAt - 1, 0].concat(asLines(fields)));
    Array.prototype.splice.apply(lines, [helpAt - 1, 0].concat(asLines(helps)));
    var placed = [];
    var at = helpAt;
    helps.forEach(function (x) { placed.push({ index: x.index, kind: 'H', line: at }); at += x.lines.length; });
    at = fieldAt + helpsLineCount(helps);
    fields.forEach(function (x) { placed.push({ index: x.index, kind: 'D', line: at }); at += x.lines.length; });
    placed.sort(function (a, b) { return a.index - b.index; });
    var total = helpsLineCount(helps) + helpsLineCount(fields);
    var result = finish(parsed, text, done(parsed, lines, helpAt, helpAt + 0));
    if (result.ok === false) return result;
    var firstNew = helps.length ? helpAt : fieldAt;
    result.touched = { from: firstNew, to: fieldAt + total - 1 };
    result.placed = placed;
    return result;
  }

  function helpsLineCount(group) { return group.reduce(function (n, x) { return n + x.lines.length; }, 0); }

  function moveEntry(text, ref, position) {
    var parsed = load(text);
    var entry = locate(parsed, ref);
    if (!entry) return fail('noSuchEntry', 'No entry at that place.');
    if (entry.kind === 'S') return fail('useMoveFormat', 'An S specification moves with its format (moveFormat).');
    if (entry.kind === 'blank' || entry.kind === 'unreadable') return fail('notMovable', 'Only an H, D, comment or *DDS entry can be moved.');
    var place = placeOf(parsed, position, entry.kind);
    if (place.ok === false) return place;
    if (place.at > entry.line && place.at <= entry.endLine) return fail('badPosition', 'The place is inside the entry itself.');
    return relocate(parsed, text, entry.line, entry.endLine, place.at);
  }

  function moveFormat(text, formatIndex, toIndex) {
    var parsed = load(text);
    var span = formatSpan(parsed, formatIndex);
    if (!span) return fail('noSuchFormat', 'No such format.');
    var n = parsed.formats.length;
    if (typeof toIndex !== 'number' || toIndex < 0 || toIndex >= n || Math.floor(toIndex) !== toIndex) return fail('badPosition', 'The new place is 0 - ' + (n - 1) + '.');
    if (toIndex === formatIndex) return unchanged(text);
    var at;
    if (toIndex > formatIndex) {
      var after = formatSpan(parsed, toIndex);
      at = after.last + 1;
    } else {
      at = formatSpan(parsed, toIndex).first;
    }
    return relocate(parsed, text, span.first, span.last, at);
  }

  return {
    setValue: setValue,
    setConstant: setConstant,
    setRawLines: setRawLines,
    pasteEntries: pasteEntries,
    setContinuation: setContinuation,
    insertSpec: insertSpec,
    insertFormat: insertFormat,
    deleteEntry: deleteEntry,
    deleteFormat: deleteFormat,
    duplicateEntry: duplicateEntry,
    duplicateFormat: duplicateFormat,
    moveEntry: moveEntry,
    moveFormat: moveFormat,
    buildLines: buildLines,
    constantPieces: constantPieces,
    encodeColumn: encodeColumn,
    formatSpan: formatSpan
  };
});
