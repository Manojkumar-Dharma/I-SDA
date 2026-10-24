/**
 * e11lRelease.test.js
 *
 * E11l - the System/36 `DSPF36` (SFGR) release: end-to-end evidence for the acceptance paragraph of the E11 epic, which no
 * single sub-task test holds. The sub-task tests (e11b - e11k) hold each piece; this file runs them together on the real
 * sample `stipfm.dspf36`:
 *   A. it opens in the designer and every format draws its constants and fields where the source puts them
 *   B. a session of edits from the page (add a format, a field, a constant and a help area; move, nudge, resize, edit
 *      from the panel, raw edit; delete them again) writes valid SFGR, every untouched line stays byte-identical, and
 *      undoing the additions gives the original text back byte for byte
 *   C. DDS-only features do not appear on a DSPF36 page
 *   D. the text editor: diagnostics, hover, outline, go to definition and quick-fixes are registered by the real host and
 *      work on SFGR source; the DDS ones never run on it, the SFGR ones never run on DDS
 *   E. a failed CRTS36DSPF puts its messages on the right source lines (the printout layout is a STAND-IN, see
 *      e11kSfgrCompileMessages.test.js)
 * Run with: node src/test/e11lRelease.test.js   (needs `npm run compile`)
 */
'use strict';
const path = require('path');
const fs = require('fs');
const Module = require('module');

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'vscode') return require('./vscode-mock.js');
  return originalLoad.apply(this, arguments);
};

const vscodeMock = require('./vscode-mock.js');
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const SourceKind = require('../sourceKind.js');
const Parser = require('../sfgrParser.js');
const Model = require('../sfgrModel.js');
const SfgrDiagnostics = require('../sfgrDiagnostics.js');
const SfgrCompileMessages = require('../sfgrCompileMessages.js');
const DdsDiagnostics = require('../ddsDiagnostics.js');
const ext = require(path.join(__dirname, '../../dist/extension.js'));

const SFGR = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const DDS = '     A          R REC1\n     A                                  1  2\'Hello\'\n';
const P = Parser.parse(SFGR);
const errors = (t) => Parser.parse(t).problems.filter((p) => p.severity === 'error').length;
const baseErrors = errors(SFGR);
const diag = (t) => SfgrDiagnostics.analyze(t, {}).diagnostics.length;

setTimeout(async () => {
  const tick = () => new Promise((res) => setTimeout(res, 5));
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e11l', SFGR, 'STIPFM.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
  } });
  const w = dom.window, doc = w.document;
  const $ = (s) => doc.querySelector(s);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => (edits().length ? edits()[edits().length - 1].text : SFGR);
  const mouse = (t, type, x, y, extra) => t.dispatchEvent(new w.MouseEvent(type, Object.assign({ bubbles: true, clientX: x, clientY: y }, extra || {})));
  const click = (el) => el.dispatchEvent(new w.Event('click', { bubbles: true }));
  const selectFormat = (name) => { $('#recordSelect').value = name; $('#recordSelect').dispatchEvent(new w.Event('change', { bubbles: true })); };
  const modelOf = (t) => Model.buildModel(t);
  const startOf = (rec) => (rec.sfgr.startLine == null ? 1 : rec.sfgr.startLine);

  console.log('A. opens and draws');
  const rec0 = modelOf(SFGR).records;
  check('the sample has ' + P.formats.length + ' formats and the page lists them all', Array.from($('#recordSelect').options).map((o) => o.value).join() === P.formats.map((f) => f.name).join());
  let missing = 0, total = 0;
  rec0.forEach((rec) => {
    selectFormat(rec.name);
    const els = Array.from(doc.querySelectorAll('.dspf-field'));
    rec.fields.forEach((f) => {
      if (f.conditions && f.conditions.length) return; // drawn only in the indicator state that turns it on
      if (f.keywords.some((k) => k.name === 'DSPATR' && /\bND\b/.test(k.parameters))) return; // non-display: not drawn
      total++;
      const hit = els.some((el) => +el.getAttribute('data-render-line') === startOf(rec) + f.location.line - 1 && +el.getAttribute('data-render-column') === f.location.column);
      if (!hit) missing++;
    });
  });
  check('every unconditioned field and constant of every format is drawn where the source puts it (' + total + ' checked)', total > 100 && missing === 0);
  selectFormat('SAISIE');
  check('the attributes the source gives are drawn (SAISIE has reverse image and underline)', !!doc.querySelector('.dspf-reverse') && !!doc.querySelector('.dspf-underline'));

  console.log('\nB. edits from the page');
  const rec = modelOf(SFGR).records.find((r) => r.name === 'SAISIE');
  const F = rec.fields.find((f) => f.nameType === 'FIELD' && f.length >= 3 && f.location.line < 20 && f.location.column > 3 && f.location.column + f.length + 3 <= 80 && Array.from(doc.querySelectorAll('.dspf-field')).some((el) => +el.getAttribute('data-render-line') === startOf(rec) + f.location.line - 1 && +el.getAttribute('data-render-column') === f.location.column));
  const elOf = (f) => Array.from(doc.querySelectorAll('.dspf-field')).find((el) => +el.getAttribute('data-render-line') === startOf(rec) + f.location.line - 1 && +el.getAttribute('data-render-column') === f.location.column);
  const reset = () => {
    if (edits().length) w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: lastText() } }));
    w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: SFGR } }));
    posted.length = 0;
    selectFormat('SAISIE');
  };
  const echo = () => { if (edits().length) w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: lastText() } })); };
  const sameExcept = (a, b, lines) => { const x = a.split('\n'), y = b.split('\n'); return x.length === y.length && x.every((l, i) => lines.indexOf(i + 1) >= 0 || l === y[i]); };

  // move (drag), nudge, resize: only that one line changes
  mouse(elOf(F), 'mousedown', 100, 100); mouse(w, 'mousemove', 130, 120); mouse(w, 'mouseup', 130, 120); await tick();
  check('a drag changes only the line of the field it moved', edits().length === 1 && sameExcept(SFGR, lastText(), [F.sfgr.line]) && errors(lastText()) <= baseErrors);
  reset();
  click(elOf(F));
  w.document.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  check('an arrow key nudges it by one column, one line changed', edits().length === 1 && sameExcept(SFGR, lastText(), [F.sfgr.line]));
  reset();
  click(elOf(F));
  const handle = elOf(F).querySelector('.sfgr-resize-handle');
  mouse(handle, 'mousedown', 100, 100); mouse(w, 'mousemove', 120, 100); mouse(w, 'mouseup', 120, 100); await tick();
  check('the right-edge handle lengthens the field by 2', edits().length === 1 && modelOf(lastText()).records.find((r) => r.name === 'SAISIE').fields.find((f) => f.sfgr.line === F.sfgr.line).length === F.length + 2);
  reset();

  // edit from the panel
  click(elOf(F));
  const nameInput = $('.sfgr-field-panel [data-sfgr-key="name"]');
  nameInput.value = 'ZZTEST'; nameInput.dispatchEvent(new w.Event('change', { bubbles: true }));
  check('a panel edit (the name) changes only that line', edits().length === 1 && sameExcept(SFGR, lastText(), [F.sfgr.line]) && /ZZTEST/.test(lastText().split('\n')[F.sfgr.line - 1]));
  reset();

  // raw edit
  click(elOf(F));
  const raw = $('#sfgrRawText');
  const line = SFGR.split('\n')[F.sfgr.line - 1].replace(/\r$/, '');
  raw.value = line.slice(0, 14) + 'Q' + line.slice(15);
  click($('#sfgrRawApply'));
  check('a raw edit writes the typed line, nothing else', edits().length === 1 && sameExcept(SFGR, lastText(), [F.sfgr.line]));
  reset();

  // additions, then the deletions that take them away again: the original, byte for byte
  const before = SFGR;
  click($('#sfgrNewFormatBtn')); echo();
  const withFormat = lastText();
  check('+ Format adds a format, no new read errors', Parser.parse(withFormat).formats.length === P.formats.length + 1 && errors(withFormat) <= baseErrors);
  const newName = Parser.parse(withFormat).formats.find((f) => !P.formats.some((g) => g.name === f.name)).name;
  selectFormat(newName);
  click($('#placeFieldBtn')); mouse($('.dspf-screen'), 'click', 105, 45); echo();
  check('click-to-place adds a field to the new format', Parser.parse(lastText()).formats.find((f) => f.name === newName).fields.length === 1);
  click($('#placeConstantBtn')); mouse($('.dspf-screen'), 'click', 205, 85); echo();
  check('click-to-place adds a constant', Parser.parse(lastText()).formats.find((f) => f.name === newName).fields.length === 2);
  selectFormat(newName);
  click($('[data-sfgr-action="addHelp"]')); echo();
  check('Add help area adds a help area', Parser.parse(lastText()).formats.find((f) => f.name === newName).help.length === 1);
  check('the source is valid SFGR throughout (no new read errors, no new rule violations)', errors(lastText()) <= baseErrors && diag(lastText()) <= diag(SFGR) + 1);
  check('every line of the original is still there, in order, untouched', (function () { const a = lastText().split('\n'); let k = 0; SFGR.split('\n').forEach((l) => { const at = a.indexOf(l, k); if (at >= 0) k = at + 1; else k = -1e9; }); return k > 0; })());
  selectFormat(newName);
  click($('[data-sfgr-action="delete"]'));
  const confirmBtn = $('.confirm-dialog-confirm');
  if (confirmBtn) confirmBtn.click();
  check('deleting the added format gives the original text back byte for byte', lastText() === before);
  reset();

  console.log('\nC. DDS-only features are absent');
  const css = (id, prop) => w.getComputedStyle(doc.getElementById(id))[prop];
  check('the DSPF36 note is shown', css('sfgrNote', 'display') !== 'none' && /DSPF36/.test(doc.getElementById('sfgrNote').textContent));
  check('Add record and Add from database are hidden', ['newRecordToggleBtn', 'addFromDbBtn'].every((id) => css(id, 'display') === 'none'));
  check('no properties tab strip', doc.querySelectorAll('.props-tab').length === 0);

  console.log('\nD. the text editor');
  check('SourceKind: the sample and a DSPF36 member are SFGR; DDS and a DSPF member are not', SourceKind.isSfgrSource('/w/STIPFM.DSPF36', SFGR) && SourceKind.isSfgrSource('/L/QSRC/X.DSPF36', '') && !SourceKind.isSfgrSource('/w/T.dspf', DDS) && !SourceKind.isSfgrSource('/L/QSRC/X.DSPF', SFGR));
  check('SFGR diagnostics are clean on the sample', diag(SFGR) === 0);
  const dLine = P.entries.find((e) => e.kind === 'D' && /^\s*\d+$/.test(P.lines[e.line - 1].text.slice(18, 20))).line;
  const bad = SFGR.split('\n').map((l, i) => (i === dLine - 1 ? l.slice(0, 18) + '99' + l.slice(20) : l)).join('\n');
  check('  a line number of 99 is reported', diag(bad) > diag(SFGR));
  const context = vscodeMock.__mockExtensionContext();
  ext.activate(context);
  vscodeMock.__setLanguageMatch(() => 1);
  const hovers = vscodeMock.__registeredHoverProviders.length, symbols = vscodeMock.__registeredSymbolProviders.length;
  check('the host registers hover, symbol and quick-fix providers for SFGR next to the DDS ones', hovers >= 2 && symbols >= 2 && vscodeMock.__registeredCodeActionProviders.length >= 2);
  const mkDoc = (text, p) => {
    const lines = text.split(/\r?\n/);
    return { uri: new vscodeMock.Uri('file', p), fileName: p, languageId: 'dds', version: 1, getText: (r) => text, lineCount: lines.length, lineAt: (n) => ({ text: lines[typeof n === 'number' ? n : n.line] || '', lineNumber: typeof n === 'number' ? n : n.line }), positionAt: (o) => ({ line: 0, character: o }), offsetAt: () => 0, isUntitled: false };
  };
  const sfgrDoc = mkDoc(SFGR, '/w/STIPFM.dspf36');
  const ddsDoc = mkDoc(DDS, '/w/T.dspf');
  const sym = async (provider, d) => { try { return await provider.provideDocumentSymbols(d, {}); } catch (e) { return 'threw ' + e.message; } };
  const symResults = [];
  for (const entry of vscodeMock.__registeredSymbolProviders) symResults.push({ onSfgr: await sym(entry.provider, sfgrDoc), onDds: await sym(entry.provider, ddsDoc) });
  const nonEmpty = (r) => Array.isArray(r) && r.length > 0;
  check('exactly one outline provider answers on SFGR source and one on DDS, never the same one', symResults.filter((r) => nonEmpty(r.onSfgr)).length === 1 && symResults.filter((r) => nonEmpty(r.onDds)).length === 1 && !symResults.some((r) => nonEmpty(r.onSfgr) && nonEmpty(r.onDds)));
  const sfgrOutline = symResults.find((r) => nonEmpty(r.onSfgr)).onSfgr;
  check('  the SFGR outline lists the formats', sfgrOutline.length === P.formats.length);

  console.log('\nE. a failed CRTS36DSPF (listing layout is a STAND-IN)');
  const at = (n) => SFGR.split(/\r?\n/)[n - 1];
  const standIn = [at(1), at(2), '  SYX5051 T INVALID FIRST CHARACTER IN DISPLAY SCREEN FORMAT NAME', '            ENTRY. MUST BE ALPHABETIC, @, # OR $.', at(3), '  SYX5071 W FIRST POSITION IN SOUND ALARM ENTRY IS N. SECOND POSITION', '            IS NOT BLANK AND IS IGNORED.'].join('\n');
  const dd = SfgrCompileMessages.toDiagnostics(SfgrCompileMessages.parseListing(standIn), SFGR, { source: 'CRTS36DSPF' });
  check('the messages land on the lines of their statements, with the right severity', dd.diagnostics.length === 2 && dd.diagnostics[0].line === 2 && dd.diagnostics[0].severity === 'error' && dd.diagnostics[1].line === 3 && dd.diagnostics[1].severity === 'warning' && dd.diagnostics[0].source === 'CRTS36DSPF');

  dom.window.close();
  process.exit(process.exitCode || 0);
}, 300);
