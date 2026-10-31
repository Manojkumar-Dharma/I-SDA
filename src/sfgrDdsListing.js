/**
 * sfgrDdsListing.js - E12f: the messages of the DDS that $SFGR generated, put back on the SFGR statement that produced
 * the DDS line.
 *
 * The CRTDSPF listing of a $SFGR member ("Source member containing DDS . . . : $SFGR.WORK", text "Created-by-$SFGR")
 * prints every DDS line as  SEQNBR  REF  A ...  where REF is the line number of the SFGR source member that line came
 * from (STIPFM: ENR of SAISIE is DDS line 14600 with REF 0106, line 106 of 549). A message is marked under the DDS line it
 * concerns by a line  * CPDnnnn-***  and described once in the Messages block  * CPDnnnn  sev  count  Message . . . . : text.
 * Recorded: STIPFM, DDSEDGE, DDSLC, DBCS1 (docs/sda-reference/source/compile-fixtures). All of them compiled; no
 * error-severity message has been seen, so the severity bands are the listing's own legend (0-9 informational, 10-19
 * warning, 20-29 error, 30-99 severe) and the marker of an error is assumed to look like the others.
 *
 * isGenerated(text)                 -> boolean
 * parse(text)                       -> { recognized, generated, lines, messages: [{ id, severity, count, text, occurrences: [{ seq, ref }] }] }
 * toDiagnostics(parsed, source, o)  -> { diagnostics, mapped, fileLevel }   one per SFGR line and message id
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.SfgrDdsListing = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var SOURCE_RE = /^\s*(\d+)\s+(\d{4})\s+A(?:\s|\*|$)/;
  var MARKER_RE = /^\*\s+([A-Z]{3}[A-Z0-9]{4})-/;
  var BLOCK_RE = /^\*\s+([A-Z]{3}[A-Z0-9]{4})\s+(\d+)\s+(\d+)\s+Message \. \. \. \. :\s*(.*)$/;

  function linesOf(text) { return Array.isArray(text) ? text.map(String) : String(text == null ? '' : text).split(/\r\n|\r|\n|\f/); }
  function norm(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function isGenerated(text) {
    var t = Array.isArray(text) ? text.join('\n') : String(text == null ? '' : text);
    return /\$SFGR\.WORK/.test(t) || /Created-by-\$SFGR/.test(t);
  }

  function levelOf(severity) {
    if (severity >= 20) return 'error';
    if (severity >= 10) return 'warning';
    return 'information';
  }

  function parse(text) {
    var rows = linesOf(text);
    var result = { recognized: false, generated: isGenerated(text), lines: [], messages: [] };
    var byId = {};
    var inSource = false;
    var last = null;
    var current = null;
    for (var i = 0; i < rows.length; i++) {
      var line = rows[i].replace(/\s+$/, '');
      if (/Data Description Source\s*$/.test(line)) { inSource = true; continue; }
      if (/E N D O F S O U R C E/.test(line)) { inSource = false; last = null; continue; }
      var b = BLOCK_RE.exec(line);
      if (b) {
        current = byId[b[1]];
        if (!current) { current = byId[b[1]] = { id: b[1], severity: 0, count: 0, text: '', occurrences: [] }; result.messages.push(current); }
        current.severity = +b[2]; current.count = +b[3]; current.text = norm(b[4]);   // the markers come first, the block later
        continue;
      }
      if (current && /^\s{6,}\S/.test(line) && !SOURCE_RE.test(line)) { current.text = norm(current.text + ' ' + line); continue; }
      if (!line.trim()) { current = null; continue; }
      if (!inSource) continue;
      var m = MARKER_RE.exec(line);
      if (m) {
        if (last) {
          var slot = byId[m[1]];
          if (!slot) { slot = byId[m[1]] = { id: m[1], severity: 0, count: 0, text: '', occurrences: [] }; result.messages.push(slot); }
          slot.occurrences.push({ seq: last.seq, ref: last.ref });
        }
        continue;
      }
      var s = SOURCE_RE.exec(line);
      if (s) {
        last = { seq: +s[1], ref: +s[2] };
        result.lines.push(last);
      }
    }
    result.recognized = result.lines.length > 0;
    return result;
  }

  function toDiagnostics(parsed, source, options) {
    options = options || {};
    var rows = linesOf(source);
    var width = Math.max(2, String(rows[0] || '').length + 1);
    var out = { diagnostics: [], mapped: 0, fileLevel: 0 };
    (parsed && parsed.messages || []).forEach(function (m) {
      var text = m.text || m.id;
      var seen = {};
      var places = [];
      m.occurrences.forEach(function (o) {
        if (seen[o.ref]) return;
        seen[o.ref] = true;
        places.push(o.ref);
      });
      if (!places.length) {
        // no marker: only a message that says something is worth a diagnostic (the completion message of severity 0 is not)
        if (m.severity >= 10) places.push(0);
        else return;
      }
      places.forEach(function (ref) {
        var placed = ref >= 1 && ref <= rows.length;
        out.diagnostics.push({
          line: placed ? ref : 1,
          column: 1,
          endColumn: placed ? Math.max(2, String(rows[ref - 1] || '').length + 1) : width,
          severity: levelOf(m.severity),
          message: text,
          code: m.id,
          source: options.source || 'CRTS36DSPF',
          fileLevel: !placed
        });
        if (placed) out.mapped++; else out.fileLevel++;
      });
    });
    return out;
  }

  return { isGenerated: isGenerated, parse: parse, toDiagnostics: toDiagnostics, levelOf: levelOf };
});
