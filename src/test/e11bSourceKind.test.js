/**
 * E11b - telling System/36 SFGR source (DSPF36) from DDS (src/sourceKind.js), and keeping the DDS tooling off SFGR:
 * the diagnostics and the other DDS providers. Pure checks first, then the extension against the vscode mock.
 * (E11g1 later gave SFGR source the designer, so the lens, the command and "Open With" open it as the designer
 * page; that part is checked here against the new behaviour, the page itself in e11g1SfgrDesigner.test.js.)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const { check, failureCount } = require('./helpers/harness');
const vscodeMock = require('./vscode-mock.js');
const { buildLine: L } = require('../fixtures/lineBuilder.js');
const SourceKind = require('../sourceKind.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const DDS_OK = [L({ func: 'DSPSIZ(24 80 *DS3)' }), L({ nameType: 'R', name: 'REC1' }), L({ name: 'F1', length: 10, dataType: 'A', usage: 'B', line: 2, col: 2 })].join('\n');
const DDS_BAD = [L({ nameType: 'R', name: 'REC1' }), L({ func: 'RMVWDW' }), L({ name: 'F1', length: 10, dataType: 'A', usage: 'B', line: 2, col: 2 })].join('\n');

// ---- module shape ----------------------------------------------------------------------------
const moduleSource = fs.readFileSync(path.join(__dirname, '../sourceKind.js'), 'utf8');
check('no vscode import', !/require\(\s*['"]vscode['"]\s*\)/.test(moduleSource));
check('copied to dist by the build', JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8')).scripts['build:webview-assets'].indexOf("'sourceKind.js'") > 0);

// ---- the source type -------------------------------------------------------------------------
check('type of a file path', SourceKind.sourceTypeOf('/w/STIPFM.dspf36') === 'DSPF36');
check('type of a member URI path', SourceKind.sourceTypeOf('/MYLIB/QDDSSRC/CUSTMNT.DSPF36') === 'DSPF36');
check('type is upper-cased', SourceKind.sourceTypeOf('/w/a.Dspf38') === 'DSPF38');
check('a windows path', SourceKind.sourceTypeOf('C:\\src\\a.dspf36') === 'DSPF36');
check('no extension: null', SourceKind.sourceTypeOf('/MYLIB/QDDSSRC/CUSTMNT') === null);
check('a leading dot is not an extension', SourceKind.sourceTypeOf('/w/.dspf36') === null);
check('a trailing dot is not an extension', SourceKind.sourceTypeOf('/w/a.') === null);
check('empty and non-string: null', SourceKind.sourceTypeOf('') === null && SourceKind.sourceTypeOf(undefined) === null);
check('a query or fragment is not part of the type', SourceKind.sourceTypeOf('/w/a.dspf36?x=1#y') === 'DSPF36');

// ---- the content -----------------------------------------------------------------------------
check('the sample is SFGR by content', SourceKind.contentKind(SFGR) === 'sfgr');
check('a DDS source is DDS by content', SourceKind.contentKind(DDS_OK) === 'dds');
check('empty text is unknown', SourceKind.contentKind('') === 'unknown' && SourceKind.contentKind(null) === 'unknown');
check('comment lines only: unknown', SourceKind.contentKind('* a comment\n* another\n') === 'unknown');
check('blank and short lines are skipped', SourceKind.contentKind('\n   \nab\n     SCHOIX1      24       Y\n') === 'sfgr');
check('a D spec alone (no S spec) is not enough', SourceKind.contentKind('     DFA0001     1 2 2Y\n') === 'unknown');
check('A and S records mixed: unknown', SourceKind.contentKind('     SFMT01\n     A          R REC1\n') === 'unknown');
check('CRLF line ends', SourceKind.contentKind(SFGR.replace(/\n/g, '\r\n')) === 'sfgr');
check('lower-case spec letters in column 6 count', SourceKind.contentKind('     sFMT01\n') === 'sfgr');
check('a *DDS pass-through line (sequence *DDS) is skipped', SourceKind.contentKind('     SFMT01\n*DDS S*\n') === 'sfgr');

// ---- classify: the source type decides first -------------------------------------------------
const kind = (p, t) => SourceKind.classify(p, t).kind;
check('.dspf36 with SFGR text: sfgr', kind('/w/a.dspf36', SFGR) === 'sfgr');
check('DSPF36 member, SFGR text: sfgr', kind('/L/F/A.DSPF36', SFGR) === 'sfgr');
check('.dspf36 with no text at all: sfgr (a new empty file)', kind('/w/a.dspf36', '') === 'sfgr');
check('.dspf36 whose text is DDS stays DDS (the pre-S36-5 naming convention)', kind('/w/a.dspf36', DDS_OK) === 'dds');
check('.dspf with SFGR text is not SFGR (a known other type decides)', kind('/w/a.dspf', SFGR) === 'other');
check('.dspf38, .mnudds, .rpgle are not SFGR whatever the text', ['a.dspf38', 'a.MNUDDS', 'a.rpgle'].every((n) => kind('/w/' + n, SFGR) === 'other'));
check('no type, SFGR text: sfgr (content fallback)', kind('/L/F/A', SFGR) === 'sfgr');
check('no type, DDS text: dds', kind('/L/F/A', DDS_OK) === 'dds');
check('no type, nothing recognisable: unknown', kind('/L/F/A', 'hello') === 'unknown');
check('every result carries a reason', SourceKind.classify('/w/a.dspf36', SFGR).reason.length > 0 && SourceKind.classify('/L/F/A', 'hello').reason.length > 0);
check('isSfgrSource is the sfgr case only', SourceKind.isSfgrSource('/w/a.dspf36', SFGR) === true && SourceKind.isSfgrSource('/w/a.dspf', DDS_OK) === false && SourceKind.isSfgrSource('/L/F/A', 'hello') === false);

// ---- the text is read only when the type does not decide -------------------------------------
function spy(text) { const s = () => { s.calls++; return text; }; s.calls = 0; return s; }
{
  const a = spy(SFGR); SourceKind.isSfgrSource('/w/a.dspf', a);
  check('a known other type: the text is never read', a.calls === 0);
  const b = spy(SFGR); SourceKind.isSfgrSource('/w/a.dspf36', b);
  check('DSPF36: the text is read once (to spot DDS content)', b.calls === 1);
  const c = spy(SFGR); SourceKind.isSfgrSource('/L/F/A', c);
  check('no type: the text is read once', c.calls === 1);
  check('a text function that throws is treated as no text', SourceKind.isSfgrSource('/w/a.dspf36', () => { throw new Error('x'); }) === true && SourceKind.isSfgrSource('/L/F/A', () => { throw new Error('x'); }) === false);
}

// ---- why it matters: the DDS rules on SFGR text ----------------------------------------------
{
  const r = DdsDiagnostics.analyze(SFGR);
  check('the DDS diagnostics report errors on the SFGR sample (the false positives the guard removes)', r.diagnostics.length > 0);
}

// ---- the extension ---------------------------------------------------------------------------
async function run() {
  const mk = (text, scheme, p) => vscodeMock.__mockDocument(text, new vscodeMock.Uri(scheme, p));
  const sfgrFile = mk(SFGR, 'file', '/w/STIPFM.dspf36');
  const sfgrMember = mk(SFGR, 'member', '/MYLIB/QDDSSRC/STIPFM.DSPF36');
  const ddsFile = mk(DDS_OK, 'file', '/w/GOOD.dspf');
  const ddsBad = mk(DDS_BAD, 'file', '/w/BAD.dspf');
  const legacy36 = mk(DDS_BAD, 'file', '/w/LEGACY.dspf36');

  vscodeMock.__setLanguageMatch(() => 1);
  [sfgrFile, sfgrMember, ddsFile, ddsBad, legacy36].forEach((d) => vscodeMock.workspace.textDocuments.push(d));
  const ext = require(path.join(__dirname, '../../dist/extension.js'));
  ext.activate(vscodeMock.__mockExtensionContext());
  await new Promise((r) => setTimeout(r, 300));

  console.log('\ndiagnostics (Problems panel)');
  const collection = vscodeMock.__diagnosticCollections.find((c) => c.name === 'iSDA') || vscodeMock.__diagnosticCollections[0];
  const count = (d) => ((collection && collection.get(d.uri)) || []).length;
  check('a DDS source with a violation is analysed (the test setup works)', count(ddsBad) > 0);
  check('a .dspf36 file with SFGR text gets no DDS diagnostics', count(sfgrFile) === 0);
  check('a DSPF36 member gets no DDS diagnostics', count(sfgrMember) === 0);
  check('a clean DDS source has none', count(ddsFile) === 0);
  check('a .dspf36 file that holds DDS keeps its DDS diagnostics', count(legacy36) > 0);

  console.log('\nCodeLens');
  const lens = vscodeMock.__registeredCodeLensProviders[0].provider;
  const lensTitles = (d) => lens.provideCodeLenses(d).map((l) => l.command.title);
  check('DDS source: Open Screen Design', lensTitles(ddsFile).some((t) => /Open Screen Design/.test(t)));
  check('.dspf36 with SFGR text: Open Screen Design (E11g1: the designer reads it)', lensTitles(sfgrFile).some((t) => /Open Screen Design/.test(t)));
  check('DSPF36 member: Open Screen Design', lensTitles(sfgrMember).some((t) => /Open Screen Design/.test(t)));
  check('.dspf36 that holds DDS: Open Screen Design', lensTitles(legacy36).some((t) => /Open Screen Design/.test(t)));

  console.log('\nOpen Screen Design command');
  const openPreview = vscodeMock.__registeredCommands['dspfDesigner.openPreview'];
  vscodeMock.window.activeTextEditor = { document: sfgrFile };
  vscodeMock.__executedCommands.length = 0;
  await openPreview();
  await new Promise((r) => setTimeout(r, 20));
  check('SFGR: the designer opens (E11g1)', vscodeMock.__executedCommands.some((c) => c.id === 'vscode.openWith' && c.args[1] === 'dspfDesigner.editor' && c.args[0] === sfgrFile.uri));
  vscodeMock.window.activeTextEditor = { document: ddsFile };
  vscodeMock.__executedCommands.length = 0;
  await openPreview();
  check('DDS: the designer opens as before', vscodeMock.__executedCommands.some((c) => c.id === 'vscode.openWith' && c.args[1] === 'dspfDesigner.editor'));

  console.log('\nOpen With > iSDA Screen Design on a DSPF36 file');
  const designer = vscodeMock.__registeredCustomEditorProviders['dspfDesigner.editor'].provider;
  const mkPanel = () => ({ webview: { cspSource: 'csp', options: null, set html(v) { this._html = v; }, get html() { return this._html; }, onDidReceiveMessage: () => ({ dispose: () => {} }), postMessage: () => {} }, onDidDispose: () => {} });
  const sfgrPanel = mkPanel();
  designer.resolveCustomTextEditor(sfgrFile, sfgrPanel, {});
  check('SFGR: the designer page is built as an SFGR page', /<body[^>]*data-source-kind="sfgr"/.test(sfgrPanel.webview.html));
  const ddsPanel = mkPanel();
  designer.resolveCustomTextEditor(ddsFile, ddsPanel, {});
  check('DDS: the page is a DDS page', /<body[^>]*data-source-kind="dds"/.test(ddsPanel.webview.html));
  const legacyPanel = mkPanel();
  designer.resolveCustomTextEditor(legacy36, legacyPanel, {});
  check('a .dspf36 file that holds DDS is a DDS page', /<body[^>]*data-source-kind="dds"/.test(legacyPanel.webview.html));

  vscodeMock.__setLanguageMatch(null);
  console.log('\n' + (failureCount() === 0 ? 'ALL CHECKS PASSED' : failureCount() + ' CHECK(S) FAILED'));
  process.exit(failureCount() === 0 ? 0 : 1);
}
run();
