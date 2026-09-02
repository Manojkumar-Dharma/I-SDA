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
   *  matching real SDA's own output rather than packing multiple keywords onto a shared line. */
  function serializeFieldEntry(field, originalLine1to6) {
    var allKeywords = field.keywords || [];
    var unconditioned = allKeywords.filter(function (k) { return !k.conditions || k.conditions.length === 0; });
    var conditioned = allKeywords.filter(function (k) { return k.conditions && k.conditions.length > 0; });
    var firstUnconditioned = unconditioned.slice(0, 1);
    var restKeywords = unconditioned.slice(1).concat(conditioned);

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
   *  (further unconditioned keywords, plus every conditioned one) gets its own dedicated line. */
  function serializeRecordEntry(record, originalLine1to6) {
    var allKeywords = record.keywords || [];
    var unconditioned = allKeywords.filter(function (k) { return !k.conditions || k.conditions.length === 0; });
    var conditioned = allKeywords.filter(function (k) { return k.conditions && k.conditions.length > 0; });
    var firstUnconditioned = unconditioned.slice(0, 1);
    var restKeywords = unconditioned.slice(1).concat(conditioned);

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
   *  first unconditioned file keyword rides the very first line, everything else gets its own. */
  function serializeFileKeywordsEntry(fileKeywords, originalLine1to6) {
    var unconditioned = (fileKeywords || []).filter(function (k) { return !k.conditions || k.conditions.length === 0; });
    var conditioned = (fileKeywords || []).filter(function (k) { return k.conditions && k.conditions.length > 0; });
    var firstUnconditioned = unconditioned.slice(0, 1);
    var restKeywords = unconditioned.slice(1).concat(conditioned);

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

  var EDIT_KEYWORDS = ['EDTCDE', 'EDTWRD', 'EDTMSK'];

  /** Same one-at-a-time rule as validity checks - a field can't carry more
   *  than one of an edit code, an edit word, or an edit mask -
   *  { kind: ''|'EDTCDE'|'EDTWRD'|'EDTMSK', parameters: string }. */
  function getEditKeyword(keywords) {
    var k = (keywords || []).find(function (k) { return EDIT_KEYWORDS.indexOf(k.name) >= 0; });
    return k ? { kind: k.name, parameters: k.parameters || '' } : { kind: '', parameters: '' };
  }

  /** Returns a NEW keywords array with any existing EDTCDE/EDTWRD/EDTMSK
   *  removed and, if `kind` is non-empty, one new keyword added with
   *  `parameters` (a bare edit-code letter for EDTCDE, e.g. "J"; the full
   *  quoted substitution string for EDTWRD, e.g. "'  DR  CR'"; or the full
   *  quoted mask string for EDTMSK, e.g. "'(999) 999-9999'" - the caller
   *  supplies quoting for EDTWRD/EDTMSK itself since their internal
   *  structure is meaningful). */
  function setEditKeyword(keywords, kind, parameters) {
    var next = (keywords || []).filter(function (k) { return EDIT_KEYWORDS.indexOf(k.name) < 0; });
    if (kind) next = next.concat([{ name: kind, parameters: parameters || '', conditions: [], raw: '', sourceLines: [] }]);
    return next;
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
  // Field-level keyword pickers modeled on real SDA's "Select Field
  // Keywords" screens (see docs/sda-reference/, task D1) - CHECK(...)
  // (shared by SDA's "Keying options" and part of "Validity check"
  // screens), input handling (DUP/BLANKS/CHANGE/CHGINPDFT), general
  // keywords (ALIAS/INDTXT/DFT/DFTVAL/FLDCSRPRG/PUTRETAIN/OVRDTA/OVRATR/
  // CHRID/IGCALTTYP/NOCCSID), database-reference overrides (DLTCHK/
  // DLTEDT - REFFLD/REF itself is handled by the existing Resolve
  // Referenced Field feature, not duplicated here), and MSGID. Verified
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

  /** Reads the field's database-reference OVERRIDE flags - DLTCHK (ignore
   *  the referenced field's own validity-check keywords) and DLTEDT
   *  (ignore its edit keywords) - only meaningful alongside REFFLD/REF,
   *  which the existing Resolve Referenced Field feature already manages
   *  (see DspfEngine.resolveReferenceTarget / extension.ts's
   *  fetchReferencedFieldAttributes) - not duplicated here. */
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
        if (!m) return { id: '', pulldownRecord: '', text: (k.parameters || '').trim(), returnField: '' };
        var text = m[3].charAt(0) === '&' ? m[3] : m[3].slice(1, -1).replace(/''/g, "'");
        return { id: m[1], pulldownRecord: m[2], text: text, returnField: m[4] || '' };
      });
  }

  /** Returns a NEW keywords array with every existing MNUBARCHC removed and
   *  replaced by one per entry in `choices`
   *  ({ id, pulldownRecord, text, returnField }), in the given order -
   *  blank/incomplete entries (no id, record, or text) are skipped rather
   *  than writing a malformed keyword. `returnField` is optional (real
   *  SDA's own screen leaves it blank most of the time); when supplied
   *  without a leading '&' one is added, since it's always a field
   *  reference, never a literal. */
  function setMenubarChoices(keywords, choices) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'MNUBARCHC'; });
    (choices || []).forEach(function (c) {
      var id = (c.id || '').trim();
      var record = (c.pulldownRecord || '').trim();
      var text = (c.text || '').trim();
      if (!id || !record || !text) return;
      var params = id + ' ' + record + ' ' + formatChoiceText(text);
      var returnField = (c.returnField || '').trim();
      if (returnField) params += ' ' + (returnField.charAt(0) === '&' ? returnField : '&' + returnField);
      next = next.concat([{ name: 'MNUBARCHC', parameters: params, conditions: [], raw: '', sourceLines: [] }]);
    });
    return next;
  }

  /** MNUBARSEP((*COLOR color) (*DSPATR attrs) (*CHAR 'c')) - the menu-bar's
   *  own separator line, field-level on the MNB* field, at most one
   *  instance. Same bracketed-groups shape as WDWBORDER (see getWdwBorder)
   *  but with a SINGLE separator character rather than 8 border positions,
   *  and no dedicated "only write groups that are enabled" state needed
   *  beyond what's already present vs. absent. */
  function getMenubarSeparator(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'MNUBARSEP'; });
    var result = { color: '', attrs: [], char: '' };
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
   *  `{ colorEnabled, color, attrsEnabled, attrs, charEnabled, char }` -
   *  removed entirely if none of the three groups are enabled. */
  function setMenubarSeparator(keywords, state) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'MNUBARSEP'; });
    var groups = [];
    if (state.colorEnabled && state.color) groups.push('(*COLOR ' + state.color + ')');
    if (state.attrsEnabled && state.attrs && state.attrs.length) groups.push('(*DSPATR ' + state.attrs.join(' ') + ')');
    if (state.charEnabled && state.char) groups.push("(*CHAR '" + state.char.charAt(0) + "')");
    if (groups.length) next = next.concat([{ name: 'MNUBARSEP', parameters: groups.join(' '), conditions: [], raw: '', sourceLines: [] }]);
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
    var tokens = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    tokens.forEach(function (t) {
      var upper = t.toUpperCase();
      if (CHOICE_SELECTION_FLAGS.indexOf(upper) >= 0) { result.flags.push(upper); return; }
      var numColM = /^\*NUMCOL\((\d+)\)$/i.exec(t);
      if (numColM) { result.numCol = numColM[1]; return; }
      var numRowM = /^\*NUMROW\((\d+)\)$/i.exec(t);
      if (numRowM) { result.numRow = numRowM[1]; return; }
      var gutterM = /^\*GUTTER\((\d+)\)$/i.exec(t);
      if (gutterM) { result.gutter = gutterM[1]; return; }
    });
    return result;
  }

  /** Returns a NEW keywords array with SNGCHCFLD/MLTCHCFLD replaced by one
   *  keyword built from `state` (same shape getChoiceSelectionType
   *  returns) - removed entirely if `state.kind` is blank. */
  function setChoiceSelectionType(keywords, state) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'SNGCHCFLD' && kw.name !== 'MLTCHCFLD'; });
    if (!state || !state.kind) return next;
    var parts = (state.flags || []).slice();
    if (state.numCol) parts.push('*NUMCOL(' + state.numCol + ')');
    if (state.numRow) parts.push('*NUMROW(' + state.numRow + ')');
    if (state.gutter) parts.push('*GUTTER(' + state.gutter + ')');
    next = next.concat([{ name: state.kind, parameters: parts.join(' '), conditions: [], raw: '', sourceLines: [] }]);
    return next;
  }

  /** CHOICE(id 'text') - one per choice on a SNGCHCFLD/MLTCHCFLD field,
   *  same shape as DspfEngine.parseChoiceParams. */
  function getChoices(keywords) {
    return (keywords || [])
      .filter(function (k) { return k.name === 'CHOICE'; })
      .map(function (k) {
        var split = splitLeadingChoiceId(k.parameters);
        var text = split.rest.charAt(0) === '&' ? split.rest : split.rest.replace(/^'|'$/g, '').replace(/''/g, "'");
        return { id: split.id, text: text };
      });
  }

  /** Returns a NEW keywords array with every existing CHOICE removed and
   *  replaced by one per entry in `choices` ({ id, text }) - blank
   *  entries (no id or text) skipped. */
  function setChoices(keywords, choices) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'CHOICE'; });
    (choices || []).forEach(function (c) {
      var id = (c.id || '').trim();
      var text = (c.text || '').trim();
      if (!id || !text) return;
      next = next.concat([{ name: 'CHOICE', parameters: id + ' ' + formatChoiceText(text), conditions: [], raw: '', sourceLines: [] }]);
    });
    return next;
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
   *  one of CHOICE_COLOR_STATE_KEYWORDS. */
  function getChoiceColorState(keywords, keywordName) {
    var k = (keywords || []).find(function (kw) { return kw.name === keywordName; });
    var result = { color: '', attrs: [] };
    if (!k) return result;
    var text = k.parameters || '';
    var colorM = /\*COLOR\s+([A-Z]+)/i.exec(text);
    if (colorM) result.color = colorM[1].toUpperCase();
    var attrM = /\*DSPATR\s+([^()]*)/i.exec(text);
    if (attrM) result.attrs = attrM[1].trim().split(/\s+/).filter(Boolean).map(function (s) { return s.toUpperCase(); });
    return result;
  }

  /** Returns a NEW keywords array with `keywordName` (one of
   *  CHOICE_COLOR_STATE_KEYWORDS) built from `color`/`attrs`, removed
   *  entirely if both are empty - same shape as setColorAttr but for a
   *  caller-chosen keyword name instead of the fixed COLOR/DSPATR pair. */
  function setChoiceColorState(keywords, keywordName, color, attrs) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== keywordName; });
    var groups = [];
    if (color) groups.push('(*COLOR ' + color + ')');
    if (attrs && attrs.length) groups.push('(*DSPATR ' + attrs.join(' ') + ')');
    if (groups.length) next = next.concat([{ name: keywordName, parameters: groups.join(' '), conditions: [], raw: '', sourceLines: [] }]);
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
   *  editor input shows plain text rather than DDS's own quote escaping. */
  function getFileQuotedText(keywords, name) {
    var k = (keywords || []).find(function (kw) { return kw.name === name; });
    if (!k) return '';
    return unquoteDdsLiteral(k.parameters);
  }

  /** Returns a NEW keywords array with `name` set to the quoted+escaped
   *  form of `text` (removed entirely if `text` is blank). */
  function setFileQuotedText(keywords, name, text) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== name; });
    var quoted = quoteDdsLiteral(text);
    if (quoted) {
      next = next.concat([{ name: name, parameters: quoted, conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** REF (Reference database file) - reads its Library/Record sub-fields
   *  out of the `library/record` parameter form. */
  function getFileRefKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'REF'; });
    if (!k) return { library: '', record: '' };
    var parts = (k.parameters || '').trim().split('/');
    return parts.length > 1 ? { library: parts[0].trim(), record: parts.slice(1).join('/').trim() } : { library: '', record: parts[0].trim() };
  }

  /** Returns a NEW keywords array with REF set from `library`/`record`
   *  (REF(library/record), or REF(record) with no library qualifier), or
   *  removed entirely if `record` is blank. */
  function setFileRefKeyword(keywords, library, record) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'REF'; });
    var rec = (record || '').trim();
    if (rec) {
      var lib = (library || '').trim();
      next = next.concat([{ name: 'REF', parameters: lib ? lib + '/' + rec : rec, conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
  }

  /** PRTFILE (System handles print: print file/library) - same
   *  library/name shape as REF, kept separate since the keyword and its
   *  meaning are unrelated. */
  function getFilePrtFileKeyword(keywords) {
    var k = (keywords || []).find(function (kw) { return kw.name === 'PRTFILE'; });
    if (!k) return { name: '', library: '' };
    var tokens = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    return { name: tokens[0] || '', library: tokens[1] || '' };
  }

  function setFilePrtFileKeyword(keywords, name, library) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== 'PRTFILE'; });
    var nm = (name || '').trim();
    if (nm) {
      var lib = (library || '').trim();
      next = next.concat([{ name: 'PRTFILE', parameters: lib ? nm + ' ' + lib : nm, conditions: [], raw: '', sourceLines: [] }]);
    }
    return next;
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
    var result = { color: '', attrs: [], chars: ['', '', '', '', '', '', '', ''] };
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
   *  removed entirely if none of the three groups are enabled. */
  function setWdwBorder(keywords, state) {
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
      next = next.concat([{ name: 'WDWBORDER', parameters: groups.join(' '), conditions: [], raw: '', sourceLines: [] }]);
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

  // ---------------------------------------------------------------------
  // Task R1 - Base Record Keywords picker (General, Indicator, Application
  // Help, Help, Output, Input, Overlay, Print - see docs/sda-reference/
  // screens/record-level/base-record-keywords/ and PICKER-SCREENS-PLAN.md).
  // The F1 primitives above (getFileFlagKeyword/setFileFlagKeyword,
  // getFileQuotedText/setFileQuotedText, getFilePrtFileKeyword/
  // setFilePrtFileKeyword) are already generic over any `keywords` array -
  // not file-level-specific despite the name - so R1 reuses them as-is for
  // most of its ~30 keywords (a record's PRINT/PRTFILE take the exact same
  // shape as the file-level ones). Only two keyword shapes below are new:
  // UNLOCK's *ERASE/*MDTOFF sub-flags (multiple option VALUES inside one
  // keyword's parameter list, not separate keyword instances) and a small
  // generic two-field pair for CSRLOC/RTNCSRLOC/HLPSEQ (space-separated
  // "a b" parameters - same shape as PRTFILE's "name library" but reused
  // generically rather than triplicating getFilePrtFileKeyword's body).
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
   *  optional individually (CSRLOC's row/col, RTNCSRLOC's row-field/
   *  col-field, HLPSEQ's help-group-name/sequence-number). */
  function getFileTwoFieldKeyword(keywords, name) {
    var k = (keywords || []).find(function (kw) { return kw.name === name; });
    if (!k) return { a: '', b: '' };
    var parts = (k.parameters || '').trim().split(/\s+/).filter(Boolean);
    return { a: parts[0] || '', b: parts[1] || '' };
  }

  /** Returns a NEW keywords array with `name` set to "a b" (or just "a" if
   *  `b` is blank), removed entirely if both are blank. */
  function setFileTwoFieldKeyword(keywords, name, a, b) {
    var next = (keywords || []).filter(function (kw) { return kw.name !== name; });
    a = (a || '').trim();
    b = (b || '').trim();
    if (a || b) {
      next = next.concat([{ name: name, parameters: b ? a + ' ' + b : a, conditions: [], raw: '', sourceLines: [] }]);
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
   */
  function addComment(sourceLines, existingComments, fallbackAfterLine, text, desiredLine) {
    var insertAfterLine;
    if (desiredLine != null && !isNaN(desiredLine)) {
      var clamped = Math.max(1, Math.min(sourceLines.length + 1, Math.floor(desiredLine)));
      insertAfterLine = clamped - 1;
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
   * stance setFilePrtFileKeyword/setFileRefKeyword already take (unlike
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
   * Display Layout screen: SFLSIZ (records in subfile) and SFLPAG
   * (records per page) each accept EITHER a literal number OR a field
   * name (real DDS's own "Program-to-system field" alternate entry,
   * confirmed on the screen) - kept as plain strings rather than parsed
   * as numbers so a field name round-trips untouched, same reasoning
   * getWindowParamsKeyword's position parameters already take. SFLLIN
   * (spacing between records) is a plain literal number only (0 or 1 in
   * practice; DDS doesn't document a field-name form for it). Any of the
   * three can be absent independently.
   */
  function getSflDisplayLayout(keywords) {
    var kw = keywords || [];
    var sflsiz = kw.find(function (k) { return k.name === 'SFLSIZ'; });
    var sflpag = kw.find(function (k) { return k.name === 'SFLPAG'; });
    var sfllin = kw.find(function (k) { return k.name === 'SFLLIN'; });
    return {
      sflsiz: sflsiz ? (sflsiz.parameters || '').trim() : '',
      sflpag: sflpag ? (sflpag.parameters || '').trim() : '',
      sfllin: sfllin ? (sfllin.parameters || '').trim() : '',
    };
  }

  /** Returns a NEW keywords array with SFLSIZ/SFLPAG/SFLLIN each
   *  independently set from `state` (same shape getSflDisplayLayout
   *  returns) or removed if its field is blank. */
  function setSflDisplayLayout(keywords, state) {
    var next = (keywords || []).filter(function (k) { return k.name !== 'SFLSIZ' && k.name !== 'SFLPAG' && k.name !== 'SFLLIN'; });
    ['sflsiz', 'sflpag', 'sfllin'].forEach(function (field) {
      var value = ((state && state[field]) || '').toString().trim();
      if (!value) return;
      var keywordName = field === 'sflsiz' ? 'SFLSIZ' : field === 'sflpag' ? 'SFLPAG' : 'SFLLIN';
      next = next.concat([{ name: keywordName, parameters: value, conditions: [], raw: '', sourceLines: [] }]);
    });
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

    var outMid = [];
    var maxLen = Math.max(oldMid.length, newMid.length);
    for (var i = 0; i < maxLen; i++) {
      var o = i < oldMid.length ? oldMid[i] : null;
      var n = i < newMid.length ? newMid[i] : null;
      if (n == null) {
        if (o != null && o.trim() !== '') outMid.push(commentOutLine(o));
        continue;
      }
      if (o == null) {
        outMid.push(appendModTag(n, tag));
        continue;
      }
      if (o === n) {
        outMid.push(n);
        continue;
      }
      outMid.push(commentOutLine(o));
      outMid.push(appendModTag(n, tag));
    }

    return newLines.slice(0, prefix).concat(outMid, newLines.slice(newLines.length - suffix));
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
    getReferenceOverrides: getReferenceOverrides,
    setReferenceOverrides: setReferenceOverrides,
    getMessageId: getMessageId,
    setMessageId: setMessageId,
    getMessageIdInstances: getMessageIdInstances,
    setMessageIdInstances: setMessageIdInstances,
    getMenubarChoices: getMenubarChoices,
    setMenubarChoices: setMenubarChoices,
    getMenubarSeparator: getMenubarSeparator,
    setMenubarSeparator: setMenubarSeparator,
    getChoiceSelectionType: getChoiceSelectionType,
    setChoiceSelectionType: setChoiceSelectionType,
    getChoices: getChoices,
    setChoices: setChoices,
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
    setFileQuotedText: setFileQuotedText,
    quoteDdsLiteral: quoteDdsLiteral,
    unquoteDdsLiteral: unquoteDdsLiteral,
    getFileRefKeyword: getFileRefKeyword,
    setFileRefKeyword: setFileRefKeyword,
    getFilePrtFileKeyword: getFilePrtFileKeyword,
    setFilePrtFileKeyword: setFilePrtFileKeyword,
    getWdwBorder: getWdwBorder,
    setWdwBorder: setWdwBorder,
    getWindowParamsKeyword: getWindowParamsKeyword,
    setWindowParamsKeyword: setWindowParamsKeyword,
    getPulldownKeyword: getPulldownKeyword,
    setPulldownKeyword: setPulldownKeyword,
    getDisplaySizesList: getDisplaySizesList,
    setDisplaySizesList: setDisplaySizesList,
    getFileMsgLocLines: getFileMsgLocLines,
    setFileMsgLocLines: setFileMsgLocLines,
    getUnlockKeyword: getUnlockKeyword,
    setUnlockKeyword: setUnlockKeyword,
    getFileTwoFieldKeyword: getFileTwoFieldKeyword,
    setFileTwoFieldKeyword: setFileTwoFieldKeyword,
    getIndicatorTextRows: getIndicatorTextRows,
    setIndicatorTextRows: setIndicatorTextRows,
    getRepeatableKeywordInstances: getRepeatableKeywordInstances,
    setRepeatableKeywordInstances: setRepeatableKeywordInstances,
    getRecordIndicatorInstances: getRecordIndicatorInstances,
    setRecordIndicatorInstances: setRecordIndicatorInstances,
    getSflDisplayLayout: getSflDisplayLayout,
    setSflDisplayLayout: setSflDisplayLayout,
    parseSflMsgIdParams: parseSflMsgIdParams,
    formatSflMsgIdParams: formatSflMsgIdParams,
    parseDisplaySizeTriples: parseDisplaySizeTriples,
    serializeDisplaySizes: serializeDisplaySizes,
  };
});
