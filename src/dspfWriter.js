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

      chars[37] = field.usage || 'O'; // col38 - written explicitly, including 'O' (DDS also accepts blank here as a synonym for Output, and DspfParser.parseUsage's own `|| 'O'` fallback still reads a blank column back as 'O' for any file this tool didn't write itself - but iSDA's own output always spells it out)
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
   *  keyword list, space-separated. Callers pass only the keyword(s) that belong on THIS line - normally
   *  just the field's first unconditioned keyword (see serializeFieldEntry), everything else gets its own
   *  dedicated line via serializeConditionedKeywordLines instead, one keyword per physical DDS line so each
   *  keyword has its own room for conditioning indicators (cols 7-16), matching real SDA's own output.
   *  The constant-literal/DFT check looks at field.keywords (the field's FULL keyword list) rather than the
   *  passed-in subset, since that decision has to be correct regardless of which keyword(s) happen to be on
   *  this particular line. */
  function buildFunctionAreaText(field, keywords) {
    var parts = [];
    if (field.nameType === 'CONSTANT' && field.constantValue != null) {
      var hasDft = (field.keywords || []).some(function (k) {
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

  /** Splits keywords into one group PER KEYWORD, in order - never merging two different keyword
   *  entries onto a shared physical line, even when their conditions happen to match. Each keyword
   *  gets its own dedicated line(s), with room for its own conditioning indicators (cols 7-16),
   *  matching real SDA's own picker-generated output: adding a keyword always starts a new line
   *  rather than appending onto/continuing an existing one. (Previously merged adjacent keywords
   *  that shared identical conditions into one shared continuation block - that broke the ability
   *  to independently condition a keyword after the fact, since DDS indicator columns apply to a
   *  whole physical line/continuation group, not to one keyword within a shared line.) */
  function groupKeywordsByCondition(keywords) {
    return (keywords || []).map(function (k) {
      return { conditions: k.conditions || [], keywords: [k] };
    });
  }

  /** Returns `keywords` with `keywordToOmit` removed (by identity, not value - two keywords with
   *  the same name/parameters are still distinct entries), preserving the relative order of every
   *  other keyword exactly as it appeared. Used by serializeRecordEntry/serializeFileKeywordsEntry
   *  to lift out the single keyword riding the record/file's first line without disturbing the
   *  document order of everything else (see L85: the old approach bucketed the remainder into
   *  "all unconditioned" then "all conditioned" and concatenated those two buckets, which silently
   *  reordered any untouched keyword that happened to sit on the other side of that boundary from
   *  where it started). No-op (returns a copy of `keywords`) when `keywordToOmit` is falsy or not
   *  found in `keywords`. */
  function keywordsExcept(keywords, keywordToOmit) {
    var all = keywords || [];
    if (!keywordToOmit) return all.slice();
    var idx = all.indexOf(keywordToOmit);
    if (idx === -1) return all.slice();
    return all.slice(0, idx).concat(all.slice(idx + 1));
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
  /** Wraps function-area text into 80-col lines with '-' line-continuation (no
   *  blank inserted at the split point - see dspfParser.ts's pendingJoiner doc
   *  comment for the real DDS convention this matches: '-' = direct
   *  concatenation, '+' = insert one blank). This function's own wrapping is
   *  purely mechanical - splitting one already-complete string, which already
   *  contains any semantically-real spaces as literal characters in `text` -
   *  so it must never ADD a character at the split point; '-' is the
   *  continuation character that guarantees that. Cols 1-44 blank (except 'A'
   *  in col 6). */
  function serializeFunctionAreaLines(text) {
    var lines = [];
    var remaining = text;
    while (remaining.length > FUNCTION_AREA_WIDTH) {
      var isLast = false;
      var chunkWidth = FUNCTION_AREA_WIDTH - 1; // reserve 1 col for '-'
      var chunk = remaining.slice(0, chunkWidth);
      remaining = remaining.slice(chunkWidth);
      lines.push({ text: chunk, continuation: '-' });
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
   *  lines (if field.conditions spans multiple groups/lines), a content line built from the
   *  constant literal (if any) plus at most its FIRST unconditioned keyword, then every remaining
   *  keyword (further unconditioned ones, plus every conditioned one) as its own dedicated line -
   *  one keyword per physical DDS line, each with room for its own conditioning indicators,
   *  matching real SDA's own output rather than packing multiple keywords onto a shared line.
   *
   *  Bug fix: a bare CONSTANT (no name/type/length occupying the position columns - just the
   *  quoted literal itself) never lets ANY keyword ride its own content line, not even the
   *  first - real SDA always gives a constant's keyword(s) their own dedicated line(s), e.g. a
   *  menu option label like 'Back' with COLOR(BLU) applied renders as two physical lines
   *  ("15  6'Back'" then a separate "COLOR(BLU)" line below it), never combined onto one. A
   *  NAMED field is unaffected - it keeps the existing, deliberate "first unconditioned keyword
   *  rides the field's own declaration line" convention (see keywordLineLayout.test.js), which
   *  matches real SDA's own output for named fields (e.g. "FLDA 20I 2O 2 2DSPATR(HI)").
   *  Reported directly with a screenshot showing a keyword newly added through the picker
   *  collapsing onto the constant's own line instead of getting a new one. */
  function serializeFieldEntry(field, originalLine1to6) {
    var allKeywords = field.keywords || [];
    var isBareConstant = field.nameType === 'CONSTANT' && field.constantValue != null;
    var unconditioned = allKeywords.filter(function (k) { return !k.conditions || k.conditions.length === 0; });
    var firstUnconditioned = isBareConstant ? [] : unconditioned.slice(0, 1);
    // L86: was `unconditioned.slice(1).concat(conditioned)` (bare-constant branch: `unconditioned.concat(conditioned)`) -
    // the same bucket-and-concat pattern L85 fixed in serializeRecordEntry/serializeFileKeywordsEntry, which silently
    // reordered any OTHER untouched keyword that crossed the unconditioned/conditioned boundary. keywordsExcept lifts out
    // just the one keyword (if any) riding the field's own content line, preserving every other keyword's relative order
    // exactly as it appeared - including the bare-constant branch, where firstUnconditioned[0] is undefined and
    // keywordsExcept's no-op path already returns the full original-order keyword list unchanged.
    var restKeywords = keywordsExcept(allKeywords, firstUnconditioned[0]);

    var fieldPrefixLines = serializeConditionPrefixLines(field.conditions, originalLine1to6);
    var posCols = serializePositionalCols(field, originalLine1to6);
    var functionText = buildFunctionAreaText(field, firstUnconditioned);

    var contentLines;
    if (functionText.length === 0) {
      contentLines = [padTo(posCols, LINE_WIDTH).replace(/\s+$/, '') || posCols.slice(0, 6)];
    } else {
      var funcLines = serializeFunctionAreaLines(functionText);
      var firstLine = (posCols + funcLines[0].slice(44)).replace(/\s+$/, '');
      contentLines = [firstLine].concat(funcLines.slice(1));
    }

    var keywordLines = [];
    groupKeywordsByCondition(restKeywords).forEach(function (g) {
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

  /** Same per-keyword-conditioning treatment as serializeFieldEntry, applied to a record's own
   *  keywords: at most its first unconditioned keyword rides the R-line itself, everything else
   *  (further unconditioned keywords, plus every conditioned one) gets its own dedicated line, in
   *  the same relative order they already had (see L85 / keywordsExcept doc comment - the
   *  remainder is no longer re-bucketed into "all unconditioned then all conditioned"). */
  function serializeRecordEntry(record, originalLine1to6) {
    var allKeywords = record.keywords || [];
    var unconditioned = allKeywords.filter(function (k) { return !k.conditions || k.conditions.length === 0; });
    var firstUnconditioned = unconditioned.slice(0, 1);
    var restKeywords = keywordsExcept(allKeywords, firstUnconditioned[0]);

    var recordPrefixLines = serializeConditionPrefixLines(record.conditions, originalLine1to6);
    var posCols = serializeRecordPositionalCols(record, originalLine1to6);
    var functionText = buildRecordFunctionAreaText(firstUnconditioned);

    var contentLines;
    if (functionText.length === 0) {
      contentLines = [posCols.replace(/\s+$/, '') || posCols.slice(0, 6)];
    } else {
      var funcLines = serializeFunctionAreaLines(functionText);
      var firstLine = (posCols + funcLines[0].slice(44)).replace(/\s+$/, '');
      contentLines = [firstLine].concat(funcLines.slice(1));
    }

    var keywordLines = [];
    groupKeywordsByCondition(restKeywords).forEach(function (g) {
      keywordLines = keywordLines.concat(serializeConditionedKeywordLines(g.conditions, g.keywords, originalLine1to6));
    });

    return recordPrefixLines.concat(contentLines, keywordLines);
  }

  // ---------------------------------------------------------------------
  // FILE-level keywords: unlike a record or field, the file has no entry
  // line of its own (no A-marker row, no name) - it's purely zero or more
  // keyword-only lines that appear before the first record format. Reuses
  // the same generic keyword-line serialization (serializeFunctionAreaLines,
  // groupKeywordsByCondition, serializeConditionedKeywordLines) records
  // already use for their own unconditioned/conditioned keyword lines - a
  // file keyword's OWN conditions (k.conditions) behave identically, there's
  // just no record-level conditions/positional line wrapping it.
  // ---------------------------------------------------------------------

  /** Returns [firstLine, lastLine] spanned by every fileKeywords entry, or null if the file
   *  declares no file-level keywords at all (nothing to locate/replace - see applyFileKeywordsUpdate). */
  function getFileKeywordsLineRange(dspfFile) {
    var min = null;
    var max = null;
    (dspfFile.fileKeywords || []).forEach(function (k) {
      (k.sourceLines || []).forEach(function (ln) {
        if (min == null || ln < min) min = ln;
        if (max == null || ln > max) max = ln;
      });
      (k.conditions || []).forEach(function (g) {
        (g.sourceLines || []).forEach(function (ln) {
          if (min == null || ln < min) min = ln;
          if (max == null || ln > max) max = ln;
        });
      });
    });
    return min == null ? null : [min, max];
  }

  /** Same one-keyword-per-line treatment as serializeFieldEntry/serializeRecordEntry: at most the
   *  first unconditioned file keyword rides the very first line, everything else gets its own, in
   *  the same relative order they already had (see L85 / keywordsExcept doc comment). */
  function serializeFileKeywordsEntry(fileKeywords, originalLine1to6) {
    var allKeywords = fileKeywords || [];
    var unconditioned = allKeywords.filter(function (k) { return !k.conditions || k.conditions.length === 0; });
    var firstUnconditioned = unconditioned.slice(0, 1);
    var restKeywords = keywordsExcept(allKeywords, firstUnconditioned[0]);

    var seqForm = padTo(originalLine1to6 != null ? originalLine1to6 : 'A', 6);
    var posChars = new Array(44).fill(' ');
    for (var i = 0; i < 6; i++) posChars[i] = seqForm[i];
    var posCols = posChars.join('');

    var functionText = buildRecordFunctionAreaText(firstUnconditioned); // generic keyword-list join, despite the name
    var contentLines = [];
    if (functionText.length > 0) {
      var funcLines = serializeFunctionAreaLines(functionText);
      var firstLine = (posCols + funcLines[0].slice(44)).replace(/\s+$/, '');
      contentLines = [firstLine].concat(funcLines.slice(1));
    }

    var keywordLines = [];
    groupKeywordsByCondition(restKeywords).forEach(function (g) {
      keywordLines = keywordLines.concat(serializeConditionedKeywordLines(g.conditions, g.keywords, originalLine1to6));
    });

    return contentLines.concat(keywordLines);
  }

  /** Rewrites the file's own keyword block to `newKeywords` (a full replacement, same
   *  convention as applyRecordUpdate's `{keywords}`). If the file currently has NO
   *  file-level keywords, the new block is inserted at the very top of the source
   *  instead of trying to locate a range that doesn't exist. */
  function applyFileKeywordsUpdate(dspfFile, sourceLines, newKeywords) {
    var range = getFileKeywordsLineRange(dspfFile);
    if (range) {
      var originalRangeLines = sourceLines.slice(range[0] - 1, range[1]);
      var originalLine1to6 = (originalRangeLines[0] || '').slice(0, 6);
      var newLines = serializeFileKeywordsEntry(newKeywords, originalLine1to6);
      newLines = restampSequenceNumbers(newLines, originalRangeLines);
      return sourceLines.slice(0, range[0] - 1).concat(newLines, sourceLines.slice(range[1]));
    }
    var freshLines = serializeFileKeywordsEntry(newKeywords, '     A');
    return freshLines.concat(sourceLines);
  }

  // ---------------------------------------------------------------------
  // Command keys (CAxx/CFxx): the key number (01-24) is encoded in the
  // keyword NAME itself (CA01..CA24, CF01..CF24), not as a parameter -
  // DDS lets a program-visible response indicator and a text label ride
  // along as the keyword's parameters: CA03(03 'F3=Exit') or bare CA03
  // (key active, no response indicator set, no on-screen text).
  //
  // Real DDS/SDA scoping rules for a key NUMBER (see resolveFunctionKeyLegend
  // in dspfEngine.js, which already renders the preview this way):
  //   - Within ONE scope's own keyword list (the file's, or a single record's),
  //     a number can only be defined once - can't be both CA03 and CF03 on the
  //     same record, or twice at the file level. That's the only real conflict.
  //   - A record MAY redefine a number that's already used at the file level.
  //     This is not a duplicate/conflict - it's a legitimate per-record
  //     OVERRIDE: that record uses its own definition, every other record
  //     that doesn't override it keeps using the file-level one.
  //   - Different record formats are independent scopes and may each use the
  //     same key number for entirely unrelated purposes; only one record
  //     format is normally active at a time, so there's no clash between them.
  // availableCommandKeyNumbers therefore only excludes numbers already used
  // WITHIN the single scope (file or one record) being edited - never numbers
  // used by the file when editing a record (that's the override case), and
  // never numbers used by some OTHER record.
  // ---------------------------------------------------------------------

  var COMMAND_KEY_RE = /^(CA|CF)(\d{2})$/;

  function padKeyNumber(n) {
    var s = String(parseInt(n, 10));
    return s.length >= 2 ? s.slice(-2) : '0' + s;
  }

  /** Extracts every CAxx/CFxx keyword from a keyword list into a flat, easy-to-render shape. */
  function parseCommandKeys(keywords) {
    var result = [];
    (keywords || []).forEach(function (k) {
      var m = COMMAND_KEY_RE.exec(k.name);
      if (!m) return;
      var params = (k.parameters || '').trim();
      var indicator = null;
      var text = null;
      if (params) {
        var pm = /^(\d{1,2})(?:\s+'((?:[^']|'')*)')?/.exec(params);
        if (pm) {
          indicator = padKeyNumber(pm[1]);
          if (pm[2] != null) text = pm[2].replace(/''/g, "'");
        }
      }
      result.push({ type: m[1], number: m[2], indicator: indicator, text: text, conditions: k.conditions || [], keyword: k });
    });
    return result;
  }

  /** @returns {{[number:string]: 'file'|'record'}} which scope has already claimed each key
   *  number - informational only (e.g. so the UI can flag a record-level key as "overrides
   *  the file-level Fnn"); this does NOT mean both scopes can't independently use the same
   *  number - see the comment above. Record entries win when both scopes define a number,
   *  matching resolveFunctionKeyLegend's own record-takes-precedence resolution. */
  function commandKeyNumbersInUse(fileKeywords, recordKeywords) {
    var used = {};
    parseCommandKeys(fileKeywords).forEach(function (k) { used[k.number] = 'file'; });
    parseCommandKeys(recordKeywords).forEach(function (k) { used[k.number] = 'record'; });
    return used;
  }

  /** Key numbers ("01".."24") not already claimed WITHIN the given scope's own keyword
   *  list - what that scope's new-key picker OFFERED before Task L31. Pass the file's
   *  keywords when adding a file-level key, or a single record's own keywords when adding
   *  a record-level key. Deliberately does NOT cross-check the other scope: a record is
   *  allowed to (re)define a number already used at the file level (a per-record override,
   *  not a conflict), and different records are independent scopes that may reuse the same
   *  number for unrelated purposes - see the comment above parseCommandKeys.
   *
   *  Task L31 superseded this as the "+ Add command key" picker's own number list: real
   *  SDA allows multiple independently-conditioned instances of the SAME number (see
   *  setCommandKeyAt's own doc comment), so excluding an already-used number here would
   *  block exactly the case L31 exists to support. commandKeysSectionHtml now uses
   *  allCommandKeyNumbers() (always "01".."24") instead. This function is kept, unchanged,
   *  for any other caller still relying on the older single-instance-per-number
   *  exclusion. */
  function availableCommandKeyNumbers(scopeKeywords) {
    var used = {};
    parseCommandKeys(scopeKeywords).forEach(function (k) { used[k.number] = true; });
    var available = [];
    for (var n = 1; n <= 24; n++) {
      var num = padKeyNumber(n);
      if (!used[num]) available.push(num);
    }
    return available;
  }

  /** Returns a NEW keywords array with key `number` set to CAnn/CFnn(indicator 'text').
   *  Any existing CA/CF keyword for that same number is removed first, so switching a
   *  key's type (CA<->CF) or overwriting its indicator/text never leaves a duplicate.
   *  `conditions` (optional, defaults to unconditioned `[]`) - reported as "cmd keys can
   *  also have conditionings": real DDS lets ANY keyword, CAnn/CFnn included, carry the
   *  standard indicator-conditioning (position 7-16 AND/OR indicator group) that turns
   *  the keyword itself on/off at runtime - a SEPARATE mechanism from the embedded
   *  response indicator (the `indicator` param above, which the SYSTEM sets ON when
   *  that key is pressed; conditioning instead reads existing indicator state to decide
   *  whether the key definition applies at all). Before this, every command key was
   *  silently written unconditioned regardless of what was already there. This still
   *  keeps the existing one-definition-per-number-per-scope model (see the file header
   *  comment above parseCommandKeys) - conditioning one key's SINGLE definition on/off,
   *  not multiple independently-conditioned instances of the same number. Task L31 added
   *  that (real SDA's own Design Image screen does support it too, e.g. F3 reading "Exit"
   *  vs "Cancel" under different indicators) as setCommandKeyAt/removeCommandKeyAt below,
   *  a separate index-based pair rather than a breaking change to this function's own
   *  by-number signature - every existing caller here (including every test) keeps its
   *  original single-instance-per-number behavior unchanged. */
  function setCommandKey(keywords, type, number, indicator, text, conditions) {
    var paddedNumber = padKeyNumber(number);
    var filtered = (keywords || []).filter(function (k) {
      var m = COMMAND_KEY_RE.exec(k.name);
      return !(m && m[2] === paddedNumber);
    });
    var params = '';
    if (indicator != null && String(indicator).trim() !== '') {
      params = padKeyNumber(indicator) + (text ? " '" + String(text).replace(/'/g, "''") + "'" : '');
    }
    filtered.push({ name: type.toUpperCase() + paddedNumber, parameters: params, conditions: conditions || [], raw: '', sourceLines: [] });
    return filtered;
  }

  /** Returns a NEW keywords array with the CA/CF keyword for `number` removed (whichever type it is). */
  function removeCommandKey(keywords, number) {
    var paddedNumber = padKeyNumber(number);
    return (keywords || []).filter(function (k) {
      var m = COMMAND_KEY_RE.exec(k.name);
      return !(m && m[2] === paddedNumber);
    });
  }

  /** All 24 possible key numbers ("01".."24"), unconditionally - the
   *  multi-instance counterpart to availableCommandKeyNumbers now that a
   *  number can have more than one instance (Task L31, see that
   *  function's own doc comment for the full story). Exists as its own
   *  named function, rather than callers hardcoding a `for` loop, purely
   *  so "every number is always offered now" reads as a deliberate
   *  choice at the call site instead of a mystery range. */
  function allCommandKeyNumbers() {
    var all = [];
    for (var n = 1; n <= 24; n++) all.push(padKeyNumber(n));
    return all;
  }

  /** Returns a NEW keywords array with the Nth (0-based, in the SAME
   *  source-order this function's own instance ever appears in
   *  parseCommandKeys' result) CAxx/CFxx instance replaced in place -
   *  changing its type/number/indicator/text/conditions without touching
   *  any OTHER command-key instance, INCLUDING another instance that
   *  happens to share the same key number.
   *
   *  Task L31: real SDA's own Design Image screen allows multiple
   *  independently-conditioned instances of the same key number - e.g.
   *  F3 reading "Exit" under one indicator and "Cancel" under another,
   *  each its own separate CA03 line. The older setCommandKey (still kept
   *  above, unchanged, for every existing single-instance-per-number
   *  caller) can't express this: it always removes EVERY existing
   *  instance of a number before writing the one it was given, so editing
   *  either "Exit" or "Cancel" through it would silently delete the
   *  other. setCommandKeyAt instead targets one SPECIFIC instance by its
   *  ordinal position, leaving every other instance - same number or not
   *  - completely untouched.
   *
   *  Pass `index === parseCommandKeys(keywords).length` (one past the
   *  end, e.g. the current count) to APPEND a brand new instance instead
   *  of editing an existing one - this is what "+ Add command key" now
   *  uses, deliberately without first checking whether that number is
   *  already used (see allCommandKeyNumbers above) - adding a second
   *  instance of an already-used number is exactly the point of this
   *  function existing. */
  function setCommandKeyAt(keywords, index, type, number, indicator, text, conditions) {
    var all = keywords || [];
    var cmdIndices = [];
    all.forEach(function (k, i) { if (COMMAND_KEY_RE.test(k.name)) cmdIndices.push(i); });
    var paddedNumber = padKeyNumber(number);
    var params = '';
    if (indicator != null && String(indicator).trim() !== '') {
      params = padKeyNumber(indicator) + (text ? " '" + String(text).replace(/'/g, "''") + "'" : '');
    }
    var entry = { name: type.toUpperCase() + paddedNumber, parameters: params, conditions: conditions || [], raw: '', sourceLines: [] };
    var next = all.slice();
    if (index != null && index >= 0 && index < cmdIndices.length) {
      next[cmdIndices[index]] = entry;
    } else {
      next.push(entry);
    }
    return next;
  }

  /** Returns a NEW keywords array with the Nth (0-based, same ordinal
   *  numbering as setCommandKeyAt/parseCommandKeys) CAxx/CFxx instance
   *  removed - Task L31's per-instance counterpart to removeCommandKey
   *  (which removes EVERY instance sharing a number - still correct for
   *  the single-instance-per-number callers that still use it, but wrong
   *  here since it would delete a sibling instance too, e.g. removing the
   *  "Cancel" CA03 would also take "Exit"'s CA03 with it). An
   *  out-of-range `index` is a no-op (returns a shallow copy, same
   *  "nothing to remove" convention every other bounds-checked setter in
   *  this file follows rather than throwing). */
  function removeCommandKeyAt(keywords, index) {
    var all = keywords || [];
    var cmdIndices = [];
    all.forEach(function (k, i) { if (COMMAND_KEY_RE.test(k.name)) cmdIndices.push(i); });
    if (index == null || index < 0 || index >= cmdIndices.length) return all.slice();
    var removeAt = cmdIndices[index];
    return all.filter(function (k, i) { return i !== removeAt; });
  }

  // -----------------------------------------------------------------------
  // Dedicated colors/attributes editor (COLOR/DSPATR), and dedicated
  // validity-check / edit-keyword / error-message helpers (RANGE/COMP/
  // VALUES, EDTCDE/EDTWRD, ERRMSG) - previously these were only reachable
  // via the generic "add any keyword by name/params" box. Each pair below
  // follows the same read/write shape as parseCommandKeys/setCommandKey:
  // a getter that pulls the current state out of a keyword list for a panel
  // to pre-fill itself with, and a setter that returns a NEW keyword list
  // with the relevant keyword(s) replaced. Callers still have the generic
  // keyword editor available underneath for anything these don't cover
  // (conditioning either one, exotic COLOR/DSPATR combinations, etc.).
  // -----------------------------------------------------------------------

  /** Reads the current COLOR/DSPATR state off a field/record/constant's keyword
   *  list - { color: string ('' if none), attrs: string[] (DSPATR values, e.g.
   *  ['HI','UL']) } - for the colors/attributes editor to pre-fill its controls. */
  function getColorAttr(keywords) {
    var colorK = (keywords || []).find(function (k) { return k.name === 'COLOR'; });
    var attrK = (keywords || []).find(function (k) { return k.name === 'DSPATR'; });
    return {
      color: colorK ? (colorK.parameters || '').trim().toUpperCase() : '',
      attrs: attrK
        ? (attrK.parameters || '').trim().split(/\s+/).filter(Boolean).map(function (s) { return s.toUpperCase(); })
        : [],
    };
  }

  /** Returns a NEW keywords array with COLOR/DSPATR replaced: `color` (a single
   *  color name, e.g. "BLU", or '' to remove COLOR entirely) and `attrs` (array
   *  of DSPATR attribute names, joined into ONE DSPATR keyword the way real DDS
   *  allows multiple attributes per keyword - e.g. DSPATR(HI UL) - or omitted
   *  entirely if `attrs` is empty). Both keywords are written unconditioned;
   *  conditioning either one still goes through the generic keyword editor's
   *  own Conditioning toggle. */
  function setColorAttr(keywords, color, attrs) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'COLOR' && k.name !== 'DSPATR'; });
    if (color) next = next.concat([{ name: 'COLOR', parameters: color, conditions: [], raw: '', sourceLines: [] }]);
    if (attrs && attrs.length > 0) next = next.concat([{ name: 'DSPATR', parameters: attrs.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  // -----------------------------------------------------------------------
  // Task L1a - multi-instance Color & attributes, built on Task L1's
  // getRepeatableKeywordInstances/setRepeatableKeywordInstances. Real DDS
  // lets a field/record/constant carry MULTIPLE independently-conditioned
  // COLOR/DSPATR pairs - e.g. COLOR(RED) DSPATR(HI) under indicator 10,
  // COLOR(GRN) under indicator 20 - getColorAttr/setColorAttr just above
  // only manage ONE always-unconditioned pair (conditioning either keyword
  // still has to go through the generic keyword editor's own Conditioning
  // toggle, which conditions the pair as a whole rather than letting each
  // color choice carry its own indicator).
  //
  // A "state" here is { conditions, color, attrs } - one color plus one set
  // of DSPATR attributes sharing the SAME conditions, the natural pairing
  // real SDA's Color & attributes screen presents as a single row/entry.
  // COLOR and DSPATR are read/written as ONE combined repeatable group via
  // getRepeatableKeywordInstances(['COLOR','DSPATR'])/
  // setRepeatableKeywordInstances(['COLOR','DSPATR']) - grouping same-
  // condition COLOR+DSPATR instances into one state (and splitting a state
  // back into up to one COLOR keyword and up to one DSPATR keyword) is
  // exactly the picker-level "pairing" concern L1's own doc comment called
  // out as deferred to this task.
  // -----------------------------------------------------------------------

  /** Two conditions arrays are "the same state" if they'd produce
   *  byte-identical DDS conditioning - a plain structural comparison, since
   *  `conditions` is already plain JSON-safe data (no functions/dates) built
   *  the same way everywhere it's constructed. Good enough to group
   *  same-source-order COLOR/DSPATR instances within ONE document; not
   *  intended as a general-purpose deep-equal. */
  function conditionsSignature(conditions) {
    return JSON.stringify(conditions || []);
  }

  /** Reads every COLOR/DSPATR instance off `keywords` and groups them into
   *  states - `{ conditions, color, attrs }[]`, in the order each distinct
   *  condition first appears in the source. Instances are grouped by
   *  matching `conditions` (conditionsSignature), and WITHIN one shared
   *  condition, COLOR and DSPATR instances are paired up POSITIONALLY in
   *  source order (1st COLOR with 1st DSPATR, 2nd with 2nd, ...) rather
   *  than collapsed into a single state - two COLOR keywords that happen
   *  to carry the exact same conditions (most commonly: both
   *  unconditioned) are legal, if unusual, DDS and stay as two SEPARATE
   *  states here. Collapsing them into one would silently discard
   *  whichever COLOR lost the collision - exactly the failure mode this
   *  positional pairing avoids. `color` is '' and/or `attrs` is [] for a
   *  slot that only has the other keyword (e.g. a DSPATR(HI) with no
   *  matching COLOR under that condition). */
  function getColorAttrStates(keywords) {
    var instances = getRepeatableKeywordInstances(keywords, ['COLOR', 'DSPATR']);
    var order = [];
    var buckets = {};
    instances.forEach(function (inst) {
      var sig = conditionsSignature(inst.conditions);
      if (!buckets[sig]) { buckets[sig] = { conditions: inst.conditions, colors: [], attrsList: [] }; order.push(sig); }
      if (inst.name === 'COLOR') {
        buckets[sig].colors.push((inst.parameters || '').trim().toUpperCase());
      } else if (inst.name === 'DSPATR') {
        buckets[sig].attrsList.push((inst.parameters || '').trim().split(/\s+/).filter(Boolean).map(function (s) { return s.toUpperCase(); }));
      }
    });
    var states = [];
    order.forEach(function (sig) {
      var bucket = buckets[sig];
      var slots = Math.max(bucket.colors.length, bucket.attrsList.length);
      for (var i = 0; i < slots; i++) {
        states.push({
          conditions: bucket.conditions,
          color: bucket.colors[i] || '',
          attrs: bucket.attrsList[i] || [],
        });
      }
    });
    return states;
  }

  /** Returns a NEW keywords array with every existing COLOR/DSPATR instance
   *  replaced by the given `states` (`{ conditions, color, attrs }[]`) - for
   *  each state, writes a COLOR keyword when `color` is non-empty and a
   *  DSPATR keyword (attributes joined into ONE keyword, e.g. DSPATR(HI
   *  UL), the way real DDS allows multiple attributes per keyword) when
   *  `attrs` is non-empty, both conditioned on that state's OWN
   *  `conditions` - so two states can carry the same color/attrs under
   *  different indicators, or different colors that never overlap. A state
   *  with neither `color` nor `attrs` set writes nothing for that state
   *  (the picker's own "+ Add" default starts empty, and an emptied-out
   *  state should just disappear rather than leave a bare, meaningless
   *  entry in the source). */
  function setColorAttrStates(keywords, states) {
    var flat = [];
    (states || []).forEach(function (state) {
      var conditions = (state && state.conditions) || [];
      if (state && state.color) flat.push({ name: 'COLOR', parameters: state.color, conditions: conditions });
      if (state && state.attrs && state.attrs.length > 0) flat.push({ name: 'DSPATR', parameters: state.attrs.join(' '), conditions: conditions });
    });
    return setRepeatableKeywordInstances(keywords, ['COLOR', 'DSPATR'], flat);
  }

  /** Two conditions arrays match for diffing purposes the same way
   *  conditionsSignature already groups them for getColorAttrStates -
   *  exported as its own tiny helper here since diffColorAttrStates/
   *  applyColorAttrStatesDiff (below) both need the identical comparison,
   *  and re-deriving it via JSON.stringify inline in two places (three,
   *  counting the multi-select caller) would drift the moment one of them
   *  got tweaked. */
  function colorAttrConditionsMatch(a, b) {
    return conditionsSignature(a) === conditionsSignature(b);
  }

  /** Multi-select "Style" panel support (Task L10 follow-up, reported as
   *  "existing color and attributes are removed and newly selected added"
   *  when editing a multi-field selection's Color & attributes together).
   *  The panel is built once against the PRIMARY selected field's own
   *  states; `oldStates`/`newStates` are that field's states immediately
   *  before/after ONE edit (a color change, an attribute checkbox toggle,
   *  a "+ Add" click, or a "Remove" click - wireRepeatableConditionedInstances'
   *  own onChange always fires with the FULL new array, one edit at a
   *  time, never a batch). This turns that before/after pair into a
   *  small structured diff describing WHAT changed rather than what the
   *  whole new list looks like, so applyColorAttrStatesDiff (below) can
   *  replay just that one change onto every OTHER selected field's own
   *  states - preserving whatever that field already had that the user
   *  didn't touch, instead of overwriting its entire state with the
   *  primary field's.
   *
   *  Returns { modified, added, removed } - modified: per-state {
   *  conditions, colorChanged, newColor, attrsAdded, attrsRemoved };
   *  added/removed: the raw state object. Returns null for a shape this
   *  can't confidently diff (the list length changed by more than one
   *  entry in a single edit - shouldn't happen via the UI's own
   *  one-change-at-a-time onChange calls, but a null return tells the
   *  caller to fall back to the old uniform-replace behavior rather than
   *  silently guessing). */
  function diffColorAttrStates(oldStates, newStates) {
    var oldList = oldStates || [];
    var newList = newStates || [];
    if (newList.length === oldList.length + 1) {
      return { modified: [], added: [newList[newList.length - 1]], removed: [] };
    }
    if (newList.length === oldList.length - 1) {
      var removedIdx = oldList.length - 1;
      for (var ri = 0; ri < newList.length; ri++) {
        if (JSON.stringify(oldList[ri]) !== JSON.stringify(newList[ri])) { removedIdx = ri; break; }
      }
      return { modified: [], added: [], removed: [oldList[removedIdx]] };
    }
    if (newList.length === oldList.length) {
      var modified = [];
      for (var i = 0; i < oldList.length; i++) {
        var o = oldList[i], n = newList[i];
        if (JSON.stringify(o) === JSON.stringify(n)) continue;
        var oldAttrs = o.attrs || [];
        var newAttrs = n.attrs || [];
        modified.push({
          conditions: o.conditions || [],
          colorChanged: o.color !== n.color,
          newColor: n.color,
          attrsAdded: newAttrs.filter(function (a) { return oldAttrs.indexOf(a) === -1; }),
          attrsRemoved: oldAttrs.filter(function (a) { return newAttrs.indexOf(a) === -1; }),
        });
      }
      return { modified: modified, added: [], removed: [] };
    }
    return null; // more than one entry changed length at once - caller falls back
  }

  /** Replays a diffColorAttrStates() result onto `keywords` (a DIFFERENT
   *  field's own keywords than the one the diff was computed from) -
   *  merges into that field's OWN existing state under the same
   *  conditions where one exists (color overwritten only if the diff
   *  actually changed color; attrs added/removed individually rather than
   *  the whole attrs list replaced), and creates a new state carrying
   *  just the changed pieces when this field has no state under those
   *  conditions yet - so a field that had no color at all before still
   *  ends up with only the newly-checked attribute, not the primary
   *  field's own unrelated color too. */
  function applyColorAttrStatesDiff(keywords, diff) {
    var states = getColorAttrStates(keywords).map(function (s) {
      return { conditions: s.conditions, color: s.color, attrs: (s.attrs || []).slice() };
    });

    (diff.modified || []).forEach(function (m) {
      var idx = -1;
      for (var i = 0; i < states.length; i++) { if (colorAttrConditionsMatch(states[i].conditions, m.conditions)) { idx = i; break; } }
      if (idx === -1) {
        var attrs = (m.attrsAdded || []).slice();
        var color = m.colorChanged ? m.newColor : '';
        if (color || attrs.length) states.push({ conditions: m.conditions, color: color, attrs: attrs });
        return;
      }
      var s = states[idx];
      var attrs2 = s.attrs.slice();
      (m.attrsAdded || []).forEach(function (a) { if (attrs2.indexOf(a) === -1) attrs2.push(a); });
      attrs2 = attrs2.filter(function (a) { return (m.attrsRemoved || []).indexOf(a) === -1; });
      states[idx] = { conditions: s.conditions, color: m.colorChanged ? m.newColor : s.color, attrs: attrs2 };
    });

    (diff.added || []).forEach(function (add) {
      var idx = -1;
      for (var i = 0; i < states.length; i++) { if (colorAttrConditionsMatch(states[i].conditions, add.conditions || [])) { idx = i; break; } }
      if (idx === -1) {
        states.push({ conditions: add.conditions || [], color: add.color || '', attrs: (add.attrs || []).slice() });
        return;
      }
      var s2 = states[idx];
      var attrs3 = s2.attrs.slice();
      (add.attrs || []).forEach(function (a) { if (attrs3.indexOf(a) === -1) attrs3.push(a); });
      states[idx] = { conditions: s2.conditions, color: add.color || s2.color, attrs: attrs3 };
    });

    (diff.removed || []).forEach(function (rem) {
      states = states.filter(function (s) { return !colorAttrConditionsMatch(s.conditions, rem.conditions || []); });
    });

    return setColorAttrStates(keywords, states);
  }

  var VALIDITY_CHECK_KEYWORDS = ['RANGE', 'COMP', 'VALUES'];
  // Bug fix (Task L34 - the exploratory "watch for other legacy-keyword-
  // synonym gaps beyond ROLLUP/ROLLDOWN" follow-up): CMP is a documented
  // legacy alternate spelling of COMP too - confirmed via IBM's own DDS
  // Reference ("This keyword is equivalent to the COMP keyword... The
  // COMP keyword is preferred"), the exact same "keyword X is the same
  // as keyword Y" pattern PAGEDOWN/ROLLUP already had. A field imported
  // with the legacy CMP spelling used to be invisible to the Validity
  // Check picker entirely (getRepeatableKeywordInstances only matched
  // VALIDITY_CHECK_KEYWORDS by exact name) - not just "shown unchecked"
  // like the ROLLUP case, since validity check has no separate on/off
  // flag to begin with. Read-side recognizes CMP alongside RANGE/COMP/
  // VALUES; write-side never re-emits CMP (the kind dropdown only ever
  // offers RANGE/COMP/VALUES), so editing a CMP-sourced field through
  // this picker at all normalizes it to the preferred COMP spelling -
  // same "read both, always write the modern name" rule ROLLUP/ROLLDOWN
  // already established.
  var VALIDITY_CHECK_READ_KEYWORDS = VALIDITY_CHECK_KEYWORDS.concat(['CMP']);

  /** A field carries at most ONE validity-check keyword at a time, so this just
   *  finds whichever of RANGE/COMP/VALUES is present - { kind: ''|'RANGE'|
   *  'COMP'|'VALUES', parameters: string (the raw parenthesized argument text) }.
   *  Superseded by getValidityCheckInstances/setValidityCheckInstances (Task
   *  L5) for the picker itself, which now supports multiple independently-
   *  conditioned occurrences (e.g. RANGE(1 50) under indicator 30, COMP(GT 0)
   *  under indicator 31) the same general way Task L1's foundation already
   *  extended to COLOR/DSPATR (L1a), ERRMSG/ERRMSGID (L1b), SFLMSG/SFLMSGID
   *  (L1c), and CHECK (L1d) - conditioning is a general per-occurrence DDS
   *  mechanism, not something only certain keywords opt into. Kept for
   *  backward compatibility/API completeness, same as getColorAttr/
   *  setColorAttr were kept alongside L1a's getColorAttrStates/
   *  setColorAttrStates. */
  function getValidityCheck(keywords) {
    var k = (keywords || []).find(function (k) { return VALIDITY_CHECK_READ_KEYWORDS.indexOf(k.name) >= 0; });
    return k ? { kind: k.name === 'CMP' ? 'COMP' : k.name, parameters: k.parameters || '' } : { kind: '', parameters: '' };
  }

  /** Returns a NEW keywords array with any existing RANGE/COMP/VALUES removed
   *  and, if `kind` is non-empty, one new keyword of that kind added with
   *  `parameters` (e.g. "10 99" for RANGE, "GT 0" for COMP, "'A' 'B' 'C'" for
   *  VALUES) - left as free text since the argument shapes differ too much per
   *  kind to model individually here; the caller supplies it already-quoted
   *  where DDS requires quoting. Superseded by setValidityCheckInstances (Task
   *  L5) - see getValidityCheck's own doc comment. */
  function setValidityCheck(keywords, kind, parameters) {
    var next = (keywords || []).filter(function (k) { return VALIDITY_CHECK_READ_KEYWORDS.indexOf(k.name) < 0; });
    if (kind) next = next.concat([{ name: kind, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  // -----------------------------------------------------------------------
  // Task L5 (piece 1 of the still-open items listed in
  // docs/sda-reference/LIMITATIONS-PLAN.md) - Validity check's OWN
  // RANGE/COMP/VALUES keyword as Task L1's repeatable, independently-
  // conditioned instances, the same shape ERRMSG/ERRMSGID (L1b) already
  // uses: unlike Color & attributes (L1a), where COLOR and DSPATR are two
  // DIFFERENT keywords paired into one state, RANGE/COMP/VALUES are three
  // MUTUALLY EXCLUSIVE alternative keyword NAMES for the same "kind" of
  // validity check - a single instance is exactly one of them, never a
  // combination, so no positional pairing across keyword names is needed
  // here the way L1a's getColorAttrStates has to do for COLOR+DSPATR. An
  // instance is just { conditions, kind: 'RANGE'|'COMP'|'VALUES',
  // parameters: string } - `parameters` stays free text for the same
  // reason getValidityCheck/setValidityCheck above already left it free
  // text (RANGE/COMP/VALUES argument shapes differ too much to model
  // individually, and the caller supplies VALUES/COMP string args already
  // quoted where DDS requires it).
  // -----------------------------------------------------------------------

  /** Reads every RANGE/COMP/VALUES instance off `keywords` - `{ conditions,
   *  kind, parameters }[]`, in source order, one entry per keyword
   *  occurrence (no grouping/pairing needed - see this section's doc
   *  comment above). */
  function getValidityCheckInstances(keywords) {
    var instances = getRepeatableKeywordInstances(keywords, VALIDITY_CHECK_READ_KEYWORDS);
    return instances.map(function (inst) {
      return { conditions: inst.conditions, kind: inst.name === 'CMP' ? 'COMP' : inst.name, parameters: inst.parameters || '' };
    });
  }

  /** Returns a NEW keywords array with every existing RANGE/COMP/VALUES
   *  instance replaced by the given `states` (`{ conditions, kind,
   *  parameters }[]`) - each state with a non-empty `kind` writes one
   *  keyword of that kind under that state's OWN `conditions`, so two
   *  states can carry different validity rules under different
   *  indicators (or the same rule unconditioned plus a stricter one under
   *  a specific indicator). A state with an empty `kind` writes nothing
   *  (the picker's own "+ Add" default never starts genuinely blank - see
   *  makeDefaultInstance in webviewClientHelpers.js's
   *  wireValidityCheckInstances - but this guard matches every other
   *  L1-based setX's same "an emptied-out state just disappears" rule,
   *  e.g. setColorAttrStates above). */
  function setValidityCheckInstances(keywords, states) {
    var flat = (states || [])
      .filter(function (state) { return state && state.kind; })
      .map(function (state) { return { name: state.kind, parameters: state.parameters || '', conditions: (state && state.conditions) || [] }; });
    return setRepeatableKeywordInstances(keywords, VALIDITY_CHECK_READ_KEYWORDS, flat);
  }

  // Task I-31 finding: EDTMSK used to live in this same mutually-exclusive
  // group as EDTCDE/EDTWRD, but IBM's own DDS Reference states EDTMSK
  // "must also contain the EDTCDE or EDTWRD keywords" - it can never
  // stand alone, so treating it as a third alternative to EDTCDE/EDTWRD
  // (selecting it wiped out whichever of the other two the field already
  // carried, and vice versa) could never actually produce the EDTCDE+
  // EDTMSK or EDTWRD+EDTMSK combination IBM's own text requires. EDTMSK
  // now has its own independent get/set pair (getEditMask/setEditMask)
  // and its own conflict check (editMaskConflictReason) below, entirely
  // separate from this group.
  var EDIT_KEYWORDS = ['EDTCDE', 'EDTWRD'];

  /** A field can't carry more than one of an edit code or an edit word -
   *  { kind: ''|'EDTCDE'|'EDTWRD', parameters: string }. See EDIT_KEYWORDS'
   *  own comment above for why EDTMSK isn't part of this group. */
  function getEditKeyword(keywords) {
    var k = (keywords || []).find(function (k) { return EDIT_KEYWORDS.indexOf(k.name) >= 0; });
    return k ? { kind: k.name, parameters: k.parameters || '' } : { kind: '', parameters: '' };
  }

  /** Returns a NEW keywords array with any existing EDTCDE/EDTWRD
   *  removed and, if `kind` is non-empty, one new keyword added with
   *  `parameters` (a bare edit-code letter for EDTCDE, e.g. "J"; the full
   *  quoted substitution string for EDTWRD, e.g. "'  DR  CR'" - the
   *  caller supplies quoting for EDTWRD itself since its internal
   *  structure is meaningful). Does not touch EDTMSK - see setEditMask
   *  below. */
  function setEditKeyword(keywords, kind, parameters) {
    var next = (keywords || []).filter(function (k) { return EDIT_KEYWORDS.indexOf(k.name) < 0; });
    if (kind) next = next.concat([{ name: kind, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  // -----------------------------------------------------------------------
  // Task I-78 - EDTCDE's optional second parameter. The DDS Reference gives
  // the format as `EDTCDE(edit-code [* |floating-currency-symbol])`: after
  // the edit-code letter, an optional `*` (asterisk fill - "an asterisk is
  // printed for each zero that is suppressed") or a floating currency
  // symbol (which "must match the system value for the currency symbol
  // (QCURSYM)"). Real SDA's own "Select Editing Keywords" screen shows it
  // as its own prompt, "Replace leading zeros with". Until now it was only
  // reachable by typing it into the same box as the letter.
  //
  // The keyword's parameters stay ONE string ("J *"); these helpers split
  // it for the widget and join it back. The canonical joined form has a
  // space, as in the reference's own format line, though "J*" (no space)
  // is read back just as well.
  //
  // One rule is enforced, and only because IBM states it outright: "You
  // can optionally specify asterisk fill or floating currency symbol with
  // edit codes 1 through 4, A through D, and J through Q." - so W, X, Y
  // and Z (the other IBM edit codes) cannot take one. User-defined codes
  // (5-9) are not mentioned either way and are left alone, as is any
  // parameter string that does not look like `<code> [<char>]` at all.
  // -----------------------------------------------------------------------
  var EDTCDE_NO_FILL_CODES = ['W', 'X', 'Y', 'Z'];

  /** Splits an EDTCDE parameter string into { code, fill }. A string that
   *  is not `<one character>` optionally followed by `<one character>`
   *  (e.g. hand-written oddities) comes back whole as `code` with an empty
   *  `fill`, so nothing is ever dropped by the widget. */
  function splitEditCode(parameters) {
    var text = String(parameters == null ? '' : parameters);
    var m = /^\s*(\S)\s*(\S)?\s*$/.exec(text);
    if (!m) return { code: text.trim(), fill: '' };
    return { code: m[1], fill: m[2] || '' };
  }

  /** The inverse: `code` plus, when `fill` is non-blank, a space and the
   *  fill character. */
  function joinEditCode(code, fill) {
    var c = String(code == null ? '' : code).trim();
    var f = String(fill == null ? '' : fill).trim();
    return f ? (c + ' ' + f).trim() : c;
  }

  /** { code, fill } for the field's EDTCDE, or empty strings when it has
   *  none (an EDTWRD field also reports empty - its parameters are not an
   *  edit code). */
  function getEditCodeParts(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'EDTCDE'; });
    return k ? splitEditCode(k.parameters) : { code: '', fill: '' };
  }

  /** Why an EDTCDE edit code / "Replace leading zeros with" pair cannot be
   *  applied, or null. `kind` is the Apply's selected keyword ('' /
   *  'EDTCDE' / 'EDTWRD'). Nothing is reported for a blank fill. */
  function editCodeFillConflictReason(kind, code, fill) {
    var f = String(fill == null ? '' : fill).trim();
    if (!f) return null;
    if (kind !== 'EDTCDE') {
      return '"Replace leading zeros with" applies only to an EDTCDE edit code.';
    }
    if (f.length !== 1 || /['"()]/.test(f)) {
      return 'Replace leading zeros with must be a single character: * for asterisk fill, or the floating currency symbol (e.g. $).';
    }
    var c = String(code == null ? '' : code).trim().toUpperCase();
    if (!c) return 'Enter an edit code before choosing what replaces leading zeros.';
    if (EDTCDE_NO_FILL_CODES.indexOf(c) >= 0) {
      return 'Asterisk fill or a floating currency symbol can be specified only with edit codes 1-4, A-D and J-Q, not ' + c + ' (per the DDS Reference).';
    }
    return null;
  }

  /** Task I-31 - EDTMSK (Edit Mask), independent of getEditKeyword/
   *  setEditKeyword above. { text: string } - the full quoted mask
   *  string, e.g. "'(999) 999-9999'" (caller supplies quoting, same
   *  convention EDTWRD's own parameters use). */
  function getEditMask(keywords) {
    var k = (keywords || []).find(function (k) { return k.name === 'EDTMSK'; });
    return { text: k ? (k.parameters || '') : '' };
  }

  /** Returns a NEW keywords array with any existing EDTMSK removed and,
   *  if `text` is non-empty, one new EDTMSK keyword added with it as its
   *  parameters. Does not touch EDTCDE/EDTWRD - see editMaskConflictReason
   *  below for the rule that an EDTMSK can only ever meaningfully coexist
   *  with one of them, enforced by the caller before this is invoked. */
  function setEditMask(keywords, text) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'EDTMSK'; });
    if (text) next = next.concat([{ name: 'EDTMSK', parameters: text, conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  /** Task I-31 - EDTMSK's own two documented requirements, both stated
   *  individually in its DDS Reference section: "The field containing
   *  the EDTMSK keyword must be usage I or usage B. It must also contain
   *  the EDTCDE or EDTWRD keywords." `usage` and `keywords` are checked
   *  against whatever the caller is ABOUT to leave on the field (not
   *  necessarily what's already saved - a same-click "add EDTCDE and
   *  EDTMSK together" must be allowed), so callers pass the pending
   *  EDTCDE/EDTWRD state via `keywords` themselves. Returns a
   *  human-readable reason if turning EDTMSK on right now would violate
   *  either rule (checked in the order IBM's own text states them), or
   *  null if it's fine. */
  function editMaskConflictReason(keywords, usage) {
    var u = (usage || '').toUpperCase();
    if (u !== 'I' && u !== 'B') {
      return 'EDTMSK requires field usage I or B (per the DDS Reference).';
    }
    var hasEditCode = (keywords || []).some(function (k) { return k.name === 'EDTCDE' || k.name === 'EDTWRD'; });
    if (!hasEditCode) {
      return 'EDTMSK requires the field to also carry EDTCDE or EDTWRD (per the DDS Reference).';
    }
    return null;
  }

  /** Task I-31 - the named sub-check keywordFixes.md's own I-31 write-up
   *  calls out: L/T/Z (Date/Time/Timestamp) data types have their own,
   *  narrower Usage restriction than every other data type. IBM's DDS
   *  Reference states it plainly, right after these three types' own
   *  field-length rules: "Valid field usage (DDS position 38) can be O,
   *  B, or I" - no H (Hidden), M (Message text), or P (Program-to-
   *  system) at all, unlike every numeric/character data type, all of
   *  which allow the full H/I/O/B/M/P set. Returns a reason string if
   *  `usage` is invalid for `dataType`, or null if it's fine (including
   *  for every non-L/T/Z data type, which this check doesn't apply to
   *  at all). */
  function dateTimeUsageConflictReason(dataType, usage) {
    var isDateTimeType = dataType === 'L' || dataType === 'T' || dataType === 'Z';
    if (!isDateTimeType) return null;
    var u = (usage || '').toUpperCase();
    if (u === 'O' || u === 'B' || u === 'I') return null;
    return 'Date/Time/Timestamp fields (data type L/T/Z) must be usage O, B, or I (per the DDS Reference).';
  }

  // ---------------------------------------------------------------------
  // I-32 - DATFMT/DATSEP (date fields, data type L only) and TIMFMT/
  // TIMSEP (time fields, data type T only). Both pairs were entirely
  // unexposed anywhere in iSDA before this task - DspfEngine.dateFieldLength
  // already READ DATFMT (for display-width purposes) but nothing ever let
  // the user set it, or DATSEP/TIMFMT/TIMSEP at all. Neither applies to
  // timestamp (Z) fields - DATFMT's own text: "valid only for date fields
  // (data type L)"; TIMFMT's own text: "valid for time fields (data type
  // T)" - Z has its own fixed standard format
  // (yyyy-mm-dd-hh.mm.ss.mmmmmm) with no DATFMT/TIMFMT/DATSEP/TIMSEP
  // customization at all (confirmed: neither keyword's DDS Reference
  // section, nor anywhere else in DDS_Keyword_V7r6.txt, ever mentions
  // data type Z in connection with either pair).
  //
  // Each pair is single-instance (not repeatable) and option-indicator-
  // free by its own text ("Option indicators are not valid for this
  // keyword, although option indicators can be used to condition the
  // field for which it is specified" - i.e. the field itself can be
  // conditioned into/out of existence, but the keyword's OWN value can't
  // vary by indicator) - same shape as EDTMSK before it, so these follow
  // getEditMask/setEditMask's own pattern directly.
  // ---------------------------------------------------------------------

  var FIXED_SEPARATOR_DATE_FORMATS = ['*ISO', '*USA', '*EUR', '*JIS'];
  var FIXED_SEPARATOR_TIME_FORMATS = ['*ISO', '*USA', '*EUR', '*JIS'];

  /** DATFMT's own parameter is a bare special value (e.g. "*JUL") with no
   *  quoting - unlike DATSEP/TIMSEP below, there's no free text to parse
   *  here, so this is a direct read/write of the parameter string. */
  function getDateFormat(keywords) {
    var k = (keywords || []).find(function (k) { return k.name === 'DATFMT'; });
    return k ? (k.parameters || '') : '';
  }

  /** Returns a NEW keywords array with any existing DATFMT removed and,
   *  if `format` is non-empty, one new DATFMT keyword added with it
   *  (e.g. "*JUL") as its bare, unquoted parameter. */
  function setDateFormat(keywords, format) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'DATFMT'; });
    if (format) next = next.concat([{ name: 'DATFMT', parameters: format, conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  /** Parses DATSEP/TIMSEP's shared `*JOB | 'separator-char'` grammar into
   *  the bare display value a <select> can hold: '' (not specified),
   *  '*JOB', or the single unquoted separator character. Unrecognized raw
   *  text (shouldn't occur from iSDA's own writer, but could from
   *  hand-edited source) falls back to the raw text itself, same
   *  unstructured-fallback posture as parseMsgConParams for its own
   *  unparseable inputs. */
  function parseSeparatorParam(raw) {
    var t = (raw || '').trim();
    if (!t) return '';
    if (t.toUpperCase() === '*JOB') return '*JOB';
    var m = t.match(/^'(.*)'$/);
    if (m) return m[1];
    return t;
  }

  /** Inverse of parseSeparatorParam - wraps a bare separator character in
   *  the single quotes DATSEP/TIMSEP's grammar requires; leaves '*JOB'
   *  and '' (not specified) unquoted. */
  function formatSeparatorParam(value) {
    var v = (value == null ? '' : value);
    if (!v) return '';
    if (v.toUpperCase() === '*JOB') return '*JOB';
    return "'" + v + "'";
  }

  function getDateSeparator(keywords) {
    var k = (keywords || []).find(function (k) { return k.name === 'DATSEP'; });
    return k ? parseSeparatorParam(k.parameters) : '';
  }

  /** `value` is the bare display value (e.g. "-" or "*JOB"), NOT
   *  pre-quoted - formatSeparatorParam handles quoting internally, unlike
   *  setEditMask/setDateFormat above where the caller supplies the raw
   *  DDS text directly. Returns a NEW keywords array with any existing
   *  DATSEP removed and, if `value` is non-empty, one new DATSEP keyword
   *  added. */
  function setDateSeparator(keywords, value) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'DATSEP'; });
    var formatted = formatSeparatorParam(value);
    if (formatted) next = next.concat([{ name: 'DATSEP', parameters: formatted, conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  /** DATFMT's own text states this as a hard restriction ("If you specify
   *  the *ISO, *USA, *EUR, or *JIS value, you cannot specify the DATSEP
   *  keyword. These date formats have fixed separators.") even though
   *  DATSEP's own mirroring text softens it to "should not" - treated
   *  here as enforced, matching this project's general posture of
   *  blocking DDS that a real CRTDSPF compile would reject rather than
   *  only warning. Returns a reason string if `dateFormat` has a fixed
   *  separator, or null if DATSEP is fine to specify (including for a
   *  blank/unspecified dateFormat, which defaults to *ISO per DATFMT's
   *  own text but hasn't been explicitly chosen yet). */
  function dateSeparatorConflictReason(dateFormat) {
    if (FIXED_SEPARATOR_DATE_FORMATS.indexOf((dateFormat || '').toUpperCase()) !== -1) {
      return 'DATSEP cannot be specified with DATFMT(' + dateFormat + ') - this format has a fixed date separator (per the DDS Reference).';
    }
    return null;
  }

  /** TIMFMT's own parameter is a bare special value (e.g. "*HMS"), same
   *  shape as getDateFormat/setDateFormat above - no *JOB option exists
   *  for TIMFMT itself (unlike DATFMT), confirmed by its own format table
   *  in the DDS Reference never listing one. */
  function getTimeFormat(keywords) {
    var k = (keywords || []).find(function (k) { return k.name === 'TIMFMT'; });
    return k ? (k.parameters || '') : '';
  }

  function setTimeFormat(keywords, format) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'TIMFMT'; });
    if (format) next = next.concat([{ name: 'TIMFMT', parameters: format, conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  function getTimeSeparator(keywords) {
    var k = (keywords || []).find(function (k) { return k.name === 'TIMSEP'; });
    return k ? parseSeparatorParam(k.parameters) : '';
  }

  function setTimeSeparator(keywords, value) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'TIMSEP'; });
    var formatted = formatSeparatorParam(value);
    if (formatted) next = next.concat([{ name: 'TIMSEP', parameters: formatted, conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  /** TIMFMT's own text states the same hard restriction DATFMT does, word
   *  for word in structure: "If you specify the time-format parameter
   *  value as *ISO, *USA, *EUR, or *JIS, you cannot specify the TIMSEP
   *  keyword. These formats have fixed separators." Enforced the same
   *  way as dateSeparatorConflictReason above. */
  function timeSeparatorConflictReason(timeFormat) {
    if (FIXED_SEPARATOR_TIME_FORMATS.indexOf((timeFormat || '').toUpperCase()) !== -1) {
      return 'TIMSEP cannot be specified with TIMFMT(' + timeFormat + ') - this format has a fixed time separator (per the DDS Reference).';
    }
    return null;
  }

  // ---------------------------------------------------------------------
  // CHKMSGID (Check Message Identifier): overrides the system-supplied
  // error message a validity check (CHECK(VN/VNE/M10/M11), CMP, COMP,
  // RANGE, or VALUES) issues when it rejects the field's data - real
  // SDA's own "Define Validity Check Keywords" screen reaches this via a
  // second "More..." page rather than showing it alongside RANGE/COMP/
  // VALUES/CHECK on the first page, but it's still the SAME field-level
  // keyword picker, not a separate feature.
  // Format: CHKMSGID(message-id [library/]message-file [&message-data-field])
  // - message-id and message-file are both required (DDS syntax has no
  // way to specify one without the other); library is optional (defaults
  // to *LIBL at run time when omitted) and message-data-field is an
  // optional &field-name whose contents supply the message's replacement
  // text. Single-instance, same one-at-a-time "Apply" pattern as
  // getEditKeyword/setEditKeyword just above (no per-instance
  // conditioning support, matching that same simplification).
  // ---------------------------------------------------------------------

  /** @returns {{msgId:string, library:string, msgFile:string, msgDataField:string}} */
  function getCheckMsgId(keywords) {
    var k = (keywords || []).find(function (k) { return k.name === 'CHKMSGID'; });
    if (!k) return { msgId: '', library: '', msgFile: '', msgDataField: '' };
    var tokens = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    var msgId = tokens[0] || '';
    var fileToken = tokens[1] || '';
    var library = '', msgFile = fileToken;
    var slash = fileToken.indexOf('/');
    if (slash !== -1) {
      library = fileToken.slice(0, slash);
      msgFile = fileToken.slice(slash + 1);
    }
    var msgDataField = (tokens[2] || '').replace(/^&/, '');
    return { msgId: msgId, library: library, msgFile: msgFile, msgDataField: msgDataField };
  }

  /** Returns a NEW keywords array with any existing CHKMSGID removed and,
   *  if both `msgId` and `msgFile` are non-blank (DDS requires both), one
   *  new CHKMSGID added. `library` and `msgDataField` are each optional. */
  function setCheckMsgId(keywords, msgId, library, msgFile, msgDataField) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'CHKMSGID'; });
    var id = (msgId || '').trim();
    var file = (msgFile || '').trim();
    if (!id || !file) return next;
    var fileToken = (library || '').trim() ? library.trim() + '/' + file : file;
    var params = id + ' ' + fileToken;
    var dataField = (msgDataField || '').trim().replace(/^&/, '');
    if (dataField) params += ' &' + dataField;
    next = next.concat([{ name: 'CHKMSGID', parameters: params, conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  // -----------------------------------------------------------------------
  // Task I-69 - CHKMSGID's own dependency and usage rules. Its DDS
  // Reference section states both in one place: "CHKMSGID is allowed only
  // on fields which also contain a CHECK(M10), CHECK(M11), CHECK(VN),
  // CHECK(VNE), CMP, COMP, RANGE, or VALUES keyword. The field must be
  // input-capable (usage B or I)." (It also says it takes no option
  // indicators, which setCheckMsgId above already honours.) I-30 found the
  // gap: nothing enforced either rule.
  //
  // Unlike the mutual-exclusion guards this is a *dependency*, so it has
  // two directions, both diff-based (same shape as I-58's
  // wrdwrapNewConflictReason, the same commitEdit choke point) so a
  // hand-written file that is already invalid never blocks an unrelated
  // edit:
  //   forward  - an edit that INTRODUCES CHKMSGID while no qualifying
  //              keyword is present;
  //   reverse  - an edit that removes the LAST qualifying keyword while
  //              CHKMSGID stays (blocked rather than silently cascading,
  //              so the user's message id/file are never deleted behind
  //              their back - remove CHKMSGID first).
  // -----------------------------------------------------------------------
  var CHKMSGID_QUALIFYING_NAMES = ['CMP', 'COMP', 'RANGE', 'VALUES'];
  var CHKMSGID_QUALIFYING_CHECK_CODES = ['M10', 'M11', 'VN', 'VNE'];
  var CHKMSGID_LIST_TEXT = 'CHECK(M10), CHECK(M11), CHECK(VN), CHECK(VNE), CMP, COMP, RANGE, or VALUES';

  /** True when `keywords` carries a keyword CHKMSGID may accompany. CHECK
   *  only qualifies with one of its four message-producing codes (so
   *  CHECK(ME) or CHECK(AB) alone do not); the sub-parameters are matched
   *  by token, so CHECK(ME VN) does. */
  function hasChkmsgidQualifier(keywords) {
    return (keywords || []).some(function (k) {
      if (CHKMSGID_QUALIFYING_NAMES.indexOf(k.name) >= 0) return true;
      if (k.name !== 'CHECK') return false;
      var tokens = String(k.parameters || '').toUpperCase().split(/[\s,()]+/).filter(Boolean);
      return tokens.some(function (t) { return CHKMSGID_QUALIFYING_CHECK_CODES.indexOf(t) >= 0; });
    });
  }

  function chkmsgidUsageReason(usage) {
    var u = String(usage == null ? '' : usage).trim().toUpperCase();
    if (u && u !== 'I' && u !== 'B') {
      return 'CHKMSGID can only be specified on an input-capable field (usage B or I, per the DDS Reference).';
    }
    return null;
  }

  var CHKMSGID_NEEDS_QUALIFIER_TEXT = 'CHKMSGID is allowed only on fields which also contain a ' + CHKMSGID_LIST_TEXT + ' keyword (per the DDS Reference). Add one of those first.';

  /** Diff-based check for EVERY field-level panel (the commitEdit choke
   *  point): given the field's keywords before and after an edit, returns
   *  a reason when the edit introduces CHKMSGID with no qualifier (forward)
   *  or removes the last qualifier while CHKMSGID remains (reverse), else
   *  null. */
  function chkmsgidNewConflictReason(oldKeywords, newKeywords) {
    var has = function (kws) { return (kws || []).some(function (k) { return k.name === 'CHKMSGID'; }); };
    if (!has(newKeywords)) return null;
    var newQual = hasChkmsgidQualifier(newKeywords);
    if (!has(oldKeywords)) {
      return newQual ? null : CHKMSGID_NEEDS_QUALIFIER_TEXT;
    }
    if (hasChkmsgidQualifier(oldKeywords) && !newQual) {
      return 'This would remove the last of ' + CHKMSGID_LIST_TEXT + ' from a field that still has CHKMSGID, which is only allowed alongside one of them (per the DDS Reference). Remove CHKMSGID first.';
    }
    return null;
  }

  /** Raw keyword editor's "add" guard for CHKMSGID: the dependency plus the
   *  input-capable usage rule (blank usage = still being drafted, never
   *  blocked). Returns null for any other keyword name. */
  function chkmsgidFieldAddReason(keywordName, fieldKeywords, usage) {
    if (keywordName !== 'CHKMSGID') return null;
    var usageReason = chkmsgidUsageReason(usage);
    if (usageReason) return usageReason;
    return hasChkmsgidQualifier(fieldKeywords) ? null : CHKMSGID_NEEDS_QUALIFIER_TEXT;
  }

  /** Basic tab Apply guard (same idiom and blank-usage handling as I-61's
   *  wrdwrapBasicEditConflictReason): a usage CHANGE to a non-input-capable
   *  value on a field that already carries CHKMSGID. Diff-based, so an
   *  unrelated Apply on an already-invalid field still goes through. */
  function chkmsgidBasicEditConflictReason(fieldKeywords, oldUsage, newUsage) {
    if (!(fieldKeywords || []).some(function (k) { return k.name === 'CHKMSGID'; })) return null;
    var norm = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
    var oldU = norm(oldUsage) || 'O';
    var newU = norm(newUsage) || 'O';
    if (newU === oldU) return null;
    return chkmsgidUsageReason(newU);
  }

  // -----------------------------------------------------------------------
  // Task I-70 - CHRID's own eligibility and mutual-exclusion rules. Its DDS
  // Reference section states them in three sentences: "The CHRID keyword
  // is not valid on constant fields, numeric fields (fields with decimal
  // positions specified in positions 36 through 37), message fields (M
  // specified in position 38), hidden fields (H specified in position
  // 38), or program-to-system fields (P in Position 38)." and "The CHRID
  // keyword cannot be specified with the DUP (Duplication) keyword."
  // I-30 found none of it enforced beyond hiding the General keywords row
  // for constants and M/P fields.
  //
  // "Numeric" is taken literally from that text - decimal positions
  // specified (0 counts) - NOT inferred from the data type: a Y (numeric
  // only) or S field is only numeric for CHRID's purposes once positions
  // 36-37 are filled in. A blank usage is the DDS default (output), so it
  // is never blocked.
  //
  // Enforced the same way I-58/I-69 enforce theirs, all diff-based so a
  // hand-written file that is already invalid never blocks an unrelated
  // edit:
  //   - chridFieldAddReason       raw editor's "+ Add keyword" and the
  //                               General keywords row's on-transition
  //                               (CHRID on an ineligible / DUP field, and
  //                               DUP on a CHRID field);
  //   - chridNewConflictReason    the commitEdit choke point, for every
  //                               panel that writes keywords (the DUP
  //                               checkbox in Input keywords included);
  //   - chridBasicEditConflictReason  the Basic tab's Apply (a usage or
  //                               decimal-positions change on a field that
  //                               already carries CHRID).
  // The option-indicator side ("Option indicators are not valid for this
  // keyword") was already handled by I-30.
  // -----------------------------------------------------------------------
  var CHRID_DUP_TEXT = 'CHRID cannot be specified together with DUP on the same field (per the DDS Reference).';
  var CHRID_USAGE_LABELS = { H: 'hidden (H)', M: 'message (M)', P: 'program-to-system (P)' };
  var CHRID_NUMERIC_TEXT = 'CHRID is not valid on numeric fields, i.e. fields with decimal positions specified (per the DDS Reference).';

  /** True when a field's decimal positions are specified (positions 36-37
   *  filled in). null/undefined/blank/non-numeric all mean "not specified";
   *  0 counts as specified. */
  function chridDecimalsSpecified(decimalPositions) {
    if (decimalPositions === null || decimalPositions === undefined) return false;
    var t = String(decimalPositions).trim();
    return t !== '' && !isNaN(Number(t));
  }

  function chridUsageReason(usage) {
    var u = String(usage == null ? '' : usage).trim().toUpperCase();
    if (Object.prototype.hasOwnProperty.call(CHRID_USAGE_LABELS, u)) {
      return 'CHRID is not valid on ' + CHRID_USAGE_LABELS[u] + ' fields (per the DDS Reference).';
    }
    return null;
  }

  /** Why CHRID cannot be on a field of this kind, or null when the field
   *  is eligible: constant, usage H/M/P, or decimal positions specified.
   *  (DUP is a keyword-vs-keyword rule, checked separately.) */
  function chridEligibilityReason(usage, decimalPositions, isConstant) {
    if (isConstant) return 'CHRID is not valid on constant fields (per the DDS Reference).';
    var usageReason = chridUsageReason(usage);
    if (usageReason) return usageReason;
    if (chridDecimalsSpecified(decimalPositions)) return CHRID_NUMERIC_TEXT;
    return null;
  }

  function chridHas(keywords, name) {
    return (keywords || []).some(function (k) { return k.name === name; });
  }

  /** Raw keyword editor's "add" guard and the General keywords row's
   *  on-transition, both directions:
   *  - adding CHRID: blocked on an ineligible field, or when the field
   *    already carries DUP;
   *  - adding DUP: blocked when the field already carries CHRID.
   *  Returns null for any other keyword name. */
  function chridFieldAddReason(keywordName, fieldKeywords, usage, decimalPositions, isConstant) {
    var name = String(keywordName || '').toUpperCase();
    if (name === 'CHRID') {
      var eligibility = chridEligibilityReason(usage, decimalPositions, isConstant);
      if (eligibility) return eligibility;
      return chridHas(fieldKeywords, 'DUP') ? CHRID_DUP_TEXT : null;
    }
    if (name === 'DUP') {
      return chridHas(fieldKeywords, 'CHRID') ? 'DUP cannot be specified on a field that already has CHRID (per the DDS Reference).' : null;
    }
    return null;
  }

  /** commitEdit choke point: given the field's keywords before and after
   *  an edit (and the field's own kind - `ctx` is { usage, decimalPositions,
   *  isConstant }, the values that will be true AFTER the edit), returns a
   *  reason when the edit INTRODUCES a CHRID violation:
   *  - CHRID newly present on an ineligible field, or together with DUP;
   *  - DUP newly added to a field that already had CHRID.
   *  A field that already had both (hand-written) is never re-reported. */
  function chridNewConflictReason(oldKeywords, newKeywords, ctx) {
    if (!chridHas(newKeywords, 'CHRID')) return null;
    var c = ctx || {};
    if (!chridHas(oldKeywords, 'CHRID')) {
      var eligibility = chridEligibilityReason(c.usage, c.decimalPositions, c.isConstant);
      if (eligibility) return eligibility;
      return chridHas(newKeywords, 'DUP') ? CHRID_DUP_TEXT : null;
    }
    if (chridHas(newKeywords, 'DUP') && !chridHas(oldKeywords, 'DUP')) {
      return 'DUP cannot be specified on a field that already has CHRID (per the DDS Reference).';
    }
    return null;
  }

  /** Basic tab Apply guard: a usage change to H/M/P, or decimal positions
   *  going from unspecified to specified, on a field that already carries
   *  CHRID. `field` is the field before the edit, `updates` the Apply's
   *  changes (only keys present in `updates` count as changed). Diff-based,
   *  same blank-usage handling as chkmsgidBasicEditConflictReason (blank =
   *  output). Returns a reason string or null. */
  function chridBasicEditConflictReason(fieldKeywords, field, updates) {
    if (!chridHas(fieldKeywords, 'CHRID')) return null;
    var f = field || {};
    var u = updates || {};
    var norm = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
    if (Object.prototype.hasOwnProperty.call(u, 'usage')) {
      var oldU = norm(f.usage) || 'O';
      var newU = norm(u.usage) || 'O';
      if (newU !== oldU) {
        var usageReason = chridUsageReason(newU);
        if (usageReason) return usageReason + ' Remove CHRID first.';
      }
    }
    if (Object.prototype.hasOwnProperty.call(u, 'decimalPositions')) {
      if (chridDecimalsSpecified(u.decimalPositions) && !chridDecimalsSpecified(f.decimalPositions)) {
        return CHRID_NUMERIC_TEXT + ' Remove CHRID first.';
      }
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Field-level keyword pickers modeled on real SDA's "Select Field
  // Keywords" screens (see docs/sda-reference/, task D1) - CHECK(...)
  // (shared by SDA's "Keying options" and part of "Validity check"
  // screens), input handling (DUP/BLANKS/CHANGE/CHGINPDFT), general
  // keywords (ALIAS/INDTXT/DFT/DFTVAL/FLDCSRPRG/PUTRETAIN/OVRDTA/OVRATR/
  // CHRID/IGCALTTYP/NOCCSID), database-reference (REFFLD itself - see
  // L79 below - plus its DLTCHK/DLTEDT override flags), and MSGID. Verified
  // against IBM's own DDS keyword reference, not guessed - each is a real,
  // distinct field-level keyword (DFT is input-only, DFTVAL is output/
  // both; CHECK takes a code list distinct from RANGE/COMP/VALUES and can
  // coexist with them; FLDCSRPRG is genuinely "Cursor Progression Field",
  // not a typo of CSRLOC).
  //
  // ERRMSG/ERRMSGID's own multi-instance, independently-conditioned
  // handling (Task L1b) lives with getErrorMessageInstances/
  // setErrorMessageInstances near getRepeatableKeywordInstances above,
  // not here - real SDA's own "Error Messages" screen is a repeatable
  // list (several message/condition pairs tried in order), so it's built
  // on the L1 foundation rather than a single-instance getX/setX pair
  // like the keywords in this section. Color & attributes (COLOR/DSPATR),
  // Subfile Messages (SFLMSG/SFLMSGID), and CHECK's codes (Tasks L1a,
  // L1c, L1d) are now ALSO multi-instance - see each task's own comment
  // (CHECK's is just below, since it's shared between two UI panels and
  // needed its own explanation) - only KEYBRD, RANGE/COMP/VALUES, and
  // EDTCDE/EDTWRD/EDTMSK in this section remain single-instance.
  // ---------------------------------------------------------------------

  var CHECK_CODES = ['ME', 'ER', 'MF', 'FE', 'RB', 'RZ', 'RL', 'LC', 'AB', 'VN', 'VNE', 'M10', 'M10F', 'M11', 'M11F'];

  /**
   * Task L1d - CHECK(...) is now multi-instance (real DDS lets several
   * CHECK() keywords coexist on one field, each independently conditioned
   * - e.g. CHECK(ME) under indicator 30, CHECK(AB) under indicator 40),
   * wired through Task L1's generic getRepeatableKeywordInstances/
   * setRepeatableKeywordInstances rather than a dedicated getX/setX pair
   * (CHECK's payload is just its raw space-separated code list already -
   * exactly the shape L1 operates on generically, no extra parsing layer
   * needed beyond the two small helpers below).
   *
   * CHECK's codes are split across TWO UI panels that both read/write
   * this SAME keyword - Keying options (ME/ER/MF/FE/RB/RZ/RL/LC) and
   * Validity check (AB/VN/VNE/M10/M11, plus M10F/M11F immediate variants)
   * - see checkInstancesHtml/wireCheckInstancesEditor in
   * webviewClientHelpers.js for how both panels share one rendering/
   * wiring path over the same instance list without either one able to
   * clobber the other's codes on a shared instance.
   */
  function parseCheckCodes(parameters) {
    return (parameters || '').trim().split(/\s+/).filter(Boolean).map(function (s) { return s.toUpperCase(); });
  }

  /** Inverse of parseCheckCodes - order preserved as given, '' for an
   *  empty list (the caller decides what an empty-parameters CHECK
   *  instance means, same as any other repeatable instance's payload). */
  function formatCheckCodes(codes) {
    return (codes || []).filter(Boolean).join(' ');
  }

  /** Reads the field's input-handling keywords - DUP (Dup key duplication,
   *  optional response indicator via CHECK's own indicator column - here
   *  represented simply as present/absent since the response indicator is
   *  written through the generic Conditioning toggle same as every other
   *  keyword here), BLANKS (numeric blank-vs-zero distinction), CHANGE
   *  (MDT/changed detection), CHGINPDFT (change input defaults) - each a
   *  simple boolean per real DDS (DUP/BLANKS/CHANGE take a REQUIRED
   *  response indicator in real DDS, which the caller supplies via
   *  Conditioning on that specific keyword the same as any other
   *  conditioned keyword; CHGINPDFT takes none). */
  function getInputKeywords(keywords) {
    var names = (keywords || []).map(function (k) { return k.name; });
    return {
      dup: names.indexOf('DUP') >= 0,
      blanks: names.indexOf('BLANKS') >= 0,
      change: names.indexOf('CHANGE') >= 0,
      chginpdft: names.indexOf('CHGINPDFT') >= 0,
    };
  }

  /** Returns a NEW keywords array with DUP/BLANKS/CHANGE/CHGINPDFT set to
   *  match `state` ({ dup, blanks, change, chginpdft }: booleans). Existing
   *  parameters (e.g. DUP's optional response-indicator text) are
   *  preserved when a flag stays true; toggling one off removes it
   *  entirely; toggling one on where it didn't exist adds it bare (no
   *  parameters - real DDS allows DUP/BLANKS/CHANGE with just their
   *  required response indicator, added via Conditioning). */
  function setInputKeywords(keywords, state) {
    var s = state || {};
    var KEEP = { dup: 'DUP', blanks: 'BLANKS', change: 'CHANGE', chginpdft: 'CHGINPDFT' };
    var toRemove = Object.keys(KEEP).filter(function (k) { return !s[k]; }).map(function (k) { return KEEP[k]; });
    var next = (keywords || []).filter(function (k) { return toRemove.indexOf(k.name) < 0; });
    Object.keys(KEEP).forEach(function (k) {
      if (s[k] && !next.some(function (kw) { return kw.name === KEEP[k]; })) {
        next = next.concat([{ name: KEEP[k], parameters: '', conditions: [], raw: '', sourceLines: [] }]);
      }
    });
    return next;
  }

  /** L81 - DFT/DFTVAL validity check, confirmed against IBM's own DDS
   *  Reference for BOTH keywords (each documents the identical rule from
   *  its own side):
   *  - DFT: "The DFTVAL, EDTCDE, and EDTWRD keywords cannot be specified
   *    with the DFT keyword... The DFT keyword is not valid on floating
   *    point fields."
   *  - DFTVAL: "You cannot specify the DFTVAL keyword on the same field
   *    with a DFT, EDTCDE (Edit Code), or EDTWRD (Edit Word) keyword, or
   *    on a floating-point field."
   *  Both are real DDS compile-time errors, not stylistic preferences, so
   *  `keywordName` (whichever of 'DFT'/'DFTVAL' is about to be turned ON)
   *  is checked against the field's own `dataType` (position 35 - 'F' is
   *  floating point) and its current `keywords` array for the other three
   *  conflicting keyword names. Returns a human-readable reason string if
   *  turning `keywordName` on right now would violate the rule, or null
   *  if it's fine. EDTCDE/EDTWRD's own panel (`editKeywordSectionHtml`)
   *  is a separate, later-loaded picker and is NOT symmetrically guarded
   *  here - out of this task's scope, which is DFT itself; the DFT/DFTVAL
   *  side of the relationship is what this function enforces. */
  var DFT_DFTVAL_CONFLICT_GROUP = ['DFT', 'DFTVAL', 'EDTCDE', 'EDTWRD'];
  function dftGroupConflictReason(keywordName, keywords, dataType) {
    if ((dataType || '').toUpperCase() === 'F') {
      return keywordName + ' is not valid on floating-point fields (per the DDS Reference).';
    }
    var others = DFT_DFTVAL_CONFLICT_GROUP.filter(function (n) { return n !== keywordName; });
    var present = (keywords || [])
      .filter(function (k) { return others.indexOf(k.name) >= 0; })
      .map(function (k) { return k.name; });
    if (present.length) {
      return keywordName + ' cannot be specified together with ' + present.join('/') + ' on the same field (per the DDS Reference).';
    }
    return null;
  }

  /** L83 - DFT's own DDS Reference page also documents, separately from
   *  the DFTVAL/EDTCDE/EDTWRD mutual-exclusion rule L81 already enforces:
   *  "For output-only and input/output fields, you must also specify
   *  PUTOVR at the record level and OVRDTA at the field level with the
   *  DFT keyword." This spans two different keywords at two different
   *  levels (record + field), so it's surfaced as an ADVISORY note next
   *  to the DFT row rather than a hard block like L81's own rule - unlike
   *  DFT/DFTVAL/EDTCDE/EDTWRD (all on the SAME field, all editable from
   *  panels this same commit already has open), blocking here would mean
   *  reaching into and silently requiring a change to a totally different
   *  keyword on a totally different object (the RECORD) from the one
   *  being edited, which felt like more surprise than help for a single
   *  checkbox click. Returns a reminder naming whichever of the two is
   *  currently missing, or null if the field's own usage doesn't require
   *  them (I/H/P are exempt - only O/output and B/both need this) or both
   *  are already present. */
  function dftOutputRequirementNote(usage, fieldKeywords, recordKeywords) {
    var u = (usage || '').toUpperCase();
    if (u !== 'O' && u !== 'B') return null;
    var hasOvrdta = (fieldKeywords || []).some(function (k) { return k.name === 'OVRDTA'; });
    var hasPutovr = (recordKeywords || []).some(function (k) { return k.name === 'PUTOVR'; });
    var missing = [];
    if (!hasPutovr) missing.push('PUTOVR (record level)');
    if (!hasOvrdta) missing.push('OVRDTA (field level)');
    if (!missing.length) return null;
    return 'DFT on an output-capable field also requires ' + missing.join(' and ') + ' (per the DDS Reference).';
  }

  /** Task I-42 - WRDWRAP's own DDS Reference section (now offered at field
   *  level, per the audit's Finding C) states, in one place, everything
   *  that can make it invalid on a given field: (1) "This keyword can only
   *  be specified on fields that have a usage of input-only (I) or
   *  input/output (B)"; (2) "You cannot specify the WRDWRAP keyword on the
   *  following keyboard shifts: Signed Numeric (S), Numeric Only (Y),
   *  Digits Only (D), Numeric Only Character (M), Floating Point (F), DBCS
   *  Only (J), DBCS Open (O), DBCS Either (E), Graphic (G)"; (3) "WRDWRAP
   *  cannot be specified with the following keywords: AUTO(RAZ, RAB),
   *  CHECK(MF, M10F, M11F, RB, RZ, RL, RLTB), CHGINPDFT(MF), DSPATR(OID,
   *  SP), DUP, FLTFIXDEC, IGCALTTYP"; and (4) note 3, "Subfiles do not
   *  support WRDWRAP" (checked here as the literal SFL keyword on the
   *  field's own record, the same test dspmodSflConflictReason uses, so
   *  a subfile detail record's own fields are covered).
   *
   *  Deliberately scoped to keywordName === 'WRDWRAP' (a safe no-op for
   *  every other name), and to the FORWARD direction only - turning
   *  WRDWRAP on while a conflicting keyword is already on the field. The
   *  reverse direction (adding AUTO/CHECK/DUP/etc. to a field that
   *  already carries WRDWRAP) is Task I-58's wrdwrapReverseConflictReason
   *  (raw editor) and wrdwrapNewConflictReason (commitEdit backstop for
   *  every panel), defined just above. Changing the data type or usage of
   *  a field that already carries WRDWRAP (Basic tab Apply) is Task I-61's
   *  wrdwrapBasicEditConflictReason, which shares this function's wording.
   *  Usage/data type are checked here even though the field-level row is
   *  already hidden for them (see generalFieldKeywordRowMatchesDataType/
   *  ...MatchesUsage), so this function is correct on its own for any
   *  future caller. A blank usage or data type is treated as "not yet
   *  set" and never blocks (same fail-open posture as
   *  fieldKeywordCategoryVisibility's own blank-usage branch).
   *  Returns a reason string, or null when WRDWRAP is fine to add. */
  var WRDWRAP_BLOCKED_SHIFTS = ['S', 'Y', 'D', 'M', 'F', 'J', 'O', 'E', 'G'];
  var WRDWRAP_KEYWORD_CONFLICTS = {
    AUTO: ['RAZ', 'RAB'],
    CHECK: ['MF', 'M10F', 'M11F', 'RB', 'RZ', 'RL', 'RLTB'],
    CHGINPDFT: ['MF'],
    DSPATR: ['OID', 'SP'],
    DUP: null,
    FLTFIXDEC: null,
    IGCALTTYP: null,
  };
  /** Task I-58 - shared by both directions: the label ("CHECK(RB)", "DUP")
   *  when ONE keyword instance is on WRDWRAP's own conflict list, else
   *  null. Token-matched (split on whitespace/commas/parens) rather than
   *  substring-matched, so e.g. CHECK(RB) hits but CHECK(AB) doesn't. */
  function wrdwrapKeywordHit(k) {
    return exclusionListHit(WRDWRAP_KEYWORD_CONFLICTS, k);
  }
  /** Task I-71 - the token-matching core of wrdwrapKeywordHit, made generic
   *  so IGCALTTYP's own exclusion list (below) shares it. `list` maps a
   *  keyword NAME to null (any use of it is excluded) or to the array of
   *  parameter tokens that are (a use with none of them is fine). */
  function exclusionListHit(list, k) {
    if (!k || !Object.prototype.hasOwnProperty.call(list, k.name)) return null;
    var bad = list[k.name];
    if (bad === null) return k.name;
    var tokens = String(k.parameters || '').toUpperCase().split(/[\s,()]+/).filter(Boolean);
    var matched = bad.filter(function (b) { return tokens.indexOf(b) >= 0; });
    return matched.length ? k.name + '(' + matched.join(', ') + ')' : null;
  }
  function wrdwrapKeywordHits(keywords) {
    var hits = [];
    (keywords || []).forEach(function (k) {
      var h = wrdwrapKeywordHit(k);
      if (h) hits.push(h);
    });
    return hits;
  }

  /** Task I-58 - the REVERSE direction of wrdwrapFieldConflictReason:
   *  adding one keyword (name + parameters, as typed into the field-level
   *  raw keyword editor's "+ Add keyword") to a field that ALREADY carries
   *  WRDWRAP. Returns a reason string, or null when it's fine to add.
   *  Deliberately a no-op when the field has no WRDWRAP, and for any
   *  keyword not on WRDWRAP's own list. */
  function wrdwrapReverseConflictReason(keywordName, parameters, fieldKeywords) {
    var hasWrdwrap = (fieldKeywords || []).some(function (k) { return k.name === 'WRDWRAP'; });
    if (!hasWrdwrap) return null;
    var hit = wrdwrapKeywordHit({ name: String(keywordName || '').toUpperCase(), parameters: parameters });
    if (!hit) return null;
    return hit + ' cannot be specified on a field that already has WRDWRAP (per the DDS Reference).';
  }

  /** Task I-58 - diff-based backstop for EVERY field-level panel (CHECK's
   *  Keying/Validity codes, CHGINPDFT, DUP, DSPATR's OID/SP, FLTFIXDEC,
   *  IGCALTTYP, the raw editor - all commit through commitEdit's own
   *  keywords update): given the field's keyword list before and after
   *  an edit, returns a reason when the edit INTRODUCES a WRDWRAP
   *  conflict on a field that carries WRDWRAP after the edit. Conflicts
   *  already present before the edit (a hand-written file that was
   *  already invalid) are not re-reported, so unrelated edits to such a
   *  field are never blocked, and turning WRDWRAP itself on is left to
   *  the forward-direction wrdwrapFieldConflictReason. */
  function wrdwrapNewConflictReason(oldKeywords, newKeywords) {
    var hasWrdwrap = (newKeywords || []).some(function (k) { return k.name === 'WRDWRAP'; });
    if (!hasWrdwrap) return null;
    var hadWrdwrap = (oldKeywords || []).some(function (k) { return k.name === 'WRDWRAP'; });
    if (!hadWrdwrap) return null;
    var before = wrdwrapKeywordHits(oldKeywords);
    var added = wrdwrapKeywordHits(newKeywords).filter(function (h) {
      var i = before.indexOf(h);
      if (i >= 0) { before.splice(i, 1); return false; }
      return true;
    });
    if (!added.length) return null;
    return added.join(', ') + ' cannot be specified on a field that already has WRDWRAP (per the DDS Reference).';
  }

  /** Task I-71 - IGCALTTYP's own DDS Reference section: "The following
   *  keywords are not allowed with the IGCALTTYP keyword: AUTO(RAZ), BLKFOLD,
   *  CHECK(M10 M11 M10F M11F RL RZ VN VNE), CMP(EQ GE GT LE LT NE NG NL),
   *  COMP(EQ GE GT LE LT NE NG NL), DUP, RANGE, VALUES." A bidirectional
   *  mutual exclusion on the SAME field, same shape as htmlConflictReason
   *  and I-58's WRDWRAP pair (which already covers IGCALTTYP-vs-WRDWRAP from
   *  WRDWRAP's side - that pair is NOT repeated here).
   *
   *  CMP/COMP list every comparison operator they can take (EQ GE GT LE LT NE
   *  NG NL is the whole set), so any use of them is excluded (null). AUTO is
   *  only excluded with RAZ (AUTO(RAB) is fine) and CHECK only with the eight
   *  codes listed (CHECK(ME), CHECK(AB), CHECK(FE)... are fine). Token-matched,
   *  never substring-matched, exactly as wrdwrapKeywordHit does. */
  var IGCALTTYP_KEYWORD_CONFLICTS = {
    AUTO: ['RAZ'],
    BLKFOLD: null,
    CHECK: ['M10', 'M11', 'M10F', 'M11F', 'RL', 'RZ', 'VN', 'VNE'],
    CMP: null,
    COMP: null,
    DUP: null,
    RANGE: null,
    VALUES: null,
  };
  function igcalttypKeywordHits(keywords) {
    var hits = [];
    (keywords || []).forEach(function (k) {
      var h = exclusionListHit(IGCALTTYP_KEYWORD_CONFLICTS, k);
      if (h) hits.push(h);
    });
    return hits;
  }
  function igcalttypForwardReason(hits) {
    return 'IGCALTTYP is not allowed with ' + hits.join(', ') + ' on the same field (per the DDS Reference).';
  }
  function igcalttypReverseReason(hits) {
    return hits.join(', ') + ' cannot be specified on a field that already has IGCALTTYP (per the DDS Reference).';
  }

  /** Task I-71 - add-time check, BOTH directions, for one keyword being
   *  added (name + parameters, as typed into the raw keyword editor's "+ Add
   *  keyword" or as a General-row checkbox being ticked):
   *   - adding IGCALTTYP to a field that already carries an excluded keyword;
   *   - adding an excluded keyword to a field that already carries IGCALTTYP.
   *  Returns a reason string, or null. A no-op for every other keyword. */
  function igcalttypConflictReason(keywordName, parameters, fieldKeywords) {
    var name = String(keywordName || '').toUpperCase();
    var kws = fieldKeywords || [];
    if (name === 'IGCALTTYP') {
      var hits = igcalttypKeywordHits(kws);
      return hits.length ? igcalttypForwardReason(hits) : null;
    }
    if (!kws.some(function (k) { return k.name === 'IGCALTTYP'; })) return null;
    var hit = exclusionListHit(IGCALTTYP_KEYWORD_CONFLICTS, { name: name, parameters: parameters });
    return hit ? igcalttypReverseReason([hit]) : null;
  }

  /** Task I-71 - diff-based backstop for EVERY field-level panel (Keying
   *  options' CHECK codes, the RANGE/VALUES/CMP/COMP editors, DUP, BLKFOLD,
   *  AUTO, the General rows, the raw editor - all commit through commitEdit's
   *  own keywords update), same shape as wrdwrapNewConflictReason. Given the
   *  field's keyword list before and after an edit, returns a reason when
   *  the edit INTRODUCES a conflict on a field that carries IGCALTTYP after
   *  it:
   *   - IGCALTTYP was not there before: any excluded keyword now on the field
   *     is a conflict this edit created (forward message);
   *   - IGCALTTYP was already there: only an excluded keyword the edit
   *     ADDED counts (reverse message). Conflicts already present before
   *     the edit (a hand-written file that was already invalid) are not
   *     re-reported, so unrelated edits to such a field are never blocked,
   *     and removing IGCALTTYP or the excluded keyword is always allowed. */
  function igcalttypNewConflictReason(oldKeywords, newKeywords) {
    var has = function (kws) { return (kws || []).some(function (k) { return k.name === 'IGCALTTYP'; }); };
    if (!has(newKeywords)) return null;
    var nowHits = igcalttypKeywordHits(newKeywords);
    if (!has(oldKeywords)) return nowHits.length ? igcalttypForwardReason(nowHits) : null;
    var before = igcalttypKeywordHits(oldKeywords);
    var added = nowHits.filter(function (h) {
      var i = before.indexOf(h);
      if (i >= 0) { before.splice(i, 1); return false; }
      return true;
    });
    return added.length ? igcalttypReverseReason(added) : null;
  }

  /** Task I-91 - MSGID's own DDS Reference section: "The following keywords
   *  cannot be specified on a field with the MSGID keyword: DFT, DFTVAL,
   *  FLTFIXDEC, FLTPCN, MSGCON." A bidirectional mutual exclusion on the SAME
   *  field, same shape as I-71's IGCALTTYP pair and htmlConflictReason. None
   *  of the five takes a "which parameters" qualifier - any use of them is
   *  excluded - so this is a plain name set, not a token list. MSGCON only
   *  applies to constants, which cannot carry MSGID, so it is out of practical
   *  reach, but it is on IBM's list and costs nothing here. MSGID may be
   *  specified several times on a field; ONE of them is enough to exclude. */
  var MSGID_EXCLUDED_KEYWORDS = ['DFT', 'DFTVAL', 'FLTFIXDEC', 'FLTPCN', 'MSGCON'];
  function msgidExcludedHits(keywords) {
    var hits = [];
    (keywords || []).forEach(function (k) {
      if (k && MSGID_EXCLUDED_KEYWORDS.indexOf(k.name) >= 0) hits.push(k.name);
    });
    return hits;
  }
  function msgidHasMsgid(keywords) {
    return (keywords || []).some(function (k) { return k && k.name === 'MSGID'; });
  }
  function msgidExclusionForwardReason(hits) {
    return 'MSGID cannot be specified on a field with ' + hits.join(', ') + ' (per the DDS Reference).';
  }
  function msgidExclusionReverseReason(hits) {
    return hits.join(', ') + ' cannot be specified on a field that already has MSGID (per the DDS Reference).';
  }

  /** Task I-91 - add-time check, BOTH directions, for one keyword being added
   *  (as typed into the raw keyword editor's "+ Add keyword" or ticked as a
   *  General row): adding MSGID to a field that carries DFT / DFTVAL /
   *  FLTFIXDEC / FLTPCN / MSGCON, or adding one of those to a field that
   *  already carries MSGID. Returns a reason string, or null. A no-op for
   *  every other keyword. */
  function msgidExclusionConflictReason(keywordName, fieldKeywords) {
    var name = String(keywordName || '').toUpperCase();
    if (name === 'MSGID') {
      var hits = msgidExcludedHits(fieldKeywords);
      return hits.length ? msgidExclusionForwardReason(hits) : null;
    }
    if (MSGID_EXCLUDED_KEYWORDS.indexOf(name) < 0) return null;
    return msgidHasMsgid(fieldKeywords) ? msgidExclusionReverseReason([name]) : null;
  }

  /** Task I-91 - diff-based backstop for every field-level panel (the MSGID
   *  panel itself, the Default value editors, the General rows, the raw
   *  editor - all commit through commitEdit), same shape as I-71's
   *  igcalttypNewConflictReason. If MSGID is on the field after the edit:
   *   - it was NOT there before: any excluded keyword now on the field is a
   *     conflict this edit created (forward message);
   *   - it was already there: only an excluded keyword the edit ADDED counts
   *     (reverse message).
   *  Conflicts already present before the edit (a hand-written field that was
   *  already invalid) are not re-reported, and removing either keyword is
   *  always allowed. */
  function msgidExclusionNewConflictReason(oldKeywords, newKeywords) {
    if (!msgidHasMsgid(newKeywords)) return null;
    var nowHits = msgidExcludedHits(newKeywords);
    if (!msgidHasMsgid(oldKeywords)) return nowHits.length ? msgidExclusionForwardReason(nowHits) : null;
    var before = msgidExcludedHits(oldKeywords);
    var added = nowHits.filter(function (h) {
      var i = before.indexOf(h);
      if (i >= 0) { before.splice(i, 1); return false; }
      return true;
    });
    return added.length ? msgidExclusionReverseReason(added) : null;
  }

  /** Task I-61 - the usage and data-type branches of
   *  wrdwrapFieldConflictReason, pulled out unchanged so the forward check
   *  (turning WRDWRAP on) and wrdwrapBasicEditConflictReason (changing the
   *  type or usage of a field that already carries WRDWRAP) share one
   *  wording. A blank value returns null here (fail-open, "not yet set"). */
  function wrdwrapUsageReason(usage) {
    var u = (usage || '').toUpperCase();
    if (u && u !== 'I' && u !== 'B') {
      return 'WRDWRAP can only be specified on input-only (I) or input/output (B) fields (per the DDS Reference).';
    }
    return null;
  }
  function wrdwrapDataTypeReason(dataType) {
    var dt = (dataType || '').toUpperCase();
    if (dt && WRDWRAP_BLOCKED_SHIFTS.indexOf(dt) >= 0) {
      return 'WRDWRAP cannot be specified on a field with keyboard shift/data type ' + dt + ' (per the DDS Reference: not valid on S, Y, D, M, F, J, O, E, or G).';
    }
    return null;
  }

  /** Task I-61 - a data type or usage CHANGE on a field that ALREADY carries
   *  WRDWRAP (the Basic tab's Apply changes). I-58 covered adding WRDWRAP's
   *  conflicting keywords to such a field; this covers the two other
   *  things the DDS Reference rules out for WRDWRAP - usage other than I/B,
   *  and data type S/Y/D/M/F/J/O/E/G. Returns a reason string, or null.
   *
   *  Diff-based, like I-58's wrdwrapNewConflictReason: only a change TO an
   *  invalid value is blocked, so an unrelated edit (rename, length) on a
   *  hand-written field that is already invalid is never blocked. A blank
   *  usage is the DDS default, which is output (O) - the Basic tab's Usage
   *  select has no blank option and shows O for it - so a blank usage
   *  counts as O on BOTH sides of the comparison. Changing between two
   *  different invalid values is still blocked (the edit does not fix
   *  anything); changing to a valid one, or leaving a value alone, is
   *  never blocked. A field without WRDWRAP is never affected. */
  function wrdwrapBasicEditConflictReason(fieldKeywords, oldDataType, oldUsage, newDataType, newUsage) {
    var hasWrdwrap = (fieldKeywords || []).some(function (k) { return k.name === 'WRDWRAP'; });
    if (!hasWrdwrap) return null;
    var norm = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
    var oldU = norm(oldUsage) || 'O';
    var newU = norm(newUsage) || 'O';
    var oldT = norm(oldDataType);
    var newT = norm(newDataType);
    var reason;
    if (newU !== oldU) {
      reason = wrdwrapUsageReason(newU);
      if (reason) return reason;
    }
    if (newT !== oldT) {
      reason = wrdwrapDataTypeReason(newT);
      if (reason) return reason;
    }
    return null;
  }

  /** Task I-72 - DUP's own DDS Reference section says "You cannot specify the
   *  DUP keyword on a floating-point field (F in position 35)." Both
   *  directions:
   *   A. adding DUP to a field whose data type is F;
   *   B. changing the data type of a field that already carries DUP to F.
   *  (DUP's "Restrictions on validity checking" paragraph says CHECK, COMP,
   *  RANGE and VALUES "can be specified with the DUP keyword" but have no
   *  effect once the Dup key is pressed - that is NOT an exclusion, so
   *  nothing is blocked for it.)
   *
   *  oldField is the field as stored ({ dataType, keywords }); updates
   *  carries only what is being written ({ dataType, keywords } - a key that
   *  is absent counts as unchanged). Returns a reason string when the edit
   *  INTRODUCES the violation, else null.
   *
   *  Diff-based, like I-58's wrdwrapNewConflictReason and I-61 / I-62's Basic
   *  tab checks, and meant for the same two call sites: commitEdit, the one
   *  choke point every field-level write goes through (the Input keywords
   *  checkbox, the raw keyword editor, the Basic tab), plus the Basic tab's
   *  Apply handler as an early return so the panel keeps the user's other
   *  pending edits. A field that was ALREADY floating-point with DUP (a
   *  hand-written file) is not re-reported, so unrelated edits to it are
   *  never blocked, and fixing it (removing DUP, or changing the data type)
   *  is always allowed. */
  function dupFloatNewConflictReason(oldField, updates) {
    var o = oldField || {};
    var u = updates || {};
    var has = function (kws) { return (kws || []).some(function (k) { return k.name === 'DUP'; }); };
    var norm = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
    var owns = function (key) { return Object.prototype.hasOwnProperty.call(u, key); };
    var newDataType = owns('dataType') ? norm(u.dataType) : norm(o.dataType);
    var newKeywords = owns('keywords') ? u.keywords : o.keywords;
    if (newDataType !== 'F' || !has(newKeywords)) return null;
    // The field ends up floating-point with DUP; only blame this edit if it introduced that.
    if (norm(o.dataType) === 'F' && has(o.keywords)) return null;
    if (!has(o.keywords)) {
      return 'DUP cannot be specified on a floating-point field (F in position 35, per the DDS Reference) - change the data type first.';
    }
    return 'The data type cannot be changed to F (floating point) while the field carries DUP - DUP cannot be specified on a floating-point field (per the DDS Reference). Remove DUP first.';
  }

  /** Task I-82 - BLKFOLD's own DDS Reference section says "You cannot
   *  specify the BLKFOLD keyword on a floating-point field (F in position
   *  35)." I-39's dtScope gating ('non-float') already keeps the row from
   *  being offered on a float field, so this is the "belt and suspenders"
   *  half: a field whose data type is changed to F AFTER BLKFOLD is set
   *  (the Basic tab), or BLKFOLD typed into the raw editor on an existing
   *  float field. Exact same shape as I-72's dupFloatNewConflictReason
   *  just above - same oldField/updates contract, same diff-based
   *  (only an edit that INTRODUCES the violation is blocked; an
   *  already-invalid hand-written field is not re-reported and can always
   *  be fixed), same two call sites (commitEdit, plus the Basic tab's
   *  Apply as an early return). */
  function blkfoldFloatNewConflictReason(oldField, updates) {
    var o = oldField || {};
    var u = updates || {};
    var has = function (kws) { return (kws || []).some(function (k) { return k.name === 'BLKFOLD'; }); };
    var norm = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
    var owns = function (key) { return Object.prototype.hasOwnProperty.call(u, key); };
    var newDataType = owns('dataType') ? norm(u.dataType) : norm(o.dataType);
    var newKeywords = owns('keywords') ? u.keywords : o.keywords;
    if (newDataType !== 'F' || !has(newKeywords)) return null;
    // The field ends up floating-point with BLKFOLD; only blame this edit if it introduced that.
    if (norm(o.dataType) === 'F' && has(o.keywords)) return null;
    if (!has(o.keywords)) {
      return 'BLKFOLD cannot be specified on a floating-point field (F in position 35, per the DDS Reference) - change the data type first.';
    }
    return 'The data type cannot be changed to F (floating point) while the field carries BLKFOLD - BLKFOLD cannot be specified on a floating-point field (per the DDS Reference). Remove BLKFOLD first.';
  }

  function wrdwrapFieldConflictReason(keywordName, fieldKeywords, dataType, usage, recordKeywords) {
    if (keywordName !== 'WRDWRAP') return null;
    var usageReason = wrdwrapUsageReason(usage);
    if (usageReason) return usageReason;
    var dataTypeReason = wrdwrapDataTypeReason(dataType);
    if (dataTypeReason) return dataTypeReason;
    if ((recordKeywords || []).some(function (k) { return k.name === 'SFL'; })) {
      return 'WRDWRAP is not supported on subfile (SFL) record fields (per the DDS Reference).';
    }
    var hits = wrdwrapKeywordHits(fieldKeywords);
    if (hits.length) {
      return 'WRDWRAP cannot be specified together with ' + hits.join(', ') + ' on the same field (per the DDS Reference).';
    }
    return null;
  }

  /** Task I-11 - SFLNXTCHG vs SFLMSGRCD, both record-level keywords on the
   *  subfile (SFL) detail record format. The DDS Reference documents these
   *  as two DIFFERENT keyword sets for the same record format - "for
   *  message subfiles: SFLMSGRCD/SFLMSGKEY/SFLPGMQ" vs "for all other
   *  subfiles (at the record level): CHANGE/CHECK(AB)/CHECK(RL)/
   *  CHGINPDFT/INDTXT/KEEP/LOGINP/LOGOUT/SETOF/SETOFF/SFLNXTCHG/TEXT" - and
   *  separately states outright, under SFLNXTCHG's own note: "You cannot
   *  specify SFLNXTCHG with the SFLMSGRCD keyword." That's the one
   *  explicit, unambiguous prohibition in this pair of lists (the rest are
   *  only implied by the "for X / for all other Y" framing, not each
   *  individually restated the way SFLNXTCHG is), so only SFLNXTCHG is
   *  hard-blocked here - Task I-23 verified the remaining ~10 keywords
   *  (TEXT included - the "for all other subfiles" list has 11 entries,
   *  not the ~9 the original I-11 audit estimated) and found NONE of them
   *  carry an individual "cannot specify" statement anywhere in the DDS
   *  Reference, so none of them get a hard-block guard - see
   *  loginpLogoutSflMsgRcdIgnoredNote below for the one advisory-level
   *  finding I-23 DID confirm, and keywordFixes.md's I-23 section for the
   *  full per-keyword audit trail. Real SDA's own "Select General
   *  Keywords" screen for a message-subfile record still offers
   *  SFLNXTCHG unconditionally (this audit's own screenshot evidence) - it
   *  relies on CRTDSPF's own compile error rather than blocking data
   *  entry - but this project's own established precedent (L81, S36-4) is
   *  to hard-block real DDS compile errors the reference explicitly
   *  documents, even where real SDA lets them through. Returns a reason
   *  string if turning SFLNXTCHG on (or SFLMSGRCD on, checked from the
   *  other side) would violate the rule, or null if fine. */
  function sflNxtchgSflMsgRcdConflictReason(keywordName, recordKeywords) {
    var other = keywordName === 'SFLNXTCHG' ? 'SFLMSGRCD' : 'SFLNXTCHG';
    var hasOther = (recordKeywords || []).some(function (k) { return k.name === other; });
    if (!hasOther) return null;
    return keywordName + ' cannot be specified together with ' + other + ' on the same subfile record (per the DDS Reference).';
  }

  /** Task I-23 - of the ~10 other keywords in the same "for all other
   *  subfiles" list SFLNXTCHG appears in (see
   *  sflNxtchgSflMsgRcdConflictReason's own doc comment just above), only
   *  LOGINP and LOGOUT individually restate anything about message
   *  subfiles in their OWN dedicated DDS Reference sections - and it's
   *  NOT a "cannot specify" prohibition like SFLNXTCHG's: "The IBM i
   *  operating system ignores LOGINP/LOGOUT for... The record format is a
   *  subfile record format for a message subfile." That's a documented
   *  no-effect condition, not a compile error, so this is advisory-only
   *  (matches mnubarFieldShapeNote's own non-blocking precedent) rather
   *  than a hard block via sflNxtchgSflMsgRcdConflictReason's shape.
   *  Everything else in that list was individually checked and ruled out
   *  during I-23's audit: TEXT's own section explicitly says it's "valid
   *  for any record format ... except a SFLMSGKEY or SFLPGMQ field" (so
   *  explicitly NOT restricted here); KEEP's own "cannot be specified
   *  with" list is ALWROL/CLRL/SLNO only, pointedly not SFLMSGRCD; CHANGE/
   *  CHECK(AB)/CHECK(RL)/CHGINPDFT/SETOF all key off an input-capable
   *  field or an input operation, which a message-subfile record
   *  structurally lacks (SFL's own text: "At least one displayable field
   *  must be specified ... unless the subfile is a message subfile"), but
   *  none of those five keywords' own sections restate that as an
   *  explicit rule the way LOGINP/LOGOUT do, so this task deliberately
   *  does NOT add a guessed-at note for them - see keywordFixes.md's I-23
   *  section for the full per-keyword citations. Returns an advisory
   *  string when `keywordName` (LOGINP or LOGOUT) is on and the same
   *  record already has SFLMSGRCD, or null otherwise. */
  function loginpLogoutSflMsgRcdIgnoredNote(keywordName, recordKeywords) {
    if (keywordName !== 'LOGINP' && keywordName !== 'LOGOUT') return null;
    var hasSflMsgRcd = (recordKeywords || []).some(function (k) { return k.name === 'SFLMSGRCD'; });
    if (!hasSflMsgRcd) return null;
    return keywordName + ' is ignored by the IBM i operating system on a message-subfile record format (SFLMSGRCD present) - per the DDS Reference.';
  }

  /** Task I-8 - USRDFN record-level keyword audit. Checking every keyword
   *  in USRDFN's own narrowed General/Help/Print subset (see
   *  isUsrDfnRecord's own doc comment in webviewClientHelpers.js) against
   *  the DDS Reference's own text turned up four - and only four -
   *  keywords individually documented as incompatible with a user-defined
   *  (USRDFN keyword) record format:
   *  - ALWROL: "The ALWROL keyword cannot be specified with any of the
   *    following keywords: ASSUME, KEEP, SFL, SFLCTL, USRDFN"
   *  - ASSUME: "This keyword cannot be specified with any of the following
   *    keywords: ALWROL, CLRL, SFL, SLNO, USRDFN, USRDSPMGT"
   *  - HLPSEQ: "You cannot specify HLPSEQ on subfile (SFL keyword) or
   *    user-defined (USRDFN keyword) record formats."
   *  - HLPCMDKEY: "You cannot specify HLPCMDKEY on subfile (SFL keyword),
   *    subfile control (SFLCTL keyword), or user-defined (USRDFN keyword)
   *    record formats."
   *  Every other keyword in the same three panels (INZRCD, KEEP, RETKEY,
   *  RETCMDKEY, CHGINPDFT, MNUBARDSP, ENTFLDATR, RTNCSRLOC, TEXT, ALTNAME,
   *  HLPCLR, HLPTITLE, PRINT) was checked the same way and has no such
   *  statement anywhere in its own DDS Reference section - left alone
   *  rather than guessed at, same as I-4/I-6/I-11's own open questions.
   *  HLPCLR is confirmed correct rather than just absent of a prohibition:
   *  its own DDS Reference example literally shows `R RECORD1 USRDFN`
   *  immediately followed by `HLPCLR` on the next line.
   *  Unlike I-11's SFLNXTCHG/SFLMSGRCD pair (two keywords either one of
   *  which can be independently toggled on the same record), USRDFN is
   *  the record-type identifier itself (see isUsrDfnRecord's own doc
   *  comment) - the "+ Add record" wizard writes it once at creation and
   *  nothing in this UI ever removes it, so this is a one-directional
   *  check: is USRDFN already on this record's keywords right now.
   *  Returns a reason string if turning `keywordName` on would violate
   *  the rule, or null if fine. Same alert+revert idiom as L81/I-11 -
   *  turning any of these four OFF is never blocked, only the
   *  on-transition (covers the edge case of hand-edited DDS that already
   *  has one of them set on a USRDFN record before iSDA opened it). */
  function usrdfnConflictReason(keywordName, recordKeywords) {
    var hasUsrdfn = (recordKeywords || []).some(function (k) { return k.name === 'USRDFN'; });
    if (!hasUsrdfn) return null;
    return keywordName + ' cannot be specified on a user-defined (USRDFN) record format (per the DDS Reference).';
  }

  /** Task I-49 - the strict USRDFN whitelist itself. USRDFN's own DDS
   *  Reference text (quoted in usrdfnConflictReason's own doc comment
   *  above and I-44's keywordFixes.md row) is a WHITELIST: "No file- or
   *  record-level keywords apply to this record except INVITE, KEEP,
   *  PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT." Every
   *  existing USRDFN guard - usrdfnConflictReason above (ASSUME/ALWROL/
   *  HLPSEQ/HLPCMDKEY) and I-44's 29 record-level keywords wired through
   *  wireUsrdfnGuardedFlag/wireUsrdfnGuardedTwoField/
   *  wirePulldownGuardedFlag - only ever fires for ONE specific,
   *  individually-confirmed-not-whitelisted keyword per call site; none
   *  of them actually consult the whitelist text itself.
   *  This is the general case I-49 found missing: the Advanced/raw
   *  keywords accordion (keywordEditorHtml/wireKeywordEditor) lets the
   *  user add literally ANY keyword by name, to any entity including a
   *  record, and isn't wired through any of the above at all. Given
   *  `keywordName` (already uppercased by wireKeywordEditor's own add
   *  handler) and the target record's current keywords, returns a reason
   *  string if the record is USRDFN and `keywordName` is not on the
   *  whitelist, or null otherwise (record isn't USRDFN, or the keyword
   *  IS whitelisted). USRDFN itself is always allowed - it's the
   *  record-type identifier and is already present by definition
   *  whenever this returns non-null for anything else. Per USRDFN's own
   *  text, HELP/HLPRTN/INVITE only count towards the whitelist when
   *  added directly to this record (not at the file level) - this
   *  function only ever sees record-level adds (the raw editor's
   *  file-level call site never passes a guard, see I-49's
   *  keywordFixes.md row), so that distinction doesn't need re-checking
   *  here. */
  var USRDFN_WHITELIST_KEYWORDS = [
    'INVITE', 'KEEP', 'PASSRCD', 'HLPRTN', 'HELP', 'HLPCLR', 'PRINT',
    'OPENPRT', 'TEXT', 'USRDFN'
  ];
  function usrdfnWhitelistConflictReason(keywordName, recordKeywords) {
    var hasUsrdfn = (recordKeywords || []).some(function (k) { return k.name === 'USRDFN'; });
    if (!hasUsrdfn) return null;
    if (USRDFN_WHITELIST_KEYWORDS.indexOf(keywordName) !== -1) return null;
    return keywordName + ' cannot be added to a user-defined (USRDFN) record format - only INVITE, KEEP, PASSRCD, HLPRTN, HELP, HLPCLR, PRINT, OPENPRT, and TEXT are allowed (per the DDS Reference).';
  }

  /** Task I-46 - re-read SFL's and SFLCTL's own DDS Reference sections
   *  fresh (split off from I-44's original USRDFN finding, to check
   *  whether the same class of blanket-whitelist restriction applies to
   *  either). Findings:
   *
   *  SFL's own section states outright: "Besides SFL, the following
   *  keywords are also valid on the subfile record format:" followed by
   *  two MUTUALLY EXCLUSIVE lists depending on whether the record is a
   *  message subfile - "For message subfiles: SFLMSGRCD (required at the
   *  record level), SFLMSGKEY (required at the field level), SFLPGMQ" vs
   *  "For all other subfiles (at the record level): CHANGE, LOGINP,
   *  CHECK(AB), CHECK(RL), LOGOUT, SETOF, CHGINPDFT, SETOFF, INDTXT,
   *  SFLNXTCHG, KEEP, TEXT". This is the exact same shape as USRDFN's own
   *  "except" whitelist above, just phrased additively ("also valid")
   *  rather than exclusively ("except") - an enumerated closed list with
   *  no matching "anything else is fine too" language anywhere in the
   *  section. (SFLMSGKEY/SFLPGMQ are field-level, not record-level, so
   *  they don't belong in this record-level whitelist at all; isSflRecord
   *  in webviewClientHelpers.js already excludes SFLMSG records from what
   *  this function treats as a plain SFL record, mirroring that split.)
   *
   *  SFLCTL's own section, in contrast, introduces its Required/Optional
   *  keyword tables with "The following tables are a SUMMARY OF SUBFILE
   *  KEYWORDS used with the SFLCTL keyword" - explicitly scoped to
   *  SFL-family keywords, not a claim that every other ordinary DDS
   *  keyword (COLOR, DSPATR, TEXT, BLINK, etc.) is disallowed. The only
   *  individual restriction SFLCTL's own text states outright - "The
   *  USRDFN keyword is not valid for the subfile-control record format" -
   *  is already structurally unreachable through this UI: USRDFN and
   *  SFL/SFLCTL are each their own record TYPE the "+ Add record" wizard
   *  picks exactly once at creation (RECORD_TYPES in
   *  webviewClientHelpers.js), so a record can never carry both. SFLCTL
   *  needs no new guard from this task.
   *
   *  This function covers the SFL side only, for the record-level "raw
   *  keyword editor" (keywordEditorHtml/wireKeywordEditor) - the same
   *  general-purpose catch-all I-49 built usrdfnWhitelistConflictReason
   *  above for, and wired the same way (see buildWebviewTemplate.js's own
   *  wireKeywordEditor call site). An exhaustive sweep of every
   *  structured-checkbox row across the General/Indicator/Output/Input/
   *  Overlay/Print tabs (the way I-44 individually rewired 29 USRDFN
   *  call sites through wireUsrdfnGuardedFlag) is a separate, much larger
   *  undertaking - logged as its own follow-up (I-52) rather than
   *  attempted here, same "audit finds it, a separate task wires the
   *  exhaustive per-checkbox sweep" split I-44/I-49 themselves went
   *  through. */
  var SFL_RECORD_WHITELIST_KEYWORDS = [
    'SFL', 'CHANGE', 'LOGINP', 'CHECK', 'LOGOUT', 'SETOF', 'SETOFF',
    'CHGINPDFT', 'INDTXT', 'SFLNXTCHG', 'KEEP', 'TEXT'
  ];
  function sflWhitelistConflictReason(keywordName, recordKeywords) {
    var kws = recordKeywords || [];
    var hasSfl = kws.some(function (k) { return k.name === 'SFL'; });
    if (!hasSfl) return null;
    var hasSflMsgRcd = kws.some(function (k) { return k.name === 'SFLMSGRCD'; });
    if (hasSflMsgRcd) {
      if (keywordName === 'SFL' || keywordName === 'SFLMSGRCD') return null;
      return keywordName + ' cannot be added to a message-subfile (SFL + SFLMSGRCD) record format - only SFLMSGRCD is allowed besides SFL itself (per the DDS Reference).';
    }
    if (SFL_RECORD_WHITELIST_KEYWORDS.indexOf(keywordName) !== -1) return null;
    return keywordName + ' cannot be added to a subfile (SFL) record format - only CHANGE, LOGINP, CHECK, LOGOUT, SETOF/SETOFF, CHGINPDFT, INDTXT, SFLNXTCHG, KEEP, and TEXT are allowed besides SFL itself (per the DDS Reference).';
  }

  /** Task I-13 - PULLDOWN record-level keyword audit. The PULLDOWN
   *  keyword's own DDS Reference section states directly, right in its
   *  own text: "The following keywords cannot be specified on a record
   *  with the PULLDOWN keyword:" followed by this exact 27-keyword list:
   *  ALARM, ALTNAME, ALWGPH, ALWROL, ASSUME, CLEAR, CLRL, ERASE,
   *  ERASEINP, FRCDTA, HLPCLR, HLPSEQ, INVITE, INZRCD, MDTOFF, MNUBAR,
   *  OVERLAY, OVRATR, OVRDTA, PUTOVR, PUTRETAIN, RTNDTA, SFL, SLNO,
   *  USRDFN, WDWTITLE, WINDOW.
   *  Unlike I-8's USRDFN case (a record-type identifier written once by
   *  the "+ Add record" wizard and never removed by this UI, making the
   *  check one-directional), PULLDOWN is itself toggled on/off
   *  interactively from the Record Properties "Pull-down" tab's own
   *  checkbox (see wirePulldownPanels/pulldownPanelsHtml), so this check
   *  is bidirectional: turning PULLDOWN on while any of these 27 is
   *  already present is blocked, and turning any of these 27 on while
   *  PULLDOWN is already present is blocked. Same alert+revert idiom as
   *  I-8/I-11 - turning any of them OFF (including PULLDOWN itself) is
   *  never blocked, only the on-transition.
   *  Of the 27, MNUBAR/SFL/USRDFN are themselves OTHER record-type
   *  identifiers (gated by their own tabs/wizards, not by a checkbox on
   *  this shared RECORD panel) and WINDOW/WDWTITLE belong to I-12's own
   *  Window tab (explicitly out of THIS task's own scope per its
   *  keywordFixes.md row) - all five are still included below so
   *  PULLDOWN's own "on" checkbox is guarded against all 27; only the
   *  remaining 22 (which do live on the shared RECORD panel I-7 built)
   *  get their own individual keyword-side guard wired in
   *  webviewClientHelpers.js. CLEAR is part of the repeatable Indicator-
   *  instance model (Task L5d) - flagged, not wired this task, same
   *  "shared component would need to be made kind-aware" deferral I-7
   *  already took for VLDCMDKEY/SETOF/CHANGE. */
  var PULLDOWN_CONFLICT_KEYWORDS = [
    'ALARM', 'ALTNAME', 'ALWGPH', 'ALWROL', 'ASSUME', 'CLEAR', 'CLRL',
    'ERASE', 'ERASEINP', 'FRCDTA', 'HLPCLR', 'HLPSEQ', 'INVITE', 'INZRCD',
    'MDTOFF', 'MNUBAR', 'OVERLAY', 'OVRATR', 'OVRDTA', 'PUTOVR',
    'PUTRETAIN', 'RTNDTA', 'SFL', 'SLNO', 'USRDFN', 'WDWTITLE', 'WINDOW'
  ];
  function pulldownConflictReason(keywordName, recordKeywords) {
    var kws = recordKeywords || [];
    if (keywordName === 'PULLDOWN') {
      var found = kws.find(function (k) { return PULLDOWN_CONFLICT_KEYWORDS.indexOf(k.name) >= 0; });
      if (!found) return null;
      return 'PULLDOWN cannot be specified on a record that already has ' + found.name + ' (per the DDS Reference).';
    }
    if (PULLDOWN_CONFLICT_KEYWORDS.indexOf(keywordName) < 0) return null;
    var hasPulldown = kws.some(function (k) { return k.name === 'PULLDOWN'; });
    if (!hasPulldown) return null;
    return keywordName + ' cannot be specified on a record with the PULLDOWN keyword (per the DDS Reference).';
  }

  /** Task I-12 - WINDOW record-level keyword audit. WINDOW's own DDS
   *  Reference section states outright: "The WINDOW keyword is not
   *  allowed on a record format that has any one of the following
   *  keywords specified: ALWROL, ASSUME, MNUBAR, PULLDOWN, SFL, USRDFN."
   *  Of these six, MNUBAR/PULLDOWN/SFL/USRDFN are each their own record
   *  TYPE the "+ Add record" wizard picks once at creation time (see
   *  RECORD_TYPES in webviewClientHelpers.js) - WINDOW is never addable
   *  to an already-existing record of one of those types through this
   *  UI (the Window tab/Apply button only ever appears for a record that
   *  already carries WINDOW - see isWindowRecord), so there's no
   *  reachable on-transition to guard for that half. ALWROL and ASSUME,
   *  though, are plain toggles on the base Record Keywords -> General
   *  tab (I-7's own set), reused unchanged for WINDOW records - turning
   *  either ON while WINDOW is already present is a genuinely reachable,
   *  previously-unguarded on-transition that would produce invalid DDS.
   *  Same one-directional "hard-block only the on-transition" posture as
   *  I-8's usrdfnConflictReason above (and same reasoning: WINDOW itself
   *  is only ever written by the record-creation wizard, never toggled
   *  through this function, so there's no reverse direction to check
   *  here either) - turning ALWROL/ASSUME back off is never blocked,
   *  which also covers hand-edited DDS that already combines them with
   *  WINDOW before iSDA opened the file.
   *  MNUBAR/PULLDOWN/SFL/USRDFN are deliberately NOT re-checked here even
   *  though WINDOW's own text names them too - each already has its own
   *  record-type identity keyword written once at creation (verbatim
   *  the same reasoning USRDFN's own guard above gives for why it's a
   *  one-directional check), and none of them exposes an on/off toggle
   *  a WINDOW record could flip after the fact. */
  function windowConflictReason(keywordName, recordKeywords) {
    var hasWindow = (recordKeywords || []).some(function (k) { return k.name === 'WINDOW'; });
    if (!hasWindow) return null;
    return keywordName + ' cannot be specified on a record format that also has the WINDOW keyword (per the DDS Reference).';
  }

  /** Task I-47 - re-read WINDOW's own DDS Reference section the same way
   *  I-44 re-read USRDFN's. Findings: WINDOW's own text names SIX
   *  keywords a record format can't also carry - ALWROL and ASSUME
   *  (already individually known via windowConflictReason above, wired
   *  through wireUsrdfnGuardedFlag's checkbox path) plus THREE not
   *  previously cross-checked against WINDOW anywhere in this codebase:
   *  MNUBAR, PULLDOWN, and SFL (USRDFN was already indirectly covered -
   *  see below). No broader whitelist shape here (unlike USRDFN/SFL's
   *  own sections) - just this one closed six-keyword exclusion list,
   *  the same shape windowConflictReason/usrdfnConflictReason already
   *  use, just parametrized over BOTH directions instead of one.
   *  (Also confirmed, not a code change: "WINDOW is allowed on a record
   *  with the SFLCTL keyword" is an explicit exception, so SFLCTL is
   *  deliberately excluded from this list; WINDOW's own PASSRCD
   *  restriction was already fixed by I-24; the ERRSFL/MSGLOC-"ignored"
   *  and WDWBORDER-parameter-shape notes in the same section are
   *  informational precedence/formatting guidance, not "cannot specify
   *  together" rules - nothing to enforce there.)
   *  The reachability gap: WINDOW, MNUBAR, PULLDOWN, SFL, and USRDFN are
   *  each their own record TYPE the "+ Add record" wizard picks exactly
   *  once (RECORD_TYPES in webviewClientHelpers.js - see
   *  usrdfnWhitelistConflictReason's own doc comment for the identical
   *  point made about USRDFN/SFL/SFLCTL), so the wizard itself can never
   *  create a record combining two of them - only the raw/Advanced
   *  keyword editor (keywordEditorHtml/wireKeywordEditor, the same
   *  bypass I-49 and I-46 each closed for USRDFN's and SFL's own
   *  whitelists) can. USRDFN and SFL are ALREADY indirectly blocked in
   *  the WINDOW-has-them-add-it direction, because WINDOW isn't on
   *  either one's own whitelist (usrdfnWhitelistConflictReason/
   *  sflWhitelistConflictReason both already fire for `WINDOW` on a
   *  USRDFN/SFL record) - but nothing existing catches MNUBAR/PULLDOWN
   *  in that direction, and NOTHING existing catches the REVERSE
   *  direction for any of the six (raw-adding WINDOW itself to a record
   *  that already has ALWROL/ASSUME/MNUBAR/PULLDOWN/SFL/USRDFN).
   *  This function is the general, bidirectional case: given `keywordName`
   *  being added and the record's current keywords, returns a reason if
   *  the add would create the forbidden mix in EITHER direction (record
   *  already has WINDOW and keywordName is one of the six; or record
   *  already has one of the six and keywordName is WINDOW), or null
   *  otherwise. Wired only into the record-level raw keyword editor's
   *  addGuardFn chain (buildWebviewTemplate.js), alongside the USRDFN/
   *  SFL whitelist checks - windowConflictReason's own two existing
   *  checkbox call sites (ASSUME/ALWROL) are untouched. */
  var WINDOW_MUTEX_KEYWORDS = ['ALWROL', 'ASSUME', 'MNUBAR', 'PULLDOWN', 'SFL', 'USRDFN'];
  function windowMutexConflictReason(keywordName, recordKeywords) {
    var keywords = recordKeywords || [];
    var hasWindow = keywords.some(function (k) { return k.name === 'WINDOW'; });
    if (hasWindow && WINDOW_MUTEX_KEYWORDS.indexOf(keywordName) !== -1) {
      return keywordName + ' cannot be specified on a record format that also has the WINDOW keyword (per the DDS Reference).';
    }
    if (keywordName === 'WINDOW') {
      var conflict = keywords.find(function (k) { return WINDOW_MUTEX_KEYWORDS.indexOf(k.name) !== -1; });
      if (conflict) {
        return 'WINDOW cannot be specified on a record format that also has the ' + conflict.name + ' keyword (per the DDS Reference).';
      }
    }
    return null;
  }

  /** Task I-48 - re-read MNUBAR's own DDS Reference section the same way
   *  I-44/I-46/I-47 re-read USRDFN's/SFL's/WINDOW's. Finding: MNUBAR's
   *  own section states outright, in the exact same closed-whitelist
   *  shape as USRDFN's/SFL's own text: "The following keywords are
   *  allowed on a record containing the MNUBAR keyword:" followed by a
   *  27-entry table - CAnn, CFnn, CLEAR, CLRL, CSRLOC, DSPMOD, HELP,
   *  HLPCLR, HLPCMDKEY, HLPRTN, HLPTITLE, HOME, INDTXT, INVITE, KEEP,
   *  LOCK, MNUBARDSP, MNUBARSEP, MNUBARSW, MNUCNL, OVERLAY, PAGEDOWN/
   *  PAGEUP, PRINT, PROTECT, ROLLUP/ROLLDOWN, TEXT, UNLOCK, VLDCMDKEY -
   *  with no matching "anything else is fine too" language anywhere in
   *  the section (same closed-list shape as USRDFN's/SFL's own "except"/
   *  "also valid" text, just introduced as "allowed" instead).
   *  MNUBAR's own record-composition rule (exactly one menu-bar field,
   *  no other displayable fields) was already fixed by I-19
   *  (mnubarFieldShapeNote above) and is out of this task's own scope -
   *  this function covers the separate keyword-whitelist restriction
   *  only, which had NO existing guard of any kind before this task:
   *  isMnuBarRecord only drives whether the MNUBAR tab itself is shown
   *  (unlike isUsrDfnRecord's own Task R2 narrowing), so a MNUBAR
   *  record's other tabs (Indicator/Output/Input/Overlay) render the
   *  full, unfiltered set, and the record-level raw keyword editor
   *  (keywordEditorHtml/wireKeywordEditor) has no guard for it either.
   *  CAnn/CFnn are represented in this codebase's own model as literal
   *  keyword names CA01..CA24/CF01..CF24 (see DspfWriter.parseCommandKeys'
   *  own comment), not as a single "CA"/"CF" name with a parameter, so
   *  they're matched here by pattern rather than being spelled out
   *  individually in the whitelist array; PAGEDOWN/ROLLUP and PAGEUP/
   *  ROLLDOWN are DDS synonym pairs for the same two keywords (not four
   *  distinct ones), both forms included since either spelling is valid
   *  DDS. This function covers the record-level raw keyword editor only -
   *  the same general-purpose catch-all I-49/I-46/I-47 each built their
   *  own whitelist/mutex function for, wired the same way (see
   *  buildWebviewTemplate.js's own wireKeywordEditor call site). An
   *  exhaustive sweep of the structured per-keyword checkboxes across the
   *  General/Indicator/Output/Input/Overlay/Print tabs (the same "much
   *  larger undertaking" I-46 split off as I-53 for SFL's own whitelist)
   *  is logged separately as I-54, not attempted here. */
  var MNUBAR_WHITELIST_KEYWORDS = [
    'CLEAR', 'CLRL', 'CSRLOC', 'DSPMOD', 'HELP', 'HLPCLR', 'HLPCMDKEY',
    'HLPRTN', 'HLPTITLE', 'HOME', 'INDTXT', 'INVITE', 'KEEP', 'LOCK',
    'MNUBARDSP', 'MNUBARSEP', 'MNUBARSW', 'MNUCNL', 'OVERLAY', 'PAGEDOWN',
    'PAGEUP', 'PRINT', 'PROTECT', 'ROLLUP', 'ROLLDOWN', 'TEXT', 'UNLOCK',
    'VLDCMDKEY', 'MNUBAR'
  ];
  function mnubarWhitelistConflictReason(keywordName, recordKeywords) {
    var hasMnubar = (recordKeywords || []).some(function (k) { return k.name === 'MNUBAR'; });
    if (!hasMnubar) return null;
    if (MNUBAR_WHITELIST_KEYWORDS.indexOf(keywordName) !== -1) return null;
    if (/^CA\d{2}$/.test(keywordName) || /^CF\d{2}$/.test(keywordName)) return null;
    return keywordName + ' cannot be added to a menu-bar (MNUBAR) record format - only CAnn/CFnn, CLEAR, CLRL, CSRLOC, DSPMOD, HELP, HLPCLR, HLPCMDKEY, HLPRTN, HLPTITLE, HOME, INDTXT, INVITE, KEEP, LOCK, MNUBARDSP, MNUBARSEP, MNUBARSW, MNUCNL, OVERLAY, PAGEDOWN/PAGEUP, PRINT, PROTECT, ROLLUP/ROLLDOWN, TEXT, UNLOCK, and VLDCMDKEY are allowed (per the DDS Reference).';
  }

  /** Task I-41 - HTML's own DDS Reference section states two restrictions:
   *  (1) "The following keywords are not allowed with the HTML keyword:"
   *  COLOR, DATE, DFT, DSPATR, EDTCDE, EDTWRD, HLPID, MSGCON, NOCCSID,
   *  OVRATR, PUTRETAIN, SYSNAME, TIME, USER - a bidirectional mutual
   *  exclusion on the SAME field, same shape as `windowMutexConflictReason`
   *  above (a closed list, not a whitelist); (2) "The HTML keyword is not
   *  allowed in a field of a subfile record" - a same-RECORD check against
   *  the literal SFL keyword, same shape as `dspmodSflConflictReason`
   *  above. `recordKeywords` is optional (omit when the owning record
   *  isn't known/relevant, e.g. a brand-new field being created from
   *  scratch that can't yet be on an SFL record) - the SFL check is
   *  simply skipped when it's not supplied, matching every other
   *  optional-context-arg guard in this file. */
  var HTML_MUTUAL_EXCLUSION_KEYWORDS = [
    'COLOR', 'DATE', 'DFT', 'DSPATR', 'EDTCDE', 'EDTWRD', 'HLPID',
    'MSGCON', 'NOCCSID', 'OVRATR', 'PUTRETAIN', 'SYSNAME', 'TIME', 'USER'
  ];
  function htmlConflictReason(keywordName, fieldKeywords, recordKeywords) {
    var kws = fieldKeywords || [];
    if (keywordName === 'HTML') {
      var hasSfl = (recordKeywords || []).some(function (k) { return k.name === 'SFL'; });
      if (hasSfl) return 'HTML is not allowed in a field of a subfile (SFL) record (per the DDS Reference).';
      var conflict = kws.find(function (k) { return HTML_MUTUAL_EXCLUSION_KEYWORDS.indexOf(k.name) !== -1; });
      if (conflict) return 'HTML is not allowed with the ' + conflict.name + ' keyword on the same field (per the DDS Reference).';
      return null;
    }
    if (HTML_MUTUAL_EXCLUSION_KEYWORDS.indexOf(keywordName) !== -1) {
      var hasHtml = kws.some(function (k) { return k.name === 'HTML'; });
      if (hasHtml) return keywordName + ' is not allowed with the HTML keyword on the same field (per the DDS Reference).';
    }
    return null;
  }

  // -----------------------------------------------------------------------
  // Task I-57 - PSHBTNFLD / PSHBTNCHC (push-button field). Both are
  // field-level keywords; a field carrying PSHBTNFLD must also carry one or
  // more PSHBTNCHC (the choices), and the two are structurally a sibling of
  // the SNGCHCFLD/CHOICE pair above - but with three real differences that
  // stop it from simply reusing getChoiceSelectionType/getChoices:
  //  1. Grammar. PSHBTNFLD[([*NORSTCSR|*RSTCSR] [(*NUMCOL n)|(*NUMROW n)]
  //     [(*GUTTER n)])] - each of the three numeric parameters is its own
  //     parenthesized `(*NAME value)` group, exactly as IBM writes it.
  //     (getChoiceSelectionType above reads/writes the different, un-
  //     IBM-like `*NUMCOL(n)` shape for SNGCHCFLD/MLTCHCFLD - see the
  //     I-61 follow-up in keywordFixes.md; nothing here depends on it.)
  //  2. PSHBTNCHC(choice-number choice-text [command-key] [*SPACEB]) adds
  //     a command-key parameter CHOICE has no equivalent of.
  //  3. The field itself is tightly constrained: input-capable, data type
  //     Y, length 2, decimal positions 0 (the field receives the number of
  //     the chosen button, or 0), and only ten keywords may share it.
  // -----------------------------------------------------------------------

  /** PSHBTNCHC's own documented command-key list: "CA01 to CA24, CF01 to
   *  CF24, PRINT, HELP, CLEAR, ENTER, HOME, ROLLUP, and ROLLDOWN"; omitted
   *  means ENTER. */
  var PSHBTNCHC_COMMAND_KEYS = (function () {
    var keys = [];
    var i;
    for (i = 1; i <= 24; i++) keys.push('CA' + (i < 10 ? '0' : '') + i);
    for (i = 1; i <= 24; i++) keys.push('CF' + (i < 10 ? '0' : '') + i);
    return keys.concat(['PRINT', 'HELP', 'CLEAR', 'ENTER', 'HOME', 'ROLLUP', 'ROLLDOWN']);
  })();

  /** Parses PSHBTNCHC's `choice-number choice-text [command-key] [*SPACEB]`
   *  parameter text. `text` is the unquoted literal (doubled apostrophes
   *  collapsed) or the raw `&field-name`; `textIsField` says which.
   *  Anything unparseable comes back with blank fields rather than
   *  throwing, so a hand-edited malformed instance still renders in the
   *  editor and can be fixed. */
  function parsePshbtnchcParams(parameters) {
    var rest = (parameters || '').trim();
    var result = { id: '', text: '', textIsField: false, commandKey: '', spaceBefore: false };
    var idM = /^(\d+)\s*([\s\S]*)$/.exec(rest);
    if (!idM) return result;
    result.id = idM[1];
    rest = idM[2];
    var litM = /^'((?:[^']|'')*)'\s*([\s\S]*)$/.exec(rest);
    var fldM = !litM && /^(&\S+)\s*([\s\S]*)$/.exec(rest);
    if (litM) {
      result.text = litM[1].replace(/''/g, "'");
      rest = litM[2];
    } else if (fldM) {
      result.text = fldM[1];
      result.textIsField = true;
      rest = fldM[2];
    }
    rest.split(/\s+/).filter(Boolean).forEach(function (tok) {
      var upper = tok.toUpperCase();
      if (upper === '*SPACEB') { result.spaceBefore = true; return; }
      if (PSHBTNCHC_COMMAND_KEYS.indexOf(upper) >= 0) result.commandKey = upper;
    });
    return result;
  }

  /** Inverse of parsePshbtnchcParams. A blank command key is omitted
   *  (IBM: "If a parameter is not defined then ENTER will be used"). */
  function composePshbtnchcParams(state) {
    var s = state || {};
    var params = String(s.id || '').trim() + ' ' + formatChoiceText(s.text);
    var key = String(s.commandKey || '').trim().toUpperCase();
    if (key) params += ' ' + key;
    if (s.spaceBefore) params += ' *SPACEB';
    return params;
  }

  /** Task I-66 - splits a PSHBTNCHC LITERAL choice text into what IBM
   *  defines: within the text a greater-than character (>) marks the
   *  mnemonic - "the character to the right of the > is the mnemonic" -
   *  and ">>" is a literal > (like a doubled apostrophe). Scanned left to
   *  right, so 'X >>>= 1' is a literal > followed by a mnemonic marker on
   *  "=" (the same pairing DspfEngine.pshbtnDisplayText already uses to
   *  draw the button). Returns
   *    { visible, mnemonic, markers, problem }
   *  where `visible` is the text as it APPEARS (markers removed, >> collapsed
   *  to >), `mnemonic` is the first mnemonic character ('' when none) and
   *  `problem` is a reason string per the DDS Reference, or null:
   *    - only ONE mnemonic is allowed in the choice text;
   *    - the mnemonic character must exist (a trailing > has none), must
   *      not be a blank, and must be a single-byte character. (Not
   *      "the > itself": ">>" is always the literal, so a marker can never
   *      be followed by > - IBM's "You cannot specify the > as the
   *      mnemonic" holds by construction.)
   *  A program-to-system field (&FIELD) is resolved at run time, so it is
   *  never checked here (IBM: the mnemonic "must be contained in the text
   *  supplied by the application at run time"). */
  function analyzePshbtnchcText(text) {
    var t = String(text == null ? '' : text);
    var result = { visible: '', mnemonic: '', markers: 0, problem: null };
    if (t.charAt(0) === '&') { result.visible = t; return result; }
    var i = 0;
    var firstProblem = null;
    while (i < t.length) {
      var ch = t.charAt(i);
      if (ch !== '>') { result.visible += ch; i++; continue; }
      if (t.charAt(i + 1) === '>') { result.visible += '>'; i += 2; continue; }
      result.markers++;
      if (result.markers === 1) {
        var next = t.charAt(i + 1);
        if (next === '') firstProblem = 'A mnemonic marker (>) must be followed by the mnemonic character - write >> for a literal > (per the DDS Reference).';
        else if (/\s/.test(next)) firstProblem = 'The mnemonic character (the one right after >) must not be a blank (per the DDS Reference).';
        else if (t.charCodeAt(i + 1) > 0xFF) firstProblem = 'The mnemonic character must be a single-byte character (per the DDS Reference).';
        else result.mnemonic = next;
      }
      i++;
    }
    if (result.markers > 1) result.problem = 'The choice text can have only one mnemonic (>) - write >> for a literal > (per the DDS Reference).';
    else result.problem = firstProblem;
    return result;
  }

  /** Task I-66 - the reason a PSHBTNCHC literal choice text is invalid, or
   *  null (see analyzePshbtnchcText). */
  function pshbtnchcTextProblem(text) {
    return analyzePshbtnchcText(text).problem;
  }

  /** Task I-66 - guard for the raw keyword editor's "+ Add keyword": a
   *  reason when `keywordName` is PSHBTNCHC and its choice text is invalid,
   *  null for every other keyword (a safe no-op) or a valid one. */
  function pshbtnchcParamsProblem(keywordName, parameters) {
    if (String(keywordName || '').toUpperCase() !== 'PSHBTNCHC') return null;
    var f = parsePshbtnchcParams(parameters);
    return f.textIsField ? null : pshbtnchcTextProblem(f.text);
  }

  /** Task I-66 - whole-field text review of the PSHBTNCHC choices, for the
   *  panel to show on a hand-written source that already breaks a rule:
   *    textProblems: [{ id, message }]   - per-choice mnemonic errors
   *    duplicateMnemonics: [{ mnemonic, ids }] - "the same mnemonic
   *      character should not be specified for more than one choice. If
   *      the same mnemonic character is used more than once than the first
   *      definition of the mnemonic is used" - a warning, not an error,
   *      because IBM defines the fallback. Compared as the exact
   *      character; the reference does not say the match is case-blind. */
  function pshbtnchcFieldIssues(keywords) {
    var out = { textProblems: [], duplicateMnemonics: [] };
    var byMnemonic = {};
    var order = [];
    getRepeatableKeywordInstances(keywords, ['PSHBTNCHC']).forEach(function (inst) {
      var f = parsePshbtnchcParams(inst.parameters);
      if (f.textIsField) return;
      var a = analyzePshbtnchcText(f.text);
      if (a.problem) out.textProblems.push({ id: f.id, message: a.problem });
      if (a.mnemonic) {
        if (!byMnemonic[a.mnemonic]) { byMnemonic[a.mnemonic] = []; order.push(a.mnemonic); }
        byMnemonic[a.mnemonic].push(f.id);
      }
    });
    order.forEach(function (m) {
      if (byMnemonic[m].length > 1) out.duplicateMnemonics.push({ mnemonic: m, ids: byMnemonic[m] });
    });
    return out;
  }

  /** Task I-66 - an ESTIMATE of whether a push-button field's choices fit
   *  the display, or null when they do (or when there is not enough to
   *  tell). IBM: "The choice text must fit on one line of the display for
   *  the smallest display size specified for the file", and gives no
   *  formula - the maximum depends on the field's position, the choice
   *  text length, the gutter, the number of columns, the smallest display
   *  size and the window width if it is in a window. This uses the
   *  designer's own push-button layout (DspfEngine.layoutPshbtn): every
   *  button is as wide as the widest visible text plus 2 for its < >
   *  brackets, buttons are `gutter` blanks apart (default 3), *NUMCOL n
   *  gives n buttons per row, *NUMROW n gives ceil(slots / n) columns, and
   *  with neither the buttons wrap onto as many lines as needed so only
   *  ONE button has to fit. Choices whose text is a &FIELD are unknown at
   *  design time and ignored. Because it is an estimate it is only ever
   *  shown as a warning by the caller, never used to block an edit.
   *  opts: { column (1-based field column), fileKeywords, recordKeywords }. */
  function pshbtnchcFitProblem(keywords, opts) {
    var o = opts || {};
    var column = parseInt(o.column, 10);
    if (!(column > 0)) return null;
    var visibleMax = 0;
    var known = 0;
    var slots = 0;
    getRepeatableKeywordInstances(keywords, ['PSHBTNCHC']).forEach(function (inst) {
      var f = parsePshbtnchcParams(inst.parameters);
      if (f.spaceBefore && slots > 0) slots++;
      slots++;
      if (f.textIsField) return;
      known++;
      visibleMax = Math.max(visibleMax, analyzePshbtnchcText(f.text).visible.length);
    });
    if (known === 0) return null;
    var cell = visibleMax + 2;
    var layout = getPshbtnfld(keywords);
    var gutter = parseInt(layout.gutter, 10) > 0 ? parseInt(layout.gutter, 10) : 3;
    var numCol = parseInt(layout.numCol, 10);
    var numRow = parseInt(layout.numRow, 10);
    var cols = 1;
    if (numCol > 0) cols = Math.max(1, Math.min(numCol, slots));
    else if (numRow > 0) cols = Math.max(1, Math.ceil(slots / numRow));
    var needed = cols * cell + (cols - 1) * gutter;
    // Where does the line end? A window's own width when the record is a
    // sized/positioned window, otherwise the smallest declared display
    // width (24 x 80 when DSPSIZ is not specified at all).
    var limit;
    var limitLabel;
    var win = getWindowParamsKeyword(o.recordKeywords || []);
    if ((win.mode === 'sized' || win.mode === 'positioned') && parseInt(win.columns, 10) > 0) {
      limit = parseInt(win.columns, 10);
      limitLabel = 'the ' + limit + '-column window';
    } else {
      var sizes = getDisplaySizesList(o.fileKeywords || []);
      limit = sizes.length ? Math.min.apply(null, sizes.map(function (sz) { return sz.columns; })) : 80;
      limitLabel = 'the smallest display size (' + limit + ' columns)';
    }
    var available = limit - column + 1;
    if (needed <= available) return null;
    return 'The push buttons probably do not fit: about ' + needed + ' columns are needed (' + cols + ' button' + (cols === 1 ? '' : 's') + ' across, each ' + cell + ' wide including its < >, ' + (cols > 1 ? gutter + ' blanks apart) ' : ') ') +
      'but only ' + available + ' are available from column ' + column + ' to the edge of ' + limitLabel + '. IBM requires the choice text to fit on one line for the smallest display size (this is an estimate).';
  }

  /** Task I-63 - reads one of the layout parameters *NUMCOL / *NUMROW /
   *  *GUTTER out of a SNGCHCFLD/MLTCHCFLD/PSHBTNFLD parameter string, as a
   *  digit string ('' when absent). IBM's own format string is
   *  `[(*NUMCOL nbr-of-cols) | (*NUMROW nbr-of-rows)] [(*GUTTER
   *  gutter-width)]` - each a PARENTHESIZED GROUP with a space, e.g.
   *  `(*NUMCOL 3)`. Also reads, leniently, the `*NUMCOL(3)` shape earlier
   *  iSDA versions wrote for SNGCHCFLD/MLTCHCFLD (invalid DDS) so sources
   *  written by them still load; the next Apply rewrites it correctly. */
  function readChoiceLayoutNumber(params, name) {
    var m = new RegExp('\\(\\s*\\*' + name + '\\s+(\\d+)\\s*\\)', 'i').exec(params || '') ||
      new RegExp('\\*' + name + '\\((\\d+)\\)', 'i').exec(params || '');
    return m ? m[1] : '';
  }

  /** Task I-63 - the parameter string with every layout group (either
   *  shape) removed, so what's left tokenizes cleanly on whitespace into
   *  the bare *flags. */
  function stripChoiceLayoutParams(params) {
    return String(params || '')
      .replace(/\(\s*\*(?:NUMCOL|NUMROW|GUTTER)\s+\d+\s*\)/gi, ' ')
      .replace(/\*(?:NUMCOL|NUMROW|GUTTER)\(\d+\)/gi, ' ');
  }

  /** Reads PSHBTNFLD's parameters: { present, restrict: ''|'*RSTCSR'|
   *  '*NORSTCSR', numCol, numRow, gutter } (numeric ones as digit strings,
   *  '' when unspecified). Accepts IBM's `(*NUMCOL 3)` shape and, leniently,
   *  the `*NUMCOL(3)` shape this codebase's own SNGCHCFLD writer emits. */
  function getPshbtnfld(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'PSHBTNFLD'; });
    var result = { present: false, restrict: '', numCol: '', numRow: '', gutter: '' };
    if (!k) return result;
    result.present = true;
    var params = k.parameters || '';
    if (/\*NORSTCSR\b/i.test(params)) result.restrict = '*NORSTCSR';
    else if (/\*RSTCSR\b/i.test(params)) result.restrict = '*RSTCSR';
    result.numCol = readChoiceLayoutNumber(params, 'NUMCOL');
    result.numRow = readChoiceLayoutNumber(params, 'NUMROW');
    result.gutter = readChoiceLayoutNumber(params, 'GUTTER');
    return result;
  }

  /** Returns a NEW keywords array with PSHBTNFLD replaced by one built from
   *  `state` (same shape getPshbtnfld returns) - removed entirely when
   *  `state.present` is falsy. PSHBTNCHC instances are never touched here.
   *  IBM lets a field specify *NUMCOL OR *NUMROW, never both; if a caller
   *  passes both, *NUMCOL wins (the UI blocks that combination before it
   *  gets here, so this is only a backstop against invalid DDS). Option
   *  indicators are "not valid" for PSHBTNFLD, so conditions are always
   *  cleared. */
  function setPshbtnfld(keywords, state) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'PSHBTNFLD'; });
    if (!state || !state.present) return next;
    var parts = [];
    if (state.restrict === '*RSTCSR' || state.restrict === '*NORSTCSR') parts.push(state.restrict);
    var numCol = parseInt(state.numCol, 10);
    var numRow = parseInt(state.numRow, 10);
    var gutter = parseInt(state.gutter, 10);
    if (numCol > 0) parts.push('(*NUMCOL ' + numCol + ')');
    else if (numRow > 0) parts.push('(*NUMROW ' + numRow + ')');
    if (gutter > 0) parts.push('(*GUTTER ' + gutter + ')');
    return next.concat([{ name: 'PSHBTNFLD', parameters: parts.join(' '), conditions: [], raw: '', sourceLines: [] }]);
  }

  /** PSHBTNFLD's own list: "The following keywords can be specified on a
   *  field with the PSHBTNFLD keyword: ALIAS, CHANGE, CHCAVAIL,
   *  CHCUNAVAIL, CHCCTL, INDTXT, NOCCSID, PSHBTNCHC, DSPATR(PC), TEXT" -
   *  a closed whitelist, the same shape as USRDFN's/SFL's/MNUBAR's
   *  record-level ones (I-49/I-46/I-48), just at field level. DSPATR is
   *  allowed ONLY with the PC parameter. PSHBTNFLD itself is implicitly
   *  allowed. */
  var PSHBTNFLD_ALLOWED_KEYWORDS = ['ALIAS', 'CHANGE', 'CHCAVAIL', 'CHCUNAVAIL', 'CHCCTL', 'INDTXT', 'NOCCSID', 'PSHBTNCHC', 'DSPATR', 'TEXT', 'PSHBTNFLD'];

  function pshbtnfldKeywordAllowed(name, parameters) {
    if (PSHBTNFLD_ALLOWED_KEYWORDS.indexOf(name) < 0) return false;
    if (name !== 'DSPATR') return true;
    var tokens = String(parameters || '').toUpperCase().split(/[\s,()]+/).filter(Boolean);
    return tokens.length > 0 && tokens.every(function (t) { return t === 'PC'; });
  }

  /** Task I-57 - the three field-level PSHBTNFLD rules, in one
   *  bidirectional check (same shape as htmlConflictReason above; safe to
   *  call for any keyword name - returns null when none applies):
   *   1. turning PSHBTNFLD ON while the field already carries a keyword
   *      outside the whitelist above;
   *   2. adding a non-whitelisted keyword to a field that already carries
   *      PSHBTNFLD;
   *   3. adding PSHBTNCHC to a field with no PSHBTNFLD ("When the
   *      PSHBTNCHC keyword is specified on a field, the PSHBTNFLD keyword
   *      must also be specified").
   *  `parameters` matters only for DSPATR (allowed solely as DSPATR(PC)).
   *  Removing a keyword is never checked, only adding one. */
  function pshbtnfldConflictReason(keywordName, parameters, fieldKeywords) {
    var kws = fieldKeywords || [];
    var hasPshbtnfld = kws.some(function (k) { return k.name === 'PSHBTNFLD'; });
    if (keywordName === 'PSHBTNFLD') {
      var offenders = [];
      kws.forEach(function (k) {
        if (!pshbtnfldKeywordAllowed(k.name, k.parameters)) offenders.push(k.name === 'DSPATR' ? 'DSPATR(' + (k.parameters || '') + ')' : k.name);
      });
      if (offenders.length) {
        return 'PSHBTNFLD cannot be specified on a field that also carries ' + offenders.join(', ') +
          ' (per the DDS Reference, only ALIAS, CHANGE, CHCAVAIL, CHCUNAVAIL, CHCCTL, INDTXT, NOCCSID, PSHBTNCHC, DSPATR(PC) and TEXT are allowed on a push-button field).';
      }
      return null;
    }
    if (keywordName === 'PSHBTNCHC') {
      return hasPshbtnfld ? null : 'PSHBTNCHC can only be specified on a field that also has PSHBTNFLD (per the DDS Reference).';
    }
    if (hasPshbtnfld && !pshbtnfldKeywordAllowed(keywordName, parameters)) {
      return keywordName + (keywordName === 'DSPATR' ? '(' + (parameters || '') + ')' : '') +
        ' cannot be specified on a push-button (PSHBTNFLD) field (per the DDS Reference, only ALIAS, CHANGE, CHCAVAIL, CHCUNAVAIL, CHCCTL, INDTXT, NOCCSID, PSHBTNCHC, DSPATR(PC) and TEXT are allowed).';
    }
    return null;
  }

  /** Task I-64 - diff-based backstop for EVERY field-level panel (Color &
   *  attributes, Keying options, Edit code/word, validity checks,
   *  Reference, date/time, the General keyword rows, CHECK, CHGINPDFT,
   *  DUP, DSPATR, etc. - all commit through commitEdit's own keywords
   *  update, the exact same choke point I-58's own wrdwrapNewConflictReason
   *  already uses), same shape as that function: given the field's
   *  keyword list before and after an edit, returns a reason when the
   *  edit INTRODUCES a non-whitelisted keyword onto a field that carries
   *  PSHBTNFLD both before and after the edit. Conflicts already present
   *  before the edit (a hand-written file that was already invalid) are
   *  not re-reported, so unrelated edits to such a field are never
   *  blocked, and turning PSHBTNFLD itself on is left to the
   *  forward-direction pshbtnfldConflictReason (already wired at I-57's
   *  own on/off toggle call site) - this function only fires when
   *  PSHBTNFLD was ALREADY present both before and after, exactly
   *  mirroring wrdwrapNewConflictReason's own hadWrdwrap/hasWrdwrap
   *  double-check. */
  function pshbtnfldNewConflictReason(oldKeywords, newKeywords) {
    var hasPshbtnfld = (newKeywords || []).some(function (k) { return k.name === 'PSHBTNFLD'; });
    if (!hasPshbtnfld) return null;
    var hadPshbtnfld = (oldKeywords || []).some(function (k) { return k.name === 'PSHBTNFLD'; });
    if (!hadPshbtnfld) return null;
    function offenders(kws) {
      return (kws || []).filter(function (k) {
        return k.name !== 'PSHBTNFLD' && !pshbtnfldKeywordAllowed(k.name, k.parameters);
      }).map(function (k) { return k.name === 'DSPATR' ? 'DSPATR(' + (k.parameters || '') + ')' : k.name; });
    }
    var before = offenders(oldKeywords);
    var added = offenders(newKeywords).filter(function (h) {
      var i = before.indexOf(h);
      if (i >= 0) { before.splice(i, 1); return false; }
      return true;
    });
    if (!added.length) return null;
    return added.join(', ') + ' cannot be specified on a push-button (PSHBTNFLD) field (per the DDS Reference, only ALIAS, CHANGE, CHCAVAIL, CHCUNAVAIL, CHCCTL, INDTXT, NOCCSID, PSHBTNCHC, DSPATR(PC) and TEXT are allowed).';
  }

  /** Task I-85 - the REMOVAL direction of the PSHBTNFLD / PSHBTNCHC pairing,
   *  which I-57 (pshbtnfldConflictReason) and I-64 (pshbtnfldNewConflictReason)
   *  left open because both only look at what an edit ADDS. The DDS Reference
   *  says "A field containing the PSHBTNFLD keyword must also contain one or
   *  more PSHBTNCHC keywords" and that PSHBTNCHC needs PSHBTNFLD, so two
   *  edits leave the field invalid:
   *   A. removing PSHBTNFLD while a PSHBTNCHC stays (orphaned choices);
   *   B. removing the LAST PSHBTNCHC while PSHBTNFLD stays (a push-button
   *      field with no buttons).
   *  Given the field's keyword list before and after an edit, returns a reason
   *  string when the edit INTRODUCES either violation, else null.
   *
   *  Same diff-based shape as I-81's sflrtnselNewConflictReason, for the same
   *  ONE choke point (commitEdit): the PSHBTNFLD panel's choice rows, the raw
   *  keyword editor's Remove, and every other path that writes keywords are
   *  covered at once. A field that was already invalid before the edit (a
   *  hand-written PSHBTNFLD with no PSHBTNCHC, or PSHBTNCHC with no PSHBTNFLD)
   *  is never re-reported, and fixing it is always allowed. Removing PSHBTNFLD
   *  together with every PSHBTNCHC (which is what the panel's own toggle-off
   *  does) and removing one of several PSHBTNCHC are both fine. */
  function pshbtnfldRemovalConflictReason(oldKeywords, newKeywords) {
    var has = function (kws, n) { return (kws || []).some(function (k) { return k.name === n; }); };
    var hadFld = has(oldKeywords, 'PSHBTNFLD');
    var hadChc = has(oldKeywords, 'PSHBTNCHC');
    var hasFld = has(newKeywords, 'PSHBTNFLD');
    var hasChc = has(newKeywords, 'PSHBTNCHC');
    // A: PSHBTNFLD removed while a PSHBTNCHC is left behind.
    if (hadFld && !hasFld && hasChc) {
      return 'PSHBTNFLD cannot be removed while the field still carries PSHBTNCHC, which requires it (per the DDS Reference) - remove the push-button choices too (turning the push-button field off does both).';
    }
    // B: the last PSHBTNCHC removed while PSHBTNFLD stays. Only when the field
    // was valid before (had at least one PSHBTNCHC).
    if (hadFld && hasFld && hadChc && !hasChc) {
      return 'The last PSHBTNCHC cannot be removed from a push-button (PSHBTNFLD) field, which must contain one or more of them (per the DDS Reference) - turn the push-button field off instead.';
    }
    return null;
  }

  /** PSHBTNFLD's own definition rule: "must be defined as an input-capable
   *  field with data type Y, length equal to 2, and decimal positions of
   *  0". Returns the field-property updates ({ dataType, length,
   *  decimalPositions, usage }, only the keys that need to change) that
   *  bring a field into line, or null when it already conforms. An
   *  already-input-capable usage (I/B) is kept; anything else becomes B
   *  (matching every one of IBM's own examples). */
  function pshbtnfldDefinitionUpdates(field) {
    var f = field || {};
    var updates = {};
    if ((f.dataType || '').toUpperCase() !== 'Y') updates.dataType = 'Y';
    if (Number(f.length) !== 2) updates.length = 2;
    if (Number(f.decimalPositions) !== 0 || f.decimalPositions == null) updates.decimalPositions = 0;
    var u = (f.usage || '').toUpperCase();
    if (u !== 'I' && u !== 'B') updates.usage = 'B';
    return Object.keys(updates).length ? updates : null;
  }

  /** Task I-62 - a data type, length, decimals or usage CHANGE on a field
   *  that ALREADY carries PSHBTNFLD (the Basic tab's Apply changes). I-57
   *  enforces PSHBTNFLD's own definition rule - "an input-capable field
   *  with data type Y, length equal to 2, and decimal positions of 0" -
   *  when the toggle is turned ON (it rewrites the field with
   *  pshbtnfldDefinitionUpdates), but not afterwards; this closes that.
   *  Returns a reason string, or null. It is driven by
   *  pshbtnfldDefinitionUpdates: the field as it WOULD be after the edit is
   *  handed to that function, and whatever it says still needs correcting
   *  is a violation.
   *
   *  oldField is the field as stored ({ dataType, length, decimalPositions,
   *  usage }); updates carries only the properties being written (a key that
   *  is absent counts as unchanged; the Basic tab always sends all four).
   *
   *  Diff-based, like I-61's wrdwrapBasicEditConflictReason and I-58's
   *  wrdwrapNewConflictReason: only a change TO a non-conforming value is
   *  blocked, so an unrelated edit (rename, position) on a hand-written
   *  field that is already invalid is never blocked. Changing between two
   *  different invalid values is still blocked (the edit fixes nothing);
   *  changing to a conforming value, or leaving a value alone, never is.
   *  A blank usage is the DDS default, output (O) - the Usage select has no
   *  blank option and shows O for it - so blank counts as O on BOTH sides.
   *  A field without PSHBTNFLD is never affected. */
  function pshbtnfldBasicEditConflictReason(fieldKeywords, oldField, updates) {
    var hasPshbtnfld = (fieldKeywords || []).some(function (k) { return k.name === 'PSHBTNFLD'; });
    if (!hasPshbtnfld) return null;
    var oldF = oldField || {};
    var upd = updates || {};
    var has = function (key) { return Object.prototype.hasOwnProperty.call(upd, key); };
    var str = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
    var num = function (v) {
      if (v == null || v === '') return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
    };
    var before = {
      dataType: str(oldF.dataType),
      length: num(oldF.length),
      decimalPositions: num(oldF.decimalPositions),
      usage: str(oldF.usage) || 'O'
    };
    var after = {
      dataType: has('dataType') ? str(upd.dataType) : before.dataType,
      length: has('length') ? num(upd.length) : before.length,
      decimalPositions: has('decimalPositions') ? num(upd.decimalPositions) : before.decimalPositions,
      usage: has('usage') ? (str(upd.usage) || 'O') : before.usage
    };
    var stillWrong = pshbtnfldDefinitionUpdates(after) || {};
    var shown = function (v) { return v == null || v === '' ? 'blank' : v; };
    var problems = [];
    if (stillWrong.dataType !== undefined && after.dataType !== before.dataType) problems.push('data type ' + shown(after.dataType) + ' (must be Y)');
    if (stillWrong.length !== undefined && after.length !== before.length) problems.push('length ' + shown(after.length) + ' (must be 2)');
    if (stillWrong.decimalPositions !== undefined && after.decimalPositions !== before.decimalPositions) problems.push('decimal positions ' + shown(after.decimalPositions) + ' (must be 0)');
    if (stillWrong.usage !== undefined && after.usage !== before.usage) problems.push('usage ' + after.usage + ' (must be I or B)');
    if (!problems.length) return null;
    return 'PSHBTNFLD requires an input-capable field (usage I or B) with data type Y, length 2 and decimal positions 0 (per the DDS Reference) - cannot set ' + problems.join(', ') + '.';
  }

  /** Task I-24 - WINDOW's own DDS Reference section also states "WINDOW
   *  cannot be specified for the record format specified by the PASSRCD
   *  keyword" - flagged, not fixed, by I-12 (see that task's own
   *  "Flagged, not fixed this task" note) because it's a
   *  cross-reference-by-name check against a FILE-level keyword's string
   *  parameter, not a same-record flag conflict windowConflictReason above
   *  already covers.
   *  (Note: the DDS Reference states the identical restriction for
   *  ALWROL, CLRL, and SLNO too - all four keywords' own sections use the
   *  same "cannot be specified for the record format specified by the
   *  PASSRCD keyword" wording. I-24 is scoped to WINDOW only; the other
   *  three are a follow-up finding, not implemented here.)
   *
   *  Pure name-vs-name comparison (case-insensitive, blank-safe) rather
   *  than taking a full records array - this is deliberately the smallest
   *  possible shared primitive so each of the two reachable on-transitions
   *  below can call it with just the one piece of data it already has,
   *  instead of both being forced to construct/scan a records array:
   *   1. "+ Add record" wizard creating a new WINDOW-type record whose
   *      name matches the file's current PASSRCD value (newRecordBtn's
   *      own handler in buildWebviewTemplate.js - blocked inline, same as
   *      its pre-existing duplicate-name check, before commitSourceChange
   *      ever runs).
   *   2. Editing file-level PASSRCD to name a record that already carries
   *      WINDOW (wireFileKeywordsPanels' fk-passrcd handler in
   *      webviewClientHelpers.js - alert + revert, same idiom as I-12/
   *      I-18's own file-level guards).
   *  Both directions are covered because, unlike WINDOW itself (only ever
   *  written by the record-creation wizard - see windowConflictReason's
   *  own doc comment), PASSRCD is a plain free-text file-level field a
   *  user can retype at any time, and a WINDOW-type record's own name is
   *  chosen by the user at creation time (unlike the floating toolbox's
   *  auto-named WDWn window tool) - so either side of the match can change
   *  first. Renaming an EXISTING record isn't a reachable third
   *  transition for this check: PASSRCD isn't one of
   *  renameRecordReferences' RECORD_REFERENCE_EXTRACTORS (SFLCTL/WINDOW/
   *  MNUBARCHC only), so renaming a record never rewrites a file-level
   *  PASSRCD that named its old name - that's a separate, pre-existing
   *  gap outside this task's own scope.
   *
   *  Task I-36 generalized this into passrcdRecordConflictReason
   *  (keywordName parametrized) once ALWROL/CLRL/SLNO turned out to need
   *  the identical check - passrcdWindowConflictReason is now a thin
   *  wrapper kept for its own existing callers/tests. */
  function passrcdRecordConflictReason(keywordName, passrcdName, recordName) {
    var a = (passrcdName || '').trim().toUpperCase();
    var b = (recordName || '').trim().toUpperCase();
    if (!a || !b || a !== b) return null;
    return keywordName + ' cannot be specified for record format ' + b + ' - it is the record named by the file-level PASSRCD(' + a + ') keyword (per the DDS Reference).';
  }
  function passrcdWindowConflictReason(passrcdName, windowRecordName) {
    return passrcdRecordConflictReason('WINDOW', passrcdName, windowRecordName);
  }

  /** Task I-36 - ALWROL/CLRL/SLNO's own DDS Reference sections state the
   *  identical "cannot be specified for the record format specified by
   *  the PASSRCD keyword" restriction I-24 fixed for WINDOW (flagged as
   *  a follow-up finding by I-24 itself - see passrcdRecordConflictReason's
   *  own doc comment just above). Reuses that same primitive rather than
   *  a bespoke one per keyword.
   *  Wired at the two reachable on-transitions, same shape as I-24's own
   *  WINDOW guard:
   *   1. Turning ALWROL/CLRL/SLNO on on a record whose OWN name already
   *      matches the file's current PASSRCD value - wireUsrdfnGuardedFlag
   *      (ALWROL) / wirePulldownGuardedFlag (SLNO/CLRL)'s own new
   *      `alsoCheckPassrcd` param, using `p.slice(3)` (idPrefix is always
   *      `'rk-' + rec.name`, per this record's own `rkPrefix` in
   *      buildWebviewTemplate.js) for the "record name" side, since
   *      unlike WINDOW these three are ordinary toggles on ANY record,
   *      not a record-creation-time "type" - there's no wizard-time
   *      creation path to guard the way I-24 guarded WINDOW's.
   *   2. Editing file-level PASSRCD to name a record that already
   *      carries ALWROL/CLRL/SLNO - wireFileKeywordsPanels' fk-passrcd
   *      handler now checks all four of WINDOW/ALWROL/CLRL/SLNO against
   *      the named record, not just WINDOW. */

  /** Task I-28 - found auditing the base Record Keywords panel's KEEP row
   *  (see that same task's own conditioning-toggle fix, wired alongside
   *  this in webviewClientHelpers.js): KEEP's own DDS Reference section
   *  states "This keyword cannot be specified with the following
   *  keywords: ALWROL, CLRL, SLNO" - confirmed by each of those three's
   *  OWN section individually restating the same exclusion against KEEP
   *  the other direction (same cross-verification method I-23 used for
   *  SFLMSGRCD).
   *  One shared, order-independent primitive (like usrdfnConflictReason/
   *  pulldownConflictReason above) rather than 4 separate pairwise
   *  functions - callers pass whichever of the 4 keywords is transitioning
   *  on plus the record's current keyword list, and it works no matter
   *  which side of a conflicting pair the user toggles first.
   *  Out of scope for this task: ALWROL/CLRL/SLNO's own sections each
   *  ALSO list ASSUME/SFL/SFLCTL/USRDFN as mutually exclusive with
   *  themselves (a broader web of restrictions than KEEP's own list) -
   *  I-28's own title scopes this task to KEEP's restrictions only; the
   *  wider ALWROL/CLRL/SLNO-vs-ASSUME/SFL/SFLCTL/USRDFN web is a
   *  follow-up finding, not implemented here. */
  function keepMutexConflictReason(keywordName, recordKeywords) {
    var KEEP_MUTEX = ['ALWROL', 'CLRL', 'SLNO'];
    var kws = recordKeywords || [];
    function has(name) { return kws.some(function (k) { return k.name === name; }); }
    if (keywordName === 'KEEP') {
      var conflicting = KEEP_MUTEX.filter(has);
      if (!conflicting.length) return null;
      return 'KEEP cannot be specified with ' + conflicting.join('/') + ' on the same record format (per the DDS Reference).';
    }
    if (KEEP_MUTEX.indexOf(keywordName) !== -1 && has('KEEP')) {
      return keywordName + ' cannot be specified with KEEP on the same record format (per the DDS Reference).';
    }
    return null;
  }

  /** Task I-37 - the follow-up finding I-28 flagged in its own doc
   *  comment just above: ALWROL/CLRL/SLNO's own DDS Reference sections
   *  each ALSO list ASSUME/SFL/SFLCTL/USRDFN as mutually exclusive with
   *  themselves (identical three-way list on all three - "The ALWROL/
   *  CLRL keyword cannot be specified with any of the following
   *  keywords" / "The SLNO keyword is not allowed in a record format
   *  that has one of the following keywords specified": ASSUME, KEEP,
   *  SFL, SFLCTL, USRDFN - KEEP already covered by keepMutexConflictReason
   *  above, the other four are this task's own scope).
   *  Cross-verified from ASSUME's own section too (confirms ALWROL/CLRL/
   *  SLNO/SFL/USRDFN/USRDSPMGT - same cross-check method I-23 used for
   *  SFLMSGRCD): SFL and USRDSPMGT are on ASSUME's own list but not, per
   *  ALWROL/CLRL/SLNO's own sections, symmetric with all three the other
   *  way (ASSUME's list is ASSUME-specific, e.g. USRDSPMGT is an S36E
   *  concern already handled separately) - so only the confirmed-
   *  bidirectional ASSUME<->{ALWROL,CLRL,SLNO} pair is checked in reverse
   *  below; SFL/SFLCTL/USRDFN are checked one-directionally only, same
   *  reasoning usrdfnConflictReason's own doc comment gives: all three
   *  are record-TYPE identifiers (see isSflRecord/isSflCtlRecord and
   *  usrdfnConflictReason's own doc comments) written once by the
   *  "+ Add record" wizard and never toggled off again by this UI, so
   *  there's no reachable "turn SFL/SFLCTL/USRDFN on while ALWROL/CLRL/
   *  SLNO is already present" transition to guard the other way.
   *  USRDFN specifically was already guarded for ALWROL alone (I-8's own
   *  usrdfnConflictReason, generic to whichever keyword calls through
   *  wireUsrdfnGuardedFlag) - CLRL/SLNO go through wirePulldownGuardedFlag
   *  instead, which never called usrdfnConflictReason, so USRDFN-vs-
   *  CLRL/SLNO was a genuine gap alongside the SFL/SFLCTL one this task
   *  closes too. Deliberately unconditional in both wire functions below
   *  (no new alsoCheckX param needed) since this returns null for every
   *  keywordName outside {ALWROL, CLRL, SLNO, ASSUME}. */
  function alwrolClrlSlnoConflictReason(keywordName, recordKeywords) {
    var TARGET = ['ALWROL', 'CLRL', 'SLNO'];
    var kws = recordKeywords || [];
    function has(name) { return kws.some(function (k) { return k.name === name; }); }
    if (TARGET.indexOf(keywordName) !== -1) {
      var conflicting = ['ASSUME', 'SFL', 'SFLCTL', 'USRDFN'].filter(has);
      if (!conflicting.length) return null;
      return keywordName + ' cannot be specified with ' + conflicting.join('/') + ' on the same record format (per the DDS Reference).';
    }
    if (keywordName === 'ASSUME') {
      var conflicting2 = TARGET.filter(has);
      if (!conflicting2.length) return null;
      return 'ASSUME cannot be specified with ' + conflicting2.join('/') + ' on the same record format (per the DDS Reference).';
    }
    return null;
  }

  /** Task I-18 - MNUBARSW/MNUCNL mutual CA-key exclusion guard. Both
   *  keywords' own DDS Reference sections state the same rule, worded
   *  from each side: under MNUBARSW, "Within a record, the CAnn key
   *  specified by the MNUBARSW keyword cannot be specified again using
   *  another keyword (such as MNUCNL)"; under MNUCNL, the mirror
   *  statement naming MNUBARSW. Both sections go on to say the
   *  file-level form "extends to all records in the file, this must be
   *  considered when assigning a CAnn key" - so the scope genuinely
   *  spans both file-level AND every individual record's own copy of
   *  these two keywords, resolving this task's own scope question: it
   *  is NOT just a same-record check.
   *  `cakey` is the CAnn value about to be assigned to `keywordName` -
   *  blank resolves to MNUBARSW's own documented default (CA10) or
   *  MNUCNL's own documented default (CA12), since a blank box still
   *  means a real, active CA key once the keyword itself is present, not
   *  "no CA key". `fileKeywords` is always checked (a file-level
   *  assignment of the OTHER keyword extends to every record, per both
   *  sections' own text). `recordScopes` is an array of keyword-arrays -
   *  the record(s) whose OWN copy of the other keyword also needs
   *  checking: a caller editing one specific record's own MNUBARSW/
   *  MNUCNL passes an array holding just that record's own keywords
   *  (record-level values don't propagate to OTHER records - only the
   *  file-level form does); a caller editing the FILE-level copy passes
   *  every record's own keywords (a file-level assignment reaches all of
   *  them). Same alert+revert idiom as this file's other Conflict Reason
   *  functions; turning either keyword OFF, or lowering/blanking its own
   *  CA key, is never blocked, only the on-transition/CA-key-collision. */
  function mnuBarKeyConflictReason(keywordName, cakey, fileKeywords, recordScopes) {
    var otherName = keywordName === 'MNUBARSW' ? 'MNUCNL' : (keywordName === 'MNUCNL' ? 'MNUBARSW' : null);
    if (!otherName) return null;
    function normalizeCakey(name, raw) {
      var first = (raw || '').trim().split(/\s+/)[0] || '';
      if (first) return first.toUpperCase();
      return name === 'MNUBARSW' ? 'CA10' : 'CA12';
    }
    var thisCakey = normalizeCakey(keywordName, cakey);
    function otherCakeyIn(kwList) {
      var k = (kwList || []).find(function (x) { return x.name === otherName; });
      if (!k) return null;
      return normalizeCakey(otherName, k.parameters);
    }
    var fileOther = otherCakeyIn(fileKeywords);
    if (fileOther && fileOther === thisCakey) {
      return keywordName + '(' + thisCakey + ') cannot use the same CA key as the file-level ' + otherName + '(' + fileOther + ') - a file-level ' + otherName + ' extends to every record (per the DDS Reference).';
    }
    for (var i = 0; i < (recordScopes || []).length; i++) {
      var recOther = otherCakeyIn(recordScopes[i]);
      if (recOther && recOther === thisCakey) {
        return keywordName + '(' + thisCakey + ') cannot use the same CA key as ' + otherName + '(' + recOther + ') already assigned on this record (per the DDS Reference).';
      }
    }
    return null;
  }
  /** Task I-19 - MNUBAR's own field-shape structural constraint. MNUBAR's
   *  own DDS Reference section states, in its own prose (not a
   *  keyword-compatibility list like windowConflictReason/
   *  pulldownConflictReason/usrdfnConflictReason above): "A record with
   *  the MNUBAR keyword specified must contain one and only one menu bar
   *  field (a field with one or more MNUBARCHC keywords), and cannot
   *  contain any displayable fields other than the menu bar field."
   *  Unlike this file's other conflict-reason functions, this isn't a
   *  same-record "does keyword X coexist with keyword Y" check - it's a
   *  record-COMPOSITION rule (how many entries this record's own field
   *  list contains, and of what shape), so it takes the record's
   *  `fields` array (which, in this parser's model, holds both real DDS
   *  fields and constants) rather than a `keywords` array.
   *
   *  Scope decisions:
   *  - Identifying "the menu-bar field" considers BOTH real fields
   *    (`nameType === 'FIELD'`) AND constants (`nameType === 'CONSTANT'`)
   *    that carry MNUBARCHC - not just fields as MNUBARCHC's own section
   *    literally says ("field-level keyword"). This deliberately follows
   *    this codebase's own already-established, already-tested precedent
   *    (see dspfWebview.test.js's D4 scenario) of letting MNUBARCHC/
   *    MNUBARSEP be added to a constant too, not just a named field -
   *    re-litigating that as wrong is out of this task's own scope (a
   *    record-composition check, not an audit of where MNUBARCHC itself
   *    may be placed), so this note treats a MNUBARCHC-bearing constant
   *    as satisfying "the menu bar field" the same as MNUBARCHC-bearing
   *    field, rather than flagging every such record (this codebase's own
   *    tested, working default shape) as non-compliant.
   *  - "cannot contain any displayable fields other than the menu bar
   *    field", by contrast, IS read at the Reference's own precise word
   *    - "fields" (`nameType === 'FIELD'`) - a second, unrelated
   *    CONSTANT (a static label, say) is a distinct model entity from a
   *    field in this parser and in DDS terminology generally, and the
   *    Reference's own text says "fields", not "constants" or "entries",
   *    so nothing here second-guesses that by counting constants toward
   *    this half of the check either.
   *  - "displayable" is read as usage O/I/B (the three usages DDS
   *    actually shows on screen) - H (hidden) and P (program-to-system,
   *    per MNUBARCHC's own text describing its optional return-field and
   *    &field-name choice-text forms) are excluded from the count, which
   *    is exactly what lets those two coexist with the one menu-bar
   *    field without tripping this note, matching MNUBARCHC's own
   *    example.
   *
   *  Deliberately an ADVISORY note, not a hard block, per this task's own
   *  plan-doc scope question and the L83 precedent it names: this rule
   *  spans the WHOLE RECORD's field list, not one keyword on one object
   *  already open in the panel being edited - silently blocking or
   *  auto-deleting a field from a single MNUBAR-tab checkbox click would
   *  be far more surprising than a same-object hard block like
   *  windowConflictReason/pulldownConflictReason above. There's also no
   *  reachable single ON-transition to intercept the way there is for a
   *  flag keyword: the violation is a property of the record's field
   *  list as a whole, which can change from either side (placing a new
   *  field, or deleting the one menu-bar field) - a note recomputed on
   *  every render, like dftOutputRequirementNote's own hint-small line,
   *  fits this shape far better than a guarded commit() ever could.
   *
   *  Returns null when the record is compliant (exactly one menu-bar
   *  entry, no other displayable fields), or a single message naming
   *  whichever of the two independent problems apply (both are named
   *  together, joined, when both are true at once). */
  function mnubarFieldShapeNote(fields) {
    var all = fields || [];
    var menuBarEntries = all.filter(function (f) { return (f.keywords || []).some(function (k) { return k.name === 'MNUBARCHC'; }); });
    var isDisplayable = function (f) { return f.usage === 'O' || f.usage === 'I' || f.usage === 'B'; };
    var otherDisplayableFields = all.filter(function (f) {
      return f.nameType === 'FIELD' && menuBarEntries.indexOf(f) === -1 && isDisplayable(f);
    });

    var entryLabel = function (f) { return f.nameType === 'CONSTANT' ? (f.constantValue != null ? "'" + f.constantValue + "'" : '(constant)') : f.name; };

    var problems = [];
    if (menuBarEntries.length === 0) {
      problems.push('no menu-bar field yet (a field or constant with one or more MNUBARCHC keywords)');
    } else if (menuBarEntries.length > 1) {
      problems.push('more than one menu-bar field (' + menuBarEntries.map(entryLabel).join(', ') + ') - only one is allowed');
    }
    if (otherDisplayableFields.length) {
      problems.push('displayable field(s) other than the menu-bar field (' + otherDisplayableFields.map(entryLabel).join(', ') + ')');
    }
    if (!problems.length) return null;
    return 'A menu-bar record must contain exactly one menu-bar field and no other displayable fields (per the DDS Reference) - this record currently has ' + problems.join(' and ') + '.';
  }

  /** Reads the field's "General keywords" (real SDA's category, not this
   *  file's ALIAS which is just plain text here). Text-bearing keywords
   *  come back as their raw (already-quoted-if-needed) parameter string for
   *  the caller to display/edit; boolean ones as true/false. CNTFLD (bug
   *  fix: previously entirely absent from this list - see
   *  GENERAL_FIELD_KEYWORD_ROWS's own comment in webviewClientHelpers.js
   *  for why "dspfEngine.js's continued-entry preview already handles
   *  CNTFLD" was true for RENDERING but not for EDITING, and shouldn't have
   *  been read as covering both) is a bare numeric parameter, same shape as
   *  ALIAS/FLDCSRPRG. HLPID (task D4 - a CONSTANT field-level keyword per
   *  IBM's own DDS reference, linking the constant to a HLPARA-referenced
   *  help panel) is included here rather than as its own picker since it's
   *  a single bare-identifier keyword, the same shape as ALIAS/FLDCSRPRG
   *  already handled below - no separate D4 General-keywords screen was
   *  needed since generalFieldKeywordsHtml already covers every other
   *  keyword real SDA's constant-specific General screen shows (ALIAS/
   *  INDTXT/DFT/PUTRETAIN/OVRDTA/OVRATR/NOCCSID), and Colors/Display
   *  Attributes are likewise already covered by the shared
   *  colorAttrEditorHtml (D1) - constants were never gated out of either. */
  function getGeneralFieldKeywords(keywords) {
    var find = function (name) { var k = (keywords || []).find(function (k) { return k.name === name; }); return k ? (k.parameters || '') : ''; };
    var has = function (name) { return (keywords || []).some(function (k) { return k.name === name; }); };
    return {
      alias: find('ALIAS'),
      indtxt: find('INDTXT'),
      dft: find('DFT'),
      dftval: find('DFTVAL'),
      fldcsrprg: find('FLDCSRPRG'),
      hlpid: find('HLPID'),
      putretain: has('PUTRETAIN'),
      ovrdta: has('OVRDTA'),
      ovratr: has('OVRATR'),
      chrid: has('CHRID'),
      igcalttyp: has('IGCALTTYP'),
      noccsid: has('NOCCSID'),
    };
  }

  /** Returns a NEW keywords array reflecting `state` (same shape as
   *  getGeneralFieldKeywords returns) - text fields take the parameter
   *  string as-is (caller supplies quoting, matching how the generic
   *  keyword editor already works, since these vary too much in shape -
   *  e.g. ALIAS/FLDCSRPRG/HLPID take a bare name, DFT/DFTVAL/INDTXT take a
   *  quoted string - to usefully auto-quote here); blank/false removes the
   *  keyword entirely. */
  function setGeneralFieldKeywords(keywords, state) {
    var s = state || {};
    var TEXT = { alias: 'ALIAS', indtxt: 'INDTXT', dft: 'DFT', dftval: 'DFTVAL', fldcsrprg: 'FLDCSRPRG', hlpid: 'HLPID' };
    var BOOL = { putretain: 'PUTRETAIN', ovrdta: 'OVRDTA', ovratr: 'OVRATR', chrid: 'CHRID', igcalttyp: 'IGCALTTYP', noccsid: 'NOCCSID' };
    var removeNames = Object.keys(TEXT).map(function (k) { return TEXT[k]; }).concat(Object.keys(BOOL).map(function (k) { return BOOL[k]; }));
    var next = (keywords || []).filter(function (k) { return removeNames.indexOf(k.name) < 0; });
    Object.keys(TEXT).forEach(function (k) {
      var v = (s[k] || '').toString().trim();
      if (v) next = next.concat([{ name: TEXT[k], parameters: v, conditions: [], raw: '', sourceLines: [] }]);
    });
    Object.keys(BOOL).forEach(function (k) {
      if (s[k]) next = next.concat([{ name: BOOL[k], parameters: '', conditions: [], raw: '', sourceLines: [] }]);
    });
    return next;
  }

  // ---------------------------------------------------------------------
  // L79 - REFFLD (Referenced Field) itself, as a directly-editable
  // "Define Database Reference" panel (previously only reachable via the
  // "Resolve Referenced Field" action, which needs the field to ALREADY
  // be a reference and a live Code for i connection - real SDA lets you
  // type REFFLD's own parameters with neither). Grammar, confirmed
  // against the DDS Reference's own REFFLD entry for display files:
  //   REFFLD([record-format-name/]referenced-field-name
  //          [{*SRC | [library-name/]database-file-name}])
  // - the field name is required whenever REFFLD is written at all (even
  // if it matches the field being defined); record-format-name is only
  // needed when the referenced file has more than one format; *SRC means
  // "look in this same DDS source" and is mutually exclusive with an
  // explicit [library/]file. Position 29 ('R', field.isReference - NOT a
  // keyword) is required for REFFLD to mean anything, but is also valid
  // completely alone ("same-named field", falling back to the file-level
  // REF keyword or *SRC by default) - so REFFLD itself is only written
  // once at least one of its own parts is actually filled in.
  // ---------------------------------------------------------------------

  /** Parses REFFLD's raw parameter text into its structured parts. Doesn't
   *  validate that `fieldName` is non-blank when `present` - callers (see
   *  formatReffldParams) decide what an "empty" REFFLD means for their
   *  purposes. */
  function parseReffldParams(paramText) {
    var trimmed = (paramText || '').trim();
    if (!trimmed) return { present: false, recordFormat: '', fieldName: '', useSrc: false, library: '', file: '' };
    var tokens = trimmed.split(/\s+/).filter(Boolean);
    var first = tokens[0];
    var slash1 = first.indexOf('/');
    var recordFormat = slash1 >= 0 ? first.slice(0, slash1) : '';
    var fieldName = slash1 >= 0 ? first.slice(slash1 + 1) : first;
    var useSrc = false;
    var library = '';
    var file = '';
    if (tokens[1]) {
      if (tokens[1].toUpperCase() === '*SRC') {
        useSrc = true;
      } else {
        var slash2 = tokens[1].indexOf('/');
        library = slash2 >= 0 ? tokens[1].slice(0, slash2) : '';
        file = slash2 >= 0 ? tokens[1].slice(slash2 + 1) : tokens[1];
      }
    }
    return { present: true, recordFormat: recordFormat, fieldName: fieldName, useSrc: useSrc, library: library, file: file };
  }

  /** Inverse of parseReffldParams - returns '' (write no REFFLD keyword
   *  at all) when `fieldName` is blank, since REFFLD's field-name
   *  parameter is always required the moment REFFLD is written. */
  function formatReffldParams(state) {
    var s = state || {};
    var fieldName = (s.fieldName || '').trim();
    if (!fieldName) return '';
    var recordFormat = (s.recordFormat || '').trim();
    var first = recordFormat ? recordFormat + '/' + fieldName : fieldName;
    var second = '';
    if (s.useSrc) {
      second = '*SRC';
    } else {
      var file = (s.file || '').trim();
      if (file) {
        var library = (s.library || '').trim();
        second = library ? library + '/' + file : file;
      }
    }
    return second ? first + ' ' + second : first;
  }

  /** Reads the full "Define Database Reference" panel state for `field`:
   *  whether it's a reference field at all (position 29 'R' -
   *  `field.isReference`, not a keyword - so this takes the FIELD, not
   *  just its keywords) plus REFFLD's own structured parameters when
   *  present. */
  function getReffldState(field) {
    var reffld = ((field && field.keywords) || []).find(function (k) { return k.name === 'REFFLD'; });
    var parsed = parseReffldParams(reffld ? reffld.parameters : '');
    return {
      isReference: !!(field && field.isReference),
      recordFormat: parsed.recordFormat,
      fieldName: parsed.fieldName,
      useSrc: parsed.useSrc,
      library: parsed.library,
      file: parsed.file,
    };
  }

  /** Inverse of getReffldState for the keywords half only - `isReference`
   *  itself is a field-level property, not a keyword, so the caller (the
   *  webview) applies it directly via DspfWriter.applyFieldUpdate's own
   *  `isReference` update alongside whatever this returns. Returns a NEW
   *  keywords array: `state.isReference` false always drops REFFLD (it's
   *  meaningless without position 29 'R'); true only writes REFFLD when
   *  at least one of record-format/field-name/*SRC/file/library was
   *  actually filled in (bare 'R' with nothing else is valid DDS on its
   *  own - see this section's own header comment) - and when it does,
   *  defaults the field-name part to `currentFieldName` (this field's own
   *  name) rather than leaving REFFLD's always-required field name blank. */
  function applyReffldState(keywords, currentFieldName, state) {
    var s = state || {};
    var next = (keywords || []).filter(function (k) { return k.name !== 'REFFLD'; });
    if (s.isReference) {
      var hasAnyPart = !!((s.recordFormat || '').trim() || (s.fieldName || '').trim() || s.useSrc || (s.file || '').trim() || (s.library || '').trim());
      if (hasAnyPart) {
        var fieldName = (s.fieldName || '').trim() || currentFieldName || '';
        var params = formatReffldParams({ recordFormat: s.recordFormat, fieldName: fieldName, useSrc: s.useSrc, library: s.library, file: s.file });
        if (params) next = next.concat([{ name: 'REFFLD', parameters: params, conditions: [], raw: '', sourceLines: [] }]);
      }
    }
    return next;
  }

  /** Reads the field's database-reference OVERRIDE flags - DLTCHK (ignore
   *  the referenced field's own validity-check keywords) and DLTEDT
   *  (ignore its edit keywords) - only meaningful alongside REFFLD/REF
   *  (see getReffldState/applyReffldState above, and the "Resolve
   *  Referenced Field" feature for populating length/type/decimals from a
   *  live system) - not duplicated here. */
  function getReferenceOverrides(keywords) {
    var has = function (name) { return (keywords || []).some(function (k) { return k.name === name; }); };
    return { dltchk: has('DLTCHK'), dltedt: has('DLTEDT') };
  }

  /** Returns a NEW keywords array with DLTCHK/DLTEDT set to match `state`
   *  ({ dltchk, dltedt }: booleans). */
  function setReferenceOverrides(keywords, state) {
    var s = state || {};
    var toRemove = [];
    if (!s.dltchk) toRemove.push('DLTCHK');
    if (!s.dltedt) toRemove.push('DLTEDT');
    var next = (keywords || []).filter(function (k) { return toRemove.indexOf(k.name) < 0; });
    if (s.dltchk && !next.some(function (k) { return k.name === 'DLTCHK'; })) next = next.concat([{ name: 'DLTCHK', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
    if (s.dltedt && !next.some(function (k) { return k.name === 'DLTEDT'; })) next = next.concat([{ name: 'DLTEDT', parameters: '', conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  // ---------------------------------------------------------------------
  // L79 - MSGID's own structured parameters, as directly-editable prompts
  // (previously a single opaque free-text box with just a hint string -
  // real SDA's own "Define Message ID" screen (screens/field-level/
  // character/message-id/image171.png) shows Message prefix / Message
  // identifier / Message file / Library as four separate prompts).
  // Grammar, confirmed against the DDS Reference's own MSGID entry:
  //   MSGID(message-identifier [library-name/]message-file)
  //   or MSGID(*NONE)
  // where message-identifier is [msg-prefix]&field-name (an optional
  // literal prefix immediately followed by an ampersand and the name of
  // the field that supplies the actual message ID/message number at
  // runtime). The DDS Reference also documents a rarer form combining
  // MULTIPLE &field references and literal constants within the same
  // message-identifier (for splitting the id's own bytes across more than
  // one field) - too structurally varied to safely decompose into fixed
  // prompts (same "flag it, don't guess" posture the KEYBRD audit already
  // took elsewhere in this file), so parseMsgIdParams reports
  // `structured:false` for anything outside the common single-field form
  // and the caller falls back to raw-text editing for those.
  // ---------------------------------------------------------------------

  /** Parses MSGID's raw parameter text into its structured parts, or
   *  reports `structured:false` (with `raw` set to the original text
   *  unchanged) when it's `*NONE`, blank, or a form parseMsgIdParams
   *  doesn't recognize - see this section's own header comment for why
   *  some valid MSGID text can't be decomposed. */
  function parseMsgIdParams(paramText) {
    var trimmed = (paramText || '').trim();
    if (!trimmed) return { structured: true, none: false, prefix: '', fieldName: '', library: '', msgFile: '', raw: trimmed };
    if (trimmed.toUpperCase() === '*NONE') return { structured: true, none: true, prefix: '', fieldName: '', library: '', msgFile: '', raw: trimmed };
    var tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length !== 2) return { structured: false, none: false, prefix: '', fieldName: '', library: '', msgFile: '', raw: trimmed };
    var idToken = tokens[0];
    var ampIdx = idToken.indexOf('&');
    if (ampIdx < 0) return { structured: false, none: false, prefix: '', fieldName: '', library: '', msgFile: '', raw: trimmed };
    var prefix = idToken.slice(0, ampIdx);
    var fieldName = idToken.slice(ampIdx + 1);
    if (!fieldName) return { structured: false, none: false, prefix: '', fieldName: '', library: '', msgFile: '', raw: trimmed };
    var fileToken = tokens[1];
    var slash = fileToken.indexOf('/');
    var library = slash >= 0 ? fileToken.slice(0, slash) : '';
    var msgFile = slash >= 0 ? fileToken.slice(slash + 1) : fileToken;
    if (!msgFile) return { structured: false, none: false, prefix: '', fieldName: '', library: '', msgFile: '', raw: trimmed };
    return { structured: true, none: false, prefix: prefix, fieldName: fieldName, library: library, msgFile: msgFile, raw: trimmed };
  }

  /** Inverse of parseMsgIdParams - returns '' (write no MSGID keyword at
   *  all) when `fieldName` or `msgFile` is blank, since both are always
   *  required for the structured form (mirrors CHKMSGID's own
   *  both-or-neither rule elsewhere in this file). */
  function formatMsgIdParams(state) {
    var s = state || {};
    if (s.none) return '*NONE';
    var fieldName = (s.fieldName || '').trim();
    var msgFile = (s.msgFile || '').trim();
    if (!fieldName || !msgFile) return '';
    var idToken = (s.prefix || '').trim() + '&' + fieldName;
    var library = (s.library || '').trim();
    var fileToken = library ? library + '/' + msgFile : msgFile;
    return idToken + ' ' + fileToken;
  }

  // ---------------------------------------------------------------------
  // I-33 - MSGCON's own structured parameters, as directly-editable
  // prompts, same treatment MSGID's own parameters got under L79. Grammar,
  // confirmed against the DDS Reference's own MSGCON entry:
  //   MSGCON(length message-ID [library-name/]message-file-name)
  // where length is 1-132 (the constant's max display length), message-ID
  // is the literal message description identifier (NOT a &field
  // reference - MSGCON has no field-reference form, unlike MSGID), and
  // the file token is the message file, optionally library-qualified.
  // This is one of only six documented ways to supply a constant field's
  // displayed value (see docs/sda-reference/source/DDS_Keyword_V7r6.txt's
  // "Constant fields" rules, ~line 671): explicit/implicit DFT, DATE,
  // TIME, SYSNAME, USER, or MSGCON - the last of these was entirely
  // missing from iSDA before this task.
  // ---------------------------------------------------------------------

  /** Parses MSGCON's raw parameter text into its structured parts, or
   *  reports `structured:false` (with `raw` set to the original text
   *  unchanged) for blank text or anything not matching the documented
   *  3-token grammar. */
  function parseMsgConParams(paramText) {
    var trimmed = (paramText || '').trim();
    if (!trimmed) return { structured: true, length: '', msgId: '', library: '', msgFile: '', raw: trimmed };
    var tokens = trimmed.split(/\s+/).filter(Boolean);
    if (tokens.length !== 3) return { structured: false, length: '', msgId: '', library: '', msgFile: '', raw: trimmed };
    var length = tokens[0];
    if (!/^[0-9]+$/.test(length)) return { structured: false, length: '', msgId: '', library: '', msgFile: '', raw: trimmed };
    var msgId = tokens[1];
    var fileToken = tokens[2];
    var slash = fileToken.indexOf('/');
    var library = slash >= 0 ? fileToken.slice(0, slash) : '';
    var msgFile = slash >= 0 ? fileToken.slice(slash + 1) : fileToken;
    if (!msgId || !msgFile) return { structured: false, length: '', msgId: '', library: '', msgFile: '', raw: trimmed };
    return { structured: true, length: length, msgId: msgId, library: library, msgFile: msgFile, raw: trimmed };
  }

  /** Inverse of parseMsgConParams - returns '' (write no MSGCON keyword at
   *  all) when `length`, `msgId`, or `msgFile` is blank, since all three
   *  are always required by MSGCON's documented grammar. */
  function formatMsgConParams(state) {
    var s = state || {};
    var length = (s.length || '').trim();
    var msgId = (s.msgId || '').trim();
    var msgFile = (s.msgFile || '').trim();
    if (!length || !msgId || !msgFile) return '';
    var library = (s.library || '').trim();
    var fileToken = library ? library + '/' + msgFile : msgFile;
    return length + ' ' + msgId + ' ' + fileToken;
  }

  /** Reads the field's MSGID keyword (message-identifier-sourced field
   *  text) as its raw parameter string - unlike ERRMSG/WDWTITLE, MSGID's
   *  argument is either "[msg-prefix] &field-name" or "[msgid-prefix]
   *  msg-id message-file [library/]" - too structurally varied to usefully
   *  decompose here, so (like getGeneralFieldKeywords' text fields) this
   *  hands back the parameter text as-is for the caller to parse/display.
   *  NOTE: kept for backward compatibility with any caller still on the
   *  single-instance shape; getMessageIdInstances/setMessageIdInstances
   *  below are the Task L5 replacement (multiple independently-conditioned
   *  MSGID keywords - a real, common DDS pattern: e.g. MSGID(&MIC001
   *  HISLIB/HISMSGF) under one response indicator, coexisting with a
   *  fallback MSGID(*NONE) with no conditioning at all). */
  function getMessageId(keywords) {
    var k = (keywords || []).find(function (k) { return k.name === 'MSGID'; });
    return k ? (k.parameters || '') : '';
  }

  /** Returns a NEW keywords array with MSGID's parameters replaced by
   *  `parameters` (caller-supplied, already in valid MSGID argument form),
   *  or removed entirely if blank. NOTE: single-instance - see
   *  setMessageIdInstances below for the Task L5 replacement. */
  function setMessageId(keywords, parameters) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'MSGID'; });
    var trimmed = (parameters || '').trim();
    if (trimmed) next = next.concat([{ name: 'MSGID', parameters: trimmed, conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  /** Task L5 - MSGID as Task L1's repeatable, independently-conditioned
   *  instances. Real DDS allows a field to carry MULTIPLE MSGID keywords,
   *  each under its own conditioning, with the first whose condition is
   *  satisfied winning at runtime (same "Priority among Selected
   *  Keywords" rule ERRMSG/ERRMSGID's own L1b entry notes) - a documented,
   *  common pattern (e.g. one MSGID(&fieldname msgfile) conditioned on an
   *  error indicator, alongside an unconditioned fallback MSGID(*NONE)).
   *  MSGID's own argument text stays OPAQUE here, unchanged from
   *  getMessageId/setMessageId above - this only adds the repeatable/
   *  independently-conditioned dimension Task L5 is about, layered on top
   *  via Task L1's own getRepeatableKeywordInstances/
   *  setRepeatableKeywordInstances (which already treat any keyword's
   *  parameters as opaque, caller-formatted text - no new decomposition
   *  needed, unlike ERRMSG/ERRMSGID's L1b, which DID need to split out a
   *  response indicator from within the keyword's own parameters). */
  var MESSAGE_ID_NAMES = ['MSGID'];

  function getMessageIdInstances(keywords) {
    return getRepeatableKeywordInstances(keywords, MESSAGE_ID_NAMES);
  }

  /** Returns a NEW keywords array built from `instances` (`{ parameters,
   *  conditions }[]`, same shape getMessageIdInstances returns), replacing
   *  every existing MSGID. An instance needs non-blank `parameters` -
   *  incomplete/blank entries are dropped rather than writing an empty
   *  MSGID(), same convention as every other setX in this file. */
  function setMessageIdInstances(keywords, instances) {
    var raw = (instances || [])
      .map(function (inst) {
        if (!inst) return null;
        var trimmed = (inst.parameters || '').trim();
        if (!trimmed) return null;
        return { name: 'MSGID', parameters: trimmed, conditions: inst.conditions || [] };
      })
      .filter(Boolean);
    return setRepeatableKeywordInstances(keywords, MESSAGE_ID_NAMES, raw);
  }

  /** Task I-73 - MSGID's own position-dependent option-indicator rule,
   *  from its DDS Reference entry: "When more than one MSGID keyword is
   *  specified, option indicators are required on all except the last
   *  MSGID keyword on a field. Option indicators are not allowed on the
   *  last (or only) MSGID keyword specified on a field." (The first MSGID
   *  in effect is used, which is why the earlier ones must be
   *  conditioned - otherwise a later one could never be reached.)
   *
   *  Unlike a per-keyword exclusion this depends on an instance's
   *  POSITION among its siblings, and "last" changes as instances are
   *  added, removed or reordered, so it can't be a hard block on any one
   *  commit: a field with several MSGIDs is necessarily built one at a
   *  time, and every intermediate state (e.g. two unconditioned MSGIDs
   *  just after the second is added) breaks the "required" half. It is
   *  therefore split by direction:
   *   - the FORBIDDEN half is prevented in the UI where it can be -
   *     msgidInstanceAllowsConditioning hides the Conditioning toggle on
   *     the last/only instance (unless it already carries some, so a
   *     hand-edited one can still be cleared);
   *   - the REQUIRED half is advisory - msgidConditioningNotes returns
   *     the reminder lines for a live hint, same shape as L83's
   *     dftOutputRequirementNote.
   *  `instances` is getMessageIdInstances' own output, in keyword order. */
  function msgidInstanceAllowsConditioning(instances, inst) {
    var list = instances || [];
    var idx = list.indexOf(inst);
    if (idx < 0) return true; // not one of the list - don't second-guess
    if (idx < list.length - 1) return true;
    return (inst.conditions || []).length > 0;
  }

  /** Task I-73 - see msgidInstanceAllowsConditioning above. Returns an
   *  array of reminder lines (empty when the field's MSGIDs satisfy the
   *  rule): one naming every non-last MSGID that has no option indicator,
   *  and one if the last/only MSGID has any. Instances are numbered from
   *  1 in the order they appear on the field. */
  function msgidConditioningNotes(keywords) {
    var instances = getMessageIdInstances(keywords);
    var notes = [];
    var missing = [];
    instances.forEach(function (inst, i) {
      if (i < instances.length - 1 && (inst.conditions || []).length === 0) missing.push('#' + (i + 1));
    });
    if (missing.length) {
      notes.push('MSGID ' + missing.join(', ') + (missing.length === 1 ? ' needs' : ' need') + ' an option indicator: when a field has more than one MSGID, every one except the last must be conditioned (the first one in effect is used).');
    }
    if (instances.length) {
      var last = instances[instances.length - 1];
      if ((last.conditions || []).length > 0) {
        notes.push(instances.length > 1
          ? 'The last MSGID (#' + instances.length + ') cannot have option indicators - only the earlier ones can.'
          : "A field's only MSGID cannot have option indicators.");
      }
    }
    return notes;
  }

  // -----------------------------------------------------------------------
  // D5 - Menu-bar choice fields (MNB*/MNUACT): the remaining SDA "Select
  // Field Keywords"-family screens from docs/sda-reference/ task D5, all
  // under docs/sda-reference/screens/field-level/menu-bar-choice/. Two
  // field kinds share this territory:
  //   - MNB* fields (the menu-bar itself, carrying MNUBAR on their record -
  //     see the record-type wizard): MNUBARCHC (one per top-level choice,
  //     each naming the PULLDOWN record it opens) and MNUBARSEP (the
  //     separator line under the bar).
  //   - MNUACT-style fields (a SNGCHCFLD/MLTCHCFLD selection field, usually
  //     living INSIDE a PULLDOWN record): the Choice Selection Type
  //     keyword itself, then per-choice CHOICE/CHCCTL/CHCACCEL, then the
  //     three whole-field choice-color-state keywords CHCAVAIL/CHCUNAVAIL/
  //     CHCSLT.
  // Verified against IBM's own DDS reference and a real worked MNUBAR/
  // PULLDOWN/CHCCTL example (search: "RPG Example Using a Display File to
  // Display a Menu Bar (MNUBAR) with PULLDOWN and CHCCTL") rather than
  // guessed - matches DspfEngine.parseMenubarChoice/parseChoiceParams'
  // existing RENDER-side parsing exactly, so what this writes back is
  // guaranteed to still render correctly.
  // -----------------------------------------------------------------------

  /** Parses one CHOICE-shaped keyword's "id 'text'" or "id &variable"
   *  parameter form - shared by MNUBARCHC (id record-name 'text'/&var),
   *  CHOICE (id 'text'/&var), and CHCACCEL (id 'text'/&var). Returns
   *  { id: string, rest: string } where `rest` is whatever follows the id
   *  (either just the text/variable, or - for MNUBARCHC - the record name
   *  AND the text/variable together, left for the caller to split further). */
  function splitLeadingChoiceId(parameters) {
    var m = (parameters || '').trim().match(/^(\d+)\s+([\s\S]*)$/);
    return m ? { id: m[1], rest: m[2] } : { id: '', rest: (parameters || '').trim() };
  }

  /** Quotes `text` for a DDS literal argument (doubling embedded quotes),
   *  or returns a &variable reference as-is - the inverse of
   *  DspfEngine.parseChoiceParams/parseMenubarChoice's own text parsing. */
  function formatChoiceText(text) {
    var t = (text || '').trim();
    if (!t) return "''";
    if (t.charAt(0) === '&') return t;
    return "'" + t.replace(/'/g, "''") + "'";
  }

  /** MNUBARCHC(id pulldown-record-name ['text' | &text-field] [&return-field])
   *  - one per top-level menu-bar choice, field-level on the MNB* field,
   *  read back in the SAME order DspfEngine.widgetFromKeywords sorts them
   *  (ascending by id) so what round-trips through the picker matches
   *  what's already on screen. `text` accepts either a literal or a
   *  &field reference through the SAME single input box, following the
   *  same &-prefix convention formatChoiceText/getChoices already use for
   *  plain CHOICE - see DspfEngine.parseMenubarChoice's own doc comment
   *  for the DDS reference this matches (Task L3). `returnField`, when
   *  present, is always a &field reference (real SDA's "Return field"). */
  function getMenubarChoices(keywords) {
    return (keywords || [])
      .filter(function (k) { return k.name === 'MNUBARCHC'; })
      .map(function (k) {
        var m = (k.parameters || '').trim().match(/^(\d+)\s+(\S+)\s+((?:&\S+)|(?:'(?:[^']|'')*'))(?:\s+(&\S+))?/);
        if (!m) return { id: '', pulldownRecord: '', text: (k.parameters || '').trim(), returnField: '', conditions: k.conditions || [] };
        var text = m[3].charAt(0) === '&' ? m[3] : m[3].slice(1, -1).replace(/''/g, "'");
        return { id: m[1], pulldownRecord: m[2], text: text, returnField: m[4] || '', conditions: k.conditions || [] };
      });
  }

  /** Returns a NEW keywords array with every existing MNUBARCHC removed and
   *  replaced by one per entry in `choices`
   *  ({ id, pulldownRecord, text, returnField }), in the given order -
   *  blank/incomplete entries (no id, record, or text) are skipped rather
   *  than writing a malformed keyword. `returnField` is optional (real
   *  SDA's own screen leaves it blank most of the time); when supplied
   *  without a leading '&' one is added, since it's always a field
   *  reference, never a literal. Task I-34: `conditions` is preserved by
   *  choice-id across this batch rewrite when the caller's entry doesn't
   *  explicitly supply its own - same "preserve unless overridden"
   *  convention as setFileFlagKeyword/setChoiceColorState, closing the
   *  same silent-data-loss class of bug those had before I-2/I-3 fixed
   *  them (this list editor used to hard-code conditions: [] on every
   *  write, which would have silently wiped any conditioning set through
   *  the new per-choice Conditioning toggle the moment "Apply menu-bar
   *  choices" was next clicked). */
  function setMenubarChoices(keywords, choices) {
    var existingById = {};
    (keywords || []).forEach(function (k) {
      if (k.name !== 'MNUBARCHC') return;
      var id = splitLeadingChoiceId(k.parameters).id;
      if (id) existingById[id] = k.conditions || [];
    });
    var next = (keywords || []).filter(function (k) { return k.name !== 'MNUBARCHC'; });
    (choices || []).forEach(function (c) {
      var id = (c.id || '').trim();
      var record = (c.pulldownRecord || '').trim();
      var text = (c.text || '').trim();
      if (!id || !record || !text) return;
      var params = id + ' ' + record + ' ' + formatChoiceText(text);
      var returnField = (c.returnField || '').trim();
      if (returnField) params += ' ' + (returnField.charAt(0) === '&' ? returnField : '&' + returnField);
      var conditions = c.conditions !== undefined ? c.conditions : (existingById[id] || []);
      next = next.concat([{ name: 'MNUBARCHC', parameters: params, conditions: conditions, raw: '', sourceLines: [] }]);
    });
    return next;
  }

  /** Returns a NEW keywords array with the ONE MNUBARCHC keyword instance
   *  whose choice-number matches `id` given a new `conditions` array,
   *  leaving every other keyword (including other MNUBARCHC instances)
   *  completely untouched. Task I-34: MNUBARCHC is documented "Option
   *  indicators are valid for this keyword" - a reverse gap, no
   *  Conditioning UI existed for it at all before this task. Keyed by
   *  choice-id rather than ordinal position (unlike setCommandKeyAt's own
   *  index-based approach) because IBM's own MNUBARCHC text states
   *  duplicate choice-number values within a single menu-bar field are
   *  not allowed - the same uniqueness assumption the id-keyed editors in
   *  webviewClientHelpers.js already make. Powers the toggle's own
   *  immediate commit, independent of the batch "Apply menu-bar choices"
   *  button. */
  function setMenubarChoiceConditions(keywords, id, conditions) {
    var target = String(id || '').trim();
    var seen = false;
    return (keywords || []).map(function (k) {
      if (seen || k.name !== 'MNUBARCHC') return k;
      if (splitLeadingChoiceId(k.parameters).id !== target) return k;
      seen = true;
      return { name: k.name, parameters: k.parameters, conditions: conditions || [], raw: k.raw, sourceLines: k.sourceLines };
    });
  }

  /** MNUBARSEP((*COLOR color) (*DSPATR attrs) (*CHAR 'c')) - the menu-bar's
   *  own separator line, field-level on the MNB* field, at most one
   *  instance. Same bracketed-groups shape as WDWBORDER (see getWdwBorder)
   *  but with a SINGLE separator character rather than 8 border positions,
   *  and no dedicated "only write groups that are enabled" state needed
   *  beyond what's already present vs. absent. */
  function getMenubarSeparator(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'MNUBARSEP'; });
    var result = { color: '', attrs: [], char: '', conditions: k ? (k.conditions || []) : [] };
    if (!k) return result;
    var text = k.parameters || '';
    var colorM = /\*COLOR\s+([A-Z]+)/i.exec(text);
    if (colorM) result.color = colorM[1].toUpperCase();
    var attrM = /\*DSPATR\s+([^()]*)/i.exec(text);
    if (attrM) result.attrs = attrM[1].trim().split(/\s+/).filter(Boolean).map(function (s) { return s.toUpperCase(); });
    var charM = /\*CHAR\s+'([^']*)'/i.exec(text);
    if (charM) result.char = charM[1];
    return result;
  }

  /** Returns a NEW keywords array with MNUBARSEP built from `state` -
   *  `{ colorEnabled, color, attrsEnabled, attrs, charEnabled, char,
   *  conditions }` - removed entirely if none of the three groups are
   *  enabled. Task I-34: MNUBARSEP is documented "Option indicators are
   *  valid for this keyword" (reverse gap, no toggle existed before).
   *  `conditions`, when OMITTED, preserves whatever conditioning already
   *  existed - same convention as setFileFlagKeyword/setChoiceColorState. */
  function setMenubarSeparator(keywords, state) {
    var existing = (keywords || []).find(function (kw) { return kw.name === 'MNUBARSEP'; });
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'MNUBARSEP'; });
    var groups = [];
    if (state.colorEnabled && state.color) groups.push('(*COLOR ' + state.color + ')');
    if (state.attrsEnabled && state.attrs && state.attrs.length) groups.push('(*DSPATR ' + state.attrs.join(' ') + ')');
    if (state.charEnabled && state.char) groups.push("(*CHAR '" + state.char.charAt(0) + "')");
    if (groups.length) {
      var conditions = state.conditions !== undefined ? state.conditions : (existing ? (existing.conditions || []) : []);
      next = next.concat([{ name: 'MNUBARSEP', parameters: groups.join(' '), conditions: conditions, raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** The *param values real SDA's "Define Choice Selection Type" screen
   *  offers for SNGCHCFLD/MLTCHCFLD (see docs/sda-reference/screens/
   *  field-level/menu-bar-choice/choice-selection-type/image205.png) -
   *  grouped by the mutually-exclusive pairs the screen itself shows them
   *  in (only one of each pair applies at a time; *NUMCOL/*NUMROW/*GUTTER
   *  take a numeric argument instead of being a bare flag). */
  var CHOICE_SELECTION_FLAGS = ['*RSTCSR', '*NORSTCSR', '*SLTIND', '*NOSLTIND', '*AUTOSLT', '*NOAUTOSLT', '*AUTOSLTENH', '*AUTOENT', '*NOAUTOENT', '*AUTOENTNN'];

  /** Reads which of SNGCHCFLD/MLTCHCFLD is present and its *param list -
   *  { kind: ''|'SNGCHCFLD'|'MLTCHCFLD', flags: string[] (e.g. ['*AUTOENT']),
   *  numCol: string, numRow: string, gutter: string } - a field carries at
   *  most one of these two keywords (the two selection-type radio options
   *  on the SDA screen), same "at most one at a time" shape as
   *  getValidityCheck's RANGE/COMP/VALUES. */
  function getChoiceSelectionType(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'SNGCHCFLD' || kw.name === 'MLTCHCFLD'; });
    var result = { kind: '', flags: [], numCol: '', numRow: '', gutter: '' };
    if (!k) return result;
    result.kind = k.name;
    // Task I-63: the layout parameters are IBM's parenthesized groups
    // `(*NUMCOL 3)` (a space INSIDE the parens), which whitespace
    // tokenizing would split into `(*NUMCOL` / `3)` - so read them first
    // with the shared reader, then tokenize only what's left for the flags.
    result.numCol = readChoiceLayoutNumber(k.parameters, 'NUMCOL');
    result.numRow = readChoiceLayoutNumber(k.parameters, 'NUMROW');
    result.gutter = readChoiceLayoutNumber(k.parameters, 'GUTTER');
    var tokens = stripChoiceLayoutParams(k.parameters).trim().split(/\s+/).filter(Boolean);
    tokens.forEach(function (t) {
      var upper = t.toUpperCase();
      if (CHOICE_SELECTION_FLAGS.indexOf(upper) >= 0) result.flags.push(upper);
    });
    return result;
  }

  /** Params documented ONLY on SNGCHCFLD's own format string - IBM's
   *  MLTCHCFLD format string is `MLTCHCFLD[([*RSTCSR|*NORSTCSR]
   *  [*NOSLTIND|*SLTIND] [...*NUMCOL/*NUMROW/*GUTTER...])]` - no
   *  AUTOSLT/AUTOENT family at all. Task I-34. */
  var SNGCHCFLD_ONLY_FLAGS = ['*AUTOSLT', '*NOAUTOSLT', '*AUTOSLTENH', '*AUTOENT', '*NOAUTOENT', '*AUTOENTNN'];

  /** Returns a NEW keywords array with SNGCHCFLD/MLTCHCFLD replaced by one
   *  keyword built from `state` (same shape getChoiceSelectionType
   *  returns) - removed entirely if `state.kind` is blank. Task I-34: when
   *  `state.kind` is MLTCHCFLD, any SNGCHCFLD_ONLY_FLAGS present in
   *  `state.flags` are silently dropped rather than written - IBM's own
   *  MLTCHCFLD format string has no AUTOSLT/AUTOENT family at all, so
   *  writing one would produce DDS that fails to compile. Filtered here
   *  (the actual DDS-writing layer) as well as in
   *  wireChoiceSelectionTypeEditor's own UI-level guard, so this stays
   *  correct even if some other future caller passes them directly. */
  function setChoiceSelectionType(keywords, state) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'SNGCHCFLD' && kw.name !== 'MLTCHCFLD'; });
    if (!state || !state.kind) return next;
    var parts = (state.flags || []).slice();
    if (state.kind === 'MLTCHCFLD') {
      parts = parts.filter(function (f) { return SNGCHCFLD_ONLY_FLAGS.indexOf(f) < 0; });
    }
    // Task I-63: IBM's shape is `(*NUMCOL n)` / `(*NUMROW n)` / `(*GUTTER
    // n)` - parenthesized groups with a space, not `*NUMCOL(n)`. A field
    // takes *NUMCOL OR *NUMROW, never both (*NUMCOL wins if a caller
    // passes both - the editor blocks that before it gets here), and
    // *GUTTER "can only be specified if either *NUMCOL or *NUMROW has
    // been specified", so it's dropped without one. Same backstop
    // semantics as setPshbtnfld.
    var numCol = parseInt(state.numCol, 10);
    var numRow = parseInt(state.numRow, 10);
    var gutter = parseInt(state.gutter, 10);
    if (numCol > 0) parts.push('(*NUMCOL ' + numCol + ')');
    else if (numRow > 0) parts.push('(*NUMROW ' + numRow + ')');
    if (gutter > 0 && (numCol > 0 || numRow > 0)) parts.push('(*GUTTER ' + gutter + ')');
    next = next.concat([{ name: state.kind, parameters: parts.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  /** CHOICE(id 'text' [*SPACEB]) - one per choice on a SNGCHCFLD/MLTCHCFLD
   *  field. `text` mirrors DspfEngine.parseChoiceParams' own shape;
   *  `spaceBefore` (Task I-34: IBM's own format string lists an optional
   *  trailing *SPACEB - "insert a blank space/line before this choice",
   *  for logical grouping of consecutively-numbered choices - previously
   *  unmodeled entirely) and `conditions` (Task I-34: CHOICE is
   *  documented "Option indicators are valid for this keyword" - a
   *  reverse gap, no Conditioning UI existed for it before) are new. */
  function getChoices(keywords) {
    return (keywords || [])
      .filter(function (k) { return k.name === 'CHOICE'; })
      .map(function (k) {
        var split = splitLeadingChoiceId(k.parameters);
        var rest = split.rest.trim();
        var spaceBefore = /\*SPACEB\s*$/i.test(rest);
        if (spaceBefore) rest = rest.replace(/\*SPACEB\s*$/i, '').trim();
        var text = rest.charAt(0) === '&' ? rest : rest.replace(/^'|'$/g, '').replace(/''/g, "'");
        return { id: split.id, text: text, spaceBefore: spaceBefore, conditions: k.conditions || [] };
      });
  }

  /** Returns a NEW keywords array with every existing CHOICE removed and
   *  replaced by one per entry in `choices` ({ id, text, spaceBefore }) -
   *  blank entries (no id or text) skipped. Task I-34: `conditions` is
   *  preserved by choice-id across this batch rewrite when the caller's
   *  entry doesn't explicitly supply its own - same "preserve unless
   *  overridden" convention setMenubarChoices now also follows, closing
   *  the same silent-data-loss class of bug I-2/I-3 fixed for
   *  setFileFlagKeyword/setChoiceColorState (this editor used to
   *  hard-code conditions: [] on every write, which would have silently
   *  wiped any conditioning set through the new per-choice Conditioning
   *  toggle the moment "Apply choice keywords" was next clicked). */
  function setChoices(keywords, choices) {
    var existingByChoiceId = {};
    (keywords || []).forEach(function (k) {
      if (k.name !== 'CHOICE') return;
      var id = splitLeadingChoiceId(k.parameters).id;
      if (id) existingByChoiceId[id] = k.conditions || [];
    });
    var next = (keywords || []).filter(function (k) { return k.name !== 'CHOICE'; });
    (choices || []).forEach(function (c) {
      var id = (c.id || '').trim();
      var text = (c.text || '').trim();
      if (!id || !text) return;
      var params = id + ' ' + formatChoiceText(text);
      if (c.spaceBefore) params += ' *SPACEB';
      var conditions = c.conditions !== undefined ? c.conditions : (existingByChoiceId[id] || []);
      next = next.concat([{ name: 'CHOICE', parameters: params, conditions: conditions, raw: '', sourceLines: [] }]);
    });
    return next;
  }

  /** Returns a NEW keywords array with the ONE CHOICE keyword instance
   *  whose choice-number matches `id` given a new `conditions` array,
   *  leaving every other keyword (including other CHOICE instances)
   *  completely untouched. Keyed by choice-id rather than ordinal
   *  position (unlike setCommandKeyAt's own index-based approach) because
   *  IBM's own CHOICE text states duplicate choice-number values within a
   *  selection field are not allowed - the same uniqueness assumption
   *  choiceKeywordsListHtml's own id-keyed merge already makes. Powers
   *  the toggle's own immediate commit, independent of the batch "Apply
   *  choice keywords" button. Task I-34. */
  function setChoiceConditions(keywords, id, conditions) {
    var target = String(id || '').trim();
    var seen = false;
    return (keywords || []).map(function (k) {
      if (seen || k.name !== 'CHOICE') return k;
      if (splitLeadingChoiceId(k.parameters).id !== target) return k;
      seen = true;
      return { name: k.name, parameters: k.parameters, conditions: conditions || [], raw: k.raw, sourceLines: k.sourceLines };
    });
  }

  /** CHCACCEL(id 'text') - one per choice's accelerator-key text, same
   *  list shape as getChoices/setChoices. */
  function getChoiceAccelerators(keywords) {
    return (keywords || [])
      .filter(function (k) { return k.name === 'CHCACCEL'; })
      .map(function (k) {
        var split = splitLeadingChoiceId(k.parameters);
        var text = split.rest.charAt(0) === '&' ? split.rest : split.rest.replace(/^'|'$/g, '').replace(/''/g, "'");
        return { id: split.id, text: text };
      });
  }

  /** Returns a NEW keywords array with every existing CHCACCEL removed and
   *  replaced by one per entry in `accelerators` ({ id, text }) - blank
   *  entries skipped. */
  function setChoiceAccelerators(keywords, accelerators) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'CHCACCEL'; });
    (accelerators || []).forEach(function (a) {
      var id = (a.id || '').trim();
      var text = (a.text || '').trim();
      if (!id || !text) return;
      next = next.concat([{ name: 'CHCACCEL', parameters: id + ' ' + formatChoiceText(text), conditions: [], raw: '', sourceLines: [] }]);
    });
    return next;
  }

  /** CHCCTL(id control-field [message-id message-file [library]]) - one per
   *  choice, controlling whether that choice is selectable (control-field
   *  non-zero => unavailable) and what tells the user why if they try to
   *  pick it anyway. `messageId`/`messageFile` are themselves either a
   *  literal message ID + file name, or &variables - left as raw text
   *  since (like getMessageId) the argument shapes vary too much to
   *  usefully decompose further. */
  function getChoiceControls(keywords) {
    return (keywords || [])
      .filter(function (k) { return k.name === 'CHCCTL'; })
      .map(function (k) {
        var split = splitLeadingChoiceId(k.parameters);
        var tokens = split.rest.split(/\s+/).filter(Boolean);
        var messageFileToken = tokens[2] || '';
        var libMatch = /^([^/]+)\/(.+)$/.exec(messageFileToken);
        return {
          id: split.id,
          controlField: tokens[0] || '',
          messageId: tokens[1] || '',
          messageFile: libMatch ? libMatch[2] : messageFileToken,
          library: libMatch ? libMatch[1] : '',
        };
      });
  }

  /** Returns a NEW keywords array with every existing CHCCTL removed and
   *  replaced by one per entry in `controls` ({ id, controlField,
   *  messageId, messageFile, library }) - entries need at least id and
   *  controlField; messageId/messageFile/library are optional (a choice
   *  can be controlled with no explanatory message). `library`, if given,
   *  is joined onto messageFile as `library/messageFile` DDS's qualified-
   *  name form expects. */
  function setChoiceControls(keywords, controls) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'CHCCTL'; });
    (controls || []).forEach(function (c) {
      var id = (c.id || '').trim();
      var controlField = (c.controlField || '').trim();
      if (!id || !controlField) return;
      var parts = [controlField];
      var messageId = (c.messageId || '').trim();
      var messageFile = (c.messageFile || '').trim();
      var library = (c.library || '').trim();
      if (messageId && messageFile) {
        parts.push(messageId);
        parts.push(library ? library + '/' + messageFile : messageFile);
      }
      next = next.concat([{ name: 'CHCCTL', parameters: id + ' ' + parts.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    });
    return next;
  }

  var CHOICE_COLOR_STATE_KEYWORDS = ['CHCAVAIL', 'CHCUNAVAIL', 'CHCSLT'];

  /** CHCAVAIL/CHCUNAVAIL/CHCSLT ((*COLOR c) (*DSPATR a a)) - the three
   *  whole-field (not per-choice) color/attribute states a SNGCHCFLD/
   *  MLTCHCFLD field's choices can be shown in: available, unavailable
   *  (see CHCCTL above), and selected. Same bracketed-groups shape as
   *  MNUBARSEP/WDWBORDER minus the *CHAR group (these three have no
   *  character sub-option on the real SDA screen). `keywordName` must be
   *  one of CHOICE_COLOR_STATE_KEYWORDS, or ENTFLDATR (see that keyword's
   *  own call sites - shares this same "(*COLOR c) (*DSPATR a a)" shape,
   *  plus the two extra fields below that only it uses).
   *  Task I-59: `present` (true whenever the keyword exists at all,
   *  regardless of color/attrs) and `cursorVisible` ('' / 'CURSOR' /
   *  'NOCURSOR', the bare cursor-visible literal ENTFLDATR's own DDS
   *  Reference documents - "ENTFLDATR[([color] [display attribute]
   *  [cursor visible])]") are new - both were previously silently
   *  unread/undiscoverable by this getter, which only ever looked for
   *  *COLOR/*DSPATR. Harmless for CHCAVAIL/CHCUNAVAIL/CHCSLT (neither
   *  ever appears in their own DDS Reference sections, so `cursorVisible`
   *  is always '' for them; `present` is simply true/false exactly when
   *  the keyword exists, same information the three existing callers
   *  already had by checking `!!current.color || current.attrs.length`
   *  - which is why this change doesn't alter their own behavior). */
  function getChoiceColorState(keywords, keywordName) {
    var k = (keywords || []).find(function (kw) { return kw.name === keywordName; });
    var result = { present: false, color: '', attrs: [], cursorVisible: '', conditions: k ? (k.conditions || []) : [] };
    if (!k) return result;
    result.present = true;
    var text = k.parameters || '';
    var colorM = /\*COLOR\s+([A-Z]+)/i.exec(text);
    if (colorM) result.color = colorM[1].toUpperCase();
    var attrM = /\*DSPATR\s+([^()]*)/i.exec(text);
    if (attrM) result.attrs = attrM[1].trim().split(/\s+/).filter(Boolean).map(function (s) { return s.toUpperCase(); });
    // Task I-59: checked before *CURSOR so the two can never be confused -
    // not that they actually could collide (a literal "*CURSOR" substring
    // never occurs inside "*NOCURSOR" at a "*"-prefixed position), but
    // checking the more specific token first is the clearer, safer order.
    if (/\*NOCURSOR\b/i.test(text)) result.cursorVisible = 'NOCURSOR';
    else if (/\*CURSOR\b/i.test(text)) result.cursorVisible = 'CURSOR';
    return result;
  }

  /** Returns a NEW keywords array with `keywordName` (one of
   *  CHOICE_COLOR_STATE_KEYWORDS, or ENTFLDATR) built from `color`/
   *  `attrs`(/`cursorVisible`, ENTFLDATR-only) - removed entirely if
   *  nothing is set AND `forcePresent` is falsy - same shape as
   *  setColorAttr but for a caller-chosen keyword name instead of the
   *  fixed COLOR/DSPATR pair.
   *  `conditions` (optional, Task I-3: ENTFLDATR is documented by IBM as
   *  eligible for option-indicator conditioning - "not valid" was true for
   *  every OTHER keyword sharing this state shape, not this one) - when
   *  OMITTED, any existing conditioning is preserved, same convention as
   *  setFileFlagKeyword's own `conditions` parameter.
   *  Task I-59 - two new trailing params, both ENTFLDATR-only (harmless,
   *  unused no-ops for the three existing CHCAVAIL/CHCUNAVAIL/CHCSLT call
   *  sites, which never pass either):
   *  `cursorVisible` ('' / 'CURSOR' / 'NOCURSOR') writes the bare
   *  *CURSOR/*NOCURSOR literal ENTFLDATR's own DDS Reference documents
   *  alongside the *COLOR/*DSPATR groups - previously not writable at
   *  all, silently dropped by every prior round-trip through this editor.
   *  `*CURSOR` is documented as the default, so is deliberately never
   *  written even when explicitly chosen (matches this codebase's own
   *  convention elsewhere of never writing a keyword's own documented
   *  default value back out); only the non-default `*NOCURSOR` is ever
   *  actually emitted.
   *  `forcePresent` (boolean) - IBM's own `F1` example
   *  (`ENTFLDATR` with NO parameters at all, defaults for color/attribute/
   *  cursor-visible) is a real, documented, previously-unrepresentable
   *  shape: the old "remove entirely unless color or attrs is set" rule
   *  meant a bare ENTFLDATR could never survive a single Apply click, in
   *  either direction - typing nothing and clicking Apply silently wrote
   *  nothing, and opening a DSPF that already had a hand-written bare
   *  ENTFLDATR then clicking Apply with the checkbox still checked would
   *  also silently drop it (the render side already showed it as
   *  unchecked, per I-59's own finding, so this was reachable both ways).
   *  When true, the keyword is written (as a bare literal, if `color`/
   *  `attrs`/`cursorVisible` are all also empty) even with nothing else
   *  to write. */
  function setChoiceColorState(keywords, keywordName, color, attrs, conditions, cursorVisible, forcePresent) {
    var existing = (keywords || []).find(function (kw) { return kw.name === keywordName; });
    var next = (keywords || []).filter(function (kw) { return kw.name !== keywordName; });
    var groups = [];
    if (color) groups.push('(*COLOR ' + color + ')');
    if (attrs && attrs.length) groups.push('(*DSPATR ' + attrs.join(' ') + ')');
    if (cursorVisible === 'NOCURSOR') groups.push('*NOCURSOR');
    if (groups.length || forcePresent) {
      var nextConditions = conditions !== undefined ? conditions : (existing ? (existing.conditions || []) : []);
      next = next.concat([{ name: keywordName, parameters: groups.join(' '), conditions: nextConditions, raw: '', sourceLines: [] }]);
    }
    return next;
  }


  /** Plain-text getter for WDWTITLE - same shape as getFileQuotedText, unlike
   *  the generic keyword box where the user has to type the quotes themselves.
   *  DspfEngine.resolveWindowTitle already does this same extraction for the
   *  preview; this is the writer-side equivalent for the editor to pre-fill
   *  its input with. */
  function getWindowTitleText(keywords) {
    var k = (keywords || []).find(function (k) { return k.name === 'WDWTITLE'; });
    if (!k) return '';
    var m = /'((?:[^']|'')*)'/.exec(k.parameters || '');
    return m ? m[1].replace(/''/g, "'") : '';
  }

  /** Returns a NEW keywords array with WDWTITLE's quoted text replaced by
   *  `text` (auto-quoted/escaped) - if WDWTITLE already exists, only its
   *  quoted title portion is swapped, leaving any other parameters (e.g. a
   *  *TOP/*BOTTOM or *LEFT/*CENTER/*RIGHT position modifier, or a color/
   *  DSPATR that came after the title) exactly as they were; if it doesn't
   *  exist yet, a new WDWTITLE is added with just the quoted text (DDS's
   *  simplest valid form - position defaults to *TOP *CENTER). Removes
   *  WDWTITLE entirely if `text` is blank. */
  function setWindowTitleText(keywords, text) {
    var trimmed = (text || '').trim();
    if (!trimmed) return (keywords || []).filter(function (k) { return k.name !== 'WDWTITLE'; });

    var quoted = "'" + trimmed.replace(/'/g, "''") + "'";
    var found = false;
    var next = (keywords || []).map(function (k) {
      if (k.name !== 'WDWTITLE') return k;
      found = true;
      var params = k.parameters || '';
      var newParams = /'((?:[^']|'')*)'/.test(params) ? params.replace(/'((?:[^']|'')*)'/, quoted) : (params.trim() + ' ' + quoted).trim();
      return { name: 'WDWTITLE', parameters: newParams, conditions: k.conditions, raw: '', sourceLines: [] };
    });
    if (!found) next = next.concat([{ name: 'WDWTITLE', parameters: quoted, conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  // ---------------------------------------------------------------------
  // Task F1 - File-level keyword picker (Select File Keywords + its 9
  // category screens: General, Indicator, Print, Help, Display sizes,
  // DBCS conversion, Alternate, Window Border, Menu-bar). All of these
  // operate purely on a `keywords` array (dspfFile.fileKeywords) and hand
  // back a NEW array - same "no sourceLines here, applyFileKeywordsUpdate
  // does the serializing" convention as getColorAttr/setColorAttr etc.
  // above, so every category panel can commit through the file props
  // panel's existing commitFileEdit/applyFileKeywordsUpdate path.
  //
  // Most keywords here are a simple "present or absent, optionally with
  // free-text parameters" shape - getFileFlagKeyword/setFileFlagKeyword
  // cover that generically rather than hand-writing ~20 near-identical
  // get/set pairs. A `fixedParam` lets 3 keywords share one NAME with
  // different literal parameters (CHECK(AB)/CHECK(RLTB)/CHECK(RL) are all
  // independent yes/no choices on the General screen, not one shared
  // control). Keywords whose real DDS argument shape is multi-part and not
  // fully nailed down here (HLPPNLGRP, IGCCNV, etc.) get a single
  // free-text parameters box rather than guessed-at sub-fields, the same
  // "caller supplies the properly-formed argument text" fallback the
  // existing Validity check/Edit code editor already uses for VALUES/
  // EDTWRD - safer than silently mis-ordering a multi-argument keyword.
  // ---------------------------------------------------------------------

  /** Reads a simple file-level keyword's current state - { present, parameters,
   *  conditions }. `fixedParam` (optional) narrows the match to a keyword
   *  instance whose parameter text equals it exactly (case-insensitive) -
   *  used for keywords like CHECK that appear multiple times with different
   *  fixed arguments, each acting as its own independent toggle.
   *  `conditions` is that keyword instance's own indicator conditioning
   *  (e.g. SFLDSP conditioned on indicator 30) - callers that only care
   *  about presence/parameters can keep ignoring it, but flagRowHtml/
   *  wireFlagRow use it so a flag row can show and edit conditioning that
   *  was already there instead of silently hiding it (see setFileFlagKeyword
   *  below for why previously this got silently DESTROYED, not just hidden).
   *  `altNames` (optional, Task L22 remaining item) - a list of legacy
   *  alternate spellings that should also match `name`, e.g. `['ROLLUP']`
   *  for PAGEDOWN or `['ROLLDOWN']` for PAGEUP (real SDA's own "Define
   *  Indicator Keywords" screen, docs/sda-reference/screens/file-level/
   *  02-indicator-keywords/image5.png, lists these as `PAGEDOWN/ROLLUP` and
   *  `PAGEUP/ROLLDOWN` - the same keyword under two names, not two
   *  different keywords). Before this, a file imported with the legacy
   *  spelling matched neither `name` here, so its flag row silently showed
   *  unchecked even though the keyword was very much present. */
  function getFileFlagKeyword(keywords, name, fixedParam, altNames) {
    var names = [name].concat(altNames || []);
    var k = (keywords || []).find(function (kw) {
      if (names.indexOf(kw.name) === -1) return false;
      if (fixedParam == null) return true;
      return (kw.parameters || '').trim().toUpperCase() === String(fixedParam).toUpperCase();
    });
    return { present: !!k, parameters: k ? (k.parameters || '') : '', conditions: k ? (k.conditions || []) : [] };
  }

  /** Returns a NEW keywords array with the given keyword set on/off. When
   *  `fixedParam` is given, only that specific fixed-argument instance is
   *  added/removed (other instances of the same keyword NAME, e.g. other
   *  CHECK(...) variants, are left alone); otherwise any existing keyword
   *  of this name is replaced (single-instance keywords like INDARA,
   *  PRINT, HLPPNLGRP). `parameters` is ignored when `fixedParam` is set
   *  (the fixed text IS the parameter).
   *
   *  `conditions` (optional) - when OMITTED (undefined), any indicator
   *  conditioning already on the existing keyword instance is PRESERVED as-is.
   *  This used to be unconditional data loss: every call here rebuilt the
   *  keyword with `conditions: []`, so toggling ANY flag-row keyword through
   *  this function - even ones with nothing to do with conditioning, like
   *  flipping a completely different checkbox on the same panel that
   *  happens to also go through setFileFlagKeyword - silently stripped an
   *  existing indicator off keywords like SFLDSP/SFLDSPCTL/SFLCLR the moment
   *  the panel re-committed. Pass an explicit `conditions` array (including
   *  `[]` to deliberately clear it) when the caller actually means to change
   *  the conditioning; omit it for every other kind of edit.
   *
   *  `altNames` (optional, Task L22 remaining item) - same legacy-spelling
   *  list `getFileFlagKeyword` above takes. Any existing instance matching
   *  `name` OR one of `altNames` is removed (so unchecking PAGEDOWN also
   *  removes a legacy ROLLUP instance, instead of leaving it behind with
   *  the checkbox now showing unchecked); a re-added instance is always
   *  written back under the canonical `name`, never an alt spelling - this
   *  is the one point where a legacy spelling gets normalized, the same
   *  "only touch it when the user actually edits this row" posture
   *  `conditions` above already follows. */
  function setFileFlagKeyword(keywords, name, present, parameters, fixedParam, conditions, altNames) {
    var names = [name].concat(altNames || []);
    var existing = (keywords || []).find(function (kw) {
      if (names.indexOf(kw.name) === -1) return false;
      if (fixedParam == null) return true;
      return (kw.parameters || '').trim().toUpperCase() === String(fixedParam).toUpperCase();
    });
    var next = (keywords || []).filter(function (kw) {
      if (names.indexOf(kw.name) === -1) return true;
      if (fixedParam == null) return false;
      return (kw.parameters || '').trim().toUpperCase() !== String(fixedParam).toUpperCase();
    });
    if (present) {
      var params = fixedParam != null ? String(fixedParam) : (parameters || '');
      var nextConditions = conditions !== undefined ? conditions : (existing ? (existing.conditions || []) : []);
      next = next.concat([{ name: name, parameters: params, conditions: nextConditions, raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** Unquotes a single DDS quoted-string LITERAL parameter (e.g. SFLMSG's
   *  'Some message' or 'It''s here' with doubled-up embedded quotes) down
   *  to its plain text - the inverse of quoteDdsLiteral below. Returns ''
   *  for anything that isn't a leading quoted literal (blank parameters, a
   *  bare field name, etc). Factored out of getFileQuotedText so Task L1c's
   *  per-instance repeatable SFLMSG editing can reuse the exact same
   *  quoting convention without going through a keywords array. */
  function unquoteDdsLiteral(parameters) {
    var m = /^'((?:[^']|'')*)'/.exec((parameters || '').trim());
    return m ? m[1].replace(/''/g, "'") : '';
  }

  /** Quotes+escapes plain `text` into a DDS quoted-string LITERAL parameter
   *  (the inverse of unquoteDdsLiteral above) - '' for blank input, same
   *  "don't write a keyword with no meaningful value" convention
   *  setFileQuotedText already follows (its caller decides whether '' means
   *  dropping the keyword/instance entirely). */
  function quoteDdsLiteral(text) {
    var trimmed = (text || '').trim();
    return trimmed ? "'" + trimmed.replace(/'/g, "''") + "'" : '';
  }

  /** Plain-text getter for a quoted-string file-level keyword (HLPTITLE) -
   *  same shape as getWindowTitleText, unquoting so the
   *  editor input shows plain text rather than DDS's own quote escaping.
   *  Kept returning a plain string (not an object) since most call sites
   *  (ALTNAME, TEXT, file-level HLPTITLE, which IBM documents as NOT
   *  eligible for option-indicator conditioning) only ever want the text -
   *  see getFileQuotedTextConditions below for the sibling reader Task
   *  I-21 added for the keywords that DO need conditioning. */
  function getFileQuotedText(keywords, name) {
    var k = (keywords || []).find(function (kw) { return kw.name === name; });
    if (!k) return '';
    return unquoteDdsLiteral(k.parameters);
  }

  /** Task I-21: sibling reader returning just the conditions array for a
   *  getFileQuotedText-backed keyword (record-level HLPTITLE is
   *  individually documented by IBM as eligible for option-indicator
   *  conditioning) - kept as its own small function rather than changing
   *  getFileQuotedText's own return shape, so getFileQuotedText's many
   *  plain-string callers stay untouched. */
  function getFileQuotedTextConditions(keywords, name) {
    var k = (keywords || []).find(function (kw) { return kw.name === name; });
    return k ? (k.conditions || []) : [];
  }

  /** Returns a NEW keywords array with `name` set to the quoted+escaped
   *  form of `text` (removed entirely if `text` is blank).
   *
   *  `conditions` (optional, Task I-21) - when OMITTED (undefined), any
   *  indicator conditioning already on the existing keyword instance is
   *  PRESERVED as-is, matching setFileFlagKeyword's own "omit to preserve,
   *  pass an explicit array (including []) to actually change it"
   *  contract. Before this task every call here unconditionally rebuilt
   *  the keyword with `conditions: []`, so editing HLPTITLE's text (or
   *  any other getFileQuotedText-backed keyword) would have silently
   *  stripped conditioning the moment record-level HLPTITLE gained a
   *  Conditioning UI - the exact same class of bug setFileFlagKeyword's
   *  own history already documents. */
  function setFileQuotedText(keywords, name, text, conditions) {
    var existing = (keywords || []).find(function (kw) { return kw.name === name; });
    var next = (keywords || []).filter(function (kw) { return kw.name !== name; });
    var quoted = quoteDdsLiteral(text);
    if (quoted) {
      var nextConditions = conditions !== undefined ? conditions : (existing ? (existing.conditions || []) : []);
      next = next.concat([{ name: name, parameters: quoted, conditions: nextConditions, raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** REF (Reference database file) - reads its Library/Record/
   *  record-format-name sub-fields out of the documented
   *  `[library-name/]database-file-name [record-format-name]` parameter
   *  form.
   *
   *  Task I-4 (keyword parameter/sub-parameter completeness audit):
   *  confirmed against IBM's own DDS Reference that REF's format has a
   *  THIRD, optional, space-separated `record-format-name` sub-parameter
   *  (used when the referenced file has more than one record format) -
   *  this used to only split on `/` and treat everything else as one
   *  opaque `record` string, so the record-format-name was reachable only
   *  by accident (typing "FILE1 RECORD2" into the "record" box happened
   *  to serialize correctly) and was never its own labeled field. */
  function getFileRefKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'REF'; });
    if (!k) return { library: '', record: '', recordFormat: '' };
    var raw = (k.parameters || '').trim();
    var slashIdx = raw.indexOf('/');
    var library = '';
    var rest = raw;
    if (slashIdx !== -1) {
      library = raw.slice(0, slashIdx).trim();
      rest = raw.slice(slashIdx + 1).trim();
    }
    var restTokens = rest.split(/\s+/).filter(Boolean);
    return { library: library, record: restTokens[0] || '', recordFormat: restTokens.slice(1).join(' ') };
  }

  /** Returns a NEW keywords array with REF set from `library`/`record`/
   *  `recordFormat` (REF([library/]record [recordFormat]), or REF(record)
   *  with no library qualifier and/or no record-format-name), or removed
   *  entirely if `record` is blank. `recordFormat` is optional - existing
   *  2-argument callers keep writing exactly the same output as before. */
  function setFileRefKeyword(keywords, library, record, recordFormat) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'REF'; });
    var rec = (record || '').trim();
    if (rec) {
      var lib = (library || '').trim();
      var rf = (recordFormat || '').trim();
      var base = lib ? lib + '/' + rec : rec;
      next = next.concat([{ name: 'REF', parameters: rf ? base + ' ' + rf : base, conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** HLPPNLGRP (file level only - see the H-spec-level usage's own,
   *  separate free-text handling in applicationHelpFieldsHtml, which this
   *  does not touch) - reads its Module name/Library/Panel group
   *  sub-fields out of the documented
   *  `help-module-name [library-name/]panel-group-name` parameter form.
   *
   *  Task I-4 (keyword parameter/sub-parameter completeness audit):
   *  confirmed against IBM's own DDS Reference that BOTH the module name
   *  and the panel group name are required (only the library qualifier on
   *  the panel group name is optional) - the file-level picker used to
   *  expose this as one free-text box whose own placeholder hint read
   *  "panel-group-name library module-name", the WRONG order relative to
   *  the documented `help-module-name [library-name/]panel-group-name`
   *  shape, which risked writing invalid DDS if someone typed it in the
   *  order the hint suggested. */
  function getFileHlpPnlGrpKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'HLPPNLGRP'; });
    if (!k) return { moduleName: '', library: '', panelGroup: '' };
    var tokens = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    var moduleName = tokens[0] || '';
    var rest = tokens.slice(1).join(' ');
    var slashIdx = rest.indexOf('/');
    if (slashIdx !== -1) {
      return { moduleName: moduleName, library: rest.slice(0, slashIdx).trim(), panelGroup: rest.slice(slashIdx + 1).trim() };
    }
    return { moduleName: moduleName, library: '', panelGroup: rest };
  }

  /** Returns a NEW keywords array with HLPPNLGRP set from `moduleName`/
   *  `library`/`panelGroup` (both moduleName and panelGroup are required
   *  per the DDS Reference - a keyword with only one of them supplied
   *  isn't valid DDS, so it's dropped entirely rather than written
   *  half-formed), or removed if either is blank. */
  function setFileHlpPnlGrpKeyword(keywords, moduleName, library, panelGroup) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'HLPPNLGRP'; });
    var mod = (moduleName || '').trim();
    var pg = (panelGroup || '').trim();
    if (mod && pg) {
      var lib = (library || '').trim();
      next = next.concat([{ name: 'HLPPNLGRP', parameters: mod + ' ' + (lib ? lib + '/' + pg : pg), conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** HLPSCHIDX - reads its Library/search-index-object sub-fields out of
   *  the documented `[library-name/]search-index-object` parameter form.
   *
   *  Task I-4: same "backwards placeholder hint" bug as HLPPNLGRP above -
   *  the old free-text box's hint read "search-index-object library"
   *  instead of the documented library-first, slash-joined order. */
  function getFileHlpSchIdxKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'HLPSCHIDX'; });
    if (!k) return { library: '', searchIndex: '' };
    var raw = (k.parameters || '').trim();
    var slashIdx = raw.indexOf('/');
    if (slashIdx !== -1) {
      return { library: raw.slice(0, slashIdx).trim(), searchIndex: raw.slice(slashIdx + 1).trim() };
    }
    return { library: '', searchIndex: raw };
  }

  /** Returns a NEW keywords array with HLPSCHIDX set from `library`/
   *  `searchIndex` (HLPSCHIDX([library/]searchIndex)), or removed
   *  entirely if `searchIndex` is blank. */
  function setFileHlpSchIdxKeyword(keywords, library, searchIndex) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'HLPSCHIDX'; });
    var si = (searchIndex || '').trim();
    if (si) {
      var lib = (library || '').trim();
      next = next.concat([{ name: 'HLPSCHIDX', parameters: lib ? lib + '/' + si : si, conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  // Task I-38 (keywordFixes.md): HLPDOC was entirely absent from iSDA -
  // confirmed missing from I-1's own original 39-keyword file-level
  // baseline (I-5 later added 5 more confirmed-missing keywords, but
  // HLPDOC wasn't among those 5 either - a gap in scope, not something
  // previously found and deferred). IBM's own DDS Reference documents it
  // as a file- OR help-specification-level keyword:
  //   HLPDOC(online-help-information-text-label-name document-name
  //          folder-name)
  // all three parts required (no optional sub-parameter, unlike HLPRCD's
  // own [[library/]file-name]). Option indicators ARE valid. "You cannot
  // specify HLPDOC with HLPBDY, HLPPNLGRP, or HLPRTN." This task adds the
  // FILE-level form only (reusing getFileFlagKeyword/setFileFlagKeyword,
  // same "generic primitive + client-side parse/compose" choice I-5's own
  // HLPRCD addition made) - the H-specification-level form is a separate,
  // already-existing panel (applicationHelpFieldsHtml, HLPPNLGRP/HLPEXCLD/
  // HLPBDY/HLPARA) outside this task's own scope, same "file-level only,
  // H-spec-level deferred" precedent I-5's own HLPRCD entry already set.
  //
  // hlpdocConflictReason below checks HLPDOC against the two FILE-level
  // keywords iSDA already models that IBM's own text forbids alongside it
  // (HLPPNLGRP, HLPRTN) - HLPBDY is H-specification-level only in this
  // codebase (applicationHelpFieldsHtml's own per-H-spec panel), so there
  // is no file-level HLPBDY instance a file-level HLPDOC could ever
  // conflict with; that half of IBM's rule has nothing to check at this
  // level. Same alertAndRevert-bidirectional idiom I-8/I-11/I-13's own
  // conflict checkers use, checked from BOTH directions (turning on
  // HLPDOC while HLPPNLGRP/HLPRTN is already present, and vice versa) -
  // see wireUsrdfnGuardedFlag's own callers in webviewClientHelpers.js
  // for where each direction is wired.
  function hlpdocConflictReason(keywordName, keywords) {
    var present = function (n) { return (keywords || []).some(function (kw) { return kw.name === n; }); };
    if (keywordName === 'HLPDOC') {
      if (present('HLPPNLGRP')) return 'HLPDOC cannot be specified in the same file as HLPPNLGRP (mutually exclusive per the DDS Reference).';
      if (present('HLPRTN')) return 'HLPDOC cannot be specified in the same file as HLPRTN (mutually exclusive per the DDS Reference).';
      return '';
    }
    if ((keywordName === 'HLPPNLGRP' || keywordName === 'HLPRTN') && present('HLPDOC')) {
      return keywordName + ' cannot be specified in the same file as HLPDOC (mutually exclusive per the DDS Reference).';
    }
    return '';
  }

  /** Cross-check requested against I-38's own HLPDOC work: IBM's DDS
   *  Reference states, right after HLPPNLGRP's own format description,
   *  "a display file cannot contain both HLPPNLGRP and HLPRCD keywords,
   *  nor HLPPNLGRP and HLPDOC keywords." The HLPDOC half is
   *  hlpdocConflictReason just above; this is the HLPRCD half, which had
   *  no conflict check of any kind before now - I-5 added HLPRCD's own
   *  UI without one, and I-38's later HLPDOC work didn't retroactively
   *  add it either.
   *
   *  HLPRCD and HLPDOC are deliberately NOT checked against each other
   *  here (and hlpdocConflictReason above deliberately doesn't check
   *  HLPRCD either): nowhere does IBM's text forbid having both in the
   *  same file - the "cannot contain both" language is stated only for
   *  HLPPNLGRP's two pairings, each named explicitly. Both keywords'
   *  own file-level trigger condition is identical ("displayed when no
   *  help area for the active records contains the current cursor
   *  location"), which reads redundant, but redundant is not the same
   *  as invalid, and this codebase only blocks what IBM's text actually
   *  states.
   *
   *  HLPRTN is also deliberately NOT checked against HLPRCD: IBM's text
   *  says HLPRTN "takes priority over any HLPRCD, HLPPNLGRP, or HLPDOC
   *  keywords" when more than one is present - a priority/precedence
   *  rule, not a prohibition (unlike HLPDOC's own separate, explicitly-
   *  worded "You cannot specify HLPDOC with ... HLPRTN" rule above) - so
   *  HLPRTN and HLPRCD coexisting is valid DDS and nothing here blocks
   *  it. */
  function hlprcdConflictReason(keywordName, keywords) {
    var present = function (n) { return (keywords || []).some(function (kw) { return kw.name === n; }); };
    if (keywordName === 'HLPRCD' && present('HLPPNLGRP')) {
      return 'HLPRCD cannot be specified in the same file as HLPPNLGRP (mutually exclusive per the DDS Reference).';
    }
    if (keywordName === 'HLPPNLGRP' && present('HLPRCD')) {
      return 'HLPPNLGRP cannot be specified in the same file as HLPRCD (mutually exclusive per the DDS Reference).';
    }
    return '';
  }

  /**
   * Task I-2 (keywordFixes.md) - bug fix: there is no standalone PRTFILE
   * keyword in real DDS. IBM's DDS Reference documents the printer-file
   * name as PRINT's OWN third parameter form -
   * `PRINT[(response-indicator ['text']) | (*PGM) |
   * ([library-name/]printer-file-name)]` - and PRTFILE only exists as an
   * unrelated CRTDEVDSP/CHGDEVDSP COMMAND parameter (a device-level
   * fallback PRINT's own keyword text references, never written into DDS
   * source). Real SDA's own "Define Print Keywords" screen confirms
   * this: its "System handles print: Print file (Name, *PGM) / Library"
   * fields write directly into PRINT, with no PRTFILE label anywhere on
   * the screen. A previous version of this code wrote a bogus, separate
   * `PRTFILE(name library)` keyword for this case - not real DDS syntax,
   * and would fail CRTDSPF.
   *
   * PRINT's blank and response-indicator forms are already handled
   * generically via getFileFlagKeyword/setFileFlagKeyword (used for the
   * "Program handles print" response-indicator input, including S36-4's
   * hard-block wiring) - this is a READ-ONLY helper for PRINT's other two
   * forms (`*PGM` and `[library/]printer-file-name`), used only to
   * populate the "System handles print" input boxes on render. There is
   * no separate setter: the UI assembles PRINT's one final parameter
   * string itself (response-indicator text OR *PGM OR library/file -
   * whichever section is filled in, mutually exclusive same as real
   * SDA's screen) and commits it through the existing generic
   * setFileFlagKeyword('PRINT', ...) call, so the S36E response-indicator
   * check already wired to that keyword keeps covering *PGM too (per
   * S36-3's documented response-indicator/*PGM equivalence) without any
   * duplicate check logic here.
   */
  function getFilePrintFileForm(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'PRINT'; });
    var result = { isPgm: false, printFile: '', library: '' };
    if (!k) return result;
    var params = (k.parameters || '').trim();
    if (!params || /^\d{1,2}\b/.test(params)) return result; // blank, or the response-indicator form - not this sub-form
    if (/^\*PGM$/i.test(params)) {
      result.isPgm = true;
      return result;
    }
    var parts = params.split('/');
    if (parts.length > 1) {
      result.library = parts[0].trim();
      result.printFile = parts.slice(1).join('/').trim();
    } else {
      result.printFile = params;
    }
    return result;
  }

  /**
   * WDWBORDER (Window Border, file-level default) - the one keyword in
   * this set with real internal structure: up to three bracketed groups,
   * *COLOR (a single color name), *DSPATR (one or more display attribute
   * codes), and *CHAR (all 8 border-position characters, in the fixed
   * top-left/top/top-right/left/right/bottom-left/bottom/bottom-right
   * order the picker screen shows them in - see docs/sda-reference/
   * screens/file-level/08-window-border/). Only the groups actually
   * enabled are written, matching the "Color Y/N, Display attributes Y/N,
   * Border Characters Y/N" toggles on the real SDA screen.
   */
  function getWdwBorder(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'WDWBORDER'; });
    var result = { color: '', attrs: [], chars: ['', '', '', '', '', '', '', ''], conditions: k ? (k.conditions || []) : [] };
    if (!k) return result;
    var text = k.parameters || '';
    var colorM = /\*COLOR\s+([A-Z]+)/i.exec(text);
    if (colorM) result.color = colorM[1].toUpperCase();
    var attrM = /\*DSPATR\s+([^()]*)/i.exec(text);
    if (attrM) result.attrs = attrM[1].trim().split(/\s+/).filter(Boolean).map(function (s) { return s.toUpperCase(); });
    var charM = /\*CHAR\s+((?:'[^']*'\s*)+)/i.exec(text);
    if (charM) {
      // Bug fix - see the matching comment in dspfEngine.js's
      // resolveWdwBorder for the full rationale: a single quoted group is
      // real DDS's actual *CHAR syntax (one character-string value, up to
      // 8 characters, split positionally) - not 8 separate quoted
      // literals, which is only what THIS file's own setWdwBorder writes.
      var charGroups = charM[1].match(/'[^']*'/g) || [];
      if (charGroups.length === 1) {
        result.chars = charGroups[0].slice(1, -1).split('').slice(0, 8);
      } else {
        result.chars = charGroups.map(function (c) { return c.slice(1, -1); });
      }
      while (result.chars.length < 8) result.chars.push('');
    }
    return result;
  }

  /** Returns a NEW keywords array with WDWBORDER built from `state` -
   *  `{ colorEnabled, color, attrsEnabled, attrs, charsEnabled, chars }` -
   *  removed entirely if none of the three groups are enabled.
   *  `conditions` (optional, Task I-3: WDWBORDER is documented by IBM as
   *  eligible for option-indicator conditioning) - when OMITTED, any
   *  existing conditioning is preserved, same convention as
   *  setFileFlagKeyword's own `conditions` parameter. */
  function setWdwBorder(keywords, state, conditions) {
    var existing = (keywords || []).find(function (kw) { return kw.name === 'WDWBORDER'; });
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'WDWBORDER'; });
    var groups = [];
    if (state.colorEnabled && state.color) groups.push('(*COLOR ' + state.color + ')');
    if (state.attrsEnabled && state.attrs && state.attrs.length) groups.push('(*DSPATR ' + state.attrs.join(' ') + ')');
    if (state.charsEnabled && state.chars && state.chars.some(function (c) { return c; })) {
      var chars = state.chars.slice(0, 8);
      while (chars.length < 8) chars.push('');
      groups.push('(*CHAR ' + chars.map(function (c) { return "'" + (c || ' ') + "'"; }).join(' ') + ')');
    }
    if (groups.length) {
      var nextConditions = conditions !== undefined ? conditions : (existing ? (existing.conditions || []) : []);
      next = next.concat([{ name: 'WDWBORDER', parameters: groups.join(' '), conditions: nextConditions, raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** Display sizes (DSPSIZ) - reads the file's declared sizes as an ordered
   *  list (priority order = keyword's own parameter order), reusing the
   *  same triple parser addDisplaySize already relies on. */
  function getDisplaySizesList(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'DSPSIZ'; });
    return k ? parseDisplaySizeTriples(k.parameters) : [];
  }

  /** Returns a NEW keywords array with DSPSIZ fully replaced by `sizes`
   *  (an ordered array of `{ lines, columns, name }`, at most 2 - DDS's own
   *  limit), or removed entirely if `sizes` is empty. Unlike addDisplaySize
   *  (which only appends a second size to whatever's already there), this
   *  replaces the whole list/order in one go, which is what the Display
   *  Sizes picker's "Order" column needs. */
  function setDisplaySizesList(keywords, sizes) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'DSPSIZ'; });
    var list = (sizes || []).filter(function (s) { return s && s.lines > 0 && s.columns > 0; });
    if (list.length > 2) throw new Error('DSPSIZ supports at most two display sizes.');
    if (list.length) {
      next = next.concat([{ name: 'DSPSIZ', parameters: serializeDisplaySizes(list), conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** Task I-45 (split off from I-44's original finding): DSPMOD's own DDS
   *  Reference section states "This keyword is valid only when both the
   *  24 x 80 and 27 x 132 display sizes are specified on the DSPSIZ
   *  keyword" - a file-level prerequisite entirely unrelated to USRDFN
   *  (I-44's own scope) and unchecked by any existing guard (DSPMOD's row
   *  went through plain `simple()` before I-44's own pass, then
   *  `wireUsrdfnGuardedFlag` after it - neither ever looked at DSPSIZ).
   *  `getDisplaySizesList` already normalizes both of DSPSIZ's own valid
   *  forms - named (`*DS3`/`*DS4`, resolved via KNOWN_DISPLAY_SIZE_NAMES)
   *  and bare numeric (`24 80`/`27 132`) - to the same `{lines, columns}`
   *  shape, so this just checks both required sizes are present in
   *  whatever order the file lists them (DSPMOD's own text only requires
   *  both be declared; the first one listed becomes the default display
   *  mode, unaffected by this check). Returns a reason string if `sizes`
   *  is missing either the 24x80 or 27x132 size, or null if both are
   *  present. */
  function dspmodDspsizPrerequisiteReason(fileKeywords) {
    var sizes = getDisplaySizesList(fileKeywords);
    var has24x80 = sizes.some(function (s) { return s.lines === 24 && s.columns === 80; });
    var has27x132 = sizes.some(function (s) { return s.lines === 27 && s.columns === 132; });
    if (has24x80 && has27x132) return null;
    return 'DSPMOD is valid only when the DSPSIZ keyword specifies both the 24x80 and 27x132 display sizes (per the DDS Reference).';
  }

  /** Task I-52 (gap found while implementing I-45): DSPMOD's own DDS
   *  Reference section has a SECOND, independent prerequisite beyond
   *  I-45's own DSPSIZ one, in the very next sentence after the "not
   *  valid for user-defined records (USRDFN keyword)" line: "The DSPMOD
   *  keyword cannot be specified on a subfile record (SFL keyword). The
   *  subfile is [dis]played according to the DSPMOD of the corresponding
   *  subfile control record." That second sentence is the key scoping
   *  detail - it names the plain SFL (detail) record specifically, and
   *  explains *why* only that record is restricted (the SFLCTL record's
   *  own DSPMOD already governs the whole subfile), so SFLCTL is
   *  deliberately NOT included here despite being the other half of
   *  every other SFL-mutex rule in this file (see
   *  alwrolClrlSlnoConflictReason's own ['ASSUME','SFL','SFLCTL',
   *  'USRDFN'] list just above, which covers a DIFFERENT keyword's own
   *  DDS Reference wording that names both). Checks the literal SFL
   *  keyword's presence on `recordKeywords` directly (same shape as
   *  alwrolClrlSlnoConflictReason above) rather than reusing
   *  WebviewClientHelpers.isSflRecord, since that helper deliberately
   *  excludes SFLMSG records for an unrelated UI-tab reason (see its own
   *  doc comment) that has nothing to do with this keyword's own SFL
   *  restriction. Deliberately unconditional on `keywordName` (same
   *  "safe no-op for every other caller" shape as
   *  alwrolClrlSlnoConflictReason/usrdfnConflictReason above) rather than
   *  a new wireUsrdfnGuardedFlag trailing param, since it only ever
   *  returns non-null for DSPMOD. */
  function dspmodSflConflictReason(keywordName, recordKeywords) {
    if (keywordName !== 'DSPMOD') return null;
    var hasSfl = (recordKeywords || []).some(function (k) { return k.name === 'SFL'; });
    if (!hasSfl) return null;
    return 'DSPMOD cannot be specified on a subfile (SFL) record - the subfile is displayed according to the DSPMOD of its corresponding subfile control (SFLCTL) record instead (per the DDS Reference).';
  }

  // Bug fix (L22 keyword-inventory audit): MSGLOC was entirely missing.
  // Confirmed via IBM's own DDS Reference: MSGLOC is a FILE-LEVEL keyword
  // with a single required numeric line-number parameter (1-27), used
  // alongside DSPSIZ to give each display size its own error-message
  // line - e.g. `A MSGLOC(1)` for the primary/unconditioned size and
  // `A *DS4 MSGLOC(1)` for a secondary size, using the SAME display-size
  // condition-name mechanism (`displaySizeCondition`) the parser already
  // builds for any keyword's conditioning columns - NOT a parameter of
  // DSPSIZ itself (confirmed against parseDisplaySizeTriples/
  // serializeDisplaySizes above, whose own triple syntax has no room for
  // a 4th "message line" value). Modeled as (primary, bySizeName) rather
  // than a flat list since that mirrors exactly how the Display Sizes
  // picker's own sizeList already distinguishes the primary
  // (unconditioned) size from any secondary (named) ones.
  function getFileMsgLocLines(keywords) {
    var result = { primary: '', bySizeName: {} };
    (keywords || []).filter(function (kw) { return kw.name === 'MSGLOC'; }).forEach(function (kw) {
      var value = (kw.parameters || '').trim();
      var sizeGroup = (kw.conditions || []).filter(function (g) { return g && g.displaySizeCondition; })[0];
      if (sizeGroup) {
        result.bySizeName[sizeGroup.displaySizeCondition.name] = value;
      } else {
        result.primary = value;
      }
    });
    return result;
  }

  /** Returns a NEW keywords array with every existing MSGLOC removed and
   *  replaced by: one unconditioned MSGLOC for `primary` (if non-blank),
   *  plus one MSGLOC per non-blank entry in `bySizeName` (an object of
   *  `{ '*DS4': '28', ... }`), each conditioned by that size's own
   *  display-size condition name - same `{relation, indicators,
   *  displaySizeCondition, sourceLines}` group shape
   *  buildConditionChunks/the parser already use everywhere else a
   *  display-size condition is built or read. */
  function setFileMsgLocLines(keywords, primary, bySizeName) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'MSGLOC'; });
    var p = (primary == null ? '' : String(primary)).trim();
    if (p) next = next.concat([{ name: 'MSGLOC', parameters: p, conditions: [], raw: '', sourceLines: [] }]);
    Object.keys(bySizeName || {}).forEach(function (sizeName) {
      var v = (bySizeName[sizeName] == null ? '' : String(bySizeName[sizeName])).trim();
      if (!v) return;
      next = next.concat([{
        name: 'MSGLOC',
        parameters: v,
        conditions: [{ relation: 'AND', indicators: [], displaySizeCondition: { name: sizeName, not: false }, sourceLines: [] }],
        raw: '',
        sourceLines: [],
      }]);
    });
    return next;
  }

  // Task L79 (Message Record picker gap): SFLMSGRCD's own DSPSIZ
  // conditioning was reported missing from the record's "Message Record"
  // panel - real SDA's own "Define Message Record" screen shows a
  // "Display size conditioning" row directly under the line-number input
  // for exactly this reason. Confirmed via IBM's current DDS Reference:
  // "Display size condition names can be specified for SFLMSGRCD and are
  // required if the line number for the first message displayed is to
  // change, based on display size." - the SAME shape MSGLOC already uses
  // above (a primary/unconditioned value plus, since DSPSIZ allows at most
  // two sizes, one more value conditioned by the second size's own name),
  // reusing that exact (primary, bySizeName) modeling rather than
  // inventing a new one. Record-level (not file-level like MSGLOC), but
  // these getters are already generic over any `keywords` array.
  function getSflMsgRcdLines(keywords) {
    var result = { primary: '', bySizeName: {} };
    (keywords || []).filter(function (kw) { return kw.name === 'SFLMSGRCD'; }).forEach(function (kw) {
      var value = (kw.parameters || '').trim();
      var sizeGroup = (kw.conditions || []).filter(function (g) { return g && g.displaySizeCondition; })[0];
      if (sizeGroup) {
        result.bySizeName[sizeGroup.displaySizeCondition.name] = value;
      } else {
        result.primary = value;
      }
    });
    return result;
  }

  /** Returns a NEW keywords array with every existing SFLMSGRCD removed and
   *  replaced by: one unconditioned SFLMSGRCD for `primary` (if non-blank),
   *  plus one SFLMSGRCD per non-blank entry in `bySizeName`, each
   *  conditioned by that size's own display-size condition name - same
   *  shape as setFileMsgLocLines above. */
  function setSflMsgRcdLines(keywords, primary, bySizeName) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'SFLMSGRCD'; });
    var p = (primary == null ? '' : String(primary)).trim();
    if (p) next = next.concat([{ name: 'SFLMSGRCD', parameters: p, conditions: [], raw: '', sourceLines: [] }]);
    Object.keys(bySizeName || {}).forEach(function (sizeName) {
      var v = (bySizeName[sizeName] == null ? '' : String(bySizeName[sizeName])).trim();
      if (!v) return;
      next = next.concat([{
        name: 'SFLMSGRCD',
        parameters: v,
        conditions: [{ relation: 'AND', indicators: [], displaySizeCondition: { name: sizeName, not: false }, sourceLines: [] }],
        raw: '',
        sourceLines: [],
      }]);
    });
    return next;
  }

  // ---------------------------------------------------------------------
  // Task R1 - Base Record Keywords picker (General, Indicator, Application
  // Help, Help, Output, Input, Overlay, Print - see docs/sda-reference/
  // screens/record-level/base-record-keywords/ and PICKER-SCREENS-PLAN.md).
  // The F1 primitives above (getFileFlagKeyword/setFileFlagKeyword,
  // getFileQuotedText/setFileQuotedText) are already generic over any
  // `keywords` array - not file-level-specific despite the name - so R1
  // reuses them as-is for most of its ~30 keywords (a record's PRINT
  // takes the exact same shape as the file-level one - see I-2 in
  // keywordFixes.md for why there's no separate "PRTFILE" keyword to
  // reuse here; that was never real DDS). Only two keyword shapes below
  // are new: UNLOCK's *ERASE/*MDTOFF sub-flags (multiple option VALUES
  // inside one keyword's parameter list, not separate keyword instances)
  // and a small generic two-field pair for CSRLOC/HLPSEQ (space-separated
  // "a b" parameters).
  // (RTNCSRLOC used to share this pair too, under an incorrect "row/col"
  // labeling - Task L77 gave it its own dedicated getRtncsrlocRecNameFields/
  // getRtncsrlocWindowMouseFields pair once real DDS turned out to need 2
  // independent, richer parameter shapes; see that pair's own comment.)
  // ---------------------------------------------------------------------

  /** UNLOCK - present/absent plus its two independent option VALUES
   *  (*ERASE, *MDTOFF), both optional, space-separated within the one
   *  keyword's own parameter list rather than separate keyword instances. */
  function getUnlockKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'UNLOCK'; });
    if (!k) return { present: false, erase: false, mdtoff: false, conditions: [] };
    var text = (k.parameters || '').toUpperCase();
    return { present: true, erase: /\*ERASE\b/.test(text), mdtoff: /\*MDTOFF\b/.test(text), conditions: k.conditions || [] };
  }

  /** Returns a NEW keywords array with UNLOCK set from `present`/`erase`/
   *  `mdtoff` - removed entirely when `present` is false. `conditions`
   *  (optional) follows the same "omit to preserve, pass an array
   *  including [] to deliberately change it" contract as
   *  setFileFlagKeyword above. */
  function setUnlockKeyword(keywords, present, erase, mdtoff, conditions) {
    var existing = (keywords || []).find(function (kw) { return kw.name === 'UNLOCK'; });
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'UNLOCK'; });
    if (present) {
      var vals = [];
      if (erase) vals.push('*ERASE');
      if (mdtoff) vals.push('*MDTOFF');
      var nextConditions = conditions !== undefined ? conditions : (existing ? (existing.conditions || []) : []);
      next = next.concat([{ name: 'UNLOCK', parameters: vals.join(' '), conditions: nextConditions, raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** Generic "keyword(a b)" reader - two whitespace-separated tokens, both
   *  optional individually (CSRLOC's row/col, HLPSEQ's help-group-name/
   *  sequence-number). `conditions` (Task I-21) is always included in the
   *  returned object, same "always present, empty array when there's
   *  nothing" convention getFileFlagKeyword already follows - CSRLOC is
   *  individually documented by IBM as eligible for option-indicator
   *  conditioning; HLPSEQ is documented as NOT eligible, so its own call
   *  sites simply never read/wire this field. */
  function getFileTwoFieldKeyword(keywords, name) {
    var k = (keywords || []).find(function (kw) { return kw.name === name; });
    if (!k) return { a: '', b: '', conditions: [] };
    var parts = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    return { a: parts[0] || '', b: parts[1] || '', conditions: k.conditions || [] };
  }

  /** Returns a NEW keywords array with `name` set to "a b" (or just "a" if
   *  `b` is blank), removed entirely if both are blank.
   *
   *  `conditions` (optional, Task I-21) - when OMITTED (undefined), any
   *  indicator conditioning already on the existing keyword instance is
   *  PRESERVED as-is, same "omit to preserve, pass an explicit array
   *  (including []) to actually change it" contract as
   *  setFileFlagKeyword. Before this task every call here unconditionally
   *  rebuilt the keyword with `conditions: []`, the same class of
   *  silent-data-loss bug setFileFlagKeyword's own history documents. */
  function setFileTwoFieldKeyword(keywords, name, a, b, conditions) {
    var existing = (keywords || []).find(function (kw) { return kw.name === name; });
    var next = (keywords || []).filter(function (kw) { return kw.name !== name; });
    a = (a || '').trim();
    b = (b || '').trim();
    if (a || b) {
      var nextConditions = conditions !== undefined ? conditions : (existing ? (existing.conditions || []) : []);
      next = next.concat([{ name: name, parameters: b ? a + ' ' + b : a, conditions: nextConditions, raw: '', sourceLines: [] }]);
    }
    return next;
  }

  // Task L76 - MNUBARDSP's own 3-name parameter shape, `keyword(a b c)`,
  // one slot wider than getFileTwoFieldKeyword above but otherwise the
  // same "positional, each slot independently optional for reading,
  // trailing blanks dropped for writing" convention - plus `conditions`
  // preserve-when-omitted support (getFileTwoFieldKeyword/
  // setFileTwoFieldKeyword above don't carry conditions at all; MNUBARDSP
  // needs it since real DDS allows response-indicator conditioning on
  // this keyword and the picker already exposed a Conditioning toggle for
  // it before this task). Real DDS actually gives MNUBARDSP TWO different
  // formats depending on where it's coded (see IBM's own DDS reference):
  // on a record that does NOT carry MNUBAR itself, `MNUBARDSP(menu-bar-
  // record &choice-field [&pulldown-input-field])` - 2 required names +
  // 1 optional trailing one, which is what this pair models; on a record
  // that DOES carry MNUBAR, it's `MNUBARDSP[(&pulldown-input-field)]` -
  // a single optional name, which is NOT this pair's job and keeps going
  // through the existing generic getFileFlagKeyword/setFileFlagKeyword
  // single-parameter shape (recordKeywordsPanelsHtml picks between the
  // two based on whether the record's own keywords include MNUBAR - see
  // its own comment for why a positional 3-slot reader can't safely cover
  // both formats: leaving the first two slots blank so only the third is
  // set would read back into slot one instead, once trim()+split()
  // collapses the leading blanks away). */
  function getMnubardspFields(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'MNUBARDSP'; });
    if (!k) return { menuBarRecord: '', choiceField: '', pullDownField: '' };
    var parts = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    return { menuBarRecord: parts[0] || '', choiceField: parts[1] || '', pullDownField: parts[2] || '' };
  }

  /** Returns a NEW keywords array with MNUBARDSP set from `present` plus
   *  its 3 positional name fields - removed entirely when `present` is
   *  false. Trailing blank fields are dropped from the written parameter
   *  string (so a blank `pullDownField` writes just "a b", not "a b ").
   *  `conditions` (optional) follows setFileFlagKeyword's own "omitted
   *  preserves whatever conditioning already existed, pass an explicit
   *  array (including []) to actually change it" contract. */
  function setMnubardspFields(keywords, present, menuBarRecord, choiceField, pullDownField, conditions) {
    var existing = (keywords || []).find(function (kw) { return kw.name === 'MNUBARDSP'; });
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'MNUBARDSP'; });
    if (present) {
      var parts = [(menuBarRecord || '').trim(), (choiceField || '').trim(), (pullDownField || '').trim()];
      while (parts.length && !parts[parts.length - 1]) parts.pop();
      var nextConditions = conditions !== undefined ? conditions : (existing ? (existing.conditions || []) : []);
      next = next.concat([{ name: 'MNUBARDSP', parameters: parts.join(' '), conditions: nextConditions, raw: '', sourceLines: [] }]);
    }
    return next;
  }

  // Task L77 - RTNCSRLOC's real DDS shape (confirmed against IBM's own DDS
  // reference, "RTNCSRLOC (Return Cursor Location) keyword for display
  // files") is NOT the plain 2-field row/col pair CSRLOC has - that
  // labeling on the old picker row was itself a bug this task's own
  // investigation caught. RTNCSRLOC actually has two INDEPENDENT formats,
  // and real DDS allows BOTH to be specified at once as two SEPARATE
  // RTNCSRLOC keyword instances on the same record (confirmed via two
  // independent real-world DDS examples using exactly this pattern, e.g.
  // `RTNCSRLOC(*RECNAME &REC &FLD)` alongside a separate
  // `RTNCSRLOC(*WINDOW &ROW1 &COL1 &ROW2 &COL2)` on the same record) -
  // not a single keyword whose shape varies, and not arbitrarily
  // repeatable either (only these 2 meaningful variants exist):
  //
  //   RTNCSRLOC([*RECNAME] &cursor-record &cursor-field [&cursor-position])
  //   RTNCSRLOC({*WINDOW | *MOUSE} &cursor-row &cursor-column
  //             [&cursor-row2 [&cursor-column2]])
  //
  // The `*RECNAME` literal is technically optional (a bare
  // `RTNCSRLOC(REC FLD)` with no leading literal is still the record/field
  // variant), but this project's own convention is to always write the
  // explicit value rather than lean on a default (see L1's own DDS
  // serialization notes) - so the setter below always writes `*RECNAME`
  // explicitly, while the getter still recognizes a legacy bare instance
  // with no literal (e.g. one written by this exact codebase before this
  // task) for backward-compatible reading. The two variants are told apart
  // by their first token: `*WINDOW`/`*MOUSE` means the row/column variant,
  // anything else (including a bare field name) means the record/field
  // variant - findRtncsrlocInstance below is that shared lookup.
  function findRtncsrlocInstance(keywords, wantWindowMouse) {
    return (keywords || []).find(function (k) {
      if (k.name !== 'RTNCSRLOC') return false;
      var first = ((k.parameters || '').trim().split(/\s+/)[0] || '').toUpperCase();
      var isWm = first === '*WINDOW' || first === '*MOUSE';
      return wantWindowMouse ? isWm : !isWm;
    });
  }

  /** Reads RTNCSRLOC's `[*RECNAME] &cursor-record &cursor-field
   *  [&cursor-position]` variant - the instance (if any) whose first
   *  parameter token is NOT `*WINDOW`/`*MOUSE`. `cursor-record`/
   *  `cursor-field` are both required together in real DDS,
   *  `cursor-position` is optional; all 3 are read positionally, same
   *  "each slot independently optional for reading" convention as
   *  getFileTwoFieldKeyword/getMnubardspFields. */
  function getRtncsrlocRecNameFields(keywords) {
    var k = findRtncsrlocInstance(keywords, false);
    if (!k) return { present: false, cursorRecord: '', cursorField: '', cursorPosition: '' };
    var parts = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    if (parts[0] && parts[0].toUpperCase() === '*RECNAME') parts = parts.slice(1);
    return { present: true, cursorRecord: parts[0] || '', cursorField: parts[1] || '', cursorPosition: parts[2] || '' };
  }

  /** Returns a NEW keywords array with the `*RECNAME` RTNCSRLOC variant
   *  set from `present` plus its 3 positional name fields - removed
   *  entirely when `present` is false. Always writes the `*RECNAME`
   *  literal explicitly (see this section's own comment for why). Any
   *  OTHER RTNCSRLOC instance (the `*WINDOW`/`*MOUSE` variant - see
   *  setRtncsrlocWindowMouseFields below) is left completely untouched,
   *  since real DDS allows both to coexist independently on one record. */
  function setRtncsrlocRecNameFields(keywords, present, cursorRecord, cursorField, cursorPosition) {
    var existing = findRtncsrlocInstance(keywords, false);
    var next = (keywords || []).filter(function (k) { return k !== existing; });
    if (present) {
      var tail = [(cursorField || '').trim(), (cursorPosition || '').trim()];
      while (tail.length && !tail[tail.length - 1]) tail.pop();
      var parts = ['*RECNAME', (cursorRecord || '').trim()].concat(tail);
      next = next.concat([{ name: 'RTNCSRLOC', parameters: parts.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** Reads RTNCSRLOC's `{*WINDOW | *MOUSE} &cursor-row &cursor-column
   *  [&cursor-row2 [&cursor-column2]]` variant - the instance (if any)
   *  whose first parameter token IS `*WINDOW` or `*MOUSE`. `type` comes
   *  back as the literal without its leading `*` (`'WINDOW'`/`'MOUSE'`,
   *  defaulting to `'WINDOW'` when absent so a fresh/never-set picker has
   *  a sensible dropdown default). `cursor-row`/`cursor-column` are both
   *  required together in real DDS; `cursor-row2` is optional, and
   *  `cursor-column2` only makes sense once `cursor-row2` is set (real
   *  DDS's own `[&cursor-row2 [&cursor-column2]]` nesting). */
  function getRtncsrlocWindowMouseFields(keywords) {
    var k = findRtncsrlocInstance(keywords, true);
    if (!k) return { present: false, type: 'WINDOW', cursorRow: '', cursorColumn: '', cursorRow2: '', cursorColumn2: '' };
    var parts = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    var type = (parts[0] || '').toUpperCase().replace('*', '') || 'WINDOW';
    var rest = parts.slice(1);
    return { present: true, type: type, cursorRow: rest[0] || '', cursorColumn: rest[1] || '', cursorRow2: rest[2] || '', cursorColumn2: rest[3] || '' };
  }

  /** Returns a NEW keywords array with the `*WINDOW`/`*MOUSE` RTNCSRLOC
   *  variant set from `present`, `type` (`'WINDOW'` or `'MOUSE'`), and its
   *  4 positional name fields - removed entirely when `present` is false.
   *  `cursorColumn2` is dropped whenever `cursorRow2` is blank (real DDS's
   *  own nesting - a column-2 with no row-2 isn't a representable
   *  parameter position). Any OTHER RTNCSRLOC instance (the `*RECNAME`
   *  variant) is left untouched, same independence as the setter above. */
  function setRtncsrlocWindowMouseFields(keywords, present, type, cursorRow, cursorColumn, cursorRow2, cursorColumn2) {
    var existing = findRtncsrlocInstance(keywords, true);
    var next = (keywords || []).filter(function (k) { return k !== existing; });
    if (present) {
      var lit = String(type || 'WINDOW').toUpperCase() === 'MOUSE' ? '*MOUSE' : '*WINDOW';
      var row2 = (cursorRow2 || '').trim();
      var col2 = row2 ? (cursorColumn2 || '').trim() : '';
      var tail = [row2, col2];
      while (tail.length && !tail[tail.length - 1]) tail.pop();
      var parts = [lit, (cursorRow || '').trim(), (cursorColumn || '').trim()].concat(tail);
      next = next.concat([{ name: 'RTNCSRLOC', parameters: parts.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** Reads every instance of any keyword in `names` (e.g. `['INDTXT',
   *  'SETOF', 'CHANGE']`) as a repeatable row list - real DDS allows
   *  MULTIPLE `SETOF`/`CHANGE`/`INDTXT` keywords on one record (a
   *  different response indicator each), unlike the single-instance
   *  keywords `getFileFlagKeyword` covers. Each row is
   *  `{ keyword, indicator, text }` - `text` only applies to `INDTXT`
   *  (`SETOF(nn)`/`CHANGE(nn)` are indicator-only in real DDS; `text`
   *  comes back empty for those, verified against IBM's DDS reference,
   *  not guessed). Order matches source order. */
  function getIndicatorTextRows(keywords, names) {
    var list = names || [];
    return (keywords || [])
      .filter(function (k) { return list.indexOf(k.name) >= 0; })
      .map(function (k) {
        var m = /^(\S+)\s*(?:'((?:[^']|'')*)')?/.exec((k.parameters || '').trim()) || [];
        return { keyword: k.name, indicator: m[1] || '', text: (m[2] || '').replace(/''/g, "'") };
      });
  }

  /** Returns a NEW keywords array with every existing instance of any
   *  keyword in `names` removed, replaced by one keyword per row in
   *  `rows` (`{ keyword, indicator, text }`, `keyword` must be one of
   *  `names`) - rows with no indicator are skipped. `text` is only
   *  written for keywords that take it (currently just `INDTXT`); other
   *  keywords ignore `text` even if a row supplies one, so switching a
   *  row's keyword dropdown from INDTXT to SETOF silently drops stray
   *  text rather than writing invalid DDS. */
  function setIndicatorTextRows(keywords, names, rows) {
    var list = names || [];
    var next = (keywords || []).filter(function (k) { return list.indexOf(k.name) < 0; });
    (rows || []).forEach(function (r) {
      var indicator = (r.indicator || '').trim();
      if (!r.keyword || list.indexOf(r.keyword) < 0 || !indicator) return;
      var text = r.keyword === 'INDTXT' ? (r.text || '').trim() : '';
      var params = text ? indicator + " '" + text.replace(/'/g, "''") + "'" : indicator;
      next = next.concat([{ name: r.keyword, parameters: params, conditions: [], raw: '', sourceLines: [] }]);
    });
    return next;
  }

  // -----------------------------------------------------------------------
  // Task L1 - generic repeatable, independently-conditioned keyword
  // instances. getIndicatorTextRows/setIndicatorTextRows above already
  // generalize "one keyword name, multiple instances" across INDTXT/SETOF/
  // CHANGE, but collapse each instance down to a single response indicator
  // (SETOF(nn)/CHANGE(nn)/INDTXT(nn 'text') are genuinely indicator-only in
  // real DDS, so that was enough there). Real SDA's other multi-instance
  // screens - Color & attributes (COLOR/DSPATR), Error message (ERRMSG/
  // ERRMSGID), Subfile Messages (SFLMSG/SFLMSGID) - condition each instance
  // with a FULL indicator expression the same way any other keyword can
  // (AND'd groups, OR'd alternatives, a display-size condition), not just
  // one bare indicator number. These two functions are that generalization:
  // same "read every instance of these keyword names, write back a fresh
  // set" shape, but preserving/accepting each instance's own `conditions`
  // array verbatim (the same shape conditionsEditorHtml/wireConditionsEditor
  // in webviewClientHelpers.js already edit for a keyword's Conditioning
  // toggle), instead of parsing/re-serializing an indicator out of
  // `parameters`.
  //
  // This is the L1 "foundation" - no picker wires into it yet (see
  // repeatableConditionedInstancesHtml/wireRepeatableConditionedInstances in
  // webviewClientHelpers.js for the matching generic UI piece). L1a/L1b/L1c
  // wire this pair into the Color & attributes, Error message, and Subfile
  // Messages pickers respectively; each of those needs its own decision
  // about what a single "instance" bundles together (e.g. Color &
  // attributes pairs one COLOR with one DSPATR under a SHARED condition,
  // which is a picker-level concern, not something this generic primitive
  // needs to know about - a caller there would call this twice, once per
  // keyword name, and pair up entries whose `conditions` match).
  // -----------------------------------------------------------------------

  /** Reads every instance of any keyword in `names` (e.g. `['COLOR']` or
   *  `['ERRMSG', 'ERRMSGID']`) as a repeatable, independently-conditioned
   *  instance list - `{ name, parameters, conditions }[]`, in source order.
   *  `conditions` is each instance's OWN full condition-group array (not
   *  collapsed to a single indicator like getIndicatorTextRows) - callers
   *  that only need a bare indicator number can still read `conditions[0]
   *  .indicators[0].number` themselves, same as any other keyword's
   *  conditioning already works. `parameters` is left as raw, already-
   *  formatted DDS parameter text (quoting/escaping is the caller's job,
   *  same convention as the generic keyword editor's own add-keyword box) -
   *  this primitive doesn't know or care what shape a given keyword's
   *  parameters take. */
  function getRepeatableKeywordInstances(keywords, names) {
    var list = names || [];
    return (keywords || [])
      .filter(function (k) { return list.indexOf(k.name) >= 0; })
      .map(function (k) {
        return { name: k.name, parameters: k.parameters || '', conditions: k.conditions || [] };
      });
  }

  /** Returns a NEW keywords array with every existing instance of any
   *  keyword in `names` removed, replaced by one keyword per entry in
   *  `instances` (`{ name, parameters, conditions }`, `name` must be one of
   *  `names`) - entries with a blank/unrecognized `name` are skipped.
   *  Unlike setColorAttr/etc (which always write
   *  `conditions: []`, leaving conditioning to the generic keyword editor's
   *  own toggle), each instance here keeps its OWN `conditions` - this is
   *  what lets e.g. COLOR(RED) conditioned on indicator 10 and COLOR(GRN)
   *  conditioned on indicator 20 coexist as two separate, independently-
   *  conditioned COLOR keywords instead of one shared toggle covering
   *  both. */
  function setRepeatableKeywordInstances(keywords, names, instances) {
    var list = names || [];
    var next = (keywords || []).filter(function (k) { return list.indexOf(k.name) < 0; });
    (instances || []).forEach(function (inst) {
      if (!inst || !inst.name || list.indexOf(inst.name) < 0) return;
      next = next.concat([{ name: inst.name, parameters: inst.parameters || '', conditions: inst.conditions || [], raw: '', sourceLines: [] }]);
    });
    return next;
  }

  // -----------------------------------------------------------------------
  // Task L5d (piece i) - the base record's own "Define Indicator Keywords"
  // screen (docs/sda-reference/screens/record-level/base-record-keywords/
  // indicator/image19.png, and identically for a SFLCTL record at
  // .../indicator/image41.png) as Task L1's repeatable, independently-
  // conditioned instances. Unlike Task R3's own indicatorTextRowsHtml/
  // setIndicatorTextRows (SFL/SFLMSG/PDNSFLCTL's own simpler "Define
  // Indicator Keywords" screen - see .../indicator/image33.png,
  // window-subfile-wndsfl/indicator/image85.png - which offers only
  // INDTXT/SETOF/CHANGE, one bare response indicator each), a plain
  // record's (and a SFLCTL record's) own version of this screen ALSO
  // repeats CLEAR/PAGEDOWN/PAGEUP/HOME/HELP/HLPRTN/VLDCMDKEY - the exact
  // same "Keyword / Indicators+ / Resp / Text" repeatable-row shape,
  // just a wider keyword choice. CFnn/CAnn appear on that same real
  // screen too but are deliberately excluded here - they already have
  // their own dedicated Command keys panel (commandKeysSectionHtml/
  // wireCommandKeysSection) elsewhere in this record's properties, so
  // adding them again here would be two controls fighting over the same
  // keywords, the same reasoning sflKeywordsPanelsHtml's own General tab
  // gives for leaving out CHGINPDFT (already covered by Task R1's base
  // General tab). The real screen's "Indicators/+" column (up to 3
  // AND'd, continuable with "+") and "Resp" column together are exactly
  // an instance's own outer `conditions` (AND/OR groups, richer than the
  // real screen's own fixed 3-slot form) PLUS that keyword's own
  // response-indicator parameter - the same conditions-vs-parameter split
  // Task L1b's own doc comment already draws for ERRMSG's response
  // indicator. INDTXT is the one keyword here whose parameter carries a
  // second piece (`'text'` alongside the indicator), same shape
  // setIndicatorTextRows already parses for INDTXT elsewhere in this
  // file - `resp`/`text` are kept as separate fields on the instance
  // (rather than one opaque `parameters` string, unlike
  // getValidityCheckInstances above) since every OTHER keyword in this
  // set has no text component at all, and decomposing here means the UI
  // layer never needs to parse/format the combined string itself.
  // -----------------------------------------------------------------------

  var RECORD_INDICATOR_KEYWORD_NAMES = ['CLEAR', 'PAGEDOWN', 'PAGEUP', 'HOME', 'HELP', 'HLPRTN', 'VLDCMDKEY', 'SETOF', 'CHANGE', 'INDTXT'];

  // Task L22 remaining item: PAGEDOWN/PAGEUP have legacy alternate
  // spellings ROLLUP/ROLLDOWN - real SDA's own "Define Indicator Keywords"
  // screen (docs/sda-reference/screens/file-level/02-indicator-keywords/
  // image5.png) lists them together as "PAGEDOWN/ROLLUP" and
  // "PAGEUP/ROLLDOWN", the same keyword under two names, not two different
  // keywords - so a ROLLUP instance needs to read back as a PAGEDOWN-kind
  // row (and a re-committed instance always writes the canonical spelling;
  // the row-kind dropdown never offers ROLLUP/ROLLDOWN as separate
  // choices, same "normalize on edit" posture getFileFlagKeyword/
  // setFileFlagKeyword's own altNames now follow just below for the
  // simpler file-level checkbox version of this same screen).
  var RECORD_INDICATOR_READ_NAMES = RECORD_INDICATOR_KEYWORD_NAMES.concat(['ROLLUP', 'ROLLDOWN']);
  var RECORD_INDICATOR_ALT_KIND = { ROLLUP: 'PAGEDOWN', ROLLDOWN: 'PAGEUP' };

  /** Reads every CLEAR/PAGEDOWN/PAGEUP/HOME/HELP/HLPRTN/VLDCMDKEY/SETOF/
   *  CHANGE/INDTXT instance off `keywords` as Task L1's repeatable,
   *  independently-conditioned instances - `{ conditions, kind, resp,
   *  text }[]`, in source order. `resp` is that keyword's own response-
   *  indicator parameter (e.g. CLEAR's argument); `text` is only ever
   *  non-blank for an INDTXT instance (the quoted text portion of
   *  `INDTXT(indicator 'text')`, unquoted/unescaped the same way
   *  setIndicatorTextRows' own INDTXT parsing does it). A legacy
   *  ROLLUP/ROLLDOWN instance (Task L22) reads back with `kind` already
   *  normalized to PAGEDOWN/PAGEUP. */
  function getRecordIndicatorInstances(keywords) {
    return getRepeatableKeywordInstances(keywords, RECORD_INDICATOR_READ_NAMES).map(function (inst) {
      var kind = RECORD_INDICATOR_ALT_KIND[inst.name] || inst.name;
      if (kind === 'INDTXT') {
        var m = /^(\S*)\s*(?:'((?:[^']|'')*)')?/.exec((inst.parameters || '').trim());
        return { conditions: inst.conditions, kind: 'INDTXT', resp: (m && m[1]) || '', text: m && m[2] !== undefined ? m[2].replace(/''/g, "'") : '' };
      }
      return { conditions: inst.conditions, kind: kind, resp: (inst.parameters || '').trim(), text: '' };
    });
  }

  /** Returns a NEW keywords array with every existing instance of any
   *  keyword in RECORD_INDICATOR_KEYWORD_NAMES (OR its legacy
   *  ROLLUP/ROLLDOWN spellings, Task L22 - so toggling PAGEDOWN off also
   *  removes a legacy ROLLUP instance instead of leaving a stale duplicate
   *  behind) replaced by the given `instances` (`{ conditions, kind, resp,
   *  text }[]`, same shape getRecordIndicatorInstances returns) - each
   *  instance with a recognized `kind` AND a non-blank `resp` writes one
   *  keyword of that kind under that instance's OWN `conditions` (an
   *  instance with a blank `resp` writes nothing - CLEAR() with no
   *  indicator isn't valid DDS, same "an emptied-out instance just
   *  disappears" rule every other L1-based setX in this file already
   *  follows). `text` is folded into `resp` as `resp 'text'` ONLY for
   *  `kind === 'INDTXT'` (quoted/escaped the same way
   *  setIndicatorTextRows' own INDTXT formatting does it) - every other
   *  kind ignores a stray `text` value rather than erroring, same as real
   *  SDA's own screen leaves the Text column enabled regardless of which
   *  keyword a row picks. Every written instance always uses the
   *  canonical PAGEDOWN/PAGEUP spelling, never ROLLUP/ROLLDOWN - the kind
   *  dropdown never offers the legacy spellings as a choice. */
  function setRecordIndicatorInstances(keywords, instances) {
    var flat = (instances || [])
      .map(function (inst) {
        if (!inst || RECORD_INDICATOR_KEYWORD_NAMES.indexOf(inst.kind) < 0) return null;
        var resp = (inst.resp || '').trim();
        if (!resp) return null;
        var parameters = resp;
        if (inst.kind === 'INDTXT') {
          var text = (inst.text || '').trim();
          parameters = resp + (text ? " '" + text.replace(/'/g, "''") + "'" : '');
        }
        return { name: inst.kind, parameters: parameters, conditions: inst.conditions || [] };
      })
      .filter(Boolean);
    return setRepeatableKeywordInstances(keywords, RECORD_INDICATOR_READ_NAMES, flat);
  }

  var ERROR_MESSAGE_NAMES = ['ERRMSG', 'ERRMSGID'];

  /** Task L1b - ERRMSG/ERRMSGID wired onto the L1 foundation above. Real
   *  SDA's own "Define Error Messages" screen (docs/sda-reference/screens/
   *  field-level/character/error-messages/image171.png, confirmed
   *  identical for numeric fields) shows two repeatable, independently-
   *  conditioned lists sharing one screen - ERRMSG rows (message text +
   *  a response indicator) and ERRMSGID rows (msgid/file/library/response
   *  indicator/&name) - matching IBM's own DDS reference exactly:
   *    ERRMSG('message-text' [response-indicator])
   *    ERRMSGID(msgid [library-name/]msg-file [response-indicator] [&msg-data])
   *  (IBM DDS Reference V4R5, ERRMSG/ERRMSGID keyword section, Figure 174 -
   *  note library-name/msg-file is ONE slash-qualified token in the actual
   *  keyword text, even though SDA's own screen shows File/Library as two
   *  separate entry fields). The bare `response-indicator` here is a
   *  keyword-internal parameter (turned off again on the next input
   *  operation, same convention as INDTXT/SETOF/CHANGE's own response
   *  indicator elsewhere in this file) - it is NOT the same thing as an
   *  instance's own outer conditioning, which is what
   *  getRepeatableKeywordInstances/setRepeatableKeywordInstances above
   *  already carries via each instance's `conditions` array. Real DDS
   *  allows ERRMSG and ERRMSGID to coexist and each repeat on one field;
   *  at runtime the first one whose own conditioning is satisfied wins
   *  (IBM's own "Priority among Selected Keywords" rules) - this pair just
   *  reads/writes the list, the priority rule itself is a runtime concern
   *  outside what a design-time picker manages. */
  function getErrorMessageInstances(keywords) {
    return getRepeatableKeywordInstances(keywords, ERROR_MESSAGE_NAMES).map(function (inst) {
      if (inst.name === 'ERRMSG') {
        var m = /^'((?:[^']|'')*)'(?:\s+(\d+))?/.exec((inst.parameters || '').trim());
        return {
          kind: 'ERRMSG',
          conditions: inst.conditions,
          text: m ? m[1].replace(/''/g, "'") : '',
          responseIndicator: (m && m[2]) || '',
          msgId: '', library: '', msgFile: '', msgDataField: '',
        };
      }
      // ERRMSGID(msgid [library/]msgfile [response-indicator] [&msg-data])
      var tokens = (inst.parameters || '').trim().split(/\s+/).filter(Boolean);
      var msgId = tokens[0] || '';
      var qualified = tokens[1] || '';
      var slash = qualified.indexOf('/');
      var library = slash >= 0 ? qualified.slice(0, slash) : '';
      var msgFile = slash >= 0 ? qualified.slice(slash + 1) : qualified;
      var responseIndicator = '';
      var msgDataField = '';
      tokens.slice(2).forEach(function (t) {
        if (t.charAt(0) === '&') msgDataField = t;
        else if (/^\d+$/.test(t)) responseIndicator = t;
      });
      return {
        kind: 'ERRMSGID',
        conditions: inst.conditions,
        text: '', msgId: msgId, library: library, msgFile: msgFile,
        responseIndicator: responseIndicator, msgDataField: msgDataField,
      };
    });
  }

  /** Returns a NEW keywords array built from `instances` (same rich shape
   *  getErrorMessageInstances returns), replacing every existing ERRMSG/
   *  ERRMSGID. An ERRMSG instance needs non-blank `text`; an ERRMSGID
   *  instance needs non-blank `msgId` AND `msgFile` - incomplete entries
   *  are dropped rather than writing malformed DDS, same convention as
   *  every other setX in this file. */
  function setErrorMessageInstances(keywords, instances) {
    var raw = (instances || []).map(function (inst) {
      if (!inst) return null;
      if (inst.kind === 'ERRMSGID') {
        var msgId = (inst.msgId || '').trim();
        var msgFile = (inst.msgFile || '').trim();
        if (!msgId || !msgFile) return null;
        var library = (inst.library || '').trim();
        var qualified = (library ? library + '/' : '') + msgFile;
        var parts = [msgId, qualified];
        var respInd = (inst.responseIndicator || '').trim();
        if (respInd) parts.push(respInd);
        var msgDataField = (inst.msgDataField || '').trim();
        if (msgDataField) parts.push(msgDataField.charAt(0) === '&' ? msgDataField : '&' + msgDataField);
        return { name: 'ERRMSGID', parameters: parts.join(' '), conditions: inst.conditions || [] };
      }
      var text = (inst.text || '').trim();
      if (!text) return null;
      var parts2 = ["'" + text.replace(/'/g, "''") + "'"];
      var respInd2 = (inst.responseIndicator || '').trim();
      if (respInd2) parts2.push(respInd2);
      return { name: 'ERRMSG', parameters: parts2.join(' '), conditions: inst.conditions || [] };
    }).filter(Boolean);
    return setRepeatableKeywordInstances(keywords, ERROR_MESSAGE_NAMES, raw);
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

  // ---------------------------------------------------------------------
  // Sorting a record's fields/constants: unlike file-level keywords above
  // (upstream's getFileKeywordsLineRange/applyFileKeywordsUpdate), there is
  // no existing primitive for this yet.
  // ---------------------------------------------------------------------

  /**
   * Reorders a record's fields/constants in the DDS source (their top-to-
   * bottom source order - not their on-screen row/col, which is unrelated
   * and untouched here). `orderedSourceLines` must be exactly the record's
   * current field sourceLines, permuted into the desired order; each
   * field's own physical lines are moved as a whole verbatim chunk (not
   * regenerated), so nothing about an individual field's content changes,
   * only which chunk comes before which.
   *
   * Any HELP entries interleaved among the fields keep their own relative
   * SLOT in the sequence (the Nth non-help entry in source order becomes
   * whatever field orderedSourceLines says goes in that Nth slot) rather
   * than being reordered themselves or getting shuffled out of position -
   * a caller reordering fields has no reason to expect help entries to
   * move too.
   */
  function reorderFields(record, sourceLines, orderedSourceLines) {
    var fieldEntries = (record.fields || []).map(function (f) {
      return { type: 'field', item: f, range: getFieldLineRange(f) };
    });
    var helpEntries = (record.helpEntries || []).map(function (h) {
      return { type: 'help', item: h, range: getFieldLineRange(h) };
    });
    var all = fieldEntries.concat(helpEntries).sort(function (a, b) { return a.range[0] - b.range[0]; });
    if (all.length === 0) return sourceLines;

    var providedSet = {};
    (orderedSourceLines || []).forEach(function (ln) { providedSet[ln] = true; });
    var sameSize = (orderedSourceLines || []).length === fieldEntries.length;
    var sameMembers = sameSize && fieldEntries.every(function (e) { return providedSet[e.item.sourceLine]; });
    if (!sameSize || !sameMembers) {
      throw new Error("reorderFields: orderedSourceLines must be exactly the record's current field/constant source lines, reordered.");
    }

    var minStart = Math.min.apply(null, all.map(function (e) { return e.range[0]; }));
    var maxEnd = Math.max.apply(null, all.map(function (e) { return e.range[1]; }));

    var chunkByLine = {};
    all.forEach(function (e) {
      chunkByLine[e.item.sourceLine] = sourceLines.slice(e.range[0] - 1, e.range[1]);
    });

    var fieldQueue = orderedSourceLines.slice();
    var resultChunks = [];
    all.forEach(function (e) {
      var chunk = e.type === 'field' ? chunkByLine[fieldQueue.shift()] : chunkByLine[e.item.sourceLine];
      resultChunks = resultChunks.concat(chunk);
    });

    return sourceLines.slice(0, minStart - 1).concat(resultChunks, sourceLines.slice(maxEnd));
  }

  function applyRecordUpdate(record, sourceLines, updates) {
    var updated = {
      name: record.name,
      conditions: updates.conditions !== undefined ? updates.conditions : record.conditions,
      keywords: updates.keywords !== undefined ? updates.keywords : record.keywords,
    };

    var range = getRecordLineRange(record);
    var originalRangeLines = sourceLines.slice(range[0] - 1, range[1]);
    var originalLine1to6 = (originalRangeLines[0] || '').slice(0, 6);

    var newLines = serializeRecordEntry(updated, originalLine1to6);
    newLines = restampSequenceNumbers(newLines, originalRangeLines);
    return sourceLines.slice(0, range[0] - 1).concat(newLines, sourceLines.slice(range[1]));
  }

  // ---------------------------------------------------------------------
  // WINDOW geometry (move/resize): built on applyRecordUpdate rather than
  // its own line-splicing, since a WINDOW keyword is just one more entry in
  // record.keywords - the same "replace one keyword's parameters, re-run
  // serializeRecordEntry" path every other keyword edit already uses.
  // Handles all three real WINDOW forms (see resolveWindow's own doc
  // comment in dspfEngine.js): the explicit `row col height width` form
  // (both move and resize), the `*DFT height width` runtime-position form
  // (resize only - there's no row/col to move), and rejects the
  // `WINDOW(record-format-name)` inheritance form outright, since that
  // record doesn't own its own geometry to rewrite.
  // ---------------------------------------------------------------------

  /**
   * Moves and/or resizes a record's own WINDOW keyword. `geometry` is
   * `{ row, col, height, width }` - any omitted field keeps its current
   * value (so a pure move passes just `{row, col}`, a pure resize just
   * `{height, width}`). Throws for a form with no fixed geometry of its
   * own to rewrite (inherited-from-another-record, or a program-to-system
   * field name instead of a literal row/col) - same "editing disabled,
   * edit the source directly" stance `isEditable` already takes for
   * multi-group/>3-indicator conditioning elsewhere; callers should check
   * that case themselves before offering a drag/resize handle at all.
   */
  function setWindowGeometry(record, sourceLines, geometry) {
    var kw = record.keywords.find(function (k) { return k.name === 'WINDOW'; });
    if (!kw) throw new Error('This record has no WINDOW keyword to move or resize.');
    var parts = kw.parameters.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) throw new Error("This record's WINDOW keyword has no parameters to move or resize.");

    if (parts.length === 1 && !/^[+-]?\d+$/.test(parts[0]) && parts[0].toUpperCase() !== '*DFT') {
      throw new Error('This window inherits its geometry from record "' + parts[0] + '" (WINDOW(' + parts[0] + ')) - move or resize that record\'s own WINDOW keyword instead.');
    }

    var newParams;
    if (parts[0].toUpperCase() === '*DFT') {
      if (geometry.row != null || geometry.col != null) {
        throw new Error("This window's position is set at runtime (WINDOW(*DFT ...)) - it has no fixed row/column to move, only its height/width can be changed.");
      }
      var dftHeight = geometry.height != null ? geometry.height : parseInt(parts[1], 10);
      var dftWidth = geometry.width != null ? geometry.width : parseInt(parts[2], 10);
      if (!(dftHeight > 0) || !(dftWidth > 0)) throw new Error('Window height and width must both be positive.');
      newParams = '*DFT ' + dftHeight + ' ' + dftWidth;
    } else {
      var rowNum = parseInt(parts[0], 10);
      var colNum = parseInt(parts[1], 10);
      if (Number.isNaN(rowNum) || Number.isNaN(colNum)) {
        throw new Error("This window's position is a program-to-system field name, not a fixed row/column - it can't be moved or resized from the preview.");
      }
      var row = geometry.row != null ? geometry.row : rowNum;
      var col = geometry.col != null ? geometry.col : colNum;
      var height = geometry.height != null ? geometry.height : parseInt(parts[2], 10);
      var width = geometry.width != null ? geometry.width : parseInt(parts[3], 10);
      if (!(row > 0) || !(col > 0) || !(height > 0) || !(width > 0)) {
        throw new Error('Window row, column, height, and width must all be positive.');
      }
      newParams = row + ' ' + col + ' ' + height + ' ' + width;
    }

    var newKeywords = record.keywords.map(function (k) {
      return k === kw ? { name: 'WINDOW', parameters: newParams, conditions: kw.conditions, raw: kw.raw, sourceLines: kw.sourceLines } : k;
    });
    return applyRecordUpdate(record, sourceLines, { keywords: newKeywords });
  }

  /**
   * Renames a record format's own R-line - deliberately a SEPARATE function
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
   * usage/isReference/location{line,column}/keywords) to a copy of `field`, regenerates its
   * source lines, and splices them into `sourceLines` (array of original line strings, 1 per
   * array index with index 0 = line 1). Returns the new array of source lines; does not mutate
   * the input.
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
    if (updates.isReference !== undefined) updated.isReference = !!updates.isReference;
    if (updates.line !== undefined) updated.location.line = updates.line;
    if (updates.column !== undefined) {
      updated.location.column = updates.column;
      updated.location.relativeColumnOffset = null; // an explicit move always becomes an absolute column
    }
    if (updates.keywords !== undefined) updated.keywords = updates.keywords;
    if (updates.constantValue !== undefined) updated.constantValue = updates.constantValue;
    if (updates.conditions !== undefined) updated.conditions = updates.conditions;

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

  /** Same "lines cols [*qualifier]" triple-parsing, AND the same bare
   *  "*DS3"/"*DS4" (no lines/cols at all - DDS's other valid DSPSIZ form,
   *  `DSPSIZ(*DSw [*DSx])`) handling, as DspfEngine.screenSizeFromFileKeywords's
   *  own parseScreenSizes - duplicated (not required-in) rather than shared
   *  via require(), since this file is dropped into the webview as a plain
   *  <script> with no bundler (see file header) and can't assume a module
   *  loader is present there. Keep the two in sync if DSPSIZ's grammar ever
   *  changes. */
  var KNOWN_DISPLAY_SIZE_NAMES = { '*DS3': { lines: 24, columns: 80 }, '*DS4': { lines: 27, columns: 132 } };
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
      } else if (KNOWN_DISPLAY_SIZE_NAMES[t1.toUpperCase()]) {
        var known = KNOWN_DISPLAY_SIZE_NAMES[t1.toUpperCase()];
        sizes.push({ lines: known.lines, columns: known.columns, name: t1 });
        i++;
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
   *
   * `options.constantValue` (Task L43) overrides a literal constant's own
   * text - defaults to the source's own text unchanged. Has no effect on
   * a named FIELD (which has no constantValue at all) or a system-value
   * constant (constantValue is already empty on those - see L16's own
   * literal-vs-system-value distinction; there's no literal text on that
   * kind of constant to override).
   */
  function copyField(record, sourceLines, field, options) {
    options = options || {};
    var isNamedField = field.nameType === 'FIELD' && !!field.name;
    var name = isNamedField ? (options.name || nextAvailableFieldName(record, field.name)) : '';
    var constantValue = options.constantValue !== undefined ? options.constantValue : field.constantValue;
    var location = options.location || {
      line: field.location.line != null ? field.location.line + 1 : null,
      column: field.location.column,
    };
    var newField = {
      nameType: field.nameType,
      name: name,
      constantValue: constantValue,
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

  // ---------------------------------------------------------------------
  // Whole record formats: create / copy / delete. Everything above this
  // point (applyRecordUpdate, renameRecordFormat) only ever touches a
  // record format's OWN header/keyword lines (getRecordLineRange) - never
  // its fields. Creating, copying, or deleting a whole record needs a
  // range that includes every field/constant/help entry belonging to it
  // too (getFullRecordLineRange), since those physically follow the
  // record's own R-line in the source and have to move/disappear/get
  // duplicated together with it.
  // ---------------------------------------------------------------------

  /** Same as getRecordLineRange, but widened to also cover every field, constant,
   *  and help entry that belongs to the record - i.e. the record's ENTIRE physical
   *  footprint in the source, not just its own header/keyword lines. */
  function getFullRecordLineRange(record) {
    var range = getRecordLineRange(record);
    var min = range[0];
    var max = range[1];
    (record.fields || []).concat(record.helpEntries || []).forEach(function (f) {
      var r = getFieldLineRange(f);
      if (r[0] < min) min = r[0];
      if (r[1] > max) max = r[1];
    });
    return [min, max];
  }

  // ---------------------------------------------------------------------
  // Task L13 - DDS comment lines (position 7 = '*', free text in columns
  // 8-80). dspfParser.ts already collects every comment line file-wide
  // into `dspfFile.comments` ({ line, text }[]) and they already survive
  // every existing commit untouched (this codebase only ever makes
  // targeted line-array edits, never full-file regeneration, so a
  // comment line no function below happens to touch is never at risk of
  // being silently dropped) - the getters below just SCOPE that flat,
  // file-wide array to "this file's own header area" or "this one
  // record's own span," and the CRUD functions below THAT add/rewrite/
  // remove one comment line at a time. A comment is always exactly ONE
  // physical line - unlike a keyword or field, nothing about DDS's own
  // continuation syntax (+/-) ever applies to a comment line, so there's
  // no getXLineRange equivalent needed here; `line` alone is enough.
  // ---------------------------------------------------------------------

  /**
   * Comments before the FIRST record format's own header line - the same
   * "preamble" area file-level keywords (DSPSIZ, command keys, etc.) also
   * live in. If the file has no records at all yet (a malformed or
   * mid-edit file), every comment in it is treated as file-level, since
   * there's no record to scope anything else to.
   */
  function getFileComments(dspfFile) {
    var firstRecordLine = (dspfFile.records || []).length > 0
      ? Math.min.apply(null, dspfFile.records.map(function (r) { return r.sourceLine; }))
      : Infinity;
    return (dspfFile.comments || []).filter(function (c) { return c.line < firstRecordLine; });
  }

  /**
   * Comments that fall within ONE record's own physical span: from that
   * record's own header line up to (but not including) the NEXT record's
   * header line, or end-of-file for the last record. Deliberately wider
   * than getFullRecordLineRange (which stops at the record's last field) -
   * a comment trailing after the last field but before the next record's
   * own header still reads as belonging to THIS record, not the next one,
   * the same way a closing remark belongs to the paragraph before it
   * rather than the one after.
   */
  function getRecordComments(dspfFile, record) {
    var sorted = (dspfFile.records || []).slice().sort(function (a, b) { return a.sourceLine - b.sourceLine; });
    var pos = -1;
    sorted.forEach(function (r, i) { if (r.name === record.name) pos = i; });
    var nextStart = pos >= 0 && pos + 1 < sorted.length ? sorted[pos + 1].sourceLine : Infinity;
    return (dspfFile.comments || []).filter(function (c) { return c.line >= record.sourceLine && c.line < nextStart; });
  }

  /**
   * Task L54 - maps every physical line (1-based) in `sourceLines` to the
   * 1-based line number that starts its own DDS function-area continuation
   * chain (itself, if the line isn't a continuation line at all). A
   * function-area continuation is a line whose own cols 45-80 end in '+'
   * or '-', continued by the NEXT physical line PROVIDED that next line's
   * cols 7-44 are blank (DspfParser's own buildLogicalEntries resolves it
   * the exact same way - this duplicates that walk rather than importing
   * it, since it needs the flat per-line answer table up front, before any
   * line is spliced in, and dspfParser.ts's own version only classifies
   * already-final lines).
   *
   * Exists so a raw comment line (col 7 = '*') can be kept OUT of the
   * middle of one of these chains: splicing one in there doesn't just
   * misplace the comment - a continuation line's cols 7-44 are expected to
   * be blank, so a comment's '*' there desyncs the parser's own
   * continuation resolution entirely. The interrupted entry's function
   * text silently truncates at the dangling +/-, and what was meant to be
   * ITS continuation gets re-parsed instead as an unrelated new
   * keyword-only line - visibly breaking whatever field/record/keyword the
   * continuation belonged to. That corruption, not the comment itself, is
   * almost certainly why a comment inserted this way appeared to vanish
   * instead of landing where asked.
   */
  function continuationChainStarts(sourceLines) {
    var starts = new Array(sourceLines.length);
    var pendingContinuation = false;
    var chainStart = null;
    for (var i = 0; i < sourceLines.length; i++) {
      var padded = padTo(sourceLines[i], LINE_WIDTH);
      var col7 = padded.charAt(6);
      var cols7to44Blank = padded.slice(6, 44).trim() === '';
      if (pendingContinuation && cols7to44Blank) {
        starts[i] = chainStart;
        var continuedChunk = padded.slice(FUNCTION_AREA_START - 1, LINE_WIDTH).replace(/\s+$/, '');
        pendingContinuation = continuedChunk.length > 0 &&
          (continuedChunk.charAt(continuedChunk.length - 1) === '+' || continuedChunk.charAt(continuedChunk.length - 1) === '-');
        continue;
      }
      pendingContinuation = false;
      chainStart = i + 1;
      starts[i] = chainStart;
      if (col7 !== '*') {
        var chunk = padded.slice(FUNCTION_AREA_START - 1, LINE_WIDTH).replace(/\s+$/, '');
        pendingContinuation = chunk.length > 0 && (chunk.charAt(chunk.length - 1) === '+' || chunk.charAt(chunk.length - 1) === '-');
      }
    }
    return starts;
  }

  /** Builds one raw 80-column comment line: blank sequence number/form-type
   *  area (columns 1-6, matching the plain 'A' every other freshly-typed
   *  line in this codebase uses - see insertField's own doc comment),
   *  '*' in column 7, then `text` (truncated to fit columns 8-80, newlines
   *  stripped since a comment can't itself span multiple physical lines). */
  function buildCommentLine(text) {
    var t = (text || '').replace(/[\r\n]/g, '').slice(0, LINE_WIDTH - 7);
    return ('     A*' + t).replace(/\s+$/, '');
  }

  /**
   * Inserts a new comment line. Placement mirrors insertField's own "always
   * appended at the end of what's already there" rule: right after the
   * LAST existing comment in `existingComments` if there is one, else
   * right after `fallbackAfterLine` (the caller's own choice of where an
   * empty scope's first comment should land - see the two call sites in
   * buildWebviewTemplate.js for what each passes).
   *
   * `desiredLine` (Task L42) overrides that default when given: it's the
   * 1-based physical line number the NEW comment itself should end up as
   * in the resulting file, so inserting at `desiredLine` pushes whatever
   * was already at that line (and everything after it) down by one,
   * rather than requiring the caller to think in "insert after" terms.
   * Clamped to [1, sourceLines.length + 1] - a too-small value lands the
   * comment at the very top of the file, a too-large one appends it at
   * the very end - so a stale/out-of-range typed line number can never
   * throw or silently no-op.
   *
   * Task L54 - `desiredLine` is further pulled back, if needed, to the
   * start of whatever function-area continuation chain it would otherwise
   * land in the middle of (see continuationChainStarts's own doc comment
   * for why splicing a comment mid-chain corrupts far more than just this
   * one comment). The new comment ends up right before that whole
   * multi-line entry instead - never inside it.
   */
  function addComment(sourceLines, existingComments, fallbackAfterLine, text, desiredLine) {
    var insertAfterLine;
    if (desiredLine != null && !isNaN(desiredLine)) {
      var clamped = Math.max(1, Math.min(sourceLines.length + 1, Math.floor(desiredLine)));
      var chainStarts = continuationChainStarts(sourceLines);
      // chainStarts is indexed by (clamped - 1) since it's a 0-based array
      // over sourceLines and clamped is the 1-based line the comment would
      // land AT (pushing that line and beyond down by one) - a value of
      // sourceLines.length + 1 (append at the very end) has no entry to
      // look up and is never mid-chain anyway.
      var safeLine = clamped <= sourceLines.length ? chainStarts[clamped - 1] : clamped;
      insertAfterLine = safeLine - 1;
    } else {
      insertAfterLine = existingComments.length > 0
        ? Math.max.apply(null, existingComments.map(function (c) { return c.line; }))
        : fallbackAfterLine;
    }
    var newLine = buildCommentLine(text);
    return sourceLines.slice(0, insertAfterLine).concat([newLine], sourceLines.slice(insertAfterLine));
  }

  /**
   * Rewrites just one existing comment line's text (columns 8-80),
   * leaving columns 1-7 - sequence number, form type, the '*' flag itself
   * - exactly as they already were, the same "don't touch what wasn't
   * asked to change" stance every other targeted-line edit in this file
   * takes.
   */
  function updateComment(sourceLines, line, newText) {
    var idx = line - 1;
    if (idx < 0 || idx >= sourceLines.length) return sourceLines;
    var existing = sourceLines[idx];
    var padded = existing.length < LINE_WIDTH ? existing.padEnd(LINE_WIDTH, ' ') : existing;
    var prefix = padded.slice(0, 7);
    var t = (newText || '').replace(/[\r\n]/g, '').slice(0, LINE_WIDTH - 7);
    var next = sourceLines.slice();
    next[idx] = (prefix + t).replace(/\s+$/, '');
    return next;
  }

  /** Removes one existing comment line entirely. */
  function deleteComment(sourceLines, line) {
    var idx = line - 1;
    if (idx < 0 || idx >= sourceLines.length) return sourceLines;
    return sourceLines.slice(0, idx).concat(sourceLines.slice(idx + 1));
  }

  /**
   * Picks a record format name that isn't already used by any record in
   * `dspfFile`, starting from `baseName` with a numeric suffix (baseNAME2,
   * baseNAME3, ...) - same convention (and same 10-char DDS name limit) as
   * nextAvailableFieldName, just scoped to record names (file-wide, unlike
   * field names which are scoped per record format) instead of field names.
   */
  function nextAvailableRecordName(dspfFile, baseName) {
    var MAX_LEN = 10;
    var used = {};
    (dspfFile.records || []).forEach(function (r) {
      if (r.name) used[r.name.toUpperCase()] = true;
    });
    var n = 2;
    while (true) {
      var suffix = String(n);
      var truncated = String(baseName || 'REC').slice(0, Math.max(1, MAX_LEN - suffix.length));
      var candidate = (truncated + suffix).toUpperCase();
      if (!used[candidate]) return candidate;
      n++;
    }
  }

  /**
   * Creates a brand-new, empty record format (no fields/constants yet -
   * add those afterward with insertField, same two-step flow the menu
   * designer's "+ Add option" already relies on for its own new
   * constants). Always appended after the LAST existing record's entire
   * footprint (getFullRecordLineRange, not just its own header) - same
   * "always append, never guess mid-file position" placement rule
   * insertField uses for fields within a record, just one level up. If
   * the file has no records yet, it's placed after the file-level
   * keywords block (or at the very top if there's none of those either).
   * `newRecord` needs at minimum `name`; `conditions`/`keywords` default
   * to none, matching insertField's own defaults for a new field.
   */
  function insertRecord(dspfFile, sourceLines, newRecord) {
    return insertRecords(dspfFile, sourceLines, [newRecord]);
  }

  /**
   * Same placement rule as insertRecord (append after the LAST existing
   * record's full footprint, or after the file-level keywords block/top of
   * file if there are no records yet), but for MULTIPLE brand-new records
   * inserted together as one atomic block, in the order given - used by
   * insertTypedRecordWithDependent below so a subfile detail record and its
   * auto-created SFLCTL companion land as consecutive lines from a single
   * edit, rather than needing two separate insertRecord calls (which would
   * both compute the same insertion point against the ORIGINAL sourceLines
   * and so silently clobber/reorder each other if called naively in
   * sequence).
   */
  function insertRecords(dspfFile, sourceLines, newRecords) {
    var records = dspfFile.records || [];
    var insertAfterLine;
    if (records.length > 0) {
      var maxEnd = -Infinity;
      records.forEach(function (r) {
        var end = getFullRecordLineRange(r)[1];
        if (end > maxEnd) maxEnd = end;
      });
      insertAfterLine = maxEnd;
    } else {
      var fileKwRange = getFileKeywordsLineRange(dspfFile);
      insertAfterLine = fileKwRange ? fileKwRange[1] : 0;
    }

    var allNewLines = [];
    newRecords.forEach(function (newRecord) {
      var record = {
        name: newRecord.name,
        conditions: newRecord.conditions || [],
        keywords: newRecord.keywords || [],
      };
      allNewLines = allNewLines.concat(serializeRecordEntry(record, '     A'));
    });
    return sourceLines.slice(0, insertAfterLine).concat(allNewLines, sourceLines.slice(insertAfterLine));
  }

  /**
   * Creates a new record format the same way insertRecord does, but as the
   * "+ Add record" record-TYPE wizard's own primitive: newRecord.keywords may
   * already carry a type-defining keyword (SFLCTL(name), SFL, WINDOW(...))
   * from the caller's own type-to-keyword mapping. `pairBack`, when given, is
   * an EXISTING record whose own SFLCTL keyword must be added/replaced to
   * reference this brand-new record's name - the one case where creating a
   * record needs to touch a SECOND, already-existing record too (a Subfile
   * (SFL) record created after its control already exists - see the README's
   * "Record type + dependent record format name" note; SFLCTL(sflname) is
   * the control record's OWN keyword, so pairing an SFL detail record back to
   * a control that predates it means rewriting that control's SFLCTL
   * parameter to this new record's name, not just the new record's own
   * keywords). Always runs insertRecord FIRST and the pairBack update SECOND:
   * insertRecord only ever appends after the LAST existing record's full
   * footprint, so pairBack's own line range (computed against the ORIGINAL
   * sourceLines, before insertRecord's append) is still valid in the lines
   * insertRecord returns - reversing the order would risk pairBack's line
   * range going stale if applyRecordUpdate's own rewrite changed pairBack's
   * line count ahead of insertRecord computing where "the end" is.
   */
  function insertTypedRecord(dspfFile, sourceLines, newRecord, pairBack) {
    var newLines = insertRecord(dspfFile, sourceLines, newRecord);
    if (pairBack) {
      var updatedKeywords = pairBack.keywords
        .filter(function (k) { return k.name !== 'SFLCTL'; })
        .concat([{ name: 'SFLCTL', parameters: newRecord.name, conditions: [], raw: '', sourceLines: [] }]);
      newLines = applyRecordUpdate(pairBack, newLines, { keywords: updatedKeywords });
    }
    return newLines;
  }

  /**
   * The "+ Add record" wizard's primitive for an SFL-family type (SFL,
   * SFLMSG, WDWSFL, PDNSFL) - matching real SDA, which never lets a
   * subfile detail record exist without also creating its SFLCTL control
   * record: inserts `mainRecord` (the SFL-keyword detail record) AND
   * `dependentRecord` (the auto-generated SFLCTL, already carrying
   * `SFLCTL(mainRecord.name)` plus whatever else its family variant adds -
   * `WINDOW(...)` for WDWSFL, `PULLDOWN` for PDNSFL) together as ONE
   * insertRecords call, so both land as consecutive new lines from a
   * single edit instead of two separate ones that would each be computed
   * against the same stale "end of file" position. Order is main-then-
   * dependent (SFL record first, its SFLCTL control right after) purely for
   * source readability - DDS record formats are independent of each other's
   * position in the file either way.
   */
  function insertTypedRecordWithDependent(dspfFile, sourceLines, mainRecord, dependentRecord) {
    return insertRecords(dspfFile, sourceLines, [mainRecord, dependentRecord]);
  }

  /**
   * Duplicates an entire record format - its own conditions/keywords AND
   * every field/constant/help entry it contains - as a new record inserted
   * directly after the original's full footprint (see
   * getFullRecordLineRange), so the copy shows up right next to what it
   * was copied from rather than at the bottom of the file. The record's
   * own header/keyword lines are regenerated fresh (same as
   * applyRecordUpdate/renameRecordFormat) since its NAME has to change -
   * DDS doesn't allow two record formats with the same name in one file,
   * so unless the caller passes `options.name` explicitly, one is
   * generated via nextAvailableRecordName. Every field/constant/help line
   * is copied byte-for-byte verbatim (not regenerated): field NAMES don't
   * need to change, since DDS scopes field names per record format, not
   * file-wide - a copy's fields keep exactly the same names as the
   * original's, same as a fresh member starting from a template would.
   */
  function copyRecord(dspfFile, sourceLines, record, options) {
    options = options || {};
    var newName = options.name || nextAvailableRecordName(dspfFile, record.name);

    var ownRange = getRecordLineRange(record);
    var fullRange = getFullRecordLineRange(record);

    var newHeaderLines = serializeRecordEntry({ name: newName, conditions: record.conditions, keywords: record.keywords }, '     A');
    var fieldLines = sourceLines.slice(ownRange[1], fullRange[1]); // every field/constant/help line, copied verbatim
    var newBlock = newHeaderLines.concat(fieldLines);

    return sourceLines.slice(0, fullRange[1]).concat(newBlock, sourceLines.slice(fullRange[1]));
  }

  /**
   * Removes an entire record format - its own header/keyword lines AND
   * every field/constant/help entry belonging to it (getFullRecordLineRange)
   * - leaving everything else byte-for-byte untouched. Same "caller's
   * responsibility" stance as deleteField/renameRecordFormat for
   * cross-references: doesn't scan for or warn about other keywords
   * elsewhere in the file that might reference this record by name
   * (SFLCTL(name), WINDOW(record-name), MNUBARCHC, a HELP record's own
   * conditioning, etc.) - callers that care should scan first, the same
   * way the menu webview's findLikelyNameReferences() already does before
   * a rename.
   */
  function deleteRecord(record, sourceLines) {
    var range = getFullRecordLineRange(record);
    return sourceLines.slice(0, range[0] - 1).concat(sourceLines.slice(range[1]));
  }

  // ---------------------------------------------------------------------
  // Task R7 - WINDOW-specific picker (Window Parameters: size/roll +
  // Border Parameters/Color/Attributes/Characters - see docs/sda-reference/
  // screens/record-level/window/ and PICKER-SCREENS-PLAN.md). Border
  // Parameters/Color/Attributes/Characters are the SAME WDWBORDER keyword
  // F1 already built getWdwBorder/setWdwBorder for (confirmed against
  // screens/record-level/window/border-*/ - identical "Define Window
  // Border Parameters" screen, just scoped to a record's keywords instead
  // of the file's) - reused as-is, no new functions needed for that half.
  //
  // Only the WINDOW keyword's OWN parameters (Window Parameters screen)
  // are new here. Two controls shown on that real SDA screen are
  // deliberately NOT wired into the picker: the per-row "Display size"
  // column (conditions a value by *DS3/*DS4 - i.e. multiple DSPSIZ-
  // conditioned instances of the SAME keyword, the cross-cutting
  // limitation R1/F1/D1 already document and defer the same way
  // everywhere else in this codebase) and the "Roll +/-" column (this is
  // SDA's own in-terminal editing convenience - rolling through candidate
  // values with the 5250 roll keys while designing - not a DDS keyword at
  // all, so there's nothing to write).
  //
  // Task L6 - "Message line" IS now modeled: confirmed against IBM's own
  // WINDOW keyword reference (WINDOW(... window-lines window-positions
  // [*MSGLIN|*NOMSGLIN] [*RSTCSR|*NORSTCSR])) and cross-checked against
  // this codebase's OWN dspfEngine.js#resolveWindow, which already reads
  // this exact trailing *NOMSGLIN token to decide whether the window
  // reserves its own last usable line for messages ("msgLine" in its
  // return shape) when rendering the grid - i.e. the sacred grid-rendering
  // side already understood this token; only the picker's reader/writer
  // was missing it. *MSGLIN is the default when the token is omitted
  // (real SDA's own screen default is Y=Yes), so a picker-driven "message
  // line" of Yes never needs to WRITE a token at all - only *NOMSGLIN
  // (No) does. Not offered on the bare "Referenced window" form - IBM's
  // own doc notes that single-token form has no room for it and always
  // inherits the referenced window's own setting instead (same point
  // resolveWindow's own comment already made).
  // ---------------------------------------------------------------------

  /**
   * Reads the WINDOW keyword's own parameters into one of three shapes,
   * matching the three mutually-exclusive choices on the real "Define
   * Window Parameters" screen (Referenced window -OR- Window definition
   * with either Default start positioning -OR- an explicit Start line/
   * Start position) - and the exact same 3 forms setWindowGeometry's own
   * doc comment above already documents from reverse-engineering
   * dspfEngine.js's resolveWindow (that function is the actual on-screen
   * renderer, so its reading of the DDS spec is the authoritative one
   * this reuses rather than re-deriving from the screenshot alone):
   *   - no WINDOW keyword at all -> { mode: 'none' }
   *   - ONE parameter, not `*DFT`, e.g. `WINDOW(OTHERWDW)` ->
   *     { mode: 'reference', referenceName }: inherits geometry from
   *     another WINDOW record ("Referenced window").
   *   - THREE parameters starting with the literal `*DFT`, e.g.
   *     `WINDOW(*DFT 10 40)` -> { mode: 'sized', lines, columns, msgLine }:
   *     size only, the system positions it at runtime ("Default start
   *     positioning" Y=Yes).
   *   - FOUR parameters, e.g. `WINDOW(2 2 10 40)` -> { mode: 'positioned',
   *     startLine, startColumn, lines, columns, msgLine }: explicit
   *     top-left position + size. Each of the 4 can be a literal number OR
   *     a field name per DDS's own *VAR-style flexibility for WINDOW -
   *     kept as plain strings rather than parsed as numbers so a field
   *     name round-trips untouched.
   *   - anything else (an unrecognized shape) -> { mode: 'other', raw:
   *     the parameters text } so the picker can show a clear "use the raw
   *     Keywords editor for this" state instead of silently mis-rendering
   *     it.
   *
   * `msgLine` (Task L6) - only present for 'sized'/'positioned' - is read
   * from an optional trailing `*MSGLIN`/`*NOMSGLIN` token, stripped out of
   * `tokens` BEFORE the shape checks above run so its presence doesn't
   * throw an otherwise-recognized 3/4-token WINDOW into the 'other'
   * catch-all (that token can trail either form, per IBM's own WINDOW
   * syntax). Defaults to `true` (*MSGLIN, i.e. "has a message line") when
   * the token is absent, matching IBM's own documented default.
   *
   * `rstcsr` (Task L7) - same trailing-token treatment as `msgLine`, for
   * WINDOW's OTHER optional trailing token, `*RSTCSR`/`*NORSTCSR`
   * (confirmed against IBM's own WINDOW keyword reference: unlike
   * PULLDOWN's *NORSTCSR default, plain WINDOW's own documented default
   * is *RSTCSR - "restrict cursor" - so this defaults to `true` when the
   * token is absent). Real DDS has no standalone record-level `RSTCSR`
   * keyword - only this trailing sub-parameter - so a source file that
   * still carries the OLD bogus standalone `RSTCSR` line this picker used
   * to write (see setWindowParamsKeyword's own doc comment) is
   * deliberately NOT consulted here: that line was never valid DDS to
   * begin with (any such file would already fail to compile on its own),
   * so there is no real intent worth salvaging from its mere
   * presence/absence - the correct trailing token (or its true default)
   * is always the single source of truth going forward.
   */
  function getWindowParamsKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'WINDOW'; });
    if (!k) return { mode: 'none' };
    var rawTokens = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    var msgLine = true;
    var rstcsr = true;
    var tokens = rawTokens.filter(function (t) {
      var u = t.toUpperCase();
      if (u === '*NOMSGLIN') { msgLine = false; return false; }
      if (u === '*MSGLIN') { msgLine = true; return false; }
      if (u === '*NORSTCSR') { rstcsr = false; return false; }
      if (u === '*RSTCSR') { rstcsr = true; return false; }
      return true;
    });
    if (tokens.length === 1 && tokens[0].toUpperCase() !== '*DFT') return { mode: 'reference', referenceName: tokens[0] };
    if (tokens.length === 3 && tokens[0].toUpperCase() === '*DFT') return { mode: 'sized', lines: tokens[1], columns: tokens[2], msgLine: msgLine, rstcsr: rstcsr };
    if (tokens.length === 4) return { mode: 'positioned', startLine: tokens[0], startColumn: tokens[1], lines: tokens[2], columns: tokens[3], msgLine: msgLine, rstcsr: rstcsr };
    return { mode: 'other', raw: k.parameters || '' };
  }

  /**
   * Returns a NEW keywords array with WINDOW built from `state` (same
   * shape getWindowParamsKeyword returns, minus 'none'/'other' which both
   * mean "leave WINDOW out" here - 'other' is read-only in the picker,
   * edited via the raw Keywords editor instead). Removes WINDOW entirely
   * if the mode's required fields aren't all filled in, same
   * "incomplete input just means not-present-yet, not a thrown error"
   * stance setFileRefKeyword already takes (unlike
   * the throw-on-bad-input drag/resize setWindowGeometry above, which is
   * reacting to a mouse gesture on an EXISTING geometry rather than a
   * form a person is still filling in).
   *
   * Task L6 - `state.msgLine === false` appends a trailing `*NOMSGLIN`
   * token to the 'sized'/'positioned' forms (ignored for 'reference',
   * which has no room for it - see getWindowParamsKeyword's own doc
   * comment). Anything other than exactly `false` (including `undefined`,
   * so every pre-L6 caller that never set this field keeps working
   * unchanged) omits the token entirely, since *MSGLIN is the default
   * IBM applies when it's absent - no need to ever write it explicitly.
   *
   * Task L7 - `state.rstcsr === false` appends a trailing `*NORSTCSR`
   * token the exact same way (after the msgLin token, matching IBM's own
   * documented `[*MSGLIN|*NOMSGLIN] [*RSTCSR|*NORSTCSR]` order) - *RSTCSR
   * is WINDOW's own default here, so again only the non-default value
   * ever needs writing. Also fixes the real bug this task exists for:
   * Task R7 originally modeled "Restrict cursor to window" as a bogus
   * standalone `RSTCSR` keyword (real DDS has no such record-level
   * keyword - any file this picker ever wrote that flag into would have
   * failed to compile), via `DspfWriter.getFileFlagKeyword`/
   * `setFileFlagKeyword(keywords, 'RSTCSR', ...)`. Every call into this
   * function now also strips out any such leftover standalone `RSTCSR`
   * line unconditionally, so re-saving a WINDOW record through this
   * picker self-heals a file affected by the old bug, whether or not the
   * caller's own `state` even mentions `rstcsr` - the correct information
   * (if any was salvageable) already moved to `windowPanelsHtml`/
   * `wireWindowPanels` reading the real trailing token instead.
   */
  function setWindowParamsKeyword(keywords, state) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'WINDOW' && kw.name !== 'RSTCSR'; });
    var params = null;
    var msgLinSuffix = state.msgLine === false ? ' *NOMSGLIN' : '';
    var rstcsrSuffix = state.rstcsr === false ? ' *NORSTCSR' : '';
    var trailingSuffix = msgLinSuffix + rstcsrSuffix;
    if (state.mode === 'reference') {
      var ref = (state.referenceName || '').trim();
      if (ref) params = ref;
    } else if (state.mode === 'sized') {
      var lines1 = (state.lines || '').toString().trim();
      var cols1 = (state.columns || '').toString().trim();
      if (lines1 && cols1) params = '*DFT ' + lines1 + ' ' + cols1 + trailingSuffix;
    } else if (state.mode === 'positioned') {
      var sl = (state.startLine || '').toString().trim();
      var sc = (state.startColumn || '').toString().trim();
      var lines2 = (state.lines || '').toString().trim();
      var cols2 = (state.columns || '').toString().trim();
      if (sl && sc && lines2 && cols2) params = sl + ' ' + sc + ' ' + lines2 + ' ' + cols2 + trailingSuffix;
    }
    if (params) {
      next = next.concat([{ name: 'WINDOW', parameters: params, conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  // ---------------------------------------------------------------------
  // Task R10 - PULLDOWN-specific picker (General keywords x2 - the
  // PULLDOWN keyword's own *SLTIND/*RSTCSR sub-flags, plus Window
  // borders/WDWBORDER - and Select record keywords, i.e. wiring PULLDOWN
  // into R1's base 8-category set, which is already automatic for every
  // record type except USRDFN - see docs/sda-reference/screens/
  // record-level/pulldown-puldwn/ and PICKER-SCREENS-PLAN.md). Border
  // Parameters reuse getWdwBorder/setWdwBorder as-is (confirmed identical
  // "Define Window Border Parameters" screen to file-level/WINDOW's, just
  // scoped to a PULLDOWN record's own keywords) - no new functions needed
  // for that half, same reasoning R7's own section comment gives.
  // Deliberately NOT wired here: WINDOW's own "Window Parameters" screen
  // (size/roll/start position) - real SDA's PULLDOWN menu doesn't offer
  // it (PULLDOWN records are auto-sized/positioned by the runtime, no
  // WINDOW keyword involved), matching the plan doc's "no
  // window-parameters" note for this task.
  // ---------------------------------------------------------------------

  /**
   * Reads the PULLDOWN keyword's own state - `{ present, sltind, rstcsr }`
   * - matching the "Pull-down" row and its two indented sub-rows
   * (Selection indicators / Restrict cursor to pull-down) on the real
   * "Define General Keywords" screen. Same shape UNLOCK's *ERASE/*MDTOFF
   * pair already takes (one keyword, independent optional sub-flags
   * space-separated within its own parameter list) - PULLDOWN([*SLTIND]
   * [*RSTCSR]) rather than separate keyword instances.
   */
  function getPulldownKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'PULLDOWN'; });
    if (!k) return { present: false, sltind: false, rstcsr: false };
    var text = (k.parameters || '').toUpperCase();
    return { present: true, sltind: /\*SLTIND\b/.test(text), rstcsr: /\*RSTCSR\b/.test(text) };
  }

  /** Returns a NEW keywords array with PULLDOWN set from `present`/
   *  `sltind`/`rstcsr` - removed entirely when `present` is false, same
   *  "flag plus independent option sub-flags" shape setUnlockKeyword
   *  above already takes. */
  function setPulldownKeyword(keywords, present, sltind, rstcsr) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'PULLDOWN'; });
    if (present) {
      var vals = [];
      if (sltind) vals.push('*SLTIND');
      if (rstcsr) vals.push('*RSTCSR');
      next = next.concat([{ name: 'PULLDOWN', parameters: vals.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  // ---------------------------------------------------------------------
  // Task I-26 - SFLSNGCHC/SFLMLTCHC (Subfile Single/Multiple Choice
  // Selection List) - record-level SFLCTL keywords turning a subfile into
  // a scrollable choice list instead of an ordinary paging subfile.
  // Neither documents option indicators as valid. Both share the same
  // *NORSTCSR/*RSTCSR and *NOSLTIND/*SLTIND bracket groups (SLTIND's own
  // default is always *NOSLTIND regardless of context; RSTCSR's own
  // default flips to *RSTCSR specifically "if the SFL[SNGCHC|MLTCHC]
  // subfile control record is defined in a pulldown" - see
  // isPulldownRecord in webviewClientHelpers.js, which is what "defined
  // in a pulldown" means in DDS terms: the SFLCTL record itself also
  // carries PULLDOWN). SFLSNGCHC additionally has a 3-way *NOAUTOSLT/
  // *AUTOSLT/*AUTOSLTENH group whose default likewise flips to *AUTOSLT
  // in a pulldown (SFLMLTCHC has no AUTOSLT group at all). SFLMLTCHC
  // additionally takes an optional &number-selected field-name parameter
  // (must name a hidden 4,0 signed-numeric field per its own DDS
  // Reference text - left as free text here, same fallback the rest of
  // this codebase uses for a keyword parameter this project doesn't yet
  // validate the field's own shape for).
  //
  // Each RSTCSR/AUTOSLT tri/4-state getter/setter uses '' to mean
  // "not written - context default applies" (distinct from explicitly
  // writing *NORSTCSR/*NOAUTOSLT, which IS one of the writable choices
  // per the DDS Reference's own bracket groups) so a user working inside
  // a pulldown can still explicitly force the non-pulldown default, or
  // vice versa, rather than only ever getting the "on" variant the way
  // PULLDOWN's own simpler SLTIND/RSTCSR sub-flags above do.
  // ---------------------------------------------------------------------

  /** Reads SFLSNGCHC's own state - `{ present, rstcsr, sltind, autoslt }` -
   *  where `rstcsr` is '' | 'RSTCSR' | 'NORSTCSR' and `autoslt` is
   *  '' | 'AUTOSLT' | 'NOAUTOSLT' | 'AUTOSLTENH' (see this section's own
   *  top comment for why '' isn't the same as the explicit NO* value). */
  function getSflSngChcKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'SFLSNGCHC'; });
    if (!k) return { present: false, rstcsr: '', sltind: false, autoslt: '' };
    var text = (k.parameters || '').toUpperCase();
    var rstcsr = /\*RSTCSR\b/.test(text) ? 'RSTCSR' : (/\*NORSTCSR\b/.test(text) ? 'NORSTCSR' : '');
    var autoslt = /\*AUTOSLTENH\b/.test(text) ? 'AUTOSLTENH' : (/\*AUTOSLT\b/.test(text) ? 'AUTOSLT' : (/\*NOAUTOSLT\b/.test(text) ? 'NOAUTOSLT' : ''));
    return { present: true, rstcsr: rstcsr, sltind: /\*SLTIND\b/.test(text), autoslt: autoslt };
  }

  /** Returns a NEW keywords array with SFLSNGCHC set from `present`/
   *  `rstcsr`/`sltind`/`autoslt` - removed entirely when `present` is
   *  false. `rstcsr`/`autoslt` of '' write nothing for that group
   *  (context default applies); any other value writes that literal
   *  *value token. */
  function setSflSngChcKeyword(keywords, present, rstcsr, sltind, autoslt) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'SFLSNGCHC'; });
    if (present) {
      var vals = [];
      if (rstcsr) vals.push('*' + rstcsr);
      if (sltind) vals.push('*SLTIND');
      if (autoslt) vals.push('*' + autoslt);
      next = next.concat([{ name: 'SFLSNGCHC', parameters: vals.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** Reads SFLMLTCHC's own state - `{ present, numberSelectedField,
   *  rstcsr, sltind }` - `rstcsr` is '' | 'RSTCSR' | 'NORSTCSR', same
   *  convention as getSflSngChcKeyword above. No autoslt group - SFLMLTCHC
   *  doesn't have one. */
  function getSflMltChcKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'SFLMLTCHC'; });
    if (!k) return { present: false, numberSelectedField: '', rstcsr: '', sltind: false };
    var text = k.parameters || '';
    var upper = text.toUpperCase();
    var rstcsr = /\*RSTCSR\b/.test(upper) ? 'RSTCSR' : (/\*NORSTCSR\b/.test(upper) ? 'NORSTCSR' : '');
    var fieldM = /&([A-Za-z0-9_#@$]+)/.exec(text);
    return { present: true, numberSelectedField: fieldM ? fieldM[1] : '', rstcsr: rstcsr, sltind: /\*SLTIND\b/.test(upper) };
  }

  /** Returns a NEW keywords array with SFLMLTCHC set from `present`/
   *  `numberSelectedField`/`rstcsr`/`sltind` - removed entirely when
   *  `present` is false. `numberSelectedField` (blank to omit) is written
   *  as the keyword's own leading &field-name parameter, per its "must
   *  name a hidden field with a length of 4, data type of Y, and zero
   *  decimal positions" DDS Reference text (this project doesn't validate
   *  the named field's own shape yet - same free-text fallback the rest
   *  of this codebase takes for parameters it doesn't validate). */
  function setSflMltChcKeyword(keywords, present, numberSelectedField, rstcsr, sltind) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'SFLMLTCHC'; });
    if (present) {
      var vals = [];
      if ((numberSelectedField || '').trim()) vals.push('&' + numberSelectedField.trim());
      if (rstcsr) vals.push('*' + rstcsr);
      if (sltind) vals.push('*SLTIND');
      next = next.concat([{ name: 'SFLMLTCHC', parameters: vals.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** Whether turning `name` (one of 'SFLSNGCHC'/'SFLMLTCHC') ON on this
   *  record would conflict with something already there. Per both
   *  keywords' own DDS Reference text, neither can share a record with
   *  SFLDROP, SFLFOLD, or the OTHER of the pair - same
   *  alertAndRevert-bidirectional idiom I-8/I-11/I-13's own conflict
   *  checkers use, but this project doesn't yet also guard the reverse
   *  direction (turning SFLDROP/SFLFOLD on while SFLSNGCHC/SFLMLTCHC is
   *  already present) - left for a follow-up, same convention Task R3's
   *  own CHGINPDFT/etc. partial guards took where only one direction was
   *  built first. Returns a reason string, or '' if there's no conflict. */
  function sflChoiceListConflictReason(name, keywords) {
    var other = name === 'SFLSNGCHC' ? 'SFLMLTCHC' : 'SFLSNGCHC';
    var present = function (n) { return (keywords || []).some(function (kw) { return kw.name === n; }); };
    if (present(other)) return name + ' cannot be specified on the same record as ' + other + ' (mutually exclusive per the DDS Reference).';
    if (present('SFLDROP')) return name + ' cannot be specified on the same record as SFLDROP (mutually exclusive per the DDS Reference).';
    if (present('SFLFOLD')) return name + ' cannot be specified on the same record as SFLFOLD (mutually exclusive per the DDS Reference).';
    return '';
  }

  // -----------------------------------------------------------------------
  // Task I-80 - SFLCSRPRG vs SFLLIN. SFLCSRPRG's own DDS Reference section
  // ends: "The SFLLIN keyword is not allowed in a record that contains the
  // SFLCSRPRG." Read literally that is unsatisfiable - SFLCSRPRG is a
  // FIELD-level keyword on a field of the subfile (SFL) record, while
  // SFLLIN is a RECORD-level keyword that its own section says goes "on the
  // subfile-control record format" - so no valid file can put both on one
  // record. The only reading with any effect is through the association
  // the two records already have (the control record's SFLCTL(sfl-record)
  // parameter): a subfile record with a SFLCSRPRG field cannot be shown by
  // a control record that carries SFLLIN (a horizontal, multi-column
  // subfile, where "the same field in the NEXT subfile record" has no
  // single next). That is what is enforced here, in both directions; see
  // the I-80 section of keywordFixes.md for the interpretation note.
  // Both functions are diff-based (same shape as I-58/I-64/I-81's
  // backstops, for the same commitEdit/commitRecordEdit choke points): an
  // edit is only blamed for a violation it INTRODUCES, so a hand-written
  // file that is already invalid never blocks an unrelated edit, and
  // fixing it is always allowed.
  // -----------------------------------------------------------------------

  /** The name of the subfile record a control record's SFLCTL(name) points
   *  at, or '' when it has none. */
  function sflctlTargetName(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'SFLCTL'; });
    return k ? String(k.parameters || '').trim().replace(/^\(|\)$/g, '') : '';
  }

  /** Task I-86 - the SFLCTL panel's own SFLNXTCHG row operates on the
   *  SFLCTL record's OWN keywords, but SFLCHCCTL's field-level rule lives
   *  on the LINKED subfile (SFL) record's fields - SFLCTL(subfile-record-
   *  name) can point at a different record entirely, so the control
   *  record's own (usually field-less) fields are the wrong thing to
   *  check. Same target-resolution sfllinAssociatedViolation (I-80)
   *  already established for the analogous SFLLIN/SFLCSRPRG cross-record
   *  check just above - and it degrades correctly to the combined-record
   *  case too (SFLCTL naming its OWN record resolves right back to itself,
   *  same fields wireSflKeywordsPanels's own guard would see). */
  function sflctlNxtchgSflchcctlConflictReason(keywords, records) {
    var target = sflctlTargetName(keywords);
    if (!target) return '';
    var sflRec = (records || []).find(function (r) { return r.name === target; });
    if (!sflRec) return '';
    return sflNxtchgSflchcctlConflictReason((sflRec.fields || []).map(function (f) { return f.keywords; }));
  }

  function sfllinAssociatedViolation(keywords, records) {
    if (!(keywords || []).some(function (kw) { return kw.name === 'SFLLIN'; })) return null;
    var target = sflctlTargetName(keywords);
    if (!target) return null;
    var sflRec = (records || []).find(function (r) { return r.name === target; });
    if (!sflRec) return null;
    var f = (sflRec.fields || []).find(function (fld) {
      return (fld.keywords || []).some(function (kw) { return kw.name === 'SFLCSRPRG'; });
    });
    return f ? { recordName: target, fieldName: f.name || '' } : null;
  }

  /** Record-level side (commitRecordEdit): `rec` is the record being
   *  edited, `newKeywords` its keyword list after the edit, `records` the
   *  model's records. Blocks an edit that introduces SFLLIN on a control
   *  record - or points a control record that already has SFLLIN at a
   *  subfile record via SFLCTL - when that subfile record has a field with
   *  SFLCSRPRG. Returns a reason or null. */
  function sfllinRecordEditConflictReason(rec, newKeywords, records) {
    var after = sfllinAssociatedViolation(newKeywords, records);
    if (!after) return null;
    if (sfllinAssociatedViolation(rec && rec.keywords, records)) return null;
    return 'SFLLIN cannot be used with subfile record ' + after.recordName + ', which has ' +
      (after.fieldName ? 'field ' + after.fieldName + ' with ' : 'a field with ') +
      'SFLCSRPRG - the DDS Reference does not allow SFLLIN together with SFLCSRPRG. Remove SFLCSRPRG first.';
  }

  /** Field-level side (commitEdit): `subfileRecordName` is the record that
   *  owns the field being edited, `oldKeywords`/`newKeywords` the field's
   *  own keywords around the edit. Blocks an edit that introduces
   *  SFLCSRPRG on the field while a control record pointing at this record
   *  (SFLCTL(subfileRecordName)) carries SFLLIN. Returns a reason or null. */
  function sflcsrprgFieldEditConflictReason(subfileRecordName, oldKeywords, newKeywords, records) {
    var has = function (kws) { return (kws || []).some(function (kw) { return kw.name === 'SFLCSRPRG'; }); };
    if (!has(newKeywords) || has(oldKeywords)) return null;
    var ctl = (records || []).find(function (r) {
      return sflctlTargetName(r.keywords) === subfileRecordName && (r.keywords || []).some(function (kw) { return kw.name === 'SFLLIN'; });
    });
    if (!ctl) return null;
    return 'SFLCSRPRG cannot be specified on a field of subfile record ' + subfileRecordName + ' because its control record ' + ctl.name +
      ' carries SFLLIN - the DDS Reference does not allow SFLLIN together with SFLCSRPRG. Remove SFLLIN first.';
  }

  /** Task I-81 - SFLRTNSEL's own DDS Reference section says "If this keyword
   *  is specified then SFLMLTCHC or SFLSNGCHC must be specified". I-39 added
   *  SFLRTNSEL with only a hint when neither is selected; this is the hard
   *  block, for BOTH directions:
   *   A. adding SFLRTNSEL to a record that has neither SFLSNGCHC nor
   *      SFLMLTCHC (after the edit);
   *   B. removing the LAST of SFLSNGCHC / SFLMLTCHC while SFLRTNSEL is
   *      still present (switching one for the other is fine - one remains).
   *  Given the record's keyword list before and after an edit, returns a
   *  reason string when the edit INTRODUCES the violation, else null.
   *
   *  Diff-based backstop, same shape as I-58's wrdwrapNewConflictReason and
   *  I-64's pshbtnfldNewConflictReason, for ONE choke point (commitRecordEdit)
   *  that covers every record-level path at once - the SFLCTL panel's
   *  SFLRTNSEL checkbox, its type selector, and the raw keyword editor
   *  (whose Remove has no guard hook of its own). A record that was already
   *  invalid before the edit (a hand-written file with SFLRTNSEL and no
   *  choice keyword) is not re-reported, so unrelated edits to it are never
   *  blocked, and fixing it (adding a choice keyword or removing SFLRTNSEL)
   *  is always allowed. */
  function sflrtnselNewConflictReason(oldKeywords, newKeywords) {
    var has = function (kws, n) { return (kws || []).some(function (kw) { return kw.name === n; }); };
    var hasChoice = function (kws) { return has(kws, 'SFLSNGCHC') || has(kws, 'SFLMLTCHC'); };
    if (!has(newKeywords, 'SFLRTNSEL')) return null;
    if (hasChoice(newKeywords)) return null;
    // The record ends up invalid; only blame this edit if it introduced that.
    if (!has(oldKeywords, 'SFLRTNSEL')) {
      return 'SFLRTNSEL requires SFLSNGCHC or SFLMLTCHC to be specified on the record (per the DDS Reference) - choose a selection-list type first.';
    }
    if (hasChoice(oldKeywords)) {
      return 'SFLSNGCHC or SFLMLTCHC cannot be removed while the record carries SFLRTNSEL, which requires one of them (per the DDS Reference) - turn SFLRTNSEL off first.';
    }
    return null;
  }

  /** Whether turning SFLSCROLL ON on this field would conflict with
   *  something already there. Per SFLSCROLL's own DDS Reference text,
   *  "You cannot specify the SFLROLVAL, the SFLSCROLL and the SFLRCDNBR
   *  keywords for the same field" (all 3 mutually exclusive on ONE
   *  field), and "Only one SFLSCROLL keyword is allowed in the subfile
   *  control record" (unique across every field in the whole record, not
   *  just this one) - `siblingFieldsKeywords` is every OTHER field's own
   *  keywords array in the same record, needed only for that
   *  record-wide uniqueness check. Returns a reason string, or '' if
   *  there's no conflict. */
  function sflScrollFieldConflictReason(fieldKeywords, siblingFieldsKeywords) {
    var present = function (n) { return (fieldKeywords || []).some(function (kw) { return kw.name === n; }); };
    if (present('SFLROLVAL')) return 'SFLSCROLL cannot be specified on the same field as SFLROLVAL (mutually exclusive per the DDS Reference).';
    if (present('SFLRCDNBR')) return 'SFLSCROLL cannot be specified on the same field as SFLRCDNBR (mutually exclusive per the DDS Reference).';
    var alreadyElsewhere = (siblingFieldsKeywords || []).some(function (fk) {
      return (fk || []).some(function (kw) { return kw.name === 'SFLSCROLL'; });
    });
    if (alreadyElsewhere) return 'Only one SFLSCROLL keyword is allowed in the subfile control record - another field already has it.';
    return '';
  }

  /** Task I-79 - SFLCHCCTL's own DDS Reference section: "That field must be
   *  the first field defined in the subfile record. That field must have a
   *  length of 1, data type of Y, decimal positions of zero, and have a
   *  usage of H... Only one SFLCHCCTL keyword can be used in one subfile
   *  record." I-39 added the keyword itself with hint text only - none of
   *  the three rules were hard-blocked.
   *
   *  Same split I-57/I-62 used for PSHBTNFLD: the field-shape rule (length/
   *  type/decimals/usage) is the field's OWN definition, so it is silently
   *  REWRITTEN to the required Y/1/0/H shape when the checkbox is turned on
   *  (sflchcctlDefinitionUpdates, mirroring pshbtnfldDefinitionUpdates) -
   *  there is nothing else that shape could sensibly mean once a field is
   *  turned into a bare control flag. The other two rules are structural
   *  facts ABOUT THE RECORD that this one edit cannot silently fix (moving
   *  the field to be first, or freeing up the record's only SFLCHCCTL
   *  slot), so those are hard-blocked instead by
   *  sflchcctlFieldConflictReason below, called BEFORE the checkbox commits
   *  - same '' (not null) / isFirstField+siblingFieldsKeywords convention
   *  sflScrollFieldConflictReason just above uses for its own one-per-
   *  record rule. "First field" is read as the first NAMED field in the
   *  record (nameType !== 'CONSTANT') - DDS's own terminology throughout
   *  this Reference calls constants out separately from fields, and IBM's
   *  own SFLCHCCTL example places the control field before any other
   *  field with no constant in between. */
  function sflchcctlDefinitionUpdates(field) {
    var f = field || {};
    var updates = {};
    if ((f.dataType || '').toUpperCase() !== 'Y') updates.dataType = 'Y';
    if (Number(f.length) !== 1) updates.length = 1;
    if (Number(f.decimalPositions) !== 0 || f.decimalPositions == null) updates.decimalPositions = 0;
    if ((f.usage || '').toUpperCase() !== 'H') updates.usage = 'H';
    return Object.keys(updates).length ? updates : null;
  }

  function sflchcctlFieldConflictReason(isFirstField, siblingFieldsKeywords, recordKeywords) {
    if (!isFirstField) return 'SFLCHCCTL must be on the first field defined in the subfile record (per the DDS Reference).';
    var alreadyElsewhere = (siblingFieldsKeywords || []).some(function (fk) {
      return (fk || []).some(function (kw) { return kw.name === 'SFLCHCCTL'; });
    });
    if (alreadyElsewhere) return 'Only one SFLCHCCTL keyword is allowed in the subfile record - another field already has it.';
    // Task I-86 - the reverse direction of sflNxtchgSflchcctlConflictReason
    // below: the same DDS Reference sentence blocks SFLCHCCTL from being
    // added when the record already has SFLNXTCHG, just as it blocks
    // SFLNXTCHG from being added when a field already has SFLCHCCTL.
    var hasNxtchg = (recordKeywords || []).some(function (kw) { return kw.name === 'SFLNXTCHG'; });
    if (hasNxtchg) return 'SFLCHCCTL cannot be added to a record that already has SFLNXTCHG (per the DDS Reference).';
    return '';
  }

  /** Task I-86 - SFLCHCCTL's own DDS Reference section, right after its
   *  first-field/shape/one-per-record rules, adds one more: "SFLNXTCHC
   *  keyword cannot be specified in a record that contains a field with
   *  the SFLCHCCTL keyword." ("SFLNXTCHC" is read as SFLNXTCHG - the only
   *  keyword by that name anywhere in the DDS Reference; the same page
   *  spells it SFLNXTCHG 15 other times, including its own section header
   *  "SFLNXTCHG (Subfile Next Changed) keyword for display files" a few
   *  hundred lines later - this one occurrence is a single dropped letter,
   *  not a second, otherwise-undocumented keyword.)
   *
   *  SFLNXTCHG is itself record-level, specified "on the subfile record
   *  format" (SFLNXTCHG's own section) - the same physical record
   *  SFLCHCCTL's control field lives in, including the combined SFL+SFLCTL
   *  case (see wireSflKeywordsPanels/wireSflCtlPanels's own I-86 comments
   *  for why both call sites need this). Forward direction only (turning
   *  SFLNXTCHG ON); the reverse direction (turning SFLCHCCTL on when
   *  SFLNXTCHG is already present) is sflchcctlFieldConflictReason's own
   *  recordKeywords check above. Returns a reason string, or '' - same
   *  convention as sflchcctlFieldConflictReason/sflScrollFieldConflictReason. */
  function sflNxtchgSflchcctlConflictReason(fieldsKeywords) {
    var hasChcctl = (fieldsKeywords || []).some(function (fk) {
      return (fk || []).some(function (kw) { return kw.name === 'SFLCHCCTL'; });
    });
    if (hasChcctl) return 'SFLNXTCHG cannot be added to a record that contains a field with the SFLCHCCTL keyword (per the DDS Reference).';
    return '';
  }

  /** Task I-79 - a data type, length, decimals or usage CHANGE (the Basic
   *  tab's Apply changes) on a field that ALREADY carries SFLCHCCTL.
   *  Turning the keyword ON brings the field into the required Y/1/0/H
   *  shape automatically (see sflchcctlDefinitionUpdates); this closes the
   *  other direction, same shape as I-62's pshbtnfldBasicEditConflictReason.
   *  Diff-based: only a CHANGE away from the required shape is blocked, so
   *  an unrelated Apply on an already-invalid hand-written field still goes
   *  through. Returns a reason string, or null. */
  function sflchcctlBasicEditConflictReason(fieldKeywords, oldField, updates) {
    var hasChcctl = (fieldKeywords || []).some(function (k) { return k.name === 'SFLCHCCTL'; });
    if (!hasChcctl) return null;
    var oldF = oldField || {};
    var upd = updates || {};
    var has = function (key) { return Object.prototype.hasOwnProperty.call(upd, key); };
    var str = function (v) { return String(v == null ? '' : v).trim().toUpperCase(); };
    var num = function (v) {
      if (v == null || v === '') return null;
      var n = Number(v);
      return isNaN(n) ? null : n;
    };
    var before = {
      dataType: str(oldF.dataType),
      length: num(oldF.length),
      decimalPositions: num(oldF.decimalPositions),
      usage: str(oldF.usage)
    };
    var after = {
      dataType: has('dataType') ? str(upd.dataType) : before.dataType,
      length: has('length') ? num(upd.length) : before.length,
      decimalPositions: has('decimalPositions') ? num(upd.decimalPositions) : before.decimalPositions,
      usage: has('usage') ? str(upd.usage) : before.usage
    };
    var stillWrong = sflchcctlDefinitionUpdates(after) || {};
    var shown = function (v) { return v == null || v === '' ? 'blank' : v; };
    var problems = [];
    if (stillWrong.dataType !== undefined && after.dataType !== before.dataType) problems.push('data type ' + shown(after.dataType) + ' (must be Y)');
    if (stillWrong.length !== undefined && after.length !== before.length) problems.push('length ' + shown(after.length) + ' (must be 1)');
    if (stillWrong.decimalPositions !== undefined && after.decimalPositions !== before.decimalPositions) problems.push('decimal positions ' + shown(after.decimalPositions) + ' (must be 0)');
    if (stillWrong.usage !== undefined && after.usage !== before.usage) problems.push('usage ' + shown(after.usage) + ' (must be H)');
    if (!problems.length) return null;
    return 'SFLCHCCTL requires a length-1, data type Y, 0-decimal, usage H field (per the DDS Reference) - cannot set ' + problems.join(', ') + '.';
  }

  /** Task I-88 - Resolve Referenced Field (extension.ts) overwrites a
   *  reference field's length, data type and decimals with the values from
   *  the real database file, through applyFieldUpdate. Unlike the Basic tab's
   *  Apply, nothing checked those against the keywords already on the field,
   *  so a resolve could leave it in a state the panels themselves refuse:
   *  WRDWRAP (I-61) with a data type it forbids, PSHBTNFLD (I-62) with
   *  anything but Y / length 2 / 0 decimals, CHRID (I-70) with decimal
   *  positions (which make it numeric), DUP (I-72) or BLKFOLD (I-82) on a
   *  floating-point field, SFLCHCCTL (I-79) with anything but Y / 1 / 0.
   *
   *  This runs, for the definition properties a resolve writes (length,
   *  dataType, decimalPositions - never usage, so CHKMSGID's usage-only rule
   *  cannot be affected), the very same diff-based Basic-tab checks, in the
   *  same order the Basic tab's Apply handler runs them, so the two can never
   *  drift apart. `field` is the parsed field (with its keywords); `updates`
   *  carries only the properties being written (an absent key counts as
   *  unchanged). Returns the first reason string, or null when the definition
   *  can be applied. Diff-based like the checks it composes: a resolve that
   *  leaves a property as it is never trips on an already-invalid
   *  hand-written field, and a resolve to a conforming value is never
   *  blocked. The database's own character type comes back as a blank data
   *  type (DDS's default, A), which is not treated as a change from an
   *  explicit A (see the normalisation below). */
  function referencedFieldResolveConflictReason(field, updates) {
    var f = field || {};
    var u = updates || {};
    var kws = f.keywords || [];
    // A resolved CHARACTER field comes back with a blank data type - DDS's
    // default, and the same thing as an explicit A - so a blank over an existing
    // A is not a change of data type. Left in, every diff-based check below
    // would see "A -> blank" as a change and re-report an already-invalid
    // hand-written field it is supposed to leave alone.
    if (Object.prototype.hasOwnProperty.call(u, 'dataType') &&
        String(u.dataType == null ? '' : u.dataType).trim() === '' &&
        String(f.dataType == null ? '' : f.dataType).trim().toUpperCase() === 'A') {
      var kept = {};
      Object.keys(u).forEach(function (key) { if (key !== 'dataType') kept[key] = u[key]; });
      u = kept;
    }
    var newDataType = Object.prototype.hasOwnProperty.call(u, 'dataType') ? u.dataType : f.dataType;
    return wrdwrapBasicEditConflictReason(kws, f.dataType, f.usage, newDataType, f.usage) ||
      pshbtnfldBasicEditConflictReason(kws, f, u) ||
      dupFloatNewConflictReason(f, u) ||
      blkfoldFloatNewConflictReason(f, u) ||
      chridBasicEditConflictReason(kws, f, u) ||
      sflchcctlBasicEditConflictReason(kws, f, u) ||
      null;
  }

  // ---------------------------------------------------------------------
  // Task R4 - SFLCTL-specific picker (Subfile Control menu: General/
  // Display Layout/Subfile Messages - see docs/sda-reference/screens/
  // record-level/subfile-control-sflctl/ and PICKER-SCREENS-PLAN.md).
  // Also wires SFLCTL to R1's base 8-category set (already automatic -
  // R1's Keywords subtabs apply to every record type except USRDFN,
  // narrowed by R2) and to R3's Subfile Keywords screen (SFLNXTCHG/
  // LOGOUT/LOGINP/KEEP/CHECK(AB)/CHECK(RL) + repeatable INDTXT/SETOF/
  // CHANGE rows) - those DDS keywords aren't syntactically restricted to
  // the SFL detail record, and real SDA's own SFLCTL "General Keywords"
  // screen groups CHECK(AB)/CHECK(RL) alongside SFLCTL's own keywords, so
  // this reuses R3's getIndicatorTextRows/setIndicatorTextRows and
  // getFileFlagKeyword calls directly rather than duplicating them or
  // building a second "SFL tab" that would be confusing to show on a
  // control record.
  //
  // Most of SFLCTL's own General-category keywords are a simple "present,
  // optionally with one free-text parameter" shape - getFileFlagKeyword
  // covers SFLCTL/SFLCSRRRN/SFLMODE (name parameters), SFLDSP/SFLDSPCTL/
  // SFLINZ/SFLDLT/SFLCLR/SFLRNA (plain flags), SFLDROP/SFLFOLD/SFLENTER
  // (a CFnn/CAnn command-key parameter - free text rather than validated,
  // same fallback the rest of this codebase uses for a keyword whose
  // parameter isn't a fixed enum), and SFLEND (a *MORE/*SCRBAR parameter -
  // free text for the same reason, even though only 2 values are
  // documented, since a blank SFLEND is also valid DDS and worth keeping
  // reachable without a synthetic third option). SFLMSG (single quoted
  // message) reuses getFileQuotedText/setFileQuotedText, the same
  // WDWTITLE/HLPTITLE shape.
  //
  // Two things from the real SDA screens: getFileFlagKeyword/
  // getFileQuotedText above cover every OTHER SFLCTL keyword as a single
  // primary instance, same limitation R1/F1/D1/R3 document elsewhere (one
  // primary instance per keyword; the Advanced/raw keywords accordion and
  // its per-keyword Conditioning toggle still reach the rest) - genuinely
  // out of scope here, unchanged by this task. SFLMSG/SFLMSGID themselves,
  // though, are NOW modeled as fully repeatable - Task L1c wires the
  // generic L1 "repeatable conditioned instance" component
  // (repeatableConditionedInstancesHtml/wireRepeatableConditionedInstances
  // in webviewClientHelpers.js) into both, since real DDS lets each appear
  // multiple times with its own independent up-to-3-indicator condition
  // set (not an embedded parameter the way INDTXT/SETOF/CHANGE's response
  // indicator is). parseSflMsgIdParams/formatSflMsgIdParams below are the
  // per-INSTANCE version of what used to be getSflMsgId/setSflMsgId (a
  // single-primary-instance getter/setter over a whole keywords array) -
  // those two are now superseded and removed; SFLMSG itself never had its
  // own keywords-array-level getter beyond the generic
  // getFileQuotedText/setFileQuotedText already used for HLPTITLE/WDWTITLE,
  // which L1c's per-instance UI bypasses in favor of
  // quoteDdsLiteral/unquoteDdsLiteral directly (each instance's own raw
  // `parameters`, not a single keywords-array lookup). SFLMSGID's trailing
  // "Ind"/"Name" columns shown on the real screen still aren't modeled -
  // only msgid/message-file/library (IBM's own documented 3-parameter
  // form) were confidently verified; getting a keyword's parameter ORDER
  // wrong risks writing invalid DDS, which is worse than leaving those two
  // columns for the raw editor.
  // ---------------------------------------------------------------------

  /**
   * Display Layout screen (docs/sda-reference/screens/record-level/
   * subfile-control-sflctl/display-layout/) - SFLSIZ (records in
   * subfile), SFLPAG (records per page), and SFLLIN (spacing between
   * records) each independently accept a plain number, PLUS (per each
   * one's own DDS Reference section) a display-size condition name
   * (`*DSx`) for a second, secondary-display-size-only value - required
   * if that keyword's value actually differs between the file's two
   * DSPSIZ sizes. Modeled as `{primary, bySizeName}` per keyword, same
   * shape getFileMsgLocLines/getSflMsgRcdLines already use for the same
   * mechanism - see getDisplaySizeConditionedValue's own doc comment.
   *
   * SFLSIZ alone ALSO accepts a program-to-system field name in place of
   * a number (confirmed both by its own DDS Reference text and by the
   * real screen's own separate "Program-to-system field" row under
   * SFLSIZ's "Number" row, absent from SFLPAG/SFLLIN's own rows) - but
   * its own text is explicit that "You cannot use display size condition
   * names for this keyword when a program-to-system field is used as a
   * parameter for it," so a size-conditioned SFLSIZ value must always be
   * a plain number even though the unconditioned (primary) one doesn't
   * have to be - see sflsizConditionedFieldNameConflictReason below.
   * SFLPAG's own DDS Reference section documents ONLY a plain number
   * (`SFLPAG(number-of-records-to-be-displayed)`, no field-name
   * alternative stated anywhere in its own text, and the real screen
   * above has no "Program-to-system field" row under SFLPAG either) -
   * SFLLIN's own section is a plain number too. Kept as strings rather
   * than parsed as numbers throughout so a field name round-trips
   * untouched, same reasoning getWindowParamsKeyword's position
   * parameters already take.
   */
  function getDisplaySizeConditionedValue(keywords, keywordName) {
    var result = { primary: '', bySizeName: {} };
    (keywords || []).filter(function (kw) { return kw.name === keywordName; }).forEach(function (kw) {
      var value = (kw.parameters || '').trim();
      var sizeGroup = (kw.conditions || []).filter(function (g) { return g && g.displaySizeCondition; })[0];
      if (sizeGroup) {
        result.bySizeName[sizeGroup.displaySizeCondition.name] = value;
      } else {
        result.primary = value;
      }
    });
    return result;
  }

  /** Returns a NEW keywords array with every existing instance of
   *  `keywordName` removed and replaced by: one unconditioned instance
   *  for `primary` (if non-blank), plus one instance per non-blank entry
   *  in `bySizeName`, each conditioned by that size's own display-size
   *  condition name - same shape/idiom as setFileMsgLocLines/
   *  setSflMsgRcdLines. Only ever touches `keywordName`'s own instances -
   *  safe to call once per keyword in sequence (see setSflDisplayLayout
   *  below) without disturbing the other two. */
  function setDisplaySizeConditionedValue(keywords, keywordName, primary, bySizeName) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== keywordName; });
    var p = (primary == null ? '' : String(primary)).trim();
    if (p) next = next.concat([{ name: keywordName, parameters: p, conditions: [], raw: '', sourceLines: [] }]);
    Object.keys(bySizeName || {}).forEach(function (sizeName) {
      var v = (bySizeName[sizeName] == null ? '' : String(bySizeName[sizeName])).trim();
      if (!v) return;
      next = next.concat([{
        name: keywordName,
        parameters: v,
        conditions: [{ relation: 'AND', indicators: [], displaySizeCondition: { name: sizeName, not: false }, sourceLines: [] }],
        raw: '',
        sourceLines: [],
      }]);
    });
    return next;
  }

  /** Task I-22: SFLSIZ's own DDS Reference text - "You cannot use display
   *  size condition names for this keyword when a program-to-system
   *  field is used as a parameter for it" - only restricts a SIZE-
   *  CONDITIONED instance's own value, not the unconditioned (primary)
   *  one. A DDS field name is alphabetic-first, alphanumeric; the
   *  "number" form is purely numeric digits - so a non-numeric value
   *  offered for a size-conditioned SFLSIZ instance is unambiguously the
   *  forbidden combination, not a judgment call. Returns a reason string
   *  if `value` (destined for a bySizeName entry) violates this, or null
   *  if fine. Only applies to SFLSIZ - SFLPAG/SFLLIN have no
   *  program-to-system field form at all (see this section's own doc
   *  comment above), so there's nothing to conflict with for either. */
  function sflsizConditionedFieldNameConflictReason(value) {
    var v = (value == null ? '' : String(value)).trim();
    if (!v) return null;
    if (/^\d+$/.test(v)) return null;
    return 'SFLSIZ cannot use a display-size condition name on a value that is a program-to-system field (per the DDS Reference) - a size-conditioned SFLSIZ value must be a plain number.';
  }

  function getSflDisplayLayout(keywords) {
    return {
      sflsiz: getDisplaySizeConditionedValue(keywords, 'SFLSIZ'),
      sflpag: getDisplaySizeConditionedValue(keywords, 'SFLPAG'),
      sfllin: getDisplaySizeConditionedValue(keywords, 'SFLLIN'),
    };
  }

  /** Returns a NEW keywords array with SFLSIZ/SFLPAG/SFLLIN each
   *  independently set from `state` (same `{sflsiz, sflpag, sfllin}` of
   *  `{primary, bySizeName}` shape getSflDisplayLayout returns) - each of
   *  the three is fully replaced regardless of whether its own value
   *  actually changed, so a caller must always pass the current state of
   *  all three (typically getSflDisplayLayout's own fresh return value,
   *  with just the one field the person edited overwritten) rather than
   *  a partial update - same "must round-trip everything, not just what
   *  changed" contract setSflMsgRcdLines/setFileMsgLocLines already
   *  document for the identical reason. */
  function setSflDisplayLayout(keywords, state) {
    var s = state || {};
    var next = keywords || [];
    next = setDisplaySizeConditionedValue(next, 'SFLSIZ', s.sflsiz && s.sflsiz.primary, s.sflsiz && s.sflsiz.bySizeName);
    next = setDisplaySizeConditionedValue(next, 'SFLPAG', s.sflpag && s.sflpag.primary, s.sflpag && s.sflpag.bySizeName);
    next = setDisplaySizeConditionedValue(next, 'SFLLIN', s.sfllin && s.sfllin.primary, s.sfllin && s.sfllin.bySizeName);
    return next;
  }

  /**
   * Parses a raw SFLMSGID parameter string (msgid/message-file/[library],
   * IBM's documented 3-token form) into { msgId, msgFile, library } - the
   * per-INSTANCE version of what used to be getSflMsgId's whole-keywords-
   * array lookup (see this section's own doc comment above for why it's
   * superseded, and why the real screen's trailing "Ind"/"Name" columns
   * still aren't modeled). Works directly on one instance's raw
   * `parameters` string, the shape Task L1's
   * getRepeatableKeywordInstances/setRepeatableKeywordInstances pass
   * around.
   */
  function parseSflMsgIdParams(parameters) {
    var tokens = (parameters || '').trim().split(/\s+/).filter(Boolean);
    return { msgId: tokens[0] || '', msgFile: tokens[1] || '', library: tokens[2] || '' };
  }

  /** Inverse of parseSflMsgIdParams - library only included if both msgId
   *  and msgFile are present too (same rule the superseded setSflMsgId
   *  used). Returns '' (an instance with a blank payload) when msgId or
   *  msgFile is blank; the caller (Task L1c's SFLMSGID wiring in
   *  webviewClientHelpers.js) decides what an empty-parameters instance
   *  means, same as any other repeatable instance's payload. */
  function formatSflMsgIdParams(state) {
    var msgId = ((state && state.msgId) || '').trim();
    var msgFile = ((state && state.msgFile) || '').trim();
    var library = ((state && state.library) || '').trim();
    if (!msgId || !msgFile) return '';
    return msgId + ' ' + msgFile + (library ? ' ' + library : '');
  }

  // ---------------------------------------------------------------------
  // Task L38 - source modification tracking. Rather than threading an
  // options param through every individual apply*/insert*/delete*
  // function above (dozens of call sites across buildWebviewTemplate.js/
  // buildMenuWebviewTemplate.js/extension.ts), this is a single
  // POST-PROCESSING step meant to wrap the one before/after pair every
  // edit already produces (original sourceLines in, a new sourceLines
  // array out) - exactly what buildWebviewTemplate.js's own
  // commitSourceChange() choke point already has on hand, since virtually
  // every DSPF designer edit funnels through it. Every apply*/insert*/
  // delete* function above already follows the same "one contiguous
  // range replaced, everything else byte-for-byte untouched" shape (see
  // this file's own top-of-file doc comment), so a plain common-prefix/
  // common-suffix trim - not a general-purpose diff/LCS algorithm - is
  // enough to isolate exactly the range that changed.
  // ---------------------------------------------------------------------

  function commonPrefixLen(a, b) {
    var n = Math.min(a.length, b.length);
    var i = 0;
    while (i < n && a[i] === b[i]) i++;
    return i;
  }

  function commonSuffixLen(a, b, maxLen) {
    var n = Math.min(a.length, b.length, maxLen == null ? Infinity : maxLen);
    var i = 0;
    while (i < n && a[a.length - 1 - i] === b[b.length - 1 - i]) i++;
    return i;
  }

  /** Turns an existing line into a plain DDS comment - column 7 set to '*'
   *  (the same flag buildCommentLine's own freshly-typed comments use),
   *  every other column (sequence number/form type in 1-6, the line's own
   *  original content from 8 on) left exactly as it was, so the line
   *  reads as history rather than being reworded into a synthetic note.
   *  A too-short line is padded (never truncated) before columns 1-6/7
   *  are addressed by index. */
  function commentOutLine(line) {
    var s = line == null ? '' : String(line);
    if (s.length < 7) s = s + new Array(7 - s.length + 1).join(' ');
    return (s.slice(0, 6) + '*' + s.slice(7)).replace(/\s+$/, '');
  }

  /** Normalizes whatever the person typed into the properties panel's
   *  modification-tag box into the fixed 10-character payload that gets
   *  written to columns 81-90 - stripped of newlines (a tag is always
   *  one line) and capped at 10 characters; no particular format is
   *  imposed beyond that, per how this task was scoped. */
  function buildModTag(rawTag) {
    return (rawTag || '').replace(/[\r\n]/g, '').slice(0, 10);
  }

  /** Appends `tag` starting at column 81 - past LINE_WIDTH (80), i.e. past
   *  every column DDS's own compiler ever reads for a source member with
   *  a record length long enough to hold it - padding the line out to
   *  exactly 80 columns first (never truncating real column 1-80
   *  content) so the tag always lands in the same fixed column no matter
   *  how short the line's own compiled content is. A blank/empty tag is a
   *  no-op (nothing appended, line returned unchanged). */
  function appendModTag(line, tag) {
    if (!tag) return line;
    var s = line == null ? '' : String(line);
    if (s.length < LINE_WIDTH) s = s + new Array(LINE_WIDTH - s.length + 1).join(' ');
    return (s + tag).replace(/\s+$/, '');
  }

  /**
   * Wraps a completed edit's (oldLines -> newLines) pair with modification
   * tracking, when `options.enabled` is true: the common prefix/suffix
   * between the two arrays is trimmed off first (untouched lines, which
   * can dwarf the actually-edited range in a large file), then every
   * position within the remaining differing range is classified:
   *   - present in both, identical -> left alone, no tag
   *   - present in both, different -> the OLD line is commented out
   *     (commentOutLine) immediately before the NEW line, which itself
   *     gets the inline tag (appendModTag)
   *   - only in the new range (the edit grew the line count) -> tagged,
   *     nothing to comment out
   *   - only in the old range (the edit shrank the line count) -> kept,
   *     commented out, rather than silently dropped - this is what keeps
   *     a deletion's history in the file too, not just an in-place edit's
   *   - a genuinely blank old line dropped by a shrinking edit is NOT
   *     preserved as an empty comment - there is no content worth a
   *     history entry for
   * `options.enabled` false (the common case - feature is off) returns
   * `newLines` completely unchanged, so this is always safe to call
   * unconditionally from a single choke point like commitSourceChange().
   */
  function applyModificationTracking(oldLines, newLines, options) {
    options = options || {};
    if (!options.enabled) return newLines;
    var tag = buildModTag(options.tag);
    if (!tag) return newLines;

    var prefix = commonPrefixLen(oldLines, newLines);
    var maxSuffix = Math.min(oldLines.length, newLines.length) - prefix;
    var suffix = commonSuffixLen(oldLines, newLines, maxSuffix);

    var oldMid = oldLines.slice(prefix, oldLines.length - suffix);
    var newMid = newLines.slice(prefix, newLines.length - suffix);
    if (oldMid.length === 0 && newMid.length === 0) return newLines;

    // Task L52 bug fix: this used to be ONE loop that pushed comment(old[i])
    // then tag(new[i]) for each index in turn, interleaving old-comment and
    // new-content lines whenever the mid region has more than one line on
    // either side - e.g. editing text that spans two existing DDS lines
    // (a two-line CONSTANT continuation, or - the reported case - a menu
    // option label consolidating two separate CONSTANT fragments into one
    // rewritten, re-wrapped one) produced [comment old0][new0][comment
    // old1][new1] instead of grouping every comment together ahead of
    // every new line. That's not just cosmetically wrong: DDS requires a
    // continuation line ('-'/'+' in column 80) to immediately follow the
    // line it continues, so an unrelated commented-out line landing
    // between a new line and its own continuation corrupts the field
    // entirely - it silently disappeared from the canvas because the
    // parser could no longer reconstruct it. Two separate passes instead:
    // every changed/removed OLD line gets commented out first, in its own
    // original order, then every changed/added NEW line gets tagged and
    // appended after, in its own new order - matching what real SDA's own
    // pending-change display would look like, and what was reported
    // directly as the expected shape. A line that's genuinely unchanged
    // AT THE SAME index in both old and new mid (a rare but possible
    // "sandwiched" case even after the prefix/suffix trim above) is
    // carried through bare, once, in the second pass's own position -
    // it needs neither commenting nor a tag, and pass two's natural
    // left-to-right order is exactly where it belongs relative to the
    // genuinely new content around it.
    var outMid = [];
    var maxLen = Math.max(oldMid.length, newMid.length);
    for (var i = 0; i < maxLen; i++) {
      var oi = i < oldMid.length ? oldMid[i] : null;
      var ni = i < newMid.length ? newMid[i] : null;
      if (oi != null && oi !== ni && oi.trim() !== '') outMid.push(commentOutLine(oi));
    }
    for (var j = 0; j < maxLen; j++) {
      var oj = j < oldMid.length ? oldMid[j] : null;
      var nj = j < newMid.length ? newMid[j] : null;
      if (nj == null) continue;
      outMid.push(oj === nj ? nj : appendModTag(nj, tag));
    }

    return newLines.slice(0, prefix).concat(outMid, newLines.slice(newLines.length - suffix));
  }

  // ---------------------------------------------------------------------
  // S36-3: System/36 environment (S36E) keyword restriction rule set.
  //
  // Scope: this task is the RULE TABLE only - a data-driven description of
  // what each of the 6 named keywords (ALTNAME, CHANGE, HELP/HLPRTN, MSGID,
  // PRINT(*PGM), RETKEY/RETCMDKEY) is restricted to when the file also has
  // USRDSPMGT (S36-2's already-confirmed file flag). Wiring these as UI
  // hard blocks is S36-4, not this task.
  //
  // Every entry below was checked against IBM's current DDS Reference for
  // display files before being encoded (per this task's own "verify each
  // against IBM's current DDS reference before encoding - don't guess"
  // instruction) rather than assumed from general S36E knowledge.
  //
  // Update: all six are now verified, using the official IBM i "DDS for
  // Display Files" reference PDF the person supplied directly
  // (docs/sda-reference/source/DDS_Keyword_V7r6.pdf) - the same appendix
  // web searches and archived-mirror fetches repeatedly failed to surface
  // in full during S36-3's original research. Reading that appendix
  // directly revealed something the original research missed: of the six,
  // only CHANGE, HELP/HLPRTN, and PRINT are actually GATED BY USRDSPMGT
  // (their behavior changes specifically because USRDSPMGT is present).
  // ALTNAME, MSGID, and RETKEY/RETCMDKEY appear in that same appendix
  // chapter simply because they're commonly used together with S36E
  // migrated/program-described files, but IBM's own text never qualifies
  // their rules with "in a file containing USRDSPMGT" the way it explicitly
  // does for the other three - their rules apply unconditionally. Each
  // entry's new `gatedByUsrdspmgt` field records this distinction; S36-4's
  // existing hard-block wiring already only ever checked `appliesTo ===
  // 'response-indicator'` (true for exactly CHANGE/HELP/PRINT), so this
  // correction needed no change to that wiring itself - only to what this
  // table records as true.
  //
  // The three USRDSPMGT-gated entries (CHANGE, HELP, PRINT) share one real
  // mechanism confirmed on IBM's "Keyword considerations for display files
  // used in the System/36 environment" page: S36E applications do not
  // support response indicators on these keywords, so specifying one in a
  // USRDSPMGT file is flagged at file-creation time. HELP is the one
  // exception called out by name on that same page - CHANGE and PRINT's
  // response indicator only produces a WARNING, but HELP's produces an
  // ERROR, and IBM's own S36E-specific HELP/HLPRTN sub-page explains why:
  // in a USRDSPMGT file, a HELP response indicator alone does not return
  // control to the program at all - HLPRTN must be specified for that.
  //
  // Correction: PRINT(*PGM) is its OWN documented case, not - as this
  // table previously (incorrectly) inferred from a separate, general PRINT
  // keyword page's "the only difference between these two forms is the
  // response indicator" statement - simply the response-indicator warning
  // in disguise. IBM's dedicated "PRINT(*PGM) keyword" S36E sub-page says
  // nothing about a warning at all: PRINT(*PGM) is a fully valid, EXPECTED
  // combination with USRDSPMGT: how the Print key behaves at runtime
  // depends on which compiler wrote the reading program (an S36-compatible
  // RPG II/COBOL compiler only interrupts the program if it's coded to
  // handle the Print-key exception; an IBM i RPG III/IV/COBOL compiler
  // always interrupts it). That's a behavioral note for the person writing
  // the program, not a DDS-level restriction - so checkS36EResponseIndicatorViolation
  // below now explicitly excludes the literal '*PGM' value from PRINT's
  // response-indicator check (a genuine NUMERIC response indicator on
  // PRINT still warns, exactly as before).
  var S36E_KEYWORD_RESTRICTIONS = {
    ALTNAME: {
      keyword: 'ALTNAME',
      verified: true,
      gatedByUsrdspmgt: false,
      severity: null,
      appliesTo: null,
      rule: "ALTNAME's own general rules (NOT conditioned on USRDSPMGT): the alternative name must be 1-8 characters, its first character must not be '*', it must be different from every other record name and alternate name in the file (duplicates raise an error), and ALTNAME is not allowed on subfile records (SFL). Option indicators are not valid for this keyword.",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"ALTNAME (Alternative Record Name) keyword\" - listed under \"System/36 environment considerations for display files\" but not itself qualified by USRDSPMGT"
    },
    CHANGE: {
      keyword: 'CHANGE',
      verified: true,
      gatedByUsrdspmgt: true,
      severity: 'warning',
      appliesTo: 'response-indicator',
      rule: 'Specifying a response indicator on CHANGE in a file that also contains USRDSPMGT produces a warning at file-creation time - S36E applications do not support response indicators on this keyword.',
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"Keyword considerations for display files used in the System/36 environment\""
    },
    HELP: {
      keyword: 'HELP',
      verified: true,
      gatedByUsrdspmgt: true,
      severity: 'error',
      appliesTo: 'response-indicator',
      rule: 'Specifying a response indicator on HELP in a file that also contains USRDSPMGT is an error, not just a warning - unlike CHANGE/PRINT. A HELP response indicator alone will not return control to the application program in a USRDSPMGT file; HLPRTN must also be specified to return control.',
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"Keyword considerations for display files used in the System/36 environment\" (response-indicator keyword list, HELP called out as the ERROR exception) and the \"HELP and HLPRTN keyword\" System/36 environment sub-page"
    },
    HLPRTN: {
      keyword: 'HLPRTN',
      verified: true,
      gatedByUsrdspmgt: true,
      severity: null,
      appliesTo: null,
      rule: 'HLPRTN is not itself restricted by USRDSPMGT - it is the keyword that must be present to satisfy HELP\'s own S36E restriction above (returning control to the program when Help is pressed in a USRDSPMGT file).',
      source: 'IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), "HELP and HLPRTN keyword" System/36 environment sub-page'
    },
    MSGID: {
      keyword: 'MSGID',
      verified: true,
      gatedByUsrdspmgt: false,
      severity: null,
      appliesTo: null,
      rule: "MSGID's own general syntax (NOT conditioned on USRDSPMGT): MSGID(message-identifier [library-name/]message-file) or MSGID(*NONE). message-file may be a 2-character &field (must be in the same record, usage H/P/B/O only, and restricted to the special values U1/U2/P1/P2/M1/M2 - any other value defaults to U1; no library allowed with this form), or one of the special values *USR1/*USR2/*PGM1/*PGM2/*SYS1/*SYS2 (library not allowed, defaults to *LIBL).",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"MSGID keyword\" (including Table 15's special-value mapping) - listed under \"System/36 environment considerations for display files\" but not itself qualified by USRDSPMGT"
    },
    PRINT: {
      keyword: 'PRINT',
      verified: true,
      gatedByUsrdspmgt: true,
      severity: 'warning',
      appliesTo: 'response-indicator',
      rule: 'Specifying a NUMERIC response indicator on PRINT in a file that also contains USRDSPMGT produces a warning at file-creation time - S36E applications do not support response indicators on this keyword. This does NOT apply to PRINT(*PGM) - see pgmSpecialValueNote below; a literal \'*PGM\' is a distinct, valid special value, not a response indicator.',
      pgmSpecialValueNote: "PRINT(*PGM) is a fully valid, expected combination with USRDSPMGT (no warning) - IBM's own S36E sub-page documents it as a runtime behavioral note instead: how the Print key is handled depends on which compiler wrote the reading program. An S36-compatible compiler (RPG II or COBOL) only interrupts the program if it's coded to handle the Print-key exception (otherwise the screen image is printed); an IBM i compiler (RPG III, RPG IV, or COBOL) always interrupts the program (acting as if Enter was pressed if the program doesn't handle the exception).",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"Keyword considerations for display files used in the System/36 environment\" (response-indicator keyword list) plus the dedicated \"PRINT(*PGM) keyword\" System/36 environment sub-page"
    },
    RETKEY: {
      keyword: 'RETKEY',
      verified: true,
      gatedByUsrdspmgt: false,
      severity: null,
      appliesTo: null,
      rule: "RETKEY/RETCMDKEY's own general rules (NOT conditioned on USRDSPMGT): the file must specify INDARA; both keywords are ignored on the first output operation after the file is opened (the retain function only applies between record formats in the same file); neither is allowed on a subfile format (SFL) or a user-defined record (USRDFN); neither can be specified in a file that also contains ALTHELP, ALTPAGEUP, or ALTPAGEDWN. RETKEY specifically retains CLEAR/HELP/HLPRTN/HOME/PAGEDOWN/PAGEUP/PRINT/ROLLDOWN/ROLLUP; it cannot be combined with CLEAR/HELP/HOME/PAGEUP/PAGEDOWN/ROLLDOWN/ROLLUP on the file level or this record, and PRINT is not allowed on the same record as RETKEY (though HLPRTN and PRINT ARE allowed at the file level alongside RETKEY).",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"RETKEY (Retain Function Keys) and RETCMDKEY (Retain Command Keys) keywords\" and \"Considerations for specifying RETKEY and RETCMDKEY keywords\" - listed under \"System/36 environment considerations for display files\" but not itself qualified by USRDSPMGT"
    },
    RETCMDKEY: {
      keyword: 'RETCMDKEY',
      verified: true,
      gatedByUsrdspmgt: false,
      severity: null,
      appliesTo: null,
      rule: "See RETKEY's own rule for the shared general considerations (INDARA, ignored on first output op, not on SFL/USRDFN, incompatible with ALTHELP/ALTPAGEUP/ALTPAGEDWN). RETCMDKEY specifically retains CAnn/CFnn keys; it cannot be combined with CAnn or CFnn on the file level or this record, and none of CAnn/CFnn/SFLDROP/SFLENTER/SFLFOLD are allowed on the record being defined.",
      source: "IBM i DDS Reference for display files (docs/sda-reference/source/DDS_Keyword_V7r6.pdf), \"RETKEY (Retain Function Keys) and RETCMDKEY (Retain Command Keys) keywords\" and \"Considerations for specifying RETKEY and RETCMDKEY keywords\" - listed under \"System/36 environment considerations for display files\" but not itself qualified by USRDSPMGT"
    }
  };

  /** Returns the S36-3 rule-table entry for one of the 6 (well, 7 counting
   *  HLPRTN as CHANGE/HELP/PRINT's own paired keyword) S36E-restricted
   *  keywords, or `null` for any other keyword name. Callers (S36-4's UI
   *  wiring) should check `.verified` before treating `.severity`/`.rule`
   *  as authoritative - an unverified entry has both as `null` on purpose,
   *  see the block comment above. */
  function getS36ERestriction(keywordName) {
    return S36E_KEYWORD_RESTRICTIONS[String(keywordName || '').toUpperCase()] || null;
  }

  /** Convenience read of whether USRDSPMGT is present at the file level -
   *  the single condition every S36-3 rule above is gated on. Thin wrapper
   *  over S36-2's already-confirmed getFileFlagKeyword mechanism so callers
   *  don't need to know USRDSPMGT is "just" a bare flag keyword. */
  function isUsrdspmgtActive(fileKeywords) {
    return getFileFlagKeyword(fileKeywords, 'USRDSPMGT').present;
  }

  /** Task S36-4 - the USRDSPMGT-independent half of
   *  checkS36EResponseIndicatorViolation below: does `responseIndicatorText`
   *  violate `keywordName`'s S36E rule, regardless of whether USRDSPMGT is
   *  currently on? Split out so the "would this conflict if USRDSPMGT were
   *  turned on" scan (findS36EConflictInModel below - the symmetric block
   *  this task's own direct user request asked for) can reuse the exact
   *  same per-keyword rule logic checkS36EResponseIndicatorViolation uses
   *  for the ordinary "USRDSPMGT already on" case, rather than duplicating
   *  it under a second gate condition.
   *
   *  Correction (verified against IBM's own dedicated "PRINT(*PGM)
   *  keyword" S36E sub-page, not just the general PRINT keyword page's
   *  own *PGM/response-indicator equivalence statement this used to lean
   *  on): the literal text '*PGM' on PRINT is EXCLUDED from this check.
   *  PRINT(*PGM) is a fully valid, documented, EXPECTED combination with
   *  USRDSPMGT - IBM's own text describes a runtime behavioral difference
   *  based on which compiler wrote the reading program, not a DDS-level
   *  warning (see PRINT's own `pgmSpecialValueNote` in
   *  S36E_KEYWORD_RESTRICTIONS above). A genuine NUMERIC response
   *  indicator on PRINT still warns exactly as before - only the special
   *  value '*PGM' itself is carved out. */
  function s36ERuleViolationMessage(keywordName, responseIndicatorText) {
    var restriction = getS36ERestriction(keywordName);
    if (!restriction || !restriction.verified || restriction.appliesTo !== 'response-indicator') return null;
    var text = (responseIndicatorText || '').trim();
    if (!text) return null;
    if (String(keywordName).toUpperCase() === 'PRINT' && text.toUpperCase() === '*PGM') return null;
    return restriction.rule;
  }

  /** Evaluates one `appliesTo: 'response-indicator'` rule (currently
   *  CHANGE, HELP, and PRINT) against a candidate response-indicator
   *  parameter string for that keyword, but ONLY when USRDSPMGT is active
   *  on the given file-level keywords AND the rule is `verified`.
   *  `responseIndicatorText` is whatever raw text the caller was about to
   *  write as that keyword's response-indicator parameter (e.g. CHANGE's
   *  own `resp` from getRecordIndicatorInstances, or PRINT's own
   *  getFileFlagKeyword(...).parameters) - a blank/whitespace-only value
   *  never violates, and neither does the literal text '*PGM' on PRINT
   *  specifically (see s36ERuleViolationMessage's own doc comment above
   *  for why - it's a valid special value, not a response indicator, so
   *  it's carved out there rather than duplicating the exclusion here).
   *  Returns `{ severity, message }` on a violation, or `null` when there
   *  is nothing to flag (USRDSPMGT off, unknown/unverified/non-response-
   *  indicator keyword, or a blank response indicator). Pure data lookup -
   *  does not mutate or reject anything; S36-4's UI wiring decides what a
   *  UI does with this result (a hard block, per that task's own direct
   *  user request - see recordKeywordsPanelsHtml/wireFileKeywordsPanels'
   *  own S36-4 comments for where). */
  function checkS36EResponseIndicatorViolation(fileKeywords, keywordName, responseIndicatorText) {
    if (!isUsrdspmgtActive(fileKeywords)) return null;
    var message = s36ERuleViolationMessage(keywordName, responseIndicatorText);
    return message ? { severity: getS36ERestriction(keywordName).severity, message: message } : null;
  }

  /** Task S36-4's symmetric block: scans the WHOLE model (file-level HELP/
   *  PRINT, every record's own PRINT flag, and every record's HELP/CHANGE
   *  indicator instances via getRecordIndicatorInstances) for any value
   *  ALREADY SET that would violate a verified S36E rule if USRDSPMGT were
   *  turned on right now - used to hard-block enabling USRDSPMGT while an
   *  incompatible keyword value already exists elsewhere in the file, per
   *  this task's own direct user request. Only the 3 VERIFIED rules
   *  (CHANGE/HELP/PRINT) are scanned - ALTNAME/MSGID/RETKEY/RETCMDKEY have
   *  no rule to check against (`rule: null` - see S36E_KEYWORD_RESTRICTIONS'
   *  own comment) so scanning them would either always pass (uninformative)
   *  or require guessing a constraint this project deliberately declined to
   *  guess in S36-3. Returns `{ keyword, location, message }` for the FIRST
   *  conflict found (good enough for a single alert - not collecting every
   *  conflict in the file), or `null` when nothing would conflict. `model`
   *  is the parsed DSPF model shape ({ fileKeywords, records }) already
   *  used throughout this codebase's webview layer. */
  function findS36EConflictInModel(model) {
    var fileKeywords = (model && model.fileKeywords) || [];
    var helpMsg = s36ERuleViolationMessage('HELP', getFileFlagKeyword(fileKeywords, 'HELP').parameters);
    if (helpMsg) return { keyword: 'HELP', location: 'File-level keywords', message: helpMsg };
    var printMsg = s36ERuleViolationMessage('PRINT', getFileFlagKeyword(fileKeywords, 'PRINT').parameters);
    if (printMsg) return { keyword: 'PRINT', location: 'File-level keywords', message: printMsg };

    var records = (model && model.records) || [];
    for (var i = 0; i < records.length; i++) {
      var rec = records[i];
      var recPrintMsg = s36ERuleViolationMessage('PRINT', getFileFlagKeyword(rec.keywords, 'PRINT').parameters);
      if (recPrintMsg) return { keyword: 'PRINT', location: 'Record ' + rec.name, message: recPrintMsg };

      var instances = getRecordIndicatorInstances(rec.keywords);
      for (var j = 0; j < instances.length; j++) {
        var inst = instances[j];
        if (inst.kind !== 'HELP' && inst.kind !== 'CHANGE') continue;
        var instMsg = s36ERuleViolationMessage(inst.kind, inst.resp);
        if (instMsg) return { keyword: inst.kind, location: 'Record ' + rec.name, message: instMsg };
      }
    }
    return null;
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
    getFullRecordLineRange: getFullRecordLineRange,
    getFileComments: getFileComments,
    getRecordComments: getRecordComments,
    addComment: addComment,
    continuationChainStarts: continuationChainStarts,
    updateComment: updateComment,
    deleteComment: deleteComment,
    serializeRecordEntry: serializeRecordEntry,
    applyRecordUpdate: applyRecordUpdate,
    renameRecordFormat: renameRecordFormat,
    renameRecordReferences: renameRecordReferences,
    setWindowGeometry: setWindowGeometry,
    nextAvailableRecordName: nextAvailableRecordName,
    insertRecord: insertRecord,
    insertRecords: insertRecords,
    insertTypedRecord: insertTypedRecord,
    insertTypedRecordWithDependent: insertTypedRecordWithDependent,
    copyRecord: copyRecord,
    deleteRecord: deleteRecord,
    getFileKeywordLineRange: getFileKeywordLineRange,
    addDisplaySize: addDisplaySize,
    getFileKeywordsLineRange: getFileKeywordsLineRange,
    applyFileKeywordsUpdate: applyFileKeywordsUpdate,
    parseCommandKeys: parseCommandKeys,
    commandKeyNumbersInUse: commandKeyNumbersInUse,
    availableCommandKeyNumbers: availableCommandKeyNumbers,
    setCommandKey: setCommandKey,
    removeCommandKey: removeCommandKey,
    allCommandKeyNumbers: allCommandKeyNumbers,
    setCommandKeyAt: setCommandKeyAt,
    removeCommandKeyAt: removeCommandKeyAt,
    reorderFields: reorderFields,
    commentOutLine: commentOutLine,
    buildModTag: buildModTag,
    appendModTag: appendModTag,
    applyModificationTracking: applyModificationTracking,
    getColorAttr: getColorAttr,
    setColorAttr: setColorAttr,
    getColorAttrStates: getColorAttrStates,
    setColorAttrStates: setColorAttrStates,
    diffColorAttrStates: diffColorAttrStates,
    applyColorAttrStatesDiff: applyColorAttrStatesDiff,
    getValidityCheck: getValidityCheck,
    setValidityCheck: setValidityCheck,
    getValidityCheckInstances: getValidityCheckInstances,
    setValidityCheckInstances: setValidityCheckInstances,
    getEditKeyword: getEditKeyword,
    setEditKeyword: setEditKeyword,
    splitEditCode: splitEditCode,
    joinEditCode: joinEditCode,
    getEditCodeParts: getEditCodeParts,
    editCodeFillConflictReason: editCodeFillConflictReason,
    getEditMask: getEditMask,
    setEditMask: setEditMask,
    editMaskConflictReason: editMaskConflictReason,
    dateTimeUsageConflictReason: dateTimeUsageConflictReason,
    getDateFormat: getDateFormat,
    setDateFormat: setDateFormat,
    getDateSeparator: getDateSeparator,
    setDateSeparator: setDateSeparator,
    dateSeparatorConflictReason: dateSeparatorConflictReason,
    getTimeFormat: getTimeFormat,
    setTimeFormat: setTimeFormat,
    getTimeSeparator: getTimeSeparator,
    setTimeSeparator: setTimeSeparator,
    timeSeparatorConflictReason: timeSeparatorConflictReason,
    getCheckMsgId: getCheckMsgId,
    setCheckMsgId: setCheckMsgId,
    getErrorMessageInstances: getErrorMessageInstances,
    setErrorMessageInstances: setErrorMessageInstances,
    parseCheckCodes: parseCheckCodes,
    formatCheckCodes: formatCheckCodes,
    getInputKeywords: getInputKeywords,
    setInputKeywords: setInputKeywords,
    getGeneralFieldKeywords: getGeneralFieldKeywords,
    setGeneralFieldKeywords: setGeneralFieldKeywords,
    dftGroupConflictReason: dftGroupConflictReason,
    wrdwrapFieldConflictReason: wrdwrapFieldConflictReason,
    wrdwrapReverseConflictReason: wrdwrapReverseConflictReason,
    wrdwrapNewConflictReason: wrdwrapNewConflictReason,
    igcalttypConflictReason: igcalttypConflictReason,
    igcalttypNewConflictReason: igcalttypNewConflictReason,
    msgidExclusionConflictReason: msgidExclusionConflictReason,
    msgidExclusionNewConflictReason: msgidExclusionNewConflictReason,
    referencedFieldResolveConflictReason: referencedFieldResolveConflictReason,
    dupFloatNewConflictReason: dupFloatNewConflictReason,
    blkfoldFloatNewConflictReason: blkfoldFloatNewConflictReason,
    wrdwrapBasicEditConflictReason: wrdwrapBasicEditConflictReason,
    hasChkmsgidQualifier: hasChkmsgidQualifier,
    chkmsgidNewConflictReason: chkmsgidNewConflictReason,
    chkmsgidFieldAddReason: chkmsgidFieldAddReason,
    chkmsgidBasicEditConflictReason: chkmsgidBasicEditConflictReason,
    chridEligibilityReason: chridEligibilityReason,
    chridFieldAddReason: chridFieldAddReason,
    chridNewConflictReason: chridNewConflictReason,
    chridBasicEditConflictReason: chridBasicEditConflictReason,
    dftOutputRequirementNote: dftOutputRequirementNote,
    sflNxtchgSflMsgRcdConflictReason: sflNxtchgSflMsgRcdConflictReason,
    loginpLogoutSflMsgRcdIgnoredNote: loginpLogoutSflMsgRcdIgnoredNote,
    usrdfnConflictReason: usrdfnConflictReason,
    usrdfnWhitelistConflictReason: usrdfnWhitelistConflictReason,
    dspmodDspsizPrerequisiteReason: dspmodDspsizPrerequisiteReason,
    dspmodSflConflictReason: dspmodSflConflictReason,
    sflWhitelistConflictReason: sflWhitelistConflictReason,
    pulldownConflictReason: pulldownConflictReason,
    mnuBarKeyConflictReason: mnuBarKeyConflictReason,
    windowConflictReason: windowConflictReason,
    windowMutexConflictReason: windowMutexConflictReason,
    mnubarWhitelistConflictReason: mnubarWhitelistConflictReason,
    htmlConflictReason: htmlConflictReason,
    PSHBTNCHC_COMMAND_KEYS: PSHBTNCHC_COMMAND_KEYS,
    parsePshbtnchcParams: parsePshbtnchcParams,
    analyzePshbtnchcText: analyzePshbtnchcText,
    pshbtnchcTextProblem: pshbtnchcTextProblem,
    pshbtnchcParamsProblem: pshbtnchcParamsProblem,
    pshbtnchcFieldIssues: pshbtnchcFieldIssues,
    pshbtnchcFitProblem: pshbtnchcFitProblem,
    composePshbtnchcParams: composePshbtnchcParams,
    getPshbtnfld: getPshbtnfld,
    setPshbtnfld: setPshbtnfld,
    pshbtnfldConflictReason: pshbtnfldConflictReason,
    pshbtnfldNewConflictReason: pshbtnfldNewConflictReason,
    pshbtnfldRemovalConflictReason: pshbtnfldRemovalConflictReason,
    pshbtnfldDefinitionUpdates: pshbtnfldDefinitionUpdates,
    pshbtnfldBasicEditConflictReason: pshbtnfldBasicEditConflictReason,
    passrcdWindowConflictReason: passrcdWindowConflictReason,
    passrcdRecordConflictReason: passrcdRecordConflictReason,
    keepMutexConflictReason: keepMutexConflictReason,
    alwrolClrlSlnoConflictReason: alwrolClrlSlnoConflictReason,
    mnubarFieldShapeNote: mnubarFieldShapeNote,
    getReferenceOverrides: getReferenceOverrides,
    setReferenceOverrides: setReferenceOverrides,
    parseReffldParams: parseReffldParams,
    formatReffldParams: formatReffldParams,
    getReffldState: getReffldState,
    applyReffldState: applyReffldState,
    getMessageId: getMessageId,
    setMessageId: setMessageId,
    parseMsgIdParams: parseMsgIdParams,
    formatMsgIdParams: formatMsgIdParams,
    parseMsgConParams: parseMsgConParams,
    formatMsgConParams: formatMsgConParams,
    getMessageIdInstances: getMessageIdInstances,
    setMessageIdInstances: setMessageIdInstances,
    msgidInstanceAllowsConditioning: msgidInstanceAllowsConditioning,
    msgidConditioningNotes: msgidConditioningNotes,
    getMenubarChoices: getMenubarChoices,
    setMenubarChoices: setMenubarChoices,
    setMenubarChoiceConditions: setMenubarChoiceConditions,
    getMenubarSeparator: getMenubarSeparator,
    setMenubarSeparator: setMenubarSeparator,
    getChoiceSelectionType: getChoiceSelectionType,
    setChoiceSelectionType: setChoiceSelectionType,
    getChoices: getChoices,
    setChoices: setChoices,
    setChoiceConditions: setChoiceConditions,
    getChoiceAccelerators: getChoiceAccelerators,
    setChoiceAccelerators: setChoiceAccelerators,
    getChoiceControls: getChoiceControls,
    setChoiceControls: setChoiceControls,
    getChoiceColorState: getChoiceColorState,
    setChoiceColorState: setChoiceColorState,
    getWindowTitleText: getWindowTitleText,
    setWindowTitleText: setWindowTitleText,
    getFileFlagKeyword: getFileFlagKeyword,
    setFileFlagKeyword: setFileFlagKeyword,
    getFileQuotedText: getFileQuotedText,
    getFileQuotedTextConditions: getFileQuotedTextConditions,
    setFileQuotedText: setFileQuotedText,
    quoteDdsLiteral: quoteDdsLiteral,
    unquoteDdsLiteral: unquoteDdsLiteral,
    getFileRefKeyword: getFileRefKeyword,
    setFileRefKeyword: setFileRefKeyword,
    getFilePrintFileForm: getFilePrintFileForm,
    getFileHlpPnlGrpKeyword: getFileHlpPnlGrpKeyword,
    setFileHlpPnlGrpKeyword: setFileHlpPnlGrpKeyword,
    getFileHlpSchIdxKeyword: getFileHlpSchIdxKeyword,
    setFileHlpSchIdxKeyword: setFileHlpSchIdxKeyword,
    hlpdocConflictReason: hlpdocConflictReason,
    hlprcdConflictReason: hlprcdConflictReason,
    getWdwBorder: getWdwBorder,
    setWdwBorder: setWdwBorder,
    getWindowParamsKeyword: getWindowParamsKeyword,
    setWindowParamsKeyword: setWindowParamsKeyword,
    getPulldownKeyword: getPulldownKeyword,
    setPulldownKeyword: setPulldownKeyword,
    getSflSngChcKeyword: getSflSngChcKeyword,
    setSflSngChcKeyword: setSflSngChcKeyword,
    getSflMltChcKeyword: getSflMltChcKeyword,
    setSflMltChcKeyword: setSflMltChcKeyword,
    sflChoiceListConflictReason: sflChoiceListConflictReason,
    sflrtnselNewConflictReason: sflrtnselNewConflictReason,
    sfllinRecordEditConflictReason: sfllinRecordEditConflictReason,
    sflcsrprgFieldEditConflictReason: sflcsrprgFieldEditConflictReason,
    sflScrollFieldConflictReason: sflScrollFieldConflictReason,
    sflchcctlDefinitionUpdates: sflchcctlDefinitionUpdates,
    sflchcctlFieldConflictReason: sflchcctlFieldConflictReason,
    sflchcctlBasicEditConflictReason: sflchcctlBasicEditConflictReason,
    sflNxtchgSflchcctlConflictReason: sflNxtchgSflchcctlConflictReason,
    sflctlNxtchgSflchcctlConflictReason: sflctlNxtchgSflchcctlConflictReason,
    getDisplaySizesList: getDisplaySizesList,
    setDisplaySizesList: setDisplaySizesList,
    getFileMsgLocLines: getFileMsgLocLines,
    setFileMsgLocLines: setFileMsgLocLines,
    getUnlockKeyword: getUnlockKeyword,
    setUnlockKeyword: setUnlockKeyword,
    getFileTwoFieldKeyword: getFileTwoFieldKeyword,
    setFileTwoFieldKeyword: setFileTwoFieldKeyword,
    getMnubardspFields: getMnubardspFields,
    setMnubardspFields: setMnubardspFields,
    getRtncsrlocRecNameFields: getRtncsrlocRecNameFields,
    setRtncsrlocRecNameFields: setRtncsrlocRecNameFields,
    getRtncsrlocWindowMouseFields: getRtncsrlocWindowMouseFields,
    setRtncsrlocWindowMouseFields: setRtncsrlocWindowMouseFields,
    getIndicatorTextRows: getIndicatorTextRows,
    setIndicatorTextRows: setIndicatorTextRows,
    getRepeatableKeywordInstances: getRepeatableKeywordInstances,
    setRepeatableKeywordInstances: setRepeatableKeywordInstances,
    getRecordIndicatorInstances: getRecordIndicatorInstances,
    setRecordIndicatorInstances: setRecordIndicatorInstances,
    getSflDisplayLayout: getSflDisplayLayout,
    setSflDisplayLayout: setSflDisplayLayout,
    sflsizConditionedFieldNameConflictReason: sflsizConditionedFieldNameConflictReason,
    parseSflMsgIdParams: parseSflMsgIdParams,
    formatSflMsgIdParams: formatSflMsgIdParams,
    parseDisplaySizeTriples: parseDisplaySizeTriples,
    serializeDisplaySizes: serializeDisplaySizes,
    getS36ERestriction: getS36ERestriction,
    isUsrdspmgtActive: isUsrdspmgtActive,
    s36ERuleViolationMessage: s36ERuleViolationMessage,
    checkS36EResponseIndicatorViolation: checkS36EResponseIndicatorViolation,
    findS36EConflictInModel: findS36EConflictInModel,
    getSflMsgRcdLines: getSflMsgRcdLines,
    setSflMsgRcdLines: setSflMsgRcdLines,
  };
});
