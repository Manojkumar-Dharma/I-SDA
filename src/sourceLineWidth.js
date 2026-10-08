/**
 * sourceLineWidth.js - the longest line a source member can hold.
 *
 * An IBM i source physical file stores a 6-digit sequence number and a 6-digit date in front of each line,
 * so the line itself is the SRCDTA column: 80 characters in the usual QDDSSRC, more in a file created
 * with a longer record length. The Comments panel needs that number so comment text is kept, shown and
 * stored as it is on the system and a warning can say when a line would no longer fit. A local file has
 * no such limit (the caller sends "no limit" for it, not an answer from here).
 *
 * fetchSourceLineMax() reads the SRCDTA length from QSYS2.SYSCOLUMNS through any object with runSQL()
 * (Code for i's connection), so it is testable with a fake. It never throws: a query that fails, or an
 * answer that is not a sensible length, gives the 80-column DDS width.
 *
 * Plain dependency-free JS (UMD), same style as qdbrtvfdParser.js.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.SourceLineWidth = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEFAULT_WIDTH = 80;      // the DDS line width, used whenever the real length cannot be read
  var MAX_SENSIBLE = 32740;    // a record cannot be longer than this; anything above is not a length

  function sqlLiteral(value) {
    return "'" + String(value).replace(/'/g, "''") + "'";
  }

  /** The query for the SRCDTA width of source file `library`/`file` (system names, upper-cased). */
  function srcdtaLengthSql(library, file) {
    return 'SELECT LENGTH FROM QSYS2.SYSCOLUMNS' +
      ' WHERE SYSTEM_TABLE_SCHEMA = ' + sqlLiteral(String(library).toUpperCase()) +
      ' AND SYSTEM_TABLE_NAME = ' + sqlLiteral(String(file).toUpperCase()) +
      " AND COLUMN_NAME = 'SRCDTA'";
  }

  /** The length in the first row, or null when it is missing or not a sensible length. */
  function lengthFromRows(rows) {
    if (!Array.isArray(rows) || rows.length === 0 || !rows[0]) return null;
    var row = rows[0];
    var raw = row.LENGTH !== undefined ? row.LENGTH : row.length;
    var n = typeof raw === 'number' ? raw : parseInt(String(raw), 10);
    if (!isFinite(n) || n !== Math.floor(n) || n < 1 || n > MAX_SENSIBLE) return null;
    return n;
  }

  /**
   * Resolves the longest line of the source file `member` ({library, file}) lives in.
   * Returns { maxLength, source }: source is 'member' when the system answered, 'default' when it could not.
   */
  async function fetchSourceLineMax(connection, member) {
    try {
      if (!connection || typeof connection.runSQL !== 'function' || !member || !member.library || !member.file) {
        return { maxLength: DEFAULT_WIDTH, source: 'default' };
      }
      var rows = await connection.runSQL(srcdtaLengthSql(member.library, member.file));
      var n = lengthFromRows(rows);
      return n === null ? { maxLength: DEFAULT_WIDTH, source: 'default' } : { maxLength: n, source: 'member' };
    } catch (e) {
      return { maxLength: DEFAULT_WIDTH, source: 'default' };
    }
  }

  return {
    DEFAULT_WIDTH: DEFAULT_WIDTH,
    srcdtaLengthSql: srcdtaLengthSql,
    lengthFromRows: lengthFromRows,
    fetchSourceLineMax: fetchSourceLineMax
  };
});
