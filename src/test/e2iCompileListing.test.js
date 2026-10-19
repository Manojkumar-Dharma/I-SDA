/**
 * e2iCompileListing.test.js
 *
 * E2i - fetching the compile listing of a failed compile (src/compileListing.js) with a fake connection that
 * behaves like the V7R3 system in the E2a/E2i probes: the listing is a spooled file named after the compiled
 * file (TESTDSP), owned by the command's job (980099/MANOJK/QPADEV02T6), listed by QSYS2.OUTPUT_QUEUE_ENTRIES
 * (columns JOB_NAME, FILENUM, CREATED, SPOOLNAME, USER_NAME); the SQL session is another job.
 *
 * Verifies:
 *  1. the lookup SQL (file name, user, start time, newest first, one row) and the three commands (CRTPF, CPYSPLF
 *     with the job from the row and never JOB(*), DLTF), all in ISDATEMP and none in QTEMP.
 *  2. the text comes back in record order with trailing blanks removed, and feeds CompileMessages.parseListing
 *     to the same seven messages as the fixture read directly (E2b + E2i end to end).
 *  3. the work file is always deleted: after success, a failed copy, a failed read, an empty listing; not when
 *     it was never created; a failed delete is reported but does not fail the fetch.
 *  4. nothing is created when there is no spooled file; a missing library, a failed CRTPF and an unusable row are
 *     reported with a reason and leave nothing behind.
 *  5. nothing from the caller or the system can add text to a command or statement (names, job, number, time).
 *  6. beginCompile reads the IBM i clock and user; unknown is { null, null }.
 *  7. work file names: unique, valid IBM i names; row key case does not matter; never rejects.
 *
 * Run with: node src/test/e2iCompileListing.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const CompileListing = require(path.join(__dirname, '../compileListing.js'));
const CompileMessages = require(path.join(__dirname, '../compileMessages.js'));

const listing = fs.readFileSync(path.join(__dirname, 'fixtures/compile/testdsp.listing.txt'), 'utf8');
const JOB = '980099/MANOJK/QPADEV02T6';

/** A fake IBM i. `o` switches failures on; everything the extension sends is recorded in `log`. */
function fake(o) {
  o = o || {};
  const log = [];
  const files = {};     // ISDATEMP work files that exist right now
  const conn = {
    log, files,
    runSQL: async (sql) => {
      log.push({ sql });
      if (o.sqlThrows && o.sqlThrows.test(sql)) throw new Error('SQL0204 simulated');
      if (/SYSDUMMY1/.test(sql)) return o.clock === undefined ? [{ T: '2026-10-19-00.51.14.000000', U: 'MANOJK' }] : o.clock;
      if (/QSYS2\.SYSSCHEMAS/.test(sql)) return o.libraryMissing ? [] : [{ X: 1 }];
      if (/OUTPUT_QUEUE_ENTRIES/.test(sql)) {
        if (o.spoolRows !== undefined) return o.spoolRows;
        return [{ JOB_NAME: JOB, FILENUM: 3, CREATED: '2026-10-19-00.51.15.065210' }];
      }
      const m = /FROM ISDATEMP\.(\w+) T ORDER BY RRN\(T\)/.exec(sql);
      if (m) {
        if (!files[m[1]]) throw new Error('SQL0204 work file missing');
        return files[m[1]];
      }
      return [];
    },
    runCommand: async (c) => {
      log.push({ command: c.command, environment: c.environment });
      if (o.commandThrows && o.commandThrows.test(c.command)) throw new Error('command exploded');
      let m;
      if ((m = /^CRTPF FILE\(ISDATEMP\/(\w+)\)/.exec(c.command))) {
        if (o.crtpfFails) return { code: 1, stdout: '', stderr: 'CPF7302 simulated' };
        files[m[1]] = [];
        return { code: 0, stdout: '', stderr: '' };
      }
      if ((m = /^CPYSPLF FILE\((\w+)\) TOFILE\(ISDATEMP\/(\w+)\)/.exec(c.command))) {
        if (o.copyFails) return { code: 1, stdout: '', stderr: 'CPF3303 simulated' };
        files[m[2]] = (o.spoolLines || listing.split('\n')).map((l) => ({ LINE: (l + ' '.repeat(200)).slice(0, 200) }));
        return { code: 0, stdout: '', stderr: '' };
      }
      if ((m = /^DLTF FILE\(ISDATEMP\/(\w+)\)/.exec(c.command))) {
        if (o.dltfFails) return { code: 1, stdout: '', stderr: 'CPF2189 simulated' };
        delete files[m[1]];
        return { code: 0, stdout: '', stderr: '' };
      }
      return { code: 0, stdout: '', stderr: '' };
    }
  };
  return conn;
}
const commands = (c) => c.log.filter((e) => e.command).map((e) => e.command);
const sqls = (c) => c.log.filter((e) => e.sql).map((e) => e.sql);
const OPTS = { fileName: 'TESTDSP', user: 'MANOJK', since: '2026-10-19 00:51:14.000000', workFile: 'LTESTWORK1' };

(async () => {
  // ---- 1 + 2. the happy path ------------------------------------------------------------
  const c1 = fake();
  const r1 = await CompileListing.fetchCompileListing(c1, OPTS);
  check('ok: true with the job, file number and creation time of the spooled file', r1.ok === true && r1.job === JOB && r1.fileNumber === 3 && r1.created === '2026-10-19 00:51:15.065210');
  const lookup = sqls(c1).find((q) => /OUTPUT_QUEUE_ENTRIES/.test(q));
  check('lookup: by SPOOLNAME (the compiled file), USER_NAME, CREATED since the start, newest first, one row',
    /SPOOLNAME = 'TESTDSP'/.test(lookup) && /USER_NAME = 'MANOJK'/.test(lookup) && /CREATED >= TIMESTAMP\('2026-10-19 00:51:14.000000'\)/.test(lookup) && /ORDER BY CREATED DESC FETCH FIRST 1 ROW ONLY$/.test(lookup));
  check('lookup: it is the QSYS2 view that lists every output queue, not one queue', /FROM QSYS2\.OUTPUT_QUEUE_ENTRIES /.test(lookup) && !/QPRINT|QGPL/.test(lookup));
  const cmds = commands(c1);
  check('three commands, in order: CRTPF, CPYSPLF, DLTF', cmds.length === 3 && /^CRTPF /.test(cmds[0]) && /^CPYSPLF /.test(cmds[1]) && /^DLTF /.test(cmds[2]));
  check('CRTPF: work file in ISDATEMP, wide enough, with a text of 50 characters or fewer',
    cmds[0] === "CRTPF FILE(ISDATEMP/LTESTWORK1) RCDLEN(200) SIZE(*NOMAX) TEXT('iSDA compile listing - safe to delete')" && "iSDA compile listing - safe to delete".length <= 50);
  check('CPYSPLF: the compiled file\'s spool, the job from the lookup row, its file number, replace the member',
    cmds[1] === 'CPYSPLF FILE(TESTDSP) TOFILE(ISDATEMP/LTESTWORK1) JOB(' + JOB + ') SPLNBR(3) MBROPT(*REPLACE)');
  check('CPYSPLF names the job explicitly: never JOB(*), and the spool is not called QSYSPRT', !/JOB\(\*\)/.test(cmds[1]) && !/QSYSPRT/.test(cmds[1]));
  check('DLTF removes the work file', cmds[2] === 'DLTF FILE(ISDATEMP/LTESTWORK1)' && Object.keys(c1.files).length === 0);
  check('everything temporary is in ISDATEMP, nothing in QTEMP', cmds.every((x) => /ISDATEMP/.test(x) && !/QTEMP/.test(x)) && sqls(c1).every((x) => !/QTEMP/.test(x)));
  check('every command runs in the ILE environment', c1.log.filter((e) => e.command).every((e) => e.environment === 'ile'));
  check('the text has the 111 listing lines in order, trailing blanks removed', r1.text.split('\n').length === listing.split('\n').length && r1.text.split('\n').every((l) => l === l.replace(/\s+$/, '')) && r1.text.split('\n')[0].startsWith('5770SS1'));
  const parsed = CompileMessages.parseListing(r1.text);
  const direct = CompileMessages.parseListing(listing);
  check('end to end: parseListing of the fetched text gives the same seven messages as the fixture', parsed.messages.length === 7 &&
    parsed.messages.map((m) => [m.msgId, m.sequence, m.ordinal, m.severity].join(':')).join() === direct.messages.map((m) => [m.msgId, m.sequence, m.ordinal, m.severity].join(':')).join());

  // ---- 3. the work file is always deleted -----------------------------------------------
  const cCopy = fake({ copyFails: true });
  const rCopy = await CompileListing.fetchCompileListing(cCopy, OPTS);
  check('a failed CPYSPLF: reason copy, the CPF text is kept, the work file is still deleted', rCopy.ok === false && rCopy.reason === 'copy' && /CPF3303/.test(rCopy.error) && Object.keys(cCopy.files).length === 0 && commands(cCopy).some((x) => /^DLTF /.test(x)));
  const cRead = fake({ sqlThrows: /ORDER BY RRN/ });
  const rRead = await CompileListing.fetchCompileListing(cRead, OPTS);
  check('a failed read: reason read, the work file is still deleted', rRead.ok === false && rRead.reason === 'read' && Object.keys(cRead.files).length === 0);
  const cEmpty = fake({ spoolLines: ['', '   ', ''] });
  const rEmpty = await CompileListing.fetchCompileListing(cEmpty, OPTS);
  check('a listing of only blank lines: reason empty, work file deleted', rEmpty.ok === false && rEmpty.reason === 'empty' && Object.keys(cEmpty.files).length === 0);
  const cNone = fake({ spoolLines: [] });
  const rNone = await CompileListing.fetchCompileListing(cNone, OPTS);
  check('a listing with no records: reason empty', rNone.ok === false && rNone.reason === 'empty');
  const cDlt = fake({ dltfFails: true });
  const rDlt = await CompileListing.fetchCompileListing(cDlt, OPTS);
  check('a failed DLTF is reported as cleanupError but the fetch still succeeds', rDlt.ok === true && /CPF2189/.test(rDlt.cleanupError) && /LTESTWORK1/.test(rDlt.cleanupError));
  const cThrow = fake({ commandThrows: /^CPYSPLF/ });
  const rThrow = await CompileListing.fetchCompileListing(cThrow, OPTS);
  check('a command that throws does not reject and the work file is deleted', rThrow.ok === false && Object.keys(cThrow.files).length === 0);

  // ---- 4. nothing created, or nothing left, on the other failures --------------------------
  const cMiss = fake({ spoolRows: [] });
  const rMiss = await CompileListing.fetchCompileListing(cMiss, OPTS);
  check('no spooled file: reason notFound and not one command was run (nothing was created)', rMiss.ok === false && rMiss.reason === 'notFound' && commands(cMiss).length === 0);
  const cNoView = fake({ sqlThrows: /OUTPUT_QUEUE_ENTRIES/ });
  const rNoView = await CompileListing.fetchCompileListing(cNoView, OPTS);
  check('the lookup view missing or failing: reason lookup, no command run', rNoView.ok === false && rNoView.reason === 'lookup' && commands(cNoView).length === 0);
  const cLib = fake({ libraryMissing: true });
  const rLib = await CompileListing.fetchCompileListing(cLib, OPTS, { ensureLibrary: async () => 'Could not create library ISDATEMP: simulated' });
  check('the ensureLibrary hook replaces the library step; its error stops the fetch with reason library, nothing created',
    rLib.ok === false && rLib.reason === 'library' && /simulated/.test(rLib.error) && commands(cLib).length === 0 && !sqls(cLib).some((q) => /SYSSCHEMAS/.test(q)));
  const cStand = fake({ libraryMissing: true });
  await CompileListing.fetchCompileListing(cStand, OPTS);
  check('without a hook the standalone step creates ISDATEMP once when it is missing', commands(cStand).filter((x) => /^CRTLIB /.test(x)).length === 1 && /TEXT\('iSDA temporary objects - safe to delete'\)/.test(commands(cStand)[0]));
  const cCrt = fake({ crtpfFails: true });
  const rCrt = await CompileListing.fetchCompileListing(cCrt, OPTS);
  check('a failed CRTPF: reason create, and no DLTF for a file that was never made', rCrt.ok === false && rCrt.reason === 'create' && !commands(cCrt).some((x) => /^DLTF /.test(x)));
  const badRows = [[{ JOB_NAME: 'QPADEV02T6', FILENUM: 3 }], [{ JOB_NAME: JOB, FILENUM: 0 }], [{ JOB_NAME: JOB, FILENUM: 'x' }], [{ JOB_NAME: JOB, FILENUM: 1.5 }], [{ JOB_NAME: JOB, FILENUM: 1000000 }], [{ JOB_NAME: null, FILENUM: 1 }], [{}]];
  for (const rows of badRows) {
    const c = fake({ spoolRows: rows });
    const r = await CompileListing.fetchCompileListing(c, OPTS);
    check('an unusable lookup row (' + JSON.stringify(rows[0]) + ') is refused before anything is created', r.ok === false && r.reason === 'lookup' && commands(c).length === 0);
  }

  const cNull = fake({ spoolRows: [null] });
  const rNull = await CompileListing.fetchCompileListing(cNull, OPTS);
  check('a null lookup row counts as no spooled file and creates nothing', rNull.ok === false && rNull.reason === 'notFound' && commands(cNull).length === 0);

  // ---- 5. nothing can add text to a command ------------------------------------------------
  const hostile = [
    { fileName: "TESTDSP') DLTLIB LIB(QSYS) ('", user: 'MANOJK' },
    { fileName: 'TESTDSP', user: "X' OR '1'='1" },
    { fileName: 'TESTDSP', user: 'MANOJK', since: "2026-10-19 00:00:00'); DROP TABLE X; --" },
    { fileName: 'TESTDSP', user: 'MANOJK', workFile: 'A; DLTLIB QGPL' },
    { fileName: '', user: 'MANOJK' }, { fileName: 'TOOLONGNAME1' }, { fileName: '1ABC' }, { fileName: 'AB CD' }, { fileName: null }, {}
  ];
  for (const h of hostile) {
    const c = fake();
    const r = await CompileListing.fetchCompileListing(c, h);
    check('refused with badParameter and nothing sent: ' + JSON.stringify(h).slice(0, 60), r.ok === false && r.reason === 'badParameter' && c.log.length === 0);
  }
  const cJob = fake({ spoolRows: [{ JOB_NAME: JOB + "') DLTLIB (", FILENUM: 3 }] });
  const rJob = await CompileListing.fetchCompileListing(cJob, OPTS);
  check('a job name from the system that carries extra text is not put in a command', rJob.ok === false && commands(cJob).length === 0);
  const cLower = fake();
  const rLower = await CompileListing.fetchCompileListing(cLower, { fileName: 'testdsp', user: 'manojk', since: OPTS.since, workFile: 'ltestwork1' });
  check('lower case names are accepted and sent in upper case', rLower.ok === true && /SPOOLNAME = 'TESTDSP'/.test(sqls(cLower).find((q) => /OUTPUT_QUEUE_ENTRIES/.test(q))) && /FILE\(TESTDSP\)/.test(commands(cLower)[1]));
  const cNoFilter = fake();
  await CompileListing.fetchCompileListing(cNoFilter, { fileName: 'TESTDSP', workFile: 'LTESTWORK1' });
  const q0 = sqls(cNoFilter).find((q) => /OUTPUT_QUEUE_ENTRIES/.test(q));
  check('without a user or a start time those two filters are left out (newest spool of that name)', !/USER_NAME|CREATED >=/.test(q0) && /SPOOLNAME = 'TESTDSP'/.test(q0));
  const cDate = fake();
  await CompileListing.fetchCompileListing(cDate, { fileName: 'TESTDSP', since: new Date('2026-10-19T00:51:14.250Z'), workFile: 'LTESTWORK1' });
  check('a Date for the start time is formatted for SQL', /TIMESTAMP\('2026-10-19 00:51:14.250000'\)/.test(sqls(cDate).find((q) => /OUTPUT_QUEUE_ENTRIES/.test(q))));

  // ---- 6. beginCompile --------------------------------------------------------------------
  const b1 = await CompileListing.beginCompile(fake());
  check('beginCompile: the IBM i clock and the SQL user', b1.since === '2026-10-19 00:51:14.000000' && b1.user === 'MANOJK');
  const b2 = await CompileListing.beginCompile(fake({ clock: [{ t: '2026-10-19T00:51:14.5', u: 'manojk ' }] }));
  check('beginCompile: lower case keys, a T separator and a short fraction', b2.since === '2026-10-19 00:51:14.500000' && b2.user === 'MANOJK');
  const b3 = await CompileListing.beginCompile(fake({ sqlThrows: /SYSDUMMY1/ }));
  const b4 = await CompileListing.beginCompile(fake({ clock: [] }));
  const b5 = await CompileListing.beginCompile(null);
  check('beginCompile: unknown is { since: null, user: null } and never throws', [b3, b4, b5].every((b) => b.since === null && b.user === null));
  check('beginCompile: a user name that is not an IBM i name is dropped', (await CompileListing.beginCompile(fake({ clock: [{ T: '2026-10-19-00.51.14.000000', U: "X'; DROP" }] }))).user === null);

  // ---- 7. names, key case, never rejects ------------------------------------------------------
  const names = new Set();
  let validNames = true;
  for (let i = 0; i < 2000; i++) { const n = CompileListing.newWorkFileName(); names.add(n); if (!/^[A-Z][A-Z0-9]{0,9}$/.test(n)) validNames = false; }
  check('work file names are valid IBM i names of at most 10 characters', validNames);
  check('2000 work file names are 2000 different names', names.size === 2000);
  const cDefault = fake();
  const rDefault = await CompileListing.fetchCompileListing(cDefault, { fileName: 'TESTDSP' });
  check('without a given work file a generated one is made and deleted', rDefault.ok === true && /^CRTPF FILE\(ISDATEMP\/L[A-Z0-9]{9}\)/.test(commands(cDefault)[0]) && Object.keys(cDefault.files).length === 0);
  const cLowerKeys = fake({ spoolRows: [{ job_name: JOB, filenum: 4, created: '2026-10-19-00.51.15.065210' }] });
  const rLowerKeys = await CompileListing.fetchCompileListing(cLowerKeys, OPTS);
  check('lower case column keys from runSQL work', rLowerKeys.ok === true && rLowerKeys.fileNumber === 4 && /SPLNBR\(4\)/.test(commands(cLowerKeys)[1]));
  const rStringNo = await CompileListing.fetchCompileListing(fake({ spoolRows: [{ JOB_NAME: JOB, FILENUM: '7' }] }), OPTS);
  check('a file number that comes back as a string is accepted', rStringNo.ok === true && rStringNo.fileNumber === 7);

  let rejected = false;
  const odd = [undefined, null, 0, 'x', {}, { runSQL: 1 }, { runSQL: async () => { throw 1; }, runCommand: async () => { throw 2; } }, { runSQL: async () => undefined, runCommand: async () => undefined }, { runSQL: async () => [{ JOB_NAME: JOB, FILENUM: 1 }], runCommand: async () => null }];
  for (const conn of odd) {
    for (const opts of [OPTS, undefined, null, 7, {}]) {
      try { const r = await CompileListing.fetchCompileListing(conn, opts); if (!r || typeof r.ok !== 'boolean') rejected = true; } catch (e) { rejected = true; }
    }
    try { await CompileListing.beginCompile(conn); } catch (e) { rejected = true; }
  }
  check('never rejects, whatever the connection or options', rejected === false);

  process.exit(failureCount() === 0 ? 0 : 1);
})();
