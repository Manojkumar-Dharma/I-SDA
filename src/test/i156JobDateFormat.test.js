/**
 * i156JobDateFormat.test.js
 *
 * Task I-156 - the DATE keyword's preview follows the connected IBM i job's
 * DATFMT / DATSEP, read with QUSRJOBI format JOBI0400.
 *
 * Verifies:
 *  1. the JOBI0400 layout the decoder relies on (offsets from IBM's Retrieve
 *     Job Information API table) and decodeJobi0400 over synthetic receivers:
 *     every format and separator, short / truncated / unknown values.
 *  2. fetchJobDateFormat against a fake Code for i connection: the objects it
 *     creates, the call it makes, once-per-session setup, every failure path
 *     returning { ok: false } (never throwing).
 *  3. the spec: normalizeJobDate, digit counts (Julian 5 / 7), digit order per
 *     DATFMT, the DATSEP character for EDTCDE(Y), slashes for W, Julian
 *     patterns yy/ddd, and the preview never longer than the box.
 *  4. the engine: setJobDateFormat / getJobDateFormat and the resolved width
 *     and text; and the real webview: a 'jobDateFormat' message re-renders the
 *     DATE box.
 *
 * Run with: node src/test/i156JobDateFormat.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const KeywordSpec = require(path.join(__dirname, '../keywordSpec.js'));
const DspfEngine = require(path.join(__dirname, '../dspfEngine.js'));
const JobDateFormat = require(path.join(__dirname, '../jobDateFormat.js'));
const DspfParser = require('../../dist/dspfParser.js');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');

const J = (f, s) => ({ dateFormat: f, dateSeparator: s });
const at = (y, mo, d, h, mi, s) => new Date(y, mo - 1, d, h, mi, s);
const oct3 = at(2026, 10, 3, 11, 6, 45), mar5 = at(2026, 3, 5, 2, 3, 4);

console.log('\n1. JOBI0400 decoder');
{
  check('offsets: Date separator 218, Date format 219, Time separator 299', JobDateFormat.OFFSETS.dateSeparator === 218 && JobDateFormat.OFFSETS.dateFormat === 219 && JobDateFormat.OFFSETS.timeSeparator === 299);
  check('the Date separator CHAR(1) sits right before the Date format CHAR(4) (IBM\'s table: 218 then 219)', JobDateFormat.OFFSETS.dateFormat - JobDateFormat.OFFSETS.dateSeparator === 1);
  check('the four formats and the five separators', JobDateFormat.DATE_FORMATS.join() === '*MDY,*DMY,*YMD,*JUL' && JobDateFormat.DATE_SEPARATORS.join('') === '/-.,' + ' ');
  JobDateFormat.DATE_FORMATS.forEach((f) => JobDateFormat.DATE_SEPARATORS.forEach((s) => {
    const r = JobDateFormat.decodeJobi0400(JobDateFormat.buildJobi0400(f, s));
    check('decodes ' + f + ' with ' + JSON.stringify(s), r.ok && r.dateFormat === f && r.dateSeparator === s);
  }));
  check('the time separator is read too (colon)', JobDateFormat.decodeJobi0400(JobDateFormat.buildJobi0400('*MDY', '/', ':')).timeSeparator === ':');
  check('a receiver longer than the format (ASP group entries after the fixed part) decodes', JobDateFormat.decodeJobi0400(JobDateFormat.buildJobi0400('*YMD', '-', ':', 1024)).ok);
  check('a receiver too short to hold the date format is an error, not a guess', !JobDateFormat.decodeJobi0400(new Uint8Array(100)).ok && /too short/.test(JobDateFormat.decodeJobi0400(new Uint8Array(100)).error));
  check('exactly 223 bytes (offset 219 + 4) is enough', JobDateFormat.decodeJobi0400(JobDateFormat.buildJobi0400('*DMY', '/', ':', 223)).ok);
  check('222 bytes is not', !JobDateFormat.decodeJobi0400(JobDateFormat.buildJobi0400('*DMY', '/', ':', 222)).ok);
  const small = JobDateFormat.buildJobi0400('*MDY', '/'); small[3] = 8; small[2] = 0;
  check('"bytes returned" smaller than the date fields (a job that is gone) is an error', !JobDateFormat.decodeJobi0400(small).ok && /returned only 8/.test(JobDateFormat.decodeJobi0400(small).error));
  check('a format the job cannot have (*ISO) is an error naming the value', /\*ISO/.test(JobDateFormat.decodeJobi0400(JobDateFormat.buildJobi0400('*ISO', '/')).error));
  const bad = JobDateFormat.buildJobi0400('*MDY', '/'); bad[218] = 0x7c;
  check('an unrecognised separator byte is an error', !JobDateFormat.decodeJobi0400(bad).ok);
  const junk = JobDateFormat.buildJobi0400('*MDY', '/'); junk[220] = 0x01;
  check('non-text format bytes are an error', !JobDateFormat.decodeJobi0400(junk).ok);
  check('null / undefined / no length are errors, never throws', [null, undefined, {}, 5].every((x) => JobDateFormat.decodeJobi0400(x).ok === false));
  check('plain arrays of numbers decode like a Uint8Array', JobDateFormat.decodeJobi0400(Array.from(JobDateFormat.buildJobi0400('*JUL', '.'))).dateFormat === '*JUL');
  check('the SQL wrapper declares the six QUSRJOBI parameters in IBM\'s order', /P_RCV[\s\S]*P_RCVLEN[\s\S]*P_FMT[\s\S]*P_JOB CHAR\(26\)[\s\S]*P_INTID CHAR\(16\)[\s\S]*P_ERR/.test(JobDateFormat.wrapperSql()) && /QSYS\/QUSRJOBI/.test(JobDateFormat.wrapperSql()));
  check('the dump procedure asks for JOBI0400 about the job "*" with a blank internal id', /JOBI0400/.test(JobDateFormat.dumpProcedureSql()) && /V_JOB\s+CHAR\(26\) DEFAULT '\*'/.test(JobDateFormat.dumpProcedureSql()) && /V_INTID\s+CHAR\(16\) DEFAULT ' '/.test(JobDateFormat.dumpProcedureSql()));
  check('and returns enough rows to cover offset 299', /N < 4/.test(JobDateFormat.dumpProcedureSql()) && 5 * 64 > 299);
}

console.log('\n2. fetchJobDateFormat against a fake connection');
(async () => {
  function hexRows(bytes) {
    const rows = [];
    for (let off = 0; off < 320; off += 64) {
      rows.push({ K: 'RCV', OFFSET: off, HEXDATA: Array.from(bytes.slice(off, off + 64)).map((b) => (b < 16 ? '0' : '') + b.toString(16).toUpperCase()).join('') });
    }
    return rows;
  }
  function fake(opts) {
    const calls = { sql: [], cmd: [] };
    const o = opts || {};
    return {
      calls,
      async runSQL(sql) {
        calls.sql.push(sql);
        if (o.sqlThrows && sql.indexOf(o.sqlThrows) >= 0) throw new Error('boom');
        if (/FROM QSYS2\.SYSSCHEMAS/.test(sql)) return o.libraryExists ? [{ X: 1 }] : [];
        if (/CALL ISDATEMP\.JOBDATE_DUMP/.test(sql)) return o.rows !== undefined ? o.rows : hexRows(JobDateFormat.buildJobi0400(o.format || '*DMY', o.sep || '.'));
        return [];
      },
      async runCommand(c) { calls.cmd.push(c.command); return o.crtlib || { code: 0 }; },
    };
  }
  JobDateFormat.resetForTests();
  let c = fake();
  let r = await JobDateFormat.fetchJobDateFormat(c);
  check('success: *DMY with "."', r.ok && r.dateFormat === '*DMY' && r.dateSeparator === '.');
  check('it checked for the library, created it, then both procedures, then called the dump', c.calls.cmd.length === 1 && /^CRTLIB LIB\(ISDATEMP\)/.test(c.calls.cmd[0]) && c.calls.sql.length === 4 && /QUSRJOBI_X/.test(c.calls.sql[1]) && /JOBDATE_DUMP \(\)/.test(c.calls.sql[2]) && /^CALL ISDATEMP\.JOBDATE_DUMP\(\)/.test(c.calls.sql[3]));
  c.calls.sql.length = 0; c.calls.cmd.length = 0;
  r = await JobDateFormat.fetchJobDateFormat(c);
  check('a second call in the same session only makes the call (setup is remembered)', r.ok && c.calls.cmd.length === 0 && c.calls.sql.length === 1 && /^CALL /.test(c.calls.sql[0]));
  JobDateFormat.resetForTests();
  c = fake({ libraryExists: true });
  r = await JobDateFormat.fetchJobDateFormat(c);
  check('an existing library is not created again', r.ok && c.calls.cmd.length === 0);
  JobDateFormat.resetForTests();
  c = fake({ crtlib: { code: 1, stderr: 'CPF2111 Library ISDATEMP already exists.' } });
  check('CPF2111 (a race with another session) is not an error', (await JobDateFormat.fetchJobDateFormat(c)).ok);
  JobDateFormat.resetForTests();
  c = fake({ crtlib: { code: 1, stderr: 'CPF2182 Not authorized to library.' } });
  r = await JobDateFormat.fetchJobDateFormat(c);
  check('any other CRTLIB failure is reported, and the call is never made', !r.ok && /Could not create library ISDATEMP/.test(r.error) && !c.calls.sql.some((s) => /^CALL /.test(s)));
  JobDateFormat.resetForTests();
  r = await JobDateFormat.fetchJobDateFormat(fake({ sqlThrows: 'CREATE OR REPLACE PROCEDURE ISDATEMP.QUSRJOBI_X' }));
  check('a failing CREATE PROCEDURE is reported, not thrown', !r.ok && /Could not create ISDATEMP\.JOBDATE_DUMP/.test(r.error));
  JobDateFormat.resetForTests();
  r = await JobDateFormat.fetchJobDateFormat(fake({ sqlThrows: 'SYSSCHEMAS' }));
  check('a failing library check is reported, not thrown', !r.ok && /Could not check\/create library/.test(r.error));
  JobDateFormat.resetForTests();
  r = await JobDateFormat.fetchJobDateFormat(fake({ sqlThrows: 'CALL ISDATEMP.JOBDATE_DUMP' }));
  check('a failing CALL is reported, not thrown', !r.ok && /QUSRJOBI failed/.test(r.error));
  JobDateFormat.resetForTests();
  r = await JobDateFormat.fetchJobDateFormat(fake({ rows: [] }));
  check('no rows back is reported', !r.ok && /no data/.test(r.error));
  JobDateFormat.resetForTests();
  r = await JobDateFormat.fetchJobDateFormat(fake({ format: '*ISO' }));
  check('a receiver that decodes to an unusable format is reported', !r.ok && /\*ISO/.test(r.error));
  // a host that shares the ISDATEMP library step (extension.ts does, with QDBRTVFD)
  JobDateFormat.resetForTests();
  let hookCalls = 0;
  c = fake();
  r = await JobDateFormat.fetchJobDateFormat(c, { ensureLibrary: async () => { hookCalls++; return null; } });
  check('with a shared library step the fetch does not check or create the library itself', r.ok && hookCalls === 1 && c.calls.cmd.length === 0 && !c.calls.sql.some((q) => /SYSSCHEMAS/.test(q)));
  check('and it still creates both procedures and makes the call', c.calls.sql.length === 3 && /QUSRJOBI_X/.test(c.calls.sql[0]) && /^CALL ISDATEMP\.JOBDATE_DUMP/.test(c.calls.sql[2]));
  JobDateFormat.resetForTests();
  c = fake();
  r = await JobDateFormat.fetchJobDateFormat(c, { ensureLibrary: async () => 'Could not create library ISDATEMP: no authority' });
  check('an error from the shared library step is returned and nothing else is attempted', !r.ok && /no authority/.test(r.error) && c.calls.sql.length === 0);
  JobDateFormat.resetForTests();
  c = fake();
  r = await JobDateFormat.fetchJobDateFormat(c, {});
  check('empty hooks fall back to the standalone library step', r.ok && c.calls.cmd.length === 1);
  check('no connection / a connection without runSQL is reported', (await JobDateFormat.fetchJobDateFormat(null)).ok === false && (await JobDateFormat.fetchJobDateFormat({})).ok === false);
  JobDateFormat.resetForTests();
  r = await JobDateFormat.fetchJobDateFormat(fake({ rows: [{ k: 'RCV', offset: 0, hexdata: '00' }] }));
  check('lower-case column names from the driver are tolerated (not a crash)', r.ok === false);

  console.log('\n3. the spec');
  {
    check('normalizeJobDate accepts the four formats, with or without the asterisk, any case', ['*MDY', 'MDY', 'mdy', '*dmy', '*YMD', '*jul'].every((f) => !!KeywordSpec.normalizeJobDate(J(f, '/'))));
    check('it rejects *ISO, junk, an empty object, null, a bad separator', [J('*ISO', '/'), J('x', '/'), {}, null, undefined, 5, J('*MDY', 'x')].every((v) => KeywordSpec.normalizeJobDate(v) === null));
    check('a missing separator is the documented default slash', KeywordSpec.normalizeJobDate({ dateFormat: '*MDY' }).dateSeparator === '/');
    check('the four separators IBM lists, plus blank', ['/', '-', '.', ',', ' '].every((s) => !!KeywordSpec.normalizeJobDate(J('*MDY', s))));
    check('prototype keys are not formats', ['constructor', '__proto__', 'toString'].every((f) => KeywordSpec.normalizeJobDate(J(f, '/')) === null));
    check('digits: MDY/DMY/YMD 6 and 8, JUL 5 and 7', KeywordSpec.systemValueDigits('DATE', '', J('*MDY', '/')) === 6 && KeywordSpec.systemValueDigits('DATE', '*YY', J('*DMY', '/')) === 8 && KeywordSpec.systemValueDigits('DATE', '', J('*JUL', '/')) === 5 && KeywordSpec.systemValueDigits('DATE', '*YY', J('*JUL', '/')) === 7);
    check('digits without a job date are the design-time 6 / 8', KeywordSpec.systemValueDigits('DATE', '') === 6 && KeywordSpec.systemValueDigits('DATE', '*YY') === 8);
    const w = (o) => KeywordSpec.systemValueConstantWidth('DATE', o);
    const p = (o, when) => KeywordSpec.systemValuePreviewText('DATE', o, when || oct3);
    check('widths: bare digits per format', w({ jobDate: J('*MDY', '/') }) === 6 && w({ jobDate: J('*JUL', '/') }) === 5 && w({ jobDate: J('*JUL', '/'), dateParameters: '*YY' }) === 7);
    check('widths: EDTCDE(Y) - MDY 8, JUL yy/ddd 6 (the DATFMT table\'s own length), JUL *YY yyyy/ddd 8', w({ editCode: 'Y', jobDate: J('*MDY', '/') }) === 8 && w({ editCode: 'Y', jobDate: J('*JUL', '/') }) === 6 && w({ editCode: 'Y', jobDate: J('*JUL', '/'), dateParameters: '*YY' }) === 8);
    check('"yy/ddd" and its length 6 are in the reference', /Julian\s+\*JUL\s+yy\/ddd\s+6/.test(fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/DDS_Keyword_V7r6.txt'), 'utf8')));
    check('widths: EDTCDE(W) is the same for every job format of the same digit count', w({ editCode: 'W', dateParameters: '*YY', jobDate: J('*DMY', '/') }) === 10 && w({ editCode: 'W', dateParameters: '*YY', jobDate: J('*MDY', '/') }) === 10);
    check('an unusable jobDate is ignored (the design-time widths)', w({ jobDate: J('*ISO', '/') }) === 6 && w({ jobDate: 'x' }) === 6);
    check('preview digit order: MDY 100326, DMY 031026, YMD 261003', p({ jobDate: J('*MDY', '/') }) === '100326' && p({ jobDate: J('*DMY', '/') }) === '031026' && p({ jobDate: J('*YMD', '/') }) === '261003');
    check('preview Julian: yyddd (Oct 3 2026 is day 276), Mar 5 is day 064, *YY gives yyyyddd', p({ jobDate: J('*JUL', '/') }) === '26276' && p({ jobDate: J('*JUL', '/') }, mar5) === '26064' && p({ jobDate: J('*JUL', '/'), dateParameters: '*YY' }) === '2026276');
    check('Julian day of year: Jan 1 is 001, Dec 31 2026 is 365, Dec 31 2028 (leap) is 366', p({ jobDate: J('*JUL', '/') }, at(2026, 1, 1, 0, 0, 0)) === '26001' && p({ jobDate: J('*JUL', '/') }, at(2026, 12, 31, 0, 0, 0)) === '26365' && p({ jobDate: J('*JUL', '/') }, at(2028, 12, 31, 0, 0, 0)) === '28366');
    check('EDTCDE(Y) uses the job\'s DATSEP: "." for DMY, "-" for YMD, "," for MDY, blank', p({ editCode: 'Y', jobDate: J('*DMY', '.') }) === ' 3.10.26' && p({ editCode: 'Y', jobDate: J('*YMD', '-') }) === '26-10-03' && p({ editCode: 'Y', jobDate: J('*MDY', ',') }) === '10,03,26' && p({ editCode: 'Y', jobDate: J('*MDY', ' ') }) === '10 03 26');
    check('EDTCDE(Y) with no job date keeps the slash default', p({ editCode: 'Y' }) === '10/03/26');
    check('EDTCDE(Y) Julian: 26/276 and 2026/276', p({ editCode: 'Y', jobDate: J('*JUL', '/') }) === '26/276' && p({ editCode: 'Y', dateParameters: '*YY', jobDate: J('*JUL', '/') }) === '2026/276');
    check('EDTCDE(Y) Julian keeps IBM\'s zero suppression: year 03 -> " 3/276"', p({ editCode: 'Y', jobDate: J('*JUL', '/') }, at(2003, 10, 3, 0, 0, 0)) === ' 3/276');
    check('EDTCDE(W) always inserts slashes whatever DATSEP is', p({ editCode: 'W', dateParameters: '*YY', jobDate: J('*YMD', '.') }) === '2026/10/03');
    check('EDTCDE(W) with a non-YMD job date shows IBM\'s own caveat (digits in job order): DMY', p({ editCode: 'W', dateParameters: '*YY', jobDate: J('*DMY', '/') }) === ' 310/20/26');
    check('without a job date W still previews YMD (the design-time assumption)', p({ editCode: 'W', dateParameters: '*YY' }) === '2026/10/03');
    check('TIME is unaffected by a job date', KeywordSpec.systemValuePreviewText('TIME', { jobDate: J('*DMY', '.') }, oct3) === '11:06:45' && KeywordSpec.systemValueConstantWidth('TIME', { jobDate: J('*JUL', '.') }) === 8);
    let worst = null;
    const combos = [{}, { dateParameters: '*YY' }, { editCode: 'Y' }, { editCode: 'Y', dateParameters: '*YY' }, { editCode: 'W' }, { editCode: 'W', dateParameters: '*YY' }, { editCode: '5' }, { editCode: 'Z' }];
    const jobs = [undefined, J('*MDY', '/'), J('*DMY', '.'), J('*YMD', '-'), J('*JUL', ','), J('*JUL', ' ')];
    for (const jd of jobs) for (let m = 1; m <= 12; m++) for (const d of [1, 9, 10, 28]) for (const o0 of combos) {
      const o = Object.assign({}, o0, { jobDate: jd });
      const when = at(2026, m, d, m, d, 59), txt = p(o, when), width = w(o);
      if (txt.length > width) worst = worst || (JSON.stringify(o) + ' ' + JSON.stringify(txt) + ' > ' + width);
    }
    check('the preview is never longer than the field is drawn, for every job format (' + (worst || 'all combinations') + ')', worst === null);
  }

  console.log('\n4. the engine and the real webview');
  {
    function resolve(kws) {
      const src = ['     A          R REC1', '     A                                  2  2' + kws[0]]
        .concat(kws.slice(1).map((k) => '     A                                      ' + k)).join('\n') + '\n     A                                  2 40\'AFTER\'\n';
      const r = DspfEngine.resolveScreen(DspfParser.parseDspf(src), 'REC1');
      return { len: r.fields[0].length, text: r.fields[0].text };
    }
    DspfEngine.setJobDateFormat(null);
    check('default: no job date', DspfEngine.getJobDateFormat() === null);
    let a = resolve(['DATE']);
    check('default DATE is 6 wide, 6 digits (MDY)', a.len === 6 && /^\d{6}$/.test(a.text));
    DspfEngine.setJobDateFormat(J('*JUL', '/'));
    check('getJobDateFormat returns a copy of what was set', DspfEngine.getJobDateFormat().dateFormat === '*JUL' && (DspfEngine.getJobDateFormat().dateFormat = 'x') && DspfEngine.getJobDateFormat().dateFormat === '*JUL');
    a = resolve(['DATE']);
    check('Julian job: DATE is 5 wide, yyddd', a.len === 5 && /^\d{5}$/.test(a.text));
    a = resolve(['DATE(*YY)', 'EDTCDE(Y)']);
    check('Julian job: DATE(*YY) EDTCDE(Y) is 8 wide, yyyy/ddd', a.len === 8 && /^\d{4}\/\d{3}$/.test(a.text));
    DspfEngine.setJobDateFormat(J('*DMY', '.'));
    a = resolve(['DATE', 'EDTCDE(Y)']);
    check('DMY with "." : EDTCDE(Y) is 8 wide with dots', a.len === 8 && /^[ \d]\d\.\d\d\.\d\d$/.test(a.text));
    check('a bad value clears it (the engine returns null)', DspfEngine.setJobDateFormat({ dateFormat: '*ISO' }) === null && DspfEngine.getJobDateFormat() === null);
    a = resolve(['DATE']);
    check('and the design-time default is back', a.len === 6);
    const num = DspfEngine.resolveScreen(DspfParser.parseDspf('     A          R R1\n     A            N6             6S 0B  2  2EDTCDE(Y)\n'), 'R1').fields[0].length;
    DspfEngine.setJobDateFormat(J('*JUL', '/'));
    check('a numeric field is never affected by the job date (it is not a date)', DspfEngine.resolveScreen(DspfParser.parseDspf('     A          R R1\n     A            N6             6S 0B  2  2EDTCDE(Y)\n'), 'R1').fields[0].length === num);
    DspfEngine.setJobDateFormat(null);

    // the webview
    const SRC = ['     A          R RECORD1', '     A                                  2  2DATE', '     A                                  3  2DATE(*YY)', '     A                                      EDTCDE(Y)'].join('\n') + '\n';
    const dom = newWebviewDom(webviewHtml('vscode-webview://fake', 'n1', SRC, 'I156.DSPF'), {
      beforeParse(w) {
        w.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: () => {} });
        w.alert = () => {};
        w.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
      },
    });
    await new Promise((res) => setTimeout(res, 1200));
    const doc = dom.window.document;
    const boxes = () => Array.from(doc.querySelectorAll('.dspf-field')).map((b) => b.textContent.trim());
    let t = boxes();
    check('before any message: DATE six digits, DATE(*YY) EDTCDE(Y) mm/dd/yyyy', /^\d{6}$/.test(t[0]) && /^\d\d\/\d\d\/\d{4}$/.test(t[1].replace(/^(?=\d\/)/, '0')));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'jobDateFormat', ok: true, dateFormat: '*JUL', dateSeparator: '.' } }));
    t = boxes();
    check('after a Julian job date arrives the boxes re-render: yyddd and yyyy.ddd', /^\d{5}$/.test(t[0]) && /^\d{4}\.\d{3}$/.test(t[1]));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'jobDateFormat', ok: true, dateFormat: '*DMY', dateSeparator: '-' } }));
    t = boxes();
    check('then a DMY job with "-": six digits dd mm yy, and dd-mm-yyyy', /^\d{6}$/.test(t[0]) && /^\d\d-\d\d-\d{4}$/.test(t[1].replace(/^(?=\d-)/, '0')));
    dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data: { type: 'jobDateFormat', ok: false } }));
    t = boxes();
    check('an {ok: false} message clears it back to the design-time assumption', /^\d{6}$/.test(t[0]) && /^\d\d\/\d\d\/\d{4}$/.test(t[1].replace(/^(?=\d\/)/, '0')));
  }

  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : 'FAIL - ' + failureCount() + ' check(s) failed'));
  process.exit(failureCount() === 0 ? 0 : 1);
})();
