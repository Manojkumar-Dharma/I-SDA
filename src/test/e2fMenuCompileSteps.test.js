/**
 * e2fMenuCompileSteps.test.js
 *
 * E2f - the menu compile reports per step.
 *   A. planSteps: the commands are the ones the extension always built (character for character), quoting, no options.
 *   B. runSteps with a fake IBM i: all ok, message file already there, ADDMSGD replaced by CHGMSGD, both failing,
 *      CRTDSPF / CRTMSGF / CRTMNU failing, a command that throws, steps after a failure are skipped and never run.
 *   C. the report: summary per phase, failureText (names the step, ids, text verbatim, what did not run), formatReport,
 *      stepMessage (the old toast text for the display file step).
 *   D. toDiagnostics: file-level, source = the step, severity from the message ID, null for ok and for the CRTDSPF step.
 *   E. diagnosticsHub: the step's diagnostics are tracked under their source and cleared by name; the CRTDSPF source is untouched.
 *   F. extension.ts wiring (source scan): the sources are cleared with the others, the module is copied to dist.
 *
 * The message texts are synthetic, in the layout of the E2a command text ("ID: text"); the real CRTMSGF / ADDMSGD /
 * CRTMNU failure texts have not been seen yet (see the roadmap, E2f results).
 *
 * Run with: node src/test/e2fMenuCompileSteps.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const MenuCompileSteps = require(path.join(__dirname, '../menuCompileSteps.js'));
const DiagnosticsHub = require(path.join(__dirname, '../diagnosticsHub.js'));

const commands = [
  { optionNumber: '0001', numberValue: 1, command: 'CALL PGM(MYLIB/PAYROLL)' },
  { optionNumber: '0002', numberValue: 2, command: "SNDMSG MSG('it''s here') TOUSR(*SYSOPR)" },
  { optionNumber: '0003', numberValue: 3, command: 'WRKACTJOB' }
];
const plan = (cmds) => MenuCompileSteps.planSteps({ library: 'MYLIB', objectName: 'MAINMNU', srcFile: 'QMNUSRC', memberName: 'MAINMNU', commands: cmds });

/** A fake connection: `script` maps a command prefix to a result (or a function), everything else works. Records what ran. */
function fake(script) {
  const ran = [];
  return {
    ran,
    runCommand: async (c) => {
      ran.push(c.command);
      for (const k of Object.keys(script || {})) {
        if (c.command.startsWith(k)) {
          const v = typeof script[k] === 'function' ? script[k](c.command) : script[k];
          if (v instanceof Error) throw v;
          return v;
        }
      }
      return { code: 0, stdout: '', stderr: '' };
    }
  };
}
const fail = (text, code) => ({ code: code == null ? 1 : code, stdout: '', stderr: text });

(async () => {
  // ---- A. the plan ---------------------------------------------------------------------------------------------
  const p = plan(commands);
  check('A: CRTDSPF, CRTMSGF, 3 x ADDMSGD, CRTMNU = 6 planned steps in that order', p.map((s) => s.phase).join() === 'CRTDSPF,CRTMSGF,ADDMSGD,ADDMSGD,ADDMSGD,CRTMNU');
  check('A: CRTDSPF command is unchanged', p[0].command === 'CRTDSPF FILE(MYLIB/MAINMNU) SRCFILE(MYLIB/QMNUSRC) SRCMBR(MAINMNU) REPLACE(*YES)');
  check('A: CRTMSGF command is unchanged and tolerates "already exists"', p[1].command === 'CRTMSGF MSGF(MYLIB/MAINMNU)' && p[1].tolerateExists === true);
  check('A: ADDMSGD command is unchanged (USRnnnn id, SEV(00))', p[2].command === "ADDMSGD MSGID(USR0001) MSGF(MYLIB/MAINMNU) MSG('CALL PGM(MYLIB/PAYROLL)') SEV(00)");
  check('A: an apostrophe in a command is doubled in ADDMSGD and in its CHGMSGD retry', p[3].command.includes("MSG('SNDMSG MSG(''it''''s here'') TOUSR(*SYSOPR)')") && p[3].fallback.command.includes("''it''''s here''"));
  check('A: the retry is the same command with CHGMSGD, still in the ADDMSGD phase', p[2].fallback.command === p[2].command.replace(/^ADDMSGD/, 'CHGMSGD') && p[2].fallback.phase === 'ADDMSGD' && p[2].fallback.verb === 'CHGMSGD');
  check('A: labels name the option', p[2].label === 'ADDMSGD for option 1' && p[2].fallback.label === 'CHGMSGD for option 1');
  check('A: CRTMNU command is unchanged', p[5].command === 'CRTMNU MENU(MYLIB/MAINMNU) TYPE(*DSPF) DSPF(MYLIB/MAINMNU) MSGF(MYLIB/MAINMNU) REPLACE(*YES)');
  check('A: a menu with no options plans no ADDMSGD', plan([]).map((s) => s.phase).join() === 'CRTDSPF,CRTMSGF,CRTMNU');
  check('A: planSteps with nothing does not throw', Array.isArray(MenuCompileSteps.planSteps()));

  // ---- B. running ----------------------------------------------------------------------------------------------
  let c = fake();
  let r = await MenuCompileSteps.runSteps(c, plan(commands));
  check('B: everything works: ok, no failed step, every command ran in order', r.ok && r.failed === null && c.ran.length === 6 && c.ran[0].startsWith('CRTDSPF') && c.ran[5].startsWith('CRTMNU'));
  check('B: every step is ok', r.steps.length === 6 && r.steps.every((s) => s.status === 'ok'));
  check('B: nothing to report on success (failureText empty, toDiagnostics null)', MenuCompileSteps.failureText(r) === '' && MenuCompileSteps.toDiagnostics(r) === null);

  const seen = [];
  c = fake();
  await MenuCompileSteps.runSteps(c, plan(commands), { onStep: (s, i, n) => seen.push(s.phase + ':' + i + '/' + n) });
  check('B: onStep is told each step before it runs', seen.join() === 'CRTDSPF:0/6,CRTMSGF:1/6,ADDMSGD:2/6,ADDMSGD:3/6,ADDMSGD:4/6,CRTMNU:5/6');
  r = await MenuCompileSteps.runSteps(fake(), plan(commands), { onStep: () => { throw new Error('progress broke'); } });
  check('B: an exception in onStep is ignored', r.ok);

  c = fake({ CRTMSGF: fail('CPF2112: Object MAINMNU in MYLIB type *MSGF already exists.') });
  r = await MenuCompileSteps.runSteps(c, plan(commands));
  check('B: message file already there is not a failure (status exists), the compile goes on', r.ok && r.steps[1].status === 'exists' && c.ran.length === 6);
  check('B: the "already exists" text is also recognised without the ID', (await MenuCompileSteps.runSteps(fake({ CRTMSGF: fail('Object already exists.') }), plan(commands))).ok);

  c = fake({ ADDMSGD: (cmd) => (cmd.includes('USR0002') ? fail('CPF2419: Message ID USR0002 already exists in message file.') : { code: 0, stdout: '', stderr: '' }) });
  r = await MenuCompileSteps.runSteps(c, plan(commands));
  check('B: ADDMSGD that fails is retried as CHGMSGD; when that works the compile goes on', r.ok && c.ran.filter((x) => x.startsWith('CHGMSGD')).length === 1 && c.ran.length === 7);
  check('B: the first attempt is `recovered`, the retry `ok`, both in the ADDMSGD phase', r.steps[3].status === 'recovered' && r.steps[3].verb === 'ADDMSGD' && r.steps[4].status === 'ok' && r.steps[4].verb === 'CHGMSGD' && r.steps[4].phase === 'ADDMSGD');

  c = fake({
    ADDMSGD: (cmd) => (cmd.includes('USR0002') ? fail('CPF2419: Message ID USR0002 already exists in message file.') : { code: 0, stdout: '', stderr: '' }),
    CHGMSGD: fail('CPF2407: Message file MAINMNU in MYLIB not found.')
  });
  r = await MenuCompileSteps.runSteps(c, plan(commands));
  check('B: ADDMSGD and CHGMSGD both failing stops the compile: not ok', !r.ok && r.failed && r.failed.verb === 'CHGMSGD' && r.failed.phase === 'ADDMSGD');
  check('B: the failed step carries the ADDMSGD attempt as alsoTried', r.failed.alsoTried && r.failed.alsoTried.verb === 'ADDMSGD' && r.failed.alsoTried.status === 'failed' && r.failed.alsoTried.messages[0].msgId === 'CPF2419');
  check('B: option 3 and CRTMNU were not run, and are reported skipped', c.ran.length === 5 && r.steps.filter((s) => s.status === 'skipped').map((s) => s.label).join() === 'ADDMSGD for option 3,CRTMNU');

  c = fake({ CRTDSPF: fail('CPF7311: Errors in DDS not allowed with specified GENLVL. CPF7302: File MAINMNU not created in library MYLIB.') });
  r = await MenuCompileSteps.runSteps(c, plan(commands));
  check('B: CRTDSPF failing runs nothing else', !r.ok && r.failed.phase === 'CRTDSPF' && c.ran.length === 1 && r.steps.filter((s) => s.status === 'skipped').length === 5);
  check('B: the failed step has its return code, text and message IDs', r.failed.code === 1 && /GENLVL/.test(r.failed.text) && r.failed.messages.map((m) => m.msgId).join() === 'CPF7311,CPF7302');

  c = fake({ CRTMSGF: fail('CPF9810: Library MYLIB not found.') });
  r = await MenuCompileSteps.runSteps(c, plan(commands));
  check('B: CRTMSGF failing for another reason stops the compile', !r.ok && r.failed.phase === 'CRTMSGF' && c.ran.length === 2);

  c = fake({ CRTMNU: fail('CPF9999: something went wrong.') });
  r = await MenuCompileSteps.runSteps(c, plan(commands));
  check('B: CRTMNU failing is the failed step; everything before it ran', !r.ok && r.failed.phase === 'CRTMNU' && c.ran.length === 6 && r.steps.every((s) => s.status === 'ok' || s === r.failed));

  c = fake({ CRTMNU: new Error('connection lost') });
  r = await MenuCompileSteps.runSteps(c, plan(commands));
  check('B: a command that throws is a failed step with the error as its text (no code)', !r.ok && r.failed.text === 'connection lost' && r.failed.code === null);

  r = await MenuCompileSteps.runSteps({ runCommand: async () => ({ code: 1, stdout: 'only stdout', stderr: '' }) }, plan([]));
  check('B: the text is stderr, else stdout', r.failed.text === 'only stdout');
  r = await MenuCompileSteps.runSteps({ runCommand: async () => ({ code: 2 }) }, plan([]));
  check('B: no text at all is "unknown error"', r.failed.text === 'unknown error');
  r = await MenuCompileSteps.runSteps({ runCommand: async () => undefined }, plan([]));
  check('B: a command that returns nothing counts as worked (the old behaviour)', r.ok);
  r = await MenuCompileSteps.runSteps({}, plan([]));
  check('B: a connection without runCommand fails the first step and never rejects', !r.ok && r.failed.phase === 'CRTDSPF');
  r = await MenuCompileSteps.runSteps(null, undefined);
  check('B: nothing at all: ok with no steps, no throw', r.ok && r.steps.length === 0);

  // ---- C. the report -------------------------------------------------------------------------------------------
  c = fake({ ADDMSGD: fail('CPF2419: Message ID already exists.'), CHGMSGD: fail('CPF2407: Message file not found.') });
  const big = Array.from({ length: 30 }, (_, i) => ({ optionNumber: String(i + 1).padStart(4, '0'), numberValue: i + 1, command: 'WRKACTJOB' }));
  r = await MenuCompileSteps.runSteps(c, plan(big));
  const phases = r.phases.map((x) => x.phase + '=' + x.status).join();
  check('C: summary: one entry per phase, in compile order', phases === 'CRTDSPF=ok,CRTMSGF=ok,ADDMSGD=failed,CRTMNU=skipped');
  const add = r.phases.find((x) => x.phase === 'ADDMSGD');
  check('C: summary counts: option 1 failed as ADDMSGD and as CHGMSGD (2 results), 29 not run', add.failed === 2 && add.ok === 0 && add.skipped === 29 && add.total === 31);
  const ft = MenuCompileSteps.failureText(r);
  check('C: failureText names the step and its message ids', /^CHGMSGD for option 1 failed \(CPF2407\):/.test(ft));
  check('C: failureText keeps IBM i\'s text as it was and names the first attempt', ft.includes('CPF2407: Message file not found.') && ft.includes('Also tried CHGMSGD after ADDMSGD failed:\nCPF2419: Message ID already exists.'));
  check('C: failureText says which phases did not run (once each)', /Not run: ADDMSGD, CRTMNU\.$/.test(ft));
  const ft2 = MenuCompileSteps.failureText(await MenuCompileSteps.runSteps(fake({ CRTMNU: fail('plain text without an id') }), plan(commands)));
  check('C: no message ID in the text: no empty brackets, no "Not run" line when nothing was skipped', ft2 === 'CRTMNU failed:\nplain text without an id');
  check('C: stepMessage is the old toast text: "<label> failed:\\n<text>"', MenuCompileSteps.stepMessage({ label: 'CRTDSPF', text: 'CPF7302: x' }) === 'CRTDSPF failed:\nCPF7302: x');
  const rep = MenuCompileSteps.formatReport(r, { title: '=== CRTMNU MYLIB/MAINMNU ===' });
  check('C: formatReport starts with the title and says where it stopped', rep.split('\n')[0] === '=== CRTMNU MYLIB/MAINMNU ===' && rep.includes('stopped at CHGMSGD for option 1'));
  check('C: formatReport lists the phases with counts, skipped ones not one by one', rep.includes('ADDMSGD: FAILED (2 of 31 ran, 29 not run)') && rep.includes('CRTMNU: not run') && !rep.includes('--- ADDMSGD for option 2'));
  check('C: formatReport has a block with the command and text for each step that ran', rep.includes('--- CRTDSPF: ok') && rep.includes('--- ADDMSGD for option 1: FAILED (return code 1) ---') && rep.includes('CPF2407: Message file not found.'));
  check('C: formatReport of a good compile says so', /every step worked/.test(MenuCompileSteps.formatReport(await MenuCompileSteps.runSteps(fake(), plan(commands)))));
  check('C: formatReport never throws on junk', typeof MenuCompileSteps.formatReport(null) === 'string' && typeof MenuCompileSteps.failureText(null) === 'string');

  // ---- D. diagnostics ------------------------------------------------------------------------------------------
  r = await MenuCompileSteps.runSteps(fake({ CRTMNU: fail('CPF9999: Menu not created. CPD9998: Check the message file.') }), plan(commands));
  const d = MenuCompileSteps.toDiagnostics(r, { firstLineLength: 40 });
  check('D: source is the failed step\'s command and every diagnostic is file-level on line 1', d.source === 'CRTMNU' && d.diagnostics.length === 2 && d.diagnostics.every((x) => x.line === 1 && x.column === 1 && x.fileLevel === true && x.source === 'CRTMNU'));
  check('D: code is the message id; severity from the id (CPF error, CPD warning)', d.diagnostics[0].code === 'CPF9999' && d.diagnostics[0].severity === 'error' && d.diagnostics[1].code === 'CPD9998' && d.diagnostics[1].severity === 'warning');
  check('D: the text names the step; the squiggle covers the first line', d.diagnostics[0].message === 'CRTMNU: Menu not created.' && d.diagnostics[0].endColumn === 41);
  r = await MenuCompileSteps.runSteps(fake({ CRTMNU: fail('no id here') }), plan(commands));
  const d2 = MenuCompileSteps.toDiagnostics(r);
  check('D: text without an id is one error diagnostic with the whole text; width has a floor of 2', d2.diagnostics.length === 1 && d2.diagnostics[0].severity === 'error' && d2.diagnostics[0].message === 'CRTMNU: no id here' && d2.diagnostics[0].code === undefined && d2.diagnostics[0].endColumn === 2);
  r = await MenuCompileSteps.runSteps(fake({ ADDMSGD: fail('CPF2419: dup'), CHGMSGD: fail('CPF2407: gone') }), plan(commands));
  const d3 = MenuCompileSteps.toDiagnostics(r);
  check('D: a failed message description is under source ADDMSGD (also for its CHGMSGD retry) and names the option', d3.source === 'ADDMSGD' && d3.diagnostics[0].message === 'CHGMSGD for option 1: gone');
  r = await MenuCompileSteps.runSteps(fake({ CRTDSPF: fail('CPF7302: File not created.') }), plan(commands));
  check('D: the display file step gets no diagnostics from here (its are line-level, from the listing: E2d)', MenuCompileSteps.toDiagnostics(r) === null);
  r = await MenuCompileSteps.runSteps(fake({ CRTMSGF: fail('SQL0443: trigger error. CPF9810: Library not found.') }), plan(commands));
  check('D: noise (SQL) messages are left out', MenuCompileSteps.toDiagnostics(r).diagnostics.map((x) => x.code).join() === 'CPF9810');
  check('D: DIAGNOSTIC_SOURCES are the three non-display-file steps', MenuCompileSteps.DIAGNOSTIC_SOURCES.join() === 'CRTMSGF,ADDMSGD,CRTMNU');

  // ---- E. the hub ----------------------------------------------------------------------------------------------
  class Range { constructor(sl, sc, el, ec) { this.start = { line: sl, character: sc }; this.end = { line: el, character: ec }; } }
  class Diagnostic { constructor(range, message, severity) { this.range = range; this.message = message; this.severity = severity; } }
  const emitter = () => { const hs = []; const sub = (fn) => { hs.push(fn); return { dispose() { hs.splice(hs.indexOf(fn), 1); } }; }; sub.fire = (e) => hs.slice().forEach((h) => h(e)); return sub; };
  const col = { map: new Map(), set(u, l) { this.map.set(u.toString(), l); }, delete(u) { this.map.delete(u.toString()); }, get(u) { return this.map.get(u.toString()); }, dispose() {} };
  const api = {
    Range, Diagnostic, DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
    languages: { createDiagnosticCollection: () => col },
    workspace: { textDocuments: [], onDidOpenTextDocument: emitter(), onDidChangeTextDocument: emitter(), onDidCloseTextDocument: emitter(), onDidChangeConfiguration: emitter() }
  };
  const uri = { toString: () => 'member:/MYLIB/QMNUSRC/MAINMNU.mnudds' };
  const hub = DiagnosticsHub.createHub(api, { shouldAnalyze: () => false });
  hub.start();
  r = await MenuCompileSteps.runSteps(fake({ CRTMNU: fail('CPF9999: Menu not created.') }), plan(commands));
  const dd = MenuCompileSteps.toDiagnostics(r, { firstLineLength: 30 });
  hub.setTrackedSource(uri, 'CRTDSPF', [{ line: 3, column: 1, endColumn: 20, severity: 'error', message: 'dspf msg', code: 'CPD1', source: 'CRTDSPF' }]);
  hub.setTrackedSource(uri, dd.source, dd.diagnostics);
  check('E: the step\'s diagnostic and the display file one are both published', (col.get(uri) || []).length === 2);
  check('E: the step\'s diagnostic is a file-level one on line 1 with its code and source', (col.get(uri) || []).some((x) => x.range.start.line === 0 && x.code === 'CPF9999' && x.source === 'CRTMNU'));
  hub.clearTrackedSource(uri, 'CRTMNU');
  check('E: clearing the step\'s source leaves the display file messages', (col.get(uri) || []).length === 1 && col.get(uri)[0].code === 'CPD1');
  hub.setTrackedSource(uri, dd.source, dd.diagnostics);
  api.workspace.onDidChangeTextDocument.fire({ document: { uri, isClosed: false, getText: () => '' }, contentChanges: [{ range: new Range(0, 0, 0, 0), text: '\n' }] });
  check('E: a line inserted above does not move a file-level message', (col.get(uri) || []).some((x) => x.code === 'CPF9999' && x.range.start.line === 0));
  hub.dispose();

  // ---- F. wiring -----------------------------------------------------------------------------------------------
  const ext = fs.readFileSync(path.join(__dirname, '../extension.ts'), 'utf8');
  const pkg = fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8');
  check('F: extension.ts clears the step sources with the display file ones', /COMPILE_DIAGNOSTIC_SOURCES = \['CRTDSPF', 'CRTS36DSPF', \.\.\.MenuCompileSteps\.DIAGNOSTIC_SOURCES\]/.test(ext));
  check('F: compileMenu uses planSteps and runSteps, and the old inline run() chain is gone from it', /MenuCompileSteps\.planSteps\(/.test(ext) && /MenuCompileSteps\.runSteps\(/.test(ext) && !/ADDMSGD MSGID\(\$\{msgId\}\)/.test(ext));
  check('F: the display file step still goes through showCompileFeedback (E2d)', /failedStep\.phase === 'CRTDSPF'[\s\S]{0,400}showCompileFeedback\(/.test(ext));
  check('F: the module is copied to dist by build:webview-assets', /'compileDiagnostics\.js','menuCompileSteps\.js'[,\]]/.test(pkg));

  console.log(failureCount() === 0 ? 'e2fMenuCompileSteps: all checks passed' : 'e2fMenuCompileSteps: ' + failureCount() + ' check(s) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
})();
