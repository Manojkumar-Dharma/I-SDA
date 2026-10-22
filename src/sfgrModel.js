/**
 * sfgrModel.js (E11e)
 *
 * Fills the designer's record and field model (dspfModel.ts: DspfFile / DdsRecordFormat / DdsFieldBase) from System/36
 * SFGR source, so dspfEngine.js draws a DSPF36 member the way it draws DDS. Pure module (no `vscode`); it reads the
 * source with sfgrParser.js and gives back the same shape the DDS parser gives, with a few optional `sfgr` additions
 * for what DDS has no place for (dspfModel.ts: SfgrFormatInfo, SfgrFieldInfo). The column layout is
 * docs/sda-reference/SFGR-SPEC.md; the decisions below are E11e's (FEATURE-ROADMAP.md, "E11e results").
 *
 *   buildModel(source)             source text, or the result of SfgrParser.parse -> DspfFile
 *   sizeIndexOf(dspfFile, name)    which of the file's display sizes (DspfEngine sizeIndex) a format belongs on
 *   indicatorEntry(text, allow)    one on/off/indicator column entry: { kind: 'off' | 'on' | 'indicator' | 'invalid' }
 *
 * One format = one record (named as the S specification names it). One D specification = one field, or two (below).
 *
 * Position. A field keeps the line and column the source has; the line is RELATIVE to the format's start line, which
 * the record carries (`sfgr.startLine`) and the engine adds (the row drawn is start line + line - 1). Column 1 is
 * column 1 as in DDS: the attribute byte sits in front of the field in both.
 *
 * Constant or field. A D specification with constant type C or M is a constant; one without is a field.
 *   - constant, no input:            a CONSTANT (text padded with blanks to the field length, so a blank run that
 *                                    carries an attribute is as wide as the source says).
 *   - constant, output indicator nn: two entries at the same place - the CONSTANT when N nn, and a FIELD (usage O)
 *                                    when nn (the manual, Figure B-7 / B-8: the program's data shows when the
 *                                    indicator is on, the constant when it is off).
 *   - constant, input allowed:       a FIELD (usage I, or B with output) whose DFTVAL is the constant.
 *   - message constant (type M):     a CONSTANT whose text is the message id in brackets, the design-time stand-in
 *                                    the engine uses for MSGCON; the id and member are kept in `sfgr.message`.
 *   - field: input and output Y or an indicator -> B; input only -> I; output only -> O (conditioned on its
 *     indicator when output is one); neither -> usage H, which nothing draws.
 * An output indicator on a field that also allows input does not condition it: the field is there either way.
 *
 * Attributes become the DDS keywords that mean the same, each with the indicator the column holds (a Y is
 * unconditioned, N or blank is none): protect DSPATR(PR), high intensity HI, blink BL, nondisplay ND, reverse image
 * RI, underline UL, position cursor PC; column separators (Y or N only) DSPATR(CS); lowercase LOWER on an input
 * field that is not numeric (column 51, else the format's column 21). The engine and the simulator therefore draw
 * and condition them with no SFGR-specific code.
 *
 * Data type. The manual's table (B-18, SFGR-SPEC.md section 4): blank blank, B A, A X, M N, N M, S S, R I, Z A, D D,
 * K W, E and F E, O O, X J. The SFGR type is kept in `sfgr.sfgrDataType`. Only S gets decimal positions (0).
 *
 * Display size. 24 x 80 is the default and needs no keyword; a 132-column format (S column 39 = Y) is 27 x 132. A
 * file with both gets DSPSIZ(24 80 *DS3 27 132 *DS4) and `sizeIndexOf` says which size a format is drawn on.
 *
 * Kept off the model's keywords (in `record.sfgr`): the S specification's other entries (alarm, enable keys, blink
 * cursor, erase and override, suppress input, null fill, ...), the key mask, H specifications and `*DDS` blocks.
 * A value that is not one of the column's allowed entries is read as off and reported in `errors`.
 *
 * Plain dependency-light JS (UMD), same style as ddsOutline.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./sfgrParser.js'));
  } else {
    root.SfgrModel = factory(root.SfgrParser);
  }
})(typeof self !== 'undefined' ? self : this, function (SfgrParser) {
  'use strict';

  // SFGR data type (D column 27) -> DDS data type (position 35), B-18.
  var DATA_TYPES = { '': '', B: 'A', A: 'X', M: 'N', N: 'M', S: 'S', R: 'I', Z: 'A', D: 'D', K: 'W', E: 'E', F: 'E', O: 'O', X: 'J' };

  // DDS types a lowercase letter can be typed into.
  var LOWERCASE_TYPES = { '': true, A: true, X: true, N: true, W: true, E: true, O: true, J: true };

  // D column entries that become DSPATR(x): [column key, attribute, may hold an indicator]
  var ATTRIBUTES = [
    ['protect', 'PR', true], ['highIntensity', 'HI', true], ['blink', 'BL', true], ['nondisplay', 'ND', true],
    ['reverseImage', 'RI', true], ['underline', 'UL', true], ['columnSeparators', 'CS', false], ['positionCursor', 'PC', true]
  ];

  var SIZE_80 = { lines: 24, columns: 80, name: '*DS3' };
  var SIZE_132 = { lines: 27, columns: 132, name: '*DS4' };

  /**
   * One on/off/indicator column entry (the two-column ones in D 23 - 24, 37 - 48 and S 25 - 38, the single-column
   * ones in D 49 and others): blank or N is off, Y is on, 01 - 99 an indicator. `allowIndicator` false makes an
   * indicator invalid (a single-column entry). Anything else is 'invalid'.
   */
  function indicatorEntry(text, allowIndicator) {
    var t = String(text == null ? '' : text).trim();
    if (t === '' || t === 'N') return { kind: 'off' };
    if (t === 'Y') return { kind: 'on' };
    if (allowIndicator !== false && /^\d\d$/.test(t) && t !== '00') return { kind: 'indicator', number: t };
    return { kind: 'invalid', text: t };
  }

  function condition(number, not, line) {
    return { relation: 'AND', indicators: [{ number: number, not: !!not }], displaySizeCondition: null, sourceLines: [line] };
  }

  function keyword(name, parameters, conditions, line) {
    return {
      name: name,
      parameters: parameters,
      conditions: conditions || [],
      raw: parameters === '' ? name : name + '(' + parameters + ')',
      sourceLines: [line]
    };
  }

  function quote(text) {
    return "'" + String(text).replace(/'/g, "''") + "'";
  }

  function padEnd(text, length) {
    return length != null && text.length < length ? text + new Array(length - text.length + 1).join(' ') : text;
  }

  function corner(c) {
    return c ? { row: c.row, column: c.column } : null;
  }

  /** Builds the model. `source` is the SFGR text or an SfgrParser.parse result. Never throws. */
  function buildModel(source) {
    var parsed = source && typeof source === 'object' && Array.isArray(source.entries) ? source : SfgrParser.parse(source);
    var errors = [];
    var comments = [];

    function rawLine(n) {
      var l = parsed.lines[n - 1];
      return l ? l.text : '';
    }
    function error(line, message) {
      errors.push({ line: line, message: message, raw: rawLine(line) });
    }
    parsed.problems.forEach(function (p) {
      if (p.severity === 'error') error(p.line, p.message);
    });

    // an on / off / indicator entry; an invalid one is read as off and reported
    function entryOf(line, label, text, allowIndicator) {
      var e = indicatorEntry(text, allowIndicator);
      if (e.kind === 'invalid') {
        error(line, label + ' is "' + e.text + '"; ' + (allowIndicator === false ? 'Y, N or blank' : 'Y, N, blank or an indicator 01 - 99') + ' is expected. Read as off.');
        return { kind: 'off' };
      }
      return e;
    }

    // the DDS conditions an entry gives a keyword or field: none for on, the indicator for an indicator
    function conditionsOf(e, line) {
      return e.kind === 'indicator' ? [condition(e.number, false, line)] : [];
    }

    // the DSPATR keywords of a D specification, read once (a bad entry is reported once, however many fields it makes)
    function dspatrKeywords(entry) {
      var list = [];
      ATTRIBUTES.forEach(function (a) {
        var e = entryOf(entry.line, 'Column entry ' + a[0], entry.values[a[0]], a[2]);
        if (e.kind === 'on' || e.kind === 'indicator') list.push(keyword('DSPATR', a[1], conditionsOf(e, entry.line), entry.line));
      });
      return list;
    }

    function copyKeyword(k) {
      return { name: k.name, parameters: k.parameters, conditions: k.conditions.map(function (c) {
        return { relation: c.relation, indicators: c.indicators.map(function (i) { return { number: i.number, not: i.not }; }),
          displaySizeCondition: null, sourceLines: c.sourceLines.slice() };
      }), raw: k.raw, sourceLines: k.sourceLines.slice() };
    }

    // lowercase: column 51 wins, else the format's column 21; only where a letter can be typed into the field
    function lowerKeyword(entry, formatValues, usage, ddsType) {
      if (usage !== 'I' && usage !== 'B') return null;
      var lc = entry.values.lowercase === 'Y' || (entry.values.lowercase !== 'N' && formatValues.lowercase === 'Y');
      return lc && LOWERCASE_TYPES[ddsType] ? keyword('LOWER', '', [], entry.line) : null;
    }

    // the fields one D specification makes
    function fieldsOf(entry, formatValues) {
      var v = entry.values;
      var n = entry.numbers;
      var sfgrType = v.dataType;
      var ddsType = Object.prototype.hasOwnProperty.call(DATA_TYPES, sfgrType) ? DATA_TYPES[sfgrType] : null;
      if (ddsType === null) {
        error(entry.line, 'Data type "' + sfgrType + '" (column 27) is not one SFGR defines. Read as blank.');
        ddsType = '';
      }
      var out = entryOf(entry.line, 'Output data (columns 23 - 24)', v.output, true);
      var inputEntry = entryOf(entry.line, 'Input allowed (column 26)', v.inputAllowed, false);
      var input = inputEntry.kind === 'on';
      var isConstant = entry.role === 'constant';
      var isMessage = v.constantType === 'M';
      var text = isMessage ? '[' + (entry.message ? entry.message.id : '') + ']' : entry.constantText;

      var attributes = dspatrKeywords(entry);

      function make(parts) {
        var usage = parts.usage;
        var length = n.length;
        var field = {
          nameType: parts.nameType,
          name: parts.nameType === 'CONSTANT' ? '' : v.name,
          isReference: false,
          lengthRaw: v.length === '' ? null : v.length,
          length: length,
          lengthAdjust: null,
          dataType: parts.nameType === 'CONSTANT' ? null : ddsType,
          decimalPositionsRaw: parts.nameType !== 'CONSTANT' && ddsType === 'S' ? '0' : null,
          decimalPositions: parts.nameType !== 'CONSTANT' && ddsType === 'S' ? 0 : null,
          usage: usage,
          location: { line: n.line, column: n.column, relativeColumnOffset: null },
          conditions: parts.conditions || [],
          keywords: attributes.map(copyKeyword),
          constantValue: parts.nameType === 'CONSTANT' ? padEnd(text, length) : null,
          sourceLine: entry.line,
          entrySourceLines: entry.lines.slice(),
          sfgr: {
            specName: v.name,
            line: entry.line,
            endLine: entry.endLine,
            part: parts.part,
            sfgrDataType: sfgrType,
            message: isMessage && entry.message ? { id: entry.message.id, member: entry.message.member } : null
          }
        };
        var lower = lowerKeyword(entry, formatValues, usage, ddsType);
        if (lower) field.keywords.push(lower);
        if (parts.dftval != null) field.keywords.push(keyword('DFTVAL', quote(parts.dftval), [], entry.line));
        return field;
      }

      var outputs = out.kind === 'on' || out.kind === 'indicator';
      if (isConstant && !input) {
        if (out.kind === 'indicator') {
          return [
            make({ nameType: 'CONSTANT', usage: null, part: 'constantWhenOff', conditions: [condition(out.number, true, entry.line)] }),
            make({ nameType: 'FIELD', usage: 'O', part: 'dataWhenOn', conditions: [condition(out.number, false, entry.line)] })
          ];
        }
        return [make({ nameType: 'CONSTANT', usage: null, part: 'whole' })];
      }
      if (input) {
        return [make({ nameType: 'FIELD', usage: outputs ? 'B' : 'I', part: 'whole', dftval: isConstant && !isMessage ? text : null })];
      }
      if (out.kind === 'on') return [make({ nameType: 'FIELD', usage: 'O', part: 'whole' })];
      if (out.kind === 'indicator') return [make({ nameType: 'FIELD', usage: 'O', part: 'whole', conditions: [condition(out.number, false, entry.line)] })];
      return [make({ nameType: 'FIELD', usage: 'H', part: 'whole' })]; // neither output nor input: nothing to draw
    }

    var records = parsed.formats.map(function (format) {
      var s = format.s;
      var sv = s.values;
      var record = {
        name: format.name,
        conditions: [],
        keywords: [],
        helpEntries: [],
        fields: [],
        sourceLine: format.startLine,
        sfgr: {
          sourceLine: format.startLine,
          endLine: format.endLine,
          startLine: s.numbers.startLine,
          startLineVariable: s.startLineVariable,
          linesToClear: s.numbers.linesToClear,
          columns132: entryOf(s.line, 'The 132-column entry (column 39)', sv.columns132, false).kind === 'on',
          values: Object.assign({}, sv),
          keyMask: s.keyMask,
          help: format.help.map(function (h) {
            return { line: h.line, values: Object.assign({}, h.values), upperLeft: corner(h.upperLeft), lowerRight: corner(h.lowerRight) };
          }),
          passThrough: format.entries.filter(function (e) { return e.kind === 'dds'; }).map(function (e) {
            return { line: e.line, endLine: e.endLine, ddsLines: e.ddsLines.slice() };
          })
        }
      };
      format.fields.forEach(function (d) {
        fieldsOf(d, sv).forEach(function (f) { record.fields.push(f); });
      });
      return record;
    });

    parsed.entries.forEach(function (e) {
      if (e.kind === 'comment') comments.push({ line: e.line, text: e.text });
    });

    var has80 = records.some(function (r) { return !r.sfgr.columns132; });
    var has132 = records.some(function (r) { return r.sfgr.columns132; });
    var sizes = [];
    var fileKeywords = [];
    if (has132 && !has80) {
      sizes = [Object.assign({}, SIZE_132)];
      fileKeywords.push(keyword('DSPSIZ', '27 132 *DS4', [], 0));
    } else if (has132) {
      sizes = [Object.assign({}, SIZE_80), Object.assign({}, SIZE_132)];
      fileKeywords.push(keyword('DSPSIZ', '24 80 *DS3 27 132 *DS4', [], 0));
    } else {
      sizes = [{ lines: 24, columns: 80, name: null }];
    }
    fileKeywords.forEach(function (k) { k.sourceLines = []; });

    return {
      fileKeywords: fileKeywords,
      records: records,
      comments: comments,
      errors: errors,
      sourceKind: 'sfgr',
      sfgr: { sizes: sizes }
    };
  }

  /** The display size (index into the engine's sizes for the file) the format is drawn on: the 132-column size for a
   *  132-column format, else the 24 x 80 one. 0 when the format is not in the file. */
  function sizeIndexOf(dspfFile, recordName) {
    var record = (dspfFile.records || []).find(function (r) { return r.name === recordName; });
    var sizes = (dspfFile.sfgr && dspfFile.sfgr.sizes) || [];
    if (!record || !record.sfgr) return 0;
    var columns = record.sfgr.columns132 ? 132 : 80;
    for (var i = 0; i < sizes.length; i++) if (sizes[i].columns === columns) return i;
    return 0;
  }

  return {
    buildModel: buildModel,
    sizeIndexOf: sizeIndexOf,
    indicatorEntry: indicatorEntry,
    DATA_TYPES: DATA_TYPES
  };
});
