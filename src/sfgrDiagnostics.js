/**
 * sfgrDiagnostics.js (E11j1)
 *
 * Rule checks on System/36 SFGR source (the text of a DSPF36 member or a .dspf36 file): what the Problems panel shows
 * for it. Pure module (no `vscode` import); the reader is sfgrParser.js (E11c) and the ranges are the ones in
 * docs/sda-reference/SFGR-SPEC.md (E11a). Same result shape as ddsDiagnostics.js (E1a), so the hub (E1b) publishes both
 * the same way; the DDS rules never run on SFGR source and these rules never run on DDS.
 *
 *   analyze(text, { severity })  -> { diagnostics, internalErrors }
 *   createAnalyzer()             -> { analyze(text, options), reset() }   remembers the last text (the same text again is not parsed again)
 *   allCodes()                   -> every rule code, for the severity setting
 *
 * A diagnostic is { line, column, endColumn, severity, code, message, keyword, record, source }; positions are 1-based and
 * `endColumn` is exclusive, so it can be handed to a range as it is. `severity` is the rule's own (a parser warning stays
 * a warning, the rest are errors, overlap is a warning) unless `options.severity[code]` says otherwise ('off' drops it).
 *
 * Rules:
 *   isda.sfgrParse           what the parser could not read: an unreadable line, a spec before the first S, a number that
 *                            is not a number, a line past column 80, a tab
 *   isda.sfgrContinuation    an X in column 80 with no D line after it
 *   isda.sfgrValue           a column value outside what the manual allows (S, H and D specifications)
 *   isda.sfgrDuplicateName   the same format name twice in a member (any case)
 *   isda.sfgrOutsideScreen   a field that starts or ends outside its format's screen (the wrap of E11f respected)
 *   isda.sfgrOverlap         two fields of one format on the same cells that are on at the same time
 *
 * Nothing here throws: a rule that fails is skipped and named in `internalErrors`.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sfgrParser.js'));
  } else {
    root.SfgrDiagnostics = factory(root.SfgrParser);
  }
})(typeof self !== 'undefined' ? self : this, function (Parser) {
  'use strict';

  var SOURCE = 'iSDA';
  var CODES = {
    parse: 'isda.sfgrParse',
    continuation: 'isda.sfgrContinuation',
    value: 'isda.sfgrValue',
    duplicate: 'isda.sfgrDuplicateName',
    outside: 'isda.sfgrOutsideScreen',
    overlap: 'isda.sfgrOverlap'
  };
  var DEFAULT_SEVERITY = {};
  DEFAULT_SEVERITY[CODES.overlap] = 'warning';

  /** Cells compared for overlap per format; past it the rule stops for that format (a source that big is not hand-made). */
  var OVERLAP_CELL_BUDGET = 200000;

  function allCodes() {
    return Object.keys(CODES).map(function (k) { return CODES[k]; });
  }

  // ---- allowed values (SFGR-SPEC.md sections 2 - 4) -------------------------------------------------------------------
  // `letters` are the single characters allowed besides blank; `indicator` says an indicator 01 - 99 is allowed too.

  var ENTRY = {
    S: {
      lowercase: { label: 'Lowercase', letters: 'NY' },
      returnInput: { label: 'Return input', letters: 'NY' },
      alarm: { label: 'Sound alarm', letters: 'NY', indicator: true },
      enableFunctionKeys: { label: 'Enable function keys', letters: 'NYR' },
      enableCommandKeys: { label: 'Enable command keys', letters: 'NYR' },
      blinkCursor: { label: 'Blink cursor', letters: 'NY', indicator: true },
      eraseInput: { label: 'Erase input fields', letters: 'NY', indicator: true },
      overrideFields: { label: 'Override fields', letters: 'NY', indicator: true },
      suppressInput: { label: 'Suppress input', letters: 'NY', indicator: true },
      nullFill: { label: 'Null fill', letters: 'NY', indicator: true },
      columns132: { label: '132-column format', letters: 'NY' },
      rightToLeft: { label: 'Right-to-left display', letters: 'NY' }
    },
    H: {
      suppressSelection: { label: 'Suppress selection indicator', letters: '', indicator: true },
      restoreFormat: { label: 'Restore display format', letters: 'NY', indicator: true },
      boundary: { label: 'Boundary indicator', letters: 'NY', indicator: true },
      onlineDocument: { label: 'Online document', letters: 'NY' }
    },
    D: {
      output: { label: 'Output data', letters: 'NY', indicator: true },
      inputAllowed: { label: 'Input allowed', letters: 'NY' },
      dataType: { label: 'Data type', letters: 'BAMNSRZDKEFOX' },
      mandatoryFill: { label: 'Mandatory fill', letters: 'NY' },
      mandatoryEntry: { label: 'Mandatory entry', letters: 'NY' },
      selfCheck: { label: 'Self-check', letters: 'TE' },
      adjustFill: { label: 'Adjust/fill', letters: 'ZB' },
      positionCursor: { label: 'Position cursor', letters: 'NY', indicator: true },
      dupKey: { label: 'Enable Dup key', letters: 'NY' },
      controlledExit: { label: 'Controlled field exit', letters: 'NY' },
      autoAdvance: { label: 'Automatic record advance', letters: 'NY' },
      protect: { label: 'Protect field', letters: 'NY', indicator: true },
      highIntensity: { label: 'High intensity', letters: 'NY', indicator: true },
      blink: { label: 'Blink field', letters: 'NY', indicator: true },
      nondisplay: { label: 'Nondisplay', letters: 'NY', indicator: true },
      reverseImage: { label: 'Reverse image', letters: 'NY', indicator: true },
      underline: { label: 'Underline', letters: 'NY', indicator: true },
      columnSeparators: { label: 'Column separators', letters: 'NY' },
      lowercase: { label: 'Lowercase', letters: 'NY' },
      constantType: { label: 'Constant type', letters: 'CM' },
      continuation: { label: 'Continuation', letters: 'X' }
    }
  };

  var NAME_FIRST = /^[A-Za-z#$@]/;

  // ---- small helpers -----------------------------------------------------------------------------------------------------

  function isIndicator(text) {
    return /^\d{1,2}$/.test(text) && parseInt(text, 10) >= 1;
  }

  function columnOfKey(table, key) {
    for (var i = 0; i < table.length; i++) if (table[i].key === key) return table[i];
    return null;
  }

  function allowedText(rule) {
    var parts = ['blank'];
    rule.letters.split('').forEach(function (c) { parts.push(c); });
    if (rule.indicator) parts.push('an indicator 01 - 99');
    return parts.length === 2 ? parts.join(' or ') : parts.slice(0, -1).join(', ') + ' or ' + parts[parts.length - 1];
  }

  function describe(column) {
    return column.from === column.to ? 'column ' + column.from : 'columns ' + column.from + ' - ' + column.to;
  }

  // ---- the analysis ------------------------------------------------------------------------------------------------------

  function analyzeParsed(parsed) {
    var raw = [];
    var internalErrors = [];

    function add(code, severity, line, column, endColumn, message, extra) {
      raw.push({ line: line, column: column, endColumn: Math.max(endColumn, column + 1), code: code, severity: severity || null,
        message: message, keyword: null, record: extra && extra.record ? extra.record : null });
    }

    function rule(name, fn) {
      try { fn(); } catch (e) { internalErrors.push(name + ': ' + (e && e.message ? e.message : e)); }
    }

    var tables = { S: Parser.S_COLUMNS, H: Parser.H_COLUMNS, D: Parser.D_COLUMNS };

    // ---- what the parser could not read ----------------------------------------------------------------------------
    rule('parse', function () {
      var allColumns = [].concat(Parser.S_COLUMNS, Parser.H_COLUMNS, Parser.D_COLUMNS);
      parsed.problems.forEach(function (p) {
        var text = parsed.lines[p.line - 1] ? parsed.lines[p.line - 1].text : '';
        var size = Array.from(text).length;
        var end;
        if (p.code === 'lineTooLong') end = size + 1;
        else if (p.code === 'unreadable') end = size + 1;
        else {
          end = p.column + 1;
          for (var i = 0; i < allColumns.length; i++) if (allColumns[i].from === p.column) { end = allColumns[i].to + 1; break; }
        }
        var code = p.code === 'unmatchedContinuation' ? CODES.continuation : CODES.parse;
        add(code, p.severity, p.line, p.column, end, p.message);
      });
    });

    // ---- one S, H or D line: the values -------------------------------------------------------------------------------
    function valueProblem(entry, key, column, message, record) {
      add(CODES.value, null, entry.line, column.from, column.to + 1, message, { record: record });
    }

    function checkEntries(entry, type, record) {
      var values = entry.values || {};
      var table = tables[type];
      Object.keys(ENTRY[type]).forEach(function (key) {
        var rule1 = ENTRY[type][key];
        var column = columnOfKey(table, key);
        var v = values[key];
        if (!column || v === undefined || v === '') return;
        var ok = (v.length === 1 && rule1.letters.indexOf(v) >= 0) || (rule1.indicator && isIndicator(v));
        if (!ok) valueProblem(entry, key, column, rule1.label + ' (' + describe(column) + ') is "' + v + '"; use ' + allowedText(rule1) + '.', record);
      });
    }

    function checkName(entry, label, column, record, kind) {
      var v = (entry.values || {}).name;
      if (v === undefined) return;
      if (v === '') {
        if (kind === 'S') valueProblem(entry, 'name', column, label + ' (' + describe(column) + ') is blank; a display format needs a name.', record);
        return;
      }
      if (!NAME_FIRST.test(v) || /[\s,']/.test(v)) {
        valueProblem(entry, 'name', column, label + ' (' + describe(column) + ') is "' + v + '"; it starts with A - Z, # , $ or @ and has no blank, comma or single quote.', record);
      }
    }

    var formatInfo = parsed.formats.map(function (format) {
      var s = format.s;
      var wide = s && s.values && s.values.columns132 === 'Y';
      var startLine = s && s.numbers && s.numbers.startLine !== null && s.numbers.startLine !== undefined ? s.numbers.startLine : 1;
      return { columns: wide ? 132 : 80, lines: wide ? 27 : 24, startLine: startLine, wide: wide };
    });

    rule('values', function () {
      parsed.formats.forEach(function (format, index) {
        var info = formatInfo[index];
        var s = format.s;
        var name = format.name || '';
        checkEntries(s, 'S', name);
        checkName(s, 'Display format name', columnOfKey(Parser.S_COLUMNS, 'name'), name, 'S');
        if (s.numbers.startLine !== null && s.numbers.startLine !== undefined && (s.numbers.startLine < 1 || s.numbers.startLine > info.lines)) {
          valueProblem(s, 'startLine', columnOfKey(Parser.S_COLUMNS, 'startLine'),
            'Start line (columns 17 - 18) is ' + s.numbers.startLine + '; use blank, V or 1 - ' + info.lines + ' for a ' + info.columns + '-column format.', name);
        } else if (s.values.startLine !== '' && s.values.startLine !== 'V' && (s.numbers.startLine === null || s.numbers.startLine === undefined)) {
          // not a number: the parser has said so (isda.sfgrParse), unless it is a letter other than V
          if (/^[A-Za-z]/.test(s.values.startLine)) {
            valueProblem(s, 'startLine', columnOfKey(Parser.S_COLUMNS, 'startLine'),
              'Start line (columns 17 - 18) is "' + s.values.startLine + '"; use blank, V or 1 - ' + info.lines + '.', name);
          }
        }
        if (s.numbers.linesToClear !== null && s.numbers.linesToClear !== undefined && s.numbers.linesToClear > info.lines) {
          valueProblem(s, 'linesToClear', columnOfKey(Parser.S_COLUMNS, 'linesToClear'),
            'Lines to clear (columns 19 - 20) is ' + s.numbers.linesToClear + '; use blank or 0 - ' + info.lines + '.', name);
        }
        var mask = s.keyMask;
        if (mask && mask.invalid && mask.invalid.length) {
          valueProblem(s, 'keyMask', columnOfKey(Parser.S_COLUMNS, 'keyMask'),
            'Key mask (columns 64 - 79) holds ' + mask.invalid.map(function (c) { return c === ' ' ? 'a blank' : '"' + c + '"'; }).join(', ') +
            '; use function key digits 1 - 6 and command key letters A - Y (no O), without blanks between them.', name);
        }

        format.help.forEach(function (h) {
          checkEntries(h, 'H', name);
          var hv = h.values || {};
          if (hv.name !== undefined && hv.name !== '' && h.specType === 'H') {
            checkName(h, 'Help format name or label', columnOfKey(Parser.H_COLUMNS, 'name'), name, 'H');
          }
          [['upperLeft', 'Upper left corner'], ['lowerRight', 'Lower right corner']].forEach(function (pair) {
            var c = h[pair[0]];
            var column = columnOfKey(Parser.H_COLUMNS, pair[0]);
            if (!c || c.row === null || c.column === null) return;
            if (c.row < 0 || c.row > 99 || c.column < 1 || c.column > 132) {
              valueProblem(h, pair[0], column, pair[1] + ' (' + describe(column) + ') is row ' + c.row + ', column ' + c.column + '; use a row 0 - 99 and a column 1 - 132 (A0 - D2 above 99).', name);
            }
          });
          if ((h.upperLeft === null) !== (h.lowerRight === null) && h.upperLeft !== undefined && h.lowerRight !== undefined) {
            valueProblem(h, 'lowerRight', columnOfKey(Parser.H_COLUMNS, h.upperLeft === null ? 'upperLeft' : 'lowerRight'),
              'A help area has both corners or neither (a blank pair is a null help area).', name);
          }
        });

        format.fields.forEach(function (d) {
          checkEntries(d, 'D', name);
          var dv = d.values || {};
          var n = d.numbers || {};
          var lengthColumn = columnOfKey(Parser.D_COLUMNS, 'length');
          var maxLength = info.wide ? 3563 : 1919;
          if (n.length !== null && n.length !== undefined && (n.length < 1 || n.length > maxLength)) {
            valueProblem(d, 'length', lengthColumn, 'Field length (columns 15 - 18) is ' + n.length + '; use 1 - ' + maxLength + ' for a ' + info.columns + '-column format.', name);
          }
          if (n.line !== null && n.line !== undefined && n.line < 1) {
            valueProblem(d, 'line', columnOfKey(Parser.D_COLUMNS, 'line'), 'Line (columns 19 - 20) is ' + n.line + '; the first line is 1.', name);
          }
          if (n.column !== null && n.column !== undefined && (n.column < 1 || n.column > 132)) {
            valueProblem(d, 'column', columnOfKey(Parser.D_COLUMNS, 'column'), 'Column (columns 21 - 22) is ' + dv.column + '; use 1 - 99, or A0 - D2 for 100 - 132.', name);
          }
        });
      });
    });

    // ---- duplicate format names -------------------------------------------------------------------------------------------
    rule('duplicates', function () {
      var seen = {};
      parsed.formats.forEach(function (format) {
        var key = (format.name || '').toUpperCase();
        if (!key) return;
        var column = columnOfKey(Parser.S_COLUMNS, 'name');
        if (Object.prototype.hasOwnProperty.call(seen, key)) {
          add(CODES.duplicate, null, format.s.line, column.from, column.to + 1,
            'The display format name ' + format.name + ' is already used on line ' + seen[key] + '; a name is unique in the member.', { record: format.name });
        } else seen[key] = format.s.line;
      });
    });

    // ---- where a field is: outside the screen, and overlap ---------------------------------------------------------------------
    /** The cells a D entry fills: [{ row, col }] in the format's own screen, wrapped onto the next rows from column 1 (E11f). null when the entry has no position. */
    function cellsOf(d, info, limit) {
      var n = d.numbers || {};
      if (n.length === null || n.length === undefined || n.line === null || n.line === undefined || n.column === null || n.column === undefined) return null;
      if (n.length < 1 || n.line < 1 || n.column < 1) return null;
      var row = info.startLine + n.line - 1;
      var col = n.column;
      var cells = [];
      for (var k = 0; k < n.length && cells.length < limit; k++) {
        cells.push({ row: row, col: col });
        col++;
        if (col > info.columns) { col = 1; row++; }
      }
      return { cells: cells, firstRow: info.startLine + n.line - 1, lastRow: row - (col === 1 && n.length > 0 ? 1 : 0), complete: cells.length === n.length };
    }

    rule('outside', function () {
      parsed.formats.forEach(function (format, index) {
        var info = formatInfo[index];
        var name = format.name || '';
        format.fields.forEach(function (d) {
          var n = d.numbers || {};
          if (n.length === null || n.length === undefined || n.line === null || n.line === undefined || n.column === null || n.column === undefined) return;
          if (n.length < 1 || n.length > (info.wide ? 3563 : 1919) || n.line < 1 || n.column < 1 || n.column > 132) return; // said by isda.sfgrValue
          var cols = columnOfKey(Parser.D_COLUMNS, 'column');
          var lengthColumn = columnOfKey(Parser.D_COLUMNS, 'length');
          if (n.column > info.columns) {
            add(CODES.outside, null, d.line, cols.from, cols.to + 1,
              'Column ' + n.column + ' is outside the ' + info.columns + '-column screen of format ' + name + (info.wide ? '' : ' (set column 39 to Y for 132 columns)') + '.', { record: name });
            return;
          }
          var row = info.startLine + n.line - 1;
          if (row > info.lines) {
            var lineColumn = columnOfKey(Parser.D_COLUMNS, 'line');
            add(CODES.outside, null, d.line, lineColumn.from, lineColumn.to + 1,
              'Line ' + n.line + ' from start line ' + info.startLine + ' is row ' + row + ', below the last row (' + info.lines + ') of format ' + name + '.', { record: name });
            return;
          }
          // the wrap: from `column` to the end of the row, then whole rows from column 1
          var first = info.columns - n.column + 1;
          var extraRows = n.length > first ? Math.ceil((n.length - first) / info.columns) : 0;
          if (row + extraRows > info.lines) {
            add(CODES.outside, null, d.line, lengthColumn.from, lengthColumn.to + 1,
              'A field of ' + n.length + ' characters from row ' + row + ', column ' + n.column + ' runs on to row ' + (row + extraRows) + ', past the last row (' + info.lines + ') of format ' + name + '.', { record: name });
          }
        });
      });
    });

    rule('overlap', function () {
      parsed.formats.forEach(function (format, index) {
        var info = formatInfo[index];
        var name = format.name || '';
        var budget = OVERLAP_CELL_BUDGET;
        var owner = {}; // "row:col" -> [{ entry, presence }]
        for (var i = 0; i < format.fields.length && budget > 0; i++) {
          var d = format.fields[i];
          var n = d.numbers || {};
          if (n.length > (info.wide ? 3563 : 1919) || n.column > info.columns || n.column > 132) continue;
          var shape = cellsOf(d, info, Math.min(budget, 4000));
          if (!shape || !shape.complete) continue;
          if (shape.lastRow > info.lines) continue; // outside the screen: said by isda.sfgrOutsideScreen
          budget -= shape.cells.length;
          var out = (d.values || {}).output || '';
          var presence = isIndicator(out) ? 'i' + parseInt(out, 10) : 'always';
          var clash = null;
          for (var c = 0; c < shape.cells.length && !clash; c++) {
            var list = owner[shape.cells[c].row + ':' + shape.cells[c].col];
            if (!list) continue;
            for (var k = 0; k < list.length; k++) {
              if (list[k].presence === presence && list[k].entry !== d) { clash = list[k].entry; break; }
            }
          }
          if (clash) {
            var lengthColumn = columnOfKey(Parser.D_COLUMNS, 'length');
            var columnColumn = columnOfKey(Parser.D_COLUMNS, 'column');
            add(CODES.overlap, null, d.line, lengthColumn.from, columnColumn.to + 1,
              'This field shares screen cells with the field on line ' + clash.line + ' of format ' + name + '; two fields cannot occupy the same cells.', { record: name });
          }
          shape.cells.forEach(function (cell) {
            var key2 = cell.row + ':' + cell.col;
            (owner[key2] = owner[key2] || []).push({ entry: d, presence: presence });
          });
        }
      });
    });

    return { raw: raw, internalErrors: internalErrors };
  }

  /** Settings applied last, so a cached analysis does not depend on them. */
  function finish(raw, options) {
    var severityMap = (options && options.severity) || {};
    var out = [];
    raw.forEach(function (d) {
      var severity = severityMap[d.code] || d.severity || DEFAULT_SEVERITY[d.code] || 'error';
      if (severity === 'off') return;
      out.push({
        line: d.line, column: d.column, endColumn: d.endColumn, severity: severity, code: d.code,
        message: d.message, keyword: d.keyword, record: d.record, source: SOURCE
      });
    });
    out.sort(function (a, b) { return a.line - b.line || a.column - b.column || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0); });
    return out;
  }

  function analyze(text, options) {
    var result;
    try {
      result = analyzeParsed(Parser.parse(typeof text === 'string' ? text : ''));
    } catch (e) {
      return { diagnostics: [], internalErrors: ['analysis: ' + (e && e.message ? e.message : e)] };
    }
    return { diagnostics: finish(result.raw, options), internalErrors: result.internalErrors };
  }

  function createAnalyzer() {
    var lastText = null;
    var last = null;
    return {
      analyze: function (text, options) {
        if (last === null || text !== lastText) {
          try { last = analyzeParsed(Parser.parse(typeof text === 'string' ? text : '')); }
          catch (e) { last = { raw: [], internalErrors: ['analysis: ' + (e && e.message ? e.message : e)] }; }
          lastText = text;
        }
        return { diagnostics: finish(last.raw, options), internalErrors: last.internalErrors };
      },
      reset: function () { lastText = null; last = null; }
    };
  }

  return {
    analyze: analyze,
    createAnalyzer: createAnalyzer,
    allCodes: allCodes,
    CODES: CODES,
    SOURCE: SOURCE
  };
});
