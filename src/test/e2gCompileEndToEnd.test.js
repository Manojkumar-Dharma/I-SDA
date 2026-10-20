/**
 * e2gCompileEndToEnd.test.js
 *
 * E2g - the compile feedback loop, end to end, with a fake Code for i connection that plays back recorded results.
 * Nothing below calls a compile module directly: each scenario runs the registered command a user's click runs
 * (dspfDesigner.compileDspf / dspfDesigner.compileMenu) against the real extension, and reads back what a user would see: the
 * Problems panel (the shared "iSDA" diagnostic collection), the "iSDA Compile" Output channel and the toast.
 *
 * Recorded: the E2a samples in src/test/fixtures/compile (a real failing CRTDSPF on IBM i V7R3M0: its command text and its
 * listing). Stand-ins, written here and marked as such: the CRTS36DSPF text (no recorded SFGR listing exists yet) and every
 * CRTMSGF / ADDMSGD / CRTMNU failure text (no recorded failure of those exists yet; E2f's note asks for one).
 *
 *   A. a failing CRTDSPF with the recorded listing: the diagnostics sit on the lines the listing names, on the DDS text the
 *      messages are about; file-level escape message; Output channel; toast; what went over the wire (ISDATEMP, never QTEMP,
 *      the job found by the lookup, the work file dropped).
 *   B. the messages follow the text: an edit drops the messages of that line, a line added above moves the rest.
 *   C. a successful recompile clears them and fetches no listing; a second failure replaces (not adds to) the first, and reads
 *      the newest listing.
 *   D. no listing to read (no spooled file, a lookup that throws, a work file that cannot be made): the command's own text
 *      is used, all file-level, and the reason is in the Output channel; nothing rejects.
 *   E. a System/36 member: CRTS36DSPF, source CRTS36DSPF.
 *   F. a menu compile: a failing display file step, a failing CRTMNU step, per-step report, a good recompile clears.
 *
 * Run with: node src/test/e2gCompileEndToEnd.test.js
 */
'use strict';
const path = require('path');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const ext = require(path.join(__dirname, '../../dist/extension.js'));
const { check, failureCount } = require('./helpers/harness');
const { createFakeCodeForI, recordedCrtdspfFailure, fixture } = require('./helpers/fakeCodeForI');

const DDS = fixture('testdsp.dds');
const DDS_LINES = DDS.split('\n');
const SEVERITY = vscodeMock.DiagnosticSeverity;
const JOB = '980099/MANOJK/QPADEV02T6';

/** A scenario: Code for i is the fake, `docs` are open in the editor, the extension is activated afresh. */
function begin(fake, docs) {
  vscodeMock.__setMockExtension('halcyontechltd.code-for-ibmi', fake.asExtension());
  vscodeMock.__setOpenTextDocuments(docs);
  vscodeMock.__lastError = undefined;
  vscodeMock.__lastErrorButtons = undefined;
  vscodeMock.__lastInformation = undefined;
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  return { context, commands: vscodeMock.__registeredCommands };
}
function end(scenario) {
  scenario.context.subscriptions.forEach((s) => { if (s && typeof s.dispose === 'function') s.dispose(); });
  vscodeMock.__setOpenTextDocuments([]);
}

/** The Problems panel of the activation that is running: the "iSDA" collection created last. */
function problems(uri, source) {
  const collection = vscodeMock.__diagnosticCollections.filter((c) => c.name === 'iSDA').pop();
  const list = (collection && collection.get(uri)) || [];
  return source ? list.filter((d) => d.source === source) : list;
}
const lineOf = (d) => d.range.start.line + 1;
const lines = (list) => list.map(lineOf).join();
const codes = (list) => list.map((d) => d.code).join();
/** The text of the "iSDA Compile" Output channel of the activation that is running, or null before it was created. */
function channelText() {
  const channel = vscodeMock.__outputChannels.filter((c) => c.name === 'iSDA Compile').pop();
  return channel ? channel.lines.join('\n') : null;
}
const ranBefore = (fake, first, second) => {
  const all = fake.log.map((e) => e.command || e.sql);
  const a = all.findIndex((t) => first.test(t));
  const b = all.findIndex((t) => second.test(t));
  return a >= 0 && b >= 0 && a < b;
};

(async () => {
  try {
  const uri = new vscodeMock.Uri('member', '/MANOJKUMAR/QDDSSRC/TESTDSP.DSPF');
  const doc = vscodeMock.__mockDocument(DDS, uri);

  // ---- A. a failing CRTDSPF with the recorded listing ------------------------------------------------------------
  console.log('A: a failing CRTDSPF, the recorded listing');
  const fake = createFakeCodeForI({ libraryExists: false, compiles: { CRTDSPF: recordedCrtdspfFailure() } });
  const s = begin(fake, [doc]);
  await s.commands['dspfDesigner.compileDspf'](uri);

  const all = problems(uri, 'CRTDSPF');
  const onLine = all.filter((d) => d.code !== 'CPF7302');
  check('A: 7 messages in the Problems panel, all from source CRTDSPF', all.length === 7 && problems(uri).length === 7);
  check('A: the six listing messages are on lines 15, 17, 31 (three) and 36', lines(onLine.slice().sort((a, b) => lineOf(a) - lineOf(b))) === '15,17,31,31,31,36');
  const find = (code) => all.find((d) => d.code === code);
  const at = (code) => (find(code) ? lineOf(find(code)) : -1);
  check('A: CPD5237 (field name twice in a record) is on line 15, the second CUSTID', at('CPD5237') === 15 && /CUSTID/.test(DDS_LINES[14]) && /CUSTID/.test(DDS_LINES[11]));
  check('A: CPD7830 (start line number too large) is on line 17, the 30 2\'F3=Exit\' constant', at('CPD7830') === 17 && /^\s*A\s+30\s+2'F3=Exit'/.test(DDS_LINES[16]));
  check('A: CPD5236 (record name twice) is on line 36, the second R HDRREC', at('CPD5236') === 36 && /R HDRREC/.test(DDS_LINES[35]) && /R HDRREC/.test(DDS_LINES[0]));
  check('A: CPD7850, CPD7520 and CPD7494 are all on line 31, the DSPATR(XX) line with option indicator 02',
    ['CPD7850', 'CPD7520', 'CPD7494'].every((c) => at(c) === 31) && /DSPATR\(XX\)/.test(DDS_LINES[30]));
  check('A: a line message covers the whole line from column 1', onLine.every((d) => d.range.start.character === 0 && d.range.end.character > 1 && d.range.start.line === d.range.end.line));
  const escape = all.find((d) => d.code === 'CPF7302');
  check('A: the escape message CPF7302 is file-level (line 1) and says the file was not created', escape && lineOf(escape) === 1 && /not created/.test(escape.message));
  check('A: every message is an error (listing severity 20 and over)', all.every((d) => d.severity === SEVERITY.Error));
  check('A: a message carries the text of the listing', /Record name specified more than once/.test(find('CPD5236') ? find('CPD5236').message : ''));

  const text = channelText();
  check('A: the Output channel has a header naming the command and the file', /=== CRTDSPF TESTDSP - /.test(text || ''));
  check('A: the Output channel has the raw listing, not the toast text', /\(compile listing\)/.test(text || '') && /^5770SS1 V7R3M0/m.test(text || ''));
  check('A: the toast carries the command\'s own text and offers Show Compile Output',
    /^iSDA: CRTDSPF failed:/.test(vscodeMock.__lastError || '') && /CPF7302/.test(vscodeMock.__lastError || '') && (vscodeMock.__lastErrorButtons || []).includes('Show Compile Output'));
  check('A: no success message', vscodeMock.__lastInformation === undefined);

  const cmds = fake.commands();
  check('A: the compile ran with the member\'s own names',
    cmds.includes('CRTDSPF FILE(MANOJKUMAR/TESTDSP) SRCFILE(MANOJKUMAR/QDDSSRC) SRCMBR(TESTDSP) REPLACE(*YES)'));
  check('A: ISDATEMP did not exist: it was created once, before the work file', cmds.filter((c) => /^CRTLIB LIB\(ISDATEMP\)/.test(c)).length === 1 && ranBefore(fake, /^CRTLIB/, /^CRTPF/));
  check('A: the clock and user were read before the compile, the spooled file was looked up after it',
    ranBefore(fake, /SYSDUMMY1/, /^CRTDSPF/) && ranBefore(fake, /^CRTDSPF/, /OUTPUT_QUEUE_ENTRIES/));
  const lookup = fake.sqls().find((q) => /OUTPUT_QUEUE_ENTRIES/.test(q));
  check('A: the lookup asks for the spooled file named after the compiled file, of this user, since the compile started',
    /SPOOLNAME = 'TESTDSP'/.test(lookup) && /USER_NAME = 'MANOJK'/.test(lookup) && /CREATED >= TIMESTAMP\('2026-10-19 00:51:14\.065210'\)/.test(lookup));
  const copy = cmds.find((c) => /^CPYSPLF/.test(c));
  check('A: the listing is copied out of the compile\'s own job, by file number, never JOB(*)', copy && copy.includes('JOB(' + JOB + ')') && /SPLNBR\(3\)/.test(copy) && !/JOB\(\*\)/.test(copy));
  const made = cmds.find((c) => /^CRTPF/.test(c));
  check('A: the work file is in ISDATEMP, never QTEMP, and is dropped afterwards',
    /^CRTPF FILE\(ISDATEMP\//.test(made) && !fake.log.some((e) => /QTEMP/.test(e.command || e.sql || '')) && cmds.some((c) => /^DLTF FILE\(ISDATEMP\//.test(c)) && Object.keys(fake.workFiles).length === 0);
  check('A: the member was not compiled twice and the listing was not fetched twice', cmds.filter((c) => /^CRTDSPF/.test(c)).length === 1 && cmds.filter((c) => /^CPYSPLF/.test(c)).length === 1);

  // ---- B. the messages follow the text -------------------------------------------------------------------------
  console.log('\nB: the messages follow the text');
  const edit = (sl, sc, el, ec, t) => vscodeMock.__changeListener({ document: doc, contentChanges: [{ range: new vscodeMock.Range(sl, sc, el, ec), text: t }] });
  edit(14, 3, 14, 4, 'x');                                      // line 15 edited
  check('B: an edit on line 15 drops its message (CPD5237); the other six stay', problems(uri, 'CRTDSPF').length === 6 && !problems(uri, 'CRTDSPF').some((d) => d.code === 'CPD5237'));
  check('B: the others are still on their lines', lines(problems(uri, 'CRTDSPF').filter((d) => d.code !== 'CPF7302').sort((a, b) => lineOf(a) - lineOf(b))) === '17,31,31,31,36');
  edit(9, 0, 9, 0, 'new line\n');                               // a whole line in front of line 10
  check('B: a line added above moves the messages below it down by one (17 -> 18, 31 -> 32, 36 -> 37)',
    lines(problems(uri, 'CRTDSPF').filter((d) => d.code !== 'CPF7302').sort((a, b) => lineOf(a) - lineOf(b))) === '18,32,32,32,37');
  check('B: the file-level message does not move', problems(uri, 'CRTDSPF').some((d) => d.code === 'CPF7302' && lineOf(d) === 1));

  // ---- C. recompile: success clears, a second failure replaces ---------------------------------------------------
  console.log('\nC: recompile');
  fake.setCompile('CRTDSPF', { code: 0 });
  const before = fake.log.length;
  await s.commands['dspfDesigner.compileDspf'](uri);
  check('C: a good recompile clears every compile message', problems(uri, 'CRTDSPF').length === 0);
  check('C: and says so', /MANOJKUMAR\/TESTDSP compiled/.test(vscodeMock.__lastInformation || ''));
  check('C: a good compile fetches no listing (no lookup, no copy)', !fake.log.slice(before).some((e) => /OUTPUT_QUEUE_ENTRIES|^CPYSPLF|^CRTPF/.test(e.command || e.sql || '')));

  fake.setCompile('CRTDSPF', recordedCrtdspfFailure());
  await s.commands['dspfDesigner.compileDspf'](uri);
  check('C: a second failure shows its own 7 messages (not 14)', problems(uri, 'CRTDSPF').length === 7);
  const copies = fake.commands().filter((c) => /^CPYSPLF/.test(c));
  check('C: it read the newest listing (file number 4, the second compile\'s), not the first', copies.length === 2 && /SPLNBR\(4\)/.test(copies[1]));
  check('C: the Output channel was rewritten, not appended to', ((channelText() || '').match(/=== CRTDSPF TESTDSP/g) || []).length === 1);
  check('C: no work file left behind', Object.keys(fake.workFiles).length === 0);
  end(s);

  // ---- D. no listing to read -------------------------------------------------------------------------------------
  console.log('\nD: no listing: the command\'s own text');
  const failureWithoutListing = Object.assign({}, recordedCrtdspfFailure(), { listing: undefined });
  const cases = [
    ['no spooled file was left', createFakeCodeForI({ compiles: { CRTDSPF: failureWithoutListing } }), /notFound/],
    ['the spooled-file lookup throws', createFakeCodeForI({ sqlThrows: /OUTPUT_QUEUE_ENTRIES/, compiles: { CRTDSPF: recordedCrtdspfFailure() } }), /lookup/],
    ['the work file cannot be made (CRTPF throws)', createFakeCodeForI({ commandThrows: /^CRTPF/, compiles: { CRTDSPF: recordedCrtdspfFailure() } }), /./],
    ['the whole SQL job is gone', createFakeCodeForI({ sqlThrows: /./, compiles: { CRTDSPF: recordedCrtdspfFailure() } }), /./]
  ];
  for (const [label, f, why] of cases) {
    const d = begin(f, [doc]);
    let threw = false;
    try { await d.commands['dspfDesigner.compileDspf'](uri); } catch (e) { threw = true; }
    const list = problems(uri, 'CRTDSPF');
    check('D: ' + label + ': the compile command does not reject', !threw);
    check('D: ' + label + ': the command text is shown, all messages file-level on line 1 (CPF7311, CPD4090, CPF7302)',
      codes(list.filter((x) => /^CP[FD]7|^CPD4/.test(x.code))).split(',').sort().join() === 'CPD4090,CPF7302,CPF7311' && list.every((x) => lineOf(x) === 1));
    check('D: ' + label + ': the toast is still shown', /^iSDA: CRTDSPF failed:/.test(vscodeMock.__lastError || ''));
    check('D: ' + label + ': the channel says it is the command\'s text', /the command's error text/.test(channelText() || '') && why.test(channelText() || ''));
    check('D: ' + label + ': nothing is left in ISDATEMP', Object.keys(f.workFiles).length === 0);
    end(d);
  }

  // ---- E. System/36 ----------------------------------------------------------------------------------------------
  console.log('\nE: a System/36 member');
  {
    const uri36 = new vscodeMock.Uri('member', '/MANOJKUMAR/QS36SRC/TESTDSP.DSPF36');
    // Stand-in: there is no recorded CRTS36DSPF failure, so the command text of the recorded CRTDSPF failure is reused.
    const f = createFakeCodeForI({ compiles: { CRTS36DSPF: Object.assign({}, recordedCrtdspfFailure(), { listing: undefined }) } });
    const d = begin(f, [vscodeMock.__mockDocument('     A* SFGR source', uri36)]);
    await d.commands['dspfDesigner.compileDspf'](uri36);
    check('E: CRTS36DSPF ran (DSPFILE, not FILE), CRTDSPF did not', f.commands().some((c) => /^CRTS36DSPF DSPFILE\(MANOJKUMAR\/TESTDSP\) SRCFILE\(MANOJKUMAR\/QS36SRC\)/.test(c)) && !f.commands().some((c) => /^CRTDSPF/.test(c)));
    const list = problems(uri36);
    check('E: the messages are under source CRTS36DSPF, not CRTDSPF', list.length > 0 && list.every((x) => x.source === 'CRTS36DSPF') && problems(uri36, 'CRTDSPF').length === 0);
    check('E: the toast says CRTS36DSPF failed', /^iSDA: CRTS36DSPF failed:/.test(vscodeMock.__lastError || ''));
    f.setCompile('CRTS36DSPF', { code: 0 });
    await d.commands['dspfDesigner.compileDspf'](uri36);
    check('E: a good recompile clears them', problems(uri36).length === 0);
    end(d);
  }

  // ---- F. a menu compile -----------------------------------------------------------------------------------------
  console.log('\nF: a menu compile');
  {
    const menuSource = ["     A                                      DSPSIZ(24 80 *DS3)", "     A          R MYMENU", "     A                                  1  2'MAIN MENU'"].join('\n') + '\n';
    const menuUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENU.MNUDDS');
    const commandUri = new vscodeMock.Uri('member', '/MYLIB/QDDSSRC/MYMENUQQ.MNUCMD');
    const menuDoc = vscodeMock.__mockDocument(menuSource, menuUri);
    const commandDoc = vscodeMock.__mockDocument('0001 DSPLIBL\n0002 CHGCURLIB\n', commandUri);

    // F1: the display file step fails. The recorded text of the CRTDSPF failure, no listing (a stand-in for a menu member).
    const f1 = createFakeCodeForI({ compiles: { CRTDSPF: Object.assign({}, recordedCrtdspfFailure(), { listing: undefined }) } });
    const m1 = begin(f1, [menuDoc, commandDoc]);
    await m1.commands['dspfDesigner.compileMenu'](menuUri);
    check('F1: the display file step ran first and stopped the compile: no CRTMSGF, no ADDMSGD, no CRTMNU', f1.commands().filter((c) => /^(CRTMSGF|ADDMSGD|CRTMNU)/.test(c)).length === 0 && f1.commands().some((c) => /^CRTDSPF FILE\(MYLIB\/MYMENU\)/.test(c)));
    check('F1: its messages are in the Problems panel under source CRTDSPF', problems(menuUri, 'CRTDSPF').length > 0 && problems(menuUri).every((x) => x.source === 'CRTDSPF'));
    check('F1: the toast names the step', /^iSDA: CRTDSPF failed:/.test(vscodeMock.__lastError || ''));
    end(m1);

    // F2: everything works until CRTMNU. Stand-in text (no recorded CRTMNU failure exists yet), in the layout E2a recorded.
    const f2 = createFakeCodeForI({ compiles: { CRTMNU: { code: 1, stdout: '', stderr: 'CPF9999: Menu MYMENU not created. CPD9998: Check the message file.' } } });
    const m2 = begin(f2, [menuDoc, commandDoc]);
    await m2.commands['dspfDesigner.compileMenu'](menuUri);
    const order = f2.commands().filter((c) => /^(CRTDSPF|CRTMSGF|ADDMSGD|CHGMSGD|CRTMNU)/.test(c)).map((c) => c.split(' ')[0]);
    check('F2: every step ran in order up to CRTMNU (CRTDSPF, CRTMSGF, two ADDMSGD, CRTMNU)', order.join() === 'CRTDSPF,CRTMSGF,ADDMSGD,ADDMSGD,CRTMNU');
    const menuProblems = problems(menuUri);
    check('F2: the Problems panel has the CRTMNU step\'s messages, file-level, under source CRTMNU',
      menuProblems.length === 2 && menuProblems.every((x) => x.source === 'CRTMNU' && lineOf(x) === 1) && codes(menuProblems) === 'CPF9999,CPD9998');
    check('F2: a message names the step', menuProblems.every((x) => /^CRTMNU: /.test(x.message)));
    check('F2: the display file step left nothing: no CRTDSPF diagnostics', problems(menuUri, 'CRTDSPF').length === 0);
    check('F2: the toast names the failed step and its message IDs', /CRTMNU failed \(CPF9999, CPD9998\)/.test(vscodeMock.__lastError || ''));
    check('F2: the toast offers Show Compile Output', (vscodeMock.__lastErrorButtons || []).includes('Show Compile Output'));
    const report = channelText() || '';
    check('F2: the Output channel has the per-step report: the menu, the failed step', /=== CRTMNU MYLIB\/MYMENU - /.test(report) && /FAILED/.test(report));
    check('F2: no listing is fetched for a step that is not a display file compile', !f2.log.some((e) => /OUTPUT_QUEUE_ENTRIES|^CPYSPLF/.test(e.command || e.sql || '')));

    f2.setCompile('CRTMNU', { code: 0 });
    await m2.commands['dspfDesigner.compileMenu'](menuUri);
    check('F2: a good recompile clears the CRTMNU messages and says so', problems(menuUri).length === 0 && /Menu MYLIB\/MYMENU compiled/.test(vscodeMock.__lastInformation || ''));

    // F3: the message description step fails, and so does its CHGMSGD retry. Stand-in text.
    const f3 = createFakeCodeForI({ compiles: { ADDMSGD: { code: 1, stderr: 'CPF2419: Message ID already exists.' }, CHGMSGD: { code: 1, stderr: 'CPF2407: Message file not found.' } } });
    const m3 = begin(f3, [menuDoc, commandDoc]);
    await m3.commands['dspfDesigner.compileMenu'](menuUri);
    check('F3: a message description that cannot be added or changed stops the compile before CRTMNU', !f3.commands().some((c) => /^CRTMNU/.test(c)) && f3.commands().some((c) => /^CHGMSGD/.test(c)));
    check('F3: the messages are file-level under source ADDMSGD', problems(menuUri).length > 0 && problems(menuUri).every((x) => x.source === 'ADDMSGD' && lineOf(x) === 1));
    end(m3);
  }

  } catch (e) {
    // An error inside a scenario is a failing check, not a crash. process.exit stays outside the try: the suite's shared
    // worker implements it by throwing, and a catch around it would report that signal as a failure.
    check('the test ran to the end (threw: ' + ((e && e.stack) || e) + ')', false);
  }
  process.exit(failureCount() === 0 ? 0 : 1);
})();
