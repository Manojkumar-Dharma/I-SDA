/**
 * sfgrParser.js (E11c)
 *
 * Reader for System/36 screen format generator ($SFGR) source: the text of a DSPF36 member or a .dspf36 file.
 * Pure module (no `vscode` import, no other module): source text in, formats out. The layout it follows is
 * docs/sda-reference/SFGR-SPEC.md (E11a); column numbers below are that file's, 1-based and inclusive.
 *
 *   parse(text) -> {
 *     bom, eol,           // a leading byte order mark; '\r\n' | '\n' | '\r' | 'mixed' | '' (no line end at all)
 *     lines,              // every physical line: { number (1-based), text (no line end), eol (as found) }
 *     entries,            // every line of the source exactly once, in order, grouped into entries (below)
 *     formats,            // the display formats, one per S specification
 *     problems            // what could not be read; the parser never throws
 *   }
 *
 * Entries. Every entry carries `kind`, `line` (first line number), `endLine`, `lines` (all its line numbers),
 * `raw` (the original text of each of those lines, so a writer can leave them alone), `specType` (column 6 as
 * found) and `format` (index into `formats`, -1 before the first S specification).
 *
 *   S          display control (the first entry of a format)      values, numbers, keyMask
 *   H          help area                                           values, upperLeft, lowerRight
 *   D          field or constant; `role` says which                values, numbers, constantText
 *   comment    '*' in column 7 of an S, H or D line                text (columns 8 - 80)
 *   dds        a run of *DDS lines (user DDS passed through)       ddsLines (as they appear in the generated DDS)
 *   blank      an empty line, or one holding only a sequence number
 *   unreadable a line that is none of the above                     (a problem says why)
 *
 * `values` holds the text of each named column range, trimmed; `numbers` the entries that are numbers (null when
 * blank or not readable). Nothing is range-checked here: a column value that is out of range is read as found and
 * left to the rule checks (E11j). Continuation: a D line with X in column 80 continues its constant on the next
 * line, a D line whose columns 7 - 79 are text; that line may carry X again. The joined lines are one D entry
 * (`lines` lists them all, `continuationLines` counts the extra ones) and `constantText` is the whole constant.
 *
 * Lines are read as they are: a short line (the sample is right-trimmed) has blank columns past its end, a
 * line longer than 80 characters keeps its tail in `raw` and is reported. Nothing is padded or rewritten, so
 * `toText(parse(text))` gives back the exact source, line ends included.
 *
 * Plain dependency-free JS (UMD), same style as sourceLineWidth.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SfgrParser = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LINE_WIDTH = 80;
  var HAS_SURROGATE = /[\ud800-\udfff]/;

  // ---- column tables ------------------------------------------------------------------------------------------------
  // key, first and last column. `raw: true` keeps the text untrimmed (constant text: its blanks are data).

  function table(rows) {
    return Object.freeze(rows.map(function (r) {
      return Object.freeze({ key: r[0], from: r[1], to: r[2], raw: r[3] === true });
    }));
  }

  var S_COLUMNS = table([
    ['name', 7, 14], ['startLine', 17, 18], ['linesToClear', 19, 20], ['lowercase', 21, 21], ['returnInput', 22, 22],
    ['alarm', 25, 26], ['enableFunctionKeys', 27, 27], ['enableCommandKeys', 28, 28], ['blinkCursor', 29, 30],
    ['eraseInput', 31, 32], ['overrideFields', 33, 34], ['suppressInput', 35, 36], ['nullFill', 37, 38],
    ['columns132', 39, 39], ['rightToLeft', 40, 40], ['keyMask', 64, 79]
  ]);

  var H_COLUMNS = table([
    ['name', 7, 14], ['helpFile', 16, 23], ['helpLibrary', 25, 32], ['upperLeft', 34, 37], ['lowerRight', 39, 42],
    ['suppressSelection', 44, 45], ['restoreFormat', 47, 48], ['boundary', 50, 51], ['onlineDocument', 53, 53]
  ]);

  var D_COLUMNS = table([
    ['name', 7, 14], ['length', 15, 18], ['line', 19, 20], ['column', 21, 22], ['output', 23, 24],
    ['inputAllowed', 26, 26], ['dataType', 27, 27], ['mandatoryFill', 28, 28], ['mandatoryEntry', 29, 29],
    ['selfCheck', 30, 30], ['adjustFill', 31, 31], ['positionCursor', 32, 33], ['dupKey', 34, 34],
    ['controlledExit', 35, 35], ['autoAdvance', 36, 36], ['protect', 37, 38], ['highIntensity', 39, 40],
    ['blink', 41, 42], ['nondisplay', 43, 44], ['reverseImage', 45, 46], ['underline', 47, 48],
    ['columnSeparators', 49, 49], ['lowercase', 51, 51], ['constantType', 56, 56], ['constantData', 57, 79, true],
    ['continuation', 80, 80]
  ]);

  var CONSTANT_FIRST = 57;       // constant data on the line that starts the constant
  var CONSTANT_LAST = 79;
  var CONTINUATION_FIRST = 7;    // constant data on a continuation line
  var CONTINUATION_LAST = 79;
  var CONTINUATION_COLUMN = 80;

  // ---- small helpers ------------------------------------------------------------------------------------------------

  /** A reader for one line: `read(from, to)` is the text of columns from..to (1-based), padded with blanks to the
   *  full width; columns count characters, so a character outside the BMP is one column. */
  function readerOf(raw) {
    var chars = HAS_SURROGATE.test(raw) ? Array.from(raw) : null;
    return function (from, to) {
      var text = chars ? chars.slice(from - 1, to).join('') : raw.slice(from - 1, to);
      var width = to - from + 1;
      var have = chars ? Math.max(0, Math.min(chars.length, to) - (from - 1)) : text.length;
      return have >= width ? text : text + new Array(width - have + 1).join(' ');
    };
  }

  /** The text of columns from..to of `line`, padded with blanks (a short line has blank columns past its end). */
  function columnText(line, from, to) {
    return readerOf(String(line == null ? '' : line))(from, to);
  }

  function lengthOf(raw) {
    return HAS_SURROGATE.test(raw) ? Array.from(raw).length : raw.length;
  }

  /** A column entry of 1 - 132: a number up to 99, then A0 (100) .. D2 (132) as the forms write it. null when the
   *  text is not one. Range is not checked (D3 reads as 133). */
  function decodeColumn(text) {
    var t = String(text == null ? '' : text).trim();
    if (/^\d+$/.test(t)) return parseInt(t, 10);
    var m = /^([A-D])(\d)$/.exec(t);
    return m ? 100 + (m[1].charCodeAt(0) - 65) * 10 + parseInt(m[2], 10) : null;
  }

  function numberOf(text) {
    return /^\d+$/.test(text) ? parseInt(text, 10) : null;
  }

  var FUNCTION_KEYS = { '1': 'Print', '2': 'Page Down', '3': 'Page Up', '4': 'Clear', '5': 'Help', '6': 'Home' };
  var COMMAND_LETTERS = 'ABCDEFGHIJKLMNPQRSTUVWXY'; // A..L = 1..12, M, N = 13, 14, P..Y = 15..24; there is no O

  /** The key mask (S columns 64 - 79): the function key digits and command key letters in it, in the order written.
   *  The manual's key table is used (2 = Page Down, 3 = Page Up); see SFGR-SPEC.md section 2. Anything else,
   *  including a blank inside the mask, is in `invalid`. */
  function decodeKeyMask(text) {
    var t = String(text == null ? '' : text).trim();
    var out = { text: t, functionKeys: [], commandKeys: [], invalid: [] };
    Array.from(t).forEach(function (ch) {
      if (Object.prototype.hasOwnProperty.call(FUNCTION_KEYS, ch)) {
        out.functionKeys.push({ char: ch, name: FUNCTION_KEYS[ch] });
      } else if (COMMAND_LETTERS.indexOf(ch) >= 0 && ch.length === 1) {
        out.commandKeys.push({ char: ch, number: COMMAND_LETTERS.indexOf(ch) + 1 });
      } else {
        out.invalid.push(ch);
      }
    });
    return out;
  }

  // ---- splitting ----------------------------------------------------------------------------------------------------

  /** Physical lines as found: the text without its line end, and the line end ('\r\n', '\n', '\r' or '' for the
   *  last line of a source that does not end with one). A source that ends with a line end has no extra empty line. */
  function splitLines(text) {
    var lines = [];
    var re = /\r\n|\n|\r/g;
    var last = 0;
    var m;
    while ((m = re.exec(text)) !== null) {
      lines.push({ number: lines.length + 1, text: text.slice(last, m.index), eol: m[0] });
      last = m.index + m[0].length;
    }
    if (last < text.length) lines.push({ number: lines.length + 1, text: text.slice(last), eol: '' });
    return lines;
  }

  function dominantEol(lines) {
    var seen = {};
    var kinds = 0;
    lines.forEach(function (l) {
      if (l.eol && !seen[l.eol]) { seen[l.eol] = true; kinds++; }
    });
    if (kinds === 0) return '';
    if (kinds > 1) return 'mixed';
    return Object.keys(seen)[0];
  }

  // ---- reading one line ---------------------------------------------------------------------------------------------

  function valuesOf(read, columns) {
    var values = {};
    columns.forEach(function (c) {
      var text = read(c.from, c.to);
      values[c.key] = c.raw ? text : text.trim();
    });
    return values;
  }

  /** What a line is, judged by its own columns (continuation lines are decided by the caller before this):
   *  'blank' | 'dds' | 'comment' | 'S' | 'H' | 'D' | 'unknownType'. Columns 1 - 5 are the sequence number, so a
   *  line with nothing from column 6 on is blank whatever its length. */
  function classify(raw, read) {
    if (read(6, Math.max(LINE_WIDTH, lengthOf(raw))).trim() === '') return 'blank';
    if (read(1, 4) === '*DDS' && read(5, 5) === ' ' && read(7, 7) === '*') return 'dds';
    var type = read(6, 6);
    if (type === 'S' || type === 'H' || type === 'D') return read(7, 7) === '*' ? 'comment' : type;
    return 'unknownType';
  }

  function hasContinuation(read) {
    return read(CONTINUATION_COLUMN, CONTINUATION_COLUMN) === 'X';
  }

  // ---- the parse ----------------------------------------------------------------------------------------------------

  /**
   * Reads SFGR source. Never throws: text that is not a string reads as empty, and a line that cannot be read is
   * an 'unreadable' entry with a problem, not an error.
   */
  function parse(text) {
    var source = typeof text === 'string' ? text : (text == null ? '' : String(text));
    var bom = source.charCodeAt(0) === 0xFEFF;
    if (bom) source = source.slice(1);

    var lines = splitLines(source);
    var entries = [];
    var formats = [];
    var problems = [];
    var current = -1;

    function problem(line, column, code, severity, message) {
      problems.push({ line: line, column: column, code: code, severity: severity, message: message });
    }

    function newEntry(kind, first, last, extra) {
      var numbers = [];
      var raw = [];
      for (var n = first; n <= last; n++) { numbers.push(n); raw.push(lines[n - 1].text); }
      var entry = { kind: kind, line: first, endLine: last, lines: numbers, raw: raw,
        specType: columnText(lines[first - 1].text, 6, 6), format: current };
      Object.keys(extra || {}).forEach(function (k) { entry[k] = extra[k]; });
      entries.push(entry);
      return entry;
    }

    function checkLine(number, raw) {
      var size = lengthOf(raw);
      if (size > LINE_WIDTH && readerOf(raw)(LINE_WIDTH + 1, size).trim() !== '') {
        problem(number, LINE_WIDTH + 1, 'lineTooLong', 'warning',
          'Only the first 80 characters of a line are used; the text after column 80 is kept as found.');
      }
      if (raw.indexOf('\t') >= 0) {
        problem(number, raw.indexOf('\t') + 1, 'tab', 'warning',
          'A tab character: columns are counted in characters, so the entries after it are not where they look.');
      }
    }

    function numberProblem(number, label, from, text) {
      problem(number, from, 'notNumeric', 'warning', label + ' (columns ' + from + ' and on) is "' + text + '", not a number.');
    }

    // numbers of an S specification
    function readS(number, read, values) {
      var numbers = { startLine: null, linesToClear: null };
      var variable = values.startLine === 'V';
      if (values.startLine !== '' && !variable) {
        numbers.startLine = numberOf(values.startLine);
        if (numbers.startLine === null) numberProblem(number, 'The start line', 17, values.startLine);
      }
      if (values.linesToClear !== '') {
        numbers.linesToClear = numberOf(values.linesToClear);
        if (numbers.linesToClear === null) numberProblem(number, 'The lines to clear', 19, values.linesToClear);
      }
      return { values: values, numbers: numbers, startLineVariable: variable, keyMask: decodeKeyMask(values.keyMask) };
    }

    // a corner of an H specification: rrcc, row in two columns, column in two (A0 - D2 above 99)
    function corner(number, label, from, text) {
      if (text.trim() === '') return null;
      var row = numberOf(text.slice(0, 2).trim());
      var column = decodeColumn(text.slice(2));
      if (row === null || column === null) {
        numberProblem(number, 'The ' + label + ' corner', from, text.trim());
        return { row: row, column: column };
      }
      return { row: row, column: column };
    }

    function readH(number, read, values) {
      return {
        values: values,
        upperLeft: corner(number, 'upper left', 34, read(34, 37)),
        lowerRight: corner(number, 'lower right', 39, read(39, 42))
      };
    }

    // a D specification and the lines that continue its constant
    function readD(first, read, values) {
      var last = first;
      var pieces = [read(CONSTANT_FIRST, CONSTANT_LAST)];
      var more = hasContinuation(read);
      var widths = [CONSTANT_LAST - CONSTANT_FIRST + 1];
      while (more) {
        var next = lines[last]; // the line after `last` (lines are 0-based)
        if (!next || columnText(next.text, 6, 6) !== 'D') {
          problem(last, CONTINUATION_COLUMN, 'unmatchedContinuation', 'error',
            'X in column 80 says the constant continues on the next line, but ' +
            (next ? 'that line is not a D line.' : 'the source ends here.'));
          break;
        }
        last++;
        checkLine(last, next.text);
        var nextRead = readerOf(next.text);
        pieces.push(nextRead(CONTINUATION_FIRST, CONTINUATION_LAST));
        widths.push(CONTINUATION_LAST - CONTINUATION_FIRST + 1);
        more = hasContinuation(nextRead);
      }
      // a piece that is followed by another keeps its full width (the file trims trailing blanks, the constant
      // does not); the end of the constant is trimmed
      var constantText = pieces.join('').replace(/\s+$/, '');

      var numbers = { length: null, line: null, column: null };
      if (values.length !== '') {
        numbers.length = numberOf(values.length);
        if (numbers.length === null) numberProblem(first, 'The field length', 15, values.length);
      }
      if (values.line !== '') {
        numbers.line = numberOf(values.line);
        if (numbers.line === null) numberProblem(first, 'The line', 19, values.line);
      }
      if (values.column !== '') {
        numbers.column = decodeColumn(values.column);
        if (numbers.column === null) numberProblem(first, 'The column', 21, values.column);
      }
      var type = values.constantType;
      var detail = {
        role: type === 'C' || type === 'M' ? 'constant' : 'field',
        values: values,
        numbers: numbers,
        constantText: constantText,
        continuationLines: last - first
      };
      if (type === 'M') {
        detail.message = { id: read(57, 60).trim(), member: read(61, 62).trim() };
      }
      return { last: last, detail: detail };
    }

    var i = 1;
    while (i <= lines.length) {
      var number = i;
      var raw = lines[i - 1].text;
      try {
        checkLine(number, raw);
        var read = readerOf(raw);
        var kind = classify(raw, read);

        if (kind === 'blank') {
          newEntry('blank', number, number, {});
          i++;
        } else if (kind === 'dds') {
          var end = number;
          while (end < lines.length) {
            var nr = readerOf(lines[end].text);
            if (classify(lines[end].text, nr) !== 'dds') break;
            end++;
            checkLine(end, lines[end - 1].text);
          }
          var ddsLines = [];
          for (var d = number; d <= end; d++) {
            var r = readerOf(lines[d - 1].text);
            // the line as the generator writes it: column 6 becomes A, the asterisk in column 7 a blank
            ddsLines.push(r(1, 5) + 'A' + ' ' + r(8, LINE_WIDTH).replace(/\s+$/, ''));
          }
          newEntry('dds', number, end, { ddsLines: ddsLines });
          i = end + 1;
        } else if (kind === 'comment') {
          newEntry('comment', number, number, { text: read(8, LINE_WIDTH).replace(/\s+$/, '') });
          i++;
        } else if (kind === 'S') {
          var sValues = valuesOf(read, S_COLUMNS);
          current = formats.length;
          var sEntry = newEntry('S', number, number, readS(number, read, sValues));
          formats.push({ index: current, name: sValues.name, startLine: number, endLine: number,
            s: sEntry, help: [], fields: [], entries: [] });
          i++;
        } else if (kind === 'H') {
          var hEntry = newEntry('H', number, number, readH(number, read, valuesOf(read, H_COLUMNS)));
          if (current < 0) problem(number, 6, 'orphanSpec', 'error', 'An H specification before the first S specification.');
          else formats[current].help.push(hEntry);
          i++;
        } else if (kind === 'D') {
          var dValues = valuesOf(read, D_COLUMNS);
          var done = readD(number, read, dValues);
          var dEntry = newEntry('D', number, done.last, done.detail);
          if (current < 0) problem(number, 6, 'orphanSpec', 'error', 'A D specification before the first S specification.');
          else formats[current].fields.push(dEntry);
          i = done.last + 1;
        } else {
          newEntry('unreadable', number, number, {});
          problem(number, 6, 'unknownType', 'error',
            'Column 6 is "' + read(6, 6) + '", not S, H or D (is this DDS source?).');
          i++;
        }
      } catch (e) {
        // a line that defeats the reader is reported and left alone
        if (!entries.length || entries[entries.length - 1].endLine < number) newEntry('unreadable', number, number, {});
        problem(number, 1, 'unreadable', 'error', 'The line could not be read: ' + (e && e.message ? e.message : e));
        i = Math.max(i, entries[entries.length - 1].endLine) + 1;
      }
    }

    // the entries after an S specification belong to its format, up to the next S specification
    entries.forEach(function (entry) {
      if (entry.format >= 0) {
        var f = formats[entry.format];
        if (entry.kind !== 'S') f.entries.push(entry);
        f.endLine = entry.endLine;
      }
    });

    return { bom: bom, eol: dominantEol(lines), lines: lines, entries: entries, formats: formats, problems: problems };
  }

  /** The source text again, exactly as it was read (line ends and byte order mark included). */
  function toText(result) {
    var text = result.lines.map(function (l) { return l.text + l.eol; }).join('');
    return (result.bom ? '﻿' : '') + text;
  }

  return {
    parse: parse,
    toText: toText,
    columnText: columnText,
    decodeColumn: decodeColumn,
    decodeKeyMask: decodeKeyMask,
    S_COLUMNS: S_COLUMNS,
    H_COLUMNS: H_COLUMNS,
    D_COLUMNS: D_COLUMNS,
    LINE_WIDTH: LINE_WIDTH
  };
});
