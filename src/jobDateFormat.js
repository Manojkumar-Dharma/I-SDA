/**
 * jobDateFormat.js - Task I-156: the connected IBM i job's date format and
 * date separator, read with QUSRJOBI format JOBI0400, so the DATE keyword's
 * design-time preview can follow the job attributes IBM says it follows
 * ("the job attribute DATFMT determines the order of the month, day, and
 * year ... DATSEP can be a slash, dash, period, or comma",
 * DDS_Keyword_V7r6.txt, DATE keyword).
 *
 * JOBI0400 (IBM i 7.3 Knowledge Center, Retrieve Job Information API) is the
 * job-attribute format; JOBI0200 is "WRKACTJOB information" and carries
 * neither field. Offsets in the receiver (decimal, from byte 0):
 *    0  BINARY(4)  bytes returned        4  BINARY(4)  bytes available
 *  218  CHAR(1)    Date separator      219  CHAR(4)    Date format ('*MDY' ...)
 *  299  CHAR(1)    Time separator
 * Character fields are in the job's EBCDIC code page; everything decoded here
 * ('*', letters, '/', '-', '.', ',', ':', blank) is in the invariant character set
 * every EBCDIC code page agrees on, so CCSID 037 decodes it correctly.
 *
 * The host (extension.ts) reaches the API the same way it reaches QDBRTVFD for
 * Task I-116: a CL-language external SQL procedure in the ISDATEMP library
 * wraps QSYS/QUSRJOBI (a direct SQL CALL of the API does not work - see
 * extension.ts, ensureIsdaTempQdbrtvfdProcedure), and a second procedure
 * returns the receiver as hex rows. fetchJobDateFormat() does that against any
 * object with runSQL() / runCommand() (Code for i's connection), so it is
 * testable with a fake. It never throws.
 *
 * The qualified job name '*' is the job the call runs in - the SQL server job
 * Code for i holds - not the job the finished screen will run in. Its
 * attributes come from the same user profile / job description / system
 * values, so it is a good proxy, not a guarantee; callers should say so.
 *
 * Plain dependency-free JS (UMD), same style as qdbrtvfdParser.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./qdbrtvfdParser.js'));
  } else {
    root.JobDateFormat = factory(root.QdbrtvfdParser);
  }
})(typeof self !== 'undefined' ? self : this, function (QdbrtvfdParser) {
  'use strict';

  var LIBRARY = 'ISDATEMP';
  var RECEIVER_BYTES = 1024;     // JOBI0400 is 574 bytes plus any ASP group entries
  var HEX_BYTES = 320;           // rows returned: covers offset 299 (time separator)
  var OFFSETS = { bytesReturned: 0, dateSeparator: 218, dateFormat: 219, timeSeparator: 299 };
  var DATE_FORMATS = ['*MDY', '*DMY', '*YMD', '*JUL'];
  var DATE_SEPARATORS = ['/', '-', '.', ',', ' '];

  // The invariant EBCDIC characters this decoder needs (CCSID 037 positions;
  // identical in every national EBCDIC code page).
  var EBCDIC = {
    0x40: ' ', 0x4b: '.', 0x6b: ',', 0x60: '-', 0x61: '/', 0x5c: '*', 0x7a: ':',
    0xc1: 'A', 0xc2: 'B', 0xc3: 'C', 0xc4: 'D', 0xc5: 'E', 0xc6: 'F', 0xc7: 'G', 0xc8: 'H', 0xc9: 'I',
    0xd1: 'J', 0xd2: 'K', 0xd3: 'L', 0xd4: 'M', 0xd5: 'N', 0xd6: 'O', 0xd7: 'P', 0xd8: 'Q', 0xd9: 'R',
    0xe2: 'S', 0xe3: 'T', 0xe4: 'U', 0xe5: 'V', 0xe6: 'W', 0xe7: 'X', 0xe8: 'Y', 0xe9: 'Z'
  };
  function ebcdicChar(byte) { return Object.prototype.hasOwnProperty.call(EBCDIC, byte) ? EBCDIC[byte] : null; }

  /**
   * Decodes a JOBI0400 receiver. `bytes` is a Uint8Array (or array of
   * numbers). Returns { ok: true, dateFormat, dateSeparator, timeSeparator }
   * or { ok: false, error }. A short receiver, a receiver the API says it
   * truncated before the date fields, or a format that is not one of
   * *MDY / *DMY / *YMD / *JUL is an error - never a guess.
   */
  function decodeJobi0400(bytes) {
    if (!bytes || typeof bytes.length !== 'number') return { ok: false, error: 'No JOBI0400 data.' };
    var need = OFFSETS.dateFormat + 4;
    if (bytes.length < need) return { ok: false, error: 'JOBI0400 receiver too short (' + bytes.length + ' bytes, need ' + need + ').' };
    var returned = ((bytes[0] * 16777216) + ((bytes[1] << 16) | (bytes[2] << 8) | bytes[3]));
    if (returned < need) return { ok: false, error: 'QUSRJOBI returned only ' + returned + ' bytes (the job may be unavailable).' };
    var fmt = '';
    for (var i = 0; i < 4; i++) {
      var c = ebcdicChar(bytes[OFFSETS.dateFormat + i]);
      if (c === null) return { ok: false, error: 'Unrecognised JOBI0400 date format bytes.' };
      fmt += c;
    }
    if (DATE_FORMATS.indexOf(fmt) < 0) return { ok: false, error: 'JOBI0400 date format "' + fmt + '" is not one of ' + DATE_FORMATS.join(', ') + '.' };
    var sep = ebcdicChar(bytes[OFFSETS.dateSeparator]);
    if (sep === null || DATE_SEPARATORS.indexOf(sep) < 0) return { ok: false, error: 'JOBI0400 date separator byte 0x' + bytes[OFFSETS.dateSeparator].toString(16) + ' is not one of / - . , or blank.' };
    var tsep = bytes.length > OFFSETS.timeSeparator ? ebcdicChar(bytes[OFFSETS.timeSeparator]) : null;
    return { ok: true, dateFormat: fmt, dateSeparator: sep, timeSeparator: tsep };
  }

  /** Builds a synthetic JOBI0400 receiver (for tests and documentation). */
  function buildJobi0400(dateFormat, dateSeparator, timeSeparator, total) {
    var n = total || 574;
    var b = new Uint8Array(n);
    b[0] = (n >>> 24) & 255; b[1] = (n >>> 16) & 255; b[2] = (n >>> 8) & 255; b[3] = n & 255;
    b[4] = b[0]; b[5] = b[1]; b[6] = b[2]; b[7] = b[3];
    function enc(ch) {
      for (var k in EBCDIC) if (Object.prototype.hasOwnProperty.call(EBCDIC, k) && EBCDIC[k] === ch) return Number(k);
      return 0x40;
    }
    for (var i = 0; i < 4; i++) b[OFFSETS.dateFormat + i] = enc(String(dateFormat).charAt(i));
    b[OFFSETS.dateSeparator] = enc(dateSeparator);
    b[OFFSETS.timeSeparator] = enc(timeSeparator == null ? ':' : timeSeparator);
    return b;
  }

  // ---- the IBM i side ------------------------------------------------------

  function wrapperSql() {
    return 'CREATE OR REPLACE PROCEDURE ' + LIBRARY + '.QUSRJOBI_X (\n' +
      '  INOUT P_RCV CHAR(' + RECEIVER_BYTES + ') FOR BIT DATA,\n' +
      '  IN P_RCVLEN INTEGER,\n' +
      '  IN P_FMT CHAR(8),\n' +
      '  IN P_JOB CHAR(26),\n' +
      '  IN P_INTID CHAR(16),\n' +
      '  INOUT P_ERR CHAR(16) FOR BIT DATA\n' +
      ')\n  EXTERNAL NAME \'QSYS/QUSRJOBI\'\n  LANGUAGE CL\n  PARAMETER STYLE GENERAL';
  }
  function dumpProcedureSql() {
    return 'CREATE OR REPLACE PROCEDURE ' + LIBRARY + '.JOBDATE_DUMP ()\n  LANGUAGE SQL\n  RESULT SETS 1\nBEGIN\n' +
      '  DECLARE V_RCV    CHAR(' + RECEIVER_BYTES + ') FOR BIT DATA;\n' +
      '  DECLARE V_RCVLEN INTEGER DEFAULT ' + RECEIVER_BYTES + ';\n' +
      "  DECLARE V_FMT    CHAR(8)  DEFAULT 'JOBI0400';\n" +
      "  DECLARE V_JOB    CHAR(26) DEFAULT '*';\n" +
      "  DECLARE V_INTID  CHAR(16) DEFAULT ' ';\n" +
      "  DECLARE V_ERR    CHAR(16) FOR BIT DATA DEFAULT X'00000010000000000000000000000000';\n" +
      '  DECLARE C1 CURSOR WITH RETURN FOR\n' +
      '    WITH T(N) AS (VALUES 0 UNION ALL SELECT N + 1 FROM T WHERE N < ' + (HEX_BYTES / 64 - 1) + ')\n' +
      "    SELECT 'RCV' AS K, N * 64 AS OFFSET, HEX(SUBSTR(V_RCV, N * 64 + 1, 64)) AS HEXDATA\n      FROM T ORDER BY N;\n\n" +
      '  CALL ' + LIBRARY + '.QUSRJOBI_X(V_RCV, V_RCVLEN, V_FMT, V_JOB, V_INTID, V_ERR);\n' +
      '  OPEN C1;\nEND';
  }

  var ensured = false;
  function resetForTests() { ensured = false; }

  // The library step on its own (used when the caller does not share one).
  async function ensureLibraryStandalone(connection) {
    try {
      var existing = await connection.runSQL("SELECT 1 AS X FROM QSYS2.SYSSCHEMAS WHERE SCHEMA_NAME = '" + LIBRARY + "'");
      if (!existing || existing.length === 0) {
        var crtlib = await connection.runCommand({
          command: "CRTLIB LIB(" + LIBRARY + ") TEXT('iSDA temporary objects - safe to delete, iSDA recreates it')",
          environment: 'ile'
        });
        if (crtlib && typeof crtlib.code === 'number' && crtlib.code !== 0 && !/CPF2111/.test(String(crtlib.stderr || crtlib.stdout || ''))) {
          return 'Could not create library ' + LIBRARY + ': ' + (crtlib.stderr || crtlib.stdout || 'unknown error');
        }
      }
    } catch (err) {
      return 'Could not check/create library ' + LIBRARY + ': ' + err;
    }
    return null;
  }

  // `hooks.ensureLibrary(connection)` (optional) replaces the library step so
  // a host that already keeps ISDATEMP for other procedures (extension.ts, for
  // QDBRTVFD) checks for and creates it once for all of them.
  async function ensureObjects(connection, hooks) {
    if (ensured) return null;
    var libraryError = (hooks && typeof hooks.ensureLibrary === 'function')
      ? await hooks.ensureLibrary(connection)
      : await ensureLibraryStandalone(connection);
    if (libraryError) return libraryError;
    try {
      await connection.runSQL(wrapperSql());
      await connection.runSQL(dumpProcedureSql());
    } catch (err) {
      return 'Could not create ' + LIBRARY + '.JOBDATE_DUMP: ' + err;
    }
    ensured = true;
    return null;
  }

  /**
   * Reads the connected job's date format and separator. `connection` needs
   * runSQL(sql) -> rows and runCommand({command, environment}); `hooks`
   * (optional) is { ensureLibrary(connection) -> null | error string }. Resolves to
   * { ok: true, dateFormat, dateSeparator, timeSeparator } or
   * { ok: false, error }; never rejects.
   */
  async function fetchJobDateFormat(connection, hooks) {
    try {
      if (!connection || typeof connection.runSQL !== 'function' || typeof connection.runCommand !== 'function') {
        return { ok: false, error: 'Not connected to an IBM i.' };
      }
      var err = await ensureObjects(connection, hooks);
      if (err) return { ok: false, error: err };
      var rows = await connection.runSQL('CALL ' + LIBRARY + '.JOBDATE_DUMP()');
      var bytes = QdbrtvfdParser.bytesFromRows(rows);
      if (!bytes) return { ok: false, error: 'QUSRJOBI returned no data.' };
      return decodeJobi0400(bytes);
    } catch (e) {
      return { ok: false, error: 'QUSRJOBI failed: ' + e };
    }
  }

  return {
    LIBRARY: LIBRARY,
    OFFSETS: OFFSETS,
    DATE_FORMATS: DATE_FORMATS,
    DATE_SEPARATORS: DATE_SEPARATORS,
    decodeJobi0400: decodeJobi0400,
    buildJobi0400: buildJobi0400,
    wrapperSql: wrapperSql,
    dumpProcedureSql: dumpProcedureSql,
    fetchJobDateFormat: fetchJobDateFormat,
    resetForTests: resetForTests
  };
});
