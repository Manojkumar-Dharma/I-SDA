/**
 * compileListing.js - E2i: get the compile listing of a failed CRTDSPF / CRTS36DSPF back to the
 * extension as text, ready for CompileMessages.parseListing (E2b).
 *
 * Why this is not a one-liner (E2a / E2i findings, IBM i V7R3M0):
 *   - the compile listing is a spooled file named after the FILE BEING COMPILED (TESTDSP), not QSYSPRT;
 *   - it belongs to the job that ran the command (QPADEVxxxx), and the SQL session runs in ANOTHER job, so
 *     `JOB(*)`, `JOB_NAME => '*'` and QTEMP all point at the wrong job. The job is read from
 *     QSYS2.OUTPUT_QUEUE_ENTRIES (columns SPOOLNAME, USER_NAME, CREATED, JOB_NAME as number/user/name,
 *     FILENUM), which lists every output queue, so it does not matter that the listing went to QPRINT/QGPL;
 *   - any temporary file lives in ISDATEMP (shared by every job) and is deleted again, always.
 *
 * Use, around the compile (the caller is E2d):
 *     var mark = await CompileListing.beginCompile(connection);          // { since, user } from the IBM i clock
 *     ... run CRTDSPF ... it failed ...
 *     var r = await CompileListing.fetchCompileListing(connection, { fileName: 'TESTDSP', since: mark.since, user: mark.user }, hooks);
 *     if (r.ok) messages = CompileMessages.parseListing(r.text); else fall back to the command text.
 *
 * `connection` is the Code for i connection used by jobDateFormat.js: runSQL(sql) -> rows and
 * runCommand({ command, environment }) -> { code, stdout, stderr }. `hooks.ensureLibrary(connection)`
 * (optional) -> null | error string, so the host creates ISDATEMP once for all its users.
 *
 * Never rejects. Every name that is put into a command or an SQL statement is validated first, so nothing the
 * caller or the system returns can add text to a command.
 *
 * NOT YET RUN AGAINST A REAL SYSTEM: the CRTPF record length, the shape of the CPYSPLF output (page breaks, carriage
 * control) and the row key case returned by runSQL are assumptions the tests cover with a fake connection. The
 * parser tolerates page headers either way.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./jobDateFormat.js'));
  } else {
    root.CompileListing = factory(root.JobDateFormat);
  }
})(typeof self !== 'undefined' ? self : this, function (JobDateFormat) {
  'use strict';

  var LIBRARY = 'ISDATEMP';
  var RECORD_LENGTH = 200;
  var NAME_RE = /^[A-Z$#@][A-Z0-9$#@_]{0,9}$/;
  var JOB_RE = /^(\d{6})\/([A-Z$#@][A-Z0-9$#@_]{0,9})\/([A-Z$#@][A-Z0-9$#@_]{0,9})$/;
  var TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})[ T-](\d{2})[:.](\d{2})[:.](\d{2})(?:\.(\d{1,6}))?$/;

  function fail(reason, error, extra) {
    var r = { ok: false, reason: reason, error: error };
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) r[k] = extra[k];
    return r;
  }

  function cleanName(value) {
    if (typeof value !== 'string') return null;
    var n = value.trim().toUpperCase();
    return NAME_RE.test(n) ? n : null;
  }

  /** A timestamp as 'YYYY-MM-DD HH:MM:SS.ffffff', from a string, a Date or null; null when it is not one. */
  function cleanTimestamp(value) {
    if (value instanceof Date && !isNaN(value.getTime())) {
      var iso = value.toISOString();               // YYYY-MM-DDTHH:MM:SS.mmmZ
      return iso.slice(0, 10) + ' ' + iso.slice(11, 19) + '.' + iso.slice(20, 23) + '000';
    }
    if (typeof value !== 'string') return null;
    var m = TIMESTAMP_RE.exec(value.trim());
    if (!m) return null;
    var frac = ((m[5] || '') + '000000').slice(0, 6);
    return m[1] + ' ' + m[2] + ':' + m[3] + ':' + m[4] + '.' + frac;
  }

  /** The value of a row column whatever the case of its key. */
  function pick(row, name) {
    if (!row || typeof row !== 'object') return undefined;
    if (Object.prototype.hasOwnProperty.call(row, name)) return row[name];
    var lower = name.toLowerCase();
    for (var k in row) if (Object.prototype.hasOwnProperty.call(row, k) && k.toLowerCase() === lower) return row[k];
    return undefined;
  }

  var counter = 0;
  /** A work file name that is unique for this process and very likely across sessions: L + 6 + 3 characters. */
  function newWorkFileName() {
    counter = (counter + 1) % 46656;
    var t = Date.now().toString(36).toUpperCase().slice(-6);
    while (t.length < 6) t = '0' + t;
    var c = counter.toString(36).toUpperCase();
    while (c.length < 3) c = '0' + c;
    return 'L' + t + c;
  }

  /**
   * Call this just before the compile. The time comes from the IBM i itself (the spooled file's creation time is
   * on that clock), the user is the SQL session's user. Resolves to { since, user }, each null when unknown.
   */
  async function beginCompile(connection) {
    var result = { since: null, user: null };
    try {
      if (!connection || typeof connection.runSQL !== 'function') return result;
      var rows = await connection.runSQL('SELECT CURRENT TIMESTAMP AS T, CURRENT USER AS U FROM SYSIBM.SYSDUMMY1');
      var row = Array.isArray(rows) ? rows[0] : null;
      result.since = cleanTimestamp(pick(row, 'T'));
      result.user = cleanName(String(pick(row, 'U') === undefined || pick(row, 'U') === null ? '' : pick(row, 'U')));
    } catch (e) { /* unknown is a valid answer */ }
    return result;
  }

  function spoolQuery(fileName, user, since) {
    var where = ["SPOOLNAME = '" + fileName + "'"];
    if (user) where.push("USER_NAME = '" + user + "'");
    if (since) where.push("CREATED >= TIMESTAMP('" + since + "')");
    return 'SELECT JOB_NAME, FILENUM, CREATED FROM QSYS2.OUTPUT_QUEUE_ENTRIES WHERE ' + where.join(' AND ') +
      ' ORDER BY CREATED DESC FETCH FIRST 1 ROW ONLY';
  }

  async function run(connection, command) {
    var r = await connection.runCommand({ command: command, environment: 'ile' });
    var code = r && typeof r.code === 'number' ? r.code : 0;
    return { code: code, text: r ? String(r.stderr || r.stdout || '') : '' };
  }

  /**
   * opts: { fileName, user?, since?, workFile? }  (`since` and `user` from beginCompile; workFile only for tests).
   * Resolves to { ok: true, text, job, fileNumber, created, cleanupError? } or { ok: false, reason, error }, with reason one
   * of badParameter, notConnected, library, notFound, create, copy, read, empty, lookup.
   */
  async function fetchCompileListing(connection, opts, hooks) {
    var workFile = null;
    var created = false;
    var result;
    try {
      if (!connection || typeof connection.runSQL !== 'function' || typeof connection.runCommand !== 'function') {
        return fail('notConnected', 'Not connected to an IBM i.');
      }
      var o = opts || {};
      var fileName = cleanName(o.fileName);
      if (!fileName) return fail('badParameter', 'The compiled file name is not a valid IBM i name.');
      var user = null;
      if (o.user !== undefined && o.user !== null) {
        user = cleanName(o.user);
        if (!user) return fail('badParameter', 'The user name is not a valid IBM i name.');
      }
      var since = null;
      if (o.since !== undefined && o.since !== null) {
        since = cleanTimestamp(o.since);
        if (!since) return fail('badParameter', 'The compile start time is not a valid timestamp.');
      }
      workFile = o.workFile === undefined ? newWorkFileName() : cleanName(o.workFile);
      if (!workFile) return fail('badParameter', 'The work file name is not a valid IBM i name.');

      // 1. which job owns the listing, and which of its spooled files
      var rows;
      try {
        rows = await connection.runSQL(spoolQuery(fileName, user, since));
      } catch (e) {
        return fail('lookup', 'Could not look up the spooled file: ' + e);
      }
      var row = Array.isArray(rows) ? rows[0] : null;
      if (!row) return fail('notFound', 'No spooled file ' + fileName + ' found for this compile.');
      var jobName = String(pick(row, 'JOB_NAME') === undefined || pick(row, 'JOB_NAME') === null ? '' : pick(row, 'JOB_NAME')).trim();
      var fileNumber = Number(pick(row, 'FILENUM'));
      if (!JOB_RE.test(jobName) || !(fileNumber >= 1 && fileNumber <= 999999 && Math.floor(fileNumber) === fileNumber)) {
        return fail('lookup', 'The spooled file entry did not give a usable job name and file number.');
      }

      // 2. the temporary file lives in ISDATEMP, never in QTEMP: this job and the command job do not share QTEMP
      var libraryError = (hooks && typeof hooks.ensureLibrary === 'function')
        ? await hooks.ensureLibrary(connection)
        : (JobDateFormat && typeof JobDateFormat.ensureLibraryStandalone === 'function' ? await JobDateFormat.ensureLibraryStandalone(connection) : null);
      if (libraryError) return fail('library', String(libraryError));

      var made = await run(connection, 'CRTPF FILE(' + LIBRARY + '/' + workFile + ') RCDLEN(' + RECORD_LENGTH + ") SIZE(*NOMAX) TEXT('iSDA compile listing - safe to delete')");
      if (made.code !== 0) return fail('create', 'Could not create ' + LIBRARY + '/' + workFile + ': ' + made.text);
      created = true;

      // 3. copy the spooled file out of the compile's job; JOB(...) is the job found above, never JOB(*)
      var copied = await run(connection, 'CPYSPLF FILE(' + fileName + ') TOFILE(' + LIBRARY + '/' + workFile + ') JOB(' + jobName + ') SPLNBR(' + fileNumber + ') MBROPT(*REPLACE)');
      if (copied.code !== 0) return fail('copy', 'Could not copy the compile listing: ' + copied.text);

      // 4. read it in the SQL job, in record order
      var lines;
      try {
        var data = await connection.runSQL('SELECT T.* FROM ' + LIBRARY + '.' + workFile + ' T ORDER BY RRN(T)');
        lines = (Array.isArray(data) ? data : []).map(function (r) {
          var value = null;
          if (r && typeof r === 'object') { for (var k in r) if (Object.prototype.hasOwnProperty.call(r, k)) { value = r[k]; break; } }
          return value === null || value === undefined ? '' : String(value).replace(/\s+$/, '');
        });
      } catch (e) {
        return fail('read', 'Could not read the compile listing: ' + e);
      }
      if (lines.length === 0 || lines.every(function (l) { return l === ''; })) return fail('empty', 'The compile listing was empty.');

      result = { ok: true, text: lines.join('\n'), job: jobName, fileNumber: fileNumber, created: cleanTimestamp(String(pick(row, 'CREATED') === undefined || pick(row, 'CREATED') === null ? '' : pick(row, 'CREATED'))) };
      return result;
    } catch (err) {
      return fail('lookup', 'The compile listing could not be fetched: ' + err);
    } finally {
      // the work file is dropped on every path that created it, and a failure to drop it never changes the result
      if (created && workFile) {
        try {
          var dropped = await run(connection, 'DLTF FILE(' + LIBRARY + '/' + workFile + ')');
          if (dropped.code !== 0 && result) result.cleanupError = 'Could not delete ' + LIBRARY + '/' + workFile + ': ' + dropped.text;
        } catch (e) {
          if (result) result.cleanupError = 'Could not delete ' + LIBRARY + '/' + workFile + ': ' + e;
        }
      }
    }
  }

  return {
    LIBRARY: LIBRARY,
    RECORD_LENGTH: RECORD_LENGTH,
    beginCompile: beginCompile,
    fetchCompileListing: fetchCompileListing,
    spoolQuery: spoolQuery,
    newWorkFileName: newWorkFileName
  };
});
