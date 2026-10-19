/**
 * e2dCompileDiagnostics.test.js
 *
 * E2d - a failed CRTDSPF / CRTS36DSPF becomes diagnostics in the editor.
 *   A. compileDiagnostics.js on the E2a fixtures: severities, lines, file-level messages, command-text fallback.
 *   B. collectCompileFeedback end to end with a fake IBM i (beginCompile, fetch, parse, map): listing path, fallback
 *      when the listing is missing, the source edited since the compile, and never rejecting.
 *   C. diagnosticsHub tracked sources: follow edits (edited line loses its message, lines below move), file-level
 *      messages stay, close clears, a new compile replaces, the rules source is left alone.
 *
 * Run with: node src/test/e2dCompileDiagnostics.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const CompileDiagnostics = require(path.join(__dirname, '../compileDiagnostics.js'));
const CompileMessages = require(path.join(__dirname, '../compileMessages.js'));
const CompileListing = require(path.join(__dirname, '../compileListing.js'));
const DiagnosticsHub = require(path.join(__dirname, '../diagnosticsHub.js'));

const fx = (n) => fs.readFileSync(path.join(__dirname, 'fixtures/compile', n), 'utf8');
const listing = fx('testdsp.listing.txt');
const dds = fx('testdsp.dds');
const toast = fx('testdsp.toast.txt');
const JOB = '980099/MANOJK/QPADEV02T6';

function fakeIbmI(o) {
  o = o || {};
  const files = {};
  return {
    files,
    runSQL: async (sql) => {
      if (/SYSDUMMY1/.test(sql)) return [{ T: '2026-10-19-00.51.14.000000', U: 'MANOJK' }];
      if (/QSYS2\.SYSSCHEMAS/.test(sql)) return [{ X: 1 }];
      if (/OUTPUT_QUEUE_ENTRIES/.test(sql)) return o.noSpool ? [] : [{ JOB_NAME: JOB, FILENUM: 3, CREATED: '2026-10-19-00.51.15.065210' }];
      const m = /FROM ISDATEMP\.(\w+) T ORDER BY RRN\(T\)/.exec(sql);
      if (m) return files[m[1]];
      return [];
    },
    runCommand: async (c) => {
      let m;
      if ((m = /^CRTPF FILE\(ISDATEMP\/(\w+)\)/.exec(c.command))) { files[m[1]] = []; return { code: 0, stdout: '', stderr: '' }; }
      if ((m = /^CPYSPLF FILE\((\w+)\) TOFILE\(ISDATEMP\/(\w+)\)/.exec(c.command))) {
        files[m[2]] = (o.spoolLines || listing.split('\n')).map((l) => ({ LINE: (l + ' '.repeat(200)).slice(0, 200) }));
        return { code: 0, stdout: '', stderr: '' };
      }
      if ((m = /^DLTF FILE\(ISDATEMP\/(\w+)\)/.exec(c.command))) { delete files[m[1]]; return { code: 0, stdout: '', stderr: '' }; }
      return { code: 0, stdout: '', stderr: '' };
    }
  };
}

// ---- A. the diagnostics from the fixtures ------------------------------------------------------------
const parsed = CompileMessages.parseListing(listing);
const a = CompileDiagnostics.toDiagnostics(parsed, dds, { via: 'listing', source: 'CRTDSPF' });
check('A: 7 listing messages: 6 on a line, 1 file-level (the escape message)', a.diagnostics.length === 7 && a.mapped === 6 && a.fileLevel === 1);
check('A: the lines are the ones the listing reports (15, 17, 31 x3, 36)', a.diagnostics.slice(0, 6).map((d) => d.line).join() === '15,17,31,31,31,36');
check('A: a line message covers the whole line from column 1; the code is the message ID; the source is CRTDSPF',
  a.diagnostics[0].column === 1 && a.diagnostics[0].endColumn > 2 && a.diagnostics[0].code === 'CPD5237' && a.diagnostics[0].source === 'CRTDSPF' && a.diagnostics[0].fileLevel === false);
check('A: the escape message CPF7302 is file-level, on line 1, an error', a.diagnostics[6].code === 'CPF7302' && a.diagnostics[6].fileLevel === true && a.diagnostics[6].line === 1 && a.diagnostics[6].severity === 'error');
check('A: severity bands: 20 and over are errors', a.diagnostics.every((d) => d.severity === 'error'));
const bands = { 5: 'information', 10: 'warning', 19: 'warning', 20: 'error', 40: 'error' };
check('A: severityName: 0-9 information, 10-19 warning, 20+ error, unknown warning',
  Object.keys(bands).every((k) => CompileDiagnostics.severityName({ severity: Number(k) }, 'listing') === bands[k]) && CompileDiagnostics.severityName({ severity: null }, 'listing') === 'warning');
const cmd = CompileMessages.parseCommandText(toast);
const c = CompileDiagnostics.toDiagnostics(cmd, dds, { via: 'command', source: 'CRTS36DSPF' });
check('A: command text: every message is file-level and has the source asked for', c.diagnostics.length === 6 && c.mapped === 0 && c.diagnostics.every((d) => d.fileLevel && d.line === 1 && d.source === 'CRTS36DSPF'));
check('A: command text: noise (SQL0443) is left out', !c.diagnostics.some((d) => /^SQL/.test(d.code)));
check('A: command text: CPC information, CPD warning, CPF error',
  c.diagnostics.find((d) => d.code === 'CPC3305').severity === 'information' && c.diagnostics.find((d) => d.code === 'CPD4090').severity === 'warning' && c.diagnostics.find((d) => d.code === 'CPF7311').severity === 'error');
check('A: no note about "could not be placed" on command-text messages', c.diagnostics.every((d) => !/could not be placed/.test(d.message)));

// ---- B. end to end with a fake IBM i -------------------------------------------------------------------------
(async () => {
  const conn = fakeIbmI();
  const mark = await CompileListing.beginCompile(conn);
  const fb = await CompileDiagnostics.collectCompileFeedback(conn, { fileName: 'TESTDSP', source: 'CRTDSPF', sourceText: dds, mark, commandText: toast });
  check('B: the listing path: ok, via listing, 6 mapped and 1 file-level', fb.ok && fb.via === 'listing' && fb.mapped === 6 && fb.fileLevel === 1 && fb.diagnostics.length === 7);
  check('B: raw is the listing text (for the Output channel) and the work file is gone', fb.raw.split('\n')[0].startsWith('5770SS1') && Object.keys(conn.files).length === 0);

  const none = fakeIbmI({ noSpool: true });
  const fb2 = await CompileDiagnostics.collectCompileFeedback(none, { fileName: 'TESTDSP', source: 'CRTDSPF', sourceText: dds, mark, commandText: toast });
  check('B: no spooled file: falls back to the command text, all file-level, the reason is reported',
    fb2.ok && fb2.via === 'command' && fb2.mapped === 0 && fb2.diagnostics.length === 6 && fb2.listing && fb2.listing.ok === false && typeof fb2.listing.reason === 'string' && fb2.raw === toast);

  const junk = fakeIbmI({ spoolLines: ['nothing', 'that looks', 'like a listing'] });
  const fb3 = await CompileDiagnostics.collectCompileFeedback(junk, { fileName: 'TESTDSP', source: 'CRTDSPF', sourceText: dds, mark, commandText: toast });
  check('B: a text that is not a compile listing: falls back to the command text', fb3.ok && fb3.via === 'command' && fb3.diagnostics.length === 6);

  const noMark = await CompileDiagnostics.collectCompileFeedback(fakeIbmI(), { fileName: 'TESTDSP', source: 'CRTDSPF', sourceText: dds, mark: null, commandText: toast });
  check('B: no mark (the clock was unknown): still ok, never throws', noMark.ok === true);

  const lines = dds.split('\n');
  const edited = lines.slice(); edited[30] = edited[30].replace(/\S/, 'X');                 // the line of the CPD7850 messages
  const fb4 = await CompileDiagnostics.collectCompileFeedback(fakeIbmI(), { fileName: 'TESTDSP', source: 'CRTDSPF', sourceText: edited.join('\n'), mark, commandText: toast });
  const changed = fb4.diagnostics.filter((d) => d.fileLevel && d.code !== 'CPF7302');
  check('B: a line edited since the compile: its messages become file-level with a note, the others stay on their lines',
    fb4.ok && changed.length === 3 && changed.every((d) => /edited after the compile/.test(d.message)) && fb4.diagnostics.filter((d) => !d.fileLevel).length === 3);

  const shifted = ['     A* a new first line'].concat(lines);
  const fb5 = await CompileDiagnostics.collectCompileFeedback(fakeIbmI(), { fileName: 'TESTDSP', source: 'CRTDSPF', sourceText: shifted.join('\n'), mark, commandText: toast });
  check('B: a line added above: the messages follow their lines (15 -> 16)', fb5.ok && fb5.diagnostics[0].line === 16 && fb5.mapped === 6);

  const bad1 = await CompileDiagnostics.collectCompileFeedback(null, { fileName: 'TESTDSP', sourceText: dds, commandText: toast });
  check('B: no connection: falls back to the command text', bad1.ok && bad1.via === 'command');
  const bad2 = await CompileDiagnostics.collectCompileFeedback({ runSQL: async () => { throw new Error('boom'); }, runCommand: async () => { throw new Error('boom'); } }, { fileName: 'TESTDSP', sourceText: dds, commandText: toast });
  check('B: a connection that throws everywhere: never rejects, falls back', bad2.ok && bad2.via === 'command');
  const bad3 = await CompileDiagnostics.collectCompileFeedback(undefined, undefined);
  check('B: nothing at all: never rejects, no diagnostics', bad3.ok === true && bad3.diagnostics.length === 0);

  // ---- C. the hub ----------------------------------------------------------------------------------------------
  class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
  class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
  const emitter = () => { const hs = []; const sub = (fn) => { hs.push(fn); return { dispose() { hs.splice(hs.indexOf(fn), 1); } }; }; sub.fire = (e) => hs.slice().forEach((h) => h(e)); return sub; };
  const col = { map: new Map(), set(u, l) { this.map.set(u.toString(), l); }, delete(u) { this.map.delete(u.toString()); }, get(u) { return this.map.get(u.toString()); }, dispose() {} };
  const api = {
    Range, Diagnostic, DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    languages: { createDiagnosticCollection: () => col },
    workspace: { textDocuments: [], onDidOpenTextDocument: emitter(), onDidChangeTextDocument: emitter(), onDidCloseTextDocument: emitter(), onDidChangeConfiguration: emitter() }
  };
  const uri = { toString: () => 'member:/LIB/QDDSSRC/TESTDSP.dspf' };
  const document = { uri, isClosed: false, getText: () => '' };
  const hub = DiagnosticsHub.createHub(api, { shouldAnalyze: () => false });
  hub.start();
  const plain = (line, extra) => Object.assign({ line, column: 1, endColumn: 20, severity: 'error', message: 'm' + line, code: 'CPD' + line, source: 'CRTDSPF' }, extra || {});
  const shown = () => (col.get(uri) || []).map((d) => d.range.start.line + 1 + (d.message[0] === 'F' ? 'f' : '')).join();
  const edit = (...changes) => api.workspace.onDidChangeTextDocument.fire({ document, contentChanges: changes.map(([sl, sc, el, ec, text]) => ({ range: new Range(sl, sc, el, ec), text })) });
  const reset = () => hub.setTrackedSource(uri, 'CRTDSPF', [plain(5), plain(10), plain(10), plain(20), Object.assign(plain(1), { message: 'Ffile', fileLevel: true })]);

  reset();
  check('C: the diagnostics are published with the converted range and code', shown() === '5,10,10,20,1f' && col.get(uri)[0].code === 'CPD5' && col.get(uri)[0].source === 'CRTDSPF');
  edit([9, 3, 9, 4, 'x']);                                                              // line 10 edited
  check('C: an edit on a line drops the messages of that line (both on line 10); the rest stay', shown() === '5,20,1f');
  reset(); edit([9, 0, 9, 0, 'x']);
  check('C: typing at the start of a line counts as an edit of it', shown() === '5,20,1f');
  reset(); edit([6, 0, 6, 0, 'new\n']);                                                 // a whole new line in front of line 7
  check('C: a new line above moves the lines below it down by one (10 -> 11, 20 -> 21), earlier ones stay', shown() === '5,11,11,21,1f');
  reset(); edit([9, 0, 9, 0, 'new\n']);                                                 // a whole new line in front of line 10
  check('C: a whole line inserted in front of a flagged line moves it down; it is not an edit of it', shown() === '5,11,11,21,1f');
  reset(); edit([6, 0, 7, 0, '']);                                                      // lines 7 and 8 removed? (7 -> start of 8)
  check('C: removing a line above moves the lines below up by one', shown() === '5,9,9,19,1f');
  reset(); edit([4, 0, 5, 0, '']);                                                      // line 5 removed
  check('C: removing a flagged line removes its messages', shown() === '9,9,19,1f');
  reset(); edit([4, 2, 4, 2, 'a\nb\nc']);                                               // two line breaks inside line 5
  check('C: splitting a flagged line drops it and moves the lines below down by two', shown() === '12,12,22,1f');
  reset(); edit([19, 5, 19, 5, 'z'], [4, 5, 4, 5, 'y\n']);                              // two changes in one event, later text first
  check('C: two changes in one event: lines 5 and 20 both touched, 10 moved down by one', shown() === '11,11,1f');
  reset(); edit();
  check('C: an event without changes (a save, a dirty flag) changes nothing', shown() === '5,10,10,20,1f');
  reset(); edit([0, 0, 0, 3, 'abc']);
  check('C: an edit of line 1 does not remove a file-level message', shown() === '5,10,10,20,1f');
  reset(); edit([0, 0, 29, 0, '']);
  check('C: removing most of the file keeps only the file-level message', shown() === '1f');

  // the other sources are left alone
  hub.setSource(uri, 'rules', [new Diagnostic(new Range(2, 0, 2, 5), 'rule', 1)]);
  reset();
  check('C: a rules diagnostic and the compile messages sit together', (col.get(uri) || []).length === 6);
  edit([9, 0, 9, 1, 'x']);
  check('C: an edit drops compile messages only; the rules diagnostic stays (it is the rules analysis that replaces it)', (col.get(uri) || []).length === 4 && (col.get(uri) || []).some((d) => d.message === 'rule'));
  hub.setTrackedSource(uri, 'CRTDSPF', [plain(3)]);
  check('C: a new compile replaces the earlier messages of the same source', (col.get(uri) || []).length === 2);
  hub.setTrackedSource(uri, 'CRTS36DSPF', [plain(4, { source: 'CRTS36DSPF' })]);
  check('C: another source (CRTS36DSPF) sits beside it', (col.get(uri) || []).length === 3);
  hub.clearTrackedSource(uri, 'CRTDSPF');
  check('C: clearTrackedSource removes one source only', (col.get(uri) || []).length === 2);
  edit([3, 0, 3, 1, 'x']);
  check('C: the other tracked source follows the edit too (line 4 touched)', (col.get(uri) || []).length === 1);
  hub.setTrackedSource(uri, 'CRTDSPF', [plain(8)]);
  api.workspace.onDidCloseTextDocument.fire(document);
  check('C: closing the document clears every compile source and the rules source', col.get(uri) === undefined);
  edit([0, 0, 0, 1, 'x']);
  check('C: after the close nothing is tracked any more (an edit does not bring anything back)', col.get(uri) === undefined);
  hub.setTrackedSource(uri, 'CRTDSPF', []);
  check('C: an empty list clears and does not throw', col.get(uri) === undefined);
  hub.dispose();

  console.log(failureCount() === 0 ? 'e2dCompileDiagnostics: all checks passed' : 'e2dCompileDiagnostics: ' + failureCount() + ' check(s) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
})();
