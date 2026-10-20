/**
 * helpers/fakeCodeForI.js - E2g. A fake Code for i connection that plays back recorded compile results.
 *
 * It is the object `ext.exports.instance.getConnection()` returns in the real extension: `runCommand({ command, environment })`
 * and `runSQL(statement)`. Tests hand it to the extension through `asExtension()` and `vscodeMock.__setMockExtension`, so a
 * compile runs through the same code a user's click runs, and the only thing that is not real is the IBM i.
 *
 * What it models (the V7R3 behaviour E2i recorded):
 *   - the compile commands (CRTDSPF, CRTS36DSPF, CRTMSGF, ADDMSGD, CHGMSGD, CRTMNU) return the result scripted for their
 *     phase; a result with `listing` also leaves a spooled file named after the compiled file, created by "the compile job";
 *   - the SQL session is a different job from the compile job: the clock and user probe (SYSDUMMY1), the library check
 *     (SYSSCHEMAS), the spooled-file lookup (OUTPUT_QUEUE_ENTRIES, filtered by name, user and creation time exactly as the
 *     statement says), and reading an ISDATEMP work file back in record order;
 *   - CRTPF / CPYSPLF / DLTF on ISDATEMP work files: CPYSPLF copies the spooled file named in the command (job and file
 *     number must match the lookup's answer), records are 200 characters wide, DLTF removes the file.
 *   Anything else succeeds and does nothing. Everything received is kept in `log` for assertions.
 *
 * Recorded text lives in src/test/fixtures/compile (the E2a samples from a real failing CRTDSPF on IBM i V7R3M0).
 * `recordedCrtdspfFailure()` builds the scripted result for it; text a test writes itself is a stand-in and the test says so.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, '..', 'fixtures', 'compile');
const COMPILE_COMMAND = /^(CRTDSPF|CRTS36DSPF|CRTMSGF|ADDMSGD|CHGMSGD|CRTMNU)\b/;

/** The text of a file in src/test/fixtures/compile. */
function fixture(name) {
  return fs.readFileSync(path.join(FIXTURE_DIR, name), 'utf8');
}

/** The scripted result of the failing CRTDSPF the E2a fixtures were recorded from: return code, the command's own text, and the listing. */
function recordedCrtdspfFailure() {
  const toast = fixture('testdsp.toast.txt').replace(/\s+$/, '');
  return {
    code: 1,
    stdout: '',
    stderr: toast.replace(/^iSDA: CRTDSPF failed:\s*/, ''),
    listing: fixture('testdsp.listing.txt').split('\n')
  };
}

/** Digits only, fraction padded to 6: IBM i timestamps in any layout compare as strings. */
function stamp(value) {
  const m = /^(\d{4})\D(\d\d)\D(\d\d)\D(\d\d)\D(\d\d)\D(\d\d)(?:\D(\d+))?/.exec(String(value));
  if (!m) return '';
  return m.slice(1, 7).join('') + ((m[7] || '') + '000000').slice(0, 6);
}

/** The compiled file's name in a compile command: FILE(LIB/NAME) or DSPFILE(LIB/NAME). */
function compiledFileName(command) {
  const m = /\b(?:DSPFILE|FILE|MENU|MSGF)\((?:\w+\/)?(\w+)\)/.exec(command);
  return m ? m[1] : null;
}

/**
 * options:
 *   compiles   { CRTDSPF: result | (command) => result, ... } - what each phase returns; a phase not listed succeeds.
 *              result = { code, stdout, stderr, listing?: string[] } or an Error instance (the command throws).
 *   job        the compile job (default 980099/MANOJK/QPADEV02T6)
 *   clock      { user, start } the SQL job's user and the IBM i's clock at the start (the clock moves on with every compile)
 *   libraryExists  false: ISDATEMP is missing and CRTLIB creates it (default true)
 *   sqlThrows / commandThrows   a RegExp: a statement or command that matches throws (a connection that drops)
 */
function createFakeCodeForI(options) {
  const o = options || {};
  const log = [];
  const workFiles = {};
  const spool = [];
  const job = o.job || '980099/MANOJK/QPADEV02T6';
  const user = (o.clock && o.clock.user) || job.split('/')[1];
  // The IBM i clock moves on: each probe of the SQL job reads the time and moves it 5 s, a listing is created 3 s after the
  // probe that preceded its compile, so a later compile's `since` is after every earlier listing (as on a real system).
  let seconds = Date.UTC(2026, 9, 19, 0, 51, 14) / 1000;
  if (o.clock && o.clock.start) seconds = Date.parse(o.clock.start) / 1000;
  const pad = (n, w) => String(n).padStart(w || 2, '0');
  const formatTime = (sec) => {
    const d = new Date(sec * 1000);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()) + '-' + pad(d.getUTCHours()) + '.' + pad(d.getUTCMinutes()) + '.' + pad(d.getUTCSeconds()) + '.065210';
  };
  const scripts = Object.assign({}, o.compiles || {});
  let libraryExists = o.libraryExists !== false;
  let nextSpoolNumber = 3;

  async function runSQL(sql) {
    log.push({ sql });
    if (o.sqlThrows && o.sqlThrows.test(sql)) throw new Error('SQL0204 simulated');
    if (/SYSDUMMY1/.test(sql)) { const t = formatTime(seconds); seconds += 5; return [{ T: t, U: user }]; }
    if (/QSYS2\.SYSSCHEMAS/.test(sql)) return libraryExists ? [{ X: 1 }] : [];
    if (/OUTPUT_QUEUE_ENTRIES/.test(sql)) {
      const name = (/SPOOLNAME = '(\w+)'/.exec(sql) || [])[1];
      const who = (/USER_NAME = '(\w+)'/.exec(sql) || [])[1];
      const since = (/CREATED >= TIMESTAMP\('([^']+)'\)/.exec(sql) || [])[1];
      const hits = spool.filter((s) => s.name === name && (!who || s.user === who) && (!since || stamp(s.created) >= stamp(since)));
      hits.sort((a, b) => (stamp(a.created) === stamp(b.created) ? b.number - a.number : stamp(a.created) < stamp(b.created) ? 1 : -1));
      return hits.slice(0, 1).map((s) => ({ JOB_NAME: s.job, FILENUM: s.number, CREATED: s.created }));
    }
    const read = /FROM ISDATEMP\.(\w+) T ORDER BY RRN\(T\)/.exec(sql);
    if (read) {
      if (!workFiles[read[1]]) throw new Error('SQL0204 work file missing');
      return workFiles[read[1]];
    }
    return [];
  }

  async function runCommand(c) {
    const command = c && c.command;
    log.push({ command, environment: c && c.environment });
    if (o.commandThrows && o.commandThrows.test(command)) throw new Error('command exploded');
    let m;
    if ((m = /^CRTPF FILE\(ISDATEMP\/(\w+)\)/.exec(command))) {
      workFiles[m[1]] = [];
      return { code: 0, stdout: '', stderr: '' };
    }
    if ((m = /^CPYSPLF FILE\((\w+)\) TOFILE\(ISDATEMP\/(\w+)\) JOB\(([^)]+)\) SPLNBR\((\d+)\)/.exec(command))) {
      const entry = spool.find((s) => s.name === m[1] && s.job === m[3] && s.number === Number(m[4]));
      if (!entry) return { code: 1, stdout: '', stderr: 'CPF3303: File ' + m[1] + ' not found.' };
      workFiles[m[2]] = entry.lines.map((l) => ({ LINE: (l + ' '.repeat(200)).slice(0, 200) }));
      return { code: 0, stdout: '', stderr: '' };
    }
    if ((m = /^DLTF FILE\(ISDATEMP\/(\w+)\)/.exec(command))) {
      delete workFiles[m[1]];
      return { code: 0, stdout: '', stderr: '' };
    }
    if (/^CRTLIB LIB\(ISDATEMP\)/.test(command)) {
      libraryExists = true;
      return { code: 0, stdout: '', stderr: '' };
    }
    if ((m = COMPILE_COMMAND.exec(command))) {
      const scripted = scripts[m[1]];
      const result = typeof scripted === 'function' ? scripted(command) : scripted;
      if (result instanceof Error) throw result;
      if (!result) return { code: 0, stdout: '', stderr: '' };
      if (result.listing) {
        spool.push({ name: compiledFileName(command), job, user, number: nextSpoolNumber++, created: formatTime(seconds - 2), lines: result.listing });
      }
      return { code: typeof result.code === 'number' ? result.code : 0, stdout: result.stdout || '', stderr: result.stderr || '' };
    }
    return { code: 0, stdout: '', stderr: '' };
  }

  const connection = { runSQL, runCommand };
  return {
    connection,
    log,
    workFiles,
    spool,
    /** Script (or replace) what a phase returns from now on. */
    setCompile(phase, result) { scripts[phase] = result; },
    /** Every command received, in order. */
    commands() { return log.filter((e) => e.command).map((e) => e.command); },
    /** Every SQL statement received, in order. */
    sqls() { return log.filter((e) => e.sql).map((e) => e.sql); },
    /** The mock Code for i extension entry `vscodeMock.__setMockExtension` takes, wired to this connection. */
    asExtension() {
      return {
        id: 'halcyontechltd.code-for-ibmi',
        isActive: true,
        activate: () => Promise.resolve(),
        exports: { instance: { getConnection: () => connection } }
      };
    }
  };
}

module.exports = { createFakeCodeForI, recordedCrtdspfFailure, fixture, FIXTURE_DIR };
