/**
 * dspfWriter.js
 *
 * Turns an edited field object back into exact fixed-column DDS source lines,
 * and splices those lines into the original source text in place of the
 * lines the field previously occupied. Everything else in the file - other
 * fields, comments, spacing, sequence numbers on untouched lines - is left
 * byte-for-byte untouched.
 *
 * Design choice: rather than trying to keep an in-memory model and a source
 * string in sync incrementally (easy to get subtly wrong), each edit:
 *   1. locates the field's current line range in the *current* source text
 *   2. regenerates just those lines from the field's (updated) properties
 *   3. splices them in
 *   4. the caller re-parses the whole file to get a fresh, trustworthy model
 * Re-parsing a DSPF (typically hundreds of lines) is cheap enough to do on
 * every edit, and it means the model can never drift from the source of truth.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.DspfWriter = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var LINE_WIDTH = 80;
  var FUNCTION_AREA_START = 45; // 1-based
  var FUNCTION_AREA_WIDTH = LINE_WIDTH - FUNCTION_AREA_START + 1; // 36

  function padTo(s, len) {
    s = String(s == null ? '' : s);
    return s.length >= len ? s.slice(0, len) : s + new Array(len - s.length + 1).join(' ');
  }

  function rightAlign(s, len) {
    s = String(s == null ? '' : s);
    return s.length >= len ? s.slice(-len) : new Array(len - s.length + 1).join(' ') + s;
  }

  /**
   * A field is "safe to edit" in v1 if its conditioning is simple enough to
   * round-trip through the single-line indicator slots (cols 8-16): zero or
   * one AND-group of up to 3 indicators. Multi-group (OR'd) or >3-indicator
   * conditioning is preserved on disk but the editor should refuse to touch
   * it rather than silently dropping indicators.
   */
  function isEditable(field) {
    if (!field.conditions || field.conditions.length === 0) return true;
    if (field.conditions.length > 1) return false;
    return field.conditions[0].indicators.length <= 3;
  }

  /** Returns [firstLine, lastLine] (1-based, inclusive) of source lines this field's entry occupies. */
  function getFieldLineRange(field) {
    var max = field.sourceLine;
    (field.keywords || []).forEach(function (k) {
      (k.sourceLines || []).forEach(function (ln) {
        if (ln > max) max = ln;
      });
    });
    return [field.sourceLine, max];
  }

  function serializeConditionCols(field) {
    // Returns the 16-char string for columns 1-16 EXCEPT columns 1-6 (seq+form),
    // i.e. just columns 7-16 (indicator area). Caller combines with preserved 1-6.
    var chars = new Array(10).fill(' '); // represents cols 7-16
    var group = field.conditions && field.conditions[0];
    if (group) {
      var slots = [
        [0, 1, 2], // cols 8,9,10 -> index 1,2 relative to col7=index0... see below
      ];
      // index within this 10-char string: col7=idx0, col8=idx1, col9=idx2, col10=idx3,
      // col11=idx4, col12=idx5, col13=idx6, col14=idx7, col15=idx8, col16=idx9
      chars[0] = group.relation === 'OR' ? 'O' : ' ';
      var positions = [
        { not: 1, digits: [2, 3] },
        { not: 4, digits: [5, 6] },
        { not: 7, digits: [8, 9] },
      ];
      group.indicators.slice(0, 3).forEach(function (ind, i) {
        var pos = positions[i];
        if (ind.not) chars[pos.not] = 'N';
        var num = rightAlign(ind.number, 2);
        chars[pos.digits[0]] = num[0];
        chars[pos.digits[1]] = num[1];
      });
    }
    return chars.join('');
  }

  /** Builds columns 1-44 for a field's positional line. Columns 1-6 are preserved from the original line. */
  function serializePositionalCols(field, originalLine1to6) {
    var chars = new Array(44).fill(' ');
    var seqForm = padTo(originalLine1to6 != null ? originalLine1to6 : 'A', 6);
    for (var i = 0; i < 6; i++) chars[i] = seqForm[i];

    var condCols = serializeConditionCols(field); // 10 chars for cols 7-16
    for (var j = 0; j < 10; j++) chars[6 + j] = condCols[j];

    // col17: name type (blank for FIELD/CONSTANT - HELP/RECORD not supported by the writer yet)
    chars[16] = ' ';

    if (field.nameType === 'FIELD') {
      var name = padTo(field.name || '', 10);
      for (var n = 0; n < 10; n++) chars[18 + n] = name[n];
    }
    // CONSTANT: name area (18-27, 0-based) stays blank.

    chars[28] = field.isReference ? 'R' : ' '; // col29

    if (field.nameType === 'FIELD') {
      var lenStr = field.lengthRaw != null ? field.lengthRaw : field.length != null ? String(field.length) : '';
      var len5 = rightAlign(lenStr, 5);
      for (var l = 0; l < 5; l++) chars[29 + l] = len5[l];

      chars[34] = field.dataType || ' '; // col35

      var decStr = field.decimalPositionsRaw != null ? field.decimalPositionsRaw : field.decimalPositions != null ? String(field.decimalPositions) : '';
      var dec2 = rightAlign(decStr, 2);
      chars[35] = dec2[0];
      chars[36] = dec2[1];

      chars[37] = field.usage && field.usage !== 'O' ? field.usage : ' '; // col38, blank == O
    }

    var lineStr = field.location && field.location.line != null ? String(field.location.line) : '';
    var line3 = rightAlign(lineStr, 3);
    for (var p = 0; p < 3; p++) chars[38 + p] = line3[p];

    var colStr =
      field.location && field.location.relativeColumnOffset != null
        ? '+' + field.location.relativeColumnOffset
        : field.location && field.location.column != null
        ? String(field.location.column)
        : '';
    var col3 = rightAlign(colStr, 3);
    for (var q = 0; q < 3; q++) chars[41 + q] = col3[q];

    return chars.join('');
  }

  /** Builds the full function-area text (unwrapped) for a field: implicit constant literal + keywords, space-separated. */
  function buildFunctionAreaText(field) {
    var parts = [];
    if (field.nameType === 'CONSTANT' && field.constantValue != null) {
      var hasDft = (field.keywords || []).some(function (k) {
        return k.name === 'DFT';
      });
      if (!hasDft) {
        parts.push("'" + String(field.constantValue).replace(/'/g, "''") + "'");
      }
    }
    (field.keywords || []).forEach(function (k) {
      parts.push(k.parameters ? k.name + '(' + k.parameters + ')' : k.name);
    });
    return parts.join(' ');
  }

  /** Wraps function-area text into 80-col lines with +/- continuation, cols 1-44 blank (except 'A' in col 6). */
  function serializeFunctionAreaLines(text) {
    var lines = [];
    var remaining = text;
    while (remaining.length > FUNCTION_AREA_WIDTH) {
      var isLast = false;
      var chunkWidth = FUNCTION_AREA_WIDTH - 1; // reserve 1 col for '+'
      var chunk = remaining.slice(0, chunkWidth);
      remaining = remaining.slice(chunkWidth);
      lines.push({ text: chunk, continuation: '+' });
    }
    lines.push({ text: remaining, continuation: null });

    return lines.map(function (l, idx) {
      var chars = new Array(LINE_WIDTH).fill(' ');
      chars[5] = 'A'; // col6
      var content = l.continuation ? l.text + l.continuation : l.text;
      for (var i = 0; i < content.length && FUNCTION_AREA_START - 1 + i < LINE_WIDTH; i++) {
        chars[FUNCTION_AREA_START - 1 + i] = content[i];
      }
      return chars.join('').replace(/\s+$/, '');
    });
  }

  /** Serializes a full field entry (positional line + any continuation lines) from current field state. */
  function serializeFieldEntry(field, originalLine1to6) {
    var posCols = serializePositionalCols(field, originalLine1to6);
    var functionText = buildFunctionAreaText(field);

    if (functionText.length === 0) {
      return [padTo(posCols, LINE_WIDTH).replace(/\s+$/, '') || posCols.slice(0, 6)];
    }

    var funcLines = serializeFunctionAreaLines(functionText);
    var firstLine = (posCols + funcLines[0].slice(44)).replace(/\s+$/, '');
    var rest = funcLines.slice(1);
    return [firstLine].concat(rest);
  }

  /**
   * Applies `updates` (a partial field object - any of name/length/dataType/decimalPositions/
   * usage/location{line,column}/keywords) to a copy of `field`, regenerates its source lines,
   * and splices them into `sourceLines` (array of original line strings, 1 per array index
   * with index 0 = line 1). Returns the new array of source lines; does not mutate the input.
   */
  function applyFieldUpdate(field, sourceLines, updates) {
    if (!isEditable(field)) {
      throw new Error(
        'This field has multi-group or >3-indicator conditioning that the editor cannot yet round-trip safely; edit the DDS source directly for this field.'
      );
    }

    var updated = JSON.parse(JSON.stringify(field));
    if (updates.name !== undefined) updated.name = updates.name;
    if (updates.length !== undefined) {
      updated.length = updates.length;
      updated.lengthRaw = updates.length == null ? null : String(updates.length);
    }
    if (updates.dataType !== undefined) updated.dataType = updates.dataType;
    if (updates.decimalPositions !== undefined) {
      updated.decimalPositions = updates.decimalPositions;
      updated.decimalPositionsRaw = updates.decimalPositions == null ? null : String(updates.decimalPositions);
    }
    if (updates.usage !== undefined) updated.usage = updates.usage;
    if (updates.line !== undefined) updated.location.line = updates.line;
    if (updates.column !== undefined) {
      updated.location.column = updates.column;
      updated.location.relativeColumnOffset = null; // an explicit move always becomes an absolute column
    }
    if (updates.keywords !== undefined) updated.keywords = updates.keywords;
    if (updates.constantValue !== undefined) updated.constantValue = updates.constantValue;

    var range = getFieldLineRange(field);
    var originalFirstLine = sourceLines[range[0] - 1] || '';
    var originalLine1to6 = originalFirstLine.slice(0, 6);

    var newLines = serializeFieldEntry(updated, originalLine1to6);

    var result = sourceLines.slice(0, range[0] - 1).concat(newLines, sourceLines.slice(range[1]));
    return result;
  }

  return {
    isEditable: isEditable,
    getFieldLineRange: getFieldLineRange,
    serializeFieldEntry: serializeFieldEntry,
    applyFieldUpdate: applyFieldUpdate,
  };
});
