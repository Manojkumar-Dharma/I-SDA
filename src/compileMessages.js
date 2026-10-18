/**
 * compileMessages.js - E2b: turn the text a compile leaves behind into messages.
 *
 *   { msgId, severity, sequence, ordinal, text, source, ... }
 *
 * Decision (E2a, FEATURE-ROADMAP.md): the compile listing is the primary source, the job log the
 * fallback, the command's own error text the last resort. The E2a fixtures (src/test/fixtures/compile,
 * a failing CRTDSPF on IBM i V7R3M0) show why:
 *
 *   - LISTING   Each message sits right after the source line it belongs to, as a marker line
 *               `* CPD5237-**********` (message ID, a dash, then a run of asterisks / dots whose meaning is not
 *               known, so it is kept raw in `marker` and not used). That is the only place a message gets a
 *               sequence number: the SEQNBR of the source line above it. The text and the severity come from
 *               the `Messages` section at the end (`* CPD5237 30 1 Message . . . . : text`), once per ID. The
 *               escape message (`* CPF7302 40 Message ...`) is listed in the summary and has no line.
 *   - JOB LOG   Carries the CPF7311 "Errors in DDS not allowed with specified GENLVL" diagnostic and the
 *               CPF7302 escape, but NONE of the line-level CPD messages, and no sequence numbers. It can only
 *               produce file-level (global) messages.
 *   - COMMAND   Code for i's error text is the job log messages as `ID: text` runs, without severity, plus
 *               SQL0443 noise from the job log query. Also file-level only.
 *
 * `ordinal` is the 1-based position of the source line in the listing (the Nth line of the member). The
 * sequence numbers are the SOURCE MEMBER's, which need not run 100, 200, ... (the fixture starts at 500 and has
 * 1801, 1901, 3101, 3102), so E2c maps through `sourceSequences` / `ordinal`, not through arithmetic.
 *
 * Never throws and never rejects. Unknown layouts give { recognized: false, messages: [] }. Page headers
 * that were glued onto the end of a line (the PDF export of the fixture does that) are split off first.
 *
 * NOT YET CHECKED AGAINST A RAW SPOOL FILE: the fixture was read from a PDF of the listing, in which the
 * column spacing is collapsed. Every pattern here is whitespace-tolerant for that reason; a CPYSPLF /
 * SPOOLED_FILE_DATA capture (E2c) should be added as a second fixture. CRTS36DSPF and CRTMNU layouts are unseen.
 *
 * Plain dependency-free JS (UMD), same style as messageFile.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.CompileMessages = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var ID = '[A-Z][A-Z0-9]{2}\\d{4}';
  var HEADER_RE = /5770[A-Z0-9]{3}\s+V\d+R\d+M\d+/;
  var PAGE_HEADER_SPLIT_RE = /(?=5770[A-Z0-9]{3}\s+V\d+R\d+M\d+\s)/;
  var MARKER_RE = new RegExp('^\\*\\s*(' + ID + ')-(.*)$');
  var MESSAGE_RE = new RegExp('^\\*\\s*(' + ID + ')\\s+(\\d+)\\s+(?:(\\d+)\\s+)?Message(?:\\s*\\.)*\\s*:\\s*(.*)$');
  var SOURCE_LINE_RE = /^\s*(\d{1,6})(?:\s|$)/;
  var COUNTS_RE = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/;
  var JOBLOG_LINE_RE = new RegExp('^\\s*(\\d+)\\s+(' + ID + ')\\s+([A-Z][A-Z ]*?)\\s+(\\d+)\\s+(.*?)\\s*$');
  var COMMAND_ID_RE = new RegExp('(?:^|[\\s.])(' + ID + '):\\s', 'g');

  // ---- helpers ---------------------------------------------------------------

  function emptyResult(kind) {
    return { kind: kind, recognized: false, messages: [], header: {}, summary: null, sourceSequences: [] };
  }

  function toLines(text) {
    if (typeof text !== 'string') return [];
    var raw = text.replace(/\r\n?/g, '\n').replace(/\f/g, '\n').split('\n');
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var parts = raw[i].split(PAGE_HEADER_SPLIT_RE);
      for (var j = 0; j < parts.length; j++) out.push(parts[j]);
    }
    return out;
  }

  /** Message texts are prose: runs of blanks (a wide spool layout) collapse to one space. */
  function tidy(s) { return String(s).replace(/\s+/g, ' ').trim(); }

  function num(s) { var n = parseInt(s, 10); return isNaN(n) ? null : n; }

  /** 0-9 info, 10-19 warning, 20-29 error, 30 and over severe: the bands the listing's own summary uses. */
  function severityClass(severity) {
    var n = typeof severity === 'number' ? severity : num(severity);
    if (n === null || n < 0) return 'unknown';
    if (n < 10) return 'info';
    if (n < 20) return 'warning';
    if (n < 30) return 'error';
    return 'severe';
  }

  function makeMessage(source, msgId, severity, text, extra) {
    var m = {
      msgId: msgId,
      severity: severity === undefined ? null : severity,
      sequence: null,
      ordinal: null,
      text: text || '',
      source: source
    };
    for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) m[k] = extra[k];
    return m;
  }

  // ---- the compile listing ----------------------------------------------------

  var HEADER_FIELDS = [
    ['file', /^\s*File name\b[ .]*:\s*(.*)$/, 'fileName'],
    ['sourceFile', /^\s*Source file containing DDS\b[ .]*:\s*(.*)$/, 'sourceFile'],
    ['member', /^\s*Source member containing DDS\b[ .]*:\s*(.*)$/, 'member'],
    ['generation', /^\s*DDS generation severity level\b[ .]*:\s*(\d+)/, 'generationSeverity'],
    ['flagging', /^\s*DDS flagging severity level\b[ .]*:\s*(\d+)/, 'flaggingSeverity']
  ];

  function parseListing(text) {
    var result = emptyResult('listing');
    try {
      var lines = toLines(text);
      var section = 'none';
      var lastSeq = null;
      var lastOrdinal = null;
      var texts = {};          // msgId -> { severity, text }
      var order = [];          // markers, in the order they appear
      var escapes = [];
      var current = null;      // the Messages entry a wrapped text line belongs to

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].replace(/\s+$/, '');
        if (!line) { current = null; continue; }
        var trimmed = tidy(line);

        if (HEADER_RE.test(line) && /Data\s+Description/.test(line)) { result.recognized = true; current = null; continue; }
        if (/^Data Description Source$/.test(trimmed)) { section = 'source'; current = null; continue; }
        if (/^Expanded Source$/.test(trimmed)) { section = 'expanded'; current = null; continue; }
        if (/^Messages$/.test(trimmed)) { section = 'messages'; current = null; continue; }
        if (/^Message Summary$/.test(trimmed)) { section = 'summary'; current = null; continue; }
        var banner = trimmed.replace(/[\s*]/g, '');
        if (banner === 'ENDOFSOURCE') { section = 'afterSource'; current = null; continue; }
        if (banner === 'ENDOFEXPANDEDSOURCE' || banner === 'ENDOFCOMPILATION') { current = null; continue; }
        if (/^SEQNBR\b/.test(trimmed) || /^ID\s+Severity\b/.test(trimmed) || /^Field\s+Buffer\b/.test(trimmed)) continue;

        if (section === 'none') {
          for (var h = 0; h < HEADER_FIELDS.length; h++) {
            var hm = HEADER_FIELDS[h][1].exec(line);
            if (hm) {
              var val = hm[1].trim();
              result.header[HEADER_FIELDS[h][2]] = /Severity/i.test(HEADER_FIELDS[h][2]) ? num(val) : val;
              break;
            }
          }
          var libm = /^\s*Library name\b[ .]*:\s*(.*)$/.exec(line);
          if (libm) {
            if (!result.header.library) result.header.library = libm[1].trim();
            else if (!result.header.sourceLibrary) result.header.sourceLibrary = libm[1].trim();
          }
          continue;
        }

        if (section === 'source') {
          var mk = MARKER_RE.exec(line);
          if (mk) {
            order.push({ msgId: mk[1], marker: mk[2].trim(), sequence: lastSeq, ordinal: lastOrdinal });
            continue;
          }
          var sm = SOURCE_LINE_RE.exec(line);
          if (sm) {
            lastSeq = num(sm[1]);
            result.sourceSequences.push(lastSeq);
            lastOrdinal = result.sourceSequences.length;
          }
          continue;
        }

        if (section === 'messages' || section === 'summary' || section === 'afterSource') {
          var mm = MESSAGE_RE.exec(line);
          if (mm) {
            var entry = { severity: num(mm[2]), text: tidy(mm[4]) };
            current = entry;
            if (section === 'messages') {
              texts[mm[1]] = entry;
            } else {
              escapes.push({ msgId: mm[1], entry: entry });
            }
            continue;
          }
          var cm = COUNTS_RE.exec(line);
          if (cm && section === 'summary') {
            result.summary = { total: num(cm[1]), info: num(cm[2]), warning: num(cm[3]), error: num(cm[4]), severe: num(cm[5]) };
            current = null;
            continue;
          }
          if (current && !/^\*/.test(line) && !/^\s*\(\d/.test(line) && /^\s{2,}\S/.test(line)) {
            current.text = tidy(current.text + ' ' + trimmed);
          }
        }
      }

      for (var k = 0; k < order.length; k++) {
        var o = order[k];
        var t = texts[o.msgId];
        var msg = makeMessage('listing', o.msgId, t ? t.severity : null, t ? t.text : '', { marker: o.marker });
        msg.sequence = o.sequence;
        msg.ordinal = o.ordinal;
        result.messages.push(msg);
      }
      for (var e = 0; e < escapes.length; e++) {
        result.messages.push(makeMessage('listing', escapes[e].msgId, escapes[e].entry.severity, escapes[e].entry.text, { marker: null }));
      }
      if (result.sourceSequences.length === 0 && result.messages.length === 0) result.recognized = false;
      result.failed = result.messages.some(function (m) { return m.sequence === null && m.severity !== null && m.severity >= 40; });
    } catch (err) {
      result.recognized = false;
      result.messages = [];
      result.error = String(err && err.message ? err.message : err);
    }
    return result;
  }

  // ---- the job log ------------------------------------------------------------

  /**
   * Accepts the DSPJOBLOG rows as text (`27  CPF7302  ESCAPE  40  File ... not created.`) or
   * the rows of QSYS2.JOBLOG_INFO (MESSAGE_ID, MESSAGE_TYPE, SEVERITY, MESSAGE_TEXT, ORDINAL_POSITION,
   * MESSAGE_SECOND_LEVEL_TEXT). Messages come back oldest first; no sequence numbers exist here.
   */
  function parseJobLog(input) {
    var result = emptyResult('joblog');
    try {
      var found = [];
      if (Array.isArray(input)) {
        input.forEach(function (row) {
          if (!row || typeof row !== 'object') return;
          var id = typeof row.MESSAGE_ID === 'string' ? row.MESSAGE_ID.trim() : '';
          if (!new RegExp('^' + ID + '$').test(id)) return;
          var sev = row.SEVERITY === undefined || row.SEVERITY === null ? null : num(String(row.SEVERITY));
          found.push(makeMessage('joblog', id, sev, tidy(row.MESSAGE_TEXT === undefined || row.MESSAGE_TEXT === null ? '' : row.MESSAGE_TEXT), {
            type: typeof row.MESSAGE_TYPE === 'string' ? row.MESSAGE_TYPE.trim() : null,
            position: num(String(row.ORDINAL_POSITION === undefined ? '' : row.ORDINAL_POSITION))
          }));
        });
      } else {
        toLines(input).forEach(function (line) {
          var m = JOBLOG_LINE_RE.exec(line);
          if (!m) return;
          found.push(makeMessage('joblog', m[2], num(m[4]), tidy(m[5]), { type: m[3].trim(), position: num(m[1]) }));
        });
      }
      found.sort(function (a, b) { return (a.position === null ? 0 : a.position) - (b.position === null ? 0 : b.position); });
      result.messages = found;
      result.recognized = found.length > 0;
      result.failed = found.some(function (m) { return m.type === 'ESCAPE' && m.severity !== null && m.severity >= 40; });
    } catch (err) {
      result.recognized = false;
      result.messages = [];
      result.error = String(err && err.message ? err.message : err);
    }
    return result;
  }

  // ---- the command's own error text ---------------------------------------------

  /**
   * Code for i's text after a failed command: `ID: text` runs joined by spaces (the iSDA toast adds a
   * leading `iSDA: CRTDSPF failed:`). No severity. SQL messages from the job log query are kept and flagged
   * `noise` so a caller can drop them.
   */
  function parseCommandText(text) {
    var result = emptyResult('command');
    try {
      if (typeof text !== 'string') return result;
      var flat = text.replace(/\s+/g, ' ');
      var hits = [];
      var m;
      COMMAND_ID_RE.lastIndex = 0;
      while ((m = COMMAND_ID_RE.exec(flat)) !== null) {
        hits.push({ id: m[1], start: m.index + m[0].length, idStart: m.index + m[0].indexOf(m[1]) });
      }
      for (var i = 0; i < hits.length; i++) {
        var end = i + 1 < hits.length ? hits[i + 1].idStart : flat.length;
        var msg = makeMessage('command', hits[i].id, null, flat.slice(hits[i].start, end).trim(), { noise: /^SQL/.test(hits[i].id) });
        result.messages.push(msg);
      }
      result.recognized = result.messages.length > 0;
    } catch (err) {
      result.recognized = false;
      result.messages = [];
      result.error = String(err && err.message ? err.message : err);
    }
    return result;
  }

  // ---- one entry point ------------------------------------------------------------

  /** Guess the layout: a listing, DSPJOBLOG rows / JOBLOG_INFO rows, or the command's error text. */
  function parse(input) {
    try {
      if (Array.isArray(input)) return parseJobLog(input);
      if (typeof input !== 'string') return emptyResult('unknown');
      if (/Data Description Source|Expanded Source|Message Summary/.test(input) || HEADER_RE.test(input)) {
        var l = parseListing(input);
        if (l.recognized) return l;
      }
      var j = parseJobLog(input);
      if (j.recognized) return j;
      return parseCommandText(input);
    } catch (err) {
      var r = emptyResult('unknown');
      r.error = String(err && err.message ? err.message : err);
      return r;
    }
  }

  return {
    parse: parse,
    parseListing: parseListing,
    parseJobLog: parseJobLog,
    parseCommandText: parseCommandText,
    severityClass: severityClass
  };
});
