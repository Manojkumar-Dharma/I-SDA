/**
 * messageFile.js - E4b: resolve an IBM i message ID to its text, for the
 * ERRMSGID / MSGID / SFLMSGID / CHKMSGID previews (E4c), the message picker and
 * "ID not found" check (E4d), the menu designer (E4e) and the settings (E4f).
 *
 * Decision (E4a, FEATURE-ROADMAP.md): SQL first, a per-ID API call as the
 * fallback, a per-session cache and nothing on disk.
 *
 *   1. SQL   QSYS2.MESSAGE_FILE_DATA (IBM i 7.3 TR6 and later): MESSAGE_FILE,
 *            MESSAGE_FILE_LIBRARY, MESSAGE_ID, MESSAGE_TEXT (first level),
 *            MESSAGE_SECOND_LEVEL_TEXT, SEVERITY. One query gives a whole message
 *            file, so it also feeds the picker.
 *   2. API   QMHRTVM format RTVM0100 through an external CL procedure in
 *            ISDATEMP (same pattern as jobDateFormat.js). One message per call;
 *            no list. Used when the view does not exist on the release.
 *
 * The first SQL error that names MESSAGE_FILE_DATA as missing (SQL0204 / "not found")
 * switches the resolver to the API path for the rest of the session. Any other
 * error is returned as an error and does not switch anything.
 *
 * Never throws and never rejects: every function returns { ok: true, ... } or
 * { ok: false, code, error }. Codes: 'not-connected', 'bad-id', 'bad-msgf',
 * 'not-found', 'unsupported', 'error'.
 *
 * Replacement values are NOT substituted here: the text keeps its &1 / &2
 * markers, so E4c can fill them from the E3f store (or placeholders).
 *
 * NOT YET CHECKED AGAINST A REAL IBM i: the QSYS2.LIBRARY_LIST_INFO column
 * names (SCHEMA_NAME, TYPE, ORDINAL_POSITION), the RTVM0100 offsets, and which
 * CPF ids QMHRTVM returns for "message file not found" (CPF2407) and "message
 * not found" (CPF2410). All three live in one place each (libraryListSql,
 * RTVM0100, CPF_*) so a capture can correct them without touching the logic.
 * Everything is tested against a fake connection.
 *
 * Plain dependency-free JS (UMD), same style as jobDateFormat.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./qdbrtvfdParser.js'));
  } else {
    root.MessageFile = factory(root.QdbrtvfdParser);
  }
})(typeof self !== 'undefined' ? self : this, function (QdbrtvfdParser) {
  'use strict';

  var LIBRARY = 'ISDATEMP';
  var RECEIVER_BYTES = 4096;
  var HEX_ROW_BYTES = 64;
  // QMHRTVM, format RTVM0100 (IBM i Retrieve Message API): fixed header, then the
  // message text, then the help (second-level) text.
  var RTVM0100 = {
    bytesReturned: 0, bytesAvailable: 4,
    messageReturned: 8, messageAvailable: 12,
    helpReturned: 16, helpAvailable: 20,
    textStart: 24
  };
  var CPF_MSGF_NOT_FOUND = 'CPF2407';
  var CPF_MSG_NOT_FOUND = 'CPF2410';

  var NAME_RE = /^[A-Z@#$][A-Z0-9_@#$]{0,9}$/;
  var ID_RE = /^[A-Z0-9]{7}$/;
  var SPECIAL_LIBRARIES = ['*LIBL', '*CURLIB'];

  function fail(code, error) { return { ok: false, code: code, error: error }; }
  function errText(e) { return e && e.message ? e.message : String(e); }
  function lit(s) { return "'" + String(s).replace(/'/g, "''") + "'"; }

  // ---- names ---------------------------------------------------------------

  /** 'MSGID01' -> 'MSGID01'; lower case is folded; anything else is null. */
  function normalizeMessageId(id) {
    if (typeof id !== 'string') return null;
    var s = id.trim().toUpperCase();
    return ID_RE.test(s) ? s : null;
  }

  /**
   * 'LIB/NAME', 'NAME' (library *LIBL), '*LIBL/NAME', '*CURLIB/NAME' or
   * { library, name } -> { library, name } upper-cased, or null when a part is
   * not a valid IBM i name. Quoted names are not supported.
   */
  function parseMessageFileRef(ref) {
    var lib = '*LIBL', name = null;
    if (typeof ref === 'string') {
      var parts = ref.trim().toUpperCase().split('/');
      if (parts.length === 1) name = parts[0];
      else if (parts.length === 2) { lib = parts[0]; name = parts[1]; }
      else return null;
    } else if (ref && typeof ref === 'object') {
      name = String(ref.name || '').trim().toUpperCase();
      if (ref.library) lib = String(ref.library).trim().toUpperCase();
    } else {
      return null;
    }
    if (!NAME_RE.test(name)) return null;
    if (SPECIAL_LIBRARIES.indexOf(lib) < 0 && !NAME_RE.test(lib)) return null;
    return { library: lib, name: name };
  }

  // ---- SQL path ------------------------------------------------------------

  var VIEW_COLUMNS = 'MESSAGE_FILE_LIBRARY, MESSAGE_ID, MESSAGE_TEXT, MESSAGE_SECOND_LEVEL_TEXT, SEVERITY';

  /** Library list in search order: system, product, current, user (ORDINAL_POSITION). */
  function libraryListSql() {
    return 'SELECT SCHEMA_NAME, TYPE FROM QSYS2.LIBRARY_LIST_INFO ORDER BY ORDINAL_POSITION';
  }

  /** `libraries` is the list to search (one name, or the whole library list). */
  function messageSql(msgfName, libraries, id) {
    var sql = 'SELECT ' + VIEW_COLUMNS + ' FROM QSYS2.MESSAGE_FILE_DATA WHERE MESSAGE_FILE = ' + lit(msgfName) +
      ' AND MESSAGE_FILE_LIBRARY IN (' + libraries.map(lit).join(', ') + ')';
    if (id) sql += ' AND MESSAGE_ID = ' + lit(id);
    return sql + ' ORDER BY MESSAGE_ID';
  }

  function col(row, name) {
    if (!row) return undefined;
    if (row[name] !== undefined) return row[name];
    if (row[name.toLowerCase()] !== undefined) return row[name.toLowerCase()];
    return undefined;
  }
  function trimmed(v) { return v === null || v === undefined ? '' : String(v).replace(/\s+$/, ''); }

  function rowToMessage(row) {
    var sev = Number(col(row, 'SEVERITY'));
    return {
      library: trimmed(col(row, 'MESSAGE_FILE_LIBRARY')),
      id: trimmed(col(row, 'MESSAGE_ID')),
      text: trimmed(col(row, 'MESSAGE_TEXT')),
      secondLevel: trimmed(col(row, 'MESSAGE_SECOND_LEVEL_TEXT')),
      severity: isFinite(sev) && col(row, 'SEVERITY') !== null && col(row, 'SEVERITY') !== undefined ? sev : null
    };
  }

  /** The SQL error that means "this release has no such view". */
  function isMissingViewError(text) {
    return /MESSAGE_FILE_DATA/i.test(text) && /SQL0204|not found|does not exist|not defined/i.test(text);
  }

  // ---- API path ------------------------------------------------------------

  function wrapperSql() {
    return 'CREATE OR REPLACE PROCEDURE ' + LIBRARY + '.QMHRTVM_X (\n' +
      '  INOUT P_RCV CHAR(' + RECEIVER_BYTES + ') FOR BIT DATA,\n' +
      '  IN P_RCVLEN INTEGER,\n' +
      '  IN P_FMT CHAR(8),\n' +
      '  IN P_MSGID CHAR(7),\n' +
      '  IN P_QMSGF CHAR(20),\n' +
      '  IN P_RPLDTA CHAR(1),\n' +
      '  IN P_RPLLEN INTEGER,\n' +
      '  IN P_RPLSUB CHAR(10),\n' +
      '  IN P_RTNFMT CHAR(10),\n' +
      '  INOUT P_ERR CHAR(16) FOR BIT DATA\n' +
      ')\n  EXTERNAL NAME \'QSYS/QMHRTVM\'\n  LANGUAGE CL\n  PARAMETER STYLE GENERAL';
  }
  function dumpProcedureSql() {
    var rows = RECEIVER_BYTES / HEX_ROW_BYTES;
    return 'CREATE OR REPLACE PROCEDURE ' + LIBRARY + '.MSGF_DUMP (IN P_ID CHAR(7), IN P_MSGF CHAR(10), IN P_LIB CHAR(10))\n' +
      '  LANGUAGE SQL\n  RESULT SETS 1\nBEGIN\n' +
      '  DECLARE V_RCV    CHAR(' + RECEIVER_BYTES + ') FOR BIT DATA;\n' +
      '  DECLARE V_RCVLEN INTEGER DEFAULT ' + RECEIVER_BYTES + ';\n' +
      "  DECLARE V_FMT    CHAR(8)  DEFAULT 'RTVM0100';\n" +
      '  DECLARE V_QMSGF  CHAR(20);\n' +
      "  DECLARE V_RPL    CHAR(1)  DEFAULT ' ';\n" +
      "  DECLARE V_SUB    CHAR(10) DEFAULT '*NO';\n" +
      "  DECLARE V_RTN    CHAR(10) DEFAULT '*NO';\n" +
      "  DECLARE V_ERR    CHAR(16) FOR BIT DATA DEFAULT X'00000010000000000000000000000000';\n" +
      '  DECLARE C1 CURSOR WITH RETURN FOR\n' +
      '    WITH T(N) AS (VALUES 0 UNION ALL SELECT N + 1 FROM T WHERE N < ' + (rows - 1) + ')\n' +
      "    SELECT 'RCV' AS K, N * " + HEX_ROW_BYTES + ' AS OFFSET, HEX(SUBSTR(V_RCV, N * ' + HEX_ROW_BYTES + ' + 1, ' + HEX_ROW_BYTES + ')) AS HEXDATA FROM T\n' +
      "    UNION ALL SELECT 'ERR', 0, HEX(V_ERR) FROM SYSIBM.SYSDUMMY1\n      ORDER BY 1 DESC, 2;\n\n" +
      '  SET V_QMSGF = P_MSGF || P_LIB;\n' +
      '  CALL ' + LIBRARY + '.QMHRTVM_X(V_RCV, V_RCVLEN, V_FMT, P_ID, V_QMSGF, V_RPL, 0, V_SUB, V_RTN, V_ERR);\n' +
      '  OPEN C1;\nEND';
  }
  function padName(s) { return (s + '          ').slice(0, 10); }
  function callSql(id, msgf) {
    return 'CALL ' + LIBRARY + '.MSGF_DUMP(' + lit(id) + ', ' + lit(padName(msgf.name)) + ', ' + lit(padName(msgf.library)) + ')';
  }

  function hexToBytes(hex) {
    if (!hex || hex.length % 2) return null;
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) {
      var b = parseInt(hex.substr(i * 2, 2), 16);
      if (isNaN(b)) return null;
      out[i] = b;
    }
    return out;
  }

  /** Splits the result set into the receiver bytes and the error-code bytes. */
  function splitDumpRows(rows) {
    if (!rows || !rows.length) return null;
    var rcv = [], err = '';
    rows.forEach(function (r) {
      var k = String(col(r, 'K')), off = Number(col(r, 'OFFSET')), hex = String(col(r, 'HEXDATA') || '');
      if (k === 'RCV') rcv.push({ off: off, hex: hex });
      else if (k === 'ERR') err = hex;
    });
    rcv.sort(function (a, b) { return a.off - b.off; });
    var text = '';
    for (var i = 0; i < rcv.length; i++) {
      if (rcv[i].off * 2 !== text.length) return null;
      text += rcv[i].hex;
    }
    var rb = hexToBytes(text), eb = hexToBytes(err);
    return rb && eb ? { receiver: rb, error: eb } : null;
  }

  function u32(b, o) { return ((b[o] * 16777216) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3]); }

  /**
   * The QMHRTVM error-code structure (ERRC0100): bytes provided 0, bytes
   * available 4, exception id 8..14 (EBCDIC). Bytes available 0 = no error.
   */
  function decodeErrorCode(bytes) {
    if (!bytes || bytes.length < 16) return { failed: false };
    if (u32(bytes, 4) === 0) return { failed: false };
    return { failed: true, id: QdbrtvfdParser.decodeEbcdic037(bytes, 8, 15) };
  }

  /** RTVM0100 receiver -> { ok, text, secondLevel } or { ok: false, error }. */
  function decodeRtvm0100(bytes) {
    if (!bytes || typeof bytes.length !== 'number') return { ok: false, error: 'No RTVM0100 data.' };
    if (bytes.length < RTVM0100.textStart) return { ok: false, error: 'RTVM0100 receiver too short (' + bytes.length + ' bytes).' };
    var ret = u32(bytes, RTVM0100.bytesReturned);
    if (ret < RTVM0100.textStart) return { ok: false, error: 'QMHRTVM returned only ' + ret + ' bytes.' };
    var msgLen = u32(bytes, RTVM0100.messageReturned), helpLen = u32(bytes, RTVM0100.helpReturned);
    var msgEnd = RTVM0100.textStart + msgLen, helpEnd = msgEnd + helpLen;
    if (helpEnd > bytes.length || helpEnd > ret) return { ok: false, error: 'RTVM0100 lengths run past the receiver.' };
    return {
      ok: true,
      text: trimmed(QdbrtvfdParser.decodeEbcdic037(bytes, RTVM0100.textStart, msgEnd)),
      secondLevel: trimmed(QdbrtvfdParser.decodeEbcdic037(bytes, msgEnd, helpEnd))
    };
  }

  /** The library object of a hexadecimal row set, kept for tests. */
  function buildRtvm0100(text, secondLevel, extraBytes) {
    var EB = QdbrtvfdParser.decodeEbcdic037;
    var codes = [];
    for (var c = 0; c < 256; c++) codes.push(c);
    var rev = {};
    codes.forEach(function (b) { var ch = EB([b], 0, 1); if (rev[ch] === undefined) rev[ch] = b; });
    function enc(s) { return Array.prototype.map.call(s, function (ch) { return rev[ch] === undefined ? 0x6f : rev[ch]; }); }
    var m = enc(text || ''), h = enc(secondLevel || '');
    var total = RTVM0100.textStart + m.length + h.length;
    var out = new Uint8Array(Math.max(total, RTVM0100.textStart) + (extraBytes || 0));
    function put(o, v) { out[o] = (v >>> 24) & 255; out[o + 1] = (v >>> 16) & 255; out[o + 2] = (v >>> 8) & 255; out[o + 3] = v & 255; }
    put(RTVM0100.bytesReturned, total); put(RTVM0100.bytesAvailable, total);
    put(RTVM0100.messageReturned, m.length); put(RTVM0100.messageAvailable, m.length);
    put(RTVM0100.helpReturned, h.length); put(RTVM0100.helpAvailable, h.length);
    m.concat(h).forEach(function (b, i) { out[RTVM0100.textStart + i] = b; });
    return out;
  }

  // ---- the resolver --------------------------------------------------------

  function hasConnection(c) {
    return !!c && typeof c.runSQL === 'function' && typeof c.runCommand === 'function';
  }

  /**
   * connection: Code for i's connection (runSQL(sql) -> rows, runCommand({command,
   * environment})), or a function returning the current one (so a reconnect is
   * picked up) or null. hooks: { ensureLibrary(connection) -> null | error text }
   * like jobDateFormat.js.
   */
  function createResolver(connection, hooks) {
    var mode = 'unknown';          // 'sql' | 'api' once known
    var libl = null;               // library names, search order
    var textCache = {};            // key -> message
    var listCache = {};            // 'LIB/FILE' -> { library, messages }
    var inflight = {};
    var apiReady = false;

    function conn() {
      var c = typeof connection === 'function' ? connection() : connection;
      return hasConnection(c) ? c : null;
    }

    async function libraryList(c) {
      if (libl) return libl;
      var rows = await c.runSQL(libraryListSql());
      var names = [], current = null;
      (rows || []).forEach(function (r) {
        var n = trimmed(col(r, 'SCHEMA_NAME'));
        if (!n) return;
        names.push(n);
        if (String(trimmed(col(r, 'TYPE'))).toUpperCase() === 'CURRENT') current = n;
      });
      if (!names.length) throw new Error('The library list came back empty.');
      libl = { names: names, current: current };
      return libl;
    }

    /** The libraries a reference searches, in order. */
    async function searchLibraries(c, ref) {
      if (ref.library === '*LIBL') return (await libraryList(c)).names;
      if (ref.library === '*CURLIB') {
        var cur = (await libraryList(c)).current;
        if (!cur) throw new Error('The job has no current library.');
        return [cur];
      }
      return [ref.library];
    }

    async function sqlMessages(c, ref, id) {
      var libs = await searchLibraries(c, ref);
      var rows = await c.runSQL(messageSql(ref.name, libs, id));
      var found = (rows || []).map(rowToMessage);
      if (!found.length) return { library: null, messages: [] };
      var first = null;
      for (var i = 0; i < libs.length && !first; i++) {
        if (found.some(function (m) { return m.library === libs[i]; })) first = libs[i];
      }
      first = first || found[0].library;
      return { library: first, messages: found.filter(function (m) { return m.library === first; }) };
    }

    async function apiMessage(c, ref, id) {
      if (!apiReady) {
        var libErr = (hooks && typeof hooks.ensureLibrary === 'function') ? await hooks.ensureLibrary(c) : null;
        if (libErr) return fail('error', libErr);
        await c.runSQL(wrapperSql());
        await c.runSQL(dumpProcedureSql());
        apiReady = true;
      }
      var parts = splitDumpRows(await c.runSQL(callSql(id, ref)));
      if (!parts) return fail('error', 'QMHRTVM returned no data.');
      var ec = decodeErrorCode(parts.error);
      if (ec.failed) {
        if (ec.id === CPF_MSG_NOT_FOUND) return fail('not-found', 'Message ' + id + ' is not in ' + ref.library + '/' + ref.name + '.');
        if (ec.id === CPF_MSGF_NOT_FOUND) return fail('not-found', 'Message file ' + ref.library + '/' + ref.name + ' was not found.');
        return fail('error', 'QMHRTVM failed with ' + ec.id + '.');
      }
      var d = decodeRtvm0100(parts.receiver);
      if (!d.ok) return fail('error', d.error);
      return { ok: true, id: id, library: ref.library, text: d.text, secondLevel: d.secondLevel, severity: null, source: 'api' };
    }

    async function lookup(ref, id) {
      var c = conn();
      if (!c) return fail('not-connected', 'Not connected to an IBM i.');
      if (mode !== 'api') {
        try {
          var r = await sqlMessages(c, ref, id);
          mode = 'sql';
          var m = r.messages[0];
          if (!m) return fail('not-found', 'Message ' + id + ' is not in ' + ref.library + '/' + ref.name + '.');
          return { ok: true, id: m.id, library: r.library, text: m.text, secondLevel: m.secondLevel, severity: m.severity, source: 'sql' };
        } catch (e) {
          if (mode === 'sql' || !isMissingViewError(errText(e))) return fail('error', 'Message lookup failed: ' + errText(e));
          mode = 'api';
        }
      }
      try {
        return await apiMessage(c, ref, id);
      } catch (e2) {
        return fail('error', 'QMHRTVM failed: ' + errText(e2));
      }
    }

    /** Text for one ID in a message file. Resolves to the message or { ok: false, code, error }. */
    async function getText(id, msgf) {
      try {
        var mid = normalizeMessageId(id);
        if (!mid) return fail('bad-id', 'Not a valid message ID: ' + JSON.stringify(id) + '.');
        var ref = parseMessageFileRef(msgf);
        if (!ref) return fail('bad-msgf', 'Not a valid message file: ' + JSON.stringify(msgf) + '.');
        var key = ref.library + '/' + ref.name + ':' + mid;
        if (Object.prototype.hasOwnProperty.call(textCache, key)) {
          return Object.assign({ cached: true }, textCache[key]);
        }
        if (!inflight[key]) {
          inflight[key] = lookup(ref, mid).then(function (res) {
            delete inflight[key];
            if (res.ok) textCache[key] = res;
            return res;
          });
        }
        var out = await inflight[key];
        return out.ok ? Object.assign({ cached: false }, out) : out;
      } catch (e) {
        return fail('error', errText(e));
      }
    }

    /** Every message in a file (the picker). { ok, library, messages: [{id, text, secondLevel, severity}] }. */
    async function listMessages(msgf) {
      try {
        var ref = parseMessageFileRef(msgf);
        if (!ref) return fail('bad-msgf', 'Not a valid message file: ' + JSON.stringify(msgf) + '.');
        var key = ref.library + '/' + ref.name;
        if (Object.prototype.hasOwnProperty.call(listCache, key)) {
          return { ok: true, cached: true, library: listCache[key].library, messages: listCache[key].messages, source: 'sql' };
        }
        var c = conn();
        if (!c) return fail('not-connected', 'Not connected to an IBM i.');
        if (mode === 'api') return fail('unsupported', 'This release has no QSYS2.MESSAGE_FILE_DATA view (IBM i 7.3 TR6 or later), so message files cannot be listed.');
        var r;
        try {
          r = await sqlMessages(c, ref, null);
        } catch (e) {
          if (mode !== 'sql' && isMissingViewError(errText(e))) {
            mode = 'api';
            return fail('unsupported', 'This release has no QSYS2.MESSAGE_FILE_DATA view (IBM i 7.3 TR6 or later), so message files cannot be listed.');
          }
          return fail('error', 'Message list failed: ' + errText(e));
        }
        mode = 'sql';
        if (!r.messages.length) return fail('not-found', 'Message file ' + ref.library + '/' + ref.name + ' was not found or has no messages.');
        var messages = r.messages.map(function (m) { return { id: m.id, text: m.text, secondLevel: m.secondLevel, severity: m.severity }; });
        listCache[key] = { library: r.library, messages: messages };
        messages.forEach(function (m) {
          textCache[ref.library + '/' + ref.name + ':' + m.id] = { ok: true, id: m.id, library: r.library, text: m.text, secondLevel: m.secondLevel, severity: m.severity, source: 'sql' };
        });
        return { ok: true, cached: false, library: r.library, messages: messages, source: 'sql' };
      } catch (e2) {
        return fail('error', errText(e2));
      }
    }

    /** Forget cached text. With a message file: only that file (after ADDMSGD / CHGMSGD). No argument: everything, including the library list. */
    function clear(msgf) {
      if (msgf === undefined) { textCache = {}; listCache = {}; libl = null; return; }
      var ref = parseMessageFileRef(msgf);
      if (!ref) return;
      var prefix = ref.library + '/' + ref.name;
      delete listCache[prefix];
      Object.keys(textCache).forEach(function (k) { if (k.indexOf(prefix + ':') === 0) delete textCache[k]; });
    }

    return {
      getText: getText,
      listMessages: listMessages,
      clear: clear,
      /** 'sql', 'api' or 'unknown' (nothing asked yet). */
      mode: function () { return mode; },
      /** The dump procedure's state, for tests. */
      resetForTests: function () { mode = 'unknown'; libl = null; textCache = {}; listCache = {}; apiReady = false; }
    };
  }

  return {
    LIBRARY: LIBRARY,
    RTVM0100: RTVM0100,
    normalizeMessageId: normalizeMessageId,
    parseMessageFileRef: parseMessageFileRef,
    libraryListSql: libraryListSql,
    messageSql: messageSql,
    rowToMessage: rowToMessage,
    isMissingViewError: isMissingViewError,
    wrapperSql: wrapperSql,
    dumpProcedureSql: dumpProcedureSql,
    callSql: callSql,
    splitDumpRows: splitDumpRows,
    decodeErrorCode: decodeErrorCode,
    decodeRtvm0100: decodeRtvm0100,
    buildRtvm0100: buildRtvm0100,
    createResolver: createResolver
  };
});
