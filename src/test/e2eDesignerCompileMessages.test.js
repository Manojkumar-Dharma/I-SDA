/**
 * e2eDesignerCompileMessages.test.js
 *
 * E2e - the compile messages in the DSPF designer.
 *   A. webviewClientHelpers.locateLine / indexCompileMessages on a parsed source (pure).
 *   B. the designer's own script in jsdom: the dismissible panel, click-to-select (field, record on another record, file),
 *      the count badges (record list, breadcrumb, props panel), the outline on the canvas field, and that a render()
 *      does not wipe any of it.
 *   C. diagnosticsHub.onDidChangeTracked / getTracked (what the host forwards to the panel), with the reason of each change.
 *
 * Run with: node src/test/e2eDesignerCompileMessages.test.js
 */
'use strict';
const path = require('path');
const { check, failureCount } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const DspfParser = require(path.join(__dirname, '../../dist/dspfParser.js'));
const H = require(path.join(__dirname, '../webviewClientHelpers.js'));
const DiagnosticsHub = require(path.join(__dirname, '../diagnosticsHub.js'));

const source = [
  '     A                                      DSPSIZ(24 80 *DS3)',              // 1  file keyword
  '     A          R SCR1',                                                       // 2  record
  "     A                                  1  2'MAIN SCREEN'",                    // 3  constant
  "     A                                  3  5'Some label'",                     // 4  constant
  '     A            NAME      10A  B  4  5',                                     // 5  field
  '     A          R SCR2',                                                       // 6  record
  '     A            ADDR      20A  B  6  5',                                     // 7  field
  '     A                                      COLOR(RED)',                      // 8  keyword line of ADDR
  '     A*  a comment line'                                                      // 9  comment
].join('\n') + '\n';

const msgs = [
  { line: 5, column: 1, severity: 'error', code: 'CPD7805', message: 'NAME is wrong', source: 'CRTDSPF', fileLevel: false },
  { line: 8, column: 1, severity: 'warning', code: 'CPD7890', message: 'COLOR is odd', source: 'CRTDSPF', fileLevel: false },
  { line: 2, column: 1, severity: 'information', code: 'CPD0001', message: 'Record note', source: 'CRTDSPF', fileLevel: false },
  { line: 1, column: 1, severity: 'error', code: 'CPD0002', message: 'DSPSIZ problem', source: 'CRTDSPF', fileLevel: false },
  { line: 1, column: 1, severity: 'error', code: 'CPF7302', message: 'File not created', source: 'CRTDSPF', fileLevel: true },
  { line: 9, column: 1, severity: 'warning', code: 'CPD0003', message: 'On a comment', source: 'CRTDSPF', fileLevel: false }
];

// ---- A. pure ---------------------------------------------------------------------------------------------------
const model = DspfParser.parseDspf(source);
const loc = (n) => H.locateLine(model, n);
check('A: line 5 is the field NAME of SCR1', JSON.stringify(loc(5)) === JSON.stringify({ kind: 'field', record: 'SCR1', sourceLine: 5 }));
check('A: the keyword line 8 belongs to the field ADDR of SCR2', JSON.stringify(loc(8)) === JSON.stringify({ kind: 'field', record: 'SCR2', sourceLine: 7 }));
check('A: line 2 is the record SCR1', JSON.stringify(loc(2)) === JSON.stringify({ kind: 'record', record: 'SCR1' }));
check('A: line 1 is a file-level keyword', JSON.stringify(loc(1)) === JSON.stringify({ kind: 'file' }));
check('A: a comment line and a line beyond the source are no element', loc(9) === null && loc(99) === null && loc(null) === null && H.locateLine(null, 3) === null);
const idx = H.indexCompileMessages(model, msgs);
check('A: counts: 3 errors, 2 warnings, 1 information', idx.counts.error === 3 && idx.counts.warning === 2 && idx.counts.information === 1 && idx.counts.total === 6);
check('A: SCR1 has 2 (the field and the record), SCR2 has 1', idx.byRecord.SCR1.total === 2 && idx.byRecord.SCR2.total === 1);
check('A: the field NAME has its message; the record SCR1 has its own', idx.byField[5].length === 1 && idx.byField[5][0].code === 'CPD7805' && idx.byRecordOwn.SCR1[0].code === 'CPD0001');
check('A: a file-level keyword message is on the file; a no-line message and a comment-line message have no target',
  idx.fileOwn.length === 1 && idx.fileOwn[0].code === 'CPD0002' && idx.entries.find((e) => e.code === 'CPF7302').target === null && idx.entries.find((e) => e.code === 'CPD0003').target === null);
check('A: nothing in, nothing out', H.indexCompileMessages(model, undefined).counts.total === 0 && H.indexCompileMessages(model, []).entries.length === 0);

// ---- B. the designer in jsdom ---------------------------------------------------------------------------------
const html = webviewHtml('vscode-webview://fake', 'testnonce', source, 'MYSCR.DSPF');
const posted = [];
const dom = newWebviewDom(html, {
  beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
  }
});

setTimeout(() => {
  const { document: doc, MessageEvent } = dom.window;
  const send = (data) => dom.window.dispatchEvent(new MessageEvent('message', { data }));
  const panel = () => doc.getElementById('compilePanel');
  const rows = () => Array.from(doc.querySelectorAll('#compilePanel .compile-msg'));
  const rowFor = (line) => rows().find((r) => r.getAttribute('data-compile-line') === String(line));
  const optionTexts = () => Array.from(doc.getElementById('recordSelect').options).map((o) => o.textContent);
  const crumbs = () => doc.getElementById('propsBreadcrumb').textContent;

  check('B: before any message the panel is hidden and the record list is plain', panel().classList.contains('hidden') && optionTexts().join() === 'SCR1,SCR2');

  send({ type: 'compileMessages', fresh: true, messages: msgs });
  check('B: the panel shows with the counts in its title', !panel().classList.contains('hidden') && /Compile: 3 errors, 2 warnings, 1 info/.test(panel().textContent));
  check('B: one row per message; the rows with a line in an element are clickable, the others are not', rows().length === 6 && rows().filter((r) => r.classList.contains('clickable')).length === 4);
  check('B: a row carries severity, where, code and text', /E\s*line 5\s*CPD7805\s*NAME is wrong/.test(rowFor(5).textContent) && /file\s*CPF7302/.test(rows()[4].textContent));
  check('B: the record list says how many messages each record has', optionTexts().join() === 'SCR1 \u00b7 2 \u26a0,SCR2 \u00b7 1 \u26a0');
  check('B: the option value stays the bare record name', Array.from(doc.getElementById('recordSelect').options).map((o) => o.value).join() === 'SCR1,SCR2');
  const nameEl = () => Array.from(doc.querySelectorAll('.dspf-field')).find((el) => el.getAttribute('data-source-line') === '5');
  check('B: the field NAME is outlined on the canvas as an error', nameEl() && nameEl().classList.contains('compile-msg-error'));
  check('B: a field without messages is not', !Array.from(doc.querySelectorAll('.dspf-field')).filter((el) => el.getAttribute('data-source-line') !== '5').some((el) => /compile-msg/.test(el.className)));
  check('B: the record breadcrumb carries a badge with the count', /Record: SCR1\s*2/.test(crumbs()) && !!doc.querySelector('#crumb-record .compile-badge'));
  check("B: the record's own message is listed in the props panel while the record is what is shown", /Record note/.test(crumbs()) && !/NAME is wrong/.test(crumbs()));

  rowFor(5).click();
  check('B: clicking the NAME row selects the field (selected on the canvas, breadcrumb says Field: NAME)', /Field: NAME/.test(crumbs()) && nameEl() && nameEl().classList.contains('selected') && doc.querySelectorAll('.dspf-field.selected').length === 1);
  check('B: its message is listed in the props panel and the field crumb has the badge', /NAME is wrong/.test(crumbs()) && !!doc.querySelector('#propsBreadcrumb .crumb.current .compile-badge'));
  check('B: the panel is still there after the render that the selection caused', !panel().classList.contains('hidden') && rows().length === 6);

  rowFor(8).click();
  check('B: a message on another record switches to it and selects the field of the keyword line', doc.getElementById('recordSelect').value === 'SCR2' && /Field: ADDR/.test(crumbs()) && /COLOR is odd/.test(crumbs()));
  check('B: the other record has no message block for this field', !/NAME is wrong/.test(crumbs()));

  rowFor(2).click();
  check('B: a record message selects the record (no field) and shows its message', doc.getElementById('recordSelect').value === 'SCR1' && !/Field:/.test(crumbs()) && /Record note/.test(crumbs()));

  rowFor(1).click();
  check('B: a file-level keyword message opens the file properties with its message and the no-line one', /File/.test(doc.querySelector('#propsBreadcrumb .crumb.current').textContent) && /DSPSIZ problem/.test(crumbs()) && /File not created/.test(crumbs()));
  check('B: the File crumb has a badge for both', /File\s*2/.test(doc.getElementById('crumb-file').textContent));

  check('B: a row that has no element does nothing when clicked', (() => { const r = rows().find((x) => /On a comment/.test(x.textContent)); const was = crumbs(); r.click(); return r.disabled === true && crumbs() === was; })());

  doc.getElementById('compilePanelClose').click();
  check('B: dismiss hides the panel and nothing else (the badges stay)', panel().classList.contains('hidden') && optionTexts()[0] === 'SCR1 \u00b7 2 \u26a0' && !!nameEl() && nameEl().classList.contains('compile-msg-error'));
  send({ type: 'compileMessages', fresh: false, messages: msgs.slice(0, 2) });
  check('B: an update that is only an edit moving or dropping messages keeps it dismissed', panel().classList.contains('hidden') && optionTexts().join() === 'SCR1 \u00b7 1 \u26a0,SCR2 \u00b7 1 \u26a0');
  send({ type: 'compileMessages', fresh: true, messages: msgs.slice(0, 2) });
  check('B: a fresh compile brings the panel back', !panel().classList.contains('hidden') && rows().length === 2);

  send({ type: 'compileMessages', fresh: false, messages: [] });
  check('B: no messages: panel hidden, record list plain, no outline', panel().classList.contains('hidden') && optionTexts().join() === 'SCR1,SCR2' && !/compile-msg/.test(nameEl() ? nameEl().className : ''));
  send({ type: 'compileMessages', fresh: true, messages: 'nonsense' });
  check('B: a malformed message list is treated as none', panel().classList.contains('hidden') && optionTexts().join() === 'SCR1,SCR2');

  // text of a message is data, not markup
  send({ type: 'compileMessages', fresh: true, messages: [{ line: 5, column: 1, severity: 'error', code: 'X<b>', message: '<img src=x onerror=alert(1)>', source: 'CRTDSPF', fileLevel: false }] });
  check('B: message text and code are escaped', !panel().querySelector('img') && !panel().querySelector('b') && /<img src=x/.test(panel().textContent));

  // ---- C. the hub forwards changes ------------------------------------------------------------------------------
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
  const events = [];
  const sub = hub.onDidChangeTracked((u, list, reason) => events.push({ uri: u, lines: list.map((d) => d.line + (d.fileLevel ? 'f' : '')).join(), reason }));

  hub.setTrackedSource(uri, 'CRTDSPF', [plain(9), plain(3), Object.assign(plain(1), { fileLevel: true })]);
  check('C: setting the messages tells the listener: merged list (file-level first, then by line), reason set', events.length === 1 && events[0].lines === '1f,3,9' && events[0].reason === 'set' && events[0].uri === uri);
  check('C: getTracked gives the same merged list', hub.getTracked(uri).map((d) => d.line).join() === '1,3,9');
  api.workspace.onDidChangeTextDocument.fire({ document, contentChanges: [{ range: new Range(0, 0, 0, 0), text: 'new\n' }] });
  check('C: an edit that moves them tells the listener, reason edit, with the new lines', events.length === 2 && events[1].reason === 'edit' && events[1].lines === '1f,4,10');
  api.workspace.onDidChangeTextDocument.fire({ document, contentChanges: [{ range: new Range(20, 0, 20, 1), text: 'x' }] });
  check('C: an edit that leaves them where they are does not', events.length === 2);
  api.workspace.onDidChangeTextDocument.fire({ document, contentChanges: [{ range: new Range(3, 0, 3, 1), text: 'x' }] });
  check('C: an edit that drops one tells the listener', events.length === 3 && events[2].lines === '1f,10');
  hub.setTrackedSource(uri, 'CRTDSPF', []);
  check('C: a compile that clears them tells the listener an empty list', events.length === 4 && events[3].lines === '' && events[3].reason === 'set');
  hub.setTrackedSource(uri, 'CRTDSPF', [plain(2)]);
  api.workspace.onDidCloseTextDocument.fire(document);
  check('C: closing the document tells the listener, reason close', events[events.length - 1].reason === 'close' && events[events.length - 1].lines === '');
  sub.dispose();
  hub.setTrackedSource(uri, 'CRTDSPF', [plain(2)]);
  const n = events.length;
  hub.setTrackedSource(uri, 'CRTDSPF', [plain(4)]);
  check('C: a disposed listener hears nothing more', events.length === n);
  hub.onDidChangeTracked(() => { throw new Error('boom'); });
  let threw = false;
  try { hub.setTrackedSource(uri, 'CRTDSPF', [plain(5)]); } catch (e) { threw = true; }
  check('C: a listener that throws does not break the hub', threw === false && hub.getTracked(uri).length === 1);
  hub.dispose();

  dom.window.close();
  console.log(failureCount() === 0 ? 'e2eDesignerCompileMessages: all checks passed' : 'e2eDesignerCompileMessages: ' + failureCount() + ' check(s) FAILED');
  process.exit(failureCount() === 0 ? 0 : 1);
}, 0);
