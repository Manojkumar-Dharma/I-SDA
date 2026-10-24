/**
 * E12a - cut, copy and paste in the SFGR designer: fields, constants and help areas, inside a format and between
 * formats, from the keys and from the panel buttons. The writer part (SfgrWriter.pasteEntries) is tested on its own first.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { check } = require('./helpers/harness');
const { newWebviewDom, webviewHtml } = require('./helpers/common');
const Parser = require('../sfgrParser.js');
const Model = require('../sfgrModel.js');
const Writer = require('../sfgrWriter.js');

// the sample has no help area, so one is added to the first format (CHOIX1) to have something to copy
const ORIG = fs.readFileSync(path.join(__dirname, '../../docs/sda-reference/source/stipfm.dspf36'), 'utf8');
const SFGR = Writer.insertSpec(ORIG, { format: 0, at: 'end' }, { type: 'H', values: { name: 'HELP0001' } }).text;
const P = Parser.parse(SFGR);
const errors = (t) => Parser.parse(t).problems.filter((p) => p.severity === 'error').length;
const baseErrors = errors(SFGR);

console.log('the writer: pasteEntries');
const ds = P.entries.filter((e) => e.kind === 'D');
const fmt = 1;
const f0 = P.formats[fmt];
let r = Writer.pasteEntries(SFGR, fmt, [{ kind: 'D', lines: ds[0].raw }]);
check('a D copy goes after the format\'s last entry, one edit', r.ok && r.changed && Parser.parse(r.text).formats[fmt].fields.length === f0.fields.length + 1 && r.touched.from === Math.max.apply(null, [f0.s].concat(f0.help, f0.fields).map((e) => e.endLine)) + 1);
check('  placed says where it starts', r.placed.length === 1 && r.placed[0].kind === 'D' && r.placed[0].line === r.touched.from && Parser.parse(r.text).lines[r.placed[0].line - 1].text === ds[0].raw[0]);
const hs = P.entries.filter((e) => e.kind === 'H');
const withHelp = P.formats.findIndex((f) => f.help.length > 0);
r = Writer.pasteEntries(SFGR, withHelp, [{ kind: 'D', lines: ds[0].raw }, { kind: 'H', lines: hs[0].raw }, { kind: 'D', lines: ds[1].raw }]);
const pf = Parser.parse(r.text).formats[withHelp];
check('an H copy goes after the last help area, before the D lines, whatever the order given', r.ok && pf.help.length === P.formats[withHelp].help.length + 1 && pf.help[pf.help.length - 1].line < pf.fields[0].line);
check('  placed is listed in the order given, each at its own line', r.placed.map((p) => p.kind).join('') === 'DHD' && r.placed[1].line < r.placed[0].line);
check('  no new read errors, ends kept (CRLF)', errors(r.text) <= baseErrors && r.text.split('\n').every((l, i, a) => i === a.length - 1 || l.endsWith('\r')));
check('nothing, a bad kind, a wide line, a control character, no such format are refused', Writer.pasteEntries(SFGR, fmt, []).ok === false && Writer.pasteEntries(SFGR, fmt, [{ kind: 'S', lines: ['x'] }]).ok === false && Writer.pasteEntries(SFGR, fmt, [{ kind: 'D', lines: [new Array(82).join('x')] }]).code === 'tooWide' && Writer.pasteEntries(SFGR, fmt, [{ kind: 'D', lines: ['a\tb'] }]).code === 'badValue' && Writer.pasteEntries(SFGR, 99, [{ kind: 'D', lines: ds[0].raw }]).code === 'noSuchFormat');
const noFinal = SFGR.replace(/\r?\n$/, '');
const last = Parser.parse(noFinal).formats.length - 1;
const nf = Writer.pasteEntries(noFinal, last, [{ kind: 'D', lines: ds[0].raw }]);
check('a source with no final line end still has none', nf.ok && !/\n$/.test(nf.text));

setTimeout(async () => {
  const tick = () => new Promise((res) => setTimeout(res, 5));
  const posted = [];
  const html = webviewHtml('vscode-webview://fake', 'e12a', SFGR, 'T.DSPF36', 'modern', 'green', 'sfgr');
  const dom = newWebviewDom(html, { beforeParse(window) {
    window.acquireVsCodeApi = () => ({ getState: () => null, setState: () => {}, postMessage: (m) => posted.push(m) });
    window.Element.prototype.getBoundingClientRect = function () { return { width: 800, height: 480, left: 0, top: 0, right: 800, bottom: 480, x: 0, y: 0, toJSON() {} }; };
  } });
  const w = dom.window, doc = w.document;
  const $ = (sel) => doc.querySelector(sel);
  const edits = () => posted.filter((m) => m.type === 'applyEdit');
  const lastText = () => (edits().length ? edits()[edits().length - 1].text : SFGR);
  const click = (el, extra) => el.dispatchEvent(new w.MouseEvent('click', Object.assign({ bubbles: true }, extra || {})));
  const key = (k, ctrl) => doc.body.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, ctrlKey: !!ctrl, bubbles: true, cancelable: true }));
  const selectFormat = (name) => { $('#recordSelect').value = name; $('#recordSelect').dispatchEvent(new w.Event('change', { bubbles: true })); };
  const echo = () => { if (edits().length) w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: lastText() } })); };
  const reset = (name) => { echo(); w.dispatchEvent(new w.MessageEvent('message', { data: { type: 'externalUpdate', text: SFGR } })); posted.length = 0; selectFormat(name || 'SAISIE'); };
  const model = (t) => Model.buildModel(t).records;
  const rec = (t, name) => model(t).find((x) => x.name === name);
  const startOf = (x) => (x.sfgr.startLine == null ? 1 : x.sfgr.startLine);
  const elOf = (x, f) => Array.from(doc.querySelectorAll('.dspf-field')).find((e) => +e.getAttribute('data-render-line') === startOf(x) + f.location.line - 1 && +e.getAttribute('data-render-column') === f.location.column);

  selectFormat('SAISIE');
  const R = rec(SFGR, 'SAISIE');
  const cands = R.fields.filter((f) => f.nameType === 'FIELD' && f.name && f.length >= 3 && f.location.line < 20 && f.location.column > 3 && elOf(R, f));
  const F = cands[0], F2 = cands[1];

  console.log('\nnothing copied yet');
  posted.length = 0;
  click($('[data-sfgr-action="paste"]'));
  key('v', true);
  check('Paste and Ctrl+V with nothing copied post nothing; the button says why', edits().length === 0 && /Nothing copied yet/.test($('#sfgrFormatError').textContent));
  selectFormat('SAISIE');

  console.log('\ncopy and paste in the same format');
  click(elOf(R, F));
  key('c', true);
  check('Ctrl+C posts nothing', edits().length === 0);
  key('v', true);
  check('Ctrl+V posts one edit', edits().length === 1);
  let after = rec(lastText(), 'SAISIE');
  const added = after.fields.filter((f) => !R.fields.some((g) => g.sfgr.line === f.sfgr.line && g.name === f.name && g.location.line === f.location.line)).slice(-1)[0];
  check('  one entry more, at the end of the format', after.fields.length === R.fields.length + 1);
  const pasted = after.fields[after.fields.length - 1];
  check('  one line down, same column, same length, a free name', pasted.location.line === F.location.line + 1 && pasted.location.column === F.location.column && pasted.length === F.length && pasted.name !== F.name && pasted.name.length > 0);
  check('  no new read errors', errors(lastText()) <= baseErrors);
  check('  the pasted entry is selected', doc.querySelectorAll('.dspf-field.selected').length >= 1);
  const second = edits().length;
  key('v', true);
  check('a second Ctrl+V pastes again (a different free name)', edits().length === second + 1 && new Set(rec(lastText(), 'SAISIE').fields.map((f) => f.name)).size >= new Set(after.fields.map((f) => f.name)).size + 1);
  reset();

  console.log('\ncut and paste');
  click(elOf(R, F));
  posted.length = 0;
  key('x', true);
  check('Ctrl+X removes the field in one edit', edits().length === 1 && rec(lastText(), 'SAISIE').fields.length === R.fields.length - 1);
  echo();
  key('v', true);
  after = rec(lastText(), 'SAISIE');
  const back = after.fields[after.fields.length - 1];
  check('Ctrl+V puts it back at the end with its own place and name', edits().length === 2 && after.fields.length === R.fields.length && back.name === F.name && back.location.line === F.location.line && back.location.column === F.location.column);
  reset();

  console.log('\nbetween formats');
  click(elOf(R, F));
  key('c', true);
  selectFormat('CHOIX1');
  posted.length = 0;
  key('v', true);
  const target = rec(lastText(), 'CHOIX1');
  const was = rec(SFGR, 'CHOIX1');
  const into = target.fields[target.fields.length - 1];
  check('paste goes into the format being shown, at the same line and column', edits().length === 1 && target.fields.length === was.fields.length + 1 && into.location.line === F.location.line && into.location.column === F.location.column);
  check('  the format it was copied from is untouched', rec(lastText(), 'SAISIE').fields.length === R.fields.length);
  reset();

  console.log('\nseveral at once');
  click(elOf(R, F)); click(elOf(R, F2), { shiftKey: true });
  key('c', true);
  posted.length = 0;
  key('v', true);
  after = rec(lastText(), 'SAISIE');
  const two = after.fields.slice(-2);
  check('both are pasted, in one edit, by the same delta (one line down)', edits().length === 1 && after.fields.length === R.fields.length + 2 && two[0].location.line === F.location.line + 1 && two[1].location.line === F2.location.line + 1);
  reset();

  console.log('\nhelp areas');
  const helpRec = model(SFGR).find((x) => x.sfgr.help && x.sfgr.help.length);
  selectFormat(helpRec.name);
  click($('[data-sfgr-help-line]'));
  check('the help panel has Copy and Cut', !!$('[data-sfgr-action="copy"]') && !!$('[data-sfgr-action="cut"]'));
  key('c', true);
  selectFormat('SAISIE');
  posted.length = 0;
  key('v', true);
  const sh = rec(lastText(), 'SAISIE').sfgr.help;
  check('a help area is pasted into another format after its last help area, with a free name', edits().length === 1 && sh.length === R.sfgr.help.length + 1 && errors(lastText()) <= baseErrors);
  reset();
  selectFormat(helpRec.name);
  click($('[data-sfgr-help-line]'));
  posted.length = 0;
  key('x', true);
  check('Ctrl+X on a help area removes it in one edit', edits().length === 1 && rec(lastText(), helpRec.name).sfgr.help.length === helpRec.sfgr.help.length - 1);
  reset();

  console.log('\nthe buttons');
  click(elOf(R, F));
  posted.length = 0;
  click($('[data-sfgr-action="copy"]'));
  check('the field panel Copy loads the clipboard and posts nothing', edits().length === 0);
  selectFormat('CHOIX1');
  click($('[data-sfgr-action="paste"]'));
  check('the format panel Paste pastes into that format', edits().length === 1 && rec(lastText(), 'CHOIX1').fields.length === rec(SFGR, 'CHOIX1').fields.length + 1);
  reset();
  click(elOf(R, F));
  click($('[data-sfgr-action="cut"]'));
  check('the field panel Cut removes it in one edit', edits().length === 1 && rec(lastText(), 'SAISIE').fields.length === R.fields.length - 1);

  console.log('\nthe screen edge');
  reset();
  click($('#placeFieldBtn'));
  $('.dspf-screen').dispatchEvent(new w.MouseEvent('click', { bubbles: true, clientX: 105, clientY: 470 }));
  echo(); posted.length = 0;
  const placed = rec(lastText(), 'SAISIE').fields.slice(-1)[0];
  click(elOf(rec(lastText(), 'SAISIE'), placed));
  key('c', true); key('v', true);
  const lastField = rec(lastText(), 'SAISIE').fields.slice(-1)[0];
  check('a copy of a field on the last line stays on the screen (no line 25)', edits().length === 1 && lastField.location.line === placed.location.line);
  dom.window.close();
  process.exit(process.exitCode || 0);
}, 300);
