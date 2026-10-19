/**
 * compileLineMap.js - E2c: put a compile message on the line of the source it belongs to.
 *
 *   mapMessages(parsed, source, options) -> { ok, alignment, messages, mapped, global, ... }
 *
 * `parsed` is what CompileMessages (E2b) returned; `source` is the text of the member or local file as the
 * editor holds it (a string, or an array of lines). Every message comes back with `line` (1-BASED, like
 * ddsDiagnostics.js), `column` / `endColumn` (the whole line, the same convention as there), `how` (which rule
 * found the line) and, when it did not, `reason`. A message that cannot be put on a line is GLOBAL: `line` is null
 * and the caller shows it for the file as a whole.
 *
 * What the listing gives us (E2a / E2b fixtures, IBM i V7R3M0): the message sits under the source line it belongs to,
 * and the listing numbers its lines with the SEQNBR of the MEMBER (SRCSEQ), not with the digits in columns 1-5 of
 * the text. So the sequence number alone does not say which editor line it is. What does:
 *
 *   1. ORDINAL. The compiler lists every line of the member, comments and blank lines included, in order. The Nth
 *      listed line is the Nth line of the source, whatever the numbers are. That is the rule while the source is
 *      what was compiled, and it makes all three writer behaviours harmless:
 *        - I-203  a commented-out OR line (`A*O 22 ...`, the `*` pushed in front of the `O`) is still a line;
 *        - I-204  a tag in columns 1-5 replaces the digits there, so the line carries no number at all;
 *        - I-207  removed lines kept as comments are lines the compiler saw, with their old number and tag.
 *   2. CHECK. The listing also prints each line's text, so the mapping verifies the position instead of
 *      trusting it. Text is compared with blanks collapsed, once with columns 1-5 and once without them (the
 *      listing's treatment of those columns is not confirmed against a raw spool file).
 *   3. ALIGN. If the source has changed since the compile (the user edited, lines were added or removed), the
 *      listed lines are matched to the current lines by a diff (common start and end first, then Myers' shortest
 *      edit script, so the cost follows the number of changed lines, up to `options.maxEdits`, 2000 by default).
 *      A message follows its line to wherever it moved. A line that was itself edited, or
 *      deleted, is gone: its messages go global (`line-changed`) rather than land on a neighbour.
 *   4. COUNT. If the listing's text cannot be compared (fewer than half of the lines match, which is what an
 *      unknown layout or another member looks like) but the line counts agree, the ordinal is used as it is.
 *   5. SEQUENCE. Last resort, and only when the numbers are in the text: a line whose columns 1-5 are digits
 *      equal to the message's sequence. Comment lines are passed over (the commented-out copy of an edited line
 *      keeps its number, I-203 / I-207, so two lines can share it); two live lines with one number are
 *      `ambiguous-sequence`; no numbers at all (I-204 tag, or a source with blank columns 1-5) is
 *      `no-sequence-numbers`.
 *
 * Global reasons: `file-level` (no line number in the message: the escape message, job log and command text),
 * `line-changed`, `out-of-range`, `ambiguous-sequence`, `sequence-not-found`, `no-sequence-numbers`.
 *
 * Never throws. Plain dependency-free JS (UMD), same style as compileMessages.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CompileLineMap = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var WIDTH = 80;                // the DDS line: columns 1-80 are what the compiler reads and lists
  var MAX_EDITS = 2000;          // the most lines added plus removed the diff will work through between the common ends
  var MIN_MATCH_RATIO = 0.5;     // below this share of matching lines the listing text is not about this source

  // ---- source lines -----------------------------------------------------------

  function collapse(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  /** The lines of a text (CRLF, CR or LF; one trailing line break is not a line) or of an array. Anything else: none. */
  function splitSource(source) {
    if (Array.isArray(source)) {
      var out = [];
      for (var i = 0; i < source.length; i++) out.push(source[i] === null || source[i] === undefined ? '' : String(source[i]));
      return out;
    }
    if (typeof source !== 'string') return [];
    var lines = source.split(/\r\n|\r|\n/);
    if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    return lines;
  }

  /** The digits in columns 1-5 as a number, or null when those columns hold anything else (blank, a tag, text). */
  function sequenceOf(line) {
    var head = String(line).slice(0, 5);
    if (!/^\s*\d+\s*$/.test(head)) return null;
    return parseInt(head, 10);
  }

  /** A DDS comment line has `*` in column 7 (also the `A*O` a tracked OR line becomes, I-203). */
  function isComment(line) { return String(line).charAt(6) === '*'; }

  function prepare(line, width) {
    var text = String(line).slice(0, width);
    return { raw: String(line), full: collapse(text), body: collapse(text.slice(5)) };
  }

  /** True when the text a listing printed is this source line, with or without columns 1-5. */
  function same(listed, doc) { return listed === doc.full || listed === doc.body; }

  // ---- the diff ---------------------------------------------------------------

  /**
   * Myers' shortest-edit-script diff of listed[p .. p+n) against docs[p .. p+m): the matched pairs are written into
   * `map` (listed index -> source index). Its cost grows with the number of changed lines, not with the length of the
   * source, so two small edits far apart in a 30,000-line source are cheap. Returns false, writing nothing, when the
   * two differ by more than `maxEdits` lines added plus removed.
   */
  function myers(listed, docs, p, n, m, maxEdits, map) {
    var max = Math.min(n + m, maxEdits);
    var off = max + 1;
    var V = new Int32Array(2 * max + 3);
    var trace = [];
    for (var d = 0; d <= max; d++) {
      trace.push(V.slice(off - d - 1, off + d + 2));      // V as round d - 1 left it; the entry for diagonal k is at k + d + 1
      for (var k = -d; k <= d; k += 2) {
        var x;
        if (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) x = V[off + k + 1];
        else x = V[off + k - 1] + 1;
        var y = x - k;
        while (x < n && y < m && same(listed[p + x], docs[p + y])) { x++; y++; }
        V[off + k] = x;
        if (x >= n && y >= m) {
          var bx = n;
          var by = m;
          for (var dd = d; dd > 0; dd--) {
            var snap = trace[dd];
            var kk = bx - by;
            var pk = (kk === -dd || (kk !== dd && snap[kk - 1 + dd + 1] < snap[kk + 1 + dd + 1])) ? kk + 1 : kk - 1;
            var px = snap[pk + dd + 1];
            var py = px - pk;
            while (bx > px && by > py) { bx--; by--; map[p + bx] = p + by; }
            bx = px;
            by = py;
          }
          while (bx > 0 && by > 0) { bx--; by--; map[p + bx] = p + by; }
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Match the listed lines (`listed`, an array of collapsed texts) to the source lines (`docs`, from prepare()):
   * the common start and the common end first, then a shortest-edit diff of what lies between.
   * Returns { map, matched, identical, limited }: `map[i]` is the 0-based source line of listed line i, or -1.
   * `limited` is true when the middle differs by more than `maxEdits` lines (only the common start and end are matched).
   */
  function alignLines(listed, docs, maxEdits) {
    var n = listed.length;
    var m = docs.length;
    var map = new Array(n);
    for (var i = 0; i < n; i++) map[i] = -1;

    var p = 0;
    while (p < n && p < m && same(listed[p], docs[p])) { map[p] = p; p++; }
    var s = 0;
    while (s < n - p && s < m - p && same(listed[n - 1 - s], docs[m - 1 - s])) { map[n - 1 - s] = m - 1 - s; s++; }

    var a = n - p - s;
    var b = m - p - s;
    var limited = false;
    if (a > 0 && b > 0) limited = !myers(listed, docs, p, a, b, positiveInt(maxEdits, MAX_EDITS), map);

    var matched = 0;
    for (var k = 0; k < n; k++) if (map[k] >= 0) matched++;
    return { map: map, matched: matched, identical: n === m && p === n, limited: limited };
  }

  // ---- mapping ----------------------------------------------------------------

  /** The listed texts, or null when the parse result has none that line up with its sequence numbers. */
  function listedTexts(parsed) {
    var sl = parsed.sourceLines;
    var sq = parsed.sourceSequences;
    if (!Array.isArray(sl) || !Array.isArray(sq) || sl.length === 0 || sl.length !== sq.length) return null;
    var out = [];
    for (var i = 0; i < sl.length; i++) {
      if (!sl[i] || typeof sl[i].text !== 'string') return null;
      out.push(collapse(sl[i].text));
    }
    return out;
  }

  function copyMessage(m) {
    var c = {};
    for (var k in m) if (Object.prototype.hasOwnProperty.call(m, k)) c[k] = m[k];
    c.line = null;
    c.column = null;
    c.endColumn = null;
    c.how = null;
    c.reason = null;
    return c;
  }

  function place(c, lines, index, how) {
    var len = lines[index].replace(/\s+$/, '').length;
    c.line = index + 1;
    c.column = 1;
    c.endColumn = Math.max(len + 1, 2);
    c.how = how;
  }

  function positiveInt(v, fallback) {
    return typeof v === 'number' && isFinite(v) && v >= 1 && v === Math.floor(v) ? v : fallback;
  }

  function mapMessages(parsed, source, options) {
    var result = {
      ok: false, kind: 'unknown', alignment: 'none',
      listedCount: 0, lineCount: 0, matchedCount: 0, changed: null,
      messages: [], mapped: [], global: []
    };
    try {
      var opts = options || {};
      var width = positiveInt(opts.width, WIDTH);
      var lines = splitSource(source);
      result.lineCount = lines.length;
      if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.messages)) {
        result.error = 'nothing to map: no parsed messages';
        return result;
      }
      result.ok = true;
      result.kind = typeof parsed.kind === 'string' ? parsed.kind : 'unknown';
      var listedCount = Array.isArray(parsed.sourceSequences) ? parsed.sourceSequences.length : 0;
      result.listedCount = listedCount;

      var lineLevel = false;
      for (var q = 0; q < parsed.messages.length; q++) {
        var o = parsed.messages[q] && parsed.messages[q].ordinal;
        if (typeof o === 'number' && o >= 1) { lineLevel = true; break; }
      }

      // One strategy for the whole listing: how its lines relate to the source.
      var strategy = 'none';
      var map = null;
      var docs = null;
      var sequenceIndex = null;
      var hasNumbers = false;
      if (lineLevel) {
        var texts = listedTexts(parsed);
        docs = lines.map(function (l) { return prepare(l, width); });
        if (texts) {
          var al = alignLines(texts, docs, positiveInt(opts.maxEdits, MAX_EDITS));
          result.matchedCount = al.matched;
          if (al.identical) {
            strategy = 'identical';
            result.changed = false;
            map = al.map;
          } else if (texts.length > 0 && al.matched / texts.length >= MIN_MATCH_RATIO) {
            strategy = 'aligned';
            result.changed = true;
            map = al.map;
          }
        }
        if (strategy === 'none') {
          if (listedCount > 0 && listedCount === lines.length) {
            strategy = 'count';
          } else {
            strategy = 'sequence';
            sequenceIndex = {};
            for (var i = 0; i < lines.length; i++) {
              var sn = sequenceOf(lines[i]);
              if (sn === null) continue;
              hasNumbers = true;
              if (isComment(lines[i])) continue;       // a commented-out or kept-removed copy keeps its number (I-203, I-207)
              (sequenceIndex[sn] = sequenceIndex[sn] || []).push(i);
            }
          }
        }
        result.alignment = strategy;
      }

      for (var j = 0; j < parsed.messages.length; j++) {
        var src = parsed.messages[j];
        var c = copyMessage(src && typeof src === 'object' ? src : {});
        var ord = c.ordinal;
        if (typeof ord !== 'number' || ord < 1) {
          c.reason = 'file-level';
        } else if (strategy === 'identical' || strategy === 'count') {
          if (ord > lines.length) c.reason = 'out-of-range';
          else place(c, lines, ord - 1, strategy === 'identical' ? 'ordinal' : 'count');
        } else if (strategy === 'aligned') {
          var at = ord <= map.length ? map[ord - 1] : -1;
          if (ord > map.length) c.reason = 'out-of-range';
          else if (at < 0) c.reason = 'line-changed';
          else place(c, lines, at, 'aligned');
        } else if (strategy === 'sequence') {
          if (!hasNumbers) {
            c.reason = 'no-sequence-numbers';
          } else {
            var found = typeof c.sequence === 'number' ? sequenceIndex[c.sequence] : null;
            if (!found || found.length === 0) c.reason = 'sequence-not-found';
            else if (found.length > 1) c.reason = 'ambiguous-sequence';
            else place(c, lines, found[0], 'sequence');
          }
        }
        result.messages.push(c);
        (c.line === null ? result.global : result.mapped).push(c);
      }
    } catch (err) {
      result.ok = false;
      result.error = String(err && err.message ? err.message : err);
      result.messages = [];
      result.mapped = [];
      result.global = [];
    }
    return result;
  }

  return {
    mapMessages: mapMessages,
    alignLines: alignLines,
    splitSource: splitSource,
    sequenceOf: sequenceOf,
    isComment: isComment,
    prepareLine: prepare
  };
});
