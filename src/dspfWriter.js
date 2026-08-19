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
   * arbitrarily many indicators, OR a single display-size condition name) into
   * "chunks" of at most 3 indicators each (or exactly 1 chunk for a
   * display-size condition, which DDS never lets span multiple lines or
   * combine with anything else) - one chunk per physical source line's worth
   * of conditioning columns (7-16). The first chunk of a group carries that
   * group's relation ('AND' for the very first group overall, 'OR' for every
   * other group - which is exactly what the parser already normalizes
   * group.relation to); every other chunk within the same group continues it
   * (relation 'AND', i.e. blank/A in col 7).
   */
  function buildConditionChunks(conditions) {
    var chunks = [];
    (conditions || []).forEach(function (group) {
      if (group.displaySizeCondition) {
        chunks.push({ relation: group.relation, indicators: [], displaySizeCondition: group.displaySizeCondition });
        return;
      }
      var inds = group.indicators || [];
      var lineCount = Math.max(1, Math.ceil(inds.length / 3));
      for (var i = 0; i < lineCount; i++) {
        chunks.push({
          relation: i === 0 ? group.relation : 'AND',
          indicators: inds.slice(i * 3, i * 3 + 3),
          displaySizeCondition: null,
        });
      }
    });
    return chunks;
  }

  /** Returns the 10-char string for columns 7-16 (indicator area) for ONE chunk -
   *  either up to 3 indicators, or a display-size condition name (position 9 onward,
   *  N-flag at position 8) - see parseConditionGroup in dspfParser.ts for the read side. */
  function serializeConditionCols(chunk) {
    var chars = new Array(10).fill(' ');
    if (chunk) {
      chars[0] = chunk.relation === 'OR' ? 'O' : ' ';
      if (chunk.displaySizeCondition) {
        if (chunk.displaySizeCondition.not) chars[1] = 'N';
        var name = padTo(chunk.displaySizeCondition.name, 8).slice(0, 8);
        for (var i = 0; i < 8; i++) chars[2 + i] = name[i];
      } else {
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
    (field.entrySourceLines || []).forEach(function (ln) {
      if (ln < min) min = ln;
      if (ln > max) max = ln;
    });
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

  // Each entry locates the record-name TOKEN within a keyword's own
  // `parameters` text for one specific, well-known DDS keyword shape - not
  // a heuristic guess, the same parsing logic dspfEngine.js already uses to
  // resolve these keywords at render time (resolveWindow, findSflPairing,
  // parseMenubarChoice). Returns the token string if this occurrence
  // genuinely references a record name, or null if it doesn't (e.g. WINDOW
  // with inline geometry instead of a record reference).
  var RECORD_REFERENCE_EXTRACTORS = {
    SFLCTL: function (params) {
      var name = params.trim();
      return name || null;
    },
    WINDOW: function (params) {
      var parts = params.trim().split(/\s+/).filter(Boolean);
      if (parts.length === 1 && !/^[+-]?\d+$/.test(parts[0]) && parts[0].toUpperCase() !== '*DFT') {
        return parts[0];
      }
      return null;
    },
    MNUBARCHC: function (params) {
      var m = params.trim().match(/^(\d+)\s+(\S+)\s+'/);
      return m ? m[2] : null;
    },
  };

  // A regex per keyword, scoped to that keyword's own invocation, that
  // captures the record-name token as group 2 - used only to locate and
  // replace that exact token within the physical line(s) a keyword we've
  // ALREADY confirmed (via the extractor above) references `oldName`
  // occupies. Anchored to the keyword name and, for MNUBARCHC, to the
  // digits-then-token-then-quote shape, so it can never touch the quoted
  // display text or another keyword's parameters sharing the same line.
  var RECORD_REFERENCE_LOCATORS = {
    SFLCTL: /(\bSFLCTL\(\s*)(\S+?)(\s*\))/i,
    WINDOW: /(\bWINDOW\(\s*)(\S+)(\s*\))/i,
    MNUBARCHC: /(\bMNUBARCHC\(\s*\d+\s+)(\S+)(\s+')/i,
  };

  /**
   * Rewrites every keyword occurrence elsewhere in the file that
   * structurally references `oldName` as a record-format name -
   * `SFLCTL(name)`, `WINDOW(record-format-name)`, and
   * `MNUBARCHC(id record-name 'text')` - to reference `newName` instead.
   * Unlike renameRecordFormat (which only ever touches the renamed
   * record's own R-line), this scans every OTHER record's and field's
   * keywords (MNUBARCHC is field-level) for an exact structural match in
   * one of those three positions, using the same parsing logic
   * dspfEngine.js already relies on to resolve them - so it can't misfire
   * on a comment or a constant's display text that happens to contain the
   * same characters. Anything NOT one of these three shapes (an unusual
   * keyword, or a reference inside a comment) is outside what this can
   * find - callers still need their own advisory scan
   * (findLikelyNameReferences in webviewClientHelpers.js) as a fallback for
   * those.
   */
  function renameRecordReferences(dspfFile, sourceLines, oldName, newName) {
    var edits = [];
    function scanKeyword(kw) {
      var extractor = RECORD_REFERENCE_EXTRACTORS[kw.name];
      if (!extractor) return;
      var ref = extractor(kw.parameters);
      if (!ref || ref.toUpperCase() !== oldName.toUpperCase()) return;
      edits.push({ name: kw.name, sourceLines: kw.sourceLines });
    }
    dspfFile.records.forEach(function (record) {
      record.keywords.forEach(scanKeyword);
      record.fields.forEach(function (f) { f.keywords.forEach(scanKeyword); });
    });

    var result = sourceLines.slice();
    edits.forEach(function (edit) {
      var locator = RECORD_REFERENCE_LOCATORS[edit.name];
      edit.sourceLines.some(function (lineNo) {
        var idx = lineNo - 1;
        var m = result[idx].match(locator);
        if (!m) return false;
        result[idx] = result[idx].slice(0, m.index + m[1].length) + newName + result[idx].slice(m.index + m[1].length + m[2].length);
        return true;
      });
    });
    return result;
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

  /**
   * Removes one field or constant's physical DDS lines entirely (its
   * positional line and every continuation line - see getFieldLineRange /
   * DdsFieldBase.entrySourceLines), leaving everything else byte-for-byte
   * untouched. Doesn't try to be smart about other keywords/records that
   * might reference this field by name (e.g. a subfile record referencing
   * one of its own fields elsewhere) - same "caller's responsibility"
   * stance renameRecordFormat already documents for cross-references.
   */
  function deleteField(field, sourceLines) {
    var range = getFieldLineRange(field);
    return sourceLines.slice(0, range[0] - 1).concat(sourceLines.slice(range[1]));
  }

  /**
   * Removes several fields/constants in one pass - e.g. a menu option's
   * number-marker AND label constants when they're two separate DDS entries
   * (the split-constant form - see extractMenuOptions in
   * buildMenuWebviewTemplate.js). Line ranges for every field are computed
   * up front, then removed bottom-to-top, so deleting one never shifts the
   * line numbers of another range still waiting to be removed - unlike
   * commitGroupEdit's per-field reparse loop (needed there because an EDIT's
   * resulting line count isn't known ahead of time), a deletion's line
   * range is already fully known before anything is removed, so a single
   * up-front pass is both simpler and enough.
   */
  function deleteFields(fields, sourceLines) {
    var ranges = fields.map(function (f) { return getFieldLineRange(f); });
    ranges.sort(function (a, b) { return b[0] - a[0]; });
    var result = sourceLines.slice();
    ranges.forEach(function (range) {
      result = result.slice(0, range[0] - 1).concat(result.slice(range[1]));
    });
    return result;
  }

  // ---------------------------------------------------------------------
  // DSPSIZ (display size): shared between the DSPF and Menu designers,
  // since both edit plain DDS files that can each declare their own
  // DSPSIZ. DDS supports AT MOST TWO sizes per DSPSIZ keyword; this is
  // specifically the "add a second size to a single-size (or no-DSPSIZ)
  // file" writer action called out in the README's known limitations -
  // toggling BETWEEN sizes a file already declares is DspfEngine's job
  // (screenSizeFromFileKeywords/availableScreenSizes); this is the one
  // writer-side action that changes how many sizes exist.
  // ---------------------------------------------------------------------

  /** Same "lines cols [*qualifier]" triple-parsing as
   *  DspfEngine.screenSizeFromFileKeywords's own parseScreenSizes -
   *  duplicated (not required-in) rather than shared via require(), since
   *  this file is dropped into the webview as a plain <script> with no
   *  bundler (see file header) and can't assume a module loader is
   *  present there. Keep the two in sync if DSPSIZ's grammar ever changes. */
  function parseDisplaySizeTriples(paramText) {
    var tokens = (paramText || '').trim().split(/\s+/).filter(Boolean);
    var sizes = [];
    var i = 0;
    while (i < tokens.length) {
      var t1 = tokens[i];
      var t2 = tokens[i + 1];
      if (/^\d+$/.test(t1) && t2 && /^\d+$/.test(t2)) {
        var name = null;
        var next = tokens[i + 2];
        if (next && next.charAt(0) === '*') {
          name = next;
          i += 3;
        } else {
          i += 2;
        }
        sizes.push({ lines: parseInt(t1, 10), columns: parseInt(t2, 10), name: name });
      } else {
        i++;
      }
    }
    return sizes;
  }

  function serializeDisplaySizes(sizes) {
    return sizes
      .map(function (s) {
        return s.name ? s.lines + ' ' + s.columns + ' ' + s.name : s.lines + ' ' + s.columns;
      })
      .join(' ');
  }

  /** Same shape as getRecordLineRange, but for a single stand-alone
   *  file-level keyword (no record/field container to anchor on - see
   *  dspfParser.ts's fileKeywords). */
  function getFileKeywordLineRange(keyword) {
    var lines = keyword.sourceLines || [];
    var min = lines.length ? lines[0] : 1;
    var max = lines.length ? lines[lines.length - 1] : min;
    (keyword.conditions || []).forEach(function (g) {
      (g.sourceLines || []).forEach(function (ln) {
        if (ln < min) min = ln;
        if (ln > max) max = ln;
      });
    });
    return [min, max];
  }

  /** Serializes ONE unconditioned file-level keyword (DSPSIZ never carries
   *  its own conditioning in practice - it's what OTHER conditions test
   *  against, see DdsDisplaySizeCondition) as its own line(s), positional
   *  columns 1-44 blank apart from the original/default sequence+form
   *  prefix, keyword text starting in the function area (col 45+). Mirrors
   *  serializeRecordEntry's unconditioned-keyword path minus the R-line. */
  function serializeFileKeywordEntry(keyword, originalLine1to6) {
    var text = keyword.parameters ? keyword.name + '(' + keyword.parameters + ')' : keyword.name;
    var posChars = new Array(44).fill(' ');
    var seqForm = padTo(originalLine1to6 != null ? originalLine1to6 : '     A', 6);
    for (var i = 0; i < 6; i++) posChars[i] = seqForm[i];
    var posCols = posChars.join('');
    var funcLines = serializeFunctionAreaLines(text);
    var firstLine = (posCols + funcLines[0].slice(44)).replace(/\s+$/, '');
    return [firstLine].concat(funcLines.slice(1));
  }

  /**
   * Adds a second DSPSIZ size to a file, writing a brand-new DSPSIZ keyword
   * if none exists yet, or replacing the existing one if it currently
   * declares just one. Throws if it already declares two - DDS's DSPSIZ
   * keyword never supports more than that, so there's no third size to add.
   *
   * `newSize` is `{ lines, columns, name }` - `name` is the qualifier
   * (e.g. "*DS4") the new size will be selectable by; defaults to "*DS4"
   * since that's the conventional "large" companion to "*DS3". DDS requires
   * a name on every size once there's more than one (so conditions/toggles
   * can address either one) - if the file's existing single size has no
   * name of its own (a plain `DSPSIZ(24 80)`), it's given the conventional
   * "*DS3" here so both sizes end up addressable. A file with no DSPSIZ at
   * all is treated as an implicit, unqualified 24x80 default (DDS's own
   * fallback - see DEFAULT_LINES/DEFAULT_COLUMNS in dspfEngine.js) before
   * the same "name the first one *DS3" step runs.
   *
   * Only handles the file level - a record-level DSPSIZ override (rare,
   * see screenLinesForRecord's precedence note) is left alone; callers
   * wanting to add a size to one of those can pass a record's own keywords
   * array through the same shape this reads from dspfFile.fileKeywords.
   */
  function addDisplaySize(dspfFile, sourceLines, newSize) {
    if (!newSize || !(newSize.lines > 0) || !(newSize.columns > 0)) {
      throw new Error('addDisplaySize requires newSize.lines and newSize.columns to be positive numbers.');
    }
    var newName = newSize.name || '*DS4';

    var existing = (dspfFile.fileKeywords || []).find(function (k) {
      return k.name === 'DSPSIZ';
    });
    var sizes = existing ? parseDisplaySizeTriples(existing.parameters) : [];
    if (sizes.length === 0) {
      sizes = [{ lines: 24, columns: 80, name: null }];
    }
    if (sizes.length >= 2) {
      throw new Error('DSPSIZ already declares two sizes - DDS does not support a third.');
    }
    if (!sizes[0].name) {
      sizes[0] = { lines: sizes[0].lines, columns: sizes[0].columns, name: '*DS3' };
    }
    var allSizes = sizes.concat([{ lines: newSize.lines, columns: newSize.columns, name: newName }]);
    var newKeyword = { name: 'DSPSIZ', parameters: serializeDisplaySizes(allSizes) };

    if (existing) {
      var range = getFileKeywordLineRange(existing);
      var originalRangeLines = sourceLines.slice(range[0] - 1, range[1]);
      var originalLine1to6 = (originalRangeLines[0] || '').slice(0, 6);
      var newLines = serializeFileKeywordEntry(newKeyword, originalLine1to6);
      newLines = restampSequenceNumbers(newLines, originalRangeLines);
      return sourceLines.slice(0, range[0] - 1).concat(newLines, sourceLines.slice(range[1]));
    }

    // No DSPSIZ keyword exists yet - insert a brand-new one. File-level
    // keywords always precede every record (see dspfParser.ts), so anchor
    // after the last existing one if there is one, else right before the
    // first record, else at the very top for a record-less file.
    var insertAfterLine = 0;
    (dspfFile.fileKeywords || []).forEach(function (k) {
      var r = getFileKeywordLineRange(k);
      if (r[1] > insertAfterLine) insertAfterLine = r[1];
    });
    if (insertAfterLine === 0 && dspfFile.records && dspfFile.records.length > 0) {
      insertAfterLine = getRecordLineRange(dspfFile.records[0])[0] - 1;
    }
    var brandNewLines = serializeFileKeywordEntry(newKeyword, '     A');
    return sourceLines.slice(0, insertAfterLine).concat(brandNewLines, sourceLines.slice(insertAfterLine));
  }

  /**
   * Picks a field name that isn't already used by any field in `record`,
   * starting from `baseName` with a numeric suffix (baseNAME2, baseNAME3,
   * ...) - truncating baseName as needed to stay within DDS's 10-char field
   * name limit. Scoped to `record.fields` only, same "caller's/UI's
   * responsibility" stance as elsewhere in this file (e.g. deleteField's
   * doc comment) - doesn't scan other record formats in the file for a
   * same-named field, since DDS doesn't actually forbid that (field names
   * are scoped per record format, not file-wide) and I-SDA has no
   * cross-record model reference to check against here anyway.
   */
  function nextAvailableFieldName(record, baseName) {
    var MAX_LEN = 10;
    var used = {};
    (record.fields || []).forEach(function (f) {
      if (f.name) used[f.name.toUpperCase()] = true;
    });
    var n = 2;
    while (true) {
      var suffix = String(n);
      var truncated = String(baseName || 'FLD').slice(0, Math.max(1, MAX_LEN - suffix.length));
      var candidate = (truncated + suffix).toUpperCase();
      if (!used[candidate]) return candidate;
      n++;
    }
  }

  /**
   * Duplicates a field or constant into the same record: a new DDS entry
   * with the same length/type/decimals/usage/keywords/conditions, appended
   * at the bottom of the record's field list via insertField (same
   * placement rule - drag it afterward to where it actually belongs on
   * screen). A CONSTANT is copied as-is (constants have no name, so no
   * collision is possible). A named FIELD needs a distinct name - DDS
   * doesn't allow two same-named fields in one record format - so unless
   * the caller passes `options.name` explicitly, one is generated via
   * nextAvailableFieldName; the copy can always be renamed afterward from
   * the Properties panel like any other field.
   *
   * `options.location` overrides where the copy lands (defaults to one row
   * below the original, same column - purely a starting point the user
   * repositions by dragging; no collision/bounds checking is done here,
   * same as insertField itself).
   */
  function copyField(record, sourceLines, field, options) {
    options = options || {};
    var isNamedField = field.nameType === 'FIELD' && !!field.name;
    var name = isNamedField ? (options.name || nextAvailableFieldName(record, field.name)) : '';
    var location = options.location || {
      line: field.location.line != null ? field.location.line + 1 : null,
      column: field.location.column,
    };
    var newField = {
      nameType: field.nameType,
      name: name,
      constantValue: field.constantValue,
      length: field.length,
      dataType: field.dataType,
      decimalPositions: field.decimalPositions,
      usage: field.usage,
      isReference: field.isReference,
      location: location,
      keywords: (field.keywords || []).map(function (k) {
        return { name: k.name, parameters: k.parameters, conditions: k.conditions || [], raw: '', sourceLines: [] };
      }),
      conditions: field.conditions || [],
    };
    return insertField(record, sourceLines, newField);
  }

  return {
    isEditable: isEditable,
    getFieldLineRange: getFieldLineRange,
    serializeFieldEntry: serializeFieldEntry,
    applyFieldUpdate: applyFieldUpdate,
    insertField: insertField,
    copyField: copyField,
    nextAvailableFieldName: nextAvailableFieldName,
    deleteField: deleteField,
    deleteFields: deleteFields,
    getRecordLineRange: getRecordLineRange,
    serializeRecordEntry: serializeRecordEntry,
    applyRecordUpdate: applyRecordUpdate,
    renameRecordFormat: renameRecordFormat,
    renameRecordReferences: renameRecordReferences,
    getFileKeywordLineRange: getFileKeywordLineRange,
    addDisplaySize: addDisplaySize,
  };
});
