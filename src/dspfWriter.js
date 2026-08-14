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
   * Splits a full conditions array (arbitrary number of OR'd groups, each with
   * arbitrarily many indicators) into "chunks" of at most 3 indicators each -
   * one chunk per physical source line's worth of indicator columns (7-16).
   * The first chunk of a group carries that group's relation ('AND' for the
   * very first group overall, 'OR' for every other group - which is exactly
   * what the parser already normalizes group.relation to); every other chunk
   * within the same group continues it (relation 'AND', i.e. blank/A in col 7).
   */
  function buildConditionChunks(conditions) {
    var chunks = [];
    (conditions || []).forEach(function (group) {
      var inds = group.indicators || [];
      var lineCount = Math.max(1, Math.ceil(inds.length / 3));
      for (var i = 0; i < lineCount; i++) {
        chunks.push({
          relation: i === 0 ? group.relation : 'AND',
          indicators: inds.slice(i * 3, i * 3 + 3),
        });
      }
    });
    return chunks;
  }

  /** Returns the 10-char string for columns 7-16 (indicator area) for ONE chunk (<=3 indicators). */
  function serializeConditionCols(chunk) {
    var chars = new Array(10).fill(' ');
    if (chunk) {
      chars[0] = chunk.relation === 'OR' ? 'O' : ' ';
      var positions = [
        { not: 1, digits: [2, 3] },
        { not: 4, digits: [5, 6] },
        { not: 7, digits: [8, 9] },
      ];
      (chunk.indicators || []).slice(0, 3).forEach(function (ind, i) {
        var pos = positions[i];
        if (ind.not) chars[pos.not] = 'N';
        var num = rightAlign(ind.number, 2);
        chars[pos.digits[0]] = num[0];
        chars[pos.digits[1]] = num[1];
      });
    }
    return chars.join('');
  }

  /** Builds a full 80-col line carrying ONLY indicator columns (7-16) - used for every
   *  condition chunk except the last, which instead merges into the content line itself. */
  function serializeConditionOnlyLine(chunk, originalLine1to6) {
    var chars = new Array(LINE_WIDTH).fill(' ');
    var seqForm = padTo(originalLine1to6 != null ? originalLine1to6 : 'A', 6);
    for (var i = 0; i < 6; i++) chars[i] = seqForm[i];
    var condCols = serializeConditionCols(chunk);
    for (var j = 0; j < 10; j++) chars[6 + j] = condCols[j];
    return chars.join('').replace(/\s+$/, '');
  }

  /** All condition lines except the last chunk (which the caller merges into its own content line). */
  function serializeConditionPrefixLines(conditions, originalLine1to6) {
    var chunks = buildConditionChunks(conditions);
    return chunks.slice(0, -1).map(function (chunk) {
      return serializeConditionOnlyLine(chunk, originalLine1to6);
    });
  }

  /** The chunk that belongs on the entity's own content line (its cols 7-16), or null if unconditioned. */
  function lastConditionChunk(conditions) {
    var chunks = buildConditionChunks(conditions);
    return chunks.length > 0 ? chunks[chunks.length - 1] : null;
  }

  /** Returns [firstLine, lastLine] (1-based, inclusive) of source lines this field's entry occupies -
   *  including any pure indicator-only lines that PRECEDE its own content line (multi-group/multi-line
   *  conditioning), which field.sourceLine/keywords[].sourceLines alone wouldn't capture. */
  function getFieldLineRange(field) {
    var min = field.sourceLine;
    var max = field.sourceLine;
    (field.conditions || []).forEach(function (g) {
      (g.sourceLines || []).forEach(function (ln) {
        if (ln < min) min = ln;
        if (ln > max) max = ln;
      });
    });
    (field.keywords || []).forEach(function (k) {
      (k.sourceLines || []).forEach(function (ln) {
        if (ln > max) max = ln;
      });
      (k.conditions || []).forEach(function (g) {
        (g.sourceLines || []).forEach(function (ln) {
          if (ln < min) min = ln;
          if (ln > max) max = ln;
        });
      });
    });
    return [min, max];
  }

  /** Builds columns 1-44 for a field's positional line. Columns 1-6 are preserved from the original line. */
  function serializePositionalCols(field, originalLine1to6) {
    var chars = new Array(44).fill(' ');
    var seqForm = padTo(originalLine1to6 != null ? originalLine1to6 : 'A', 6);
    for (var i = 0; i < 6; i++) chars[i] = seqForm[i];

    var condCols = serializeConditionCols(lastConditionChunk(field.conditions)); // 10 chars for cols 7-16
    for (var j = 0; j < 10; j++) chars[6 + j] = condCols[j];

    // col17: name type - blank for FIELD/CONSTANT, 'H' for HELP.
    chars[16] = field.nameType === 'HELP' ? 'H' : ' ';

    if (field.nameType === 'FIELD') {
      var name = padTo(field.name || '', 10);
      for (var n = 0; n < 10; n++) chars[18 + n] = name[n];
    }
    // CONSTANT/HELP: name area (18-27, 0-based) stays blank.

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

  /** Builds the full function-area text (unwrapped) for a field: implicit constant literal + the given
   *  keyword list, space-separated. Callers pass only the UNCONDITIONED keywords here - conditioned
   *  keywords get their own dedicated line(s) via serializeConditionedKeywordLines instead, since a
   *  keyword's condition lives on lines that precede just that keyword, not the whole field. */
  function buildFunctionAreaText(field, keywords) {
    var parts = [];
    if (field.nameType === 'CONSTANT' && field.constantValue != null) {
      var hasDft = (keywords || []).some(function (k) {
        return k.name === 'DFT';
      });
      if (!hasDft) {
        parts.push("'" + String(field.constantValue).replace(/'/g, "''") + "'");
      }
    }
    (keywords || []).forEach(function (k) {
      parts.push(k.parameters ? k.name + '(' + k.parameters + ')' : k.name);
    });
    return parts.join(' ');
  }

  function conditionsEqual(a, b) {
    return JSON.stringify(a || []) === JSON.stringify(b || []);
  }

  /** Groups keywords into runs that share identical conditions (preserving order), so keywords
   *  conditioned together end up back on the same line group they'd naturally occupy. */
  function groupKeywordsByCondition(keywords) {
    var groups = [];
    (keywords || []).forEach(function (k) {
      var last = groups[groups.length - 1];
      if (last && conditionsEqual(last.conditions, k.conditions)) {
        last.keywords.push(k);
      } else {
        groups.push({ conditions: k.conditions || [], keywords: [k] });
      }
    });
    return groups;
  }

  /** Serializes one or more keywords that share the same (non-empty) condition: the condition's
   *  prefix chunks as indicator-only lines, then a final line combining the last chunk's indicator
   *  columns with the keyword text itself (wrapped via continuation if it doesn't fit one line). */
  function serializeConditionedKeywordLines(conditions, keywords, originalLine1to6) {
    var text = keywords
      .map(function (k) {
        return k.parameters ? k.name + '(' + k.parameters + ')' : k.name;
      })
      .join(' ');
    if (text.length === 0) return serializeConditionPrefixLines(conditions, originalLine1to6).concat([serializeConditionOnlyLine(lastConditionChunk(conditions), originalLine1to6)]);

    var prefixLines = serializeConditionPrefixLines(conditions, originalLine1to6);
    var condCols = serializeConditionCols(lastConditionChunk(conditions));
    var posChars = new Array(44).fill(' ');
    var seqForm = padTo(originalLine1to6 != null ? originalLine1to6 : 'A', 6);
    for (var i = 0; i < 6; i++) posChars[i] = seqForm[i];
    for (var j = 0; j < 10; j++) posChars[6 + j] = condCols[j];
    var posCols = posChars.join('');

    var funcLines = serializeFunctionAreaLines(text);
    var firstLine = (posCols + funcLines[0].slice(44)).replace(/\s+$/, '');
    return prefixLines.concat([firstLine], funcLines.slice(1));
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

  /** Serializes a full field entry from current field state: the field's OWN condition prefix
   *  lines (if field.conditions spans multiple groups/lines), its content line(s) built from
   *  unconditioned keywords, then each run of identically-conditioned keywords as their own
   *  dedicated line(s) - preserving per-keyword conditioning instead of silently dropping it. */
  function serializeFieldEntry(field, originalLine1to6) {
    var allKeywords = field.keywords || [];
    var unconditioned = allKeywords.filter(function (k) { return !k.conditions || k.conditions.length === 0; });
    var conditioned = allKeywords.filter(function (k) { return k.conditions && k.conditions.length > 0; });

    var fieldPrefixLines = serializeConditionPrefixLines(field.conditions, originalLine1to6);
    var posCols = serializePositionalCols(field, originalLine1to6);
    var functionText = buildFunctionAreaText(field, unconditioned);

    var contentLines;
    if (functionText.length === 0) {
      contentLines = [padTo(posCols, LINE_WIDTH).replace(/\s+$/, '') || posCols.slice(0, 6)];
    } else {
      var funcLines = serializeFunctionAreaLines(functionText);
      var firstLine = (posCols + funcLines[0].slice(44)).replace(/\s+$/, '');
      contentLines = [firstLine].concat(funcLines.slice(1));
    }

    var keywordLines = [];
    groupKeywordsByCondition(conditioned).forEach(function (g) {
      keywordLines = keywordLines.concat(serializeConditionedKeywordLines(g.conditions, g.keywords, originalLine1to6));
    });

    return fieldPrefixLines.concat(contentLines, keywordLines);
  }

  // ---------------------------------------------------------------------
  // RECORD entries: a different shape than fields (no location/length/type -
  // just a name, optional conditioning, and record-level keywords), so they
  // get their own serialization path rather than forcing them through
  // serializeFieldEntry's field-shaped assumptions.
  // ---------------------------------------------------------------------

  /** Returns [firstLine, lastLine] this record's OWN entry occupies - its R line
   *  plus any keyword-only lines that appeared before the first field/help/constant
   *  (record.keywords only ever contains lines from that window - see dspfParser.ts),
   *  plus any pure indicator-only lines preceding it (multi-group/multi-line conditioning). */
  function getRecordLineRange(record) {
    var min = record.sourceLine;
    var max = record.sourceLine;
    (record.conditions || []).forEach(function (g) {
      (g.sourceLines || []).forEach(function (ln) {
        if (ln < min) min = ln;
        if (ln > max) max = ln;
      });
    });
    (record.keywords || []).forEach(function (k) {
      (k.sourceLines || []).forEach(function (ln) {
        if (ln > max) max = ln;
      });
      (k.conditions || []).forEach(function (g) {
        (g.sourceLines || []).forEach(function (ln) {
          if (ln < min) min = ln;
          if (ln > max) max = ln;
        });
      });
    });
    return [min, max];
  }

  function serializeRecordPositionalCols(record, originalLine1to6) {
    var chars = new Array(44).fill(' ');
    var seqForm = padTo(originalLine1to6 != null ? originalLine1to6 : 'A', 6);
    for (var i = 0; i < 6; i++) chars[i] = seqForm[i];

    var condCols = serializeConditionCols(lastConditionChunk(record.conditions)); // works off record.conditions same as a field's
    for (var j = 0; j < 10; j++) chars[6 + j] = condCols[j];

    chars[16] = 'R'; // col17
    var name = padTo(record.name || '', 10);
    for (var n = 0; n < 10; n++) chars[18 + n] = name[n];

    return chars.join('');
  }

  function buildRecordFunctionAreaText(keywords) {
    return (keywords || [])
      .map(function (k) {
        return k.parameters ? k.name + '(' + k.parameters + ')' : k.name;
      })
      .join(' ');
  }

  /** Same per-keyword-conditioning treatment as serializeFieldEntry, applied to a record's own keywords. */
  function serializeRecordEntry(record, originalLine1to6) {
    var allKeywords = record.keywords || [];
    var unconditioned = allKeywords.filter(function (k) { return !k.conditions || k.conditions.length === 0; });
    var conditioned = allKeywords.filter(function (k) { return k.conditions && k.conditions.length > 0; });

    var recordPrefixLines = serializeConditionPrefixLines(record.conditions, originalLine1to6);
    var posCols = serializeRecordPositionalCols(record, originalLine1to6);
    var functionText = buildRecordFunctionAreaText(unconditioned);

    var contentLines;
    if (functionText.length === 0) {
      contentLines = [posCols.replace(/\s+$/, '') || posCols.slice(0, 6)];
    } else {
      var funcLines = serializeFunctionAreaLines(functionText);
      var firstLine = (posCols + funcLines[0].slice(44)).replace(/\s+$/, '');
      contentLines = [firstLine].concat(funcLines.slice(1));
    }

    var keywordLines = [];
    groupKeywordsByCondition(conditioned).forEach(function (g) {
      keywordLines = keywordLines.concat(serializeConditionedKeywordLines(g.conditions, g.keywords, originalLine1to6));
    });

    return recordPrefixLines.concat(contentLines, keywordLines);
  }

  /**
   * Applies `updates` (currently just { keywords }) to a record format's own
   * entry line(s). Renaming isn't supported in v1 - other parts of the file
   * (SFLCTL(name), WINDOW-linked records, MNUBARCHC(id name text), etc.) may
   * reference a record by name and wouldn't be updated, so name is treated
   * as read-only to avoid silently breaking those cross-references.
   */
  /** Preserves each ORIGINAL line's own sequence-number/form prefix (cols 1-6) at its position
   *  within the regenerated lines, rather than blanket-applying the first line's prefix to every
   *  line - keeps diffs minimal when an edit doesn't change the line count. Lines beyond the
   *  original range (genuinely new lines the edit introduced) keep their default prefix. */
  function restampSequenceNumbers(newLines, originalRangeLines) {
    return newLines.map(function (line, i) {
      var orig = originalRangeLines[i];
      if (orig == null) return line;
      var origPrefix = padTo(orig.slice(0, 6), 6);
      var rest = padTo(line, LINE_WIDTH).slice(6);
      return (origPrefix + rest).replace(/\s+$/, '');
    });
  }

  function applyRecordUpdate(record, sourceLines, updates) {
    var updated = {
      name: record.name,
      conditions: record.conditions,
      keywords: updates.keywords !== undefined ? updates.keywords : record.keywords,
    };

    var range = getRecordLineRange(record);
    var originalRangeLines = sourceLines.slice(range[0] - 1, range[1]);
    var originalLine1to6 = (originalRangeLines[0] || '').slice(0, 6);

    var newLines = serializeRecordEntry(updated, originalLine1to6);
    newLines = restampSequenceNumbers(newLines, originalRangeLines);
    return sourceLines.slice(0, range[0] - 1).concat(newLines, sourceLines.slice(range[1]));
  }

  /**
   * Renames a record format's own R-line - deliberately a SEPARATE function
   * from applyRecordUpdate rather than an extra field on it, so that
   * function's existing "name is read-only" contract (see its own comment)
   * stays exactly as-is for every other caller. This is scoped specifically
   * for the menu designer, where the record format name has one legitimate
   * reason to change: CRTMNU TYPE(*DSPF) requires it to match the menu
   * member's own name (see compileMenu's pre-flight check in extension.ts).
   * Does NOT rewrite any cross-reference to the OLD name elsewhere in the
   * file (SFLCTL(name), WINDOW(... name ...), MNUBARCHC(id name text), a
   * HELP record's own conditioning, etc.) - same reasoning applyRecordUpdate
   * already gives for treating this as genuinely risky to automate. Callers
   * are expected to scan for likely references to the old name themselves
   * and warn the user before calling this - see the menu webview's
   * findLikelyNameReferences() for the one this ships with.
   */
  function renameRecordFormat(record, sourceLines, newName) {
    var updated = { name: newName, conditions: record.conditions, keywords: record.keywords };

    var range = getRecordLineRange(record);
    var originalRangeLines = sourceLines.slice(range[0] - 1, range[1]);
    var originalLine1to6 = (originalRangeLines[0] || '').slice(0, 6);

    var newLines = serializeRecordEntry(updated, originalLine1to6);
    newLines = restampSequenceNumbers(newLines, originalRangeLines);
    return sourceLines.slice(0, range[0] - 1).concat(newLines, sourceLines.slice(range[1]));
  }

  /**
   * Applies `updates` (a partial field object - any of name/length/dataType/decimalPositions/
   * usage/location{line,column}/keywords) to a copy of `field`, regenerates its source lines,
   * and splices them into `sourceLines` (array of original line strings, 1 per array index
   * with index 0 = line 1). Returns the new array of source lines; does not mutate the input.
   */
  function applyFieldUpdate(field, sourceLines, updates) {
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
    var originalRangeLines = sourceLines.slice(range[0] - 1, range[1]);
    var originalLine1to6 = (originalRangeLines[0] || '').slice(0, 6);

    var newLines = serializeFieldEntry(updated, originalLine1to6);
    newLines = restampSequenceNumbers(newLines, originalRangeLines);

    var result = sourceLines.slice(0, range[0] - 1).concat(newLines, sourceLines.slice(range[1]));
    return result;
  }

  /**
   * Kept for API stability - callers (the webview) use this to decide whether
   * to show a "locked" state. Full multi-group, multi-indicator conditioning
   * (both entity-level and per-keyword) is now round-tripped correctly via
   * buildConditionChunks/serializeConditionedKeywordLines, so everything is
   * editable; nothing needs to be locked out anymore.
   */
  function isEditable() {
    return true;
  }

  /**
   * Inserts a brand-new field (or constant) into a record and splices its
   * serialized lines into `sourceLines`. Placement: right after the last line
   * of the record's last existing field entry, or right after the record's
   * own header lines if it has none yet - i.e. always appended at the bottom
   * of the record's field list, never mid-file. `newField` needs at minimum
   * `nameType` ('FIELD'|'CONSTANT'|'HELP'), `location: {line, column}`, and
   * either `constantValue` (CONSTANT) or `name`/`length`/`dataType` (FIELD);
   * `keywords`/`conditions` default to none. There's no original line to
   * preserve columns 1-6 from (this field didn't exist yet), so it gets a
   * plain 'A' in column 6 like any other freshly-typed DDS line.
   */
  function insertField(record, sourceLines, newField) {
    var existingFields = record.fields || [];
    var insertAfterLine;
    if (existingFields.length > 0) {
      var maxEnd = -Infinity;
      existingFields.forEach(function (f) {
        var r = getFieldLineRange(f);
        if (r[1] > maxEnd) maxEnd = r[1];
      });
      insertAfterLine = maxEnd;
    } else {
      insertAfterLine = getRecordLineRange(record)[1];
    }

    var field = {
      nameType: newField.nameType,
      name: newField.name || null,
      constantValue: newField.constantValue != null ? newField.constantValue : null,
      length: newField.length != null ? newField.length : null,
      lengthRaw: newField.length != null ? String(newField.length) : null,
      dataType: newField.dataType || null,
      decimalPositions: newField.decimalPositions != null ? newField.decimalPositions : null,
      decimalPositionsRaw: newField.decimalPositions != null ? String(newField.decimalPositions) : null,
      usage: newField.usage || null,
      isReference: !!newField.isReference,
      location: { line: newField.location.line, column: newField.location.column, relativeColumnOffset: null },
      keywords: newField.keywords || [],
      conditions: newField.conditions || [],
    };

    var newLines = serializeFieldEntry(field, '     A');
    return sourceLines.slice(0, insertAfterLine).concat(newLines, sourceLines.slice(insertAfterLine));
  }

  return {
    isEditable: isEditable,
    getFieldLineRange: getFieldLineRange,
    serializeFieldEntry: serializeFieldEntry,
    applyFieldUpdate: applyFieldUpdate,
    insertField: insertField,
    getRecordLineRange: getRecordLineRange,
    serializeRecordEntry: serializeRecordEntry,
    applyRecordUpdate: applyRecordUpdate,
    renameRecordFormat: renameRecordFormat,
  };
});
